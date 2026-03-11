import assert from "node:assert/strict";
import test from "node:test";

import type { BuildTemplate } from "../src/core/types";
import { parseTemplateFile } from "../src/core/parser";
import { emitAskamaPartial } from "../src/targets/askama";
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
