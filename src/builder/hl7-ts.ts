/**
 * Shared HL7 v3 **TS** (Point in Time) format guard for the C-CDA builder.
 *
 * Every caller-supplied date string the builder emits into an `@value`, `low`,
 * or `high` routes through {@link assertHl7Ts} first. The guard is the single
 * gate that keeps a malformed date — dashes (`"2026-07-21"`), a month name
 * (`"July 2026"`), an out-of-range or calendar-invalid component (`"20260230"`)
 * — from ever reaching the serialized document as a schema-invalid, potentially
 * clinically-misread timestamp. On a bad input it **throws** (build-time, fail
 * loud); it never coerces, guesses, or emits a partial date.
 *
 * @module
 */

import { parseV3DateTime } from "../model/types/_shared.js";

/**
 * Assert that `value` is a well-formed HL7 v3 TS string and return it unchanged.
 *
 * Acceptance is delegated to the parser's {@link parseV3DateTime} — the single
 * source of truth for the v3 TS grammar in this library — so the builder emits
 * **exactly** the set of timestamps the parser reads back cleanly. Any date the
 * builder accepts here round-trips through {@link parseCcda} without a
 * `MALFORMED_DATETIME` warning; any date it would reject is refused at build
 * time rather than serialized.
 *
 * Valid forms are variable-precision `YYYY[MM[DD[HH[MM[SS]]]]]` with an optional
 * `.fraction` and an optional `±ZZZZ` (or `±ZZ`) timezone offset. Legitimate
 * **partial precision** — a bare `YYYY`, `YYYYMM`, or `YYYYMMDD` — is valid and
 * preserved, not an error. Calendar-invalid dates (month `13`, `20260230`,
 * hour `24`) are rejected.
 *
 * @param value - the caller's date string, bound for a TS `@value`/`low`/`high`.
 * @param field - the emission site (e.g. `"problem.onset"`), quoted in the error.
 * @returns `value`, once validated.
 * @throws {TypeError} when `value` is not a well-formed HL7 v3 TS.
 * @example
 * ```ts
 * assertHl7Ts("20260721", "problem.onset"); // "20260721"
 * assertHl7Ts("2026-07-21", "problem.onset"); // throws TypeError (dashes)
 * ```
 * @internal
 */
export function assertHl7Ts(value: string, field: string): string {
  if (parseV3DateTime(value) === undefined) {
    throw new TypeError(
      `buildCcda: \`${field}\` = ${JSON.stringify(value)} is not a valid HL7 v3 ` +
        "timestamp (TS). Expected variable-precision " +
        "`YYYY[MM[DD[HHMMSS[.S][±ZZZZ]]]]` " +
        '(e.g. "2026", "202607", "20260721", "20260721153045-0500") — no dashes, ' +
        "spaces, or month names, and no calendar-invalid component. The builder never " +
        "emits or coerces an invalid date.",
    );
  }
  return value;
}
