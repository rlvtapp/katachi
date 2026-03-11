/**
 * Compatibility barrel for existing internal imports.
 *
 * New code should usually import from `./ast` or `./targets/*` directly.
 */

export * from "./ast.js";
export { emitReact, emitReactComponent } from "../targets/react.js";
export { emitStaticJsx, emitStaticJsxComponent } from "../targets/static-jsx.js";
export { emitAskama, emitAskamaComponent, emitAskamaPartial } from "../targets/askama.js";
