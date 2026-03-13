import type { AttrValue, Expr, Node } from "../core/ast.js";
import type { BuildTemplate } from "../core/types.js";
import {
  buildReactComponentSource,
  emitTsxExpr,
  emitReactNode,
} from "./shared.js";

/**
 * HTML attribute name → React JSX equivalent.
 */
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

/**
 * Boolean HTML attributes that should emit boolean values instead of strings in React.
 */
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

/**
 * Converts a CSS property name to its camelCase React equivalent.
 */
function cssPropToCamelCase(prop: string): string {
  // Handle vendor prefixes like -webkit-, -moz-, etc.
  const cleaned = prop.startsWith("-") ? prop.slice(1) : prop;
  return cleaned.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

/**
 * Parses a static CSS string into a React CSSProperties-style object literal.
 * e.g., "font-variant-ligatures: none; color: red" → { fontVariantLigatures: "none", color: "red" }
 */
function cssStringToReactStyle(css: string): string {
  const declarations = css
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);

  const props = declarations.map((decl) => {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) return null;
    const prop = decl.slice(0, colonIdx).trim();
    const value = decl.slice(colonIdx + 1).trim();
    const reactProp = cssPropToCamelCase(prop);
    // Numeric values without units should be numbers, but CSS values are generally strings
    return `${reactProp}: ${JSON.stringify(value)}`;
  }).filter(Boolean);

  return `{{ ${props.join(", ")} }}`;
}

/**
 * Emits a concat AttrValue as a React-compatible expression.
 * For style attributes, converts to CSSProperties object.
 * For other attributes, emits as template literal.
 */
function emitConcatValue(parts: Expr[], attrName: string): string {
  if (attrName === "style") {
    return emitConcatStyle(parts);
  }

  // Build a template literal from the parts
  const segments = parts.map((part) => {
    if (part.kind === "string") {
      return part.value;
    }
    return `\${${emitTsxExpr(part)}}`;
  });
  return `{\`${segments.join("")}\`}`;
}

/**
 * Converts a concat-style style attribute into a React CSSProperties object.
 * e.g., ["background-color: ", color] → {{ backgroundColor: color }}
 */
function emitConcatStyle(parts: Expr[]): string {
  // Reconstruct the CSS template from the parts and parse it
  // Strategy: join string parts and expression placeholders, then parse declarations
  const declarations: { prop: string; valueParts: Expr[] }[] = [];
  let currentProp = "";
  let currentValueParts: Expr[] = [];
  let parsingProp = true;

  for (const part of parts) {
    if (part.kind === "string") {
      const text = part.value;
      let remaining = text;

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
          // Parsing value
          const semiIdx = remaining.indexOf(";");
          if (semiIdx !== -1) {
            const valueBefore = remaining.slice(0, semiIdx).trim();
            if (valueBefore) {
              currentValueParts.push({ kind: "string", value: valueBefore });
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
    } else {
      // Expression part
      if (parsingProp) {
        // Unusual: expression in property name position. Treat as dynamic.
        currentProp += `__expr__`;
        currentValueParts.push(part);
      } else {
        currentValueParts.push(part);
      }
    }
  }

  // Flush remaining declaration
  if (currentProp.trim() && currentValueParts.length > 0) {
    declarations.push({ prop: currentProp.trim(), valueParts: currentValueParts });
  }

  const props = declarations.map(({ prop, valueParts }) => {
    const reactProp = cssPropToCamelCase(prop);
    if (valueParts.length === 1 && valueParts[0].kind === "string") {
      return `${reactProp}: ${JSON.stringify(valueParts[0].value)}`;
    }
    if (valueParts.length === 1) {
      return `${reactProp}: ${emitTsxExpr(valueParts[0])}`;
    }
    // Multiple parts: use template literal
    const segments = valueParts.map((p) =>
      p.kind === "string" ? p.value : `\${${emitTsxExpr(p)}}`,
    );
    return `${reactProp}: \`${segments.join("")}\``;
  });

  return `{{ ${props.join(", ")} }}`;
}

/**
 * Maps an HTML attribute name to its React JSX equivalent.
 */
function toReactAttrName(name: string): string {
  return HTML_TO_REACT_ATTR[name] ?? name;
}

/**
 * Emits attributes for React-compatible TSX output.
 */
function emitReactAttr(name: string, value: AttrValue): string {
  const attrName = toReactAttrName(name);

  switch (value.kind) {
    case "text": {
      // Handle style attribute: convert CSS string to CSSProperties object
      if (attrName === "style") {
        return `${attrName}=${cssStringToReactStyle(value.value)}`;
      }
      // Handle boolean attributes: emit boolean value instead of string
      if (BOOLEAN_ATTRS.has(attrName)) {
        if (value.value === "true" || value.value === "") {
          return `${attrName}={true}`;
        }
        if (value.value === "false") {
          return `${attrName}={false}`;
        }
      }
      return `${attrName}=${JSON.stringify(value.value)}`;
    }
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
      return `${attrName}=${emitConcatValue(value.parts, attrName)}`;
  }
}

export function emitReact(node: Node, indent = 0): string {
  return emitReactNode(node, emitReactAttr, indent);
}

export function emitReactComponent(template: BuildTemplate): string {
  return buildReactComponentSource(template, emitReact(template.template, 2));
}
