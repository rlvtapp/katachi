import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ClassNameMergingConfig, KatachiConfig, TemplateInputConfig } from "../config.js";
import type {
  AskamaBuildPaths,
  BuildTargetSelection,
  BuildTemplate,
  ComponentRegistry,
} from "./types.js";
import { parseTemplateFile } from "./parser.js";
import { outputTargets } from "../targets/index.js";
import type { TargetEmitOptions } from "./types.js";

export interface BuildProjectOptions {
  config?: KatachiConfig;
  projectRoot?: string;
  distDir?: string;
  templatesDir?: string;
  targets?: string[];
  askamaIncludePrefix?: string;
  classNames?: ClassNameMergingConfig;
  minify?: boolean;
  logger?: Pick<Console, "log">;
}

export interface BuildProjectResult {
  templates: BuildTemplate[];
  writtenFiles: string[];
}

function selectOutputTargets(options: BuildTargetSelection = {}) {
  const allTargetIds = outputTargets.map((target) => target.id);

  if (!options.targets || options.targets.length === 0) {
    return outputTargets;
  }

  const unknownTargets = options.targets.filter((target) => !allTargetIds.includes(target));
  if (unknownTargets.length > 0) {
    throw new Error(
      `Unknown target(s): ${unknownTargets.join(", ")}. Available: ${allTargetIds.join(", ")}`,
    );
  }

  return outputTargets.filter((target) => options.targets?.includes(target.id));
}

/**
 * Recursively finds all Katachi template files.
 */
function collectFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

interface CollectedTemplateFile {
  sourcePath: string;
  relativePath: string;
}

function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  let source = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? "";
    const next = normalized[index + 1];

    if (character === "*" && next === "*") {
      const followedBySlash = normalized[index + 2] === "/";
      source += followedBySlash ? "(?:.*/)?" : ".*";
      index += followedBySlash ? 2 : 1;
      continue;
    }
    if (character === "*") {
      source += "[^/]*";
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }

    source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }

  return new RegExp(`${source}$`);
}

