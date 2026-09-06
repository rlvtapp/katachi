export { buildProject } from "./core/build.js";
export type { BuildProjectOptions, BuildProjectResult } from "./core/build.js";

export { defineConfig, loadKatachiConfig } from "./config.js";
export type {
  ClassNameMergingConfig,
  JavaScriptClassMergeFunction,
  KatachiConfig,
  KatachiTargetName,
  LoadedKatachiConfig,
  LoadKatachiConfigOptions,
  TemplateInputConfig,
} from "./config.js";

export { parseTemplateFile } from "./core/parser.js";
export { verifyAskamaFixtures, normalizeAskama } from "./core/verify.js";

export * from "./api/index.js";
export type {
  BuildTemplate,
  ComponentRegistration,
  ComponentRegistry,
  OutputTarget,
  ParsedTemplate,
  TargetOutputFile,
  TemplateImport,
  TemplateProp,
} from "./core/types.js";

export * from "./core/ast.js";
