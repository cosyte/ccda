import { afterEach, describe, expect, it } from "vitest";

import {
  applyProfile,
  ccdaProfiles,
  CcdaProfileDefinitionError,
  defineCcdaProfile,
  getCcdaProfile,
  getDefaultCcdaProfile,
  isSafetyCriticalCode,
  listCcdaProfiles,
  parseCcda,
  profileQuirkApplied,
  SAFETY_CRITICAL_CODES,
  setDefaultCcdaProfile,
  WARNING_CODES,
  wrapEmitterWithProfile,
  type CcdaProfile,
  type CcdaWarning,
} from "../src/index.js";
import {
  buildCcda,
  NO_REQUIRED_SECTIONS_DOC_OID,
  PROBLEMS_SECTION,
  RESULTS_SECTION,
  VITALS_SECTION,
} from "./__fixtures__/ccda.js";

const codes = (warnings: readonly CcdaWarning[]): string[] => warnings.map((w) => w.code);

/** A CCD whose only vital carries the deprecated BMI LOINC 41909-3. */
function deprecatedLoincCcd(): string {
  return buildCcda({ sections: RESULTS_SECTION }).replace('code="718-7"', 'code="41909-3"');
}

/** A CCD whose sole problem value uses the deprecated ICD-9 code system. */
function icd9ProblemCcd(): string {
  return buildCcda({ sections: PROBLEMS_SECTION }).replace(
    'code="59621000" codeSystem="2.16.840.1.113883.6.96"',
    'code="401.9" codeSystem="2.16.840.1.113883.6.103"',
  );
}

afterEach(() => {
  // The only mutable module-scoped state in the subsystem — clear it so a
  // default set in one test cannot bleed into the next.
  setDefaultCcdaProfile(null);
});

describe("defineCcdaProfile — construction & validation", () => {
  it("builds a frozen profile with lineage = [name] and describe()", () => {
    const p = defineCcdaProfile({ name: "acme", description: "desc" });
    expect(p.name).toBe("acme");
    expect(p.lineage).toEqual(["acme"]);
    expect(p.tolerate).toEqual([]);
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.describe?.()).toContain("Profile 'acme'");
    expect(p.describe?.()).toContain("tolerates: nothing");
  });

  it("rejects a missing/blank name", () => {
    expect(() => defineCcdaProfile({ name: "" })).toThrow(CcdaProfileDefinitionError);
    expect(() => defineCcdaProfile({ name: "   " })).toThrow(/non-empty string/);
    // @ts-expect-error — exercise the runtime guard for a non-string name.
    expect(() => defineCcdaProfile({ name: 42 })).toThrow(CcdaProfileDefinitionError);
    // @ts-expect-error — exercise the null-options guard.
    expect(() => defineCcdaProfile(null)).toThrow(/options is required/);
  });

  it("rejects an unknown option key with a did-you-mean hint", () => {
    // @ts-expect-error — 'tolerated' is not a known key (near 'tolerate').
    expect(() => defineCcdaProfile({ name: "x", tolerated: [] })).toThrow(
      /Did you mean 'tolerate'/,
    );
    // A far-off key gets no hint but still throws.
    // @ts-expect-error — unknown key.
    expect(() => defineCcdaProfile({ name: "x", zzzzzzz: 1 })).toThrow(/unknown option key/);
  });

  it("rejects a tolerate entry with an unknown warning code", () => {
    expect(() =>
      // @ts-expect-error — not a real WarningCode.
      defineCcdaProfile({ name: "x", tolerate: [{ code: "NOPE", rationale: "r" }] }),
    ).toThrow(/unknown warning code/);
  });

  it("rejects a tolerate entry with an empty rationale", () => {
    expect(() =>
      defineCcdaProfile({ name: "x", tolerate: [{ code: "DEPRECATED_LOINC", rationale: "  " }] }),
    ).toThrow(/non-empty 'rationale'/);
  });

  it("REFUSES to tolerate a safety-critical warning code (the safety gate)", () => {
    for (const code of [
      "MISSING_DOSE_QUANTITY",
      "CODE_NARRATIVE_MISMATCH",
      "NEGATION_VS_NULLFLAVOR_AMBIGUOUS",
      "NON_UCUM_UNIT",
      "MISSING_ASSIGNING_AUTHORITY",
      "REQUIRED_SECTION_MISSING",
      "UNEXPECTED_CODE_SYSTEM",
      "MALFORMED_DATETIME",
    ] as const) {
      expect(() =>
        defineCcdaProfile({ name: "unsafe", tolerate: [{ code, rationale: "should throw" }] }),
      ).toThrow(/safety-critical/);
    }
  });
});

