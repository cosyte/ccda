/**
 * IVL_PQ — HL7 v3 Interval of Physical Quantity. A range of dimensioned
 * quantities expressed via `<low>` / `<high>` bounds (or `<center>` + `<width>`),
 * each a {@link PQ}. Used for dose ranges and similar bounded measurements.
 */

import { child } from "../dom.js";
import { parsePq, type PQ } from "./pq.js";
import { readNullFlavor, type ParseCtx } from "./_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Interval of Physical Quantity. Any subset of the bound fields
 * may be present; `nullFlavor` is set when the interval element declared one.
 *
 * @example
 * ```ts
 * import type { IVL_PQ } from "@cosyte/ccda";
 * const range: IVL_PQ = { low: { value: 1, unit: "mg" }, high: { value: 2, unit: "mg" } };
 * ```
 */
export interface IVL_PQ {
  readonly low?: PQ;
  readonly high?: PQ;
  readonly center?: PQ;
  readonly width?: PQ;
  readonly nullFlavor?: string;
}

/**
 * Parse an `IVL_PQ` element into a typed {@link IVL_PQ}. Returns `undefined`
 * when the element is absent. Never throws; omits any bound the element lacks.
 *
 * @example
 * ```ts
 * import { parseIvlPq } from "@cosyte/ccda";
 * const range = parseIvlPq(el, { emit: () => {} });
 * console.log(range?.low?.value, range?.high?.value);
 * ```
 */
export function parseIvlPq(el: Element | undefined, ctx: ParseCtx): IVL_PQ | undefined {
  if (el === undefined) return undefined;
  const out: { low?: PQ; high?: PQ; center?: PQ; width?: PQ; nullFlavor?: string } = {};
  const low = parsePq(child(el, "low"), ctx);
  if (low !== undefined) out.low = low;
  const high = parsePq(child(el, "high"), ctx);
  if (high !== undefined) out.high = high;
  const center = parsePq(child(el, "center"), ctx);
  if (center !== undefined) out.center = center;
  const width = parsePq(child(el, "width"), ctx);
  if (width !== undefined) out.width = width;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}
