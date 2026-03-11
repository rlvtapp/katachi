import { resolve } from "node:path";

import { buildProject } from "../core/build.js";
import { verifyAskamaFixtures } from "../core/verify.js";
import { basicExampleRoot, createExampleFixtures, exampleFixtures } from "../core/example-fixtures.js";

type Command = "build" | "verify:askama" | "verify:examples" | "help";

interface CliOptions {
  command: Command;
  projectRoot?: string;
  distDir?: string;
  templatesDir?: string;
}

function printHelp(): void {
  console.log(`Katachi

Usage:
  katachi build [--project <dir>] [--templates <dir>] [--dist <dir>]
  katachi verify:examples
  katachi help

Defaults:
  --project   current working directory
  --templates <project>/src/templates
  --dist      <project>/dist`);
}

function parseArgs(argv: string[]): CliOptions {
  const [commandArg, ...rest] = argv;
  const command = (commandArg ?? "build") as Command;

  if (!["build", "verify:askama", "verify:examples", "help"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const options: CliOptions = { command };

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    const next = rest[index + 1];

    if (current === "--project" && next) {
      options.projectRoot = resolve(next);
      index += 1;
      continue;
    }

    if (current === "--templates" && next) {
      options.templatesDir = resolve(next);
      index += 1;
      continue;
    }

    if (current === "--dist" && next) {
      options.distDir = resolve(next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete option: ${current}`);
  }

  return options;
}

function run(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "help") {
    printHelp();
    return;
  }

  if (options.command === "build") {
    buildProject({
      projectRoot: options.projectRoot,
      templatesDir: options.templatesDir,
      distDir: options.distDir,
    });
    return;
  }

  if (options.command === "verify:examples" || options.command === "verify:askama") {
    const projectRoot = options.projectRoot ?? basicExampleRoot;
    const distDir = options.distDir ?? resolve(projectRoot, "dist");

    buildProject({
      projectRoot,
      templatesDir: options.templatesDir,
      distDir,
    });
    verifyAskamaFixtures({
      fixtures:
        projectRoot === basicExampleRoot && distDir === resolve(basicExampleRoot, "dist")
          ? exampleFixtures
          : createExampleFixtures(projectRoot, distDir),
    });
    return;
  }

}

run();
