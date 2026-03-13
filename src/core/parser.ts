import type { AttrValue, ClassItem, Expr, Node } from "./ast.js";
import {
  and,
  classList,
  componentNode,
  concatAttr,
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
  raw,
  s,
  slotNode,
  textAttr,
  textNode,
  v,
} from "./ast.js";
import type { ParsedTemplate, ParseNodesResult, TemplateImport, TemplateProp } from "./types.js";

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

  // Binary operators are searched BEFORE unary `!` because they have lower
  // precedence.  `!isEmpty(x) && y` must split at `&&` first, yielding
  // `and(not(isEmpty(x)), y)` — not `not(and(isEmpty(x), y))`.
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

  if (input.startsWith("!(") && input.endsWith(")")) {
    return not(parseExpr(input.slice(2, -1)));
  }

  if (input.startsWith("!") && !input.startsWith("!=")) {
    return not(parseExpr(input.slice(1)));
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
    if (call.name === "len") {
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

function parseClassList(source: string): AttrValue {
  const input = source.trim();
  const listBody = input.slice(1, -1);
  const items: ClassItem[] = splitTopLevel(listBody, ",").map((item) => {
    const trimmed = item.trim();

    // Conditional class: `expr && "class-name"`
    // Use the LAST top-level && so that chained conditions like
    // `isSome(x) && !isEmpty(x) && "cls"` correctly split into
    // test=`isSome(x) && !isEmpty(x)` and value=`"cls"`
    const andIndex = findLastTopLevelOperator(trimmed, "&&");
    if (andIndex !== -1) {
      const test = trimmed.slice(0, andIndex).trim();
      const value = trimmed.slice(andIndex + 2).trim();
      return {
        kind: "when" as const,
        test: parseExpr(test),
        value: unquote(value),
      };
    }

    // Bare quoted string: "class-name" or 'class-name'
    const unquoted = unquote(trimmed);
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return {
        kind: "static" as const,
        value: unquoted,
      };
    }

    // Bare identifier or expression: className, someVar, etc.
    // These are dynamic class items (variable references)
    if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(trimmed)) {
      return {
        kind: "dynamic" as const,
        expr: v(trimmed),
      };
    }

    // Any other expression (function calls, etc.)
    return {
      kind: "dynamic" as const,
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
    // Non-class array attributes: parse as concat (e.g., href={["#", variant, "-icon"]})
    if (inner.startsWith("[") && inner.endsWith("]")) {
      const arrayBody = inner.slice(1, -1);
      const parts = splitTopLevel(arrayBody, ",").map((part) => parseExpr(part.trim()));
      return concatAttr(...parts);
    }
    return exprAttr(parseExpr(inner));
  }

  return textAttr(unquote(input));
}

function parseTag(openTagSource: string): {
  tagName: string;
  attrs: Record<string, AttrValue>;
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

    attrs[attrName] = parseAttrValue(attrName, value);
  }

  return {
    tagName,
    attrs,
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

function parseNodes(source: string, startIndex = 0, untilTagName: string | null = null): ParseNodesResult {
  const nodes: Node[] = [];
  let index = startIndex;

  while (index < source.length) {
    if (source.startsWith("</", index)) {
      const end = source.indexOf(">", index);
      const closingTag = source.slice(index + 2, end).trim();
      if (untilTagName && closingTag === untilTagName) {
        return { nodes, nextIndex: end + 1 };
      }
      throw new Error(`Unexpected closing tag: ${closingTag}`);
    }

    if (source[index] === "<") {
      const openTagSource = readOpenTag(source, index);
      const { tagName, attrs, selfClosing } = parseTag(openTagSource);
      index += openTagSource.length;

      if (selfClosing) {
        if (/^[A-Z]/.test(tagName)) {
          nodes.push(componentNode(tagName, attrs));
        } else {
          nodes.push(elementNode(tagName, normalizeElementAttrs(attrs)));
        }
        continue;
      }

      const parsedChildren = parseNodes(source, index, tagName);
      index = parsedChildren.nextIndex;

      if (tagName === "if" || tagName === "If") {
        const test = attrs.test?.kind === "expr" ? attrs.test.expr : null;
        if (!test) {
          throw new Error("<If> requires a test expression");
        }
        nodes.push(ifNode(test, parsedChildren.nodes));
        continue;
      }

      if (tagName === "for" || tagName === "For") {
        const each = attrs.each?.kind === "expr" ? attrs.each.expr : null;
        const item = attrs.as?.kind === "text" ? attrs.as.value : null;
        const indexName = attrs.index?.kind === "text" ? attrs.index.value : null;
        if (!each || !item) {
          throw new Error('<For> requires `each={...}` and `as="..."`');
        }
        nodes.push(forNode(item, each, parsedChildren.nodes, indexName));
        continue;
      }

      if (/^[A-Z]/.test(tagName)) {
        nodes.push(componentNode(tagName, attrs, parsedChildren.nodes));
      } else {
        nodes.push(elementNode(tagName, normalizeElementAttrs(attrs), parsedChildren.nodes));
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
          nodes.push(printNode(parseExpr(inner)));
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

function normalizePropType(type: string): string {
  if (
    type === "ReactNode" ||
    type === "React.ReactNode" ||
    type === "TemplateNode"
  ) {
    return "children";
  }
  if (
    type === "ReactNode[]" ||
    type === "React.ReactNode[]" ||
    type === "TemplateNode[]"
  ) {
    return "children[]";
  }
  if (
    type === "ReactNode[][]" ||
    type === "React.ReactNode[][]" ||
    type === "TemplateNode[][]"
  ) {
    return "children[][]";
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
  const propsMatch = source.match(/export\s+type\s+Props\s*=\s*\{([\s\S]*?)\}/);
  if (!propsMatch) {
    return [];
  }

  return propsMatch[1]
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
        type: normalizePropType(right),
        optional,
      };
    });
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
  const returnIndex = source.indexOf("return");
  if (returnIndex === -1) {
    throw new Error("Template must return JSX");
  }

  let exprStart = returnIndex + "return".length;
  while (/\s/.test(source[exprStart])) {
    exprStart += 1;
  }

  let markup = "";

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

    markup = source.slice(exprStart + 1, parenEnd).trim();
  } else {
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

    markup = source.slice(exprStart, exprEnd).trim();
  }

  const parsed = parseNodes(markup);
  if (parsed.nodes.length !== 1) {
    throw new Error("Template body must contain exactly one root node");
  }

  const name = nameMatch[1];

  return {
    name,
    fileName: name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
    imports,
    props,
    template: parsed.nodes[0],
  };
}
