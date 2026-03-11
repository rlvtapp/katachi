# Contributing

Thanks for taking an interest in Katachi.

## Before you start

Katachi is still early. The current priority is keeping the compiler small, understandable, and honest about its supported surface.

Please open an issue or discussion before starting large feature work, especially for:

- new targets
- new authoring syntax
- parser rewrites
- runtime behavior changes

## Local setup

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm verify:examples
```

## Contribution guidelines

- Keep changes focused.
- Prefer extending the typed compiler model over adding special cases.
- Add tests for parser, emitter, or build behavior when you change them.
- Update docs when the supported authoring surface changes.
- Do not broaden the supported TSX subset without documenting it.

## Project shape

The most important internal layers are:

- `src/core/parser.ts`
- `src/core/ast.ts`
- `src/core/types.ts`
- `src/targets/*`
- `tests/*.test.ts`

If you add a new target:

1. create a target module in `src/targets/`
2. register it in `src/targets/index.ts`
3. add tests for the generated output

## Scope

Katachi is intentionally constrained.

Non-goals include:

- full React semantics
- arbitrary JavaScript execution in templates
- full Askama parity in the authoring language

If a proposal pushes Katachi toward being a general-purpose framework compiler, it should be justified very carefully.
