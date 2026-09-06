# Custom Classes

Katachi components can expose a `className` prop without replacing their
authored defaults. Katachi emits a target-native merge call so conflicting
Tailwind utilities resolve predictably.

## Enable merging

Add `classNames` to `katachi.config.ts`:

```ts
import { defineConfig } from "@relevate/katachi";

export default defineConfig({
  classNames: {
    mode: "dynamic-only",
  },
});
```

`dynamic-only` is the recommended mode. It enables merging only for authored
class arrays that contain the component's dynamic `className` prop. Other class
arrays retain Katachi's normal join behavior and do not gain a merge import.

## Author a customizable component

Put defaults, conditions, and the consumer-provided value in one class array:

```tsx
export type Props = {
  active?: boolean;
  className?: string;
};

export default function Card({ active, className }: Props) {
  return (
    <div
      className={[
        "my-4 rounded-xl border bg-zinc-50/50",
        active && "ring-2 ring-violet-500",
        className,
      ]}
    />
  );
}
```

Place `className` last when consumer classes should win conflicts with the
defaults.

## React and static JSX

By default, Katachi imports `twMerge` from `tailwind-merge`. Install it in the
project that compiles or runs the generated components:

```bash
pnpm add tailwind-merge
```

The React output is equivalent to:

```tsx
import { twMerge as __katachiMergeClasses } from "tailwind-merge";

export default function Card({ active, className }: Props) {
  return (
    <div
      className={__katachiMergeClasses(
        "my-4 rounded-xl border bg-zinc-50/50",
        active ? "ring-2 ring-violet-500" : null,
        className,
      )}
    />
  );
}
```

The merger is always called for an enabled class array. It must accept absent
values such as `undefined`, `null`, and `false`; a runtime `className` branch is
not generated.

To use your own merger, configure its module and export:

```ts
export default defineConfig({
  classNames: {
    mode: "dynamic-only",
    react: { from: "@/runtime/classes", import: "cn" },
    staticJsx: { from: "@/runtime/classes", import: "cn" },
  },
});
```

```ts
export function cn(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
```

Use `import: "default"` when the module provides a default export. Module
specifiers are written to generated files unchanged, so aliases and relative
paths must be valid from those files.

## Askama

Askama merging is implemented by the consuming Rust crate. Configure the filter
name and the module that exports it:

```ts
export default defineConfig({
  classNames: {
    mode: "dynamic-only",
    askama: {
      filter: "merge_classes",
      filtersModule: "crate::theme::class_names",
    },
  },
});
```

With Askama 0.16 and `tw_merge`, that module can be:

```rust
pub use askama::filters::*;
use askama::{Result, Values};
use tw_merge::merge::tw_merge_slice;

#[askama::filter_fn]
pub fn merge_classes(value: impl ToString, _: &dyn Values) -> Result<String> {
    Ok(tw_merge_slice(&[&value.to_string()]))
}
```

Add the corresponding Rust dependencies:

```toml
[dependencies]
askama = "0.16"
tw_merge = "0.1"
```

Katachi wraps the rendered class value in the configured filter:

```jinja
class="{% filter merge_classes %}my-4 rounded-xl border bg-zinc-50/50{% if active %} ring-2 ring-violet-500{% endif %} {{ class_name }}{% endfilter %}"
```

Generated Askama wrappers import `filtersModule` as `filters`. Re-exporting
`askama::filters::*` keeps built-in filters such as `safe` available alongside
the custom filter, including in nested includes.

## Modes

- `dynamic-only`: merge class arrays containing the dynamic `className` prop.
- `always`: merge every class array for targets with merge support.
- `off`: retain plain class joining without removing the rest of the config.

Class merging is disabled when `classNames` is omitted.
