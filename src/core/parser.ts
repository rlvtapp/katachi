import type { AttrValue, ClassItem, Expr, Node, TagName, TargetAttrs } from "./ast.js";
import {
  and,
  classList,
  concatAttr,
  componentNode,
  doctypeNode,
  elementNode,
  eq,
  exprAttr,
  forNode,
  intrinsic,
  ifNode,
  n,
  neq,
  not,
  or,
  printNode,
  fragmentNode,
  raw,
  s,
  slotNode,
  textAttr,
  textNode,
  v,
} from "./ast.js";
import type { ParsedTemplate, ParseNodesResult, TemplateImport, TemplateProp } from "./types.js";

interface LocalComponentDefinition {
  name: string;
  props: string[];
  template: Node;
}

type ParsedValueType =
  | "string"
  | "bool"
  | "number"
  | "children"
  | "string[]"
  | "string[][]"
  | "template-node"
  | "template-node[]"
  | "template-node[][]";

type VarTypeMap = Record<string, ParsedValueType>;
type TypeDefinitionMap = Record<string, Record<string, string>>;

/**
 * Handwritten parser for Katachi's current restricted TSX subset.
 *
 * This parser exists to prove the authoring model and compiler pipeline. The
 * long-term direction is a real TSX AST parser, but the handwritten approach is
 * still useful while the syntax surface is changing quickly.
 */

function isTagNameChar(char: string): boolean {
  return /[A-Za-z0-9_-]/.test(char);
}

function isAttributeNameChar(char: string): boolean {
  return /[A-Za-z0-9_:@.-]/.test(char);
}

/**
 * Splits a string on a separator while respecting nested brackets, braces,
 * parentheses, and quoted strings.
 */
