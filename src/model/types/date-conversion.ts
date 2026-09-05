/**
 * The shared `@cosyte/*` date-conversion surface, applied to the HL7 v3 `TS`:
 * {@link toObject}, {@link toISO} and {@link toDate}, the same three names, the same return
 * shapes and the same timezone rule every sibling parser exports, so moving between
 * `@cosyte/ccda` and a sibling costs nothing to relearn.
 *
 * **This surface is deliberately not `TS.date`, and the divergence is the point.**
 * {@link parseV3DateTime}, the function behind `TS.date`, zero-fills every component a
 * truncated value did not state and resolves an offset-less value **as if it were UTC**, so
 * a `TS` whose `raw` is `"20260628"` arrives carrying the instant `2026-06-28T00:00:00.000Z`
 * whatever zone the sending system wrote it in. That behaviour is unchanged here and stays
 * unchanged: it is a published field, and a consumer reading `ts.date` today reads exactly
 * what it read before.
 *
 * The three functions below refuse both inventions:
 *
 * - `toObject` reports **only** the components the value stated, so the precision survives
 *   the conversion instead of being filled in;
 * - `toISO` truncates to that same precision and appends nothing when the value carried no
 *   offset, rather than fabricating a `Z`;
 * - `toDate` returns a `Date` **only when the zone is determinate**, which means the value
 *   carried an explicit offset or the caller supplied `assumeOffsetMinutes`. On an
 *   offset-less value with neither, the honest answer is `undefined`, and that is what comes
 *   back **on a value whose `TS.date` is populated**. The old answer is still reachable, by
 *   the caller asking for it with `{ assumeOffsetMinutes: 0 }`.
 *
 * Every part is derived by re-parsing `TS.raw`, the document's own bytes. `TS.date` is never
 * read, so nothing here inherits the zero-fill or the assumed zone.
 */

import { parseV3DateTime } from "./_shared.js";
import type { TS } from "./ts.js";

/**
 * The calendar components a parsed value actually stated, and nothing else.
 *
 * A component the value did not state is **absent**: the key is not present at all, rather
 * than present holding `undefined`, so `Object.keys()` of the result is exactly the set of
 * stated components and the value's precision is recoverable from it. Nothing is zero-filled,
 * `month` is the spec-native 1 to 12 rather than the JS `Date` 0 to 11, and the names are
 * singular.
 *
 * That shape is chosen so that deleting `offsetMinutes` leaves an object
 * `Temporal.PlainDateTime.from` and luxon `DateTime.fromObject` both accept with no key rename
 * and no value adjustment. Neither library is a dependency of this package and neither is
 * imported: the compatibility is a property of the shape, stated here rather than proved by a
 * test that would need one of them installed.
 *
 * @example
 * ```ts
 * import { toObject, type DateParts } from "@cosyte/ccda";
 * const parts: DateParts | undefined = toObject({ raw: "20260628" });
 * // => { year: 2026, month: 6, day: 28 }, and no other key
 * ```
 */
export interface DateParts {
  readonly year?: number;
  readonly month?: number;
  readonly day?: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly second?: number;
  readonly millisecond?: number;
  /** Signed minutes east of UTC, present if and only if the value carried an explicit offset. */
  readonly offsetMinutes?: number;
}

/**
 * Options for {@link toDate}. `assumeOffsetMinutes` is the caller's declaration of the zone an
 * offset-less value was written in, in signed minutes east of UTC. It is the **only** way to
 * get an instant out of a value that states no offset, and an explicit `0` means "treat this
 * naive value as UTC". A value that carries its own offset ignores it.
 *
 * @example
 * ```ts
 * import { toDate, type ToDateOptions } from "@cosyte/ccda";
 * const eastern: ToDateOptions = { assumeOffsetMinutes: -300 };
 * toDate({ raw: "20260628" }, eastern); // => 2026-06-28T05:00:00.000Z
 * ```
 */
export interface ToDateOptions {
  readonly assumeOffsetMinutes?: number;
}

/**
 * The HL7 v3 `TS` literal `YYYY[MM[DD[HH[MM[SS]]]][.fraction][±ZZZZ]]`.
 *
 * A deliberate second copy of the `TS_RE` that `./_shared.ts` keeps private, so that adding
 * this surface leaves that module byte-identical to its published form. The copy cannot drift
 * into disagreeing about what a `TS` **is**, because {@link parseV3DateTime} stays the
 * accept/reject authority in {@link statedTs}: this pattern only decides which digits belong
 * to which component of a value that function already accepted.
 *
 * @internal
 */
const TS_LITERAL =
  /^(\d{4})(?:(\d{2})(?:(\d{2})(?:(\d{2})(\d{2})?(\d{2})?(?:\.(\d+))?([+-]\d{2}(?:\d{2})?)?)?)?)?$/u;

/**
 * The components a `TS` stated, read off its `raw` bytes. Distinct from {@link DateParts} in
 * two ways that matter internally: `year` is mandatory (the literal opens with one, so every
 * accepted value has it, and no downstream function needs a guard for its absence), and the
 * fractional second is kept as its **verbatim digits** rather than as a millisecond count, so
 * {@link toISO} can render exactly what the sender wrote.
 *
 * @internal
 */
