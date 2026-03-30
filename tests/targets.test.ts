import assert from "node:assert/strict";
import test from "node:test";

import type { BuildTemplate } from "../src/core/types";
import { parseTemplateFile } from "../src/core/parser";
import { emitAskamaComponent, emitAskamaPartial } from "../src/targets/askama";
import { emitLiquidTemplate } from "../src/targets/liquid";
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

test("React emitter maps TemplateNode prop types to ReactNode types", () => {
  const template = buildTemplate(`
import type { TemplateNode } from "@relevate/katachi";

export type Props = {
  title_html: TemplateNode;
  cells: TemplateNode[];
  grid: TemplateNode[][];
  children?: TemplateNode;
};

export default function Example({ title_html, cells, grid, children }: Props) {
  return (
    <section>
      <div>{title_html}</div>
      <div>{cells[0]}</div>
      <div>{grid[0][0]}</div>
      {children}
    </section>
  );
}
`);

  const output = emitReactComponent(template);

  assert.match(output, /title_html: ReactNode;/);
  assert.match(output, /cells: ReactNode\[\];/);
  assert.match(output, /grid: ReactNode\[\]\[\];/);
  assert.match(output, /children\?: ReactNode;/);
  assert.doesNotMatch(output, /template-node/);
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

test("React emitter keys single-child For loops with a Fragment wrapper", () => {
  const template = buildTemplate(`
export type Props = {
  items: string[];
};

export default function Example({ items }: Props) {
  return (
    <ul>
      <For each={items} as="item">
        <li>{item}</li>
      </For>
    </ul>
  );
}
`);

  const reactOutput = emitReactComponent(template);

  assert.match(reactOutput, /<Fragment key=\{__index\}>/);
  assert.match(reactOutput, /<li>/);
});

test("target-specific attrs merge into the requested output only", () => {
  const template = buildTemplate(`
export default function Example() {
  return (
    <div
      className="base"
      attrs={{
        askama: { "@click": "open = false" },
        react: { "data-preview-role": "shell" }
      }}
    />
  );
}
`);

  const reactOutput = emitReactComponent(template);
  const askamaOutput = emitAskamaPartial(template);

  assert.match(reactOutput, /data-preview-role="shell"/);
  assert.doesNotMatch(reactOutput, /@click/);
  assert.match(askamaOutput, /@click='open = false'/);
  assert.doesNotMatch(askamaOutput, /data-preview-role/);
});

test("Askama emitter lowers imported components to set/include blocks", () => {
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

  assert.match(output, /{% set icon = label %}/);
  assert.match(output, /{% set size = "16" %}/);
  assert.match(output, /{% include "\.\/includes\/icon\.html" %}/);
  assert.match(output, /{{ children\|safe }}/);
});

test("Liquid emitter preserves native attrs and lowers imported components to render tags", () => {
  const template = buildTemplate(`
import type { TemplateNode } from "@relevate/katachi";
import Icon from "./icon.template";

export type Props = {
  open: boolean;
  label: string;
  children?: TemplateNode;
};

export default function Callout({ open, label, children }: Props) {
  return (
    <div @click="open = !open" open={open} className={["base", open && "active"]}>
      <Icon icon={label} size="16" />
      {children}
    </div>
  );
}
`);

  const output = emitLiquidTemplate(template);

  assert.match(output, /@click='open = !open'/);
  assert.match(output, /{% if open %}open{% endif %}/);
  assert.match(output, /class='base {% if open %}active{% endif %}'/);
  assert.match(output, /{% render 'icon', icon: label, size: "16" %}/);
  assert.match(output, /{{ children }}/);
});

test("Askama component wrappers reference generated include files", () => {
  const template = buildTemplate(`
export type Props = {
  label: string;
  hasChildren: boolean;
};

export default function Callout({ label, hasChildren }: Props) {
  return <div data-has-children={hasChildren}>{label}</div>;
}
`);

  const output = emitAskamaComponent(template);

  assert.match(output, /path = "includes\/callout\.html"/);
  assert.match(output, /pub label: &'a str,/);
  assert.match(output, /pub has_children: bool,/);
  assert.doesNotMatch(output, /source = r#"/);
});

test("same-file local helper components inline props, children, and nested helpers in Askama and React output", () => {
  const template = buildTemplate(`
import { If, type TemplateNode } from "@relevate/katachi";

function Badge({ tone, children }: { tone: string; children?: TemplateNode }) {
  return (
    <span className={["badge", tone == "warn" && "warn"]}>
      {children}
    </span>
  );
}

function Styling({ label, children }: { label: string; children?: TemplateNode }) {
  return (
    <div className="wrapper">
      <Badge tone={label}>
        <If test={label == "warn"}>
          <strong>{children}</strong>
          <Else>
            <span>{label}</span>
          </Else>
        </If>
      </Badge>
    </div>
  );
}

export type Props = {
  label: string;
};

export default function Example({ label }: Props) {
  return <Styling label={label}>Alert</Styling>;
}
`);

  const reactOutput = emitReactComponent(template);
  const askamaOutput = emitAskamaPartial(template);

  assert.doesNotMatch(reactOutput, /<Styling/);
  assert.doesNotMatch(reactOutput, /<Badge/);
  assert.match(reactOutput, /className="wrapper"/);
  assert.match(reactOutput, /className=\{\["badge", \(label === "warn"\) \? "warn" : null\]\.filter\(Boolean\)\.join\(" "\)\}/);
  assert.match(reactOutput, /\(label === "warn"\) \? \(/);
  assert.match(reactOutput, /<strong>\s*Alert\s*<\/strong>/);
  assert.match(reactOutput, /<span>\s*\{label\}\s*<\/span>/);

  assert.doesNotMatch(askamaOutput, /Styling/);
  assert.doesNotMatch(askamaOutput, /Badge/);
  assert.match(askamaOutput, /class='wrapper'/);
  assert.match(askamaOutput, /class='badge {% if label == "warn" %}warn{% endif %}'/);
  assert.match(askamaOutput, /{% if label == "warn" %}/);
  assert.match(askamaOutput, /<strong>\s*Alert\s*<\/strong>/);
  assert.match(askamaOutput, /{% else %}/);
  assert.match(askamaOutput, /<span>\s*{{ label }}\s*<\/span>/);
});

test("component className props become snake_case in Askama output", () => {
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
  assert.match(askamaOutput, /{% set class_name = "h-4 w-4" %}/);
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
  assert.match(askamaOutput, /{% if error_message\.is_none\(\) %}/);
});

test("fragment roots emit cleanly in Askama and React targets", () => {
  const template = buildTemplate(`
export default function Example() {
  return (
    <div>alpha</div>
    <div>beta</div>
  );
}
`);

  const reactOutput = emitReactComponent(template);
  const askamaOutput = emitAskamaPartial(template);

  assert.match(reactOutput, /return \(\n\s+<>\n/);
  assert.match(reactOutput, /alpha/);
  assert.match(reactOutput, /beta/);
  assert.match(askamaOutput, /<div>\s*alpha\s*<\/div>\s*<div>\s*beta\s*<\/div>/s);
});

test("doctype nodes emit in Askama and React targets", () => {
  const template = buildTemplate(`
export default function Layout() {
  return (
    <!DOCTYPE html>
    <html></html>
  );
}
`);

  const askama = emitAskamaPartial(template);
  assert.match(askama, /^<!DOCTYPE html>\n<html><\/html>\n$/);

  const react = emitReactComponent(template);
  assert.match(react, /\{"<!DOCTYPE html>"\}/);
});

test("Else branches emit in both React and Askama targets", () => {
  const template = buildTemplate(`
import { If } from "@relevate/katachi";

export default function Example() {
  return (
    <If test={true}>
      <span>yes</span>
      <Else>
        <span>no</span>
      </Else>
    </If>
  );
}
`);

  const reactOutput = emitReactComponent(template);
  const askamaOutput = emitAskamaPartial(template);

  assert.match(reactOutput, /\? \(\n\s+<>\n\s+<span>/);
  assert.match(reactOutput, /: \(\n\s+<>\n\s+<span>/);
  assert.match(askamaOutput, /{% if true %}/);
  assert.match(askamaOutput, /{% else %}/);
  assert.match(askamaOutput, /yes/);
  assert.match(askamaOutput, /no/);
});

test("Askama emitter normalizes HTML attrs and boolean attrs", () => {
  const template = buildTemplate(`
export type Props = {
  open: boolean;
};

export default function Example({ open }: Props) {
  return (
    <li tabIndex={-1} className="item">
      <details open={open}>
        <div></div>
      </details>
    </li>
  );
}
`);

  const askamaOutput = emitAskamaPartial(template);

  assert.match(askamaOutput, /tabindex='{{ -1 }}'/);
  assert.match(askamaOutput, /class='item'/);
  assert.match(askamaOutput, /{% if open %}open{% endif %}/);
  assert.match(askamaOutput, /<div><\/div>/);
});

test("Askama and Liquid emitters can minify HTML-style output", () => {
  const template = buildTemplate(`
import { If, type TemplateNode } from "@relevate/katachi";
import Icon from "./icon.template";

export type Props = {
  active: boolean;
  children?: TemplateNode;
};

export default function Example({ active, children }: Props) {
  return (
    <div className={["base", active && "active"]}>
      <Icon size="16" />
      <If test={active}>
        <span>{children}</span>
      </If>
    </div>
  );
}
`);

  const askamaOutput = emitAskamaPartial(template, { minify: true });
  const liquidOutput = emitLiquidTemplate(template, { minify: true });

  assert.equal(
    askamaOutput,
    `<div class='base {% if active %}active{% endif %}'>{% set size = "16" %}{% include "./includes/icon.html" %}{% if active %}<span>{{ children|safe }}</span>{% endif %}</div>\n`,
  );
  assert.equal(
    liquidOutput,
    `<div class='base {% if active %}active{% endif %}'>{% render 'icon', size: "16" %}{% if active %}<span>{{ children }}</span>{% endif %}</div>`,
  );
});
