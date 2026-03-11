import { existsSync, readFileSync } from "node:fs";

export interface Fixture {
  name: string;
  source: string;
  generated: string;
}

/**
 * Canonicalizes Askama/HTML output enough to separate semantic regressions from
 * serialization and formatting differences.
 */
export function normalizeAskama(source: string): string {
  const input = source.replace(/\r\n/g, "\n");
  const tokens: string[] = [];
  let index = 0;

  while (index < input.length) {
    if (input.startsWith("{{", index)) {
      const end = input.indexOf("}}", index);
      tokens.push(normalizeAskamaPrint(input.slice(index, end + 2)));
      index = end + 2;
      continue;
    }

    if (input.startsWith("{%", index)) {
      const end = input.indexOf("%}", index);
      tokens.push(normalizeAskamaStatement(input.slice(index, end + 2)));
      index = end + 2;
      continue;
    }

    if (input[index] === "<") {
      const { tag, nextIndex } = readHtmlTag(input, index);
      tokens.push(normalizeHtmlTag(tag));
      index = nextIndex;
      continue;
    }

    let end = index;
    while (
      end < input.length &&
      !input.startsWith("{{", end) &&
      !input.startsWith("{%", end) &&
      input[end] !== "<"
    ) {
      end += 1;
    }

    const text = input.slice(index, end).replace(/\s+/g, " ").trim();
    if (text) {
      tokens.push(text);
    }
    index = end;
  }

  let normalized = tokens.join("");
  let previous = "";

  normalized = normalized.replace(
    /<(img|input|br|hr|meta|link|source|track|wbr|area|base|col|embed|param)([^>]*?)(?<!\/)>/gi,
    "<$1$2/>",
  );

  while (previous !== normalized) {
    previous = normalized;
    normalized = normalized.replace(
      /<([A-Za-z][A-Za-z0-9:_-]*)([^>]*)><\/\1>/g,
      "<$1$2/>",
    );
  }

  return normalized;
}

function readTemplateBlock(
  source: string,
  startIndex: number,
): { block: string; nextIndex: number } | null {
  const delimiter = source.startsWith("{%", startIndex)
    ? "%}"
    : source.startsWith("{{", startIndex)
      ? "}}"
      : null;

  if (!delimiter) {
    return null;
  }

  const end = source.indexOf(delimiter, startIndex);
  if (end === -1) {
    return {
      block: source.slice(startIndex),
      nextIndex: source.length,
    };
  }

  return {
    block: source.slice(startIndex, end + delimiter.length),
    nextIndex: end + delimiter.length,
  };
}

function readHtmlTag(source: string, startIndex: number): { tag: string; nextIndex: number } {
  let index = startIndex;
  let quote: string | null = null;

  while (index < source.length) {
    const templateBlock = readTemplateBlock(source, index);
    if (templateBlock) {
      index = templateBlock.nextIndex;
      continue;
    }

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

    if (char === ">") {
      return {
        tag: source.slice(startIndex, index + 1),
        nextIndex: index + 1,
      };
    }

    index += 1;
  }

  return {
    tag: source.slice(startIndex),
    nextIndex: source.length,
  };
}

function normalizeAskamaPrint(token: string): string {
  return `{{${token.slice(2, -2).trim()}}}`;
}

function normalizeAskamaStatement(token: string): string {
  return `{%${token.slice(2, -2).trim()}%}`;
}

function normalizeAttributeValue(name: string, rawValue: string): string {
  let value = rawValue
    .replace(/\r\n/g, "\n")
    .replace(/\{\{\s*/g, "{{")
    .replace(/\s*\}\}/g, "}}")
    .replace(/\{%\s*/g, "{%")
    .replace(/\s*%\}/g, "%}")
    .replace(/\s+/g, " ")
    .trim();

  if (name === "class" || name === "className") {
    value = value.replace(/%\}\s+\{%/g, "%}{%");
  }

  return value;
}

