import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionValue, SESSION_COOKIE } from "../src/session";

const mockDb = vi.hoisted(() => ({
  query: vi.fn(),
  queryRow: vi.fn(),
  queryOne: vi.fn(),
  exec: vi.fn(),
  withTransaction: vi.fn(),
  callProcedure: vi.fn(),
  ping: vi.fn(),
}));

vi.mock("../src/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/db")>();
  return {
    ...actual,
    query: mockDb.query,
    queryRow: mockDb.queryRow,
    queryOne: mockDb.queryOne,
    exec: mockDb.exec,
    withTransaction: mockDb.withTransaction,
    callProcedure: mockDb.callProcedure,
    ping: mockDb.ping,
  };
});

import app from "../src/app";
import { DatabaseError } from "../src/db";

const PASSWORD_HASH = bcrypt.hashSync("Passw0rd!", 8);

const USERS = {
  admin: {
    user_id: 1,
    username: "admin",
    email: "admin@city.gov",
    full_name: "System Admin",
    status: "active",
    role_id: 1,
    role_name: "admin",
    access_level: 100,
    citizen_id: null,
  },
  employee: {
    user_id: 2,
    username: "staff.elena",
    email: "elena@city.gov",
    full_name: "Elena Staff",
    status: "active",
    role_id: 2,
    role_name: "employee",
    access_level: 70,
    citizen_id: null,
  },
  tech: {
    user_id: 4,
    username: "tech.kemal",
    email: "kemal@city.gov",
    full_name: "Kemal Tech",
    status: "active",
    role_id: 3,
    role_name: "technical_staff",
    access_level: 50,
    citizen_id: null,
  },
  citizen: {
    user_id: 6,
    username: "citizen.ali",
    email: "ali@example.org",
    full_name: "Ali Citizen",
    status: "active",
    role_id: 4,
    role_name: "citizen",
    access_level: 10,
    citizen_id: 101,
  },
};

function cookieFor(user: (typeof USERS)[keyof typeof USERS]): string {
  return `${SESSION_COOKIE}=${createSessionValue(user.user_id)}`;
}

