import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defineConfig, loadKatachiConfig } from "../src/config";

test("defineConfig preserves a typed Katachi configuration", () => {
  const config = defineConfig({
    inputs: [
      {
        directory: "src/components",
        include: ["**/*.template.tsx"],
        exclude: ["**/*.draft.template.tsx"],
      },
    ],
    classNames: {
      mode: "dynamic-only",
      react: { from: "./runtime/classes", import: "cn" },
      askama: { filter: "merge_classes" },
    },
  });

  assert.equal(config.inputs?.[0]?.directory, "src/components");
  assert.equal(config.classNames?.react?.import, "cn");
});

test("loadKatachiConfig loads katachi.config.ts from the project root", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "katachi-config-"));

  try {
    mkdirSync(join(projectRoot, "templates"));
    writeFileSync(
      join(projectRoot, "katachi.config.ts"),
      `export default {
  inputs: [{ directory: "templates", include: ["components/**/*.template.tsx"] }],
  targets: ["react"],
  minify: true,
};
`,
      "utf8",
    );

    const loaded = await loadKatachiConfig({ projectRoot });

    assert.equal(loaded.path, join(projectRoot, "katachi.config.ts"));
    assert.deepEqual(loaded.config.targets, ["react"]);
    assert.equal(loaded.config.inputs?.[0]?.directory, "templates");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
