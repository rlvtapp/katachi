import type { AttrValue, Expr, Node } from "../core/ast.js";
import type { BuildTemplate, TargetEmitOptions } from "../core/types.js";
import {
  isBooleanHtmlAttribute,
  isVoidHtmlElement,
  normalizeHtmlAttributeName,
} from "./html.js";
import { escapeDoubleQuotes, wrapHtmlAttribute } from "./shared.js";

type LiquidScope = {
  bindings: Record<string, string>;
  safeSlots: Set<string>;
};

function createEmptyLiquidScope(): LiquidScope {
  return {
    bindings: {},
    safeSlots: new Set(),
  };
}

function createLiquidRootScope(template: BuildTemplate): LiquidScope {
  return {
    bindings: Object.fromEntries((template.props ?? []).map((prop) => [prop.name, prop.name])),
    safeSlots: new Set(
      (template.props ?? [])
        .filter((prop) => prop.type.includes("template-node") || prop.type === "children")
        .map((prop) => prop.name),
    ),
  };
}

function translateTemplateLiteralToLiquid(source: string): string {
  const match = source.match(/^`([\s\S]*)`(?:\.replace\((.+)\))?$/);
  if (!match) {
    return source;
  }

  const [, templateBody, replaceArgs] = match;
  const segments = templateBody.split(/(\$\{[^}]+\})/g).filter(Boolean);
  const pieces = segments.map((segment) => {
    if (segment.startsWith("${") && segment.endsWith("}")) {
      return { kind: "expr" as const, value: segment.slice(2, -1).trim() };
    }

    return { kind: "text" as const, value: segment };
  });

  const [first, ...rest] = pieces;
  let result = first?.kind === "text"
    ? JSON.stringify(first.value)
    : first
      ? `"" | append: ${first.value}`
      : `""`;

  for (const piece of rest) {
    if (piece.kind === "text") {
      if (piece.value.length === 0) {
        continue;
      }
      result = `${result} | append: ${JSON.stringify(piece.value)}`;
      continue;
    }

    result = `${result} | append: ${piece.value}`;
  }

  if (replaceArgs) {
    const args = replaceArgs.split(",").map((part) => part.trim()).filter(Boolean);
    if (args.length >= 2) {
      result = `${result} | replace: ${args[0]}, ${args[1]}`;
    }
  }

  return result;
}

function translateNullishCoalescingToLiquid(source: string): string {
  return source.replace(
    /\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*\?\?\s*(".*?"|'.*?'|\[\])/g,
    (_match, left: string, right: string) => {
      const fallback = right === "[]" ? "empty" : right;
      return `${left} | default: ${fallback}`;
    },
  );
}

function escapeLiquidLiteral(value: string): string {
  if (value.includes("{%") || value.includes("{{")) {
    return `{% raw %}${value}{% endraw %}`;
  }

  return value;
}

function wrapLiquidOutput(expr: string, safe = false): string {
  return safe ? `{{ ${expr} }}` : `{{ ${expr} | escape }}`;
}

