# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-27

### Added

- Fragment-root support so templates can keep multi-root authoring
- Explicit `<>...</>` fragment parsing support
- Top-level `<!DOCTYPE ...>` support in parsing and target emission
- `If` / `Else` support for cleaner template branching
- Same-file local helper component support with compile-time inlining
- Target-specific attribute overrides via `attrs={{ askama: { ... }, react: { ... } }}`
- Dedicated native HTML and Liquid output targets
- Optional `--minify` build flag for compact Askama include and Liquid output
- Optional `--askama-prefix` build flag for custom Askama include roots
- Restored `--target` support for selective target builds

### Changed

- Raw `script` and `style` bodies are now preserved during parsing and Askama output
- Class-list parsing now handles compound conditional expressions more reliably
- `TemplateNode` handling is improved across targets, including `TemplateNode[]` and `TemplateNode[][]` React prop typing
- Shared HTML semantics now live in reusable target helpers
- Askama emission now handles boolean HTML attributes and non-void elements more cleanly
- Askama lowering now handles null checks, snake_case-facing variable output, and include-path based wrapper generation
- React emission now handles keyed `For` output, top-level `body` handling, and safer cross-target attribute lowering
- Askama Rust wrappers now reference generated include-file paths instead of inline template sources
- The npm publish workflow now emits provenance metadata

## [0.2.0] - 2026-03-18

### Added

- Shopify Liquid snippet output under `dist/liquid/snippets`
- `Element` helper for dynamic intrinsic tags such as `tag={["h", level]}`

### Changed

- Package publishing now uses compiled `dist/` artifacts
- GitHub release publishing is wired for npm trusted publishing
- `TemplateNode` is now the markup/content channel for template props and children
- React and static TSX targets now hoist safe dynamic tags to typed local tag variables
- Askama and Liquid targets now emit interpolated intrinsic tag names for dynamic `Element` tags

### Removed

- `safe(...)` from the public template model in favor of `TemplateNode`-typed markup props

## [0.1.0] - 2026-03-12

### Added

- Restricted TSX authoring input for shared component templates
- React output under `dist/react`
- Static-oriented TSX output under `dist/jsx-static`
- Askama Rust wrapper output under `dist/askama`
- Askama include partial output under `dist/askama/includes`
- Public example project under `examples/basic`
- Parser, target, build, and verification tests
- CLI usage through `katachi build` and `katachi verify:examples`

### Notes

- This is the initial public release of Katachi.
- The supported input surface is intentionally constrained and documented in `docs/syntax.md`.
