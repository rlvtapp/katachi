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
