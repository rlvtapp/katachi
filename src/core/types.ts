import type { Node } from "./ast.js";

/**
 * Describes a component import discovered in a template source file.
 */
export interface TemplateImport {
  localName: string;
  source: string;
}

/**
 * Represents one prop from an exported `Props` type in a template module.
 */
export interface TemplateProp {
  name: string;
  type: string;
  optional: boolean;
}

/**
 * Maps a component name used in authoring input to per-target resolution data.
 */
export interface ComponentRegistration {
  reactImport: string;
  include: string;
  liquidSnippet?: string;
}

export type ComponentRegistry = Record<string, ComponentRegistration>;

/**
 * Parser output before filesystem metadata and import resolution are attached.
 */
export interface ParsedTemplate {
  name: string;
  fileName: string;
  imports: TemplateImport[];
  props: TemplateProp[];
  template: Node;
}

/**
 * Project-level template representation after the build step resolves imports.
 */
export interface BuildTemplate extends ParsedTemplate {
  sourcePath: string;
  relativePath: string;
  componentRegistry: ComponentRegistry;
}

/**
 * One file emitted by a target.
 */
export interface TargetOutputFile {
  fileName: string;
  content: string;
}

/**
 * Contract implemented by a concrete output format.
 */
export interface OutputTarget {
  id: string;
  outputSubdir: string;
  extension: string;
  emitFiles(template: BuildTemplate): TargetOutputFile[];
}

/**
 * Used by the parser while recursively reading a template body.
 */
export interface ParseNodesResult {
  nodes: Node[];
  nextIndex: number;
}
