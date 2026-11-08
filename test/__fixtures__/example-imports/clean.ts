/**
 * Every `@example` here resolves: the fixture's clean half.
 */

/**
 * A helper the entry point exports.
 *
 * @example
 * ```ts
 * import { exportedHelper } from "@cosyte/ccda";
 * exportedHelper(); // 1
 * ```
 */
export function exportedHelper(): number {
  return 1;
}

/**
 * A helper the entry point does not export, cited from its own module.
 *
 * @example
 * ```ts
 * import {
 *   internalHelper,
 *   exportedHelper as sameModule,
 * } from "./clean.js";
 * import * as clean from "./clean.js";
 * import { readFileSync } from "node:fs";
 * internalHelper() + sameModule() + clean.internalHelper();
 * ```
 */
export function internalHelper(): number {
  return 2;
}