function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quote) {
      current += char;
      if (char === "\\" && next) {
        current += next;
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") depthParen += 1;
    if (char === ")") depthParen -= 1;
    if (char === "[") depthBracket += 1;
    if (char === "]") depthBracket -= 1;
    if (char === "{") depthBrace += 1;
    if (char === "}") depthBrace -= 1;

    if (
      char === separator &&
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0
    ) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function findTopLevelOperator(input: string, operator: string): number {
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: string | null = null;

  for (let index = 0; index <= input.length - operator.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quote) {
      if (char === "\\" && next) {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") depthParen += 1;
    if (char === ")") depthParen -= 1;
    if (char === "[") depthBracket += 1;
    if (char === "]") depthBracket -= 1;
    if (char === "{") depthBrace += 1;
    if (char === "}") depthBrace -= 1;

    if (
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0 &&
      input.slice(index, index + operator.length) === operator
    ) {
      return index;
    }
  }

  return -1;
}

function findLastTopLevelOperator(input: string, operator: string): number {
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: string | null = null;
  let lastIndex = -1;

  for (let index = 0; index <= input.length - operator.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quote) {
      if (char === "\\" && next) {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") depthParen += 1;
    if (char === ")") depthParen -= 1;
    if (char === "[") depthBracket += 1;
    if (char === "]") depthBracket -= 1;
    if (char === "{") depthBrace += 1;
    if (char === "}") depthBrace -= 1;

    if (
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0 &&
      input.slice(index, index + operator.length) === operator
    ) {
      lastIndex = index;
    }
  }

  return lastIndex;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseTopLevelCall(
  input: string,
): { name: string; args: string[] } | null {
  const match = input.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (!match) {
    return null;
  }

  const name = match[1];
  const openParenIndex = input.indexOf("(", name.length);
  if (openParenIndex === -1 || !input.endsWith(")")) {
    return null;
  }

  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: string | null = null;

  for (let index = openParenIndex; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quote) {
      if (char === "\\" && next) {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") depthParen += 1;
    if (char === ")") depthParen -= 1;
    if (char === "[") depthBracket += 1;
    if (char === "]") depthBracket -= 1;
    if (char === "{") depthBrace += 1;
    if (char === "}") depthBrace -= 1;

    if (depthParen === 0 && index < input.length - 1) {
      return null;
    }
  }

  if (depthParen !== 0 || depthBracket !== 0 || depthBrace !== 0) {
    return null;
  }

  const argsBody = input.slice(openParenIndex + 1, -1).trim();
  return {
    name,
    args: argsBody ? splitTopLevel(argsBody, ",") : [],
  };
}

function parseExpr(source: string): Expr {
  const input = source.trim();

  if (!input) {
    return raw("");
  }

  if (input === "true" || input === "false") {
    return { kind: "bool", value: input === "true" };
  }

  if (/^-?\d+(\.\d+)?$/.test(input)) {
    return n(Number(input));
  }

  if (input.startsWith("!(") && input.endsWith(")")) {
    return not(parseExpr(input.slice(2, -1)));
  }

  if (input.startsWith("!") && !input.startsWith("!=")) {
    return not(parseExpr(input.slice(1)));
  }

  for (const operator of ["||", "&&", "===", "!==", "==", "!="]) {
    const operatorIndex = findTopLevelOperator(input, operator);
    if (operatorIndex !== -1) {
      const left = parseExpr(input.slice(0, operatorIndex));
      const right = parseExpr(input.slice(operatorIndex + operator.length));
      if (operator === "||") return or(left, right);
      if (operator === "&&") return and(left, right);
      if (operator === "===" || operator === "==") return eq(left, right);
      return neq(left, right);
    }
  }

  if (
    (input.startsWith('"') && input.endsWith('"')) ||
    (input.startsWith("'") && input.endsWith("'"))
  ) {
    return s(unquote(input));
  }

  if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(input)) {
    return v(input);
  }

  const call = parseTopLevelCall(input);
  if (call && call.args.length === 1) {
    if (call.name === "length") {
      return intrinsic("len", parseExpr(call.args[0] ?? ""));
    }
    if (call.name === "isEmpty") {
      return intrinsic("isEmpty", parseExpr(call.args[0] ?? ""));
    }
    if (call.name === "isSome") {
      return intrinsic("isSome", parseExpr(call.args[0] ?? ""));
    }
    if (call.name === "isNone") {
      return intrinsic("isNone", parseExpr(call.args[0] ?? ""));
    }
  }

  return raw(input);
}

function parseClassList(source: string): AttrValue {
  const input = source.trim();
  const listBody = input.slice(1, -1);
  const items: ClassItem[] = splitTopLevel(listBody, ",").map((item) => {
    const trimmed = item.trim();
    const andIndex = findLastTopLevelOperator(trimmed, "&&");

    if (andIndex !== -1) {
      const test = trimmed.slice(0, andIndex).trim();
      const value = trimmed.slice(andIndex + 2).trim();
      return {
        kind: "when",
        test: parseExpr(test),
        value: unquote(value),
      };
    }

    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return {
        kind: "static",
        value: unquote(trimmed),
      };
    }

    if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(trimmed)) {
      return {
        kind: "dynamic",
        expr: v(trimmed),
      };
    }

    return {
      kind: "dynamic",
      expr: parseExpr(trimmed),
    };
  });

  return classList(...items);
}

function parseAttrValue(name: string, source: string): AttrValue {
  const input = source.trim();

  if (input.startsWith("{") && input.endsWith("}")) {
    const inner = input.slice(1, -1).trim();
    if (
      (name === "class" || name === "className") &&
      inner.startsWith("[") &&
      inner.endsWith("]")
    ) {
      return parseClassList(inner);
    }
    if (inner.startsWith("[") && inner.endsWith("]")) {
      const arrayBody = inner.slice(1, -1);
      const parts = splitTopLevel(arrayBody, ",").map((part) => parseExpr(part.trim()));
      return concatAttr(...parts);
    }
    return exprAttr(parseExpr(inner));
  }

  return textAttr(unquote(input));
}

function findTopLevelColon(input: string): number {
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quote) {
      if (char === "\\" && next) {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") depthParen += 1;
    if (char === ")") depthParen -= 1;
    if (char === "[") depthBracket += 1;
    if (char === "]") depthBracket -= 1;
    if (char === "{") depthBrace += 1;
    if (char === "}") depthBrace -= 1;

    if (char === ":" && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      return index;
    }
  }

  return -1;
}

function parseTargetAttrObject(source: string): Record<string, AttrValue> {
  const input = source.trim();
  if (!input.startsWith("{") || !input.endsWith("}")) {
    throw new Error("Target attrs must be object literals");
  }

  const body = input.slice(1, -1).trim();
  if (!body) {
    return {};
  }

  const attrs: Record<string, AttrValue> = {};
  for (const entry of splitTopLevel(body, ",")) {
    const colonIndex = findTopLevelColon(entry);
    if (colonIndex === -1) {
      throw new Error(`Invalid target attr entry: ${entry}`);
    }

    const nameSource = entry.slice(0, colonIndex).trim();
    const valueSource = entry.slice(colonIndex + 1).trim();
    const attrName = unquote(nameSource);
    attrs[attrName] =
      (valueSource.startsWith('"') && valueSource.endsWith('"')) ||
      (valueSource.startsWith("'") && valueSource.endsWith("'"))
        ? textAttr(unquote(valueSource))
        : exprAttr(parseExpr(valueSource));
  }

  return attrs;
}

function parseTargetAttrs(source: string): TargetAttrs {
  const input = source.trim();
  if (!input.startsWith("{") || !input.endsWith("}")) {
    throw new Error("attrs must be wrapped in JSX expression braces");
  }

  const inner = input.slice(1, -1).trim();
  if (!inner.startsWith("{") || !inner.endsWith("}")) {
    throw new Error("attrs must be an object literal");
  }

  const body = inner.slice(1, -1).trim();
  if (!body) {
    return {};
  }

  const targetAttrs: TargetAttrs = {};
  for (const entry of splitTopLevel(body, ",")) {
    const colonIndex = findTopLevelColon(entry);
    if (colonIndex === -1) {
      throw new Error(`Invalid attrs target entry: ${entry}`);
    }

    const targetName = unquote(entry.slice(0, colonIndex).trim());
    const targetValue = entry.slice(colonIndex + 1).trim();
    targetAttrs[targetName] = parseTargetAttrObject(targetValue);
  }

  return targetAttrs;
}

function parseTag(openTagSource: string): {
  tagName: string;
  attrs: Record<string, AttrValue>;
  targetAttrs: TargetAttrs;
  selfClosing: boolean;
} {
  let index = 1;
  while (index < openTagSource.length && /\s/.test(openTagSource[index])) index += 1;

  let tagName = "";
  while (index < openTagSource.length && isTagNameChar(openTagSource[index])) {
    tagName += openTagSource[index];
    index += 1;
  }

  const attrs: Record<string, AttrValue> = {};
  let targetAttrs: TargetAttrs = {};
  while (index < openTagSource.length) {
    while (index < openTagSource.length && /\s/.test(openTagSource[index])) index += 1;
    if (openTagSource[index] === "/" || openTagSource[index] === ">") break;

    let attrName = "";
    while (
      index < openTagSource.length &&
      isAttributeNameChar(openTagSource[index])
    ) {
      attrName += openTagSource[index];
      index += 1;
    }

    while (index < openTagSource.length && /\s/.test(openTagSource[index])) index += 1;
    if (openTagSource[index] !== "=") {
      throw new Error(`Expected "=" after attribute ${attrName}`);
    }
    index += 1;
    while (index < openTagSource.length && /\s/.test(openTagSource[index])) index += 1;

    let value = "";

    if (openTagSource[index] === '"' || openTagSource[index] === "'") {
      const quote = openTagSource[index];
      value += quote;
      index += 1;
      while (index < openTagSource.length && openTagSource[index] !== quote) {
        value += openTagSource[index];
        index += 1;
      }
      value += quote;
      index += 1;
    } else if (openTagSource[index] === "{") {
      let depth = 0;
      while (index < openTagSource.length) {
        const char = openTagSource[index];
        value += char;
        if (char === "{") depth += 1;
        if (char === "}") {
          depth -= 1;
          if (depth === 0) {
            index += 1;
            break;
          }
        }
        index += 1;
      }
    } else {
      while (
        index < openTagSource.length &&
        !/\s/.test(openTagSource[index]) &&
        openTagSource[index] !== "/" &&
        openTagSource[index] !== ">"
      ) {
        value += openTagSource[index];
        index += 1;
      }
    }

    if (attrName === "attrs") {
      targetAttrs = parseTargetAttrs(value);
      continue;
    }

    attrs[attrName] = parseAttrValue(attrName, value);
  }

  return {
    tagName,
    attrs,
    targetAttrs,
    selfClosing: openTagSource.trim().endsWith("/>"),
  };
}

function normalizeElementAttrs(attrs: Record<string, AttrValue>): Record<string, AttrValue> {
  const normalized: Record<string, AttrValue> = {};

  for (const [name, value] of Object.entries(attrs)) {
    normalized[name === "className" ? "class" : name] = value;
  }

  return normalized;
}

function parseDynamicTag(value: AttrValue | undefined): TagName {
  if (!value) {
    throw new Error("<Element> requires a `tag={...}` prop");
  }

  if (value.kind === "text") {
    return { kind: "dynamic", parts: [s(value.value)] };
  }

  if (value.kind === "expr") {
    return { kind: "dynamic", parts: [value.expr] };
  }

  if (value.kind === "concat") {
    if (value.parts.length === 0) {
      throw new Error("<Element> requires at least one tag part");
    }
    return { kind: "dynamic", parts: value.parts };
  }

  throw new Error("<Element> tag must be a string, expression, or string/expression tuple");
}

function readOpenTag(source: string, startIndex: number): string {
  let index = startIndex;
  let quote: string | null = null;
  let braceDepth = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      if (char === "\\" && next) {
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      index += 1;
      continue;
    }

    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;

    if (char === ">" && braceDepth === 0) {
      return source.slice(startIndex, index + 1);
    }

    index += 1;
  }

  throw new Error("Unterminated tag");
}

function readRawTagContent(source: string, startIndex: number, tagName: string): ParseNodesResult {
  const closeTag = `</${tagName}>`;
  const closeIndex = source.indexOf(closeTag, startIndex);
  if (closeIndex === -1) {
    throw new Error(`Missing closing tag: ${tagName}`);
  }

  let content = source.slice(startIndex, closeIndex);
  const trimmed = content.trim();
  const templateLiteralMatch = trimmed.match(/^\{`([\s\S]*)`\}$/);
  if (templateLiteralMatch) {
    content = templateLiteralMatch[1] ?? "";
  } else {
    const stringLiteralMatch = trimmed.match(/^\{(["'])([\s\S]*)\1\}$/);
    if (stringLiteralMatch) {
      content = stringLiteralMatch[2] ?? "";
    }
  }

  return {
    nodes: [textNode(content)],
    nextIndex: closeIndex + closeTag.length,
  };
}

function readDeclaration(source: string, startIndex: number): { value: string; nextIndex: number } {
  const endIndex = source.indexOf(">", startIndex);
  if (endIndex === -1) {
    throw new Error("Unterminated declaration");
  }

  return {
    value: source.slice(startIndex, endIndex + 1),
    nextIndex: endIndex + 1,
  };
}

function splitIfBranches(nodes: Node[]): { thenNodes: Node[]; elseNodes: Node[] } {
  const elseIndex = nodes.findIndex((node) => node.kind === "component" && node.name === "Else");
  if (elseIndex === -1) {
    return {
      thenNodes: nodes,
      elseNodes: [],
    };
  }

  const elseNode = nodes[elseIndex];
  if (!elseNode || elseNode.kind !== "component" || elseNode.name !== "Else") {
    throw new Error("Invalid Else branch inside <If>");
  }

  const trailingNodes = nodes.slice(elseIndex + 1);
  if (trailingNodes.length > 0) {
    throw new Error("<Else> must be the final child inside <If>");
  }

  return {
    thenNodes: nodes.slice(0, elseIndex),
    elseNodes: elseNode.children ?? [],
  };
}

function inferLoopVarTypes(
  each: Expr,
  item: string,
  indexName: string | null,
  varTypes: VarTypeMap,
  typeDefinitions: TypeDefinitionMap,
): VarTypeMap {
  const loopVarTypes = { ...varTypes };
  if (each.kind === "var") {
    const eachType = resolveExprType(each.name, varTypes, typeDefinitions);
    if (eachType === "string[]") loopVarTypes[item] = "string";
    if (eachType === "string[][]") loopVarTypes[item] = "string[]";
    if (eachType === "template-node[]") loopVarTypes[item] = "template-node";
    if (eachType === "template-node[][]") loopVarTypes[item] = "template-node[]";
    if (typeof eachType === "string" && eachType.endsWith("[]")) {
      loopVarTypes[item] = eachType.slice(0, -2) as ParsedValueType;
    }
  }
  if (indexName) {
    loopVarTypes[indexName] = "number";
  }
  return loopVarTypes;
}

function parseForRenderFunction(
  expr: Expr,
  each: Expr,
  varTypes: VarTypeMap,
  typeDefinitions: TypeDefinitionMap,
): { item: string; indexName: string | null; children: Node[] } | null {
  if (expr.kind !== "raw") {
    return null;
  }

  const arrowIndex = findTopLevelOperator(expr.source, "=>");
  if (arrowIndex === -1) {
    return null;
  }

  const paramsSource = expr.source.slice(0, arrowIndex).trim();
  const bodySource = expr.source.slice(arrowIndex + 2).trim();

  let params: string[] = [];
  if (paramsSource.startsWith("(") && paramsSource.endsWith(")")) {
    params = splitTopLevel(paramsSource.slice(1, -1), ",")
      .map((part) => part.trim())
      .filter(Boolean);
  } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramsSource)) {
    params = [paramsSource];
  }

  if (params.length < 1 || params.length > 2) {
    return null;
  }

  const [item, indexName = null] = params;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item) || (indexName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(indexName))) {
    return null;
  }

  let markup = bodySource;
  if (markup.startsWith("(")) {
    const section = readBalancedSection(markup, 0, "(", ")");
    markup = section.body.trim();
  }

  if (!markup.startsWith("<")) {
    return null;
  }

  const loopVarTypes = inferLoopVarTypes(each, item, indexName, varTypes, typeDefinitions);
  const parsedChildren = parseNodes(markup, 0, null, loopVarTypes, typeDefinitions);
  return {
    item,
    indexName,
    children: parsedChildren.nodes,
  };
}

function parseObjectTypeFields(body: string): Record<string, string> {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => splitTopLevel(line, ";"))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((fields, entry) => {
      const colonIndex = entry.indexOf(":");
      if (colonIndex === -1) {
        return fields;
      }
      const left = entry.slice(0, colonIndex).trim();
      const right = entry.slice(colonIndex + 1).trim();
      const optional = left.endsWith("?");
      const name = optional ? left.slice(0, -1) : left;
      if (name) {
        fields[name] = right;
      }
      return fields;
    }, {});
}

function parseTypeDefinitions(source: string): TypeDefinitionMap {
  const definitions: TypeDefinitionMap = {};
  const pattern = /(?:^|\n)\s*(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (!name) {
      continue;
    }

    const matchIndex = match.index ?? 0;
    const typeIndex = source.indexOf(`type ${name}`, matchIndex);
    const equalsIndex = source.indexOf("=", typeIndex);
    if (typeIndex === -1 || equalsIndex === -1) {
      continue;
    }

    const { body } = readTypeAliasBody(source, equalsIndex + 1);
    const trimmedBody = body.trim();
    if (!(trimmedBody.startsWith("{") && trimmedBody.endsWith("}"))) {
      continue;
    }

    definitions[name] = parseObjectTypeFields(trimmedBody.slice(1, -1));
  }

  return definitions;
}

function resolveExprType(
  name: string,
  varTypes: VarTypeMap,
  typeDefinitions: TypeDefinitionMap,
): string | undefined {
  const segments = name.split(".");
  const baseName = segments.shift();
  if (!baseName) {
    return undefined;
  }

  let currentType = varTypes[baseName];
  if (!currentType) {
    return undefined;
  }

  for (const segment of segments) {
    if (typeof currentType !== "string") {
      return undefined;
    }

    const normalizedCurrentType = currentType.trim();
    if (normalizedCurrentType.endsWith("[]")) {
      return undefined;
    }

    const fields = typeDefinitions[normalizedCurrentType];
    if (!fields) {
      return undefined;
    }

    currentType = normalizePropType(segment, fields[segment] ?? "") as ParsedValueType;
  }

  return currentType;
}

function parseNodes(
  source: string,
  startIndex = 0,
  untilTagName: string | null = null,
  varTypes: VarTypeMap = {},
  typeDefinitions: TypeDefinitionMap = {},
): ParseNodesResult {
  const nodes: Node[] = [];
  let index = startIndex;

  while (index < source.length) {
    if (source.startsWith("<!DOCTYPE", index) || source.startsWith("<!doctype", index)) {
      const declaration = readDeclaration(source, index);
      nodes.push(doctypeNode(declaration.value));
      index = declaration.nextIndex;
      continue;
    }

    if (source.startsWith("</", index)) {
      const end = source.indexOf(">", index);
      const closingTag = source.slice(index + 2, end).trim();
      if (untilTagName !== null && closingTag === untilTagName) {
        return { nodes, nextIndex: end + 1 };
      }
      throw new Error(`Unexpected closing tag: ${closingTag}`);
    }

    if (source[index] === "<") {
      const openTagSource = readOpenTag(source, index);
      const { tagName, attrs, targetAttrs, selfClosing } = parseTag(openTagSource);
      index += openTagSource.length;

      if (tagName === "") {
        if (selfClosing) {
          nodes.push(fragmentNode());
          continue;
        }

        const parsedChildren = parseNodes(source, index, "", varTypes, typeDefinitions);
        index = parsedChildren.nextIndex;
        nodes.push(fragmentNode(parsedChildren.nodes));
        continue;
      }

        if (selfClosing) {
      if (tagName === "Element") {
        const normalizedAttrs = normalizeElementAttrs(attrs);
        const { tag: tagAttr, ...restAttrs } = normalizedAttrs;
        nodes.push(elementNode(parseDynamicTag(tagAttr), restAttrs, targetAttrs));
        continue;
      }

      if (/^[A-Z]/.test(tagName)) {
        nodes.push(componentNode(tagName, attrs, targetAttrs));
      } else {
        nodes.push(elementNode(tagName, normalizeElementAttrs(attrs), targetAttrs));
        }
        continue;
      }

      if (tagName === "if" || tagName === "If") {
        const parsedChildren = parseNodes(source, index, tagName, varTypes, typeDefinitions);
        index = parsedChildren.nextIndex;
        const test = attrs.test?.kind === "expr" ? attrs.test.expr : null;
        if (!test) {
          throw new Error("<If> requires a test expression");
        }
        const { thenNodes, elseNodes } = splitIfBranches(parsedChildren.nodes);
        nodes.push(ifNode(test, thenNodes, elseNodes));
        continue;
      }

      if (tagName === "for" || tagName === "For") {
        const each = attrs.each?.kind === "expr" ? attrs.each.expr : null;
        if (!each) {
          throw new Error("<For> requires `each={...}`");
        }
        const item = attrs.as?.kind === "text" ? attrs.as.value : null;
        const indexName = attrs.index?.kind === "text" ? attrs.index.value : null;

        if (item) {
          const loopVarTypes = inferLoopVarTypes(
            each,
            item,
            indexName,
            varTypes,
            typeDefinitions,
          );
          const parsedChildren = parseNodes(
            source,
            index,
            tagName,
            loopVarTypes,
            typeDefinitions,
          );
          index = parsedChildren.nextIndex;
          nodes.push(forNode(item, each, parsedChildren.nodes, indexName));
          continue;
        }

        const parsedChildren = parseNodes(source, index, tagName, varTypes, typeDefinitions);
        index = parsedChildren.nextIndex;
        const renderFn =
          parsedChildren.nodes.length === 1 &&
          parsedChildren.nodes[0]?.kind === "print"
            ? parseForRenderFunction(parsedChildren.nodes[0].expr, each, varTypes, typeDefinitions)
            : null;
        if (renderFn) {
          nodes.push(forNode(renderFn.item, each, renderFn.children, renderFn.indexName));
          continue;
        }
        if (!item) {
          throw new Error('<For> requires either `as="..."` or a render function child like `{(item) => (...)}`');
        }
      }

      const parsedChildren =
        tagName === "script" || tagName === "style"
          ? readRawTagContent(source, index, tagName)
          : parseNodes(source, index, tagName, varTypes, typeDefinitions);
      index = parsedChildren.nextIndex;

      if (tagName === "Element") {
        const normalizedAttrs = normalizeElementAttrs(attrs);
        const { tag: tagAttr, ...restAttrs } = normalizedAttrs;
        nodes.push(
          elementNode(parseDynamicTag(tagAttr), restAttrs, targetAttrs, parsedChildren.nodes),
        );
        continue;
      }

      if (/^[A-Z]/.test(tagName)) {
        nodes.push(componentNode(tagName, attrs, targetAttrs, parsedChildren.nodes));
      } else {
        nodes.push(
          elementNode(tagName, normalizeElementAttrs(attrs), targetAttrs, parsedChildren.nodes),
        );
      }
      continue;
    }

    if (source[index] === "{") {
      let depth = 0;
      let end = index;
      while (end < source.length) {
        const char = source[end];
        if (char === "{") depth += 1;
        if (char === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
        end += 1;
      }

      const inner = source.slice(index + 1, end).trim();
      if (inner) {
        if (inner === "children") {
          nodes.push(slotNode(inner));
        } else {
          const expr = parseExpr(inner);
          const isSafePrint =
            expr.kind === "var" &&
            (resolveExprType(expr.name, varTypes, typeDefinitions) === "template-node" ||
              resolveExprType(expr.name, varTypes, typeDefinitions) === "children");
          nodes.push(printNode(expr, isSafePrint));
        }
      }
      index = end + 1;
      continue;
    }

    let end = index;
    while (end < source.length && source[end] !== "<" && source[end] !== "{") {
      end += 1;
    }

    const text = source.slice(index, end);
    if (text.trim()) {
      nodes.push(textNode(text.trim()));
    }
    index = end;
  }

  if (untilTagName) {
    throw new Error(`Missing closing tag: ${untilTagName}`);
  }

  return { nodes, nextIndex: index };
}

function extractReturnMarkup(source: string, startIndex: number): string {
  const returnIndex = source.indexOf("return", startIndex);
  if (returnIndex === -1) {
    throw new Error("Template must return JSX");
  }

  let exprStart = returnIndex + "return".length;
  while (/\s/.test(source[exprStart])) {
    exprStart += 1;
  }

  if (source[exprStart] === "(") {
    let depth = 0;
    let parenEnd = -1;
    for (let index = exprStart; index < source.length; index += 1) {
      const char = source[index];
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          parenEnd = index;
          break;
        }
      }
    }

    if (parenEnd === -1) {
      throw new Error("Could not find JSX return end");
    }

    return source.slice(exprStart + 1, parenEnd).trim();
  }

  let index = exprStart;
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let quote: string | null = null;
  let exprEnd = -1;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      if (char === "\\" && next) {
        index += 2;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      index += 1;
      continue;
    }

    if (char === "(") depthParen += 1;
    if (char === ")") depthParen -= 1;
    if (char === "[") depthBracket += 1;
    if (char === "]") depthBracket -= 1;
    if (char === "{") depthBrace += 1;
    if (char === "}") depthBrace -= 1;

    if (
      char === ";" &&
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0
    ) {
      exprEnd = index;
      break;
    }

    index += 1;
  }

  if (exprEnd === -1) {
    throw new Error("Could not find JSX return end");
  }

  return source.slice(exprStart, exprEnd).trim();
}

