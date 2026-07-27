/**
 * IVL_TS, HL7 v3 Interval of Point in Time. A time range expressed via
 * `<low>` / `<high>` bounds, each a {@link TS}. The canonical use in the C-CDA
 * header is `effectiveTime` on the document and on participations (the service
 * event period, an author time, a patient's coverage window).
 */

import { attr, child, positionOf } from "../dom.js";
import { parseTs, tsWithoutDerivedValue, type TS } from "./ts.js";
import {
  contradictsAssertedValue,
  parseV3DateTime,
  readNullFlavor,
  type ParseCtx,
} from "./_shared.js";
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
 * A `@nullFlavor` on the interval beside its own `@value` or a bound that
 * carries one is a contradiction: `CONTRADICTORY_NULL_FLAVOR` is emitted once,
 * every `raw` is preserved, and the derived `date` is withheld from the point
 * value and from each bound. See {@link parsePq} for the rule and its limits.
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
  const high = parseTs(child(el, "high"), ctx);
  const rawValue = attr(el, "value");
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;

  const asserted = rawValue !== undefined || low?.raw !== undefined || high?.raw !== undefined;
  const contradicted = contradictsAssertedValue(el, "IVL_TS", nullFlavor, asserted, ctx);

  if (rawValue !== undefined) {
    if (contradicted) {
      out.value = { raw: rawValue };
    } else {
      const date = parseV3DateTime(rawValue);
      if (date !== undefined) {
        out.value = { raw: rawValue, date };
      } else {
        ctx.emit(malformedDateTime(positionOf(el)));
        out.value = { raw: rawValue };
      }
    }
  }

  const keptLow = low === undefined || !contradicted ? low : tsWithoutDerivedValue(low);
  if (keptLow !== undefined) out.low = keptLow;
  const keptHigh = high === undefined || !contradicted ? high : tsWithoutDerivedValue(high);
  if (keptHigh !== undefined) out.high = keptHigh;
  return out;
}
