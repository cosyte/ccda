/**
 * TS — HL7 v3 Point in Time. A timestamp element carrying a `@value` in the
 * variable-precision `YYYYMMDDHHMMSS[.S][±ZZZZ]` form. The composite preserves
 * the raw string and the parsed `Date`; a value that does not match the v3 TS
 * shape is preserved as `raw` with `date` left `undefined` and a
 * `MALFORMED_DATETIME` warning emitted.
 */

import { attr, positionOf } from "../dom.js";
import { parseV3DateTime, readNullFlavor, type ParseCtx } from "./_shared.js";
import { malformedDateTime } from "../../parser/warnings.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Point in Time. `raw` is the verbatim `@value`; `date` is the
 * resolved JS `Date` (UTC when the value carried no offset), or omitted when
 * the value was malformed. `nullFlavor` is set when the element declared one.
 *
 * @example
 * ```ts
 * import type { TS } from "@cosyte/ccda";
 * const effective: TS = { raw: "20260628", date: new Date("2026-06-28T00:00:00Z") };
 * ```
 */
export interface TS {
  readonly raw?: string;
  readonly date?: Date;
  readonly nullFlavor?: string;
}

/**
 * Parse a `TS` element into a typed {@link TS}. Returns `undefined` when the
 * element is absent. Emits `MALFORMED_DATETIME` (and omits `date`) when a
 * non-empty `@value` does not parse. Never throws.
 *
 * @example
 * ```ts
 * import { parseTs } from "@cosyte/ccda";
 * const ts = parseTs(effectiveTimeEl, { emit: () => {} });
 * console.log(ts?.date?.toISOString());
 * ```
 */
export function parseTs(el: Element | undefined, ctx: ParseCtx): TS | undefined {
  if (el === undefined) return undefined;
  const out: { raw?: string; date?: Date; nullFlavor?: string } = {};
  const raw = attr(el, "value");
  if (raw !== undefined) {
    out.raw = raw;
    const date = parseV3DateTime(raw);
    if (date !== undefined) {
      out.date = date;
    } else {
      ctx.emit(malformedDateTime(positionOf(el)));
    }
  }
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}
