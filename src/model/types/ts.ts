/**
 * TS, HL7 v3 Point in Time. A timestamp element carrying a `@value` in the
 * variable-precision `YYYYMMDDHHMMSS[.S][±ZZZZ]` form. The composite preserves
 * the raw string and the parsed `Date`; a value that does not match the v3 TS
 * shape is preserved as `raw` with `date` left `undefined` and a
 * `MALFORMED_DATETIME` warning emitted.
 */

import { attr, positionOf } from "../dom.js";
import {
  contradictsAssertedValue,
  parseV3DateTime,
  readNullFlavor,
  type ParseCtx,
} from "./_shared.js";
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
 * A `@nullFlavor` declared beside a populated `@value` is a contradiction:
 * `CONTRADICTORY_NULL_FLAVOR` is emitted, `raw` and `nullFlavor` are preserved
 * verbatim, and the derived `date` is withheld. That is the same treatment
 * `MALFORMED_DATETIME` already gives an unparseable value, and the same rule
 * {@link parsePq} applies to `value`: the parser declines to manufacture a
 * computable reading it has been told is not the document's value, while never
 * dropping the document's own bytes.
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
  if (raw !== undefined) out.raw = raw;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  const contradicted = contradictsAssertedValue(el, "TS", nullFlavor, raw !== undefined, ctx);
  if (raw !== undefined && !contradicted) {
    const date = parseV3DateTime(raw);
    if (date !== undefined) {
      out.date = date;
    } else {
      ctx.emit(malformedDateTime(positionOf(el)));
    }
  }
  return out;
}

/**
 * Strip the derived `date` from an already-parsed {@link TS}, keeping every
 * verbatim field. Used when the *containing* interval declares itself null.
 *
 * @internal
 */
export function tsWithoutDerivedValue(ts: TS): TS {
  if (ts.date === undefined) return ts;
  const { date: _dropped, ...rest } = ts;
  return rest;
}
