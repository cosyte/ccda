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
 *
 * A second block covers the adapter's `translate` (`$translate`) path — `buildCcda`
 * consuming it to emit `<translation>` alternate codings:
 *
 *   - **opt-in / non-breaking** — no adapter, a validation-only adapter, a
 *     `translate` with no opinion (`undefined`), or an unmapped source (empty
 *     `matches`) all yield **byte-identical** output (no `<translation>`);
 *   - **additive, never a coercion** — a returned coding becomes a `<translation>`
 *     *beside* the primary `@code`/`@codeSystem`, which stay verbatim;
 *   - **never fabricated** — only a concrete adapter-supplied coding produces one,
 *     and a match missing a `system` is skipped (not a spec-clean CD);
 *   - **round-trips** — the parser reads the primary code unchanged and surfaces
 *     the alternate in `CD.translation`;
 *   - **scoped to the recognized clinical slots** — problem value, allergen,
 *     medication drug + route, vaccine + route; structural act/section codes
 *     (`ASSERTION`, section LOINC) are never handed to `translate`.
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

/** ICD-10-CM code system OID — the translation target used across these fixtures. */
const ICD10CM = "2.16.840.1.113883.6.90";
/** Essential hypertension (ICD-10-CM) — the alternate coding mapped from HYPERTENSION. */
const I10 = "I10";

/** A CCD carrying every wired clinical coded slot: problem, allergen, med drug + route, vaccine + route. */
const FULL_INIT: BuildCcdaInit = {
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
  problems: [
    { problem: { code: HYPERTENSION, displayName: "Hypertensive disorder" }, status: "active" },
  ],
  allergies: [{ allergen: { code: "70618", displayName: "Penicillin" }, status: "active" }],
  medications: [
    {
      drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" },
    },
  ],
  immunizations: [
    {
      vaccine: { code: "140", displayName: "Influenza, seasonal, injectable" },
      effectiveTime: "20240101",
      route: { code: "C28161", displayName: "Intramuscular" },
    },
  ],
};

/** An adapter that confirms every code and maps `from` → a single fixed alternate coding. */
function translating(from: string, target: TerminologyCoding): TerminologyAdapter {
  return {
    validateCode: () => ({ result: true }),
    translate: (c) => (c.code === from ? { matches: [target] } : { matches: [] }),
  };
}

/** Count non-overlapping `<translation` element starts in a serialized document. */
const translationCount = (xml: string): number => xml.split("<translation").length - 1;

describe("bring-your-own terminology adapter — <translation> emit path", () => {
  const target: TerminologyCoding = {
    system: ICD10CM,
    code: I10,
    display: "Essential hypertension",
  };

  it("emits no <translation> without an adapter", () => {
    expect(serializeCcda(buildCcda(INIT))).not.toContain("<translation");
  });

  it("a validation-only adapter (no translate) is byte-identical", () => {
    const base = serializeCcda(buildCcda(INIT));
    const withValidator = serializeCcda(
      buildCcda(INIT, { terminology: { validateCode: () => ({ result: true }) } }),
    );
    expect(withValidator).toBe(base);
  });

  it("translate returning undefined (no opinion) emits nothing, byte-identical", () => {
    const base = serializeCcda(buildCcda(INIT));
    const out = serializeCcda(
      buildCcda(INIT, {
        terminology: { validateCode: () => ({ result: true }), translate: () => undefined },
      }),
    );
    expect(out).toBe(base);
  });

  it("translate returning an empty match set (unmapped) emits nothing, byte-identical", () => {
    const base = serializeCcda(buildCcda(INIT));
    const out = serializeCcda(
      buildCcda(INIT, {
        terminology: { validateCode: () => ({ result: true }), translate: () => ({ matches: [] }) },
      }),
    );
    expect(out).toBe(base);
  });

  it("emits a <translation> alternate beside the primary problem code (never a coercion)", () => {
    const xml = serializeCcda(buildCcda(INIT, { terminology: translating(HYPERTENSION, target) }));
    // The primary SNOMED code survives verbatim …
    expect(xml).toContain(`code="${HYPERTENSION}"`);
    expect(xml).toContain(`codeSystem="${SNOMED_CT}"`);
    // … and the alternate is an *additional* child coding, not a replacement.
    expect(xml).toContain("<translation");
    expect(xml).toContain(`code="${I10}"`);
    expect(xml).toContain(`codeSystem="${ICD10CM}"`);
  });

  it("round-trips: the parser reads the primary code unchanged and surfaces the alternate", () => {
    const doc = buildCcda(INIT, { terminology: translating(HYPERTENSION, target) });
    const value = doc.getProblems()[0]?.problems[0]?.value;
    // Primary code untouched.
    expect(value?.code).toBe(HYPERTENSION);
    expect(value?.codeSystem).toBe(SNOMED_CT);
    // Alternate surfaced in CD.translation.
    expect(value?.translation?.[0]?.code).toBe(I10);
    expect(value?.translation?.[0]?.codeSystem).toBe(ICD10CM);
    expect(value?.translation?.[0]?.displayName).toBe("Essential hypertension");
    // Clean build — a translation is spec-clean, so no new warnings.
    expect(doc.warnings).toHaveLength(0);
  });

  it("a match missing a system is skipped (conservative on emit)", () => {
    const base = serializeCcda(buildCcda(INIT));
    const out = serializeCcda(
      buildCcda(INIT, {
        terminology: {
          validateCode: () => ({ result: true }),
          // A code without a codeSystem is not an unambiguous CD → dropped.
          translate: () => ({ matches: [{ code: "X" }] }),
        },
      }),
    );
    expect(out).toBe(base);
  });

  it("translates every wired clinical slot (problem, allergen, med drug + route, vaccine + route)", () => {
    // Map every source to one fixed alternate; translate is called once per wired
    // slot, so the count of <translation> equals the number of wired slots present.
    const adapter: TerminologyAdapter = {
      validateCode: () => ({ result: true }),
      translate: () => ({ matches: [target] }),
    };
    const out = serializeCcda(buildCcda(FULL_INIT, { terminology: adapter }));
    // problem value + allergen + med drug + med route + vaccine + imm route = 6.
    expect(translationCount(out)).toBe(6);
  });

  it("never hands structural act/section codes to translate (scope discipline)", () => {
    const seen: string[] = [];
    buildCcda(FULL_INIT, {
      terminology: {
        validateCode: () => ({ result: true }),
        translate: (c) => {
          seen.push(c.code);
          return { matches: [] };
        },
      },
    });
    // The recognized clinical codes are consulted …
    expect(seen).toContain(HYPERTENSION); // problem
    expect(seen).toContain("70618"); // allergen
    expect(seen).toContain("314076"); // med drug
    expect(seen).toContain("C38288"); // med route
    expect(seen).toContain("140"); // vaccine
    expect(seen).toContain("C28161"); // imm route
    // … structural act/section codes are never handed to the adapter.
    expect(seen).not.toContain("ASSERTION");
    expect(seen).not.toContain("11450-4"); // Problems section LOINC
    expect(seen).not.toContain("48765-2"); // Allergies section LOINC
  });
});