describe("defineCcdaProfile — extends / merge", () => {
  it("merges lineage, tolerate, provenance and description from a single parent", () => {
    const parent = defineCcdaProfile({
      name: "base",
      description: "base desc",
      provenance: { source: "S", reference: "R" },
      tolerate: [{ code: "DEPRECATED_LOINC", rationale: "parent" }],
    });
    const child = defineCcdaProfile({
      name: "child",
      extends: parent,
      tolerate: [{ code: "TEMPLATE_EXTENSION_ABSENT", rationale: "child" }],
    });
    expect(child.lineage).toEqual(["base", "child"]);
    expect(child.tolerate.map((t) => t.code)).toEqual([
      "DEPRECATED_LOINC",
      "TEMPLATE_EXTENSION_ABSENT",
    ]);
    // Scalars inherit from the parent when the child omits them.
    expect(child.description).toBe("base desc");
    expect(child.provenance?.source).toBe("S");
  });

  it("child scalars win over parents; last parent wins otherwise", () => {
    const p1 = defineCcdaProfile({ name: "p1", description: "d1" });
    const p2 = defineCcdaProfile({
      name: "p2",
      description: "d2",
      provenance: { source: "S2", reference: "R2" },
    });
    const inheritLast = defineCcdaProfile({ name: "c", extends: [p1, p2] });
    expect(inheritLast.description).toBe("d2");
    expect(inheritLast.provenance?.source).toBe("S2");
    const childWins = defineCcdaProfile({ name: "c2", extends: [p1, p2], description: "own" });
    expect(childWins.description).toBe("own");
  });

  it("dedupes lineage and refines a same-code tolerance (last wins)", () => {
    const parent = defineCcdaProfile({
      name: "base",
      tolerate: [{ code: "DEPRECATED_LOINC", rationale: "parent-reason" }],
    });
    const child = defineCcdaProfile({
      name: "base", // same name → deduped in lineage
      extends: parent,
      tolerate: [{ code: "DEPRECATED_LOINC", rationale: "child-reason" }],
    });
    expect(child.lineage).toEqual(["base"]);
    expect(child.tolerate).toHaveLength(1);
    expect(child.tolerate[0]?.rationale).toBe("child-reason");
  });

  it("tolerates the same code in two sections as distinct entries", () => {
    const p = defineCcdaProfile({
      name: "multi",
      tolerate: [
        { code: "DEPRECATED_LOINC", rationale: "vitals", match: { sectionCode: "8716-3" } },
        { code: "DEPRECATED_LOINC", rationale: "results", match: { sectionCode: "30954-2" } },
      ],
    });
    expect(p.tolerate).toHaveLength(2);
    expect(p.describe?.()).toContain("@section 8716-3");
  });

  it("re-validates the merged set — a rogue parent cannot smuggle a safety-critical code", () => {
    const rogue: CcdaProfile = {
      name: "rogue",
      lineage: ["rogue"],
      tolerate: [{ code: "MISSING_DOSE_QUANTITY", rationale: "hand-crafted bypass" }],
    };
    expect(() => defineCcdaProfile({ name: "child", extends: rogue })).toThrow(/safety-critical/);
  });

  it("defends against a hand-crafted parent with an empty lineage", () => {
    const bare: CcdaProfile = { name: "bare", lineage: [], tolerate: [] };
    const child = defineCcdaProfile({ name: "child", extends: bare });
    expect(child.lineage).toEqual(["bare", "child"]);
  });

  it("describe() renders provenance, template-scoped match, and lineage arrow", () => {
    const p = defineCcdaProfile({
      name: "d",
      extends: defineCcdaProfile({ name: "root" }),
      provenance: { source: "Src", reference: "Ref" },
      tolerate: [
        {
          code: "SECTION_MATCHED_BY_LOINC_FALLBACK",
          rationale: "tmpl",
          match: { templateId: "2.16.840.1.113883.10.20.22.2.5.1" },
        },
      ],
    });
    const text = p.describe?.() ?? "";
    expect(text).toContain("grounded in: Src (Ref)");
    expect(text).toContain("root → d");
    expect(text).toContain("@template 2.16.840.1.113883.10.20.22.2.5.1");
  });
});

