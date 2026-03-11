import type { ClassValue, TemplateNode } from "./index";

declare global {
  namespace JSX {
    /**
     * Authoring templates do not produce real JSX runtime elements. The parser
     * reads the source text and lowers it into Katachi AST nodes instead.
     */
    type Element = TemplateNode;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface IntrinsicElements {
      [elemName: string]: {
        children?: TemplateNode;
        class?: ClassValue;
        className?: ClassValue;
        [attrName: string]: unknown;
      };
    }
  }
}

export {};
