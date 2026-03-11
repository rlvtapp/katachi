import type { AttrValue, Node } from "../core/ast";
import type { BuildTemplate } from "../core/types";
import { buildTsxComponentSource, emitTsxExpr, emitTsxNode } from "./shared";

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

        return `\${${emitTsxExpr(item.test)} ? ${JSON.stringify(item.value)} : ""}`;
      });

      return `${attrName}={\`${segments.join(" ").trim()}\`}`;
    }
  }
}

export function emitStaticJsx(node: Node, indent = 0): string {
  return emitTsxNode(node, emitStaticJsxAttr, indent);
}

export function emitStaticJsxComponent(template: BuildTemplate): string {
  return buildTsxComponentSource(template, emitStaticJsx(template.template, 2));
}
