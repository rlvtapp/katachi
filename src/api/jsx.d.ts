import type { ClassValue, TemplateNode, TemplateTargetAttrs } from "./index.js";

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

    interface IntrinsicAttributes {
      attrs?: TemplateTargetAttrs;
    }

    interface IntrinsicElements {
      [elemName: string]: {
        children?: TemplateNode;
        class?: ClassValue;
        className?: ClassValue;
        attrs?: TemplateTargetAttrs;
        [attrName: string]: unknown;
      };
    }
  }
}

export {};
