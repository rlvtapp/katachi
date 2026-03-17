import type { AttrValue, Node } from "../core/ast.js";
import type { BuildTemplate } from "../core/types.js";
import {
  emitAskamaExpr,
  emitInterpolatedTagName,
  escapeDoubleQuotes,
  toCamelCase,
  toRustType,
  wrapHtmlAttribute,
} from "./shared.js";

type ValueTypeMap = Record<string, string>;

function inferEachItemType(type: string | undefined): string | undefined {
  if (type === "children[]") return "children";
  if (type === "children[][]") return "children[]";
  if (type === "string[]") return "string";
  if (type === "string[][]") return "string[]";
  return undefined;
}

function shouldPrintSafe(node: Extract<Node, { kind: "print" }>, valueTypes: ValueTypeMap): boolean {
  return node.expr.kind === "var" && valueTypes[node.expr.name] === "children";
}

/**
 * Emits an HTML attribute for Askama output.
 */
function emitAskamaAttr(name: string, value: AttrValue): string {
  switch (value.kind) {
    case "text":
      return `${name}=${wrapHtmlAttribute(value.value)}`;
    case "expr":
      return `${name}=${wrapHtmlAttribute(`{{ ${emitAskamaExpr(value.expr)} }}`)}`;
    case "classList": {
      const parts: string[] = [];
      for (const item of value.items) {
        if (item.kind === "static") {
          parts.push(item.value);
          continue;
        }
        if (item.kind === "dynamic") {
          parts.push(`{{ ${emitAskamaExpr(item.expr)} }}`);
          continue;
        }

        parts.push(`{% if ${emitAskamaExpr(item.test)} %}${item.value}{% endif %}`);
      }

      return `${name}=${wrapHtmlAttribute(parts.join(" ").trim())}`;
    }
    case "concat": {
      const segments = value.parts.map((part) => {
        if (part.kind === "string") {
          return part.value;
        }
        return `{{ ${emitAskamaExpr(part)} }}`;
      });
      return `${name}=${wrapHtmlAttribute(segments.join(""))}`;
    }
  }
}

/**
 * Emits portable AST nodes into Askama template source.
 */
export function emitAskama(
  node: Node,
  indent = 0,
  componentRegistry: BuildTemplate["componentRegistry"] = {},
  valueTypes: ValueTypeMap = {},
): string {
  const pad = "  ".repeat(indent);

  switch (node.kind) {
    case "text":
      return `${pad}${node.value}`;
    case "slot":
      return `${pad}{{ ${node.name}|safe }}`;
    case "print":
      return `${pad}{{ ${emitAskamaExpr(node.expr)}${shouldPrintSafe(node, valueTypes) ? "|safe" : ""} }}`;
    case "if": {
      const thenPart = node.then
        .map((child) => emitAskama(child, indent + 1, componentRegistry, valueTypes))
        .join("\n");
      const elsePart = (node.else ?? [])
        .map((child) => emitAskama(child, indent + 1, componentRegistry, valueTypes))
        .join("\n");
      if (elsePart) {
        return `${pad}{% if ${emitAskamaExpr(node.test)} %}\n${thenPart}\n${pad}{% else %}\n${elsePart}\n${pad}{% endif %}`;
      }
      return `${pad}{% if ${emitAskamaExpr(node.test)} %}\n${thenPart}\n${pad}{% endif %}`;
    }
    case "for": {
      const loopValueTypes = { ...valueTypes };
      loopValueTypes[node.item] = inferEachItemType(
        node.each.kind === "var" ? valueTypes[node.each.name] : undefined,
      ) ?? "string";
      const body = node.children
        .map((child) => emitAskama(child, indent + 1, componentRegistry, loopValueTypes))
        .join("\n");
      return `${pad}{% for ${node.item} in ${emitAskamaExpr(node.each)} %}\n${body}\n${pad}{% endfor %}`;
    }
    case "element": {
      const attrEntries = Object.entries(node.attrs ?? {});
      const attrs = attrEntries.length
        ? `\n${attrEntries
            .map(([name, value]) => `${pad}  ${emitAskamaAttr(name, value)}`)
            .join("\n")}\n${pad}`
        : "";
      const children = (node.children ?? []).map((child) =>
        emitAskama(child, indent + 1, componentRegistry, valueTypes),
      );
      const tagName = emitInterpolatedTagName(node.tag, emitAskamaExpr);

      if (children.length === 0) {
        return `${pad}<${tagName}${attrs}/>`;
      }

      return `${pad}<${tagName}${attrs}>\n${children.join("\n")}\n${pad}</${tagName}>`;
    }
    case "component": {
      const registration = componentRegistry[node.name];
      if (!registration) {
        throw new Error(`Missing Askama component registration for ${node.name}`);
      }

      const lines: string[] = [];
      for (const [propName, propValue] of Object.entries(node.props ?? {})) {
        if (propValue.kind === "text") {
          lines.push(`${pad}{% let ${propName} = "${escapeDoubleQuotes(propValue.value)}" %}`);
          continue;
        }
        if (propValue.kind === "expr") {
          lines.push(`${pad}{% let ${propName} = ${emitAskamaExpr(propValue.expr)} %}`);
          continue;
        }
        throw new Error(
          `Component prop ${propName} on ${node.name} must be text or expr for Askama include output`,
        );
      }

      if ((node.children ?? []).length > 0) {
        lines.push(`${pad}{% let children %}`);
        lines.push(
          ...(node.children ?? []).map((child) =>
            emitAskama(child, indent + 1, componentRegistry, valueTypes),
          ),
        );
        lines.push(`${pad}{% endlet %}`);
      }

      lines.push(`${pad}{% include "${registration.include}" %}`);
      return lines.join("\n");
    }
  }
}

/**
 * Emits the Rust `Template` wrapper for Askama consumption.
 */
export function emitAskamaComponent(template: BuildTemplate): string {
  const structName = `${template.name}Template`;
  const props = template.props ?? [];
  const needsLifetime = props.some((prop) => toRustType(prop.type).includes("'a"));
  const lifetime = needsLifetime ? "<'a>" : "";
  const fields = props
    .map((prop) => `    pub ${toCamelCase(prop.name)}: ${toRustType(prop.type)},`)
    .join("\n");
  const valueTypes = Object.fromEntries(props.map((prop) => [prop.name, prop.type]));
  const source = emitAskama(
    template.template,
    0,
    template.componentRegistry ?? {},
    valueTypes,
  ).replace(/#"/g, '#\\"');

  return `use askama::Template;

#[derive(Template)]
#[template(
    ext = "html",
    source = r#"
${source}
"#
)]
pub struct ${structName}${lifetime} {
${fields}
}
`;
}

export function emitAskamaPartial(template: BuildTemplate): string {
  const valueTypes = Object.fromEntries((template.props ?? []).map((prop) => [prop.name, prop.type]));
  return `${emitAskama(template.template, 0, template.componentRegistry ?? {}, valueTypes)}\n`;
}
