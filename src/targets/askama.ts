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
  emitInterpolatedTagName,
  escapeDoubleQuotes,
  toSnakeCase,
  toRustType,
  wrapHtmlAttribute,
} from "./shared.js";

interface AskamaBinding {
  rustName: string;
  optionalStringLike?: boolean;
}

type AskamaScope = Record<string, AskamaBinding>;

function isOptionalStringLikeProp(prop: BuildTemplate["props"][number]): boolean {
  return prop.optional && (
    prop.type === "string" ||
    prop.type === "children" ||
    prop.type === "template-node"
  );
}

function createAskamaRootScope(template: BuildTemplate): AskamaScope {
  return Object.fromEntries(
    (template.props ?? []).map((prop) => [
      prop.name,
      {
        rustName: toSnakeCase(prop.name),
        optionalStringLike: isOptionalStringLikeProp(prop),
      },
    ]),
  );
}

function emitScopedAskamaExpr(expr: Expr, scope: AskamaScope): string {
  const base = emitAskamaExpr(expr);

  return Object.entries(scope).reduce((current, [name, binding]) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${escapedName})(?=$|[^A-Za-z0-9_])`, "g");
    const replaced = current.replace(
      pattern,
      (_match, prefix: string) => `${prefix}${binding.rustName}`,
    );

    if (!binding.optionalStringLike) {
      return replaced;
    }

    return replaced
      .replace(
        new RegExp(`\\b${binding.rustName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.is_some\\(\\)`, "g"),
        `!(${binding.rustName}.is_empty())`,
      )
      .replace(
        new RegExp(`\\b${binding.rustName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.is_none\\(\\)`, "g"),
        `${binding.rustName}.is_empty()`,
      );
  }, base);
}

function emitScopedAskamaCondition(expr: Expr, scope: AskamaScope): string {
  if (expr.kind === "var") {
    const binding = scope[expr.name];
    if (binding?.optionalStringLike) {
      return `!(${binding.rustName}.is_empty())`;
    }
  }

  return emitScopedAskamaExpr(expr, scope);
}

function emitAskamaComponentPropExpr(expr: Expr, scope: AskamaScope): string {
  if (expr.kind === "var") {
    const binding = scope[expr.name];
    if (binding?.optionalStringLike) {
      return `${binding.rustName}.value.as_str()`;
    }
  }

  if (expr.kind === "raw") {
    const normalized = expr.source.trim();
    const directBinding = scope[normalized];
    if (directBinding?.optionalStringLike) {
      return `${directBinding.rustName}.value.as_str()`;
    }

    const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\?\?\s*(['"])\2$/);
    if (match) {
      const binding = scope[match[1] ?? ""];
      if (binding?.optionalStringLike) {
        return `${binding.rustName}.value.as_str()`;
      }
    }
  }

  return emitScopedAskamaExpr(expr, scope);
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
        return `{% if ${emitScopedAskamaCondition(value.expr, scope)} %}${normalizedName}{% endif %}`;
      }
      return `${normalizedName}=${wrapHtmlAttribute(`{{ ${emitScopedAskamaExpr(value.expr, scope)} }}`)}`;
    case "classList": {
      const parts: string[] = [];
      for (const item of value.items) {
        if (item.kind === "static") {
          parts.push(item.value);
          continue;
        }
        if (item.kind === "dynamic") {
          parts.push(`{{ ${emitScopedAskamaExpr(item.expr, scope)} }}`);
          continue;
        }

        parts.push(`{% if ${emitScopedAskamaCondition(item.test, scope)} %}${item.value}{% endif %}`);
      }

      return `${normalizedName}=${wrapHtmlAttribute(parts.join(" ").trim())}`;
    }
    case "concat": {
      const segments = value.parts.map((part) => {
        if (part.kind === "string") {
          return part.value;
        }
        return `{{ ${emitScopedAskamaExpr(part, scope)} }}`;
      });
      return `${normalizedName}=${wrapHtmlAttribute(segments.join(""))}`;
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
    case "slot": {
      const binding = scope[node.name];
      return `${pad}{{ ${(binding?.rustName ?? toSnakeCase(node.name))}|safe }}`;
    }
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
        return `${pad}{% if ${emitScopedAskamaCondition(node.test, scope)} %}${joiner}${thenPart}${joiner}${pad}{% else %}${joiner}${elsePart}${joiner}${pad}{% endif %}`;
      }
      return `${pad}{% if ${emitScopedAskamaCondition(node.test, scope)} %}${joiner}${thenPart}${joiner}${pad}{% endif %}`;
    }
    case "for": {
      const loopItemName = toSnakeCase(node.item);
      const childScope = {
        ...scope,
        [node.item]: { rustName: loopItemName },
        [node.indexName ?? "__index"]: { rustName: "loop.index0" },
      };
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

      const tagName = emitInterpolatedTagName(node.tag, (expr) => emitScopedAskamaExpr(expr, scope));

      if (children.length === 0) {
        if (node.tag.kind === "static" && isVoidHtmlElement(node.tag.name)) {
          return `${pad}<${tagName}${attrs}/>`;
        }
        return `${pad}<${tagName}${attrs}></${tagName}>`;
      }

      return `${pad}<${tagName}${attrs}>${joiner}${children.join(joiner)}${joiner}${pad}</${tagName}>`;
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
          lines.push(`${pad}{% set ${askamaPropName} = ${emitAskamaComponentPropExpr(propValue.expr, scope)} %}`);
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
