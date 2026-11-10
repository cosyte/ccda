import type { BuildCode, BuildQuantity } from "@cosyte/ccda";
import fc from "fast-check";
import type { Arbitrary } from "fast-check";

/**
 * The characters free text is drawn from: letters and digits, the five characters XML escapes,
 * the CDATA close `]]>`, punctuation, a tab, a line feed, and characters outside ASCII (an accented
 * letter, a CJK character, a character outside the Basic Multilingual Plane).
 *
 * @internal
 */
export const TEXT_UNITS: readonly string[] = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ..."<>&\"'",
  "]]>",
  ..."-.,;:/()[]{}#%*+=?!@^_|~`$",
  "\t",
  "\n",
  "\r",
  "\u00e9",
  "\u00df",
  "\u4e2d",
  "\u{1f9ea}",
];

/** Options for {@link text}. */
export interface TextOptions {
  /** The fewest characters. Defaults to 1. */
  readonly minLength?: number;
  /** The most characters. Defaults to 24. */
  readonly maxLength?: number;
}

/**
 * Generate free text a reader would see in a narrative or a `displayName`: letters, digits, the
 * characters XML has to escape (`<`, `>`, `&`, `"`, `'`), the CDATA close `]]>`, punctuation,
 * tabs, line breaks and characters outside ASCII. It never starts or ends with whitespace and is
 * never empty, so it reads back exactly as it was written.
 *
 * @param options - The length bounds; see {@link TextOptions}.
 * @returns An arbitrary of a string.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { text } from "@cosyte/ccda/arbitraries";
 *
 * const [label] = fc.sample(text(), 1);
 * // label is like "q<&]]>\u00e9 7"
 * ```
 */
export function text(options: TextOptions = {}): Arbitrary<string> {
  const minLength = Math.max(1, options.minLength ?? 1);
  const maxLength = Math.max(minLength, options.maxLength ?? 24);
  return fc
    .array(fc.constantFrom(...TEXT_UNITS), { minLength, maxLength })
    .map((units) => trimText(units.join("")))
    .filter((s) => s.length > 0);
}

/**
 * Remove whitespace from both ends of generated text.
 *
 * @internal
 */
export function trimText(s: string): string {
  return s.replace(/^[\t\n\r ]+|[\t\n\r ]+$/gu, "");
}

/**
 * Generate an identifier token: letters and digits, with an optional hyphen inside, such as
 * `ZQ7-41`. It looks like no real identifier: every one starts with `Z`.
 *
 * @internal
 */
export function token(maxLength = 10): Arbitrary<string> {
  return fc
    .string({ unit: fc.constantFrom(..."ABCDEFGHJKLMNPQRSTUVWXYZ0123456789-"), maxLength })
    .map((s) => `Z${s.replace(/-+$/u, "")}`);
}

/**
 * The code shapes {@link code} draws from: digits, a LOINC-style part number, and letters with
 * digits.
 *
 * @internal
 */
const CODE_SHAPES: readonly Arbitrary<string>[] = [
  fc.integer({ min: 1, max: 999_999_999 }).map(String),
  fc
    .tuple(fc.integer({ min: 1, max: 99_999 }), fc.integer({ min: 0, max: 9 }))
    .map(([n, check]) => `${n}-${check}`),
  fc
    .tuple(fc.constantFrom(..."ACDGHJKNRTZ"), fc.integer({ min: 0, max: 99_999 }))
    .map(([letter, n]) => `${letter}${n}`),
];

/** Options for {@link code}. */
export interface CodeOptions {
  /**
   * The code system OIDs to name. The default leaves the system out, so the builder fills in the
   * one its slot defaults to.
   */
  readonly codeSystems?: readonly string[];
}

/**
 * Generate a coded value for the builder: a synthetic `code` (digits, a LOINC-style part number,
 * or letters and digits), a `displayName` drawn from {@link text}, and sometimes a
 * `codeSystemName`. The codes are random, so they name no real concept.
 *
 * @param options - The code systems to name; see {@link CodeOptions}.
 * @returns An arbitrary of a `BuildCode`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { code } from "@cosyte/ccda/arbitraries";
 *
 * const [coded] = fc.sample(code(), 1);
 * // coded is like { code: "4417-2", displayName: "Zq&k" }
 * ```
 */