function readBalancedSection(source: string, startIndex: number, openChar: string, closeChar: string): { body: string; nextIndex: number } {
  if (source[startIndex] !== openChar) {
    throw new Error(`Expected ${openChar}`);
  }

  let depth = 0;
  let quote: string | null = null;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      if (char === "\\" && next) {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(startIndex + 1, index),
          nextIndex: index + 1,
        };
      }
    }
  }

  throw new Error(`Unterminated ${openChar}${closeChar} section`);
}

function parseFunctionParamNames(paramsSource: string): string[] {
  const trimmed = paramsSource.trim();
  if (!trimmed) {
    return [];
  }

  const destructuredMatch = trimmed.match(/^\{\s*([\s\S]*?)\s*\}(?:\s*:\s*.+)?$/);
  if (!destructuredMatch) {
    return [];
  }

  return destructuredMatch[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const noDefault = part.split("=")[0]?.trim() ?? part;
      const noOptional = noDefault.replace(/\?$/, "");
      const aliased = noOptional.split(":")[0]?.trim() ?? noOptional;
      return aliased.trim();
    })
    .filter(Boolean);
}

function parseLocalComponents(source: string, defaultName: string): Map<string, LocalComponentDefinition> {
  const definitions = new Map<string, LocalComponentDefinition>();
  const pattern = /(?:^|\n)\s*(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (!name || name === defaultName) {
      continue;
    }

    const functionIndex = source.indexOf(`function ${name}`, match.index ?? 0);
    const openParenIndex = source.indexOf("(", functionIndex);
    const paramsSection = readBalancedSection(source, openParenIndex, "(", ")");
    const bodyStart = source.indexOf("{", paramsSection.nextIndex);
    const bodySection = readBalancedSection(source, bodyStart, "{", "}");
    const markup = extractReturnMarkup(bodySection.body, 0);
  const parsed = parseNodes(markup);
    const template =
      parsed.nodes.length === 1 ? parsed.nodes[0] : fragmentNode(parsed.nodes);

    definitions.set(name, {
      name,
      props: parseFunctionParamNames(paramsSection.body),
      template,
    });
  }

  return definitions;
}

