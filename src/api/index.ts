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

export type IfProps = {
  test: unknown;
  children?: TemplateNode;
};

export type ForProps<T = unknown> = {
  each: readonly T[] | T[] | null | undefined;
  as: string;
  index?: string;
  children?: TemplateNode;
};

/**
 * Placeholder runtime export for template files. The compiler reads source
 * templates directly and never evaluates this function during normal use.
 */
export function If(_props: IfProps): TemplateNode {
  return null;
}

/**
 * Placeholder runtime export for template files. The compiler reads source
 * templates directly and never evaluates this function during normal use.
 */
export function For<T>(_props: ForProps<T>): TemplateNode {
  return null;
}

/**
 * Marks a printed value as safe in Katachi templates. This is a no-op at the
 * API layer because escaping is handled by target emitters.
 */
export function safe<T>(value: T): T {
  return value;
}

/**
 * Portable length helper for Katachi templates.
 */
export function len(
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
