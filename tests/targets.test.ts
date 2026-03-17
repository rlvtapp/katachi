import assert from "node:assert/strict";
import test from "node:test";

import type { BuildTemplate } from "../src/core/types";
import { parseTemplateFile } from "../src/core/parser";
import { emitAskamaPartial } from "../src/targets/askama";
import { emitLiquidSnippet } from "../src/targets/liquid";
import { emitReactComponent } from "../src/targets/react";
import { emitStaticJsxComponent } from "../src/targets/static-jsx";

function buildTemplate(source: string): BuildTemplate {
  return {
    ...parseTemplateFile(source),
    sourcePath: "/virtual/templates/callout.template.tsx",
    relativePath: "callout.template.tsx",
    fileName: "callout",
    componentRegistry: {
      Icon: {
        reactImport: "./icon",
        include: "./includes/icon.html",
        liquidSnippet: "icon",
      },
    },
  };
}

test("React emitter produces import-aware TSX output", () => {
  const template = buildTemplate(`
import type { TemplateNode } from "@relevate/katachi";
import Icon from "./icon.template";

export type Props = {
  active: boolean;
  label: string;
  children?: TemplateNode;
};

export default function Callout({ active, label, children }: Props) {
  return (
    <div className={["base", active && "active"]}>
      <Icon icon={label} size="16" />
      {children}
    </div>
  );
}
`);

  const output = emitReactComponent(template);

  assert.match(output, /import Icon from "\.\/icon";/);
  assert.match(output, /className=\{\["base", active \? "active" : null\]\.filter\(Boolean\)\.join\(" "\)\}/);
  assert.match(output, /<Icon/);
});

test("static JSX emitter prefers template literal class assembly", () => {
  const template = buildTemplate(`
export type Props = {
  active: boolean;
};

export default function Badge({ active }: Props) {
  return <div className={["base", active && "active"]} />;
}
`);

  const output = emitStaticJsxComponent(template);

  assert.match(output, /className=\{`base \$\{active \? "active" : ""\}`\}/);
});

test("Askama emitter lowers imported components to let/include blocks", () => {
  const template = buildTemplate(`
import type { TemplateNode } from "@relevate/katachi";
import Icon from "./icon.template";

export type Props = {
  label: string;
  children?: TemplateNode;
};

export default function Callout({ label, children }: Props) {
  return (
    <div className="base">
      <Icon icon={label} size="16" />
      {children}
    </div>
  );
}
`);

  const output = emitAskamaPartial(template);

  assert.match(output, /{% let icon = label %}/);
  assert.match(output, /{% let size = "16" %}/);
  assert.match(output, /{% include "\.\/includes\/icon\.html" %}/);
  assert.match(output, /{{ children\|safe }}/);
});

test("component className props remain className in emitted targets", () => {
  const template = buildTemplate(`
import Icon from "./icon.template";

export type Props = {
  icon: string;
};

export default function Example({ icon }: Props) {
  return <Icon className="h-4 w-4" icon={icon} color="" size="16" />;
}
`);

  const reactOutput = emitReactComponent(template);
  const askamaOutput = emitAskamaPartial(template);

  assert.match(reactOutput, /<Icon[\s\S]*className="h-4 w-4"/);
  assert.match(askamaOutput, /{% let className = "h-4 w-4" %}/);
});

test("Askama emitter treats TemplateNode-typed props as safe output", () => {
  const template = buildTemplate(`
import type { TemplateNode } from "@relevate/katachi";

export type Props = {
  title_html: TemplateNode;
};

export default function Example({ title_html }: Props) {
  return <h2>{title_html}</h2>;
}
`);

  const output = emitAskamaPartial(template);

  assert.match(output, /{{ title_html\|safe }}/);
});

test("portable helpers lower to Askama and React target syntax", () => {
  const template = buildTemplate(`
import { If, isEmpty, isNone, isSome, len, type TemplateNode } from "@relevate/katachi";

export type Props = {
  items: string[];
  label?: string;
  errorMessage?: string;
  children?: TemplateNode;
};

export default function Example({ items, label, errorMessage, children }: Props) {
  return (
    <section>
      <If test={len(items) == 0}>
        <p>Empty</p>
      </If>
      <If test={isSome(label) && !isEmpty(label)}>
        <span>{label}</span>
      </If>
      <If test={isNone(errorMessage)}>
        <p>No details</p>
      </If>
      {children}
    </section>
  );
}
`);

  const reactOutput = emitReactComponent(template);
  const askamaOutput = emitAskamaPartial(template);

  assert.match(reactOutput, /\(\(items\?\.length \?\? 0\) === 0\)/);
  assert.match(reactOutput, /\(label != null\) && !\(\(\(label\?\.length \?\? 0\) === 0\)\)/);
  assert.match(reactOutput, /\(errorMessage == null\)/);
  assert.match(askamaOutput, /{% if items\.len\(\) == 0 %}/);
  assert.match(askamaOutput, /{% if label\.is_some\(\) && !\(label\.is_empty\(\)\) %}/);
  assert.match(askamaOutput, /{% if errorMessage\.is_none\(\) %}/);
});

