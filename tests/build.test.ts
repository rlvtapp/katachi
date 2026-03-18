import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildProject } from "../src/core/build";

const silentLogger = { log() {} };

test("buildProject writes all configured targets and resolves nested imports", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "katachi-build-"));

  try {
    const templatesDir = join(tempRoot, "templates");
    const distDir = join(tempRoot, "dist");
    mkdirSync(join(templatesDir, "nested"), { recursive: true });

    writeFileSync(
      join(templatesDir, "icon.template.tsx"),
      `export type Props = {
  icon: string;
};

export default function Icon({ icon }: Props) {
  return <svg data-icon={icon} />;
}
`,
      "utf8",
    );

    writeFileSync(
      join(templatesDir, "nested", "card.template.tsx"),
      `import type { TemplateNode } from "@relevate/katachi";
import Icon from "../icon.template";

export type Props = {
  active: boolean;
  label: string;
  children?: TemplateNode;
};

export default function Card({ active, label, children }: Props) {
  return (
    <div className={["base", active && "active"]}>
      <Icon icon={label} />
      {children}
    </div>
  );
}
`,
      "utf8",
    );

    const result = buildProject({
      templatesDir,
      distDir,
      logger: silentLogger,
    });

    assert.equal(result.templates.length, 2);
    assert.equal(result.writtenFiles.length, 10);

    const reactOutputPath = join(distDir, "react", "nested", "card.tsx");
    const askamaIncludePath = join(distDir, "askama", "includes", "nested", "card.html");
    const liquidOutputPath = join(distDir, "liquid", "snippets", "nested", "card.liquid");

    assert.ok(existsSync(reactOutputPath));
    assert.ok(existsSync(askamaIncludePath));
    assert.ok(existsSync(liquidOutputPath));

    const reactOutput = readFileSync(reactOutputPath, "utf8");
    const askamaInclude = readFileSync(askamaIncludePath, "utf8");
    const liquidOutput = readFileSync(liquidOutputPath, "utf8");

    assert.match(reactOutput, /import Icon from "\.\.\/icon";/);
    assert.match(askamaInclude, /{% include "\.\.\/includes\/icon\.html" %}/);
    assert.match(liquidOutput, /{% render 'icon', icon: label %}/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

/* ── --target flag tests ─────────────────────────────────────────── */

/** Helper: scaffold a minimal project in a temp dir and return paths. */
function scaffoldMinimalProject(): { tempRoot: string; templatesDir: string; distDir: string } {
  const tempRoot = mkdtempSync(join(tmpdir(), "katachi-target-"));
  const templatesDir = join(tempRoot, "templates");
  const distDir = join(tempRoot, "dist");
  mkdirSync(templatesDir, { recursive: true });

  writeFileSync(
    join(templatesDir, "badge.template.tsx"),
    `export type Props = { label: string };

export default function Badge({ label }: Props) {
  return <span className="badge">{label}</span>;
}
`,
    "utf8",
  );

  return { tempRoot, templatesDir, distDir };
}

test("targets option: single target emits only that target", () => {
  const { tempRoot, templatesDir, distDir } = scaffoldMinimalProject();

  try {
    const result = buildProject({
      templatesDir,
      distDir,
      targets: ["react"],
      logger: silentLogger,
    });

    // Only 1 template × 1 target = 1 file
    assert.equal(result.writtenFiles.length, 1);
    assert.ok(existsSync(join(distDir, "react", "badge.tsx")));
    // Other target subdirs should not exist
    assert.ok(!existsSync(join(distDir, "jsx-static")));
    assert.ok(!existsSync(join(distDir, "askama")));
    assert.ok(!existsSync(join(distDir, "liquid")));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("targets option: multiple targets emit only those targets", () => {
  const { tempRoot, templatesDir, distDir } = scaffoldMinimalProject();

  try {
    const result = buildProject({
      templatesDir,
      distDir,
      targets: ["react", "liquid"],
      logger: silentLogger,
    });

    assert.equal(result.writtenFiles.length, 2);
    assert.ok(existsSync(join(distDir, "react", "badge.tsx")));
    assert.ok(existsSync(join(distDir, "liquid", "snippets", "badge.liquid")));
    assert.ok(!existsSync(join(distDir, "jsx-static")));
    assert.ok(!existsSync(join(distDir, "askama")));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("targets option: omitting targets emits all 5 targets", () => {
  const { tempRoot, templatesDir, distDir } = scaffoldMinimalProject();

  try {
    const result = buildProject({
      templatesDir,
      distDir,
      logger: silentLogger,
    });

    // 1 template × 5 targets = 5 files
    assert.equal(result.writtenFiles.length, 5);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("targets option: unknown target name throws", () => {
  const { tempRoot, templatesDir, distDir } = scaffoldMinimalProject();

  try {
    assert.throws(
      () =>
        buildProject({
          templatesDir,
          distDir,
          targets: ["react", "nosuch"],
          logger: silentLogger,
        }),
      /Unknown target\(s\): nosuch/,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("targets option: empty array emits all targets (same as omitting)", () => {
  const { tempRoot, templatesDir, distDir } = scaffoldMinimalProject();

  try {
    const result = buildProject({
      templatesDir,
      distDir,
      targets: [],
      logger: silentLogger,
    });

    assert.equal(result.writtenFiles.length, 5);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
