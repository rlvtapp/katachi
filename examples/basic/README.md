# Basic Example

This example is a small consumer-style Katachi project you can copy from when
setting up your own repo.

It includes:

- authoring templates in `src/templates/`
- a `tsconfig.json` that adds `@relevate/katachi/jsx` to `compilerOptions.types`
- expected Askama partials in `components/`

The example templates intentionally cover a useful slice of normal Katachi
usage:

- simple wrappers with `children`
- imported nested components
- dynamic `className` arrays
- `If`
- nested `For`
- `TemplateNode` content props
- mixed HTML and expression attributes

## Example components

- `badge-chip.template.tsx`
- `comparison-table.template.tsx`
- `glyph.template.tsx`
- `hover-note.template.tsx`
- `media-frame.template.tsx`
- `notice-panel.template.tsx`
- `resource-tile.template.tsx`
- `stack-shell.template.tsx`

## Build the example project

From the Katachi repo root:

```bash
pnpm exec katachi build --project ./examples/basic
```

That writes generated output to:

- `examples/basic/dist/react`
- `examples/basic/dist/jsx-static`
- `examples/basic/dist/askama`
- `examples/basic/dist/liquid/snippets`

## Verify the public Askama fixtures

From the Katachi repo root:

```bash
pnpm verify:examples
```

That builds `examples/basic` and compares the generated Askama partials against
the expected files in `examples/basic/components`.

If you are trying to understand how a consumer project should look, start here
and then read [docs/getting-started.md](../../docs/getting-started.md).

The important parts to copy into your own project are:

- `src/templates/`
- `tsconfig.json`
- the `@relevate/katachi/jsx` type entry
- your chosen `katachi build` command