function emitLiquidExpr(expr: Expr): string {
  switch (expr.kind) {
    case "var":
      return expr.name;
    case "string":
      return `"${escapeDoubleQuotes(expr.value)}"`;
    case "bool":
      return expr.value ? "true" : "false";
    case "number":
      return String(expr.value);
    case "intrinsic": {
      const [arg] = expr.args;
      const emittedArg = arg ? emitLiquidExpr(arg) : "";
      switch (expr.name) {
        case "len":
          return `${emittedArg}.size`;
        case "isEmpty":
          return `${emittedArg} == empty`;
        case "isSome":
          return `${emittedArg} != nil`;
        case "isNone":
          return `${emittedArg} == nil`;
      }
    }
    case "raw":
      return translateNullishCoalescingToLiquid(
        translateTemplateLiteralToLiquid(
          expr.source
            .replace(/\?\./g, ".")
            .replace(/([A-Za-z0-9_.)\]]+)\.clone\(\)\.unwrap\(\)/g, "$1")
            .replace(/([A-Za-z0-9_.)\]]+)\.unwrap\(\)/g, "$1")
            .replace(/([A-Za-z0-9_.)\]]+)\.is_some\(\)/g, "$1 != nil")
            .replace(/([A-Za-z0-9_.)\]]+)\.is_none\(\)/g, "$1 == nil")
            .replace(/!\s*([A-Za-z0-9_.)\]]+)\.is_empty\(\)/g, "$1 != empty")
            .replace(/([A-Za-z0-9_.)\]]+)\.is_empty\(\)/g, "$1 == empty")
            .replace(/([A-Za-z0-9_.)\]]+)\.len\(\)/g, "$1.size"),
        ),
      )
        .replace(/\bnull\b/g, "nil")
        .replace(/\s===\s/g, " == ")
        .replace(/\s!==\s/g, " != ")
        .replace(/\s==\s/g, " == ")
        .replace(/\s!=\s/g, " != ")
        .replace(/\s&&\s/g, " and ")
        .replace(/\s\|\|\s/g, " or ");
    case "eq":
      return `${emitLiquidExpr(expr.left)} == ${emitLiquidExpr(expr.right)}`;
    case "neq":
      return `${emitLiquidExpr(expr.left)} != ${emitLiquidExpr(expr.right)}`;
    case "and":
      return `${emitLiquidExpr(expr.left)} and ${emitLiquidExpr(expr.right)}`;
    case "or":
      return `${emitLiquidExpr(expr.left)} or ${emitLiquidExpr(expr.right)}`;
    case "not":
      return `not ${emitLiquidExpr(expr.expr)}`;
  }
}

function emitScopedLiquidExpr(expr: Expr, scope: LiquidScope): string {
  const base = emitLiquidExpr(expr);

  return Object.entries(scope.bindings).reduce((current, [name, replacement]) => {
    const pattern = new RegExp(`\\b${name}\\b`, "g");
    return current.replace(pattern, replacement);
  }, base);
}

function emitLiquidAttr(name: string, value: AttrValue, scope: LiquidScope): string {
  const normalizedName = normalizeHtmlAttributeName(name);
  const booleanAttribute = isBooleanHtmlAttribute(normalizedName);

  switch (value.kind) {
    case "text":
      if (booleanAttribute) {
        return value.value === "false" ? "" : normalizedName;
      }
      return `${normalizedName}=${wrapHtmlAttribute(escapeLiquidLiteral(value.value))}`;
    case "expr":
      if (booleanAttribute) {
        return `{% if ${emitScopedLiquidExpr(value.expr, scope)} %}${normalizedName}{% endif %}`;
      }
      return `${normalizedName}=${wrapHtmlAttribute(
        wrapLiquidOutput(emitScopedLiquidExpr(value.expr, scope)),
      )}`;
    case "classList": {
      const parts: string[] = [];
      for (const item of value.items) {
        if (item.kind === "static") {
          parts.push(item.value);
          continue;
        }

        parts.push(`{% if ${emitScopedLiquidExpr(item.test, scope)} %}${item.value}{% endif %}`);
      }
      return `${normalizedName}=${wrapHtmlAttribute(parts.join(" ").trim())}`;
    }
  }
}

function emitLiquidRenderArgValue(propName: string, value: AttrValue, scope: LiquidScope): {
  setup: string[];
  arg: string;
} {
  switch (value.kind) {
    case "text":
      return { setup: [], arg: `${propName}: "${escapeDoubleQuotes(value.value)}"` };
    case "expr":
      return { setup: [], arg: `${propName}: ${emitScopedLiquidExpr(value.expr, scope)}` };
    case "classList": {
      const variableName = `__${propName}`;
      const parts: string[] = [];
      for (const item of value.items) {
        if (item.kind === "static") {
          parts.push(item.value);
          continue;
        }

        parts.push(`{% if ${emitScopedLiquidExpr(item.test, scope)} %}${item.value}{% endif %}`);
      }

      return {
        setup: [`{% capture ${variableName} %}${parts.join(" ").trim()}{% endcapture %}`],
        arg: `${propName}: ${variableName}`,
      };
    }
  }
}

