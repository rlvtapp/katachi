# Configuration

Katachi automatically loads `katachi.config.ts` from the project root. The
configuration is optional; without it, Katachi keeps its original defaults.

```ts
import { defineConfig } from "@relevate/katachi";

export default defineConfig({
  inputs: [
    {
      directory: "src/components",
      include: ["**/*.template.tsx"],
      exclude: ["**/*.draft.template.tsx", "legacy/**"],
      outputPrefix: "components",
    },
    {
      directory: "src/layouts",
      include: ["page.template.tsx", "errors/**/*.template.tsx"],
      outputPrefix: "layouts",
    },
  ],
  outDir: "generated",
  targets: ["react", "askama", "askama-includes"],
  askama: {
    includePrefix: "themes/oxide/generated/askama/includes",
  },
  minify: true,
});
```

Input patterns are matched against paths relative to each input directory.
Files from different inputs must have distinct output paths. Use
`outputPrefix` to organize multiple roots or prevent collisions.

CLI options override matching configuration values. You can also select an
explicit config file:

```bash
katachi build --config ./config/katachi.config.ts
```

## Dynamic class-name merging

Class merging is off unless `classNames` is configured. The recommended mode
merges only a class list containing the dynamic `className` component prop:

```ts
export default defineConfig({
  classNames: {
    mode: "dynamic-only",
  },
});
```

Given this template:

```tsx
export type Props = {
  active: boolean;
  className?: string;
};

export default function Card({ active, className }: Props) {
  return (
    <div className={["rounded-xl p-6", active && "ring-2", className]} />
  );
}
```

For a component containing a dynamic `className`, Katachi always calls the
configured target merger with the authored defaults and `className`. Merge
implementations must accept an absent value. This keeps generated output
consistent while allowing a caller's classes to resolve conflicts with the
authored defaults.

The default React and static-JSX adapter imports the named `twMerge` export
from `tailwind-merge`. Install that package in the application consuming the
generated components.

You can point generated JavaScript at your own function instead:

```ts
export default defineConfig({
  classNames: {
    mode: "dynamic-only",
    react: {
      from: "@/runtime/classes",
      import: "cn",
    },
    staticJsx: {
      from: "@/runtime/classes",
      import: "cn",
    },
  },
});
```

The referenced function must accept nullable class values as positional
arguments and return a string:

```ts
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
```

Katachi emits the module specifier exactly as configured. Aliases and relative
paths therefore need to be valid from the generated component.

Askama uses a custom filter owned by the consuming Rust crate:

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

The filter receives the rendered class string. `filtersModule`, when provided,
is imported as `filters` beside every generated Askama `Template` derive so the
filter is in scope, including through nested component includes. This allows an
application to use `tw_merge`, its own conflict rules, or simple joining without
coupling Katachi to a particular Rust implementation.

Use `mode: "always"` to merge every class array. Use `mode: "off"` to retain
plain class joining while keeping the rest of the configuration in place.
