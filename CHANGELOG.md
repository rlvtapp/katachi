# Changelog

## [0.3.0] - 2026-03-27

- Added fragment-root support so templates can keep multi-root authoring.
- Added explicit `<>...</>` fragment parsing support.
- Added top-level `<!DOCTYPE ...>` support in parsing and target emission.
- Preserved raw `script` and `style` bodies during parsing and Askama output.
- Added `If` / `Else` support for cleaner template branching.
- Added same-file local helper component support with compile-time inlining.
- Added target-specific attribute overrides via `attrs={{ askama: { ... }, react: { ... } }}`.
- Improved class-list parsing for compound conditional expressions.
- Removed the deprecated `safe(...)` helper in favor of `TemplateNode`-typed content.
- Improved `TemplateNode` handling across targets, including `TemplateNode[]` and `TemplateNode[][]` React prop typing.
- Moved shared HTML semantics into reusable target helpers.
- Added dedicated native HTML and Liquid output targets.
- Improved Askama emission for boolean HTML attributes and non-void elements.
- Improved Askama lowering for null checks, snake_case-facing variable output, and include-path based wrapper generation.
- Improved React emission for keyed `For` output, top-level `body` handling, and safer cross-target attribute lowering.
- Added an optional `--minify` build flag for compact Askama include and Liquid output.
- Added an optional `--askama-prefix` build flag for custom Askama include roots.
- Switched Askama Rust wrappers from inline template sources to generated include-file paths.

## [0.2.0] - 2026-03-18

- Released the initial multi-target Katachi compiler workflow.
- Added React, static JSX, and Askama emission targets.
- Shipped the restricted TSX authoring model and example project scaffolding.
