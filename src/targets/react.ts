import type { AttrValue, Expr, Node } from "../core/ast.js";
import type { BuildTemplate } from "../core/types.js";
import {
  buildReactComponentSource,
  emitReactNode,
  emitTsxExpr,
  emitTsxWithHoists,
} from "./shared.js";

const HTML_TO_REACT_ATTR: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
  colspan: "colSpan",
  rowspan: "rowSpan",
  enctype: "encType",
  contenteditable: "contentEditable",
  crossorigin: "crossOrigin",
  accesskey: "accessKey",
  autocomplete: "autoComplete",
  autofocus: "autoFocus",
  autoplay: "autoPlay",
  cellpadding: "cellPadding",
  cellspacing: "cellSpacing",
  charset: "charSet",
  classid: "classID",
  frameborder: "frameBorder",
  novalidate: "noValidate",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-dasharray": "strokeDasharray",
  "stroke-dashoffset": "strokeDashoffset",
  "stroke-miterlimit": "strokeMiterlimit",
  "stroke-opacity": "strokeOpacity",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "clip-path": "clipPath",
  "clip-rule": "clipRule",
  "font-size": "fontSize",
  "font-family": "fontFamily",
  "font-weight": "fontWeight",
  "text-anchor": "textAnchor",
  "text-decoration": "textDecoration",
  "dominant-baseline": "dominantBaseline",
  viewbox: "viewBox",
};

const BOOLEAN_ATTRS = new Set([
  "contentEditable",
  "autoFocus",
  "autoPlay",
  "noValidate",
  "readOnly",
  "disabled",
  "checked",
  "selected",
  "multiple",
  "hidden",
  "open",
  "required",
  "spellCheck",
  "draggable",
]);

function cssPropToCamelCase(prop: string): string {
  const cleaned = prop.startsWith("-") ? prop.slice(1) : prop;
  return cleaned.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

function cssStringToReactStyle(css: string): string {
  const declarations = css
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);

  const props = declarations
    .map((decl) => {
      const colonIdx = decl.indexOf(":");
      if (colonIdx === -1) return null;
      const prop = decl.slice(0, colonIdx).trim();
      const value = decl.slice(colonIdx + 1).trim();
      return `${cssPropToCamelCase(prop)}: ${JSON.stringify(value)}`;
    })
    .filter(Boolean);

  return `{ ${props.join(", ")} }`;
}

function emitStringConcatExpr(expr: Expr): string {
  if (expr.kind === "and") {
    return `(${emitTsxExpr(expr.left)} ? ${emitTsxExpr(expr.right)} : "")`;
  }
  return emitTsxExpr(expr);
}

function emitConcatStyle(parts: Expr[]): string {
  const declarations: { prop: string; valueParts: Expr[] }[] = [];
  let currentProp = "";
  let currentValueParts: Expr[] = [];
  let parsingProp = true;

  for (const part of parts) {
    if (part.kind === "string") {
      let remaining = part.value;

      while (remaining.length > 0) {
        if (parsingProp) {
          const colonIdx = remaining.indexOf(":");
          if (colonIdx !== -1) {
            currentProp += remaining.slice(0, colonIdx);
            remaining = remaining.slice(colonIdx + 1).trimStart();
            parsingProp = false;
          } else {
            const semiIdx = remaining.indexOf(";");
            if (semiIdx !== -1) {
              remaining = remaining.slice(semiIdx + 1).trimStart();
            } else {
              currentProp += remaining;
              remaining = "";
            }
          }
        } else {
          const semiIdx = remaining.indexOf(";");
          if (semiIdx !== -1) {
            const beforeSemi = remaining.slice(0, semiIdx).trim();
            if (beforeSemi) {
              currentValueParts.push({ kind: "string", value: beforeSemi });
            }
            declarations.push({ prop: currentProp.trim(), valueParts: currentValueParts });
            currentProp = "";
            currentValueParts = [];
            parsingProp = true;
            remaining = remaining.slice(semiIdx + 1).trimStart();
          } else {
            if (remaining) {
              currentValueParts.push({ kind: "string", value: remaining });
            }
            remaining = "";
          }
        }
      }
    } else if (parsingProp) {
      currentProp += "__expr__";
      currentValueParts.push(part);
    } else {
      currentValueParts.push(part);
    }
  }

  if (currentProp.trim() && currentValueParts.length > 0) {
    declarations.push({ prop: currentProp.trim(), valueParts: currentValueParts });
  }

  const props = declarations.map(({ prop, valueParts }) => {
    const reactProp = cssPropToCamelCase(prop);
    if (valueParts.length === 1 && valueParts[0]?.kind === "string") {
      return `${reactProp}: ${JSON.stringify(valueParts[0].value)}`;
    }
    if (valueParts.length === 1 && valueParts[0]) {
      return `${reactProp}: ${emitStringConcatExpr(valueParts[0])}`;
    }
    const segments = valueParts.map((valuePart) =>
      valuePart.kind === "string" ? valuePart.value : `\${${emitStringConcatExpr(valuePart)}}`,
    );
    return `${reactProp}: \`${segments.join("")}\``;
  });

  return `{ ${props.join(", ")} }`;
}

