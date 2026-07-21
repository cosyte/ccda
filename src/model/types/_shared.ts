/**
 * Internal helpers shared across the HL7 v3 datatype parsers (II, CD/CE, PQ,
 * IVL_PQ, TS, IVL_TS, ED, ST, BL). Centralizes the two cross-cutting concerns
 * every v3 datatype shares: the `nullFlavor` exceptional-value attribute and
 * the parse context that lets a datatype emit a Tier-2 warning.
 *
 * Not part of the public datatype surface beyond `NullFlavor` / `ParseCtx`,
 * which `src/index.ts` re-exports.
 */

import { invalidNullFlavor, type CcdaWarning } from "../../parser/warnings.js";
import { attr, positionOf } from "../dom.js";
import type { Element } from "@xmldom/xmldom";

/**
 * The HL7 v3 NullFlavor code system (`2.16.840.1.113883.5.1008`) value set
 * used in C-CDA: no-information, unknown, asked-but-unknown, not-asked,
 * temporarily-unavailable, not-applicable, other, and masked.
 *
 * @example
 * ```ts
 * import { NULL_FLAVORS } from "@cosyte/ccda";
 * console.log(NULL_FLAVORS.includes("UNK")); // true
 * ```
 */
export const NULL_FLAVORS = ["NI", "UNK", "ASKU", "NASK", "NAV", "NA", "OTH", "MSK"] as const;

/**
 * A valid HL7 v3 NullFlavor token. Datatype `nullFlavor` fields are typed as
 * `string` (a non-conforming value is preserved verbatim and flagged with
 * `INVALID_NULL_FLAVOR`); this union documents the conforming set.
 *
 * @example
 * ```ts
 * import type { NullFlavor } from "@cosyte/ccda";
 * const nf: NullFlavor = "ASKU";
 * ```
 */
export type NullFlavor = (typeof NULL_FLAVORS)[number];

const NULL_FLAVOR_SET: ReadonlySet<string> = new Set(NULL_FLAVORS);

/**
 * Return `true` when a string is a conforming {@link NullFlavor} token.
 *
 * @example
 * ```ts
 * import { isNullFlavor } from "@cosyte/ccda";
 * isNullFlavor("UNK");   // true
 * isNullFlavor("nope");  // false
 * ```
 */
export function isNullFlavor(value: string): value is NullFlavor {
  return NULL_FLAVOR_SET.has(value);
}

/**
 * Parse context threaded into every datatype parser so it can surface a Tier-2
 * warning (e.g. `INVALID_NULL_FLAVOR`, `MALFORMED_DATETIME`) in discovery
 * order. Datatypes that have nothing to warn about simply never call `emit`.
 *
 * @example
 * ```ts
 * import { type ParseCtx, parsePq } from "@cosyte/ccda";
 * const ctx: ParseCtx = { emit: (w) => console.warn(w.code) };
 * parsePq(el, ctx);
 * ```
 */
export interface ParseCtx {
  readonly emit: (warning: CcdaWarning) => void;
}

/**
 * Read an element's `nullFlavor` attribute, validating it against the v3 code
 * system. Returns the verbatim string (conforming or not) so the value is
 * never silently dropped; emits `INVALID_NULL_FLAVOR` via `ctx` when the token
 * is outside the recognized set.
 *
 * @internal
 */
export function readNullFlavor(el: Element, ctx: ParseCtx): string | undefined {
  const nf = attr(el, "nullFlavor");
  if (nf === undefined) return undefined;
  if (!isNullFlavor(nf)) ctx.emit(invalidNullFlavor(positionOf(el), nf));
  return nf;
}

/**
 * Parse an HL7 v3 boolean attribute value (`"true"` / `"false"`). Returns
 * `undefined` for any other token so callers can omit the field rather than
 * coerce a malformed value.
 *
 * @internal
 */
export function parseBooleanValue(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/**
 * Matches an HL7 v3 TS value: `YYYY[MM[DD[HH[MM[SS]]]][.fraction][±ZZZZ]]`.
 *
 * The nesting is load-bearing: a fractional-second (`.fraction`) or a timezone
 * offset (`±ZZZZ`) may appear **only once the hour is present**, mirroring the
 * canonical CDA R2 / HL7 v3 datatypes literal `YYYYMMDDHHMMSS.UUUU[±ZZzz]` (and
 * ISO 8601, from which it derives, where a decimal fraction and a zone designator
 * attach to a time component, never to a bare date). This rejects the malformed
 * "offset/fraction on a value missing its time-of-day" shapes — e.g. a
 * dropped-dash ISO date like `"2026-0721"`, which would otherwise be silently
 * misread as year `2026` carrying a `-07:21` offset — while every legitimate
 * partial-precision date (`YYYY`, `YYYYMM`, `YYYYMMDD`) still parses.
 *
 * @internal
 */
const TS_RE =
  /^(\d{4})(?:(\d{2})(?:(\d{2})(?:(\d{2})(\d{2})?(\d{2})?(?:\.(\d+))?([+-]\d{2}(?:\d{2})?)?)?)?)?$/u;

/**
 * Parse a variable-precision HL7 v3 timestamp string to a JS `Date`. Accepts
 * year through second precision plus optional fractional seconds and an
 * optional `±HHMM` (or `±HH`) timezone offset. Per the CDA R2 / HL7 v3 `TS`
 * literal `YYYYMMDDHHMMSS.UUUU[±ZZzz]`, a fraction or offset is accepted **only
 * on a value that carries the time-of-day** (at least the hour): a fraction or
 * offset hung on a bare `YYYY`/`YYYYMM`/`YYYYMMDD` value — e.g. the dropped-dash
 * `"2026-0721"` — is rejected rather than silently misread. A value with no
 * offset resolves to UTC for determinism; truncated values resolve to the first
 * instant of the stated precision (e.g. `2026` → `2026-01-01T00:00:00Z`).
 * Returns `undefined` when the value does not match the shape or is
 * calendar-invalid — never throws.
 *
 * @example
 * ```ts
 * import { parseV3DateTime } from "@cosyte/ccda";
 * parseV3DateTime("20260628")?.toISOString();        // "2026-06-28T00:00:00.000Z"
 * parseV3DateTime("20260628153045-0500")?.toISOString();
 * parseV3DateTime("not-a-date");                      // undefined
 * ```
 */
export function parseV3DateTime(value: string): Date | undefined {
  const m = TS_RE.exec(value);
  if (m === null) return undefined;

  const year = Number(m[1]);
  const month = m[2] === undefined ? 1 : Number(m[2]);
  const day = m[3] === undefined ? 1 : Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const ms = m[7] === undefined ? 0 : Math.round(Number(`0.${m[7]}`) * 1000);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return undefined;
  // Calendar-validity (catches Feb 30, day 0, etc.) before any timezone math.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return undefined;

  const offsetMinutes = parseOffset(m[8]);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, ms) - offsetMinutes * 60_000;
  return new Date(utc);
}

/** Convert an `±HHMM`/`±HH` offset token to signed minutes (0 when absent). @internal */
function parseOffset(token: string | undefined): number {
  if (token === undefined) return 0;
  const sign = token.startsWith("-") ? -1 : 1;
  const digits = token.slice(1);
  const hours = Number(digits.slice(0, 2));
  const mins = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  return sign * (hours * 60 + mins);
}
