import type { AttrValue, Expr, Node, TagName } from "../core/ast.js";
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
  return source.replace(/\s===\s/g, " == ").replace(/\s!==\s/g, " != ");
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
        default:
          return emittedArg;
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
        default:
          return emittedArg;
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

function emitTagInterpolationPart(
  expr: Expr,
  emitExpr: (expr: Expr) => string,
): string {
  return expr.kind === "string" ? expr.value : `{{ ${emitExpr(expr)} }}`;
}

export function emitInterpolatedTagName(
  tag: TagName,
  emitExpr: (expr: Expr) => string,
): string {
  if (tag.kind === "static") {
    return tag.name;
  }

  return tag.parts.map((part) => emitTagInterpolationPart(part, emitExpr)).join("");
}

export function emitTsxTagExpr(tag: TagName): string {
  if (tag.kind === "static") {
    return JSON.stringify(tag.name);
  }

  if (tag.parts.length === 1 && tag.parts[0]?.kind !== "string") {
    return emitTsxExpr(tag.parts[0]);
  }

  const segments = tag.parts.map((part) => {
    if (part.kind === "string") {
      return part.value.replace(/[`\\$]/g, "\\$&");
    }
    return `\${${emitTsxExpr(part)}}`;
  });

  return `\`${segments.join("")}\``;
}

interface TsxEmitContext {
  hoistedTagNames: WeakMap<Extract<Node, { kind: "element" }>, string>;
}

function exprUsesBoundName(expr: Expr, boundNames: Set<string>): boolean {
  switch (expr.kind) {
    case "var":
      return boundNames.has(expr.name);
    case "string":
    case "bool":
    case "number":
      return false;
    case "intrinsic":
      return expr.args.some((arg) => exprUsesBoundName(arg, boundNames));
    case "raw":
      return Array.from(boundNames).some((name) =>
        new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(expr.source),
      );
    case "eq":
    case "neq":
    case "and":
    case "or":
      return (
        exprUsesBoundName(expr.left, boundNames) || exprUsesBoundName(expr.right, boundNames)
      );
    case "not":
      return exprUsesBoundName(expr.expr, boundNames);
  }
}

function tagUsesBoundName(tag: TagName, boundNames: Set<string>): boolean {
  if (tag.kind === "static") {
    return false;
  }

  return tag.parts.some((part) => exprUsesBoundName(part, boundNames));
}

function collectHoistedDynamicTags(
  node: Node,
  hoists: string[],
  hoistedTagNames: WeakMap<Extract<Node, { kind: "element" }>, string>,
  boundNames: Set<string> = new Set(),
  nextId: { value: number } = { value: 0 },
): void {
  switch (node.kind) {
    case "if":
      node.then.forEach((child) => collectHoistedDynamicTags(child, hoists, hoistedTagNames, boundNames, nextId));
      (node.else ?? []).forEach((child) =>
        collectHoistedDynamicTags(child, hoists, hoistedTagNames, boundNames, nextId),
      );
      return;
    case "for": {
      const loopBoundNames = new Set(boundNames);
      loopBoundNames.add(node.item);
      if (node.indexName) {
        loopBoundNames.add(node.indexName);
      }
      node.children.forEach((child) =>
        collectHoistedDynamicTags(child, hoists, hoistedTagNames, loopBoundNames, nextId),
      );
      return;
    }
    case "element":
      if (node.tag.kind === "dynamic" && !tagUsesBoundName(node.tag, boundNames)) {
        nextId.value += 1;
        const tagName = nextId.value === 1 ? "Tag" : `Tag${nextId.value}`;
        hoistedTagNames.set(node, tagName);
        hoists.push(`  const ${tagName} = ${emitTsxTagExpr(node.tag)} as ElementType;`);
      }
      (node.children ?? []).forEach((child) =>
        collectHoistedDynamicTags(child, hoists, hoistedTagNames, boundNames, nextId),
      );
      return;
    case "component":
      (node.children ?? []).forEach((child) =>
        collectHoistedDynamicTags(child, hoists, hoistedTagNames, boundNames, nextId),
      );
      return;
    default:
      return;
  }
}

function buildTsxEmitContext(template: BuildTemplate): { context: TsxEmitContext; hoists: string[] } {
  const hoists: string[] = [];
  const context: TsxEmitContext = {
    hoistedTagNames: new WeakMap(),
  };
  collectHoistedDynamicTags(template.template, hoists, context.hoistedTagNames);
  return { context, hoists };
}

function emitDynamicTsxElement(
  tagExpr: string,
  tagComponentName: string,
  attrs: Record<string, AttrValue>,
  children: Node[],
  emitAttr: TsxAttrEmitter,
  indent: number,
  emitNode: (node: Node, emitAttr: TsxAttrEmitter, indent: number, context?: TsxEmitContext) => string,
  context?: TsxEmitContext,
): string {
  const pad = "  ".repeat(indent);
  const attrEntries = Object.entries(attrs);
  const attrBlock = attrEntries.length > 0
    ? `\n${attrEntries
        .map(([name, value]) => `${pad}      ${emitAttr(name, value)}`)
        .join("\n")}\n${pad}    `
    : "";

  if (children.length === 0) {
    return `${pad}{(() => {\n${pad}  const ${tagComponentName} = ${tagExpr};\n${pad}  return <${tagComponentName}${attrBlock} />;\n${pad}})()}`;
  }

  const childBlock = children.map((child) => emitNode(child, emitAttr, indent + 3, context)).join("\n");
  return `${pad}{(() => {\n${pad}  const ${tagComponentName} = ${tagExpr};\n${pad}  return (\n${pad}    <${tagComponentName}${attrBlock}>\n${childBlock}\n${pad}    </${tagComponentName}>\n${pad}  );\n${pad}})()}`;
}

export type TsxAttrEmitter = (name: string, value: AttrValue) => string;

/**
 * Shared JSX/TSX tree emitter used by both React and static JSX targets.
 */
export function emitTsxNode(
  node: Node,
  emitAttr: TsxAttrEmitter,
  indent = 0,
  context?: TsxEmitContext,
): string {
  const pad = "  ".repeat(indent);

  switch (node.kind) {
    case "text":
      return `${pad}${node.value}`;
    case "slot":
      return `${pad}{${node.name}}`;
    case "print":
      return `${pad}{${emitTsxExpr(node.expr)}}`;
    case "if": {
      const thenPart = node.then
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, context))
        .join("\n");
      const elsePart = (node.else ?? [])
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, context))
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
      const body = node.children
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, context))
        .join("\n");
      return `${pad}{(${eachExpr} ?? []).map((${iteratorArgs}) => (\n${pad}  <>\n${body}\n${pad}  </>\n${pad}))}`;
    }
    case "element": {
      if (node.tag.kind === "dynamic") {
        const hoistedTagName = context?.hoistedTagNames.get(node);
        if (hoistedTagName) {
          const attrEntries = Object.entries(node.attrs ?? {});
          const multilineOpen = `${pad}<${hoistedTagName}\n${attrEntries
            .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
            .join("\n")}\n${pad}>`;
          const children = (node.children ?? []).map((child) =>
            emitTsxNode(child, emitAttr, indent + 1, context),
          );

          if (children.length === 0) {
            if (attrEntries.length === 0) {
              return `${pad}<${hoistedTagName} />`;
            }
            return `${pad}<${hoistedTagName}\n${attrEntries
              .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
              .join("\n")}\n${pad}/>`;
          }

          if (attrEntries.length === 0) {
            return `${pad}<${hoistedTagName}>\n${children.join("\n")}\n${pad}</${hoistedTagName}>`;
          }

          return `${multilineOpen}\n${children.join("\n")}\n${pad}</${hoistedTagName}>`;
        }

        return emitDynamicTsxElement(
          emitTsxTagExpr(node.tag),
          "KatachiTag",
          node.attrs ?? {},
          node.children ?? [],
          emitAttr,
          indent,
          emitTsxNode,
          context,
        );
      }

      const attrEntries = Object.entries(node.attrs ?? {});
      const multilineOpen = `${pad}<${node.tag.name}\n${attrEntries
        .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
        .join("\n")}\n${pad}>`;
      const children = (node.children ?? []).map((child) =>
        emitTsxNode(child, emitAttr, indent + 1, context),
      );

      if (children.length === 0) {
        if (attrEntries.length === 0) {
          return `${pad}<${node.tag.name} />`;
        }
        return `${pad}<${node.tag.name}\n${attrEntries
          .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
          .join("\n")}\n${pad}/>`;
      }

      if (attrEntries.length === 0) {
        return `${pad}<${node.tag.name}>\n${children.join("\n")}\n${pad}</${node.tag.name}>`;
      }

      return `${multilineOpen}\n${children.join("\n")}\n${pad}</${node.tag.name}>`;
    }
    case "component": {
      const propEntries = Object.entries(node.props ?? {});
      const multilineOpen = `${pad}<${node.name}\n${propEntries
        .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
        .join("\n")}\n${pad}>`;
      const children = (node.children ?? []).map((child) =>
        emitTsxNode(child, emitAttr, indent + 1, context),
      );

      if (children.length === 0) {
        if (propEntries.length === 0) {
          return `${pad}<${node.name} />`;
        }
        return `${pad}<${node.name}\n${propEntries
          .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
          .join("\n")}\n${pad}/>`;
      }

      if (propEntries.length === 0) {
        return `${pad}<${node.name}>\n${children.join("\n")}\n${pad}</${node.name}>`;
      }

      return `${multilineOpen}\n${children.join("\n")}\n${pad}</${node.name}>`;
    }
  }
}

