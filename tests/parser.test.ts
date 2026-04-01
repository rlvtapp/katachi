import assert from "node:assert/strict";
import test from "node:test";

import { parseTemplateFile } from "../src/core/parser";

test("parseTemplateFile lowers components, control flow, slots, class lists, and helpers", () => {
  const source = `
import { If, For, isNone, isSome, length, type TemplateNode } from "@relevate/katachi";
import Icon from "./icon.template";

export type Props = {
  variant: "note" | "warning";
  rows: TemplateNode[];
  message?: TemplateNode;
  fallback?: string;
  children?: TemplateNode;
};

export default function Example({ variant, rows, message, fallback, children }: Props) {
  return (
    <div className={["base", variant == "note" && "note"]}>
      <Icon icon="search" size="16" />
      <If test={variant == "warning" && isSome(message)}>
        <p>{message}</p>
      </If>
      <If test={length(rows) == 0}>
        <p>Empty</p>
      </If>
      <If test={isNone(fallback)}>
        <p>No fallback</p>
      </If>
      <For each={rows} as="row" index="i">
        <span>{row}</span>
      </For>
      {children}
    </div>
  );
}
`;

  const parsed = parseTemplateFile(source);

  assert.equal(parsed.name, "Example");
  assert.equal(parsed.imports.length, 1);
  assert.deepEqual(parsed.imports[0], {
    localName: "Icon",
    source: "./icon.template",
  });
  assert.deepEqual(parsed.props, [
    { name: "variant", type: "string", optional: false },
    { name: "rows", type: "template-node[]", optional: false },
    { name: "message", type: "template-node", optional: true },
    { name: "fallback", type: "string", optional: true },
    { name: "children", type: "children", optional: true },
  ]);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") {
    throw new Error("expected root element");
  }

  const rootClass = parsed.template.attrs?.class;
  assert.ok(rootClass);
  assert.equal(rootClass?.kind, "classList");
  if (rootClass?.kind !== "classList") {
    throw new Error("expected class list");
  }
  assert.equal(rootClass.items.length, 2);
  assert.deepEqual(rootClass.items[0], { kind: "static", value: "base" });
  assert.equal(rootClass.items[1]?.kind, "when");

  assert.equal(parsed.template.children?.length, 6);
  assert.equal(parsed.template.children?.[0]?.kind, "component");
  assert.equal(parsed.template.children?.[1]?.kind, "if");
  assert.equal(parsed.template.children?.[2]?.kind, "if");
  assert.equal(parsed.template.children?.[3]?.kind, "if");
  assert.equal(parsed.template.children?.[4]?.kind, "for");
  assert.equal(parsed.template.children?.[5]?.kind, "slot");

  const conditional = parsed.template.children?.[1];
  assert.ok(conditional && conditional.kind === "if");
  if (!conditional || conditional.kind !== "if") {
    throw new Error("expected if node");
  }
  assert.equal(conditional.then[0]?.kind, "element");
  assert.equal(conditional.test.kind, "and");
  if (conditional.then[0]?.kind !== "element") {
    throw new Error("expected conditional element");
  }
  assert.equal(conditional.then[0].children?.[0]?.kind, "print");
  if (conditional.then[0].children?.[0]?.kind !== "print") {
    throw new Error("expected conditional print");
  }
  assert.equal(conditional.then[0].children[0].safe, true);

  const emptyState = parsed.template.children?.[2];
  assert.ok(emptyState && emptyState.kind === "if");
  if (!emptyState || emptyState.kind !== "if") {
    throw new Error("expected empty-state if node");
  }
  assert.equal(emptyState.test.kind, "eq");
  if (emptyState.test.kind !== "eq") {
    throw new Error("expected equality test");
  }
  assert.equal(emptyState.test.left.kind, "intrinsic");
  if (emptyState.test.left.kind !== "intrinsic") {
    throw new Error("expected length intrinsic");
  }
  assert.equal(emptyState.test.left.name, "len");

  const noneGuard = parsed.template.children?.[3];
  assert.ok(noneGuard && noneGuard.kind === "if");
  if (!noneGuard || noneGuard.kind !== "if") {
    throw new Error("expected none-guard if node");
  }
  assert.equal(noneGuard.test.kind, "intrinsic");
  if (noneGuard.test.kind !== "intrinsic") {
    throw new Error("expected isNone intrinsic");
  }
  assert.equal(noneGuard.test.name, "isNone");

  const loop = parsed.template.children?.[4];
  assert.ok(loop && loop.kind === "for");
  if (!loop || loop.kind !== "for") {
    throw new Error("expected for node");
  }
  assert.equal(loop.item, "row");
  assert.equal(loop.indexName, "i");
  assert.equal(loop.children[0]?.kind, "element");
  if (loop.children[0]?.kind !== "element") {
    throw new Error("expected loop element");
  }
  assert.equal(loop.children[0].children?.[0]?.kind, "print");
  if (loop.children[0].children?.[0]?.kind !== "print") {
    throw new Error("expected loop print");
  }
  assert.equal(loop.children[0].children[0].safe, true);
});

