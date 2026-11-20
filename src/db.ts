/**
 * PostgreSQL database connection layer for the Smart City Management System.
 *
 * Uses a single lazily-created `pg.Pool` cached on `globalThis`, translates
 * PostgreSQL SQLSTATE codes into clean UI/API messages, and exposes a strict
 * allowlisted wrapper for PL/pgSQL procedures.
 */

import { createHash } from "node:crypto";
import { Pool, type PoolClient, types } from "pg";

// Keep DATE columns (OID 1082) as raw 'YYYY-MM-DD' strings to avoid timezone shift.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

export class DatabaseError extends Error {
  readonly sqlstate?: string;

  constructor(message: string, options?: { cause?: unknown; sqlstate?: string }) {
    super(message, options);
    this.name = "DatabaseError";
    this.sqlstate = options?.sqlstate;
  }
}

function setting(key: string, defaultValue?: string): string | undefined {
  const value = process.env[key];
  return value === undefined || value === "" ? defaultValue : value;
}

export function dbTarget(): string {
  return (setting("DB_TARGET", "cloud") ?? "cloud").trim().toLowerCase();
}

/**
 * Strip accidental paste debris (leading KEY=, wrapping quotes, trailing brackets)
 * from a PostgreSQL connection string while leaving valid DSNs byte-identical.
 */
export function normaliseDsn(dsn: string): string {
  let value = dsn.trim();

  if (
    value.length >= 2 &&
    value[0] === value[value.length - 1] &&
    (value[0] === '"' || value[0] === "'")
  ) {
    value = value.slice(1, -1).trim();
  }

  let start = -1;
  for (const scheme of ["postgresql://", "postgres://"]) {
    const found = value.indexOf(scheme);
    if (found > start) start = found;
  }
  if (start > 0) value = value.slice(start);

  return value.trim().replace(/["' \t\r\n\]]+$/, "").trim();
}

/**
 * Return a safe diagnostic fingerprint of a DSN without revealing the password.
 */
export function dsnFingerprint(dsn: string): string {
  let parsed: URL;
  try {
    parsed = new URL(normaliseDsn(dsn));
  } catch (err) {
    return `unparseable (${(err as Error).message})`;
  }

  const password = decodeURIComponent(parsed.password || "");
  const digest = password
    ? createHash("sha256").update(password, "utf8").digest("hex").slice(0, 8)
    : "";
  const port = parsed.port || "5432";
  const database = parsed.pathname.replace(/^\//, "") || "(default)";

  const parts = [
    `host=${parsed.hostname}`,
    `port=${port}`,
    `db=${database}`,
    `user=${decodeURIComponent(parsed.username) || "(none)"}`,
    `passlen=${password.length}`,
    `sha256=${digest || "(empty)"}`,
  ];

  if (parsed.search) {
    const params = [...parsed.searchParams.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    parts.push(`query=${params}`);
  }
  if (password) parts.push("credentials=redacted");
  return parts.join(" ");
}

export function resolveDsn(): string {
  if (dbTarget() === "local") {
    const localDsn = setting("LOCAL_DATABASE_URL");
    if (!localDsn) {
      throw new DatabaseError(
        "DB_TARGET is 'local' but LOCAL_DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
        { sqlstate: "CONFIG" },
      );
    }
    return normaliseDsn(localDsn);
  }

  const cloudDsn = setting("DATABASE_URL");
  if (!cloudDsn) {
    throw new DatabaseError(
      "DATABASE_URL is not set. Copy .env.example to .env and paste your PostgreSQL connection string.",
      { sqlstate: "CONFIG" },
    );
  }
  return normaliseDsn(cloudDsn);
}

export function redact(message: string): string {
  return message
    .replace(/(:\/\/[^:@\s/]*:)([^@\s]*)@/g, "$1<redacted>@")
    .replace(/\bnpg_[A-Za-z0-9]+/g, "npg_<redacted>");
}

export function friendlyError(err: unknown): { message: string; sqlstate?: string } {
  const code = (err as { code?: string } | null)?.code;
  const rawMessage = redact(
    String((err as Error)?.message ?? err)
      .trim()
      .split("\n")[0],
  );

  switch (code) {
    case "23505":
      return {
        message: `Duplicate value — ${rawMessage} (SQLSTATE 23505: unique_violation)`,
        sqlstate: code,
      };
    case "23503":
      return {
        message: `Related record missing or still in use — ${rawMessage} (SQLSTATE 23503: foreign_key_violation)`,
        sqlstate: code,
      };
    case "23514":
      return {
        message: `Value rejected by CHECK constraint — ${rawMessage} (SQLSTATE 23514: check_violation)`,
        sqlstate: code,
      };
    case "22P02":
      return {
        message: `Invalid input syntax — ${rawMessage} (SQLSTATE 22P02: invalid_text_representation)`,
        sqlstate: code,
      };
    case "P0001":
      return { message: rawMessage, sqlstate: code };
    default:
      return {
        message: `Database error — ${rawMessage} (SQLSTATE ${code ?? "unknown"})`,
        sqlstate: code,
      };
  }
}

export function buildPgConnectionConfig(dsn: string): {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean };
} {
  try {
    const parsed = new URL(dsn);
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const isLocal =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";

    if (sslMode === "disable" || (isLocal && !sslMode)) {
      return { connectionString: dsn, ssl: false };
    }
    if (sslMode === "verify-full" || sslMode === "verify-ca") {
      return { connectionString: dsn, ssl: { rejectUnauthorized: true } };
    }

    // Remove sslmode=require/prefer so pg-connection-string does not treat it as verify-full
    // and override `ssl: { rejectUnauthorized: false }` on Supabase/cloud poolers.
    parsed.searchParams.delete("sslmode");
    return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } };
  } catch {
    return { connectionString: dsn, ssl: false };
  }
}

export function buildSslConfig(dsn: string): false | { rejectUnauthorized: boolean } {
  return buildPgConnectionConfig(dsn).ssl;
}

const globalForDb = globalThis as unknown as { __scmsPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.__scmsPool) {
    const dsn = resolveDsn();
    globalForDb.__scmsPool = new Pool({
      ...buildPgConnectionConfig(dsn),
      max: Number(process.env.DB_POOL_MAX ?? 5),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 30_000),
      idleTimeoutMillis: 30_000,
    });

    globalForDb.__scmsPool.on("error", (err) => {
      console.error("Unexpected idle PostgreSQL client error:", redact(err.message));
    });
  }
  return globalForDb.__scmsPool;
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  let client: PoolClient;
  try {
    client = await getPool().connect();
  } catch (err) {
    const detail = redact(String((err as Error)?.message ?? err).trim());
    throw new DatabaseError(
      `Could not connect to the database (${dsnFingerprint(resolveDsn())}): ${detail}`,
      { cause: err, sqlstate: "CONNECT" },
    );
  }

  let reusable = false;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    reusable = true;
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
      reusable = true;
    } catch {
      // Connection is broken; mark non-reusable so pool drops it.
    }
    if (err instanceof DatabaseError) throw err;
    const translated = friendlyError(err);
    throw new DatabaseError(translated.message, {
      cause: err,
      sqlstate: translated.sqlstate,
    });
  } finally {
    client.release(reusable ? undefined : true);
  }
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  return withTransaction(async (client) => {
    const result = await client.query(sql, params as unknown[]);
    return result.rows as T[];
  });
}

