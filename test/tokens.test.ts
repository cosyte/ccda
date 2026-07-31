import { describe, expect, it } from "vitest";

import {
  safeDatatypeName,
  safeDerivedToken,
  safeElementName,
  safeMediaType,
  safeRepresentation,
  WITHHELD,
} from "../src/parser/tokens.js";

/**
 * The bound itself, pinned directly rather than only through the parser.
 *
 * Two properties matter and they pull against each other: a **conforming**
 * token must pass through byte-identical (otherwise the fix costs diagnostic
 * quality on every real document), and **anything else** must be refused
 * whole rather than truncated (a prefix of a patient name is still a patient
 * name).
 */
describe("safeDerivedToken", () => {
  it("returns a conforming UID unchanged", () => {
    for (const uid of [
      "2.16.840.1.113883.10.20.22.1.2",
      "1.3.6.1.4.1.19376.1.5.3.1.3.1",
      "0.4",
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    ]) {
      expect(safeDerivedToken(uid, "uid")).toBe(uid);
    }
  });

  it("withholds a non-UID whole, never a prefix of it", () => {
    for (const junk of ["ZqPhI7xK", "2.16.840.1.113883.10.20.22.1.2 Doe, Jane", "", "1.2.03"]) {
      expect(safeDerivedToken(junk, "uid")).toBe(WITHHELD);
    }
  });

  it("bounds the template version stamp and the LOINC shape", () => {
    expect(safeDerivedToken("2015-08-01", "templateVersion")).toBe("2015-08-01");
    expect(safeDerivedToken("2014-06-09", "templateVersion")).toBe("2014-06-09");
    expect(safeDerivedToken("v2015", "templateVersion")).toBe(WITHHELD);

    expect(safeDerivedToken("11450-4", "loinc")).toBe("11450-4");
    expect(safeDerivedToken("99999-9", "loinc")).toBe("99999-9");
    expect(safeDerivedToken("ZqPhI7xK", "loinc")).toBe(WITHHELD);
  });
});

describe("membership-bounded tokens", () => {
  it("echoes a CDA element name and withholds anything else", () => {
    expect(safeElementName("section")).toBe("section");
    expect(safeElementName("substanceAdministration")).toBe("substanceAdministration");
    expect(safeElementName("ClinicalDocument")).toBe("ClinicalDocument");
    // A shape test cannot help here: an XML local name is an NCName, so a forged
    // one is any word. Membership is the only bound that holds.
    expect(safeElementName("ZqPhI7xK")).toBe(WITHHELD);
    expect(safeElementName("PatientName")).toBe(WITHHELD);
  });

  it("echoes an HL7 v3 datatype name and withholds anything else", () => {
    expect(safeDatatypeName("PQ")).toBe("PQ");
    expect(safeDatatypeName("RTO_PQ_PQ")).toBe("RTO_PQ_PQ");
    expect(safeDatatypeName("ZqPhI7xK")).toBe(WITHHELD);
  });

  it("echoes a known media type and withholds anything else", () => {
    expect(safeMediaType("application/pdf")).toBe("application/pdf");
    expect(safeMediaType("text/plain")).toBe("text/plain");
    // A `type/subtype` SHAPE test passed this: 61 characters of legible identifier
    // through a bound that looked tight. Membership is what closes it, and this
    // assertion exists to fail if anyone reintroduces the regex.
    expect(safeMediaType("text/Doe-Jane-1980.01.01-MRN0012345")).toBe(WITHHELD);
    expect(safeMediaType("text/ZqPhI7xK")).toBe(WITHHELD);
    expect(safeMediaType("ZqPhI7xK")).toBe(WITHHELD);
  });

  it("echoes an ED representation and withholds anything else", () => {
    expect(safeRepresentation("B64")).toBe("B64");
    expect(safeRepresentation("TXT")).toBe("TXT");
    expect(safeRepresentation("ZqPhI7xK")).toBe(WITHHELD);
  });
});
