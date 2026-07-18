/**
 * Tests for the `buildCcda` document builder (CCDA-P7, first slice). The builder
 * emits a spec-clean C-CDA R2.1 CCD through the *same DOM the parser reads*, so
 * the central guarantees are:
 *
 *   - **round-trip fidelity** — a document `buildCcda` emits parses back to the
 *     same structured content, and serialization is a fixed point;
 *   - **spec-clean emit** — a clean build produces zero warnings (correct
 *     templateIds, LOINC section codes, structured + narrative agreement, the
 *     four CCD SHALL sections present); and
 *   - **the `negationInd` vs `nullFlavor` safety rule** — "No Known Allergies"
 *     is emitted as a negation, never collapsed into an unknown.
 */

import { describe, expect, it } from "vitest";

import { buildCcda, parseCcda, serializeCcda, type BuildCcdaInit } from "../src/index.js";

/** A minimal, fully-populated init used across the round-trip assertions. */
const RICH_INIT: BuildCcdaInit = {
  patient: {
    mrn: "MRN001",
    given: ["Jane", "Q"],
    family: "Doe",
    gender: "F",
    birthTime: "19800101",
  },
  problems: [
    {
      problem: { code: "59621000", displayName: "Essential hypertension" },
      status: "active",
      onset: "20210101",
    },
    { problem: { code: "44054006", displayName: "Type 2 diabetes mellitus" }, status: "resolved" },
  ],
  allergies: [
    {
      allergen: { code: "7980", displayName: "Penicillin G" },
      reaction: { code: "247472004", displayName: "Hives" },
      severity: { code: "6736007", displayName: "Moderate" },
      criticality: { code: "CRITH", displayName: "High criticality" },
    },
    { noKnownAllergy: true },
  ],
};

describe("buildCcda — document identity + header", () => {
  it("emits a recognized R2.1 CCD with the CCD document code", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.documentType).toBe("ccd");
    expect(doc.header.code?.code).toBe("34133-9");
    expect(doc.header.code?.codeSystem).toBe("2.16.840.1.113883.6.1");
  });

  it("carries the patient MRN and structured demographics", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.getMrn()).toBe("MRN001");
    const patient = doc.getPatient();
    expect(patient?.name?.given).toEqual(["Jane", "Q"]);
    expect(patient?.name?.family).toBe("Doe");
    expect(patient?.genderCode?.code).toBe("F");
    expect(patient?.birthTime?.raw).toBe("19800101");
  });

  it("emits a spec-clean author + custodian (SHALL header participations)", () => {
    const xml = serializeCcda(buildCcda(RICH_INIT));
    expect(xml).toContain("<author>");
    expect(xml).toContain("<custodian>");
    expect(xml).toContain("assignedAuthoringDevice");
  });

  it("defaults the title to the CCD display name and honors an override", () => {
    expect(buildCcda(RICH_INIT).header.title).toBe("Summarization of Episode Note");
    expect(buildCcda({ ...RICH_INIT, title: "My CCD" }).header.title).toBe("My CCD");
  });

  it("accepts a Date effectiveTime (formatted UTC) and a string passthrough", () => {
    const fromDate = buildCcda({ ...RICH_INIT, effectiveTime: new Date("2024-01-02T03:04:05Z") });
    expect(fromDate.header.effectiveTime?.raw).toBe("20240102030405+0000");
    expect(fromDate.header.effectiveTime?.date).toBeInstanceOf(Date);
    const fromStr = buildCcda({ ...RICH_INIT, effectiveTime: "20240101" });
    expect(fromStr.header.effectiveTime?.raw).toBe("20240101");
  });
});

