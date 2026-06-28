/**
 * IVL_TS — HL7 v3 Interval of Point in Time. A time range expressed via
 * `<low>` / `<high>` bounds, each a {@link TS}. The canonical use in the C-CDA
 * header is `effectiveTime` on the document and on participations (the service
 * event period, an author time, a patient's coverage window).
 */

import { attr, child, positionOf } from "../dom.js";
import { parseTs, type TS } from "./ts.js";
import { parseV3DateTime, readNullFlavor, type ParseCtx } from "./_shared.js";
import { malformedDateTime } from "../../parser/warnings.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Interval of Point in Time. `low`/`high` are the bounds;
 * `value` captures the degenerate case where the interval element itself
 * carries a `@value` (a point expressed as an interval). `nullFlavor` is set
 * when the element declared one.
 *
 * @example
 * ```ts
 * import type { IVL_TS } from "@cosyte/ccda";
 * const period: IVL_TS = { low: { raw: "20260101" }, high: { raw: "20261231" } };
 * ```
 */
export interface IVL_TS {
  readonly low?: TS;
  readonly high?: TS;
  readonly value?: TS;
  readonly nullFlavor?: string;
}

/**
 * Parse an `IVL_TS` element into a typed {@link IVL_TS}. Returns `undefined`
 * when the element is absent. Handles both the `<low>`/`<high>` bound form and
 * the degenerate `@value` point form. Never throws.
 *
 * @example
 * ```ts
 * import { parseIvlTs } from "@cosyte/ccda";
 * const period = parseIvlTs(effectiveTimeEl, { emit: () => {} });
 * console.log(period?.low?.date?.toISOString());
 * ```
 */
export function parseIvlTs(el: Element | undefined, ctx: ParseCtx): IVL_TS | undefined {
  if (el === undefined) return undefined;
  const out: { low?: TS; high?: TS; value?: TS; nullFlavor?: string } = {};
  const low = parseTs(child(el, "low"), ctx);
  if (low !== undefined) out.low = low;
  const high = parseTs(child(el, "high"), ctx);
  if (high !== undefined) out.high = high;

  const rawValue = attr(el, "value");
  if (rawValue !== undefined) {
    const date = parseV3DateTime(rawValue);
    if (date !== undefined) {
      out.value = { raw: rawValue, date };
    } else {
      ctx.emit(malformedDateTime(positionOf(el)));
      out.value = { raw: rawValue };
    }
  }

  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}
