import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { tsImport } from "tsx/esm/api";

export const katachiTargetNames = [
  "react",
  "jsx-static",
  "askama",
  "askama-includes",
  "liquid",
  "liquid-snippets",
] as const;

export type KatachiTargetName = (typeof katachiTargetNames)[number];

export interface TemplateInputConfig {
  /** Directory searched recursively, relative to the project root. */
  directory: string;
  /** Glob patterns matched against paths relative to `directory`. */
  include?: string[];
  /** Glob patterns removed after `include` matching. */
  exclude?: string[];
  /** Optional path prepended to files emitted from this input. */
  outputPrefix?: string;
}

export interface JavaScriptClassMergeFunction {
  /** Module specifier written into generated JavaScript or TypeScript. */
  from: string;
  /** Named export to import, or `default` for a default import. */
  import: string | "default";
}

export interface ClassNameMergingConfig {
  /**
   * `dynamic-only` merges only lists containing a dynamic `className` prop.
   * `always` merges every class list. `off` preserves plain joining.
   */
  mode?: "off" | "dynamic-only" | "always";
  react?: JavaScriptClassMergeFunction;
  staticJsx?: JavaScriptClassMergeFunction;
  askama?: {
    /** Custom Askama filter supplied by the consuming Rust crate. */
    filter: string;
    /** Rust module imported as `filters` beside generated Template derives. */
    filtersModule?: string;
  };
}

export interface KatachiConfig {
  /** Template roots and their include/exclude rules. */
  inputs?: TemplateInputConfig[];
  /** Output directory relative to the project root. */
  outDir?: string;
  targets?: KatachiTargetName[];
  askama?: {
    includePrefix?: string;
  };
  classNames?: ClassNameMergingConfig;
  minify?: boolean;
}

/** Provides type inference and validation for `katachi.config.ts`. */
export function defineConfig(config: KatachiConfig): KatachiConfig {
  return config;
}

const CONFIG_FILE_NAMES = [
  "katachi.config.ts",
  "katachi.config.mts",
  "katachi.config.js",
  "katachi.config.mjs",
  "katachi.config.cjs",
] as const;

export interface LoadKatachiConfigOptions {
  projectRoot: string;
  configFile?: string;
}

export interface LoadedKatachiConfig {
  config: KatachiConfig;
  path?: string;
}

export async function loadKatachiConfig(
  options: LoadKatachiConfigOptions,
): Promise<LoadedKatachiConfig> {
  const explicitPath = options.configFile
    ? isAbsolute(options.configFile)
      ? options.configFile
      : resolve(options.projectRoot, options.configFile)
    : undefined;
  const configPath = explicitPath ?? CONFIG_FILE_NAMES
    .map((fileName) => resolve(options.projectRoot, fileName))
    .find(existsSync);

  if (!configPath) {
    return { config: {} };
  }
  if (!existsSync(configPath)) {
    throw new Error(`Katachi config not found: ${configPath}`);
  }

  const loaded = await tsImport(pathToFileURL(configPath).href, import.meta.url) as {
    default?: unknown;
  };
  const importedDefault = loaded.default;
  const config = importedDefault &&
      typeof importedDefault === "object" &&
      "default" in importedDefault
    ? (importedDefault as { default?: unknown }).default
    : importedDefault;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Katachi config must have a default object export: ${configPath}`);
  }

  return {
    config: config as KatachiConfig,
    path: configPath,
  };
}
