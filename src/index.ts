export { buildProject } from "./core/build";
export type { BuildProjectOptions, BuildProjectResult } from "./core/build";

export { parseTemplateFile } from "./core/parser";
export { verifyAskamaFixtures, normalizeAskama } from "./core/verify";

export * from "./api";
export type {
  BuildTemplate,
  ComponentRegistration,
  ComponentRegistry,
  OutputTarget,
  ParsedTemplate,
  TargetOutputFile,
  TemplateImport,
  TemplateProp,
} from "./core/types";

export * from "./core/ast";
