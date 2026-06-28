/**
 * BL — HL7 v3 Boolean. A `@value` of `"true"` / `"false"`, with optional
 * `nullFlavor`. Distinct from `nullFlavor` itself: `negationInd` on a clinical
 * act is a BL-valued attribute (parsed via {@link parseBlAttr}), which is why
 * the suite models BL as a first-class datatype even though Phase 1 does not
 * yet extract clinical entries.
 */

import { attr } from "../dom.js";
import { parseBooleanValue, readNullFlavor, type ParseCtx } from "./_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Boolean. `value` is the parsed boolean (omitted when the
 * `@value` token was neither `"true"` nor `"false"`); `nullFlavor` is set when
 * the element declared one.
 *
 * @example
 * ```ts
 * import type { BL } from "@cosyte/ccda";
 * const flag: BL = { value: true };
 * ```
 */
export interface BL {
  readonly value?: boolean;
  readonly nullFlavor?: string;
}

/**
 * Parse a `BL` element (one carrying a `@value`) into a typed {@link BL}.
 * Returns `undefined` when the element is absent. Never throws.
 *
 * @example
 * ```ts
 * import { parseBl } from "@cosyte/ccda";
 * const bl = parseBl(el, { emit: () => {} });
 * console.log(bl?.value);
 * ```
 */
export function parseBl(el: Element | undefined, ctx: ParseCtx): BL | undefined {
  if (el === undefined) return undefined;
  const out: { value?: boolean; nullFlavor?: string } = {};
  const value = parseBooleanValue(attr(el, "value"));
  if (value !== undefined) out.value = value;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}

/**
 * Read a named BL-valued attribute (e.g. `negationInd`) off an element,
 * returning the parsed boolean or `undefined` when absent or non-boolean. This
 * is the distinct path for attributes like `@negationInd` that are booleans on
 * an element rather than a child `BL` element.
 *
 * @example
 * ```ts
 * import { parseBlAttr } from "@cosyte/ccda";
 * const negated = parseBlAttr(observationEl, "negationInd"); // boolean | undefined
 * ```
 */
export function parseBlAttr(el: Element, name: string): boolean | undefined {
  return parseBooleanValue(attr(el, name));
}
