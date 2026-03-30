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
import { For, If, isEmpty, len, type TemplateNode } from "@relevate/katachi";

export type Props = {
  title: string;
  rows: string[][];
  children?: TemplateNode;
};

export default function Example({ title, rows, children }: Props) {
  return (
    <section>
      <h2>{title}</h2>
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

### Imported template components

Capitalized tags are treated as template component invocations.

```tsx
import Icon from "./icon.template";

<Icon icon="search" size="16" />
```

### Same-file local helper components

You can also define capitalized helper components in the same file.
Katachi expands them at compile time.

```tsx
function Styling({ tone, children }: { tone: string; children?: TemplateNode }) {
  return (
    <div className={["wrapper", tone == "warn" && "warn"]}>
      {children}
    </div>
  );
}

export default function Example() {
  return <Styling tone="warn">Alert</Styling>;
}
```

These helpers are useful for readability, but they still need to stay inside the
Katachi subset. They are not runtime React components.

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

### `TemplateNode`

Use `TemplateNode` for props that contain template content rather than plain
text.

```tsx
import { type TemplateNode } from "@relevate/katachi";

type Props = {
  title_html: TemplateNode;
};

<h2>{title_html}</h2>
```

Katachi treats `TemplateNode` values and `children` as safe template content in
Askama output automatically. There is no separate `safe(...)` helper.

### `If`

Use `If` for conditional rendering.

```tsx
import { If } from "@relevate/katachi";

<If test={variant == "warning"}>
  <p>Warning</p>
</If>
```

Optional `Else` blocks are supported:

```tsx
<If test={variant == "warning"}>
  <p>Warning</p>
  <Else>
    <p>All good</p>
  </Else>
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

### Top-level doctypes

Top-level HTML declarations such as `<!DOCTYPE html>` are supported.

```tsx
export default function Layout() {
  return (
    <!DOCTYPE html>
    <html></html>
  );
}
```

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

### Target-specific attrs

Use `attrs` when a specific target needs extra attributes.

```tsx
<div
  className="shell"
  attrs={{
    askama: { "@click": "open = false" },
    liquid: { "@click": "open = false" },
    react: { "data-preview-role": "shell" },
  }}
/>
```

Shared attrs still apply to every target. Target-specific attrs are merged on top.

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
- use same-file helper components when they improve readability
- prefer `className` in authoring files for editor familiarity
- keep prop types simple and serializable where possible
