import type { AttrValue, Expr, Node } from "../core/ast.js";
import type { BuildTemplate } from "../core/types.js";
import { wrapHtmlAttribute } from "./shared.js";

interface LiquidContext {
  tempId: number;
}

interface LiquidValueResult {
  prelude: string[];
  source: string;
}

function nextTempName(context: LiquidContext, prefix: string): string {
  context.tempId += 1;
  return `__katachi_${prefix}_${context.tempId}`;
}

function pad(indent: number): string {
  return "  ".repeat(indent);
}

function escapeLiquidString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function translateTsxExprToLiquid(source: string): string {
  let result = source.trim();

  result = result.replace(/([A-Za-z0-9_().]+)\.clone\(\)\.unwrap\(\)/g, "$1");
  result = result.replace(/([A-Za-z0-9_().]+)\.unwrap\(\)/g, "$1");
  result = result.replace(/([A-Za-z0-9_().]+)\.is_some\(\)/g, "$1 != nil");
  result = result.replace(/([A-Za-z0-9_().]+)\.is_none\(\)/g, "$1 == nil");
  result = result.replace(/!\s*([A-Za-z0-9_().]+)\.is_empty\(\)/g, "$1 != blank");
  result = result.replace(/([A-Za-z0-9_().]+)\.is_empty\(\)/g, "$1 == blank");
  result = result.replace(/([A-Za-z0-9_().]+)\.len\(\)/g, "$1.size");
  result = result.replace(/\s===\s/g, " == ");
  result = result.replace(/\s!==\s/g, " != ");
  result = result.replace(/\s==\s/g, " == ");
  result = result.replace(/\s!=\s/g, " != ");
  result = result.replace(/\s&&\s/g, " and ");
  result = result.replace(/\s\|\|\s/g, " or ");

  return result;
}

function emitLiquidScalarExpr(expr: Expr): string | null {
  switch (expr.kind) {
    case "var":
      return expr.name;
    case "string":
      return `"${escapeLiquidString(expr.value)}"`;
    case "bool":
      return expr.value ? "true" : "false";
    case "number":
      return String(expr.value);
    case "intrinsic": {
      const [arg] = expr.args;
      const emittedArg = arg ? emitLiquidScalarExpr(arg) : null;
      if (!emittedArg) {
        return null;
      }
      if (expr.name === "len") {
        return `${emittedArg}.size`;
      }
      return null;
    }
    case "raw":
      return translateTsxExprToLiquid(expr.source);
    default:
      return null;
  }
}