test("parseTemplateFile supports For render-function children", () => {
  const parsed = parseTemplateFile(`
export type Props = {
  rows: string[];
};

export default function Example({ rows }: Props) {
  return (
    <div>
      <For each={rows}>
        {(row, i) => (
          <span data-index={i}>{row}</span>
        )}
      </For>
    </div>
  );
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") {
    throw new Error("expected root element");
  }

  const loop = parsed.template.children?.[0];
  assert.ok(loop && loop.kind === "for");
  if (!loop || loop.kind !== "for") {
    throw new Error("expected for node");
  }

  assert.equal(loop.item, "row");
  assert.equal(loop.indexName, "i");
  assert.equal(loop.children[0]?.kind, "element");
});

test("parseTemplateFile accepts one-line JSX returns", () => {
  const parsed = parseTemplateFile(`
export type Props = {
  value: string;
};

export default function InlineCode({ value }: Props) {
  return <code>{value}</code>;
}
`);

  assert.equal(parsed.name, "InlineCode");
  assert.equal(parsed.template.kind, "element");
});

test("parseTemplateFile preserves className on component props while normalizing intrinsic attrs", () => {
  const parsed = parseTemplateFile(`
import Icon from "./icon.template";

export type Props = {
  label: string;
};

export default function Example({ label }: Props) {
  return (
    <div className="wrapper">
      <Icon className="icon" icon={label} />
    </div>
  );
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") {
    throw new Error("expected root element");
  }

  assert.ok(parsed.template.attrs?.class);
  assert.equal(parsed.template.children?.[0]?.kind, "component");

  const component = parsed.template.children?.[0];
  if (!component || component.kind !== "component") {
    throw new Error("expected component child");
  }

  assert.ok(component.props?.className);
  assert.equal(component.props?.class, undefined);
});

test("parseTemplateFile supports dynamic class items and concat attrs", () => {
  const parsed = parseTemplateFile(`
export type Props = {
  variant: string;
  active: boolean;
};

export default function Example({ variant, active }: Props) {
  return <a className={["base", variant, active && "active"]} href={["#", variant, "-link"]}>Link</a>;
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") {
    throw new Error("expected root element");
  }

  const classAttr = parsed.template.attrs?.class;
  assert.ok(classAttr);
  assert.equal(classAttr?.kind, "classList");
  if (classAttr?.kind !== "classList") {
    throw new Error("expected class list");
  }

  assert.deepEqual(classAttr.items[0], { kind: "static", value: "base" });
  assert.equal(classAttr.items[1]?.kind, "dynamic");
  if (classAttr.items[1]?.kind !== "dynamic") {
    throw new Error("expected dynamic class item");
  }
  assert.equal(classAttr.items[1].expr.kind, "var");
  assert.equal(classAttr.items[2]?.kind, "when");

  const hrefAttr = parsed.template.attrs?.href;
  assert.ok(hrefAttr);
  assert.equal(hrefAttr?.kind, "concat");
  if (hrefAttr?.kind !== "concat") {
    throw new Error("expected concat href");
  }

  assert.equal(hrefAttr.parts.length, 3);
  assert.equal(hrefAttr.parts[0]?.kind, "string");
  assert.equal(hrefAttr.parts[1]?.kind, "var");
  assert.equal(hrefAttr.parts[2]?.kind, "string");
});

test("parseTemplateFile lowers Element tags into dynamic element nodes", () => {
  const parsed = parseTemplateFile(`
import { Element } from "@relevate/katachi";

export type Props = {
  level: number;
  title: string;
};

export default function Example({ level, title }: Props) {
  return <Element tag={["h", level]} className="headline">{title}</Element>;
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") {
    throw new Error("expected root element");
  }

  assert.equal(parsed.template.tag.kind, "dynamic");
  if (parsed.template.tag.kind !== "dynamic") {
    throw new Error("expected dynamic tag");
  }

  assert.equal(parsed.template.tag.parts.length, 2);
  assert.equal(parsed.template.tag.parts[0]?.kind, "string");
  assert.equal(parsed.template.tag.parts[1]?.kind, "var");
  assert.equal(parsed.template.attrs?.class?.kind, "text");
});

test("parseTemplateFile wraps multi-root templates in a fragment", () => {
  const parsed = parseTemplateFile(`
export default function Example() {
  return (
    <div>alpha</div>
    <div>beta</div>
  );
}
`);

  assert.equal(parsed.template.kind, "fragment");
  if (parsed.template.kind !== "fragment") {
    throw new Error("expected fragment root");
  }

  assert.equal(parsed.template.children.length, 2);
  assert.equal(parsed.template.children[0]?.kind, "element");
  assert.equal(parsed.template.children[1]?.kind, "element");
});

test("parseTemplateFile supports explicit fragment syntax", () => {
  const parsed = parseTemplateFile(`
export default function Example() {
  return (
    <>
      <div>alpha</div>
      <div>beta</div>
    </>
  );
}
`);

  assert.equal(parsed.template.kind, "fragment");
  if (parsed.template.kind !== "fragment") {
    throw new Error("expected fragment root");
  }

  assert.equal(parsed.template.children.length, 2);
  assert.equal(parsed.template.children[0]?.kind, "element");
  assert.equal(parsed.template.children[1]?.kind, "element");
});

test("parseTemplateFile captures target-specific attrs", () => {
  const parsed = parseTemplateFile(`
export default function Example() {
  return (
    <div
      className="base"
      attrs={{ askama: { "@click": "open = false" }, react: { "data-preview-role": "shell" } }}
    />
  );
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") {
    throw new Error("expected root element");
  }

  assert.equal(parsed.template.targetAttrs?.askama?.["@click"]?.kind, "text");
  assert.equal(parsed.template.targetAttrs?.react?.["data-preview-role"]?.kind, "text");
});

test("parseTemplateFile captures target-specific attrs on components", () => {
  const parsed = parseTemplateFile(`
import Icon from "./icon.template";

export default function Example() {
  return (
    <Icon
      icon="search"
      attrs={{ askama: { "@click": "open = false" }, react: { "data-preview-role": "icon" } }}
    />
  );
}
`);

  assert.equal(parsed.template.kind, "component");
  if (parsed.template.kind !== "component") {
    throw new Error("expected root component");
  }

  assert.equal(parsed.template.targetAttrs?.askama?.["@click"]?.kind, "text");
  assert.equal(parsed.template.targetAttrs?.react?.["data-preview-role"]?.kind, "text");
});

test("parseTemplateFile preserves top-level doctypes", () => {
  const parsed = parseTemplateFile(`
export default function Layout() {
  return (
    <!DOCTYPE html>
    <html></html>
  );
}
`);

  assert.equal(parsed.template.kind, "fragment");
  assert.equal(parsed.template.children?.[0]?.kind, "doctype");
  assert.equal(parsed.template.children?.[0]?.value, "<!DOCTYPE html>");
});

test("parseTemplateFile preserves raw script and style contents", () => {
  const parsed = parseTemplateFile(`
export default function Example() {
  return (
    <script>
      const value = { open: true };
    </script>
  );
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") {
    throw new Error("expected script root");
  }

  assert.deepEqual(parsed.template.tag, { kind: "static", name: "script" });
  assert.equal(parsed.template.children?.[0]?.kind, "text");
  if (parsed.template.children?.[0]?.kind !== "text") {
    throw new Error("expected raw text child");
  }

  assert.match(parsed.template.children[0].value, /const value = \{ open: true \};/);
});

test("parseTemplateFile supports Else branches inside If", () => {
  const parsed = parseTemplateFile(`
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

  assert.equal(parsed.template.kind, "if");
  if (parsed.template.kind !== "if") {
    throw new Error("expected if root");
  }

  assert.equal(parsed.template.then.length, 1);
  assert.equal(parsed.template.else?.length, 1);
  assert.equal(parsed.template.then[0]?.kind, "element");
  assert.equal(parsed.template.else?.[0]?.kind, "element");
});

test("parseTemplateFile expands same-file local helper components with props and children", () => {
  const parsed = parseTemplateFile(`
import { If, type TemplateNode } from "@relevate/katachi";

function Inner({ label, children }: { label: string; children?: TemplateNode }) {
  return (
    <div className={["wrapper", label == "warn" && "warn"]}>
      <span>{label}</span>
      {children}
    </div>
  );
}

function Outer({ label, children }: { label: string; children?: TemplateNode }) {
  return (
    <Inner label={label}>
      <If test={label == "warn"}>
        <strong>{children}</strong>
      </If>
    </Inner>
  );
}

export type Props = {
  title: string;
};

export default function Page({ title }: Props) {
  return (
    <section>
      <Outer label={title}>Hello</Outer>
    </section>
  );
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") {
    throw new Error("expected root section");
  }

  assert.deepEqual(parsed.template.tag, { kind: "static", name: "section" });
  assert.equal(parsed.template.children?.[0]?.kind, "element");
  if (parsed.template.children?.[0]?.kind !== "element") {
    throw new Error("expected expanded helper root");
  }

  assert.deepEqual(parsed.template.children[0].tag, { kind: "static", name: "div" });
  const helperRoot = parsed.template.children[0];
  assert.equal(helperRoot.attrs?.class?.kind, "classList");
  if (helperRoot.attrs?.class?.kind !== "classList") {
    throw new Error("expected class list");
  }
  assert.equal(helperRoot.attrs.class.items.length, 2);
  assert.equal(helperRoot.children?.[0]?.kind, "element");
  assert.equal(helperRoot.children?.[1]?.kind, "if");
  if (helperRoot.children?.[0]?.kind !== "element") {
    throw new Error("expected span child");
  }
  assert.deepEqual(helperRoot.children[0].tag, { kind: "static", name: "span" });
  assert.equal(helperRoot.children[0].children?.[0]?.kind, "print");
  if (helperRoot.children?.[1]?.kind !== "if") {
    throw new Error("expected conditional child");
  }
  assert.equal(helperRoot.children[1].then[0]?.kind, "element");
});