test("dynamic Element tags lower across React, static JSX, Askama, and Liquid", () => {
  const template = buildTemplate(`
import { Element } from "@relevate/katachi";

export type Props = {
  level: number;
  title: string;
};

export default function Example({ level, title }: Props) {
  return (
    <Element tag={["h", level]} className="headline">
      {title}
    </Element>
  );
}
`);

  const reactOutput = emitReactComponent(template);
  const staticOutput = emitStaticJsxComponent(template);
  const askamaOutput = emitAskamaPartial(template);
  const liquidOutput = emitLiquidSnippet(template);

  assert.match(reactOutput, /const Tag = `h\$\{level\}` as ElementType;/);
  assert.match(reactOutput, /<Tag[\s\S]*className="headline"/);
  assert.match(staticOutput, /const Tag = `h\$\{level\}` as ElementType;/);
  assert.match(askamaOutput, /<h{{ level }}[\s\S]*class='headline'[\s\S]*>/);
  assert.match(askamaOutput, /<\/h{{ level }}>/);
  assert.match(liquidOutput, /<h{{ level }}[\s\S]*class='headline'[\s\S]*>/);
  assert.match(liquidOutput, /<\/h{{ level }}>/);
});

// --- Regression tests for the 9 bug fixes ---

// Bug #1 (CRITICAL): isEmpty() helper must compile to JS, not leak as raw text
test("React emitter compiles isEmpty() intrinsic to JS expression, not raw text", () => {
  const template = buildTemplate(`
import { If, isEmpty } from "@relevate/katachi";

export type Props = {
  label?: string;
};

export default function Example({ label }: Props) {
  return (
    <section>
      <If test={isEmpty(label)}>
        <p>No label</p>
      </If>
    </section>
  );
}
`);

  const output = emitReactComponent(template);

  // Must NOT contain raw "isEmpty(" text — it should be compiled to JS
  assert.doesNotMatch(output, /isEmpty\(/);
  // Should contain the JS equivalent
  assert.match(output, /\(\(label\?\.length \?\? 0\) === 0\)/);
});

// Bug #2 (CRITICAL): style concat attribute must emit CSSProperties object, not array
test("React emitter converts concat style attribute to CSSProperties object", () => {
  const template = buildTemplate(`
export type Props = {
  color: string;
};

export default function Example({ color }: Props) {
  return <div style={["background-color: ", color, "; padding: 8px"]} />;
}
`);

  const output = emitReactComponent(template);

  // Must NOT emit as array literal
  assert.doesNotMatch(output, /style=\{\[/);
  // Should emit as CSSProperties object with camelCase properties
  assert.match(output, /backgroundColor/);
  assert.match(output, /padding/);
});

// Bug #3 (CRITICAL): static style string must emit CSSProperties object, not HTML string
test("React emitter converts static style string to CSSProperties object", () => {
  const template = buildTemplate(`
export type Props = {
  label: string;
};

export default function Example({ label }: Props) {
  return <div style="font-variant-ligatures: none; color: red">{label}</div>;
}
`);

  const output = emitReactComponent(template);

  // Must NOT emit as string: style="font-variant-ligatures: none; color: red"
  assert.doesNotMatch(output, /style="font-variant/);
  // Should emit CSSProperties with camelCase props
  assert.match(output, /fontVariantLigatures/);
  assert.match(output, /"none"/);
  assert.match(output, /color:\s*"red"/);
});

// Bug #4 (HIGH): String concatenation must emit template literals, not JS arrays
test("React emitter converts concat attributes to template literals, not arrays", () => {
  const template = buildTemplate(`
export type Props = {
  variant: string;
};

export default function Example({ variant }: Props) {
  return <a href={["#section-", variant, "-detail"]}>link</a>;
}
`);

  const output = emitReactComponent(template);

  // Must NOT emit as array: href={["#section-", variant, "-detail"]}
  assert.doesNotMatch(output, /href=\{\[/);
  // Should emit as template literal
  assert.match(output, /href=\{`#section-\$\{variant\}-detail`\}/);
});

// Bug #5 (HIGH): Dynamic className variable must be a bare identifier, not string literal
test("React emitter emits dynamic className items as variable references", () => {
  const template = buildTemplate(`
export type Props = {
  variant: string;
};

export default function Example({ variant }: Props) {
  return <div className={["base", variant]} />;
}
`);

  const output = emitReactComponent(template);

  // classList output should contain bare identifier "variant", not quoted "className" or "variant"
  // The filter pattern is: ["base", variant].filter(Boolean).join(" ")
  assert.match(output, /className=\{\["base", variant\]\.filter\(Boolean\)\.join\(" "\)\}/);
});

// Bug #6 (HIGH): Conditional expression in className must be actual JS, not stringified code
test("React emitter emits conditional className items as ternary expressions", () => {
  const template = buildTemplate(`
export type Props = {
  active: boolean;
  size: string;
};

export default function Example({ active, size }: Props) {
  return <div className={["base", active && "is-active", size]} />;
}
`);

  const output = emitReactComponent(template);

  // Should emit ternary for the conditional and bare identifier for dynamic
  assert.match(output, /active \? "is-active" : null/);
  assert.match(output, /\bsize\b/);
  // "size" should NOT be quoted as a string literal in the array
  assert.doesNotMatch(output, /"size"/);
});

// Bug #7 (MEDIUM): HTML attribute names must be camelCase in React output
test("React emitter converts HTML attributes to React JSX camelCase", () => {
  const template = buildTemplate(`
export type Props = {
  label: string;
};

export default function Example({ label }: Props) {
  return (
    <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" tabindex="0" contenteditable="true">
      <text>{label}</text>
    </svg>
  );
}
`);

  const output = emitReactComponent(template);

  // HTML attrs should be converted to React camelCase
  assert.match(output, /viewBox=/);
  assert.match(output, /strokeWidth=/);
  assert.match(output, /strokeLinecap=/);
  assert.match(output, /tabIndex=/);
  // contentEditable is a boolean attr, should emit boolean value
  assert.match(output, /contentEditable=\{true\}/);

  // Original kebab-case names should NOT appear
  assert.doesNotMatch(output, /stroke-width=/);
  assert.doesNotMatch(output, /stroke-linecap=/);
  assert.doesNotMatch(output, /tabindex=/);
  assert.doesNotMatch(output, /contenteditable=/);
});

// Bug #8 (MEDIUM): .map() rendered elements must have key prop via <Fragment key={}>
test("React emitter uses Fragment with key prop in .map() loops", () => {
  const template = buildTemplate(`
import { For } from "@relevate/katachi";

export type Props = {
  items: string[];
};

export default function Example({ items }: Props) {
  return (
    <ul>
      <For each={items} as="item" index="i">
        <li>{item}</li>
      </For>
    </ul>
  );
}
`);

  const output = emitReactComponent(template);

  // Must use <Fragment key={i}> not bare <>
  assert.match(output, /<Fragment key=\{i\}>/);
  assert.match(output, /<\/Fragment>/);
  // Must import Fragment from react
  assert.match(output, /import \{ Fragment/);
  // Should NOT use bare fragment syntax in .map()
  assert.doesNotMatch(output, /\.map\([^)]*\)\s*=>\s*\(\s*<>/);
});

// Bug #9 (LOW): ReactNode import should be conditional on children props
test("React emitter only imports ReactNode when component has children-typed props", () => {
  const withoutChildren = buildTemplate(`
export type Props = {
  label: string;
};

export default function NoChildren({ label }: Props) {
  return <div>{label}</div>;
}
`);

  const withChildren = buildTemplate(`
import type { TemplateNode } from "@relevate/katachi";

export type Props = {
  label: string;
  children?: TemplateNode;
};

export default function WithChildren({ label, children }: Props) {
  return <div>{label}{children}</div>;
}
`);

  const outputWithout = emitReactComponent(withoutChildren);
  const outputWith = emitReactComponent(withChildren);

  // Without children props: should NOT import ReactNode
  assert.doesNotMatch(outputWithout, /ReactNode/);

  // With children props: should import ReactNode
  assert.match(outputWith, /ReactNode/);
  assert.match(outputWith, /import.*ReactNode.*from "react"/);
});

// Bug #9 + #8 combined: Fragment + ReactNode imports
test("React emitter imports both Fragment and ReactNode when needed", () => {
  const template = buildTemplate(`
import { For, type TemplateNode } from "@relevate/katachi";

export type Props = {
  items: string[];
  children?: TemplateNode;
};

export default function Combined({ items, children }: Props) {
  return (
    <div>
      <For each={items} as="item">
        <span>{item}</span>
      </For>
      {children}
    </div>
  );
}
`);

  const output = emitReactComponent(template);

  // Should import both Fragment (runtime) and ReactNode (type)
  assert.match(output, /Fragment/);
  assert.match(output, /ReactNode/);
  assert.match(output, /import \{ Fragment, type ReactNode \} from "react";/);
});

// Cross-target: static-jsx handles dynamic classList and concat
test("static JSX emitter handles dynamic classList items and concat attrs", () => {
  const template = buildTemplate(`
export type Props = {
  variant: string;
  active: boolean;
};

export default function Example({ variant, active }: Props) {
  return <a className={["base", variant, active && "is-active"]} href={["#", variant, "-link"]}>link</a>;
}
`);

  const output = emitStaticJsxComponent(template);

  // className should use template literal with dynamic interpolation
  assert.match(output, /className=\{`base \$\{variant\}/);
  // href should use template literal
  assert.match(output, /href=\{`#\$\{variant\}-link`\}/);
});

// Cross-target: Askama handles dynamic classList items and concat attrs
test("Askama emitter handles dynamic classList items and concat attrs", () => {
  const template = buildTemplate(`
export type Props = {
  variant: string;
  active: boolean;
};

export default function Example({ variant, active }: Props) {
  return <a className={["base", variant, active && "is-active"]} href={["#", variant, "-link"]}>link</a>;
}
`);

  const output = emitAskamaPartial(template);

  // className should contain Askama expression interpolation for the dynamic item
  assert.match(output, /{{ variant }}/);
  // href should use concat interpolation
  assert.match(output, /#{{ variant }}-link/);
});

// Regression: conditional isEmpty inside concat style arrays (Icon template pattern)
test("React emitter handles conditional isEmpty expressions in concat style arrays", () => {
  const template = buildTemplate(`
import { isEmpty } from "@relevate/katachi";

export type Props = {
  icon: string;
  size: string;
  color: string;
};

export default function Icon({ icon, size, color }: Props) {
  return (
    <svg
      style={[
        "background-color: ",
        !isEmpty(color) && color,
        isEmpty(color) && "currentColor",
        "; width: ",
        !isEmpty(size) && size,
        isEmpty(size) && "24",
        "px;",
      ]}
    ></svg>
  );
}
`);

  const output = emitReactComponent(template);

  // Must NOT contain raw "isEmpty(" — all intrinsics should be compiled
  assert.doesNotMatch(output, /isEmpty\(/);

  // Style must be a CSSProperties object, not an array
  assert.doesNotMatch(output, /style=\{\[/);

  // Should contain camelCase CSS properties
  assert.match(output, /backgroundColor/);
  assert.match(output, /width/);

  // Conditional parts should use ternaries (not && which produces "false" in strings)
  assert.match(output, /\? color : ""/);
  assert.match(output, /\? "currentColor" : ""/);
  assert.match(output, /\? size : ""/);
  assert.match(output, /\? "24" : ""/);
});

// Regression: parseExpr must parse `!fn(x) && y` as `and(not(fn(x)), y)` not `not(and(fn(x), y))`
test("parseExpr handles negated intrinsic in && expression with correct precedence", () => {
  const template = buildTemplate(`
import { isEmpty } from "@relevate/katachi";

export type Props = {
  value: string;
};

export default function Example({ value }: Props) {
  return <div data-x={[!isEmpty(value) && value]} />;
}
`);

  assert.equal(template.template.kind, "element");
  if (template.template.kind !== "element") throw new Error("expected element");

  const attr = template.template.attrs?.["data-x"];
  assert.ok(attr);
  assert.equal(attr?.kind, "concat");
  if (attr?.kind !== "concat") throw new Error("expected concat");

  // The single part should be: and(not(isEmpty(value)), value)
  const part = attr.parts[0];
  assert.equal(part.kind, "and");
  if (part.kind !== "and") throw new Error("expected and");
  assert.equal(part.left.kind, "not");
  if (part.left.kind !== "not") throw new Error("expected not");
  assert.equal(part.left.expr.kind, "intrinsic");
  assert.equal(part.right.kind, "var");
});

test("Liquid emitter lowers nested components and portable helpers to Shopify snippets", () => {
  const template = buildTemplate(`
import { If, isEmpty, isNone, isSome, len, type TemplateNode } from "@relevate/katachi";
import Icon from "./icon.template";

export type Props = {
  items: TemplateNode[];
  label?: TemplateNode;
  errorMessage?: string;
  children?: TemplateNode;
};

export default function Example({ items, label, errorMessage, children }: Props) {
  return (
    <section className={["base", isSome(label) && "has-label"]}>
      <Icon icon={label} size="16" />
      <If test={len(items) == 0}>
        <p>{label}</p>
      </If>
      <If test={isNone(errorMessage) || isEmpty(errorMessage)}>
        <span>No details</span>
      </If>
      {children}
    </section>
  );
}
`);

  const output = emitLiquidSnippet(template);

  assert.match(output, /{% render 'icon', icon: label, size: "16" %}/);
  assert.match(output, /class='base {% if label != nil %}has-label{% endif %}'/);
  assert.match(output, /{% if items\.size == 0 %}/);
  assert.match(output, /{{ label }}/);
  assert.match(output, /{% if __katachi_cond_/);
  assert.match(output, /errorMessage == nil/);
  assert.match(output, /errorMessage == blank/);
});
