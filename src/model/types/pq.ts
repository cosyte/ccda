/**
 * PQ — HL7 v3 Physical Quantity. A dimensioned number: a `@value` and an
 * optional `@unit` (UCUM). The raw value string is preserved alongside the
 * parsed number so a non-numeric `@value` is never silently coerced.
 */

import { attr } from "../dom.js";
import { readNullFlavor, type ParseCtx } from "./_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Physical Quantity. `value` is the parsed number (omitted when
 * `@value` was non-numeric), `raw` is the verbatim `@value` string, and `unit`
 * is the UCUM unit when present.
 *
 * @example
 * ```ts
 * import type { PQ } from "@cosyte/ccda";
 * const dose: PQ = { value: 81, raw: "81", unit: "mg" };
 * ```
 */
export interface PQ {
  readonly value?: number;
  readonly raw?: string;
  readonly unit?: string;
  readonly nullFlavor?: string;
}

/**
 * Parse a `PQ` element into a typed {@link PQ}. Returns `undefined` when the
 * element is absent. A non-numeric `@value` is preserved in `raw` with `value`
 * omitted. Never throws.
 *
 * @example
 * ```ts
 * import { parsePq } from "@cosyte/ccda";
 * const pq = parsePq(el, { emit: () => {} });
 * console.log(pq?.value, pq?.unit);
 * ```
 */
export function parsePq(el: Element | undefined, ctx: ParseCtx): PQ | undefined {
  if (el === undefined) return undefined;
  const out: { value?: number; raw?: string; unit?: string; nullFlavor?: string } = {};
  const raw = attr(el, "value");
  if (raw !== undefined) {
    out.raw = raw;
    const num = Number(raw);
    if (!Number.isNaN(num) && raw.trim() !== "") out.value = num;
  }
  const unit = attr(el, "unit");
  if (unit !== undefined) out.unit = unit;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}