type LocalBinding =
  | { kind: "attr"; value: AttrValue }
  | { kind: "children"; value: Node[] };

function cloneExpr(expr: Expr, bindings: Record<string, LocalBinding>): Expr {
  switch (expr.kind) {
    case "var": {
      const binding = bindings[expr.name];
      if (!binding || binding.kind !== "attr") {
        return expr;
      }

      if (binding.value.kind === "expr") {
        return binding.value.expr;
      }

      if (binding.value.kind === "text") {
        return s(binding.value.value);
      }

      if (binding.value.kind === "classList") {
        return raw(
          binding.value.items
            .map((item) => {
              if (item.kind === "static") {
                return item.value;
              }
              return "";
            })
            .join(" ")
            .trim(),
        );
      }

      return raw(
        binding.value.parts
          .map((part) => (part.kind === "string" ? part.value : ""))
          .join(""),
      );
    }
    case "intrinsic":
      return {
        ...expr,
        args: expr.args.map((arg) => cloneExpr(arg, bindings)),
      };
    case "eq":
    case "neq":
    case "and":
    case "or":
      return {
        ...expr,
        left: cloneExpr(expr.left, bindings),
        right: cloneExpr(expr.right, bindings),
      };
    case "not":
      return {
        ...expr,
        expr: cloneExpr(expr.expr, bindings),
      };
    default:
      return expr;
  }
}

