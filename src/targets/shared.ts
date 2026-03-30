import type { AttrValue, Expr, Node, TargetAttrs } from "../core/ast.js";
import type { BuildTemplate } from "../core/types.js";

/**
 * Escapes a string for insertion into Rust string literals used by Askama wrappers.
 */
function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Chooses a stable quote style for generated HTML attributes so mixed template
 * syntax stays readable and editor highlighting does not break.
 */
function wrapHtmlAttribute(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `'${value.replace(/'/g, "&#39;")}'`;
}

/**
 * Best-effort translation of Rust-ish template expressions into TSX-friendly syntax.
 *
 * This exists to support incremental Askama migrations. It is not the ideal
 * final authoring model, but it keeps existing ports workable.
 */
function translateRustExprToTsx(source: string): string {
  let result = source.trim();

  result = result.replace(/([A-Za-z0-9_().]+)\.clone\(\)\.unwrap\(\)/g, "$1");
  result = result.replace(/([A-Za-z0-9_().]+)\.unwrap\(\)/g, "$1");
  result = result.replace(/([A-Za-z0-9_().]+)\.is_some\(\)/g, "($1 != null)");
  result = result.replace(/([A-Za-z0-9_().]+)\.is_none\(\)/g, "($1 == null)");
  result = result.replace(/!\s*([A-Za-z0-9_().]+)\.is_empty\(\)/g, "($1.length > 0)");
  result = result.replace(/([A-Za-z0-9_().]+)\.is_empty\(\)/g, "($1.length === 0)");
  result = result.replace(/([A-Za-z0-9_().]+)\.len\(\)/g, "$1.length");
  result = result.replace(/\s===\s/g, " === ");
  result = result.replace(/\s!==\s/g, " !== ");
  result = result.replace(/\s==\s/g, " === ");
  result = result.replace(/\s!=\s/g, " !== ");

  return result;
}

/**
 * Rewrites JS/TS equality operators into Askama-compatible syntax.
 */
function translateTsxExprToAskama(source: string): string {
  return source
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*!==\s*null\b/g, "$1.is_some()")
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*!=\s*null\b/g, "$1.is_some()")
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*===\s*null\b/g, "$1.is_none()")
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*==\s*null\b/g, "$1.is_none()")
    .replace(/\s===\s/g, " == ")
    .replace(/\s!==\s/g, " != ");
}

/**
 * Emits a portable expression into TSX/React-family output.
 */
export function emitTsxExpr(expr: Expr): string {
  switch (expr.kind) {
    case "var":
      return expr.name;
    case "string":
      return JSON.stringify(expr.value);
    case "bool":
      return expr.value ? "true" : "false";
    case "number":
      return String(expr.value);
    case "intrinsic": {
      const [arg] = expr.args;
      const emittedArg = arg ? emitTsxExpr(arg) : "undefined";
      switch (expr.name) {
        case "len":
          return `(${emittedArg}?.length ?? 0)`;
        case "isEmpty":
          return `((${emittedArg}?.length ?? 0) === 0)`;
        case "isSome":
          return `(${emittedArg} != null)`;
        case "isNone":
          return `(${emittedArg} == null)`;
      }
    }
    case "raw":
      return translateRustExprToTsx(expr.source);
    case "eq":
      return `(${emitTsxExpr(expr.left)} === ${emitTsxExpr(expr.right)})`;
    case "neq":
      return `(${emitTsxExpr(expr.left)} !== ${emitTsxExpr(expr.right)})`;
    case "and":
      return `(${emitTsxExpr(expr.left)} && ${emitTsxExpr(expr.right)})`;
    case "or":
      return `(${emitTsxExpr(expr.left)} || ${emitTsxExpr(expr.right)})`;
    case "not":
      return `!(${emitTsxExpr(expr.expr)})`;
  }
}

/**
 * Emits a portable expression into Askama syntax.
 */
