import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOMParser } from "@xmldom/xmldom";
import type { Element } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import {
  parseIvlTs,
  parseTs,
  parseV3DateTime,
  toDate,
  toISO,
  toObject,
  type CcdaWarning,
  type DateParts,
  type ToDateOptions,
  type TS,
} from "../src/index.js";

/**
 * The shared `@cosyte/*` conversion surface, exercised against the case table every sibling
 * parser carries at this same path. Rows R1 to R11 are the table; a row this standard cannot
 * express is skipped with a written reason naming the property that makes it inexpressible,
 * never silently omitted.
 *
 * ONE ROW IS SKIPPED HERE, R10, and its reason is the HL7 v3 `TS` literal's mandatory leading
 * four-digit year. Every other row is live.
 *
 * The sharpest thing this file pins is a DIVERGENCE, not an agreement: `TS.date` resolves an
 * offset-less value to UTC and zero-fills a truncated one, and `toDate` refuses to do either.
 * So there are values where `ts.date` is a populated `Date` and `toDate(ts)` is `undefined`,
 * and that is asserted on the same object rather than described. Neither side is being
 * "fixed" into the other.
 */

const NS = "urn:hl7-org:v3";

/** Parse a standalone HL7 v3 element fragment, the way `test/datatypes.test.ts` does. */
function el(fragment: string): Element {
  const xml = `<wrap xmlns="${NS}">${fragment}</wrap>`;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (root === null || root.firstChild === null) throw new Error("fixture parse failed");
  return root.firstChild as Element;
}

