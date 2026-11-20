import { afterEach, describe, expect, it } from "vitest";
import {
  callProcedure,
  DatabaseError,
  dsnFingerprint,
  friendlyError,
  normaliseDsn,
  redact,
  resolveDsn,
} from "../src/db";

describe("db helpers", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("normaliseDsn preserves clean URLs and strips paste debris", () => {
    const clean = "postgresql://user:pass@ep-123.neon.tech/scms?sslmode=require";
    expect(normaliseDsn(clean)).toBe(clean);
    expect(normaliseDsn(`  DATABASE_URL="${clean}"  `)).toBe(clean);
    expect(normaliseDsn(`'postgres://u:p@localhost:5432/db']`)).toBe(
      "postgres://u:p@localhost:5432/db",
    );
  });

  it("dsnFingerprint hides secrets and prints stable digest", () => {
    const fp = dsnFingerprint("postgresql://alice:s3cr3t@db.example.com:5433/citydb?sslmode=require");
    expect(fp).toContain("host=db.example.com");
    expect(fp).toContain("port=5433");
    expect(fp).toContain("db=citydb");
    expect(fp).toContain("user=alice");
    expect(fp).toContain("passlen=6");
    expect(fp).toContain("credentials=redacted");
    expect(fp).not.toContain("s3cr3t");
  });

  it("redact masks URI passwords and Neon npg tokens", () => {
    const msg = "bad conn postgresql://admin:mySecretPass@host/db token npg_AbCdEf123";
    const out = redact(msg);
    expect(out).not.toContain("mySecretPass");
    expect(out).not.toContain("npg_AbCdEf123");
    expect(out).toContain("<redacted>@");
    expect(out).toContain("npg_<redacted>");
  });

  it("friendlyError translates PostgreSQL SQLSTATE codes", () => {
    expect(friendlyError({ code: "23505", message: "duplicate key" })).toEqual({
      message: "Duplicate value — duplicate key (SQLSTATE 23505: unique_violation)",
      sqlstate: "23505",
    });
    expect(friendlyError({ code: "23503", message: "fk failed" }).sqlstate).toBe("23503");
    expect(friendlyError({ code: "23514", message: "check failed" }).sqlstate).toBe("23514");
    expect(friendlyError({ code: "22P02", message: "invalid syntax" }).sqlstate).toBe("22P02");
    expect(friendlyError({ code: "P0001", message: "Payment exceeds balance" })).toEqual({
      message: "Payment exceeds balance",
      sqlstate: "P0001",
    });
  });

  it("resolveDsn throws DatabaseError when required variables are missing", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_TARGET;
    expect(() => resolveDsn()).toThrow(DatabaseError);

    process.env.DB_TARGET = "local";
    delete process.env.LOCAL_DATABASE_URL;
    expect(() => resolveDsn()).toThrow(DatabaseError);
  });

  it("callProcedure rejects procedures outside the allowlist", async () => {
    await expect(callProcedure("drop_everything", [])).rejects.toThrow(
      "Procedure 'drop_everything' is not on the allowlist.",
    );
  });
});
