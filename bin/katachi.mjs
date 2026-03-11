#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(binDir, "..");
const cliPath = resolve(packageRoot, "src/cli/index.ts");

const result = spawnSync(
  process.execPath,
  ["--import", "tsx/esm", cliPath, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: "inherit",
  },
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
