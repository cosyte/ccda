/**
 * IVL_PQ, HL7 v3 Interval of Physical Quantity. A range of dimensioned
 * quantities expressed via `<low>` / `<high>` bounds (or `<center>` + `<width>`),
 * each a {@link PQ}. Used for dose ranges and similar bounded measurements.
 */

import { child } from "../dom.js";
import { parsePq, pqWithoutDerivedValue, type PQ } from "./pq.js";
import { contradictsAssertedValue, readNullFlavor, type ParseCtx } from "./_shared.js";
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
 * A `@nullFlavor` on the **interval itself** beside bounds that carry values is
 * the same contradiction {@link parsePq} resolves one level down, and gets the
 * same treatment: `CONTRADICTORY_NULL_FLAVOR` is emitted once for the interval,
 * every bound is preserved verbatim, and the derived `value` number is withheld
 * from each of them. Without this a dose *range* declared unknown would still
 * hand `doseRange.low.value` back to a caller, which is the scalar-dose harm by
 * another route.
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
  const high = parsePq(child(el, "high"), ctx);
  const center = parsePq(child(el, "center"), ctx);
  const width = parsePq(child(el, "width"), ctx);
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;

  // A bound asserts a magnitude when it carries a verbatim `@value`; a bound
  // that is itself only a nullFlavor asserts nothing and does not contradict.
  const bounds = [low, high, center, width];
  const asserted = bounds.some((b) => b?.raw !== undefined);
  const contradicted = contradictsAssertedValue(el, "IVL_PQ", nullFlavor, asserted, ctx);
  const keep = (b: PQ | undefined): PQ | undefined =>
    b === undefined || !contradicted ? b : pqWithoutDerivedValue(b);

  const keptLow = keep(low);
  if (keptLow !== undefined) out.low = keptLow;
  const keptHigh = keep(high);
  if (keptHigh !== undefined) out.high = keptHigh;
  const keptCenter = keep(center);
  if (keptCenter !== undefined) out.center = keptCenter;
  const keptWidth = keep(width);
  if (keptWidth !== undefined) out.width = keptWidth;
  return out;
}
