import type { AttrValue, ClassItem, Node } from "./ast.js";
import type {
  ClassNameMergingConfig,
  JavaScriptClassMergeFunction,
} from "../config.js";

export type JavaScriptClassMergeTarget = "react" | "staticJsx";

export function classMergeMode(
  config?: ClassNameMergingConfig,
): "off" | "dynamic-only" | "always" {
  if (!config) {
    return "off";
  }
  return config.mode ?? "dynamic-only";
}

export function isClassNameOverride(item: ClassItem): boolean {
  return item.kind === "dynamic" && item.expr.kind === "var" && item.expr.name === "className";
}

export function shouldMergeClassList(
  value: Extract<AttrValue, { kind: "classList" }>,
  config?: ClassNameMergingConfig,
): boolean {
  const mode = classMergeMode(config);
  if (mode === "off") {
    return false;
  }
  return mode === "always" || value.items.some(isClassNameOverride);
}

export function javascriptClassMergeFunction(
  config: ClassNameMergingConfig | undefined,
  target: JavaScriptClassMergeTarget,
): JavaScriptClassMergeFunction {
  return config?.[target] ?? {
    from: "tailwind-merge",
    import: "twMerge",
  };
}

export function javascriptClassMergeImport(
  config: ClassNameMergingConfig | undefined,
  target: JavaScriptClassMergeTarget,
): string {
  const implementation = javascriptClassMergeFunction(config, target);
  if (implementation.import === "default") {
    return `import __katachiMergeClasses from ${JSON.stringify(implementation.from)};`;
  }
  return `import { ${implementation.import} as __katachiMergeClasses } from ${JSON.stringify(implementation.from)};`;
}

function attrUsesClassMerge(value: AttrValue, config?: ClassNameMergingConfig): boolean {
  return value.kind === "classList" && shouldMergeClassList(value, config);
}

export function nodeUsesClassMerge(
  node: Node,
  config?: ClassNameMergingConfig,
  target?: string,
): boolean {
  if (classMergeMode(config) === "off") {
    return false;
  }

  switch (node.kind) {
    case "fragment":
      return node.children.some((child) => nodeUsesClassMerge(child, config, target));
    case "doctype":
    case "text":
    case "slot":
    case "print":
      return false;
    case "if":
      return node.then.some((child) => nodeUsesClassMerge(child, config, target)) ||
        (node.else ?? []).some((child) => nodeUsesClassMerge(child, config, target));
    case "for":
      return node.children.some((child) => nodeUsesClassMerge(child, config, target));
    case "element":
      return Object.values(node.attrs ?? {}).some((value) => attrUsesClassMerge(value, config)) ||
        Object.values(target ? (node.targetAttrs?.[target] ?? {}) : {}).some((value) =>
          attrUsesClassMerge(value, config)
        ) ||
        (node.children ?? []).some((child) => nodeUsesClassMerge(child, config, target));
    case "component":
      return Object.values(node.props ?? {}).some((value) => attrUsesClassMerge(value, config)) ||
        Object.values(target ? (node.targetAttrs?.[target] ?? {}) : {}).some((value) =>
          attrUsesClassMerge(value, config)
        ) ||
        (node.children ?? []).some((child) => nodeUsesClassMerge(child, config, target));
  }
}
