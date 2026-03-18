# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Shopify Liquid snippet output under `dist/liquid/snippets`
- `Element` helper for dynamic intrinsic tags such as `tag={["h", level]}`

### Changed

- Package publishing now uses compiled `dist/` artifacts
- GitHub release publishing is wired for npm trusted publishing
- `TemplateNode` is now the markup/content channel for template props and
  children
- React and static TSX targets now hoist safe dynamic tags to typed local tag
  variables
- Askama and Liquid targets now emit interpolated intrinsic tag names for
  dynamic `Element` tags

### Removed

- `safe(...)` from the public template model in favor of `TemplateNode`-typed
  markup props

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
- The supported input surface is intentionally constrained and documented in
  `docs/syntax.md`.
