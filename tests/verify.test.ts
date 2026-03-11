import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { normalizeAskama, verifyAskamaFixtures } from "../src/core/verify";

const silentLogger = {
  log() {},
  error() {},
};

test("normalizeAskama collapses format-only HTML differences", () => {
  const source = `<div class="a">
  <span></span>
</div>`;
  const generated = `<div class='a'><span/></div>`;

  assert.equal(normalizeAskama(source), normalizeAskama(generated));
});

test("normalizeAskama handles Askama statements inside double-quoted HTML attrs", () => {
  const source = `<span class="base {% if tone == "neutral" %}a{% endif %} {% if tone == "accent" %}b{% endif %}">
  {{ label }}
</span>`;
  const generated = `<span class='base {% if tone == "neutral" %}a{% endif %} {% if tone == "accent" %}b{% endif %}'>{{label}}</span>`;

  assert.equal(normalizeAskama(source), normalizeAskama(generated));
});

test("verifyAskamaFixtures distinguishes ok, format-only, and failure cases", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "katachi-verify-"));
  const previousExitCode = process.exitCode;

  try {
    const exactSource = join(tempRoot, "exact-source.html");
    const exactGenerated = join(tempRoot, "exact-generated.html");
    const formatSource = join(tempRoot, "format-source.html");
    const formatGenerated = join(tempRoot, "format-generated.html");
    const mismatchSource = join(tempRoot, "mismatch-source.html");
    const mismatchGenerated = join(tempRoot, "mismatch-generated.html");

    writeFileSync(exactSource, `<div>{{ value }}</div>\n`, "utf8");
    writeFileSync(exactGenerated, `<div>{{ value }}</div>\n`, "utf8");
    writeFileSync(formatSource, `<div class="a">\n  <span></span>\n</div>\n`, "utf8");
    writeFileSync(formatGenerated, `<div class='a'><span/></div>\n`, "utf8");
    writeFileSync(mismatchSource, `<div>{{ value }}</div>\n`, "utf8");
    writeFileSync(mismatchGenerated, `<div>{{ other }}</div>\n`, "utf8");

    process.exitCode = undefined;

    const result = verifyAskamaFixtures({
      fixtures: [
        { name: "exact", source: exactSource, generated: exactGenerated },
        { name: "format", source: formatSource, generated: formatGenerated },
        { name: "mismatch", source: mismatchSource, generated: mismatchGenerated },
      ],
      logger: silentLogger,
    });

    assert.deepEqual(result.ok, ["exact"]);
    assert.deepEqual(result.formatOnly, ["format"]);
    assert.deepEqual(result.failures, ["mismatch"]);
    assert.deepEqual(result.missing, []);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
