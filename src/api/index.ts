/**
 * Public API helpers exposed to Katachi template files.
 *
 * These exports exist primarily for editor support and package consumers. The
 * Katachi compiler parses template source text directly, so these helpers are
 * not expected to execute in normal builds.
 */
export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[];

export type TemplateNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | TemplateNode[];

export type TemplateTargetName = "react" | "jsx-static" | "askama" | "liquid";

export type TemplateTargetAttrValue = string | number | boolean | null | undefined;

export type TemplateTargetAttrMap = Record<string, TemplateTargetAttrValue>;

export type TemplateTargetAttrs = Partial<Record<TemplateTargetName, TemplateTargetAttrMap>>;

export type IfProps = {
  test: unknown;
  children?: TemplateNode;
};

export type ElseProps = {
  children?: TemplateNode;
};

export type ForAliasProps<T = unknown> = {
  each: readonly T[] | T[] | null | undefined;
  as: string;
  index?: string;
  children?: TemplateNode;
};

export type ForRenderProps<T = unknown> = {
  each: readonly T[] | T[] | null | undefined;
  children: (item: T, index: number) => TemplateNode;
};

/**
 * Placeholder runtime export for template files. The compiler reads source
 * templates directly and never evaluates this function during normal use.
 */
export function If(_props: IfProps): TemplateNode {
  return null;
}

/**
 * Placeholder runtime export for template files. Parsed specially as the else
 * branch inside a surrounding <If>.
 */
export function Else(_props: ElseProps): TemplateNode {
  return null;
}

/**
 * Placeholder runtime export for template files. The compiler reads source
 * templates directly and never evaluates this function during normal use.
 */
export function For<T>(_props: ForRenderProps<T>): TemplateNode;
export function For<T>(_props: ForAliasProps<T>): TemplateNode;
export function For<T>(_props: ForRenderProps<T> | ForAliasProps<T>): TemplateNode {
  return null;
}

/**
 * Portable length helper for Katachi templates.
 */
export function length(
  value: { length: number } | string | readonly unknown[] | null | undefined,
): number {
  return value?.length ?? 0;
}

/**
 * Portable emptiness helper for Katachi templates.
 */
export function isEmpty(
  value: { length: number } | string | readonly unknown[] | null | undefined,
): boolean {
  return (value?.length ?? 0) === 0;
}

/**
 * Portable presence helper for Katachi templates.
 */
export function isSome<T>(value: T | null | undefined): value is T {
  return value != null;
}

/**
 * Portable absence helper for Katachi templates.
 */
export function isNone<T>(value: T | null | undefined): value is null | undefined {
  return value == null;
}
