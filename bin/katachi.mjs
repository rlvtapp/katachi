#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const binDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(binDir, "..");
const builtCliPath = resolve(packageRoot, "dist/cli/index.js");
const sourceCliPath = resolve(packageRoot, "src/cli/index.ts");

const hasBuiltCli = existsSync(builtCliPath);

const result = spawnSync(
  process.execPath,
  hasBuiltCli
    ? [builtCliPath, ...process.argv.slice(2)]
    : ["--import", "tsx/esm", sourceCliPath, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    stdio: "inherit",
  },
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
