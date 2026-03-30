import { basename, dirname, join } from "node:path/posix";

import type { AttrValue, Expr, Node } from "../core/ast.js";
import type { BuildTemplate, TargetEmitOptions } from "../core/types.js";
import {
  isBooleanHtmlAttribute,
  isVoidHtmlElement,
  normalizeHtmlAttributeName,
} from "./html.js";
import {
  emitAskamaExpr,
  escapeDoubleQuotes,
  toSnakeCase,
  toRustType,
  wrapHtmlAttribute,
} from "./shared.js";

type AskamaScope = Record<string, string>;

function createAskamaRootScope(template: BuildTemplate): AskamaScope {
  return Object.fromEntries(
    (template.props ?? []).map((prop) => [prop.name, toSnakeCase(prop.name)]),
  );
}

function emitScopedAskamaExpr(expr: Expr, scope: AskamaScope): string {
  const base = emitAskamaExpr(expr);

  return Object.entries(scope).reduce((current, [name, replacement]) => {
    const pattern = new RegExp(`\\b${name}\\b`, "g");
    return current.replace(pattern, replacement);
  }, base);
}

/**
 * Emits an HTML attribute for Askama output.
 */
function emitAskamaAttr(name: string, value: AttrValue, scope: AskamaScope): string {
  const normalizedName = normalizeHtmlAttributeName(name);
  const isBooleanAttribute = isBooleanHtmlAttribute(normalizedName);

  switch (value.kind) {
    case "text":
      if (isBooleanAttribute) {
        return value.value === "false" ? "" : normalizedName;
      }
      return `${normalizedName}=${wrapHtmlAttribute(value.value)}`;
    case "expr":
      if (isBooleanAttribute) {
        return `{% if ${emitScopedAskamaExpr(value.expr, scope)} %}${normalizedName}{% endif %}`;
      }
      return `${normalizedName}=${wrapHtmlAttribute(`{{ ${emitScopedAskamaExpr(value.expr, scope)} }}`)}`;
    case "classList": {
      const parts: string[] = [];
      for (const item of value.items) {
        if (item.kind === "static") {
          parts.push(item.value);
          continue;
        }

        parts.push(`{% if ${emitScopedAskamaExpr(item.test, scope)} %}${item.value}{% endif %}`);
      }

      return `${normalizedName}=${wrapHtmlAttribute(parts.join(" ").trim())}`;
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
  scope: AskamaScope = {},
  options: TargetEmitOptions = {},
): string {
  const minify = options.minify ?? false;
  const pad = minify ? "" : "  ".repeat(indent);
  const joiner = minify ? "" : "\n";

  switch (node.kind) {
    case "fragment":
      return (node.children ?? [])
        .map((child) => emitAskama(child, indent, componentRegistry, scope, options))
        .join(joiner);
    case "doctype":
      return `${pad}${node.value}`;
    case "text":
      return `${pad}${node.value}`;
    case "slot":
      return `${pad}{{ ${scope[node.name] ?? toSnakeCase(node.name)}|safe }}`;
    case "print":
      return `${pad}{{ ${emitScopedAskamaExpr(node.expr, scope)}${node.safe ? "|safe" : ""} }}`;
    case "if": {
      const thenPart = node.then
        .map((child) => emitAskama(child, indent + 1, componentRegistry, scope, options))
        .join(joiner);
      const elsePart = (node.else ?? [])
        .map((child) => emitAskama(child, indent + 1, componentRegistry, scope, options))
        .join(joiner);
      if (elsePart) {
        return `${pad}{% if ${emitScopedAskamaExpr(node.test, scope)} %}${joiner}${thenPart}${joiner}${pad}{% else %}${joiner}${elsePart}${joiner}${pad}{% endif %}`;
      }
      return `${pad}{% if ${emitScopedAskamaExpr(node.test, scope)} %}${joiner}${thenPart}${joiner}${pad}{% endif %}`;
    }
    case "for": {
      const loopItemName = toSnakeCase(node.item);
      const childScope = node.indexName
        ? { ...scope, [node.item]: loopItemName, [node.indexName]: "loop.index0" }
        : { ...scope, [node.item]: loopItemName };
      const body = node.children
        .map((child) => emitAskama(child, indent + 1, componentRegistry, childScope, options))
        .join(joiner);
      return `${pad}{% for ${loopItemName} in ${emitScopedAskamaExpr(node.each, scope)} %}${joiner}${body}${joiner}${pad}{% endfor %}`;
    }
    case "element": {
      const attrEntries = Object.entries({
        ...(node.attrs ?? {}),
        ...(node.targetAttrs?.askama ?? {}),
      });
      const emittedAttrs = attrEntries
        .map(([name, value]) => emitAskamaAttr(name, value, scope))
        .filter((value) => value.length > 0);
      const attrs = emittedAttrs.length
        ? minify
          ? ` ${emittedAttrs.join(" ")}`
          : `\n${emittedAttrs.map((value) => `${pad}  ${value}`).join("\n")}\n${pad}`
        : "";
      const children = (node.children ?? []).map((child) =>
        emitAskama(child, indent + 1, componentRegistry, scope, options),
      );

      if (children.length === 0) {
        if (isVoidHtmlElement(node.tag)) {
          return `${pad}<${node.tag}${attrs}/>`;
        }
        return `${pad}<${node.tag}${attrs}></${node.tag}>`;
      }

      return `${pad}<${node.tag}${attrs}>${joiner}${children.join(joiner)}${joiner}${pad}</${node.tag}>`;
    }
    case "component": {
      const registration = componentRegistry[node.name];
      if (!registration) {
        throw new Error(`Missing Askama component registration for ${node.name}`);
      }

      const lines: string[] = [];
      for (const [propName, propValue] of Object.entries({
        ...(node.props ?? {}),
        ...(node.targetAttrs?.askama ?? {}),
      })) {
        const askamaPropName = toSnakeCase(propName);
        if (propValue.kind === "text") {
          lines.push(`${pad}{% set ${askamaPropName} = "${escapeDoubleQuotes(propValue.value)}" %}`);
          continue;
        }
        if (propValue.kind === "expr") {
          lines.push(`${pad}{% set ${askamaPropName} = ${emitScopedAskamaExpr(propValue.expr, scope)} %}`);
          continue;
        }
        throw new Error(
          `Component prop ${propName} on ${node.name} must be text or expr for Askama include output`,
        );
      }

      if ((node.children ?? []).length > 0) {
        lines.push(`${pad}{% set children %}`);
        lines.push(
          ...(node.children ?? []).map((child) =>
            emitAskama(child, indent + 1, componentRegistry, scope, options),
          ),
        );
        lines.push(`${pad}{% endset %}`);
      }

      lines.push(`${pad}{% include "${registration.include}" %}`);
      return lines.join(joiner);
    }
  }
}

function optionsAwareAskamaTemplatePath(template: BuildTemplate): string {
  const templatePrefix = template.askamaTemplatePrefix;

  if (templatePrefix) {
    return join(
      templatePrefix,
      dirname(template.relativePath),
      `${basename(template.relativePath).replace(/\.template\.tsx$/, "")}.html`,
    ).replaceAll("\\", "/");
  }

  return join(
    "includes",
    dirname(template.relativePath),
    `${template.fileName}.html`,
  );
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
    .map((prop) => `    pub ${toSnakeCase(prop.name)}: ${toRustType(prop.type)},`)
    .join("\n");
  const includePath = optionsAwareAskamaTemplatePath(template);

  return `use askama::Template;

#[derive(Template)]
#[template(
    ext = "html",
    path = "${includePath}"
)]
pub struct ${structName}${lifetime} {
${fields}
}
`;
}

export function emitAskamaPartial(
  template: BuildTemplate,
  options: TargetEmitOptions = {},
): string {
  return `${emitAskama(template.template, 0, template.componentRegistry ?? {}, createAskamaRootScope(template), options)}\n`;
}