describe("buildCcda — spec-clean emit (zero warnings)", () => {
  it("produces no warnings for a fully-populated build", () => {
    expect(buildCcda(RICH_INIT).warnings).toEqual([]);
  });

  it("produces no warnings for an empty (no clinical content) build", () => {
    const doc = buildCcda({ patient: { mrn: "MRN002" } });
    expect(doc.warnings).toEqual([]);
    // All four CCD SHALL sections are present (empty, nullFlavor="NI"), so
    // required-section validation does not fire.
    expect(doc.findSection("problems")).toBeDefined();
    expect(doc.findSection("allergies")).toBeDefined();
    expect(doc.findSection("medications")).toBeDefined();
    expect(doc.findSection("results")).toBeDefined();
    expect(doc.getProblems()).toEqual([]);
    expect(doc.getAllergies()).toEqual([]);
  });

  it("recognizes each populated section by its LOINC + templateId", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.findSection("problems")?.code?.code).toBe("11450-4");
    expect(doc.findSection("allergies")?.code?.code).toBe("48765-2");
    expect(doc.findSection("problems")?.recognizedBy).toBe("templateId");
  });
});

describe("buildCcda — round-trip through the parse model", () => {
  it("is a serialization fixed point", () => {
    const xml = serializeCcda(buildCcda(RICH_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });

  it("re-parses the emitted XML to the same structured content", () => {
    const doc = buildCcda(RICH_INIT);
    const reparsed = parseCcda(serializeCcda(doc));
    expect(reparsed.getMrn()).toBe("MRN001");
    expect(reparsed.getProblems().map((c) => c.problems[0]?.value?.code)).toEqual([
      "59621000",
      "44054006",
    ]);
    expect(reparsed.warnings).toEqual([]);
  });

  it("preserves the coded problem value + status, narrative agreeing", () => {
    const [active, resolved] = buildCcda(RICH_INIT).getProblems();
    expect(active?.status).toBe("active");
    expect(active?.problems[0]?.value?.code).toBe("59621000");
    expect(active?.problems[0]?.value?.codeSystem).toBe("2.16.840.1.113883.6.96");
    expect(active?.problems[0]?.narrative).toBe("Essential hypertension");
    expect(resolved?.status).toBe("resolved");
  });

  it("maps an inactive problem status without conflating it with resolved", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      problems: [
        {
          problem: { code: "59621000", displayName: "Essential hypertension" },
          status: "inactive",
        },
      ],
    });
    expect(doc.getProblems()[0]?.status).toBe("inactive");
  });

  it("emits an ICD-10-CM problem without an unexpected-code-system warning", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      problems: [
        {
          problem: {
            code: "I10",
            codeSystem: "2.16.840.1.113883.6.90",
            displayName: "Essential hypertension",
          },
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    expect(doc.getProblems()[0]?.problems[0]?.value?.codeSystem).toBe("2.16.840.1.113883.6.90");
  });
});

describe("buildCcda — allergies + the negation/nullFlavor safety rule", () => {
  it("preserves allergen, reaction, severity, and criticality as distinct axes", () => {
    const allergy = buildCcda(RICH_INIT).getAllergies()[0]?.allergies[0];
    expect(allergy?.allergen?.code).toBe("7980");
    expect(allergy?.allergen?.codeSystem).toBe("2.16.840.1.113883.6.88");
    expect(allergy?.reactions[0]?.manifestation?.code).toBe("247472004");
    expect(allergy?.reactions[0]?.severity?.code).toBe("6736007");
    expect(allergy?.criticality?.code).toBe("CRITH");
    expect(allergy?.noKnownAllergy).toBe(false);
  });

  it("emits No Known Allergies as a negation, never as an unknown", () => {
    const nka = buildCcda({
      patient: { mrn: "M" },
      allergies: [{ noKnownAllergy: true }],
    }).getAllergies()[0]?.allergies[0];
    expect(nka?.noKnownAllergy).toBe(true);
    expect(nka?.negated).toBe(true);
    expect(nka?.nullFlavor).toBeUndefined();
    expect(nka?.allergen).toBeUndefined();
  });

  it("supports an allergen without a reaction/severity/criticality", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      allergies: [{ allergen: { code: "2670", displayName: "Codeine" } }],
    });
    expect(doc.warnings).toEqual([]);
    const a = doc.getAllergies()[0]?.allergies[0];
    expect(a?.allergen?.code).toBe("2670");
    expect(a?.reactions).toEqual([]);
    expect(a?.criticality).toBeUndefined();
  });

  it("defaults the propensity type to the neutral 'Allergy to substance', never 'Drug allergy'", () => {
    const a = buildCcda({
      patient: { mrn: "M" },
      allergies: [{ allergen: { code: "762952008", displayName: "Peanut" } }],
    }).getAllergies()[0]?.allergies[0];
    // A peanut (food) allergen must NOT be silently classified as a drug allergy.
    expect(a?.type?.code).toBe("419199007");
    expect(a?.type?.code).not.toBe("416098002");
  });

  it("honors an explicit propensity type (e.g. a food allergy)", () => {
    const a = buildCcda({
      patient: { mrn: "M" },
      allergies: [
        {
          allergen: { code: "762952008", displayName: "Peanut" },
          type: { code: "414285001", displayName: "Food allergy" },
        },
      ],
    }).getAllergies()[0]?.allergies[0];
    expect(a?.type?.code).toBe("414285001");
  });
});

