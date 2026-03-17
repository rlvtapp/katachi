import assert from "node:assert/strict";
import test from "node:test";

import { parseTemplateFile } from "../src/core/parser";

test("parseTemplateFile lowers components, control flow, slots, class lists, and helpers", () => {
  const source = `
import { If, For, isNone, isSome, len, type TemplateNode } from "@relevate/katachi";
import Icon from "./icon.template";

export type Props = {
  variant: "note" | "warning";
  rows: string[];
  message?: string;
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
      <If test={len(rows) == 0}>
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
    { name: "rows", type: "string[]", optional: false },
    { name: "message", type: "string", optional: true },
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
    throw new Error("expected len intrinsic");
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

test("parseTemplateFile lowers Element helper to a dynamic intrinsic tag", () => {
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
  assert.deepEqual(parsed.template.tag.parts[0], { kind: "string", value: "h" });
  assert.deepEqual(parsed.template.tag.parts[1], { kind: "var", name: "level" });
  assert.equal(parsed.template.attrs?.class?.kind, "text");
  assert.equal(parsed.template.children?.[0]?.kind, "print");
});

// --- Regression tests for bug fixes ---

test("parseClassList: bare identifiers produce dynamic class items, not static strings", () => {
  const parsed = parseTemplateFile(`
export type Props = {
  variant: string;
  size: string;
};

export default function Example({ variant, size }: Props) {
  return <div className={["base", variant, size]} />;
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") throw new Error("expected element");

  const cls = parsed.template.attrs?.class;
  assert.ok(cls);
  assert.equal(cls?.kind, "classList");
  if (cls?.kind !== "classList") throw new Error("expected classList");

  assert.equal(cls.items.length, 3);
  assert.deepEqual(cls.items[0], { kind: "static", value: "base" });
  assert.equal(cls.items[1]?.kind, "dynamic");
  if (cls.items[1]?.kind !== "dynamic") throw new Error("expected dynamic");
  assert.deepEqual(cls.items[1].expr, { kind: "var", name: "variant" });
  assert.equal(cls.items[2]?.kind, "dynamic");
  if (cls.items[2]?.kind !== "dynamic") throw new Error("expected dynamic");
  assert.deepEqual(cls.items[2].expr, { kind: "var", name: "size" });
});

test("parseClassList: complex conditional with isEmpty parses correctly using findTopLevelOperator", () => {
  const parsed = parseTemplateFile(`
import { isEmpty, isSome } from "@relevate/katachi";

export type Props = {
  label?: string;
};

export default function Example({ label }: Props) {
  return <div className={["base", isSome(label) && !isEmpty(label) && "has-label"]} />;
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") throw new Error("expected element");

  const cls = parsed.template.attrs?.class;
  assert.ok(cls);
  assert.equal(cls?.kind, "classList");
  if (cls?.kind !== "classList") throw new Error("expected classList");

  assert.equal(cls.items.length, 2);
  assert.deepEqual(cls.items[0], { kind: "static", value: "base" });

  const conditional = cls.items[1];
  assert.equal(conditional?.kind, "when");
  if (conditional?.kind !== "when") throw new Error("expected when item");
  assert.equal(conditional.value, "has-label");
  // The test expression should be an `and` of two sub-expressions
  assert.equal(conditional.test.kind, "and");
});

test("parseAttrValue: non-class array attributes produce concat AttrValue", () => {
  const parsed = parseTemplateFile(`
export type Props = {
  variant: string;
};

export default function Example({ variant }: Props) {
  return <a href={["#section-", variant, "-detail"]} />;
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") throw new Error("expected element");

  const href = parsed.template.attrs?.href;
  assert.ok(href);
  assert.equal(href?.kind, "concat");
  if (href?.kind !== "concat") throw new Error("expected concat");
  assert.equal(href.parts.length, 3);
  assert.deepEqual(href.parts[0], { kind: "string", value: "#section-" });
  assert.deepEqual(href.parts[1], { kind: "var", name: "variant" });
  assert.deepEqual(href.parts[2], { kind: "string", value: "-detail" });
});

test("parseAttrValue: style concat attribute produces concat AttrValue", () => {
  const parsed = parseTemplateFile(`
export type Props = {
  color: string;
};

export default function Example({ color }: Props) {
  return <div style={["background-color: ", color, "; padding: 8px"]} />;
}
`);

  assert.equal(parsed.template.kind, "element");
  if (parsed.template.kind !== "element") throw new Error("expected element");

  const style = parsed.template.attrs?.style;
  assert.ok(style);
  assert.equal(style?.kind, "concat");
  if (style?.kind !== "concat") throw new Error("expected concat");
  assert.equal(style.parts.length, 3);
  assert.deepEqual(style.parts[0], { kind: "string", value: "background-color: " });
  assert.deepEqual(style.parts[1], { kind: "var", name: "color" });
  assert.deepEqual(style.parts[2], { kind: "string", value: "; padding: 8px" });
});