interface StatedTs {
  readonly year: number;
  readonly month?: number;
  readonly day?: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly second?: number;
  /**
   * The verbatim fractional-second digits, present only when the value also stated seconds.
   * The v3 literal `YYYYMMDDHHMMSS.UUUU` puts the decimal on the **seconds** field, so a
   * fraction on a value that stops at the hour or the minute is not a fractional second and is
   * not read as one; the digits survive in `TS.raw`, which this surface never rewrites.
   */
  readonly fraction?: string;
  readonly offsetMinutes?: number;
}

/**
 * Read the stated components off a `TS`, or return `undefined` when there is nothing honest to
 * convert.
 *
 * Four ways a `TS` yields nothing, each mirroring what `parseTs` already does with it:
 * the value is absent; it carries no `@value` at all (a pure `nullFlavor` element); it carries
 * a `@nullFlavor` **beside** a populated `@value`, which is a contradiction rather than a
 * refinement and is why `parseTs` withholds `date` there; or its `@value` is not a `TS` at all.
 *
 * @internal
 */
function statedTs(value: TS | null | undefined): StatedTs | undefined {
  if (value === undefined || value === null) return undefined;

  const raw = value.raw;
  if (raw === undefined) return undefined;

  // A nullFlavor asserted beside a populated @value is CONTRADICTORY_NULL_FLAVOR: the document
  // says both "there is no value here" and "the value is this". `parseTs` withholds its derived
  // `date` on exactly these grounds, and a derived reading withheld there cannot be honest here.
  if (value.nullFlavor !== undefined) return undefined;

  const m = TS_LITERAL.exec(raw);
  if (m === null) return undefined;

  // `parseV3DateTime` stays the authority on what this package accepts as a timestamp, so this
  // surface and `TS.date` can never disagree about VALIDITY (they disagree only about zero-fill
  // and the assumed zone). It is what rejects the calendar-invalid values the shape admits,
  // month 13 and February 30 among them.
  if (parseV3DateTime(raw) === undefined) return undefined;

  const stated: {
    year: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    second?: number;
    fraction?: string;
    offsetMinutes?: number;
  } = { year: Number(m[1]) };

  if (m[2] !== undefined) stated.month = Number(m[2]);
  if (m[3] !== undefined) stated.day = Number(m[3]);
  if (m[4] !== undefined) stated.hour = Number(m[4]);
  if (m[5] !== undefined) stated.minute = Number(m[5]);
  if (m[6] !== undefined) stated.second = Number(m[6]);
  if (m[7] !== undefined && m[6] !== undefined) stated.fraction = m[7];
  if (m[8] !== undefined) stated.offsetMinutes = offsetMinutesOf(m[8]);

  return stated;
}

/**
 * Convert a `±HH` or `±HHMM` offset token to signed minutes east of UTC.
 *
 * A `-0000` token arithmetically yields negative zero, and `Object.is(-0, 0)` is `false`, so a
 * caller writing the obvious `parts.offsetMinutes === 0` check (or a test writing `toBe(0)`)
 * would be told a stated zero offset is not zero. It is normalised to positive zero here.
 * Nothing is lost: `TS.raw` still carries the token the sender wrote.
 *
 * @internal
 */
function offsetMinutesOf(token: string): number {
  const sign = token.startsWith("-") ? -1 : 1;
  const digits = token.slice(1);
  const hours = Number(digits.slice(0, 2));
  const minutes = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  const signed = sign * (hours * 60 + minutes);
  return signed === 0 ? 0 : signed;
}

/**
 * The millisecond a stated fractional second denotes: its first three digits taken
 * **verbatim** and right-padded with zeroes, so `"5"` is 500, `"0500"` is 50 and `"123456"` is
 * 123. Never computed by multiplying a parsed floating-point fraction by 1000.
 *
 * @internal
 */
function millisecondOf(fraction: string): number {
  return Number(fraction.padEnd(3, "0").slice(0, 3));
}

