/**
 * Compatibility barrel for existing internal imports.
 *
 * New code should usually import from `./ast` or `./targets/*` directly.
 */

export * from "./ast";
export { emitReact, emitReactComponent } from "../targets/react";
export { emitStaticJsx, emitStaticJsxComponent } from "../targets/static-jsx";
export { emitAskama, emitAskamaComponent, emitAskamaPartial } from "../targets/askama";