/**
 * React-specific JSX/TSX tree emitter that uses <Fragment key={...}> in .map() calls.
 */
export function emitReactNode(
  node: Node,
  emitAttr: TsxAttrEmitter,
  indent = 0,
  context?: TsxEmitContext,
): string {
  const pad = "  ".repeat(indent);

  switch (node.kind) {
    case "text":
      return `${pad}${node.value}`;
    case "slot":
      return `${pad}{${node.name}}`;
    case "print":
      return `${pad}{${emitTsxExpr(node.expr)}}`;
    case "if": {
      const thenPart = node.then
        .map((child) => emitReactNode(child, emitAttr, indent + 2, context))
        .join("\n");
      const elsePart = (node.else ?? [])
        .map((child) => emitReactNode(child, emitAttr, indent + 2, context))
        .join("\n");
      if (elsePart) {
        return `${pad}{${emitTsxExpr(node.test)} ? (\n${pad}  <>\n${thenPart}\n${pad}  </>\n${pad}) : (\n${pad}  <>\n${elsePart}\n${pad}  </>\n${pad})}`;
      }
      return `${pad}{${emitTsxExpr(node.test)} && (\n${pad}  <>\n${thenPart}\n${pad}  </>\n${pad})}`;
    }
    case "for": {
      const eachExpr = emitTsxExpr(node.each);
      const indexVar = node.indexName ?? "__index";
      const iteratorArgs = `${node.item}, ${indexVar}`;
      const body = node.children
        .map((child) => emitReactNode(child, emitAttr, indent + 2, context))
        .join("\n");
      return `${pad}{(${eachExpr} ?? []).map((${iteratorArgs}) => (\n${pad}  <Fragment key={${indexVar}}>\n${body}\n${pad}  </Fragment>\n${pad}))}`;
    }
    case "element": {
      if (node.tag.kind === "dynamic") {
        const hoistedTagName = context?.hoistedTagNames.get(node);
        if (hoistedTagName) {
          const attrEntries = Object.entries(node.attrs ?? {});
          const multilineOpen = `${pad}<${hoistedTagName}\n${attrEntries
            .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
            .join("\n")}\n${pad}>`;
          const children = (node.children ?? []).map((child) =>
            emitReactNode(child, emitAttr, indent + 1, context),
          );

          if (children.length === 0) {
            if (attrEntries.length === 0) {
              return `${pad}<${hoistedTagName} />`;
            }
            return `${pad}<${hoistedTagName}\n${attrEntries
              .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
              .join("\n")}\n${pad}/>`;
          }

          if (attrEntries.length === 0) {
            return `${pad}<${hoistedTagName}>\n${children.join("\n")}\n${pad}</${hoistedTagName}>`;
          }

          return `${multilineOpen}\n${children.join("\n")}\n${pad}</${hoistedTagName}>`;
        }

        return emitDynamicTsxElement(
          emitTsxTagExpr(node.tag),
          "KatachiTag",
          node.attrs ?? {},
          node.children ?? [],
          emitAttr,
          indent,
          emitReactNode,
          context,
        );
      }

      const attrEntries = Object.entries(node.attrs ?? {});
      const multilineOpen = `${pad}<${node.tag.name}\n${attrEntries
        .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
        .join("\n")}\n${pad}>`;
      const children = (node.children ?? []).map((child) =>
        emitReactNode(child, emitAttr, indent + 1, context),
      );

      if (children.length === 0) {
        if (attrEntries.length === 0) {
          return `${pad}<${node.tag.name} />`;
        }
        return `${pad}<${node.tag.name}\n${attrEntries
          .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
          .join("\n")}\n${pad}/>`;
      }

      if (attrEntries.length === 0) {
        return `${pad}<${node.tag.name}>\n${children.join("\n")}\n${pad}</${node.tag.name}>`;
      }

      return `${multilineOpen}\n${children.join("\n")}\n${pad}</${node.tag.name}>`;
    }
    case "component": {
      const propEntries = Object.entries(node.props ?? {});
      const multilineOpen = `${pad}<${node.name}\n${propEntries
        .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
        .join("\n")}\n${pad}>`;
      const children = (node.children ?? []).map((child) =>
        emitReactNode(child, emitAttr, indent + 1, context),
      );

      if (children.length === 0) {
        if (propEntries.length === 0) {
          return `${pad}<${node.name} />`;
        }
        return `${pad}<${node.name}\n${propEntries
          .map(([name, value]) => `${pad}  ${emitAttr(name, value)}`)
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
    case "children[]":
      return "&'a [&'a str]";
    case "children[][]":
      return "&'a [&'a [&'a str]]";
    case "string[]":
      return "&'a [&'a str]";
    case "string[][]":
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
    case "children[]":
      return "ReactNode[]";
    case "children[][]":
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
 * Checks whether the AST contains any "for" nodes, which means
 * the React target needs to import Fragment.
 */
function astUsesForNode(node: Node): boolean {
  switch (node.kind) {
    case "for":
      return true;
    case "if":
      return (
        node.then.some(astUsesForNode) || (node.else ?? []).some(astUsesForNode)
      );
    case "element":
      return (node.children ?? []).some(astUsesForNode);
    case "component":
      return (node.children ?? []).some(astUsesForNode);
    default:
      return false;
  }
}

/**
 * Wraps an emitted TSX template body in a component module.
 */
export function buildTsxComponentSource(
  template: BuildTemplate,
  body: string,
  hoists: string[] = [],
): string {
  const props = template.props ?? [];
  const propsTypeName = `${template.name}Props`;
  const propLines = props.map(
    (prop) => `  ${prop.name}${prop.optional ? "?" : ""}: ${toTsType(prop.type)};`,
  );
  const destructuredProps = props.map((prop) => prop.name).join(", ");
  const componentImports = buildTsxImportLines(template);
  const needsElementType = hoists.length > 0;

  return `import type { ${needsElementType ? "ElementType, " : ""}ReactNode } from "react";
${componentImports ? `${componentImports}\n` : ""}

export type ${propsTypeName} = {
${propLines.join("\n")}
};

export default function ${template.name}({ ${destructuredProps} }: ${propsTypeName}) {
${hoists.join("\n")}${hoists.length > 0 ? "\n" : ""}  return (
${body}
  );
}
`;
}

/**
 * Wraps an emitted React TSX template body in a component module.
 * Only imports ReactNode when a prop uses it, and imports Fragment when needed.
 */
export function buildReactComponentSource(
  template: BuildTemplate,
  body: string,
  hoists: string[] = [],
): string {
  const props = template.props ?? [];
  const propsTypeName = `${template.name}Props`;
  const propLines = props.map(
    (prop) => `  ${prop.name}${prop.optional ? "?" : ""}: ${toTsType(prop.type)};`,
  );
  const destructuredProps = props.map((prop) => prop.name).join(", ");
  const componentImports = buildTsxImportLines(template);

  const needsReactNode = props.some(
    (prop) => prop.type === "children" || prop.type === "children[]" || prop.type === "children[][]",
  );
  const needsFragment = astUsesForNode(template.template);
  const needsElementType = hoists.length > 0;

  const reactImports: string[] = [];
  if (needsFragment) {
    reactImports.push("Fragment");
  }
  const reactTypeImports: string[] = [];
  if (needsElementType) {
    reactTypeImports.push("ElementType");
  }
  if (needsReactNode) {
    reactTypeImports.push("ReactNode");
  }

  let importLine = "";
  if (reactImports.length > 0 && reactTypeImports.length > 0) {
    importLine = `import { ${reactImports.join(", ")}, type ${reactTypeImports.join(", type ")} } from "react";`;
  } else if (reactImports.length > 0) {
    importLine = `import { ${reactImports.join(", ")} } from "react";`;
  } else if (reactTypeImports.length > 0) {
    importLine = `import type { ${reactTypeImports.join(", ")} } from "react";`;
  }

  return `${importLine}
${componentImports ? `${componentImports}\n` : ""}

export type ${propsTypeName} = {
${propLines.join("\n")}
};

export default function ${template.name}({ ${destructuredProps} }: ${propsTypeName}) {
${hoists.join("\n")}${hoists.length > 0 ? "\n" : ""}  return (
${body}
  );
}
`;
}

export function emitTsxWithHoists(
  template: BuildTemplate,
  emitNode: (node: Node, emitAttr: TsxAttrEmitter, indent: number, context?: TsxEmitContext) => string,
  emitAttr: TsxAttrEmitter,
): { body: string; hoists: string[] } {
  const { context, hoists } = buildTsxEmitContext(template);
  return {
    body: emitNode(template.template, emitAttr, 2, context),
    hoists,
  };
}

export { escapeDoubleQuotes, wrapHtmlAttribute };
