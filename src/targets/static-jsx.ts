import type { AttrValue, Node } from "../core/ast.js";
import type { BuildTemplate } from "../core/types.js";
import { buildTsxComponentSource, emitTsxExpr, emitTsxNode, emitTsxWithHoists } from "./shared.js";

/**
 * Emits TSX meant to read more statically by inlining class string interpolation.
 */
function emitStaticJsxAttr(name: string, value: AttrValue): string {
  const attrName = name === "class" ? "className" : name;

  switch (value.kind) {
    case "text":
      return `${attrName}=${JSON.stringify(value.value)}`;
    case "expr":
      return `${attrName}={${emitTsxExpr(value.expr)}}`;
    case "classList": {
      const segments = value.items.map((item) => {
        if (item.kind === "static") {
          return item.value;
        }
        if (item.kind === "dynamic") {
          return `\${${emitTsxExpr(item.expr)}}`;
        }

        return `\${${emitTsxExpr(item.test)} ? ${JSON.stringify(item.value)} : ""}`;
      });

      return `${attrName}={\`${segments.join(" ").trim()}\`}`;
    }
    case "concat": {
      const segments = value.parts.map((part) => {
        if (part.kind === "string") {
          return part.value;
        }
        return `\${${emitTsxExpr(part)}}`;
      });
      return `${attrName}={\`${segments.join("")}\`}`;
    }
  }
}

export function emitStaticJsx(node: Node, indent = 0): string {
  return emitTsxNode(node, emitStaticJsxAttr, indent);
}

export function emitStaticJsxComponent(template: BuildTemplate): string {
  const { body, hoists } = emitTsxWithHoists(template, emitTsxNode, emitStaticJsxAttr);
  return buildTsxComponentSource(template, body, hoists);
}
