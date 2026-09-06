import type { AttrValue, Node } from "../core/ast.js";
import {
  javascriptClassMergeImport,
  nodeUsesClassMerge,
  shouldMergeClassList,
} from "../core/class-names.js";
import type { BuildTemplate, TargetEmitOptions } from "../core/types.js";
import { buildTsxComponentSource, emitTsxExpr, emitTsxNode, emitTsxWithHoists } from "./shared.js";

function emitStaticJsxAttr(
  name: string,
  value: AttrValue,
  options: TargetEmitOptions = {},
): string | null {
  if (name.includes("@") || name.includes(":")) {
    return null;
  }

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
        if (item.kind === "dynamic") {
          return emitTsxExpr(item.expr);
        }

        return `${emitTsxExpr(item.test)} ? ${JSON.stringify(item.value)} : null`;
      });
      if (!shouldMergeClassList(value, options.classNames)) {
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

      return `${attrName}={__katachiMergeClasses(${items.join(", ")})}`;
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

export function emitStaticJsx(
  node: Node,
  indent = 0,
  context?: Parameters<typeof emitTsxNode>[4],
  options: TargetEmitOptions = {},
): string {
  const emitAttr = (name: string, value: AttrValue) => emitStaticJsxAttr(name, value, options);
  return emitTsxNode(node, emitAttr, indent, "jsx-static", context);
}

export function emitStaticJsxComponent(
  template: BuildTemplate,
  options: TargetEmitOptions = {},
): string {
  const emitAttr = (name: string, value: AttrValue) => emitStaticJsxAttr(name, value, options);
  const { body, hoists } = emitTsxWithHoists(
    template,
    (node, _emitAttr, indent, context) => emitStaticJsx(node, indent, context, options),
    emitAttr,
  );
  const additionalImports = nodeUsesClassMerge(template.template, options.classNames, "jsx-static")
    ? [javascriptClassMergeImport(options.classNames, "staticJsx")]
    : [];
  return buildTsxComponentSource(template, body, hoists, additionalImports);
}