describe("buildCcda — emit conformance (header + section cardinality)", () => {
  it("emits SHALL addr + telecom on patientRole, assignedAuthor, and custodian org", () => {
    const xml = serializeCcda(buildCcda({ patient: { mrn: "M" } }));
    // Three participations × (addr + telecom) = at least three of each.
    expect((xml.match(/<addr /g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((xml.match(/<telecom /g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("empty required sections declare entries-optional templateId only (no entries-required)", () => {
    const xml = serializeCcda(buildCcda({ patient: { mrn: "M" } }));
    // Empty Medications/Results must NOT carry the entries-required (.1) template
    // with zero entries — that violates its "SHALL contain ≥1 entry" statement.
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.1" extension="2015-08-01"');
    expect(xml).not.toContain("2.16.840.1.113883.10.20.22.2.1.1");
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.3" extension="2015-08-01"');
    expect(xml).not.toContain("2.16.840.1.113883.10.20.22.2.3.1");
  });

  it("populated sections declare the entries-required templateId", () => {
    const xml = serializeCcda(
      buildCcda({
        patient: { mrn: "M" },
        problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
      }),
    );
    expect(xml).toContain("2.16.840.1.113883.10.20.22.2.5.1");
  });
});

describe("buildCcda — defaults, escaping, and input validation", () => {
  it("emits nullFlavor for omitted demographics and no MRN", () => {
    const doc = buildCcda({ patient: {} });
    expect(doc.warnings).toEqual([]);
    expect(doc.getMrn()).toBeUndefined();
    const patient = doc.getPatient();
    expect(patient?.genderCode?.nullFlavor).toBe("UNK");
    expect(patient?.birthTime?.nullFlavor).toBe("UNK");
  });

  it("XML-escapes free text so a hostile family name round-trips intact", () => {
    const doc = buildCcda({ patient: { mrn: "M", given: ["A&B"], family: "O'<Reilly>" } });
    expect(doc.warnings).toEqual([]);
    expect(doc.getPatient()?.name?.family).toBe("O'<Reilly>");
    expect(doc.getPatient()?.name?.given).toEqual(["A&B"]);
  });

  it("escapes a display label with markup in it and preserves the code", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      problems: [
        { problem: { code: "59621000", displayName: "Hypertension <primary> & essential" } },
      ],
    });
    expect(doc.getProblems()[0]?.problems[0]?.narrative).toBe("Hypertension <primary> & essential");
  });

  it("rejects an allergy that is neither coded nor a No-Known-Allergies assertion", () => {
    expect(() => buildCcda({ patient: { mrn: "M" }, allergies: [{}] })).toThrow(TypeError);
  });

  it("rejects an unsupported document type", () => {
    // @ts-expect-error — documentType is typed to "ccd"; exercise the runtime guard.
    expect(() => buildCcda({ documentType: "dischargeSummary", patient: { mrn: "M" } })).toThrow(
      TypeError,
    );
  });
});
