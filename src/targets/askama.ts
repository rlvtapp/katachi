import type { AttrValue, Node } from "../core/ast";
import type { BuildTemplate } from "../core/types";
import {
  emitAskamaExpr,
  escapeDoubleQuotes,
  toCamelCase,
  toRustType,
  wrapHtmlAttribute,
} from "./shared";

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

        parts.push(`{% if ${emitAskamaExpr(item.test)} %}${item.value}{% endif %}`);
      }

      return `${name}=${wrapHtmlAttribute(parts.join(" ").trim())}`;
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
): string {
  const pad = "  ".repeat(indent);

  switch (node.kind) {
    case "text":
      return `${pad}${node.value}`;
    case "slot":
      return `${pad}{{ ${node.name}|safe }}`;
    case "print":
      return `${pad}{{ ${emitAskamaExpr(node.expr)}${node.safe ? "|safe" : ""} }}`;
    case "if": {
      const thenPart = node.then
        .map((child) => emitAskama(child, indent + 1, componentRegistry))
        .join("\n");
      const elsePart = (node.else ?? [])
        .map((child) => emitAskama(child, indent + 1, componentRegistry))
        .join("\n");
      if (elsePart) {
        return `${pad}{% if ${emitAskamaExpr(node.test)} %}\n${thenPart}\n${pad}{% else %}\n${elsePart}\n${pad}{% endif %}`;
      }
      return `${pad}{% if ${emitAskamaExpr(node.test)} %}\n${thenPart}\n${pad}{% endif %}`;
    }
    case "for": {
      const body = node.children
        .map((child) => emitAskama(child, indent + 1, componentRegistry))
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
        emitAskama(child, indent + 1, componentRegistry),
      );

      if (children.length === 0) {
        return `${pad}<${node.tag}${attrs}/>`;
      }

      return `${pad}<${node.tag}${attrs}>\n${children.join("\n")}\n${pad}</${node.tag}>`;
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
            emitAskama(child, indent + 1, componentRegistry),
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
  const source = emitAskama(
    template.template,
    0,
    template.componentRegistry ?? {},
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
  return `${emitAskama(template.template, 0, template.componentRegistry ?? {})}\n`;
}
