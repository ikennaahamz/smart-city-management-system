import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { ANALYTICAL_QUERIES } from "../src/queries/analytics";

const SQL_DIR = path.resolve(__dirname, "..", "sql");

function readSql(name: string): string {
  return readFileSync(path.join(SQL_DIR, name), "utf8");
}

describe("SQL deliverables structure and integrity", () => {
  it("ddl.sql defines all 9 normalized tables with PK, FK, UNIQUE, CHECK, and DEFAULT", () => {
    const ddl = readSql("ddl.sql");
    const expectedTables = [
      "roles",
      "users",
      "municipal_departments",
      "citizens",
      "utility_accounts",
      "devices",
      "sensor_readings",
      "service_requests",
      "work_orders",
    ];

    const matches = [...ddl.matchAll(/CREATE TABLE\s+(\w+)\s*\(/g)].map((m) => m[1]);
    expect(matches).toEqual(expectedTables);
    expect(ddl).toContain("PRIMARY KEY");
    expect(ddl).toContain("REFERENCES");
    expect(ddl).toContain("UNIQUE");
    expect(ddl).toContain("CHECK");
    expect(ddl).toContain("DEFAULT");
  });

  it("plpgsql.sql defines 3 triggers, 2 procedures, and 2 analytical functions (7 blocks)", () => {
    const plpgsql = readSql("plpgsql.sql");
    const triggers = [...plpgsql.matchAll(/CREATE TRIGGER\s+(\w+)/g)].map((m) => m[1]);
    const procedures = [...plpgsql.matchAll(/CREATE OR REPLACE PROCEDURE\s+(\w+)/g)].map(
      (m) => m[1],
    );

    expect(triggers).toEqual([
      "trg_service_request_resolved_at",
      "trg_sensor_reading_anomaly",
      "trg_work_order_completion",
    ]);
    expect(procedures).toEqual(["assign_technician", "record_utility_payment"]);
    expect(plpgsql).toContain("CREATE OR REPLACE FUNCTION avg_resolution_hours");
    expect(plpgsql).toContain("CREATE OR REPLACE FUNCTION count_overdue_requests");
  });

  it("dml.sql contains verified bcrypt hashes matching Passw0rd! and avoids hardcoded FK IDs", () => {
    const dml = readSql("dml.sql");
    const hashes = [...dml.matchAll(/\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}/g)].map((m) => m[0]);
    expect(hashes.length).toBeGreaterThan(0);
    for (const h of hashes) {
      expect(bcrypt.compareSync("Passw0rd!", h)).toBe(true);
    }

    // Ensure seed inserts rely on scalar lookups rather than hardcoded numeric foreign keys
    expect(dml).toContain("SELECT role_id FROM roles WHERE role_name =");
    expect(dml).toContain("SELECT citizen_id FROM citizens WHERE national_id =");
    expect(dml).toContain("SELECT department_id FROM municipal_departments WHERE department_name =");
  });

  it("queries.sql includes all 7 analytical queries matching src/queries/analytics.ts", () => {
    const queriesSql = readSql("queries.sql");
    expect(ANALYTICAL_QUERIES).toHaveLength(7);
    for (let i = 1; i <= 7; i += 1) {
      expect(queriesSql).toContain(`-- Query ${i}:`);
    }
    for (const q of ANALYTICAL_QUERIES) {
      expect(queriesSql).toContain(q.sql.trim());
    }
  });

  it("apply_all.sql contains ddl.sql, plpgsql.sql, and dml.sql verbatim in order", () => {
    const applyAll = readSql("apply_all.sql");
    const ddl = readSql("ddl.sql").trim();
    const plpgsql = readSql("plpgsql.sql").trim();
    const dml = readSql("dml.sql").trim();

    const idxDdl = applyAll.indexOf(ddl);
    const idxPlpgsql = applyAll.indexOf(plpgsql);
    const idxDml = applyAll.indexOf(dml);

    expect(idxDdl).toBeGreaterThan(-1);
    expect(idxPlpgsql).toBeGreaterThan(idxDdl);
    expect(idxDml).toBeGreaterThan(idxPlpgsql);
  });
});
