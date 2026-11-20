import { dbTarget, dsnFingerprint, resolveDsn } from "../src/db";
import { loadEnv } from "../src/env";

loadEnv();

try {
  const dsn = resolveDsn();
  console.log(`DB_TARGET=${dbTarget()} -> ${dsnFingerprint(dsn)}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
