import { DOMException, DOMParser, ParseError } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseCcda, CcdaParseError, FATAL_CODES } from "../src/index.js";
import { FATAL_MESSAGES } from "../src/parser/errors.js";
import { buildCcda } from "./__fixtures__/ccda.js";

const fatalCodes = new Set<string>(Object.values(FATAL_CODES));

/**
 * Budget for the three fuzz cases below, and for those alone. Their cost is not fixed:
 * fast-check draws a fresh seed on every run (none is pinned here, by design) and each of
 * the hundreds of draws runs a real `parseCcda` over a whole document. The deterministic
 * attack-vector cases in this file inherit the Vitest default. See `vitest.config.ts` for
 * why the budget is here rather than global.
 */
const FUZZ_TIMEOUT = 60_000;

describe("secure XML substrate, attack vectors", () => {
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

describe("fuzz, parseCcda never throws a non-fatal", () => {
  it(
    "survives arbitrary strings (only Tier-3 fatals may escape)",
    () => {
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
    },
    FUZZ_TIMEOUT,
  );

  it(
    "survives truncations of a valid document",
    () => {
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
    },
    FUZZ_TIMEOUT,
  );

  it(
    "survives random byte injection into a valid document",
    () => {
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
    },
    FUZZ_TIMEOUT,
  );
});

/**
 * Budget for the three cases in the next block, and for those alone. Each parses an input built
 * from one of `@xmldom/xmldom`'s 0.9.11 and 0.9.12 denial-of-service advisories through
 * `parseCcda`. Measured 2026-10-19 on one idle container: on 0.9.12 the slowest of the three took
 * about 500 ms; on 0.9.10, the version 0.1.0 shipped, the fastest took about 16 s. The budget sits
 * well above the first and well below the second, so a loaded runner does not trip it and a
 * quadratic parser cannot pass it. See `vitest.config.ts` for why the budget is here rather than
 * global.
 */
const LINEAR_BUDGET_MS = 4_000;

/** The case timeout sits above the budget, so a regression reports its measured time, not a timeout. */
const LINEAR_CASE_TIMEOUT = 60_000;

/** Parse `xml` and report how long it took and how it ended: `parsed`, or the fatal code. */
function timedParse(xml: string): { readonly ms: number; readonly outcome: string } {
  const start = performance.now();
  let outcome = "parsed";
  try {
    parseCcda(xml);
  } catch (err) {
    if (!(err instanceof CcdaParseError)) throw err;
    outcome = err.code;
  }
  return { ms: performance.now() - start, outcome };
}

const V3_ROOT = `<ClinicalDocument xmlns="urn:hl7-org:v3">`;

/** Run `fn` and return what it threw, or `undefined` when it returned. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}

/**
 * The namespace-map advisory (GHSA-965w-775f-mr7g) has no case here because its fix is to
 * memory, not time: 0.9.12 still takes super-linear time over a deep chain of prefix declarations,
 * so a wall-clock budget could not tell the two versions apart cleanly.
 */
describe("secure XML substrate, hostile input stays linear", () => {
  it(
    "refuses an unterminated processing instruction without backtracking (GHSA-g53g-w8rj-fmg7)",
    () => {
      const { ms, outcome } = timedParse(`${V3_ROOT}</ClinicalDocument><?a ${" ".repeat(70_000)}`);
      expect(outcome).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
      expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
    },
    LINEAR_CASE_TIMEOUT,
  );

  it(
    "builds an element with many distinct attributes in linear time (GHSA-8344-3jmq-59r6)",
    () => {
      const attrs = Array.from({ length: 80_000 }, (_, i) => ` a${String(i)}="1"`).join("");
      const { ms, outcome } = timedParse(`${V3_ROOT}<id${attrs}/></ClinicalDocument>`);
      // It parses, so every attribute was built: the hot path ran rather than a cap refusing first.
      expect(outcome).toBe("parsed");
      expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
    },
    LINEAR_CASE_TIMEOUT,
  );

  it(
    "gets through a run of `<` inside a malformed tag in linear time (GHSA-93r5-fhx6-vmg9)",
    () => {
      const tag = `<a${"<".repeat(40_000)}${" ".repeat(40_000)}>`;
      const { ms, outcome } = timedParse(`${V3_ROOT}${tag}</ClinicalDocument>`);
      // This case is about time. Recovering and refusing are both acceptable; a cap is not.
      expect(["parsed", FATAL_CODES.NOT_WELL_FORMED_XML]).toContain(outcome);
      expect(ms).toBeLessThan(LINEAR_BUDGET_MS);
    },
    LINEAR_CASE_TIMEOUT,
  );
});

/**
 * What `@xmldom/xmldom` 0.9.11 and 0.9.12 changed under `parseSecureXml`, as ccda sees it. The
 * upgrade from 0.9.10 was run differentially before it landed and moved no warning, model reading
 * or serialized byte, so none of these says "the output moved". Each pins one place where the
 * parser now reports something differently, and what ccda does with that report.
 */
describe("secure XML substrate, what the XML parser reports", () => {
  /**
   * GHSA-6h8r-xr42-gp59. This end tag was accepted silently before 0.9.12 and is now reported at
   * the `error` level. `buildDom` escalates only `fatalError`, so the parse keeps the recovered
   * DOM, which the parser builds identical to the clean document's. Escalating the report would be
   * a new fatal and surfacing it would be a new warning code; either is a decision of its own, and
   * this case is what makes that decision visible when it is taken.
   */
  it("keeps parsing an end tag whose name is followed by a line break and trailing content", () => {
    const clean = buildCcda();
    const quirky = clean.replace("</title>", "</title\nquirk>");
    expect(quirky).not.toBe(clean);
    const expected = parseCcda(clean);
    const actual = parseCcda(quirky);
    // Codes, not whole warnings: the extra line break moves every later line number.
    expect(actual.warnings.map((w) => w.code)).toStrictEqual(expected.warnings.map((w) => w.code));
    expect(actual.toString()).toBe(expected.toString());
  });

  /**
   * An unbound namespace prefix makes the DOM builder raise a `DOMException`. From 0.9.12 the
   * parser reports it as a `fatalError` and keeps the `DOMException`, whose message quotes the
   * element's qualified name, as the `cause` of the error it throws. `buildDom` replaces whatever
   * the parser threw with a `CcdaParseError` built from the registry, so neither the report nor
   * its `cause` reaches a caller.
   */
  it("refuses a DOM-construction error with the registry fatal and no cause", () => {
    const marker = "zzunboundzz";
    const xml = buildCcda()
      .replace("<title>", `<${marker}:title>`)
      .replace("</title>", `</${marker}:title>`);

    // The probe reaches the path it is about: the parser's own error carries the DOMException.
    const raw = thrownBy(() =>
      new DOMParser({ onError: () => undefined }).parseFromString(xml, "application/xml"),
    );
    expect(raw).toBeInstanceOf(ParseError);
    expect((raw as ParseError).cause).toBeInstanceOf(DOMException);

    const thrown = thrownBy(() => parseCcda(xml));
    expect(thrown).toBeInstanceOf(CcdaParseError);
    const err = thrown as CcdaParseError;
    expect(err.code).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    expect(err.message).toBe(FATAL_MESSAGES.NOT_WELL_FORMED_XML);
    expect(err.position).toStrictEqual({});
    expect("cause" in err).toBe(false);
    expect(String(err.stack)).not.toContain(marker);
  });

  /**
   * 0.9.11 rewrote the processing-instruction grammar (GHSA-g53g-w8rj-fmg7). Real C-CDA exchanges
   * often open with an `xml-stylesheet` instruction, and no other case here carries one.
   */
  it("keeps an xml-stylesheet instruction verbatim through a round trip", () => {
    const pi = '<?xml-stylesheet type="text/xsl" href="CDA.xsl"?>';
    const xml = buildCcda().replace("?>\n", `?>\n${pi}\n`);
    expect(xml).toContain(pi);
    const once = parseCcda(xml).toString();
    expect(once).toContain(pi);
    expect(parseCcda(once).toString()).toBe(once);
  });
});