export function emitLiquid(
  node: Node,
  indent = 0,
  componentRegistry: BuildTemplate["componentRegistry"] = {},
  scope: LiquidScope = createEmptyLiquidScope(),
  options: TargetEmitOptions = {},
): string {
  const minify = options.minify ?? false;
  const pad = minify ? "" : "  ".repeat(indent);
  const joiner = minify ? "" : "\n";

  switch (node.kind) {
    case "fragment":
      return (node.children ?? [])
        .map((child) => emitLiquid(child, indent, componentRegistry, scope, options))
        .join(joiner);
    case "doctype":
      return `${pad}${node.value}`;
    case "text":
      return `${pad}${node.value}`;
    case "slot":
      return `${pad}${wrapLiquidOutput(
        scope.bindings[node.name] ?? node.name,
        node.name === "children" || scope.safeSlots.has(node.name),
      )}`;
    case "print":
      return `${pad}${wrapLiquidOutput(
        emitScopedLiquidExpr(node.expr, scope),
        node.safe || (node.expr.kind === "var" && node.expr.name === "children"),
      )}`;
    case "if": {
      const thenPart = node.then
        .map((child) => emitLiquid(child, indent + 1, componentRegistry, scope, options))
        .join(joiner);
      const elsePart = (node.else ?? [])
        .map((child) => emitLiquid(child, indent + 1, componentRegistry, scope, options))
        .join(joiner);
      if (elsePart) {
        return `${pad}{% if ${emitScopedLiquidExpr(node.test, scope)} %}${joiner}${thenPart}${joiner}${pad}{% else %}${joiner}${elsePart}${joiner}${pad}{% endif %}`;
      }
      return `${pad}{% if ${emitScopedLiquidExpr(node.test, scope)} %}${joiner}${thenPart}${joiner}${pad}{% endif %}`;
    }
    case "for": {
      const indexName = node.indexName ?? "__index";
      const childScope = {
        bindings: {
          ...scope.bindings,
          [node.item]: node.item,
          [indexName]: "forloop.index0",
        },
        safeSlots: new Set(scope.safeSlots),
      };
      const body = node.children
        .map((child) => emitLiquid(child, indent + 1, componentRegistry, childScope, options))
        .join(joiner);
      return `${pad}{% for ${node.item} in ${emitScopedLiquidExpr(node.each, scope)} %}${joiner}${body}${joiner}${pad}{% endfor %}`;
    }
    case "element": {
      const attrEntries = Object.entries({
        ...(node.attrs ?? {}),
        ...(node.targetAttrs?.liquid ?? {}),
      })
        .map(([name, value]) => emitLiquidAttr(name, value, scope))
        .filter((value) => value.length > 0);
      const attrs = attrEntries.length
        ? minify
          ? ` ${attrEntries.join(" ")}`
          : `\n${attrEntries.map((value) => `${pad}  ${value}`).join("\n")}\n${pad}`
        : "";
      const children = (node.children ?? []).map((child) =>
        emitLiquid(child, indent + 1, componentRegistry, scope, options),
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
        throw new Error(`Missing Liquid component registration for ${node.name}`);
      }

      const setupLines: string[] = [];
      const args: string[] = [];

      for (const [propName, propValue] of Object.entries({
        ...(node.props ?? {}),
        ...(node.targetAttrs?.liquid ?? {}),
      })) {
        const emitted = emitLiquidRenderArgValue(propName, propValue, scope);
        setupLines.push(...emitted.setup.map((line) => `${pad}${line}`));
        args.push(emitted.arg);
      }

      if ((node.children ?? []).length > 0) {
        setupLines.push(`${pad}{% capture children %}`);
        setupLines.push(
          ...(node.children ?? []).map((child) =>
            emitLiquid(child, indent + 1, componentRegistry, scope, options),
          ),
        );
        setupLines.push(`${pad}{% endcapture %}`);
        args.push("children: children");
      }

      const renderArgs = args.length > 0 ? `, ${args.join(", ")}` : "";
      setupLines.push(`${pad}{% render '${registration.liquidSnippet}'${renderArgs} %}`);
      return setupLines.join(joiner);
    }
  }
}

export function emitLiquidTemplate(
  template: BuildTemplate,
  options: TargetEmitOptions = {},
): string {
  return emitLiquid(
    template.template,
    0,
    template.componentRegistry ?? {},
    createLiquidRootScope(template),
    options,
  );
}