function normalizeHtmlTag(tag: string): string {
  const voidTags = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);

  const trimmed = tag.trim();
  if (trimmed.startsWith("</")) {
    const name = trimmed.slice(2, -1).trim();
    return `</${name}>`;
  }

  const selfClosing = trimmed.endsWith("/>");
  const body = trimmed.slice(1, trimmed.length - (selfClosing ? 2 : 1)).trim();
  let cursor = 0;
  let tagName = "";

  while (cursor < body.length && !/\s/.test(body[cursor])) {
    tagName += body[cursor];
    cursor += 1;
  }

  const attrs: string[] = [];
  const seenAttrs = new Set<string>();

  while (cursor < body.length) {
    while (cursor < body.length && /\s/.test(body[cursor])) {
      cursor += 1;
    }

    if (cursor >= body.length) {
      break;
    }

    let name = "";
    while (cursor < body.length && !/[\s=]/.test(body[cursor])) {
      name += body[cursor];
      cursor += 1;
    }

    while (cursor < body.length && /\s/.test(body[cursor])) {
      cursor += 1;
    }

    let value: string | null = null;
    if (body[cursor] === "=") {
      cursor += 1;
      while (cursor < body.length && /\s/.test(body[cursor])) {
        cursor += 1;
      }

      if (body[cursor] === '"' || body[cursor] === "'") {
        const quote = body[cursor];
        cursor += 1;
        let rawValue = "";
        while (cursor < body.length) {
          const templateBlock = readTemplateBlock(body, cursor);
          if (templateBlock) {
            rawValue += templateBlock.block;
            cursor = templateBlock.nextIndex;
            continue;
          }

          if (body[cursor] === quote) {
            break;
          }

          rawValue += body[cursor];
          cursor += 1;
        }
        cursor += 1;
        value = normalizeAttributeValue(name, rawValue);
      } else {
        let rawValue = "";
        while (cursor < body.length && !/\s/.test(body[cursor])) {
          rawValue += body[cursor];
          cursor += 1;
        }
        value = normalizeAttributeValue(name, rawValue);
      }
    }

    if (seenAttrs.has(name)) {
      continue;
    }
    seenAttrs.add(name);

    attrs.push(value === null ? name : `${name}="${value}"`);
  }

  const joinedAttrs = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
  const forceSelfClosing = selfClosing || voidTags.has(tagName);
  return forceSelfClosing
    ? `<${tagName}${joinedAttrs}/>`
    : `<${tagName}${joinedAttrs}>`;
}

/**
 * Runs the Askama fixture comparison and sets a failing process exit code on
 * functional mismatches.
 */
export interface VerifyAskamaOptions {
  fixtures?: Fixture[];
  logger?: Pick<Console, "log" | "error">;
}

export interface VerifyAskamaResult {
  ok: string[];
  formatOnly: string[];
  failures: string[];
  missing: string[];
}

export function verifyAskamaFixtures(options: VerifyAskamaOptions = {}): VerifyAskamaResult {
  const fixtureList = options.fixtures ?? [];
  const logger = options.logger ?? console;
  let hasFailure = false;
  let hasFormatOnly = false;
  const result: VerifyAskamaResult = {
    ok: [],
    formatOnly: [],
    failures: [],
    missing: [],
  };

  for (const fixture of fixtureList) {
    if (!existsSync(fixture.generated)) {
      hasFailure = true;
      result.missing.push(fixture.name);
      logger.error(`missing generated: ${fixture.name}`);
      continue;
    }

    const sourceRaw = readFileSync(fixture.source, "utf8").replace(/\r\n/g, "\n").trim();
    const generatedRaw = readFileSync(fixture.generated, "utf8").replace(/\r\n/g, "\n").trim();
    const source = normalizeAskama(sourceRaw);
    const generated = normalizeAskama(generatedRaw);

    if (sourceRaw === generatedRaw) {
      result.ok.push(fixture.name);
      logger.log(`ok: ${fixture.name}`);
      continue;
    }

    if (source === generated) {
      hasFormatOnly = true;
      result.formatOnly.push(fixture.name);
      logger.log(`format-only: ${fixture.name}`);
      continue;
    }

    hasFailure = true;
    result.failures.push(fixture.name);
    logger.error(`functional mismatch: ${fixture.name}`);
  }

  if (hasFailure) {
    process.exitCode = 1;
  }

  if (!hasFailure && hasFormatOnly) {
    logger.log("no functional mismatches; only formatting/serialization differences remain");
  }

  return result;
}
