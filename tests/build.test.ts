import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
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
    assert.equal(result.writtenFiles.length, 12);

    const reactOutputPath = join(distDir, "react", "nested", "card.tsx");
    const askamaIncludePath = join(distDir, "askama", "includes", "nested", "card.html");

    assert.ok(existsSync(reactOutputPath));
    assert.ok(existsSync(askamaIncludePath));

    const reactOutput = readFileSync(reactOutputPath, "utf8");
    const askamaInclude = readFileSync(askamaIncludePath, "utf8");

    assert.match(reactOutput, /import Icon from "\.\.\/icon";/);
    assert.match(askamaInclude, /{% include "\.\.\/includes\/icon\.html" %}/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("buildProject can minify Askama include and Liquid outputs", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "katachi-build-minify-"));

  try {
    const templatesDir = join(tempRoot, "templates");
    const distDir = join(tempRoot, "dist");
    mkdirSync(templatesDir, { recursive: true });

    writeFileSync(
      join(templatesDir, "card.template.tsx"),
      `import { If } from "@relevate/katachi";

export type Props = {
  active: boolean;
  label: string;
};

export default function Card({ active, label }: Props) {
  return (
    <div className={["base", active && "active"]}>
      <If test={active}>
        <span>{label}</span>
      </If>
    </div>
  );
}
`,
      "utf8",
    );

    buildProject({
      templatesDir,
      distDir,
      minify: true,
      logger: silentLogger,
    });

    const askamaInclude = readFileSync(join(distDir, "askama", "includes", "card.html"), "utf8");
    const liquidOutput = readFileSync(join(distDir, "liquid", "card.liquid"), "utf8");
    const reactOutput = readFileSync(join(distDir, "react", "card.tsx"), "utf8");

    assert.equal(
      askamaInclude,
      `<div class='base {% if active %}active{% endif %}'>{% if active %}<span>{{ label }}</span>{% endif %}</div>\n`,
    );
    assert.equal(
      liquidOutput,
      `<div class='base {% if active %}active{% endif %}'>{% if active %}<span>{{ label | escape }}</span>{% endif %}</div>\n`,
    );
    assert.match(reactOutput, /return \(\n\s+<div\b/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("buildProject can emit only selected targets", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "katachi-build-targets-"));

  try {
    const templatesDir = join(tempRoot, "templates");
    const distDir = join(tempRoot, "dist");
    mkdirSync(templatesDir, { recursive: true });

    writeFileSync(
      join(templatesDir, "badge.template.tsx"),
      `export type Props = {
  label: string;
};

export default function Badge({ label }: Props) {
  return <span>{label}</span>;
}
`,
      "utf8",
    );

    const result = buildProject({
      templatesDir,
      distDir,
      targets: ["react", "liquid"],
      logger: silentLogger,
    });

    assert.equal(result.writtenFiles.length, 2);
    assert.ok(existsSync(join(distDir, "react", "badge.tsx")));
    assert.ok(existsSync(join(distDir, "liquid", "badge.liquid")));
    assert.equal(existsSync(join(distDir, "askama", "badge.rs")), false);
    assert.equal(existsSync(join(distDir, "askama", "includes", "badge.html")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