/** A warning-collecting parse context. */
function ctx(): { warnings: CcdaWarning[]; emit: (w: CcdaWarning) => void } {
  const warnings: CcdaWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

/** The `TS` a real `<effectiveTime value="...">` parses to, `date` field and all. */
function parsed(raw: string): TS {
  const ts = parseTs(el(`<effectiveTime value="${raw}"/>`), ctx());
  if (ts === undefined) throw new Error("fixture parse failed");
  return ts;
}

/** The instant a wire ISO string denotes, written out so no assertion depends on the host zone. */
function instant(iso: string): Date {
  return new Date(iso);
}

const MODULE_SOURCE = join(
  import.meta.dirname,
  "..",
  "src",
  "model",
  "types",
  "date-conversion.ts",
);

describe("the package root exports the three shared names", () => {
  it("resolves toObject, toISO and toDate under exactly those names", () => {
    expect(typeof toObject).toBe("function");
    expect(typeof toISO).toBe("function");
    expect(typeof toDate).toBe("function");
  });

  it("gives toDate an optional second argument carrying assumeOffsetMinutes and no other key", () => {
    const options: ToDateOptions = { assumeOffsetMinutes: -300 };
    expect(Object.keys(options)).toStrictEqual(["assumeOffsetMinutes"]);
    // The options type admits that one key and nothing else.
    // @ts-expect-error `timeZone` is not part of the shared options shape.
    const rejected: ToDateOptions = { assumeOffsetMinutes: 0, timeZone: "America/New_York" };
    expect(rejected.assumeOffsetMinutes).toBe(0);
    // Called with no options at all, and with an empty options object.
    expect(toDate({ raw: "20260628" })).toBeUndefined();
    expect(toDate({ raw: "20260628" }, {})).toBeUndefined();
  });

  it("accepts a TS a real parse produced, and the bounds of a parsed IVL_TS", () => {
    const c = ctx();
    const period = parseIvlTs(
      el(`<effectiveTime><low value="20260101"/><high value="20261231"/></effectiveTime>`),
      c,
    );
    expect(toISO(period?.low)).toBe("2026-01-01");
    expect(toISO(period?.high)).toBe("2026-12-31");
    expect(toObject(period?.low)).toStrictEqual({ year: 2026, month: 1, day: 1 });
    expect(c.warnings).toStrictEqual([]);
  });
});

describe("shared case table", () => {
  it("R1 year-precision value: toObject has exactly {year}, toISO is the 4-digit year", () => {
    const ts = parsed("2026");
    expect(Object.keys(toObject(ts) ?? {})).toStrictEqual(["year"]);
    expect(toObject(ts)).toStrictEqual({ year: 2026 });
    expect(toISO(ts)).toBe("2026");
  });

  it("R2 day-precision, no offset: {year,month,day}, no trailing Z, and no instant", () => {
    const ts = parsed("20260628");
    expect(Object.keys(toObject(ts) ?? {})).toStrictEqual(["year", "month", "day"]);
    expect(toObject(ts)).toStrictEqual({ year: 2026, month: 6, day: 28 });
    expect(toISO(ts)).toBe("2026-06-28");
    expect(toISO(ts)?.endsWith("Z")).toBe(false);
    expect(toDate(ts)).toBeUndefined();
  });

  it("R3 R2 with assumeOffsetMinutes 0: the UTC midnight instant", () => {
    const result = toDate(parsed("20260628"), { assumeOffsetMinutes: 0 });
    expect(result).toStrictEqual(instant("2026-06-28T00:00:00.000Z"));
    expect(result?.getTime()).toBe(Date.parse("2026-06-28T00:00:00.000Z"));
  });

  it("R4 R2 with assumeOffsetMinutes -300: 05:00Z that day", () => {
    const result = toDate(parsed("20260628"), { assumeOffsetMinutes: -300 });
    expect(result).toStrictEqual(instant("2026-06-28T05:00:00.000Z"));
  });

  it("R5 second precision with an explicit non-zero offset: signed, rendered, and it wins", () => {
    const ts = parsed("20260628153045-0500");
    expect(toObject(ts)).toStrictEqual({
      year: 2026,
      month: 6,
      day: 28,
      hour: 15,
      minute: 30,
      second: 45,
      offsetMinutes: -300,
    });
    expect(toISO(ts)).toBe("2026-06-28T15:30:45-05:00");
    expect(toDate(ts)).toStrictEqual(instant("2026-06-28T20:30:45.000Z"));
    // The value's own offset beats anything the caller assumes.
    expect(toDate(ts, { assumeOffsetMinutes: 600 })).toStrictEqual(
      instant("2026-06-28T20:30:45.000Z"),
    );
    expect(toDate(ts, { assumeOffsetMinutes: 0 })).toStrictEqual(
      instant("2026-06-28T20:30:45.000Z"),
    );
  });

  it("R6 explicit ZERO offset: offsetMinutes is present as 0 and toISO ends Z", () => {
    for (const raw of ["20260628153045+0000", "20260628153045-0000"]) {
      const parts = toObject(parsed(raw));
      expect(parts?.offsetMinutes).toBeDefined();
      // `Object.is`, not `toBe` alone: a "-0000" token arithmetically yields -0, and
      // `Object.is(-0, 0)` is false, so this is the assertion that can actually fail.
      expect(Object.is(parts?.offsetMinutes, 0), `${raw} did not normalise to +0`).toBe(true);
      expect(toISO(parsed(raw))).toBe("2026-06-28T15:30:45Z");
      expect(toDate(parsed(raw))).toStrictEqual(instant("2026-06-28T15:30:45.000Z"));
    }
  });

  it("R7 stated fractional seconds: the verbatim first-three-digit rule, rendered verbatim", () => {
    expect(toObject(parsed("20260628153045.5-0500"))?.millisecond).toBe(500);
    expect(toISO(parsed("20260628153045.5-0500"))).toBe("2026-06-28T15:30:45.5-05:00");

    expect(toObject(parsed("20260628153045.0500-0500"))?.millisecond).toBe(50);
    expect(toISO(parsed("20260628153045.0500-0500"))).toBe("2026-06-28T15:30:45.0500-05:00");

    expect(toObject(parsed("20260628153045.123456"))?.millisecond).toBe(123);
    expect(toISO(parsed("20260628153045.123456"))).toBe("2026-06-28T15:30:45.123456");

    expect(toObject(parsed("20260628153045.123"))?.millisecond).toBe(123);
  });

  it("R8 a value the repo parsed as invalid: all three undefined, nothing throws", () => {
    // Every shape `parseV3DateTime` rejects: not a digit run at all, a dashed ISO date, a
    // calendar-invalid day, a month out of range, and the dropped-dash value the shape rule
    // exists to catch.
    for (const raw of ["not-a-date", "2026-06-28", "20260230", "20261301", "2026-0721", ""]) {
      const ts = parsed(raw);
      expect(parseV3DateTime(raw), `${raw} was expected to be rejected`).toBeUndefined();
      expect(() => toObject(ts)).not.toThrow();
      expect(toObject(ts), raw).toBeUndefined();
      expect(toISO(ts), raw).toBeUndefined();
      expect(toDate(ts), raw).toBeUndefined();
      expect(toDate(ts, { assumeOffsetMinutes: 0 }), raw).toBeUndefined();
    }
  });

  it("R9 undefined passed as the value: all three undefined, nothing throws", () => {
    for (const value of [undefined, null]) {
      expect(() => toObject(value)).not.toThrow();
      expect(() => toISO(value)).not.toThrow();
      expect(() => toDate(value, { assumeOffsetMinutes: 0 })).not.toThrow();
      expect(toObject(value)).toBeUndefined();
      expect(toISO(value)).toBeUndefined();
      expect(toDate(value)).toBeUndefined();
      expect(toDate(value, { assumeOffsetMinutes: 0 })).toBeUndefined();
    }
  });

  /*
   * REASON THIS ROW IS SKIPPED, not omitted:
   *
   * R10 wants a TIME-ONLY value, one stating an hour with no calendar date. The HL7 v3 `TS`
   * literal this package reads is `YYYY[MM[DD[HH[MM[SS]]]][.fraction][±ZZZZ]]`, whose LEADING
   * FOUR-DIGIT YEAR IS MANDATORY: every accepted value opens with one, and the hour is only
   * reachable through a year, a month and a day. There is no C-CDA wire syntax for a bare time
   * in a `TS`, so no `TS` this parser can produce omits `year`, and the row is inexpressible
   * rather than unimplemented. The property is measured live in "the v3 TS literal mandates a
   * leading four-digit year" below, so this skip rests on a test rather than on this comment.
   */
  it.skip("R10 a time-only value: the v3 TS literal mandates a leading four-digit year", () => {
    expect.unreachable("inexpressible in HL7 v3 TS: see the reason above");
  });

  it("R11 year 0050 at day precision with a determinate zone: the Date reports year 50", () => {
    const result = toDate(parsed("00500101"), { assumeOffsetMinutes: 0 });
    expect(result?.getUTCFullYear()).toBe(50);
    expect(result?.getUTCMonth()).toBe(0);
    expect(result?.getUTCDate()).toBe(1);
    // The legacy remapping this guards against, measured rather than described.
    expect(new Date(Date.UTC(50, 0, 1)).getUTCFullYear()).toBe(1950);
    expect(result?.getTime()).not.toBe(Date.UTC(50, 0, 1));
    // The rendering keeps the four digits too.
    expect(toISO(parsed("00500101"))).toBe("0050-01-01");
    expect(toObject(parsed("00500101"))).toStrictEqual({ year: 50, month: 1, day: 1 });
  });
});

describe("the property behind the skipped row", () => {
  it("the v3 TS literal mandates a leading four-digit year, so no value is time-only", () => {
    // Every shape a caller might hope reaches a bare time is refused outright, so `toObject`
    // can never return a value without `year` and `toISO` can never render a bare time.
    // "1530" is deliberately absent: a bare four-digit run is not a time here, it is the YEAR
    // 1530, which is the whole reason a time-only value has nowhere to live in this literal.
    for (const raw of ["153045", "15:30:45", "T153045", "153045-0500", "15:30"]) {
      expect(parseV3DateTime(raw), `${raw} was expected to be rejected`).toBeUndefined();
      expect(toObject({ raw })).toBeUndefined();
      expect(toISO({ raw })).toBeUndefined();
      expect(toDate({ raw }, { assumeOffsetMinutes: 0 })).toBeUndefined();
    }
    // And every value that IS accepted carries a year.
    for (const raw of ["2026", "202606", "20260628", "2026062815", "20260628153045-0500"]) {
      expect(toObject({ raw })?.year).toBe(2026);
    }
  });
});

describe("toObject", () => {
  it("returns a frozen plain object", () => {
    const parts = toObject(parsed("20260628"));
    expect(Object.isFrozen(parts)).toBe(true);
    expect(Object.getPrototypeOf(parts)).toBe(Object.prototype);
  });

  it("reports exactly the stated components at every precision, and nothing below them", () => {
    const ladder: readonly (readonly [string, readonly string[]])[] = [
      ["2026", ["year"]],
      ["202606", ["year", "month"]],
      ["20260628", ["year", "month", "day"]],
      ["2026062815", ["year", "month", "day", "hour"]],
      ["202606281530", ["year", "month", "day", "hour", "minute"]],
      ["20260628153045", ["year", "month", "day", "hour", "minute", "second"]],
      ["20260628153045.5", ["year", "month", "day", "hour", "minute", "second", "millisecond"]],
      [
        "20260628153045.5-0500",
        ["year", "month", "day", "hour", "minute", "second", "millisecond", "offsetMinutes"],
      ],
    ];
    for (const [raw, keys] of ladder) {
      expect(Object.keys(toObject(parsed(raw)) ?? {}), raw).toStrictEqual([...keys]);
    }
  });

  it("states the month 1 to 12, never the JS Date 0 to 11", () => {
    expect(toObject(parsed("20260101"))?.month).toBe(1);
    expect(toObject(parsed("20261231"))?.month).toBe(12);
    // The JS `Date` reading of the same value would be one lower.
    expect(parseV3DateTime("20260101")?.getUTCMonth()).toBe(0);
  });

  it("uses SINGULAR component names and carries no parse bookkeeping", () => {
    const parts = toObject(parsed("20260628153045.5-0500"));
    expect(parts).toBeDefined();
    for (const key of [
      "hours",
      "minutes",
      "seconds",
      "raw",
      "date",
      "valid",
      "precision",
      "nullFlavor",
    ]) {
      expect(Object.hasOwn(parts ?? {}, key), `unexpected key ${key}`).toBe(false);
    }
    for (const key of ["hour", "minute", "second", "millisecond"]) {
      expect(Object.hasOwn(parts ?? {}, key), `missing key ${key}`).toBe(true);
    }
  });

  it("omits a component rather than carrying it as undefined", () => {
    const parts = toObject(parsed("2026"));
    expect("month" in (parts ?? {})).toBe(false);
    expect(JSON.stringify(parts)).toBe('{"year":2026}');
  });

  it("returns undefined for a TS with no stated components at all", () => {
    expect(toObject({})).toBeUndefined();
    expect(toObject({ nullFlavor: "UNK" })).toBeUndefined();
    expect(toISO({})).toBeUndefined();
    expect(toDate({}, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("decodes the two-digit offset form as whole hours east of UTC", () => {
    expect(toObject(parsed("2026062815+05"))?.offsetMinutes).toBe(300);
    expect(toObject(parsed("2026062815-05"))?.offsetMinutes).toBe(-300);
    expect(toObject(parsed("2026062815+0530"))?.offsetMinutes).toBe(330);
    expect(toObject(parsed("2026062815-0930"))?.offsetMinutes).toBe(-570);
  });

  it("reads the millisecond from the digits, never from a floating-point fraction", () => {
    const cases: readonly (readonly [string, number])[] = [
      [".5", 500],
      [".05", 50],
      [".0500", 50],
      [".123", 123],
      [".123456", 123],
      [".999999", 999],
      [".9999", 999],
      [".000", 0],
    ];
    for (const [fraction, ms] of cases) {
      expect(toObject(parsed(`20260628153045${fraction}`))?.millisecond, fraction).toBe(ms);
    }
    // The rounding route this rule refuses can leave the millisecond range entirely.
    expect(Math.round(Number("0.9999") * 1000)).toBe(1000);
  });

  it("treats a fraction as a fraction of a SECOND, so a value stating none carries none", () => {
    // The v3 literal `YYYYMMDDHHMMSS.UUUU` puts the decimal on the seconds field. This parser
    // tolerates the out-of-literal shape where a fraction hangs off the hour or the minute; the
    // digits there are not a fractional second, so no `millisecond` is manufactured from them
    // and the rendering stops at the stated precision. `TS.raw` still carries them verbatim.
    expect(parseV3DateTime("2026062815.5")).toBeDefined();
    expect(toObject(parsed("2026062815.5"))).toStrictEqual({
      year: 2026,
      month: 6,
      day: 28,
      hour: 15,
    });
    expect(toISO(parsed("2026062815.5"))).toBe("2026-06-28T15");
    expect(toObject(parsed("202606281530.5"))?.millisecond).toBeUndefined();
    expect(parsed("2026062815.5").raw).toBe("2026062815.5");
  });
});

describe("toISO", () => {
  it("truncates to the stated precision and pads nothing out", () => {
    const ladder: readonly (readonly [string, string])[] = [
      ["1870", "1870"],
      ["187007", "1870-07"],
      ["18700705", "1870-07-05"],
      ["1870070509", "1870-07-05T09"],
      ["187007050930", "1870-07-05T09:30"],
      ["18700705093045", "1870-07-05T09:30:45"],
      ["18700705093045.5", "1870-07-05T09:30:45.5"],
    ];
    for (const [raw, iso] of ladder) {
      expect(toISO(parsed(raw)), raw).toBe(iso);
    }
  });

  it("fabricates no Z when the value stated no offset, at any precision", () => {
    for (const raw of ["2026", "202606", "20260628", "2026062815", "20260628153045.5"]) {
      expect(toISO(parsed(raw))?.endsWith("Z"), raw).toBe(false);
      expect(toISO(parsed(raw)), raw).not.toMatch(/[+-]\d{2}:\d{2}$/);
    }
  });

  it("renders a stated offset, including one with a non-zero minute part", () => {
    expect(toISO(parsed("2026062815+0530"))).toBe("2026-06-28T15+05:30");
    expect(toISO(parsed("2026062815-0930"))).toBe("2026-06-28T15-09:30");
    expect(toISO(parsed("2026062815+05"))).toBe("2026-06-28T15+05:00");
    expect(toISO(parsed("20260628153045+1400"))).toBe("2026-06-28T15:30:45+14:00");
  });

  it("reports exactly the components toObject reports, at every precision", () => {
    // The two functions read one parse of `raw`, so a rendering can never carry a component
    // the parts omit, or omit one the parts carry.
    const stated = (iso: string): number =>
      [/^\d{4}/, /^\d{4}-\d{2}/, /-\d{2}T/, /T\d{2}/, /:\d{2}/, /:\d{2}:\d{2}/].filter((re) =>
        re.test(iso),
      ).length;
    for (const raw of ["2026", "202606", "20260628", "2026062815", "202606281530"]) {
      const iso = toISO(parsed(raw));
      const parts = toObject(parsed(raw));
      expect(iso, raw).toBeDefined();
      expect(parts, raw).toBeDefined();
      expect(stated(iso ?? "") > 0, raw).toBe(true);
      // A rendered fraction appears if and only if `millisecond` is reported.
      expect(/\.\d/.test(iso ?? ""), raw).toBe(parts?.millisecond !== undefined);
    }
    expect(/\.\d/.test(toISO(parsed("20260628153045.5")) ?? "")).toBe(true);
    expect(toObject(parsed("20260628153045.5"))?.millisecond).toBe(500);
  });
});

describe("toDate is honest about the timezone", () => {
  it("returns undefined at every precision when no zone is determinate", () => {
    for (const raw of [
      "2026",
      "202606",
      "20260628",
      "2026062815",
      "202606281530",
      "20260628153045",
      "20260628153045.5",
    ]) {
      expect(toDate(parsed(raw)), raw).toBeUndefined();
      expect(toDate(parsed(raw), {}), raw).toBeUndefined();
    }
  });

  it("fills components below the stated precision to their lowest legal value", () => {
    expect(toDate(parsed("2026"), { assumeOffsetMinutes: 0 })).toStrictEqual(
      instant("2026-01-01T00:00:00.000Z"),
    );
    expect(toDate(parsed("202606"), { assumeOffsetMinutes: 0 })).toStrictEqual(
      instant("2026-06-01T00:00:00.000Z"),
    );
    expect(toDate(parsed("2026062815"), { assumeOffsetMinutes: 0 })).toStrictEqual(
      instant("2026-06-28T15:00:00.000Z"),
    );
  });

  it("leaves the value's own precision untouched: the fill is for the instant only", () => {
    const ts = parsed("2026");
    const before = toObject(ts);
    const beforeIso = toISO(ts);
    toDate(ts, { assumeOffsetMinutes: -300 });
    expect(toObject(ts)).toStrictEqual(before);
    expect(toISO(ts)).toBe(beforeIso);
    expect(toObject(ts)).toStrictEqual({ year: 2026 });
  });

  it("carries the millisecond into the instant", () => {
    expect(toDate(parsed("20260628153045.5"), { assumeOffsetMinutes: 0 })).toStrictEqual(
      instant("2026-06-28T15:30:45.500Z"),
    );
    expect(toDate(parsed("20260628153045.0500"), { assumeOffsetMinutes: 0 })).toStrictEqual(
      instant("2026-06-28T15:30:45.050Z"),
    );
  });

  it("reads no zone from the host, by construction", () => {
    const source = readFileSync(MODULE_SOURCE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "");
    for (const forbidden of [
      "getTimezoneOffset",
      "Intl",
      "Date.parse",
      "toLocale",
      "setFullYear",
      "setHours",
      "Date.UTC",
      "process.env",
      "toISOString",
    ]) {
      expect(source.includes(forbidden), `${forbidden} reached the conversion module`).toBe(false);
    }
    for (const required of ["setUTCFullYear", "setUTCHours"]) {
      expect(source.includes(required), `${required} is missing`).toBe(true);
    }
  });

  it("imports nothing beyond this package's own datatype modules", () => {
    // Comment-stripped, so the `@cosyte/ccda` specifiers inside the `@example` blocks (which a
    // reader copies, and which no bundler ever resolves from here) are not counted as imports.
    const source = readFileSync(MODULE_SOURCE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "");
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/gu)].map((hit) => hit[1]);
    expect(specifiers).toStrictEqual(["./_shared.js", "./ts.js"]);
  });
});

describe("the deliberate TS.date divergence", () => {
  it("answers undefined where TS.date is a populated instant", () => {
    const ts = parsed("20260628");
    // The old field: eager, zero-filled, resolved as if the value had said UTC.
    expect(ts.date).toStrictEqual(instant("2026-06-28T00:00:00.000Z"));
    // The new one: the document stated no zone, so there is no instant to report.
    expect(toDate(ts)).toBeUndefined();
    // And the parts report the day the document stated, not a fabricated midnight.
    expect(toObject(ts)).toStrictEqual({ year: 2026, month: 6, day: 28 });
    expect(toObject(ts)?.hour).toBeUndefined();
    expect(toObject(ts)?.offsetMinutes).toBeUndefined();
  });

  it("reaches the old answer only when the caller asks for it", () => {
    const ts = parsed("20260628");
    expect(toDate(ts, { assumeOffsetMinutes: 0 })).toStrictEqual(ts.date);
    // A caller who knows the document was written in New York gets a different, later instant.
    expect(toDate(ts, { assumeOffsetMinutes: -300 })).not.toStrictEqual(ts.date);
    expect(toDate(ts, { assumeOffsetMinutes: -300 })).toStrictEqual(
      instant("2026-06-28T05:00:00.000Z"),
    );
  });

  it("agrees with TS.date on every value that states its own offset", () => {
    for (const raw of [
      "20260628153045-0500",
      "20260628153045+0000",
      "20260628153045.5+0530",
      "2026062815+05",
    ]) {
      const ts = parsed(raw);
      expect(toDate(ts), raw).toStrictEqual(ts.date);
    }
  });

  it("never reads ts.date: a hand-built TS whose date contradicts its raw follows the raw", () => {
    const ts: TS = { raw: "20260628", date: instant("1999-12-31T00:00:00.000Z") };
    expect(toObject(ts)).toStrictEqual({ year: 2026, month: 6, day: 28 });
    expect(toISO(ts)).toBe("2026-06-28");
    expect(toDate(ts, { assumeOffsetMinutes: 0 })).toStrictEqual(
      instant("2026-06-28T00:00:00.000Z"),
    );
  });
});

describe("withholding follows parseTs", () => {
  it("returns undefined for a TS whose nullFlavor contradicts a populated value", () => {
    const c = ctx();
    const ts = parseTs(el(`<effectiveTime nullFlavor="UNK" value="20260628"/>`), c);
    expect(c.warnings.map((w) => w.code)).toStrictEqual(["CONTRADICTORY_NULL_FLAVOR"]);
    // `parseTs` already withholds its derived reading here.
    expect(ts?.date).toBeUndefined();
    expect(ts?.raw).toBe("20260628");
    // So does this surface, on the same grounds.
    expect(toObject(ts)).toBeUndefined();
    expect(toISO(ts)).toBeUndefined();
    expect(toDate(ts, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("returns undefined for a pure nullFlavor element, which states no value at all", () => {
    const c = ctx();
    const ts = parseTs(el(`<effectiveTime nullFlavor="UNK"/>`), c);
    expect(c.warnings).toStrictEqual([]);
    expect(ts).toStrictEqual({ nullFlavor: "UNK" });
    expect(toObject(ts)).toBeUndefined();
    expect(toISO(ts)).toBeUndefined();
    expect(toDate(ts, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("returns undefined for a value parseTs flagged MALFORMED_DATETIME", () => {
    const c = ctx();
    const ts = parseTs(el(`<effectiveTime value="July 2026"/>`), c);
    expect(c.warnings.map((w) => w.code)).toStrictEqual(["MALFORMED_DATETIME"]);
    expect(ts?.date).toBeUndefined();
    expect(toObject(ts)).toBeUndefined();
    expect(toISO(ts)).toBeUndefined();
    expect(toDate(ts, { assumeOffsetMinutes: 0 })).toBeUndefined();
  });

  it("accepts exactly what parseV3DateTime accepts, and rejects exactly what it rejects", () => {
    const corpus = [
      "2026",
      "202606",
      "20260628",
      "2026062815",
      "202606281530",
      "20260628153045",
      "20260628153045.5",
      "20260628153045.123456",
      "20260628153045-0500",
      "20260628153045+0000",
      "2026062815+05",
      "00500101",
      "20240229",
      "",
      " 20260628",
      "20260628 ",
      "202606281",
      "2026062",
      "20260230",
      "20230229",
      "20261301",
      "20260600",
      "20260628253045",
      "20260628156045",
      "20260628153060",
      "2026-06-28",
      "2026-0721",
      "20260628+0500",
      "202606.5",
      "July 2026",
      "not-a-date",
    ];
    for (const raw of corpus) {
      const accepted = parseV3DateTime(raw) !== undefined;
      expect(toObject({ raw }) !== undefined, `${raw} disagreed on validity`).toBe(accepted);
      expect(toISO({ raw }) !== undefined, `${raw} disagreed on validity`).toBe(accepted);
      expect(
        toDate({ raw }, { assumeOffsetMinutes: 0 }) !== undefined,
        `${raw} disagreed on validity`,
      ).toBe(accepted);
    }
  });
});

describe("the pre-existing TS surface is untouched", () => {
  it("still exports parseTs, parseIvlTs and parseV3DateTime, behaving as at the pin", () => {
    expect(typeof parseTs).toBe("function");
    expect(typeof parseIvlTs).toBe("function");
    expect(typeof parseV3DateTime).toBe("function");
    // The eager, zero-filling, assume-UTC behaviour this spec deliberately does not fix.
    expect(parseV3DateTime("20260628")).toStrictEqual(instant("2026-06-28T00:00:00.000Z"));
    expect(parseV3DateTime("2026")).toStrictEqual(instant("2026-01-01T00:00:00.000Z"));
    expect(parseV3DateTime("20260628153045-0500")).toStrictEqual(
      instant("2026-06-28T20:30:45.000Z"),
    );
    expect(parseV3DateTime("2026-0721")).toBeUndefined();
  });

  it("emits the same warnings in the same cases", () => {
    const malformed = ctx();
    parseTs(el(`<effectiveTime value="2026-0721"/>`), malformed);
    expect(malformed.warnings.map((w) => w.code)).toStrictEqual(["MALFORMED_DATETIME"]);

    const contradicted = ctx();
    parseTs(el(`<effectiveTime nullFlavor="NAV" value="20260628"/>`), contradicted);
    expect(contradicted.warnings.map((w) => w.code)).toStrictEqual(["CONTRADICTORY_NULL_FLAVOR"]);

    const clean = ctx();
    const ts = parseTs(el(`<effectiveTime value="20260628"/>`), clean);
    expect(clean.warnings).toStrictEqual([]);
    expect(ts).toStrictEqual({ raw: "20260628", date: instant("2026-06-28T00:00:00.000Z") });
  });

  it("keeps DateParts assignable from the shape Temporal and luxon accept", () => {
    // Not proved against either library, which would need a dependency this work forbids: the
    // assertion is that the key set and the 1-to-12 month are what those constructors read.
    const parts: DateParts | undefined = toObject(parsed("20260628153045.5-0500"));
    const { offsetMinutes: _zone, ...plain } = parts ?? {};
    expect(plain).toStrictEqual({
      year: 2026,
      month: 6,
      day: 28,
      hour: 15,
      minute: 30,
      second: 45,
      millisecond: 500,
    });
  });
});
