# Getting Started

This guide is for using Katachi in your own project, not for working on the
Katachi repository itself.

## 1. Install Katachi

With pnpm:

```bash
pnpm add -D @relevate/katachi
```

With npm:

```bash
npm install --save-dev @relevate/katachi
```

If you only want to try it without installing it first:

```bash
pnpm dlx @relevate/katachi build
```

or:

```bash
npx @relevate/katachi build
```

## 2. Update `tsconfig.json`

Katachi templates use TSX syntax, but they are not normal React components.
Tell TypeScript to load Katachi's JSX typing layer:

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

## 3. Create a template

By default, Katachi reads from:

```txt
src/templates/**/*.template.tsx
```

Example:

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

If a prop contains template content instead of plain text, type it as
`TemplateNode` and render it directly. Katachi will preserve it as safe content
for Askama automatically.

```tsx
import { type TemplateNode } from "@relevate/katachi";

export type CardProps = {
  title_html: TemplateNode;
};

export default function Card({ title_html }: CardProps) {
  return <h2>{title_html}</h2>;
}
```

## 4. Build outputs

From your project root:

```bash
pnpm exec katachi build
```

Without installing locally:

```bash
pnpm dlx @relevate/katachi build
```

With npm:

```bash
npx @relevate/katachi build
```

You can also point Katachi at custom paths:

```bash
pnpm exec katachi build --templates ./katachi/templates --dist ./generated
```

If you want compact Askama include and Liquid output, add:

```bash
pnpm exec katachi build --minify
```

## 5. Consume the generated files

By default, Katachi writes:

- `dist/react/**/*.tsx`
- `dist/jsx-static/**/*.tsx`
- `dist/askama/**/*.rs`
- `dist/askama/includes/**/*.html`

Typical usage:

- use `dist/react` in your editor or React app
- use `dist/askama` and `dist/askama/includes` in your Rust/Askama app

If you are evaluating Katachi for a shared component library, this is the
normal model: author once, then consume the generated output from each target
environment.

## Nested components

Import other Katachi templates with the `.template` path:

```tsx
import Glyph from "./glyph.template";
```

Then use them as normal capitalized TSX components:

```tsx
<Glyph name="spark" size="16" tone="calm" className="h-4 w-4" />
```

Katachi resolves those imports into:

- TSX imports for React output
- Askama include wiring for Askama output

## Next steps

- See [syntax.md](./syntax.md) for the supported syntax.
- See [targets.md](./targets.md) for output details.
- See [../examples/basic/README.md](../examples/basic/README.md) for a fuller consumer-style example.