export function code(options: CodeOptions = {}): Arbitrary<BuildCode> {
  const systems = options.codeSystems ?? [];
  const base = fc.record(
    {
      code: fc.oneof(...CODE_SHAPES),
      displayName: text(),
      codeSystemName: fc.constantFrom("Synthetic", "Z test system"),
    },
    { requiredKeys: ["code", "displayName"] },
  );
  if (systems.length === 0) return base;
  return fc
    .tuple(base, fc.constantFrom(...systems))
    .map(([coded, codeSystem]) => ({ ...coded, codeSystem }));
}

/** Options for {@link timestamp}. */
export interface TimestampOptions {
  /** The earliest year. Defaults to 1900. */
  readonly minYear?: number;
  /** The latest year. Defaults to 2099. */
  readonly maxYear?: number;
}

/** Days in a month of a year, by the Gregorian calendar. @internal */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Pad a number to a width with leading zeros. @internal */
function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/**
 * Generate an HL7 v3 timestamp (`TS`) the parser reads as a date: `YYYY`, `YYYYMM`, `YYYYMMDD`,
 * or a time of day to the hour, minute or second, the last with an optional fraction and an
 * optional `+HHMM` or `-HHMM` offset. Every one is a real calendar date.
 *
 * @param options - The year bounds; see {@link TimestampOptions}.
 * @returns An arbitrary of a timestamp string.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { timestamp } from "@cosyte/ccda/arbitraries";
 *
 * const [ts] = fc.sample(timestamp(), 1);
 * // ts is like "20240229" or "20210704153000.25-0500"
 * ```
 */
export function timestamp(options: TimestampOptions = {}): Arbitrary<string> {
  const minYear = Math.max(1000, options.minYear ?? 1900);
  const maxYear = Math.min(9999, Math.max(minYear, options.maxYear ?? 2099));
  return fc
    .record({
      year: fc.integer({ min: minYear, max: maxYear }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 31 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
      precision: fc.integer({ min: 0, max: 5 }),
      fraction: fc.constantFrom("", ".1", ".25", ".125", ".1234"),
      offset: fc.constantFrom("", "+0000", "-0500", "+0530", "+1400", "-1200"),
    })
    .map((t) => {
      const parts = [
        pad(t.year, 4),
        pad(t.month),
        pad(Math.min(t.day, daysIn(t.year, t.month))),
        pad(t.hour),
        pad(t.minute),
        pad(t.second),
      ];
      const date = parts.slice(0, t.precision + 1).join("");
      if (t.precision < 3) return date;
      return date + (t.precision === 5 ? t.fraction : "") + t.offset;
    });
}

/**
 * UCUM units that the parser's validator accepts, case-correct: mass, volume, length,
 * concentration, pressure, rate, temperature, percent, the unity and annotated units.
 *
 * @internal
 */
export const UCUM_UNITS: readonly string[] = [
  "mg",
  "g",
  "kg",
  "mL",
  "L",
  "cm",
  "m",
  "mg/dL",
  "g/dL",
  "mmol/L",
  "10*3/uL",
  "mm[Hg]",
  "/min",
  "Cel",
  "[degF]",
  "[lb_av]",
  "[in_i]",
  "kg/m2",
  "%",
  "1",
  "h",
  "d",
  "{tablet}",
];

/** Options for {@link quantity}. */
export interface QuantityOptions {
  /** The units to draw from. Defaults to a list of valid, case-correct UCUM units. */
  readonly units?: readonly string[];
}

/**
 * Generate a quantity for the builder: a finite number (whole, decimal, negative, very small or
 * very large) and a valid, case-correct UCUM unit.
 *
 * @param options - The units to draw from; see {@link QuantityOptions}.
 * @returns An arbitrary of a `BuildQuantity`.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { quantity } from "@cosyte/ccda/arbitraries";
 *
 * const [q] = fc.sample(quantity(), 1);
 * // q is like { value: 98.6, unit: "[degF]" }
 * ```
 */
export function quantity(options: QuantityOptions = {}): Arbitrary<BuildQuantity> {
  const units = options.units ?? UCUM_UNITS;
  return fc.record({
    value: fc.oneof(
      fc.integer({ min: 0, max: 400 }),
      fc.integer({ min: 0, max: 99_999 }).map((n) => n / 100),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
    ),
    unit: fc.constantFrom(...units),
  });
}