export function emitAskamaExpr(expr: Expr): string {
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
      const emittedArg = arg ? emitAskamaExpr(arg) : "";
      switch (expr.name) {
        case "len":
          return `${emittedArg}.len()`;
        case "isEmpty":
          return `${emittedArg}.is_empty()`;
        case "isSome":
          return `${emittedArg}.is_some()`;
        case "isNone":
          return `${emittedArg}.is_none()`;
      }
    }
    case "raw":
      return translateTsxExprToAskama(expr.source);
    case "eq":
      return `${emitAskamaExpr(expr.left)} == ${emitAskamaExpr(expr.right)}`;
    case "neq":
      return `${emitAskamaExpr(expr.left)} != ${emitAskamaExpr(expr.right)}`;
    case "and":
      return `${emitAskamaExpr(expr.left)} && ${emitAskamaExpr(expr.right)}`;
    case "or":
      return `${emitAskamaExpr(expr.left)} || ${emitAskamaExpr(expr.right)}`;
    case "not":
      return `!(${emitAskamaExpr(expr.expr)})`;
  }
}

export type TsxAttrEmitter = (name: string, value: AttrValue) => string | null;

function mergeTargetScopedAttrs(
  attrs: Record<string, AttrValue> | undefined,
  targetAttrs: TargetAttrs | undefined,
  target: string,
): Record<string, AttrValue> {
  return {
    ...(attrs ?? {}),
    ...(targetAttrs?.[target] ?? {}),
  };
}

/**
 * Shared JSX/TSX tree emitter used by both React and static JSX targets.
 */
export function emitTsxNode(
  node: Node,
  emitAttr: TsxAttrEmitter,
  indent = 0,
  targetName = "tsx",
): string {
  const pad = "  ".repeat(indent);

  switch (node.kind) {
    case "fragment": {
      const children = (node.children ?? []).map((child) =>
        emitTsxNode(child, emitAttr, indent + 1, targetName),
      );

      if (children.length === 0) {
        return `${pad}<></>`;
      }

      return `${pad}<>\n${children.join("\n")}\n${pad}</>`;
    }
    case "doctype":
      return `${pad}{${JSON.stringify(node.value)}}`;
    case "text":
      return `${pad}${node.value}`;
    case "slot":
      return `${pad}{${node.name}}`;
    case "print":
      return `${pad}{${emitTsxExpr(node.expr)}}`;
    case "if": {
      const thenPart = node.then
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, targetName))
        .join("\n");
      const elsePart = (node.else ?? [])
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, targetName))
        .join("\n");
      if (elsePart) {
        return `${pad}{${emitTsxExpr(node.test)} ? (\n${pad}  <>\n${thenPart}\n${pad}  </>\n${pad}) : (\n${pad}  <>\n${elsePart}\n${pad}  </>\n${pad})}`;
      }
      return `${pad}{${emitTsxExpr(node.test)} && (\n${pad}  <>\n${thenPart}\n${pad}  </>\n${pad})}`;
    }
    case "for": {
      const eachExpr = emitTsxExpr(node.each);
      const iteratorArgs = node.indexName
        ? `${node.item}, ${node.indexName}`
        : `${node.item}, __index`;
      if (
        node.children.length === 1 &&
        (node.children[0].kind === "element" ||
          node.children[0].kind === "component" ||
          node.children[0].kind === "fragment")
      ) {
        const onlyChild = emitTsxNode(node.children[0], emitAttr, indent + 1, targetName);
        const keyName = node.indexName ?? "__index";
        return `${pad}{(${eachExpr} ?? []).map((${iteratorArgs}) => (\n${pad}  <Fragment key={${keyName}}>\n${onlyChild}\n${pad}  </Fragment>\n${pad}))}`;
      }
      const body = node.children
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, targetName))
        .join("\n");
      const keyName = node.indexName ?? "__index";
      return `${pad}{(${eachExpr} ?? []).map((${iteratorArgs}) => (\n${pad}  <Fragment key={${keyName}}>\n${body}\n${pad}  </Fragment>\n${pad}))}`;
    }
    case "element": {
      const attrEntries = Object.entries(
        mergeTargetScopedAttrs(node.attrs, node.targetAttrs, targetName),
      )
        .map(([name, value]) => emitAttr(name, value))
        .filter((entry): entry is string => entry != null);
      const multilineOpen = `${pad}<${node.tag}\n${attrEntries
        .map((entry) => `${pad}  ${entry}`)
        .join("\n")}\n${pad}>`;
      const children = (node.children ?? []).map((child) =>
        emitTsxNode(child, emitAttr, indent + 1, targetName),
      );

      if (children.length === 0) {
        if (attrEntries.length === 0) {
          return `${pad}<${node.tag} />`;
        }
        return `${pad}<${node.tag}\n${attrEntries
          .map((entry) => `${pad}  ${entry}`)
          .join("\n")}\n${pad}/>`;
      }

      if (attrEntries.length === 0) {
        return `${pad}<${node.tag}>\n${children.join("\n")}\n${pad}</${node.tag}>`;
      }

      return `${multilineOpen}\n${children.join("\n")}\n${pad}</${node.tag}>`;
    }
    case "component": {
      const propEntries = Object.entries(
        mergeTargetScopedAttrs(node.props, node.targetAttrs, targetName),
      )
        .map(([name, value]) => emitAttr(name, value))
        .filter((entry): entry is string => entry != null);
      const multilineOpen = `${pad}<${node.name}\n${propEntries
        .map((entry) => `${pad}  ${entry}`)
        .join("\n")}\n${pad}>`;
      const children = (node.children ?? []).map((child) =>
        emitTsxNode(child, emitAttr, indent + 1, targetName),
      );

      if (children.length === 0) {
        if (propEntries.length === 0) {
          return `${pad}<${node.name} />`;
        }
        return `${pad}<${node.name}\n${propEntries
          .map((entry) => `${pad}  ${entry}`)
          .join("\n")}\n${pad}/>`;
      }

      if (propEntries.length === 0) {
        return `${pad}<${node.name}>\n${children.join("\n")}\n${pad}</${node.name}>`;
      }

      return `${multilineOpen}\n${children.join("\n")}\n${pad}</${node.name}>`;
    }
  }
}

