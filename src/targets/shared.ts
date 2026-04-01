import type { AttrValue, Expr, Node, TagName, TargetAttrs } from "../core/ast.js";
import type { BuildTemplate } from "../core/types.js";

function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function wrapHtmlAttribute(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `'${value.replace(/'/g, "&#39;")}'`;
}

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

function translateTsxExprToAskama(source: string): string {
  return source
    .replace(/\?\./g, ".")
    .replace(/\blength\(\s*([A-Za-z_][A-Za-z0-9_.[\]]*)\s*\)/g, "$1.len()")
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*\?\?\s*(?:\[\s*\]|""|'')/g, "$1")
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*!==\s*null\b/g, "$1.is_some()")
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*!=\s*null\b/g, "$1.is_some()")
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*===\s*null\b/g, "$1.is_none()")
    .replace(/\b([A-Za-z_][A-Za-z0-9_.[\]]*)\s*==\s*null\b/g, "$1.is_none()")
    .replace(/\s===\s/g, " == ")
    .replace(/\s!==\s/g, " != ");
}

function normalizeAskamaRawExpr(source: string): string {
  return source.replace(/\blength\(\s*([A-Za-z_][A-Za-z0-9_.[\]]*)\s*\)/g, "$1.len()");
}

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

function isNullExpr(expr: Expr): boolean {
  return expr.kind === "var" && expr.name === "null";
}

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
      return normalizeAskamaRawExpr(translateTsxExprToAskama(expr.source));
    case "eq":
      if (isNullExpr(expr.left)) {
        return `${emitAskamaExpr(expr.right)}.is_none()`;
      }
      if (isNullExpr(expr.right)) {
        return `${emitAskamaExpr(expr.left)}.is_none()`;
      }
      return `${emitAskamaExpr(expr.left)} == ${emitAskamaExpr(expr.right)}`;
    case "neq":
      if (isNullExpr(expr.left)) {
        return `${emitAskamaExpr(expr.right)}.is_some()`;
      }
      if (isNullExpr(expr.right)) {
        return `${emitAskamaExpr(expr.left)}.is_some()`;
      }
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

interface TsxEmitContext {
  hoistedTagNames: WeakMap<Extract<Node, { kind: "element" }>, string>;
}

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

function emitTagInterpolationPart(expr: Expr, emitExpr: (expr: Expr) => string): string {
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
      return exprUsesBoundName(expr.left, boundNames) || exprUsesBoundName(expr.right, boundNames);
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
    case "fragment":
      node.children.forEach((child) =>
        collectHoistedDynamicTags(child, hoists, hoistedTagNames, boundNames, nextId),
      );
      return;
    case "doctype":
    case "text":
    case "slot":
    case "print":
      return;
    case "if":
      node.then.forEach((child) =>
        collectHoistedDynamicTags(child, hoists, hoistedTagNames, boundNames, nextId),
      );
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
  attrs: string[],
  children: string[],
  indent: number,
): string {
  const pad = "  ".repeat(indent);
  const attrBlock = attrs.length > 0
    ? `\n${attrs.map((entry) => `${pad}      ${entry}`).join("\n")}\n${pad}    `
    : "";

  if (children.length === 0) {
    return `${pad}{(() => {\n${pad}  const ${tagComponentName} = ${tagExpr};\n${pad}  return <${tagComponentName}${attrBlock} />;\n${pad}})()}`;
  }

  return `${pad}{(() => {\n${pad}  const ${tagComponentName} = ${tagExpr};\n${pad}  return (\n${pad}    <${tagComponentName}${attrBlock}>\n${children.join("\n")}\n${pad}    </${tagComponentName}>\n${pad}  );\n${pad}})()}`;
}

