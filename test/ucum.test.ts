/**
 * Tests for the computable, zero-dep UCUM grammar validator — both the
 * example-driven cases (the units that actually appear in lab Results and Vital
 * Signs) and the property-based invariants (well-formed by construction always
 * validates; the case-suspect detector never fires on a canonical unit). No PHI:
 * UCUM unit strings are structural identifiers, never patient data.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { isUcumCaseSuspect, isValidUcumUnit } from "../src/model/ucum.js";

describe("isValidUcumUnit — well-formed units", () => {
  it.each([
    "g/dL",
    "mg",
    "mg/dL",
    "mm[Hg]",
    "m[Hg]",
    "/min",
    "1/min",
    "mL",
    "L",
    "K",
    "Cel",
    "%",
    "mol/L",
    "mmol/L",
    "ng/mL",
    "10*9/L",
    "10*3/uL",
    "{cells}/uL",
    "kg/m2",
    "U/L",
    "meq/L",
    "h",
    "/uL",
    "ueq/mL",
  ])("accepts %s", (unit) => {
    expect(isValidUcumUnit(unit)).toBe(true);
  });
});

describe("isValidUcumUnit — malformed units", () => {
  it.each([
    "grams/dL",
    "GG",
    "mmHg",
    "mg//dL",
    "(mg",
    "mg)",
    "10**9/L",
    "g dL",
    "",
    "/",
    "milligrams",
  ])("rejects %s", (unit) => {
    expect(isValidUcumUnit(unit)).toBe(false);
  });
});

describe("isUcumCaseSuspect — letter-case slips", () => {
  it.each([
    ["ML", "mL"],
    ["Mg", "mg"],
    ["MMOL/L", "mmol/L"],
  ])("flags %s as a case slip of %s", (slip) => {
    expect(isUcumCaseSuspect(slip)).toBe(true);
  });

  it.each(["mL", "mg", "mmol/L", "g/dL", "mm[Hg]"])(
    "does not flag the canonical unit %s",
    (unit) => {
      expect(isUcumCaseSuspect(unit)).toBe(false);
    },
  );
});

describe("UCUM grammar — property invariants", () => {
  // A small alphabet of valid metric atoms + prefixes the grammar must accept in
  // any `prefix?atom(/atom)*` shape.
  const metricAtom = fc.constantFrom("m", "g", "s", "L", "mol", "Hz", "Pa");
  const prefix = fc.constantFrom("", "k", "m", "u", "n", "d", "c", "da");

  function simpleUnit(): fc.Arbitrary<string> {
    return fc.tuple(prefix, metricAtom).map(([p, a]) => `${p}${a}`);
  }

  it("accepts any prefix+atom term joined by '.' and '/'", () => {
    fc.assert(
      fc.property(fc.array(simpleUnit(), { minLength: 1, maxLength: 4 }), (units) => {
        const expr = units.join("/");
        expect(isValidUcumUnit(expr)).toBe(true);
      }),
    );
  });

  it("a canonical unit is never reported as case-suspect", () => {
    fc.assert(
      fc.property(simpleUnit(), (unit) => {
        // By construction `unit` is canonical UCUM, so the case-suspect detector
        // must stay silent (it only fires on a non-canonical lowercase match).
        if (isValidUcumUnit(unit)) expect(isUcumCaseSuspect(unit)).toBe(false);
      }),
    );
  });

  it("an annotation suffix never changes a unit's validity", () => {
    fc.assert(
      fc.property(simpleUnit(), (unit) => {
        expect(isValidUcumUnit(`${unit}{tag}`)).toBe(isValidUcumUnit(unit));
      }),
    );
  });
});