function toPascalCase(value: string): string {
  return value
    .replace(/(^|[-_ ]+)([a-zA-Z0-9])/g, (_match, _sep: string, char: string) =>
      char.toUpperCase(),
    )
    .replace(/[^a-zA-Z0-9]/g, "");
}

export function toCamelCase(value: string): string {
  const pascal = toPascalCase(value);
  return pascal.length === 0 ? pascal : pascal[0].toLowerCase() + pascal.slice(1);
}

export function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function toRustType(type: string): string {
  switch (type) {
    case "string":
      return "&'a str";
    case "bool":
      return "bool";
    case "number":
      return "i64";
    case "children":
      return "&'a str";
    case "template-node":
      return "&'a str";
    case "string[]":
      return "&'a [&'a str]";
    case "template-node[]":
      return "&'a [&'a str]";
    case "string[][]":
      return "&'a [&'a [&'a str]]";
    case "template-node[][]":
      return "&'a [&'a [&'a str]]";
    default:
      return "&'a str";
  }
}

export function toTsType(type: string): string {
  switch (type) {
    case "string":
      return "string";
    case "bool":
      return "boolean";
    case "number":
      return "number";
    case "children":
      return "ReactNode";
    case "template-node":
      return "ReactNode";
    case "template-node[]":
      return "ReactNode[]";
    case "template-node[][]":
      return "ReactNode[][]";
    default:
      return type;
  }
}

/**
 * Builds import lines for nested template components in TSX-family targets.
 */
export function buildTsxImportLines(template: BuildTemplate): string {
  return (template.imports ?? [])
    .map((entry) =>
      template.componentRegistry?.[entry.localName]?.reactImport
        ? `import ${entry.localName} from "${template.componentRegistry[entry.localName].reactImport}";`
        : null,
    )
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/**
 * Wraps an emitted TSX template body in a component module.
 */
export function buildTsxComponentSource(template: BuildTemplate, body: string): string {
  const props = template.props ?? [];
  const propsTypeName = `${template.name}Props`;
  const propLines = props.map(
    (prop) => `  ${prop.name}${prop.optional ? "?" : ""}: ${toTsType(prop.type)};`,
  );
  const destructuredProps = props.map((prop) => prop.name).join(", ");
  const componentImports = buildTsxImportLines(template);

  return `import { Fragment, type ReactNode } from "react";
${componentImports ? `${componentImports}\n` : ""}

export type ${propsTypeName} = {
${propLines.join("\n")}
};

export default function ${template.name}({ ${destructuredProps} }: ${propsTypeName}) {
  return (
${body}
  );
}
`;
}

export { escapeDoubleQuotes, wrapHtmlAttribute };