function emitSimpleLiquidCondition(expr: Expr): string | null {
  switch (expr.kind) {
    case "var":
      return expr.name;
    case "bool":
      return expr.value ? "true" : "false";
    case "raw":
      return translateTsxExprToLiquid(expr.source);
    case "eq":
    case "neq": {
      const left = emitLiquidScalarExpr(expr.left);
      const right = emitLiquidScalarExpr(expr.right);
      if (!left || !right) {
        return null;
      }
      return `${left} ${expr.kind === "eq" ? "==" : "!="} ${right}`;
    }
    case "intrinsic": {
      const [arg] = expr.args;
      const emittedArg = arg ? emitLiquidScalarExpr(arg) : null;
      if (!emittedArg) {
        return null;
      }
      switch (expr.name) {
        case "isEmpty":
          return `${emittedArg} == blank`;
        case "isSome":
          return `${emittedArg} != nil`;
        case "isNone":
          return `${emittedArg} == nil`;
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

function materializeLiquidBooleanExpr(
  expr: Expr,
  context: LiquidContext,
  indent: number,
): LiquidValueResult {
  const simple = emitSimpleLiquidCondition(expr);
  if (simple) {
    return {
      prelude: [],
      source: simple,
    };
  }

  switch (expr.kind) {
    case "and": {
      const left = materializeLiquidBooleanExpr(expr.left, context, indent);
      const right = materializeLiquidBooleanExpr(expr.right, context, indent);
      const ref = nextTempName(context, "cond");
      return {
        prelude: [
          ...left.prelude,
          ...right.prelude,
          `${pad(indent)}{% assign ${ref} = false %}`,
          `${pad(indent)}{% if ${left.source} %}`,
          `${pad(indent + 1)}{% if ${right.source} %}`,
          `${pad(indent + 2)}{% assign ${ref} = true %}`,
          `${pad(indent + 1)}{% endif %}`,
          `${pad(indent)}{% endif %}`,
        ],
        source: ref,
      };
    }
    case "or": {
      const left = materializeLiquidBooleanExpr(expr.left, context, indent);
      const right = materializeLiquidBooleanExpr(expr.right, context, indent);
      const ref = nextTempName(context, "cond");
      return {
        prelude: [
          ...left.prelude,
          ...right.prelude,
          `${pad(indent)}{% assign ${ref} = false %}`,
          `${pad(indent)}{% if ${left.source} %}`,
          `${pad(indent + 1)}{% assign ${ref} = true %}`,
          `${pad(indent)}{% elsif ${right.source} %}`,
          `${pad(indent + 1)}{% assign ${ref} = true %}`,
          `${pad(indent)}{% endif %}`,
        ],
        source: ref,
      };
    }
    case "not": {
      const inner = materializeLiquidBooleanExpr(expr.expr, context, indent);
      const ref = nextTempName(context, "cond");
      return {
        prelude: [
          ...inner.prelude,
          `${pad(indent)}{% assign ${ref} = false %}`,
          `${pad(indent)}{% unless ${inner.source} %}`,
          `${pad(indent + 1)}{% assign ${ref} = true %}`,
          `${pad(indent)}{% endunless %}`,
        ],
        source: ref,
      };
    }
    default: {
      const ref = nextTempName(context, "cond");
      return {
        prelude: [
          `${pad(indent)}{% assign ${ref} = false %}`,
        ],
        source: ref,
      };
    }
  }
}

function materializeLiquidBooleanValue(
  expr: Expr,
  context: LiquidContext,
  indent: number,
): LiquidValueResult {
  const condition = materializeLiquidBooleanExpr(expr, context, indent);
  const ref = nextTempName(context, "bool");

  return {
    prelude: [
      ...condition.prelude,
      `${pad(indent)}{% assign ${ref} = false %}`,
      `${pad(indent)}{% if ${condition.source} %}`,
      `${pad(indent + 1)}{% assign ${ref} = true %}`,
      `${pad(indent)}{% endif %}`,
    ],
    source: ref,
  };
}

function emitLiquidInterpolatedValue(
  expr: Expr,
  context: LiquidContext,
  indent: number,
): LiquidValueResult {
  const scalar = emitLiquidScalarExpr(expr);
  if (scalar) {
    return {
      prelude: [],
      source: `{{ ${scalar} }}`,
    };
  }

  const booleanExpr = materializeLiquidBooleanValue(expr, context, indent);
  return {
    prelude: booleanExpr.prelude,
    source: `{{ ${booleanExpr.source} }}`,
  };
}

function emitLiquidComponentPropValue(
  value: AttrValue,
  context: LiquidContext,
  indent: number,
): LiquidValueResult {
  switch (value.kind) {
    case "text":
      return {
        prelude: [],
        source: `"${escapeLiquidString(value.value)}"`,
      };
    case "expr": {
      const scalar = emitLiquidScalarExpr(value.expr);
      if (scalar) {
        return {
          prelude: [],
          source: scalar,
        };
      }

      return materializeLiquidBooleanValue(value.expr, context, indent);
    }
    case "classList": {
      const classVar = nextTempName(context, "class");
      const captureLines = emitLiquidClassCapture(value, classVar, context, indent);
      return {
        prelude: captureLines,
        source: classVar,
      };
    }
  }
}

function emitLiquidClassCapture(
  value: Extract<AttrValue, { kind: "classList" }>,
  variableName: string,
  context: LiquidContext,
  indent: number,
): string[] {
  const prelude: string[] = [];
  const fragments: string[] = [];

  for (const item of value.items) {
    if (item.kind === "static") {
      fragments.push(item.value);
      continue;
    }

    const condition = materializeLiquidBooleanExpr(item.test, context, indent);
    prelude.push(...condition.prelude);
    fragments.push(`{% if ${condition.source} %}${item.value}{% endif %}`);
  }

  return [
    ...prelude,
    `${pad(indent)}{% capture ${variableName} %}${fragments.join(" ").trim()}{% endcapture %}`,
  ];
}

function emitLiquidAttr(
  name: string,
  value: AttrValue,
  context: LiquidContext,
  indent: number,
): LiquidValueResult {
  switch (value.kind) {
    case "text":
      return {
        prelude: [],
        source: `${name}=${wrapHtmlAttribute(value.value)}`,
      };
    case "expr": {
      const rendered = emitLiquidInterpolatedValue(value.expr, context, indent);
      return {
        prelude: rendered.prelude,
        source: `${name}=${wrapHtmlAttribute(rendered.source)}`,
      };
    }
    case "classList": {
      const prelude: string[] = [];
      const parts: string[] = [];

      for (const item of value.items) {
        if (item.kind === "static") {
          parts.push(item.value);
          continue;
        }

        const condition = materializeLiquidBooleanExpr(item.test, context, indent);
        prelude.push(...condition.prelude);
        parts.push(`{% if ${condition.source} %}${item.value}{% endif %}`);
      }

      return {
        prelude,
        source: `${name}=${wrapHtmlAttribute(parts.join(" ").trim())}`,
      };
    }
  }
}

function emitLiquidNode(node: Node, context: LiquidContext, indent = 0): string {
  switch (node.kind) {
    case "text":
      return `${pad(indent)}${node.value}`;
    case "slot":
      return `${pad(indent)}{{ ${node.name} }}`;
    case "print": {
      const rendered = emitLiquidInterpolatedValue(node.expr, context, indent);
      return [...rendered.prelude, `${pad(indent)}${rendered.source}`].join("\n");
    }
    case "if": {
      const condition = materializeLiquidBooleanExpr(node.test, context, indent);
      const thenBody = node.then.map((child) => emitLiquidNode(child, context, indent + 1)).join("\n");
      const elseBody = (node.else ?? [])
        .map((child) => emitLiquidNode(child, context, indent + 1))
        .join("\n");
      const lines = [...condition.prelude, `${pad(indent)}{% if ${condition.source} %}`, thenBody];
      if (elseBody) {
        lines.push(`${pad(indent)}{% else %}`, elseBody);
      }
      lines.push(`${pad(indent)}{% endif %}`);
      return lines.join("\n");
    }
    case "for": {
      const eachExpr = emitLiquidScalarExpr(node.each);
      if (!eachExpr) {
        throw new Error("Liquid target only supports scalar `each` expressions");
      }
      const body = node.children.map((child) => emitLiquidNode(child, context, indent + 1)).join("\n");
      const lines = [`${pad(indent)}{% for ${node.item} in ${eachExpr} %}`];
      if (node.indexName) {
        lines.push(`${pad(indent + 1)}{% assign ${node.indexName} = forloop.index0 %}`);
      }
      if (body) {
        lines.push(body);
      }
      lines.push(`${pad(indent)}{% endfor %}`);
      return lines.join("\n");
    }
    case "element": {
      const prelude: string[] = [];
      const attrEntries = Object.entries(node.attrs ?? {});
      const attrs = attrEntries.map(([name, value]) => {
        const rendered = emitLiquidAttr(name, value, context, indent);
        prelude.push(...rendered.prelude);
        return rendered.source;
      });

      const children = (node.children ?? []).map((child) => emitLiquidNode(child, context, indent + 1));
      const attrBlock = attrs.length
        ? `\n${attrs.map((attr) => `${pad(indent + 1)}${attr}`).join("\n")}\n${pad(indent)}`
        : "";

      if (children.length === 0) {
        return [...prelude, `${pad(indent)}<${node.tag}${attrBlock} />`].join("\n");
      }

      return [
        ...prelude,
        `${pad(indent)}<${node.tag}${attrBlock}>`,
        ...children,
        `${pad(indent)}</${node.tag}>`,
      ].join("\n");
    }
    case "component": {
      const registration = contextTemplateRegistry.get(context)?.[node.name];
      if (!registration?.liquidSnippet) {
        throw new Error(`Missing Liquid component registration for ${node.name}`);
      }

      const prelude: string[] = [];
      const args: string[] = [];

      for (const [propName, propValue] of Object.entries(node.props ?? {})) {
        const rendered = emitLiquidComponentPropValue(propValue, context, indent);
        prelude.push(...rendered.prelude);
        args.push(`${propName}: ${rendered.source}`);
      }

      if ((node.children ?? []).length > 0) {
        const childrenVar = nextTempName(context, "children_html");
        prelude.push(`${pad(indent)}{% capture ${childrenVar} %}`);
        prelude.push(
          ...(node.children ?? []).map((child) => emitLiquidNode(child, context, indent + 1)),
        );
        prelude.push(`${pad(indent)}{% endcapture %}`);
        args.push(`children_html: ${childrenVar}`);
      }

      const renderArgs = args.length > 0 ? `, ${args.join(", ")}` : "";
      return [
        ...prelude,
        `${pad(indent)}{% render '${registration.liquidSnippet}'${renderArgs} %}`,
      ].join("\n");
    }
  }
}

const contextTemplateRegistry = new WeakMap<LiquidContext, BuildTemplate["componentRegistry"]>();

export function emitLiquidSnippet(template: BuildTemplate): string {
  const context: LiquidContext = { tempId: 0 };
  contextTemplateRegistry.set(context, template.componentRegistry ?? {});
  return `${emitLiquidNode(template.template, context, 0)}\n`;
}