export function emitTsxNode(
  node: Node,
  emitAttr: TsxAttrEmitter,
  indent = 0,
  targetName = "tsx",
  context?: TsxEmitContext,
): string {
  const pad = "  ".repeat(indent);

  switch (node.kind) {
    case "fragment": {
      const children = (node.children ?? []).map((child) =>
        emitTsxNode(child, emitAttr, indent + 1, targetName, context),
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
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, targetName, context))
        .join("\n");
      const elsePart = (node.else ?? [])
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, targetName, context))
        .join("\n");
      if (elsePart) {
        return `${pad}{${emitTsxExpr(node.test)} ? (\n${pad}  <>\n${thenPart}\n${pad}  </>\n${pad}) : (\n${pad}  <>\n${elsePart}\n${pad}  </>\n${pad})}`;
      }
      return `${pad}{${emitTsxExpr(node.test)} && (\n${pad}  <>\n${thenPart}\n${pad}  </>\n${pad})}`;
    }
    case "for": {
      const eachExpr = emitTsxExpr(node.each);
      const iteratorArgs = node.indexName ? `${node.item}, ${node.indexName}` : `${node.item}, __index`;
      const keyName = node.indexName ?? "__index";
      const body = node.children
        .map((child) => emitTsxNode(child, emitAttr, indent + 2, targetName, context))
        .join("\n");
      return `${pad}{(${eachExpr} ?? []).map((${iteratorArgs}) => (\n${pad}  <Fragment key={${keyName}}>\n${body}\n${pad}  </Fragment>\n${pad}))}`;
    }
    case "element": {
      const attrEntries = Object.entries(
        mergeTargetScopedAttrs(node.attrs, node.targetAttrs, targetName),
      )
        .map(([name, value]) => emitAttr(name, value))
        .filter((entry): entry is string => entry != null);
      const children = (node.children ?? []).map((child) =>
        emitTsxNode(child, emitAttr, indent + 1, targetName, context),
      );

      if (node.tag.kind === "dynamic") {
        const hoistedTagName = context?.hoistedTagNames.get(node);
        if (hoistedTagName) {
          const multilineOpen = `${pad}<${hoistedTagName}\n${attrEntries
            .map((entry) => `${pad}  ${entry}`)
            .join("\n")}\n${pad}>`;

          if (children.length === 0) {
            if (attrEntries.length === 0) {
              return `${pad}<${hoistedTagName} />`;
            }
            return `${pad}<${hoistedTagName}\n${attrEntries
              .map((entry) => `${pad}  ${entry}`)
              .join("\n")}\n${pad}/>`;
          }

          if (attrEntries.length === 0) {
            return `${pad}<${hoistedTagName}>\n${children.join("\n")}\n${pad}</${hoistedTagName}>`;
          }

          return `${multilineOpen}\n${children.join("\n")}\n${pad}</${hoistedTagName}>`;
        }

        return emitDynamicTsxElement(emitTsxTagExpr(node.tag), "KatachiTag", attrEntries, children, indent);
      }

      const tagName = node.tag.name;
      const multilineOpen = `${pad}<${tagName}\n${attrEntries
        .map((entry) => `${pad}  ${entry}`)
        .join("\n")}\n${pad}>`;

      if (children.length === 0) {
        if (attrEntries.length === 0) {
          return `${pad}<${tagName} />`;
        }
        return `${pad}<${tagName}\n${attrEntries.map((entry) => `${pad}  ${entry}`).join("\n")}\n${pad}/>`;
      }

      if (attrEntries.length === 0) {
        return `${pad}<${tagName}>\n${children.join("\n")}\n${pad}</${tagName}>`;
      }

      return `${multilineOpen}\n${children.join("\n")}\n${pad}</${tagName}>`;
    }
    case "component": {
      const propEntries = Object.entries(
        mergeTargetScopedAttrs(node.props, node.targetAttrs, targetName),
      )
        .map(([name, value]) => emitAttr(name, value))
        .filter((entry): entry is string => entry != null);
      const children = (node.children ?? []).map((child) =>
        emitTsxNode(child, emitAttr, indent + 1, targetName, context),
      );
      const multilineOpen = `${pad}<${node.name}\n${propEntries
        .map((entry) => `${pad}  ${entry}`)
        .join("\n")}\n${pad}>`;

      if (children.length === 0) {
        if (propEntries.length === 0) {
          return `${pad}<${node.name} />`;
        }
        return `${pad}<${node.name}\n${propEntries.map((entry) => `${pad}  ${entry}`).join("\n")}\n${pad}/>`;
      }

      if (propEntries.length === 0) {
        return `${pad}<${node.name}>\n${children.join("\n")}\n${pad}</${node.name}>`;
      }

      return `${multilineOpen}\n${children.join("\n")}\n${pad}</${node.name}>`;
    }
  }
}

export function emitReactNode(
  node: Node,
  emitAttr: TsxAttrEmitter,
  indent = 0,
  context?: TsxEmitContext,
): string {
  return emitTsxNode(node, emitAttr, indent, "react", context);
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
    case "template-node":
      return "&'a str";
    case "children[]":
    case "string[]":
    case "template-node[]":
      return "&'a [&'a str]";
    case "children[][]":
    case "string[][]":
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
    case "template-node":
      return "ReactNode";
    case "children[]":
    case "template-node[]":
      return "ReactNode[]";
    case "children[][]":
    case "template-node[][]":
      return "ReactNode[][]";
    default:
      return type;
  }
}

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

function astUsesForNode(node: Node): boolean {
  switch (node.kind) {
    case "fragment":
      return node.children.some(astUsesForNode);
    case "doctype":
    case "text":
    case "slot":
    case "print":
      return false;
    case "for":
      return true;
    case "if":
      return node.then.some(astUsesForNode) || (node.else ?? []).some(astUsesForNode);
    case "element":
      return (node.children ?? []).some(astUsesForNode);
    case "component":
      return (node.children ?? []).some(astUsesForNode);
  }
}

function astUsesDynamicElement(node: Node): boolean {
  switch (node.kind) {
    case "fragment":
      return node.children.some(astUsesDynamicElement);
    case "doctype":
    case "text":
    case "slot":
    case "print":
      return false;
    case "if":
      return node.then.some(astUsesDynamicElement) || (node.else ?? []).some(astUsesDynamicElement);
    case "for":
      return node.children.some(astUsesDynamicElement);
    case "element":
      return node.tag.kind === "dynamic" || (node.children ?? []).some(astUsesDynamicElement);
    case "component":
      return (node.children ?? []).some(astUsesDynamicElement);
  }
}

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
  const supportingTypesBlock = (template.supportingTypes ?? []).join("\n\n");
  const needsElementType = astUsesDynamicElement(template.template) || hoists.length > 0;

  return `import { Fragment, ${needsElementType ? "type ElementType, " : ""}type ReactNode } from "react";
${componentImports ? `${componentImports}\n` : ""}
${supportingTypesBlock ? `\n${supportingTypesBlock}\n` : ""}

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
  const supportingTypesBlock = (template.supportingTypes ?? []).join("\n\n");

  const needsReactNode = props.some(
    (prop) =>
      prop.type === "children" ||
      prop.type === "children[]" ||
      prop.type === "children[][]" ||
      prop.type === "template-node" ||
      prop.type === "template-node[]" ||
      prop.type === "template-node[][]",
  );
  const needsFragment = astUsesForNode(template.template);
  const needsElementType = astUsesDynamicElement(template.template) || hoists.length > 0;

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
${supportingTypesBlock ? `\n${supportingTypesBlock}\n` : ""}

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
