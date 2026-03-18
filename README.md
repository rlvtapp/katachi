# Katachi

Katachi lets you author template-like components once in restricted TSX and
compile them to multiple outputs.

Today it can emit:

- React TSX components
- static-oriented TSX components
- Askama Rust wrapper files
- Askama include partials
- Shopify Liquid snippets

Katachi is still early, but it is already usable if you need one component
source that can target React-style environments, Askama, or Shopify Liquid.

## Getting Started

Try it once without installing it:

```bash
pnpm dlx @relevate/katachi build
```

or:

```bash
npx @relevate/katachi build
```

If you want Katachi in your project, install it:

```bash
pnpm add -D @relevate/katachi
```

or:

```bash
npm install --save-dev @relevate/katachi
```

Then add Katachi's JSX typing layer to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "types": ["node", "@relevate/katachi/jsx"]
  }
}
```

If you already use a `types` array, append `@relevate/katachi/jsx` instead of
replacing your existing entries.

By default, Katachi reads templates from:

```txt
src/templates/**/*.template.tsx
```

Build from your project root:

```bash
pnpm exec katachi build
```

or without installing it first:

```bash
pnpm dlx @relevate/katachi build
```

By default, Katachi writes:

- `dist/react`
- `dist/jsx-static`
- `dist/askama`
- `dist/askama/includes`
- `dist/liquid/snippets`

If you want custom paths:

```bash
pnpm exec katachi build --templates ./katachi/templates --dist ./generated
```

## First Template

Start with a normal `.template.tsx` file:

```tsx
import { If, type TemplateNode } from "@relevate/katachi";

export type Props = {
  tone: "calm" | "urgent";
  title: string;
  children?: TemplateNode;
};

export default function NoticePanel({ tone, title, children }: Props) {
  return (
    <aside
      className={[
        "rounded-3xl border px-5 py-4",
        tone == "calm" && "border-sky-200 bg-sky-50/80",
        tone == "urgent" && "border-rose-200 bg-rose-50/80",
      ]}
    >
      <h3>{title}</h3>
      <If test={tone == "urgent"}>
        <p>Action recommended</p>
      </If>
      {children}
    </aside>
  );
}
```

Build it with:

```bash
pnpm exec katachi build
```

That generates target-specific files under `dist/`.

If you are working inside the Katachi source repository itself, use the local
bin entrypoint instead:

```bash
node ./bin/katachi.mjs build --project ./examples/basic
```

## What Katachi Generates

By default, build output goes to:

- `dist/react/**/*.tsx`
- `dist/jsx-static/**/*.tsx`
- `dist/askama/**/*.rs`
- `dist/askama/includes/**/*.html`
- `dist/liquid/snippets/**/*.liquid`

Nested templates preserve their relative directory layout.

## What Katachi Supports Today

- template authoring in `src/templates/**/*.template.tsx`
- imports between templates
- dynamic `class` and `className` arrays
- `If`
- `For`
- nested components
- React output
- static-oriented TSX output
- Askama output
- Shopify Liquid snippet output

## Why Katachi Exists

At Relevate, our docs system is built in Rust and renders components with
Askama. We also wanted a live editor that could use the same component
structure and styling without maintaining a separate hand-written React
component library.

Katachi exists to make that possible: one authoring format, multiple outputs.

## What Katachi Is Not

- not a full React compiler
- not a full Askama replacement
- not arbitrary JavaScript execution in templates
- not a general-purpose frontend framework

## Documentation

- [Getting started](./docs/getting-started.md)
- [Template syntax](./docs/syntax.md)
- [Target outputs](./docs/targets.md)
- [Architecture](./docs/architecture.md)
- [Consumer example](./examples/basic/README.md)

## Current Limitations

- The TSX input is not arbitrary React.
- Generated React output is valid React, but the input syntax is compiler-owned.
- The repository-level smoke tests build the public example project under `examples/basic`.

## Contributing

If you are working on Katachi itself rather than using it in another project:

- `pnpm build`
- `pnpm verify:examples`
- `pnpm test`
- `pnpm typecheck`

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/architecture.md](./docs/architecture.md).

## License

MIT. See [LICENSE](./LICENSE).