function cloneAttrValue(value: AttrValue, bindings: Record<string, LocalBinding>): AttrValue {
  switch (value.kind) {
    case "expr":
      return { kind: "expr", expr: cloneExpr(value.expr, bindings) };
    case "classList":
      return {
        kind: "classList",
        items: value.items.map((item) =>
          item.kind === "static"
            ? item
            : item.kind === "dynamic"
              ? { kind: "dynamic", expr: cloneExpr(item.expr, bindings) }
              : { kind: "when", test: cloneExpr(item.test, bindings), value: item.value },
        ),
      };
    case "concat":
      return {
        kind: "concat",
        parts: value.parts.map((part) => cloneExpr(part, bindings)),
      };
    default:
      return value;
  }
}

function cloneTargetAttrs(
  targetAttrs: TargetAttrs | undefined,
  bindings: Record<string, LocalBinding>,
): TargetAttrs | undefined {
  if (!targetAttrs) {
    return targetAttrs;
  }

  return Object.fromEntries(
    Object.entries(targetAttrs).map(([target, attrs]) => [
      target,
      Object.fromEntries(
        Object.entries(attrs).map(([name, value]) => [name, cloneAttrValue(value, bindings)]),
      ),
    ]),
  );
}

function instantiateLocalNode(node: Node, bindings: Record<string, LocalBinding>): Node[] {
  switch (node.kind) {
    case "fragment":
      return [fragmentNode(node.children.flatMap((child) => instantiateLocalNode(child, bindings)))];
    case "slot": {
      const binding = bindings[node.name];
      if (binding?.kind === "children") {
        return binding.value;
      }
      return [node];
    }
    case "print":
      return [{ ...node, expr: cloneExpr(node.expr, bindings) }];
    case "if":
      return [
        {
          ...node,
          test: cloneExpr(node.test, bindings),
          then: node.then.flatMap((child) => instantiateLocalNode(child, bindings)),
          else: node.else?.flatMap((child) => instantiateLocalNode(child, bindings)),
        },
      ];
    case "for":
      return [
        {
          ...node,
          each: cloneExpr(node.each, bindings),
          children: node.children.flatMap((child) => instantiateLocalNode(child, bindings)),
        },
      ];
    case "element":
      return [
        {
          ...node,
          attrs: Object.fromEntries(
            Object.entries(node.attrs ?? {}).map(([name, value]) => [name, cloneAttrValue(value, bindings)]),
          ),
          targetAttrs: cloneTargetAttrs(node.targetAttrs, bindings),
          children: node.children?.flatMap((child) => instantiateLocalNode(child, bindings)),
        },
      ];
    case "component":
      return [
        {
          ...node,
          props: Object.fromEntries(
            Object.entries(node.props ?? {}).map(([name, value]) => [name, cloneAttrValue(value, bindings)]),
          ),
          targetAttrs: cloneTargetAttrs(node.targetAttrs, bindings),
          children: node.children?.flatMap((child) => instantiateLocalNode(child, bindings)),
        },
      ];
    default:
      return [node];
  }
}

