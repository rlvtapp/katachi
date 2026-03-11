import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import type { Fixture } from "./verify";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

export function resolveExampleRoot(exampleName = "basic"): string {
  return resolve(rootDir, "examples", exampleName);
}

export function createExampleFixtures(
  exampleRoot: string,
  distDir = resolve(exampleRoot, "dist"),
): Fixture[] {
  const componentsDir = resolve(exampleRoot, "components");
  const askamaIncludesDir = resolve(distDir, "askama", "includes");

  return [
    {
      name: "examples/basic/badge-chip",
      source: resolve(componentsDir, "badge-chip.html"),
      generated: resolve(askamaIncludesDir, "badge-chip.html"),
    },
    {
      name: "examples/basic/comparison-table",
      source: resolve(componentsDir, "comparison-table.html"),
      generated: resolve(askamaIncludesDir, "comparison-table.html"),
    },
    {
      name: "examples/basic/glyph",
      source: resolve(componentsDir, "glyph.html"),
      generated: resolve(askamaIncludesDir, "glyph.html"),
    },
    {
      name: "examples/basic/hover-note",
      source: resolve(componentsDir, "hover-note.html"),
      generated: resolve(askamaIncludesDir, "hover-note.html"),
    },
    {
      name: "examples/basic/media-frame",
      source: resolve(componentsDir, "media-frame.html"),
      generated: resolve(askamaIncludesDir, "media-frame.html"),
    },
    {
      name: "examples/basic/notice-panel",
      source: resolve(componentsDir, "notice-panel.html"),
      generated: resolve(askamaIncludesDir, "notice-panel.html"),
    },
    {
      name: "examples/basic/resource-tile",
      source: resolve(componentsDir, "resource-tile.html"),
      generated: resolve(askamaIncludesDir, "resource-tile.html"),
    },
    {
      name: "examples/basic/stack-shell",
      source: resolve(componentsDir, "stack-shell.html"),
      generated: resolve(askamaIncludesDir, "stack-shell.html"),
    },
  ];
}

export const basicExampleRoot = resolveExampleRoot();
export const exampleFixtures: Fixture[] = createExampleFixtures(basicExampleRoot);
