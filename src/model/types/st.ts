/**
 * ST — HL7 v3 Character String. The simplest v3 datatype: a plain text value
 * with an optional `nullFlavor`. Used for `title`, free-text names, and similar
 * narrative-adjacent fields. The value is the element's trimmed text content;
 * embedded markup is not interpreted.
 */

import { readNullFlavor, type ParseCtx } from "./_shared.js";
import { text } from "../dom.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Character String. `value` is the trimmed text content (omitted
 * when empty); `nullFlavor` is set when the element declared one instead of a
 * value.
 *
 * @example
 * ```ts
 * import type { ST } from "@cosyte/ccda";
 * const title: ST = { value: "Allergies, Adverse Reactions, Alerts" };
 * ```
 */
export interface ST {
  readonly value?: string;
  readonly nullFlavor?: string;
}

/**
 * Parse an `ST` element into a typed {@link ST}. Returns `undefined` when the
 * element is absent. Never throws.
 *
 * @example
 * ```ts
 * import { parseSt } from "@cosyte/ccda";
 * const title = parseSt(titleEl, { emit: () => {} });
 * console.log(title?.value);
 * ```
 */
export function parseSt(el: Element | undefined, ctx: ParseCtx): ST | undefined {
  if (el === undefined) return undefined;
  const out: { value?: string; nullFlavor?: string } = {};
  const value = text(el);
  if (value !== undefined) out.value = value;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}
