import type { AttrValue, Node } from "../core/ast";
import type { BuildTemplate } from "../core/types";
import { buildTsxComponentSource, emitTsxExpr, emitTsxNode } from "./shared";

/**
 * Emits attributes for React-compatible TSX output.
 */
function emitReactAttr(name: string, value: AttrValue): string {
  const attrName = name === "class" ? "className" : name;

  switch (value.kind) {
    case "text":
      return `${attrName}=${JSON.stringify(value.value)}`;
    case "expr":
      return `${attrName}={${emitTsxExpr(value.expr)}}`;
    case "classList": {
      const items = value.items.map((item) => {
        if (item.kind === "static") {
          return JSON.stringify(item.value);
        }
        return `${emitTsxExpr(item.test)} ? ${JSON.stringify(item.value)} : null`;
      });

      return `${attrName}={[${items.join(", ")}].filter(Boolean).join(" ")}`;
    }
  }
}

export function emitReact(node: Node, indent = 0): string {
  return emitTsxNode(node, emitReactAttr, indent);
}

export function emitReactComponent(template: BuildTemplate): string {
  return buildTsxComponentSource(template, emitReact(template.template, 2));
}
