/**
 * Tests for the bring-your-own {@link TerminologyAdapter} — the pluggable
 * semantic-validation contract added in CCDA-P7.
 *
 * The invariants under test:
 *
 *   - **opt-in** — with no adapter, behavior is unchanged (recognize-only, no
 *     `SEMANTIC_CODE_INVALID`);
 *   - **surfaced, never coerced** — a code the adapter rejects is flagged
 *     `SEMANTIC_CODE_INVALID` while the code itself is preserved verbatim in the
 *     document (the builder never rewrites a value to satisfy the adapter);
 *   - **no opinion is silent** — an adapter that returns `undefined` (system out
 *     of its scope) adds no warning, so a partial-coverage adapter is not noisy;
 *   - **the adapter sees the wire coding** — the C-CDA `@codeSystem` OID, `@code`,
 *     and `@displayName`, exactly as the document carries them; and
 *   - **both entry points honor it** — `parseCcda` on existing XML and `buildCcda`
 *     on the document it emits.
 */

import { describe, expect, it } from "vitest";

import {
  buildCcda,
  parseCcda,
  serializeCcda,
  WARNING_CODES,
  type BuildCcdaInit,
  type CcdaWarning,
  type TerminologyAdapter,
  type TerminologyCoding,
} from "../src/index.js";

const SNOMED_CT = "2.16.840.1.113883.6.96";
const RXNORM = "2.16.840.1.113883.6.88";

/** Hypertension (SNOMED CT) — the problem code used across these fixtures. */
const HYPERTENSION = "38341003";

const INIT: BuildCcdaInit = {
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
  problems: [
    { problem: { code: HYPERTENSION, displayName: "Hypertensive disorder" }, status: "active" },
  ],
  medications: [
    {
      drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" },
    },
  ],
};

const codes = (warnings: readonly CcdaWarning[]): string[] => warnings.map((w) => w.code);

/** An adapter that rejects one specific code and confirms everything else. */
function rejecting(badCode: string): TerminologyAdapter {
  return { validateCode: (c) => ({ result: c.code !== badCode }) };
}

describe("bring-your-own terminology adapter — parse path", () => {
  const xml = serializeCcda(buildCcda(INIT));

  it("is opt-in: no adapter ⇒ no SEMANTIC_CODE_INVALID", () => {
    const doc = parseCcda(xml);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
  });

  it("flags a code the adapter rejects, verbatim-preserved", () => {
    const doc = parseCcda(xml, { terminology: rejecting(HYPERTENSION) });
    expect(codes(doc.warnings)).toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
    // The rejected code is never coerced away — it survives in the model.
    expect(doc.getProblems()[0]?.problems[0]?.value?.code).toBe(HYPERTENSION);
    const w = doc.warnings.find((x) => x.code === WARNING_CODES.SEMANTIC_CODE_INVALID);
    // PHI-free: the message names the slot + system OID, never the code itself.
    expect(w?.message).toContain(SNOMED_CT);
    expect(w?.message).not.toContain(HYPERTENSION);
  });

  it("stays silent when every code is confirmed valid", () => {
    const doc = parseCcda(xml, { terminology: { validateCode: () => ({ result: true }) } });
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
  });

  it("stays silent when the adapter has no opinion (undefined)", () => {
    const doc = parseCcda(xml, { terminology: { validateCode: () => undefined } });
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
  });

  it("only flags the slot the adapter rejects (partial coverage is not noisy)", () => {
    // An adapter that only covers RxNorm: it rejects the med code and declines
    // (undefined) on SNOMED — so exactly one SEMANTIC_CODE_INVALID, for the med.
    const adapter: TerminologyAdapter = {
      validateCode: (c) => (c.system === RXNORM ? { result: false } : undefined),
    };
    const doc = parseCcda(xml, { terminology: adapter });
    const invalids = doc.warnings.filter((w) => w.code === WARNING_CODES.SEMANTIC_CODE_INVALID);
    expect(invalids).toHaveLength(1);
  });

  it("skips a coded value that has a system but no concrete code symbol", () => {
    // Strip the SNOMED problem's @code, leaving a codeSystem-only value. An
    // adapter that would reject any SNOMED code is never consulted for it, so no
    // SEMANTIC_CODE_INVALID is raised — there is no membership claim to test.
    const noCodeXml = xml.replaceAll(`code="${HYPERTENSION}"`, "");
    const adapter: TerminologyAdapter = {
      validateCode: (c) => (c.system === SNOMED_CT ? { result: false } : undefined),
    };
    const doc = parseCcda(noCodeXml, { terminology: adapter });
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
  });

  it("hands the adapter the wire coding (OID system, code, display)", () => {
    const seen: TerminologyCoding[] = [];
    parseCcda(xml, {
      terminology: {
        validateCode: (c) => {
          seen.push(c);
          return { result: true };
        },
      },
    });
    const problem = seen.find((c) => c.code === HYPERTENSION);
    expect(problem?.system).toBe(SNOMED_CT);
    expect(problem?.display).toBe("Hypertensive disorder");
  });
});

describe("bring-your-own terminology adapter — build path", () => {
  it("validates on build: a rejected code is flagged on the returned document", () => {
    const doc = buildCcda(INIT, { terminology: rejecting(HYPERTENSION) });
    expect(codes(doc.warnings)).toContain(WARNING_CODES.SEMANTIC_CODE_INVALID);
    // Never coerced: the emitted document still carries the verbatim code.
    expect(serializeCcda(doc)).toContain(`code="${HYPERTENSION}"`);
  });

  it("a clean build with a permissive adapter still produces zero warnings", () => {
    const doc = buildCcda(INIT, { terminology: { validateCode: () => ({ result: true }) } });
    expect(doc.warnings).toHaveLength(0);
  });

  it("without options behaves exactly as before (clean build)", () => {
    expect(buildCcda(INIT).warnings).toHaveLength(0);
  });
});