function expandLocalComponents(node: Node, definitions: Map<string, LocalComponentDefinition>): Node[] {
  switch (node.kind) {
    case "fragment":
      return [fragmentNode(node.children.flatMap((child) => expandLocalComponents(child, definitions)))];
    case "if":
      return [
        {
          ...node,
          then: node.then.flatMap((child) => expandLocalComponents(child, definitions)),
          else: node.else?.flatMap((child) => expandLocalComponents(child, definitions)),
        },
      ];
    case "for":
      return [
        {
          ...node,
          children: node.children.flatMap((child) => expandLocalComponents(child, definitions)),
        },
      ];
    case "element":
      return [
        {
          ...node,
          children: node.children?.flatMap((child) => expandLocalComponents(child, definitions)),
        },
      ];
    case "component": {
      const definition = definitions.get(node.name);
      if (!definition) {
        return [
          {
            ...node,
            children: node.children?.flatMap((child) => expandLocalComponents(child, definitions)),
          },
        ];
      }

      const bindings: Record<string, LocalBinding> = {};
      for (const propName of definition.props) {
        const propValue = node.props?.[propName];
        if (propValue) {
          bindings[propName] = { kind: "attr", value: propValue };
        }
      }
      if ((node.children ?? []).length > 0) {
        bindings.children = {
          kind: "children",
          value: (node.children ?? []).flatMap((child) =>
            expandLocalComponents(child, definitions),
          ),
        };
      }

      return instantiateLocalNode(definition.template, bindings).flatMap((child) =>
        expandLocalComponents(child, definitions),
      );
    }
    default:
      return [node];
  }
}

