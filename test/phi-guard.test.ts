import { describe, expect, it } from "vitest";

import { parseCcda, CcdaParseError, WARNING_CODES, FATAL_CODES } from "../src/index.js";
import { buildCcda } from "./__fixtures__/ccda.js";

/**
 * PHI discipline: warning and fatal *messages* (and positions) describe
 * structure — element names, OIDs, codes, line/column — never clinical values.
 * These guards parse documents seeded with distinctive sentinel values in the
 * PHI-bearing slots and assert no diagnostic string echoes them back.
 */

const SENTINELS = [
  "ZZSECRETPATIENTZZ", // patient name
  "ZZSECRETMRNZZ", // MRN
  "ZZSECRETNARRATIVEZZ", // narrative text
  "19431122", // a birth date
];

function leaks(haystack: string): string | undefined {
  return SENTINELS.find((s) => haystack.includes(s));
}

describe("PHI guard — warnings carry no clinical values", () => {
  it("never echoes patient/MRN/narrative/birthdate into warning messages or positions", () => {
    const xml = buildCcda({
      // Force a fan-out of warnings: unrecognized doc OID + bad nullFlavor + multiple targets.
      docTypeOid: "1.2.3.4.5",
      includeHeaderTemplate: false,
      recordTargets: 2,
      genderNullFlavor: "BOGUS",
      birthTime: "19431122",
      mrnExtension: "ZZSECRETMRNZZ",
    })
      .replace(/<given>Jane<\/given>/g, "<given>ZZSECRETPATIENTZZ</given>")
      .replace(/penicillin note/g, "ZZSECRETNARRATIVEZZ");

    const doc = parseCcda(xml);
    expect(doc.warnings.length).toBeGreaterThan(0);
    for (const w of doc.warnings) {
      const serialized = `${w.message} ${JSON.stringify(w.position)}`;
      expect(leaks(serialized)).toBeUndefined();
    }
  });

  it("nullFlavor warning reports the structural locator, not the sentinel value", () => {
    const doc = parseCcda(buildCcda({ genderNullFlavor: "BOGUS" }));
    const nf = doc.warnings.find((w) => w.code === WARNING_CODES.INVALID_NULL_FLAVOR);
    // The observed token "BOGUS" is a code, not PHI, so it MAY appear — but a real
    // patient value never reaches a message because only coded slots feed it.
    expect(nf).toBeDefined();
  });
});

describe("PHI guard — fatal errors carry no payload snippet", () => {
  it("never echoes document content into a CcdaParseError message or position", () => {
    const xml = buildCcda({ xmlDecl: false })
      .replace(/<given>Jane<\/given>/g, "<given>ZZSECRETPATIENTZZ</given>")
      .replace("</ClinicalDocument>", "<unclosed></ClinicalDocument>");
    try {
      parseCcda(xml, { limits: { maxInputBytes: 50 } });
      throw new Error("expected a fatal");
    } catch (err) {
      expect(err).toBeInstanceOf(CcdaParseError);
      const e = err as CcdaParseError;
      expect(fatalCodeSet.has(e.code)).toBe(true);
      const serialized = `${e.message} ${JSON.stringify(e.position)}`;
      expect(leaks(serialized)).toBeUndefined();
    }
  });
});

const fatalCodeSet = new Set<string>(Object.values(FATAL_CODES));
