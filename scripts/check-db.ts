import { closePool, dsnFingerprint, ping, query, queryOne, resolveDsn } from "../src/db";
import { loadEnv } from "../src/env";

loadEnv();

async function main(): Promise<number> {
  try {
    const dsn = resolveDsn();
    console.log(`Configured DSN: ${dsnFingerprint(dsn)}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const [ok, detail] = await ping();
  if (!ok) {
    console.error(`Connectivity check failed: ${detail}`);
    await closePool();
    return 1;
  }

  console.log(`Connected: ${detail}`);

  const tables = await query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  console.log(`Base tables (${tables.length}): ${tables.map((t) => t.table_name).join(", ") || "(none)"}`);

  const triggerCount = await queryOne<string>(
    "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public'",
  );
  const routineCount = await queryOne<string>(
    "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public'",
  );
  console.log(`Triggers: ${triggerCount ?? 0}, Routines: ${routineCount ?? 0}`);

  await closePool();
  return 0;
}

main().then((code) => process.exit(code));