export async function queryRow<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function queryOne<T = unknown>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> {
  const rows = await query<Record<string, unknown>>(sql, params);
  const row = rows[0];
  return row === undefined ? null : (Object.values(row)[0] as T);
}

export async function exec(
  sql: string,
  params: readonly unknown[] = [],
  returning?: string,
): Promise<number | Record<string, unknown>> {
  return withTransaction(async (client) => {
    const result = await client.query(sql, params as unknown[]);
    if (returning) return result.rows[0];
    return result.rowCount ?? 0;
  });
}

const ALLOWED_PROCEDURES = new Set([
  "assign_technician",
  "record_utility_payment",
]);

export async function callProcedure(
  name: string,
  args: readonly unknown[] = [],
): Promise<void> {
  if (!ALLOWED_PROCEDURES.has(name)) {
    throw new Error(`Procedure '${name}' is not on the allowlist.`);
  }

  const placeholders = Array.from({ length: args.length }, (_, i) => `$${i + 1}`).join(", ");
  const sql = `CALL ${name}(${placeholders})`;
  await withTransaction(async (client) => {
    await client.query(sql, args as unknown[]);
  });
}

export async function ping(): Promise<[boolean, string]> {
  try {
    const version = await queryOne<string>("SELECT version()");
    return [true, String(version).split(" on ")[0]];
  } catch (err) {
    return [false, err instanceof Error ? redact(err.message) : redact(String(err))];
  }
}

export async function closePool(): Promise<void> {
  if (globalForDb.__scmsPool) {
    const existing = globalForDb.__scmsPool;
    globalForDb.__scmsPool = undefined;
    await existing.end();
  }
}