describe("safety set", () => {
  it("classifies safety-critical vs tolerable codes", () => {
    expect(isSafetyCriticalCode(WARNING_CODES.MISSING_DOSE_QUANTITY)).toBe(true);
    expect(isSafetyCriticalCode(WARNING_CODES.PROFILE_QUIRK_APPLIED)).toBe(true);
    expect(isSafetyCriticalCode(WARNING_CODES.DEPRECATED_LOINC)).toBe(false);
    expect(SAFETY_CRITICAL_CODES.has(WARNING_CODES.CODE_NARRATIVE_MISMATCH)).toBe(true);
    expect(Object.isFrozen(SAFETY_CRITICAL_CODES)).toBe(true);
  });
});

describe("registry", () => {
  it("looks up built-ins by name and lists them", () => {
    expect(getCcdaProfile("smartScorecard")).toBe(ccdaProfiles.smartScorecard);
    expect(getCcdaProfile("nope")).toBeUndefined();
    expect(listCcdaProfiles()).toEqual(["default", "smartScorecard", "legacyR11"]);
  });

  it("set/get the process-scoped default and clear it", () => {
    expect(getDefaultCcdaProfile()).toBeUndefined();
    setDefaultCcdaProfile(ccdaProfiles.legacyR11);
    expect(getDefaultCcdaProfile()).toBe(ccdaProfiles.legacyR11);
    setDefaultCcdaProfile(null);
    expect(getDefaultCcdaProfile()).toBeUndefined();
  });

  it("every built-in except default carries provenance", () => {
    expect(ccdaProfiles.default.provenance).toBeUndefined();
    expect(ccdaProfiles.smartScorecard.provenance?.reference).toMatch(/JAMIA|scorecard/i);
    expect(ccdaProfiles.legacyR11.provenance?.reference).toMatch(/C-CDA-Examples|healthit/i);
  });
});