/** Render a number as `width` digits, zero-padded, so year 50 renders `0050`. @internal */
function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Render signed minutes as the ISO-8601 zone designator: `Z`, `+HH:MM` or `-HH:MM`. @internal */
function renderOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "Z";
  const sign = offsetMinutes < 0 ? "-" : "+";
  const total = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(total / 60), 2)}:${pad(total % 60, 2)}`;
}

/**
 * The calendar components a `TS` stated, as a frozen {@link DateParts}, with nothing filled in
 * and nothing invented.
 *
 * Returns `undefined` for an absent value, a `TS` carrying no `@value`, a `TS` whose
 * `@nullFlavor` contradicts a populated `@value`, and a `@value` this package parses as
 * malformed. Never throws, for any input.
 *
 * @example
 * ```ts
 * import { toObject } from "@cosyte/ccda";
 * toObject({ raw: "20260628" });
 * // => { year: 2026, month: 6, day: 28 }
 * toObject({ raw: "20260628153045.5-0500" });
 * // => { year: 2026, month: 6, day: 28, hour: 15, minute: 30,
 * //      second: 45, millisecond: 500, offsetMinutes: -300 }
 * ```
 */
export function toObject(value: TS | null | undefined): DateParts | undefined {
  const stated = statedTs(value);
  if (stated === undefined) return undefined;

  const parts: {
    year?: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
    offsetMinutes?: number;
  } = { year: stated.year };

  if (stated.month !== undefined) parts.month = stated.month;
  if (stated.day !== undefined) parts.day = stated.day;
  if (stated.hour !== undefined) parts.hour = stated.hour;
  if (stated.minute !== undefined) parts.minute = stated.minute;
  if (stated.second !== undefined) parts.second = stated.second;
  if (stated.fraction !== undefined) parts.millisecond = millisecondOf(stated.fraction);
  if (stated.offsetMinutes !== undefined) parts.offsetMinutes = stated.offsetMinutes;

  return Object.freeze(parts);
}

/**
 * The value rendered as ISO-8601, truncated to the precision it stated and never padded out.
 *
 * A stated offset is appended, `Z` when it is exactly zero and `+HH:MM` / `-HH:MM` otherwise.
 * When the value carried no offset **nothing** is appended: the string is deliberately
 * zone-less and no `Z` is fabricated. Because a zero offset renders `Z`, this is not a byte
 * round-trip of the wire value and is not meant to be; `serializeCcda` remains the
 * round-tripping route.
 *
 * Returns `undefined` on exactly the inputs {@link toObject} does, and never throws.
 *
 * @example
 * ```ts
 * import { toISO } from "@cosyte/ccda";
 * toISO({ raw: "202606" }); // => "2026-06"
 * toISO({ raw: "20260628" }); // => "2026-06-28", with no trailing Z
 * toISO({ raw: "20260628153045.5-0500" }); // => "2026-06-28T15:30:45.5-05:00"
 * ```
 */
export function toISO(value: TS | null | undefined): string | undefined {
  const stated = statedTs(value);
  if (stated === undefined) return undefined;

  // The literal's grammar is strictly nested, so a value's stated components are always
  // contiguous from the year down: this ladder cannot skip a gap and put a day in a month's
  // slot, because no accepted value has a gap.
  let out = pad(stated.year, 4);
  if (stated.month !== undefined) out += `-${pad(stated.month, 2)}`;
  if (stated.day !== undefined) out += `-${pad(stated.day, 2)}`;
  if (stated.hour !== undefined) out += `T${pad(stated.hour, 2)}`;
  if (stated.minute !== undefined) out += `:${pad(stated.minute, 2)}`;
  if (stated.second !== undefined) out += `:${pad(stated.second, 2)}`;
  if (stated.fraction !== undefined) out += `.${stated.fraction}`;
  if (stated.offsetMinutes !== undefined) out += renderOffset(stated.offsetMinutes);
  return out;
}

/**
 * The absolute instant the value denotes, **only when the zone is determinate**.
 *
 * - the value carries an explicit offset: the instant from **that** offset, and
 *   `options.assumeOffsetMinutes` is ignored;
 * - no offset and `assumeOffsetMinutes` supplied: that offset is applied, an explicit `0`
 *   meaning "treat this naive value as UTC";
 * - no offset and no option: `undefined`. The host timezone is never read, UTC is never
 *   assumed, and no `Date` is returned. This is where the surface parts company with
 *   `TS.date`, which resolves the same value to UTC.
 *
 * Components below the stated precision fill to their lowest legal value (month to 1, day to
 * 1, time to 0) **for instant construction only**: the value's own precision is untouched, and
 * {@link toObject} / {@link toISO} answer exactly as they did before the call. A four-digit
 * year below 100 stays that year, so `"00500101"` is year 50 and never 1950. Never throws.
 *
 * @example
 * ```ts
 * import { toDate, type TS } from "@cosyte/ccda";
 * const ts: TS = { raw: "20260628" };
 * toDate(ts); // => undefined, because the document stated no zone
 * toDate(ts, { assumeOffsetMinutes: 0 }); // => 2026-06-28T00:00:00.000Z
 * toDate(ts, { assumeOffsetMinutes: -300 }); // => 2026-06-28T05:00:00.000Z
 * ```
 */
export function toDate(value: TS | null | undefined, options?: ToDateOptions): Date | undefined {
  const stated = statedTs(value);
  if (stated === undefined) return undefined;

  const offsetMinutes = stated.offsetMinutes ?? options?.assumeOffsetMinutes;
  if (offsetMinutes === undefined) return undefined;

  // Built from the epoch with the UTC setters rather than `Date.UTC` or `new Date(y, m, d)`,
  // both of which remap a year in 0 to 99 into the 1900s. The only zone input is the offset
  // resolved above; nothing here can read the host's.
  const wall = new Date(0);
  wall.setUTCFullYear(stated.year, (stated.month ?? 1) - 1, stated.day ?? 1);
  wall.setUTCHours(
    stated.hour ?? 0,
    stated.minute ?? 0,
    stated.second ?? 0,
    stated.fraction === undefined ? 0 : millisecondOf(stated.fraction),
  );
  return new Date(wall.getTime() - offsetMinutes * 60_000);
}