describe("SCMS HTTP API", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "api-test-session-secret-1234567890";
    vi.clearAllMocks();
    mockDb.ping.mockResolvedValue([true, "PostgreSQL 17"]);
  });

  it("returns 200 on GET /api/health without authentication", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("logs in with valid credentials, sets HttpOnly cookie, and serves /api/auth/me", async () => {
    mockDb.queryRow.mockResolvedValueOnce({ ...USERS.admin, password_hash: PASSWORD_HASH });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "Passw0rd!" });

    expect(login.status).toBe(200);
    expect(login.body.user.username).toBe("admin");
    const setCookie = login.headers["set-cookie"]?.[0] ?? "";
    expect(setCookie).toContain("scms_session=");
    expect(setCookie).toContain("HttpOnly");

    mockDb.queryRow.mockResolvedValueOnce(USERS.admin);
    const me = await request(app).get("/api/auth/me").set("Cookie", setCookie);
    expect(me.status).toBe(200);
    expect(me.body.user.role_name).toBe("admin");
  });

  it("rejects bad credentials with 401 and unauthenticated protected calls with 401", async () => {
    mockDb.queryRow.mockResolvedValueOnce({ ...USERS.admin, password_hash: PASSWORD_HASH });
    const bad = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "WrongPassword1" });
    expect(bad.status).toBe(401);

    const unauth = await request(app).get("/api/requests");
    expect(unauth.status).toBe(401);
  });

  it("enforces role gating across admin, employee, technical_staff, and citizen", async () => {
    // Citizen blocked from admin, work-orders, devices, analytics, department writes
    for (const call of [
      () => request(app).get("/api/users").set("Cookie", cookieFor(USERS.citizen)),
      () => request(app).get("/api/roles").set("Cookie", cookieFor(USERS.citizen)),
      () => request(app).get("/api/work-orders").set("Cookie", cookieFor(USERS.citizen)),
      () => request(app).get("/api/devices").set("Cookie", cookieFor(USERS.citizen)),
      () => request(app).get("/api/analytics").set("Cookie", cookieFor(USERS.citizen)),
      () =>
        request(app)
          .post("/api/departments")
          .set("Cookie", cookieFor(USERS.citizen))
          .send({
            department_name: "New",
            district_name: "North",
            head_name: "X",
            contact_phone: "12345",
            annual_budget: 100,
          }),
    ]) {
      mockDb.queryRow.mockResolvedValueOnce(USERS.citizen);
      const res = await call();
      expect(res.status).toBe(403);
    }

    // Technical staff blocked from /api/users and /api/citizens
    mockDb.queryRow.mockResolvedValueOnce(USERS.tech);
    expect((await request(app).get("/api/users").set("Cookie", cookieFor(USERS.tech))).status).toBe(403);

    mockDb.queryRow.mockResolvedValueOnce(USERS.tech);
    expect((await request(app).get("/api/citizens").set("Cookie", cookieFor(USERS.tech))).status).toBe(403);

    // Employee blocked from /api/users
    mockDb.queryRow.mockResolvedValueOnce(USERS.employee);
    expect((await request(app).get("/api/users").set("Cookie", cookieFor(USERS.employee))).status).toBe(403);

    // Admin allowed on /api/users
    mockDb.queryRow.mockResolvedValueOnce(USERS.admin);
    mockDb.query.mockResolvedValueOnce([USERS.admin, USERS.citizen]);
    const adminUsers = await request(app).get("/api/users").set("Cookie", cookieFor(USERS.admin));
    expect(adminUsers.status).toBe(200);
    expect(adminUsers.body.users).toHaveLength(2);
  });

  it("enforces citizen row-level ownership on service requests and utility payments", async () => {
    // Another citizen's request cannot be edited
    mockDb.queryRow
      .mockResolvedValueOnce(USERS.citizen)
      .mockResolvedValueOnce({ request_id: 99, citizen_id: 999, status: "Open" });
    const editOther = await request(app)
      .patch("/api/requests/99")
      .set("Cookie", cookieFor(USERS.citizen))
      .send({ title: "Hijack attempt" });
    expect(editOther.status).toBe(403);

    // Own request cannot override status directly
    mockDb.queryRow
      .mockResolvedValueOnce(USERS.citizen)
      .mockResolvedValueOnce({ request_id: 10, citizen_id: 101, status: "Open" });
    const statusBypass = await request(app)
      .patch("/api/requests/10")
      .set("Cookie", cookieFor(USERS.citizen))
      .send({ status: "Resolved" });
    expect(statusBypass.status).toBe(403);

    // Another citizen's utility account cannot be paid
    mockDb.queryRow
      .mockResolvedValueOnce(USERS.citizen)
      .mockResolvedValueOnce({ account_id: 50, citizen_id: 999 });
    const payOther = await request(app)
      .post("/api/utility-accounts/50/pay")
      .set("Cookie", cookieFor(USERS.citizen))
      .send({ amount: 20 });
    expect(payOther.status).toBe(403);
  });

  it("executes PL/pgSQL procedures, sensor anomaly writes, and all 7 analytics queries", async () => {
    // Assign technician procedure
    mockDb.queryRow
      .mockResolvedValueOnce(USERS.employee)
      .mockResolvedValueOnce({ request_id: 5, status: "In Progress" })
      .mockResolvedValueOnce({ order_id: 12, request_id: 5, technician_id: 4 });
    mockDb.callProcedure.mockResolvedValueOnce(undefined);

    const assign = await request(app)
      .post("/api/requests/5/assign")
      .set("Cookie", cookieFor(USERS.employee))
      .send({ technician_id: 4, estimated_cost: 220, notes: "Inspect lamp" });
    expect(assign.status).toBe(201);
    expect(mockDb.callProcedure).toHaveBeenCalledWith("assign_technician", [5, 4, 220, "Inspect lamp"]);

    // Record utility payment procedure
    mockDb.queryRow
      .mockResolvedValueOnce(USERS.citizen)
      .mockResolvedValueOnce({ account_id: 3, citizen_id: 101 })
      .mockResolvedValueOnce({ account_id: 3, balance_due: "0.00", status: "Active" });
    mockDb.callProcedure.mockResolvedValueOnce(undefined);

    const pay = await request(app)
      .post("/api/utility-accounts/3/pay")
      .set("Cookie", cookieFor(USERS.citizen))
      .send({ amount: 45.5 });
    expect(pay.status).toBe(200);
    expect(mockDb.callProcedure).toHaveBeenCalledWith("record_utility_payment", [3, 45.5]);

    // Log sensor reading via transaction
    mockDb.queryRow.mockResolvedValueOnce(USERS.tech);
    mockDb.withTransaction.mockImplementationOnce(async (work) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rows: [{ reading_id: 77, device_id: 2, reading_value: "180.00", unit: "AQI", is_anomaly: true }],
          })
          .mockResolvedValueOnce({
            rows: [{ device_id: 2, device_code: "AQ-02", status: "Alert" }],
          }),
      };
      return work(client as never);
    });
    const readingRes = await request(app)
      .post("/api/devices/2/readings")
      .set("Cookie", cookieFor(USERS.tech))
      .send({ reading_value: 180, unit: "AQI" });
    expect(readingRes.status).toBe(201);
    expect(readingRes.body.reading.is_anomaly).toBe(true);

    // Run analytical queries 1..7
    for (let id = 1; id <= 7; id += 1) {
      mockDb.queryRow.mockResolvedValueOnce(USERS.employee);
      mockDb.query.mockResolvedValueOnce([{ sample: id }]);
      const qRes = await request(app)
        .get(`/api/analytics/${id}`)
        .set("Cookie", cookieFor(USERS.employee));
      expect(qRes.status).toBe(200);
      expect(qRes.body.query.id).toBe(id);
    }
  });

  it("maps DatabaseError SQLSTATE codes to 409 and 400 HTTP statuses", async () => {
    mockDb.queryRow.mockResolvedValueOnce(USERS.admin);
    mockDb.exec.mockRejectedValueOnce(new DatabaseError("Duplicate", { sqlstate: "23505" }));
    const dup = await request(app)
      .post("/api/departments")
      .set("Cookie", cookieFor(USERS.admin))
      .send({
        department_name: "Duplicate Dept",
        district_name: "Central",
        head_name: "Head",
        contact_phone: "555-0100",
        annual_budget: 1000,
      });
    expect(dup.status).toBe(409);

    mockDb.queryRow
      .mockResolvedValueOnce(USERS.citizen)
      .mockResolvedValueOnce({ account_id: 3, citizen_id: 101 });
    mockDb.callProcedure.mockRejectedValueOnce(
      new DatabaseError("Payment exceeds balance", { sqlstate: "P0001" }),
    );
    const overpay = await request(app)
      .post("/api/utility-accounts/3/pay")
      .set("Cookie", cookieFor(USERS.citizen))
      .send({ amount: 9999 });
    expect(overpay.status).toBe(400);
  });
});