function collectTemplateFiles(
  projectRoot: string,
  inputs: TemplateInputConfig[],
): CollectedTemplateFile[] {
  const collected: CollectedTemplateFile[] = [];
  const outputPaths = new Map<string, string>();

  for (const input of inputs) {
    const directory = resolve(projectRoot, input.directory);
    const include = input.include?.length ? input.include : ["**/*.template.tsx"];
    const exclude = input.exclude ?? [];

    for (const sourcePath of collectFiles(directory)) {
      if (!sourcePath.endsWith(".template.tsx")) {
        continue;
      }
      const inputRelativePath = relative(directory, sourcePath).replaceAll("\\", "/");
      if (!matchesAny(inputRelativePath, include) || matchesAny(inputRelativePath, exclude)) {
        continue;
      }

      const relativePath = input.outputPrefix
        ? join(input.outputPrefix, inputRelativePath).replaceAll("\\", "/")
        : inputRelativePath;
      const previousSource = outputPaths.get(relativePath);
      if (previousSource) {
        throw new Error(
          `Template inputs produce the same output path ${relativePath}: ${previousSource} and ${sourcePath}`,
        );
      }

      outputPaths.set(relativePath, sourcePath);
      collected.push({ sourcePath, relativePath });
    }
  }

  return collected.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function toRelativeModulePath(fromRelativePath: string, toRelativePathWithoutExtension: string): string {
  const fromDir = dirname(fromRelativePath);
  const relativePath = relative(fromDir, toRelativePathWithoutExtension).replaceAll("\\", "/");

  if (!relativePath || !relativePath.startsWith(".")) {
    return `./${relativePath}`;
  }

  return relativePath;
}

function toAskamaIncludePath(
  fromRelativePath: string,
  importedRelativePath: string,
  askamaPaths: AskamaBuildPaths = {},
): string {
  const includeTarget = join(
    "includes",
    dirname(importedRelativePath),
    `${basename(importedRelativePath).replace(/\.template\.tsx$/, "")}.html`,
  );

  if (askamaPaths.includePrefix) {
    return join(askamaPaths.includePrefix, dirname(importedRelativePath), `${basename(importedRelativePath).replace(/\.template\.tsx$/, "")}.html`).replaceAll("\\", "/");
  }

  const fromDir = dirname(fromRelativePath);
  const relativePath = relative(fromDir, includeTarget).replaceAll("\\", "/");

  if (!relativePath || !relativePath.startsWith(".")) {
    return `./${relativePath}`;
  }

  return relativePath;
}

/**
 * Builds the current project and writes all configured outputs to `dist/`.
 */
export function buildProject(options: BuildProjectOptions = {}): BuildProjectResult {
  const config = options.config ?? {};
  const projectRoot = options.projectRoot ?? process.cwd();
  const distDir = options.distDir ?? resolve(projectRoot, config.outDir ?? "dist");
  const inputs = options.templatesDir
    ? [{ directory: options.templatesDir }]
    : config.inputs !== undefined
      ? config.inputs
      : [{ directory: "src/templates" }];
  const askamaPaths: AskamaBuildPaths = {
    includePrefix: options.askamaIncludePrefix ?? config.askama?.includePrefix,
    templatePrefix: options.askamaIncludePrefix ?? config.askama?.includePrefix,
  };
  const emitOptions: TargetEmitOptions = {
    minify: options.minify ?? config.minify,
    classNames: options.classNames ?? config.classNames,
  };
  const activeTargets = selectOutputTargets({ targets: options.targets ?? config.targets });
  const logger = options.logger ?? console;
  const writtenFiles: string[] = [];

  mkdirSync(distDir, { recursive: true });

  const templateFiles = collectTemplateFiles(projectRoot, inputs);

  const parsedTemplates: BuildTemplate[] = templateFiles.map(({ sourcePath, relativePath }) => {
    const source = readFileSync(sourcePath, "utf8");
    const fileName = basename(relativePath).replace(/\.template\.tsx$/, "");
    return {
      ...parseTemplateFile(source),
      sourcePath,
      relativePath,
      fileName,
      askamaTemplatePrefix: askamaPaths.templatePrefix,
      componentRegistry: {},
    };
  });

  const templateByPath = new Map<string, BuildTemplate>(
    parsedTemplates.map((template) => [template.sourcePath, template]),
  );

  for (const template of parsedTemplates) {
    const componentRegistry: ComponentRegistry = {};

    for (const entry of template.imports ?? []) {
      if (!entry.source.includes(".template")) {
        continue;
      }

      const importPath = entry.source.endsWith(".tsx")
        ? entry.source
        : `${entry.source}.tsx`;
      const resolvedPath = resolve(dirname(template.sourcePath), importPath);
      const importedTemplate = templateByPath.get(resolvedPath);

      if (!importedTemplate) {
        throw new Error(
          `Could not resolve imported component ${entry.localName} from ${template.sourcePath}: ${entry.source}`,
        );
      }

      componentRegistry[entry.localName] = {
        reactImport: toRelativeModulePath(
          template.relativePath,
          importedTemplate.relativePath.replace(/\.template\.tsx$/, ""),
        ),
        include: toAskamaIncludePath(template.relativePath, importedTemplate.relativePath, askamaPaths),
        liquidSnippet: importedTemplate.relativePath.replace(/\.template\.tsx$/, "").replaceAll("\\", "/"),
      };
    }

    template.componentRegistry = componentRegistry;
    const templateDir = dirname(template.relativePath);

    for (const target of activeTargets) {
      for (const output of target.emitFiles(template, emitOptions)) {
        const outputPath = join(distDir, target.outputSubdir, templateDir, output.fileName);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, output.content, "utf8");
        writtenFiles.push(outputPath);
        logger.log(`wrote ${outputPath}`);
      }
    }
  }

  return {
    templates: parsedTemplates,
    writtenFiles,
  };
}

function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && resolve(entry) === fileURLToPath(metaUrl);
}

if (isMainModule(import.meta.url)) {
  buildProject();
}
