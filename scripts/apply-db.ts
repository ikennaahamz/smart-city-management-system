/**
 * Apply sql/ddl.sql, sql/plpgsql.sql, and sql/dml.sql to the target PostgreSQL database.
 *
 * Usage:
 *   npm run db:apply             # refuses if tables already exist
 *   npm run db:apply -- --reset  # drops and recreates public schema inside a transaction
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { buildPgConnectionConfig, dbTarget, dsnFingerprint, normaliseDsn, redact } from "../src/db";
import { loadEnv } from "../src/env";

loadEnv();

const ROOT = path.resolve(__dirname, "..");
const RESET = process.argv.includes("--reset");

function resolveMigrationDsn(): { dsn: string; source: string } {
  if (dbTarget() === "local") {
    const local = process.env.LOCAL_DATABASE_URL;
    if (!local) {
      throw new Error("DB_TARGET is 'local' but LOCAL_DATABASE_URL is not set.");
    }
    return { dsn: normaliseDsn(local), source: "LOCAL_DATABASE_URL" };
  }

  if (process.env.DATABASE_URL_UNPOOLED) {
    return { dsn: normaliseDsn(process.env.DATABASE_URL_UNPOOLED), source: "DATABASE_URL_UNPOOLED" };
  }

  if (process.env.DATABASE_URL) {
    console.log("NOTE: DATABASE_URL_UNPOOLED is not set; falling back to DATABASE_URL.");
    return { dsn: normaliseDsn(process.env.DATABASE_URL), source: "DATABASE_URL" };
  }

  throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env before running db:apply.");
}

async function main(): Promise<number> {
  const { dsn, source } = resolveMigrationDsn();
  console.log(`Target (${source}): ${dsnFingerprint(dsn)}`);

  const client = new Client({
    ...buildPgConnectionConfig(dsn),
    connectionTimeoutMillis: 30_000,
  });

  await client.connect();
  try {
    await client.query("BEGIN");

    const tableRes = await client.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    const existingTables = Number(tableRes.rows[0].n);

    if (existingTables > 0 && !RESET) {
      await client.query("ROLLBACK");
      console.error(
        `Refusing to apply: public schema already contains ${existingTables} base table(s). Re-run with '-- --reset' to drop and rebuild.`,
      );
      return 1;
    }

    if (RESET) {
      console.log("Resetting public schema...");
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    }

    for (const filename of ["ddl.sql", "plpgsql.sql", "dml.sql"]) {
      const fullPath = path.join(ROOT, "sql", filename);
      console.log(`Applying sql/${filename}...`);
      const sql = readFileSync(fullPath, "utf8");
      await client.query(sql);
    }

    await client.query("COMMIT");
    console.log("Schema, PL/pgSQL blocks, and seed data applied successfully.");

    const counts = await client.query<{
      roles: string;
      users: string;
      municipal_departments: string;
      citizens: string;
      utility_accounts: string;
      devices: string;
      sensor_readings: string;
      service_requests: string;
      work_orders: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM roles) AS roles,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM municipal_departments) AS municipal_departments,
        (SELECT COUNT(*) FROM citizens) AS citizens,
        (SELECT COUNT(*) FROM utility_accounts) AS utility_accounts,
        (SELECT COUNT(*) FROM devices) AS devices,
        (SELECT COUNT(*) FROM sensor_readings) AS sensor_readings,
        (SELECT COUNT(*) FROM service_requests) AS service_requests,
        (SELECT COUNT(*) FROM work_orders) AS work_orders
    `);
    console.log("Row counts:", counts.rows[0]);

    const triggers = await client.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM pg_trigger WHERE NOT tgisinternal",
    );
    const routines = await client.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM information_schema.routines WHERE routine_schema = 'public'",
    );
    console.log(`Triggers registered: ${triggers.rows[0].n}, PL/pgSQL routines: ${routines.rows[0].n}`);
    return 0;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Migration failed:", redact(err instanceof Error ? err.message : String(err)));
    return 1;
  } finally {
    await client.end();
  }
}

main().then((code) => process.exit(code));
