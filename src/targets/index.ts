import type { OutputTarget } from "../core/types.js";
import { emitAskamaComponent, emitAskamaPartial } from "./askama.js";
import { emitReactComponent } from "./react.js";
import { emitStaticJsxComponent } from "./static-jsx.js";

/**
 * Central registry for output formats. The build driver only depends on this interface.
 */
export const outputTargets: OutputTarget[] = [
  {
    id: "react",
    outputSubdir: "react",
    extension: ".tsx",
    emitFiles(template) {
      return [
        {
          fileName: `${template.fileName}.tsx`,
          content: `${emitReactComponent(template)}\n`,
        },
      ];
    },
  },
  {
    id: "jsx-static",
    outputSubdir: "jsx-static",
    extension: ".tsx",
    emitFiles(template) {
      return [
        {
          fileName: `${template.fileName}.tsx`,
          content: `${emitStaticJsxComponent(template)}\n`,
        },
      ];
    },
  },
  {
    id: "askama",
    outputSubdir: "askama",
    extension: ".rs",
    emitFiles(template) {
      return [
        {
          fileName: `${template.fileName}.rs`,
          content: `${emitAskamaComponent(template)}\n`,
        },
      ];
    },
  },
  {
    id: "askama-includes",
    outputSubdir: "askama/includes",
    extension: ".html",
    emitFiles(template) {
      return [
        {
          fileName: `${template.fileName}.html`,
          content: emitAskamaPartial(template),
        },
      ];
    },
  },
];
