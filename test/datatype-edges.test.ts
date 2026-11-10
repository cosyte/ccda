/**
 * Edge paths of the datatype readers and the small grammar helpers that the broader suites do not
 * reach: an interval that declares itself null while its bounds carry values, UCUM grammar corners
 * (signed exponents, parenthesized terms, unclosed annotations), and the RxNorm product-level
 * heuristic with no display text, and the hardened XML reader's foreign-namespace sweep over more
 * than one element with no namespace. Every fixture is a synthetic fragment with no patient data.
 */

import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import type { Element } from "@xmldom/xmldom";

import {
  isValidUcumUnit,
  looksProductLevel,
  parseIvlPq,
  parseIvlTs,
  parseSecureXml,
  resolveLimits,
  V3_NS,
  WARNING_CODES,
  type CcdaWarning,
} from "../src/index.js";

function el(fragment: string): Element {
  const doc = new DOMParser().parseFromString(
    `<wrap xmlns="${V3_NS}">${fragment}</wrap>`,
    "application/xml",
  );
  const root = doc.documentElement;
  if (root === null || root.firstChild === null) throw new Error("fixture parse failed");
  return root.firstChild as Element;
}

function ctx(): { warnings: CcdaWarning[]; emit: (w: CcdaWarning) => void } {
  const warnings: CcdaWarning[] = [];
  return { warnings, emit: (w) => warnings.push(w) };
}

describe("IVL_TS that declares itself null beside asserted values", () => {
  it("keeps the raw point value but withholds its derived date", () => {
    const c = ctx();
    const ivl = parseIvlTs(el(`<effectiveTime nullFlavor="UNK" value="20240101"/>`), c);
    expect(ivl?.nullFlavor).toBe("UNK");
    expect(ivl?.value).toStrictEqual({ raw: "20240101" });
    expect(c.warnings.map((w) => w.code)).toStrictEqual([WARNING_CODES.CONTRADICTORY_NULL_FLAVOR]);
  });

  it("strips the derived date from each bound and leaves a valueless bound untouched", () => {
    const c = ctx();
    const ivl = parseIvlTs(
      el(
        `<effectiveTime nullFlavor="NI"><low value="20240101"/><high nullFlavor="UNK"/></effectiveTime>`,
      ),
      c,
    );
    expect(ivl?.nullFlavor).toBe("NI");
    // The bound's verbatim text survives; the date the parser would have derived does not.
    expect(ivl?.low).toStrictEqual({ raw: "20240101" });
    // A bound that is itself only a nullFlavor had no date to strip and comes back as parsed.
    expect(ivl?.high).toStrictEqual({ nullFlavor: "UNK" });
    expect(c.warnings.map((w) => w.code)).toStrictEqual([WARNING_CODES.CONTRADICTORY_NULL_FLAVOR]);
  });

  it("withholds the high bound's date when only the high bound carries a value", () => {
    const c = ctx();
    const ivl = parseIvlTs(
      el(`<effectiveTime nullFlavor="NI"><high value="20241231"/></effectiveTime>`),
      c,
    );
    expect(ivl?.low).toBeUndefined();
    expect(ivl?.high).toStrictEqual({ raw: "20241231" });
    expect(c.warnings.map((w) => w.code)).toStrictEqual([WARNING_CODES.CONTRADICTORY_NULL_FLAVOR]);
  });
});

describe("IVL_PQ that declares itself null beside asserted values", () => {
  it("returns a bound with no magnitude exactly as parsed", () => {
    const c = ctx();
    const ivl = parseIvlPq(
      el(
        `<value nullFlavor="OTH"><low value="5" unit="mg"/><high nullFlavor="UNK" unit="mg"/></value>`,
      ),
      c,
    );
    expect(ivl?.low?.raw).toBe("5");
    expect(ivl?.low?.value).toBeUndefined();
    expect(ivl?.high?.nullFlavor).toBe("UNK");
    expect(ivl?.high?.unit).toBe("mg");
    expect(ivl?.high?.value).toBeUndefined();
    expect(c.warnings.map((w) => w.code)).toStrictEqual([WARNING_CODES.CONTRADICTORY_NULL_FLAVOR]);
  });
});

describe("isValidUcumUnit grammar corners", () => {
  it.each(["10*-3/L", "m+2", "s-1", "(mg)", "mg/(24.h)", "(kg.m)/s", "(mg){total}"])(
    "accepts %s",
    (unit) => {
      expect(isValidUcumUnit(unit)).toBe(true);
    },
  );

  it.each([
    ["an unclosed annotation", "{cells"],
    ["an unclosed annotation after a unit", "mg{total"],
    ["an empty parenthesized term", "()"],
    ["a parenthesized term with no closing parenthesis", "(mg"],
    ["a parenthesized term closed by something else", "(mg]"],
  ])("rejects %s (%s)", (_label, unit) => {
    expect(isValidUcumUnit(unit)).toBe(false);
  });
});

describe("looksProductLevel", () => {
  it("returns false when there is no display text to inspect", () => {
    expect(looksProductLevel(undefined)).toBe(false);
  });
});

describe("parseSecureXml foreign-namespace sweep", () => {
  it("reports elements with no namespace once, however many there are", () => {
    const reported: CcdaWarning[] = [];
    const doc = parseSecureXml(
      `<ClinicalDocument xmlns="${V3_NS}"><a xmlns=""/><b xmlns=""/><c xmlns=""><d/></c></ClinicalDocument>`,
      resolveLimits(),
      () => {},
      (w) => reported.push(w),
    );
    expect(doc.documentElement?.localName).toBe("ClinicalDocument");
    expect(reported.map((w) => w.code)).toStrictEqual([WARNING_CODES.UNKNOWN_NAMESPACE_PREFIX]);
  });
});
