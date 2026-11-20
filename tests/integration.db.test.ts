import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import { closePool, callProcedure, exec, query, queryOne, withTransaction } from "../src/db";
import { loadEnv } from "../src/env";
import { ANALYTICAL_QUERIES, runAvgResolutionHours, runOverdueRequests } from "../src/queries/analytics";

loadEnv();

const RUN_DB = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!RUN_DB)("PostgreSQL live integration tests", () => {
  const createdIds = {
    requestIds: [] as number[],
    readingIds: [] as number[],
    alertedDeviceIds: [] as number[],
  };

  beforeAll(async () => {
    const tables = await query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    if (tables.length < 9) {
      throw new Error("Run 'npm run db:apply' before running live DB integration tests.");
    }
  });

  afterAll(async () => {
    for (const id of createdIds.readingIds) {
      await exec("DELETE FROM sensor_readings WHERE reading_id = $1", [id]).catch(() => undefined);
    }
    for (const id of createdIds.alertedDeviceIds) {
      await exec("UPDATE devices SET status = 'Active' WHERE device_id = $1", [id]).catch(
        () => undefined,
      );
    }
    for (const id of createdIds.requestIds) {
      await exec("DELETE FROM service_requests WHERE request_id = $1", [id]).catch(() => undefined);
    }
    await closePool();
  });

  it("contains all 9 schema tables", async () => {
    const rows = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const names = new Set(rows.map((r) => r.table_name));
    for (const expected of [
      "roles",
      "users",
      "municipal_departments",
      "citizens",
      "utility_accounts",
      "devices",
      "sensor_readings",
      "service_requests",
      "work_orders",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it("enforces UNIQUE, FK, and CHECK constraints with SQLSTATE codes", async () => {
    await expect(
      exec("INSERT INTO roles (role_name, access_level) VALUES ('admin', 50)"),
    ).rejects.toMatchObject({ sqlstate: "23505" });

    await expect(
      exec(
        "INSERT INTO municipal_departments (department_name, district_name, head_name, contact_phone, annual_budget) VALUES ('Neg Budget', 'Central', 'Test', '555-0000', -100)",
      ),
    ).rejects.toMatchObject({ sqlstate: "23514" });

    await expect(
      exec(
        "INSERT INTO users (username, email, password_hash, full_name, role_id) VALUES ('badfk', 'badfk@test.org', 'hash', 'Bad FK', 999999)",
      ),
    ).rejects.toMatchObject({ sqlstate: "23503" });
  });

  it("fires triggers for request resolution, sensor anomaly detection, and work order completion", async () => {
    const citizenId = await queryOne<number>("SELECT MIN(citizen_id) FROM citizens");
    const deptId = await queryOne<number>("SELECT MIN(department_id) FROM municipal_departments");
    const techId = await queryOne<number>(
      "SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.role_name = 'technical_staff' LIMIT 1",
    );
    const nonTechId = await queryOne<number>(
      "SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE r.role_name = 'citizen' LIMIT 1",
    );

    const reqInserted = (await exec(
      `INSERT INTO service_requests (citizen_id, department_id, category, title, description, priority)
       VALUES ($1, $2, 'Pothole', 'Integration Test Pothole', 'Testing PL/pgSQL triggers', 'High')
       RETURNING request_id`,
      [citizenId, deptId],
      "request_id",
    )) as { request_id: number };
    createdIds.requestIds.push(reqInserted.request_id);

    // Trigger 3 rejects citizen as technician
    await expect(
      exec(
        "INSERT INTO work_orders (request_id, technician_id, estimated_cost) VALUES ($1, $2, 50)",
        [reqInserted.request_id, nonTechId],
      ),
    ).rejects.toMatchObject({ sqlstate: "P0001" });

    // Procedure 1: assign_technician moves request to In Progress
    await callProcedure("assign_technician", [reqInserted.request_id, techId, 125, "Test dispatch"]);
    const statusAfterAssign = await queryOne<string>(
      "SELECT status FROM service_requests WHERE request_id = $1",
      [reqInserted.request_id],
    );
    expect(statusAfterAssign).toBe("In Progress");

    // Completing work order fires Trigger 3 + Trigger 1 (resolved_at populated)
    await exec(
      "UPDATE work_orders SET status = 'Completed', actual_cost = 110 WHERE request_id = $1",
      [reqInserted.request_id],
    );
    const reqAfterComplete = await query<{ status: string; resolved_at: string | null }>(
      "SELECT status, resolved_at FROM service_requests WHERE request_id = $1",
      [reqInserted.request_id],
    );
    expect(reqAfterComplete[0].status).toBe("Resolved");
    expect(reqAfterComplete[0].resolved_at).not.toBeNull();

    // Trigger 2: reading exceeding threshold flags anomaly and sets device Alert
    const device = await query<{ device_id: number; threshold_value: string }>(
      "SELECT device_id, threshold_value FROM devices WHERE status = 'Active' LIMIT 1",
    );
    if (device[0]) {
      createdIds.alertedDeviceIds.push(device[0].device_id);
      const highVal = Number(device[0].threshold_value) + 25;
      const reading = (await exec(
        "INSERT INTO sensor_readings (device_id, reading_value, unit) VALUES ($1, $2, 'units') RETURNING reading_id",
        [device[0].device_id, highVal],
        "reading_id",
      )) as { reading_id: number };
      createdIds.readingIds.push(reading.reading_id);

      const flagged = await queryOne<boolean>(
        "SELECT is_anomaly FROM sensor_readings WHERE reading_id = $1",
        [reading.reading_id],
      );
      expect(flagged).toBe(true);
    }
  });

  it("record_utility_payment updates balance, blocks overpayment, and clears Overdue at zero", async () => {
    const citizenId = await queryOne<number>("SELECT MIN(citizen_id) FROM citizens");
    const meter = `TEST-MTR-${Date.now()}`;
    const created = (await exec(
      `INSERT INTO utility_accounts (citizen_id, service_type, meter_number, balance_due, status)
       VALUES ($1, 'Water', $2, 100.00, 'Overdue')
       RETURNING account_id`,
      [citizenId, meter],
      "account_id",
    )) as { account_id: number };

    try {
      await callProcedure("record_utility_payment", [created.account_id, 40]);
      const mid = await query<{ balance_due: string; status: string }>(
        "SELECT balance_due, status FROM utility_accounts WHERE account_id = $1",
        [created.account_id],
      );
      expect(mid[0].balance_due).toBe("60.00");
      expect(mid[0].status).toBe("Overdue");

      await expect(
        callProcedure("record_utility_payment", [created.account_id, 80]),
      ).rejects.toMatchObject({ sqlstate: "P0001" });

      await callProcedure("record_utility_payment", [created.account_id, 60]);
      const paid = await query<{ balance_due: string; status: string }>(
        "SELECT balance_due, status FROM utility_accounts WHERE account_id = $1",
        [created.account_id],
      );
      expect(paid[0].balance_due).toBe("0.00");
      expect(paid[0].status).toBe("Active");
    } finally {
      await exec("DELETE FROM utility_accounts WHERE account_id = $1", [created.account_id]).catch(
        () => undefined,
      );
    }
  });

  it("executes PL/pgSQL functions and all 7 analytical queries cleanly", async () => {
    const avgHours = await runAvgResolutionHours();
    expect(typeof avgHours).toBe("number");
    expect(avgHours).toBeGreaterThan(0);

    const overdue = await runOverdueRequests(7);
    expect(Array.isArray(overdue)).toBe(true);
    expect(overdue.length).toBeGreaterThan(0);

    for (const q of ANALYTICAL_QUERIES) {
      const rows = await query(q.sql);
      expect(Array.isArray(rows)).toBe(true);
    }

    const queriesSql = readFileSync(path.resolve(__dirname, "..", "sql", "queries.sql"), "utf8");
    await withTransaction(async (client) => {
      await client.query(queriesSql);
    });
  });

  it("authenticates all 4 demo roles via HTTP and enforces live DB routes and role gates", async () => {
    async function loginAs(username: string): Promise<string> {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username, password: "Passw0rd!" });
      expect(res.status).toBe(200);
      const cookie = res.headers["set-cookie"]?.[0];
      expect(cookie).toBeTruthy();
      return cookie;
    }

    const [adminCookie, staffCookie, techCookie, citizenCookie] = await Promise.all([
      loginAs("admin"),
      loginAs("staff.elena"),
      loginAs("tech.kemal"),
      loginAs("citizen.ali"),
    ]);

    // Admin checks across all main endpoints
    for (const endpoint of [
      "/api/overview",
      "/api/requests",
      "/api/work-orders",
      "/api/devices",
      "/api/citizens",
      "/api/utility-accounts",
      "/api/departments",
      "/api/users",
      "/api/roles",
      "/api/analytics/fn/avg-resolution",
      "/api/analytics/fn/overdue?days=7",
    ]) {
      const res = await request(app).get(endpoint).set("Cookie", adminCookie);
      expect(res.status).toBe(200);
    }

    for (let id = 1; id <= 7; id += 1) {
      const res = await request(app).get(`/api/analytics/${id}`).set("Cookie", staffCookie);
      expect(res.status).toBe(200);
      expect(res.body.query.id).toBe(id);
    }

    const techWorkOrders = await request(app).get("/api/work-orders").set("Cookie", techCookie);
    expect(techWorkOrders.status).toBe(200);
    expect(techWorkOrders.body.workOrders.length).toBeGreaterThan(0);

    const citizenOverview = await request(app).get("/api/overview").set("Cookie", citizenCookie);
    expect(citizenOverview.status).toBe(200);
    expect(citizenOverview.body.roleScope).toBe("citizen");

    expect(
      (await request(app).get("/api/users").set("Cookie", citizenCookie)).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/analytics").set("Cookie", citizenCookie)).status,
    ).toBe(403);
  });
});
