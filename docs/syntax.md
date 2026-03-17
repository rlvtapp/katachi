# Template Syntax

Katachi templates are written in restricted TSX.

That means:

- templates look like TSX
- editors can parse them
- the compiler only accepts a subset that can lower cleanly into the portable AST

This guide focuses on the supported syntax you can use in a normal Katachi
project.

## File shape

A template file should export:

- `Props`
- a default component function

Example:

```tsx
import { Element, For, If, isEmpty, len, type TemplateNode } from "@relevate/katachi";

export type Props = {
  title: string;
  rows: string[][];
  children?: TemplateNode;
};

export default function Example({ title, rows, children }: Props) {
  return (
    <section>
      <Element tag={["h", 2]}>{title}</Element>
      <For each={rows} as="row">
        <div>{row[0]}</div>
      </For>
      <If test={len(rows) == 0}>
        <p>Empty</p>
      </If>
      {children}
    </section>
  );
}
```

In a real project, place these files in:

```txt
src/templates/**/*.template.tsx
```

## Supported constructs

### Intrinsic elements

Normal lowercase JSX tags work as expected:

```tsx
<div />
<span>{value}</span>
<img src={src} alt={alt} />
```

### Dynamic intrinsic elements

Use `Element` when the tag name itself needs to vary.

```tsx
import { Element } from "@relevate/katachi";

<Element tag={["h", level]} className="headline">
  {title}
</Element>
```

`tag` accepts either a plain expression like `tag={tagName}` or a structured
tuple like `tag={["h", level]}` when you want a fixed prefix with one dynamic
part.

### Imported template components

Capitalized tags are treated as template component invocations.

```tsx
import Icon from "./icon.template";

<Icon icon="search" size="16" />
```

### Children and slots

`children` is treated as a slot.

```tsx
type Props = {
  children?: TemplateNode;
};
```

```tsx
<div>{children}</div>
```

### `If`

Use `If` for conditional rendering.

```tsx
import { If } from "@relevate/katachi";

<If test={variant == "warning"}>
  <p>Warning</p>
</If>
```

### `For`

Use `For` for loops.

```tsx
import { For } from "@relevate/katachi";

<For each={rows} as="row">
  <div>{row}</div>
</For>
```

Optional index binding:

```tsx
<For each={rows} as="row" index="i">
  <div>{i}</div>
</For>
```

### `TemplateNode`

Use `TemplateNode` for props or children that carry markup-like content.

```tsx
import type { TemplateNode } from "@relevate/katachi";

type Props = {
  title_html: TemplateNode;
  children?: TemplateNode;
};

<h2>{title_html}</h2>
<div>{children}</div>
```

For Askama output, `TemplateNode` values are treated as markup content and are
emitted with `|safe`. On Liquid output, they are emitted as plain Liquid
output, so trusted or sanitized HTML should be handled before it reaches the
target.

### Portable helpers

Use Katachi's portable helpers instead of target-specific template methods.

```tsx
import { If, isEmpty, isNone, isSome, len } from "@relevate/katachi";

<If test={len(rows) == 0}>
  <p>Empty</p>
</If>

<If test={isSome(breadcrumbs)}>
  <div>{breadcrumbs}</div>
</If>

<If test={isNone(errorMessage) || isEmpty(errorMessage)}>
  <p>No details</p>
</If>
```

### Dynamic classes

Both `class` and `className` are supported in authoring input.

```tsx
<div
  className={[
    "rounded-xl border",
    variant == "note" && "border-primary/20 bg-primary/5",
    variant == "warning" && "border-amber-500/20 bg-amber-50/50",
  ]}
/>
```

This is Katachi syntax hosted in TSX. The compiler normalizes it and emits target-specific output.

## Expressions

Supported directly:

- variables
- string literals
- boolean literals
- number literals
- `==`, `!=`, `===`, `!==`
- `&&`
- `||`
- `!`

Best-effort passthrough currently exists for some Rust-ish expressions:

- `.len()`
- `.is_empty()`
- `.is_some()`
- `.is_none()`
- `.unwrap()`
- `.clone().unwrap()`

These are migration shims for existing Askama-style templates. Prefer the
portable helpers in new Katachi templates:

- `len(value)`
- `isEmpty(value)`
- `isSome(value)`
- `isNone(value)`

## Helper exports

`@relevate/katachi` exports:

- `ClassValue`
- `TemplateNode`
- `If`
- `Element`
- `For`
- `len`
- `isEmpty`
- `isSome`
- `isNone`

These are the public helper exports you use inside template files.

## What is not supported

Not all TSX is valid Katachi input.

Examples of unsupported or intentionally out-of-scope areas:

- hooks
- arbitrary function calls as template logic
- local mutation
- arbitrary statements in component bodies
- imports used for runtime React behavior
- framework-specific runtime features

In practice, treat template files as declarative template sources, not general
React modules.

## Recommended style

- keep component bodies declarative
- prefer `If` and `For` instead of ad hoc expression trees
- use imported Katachi templates for nested components
- prefer `className` in authoring files for editor familiarity
- keep prop types simple and serializable where possible
