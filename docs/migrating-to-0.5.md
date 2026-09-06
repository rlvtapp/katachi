# Migrating to Katachi 0.5

Katachi 0.5 adds typed project configuration, multiple input roots, target
selection, and optional class-name merging. Existing projects can upgrade
without adding a config file; the previous defaults remain unchanged.

## Upgrade

```bash
pnpm add -D @relevate/katachi@^0.5.0
```

Katachi 0.5 requires Node.js 22 or newer.

## Add a typed config

Create `katachi.config.ts` in the project root when you need persistent build
settings:

```ts
import { defineConfig } from "@relevate/katachi";

export default defineConfig({
  inputs: [
    {
      directory: "src/components",
      include: ["**/*.template.tsx"],
      exclude: ["**/*.draft.template.tsx"],
    },
  ],
  outDir: "generated",
  targets: ["react", "askama", "askama-includes"],
});
```

CLI flags still work and override matching config values.

## Opt into class merging

Class merging is not enabled automatically. Add the recommended mode:

```ts
export default defineConfig({
  classNames: { mode: "dynamic-only" },
});
```

Then expose `className` through an authored class array:

```tsx
export default function Card({ className }: { className?: string }) {
  return <div className={["rounded-xl p-4", className]} />;
}
```

If you generate React or static JSX with the default adapter, install
`tailwind-merge` in the consuming project. Askama consumers must provide a
filter implementation. See [Custom classes](./class-names.md) for both setups.

Custom JavaScript mergers must accept absent values. Katachi 0.5 always invokes
the merger for an enabled class array instead of generating a runtime branch.
