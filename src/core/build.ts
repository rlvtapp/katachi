import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildTemplate, ComponentRegistry } from "./types.js";
import { parseTemplateFile } from "./parser.js";
import { outputTargets } from "../targets/index.js";

export interface BuildProjectOptions {
  projectRoot?: string;
  distDir?: string;
  templatesDir?: string;
  logger?: Pick<Console, "log">;
}

export interface BuildProjectResult {
  templates: BuildTemplate[];
  writtenFiles: string[];
}

/**
 * Recursively finds all Katachi template files.
 */
function collectTemplateFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTemplateFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".template.tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

function toRelativeModulePath(fromRelativePath: string, toRelativePathWithoutExtension: string): string {
  const fromDir = dirname(fromRelativePath);
  const relativePath = relative(fromDir, toRelativePathWithoutExtension).replaceAll("\\", "/");

  if (!relativePath || !relativePath.startsWith(".")) {
    return `./${relativePath}`;
  }

  return relativePath;
}

function toRelativeIncludePath(fromRelativePath: string, importedRelativePath: string): string {
  const fromDir = dirname(fromRelativePath);
  const includeTarget = join(
    "includes",
    dirname(importedRelativePath),
    `${basename(importedRelativePath).replace(/\.template\.tsx$/, "")}.html`,
  );
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
  const projectRoot = options.projectRoot ?? process.cwd();
  const distDir = options.distDir ?? resolve(projectRoot, "dist");
  const templatesDir = options.templatesDir ?? resolve(projectRoot, "src/templates");
  const logger = options.logger ?? console;
  const writtenFiles: string[] = [];

  mkdirSync(distDir, { recursive: true });

  const templateFiles = collectTemplateFiles(templatesDir);

  const parsedTemplates: BuildTemplate[] = templateFiles.map((filePath) => {
    const source = readFileSync(filePath, "utf8");
    const relativePath = relative(templatesDir, filePath);
    const fileName = basename(relativePath).replace(/\.template\.tsx$/, "");
    return {
      ...parseTemplateFile(source),
      sourcePath: filePath,
      relativePath,
      fileName,
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
        include: toRelativeIncludePath(template.relativePath, importedTemplate.relativePath),
      };
    }

    template.componentRegistry = componentRegistry;
    const templateDir = dirname(template.relativePath);

    for (const target of outputTargets) {
      for (const output of target.emitFiles(template)) {
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