function normalizePropType(name: string, type: string): ParsedValueType | string {
  if (
    name === "children" &&
    (type === "ReactNode" ||
      type === "React.ReactNode" ||
      type === "TemplateNode")
  ) {
    return "children";
  }
  if (type === "TemplateNode") {
    return "template-node";
  }
  if (type === "TemplateNode[]") {
    return "template-node[]";
  }
  if (type === "TemplateNode[][]") {
    return "template-node[][]";
  }
  if (type === "ClassValue") {
    return "string";
  }
  if (type.includes("|")) {
    return "string";
  }
  if (type === "string") {
    return "string";
  }
  if (type === "boolean") {
    return "bool";
  }
  return type;
}

function parseProps(source: string): TemplateProp[] {
  const propsTypeIndex = source.search(/export\s+type\s+Props\s*=/);
  if (propsTypeIndex === -1) {
    return [];
  }

  const openBraceIndex = source.indexOf("{", propsTypeIndex);
  if (openBraceIndex === -1) {
    return [];
  }

  const propsSection = readBalancedSection(source, openBraceIndex, "{", "}");

  return propsSection.body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const normalized = line.replace(/;$/, "");
      const colonIndex = normalized.indexOf(":");
      if (colonIndex === -1) {
        throw new Error(`Could not parse prop declaration: ${line}`);
      }
      const left = normalized.slice(0, colonIndex).trim();
      const right = normalized.slice(colonIndex + 1).trim();
      const optional = left.endsWith("?");
      const name = optional ? left.slice(0, -1) : left;
      return {
        name,
        type: normalizePropType(name, right),
        optional,
      };
    });
}

