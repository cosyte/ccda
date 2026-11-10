/**
 * A second entry point of the fixture package, served at the subpath `@cosyte/ccda/extra`: the
 * check reads it as public, so its examples import through the subpath and never by relative path.
 */

/**
 * A helper the subpath exports.
 *
 * @example
 * ```ts
 * import { subpathHelper, notOnTheSubpath } from "@cosyte/ccda/extra";
 * subpathHelper() + notOnTheSubpath();
 * ```
 */
export function subpathHelper(): number {
  return 3;
}

/**
 * A second helper the subpath exports, whose example imports by relative path.
 *
 * @example
 * ```ts
 * import { subpathHelper } from "./subpath.js";
 * subpathHelper();
 * ```
 */
export function relativeOnTheSubpath(): number {
  return 4;
}
