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
 *   - the **round-trip** invariant is `it.todo` until the serializer (`serializeCcda` /
 *     `doc.toString()`) lands. The body is written against the real runner so it typechecks and
 *     lints now, and flips on by changing `it.todo` to `it` once a serializer exists.
 */

import { describe, it } from "vitest";
import fc from "fast-check";
import { lenientNeverThrowsProperty, roundTripProperty } from "@cosyte/test-utils";

import {
  FATAL_CODES,
  WARNING_CODES,
  parseCcda,
  type CcdaDocument,
  type CcdaWarning,
} from "../../src/index.js";

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

/** Minimal round-trip carrier until the real spec-clean model arbitrary lands. */
interface RoundTripStub {
  readonly warnings: readonly CcdaWarning[];
}

/**
 * Placeholder arbitrary for **spec-clean** values — the round-trip generator. Replace it with a
 * generator of spec-valid documents the builder/serializer can emit, so `parse(serialize(x))` can be
 * asserted structurally equal to `x`.
 */
function specCleanCcda(): fc.Arbitrary<RoundTripStub> {
  return fc.constant({ warnings: [] } satisfies RoundTripStub);
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

  // TODO: flip `it.todo` -> `it` once a serializer (`serializeCcda` / `doc.toString()`)
  // exists. The body already typechecks and lints against the real runner.
  it.todo("round-trips — parse(serialize(x)) is structurally equal to x", () => {
    roundTripProperty({
      arbitrary: specCleanCcda(),
      // Replace with the real serializer once it lands.
      serialize: (value) => JSON.stringify(value),
      // Replace with the real parser once it returns the model type the arbitrary produces.
      parse: (raw): RoundTripStub => {
        const decoded: unknown = JSON.parse(raw);
        const warnings =
          typeof decoded === "object" && decoded !== null && "warnings" in decoded
            ? (decoded as RoundTripStub).warnings
            : [];
        return { warnings };
      },
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });
  });
});