function readTypeAliasBody(source: string, startIndex: number): { body: string; nextIndex: number } {
  let index = startIndex;
  let quote: string | null = null;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let angleDepth = 0;

  while (index < source.length) {
    const char = source[index];
    const prev = index > 0 ? source[index - 1] : "";

    if (quote) {
      if (char === quote && prev !== "\\") {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      index += 1;
      continue;
    }

    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (char === "<") angleDepth += 1;
    if (char === ">") angleDepth = Math.max(0, angleDepth - 1);

    if (
      char === ";" &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      parenDepth === 0 &&
      angleDepth === 0
    ) {
      return {
        body: source.slice(startIndex, index).trim(),
        nextIndex: index + 1,
      };
    }

    index += 1;
  }

  throw new Error("Unterminated type alias");
}

function parseSupportingTypes(source: string): string[] {
  const supportingTypes: string[] = [];
  const pattern = /(?:^|\n)\s*(export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g;

  for (const match of source.matchAll(pattern)) {
    const name = match[2];
    if (!name || name === "Props") {
      continue;
    }

    const matchIndex = match.index ?? 0;
    const exportPrefix = match[1] ?? "";
    const typeIndex = source.indexOf(`${exportPrefix}type ${name}`, matchIndex);
    const equalsIndex = source.indexOf("=", typeIndex);
    if (typeIndex === -1 || equalsIndex === -1) {
      continue;
    }

    const { body } = readTypeAliasBody(source, equalsIndex + 1);
    supportingTypes.push(`${exportPrefix}type ${name} = ${body};`);
  }

  return supportingTypes;
}

function parseImports(source: string): TemplateImport[] {
  return Array.from(
    source.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+["'](.+?)["'];?/g),
  ).map((match) => ({
    localName: match[1],
    source: match[2],
  }));
}

/**
 * Parses a template module into the portable compiler representation.
 */
export function parseTemplateFile(source: string): ParsedTemplate {
  const imports = parseImports(source);
  const nameMatch =
    source.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/) ??
    source.match(/export\s+function\s+([A-Za-z0-9_]+)/);
  if (!nameMatch) {
    throw new Error("Template must export a named function component");
  }

  const props = parseProps(source);
  const typeDefinitions = parseTypeDefinitions(source);
  const supportingTypes = parseSupportingTypes(source);
  const localComponents = parseLocalComponents(source, nameMatch[1]);
  const markup = extractReturnMarkup(source, source.indexOf(nameMatch[0]));

  const varTypes = Object.fromEntries(
    props.map((prop) => [prop.name, prop.type as ParsedValueType]),
  );
  const parsed = parseNodes(markup, 0, null, varTypes, typeDefinitions);
  const name = nameMatch[1];
  const baseTemplate =
    parsed.nodes.length === 1 ? parsed.nodes[0] : fragmentNode(parsed.nodes);
  const expandedNodes = expandLocalComponents(baseTemplate, localComponents);
  const template =
    expandedNodes.length === 1 ? expandedNodes[0] : fragmentNode(expandedNodes);

  return {
    name,
    fileName: name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
    imports,
    props,
    supportingTypes,
    template,
  };
}
