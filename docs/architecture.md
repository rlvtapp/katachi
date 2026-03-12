# Architecture

This document is for contributors working on Katachi itself.

Katachi has four major layers:

1. Authoring input
2. Parser
3. Portable AST
4. Target emitters

## Flow

```txt
src/templates/**/*.template.tsx
  -> core/parser.ts
  -> core/ast.ts node model
  -> target emitters
  -> dist/*
```

## Canonical source

The canonical source is restricted TSX, not React semantics and not Askama syntax.

That distinction matters:

- authoring uses TSX because it is ergonomic
- the compiler owns the meaning of that TSX subset
- outputs are generated for each target separately

## AST

[src/core/ast.ts](../src/core/ast.ts) defines the portable template model.
[src/core/types.ts](../src/core/types.ts) defines the shared compiler interfaces around that model.

Key node kinds:

- `text`
- `slot`
- `print`
- `if`
- `for`
- `element`
- `component`

Key attribute kinds:

- `text`
- `expr`
- `classList`

This AST is the real source of truth once parsing is complete.

## Parser

[src/core/parser.ts](../src/core/parser.ts) lowers restricted TSX into AST nodes.

Responsibilities:

- parse elements and attributes
- normalize `className` to internal `class`
- convert `If` and `For`
- convert `{children}` to slot nodes
- resolve imported template components later during build

The parser is currently handwritten and string-based. That is fine for a prototype, but a stronger long-term direction is to parse real TSX via Babel, SWC, or the TypeScript compiler and then lower from that AST.

## Targets

Each output format gets its own emitter module:

- [src/targets/react.ts](../src/targets/react.ts)
- [src/targets/static-jsx.ts](../src/targets/static-jsx.ts)
- [src/targets/askama.ts](../src/targets/askama.ts)

Shared cross-target emitter helpers live in:

- [src/targets/shared.ts](../src/targets/shared.ts)

The build registry is:

- [src/targets/index.ts](../src/targets/index.ts)

## Build entrypoint

[src/core/build.ts](../src/core/build.ts) does project-level orchestration:

- scan template files
- parse all templates
- resolve template imports
- build per-template component registries
- invoke each configured output target
- write files into `dist/`

## Verification

[src/core/verify.ts](../src/core/verify.ts) compares generated Askama partials against expected Askama fixtures.

That comparison uses normalization so it can separate:

- exact match
- format-only differences
- functional differences

This is currently the main regression safety net for Askama output.

## Design principles

- one canonical semantic representation
- targets own their own emission strategy
- authoring should be ergonomic
- compiler internals should stay target-agnostic where possible
- generated output should become more target-idiomatic over time

## Near-term architecture improvements

- replace the handwritten parser with a real TSX AST pipeline
- formalize the target interface further
- add a reusable programmatic API separate from the build script
- decide whether to keep a single-package repo or split `core` and `cli` packages later