function emitConcatValue(parts: Expr[], attrName: string): string {
  if (attrName === "style") {
    return emitConcatStyle(parts);
  }

  const segments = parts.map((part) => {
    if (part.kind === "string") {
      return part.value;
    }
    return `\${${emitStringConcatExpr(part)}}`;
  });

  return `\`${segments.join("")}\``;
}

function toReactAttrName(name: string): string {
  return HTML_TO_REACT_ATTR[name] ?? name;
}

function emitReactAttr(name: string, value: AttrValue): string | null {
  if (name.includes("@") || name.includes(":")) {
    return null;
  }

  const attrName = toReactAttrName(name);

  switch (value.kind) {
    case "text":
      if (attrName === "style") {
        return `${attrName}=${cssStringToReactStyle(value.value)}`;
      }
      if (BOOLEAN_ATTRS.has(attrName)) {
        if (value.value === "true" || value.value === "") {
          return `${attrName}={true}`;
        }
        if (value.value === "false") {
          return `${attrName}={false}`;
        }
      }
      return `${attrName}=${JSON.stringify(value.value)}`;
    case "expr":
      return `${attrName}={${emitTsxExpr(value.expr)}}`;
    case "classList": {
      const items = value.items.map((item) => {
        if (item.kind === "static") {
          return JSON.stringify(item.value);
        }
        if (item.kind === "dynamic") {
          return emitTsxExpr(item.expr);
        }
        return `${emitTsxExpr(item.test)} ? ${JSON.stringify(item.value)} : null`;
      });

      return `${attrName}={[${items.join(", ")}].filter(Boolean).join(" ")}`;
    }
    case "concat":
      return `${attrName}={${emitConcatValue(value.parts, attrName)}}`;
  }
}

export function emitReact(
  node: Node,
  indent = 0,
  context?: Parameters<typeof emitReactNode>[3],
): string {
  if (indent === 2 && node.kind === "element" && node.tag.kind === "static" && node.tag.name === "body") {
    const pad = "  ".repeat(indent);
    const children = (node.children ?? []).map((child) =>
      emitReactNode(child, emitReactAttr, indent + 1, context),
    );

    if (children.length === 0) {
      return `${pad}<></>`;
    }

    return `${pad}<>\n${children.join("\n")}\n${pad}</>`;
  }

  return emitReactNode(node, emitReactAttr, indent, context);
}

export function emitReactComponent(template: BuildTemplate): string {
  const { body, hoists } = emitTsxWithHoists(
    template,
    (node, _emitAttr, indent, context) => emitReact(node, indent, context),
    emitReactAttr,
  );
  return buildReactComponentSource(template, body, hoists);
}
