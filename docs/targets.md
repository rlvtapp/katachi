# Targets

Katachi emits multiple outputs from the same template source.

This guide is about what gets generated and how you would typically use those
outputs in a real project.

## Current targets

### `react`

- output folder: `dist/react`
- file type: `.tsx`
- purpose: React-consumable component output for apps and editor environments

### `jsx-static`

- output folder: `dist/jsx-static`
- file type: `.tsx`
- purpose: TSX output oriented toward static readability

### `askama`

- output folder: `dist/askama`
- file type: `.rs`
- purpose: Rust Askama wrapper output

### `askama-includes`

- output folder: `dist/askama/includes`
- file type: `.html`
- purpose: Askama partial output

## Which output should you use?

- Use `dist/react` if your consumer is a React app or an editor surface built in React.
- Use `dist/jsx-static` if you want a TSX artifact that reads a bit more statically.
- Use `dist/askama` and `dist/askama/includes` if your consumer is Rust + Askama.

## Relative imports and includes

Nested Katachi templates keep their relative structure in generated output.

That means:

- a nested React component import stays relative in `dist/react`
- a nested Askama include stays relative in `dist/askama/includes`

## Internal note

If you are extending Katachi itself, the target registry lives in
[src/targets/index.ts](../src/targets/index.ts), and each target has its own
emitter module under [src/targets](../src/targets).
