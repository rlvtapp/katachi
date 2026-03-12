import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildProject } from "../src/core/build";
import { basicExampleRoot, createExampleFixtures } from "../src/core/example-fixtures";
import { verifyAskamaFixtures } from "../src/core/verify";

const silentLogger = {
  log() {},
  error() {},
};

test("public basic example builds all targets and matches Askama fixtures", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "katachi-example-"));
  const copiedExampleRoot = join(tempRoot, "basic");
  const previousExitCode = process.exitCode;

  try {
    cpSync(basicExampleRoot, copiedExampleRoot, { recursive: true });

    const result = buildProject({
      projectRoot: copiedExampleRoot,
      logger: silentLogger,
    });

    assert.equal(result.templates.length, 8);
    assert.equal(result.writtenFiles.length, 40);

    const reactNoticePanelPath = join(copiedExampleRoot, "dist", "react", "notice-panel.tsx");
    const askamaResourceTilePath = join(
      copiedExampleRoot,
      "dist",
      "askama",
      "includes",
      "resource-tile.html",
    );
    const liquidGlyphPath = join(
      copiedExampleRoot,
      "dist",
      "liquid",
      "snippets",
      "glyph.liquid",
    );

    assert.ok(existsSync(reactNoticePanelPath));
    assert.ok(existsSync(askamaResourceTilePath));
    assert.ok(existsSync(liquidGlyphPath));

    const reactNoticePanel = readFileSync(reactNoticePanelPath, "utf8");
    const askamaResourceTile = readFileSync(askamaResourceTilePath, "utf8");
    const liquidGlyph = readFileSync(liquidGlyphPath, "utf8");

    assert.match(reactNoticePanel, /import Glyph from "\.\/glyph";/);
    assert.match(reactNoticePanel, /className=\{\["rounded-3xl border px-5 py-4 backdrop-blur-sm"/);
    assert.match(askamaResourceTile, /{% include "\.\/includes\/glyph\.html" %}/);
    assert.match(askamaResourceTile, /{{ title_html\|safe }}/);
    assert.match(liquidGlyph, /<svg/);
    assert.match(liquidGlyph, /data-name='{{ name }}'/);

    process.exitCode = undefined;

    const verification = verifyAskamaFixtures({
      fixtures: createExampleFixtures(copiedExampleRoot),
      logger: silentLogger,
    });

    assert.deepEqual(verification.failures, []);
    assert.deepEqual(verification.missing, []);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
