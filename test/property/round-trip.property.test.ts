/**
 * Property-based conformance tests for the cosyte parser archetype, driven by the shared
 * `@cosyte/test-utils` invariant runners. The kit owns the **invariants**; this parser owns the
 * **format-specific arbitraries** (the `Ccda` generators below).
 *
 * This file is the intended shape for every `@cosyte/*` parser (see `@cosyte/hl7`'s
 * `test/property/`):
 *
 *   - the **lenient-mode** invariant runs against the real parser — `parseCcda` must never throw a
 *     non-fatal on arbitrary input, and every recovered warning must carry a registered code; and
 *   - the **round-trip** invariant runs against the real serializer
 *     (`serializeCcda` / `doc.toString()`): for a spec-valid document `x`,
 *     `parse(serialize(x))` is canonically equal to `x` and serialization is a
 *     fixed point (`serialize(parse(serialize(x))) === serialize(x)`).
 */

import { describe, it } from "vitest";
import fc from "fast-check";
import { lenientNeverThrowsProperty, roundTripProperty } from "@cosyte/test-utils";

import { FATAL_CODES, WARNING_CODES, parseCcda, type CcdaDocument } from "../../src/index.js";

import { specCleanCcdaXml } from "./_arbitraries.js";

const fatalCodes = new Set<string>(Object.values(FATAL_CODES));
const knownWarningCodes = new Set<string>(Object.values(WARNING_CODES));

/**
 * Placeholder arbitrary for **hostile / quirky** input — the lenient-mode generator. Today this is
 * arbitrary strings (which the parser rejects as Tier-3 not-well-formed / not-a-ClinicalDocument
 * fatals); replace it with a generator that emits real C-CDA quirks (unknown templates, missing
 * stamps, encoding oddities) the lenient parser must recover into warnings.
 */
function hostileInput(): fc.Arbitrary<string> {
  return fc.string();
}

describe("ccda conformance (archetype invariants)", () => {
  it("is lenient — arbitrary input never throws a non-fatal, and every warning has a known code", () => {
    lenientNeverThrowsProperty({
      arbitrary: hostileInput(),
      parse: (raw: string) => parseCcda(raw),
      // Only Tier-3 fatals (a code in FATAL_CODES) may escape as a throw.
      isFatal: (err) =>
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        fatalCodes.has(String(err.code)),
      getWarnings: (doc) => (doc as CcdaDocument).warnings,
      isKnownCode: (code) => knownWarningCodes.has(code),
      hasPositionalContext: (warning) =>
        warning.position === undefined || typeof warning.position === "object",
    });
  });

  it("round-trips — parse(serialize(x)) is canonically equal to x", () => {
    roundTripProperty<CcdaDocument>({
      arbitrary: specCleanCcdaXml().map((xml) => parseCcda(xml)),
      serialize: (doc) => doc.toString(),
      parse: (raw) => parseCcda(raw),
      // The serialized XML is the canonical form, so structural equality is
      // equality of that form (mirrors @cosyte/hl7's round-trip equals).
      equals: (a, b) => a.toString() === b.toString(),
      numRuns: 80,
    });
  });
});
