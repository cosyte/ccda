/**
 * Every `@example` here cites an import that does not resolve, one per form, to prove the check
 * in `scripts/check-example-imports.ts` fails on each. Line numbers are asserted in
 * `test/example-imports.test.ts`, so append rather than insert.
 */

/**
 * A single-line named import of a symbol the entry point does not export.
 *
 * @example
 * ```ts
 * import { internalHelper } from "@cosyte/ccda";
 * ```
 */
export function singleLine(): void {}

/**
 * A named import split across lines, one name resolving and one not.
 *
 * @example
 * ```ts
 * import {
 *   exportedHelper,
 *   notExportedAnywhere,
 * } from "@cosyte/ccda";
 * ```
 */
export function multiLine(): void {}

/**
 * A default import of a module with no default export, and a type-only import of a name it lacks.
 *
 * @example
 * ```ts
 * import entry from "@cosyte/ccda";
 * import type { MissingType } from "./clean.js";
 * ```
 */
export function defaultAndType(): void {}

/**
 * A namespace import, a re-export and a dynamic import of modules that do not exist.
 *
 * @example
 * ```ts
 * import * as gone from "./gone.js";
 * export { anything } from "@cosyte/not-a-package";
 * const later = await import("./nowhere.js");
 * ```
 */
export function missingModules(): void {}

/**
 * A public export whose example imports a relative path, which a consumer reading the published
 * type declarations cannot follow.
 *
 * @example
 * ```ts
 * import { exportedWithRelativeExample } from "./broken.js";
 * ```
 */
export function exportedWithRelativeExample(): void {}
