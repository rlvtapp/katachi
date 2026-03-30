import type { AttrValue, Node } from "../core/ast.js";
import type { BuildTemplate } from "../core/types.js";
import { buildTsxComponentSource, emitTsxExpr, emitTsxNode } from "./shared.js";

function normalizeReactAttributeName(name: string): string {
  switch (name) {
    case "class":
      return "className";
    case "for":
      return "htmlFor";
    case "contenteditable":
      return "contentEditable";
    case "tabindex":
      return "tabIndex";
    case "stroke-width":
      return "strokeWidth";
    case "stroke-linecap":
      return "strokeLinecap";
    case "stroke-linejoin":
      return "strokeLinejoin";
    case "fill-rule":
      return "fillRule";
    case "clip-rule":
      return "clipRule";
    default:
      return name;
  }
}

/**
 * Emits attributes for React-compatible TSX output.
 */
function emitReactAttr(name: string, value: AttrValue): string | null {
  if (name.includes("@") || name.includes(":")) {
    return null;
  }

  const attrName = normalizeReactAttributeName(name);

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
  if (indent === 2 && node.kind === "element" && node.tag === "body") {
    const pad = "  ".repeat(indent);
    const children = (node.children ?? []).map((child) =>
      emitTsxNode(child, emitReactAttr, indent + 1, "react"),
    );

    if (children.length === 0) {
      return `${pad}<></>`;
    }

    return `${pad}<>\n${children.join("\n")}\n${pad}</>`;
  }

  return emitTsxNode(node, emitReactAttr, indent, "react");
}

export function emitReactComponent(template: BuildTemplate): string {
  return buildTsxComponentSource(template, emitReact(template.template, 2));
}