describe("profileQuirkApplied factory", () => {
  it("re-badges a warning while preserving the original code and message", () => {
    const src: CcdaWarning = {
      code: WARNING_CODES.DEPRECATED_LOINC,
      message: "BMI 41909-3 deprecated",
      position: { path: "code" },
    };
    const out = profileQuirkApplied(src, "smartScorecard");
    expect(out.code).toBe(WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(out.toleratedCode).toBe(WARNING_CODES.DEPRECATED_LOINC);
    expect(out.message).toContain("41909-3");
    expect(out.position).toBe(src.position);
  });
});

describe("applyProfile — pure warning transform", () => {
  it("downgrades a tolerated warning to PROFILE_QUIRK_APPLIED, preserving the original code", () => {
    const w: CcdaWarning = {
      code: WARNING_CODES.DEPRECATED_LOINC,
      message: "BMI 41909-3 deprecated",
      position: { path: "code" },
    };
    const out = applyProfile(ccdaProfiles.smartScorecard, w);
    expect(out.code).toBe(WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(out.expected).toBe(true);
    expect(out.profile).toBe("smartScorecard");
    expect(out.toleratedCode).toBe(WARNING_CODES.DEPRECATED_LOINC);
    expect(out.message).toContain("41909-3");
  });

  it("passes an un-tolerated warning through by identity", () => {
    const w: CcdaWarning = {
      code: WARNING_CODES.MISSING_DOSE_QUANTITY,
      message: "no dose",
      position: {},
    };
    expect(applyProfile(ccdaProfiles.smartScorecard, w)).toBe(w);
  });

  it("passes an already-expected warning through untouched", () => {
    const w: CcdaWarning = {
      code: WARNING_CODES.PROFILE_QUIRK_APPLIED,
      message: "x",
      position: {},
      expected: true,
    };
    expect(applyProfile(ccdaProfiles.smartScorecard, w)).toBe(w);
  });

  it("respects structural match narrowing (section + template)", () => {
    const p = defineCcdaProfile({
      name: "scoped",
      tolerate: [
        { code: "DEPRECATED_LOINC", rationale: "only vitals", match: { sectionCode: "8716-3" } },
      ],
    });
    const inVitals: CcdaWarning = {
      code: WARNING_CODES.DEPRECATED_LOINC,
      message: "m",
      position: { sectionCode: "8716-3" },
    };
    const inResults: CcdaWarning = {
      code: WARNING_CODES.DEPRECATED_LOINC,
      message: "m",
      position: { sectionCode: "30954-2" },
    };
    expect(applyProfile(p, inVitals).code).toBe(WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(applyProfile(p, inResults).code).toBe(WARNING_CODES.DEPRECATED_LOINC);

    const pt = defineCcdaProfile({
      name: "scoped2",
      tolerate: [{ code: "DEPRECATED_LOINC", rationale: "t", match: { templateId: "T1" } }],
    });
    const wrongTemplate: CcdaWarning = {
      code: WARNING_CODES.DEPRECATED_LOINC,
      message: "m",
      position: { templateId: "T2" },
    };
    expect(applyProfile(pt, wrongTemplate).code).toBe(WARNING_CODES.DEPRECATED_LOINC);
  });

  it("wrapEmitterWithProfile returns the sink unchanged when no profile", () => {
    const sink = (): void => undefined;
    expect(wrapEmitterWithProfile(sink, undefined)).toBe(sink);
  });
});

describe("end-to-end parse with a profile", () => {
  it("smartScorecard re-badges a deprecated LOINC as an expected quirk", () => {
    const xml = deprecatedLoincCcd();
    const bare = parseCcda(xml);
    expect(codes(bare.warnings)).toContain(WARNING_CODES.DEPRECATED_LOINC);
    expect(bare.profile).toBeUndefined();

    const doc = parseCcda(xml, { profile: ccdaProfiles.smartScorecard });
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.DEPRECATED_LOINC);
    const quirk = doc.warnings.find((w) => w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED);
    expect(quirk?.expected).toBe(true);
    expect(quirk?.toleratedCode).toBe(WARNING_CODES.DEPRECATED_LOINC);
    expect(doc.profile).toEqual({ name: "smartScorecard", lineage: ["smartScorecard"] });
  });

  it("smartScorecard tolerates a deprecated ICD-9 code system", () => {
    const doc = parseCcda(icd9ProblemCcd(), { profile: ccdaProfiles.smartScorecard });
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.DEPRECATED_CODE_SYSTEM);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.PROFILE_QUIRK_APPLIED);
  });

  it("legacyR11 tolerates an absent R2.1 version stamp", () => {
    const xml = buildCcda({ extension: undefined, sections: VITALS_SECTION });
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.TEMPLATE_EXTENSION_ABSENT);
    const doc = parseCcda(xml, { profile: ccdaProfiles.legacyR11 });
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.TEMPLATE_EXTENSION_ABSENT);
    expect(codes(doc.warnings)).toContain(WARNING_CODES.PROFILE_QUIRK_APPLIED);
  });

  it("a profile NEVER changes extracted clinical values — only warning behaviour", () => {
    const xml = deprecatedLoincCcd();
    const bare = parseCcda(xml);
    const withProfile = parseCcda(xml, { profile: ccdaProfiles.smartScorecard });
    expect(JSON.stringify(withProfile.results)).toEqual(JSON.stringify(bare.results));
    expect(withProfile.getMrn()).toEqual(bare.getMrn());
  });

  it("the default profile tolerates nothing", () => {
    const xml = deprecatedLoincCcd();
    const doc = parseCcda(xml, { profile: ccdaProfiles.default });
    expect(codes(doc.warnings)).toContain(WARNING_CODES.DEPRECATED_LOINC);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.PROFILE_QUIRK_APPLIED);
  });

  it("applies the process-scoped default, and honours an explicit opt-out", () => {
    setDefaultCcdaProfile(ccdaProfiles.smartScorecard);
    const xml = deprecatedLoincCcd();
    expect(codes(parseCcda(xml).warnings)).toContain(WARNING_CODES.PROFILE_QUIRK_APPLIED);
    // Explicit null opts out of the default for this call.
    expect(codes(parseCcda(xml, { profile: null }).warnings)).toContain(
      WARNING_CODES.DEPRECATED_LOINC,
    );
  });

  it("strict mode: an expected quirk does not throw, but a real deviation still does", () => {
    // A recognized doc type with no SHALL sections + an assigning authority, so
    // the deprecated LOINC is the ONLY warning the document produces.
    const xml = buildCcda({
      docTypeOid: NO_REQUIRED_SECTIONS_DOC_OID,
      sections: RESULTS_SECTION,
      mrnAssigningAuthority: true,
    }).replace('code="718-7"', 'code="41909-3"');
    expect(codes(parseCcda(xml).warnings)).toEqual([WARNING_CODES.DEPRECATED_LOINC]);
    // With the tolerating profile the sole deviation is expected → no throw.
    expect(() =>
      parseCcda(xml, { profile: ccdaProfiles.smartScorecard, strict: true }),
    ).not.toThrow();
    // Without it, strict mode escalates the deviation.
    expect(() => parseCcda(xml, { strict: true })).toThrow();
  });
});
