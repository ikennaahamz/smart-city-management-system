import { spawnSync } from "node:child_process";

const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npxCmd, ["vitest", "run", "tests/integration.db.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, RUN_DB_TESTS: "1" },
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
