import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseCcda, CcdaParseError, FATAL_CODES } from "../src/index.js";
import { buildCcda } from "./__fixtures__/ccda.js";

const fatalCodes = new Set<string>(Object.values(FATAL_CODES));

describe("secure XML substrate — attack vectors", () => {
  it("rejects a classic XXE external-entity declaration", () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<ClinicalDocument xmlns="urn:hl7-org:v3"><id>&xxe;</id></ClinicalDocument>`;
    expect(() => parseCcda(xxe)).toThrow(
      expect.objectContaining({ code: FATAL_CODES.XXE_OR_DTD_PRESENT }),
    );
  });

  it("rejects a billion-laughs entity-expansion bomb (via the DTD gate)", () => {
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
]>
<ClinicalDocument xmlns="urn:hl7-org:v3">&lol2;</ClinicalDocument>`;
    expect(() => parseCcda(bomb)).toThrow(CcdaParseError);
  });

  it("rejects pathological element nesting", () => {
    const deep = `${"<a>".repeat(5000)}${"</a>".repeat(5000)}`;
    const xml = `<ClinicalDocument xmlns="urn:hl7-org:v3">${deep}</ClinicalDocument>`;
    expect(() => parseCcda(xml)).toThrow(
      expect.objectContaining({ code: FATAL_CODES.ELEMENT_DEPTH_LIMIT_EXCEEDED }),
    );
  });

  it("rejects an undeclared custom entity reference flood without a DTD", () => {
    const refs = "&x;".repeat(2000);
    const xml = `<ClinicalDocument xmlns="urn:hl7-org:v3"><id>${refs}</id></ClinicalDocument>`;
    expect(() => parseCcda(xml)).toThrow(
      expect.objectContaining({ code: FATAL_CODES.ENTITY_EXPANSION_LIMIT }),
    );
  });
});

describe("fuzz — parseCcda never throws a non-fatal", () => {
  it("survives arbitrary strings (only Tier-3 fatals may escape)", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        try {
          parseCcda(raw);
        } catch (err) {
          expect(err).toBeInstanceOf(CcdaParseError);
          expect(fatalCodes.has((err as CcdaParseError).code)).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("survives truncations of a valid document", () => {
    const full = buildCcda();
    fc.assert(
      fc.property(fc.integer({ min: 0, max: full.length }), (cut) => {
        try {
          parseCcda(full.slice(0, cut));
        } catch (err) {
          expect(err).toBeInstanceOf(CcdaParseError);
          expect(fatalCodes.has((err as CcdaParseError).code)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("survives random byte injection into a valid document", () => {
    const full = buildCcda();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: full.length - 1 }),
        fc.string({ minLength: 1, maxLength: 4 }),
        (at, inject) => {
          const mutated = full.slice(0, at) + inject + full.slice(at);
          try {
            parseCcda(mutated);
          } catch (err) {
            expect(err).toBeInstanceOf(CcdaParseError);
            expect(fatalCodes.has((err as CcdaParseError).code)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
