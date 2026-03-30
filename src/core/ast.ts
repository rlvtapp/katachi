/**
 * Canonical portable AST used by Katachi after parsing authoring input.
 *
 * Targets emit from this model instead of parsing templates themselves.
 */

export type Expr =
  | { kind: "var"; name: string }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "intrinsic"; name: "len" | "isEmpty" | "isSome" | "isNone"; args: Expr[] }
  | { kind: "raw"; source: string }
  | { kind: "eq"; left: Expr; right: Expr }
  | { kind: "neq"; left: Expr; right: Expr }
  | { kind: "and"; left: Expr; right: Expr }
  | { kind: "or"; left: Expr; right: Expr }
  | { kind: "not"; expr: Expr };

export type ClassItem =
  | { kind: "static"; value: string }
  | { kind: "when"; test: Expr; value: string }
  | { kind: "dynamic"; expr: Expr };

export type AttrValue =
  | { kind: "text"; value: string }
  | { kind: "expr"; expr: Expr }
  | { kind: "classList"; items: ClassItem[] }
  | { kind: "concat"; parts: Expr[] };

export type TargetAttrs = Record<string, Record<string, AttrValue>>;

export type TagName =
  | { kind: "static"; name: string }
  | { kind: "dynamic"; parts: Expr[] };

export type Node =
  | { kind: "fragment"; children: Node[] }
  | { kind: "doctype"; value: string }
  | { kind: "text"; value: string }
  | { kind: "slot"; name: string }
  | { kind: "print"; expr: Expr; safe?: boolean }
  | { kind: "if"; test: Expr; then: Node[]; else?: Node[] }
  | {
      kind: "for";
      item: string;
      each: Expr;
      children: Node[];
      indexName?: string | null;
    }
  | {
      kind: "element";
      tag: TagName;
      attrs?: Record<string, AttrValue>;
      targetAttrs?: TargetAttrs;
      children?: Node[];
    }
  | {
      kind: "component";
      name: string;
      props?: Record<string, AttrValue>;
      targetAttrs?: TargetAttrs;
      children?: Node[];
    };

export const v = (name: string): Expr => ({ kind: "var", name });
export const s = (value: string): Expr => ({ kind: "string", value });
export const b = (value: boolean): Expr => ({ kind: "bool", value });
export const n = (value: number): Expr => ({ kind: "number", value });
export const intrinsic = (
  name: "len" | "isEmpty" | "isSome" | "isNone",
  ...args: Expr[]
): Expr => ({
  kind: "intrinsic",
  name,
  args,
});
export const raw = (source: string): Expr => ({ kind: "raw", source });
export const eq = (left: Expr, right: Expr): Expr => ({ kind: "eq", left, right });
export const neq = (left: Expr, right: Expr): Expr => ({ kind: "neq", left, right });
export const and = (left: Expr, right: Expr): Expr => ({ kind: "and", left, right });
export const or = (left: Expr, right: Expr): Expr => ({ kind: "or", left, right });
export const not = (expr: Expr): Expr => ({ kind: "not", expr });

export const textAttr = (value: string): AttrValue => ({ kind: "text", value });
export const exprAttr = (expr: Expr): AttrValue => ({ kind: "expr", expr });
export const classList = (...items: ClassItem[]): AttrValue => ({ kind: "classList", items });
export const concatAttr = (...parts: Expr[]): AttrValue => ({ kind: "concat", parts });

export const textNode = (value: string): Node => ({ kind: "text", value });
export const fragmentNode = (children: Node[] = []): Node => ({ kind: "fragment", children });
export const doctypeNode = (value: string): Node => ({ kind: "doctype", value });
export const slotNode = (name: string): Node => ({ kind: "slot", name });
export const printNode = (expr: Expr, safe = false): Node => ({ kind: "print", expr, safe });
export const ifNode = (test: Expr, thenNodes: Node[], elseNodes: Node[] = []): Node => ({
  kind: "if",
  test,
  then: thenNodes,
  else: elseNodes,
});
export const forNode = (
  item: string,
  each: Expr,
  children: Node[] = [],
  indexName: string | null = null,
): Node => ({
  kind: "for",
  item,
  each,
  children,
  indexName,
});
export const elementNode = (
  tag: string | TagName,
  attrs: Record<string, AttrValue> = {},
  targetAttrs: TargetAttrs = {},
  children: Node[] = [],
): Node => ({
  kind: "element",
  tag: typeof tag === "string" ? { kind: "static", name: tag } : tag,
  attrs,
  targetAttrs,
  children,
});
export const componentNode = (
  name: string,
  props: Record<string, AttrValue> = {},
  targetAttrs: TargetAttrs = {},
  children: Node[] = [],
): Node => ({
  kind: "component",
  name,
  props,
  targetAttrs,
  children,
});
