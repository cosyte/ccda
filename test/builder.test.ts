/**
 * Tests for the `buildCcda` document builder (CCDA-P7). The builder emits a
 * spec-clean C-CDA R2.1 CCD through the *same DOM the parser reads*, so the
 * central guarantees are:
 *
 *   - **round-trip fidelity** — a document `buildCcda` emits parses back to the
 *     same structured content across every populated section (Problems,
 *     Allergies, Medications, Results, Vital Signs), and serialization is a
 *     fixed point;
 *   - **spec-clean emit** — a clean build produces zero warnings (correct
 *     templateIds, LOINC section codes, RxNorm/LOINC/UCUM coding, structured +
 *     narrative agreement, empty sections as `nullFlavor="NI"`); and
 *   - **the safety-critical fail-safes** — "No Known Allergies" is a negation
 *     never collapsed into an unknown, and a missing dose/route or a bad UCUM
 *     unit is surfaced, never silently defaulted to a confident-wrong value.
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
  medications: [
    {
      drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" },
      frequency: { value: 24, unit: "h" },
      duration: { low: "20210101", high: "20211231" },
    },
    {
      drug: { code: "860975", displayName: "Metformin 500 MG Oral Tablet" },
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" },
      status: "resolved",
    },
  ],
  results: [
    {
      code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
      results: [
        {
          test: { code: "2345-7", displayName: "Glucose" },
          quantity: { value: 95, unit: "mg/dL" },
          referenceRange: {
            low: { value: 70, unit: "mg/dL" },
            high: { value: 100, unit: "mg/dL" },
          },
          interpretation: { code: "N", displayName: "Normal" },
          effectiveTime: "20240102",
        },
        {
          test: { code: "2951-2", displayName: "Sodium" },
          quantity: { value: 140, unit: "mmol/L" },
        },
      ],
    },
  ],
  vitalSigns: [
    {
      vitals: [
        {
          code: { code: "8480-6", displayName: "Systolic blood pressure" },
          quantity: { value: 120, unit: "mm[Hg]" },
          effectiveTime: "20240102",
        },
        {
          code: { code: "8462-4", displayName: "Diastolic blood pressure" },
          quantity: { value: 80, unit: "mm[Hg]" },
        },
      ],
    },
  ],
  immunizations: [
    {
      vaccine: { code: "140", displayName: "Influenza, seasonal, injectable" },
      dose: { value: 0.5, unit: "mL" },
      route: { code: "C28161", displayName: "Intramuscular" },
      effectiveTime: "20240101",
    },
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

describe("buildCcda — medications round-trip", () => {
  it("re-parses the RxNorm drug, dose, route, frequency, and duration", () => {
    const [lisinopril] = buildCcda(RICH_INIT).getMedications();
    expect(lisinopril?.drug?.code).toBe("314076");
    expect(lisinopril?.drug?.codeSystem).toBe("2.16.840.1.113883.6.88"); // RxNorm
    expect(lisinopril?.dose?.value).toBe(1);
    expect(lisinopril?.dose?.unit).toBe("{tablet}");
    expect(lisinopril?.route?.code).toBe("C38288");
    expect(lisinopril?.route?.codeSystem).toBe("2.16.840.1.113883.3.26.1.1"); // NCI Thesaurus
    expect(lisinopril?.frequency?.period?.value).toBe(24);
    expect(lisinopril?.frequency?.period?.unit).toBe("h");
    expect(lisinopril?.duration?.low?.raw).toBe("20210101");
    expect(lisinopril?.duration?.high?.raw).toBe("20211231");
    expect(lisinopril?.narrative).toBe("Lisinopril 10 MG Oral Tablet");
  });

  it("emits the Medications section with entries-required templateId + LOINC", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.findSection("medications")?.code?.code).toBe("10160-0");
    const xml = serializeCcda(doc);
    expect(xml).toContain("2.16.840.1.113883.10.20.22.2.1.1");
  });

  it("emits duration and frequency as distinct effectiveTime siblings (no unresolved timing)", () => {
    const med = buildCcda(RICH_INIT).getMedications()[0];
    // Both axes recovered separately ⇒ the parser never flagged them ambiguous.
    expect(med?.duration).toBeDefined();
    expect(med?.frequency).toBeDefined();
    expect(buildCcda(RICH_INIT).warnings).toEqual([]);
  });

  it("does NOT default a missing dose/route — it flags them, never invents a value", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      medications: [{ drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" } }],
    });
    const codes = doc.warnings.map((w) => w.code).sort();
    expect(codes).toContain("MISSING_DOSE_QUANTITY");
    expect(codes).toContain("MISSING_ROUTE_CODE");
    const med = doc.getMedications()[0];
    expect(med?.dose).toBeUndefined();
    expect(med?.route).toBeUndefined();
    expect(med?.drug?.code).toBe("314076");
  });
});

describe("buildCcda — results round-trip", () => {
  it("re-parses the panel and its member observations with values intact", () => {
    const [panel] = buildCcda(RICH_INIT).getResults();
    expect(panel?.code?.code).toBe("24323-8");
    expect(panel?.results).toHaveLength(2);
    const glucose = panel?.results[0];
    expect(glucose?.code?.code).toBe("2345-7");
    expect(glucose?.value?.kind).toBe("physicalQuantity");
    if (glucose?.value?.kind === "physicalQuantity") {
      expect(glucose.value.quantity.value).toBe(95);
      expect(glucose.value.quantity.unit).toBe("mg/dL");
    }
    expect(glucose?.referenceRange?.low?.value).toBe(70);
    expect(glucose?.referenceRange?.high?.value).toBe(100);
    expect(glucose?.interpretation?.code).toBe("N");
  });

  it("keeps a valid UCUM unit clean (no NON_UCUM_UNIT warning)", () => {
    expect(buildCcda(RICH_INIT).warnings).toEqual([]);
  });

  it("supports a coded and a string result value form", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      results: [
        {
          code: { code: "600-7", displayName: "Culture" },
          results: [
            {
              test: { code: "630-4", displayName: "Bacteria identified" },
              codedValue: { code: "3092008", displayName: "Staphylococcus aureus" },
            },
            {
              test: { code: "664-3", displayName: "Specimen description" },
              stringValue: "Clear, straw-colored",
            },
          ],
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const [coded, str] = doc.getResults()[0]?.results ?? [];
    expect(coded?.value?.kind).toBe("coded");
    if (coded?.value?.kind === "coded") expect(coded.value.code.code).toBe("3092008");
    expect(str?.value?.kind).toBe("string");
    if (str?.value?.kind === "string") expect(str.value.value).toBe("Clear, straw-colored");
  });

  it("rejects a result that does not carry exactly one value form", () => {
    expect(() =>
      buildCcda({
        patient: { mrn: "M" },
        results: [
          {
            code: { code: "P", displayName: "Panel" },
            results: [{ test: { code: "T", displayName: "Test" } }],
          },
        ],
      }),
    ).toThrow(TypeError);
    expect(() =>
      buildCcda({
        patient: { mrn: "M" },
        results: [
          {
            code: { code: "P", displayName: "Panel" },
            results: [
              {
                test: { code: "T", displayName: "Test" },
                quantity: { value: 1, unit: "mg/dL" },
                stringValue: "also this",
              },
            ],
          },
        ],
      }),
    ).toThrow(TypeError);
  });
});

describe("buildCcda — vital signs round-trip", () => {
  it("re-parses the vital signs cluster with LOINC + UCUM readings", () => {
    const [cluster] = buildCcda(RICH_INIT).getVitals();
    expect(cluster?.vitals).toHaveLength(2);
    const systolic = cluster?.vitals[0];
    expect(systolic?.code?.code).toBe("8480-6");
    expect(systolic?.value?.kind).toBe("physicalQuantity");
    if (systolic?.value?.kind === "physicalQuantity") {
      expect(systolic.value.quantity.value).toBe(120);
      expect(systolic.value.quantity.unit).toBe("mm[Hg]");
    }
    expect(buildCcda(RICH_INIT).warnings).toEqual([]);
  });

  it("emits the Vital Signs section by LOINC 8716-3", () => {
    expect(buildCcda(RICH_INIT).findSection("vitalSigns")?.code?.code).toBe("8716-3");
  });

  it("flags a case-slipped (non-canonical) UCUM unit rather than trusting it", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      vitalSigns: [
        {
          vitals: [
            {
              code: { code: "29463-7", displayName: "Body weight" },
              quantity: { value: 70, unit: "Kg" },
            },
          ],
        },
      ],
    });
    // "Kg" is a case slip of "kg" — surfaced, never silently accepted.
    expect(doc.warnings.map((w) => w.code)).toContain("UCUM_CASE_SUSPECT");
  });
});

describe("buildCcda — immunizations round-trip", () => {
  it("re-parses the CVX vaccine, dose, route, and administration date", () => {
    const [flu] = buildCcda(RICH_INIT).getImmunizations();
    expect(flu?.vaccine?.code).toBe("140");
    expect(flu?.vaccine?.codeSystem).toBe("2.16.840.1.113883.12.292"); // CVX
    expect(flu?.dose?.value).toBe(0.5);
    expect(flu?.dose?.unit).toBe("mL");
    expect(flu?.route?.code).toBe("C28161");
    expect(flu?.route?.codeSystem).toBe("2.16.840.1.113883.3.26.1.1"); // NCI Thesaurus
    expect(flu?.effectiveTime?.value?.raw).toBe("20240101");
    expect(flu?.narrative).toBe("Influenza, seasonal, injectable");
    // An administered shot carries no negationInd, so `refused` is absent (not false).
    expect(flu?.refused).toBeUndefined();
  });

  it("emits the Immunizations section with entries-required templateId + LOINC", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.findSection("immunizations")?.code?.code).toBe("11369-6");
    const xml = serializeCcda(doc);
    expect(xml).toContain("2.16.840.1.113883.10.20.22.2.2.1");
    expect(xml).toContain("2.16.840.1.113883.10.20.22.4.52"); // Immunization Activity
    expect(xml).toContain("2.16.840.1.113883.10.20.22.4.54"); // Med Information
  });

  it("keeps a clean administered immunization warning-free", () => {
    expect(buildCcda(RICH_INIT).warnings).toEqual([]);
  });

  it("emits a refused shot as a negation and flags it, never a nullFlavor unknown", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      immunizations: [
        { vaccine: { code: "140", displayName: "Influenza, seasonal, injectable" }, refused: true },
      ],
    });
    const shot = doc.getImmunizations()[0];
    expect(shot?.refused).toBe(true);
    expect(shot?.nullFlavor).toBeUndefined();
    // The refusal is clinically load-bearing — surfaced, never silently dropped.
    expect(doc.warnings.map((w) => w.code)).toContain("IMMUNIZATION_REFUSED");
  });

  it("does NOT emit an Immunizations section when none are supplied", () => {
    const xml = serializeCcda(buildCcda({ patient: { mrn: "M" } }));
    // Immunizations is not a CCD SHALL section — an empty one is not fabricated.
    expect(xml).not.toContain('code="11369-6"');
    expect(buildCcda({ patient: { mrn: "M" } }).findSection("immunizations")).toBeUndefined();
  });

  it("fills the SHALL administration effectiveTime with nullFlavor when omitted, read back as absent", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      immunizations: [{ vaccine: { code: "140", displayName: "Influenza, seasonal, injectable" } }],
    });
    // A clean administered shot with no date is warning-free (dose/route optional here).
    expect(doc.warnings).toEqual([]);
    const shot = doc.getImmunizations()[0];
    expect(shot?.effectiveTime?.nullFlavor).toBe("UNK");
    expect(shot?.effectiveTime?.value?.date).toBeUndefined();
    expect(serializeCcda(doc)).toContain('<effectiveTime nullFlavor="UNK"');
  });

  it("is a serialization fixed point with an immunization present", () => {
    const xml = serializeCcda(buildCcda(RICH_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
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

describe("buildCcda — SHALL effectiveTime conformance (all sections)", () => {
  /** A populated build that supplies NO times anywhere — every SHALL effectiveTime
   * slot must therefore be filled with nullFlavor="UNK", and the build must stay
   * warning-free. */
  const NO_TIMES: BuildCcdaInit = {
    patient: { mrn: "M" },
    problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
    allergies: [{ allergen: { code: "2670", displayName: "Codeine" } }],
    medications: [
      {
        drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
        dose: { value: 1, unit: "{tablet}" },
        route: { code: "C38288", displayName: "Oral" },
      },
    ],
    results: [
      {
        code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
        results: [
          {
            test: { code: "2345-7", displayName: "Glucose" },
            quantity: { value: 95, unit: "mg/dL" },
          },
        ],
      },
    ],
    vitalSigns: [
      {
        vitals: [
          {
            code: { code: "8480-6", displayName: "Systolic blood pressure" },
            quantity: { value: 120, unit: "mm[Hg]" },
          },
        ],
      },
    ],
  };

  it("fills every SHALL effectiveTime slot with nullFlavor when no time is supplied, warning-free", () => {
    const doc = buildCcda(NO_TIMES);
    expect(doc.warnings).toEqual([]);
    // Serialized fixed point still holds with the nullFlavor slots present.
    const xml = serializeCcda(doc);
    expect(parseCcda(xml).toString()).toBe(xml);
  });

  it("emits the Problem Concern Act + Observation effectiveTime as nullFlavor low, never a date", () => {
    const concern = buildCcda(NO_TIMES).getProblems()[0];
    expect(concern?.effectiveTime?.low?.nullFlavor).toBe("UNK");
    expect(concern?.effectiveTime?.low?.date).toBeUndefined();
    const obs = concern?.problems[0];
    expect(obs?.effectiveTime?.low?.nullFlavor).toBe("UNK");
    expect(obs?.effectiveTime?.low?.date).toBeUndefined();
  });

  it("emits a resolved Problem Concern Act effectiveTime with a nullFlavor high (resolved, date unknown)", () => {
    const concern = buildCcda({
      patient: { mrn: "M" },
      problems: [
        {
          problem: { code: "59621000", displayName: "Essential hypertension" },
          status: "resolved",
        },
      ],
    }).getProblems()[0];
    expect(concern?.status).toBe("resolved");
    expect(concern?.effectiveTime?.high?.nullFlavor).toBe("UNK");
    expect(concern?.effectiveTime?.high?.date).toBeUndefined();
  });

  it("uses a supplied problem onset as the effectiveTime low (a real date), no invented high", () => {
    const concern = buildCcda({
      patient: { mrn: "M" },
      problems: [
        { problem: { code: "59621000", displayName: "Essential hypertension" }, onset: "20210101" },
      ],
    }).getProblems()[0];
    expect(concern?.effectiveTime?.low?.raw).toBe("20210101");
    expect(concern?.effectiveTime?.low?.date).toBeInstanceOf(Date);
    expect(concern?.effectiveTime?.high).toBeUndefined();
  });

  it("emits the Allergy Concern Act effectiveTime as a nullFlavor low, never a date", () => {
    const concern = buildCcda(NO_TIMES).getAllergies()[0];
    expect(concern?.effectiveTime?.low?.nullFlavor).toBe("UNK");
    expect(concern?.effectiveTime?.low?.date).toBeUndefined();
  });

  it("always emits the Medication Activity IVL_TS duration (nullFlavor low), no timing ambiguity", () => {
    const doc = buildCcda(NO_TIMES);
    expect(doc.warnings.map((w) => w.code)).not.toContain("MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED");
    const med = doc.getMedications()[0];
    expect(med?.duration?.low?.nullFlavor).toBe("UNK");
    expect(med?.duration?.low?.date).toBeUndefined();
    // The XML carries the SHALL IVL_TS effectiveTime.
    expect(serializeCcda(doc)).toContain('type="IVL_TS"');
  });

  it("still emits a supplied medication duration as real bounds", () => {
    const med = buildCcda(RICH_INIT).getMedications()[0];
    expect(med?.duration?.low?.raw).toBe("20210101");
    expect(med?.duration?.high?.raw).toBe("20211231");
  });

  it("emits the Result Observation effectiveTime as nullFlavor, read back as absent (no date)", () => {
    const result = buildCcda(NO_TIMES).getResults()[0]?.results[0];
    expect(result?.effectiveTime?.nullFlavor).toBe("UNK");
    expect(result?.effectiveTime?.value?.date).toBeUndefined();
    expect(result?.effectiveTime?.low).toBeUndefined();
  });

  it("still round-trips a supplied Result Observation effectiveTime as a real value", () => {
    const glucose = buildCcda(RICH_INIT).getResults()[0]?.results[0];
    expect(glucose?.effectiveTime?.value?.raw).toBe("20240102");
    expect(glucose?.effectiveTime?.value?.date).toBeInstanceOf(Date);
  });

  it("emits the Vital Sign Observation effectiveTime as nullFlavor, read back as absent (no date)", () => {
    const vital = buildCcda(NO_TIMES).getVitals()[0]?.vitals[0];
    expect(vital?.effectiveTime?.nullFlavor).toBe("UNK");
    expect(vital?.effectiveTime?.value?.date).toBeUndefined();
  });

  it("honors a supplied panel effectiveTime on the Result and Vital Signs organizers", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      results: [
        {
          code: { code: "24323-8", displayName: "CMP" },
          effectiveTime: "20240102",
          results: [
            {
              test: { code: "2345-7", displayName: "Glucose" },
              quantity: { value: 95, unit: "mg/dL" },
            },
          ],
        },
      ],
      vitalSigns: [
        {
          effectiveTime: "20240102",
          vitals: [
            {
              code: { code: "8480-6", displayName: "Systolic blood pressure" },
              quantity: { value: 120, unit: "mm[Hg]" },
            },
          ],
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    // Two supplied organizer times → two @value effectiveTimes on organizers.
    expect(
      (serializeCcda(doc).match(/<effectiveTime value="20240102"/g) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
