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

import {
  buildCcda,
  parseCcda,
  serializeCcda,
  type BuildCcdaInit,
  type BuildCcdaPlannedItem,
} from "../src/index.js";

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
  procedures: [
    {
      code: { code: "80146002", displayName: "Appendectomy" },
      disposition: "performed",
      effectiveTime: "20230615",
    },
    {
      kind: "act",
      code: { code: "34896006", displayName: "Wound dressing change" },
    },
  ],
  encounters: [
    {
      type: { code: "99213", displayName: "Office outpatient visit 15 minutes" },
      status: "completed",
      period: { low: "20230615", high: "20230615" },
    },
  ],
  smokingStatus: [
    {
      value: { code: "8517006", displayName: "Former smoker" },
      effectiveTime: "20240101",
    },
  ],
  functionalStatus: [
    {
      value: { code: "165245003", displayName: "Able to walk" },
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

describe("buildCcda — procedures round-trip", () => {
  it("re-parses an operative procedure with code, performed disposition, status, and time", () => {
    const [appendectomy] = buildCcda(RICH_INIT).getProcedures();
    expect(appendectomy?.kind).toBe("procedure");
    expect(appendectomy?.code?.code).toBe("80146002");
    expect(appendectomy?.code?.codeSystem).toBe("2.16.840.1.113883.6.96"); // SNOMED CT
    expect(appendectomy?.disposition).toBe("performed");
    expect(appendectomy?.moodCode).toBe("EVN");
    expect(appendectomy?.statusCode).toBe("completed");
    expect(appendectomy?.effectiveTime?.value?.raw).toBe("20230615");
    expect(appendectomy?.narrative).toBe("Appendectomy");
    expect(buildCcda(RICH_INIT).warnings).toEqual([]);
  });

  it("emits the Procedures section with the 2014-06-09 templateId + LOINC 47519-4", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.findSection("procedures")?.code?.code).toBe("47519-4");
    const xml = serializeCcda(doc);
    // Procedures Section (entries required) V2 carries the 2014-06-09 stamp.
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.7.1" extension="2014-06-09"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"');
  });

  it("emits the non-altering act variant (…22.4.12) as kind 'act'", () => {
    const proc = buildCcda(RICH_INIT).getProcedures()[1];
    expect(proc?.kind).toBe("act");
    expect(proc?.code?.code).toBe("34896006");
    expect(proc?.disposition).toBe("performed");
  });

  it("classifies a planned procedure (INT) as planned, never performed, with active status", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      procedures: [
        {
          code: { code: "73761001", displayName: "Colonoscopy" },
          disposition: "planned",
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const proc = doc.getProcedures()[0];
    expect(proc?.disposition).toBe("planned");
    expect(proc?.moodCode).toBe("INT");
    expect(proc?.statusCode).toBe("active");
  });

  it("round-trips the assessment observation variant with a coded value", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      procedures: [
        {
          kind: "observation",
          code: { code: "36228007", displayName: "Ophthalmic examination" },
          value: { code: "260388006", displayName: "Normal" },
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const proc = doc.getProcedures()[0];
    expect(proc?.kind).toBe("observation");
    expect(proc?.value?.kind).toBe("coded");
    if (proc?.value?.kind === "coded") expect(proc.value.code.code).toBe("260388006");
  });

  it("omits the SHOULD effectiveTime when none is supplied (never fabricated)", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      procedures: [{ code: { code: "80146002", displayName: "Appendectomy" } }],
    });
    expect(doc.warnings).toEqual([]);
    expect(doc.getProcedures()[0]?.effectiveTime).toBeUndefined();
  });

  it("does NOT emit a Procedures section when none are supplied", () => {
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("procedures")).toBeUndefined();
    expect(serializeCcda(doc)).not.toContain('code="47519-4"');
  });

  it("rejects an observation-variant procedure that omits its SHALL value", () => {
    // Procedure Activity Observation (…22.4.13) SHALL carry a value [1..1] — the
    // builder refuses to emit a non-conformant value-less observation.
    expect(() =>
      buildCcda({
        patient: { mrn: "M" },
        procedures: [
          {
            kind: "observation",
            code: { code: "36228007", displayName: "Ophthalmic examination" },
          },
        ],
      }),
    ).toThrow(TypeError);
  });
});

describe("buildCcda — encounters round-trip", () => {
  it("re-parses the Encounter Activity with type code, status, and visit period", () => {
    const [visit] = buildCcda(RICH_INIT).getEncounters();
    expect(visit?.code?.code).toBe("99213");
    expect(visit?.code?.codeSystem).toBe("2.16.840.1.113883.6.12"); // CPT
    expect(visit?.moodCode).toBe("EVN");
    expect(visit?.statusCode).toBe("completed");
    expect(visit?.effectiveTime?.low?.raw).toBe("20230615");
    expect(visit?.effectiveTime?.high?.raw).toBe("20230615");
    expect(visit?.narrative).toBe("Office outpatient visit 15 minutes");
    expect(buildCcda(RICH_INIT).warnings).toEqual([]);
  });

  it("emits the Encounters section with the 2015-08-01 templateId + LOINC 46240-8", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.findSection("encounters")?.code?.code).toBe("46240-8");
    const xml = serializeCcda(doc);
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.22.1" extension="2015-08-01"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.49" extension="2015-08-01"');
  });

  it("fills the SHALL effectiveTime with a nullFlavor low when no period is supplied, warning-free", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      encounters: [{ type: { code: "99213", displayName: "Office outpatient visit 15 minutes" } }],
    });
    expect(doc.warnings).toEqual([]);
    const enc = doc.getEncounters()[0];
    expect(enc?.effectiveTime?.low?.nullFlavor).toBe("UNK");
    expect(enc?.effectiveTime?.low?.date).toBeUndefined();
    expect(serializeCcda(doc)).toContain('<low nullFlavor="UNK"');
  });

  it("does NOT emit an Encounters section when none are supplied", () => {
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("encounters")).toBeUndefined();
    expect(serializeCcda(doc)).not.toContain('code="46240-8"');
  });

  it("is a serialization fixed point with procedures + encounters present", () => {
    const xml = serializeCcda(buildCcda(RICH_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });
});

describe("buildCcda — social history (smoking status) round-trip", () => {
  it("re-parses a known Smoking Status with its SNOMED value, recorded time, and no unknown flag", () => {
    const doc = buildCcda(RICH_INIT);
    const [status] = doc.getSmokingStatus();
    expect(status?.value?.code).toBe("8517006");
    expect(status?.value?.codeSystem).toBe("2.16.840.1.113883.6.96"); // SNOMED CT
    expect(status?.unknown).toBe(false);
    expect(status?.statusCode).toBe("completed");
    expect(status?.effectiveTime?.value?.raw).toBe("20240101");
    expect(status?.narrative).toBe("Former smoker");
    expect(doc.warnings).toEqual([]);
  });

  it("emits the Social History section with LOINC 29762-2 and the …4.78 observation (2014-06-09)", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.findSection("socialHistory")?.code?.code).toBe("29762-2");
    const xml = serializeCcda(doc);
    // Social History Section (V3) is 2015-08-01; it has no entries-required variant.
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.17" extension="2015-08-01"');
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.17.1"');
    // The Smoking Status — Meaningful Use observation carries the 2014-06-09 stamp
    // and the fixed LOINC "Tobacco smoking status" code.
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.78" extension="2014-06-09"');
    expect(xml).toContain('code="72166-2"');
  });

  it("emits an EXPLICIT nullFlavor=UNK value for an unrecorded status — never a fabricated reading", () => {
    const doc = buildCcda({ patient: { mrn: "M" }, smokingStatus: [{}] });
    const [status] = doc.getSmokingStatus();
    expect(status?.unknown).toBe(true);
    expect(status?.value?.nullFlavor).toBe("UNK");
    expect(status?.value?.code).toBeUndefined();
    // The explicit-unknown is surfaced, not silently dropped or read as "never smoker".
    expect(doc.warnings.map((w) => w.code)).toContain("SMOKING_STATUS_UNKNOWN");
    const xml = serializeCcda(doc);
    expect(xml).toContain('xsi:type="CD"');
    expect(xml).toContain('nullFlavor="UNK"');
  });

  it("fills the SHALL effectiveTime with nullFlavor=UNK when no recorded time is supplied", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      smokingStatus: [{ value: { code: "266919005", displayName: "Never smoked tobacco" } }],
    });
    // A recognized value-set code with no recorded time is still warning-free.
    expect(doc.warnings).toEqual([]);
    const [status] = doc.getSmokingStatus();
    expect(status?.value?.code).toBe("266919005");
    expect(status?.unknown).toBe(false);
    expect(status?.effectiveTime?.nullFlavor).toBe("UNK");
  });

  it("does NOT emit a Social History section when none is supplied", () => {
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("socialHistory")).toBeUndefined();
    expect(doc.getSmokingStatus()).toEqual([]);
    expect(serializeCcda(doc)).not.toContain('code="29762-2"');
  });

  it("does not flag the smoking-status entry as misplaced (it homes to Social History)", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain("SECTION_PLACEMENT_SUSPECT");
  });

  it("is a serialization fixed point with a Social History section present", () => {
    const xml = serializeCcda(buildCcda(RICH_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });
});

describe("buildCcda — functional status round-trip", () => {
  it("re-parses a known Functional Status finding tagged domain=functional, warning-free", () => {
    const doc = buildCcda(RICH_INIT);
    const findings = doc.getFunctionalStatus();
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.domain).toBe("functional");
    // The specific finding lives in the coded value (SNOMED CT), not the fixed code.
    expect(finding?.value?.kind).toBe("coded");
    expect(finding?.value?.kind === "coded" ? finding.value.code.code : undefined).toBe(
      "165245003",
    );
    expect(finding?.value?.kind === "coded" ? finding.value.code.codeSystem : undefined).toBe(
      "2.16.840.1.113883.6.96",
    );
    expect(finding?.code?.code).toBe("54522-8");
    expect(finding?.assessmentScale).toBeUndefined();
    expect(finding?.statusCode).toBe("completed");
    expect(finding?.effectiveTime?.value?.raw).toBe("20240101");
    expect(doc.warnings).toEqual([]);
  });

  it("emits the Functional Status section (LOINC 47420-5, …4.67 obs, 2014-06-09, fixed code 54522-8)", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.findSection("functionalStatus")?.code?.code).toBe("47420-5");
    const xml = serializeCcda(doc);
    // The Functional Status Section (V2) carries the 2014-06-09 stamp and has no
    // entries-required variant (…2.14.1).
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.14" extension="2014-06-09"');
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.14.1"');
    // The Functional Status Observation carries the 2014-06-09 stamp and the
    // template-fixed LOINC "Functional status" code (54522-8).
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.67" extension="2014-06-09"');
    expect(xml).toContain('code="54522-8"');
  });

  it("emits an EXPLICIT nullFlavor=UNK value for an unrecorded finding — never a fabricated one", () => {
    const doc = buildCcda({ patient: { mrn: "M" }, functionalStatus: [{}] });
    expect(doc.warnings).toEqual([]);
    const [finding] = doc.getFunctionalStatus();
    // The SHALL value [1..1] is satisfied by an explicit unknown, not an invented finding.
    expect(finding?.value?.kind).toBe("coded");
    expect(finding?.value?.kind === "coded" ? finding.value.code.nullFlavor : undefined).toBe(
      "UNK",
    );
    expect(finding?.value?.kind === "coded" ? finding.value.code.code : undefined).toBeUndefined();
    const xml = serializeCcda(doc);
    expect(xml).toContain('xsi:type="CD"');
    expect(xml).toContain('nullFlavor="UNK"');
  });

  it("fills the SHALL effectiveTime with nullFlavor=UNK when no assessed time is supplied", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      functionalStatus: [{ value: { code: "129019007", displayName: "Self-care" } }],
    });
    expect(doc.warnings).toEqual([]);
    const [finding] = doc.getFunctionalStatus();
    expect(finding?.value?.kind === "coded" ? finding.value.code.code : undefined).toBe(
      "129019007",
    );
    expect(finding?.effectiveTime?.nullFlavor).toBe("UNK");
  });

  it("never conflates functional findings with mental status (mental stays empty)", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.getFunctionalStatus()).toHaveLength(1);
    expect(doc.getMentalStatus()).toEqual([]);
  });

  it("does NOT emit a Functional Status section when none is supplied", () => {
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("functionalStatus")).toBeUndefined();
    expect(doc.getFunctionalStatus()).toEqual([]);
    expect(serializeCcda(doc)).not.toContain('code="47420-5"');
  });

  it("does not flag the functional-status entry as misplaced (it homes to Functional Status)", () => {
    const doc = buildCcda(RICH_INIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain("SECTION_PLACEMENT_SUSPECT");
  });

  it("is a serialization fixed point with a Functional Status section present", () => {
    const xml = serializeCcda(buildCcda(RICH_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });
});

describe("buildCcda — mental status round-trip", () => {
  /** A build carrying BOTH a functional and a mental finding, to prove the two
   * domains are kept separate (they key off distinct observation template roots). */
  const MENTAL_INIT: BuildCcdaInit = {
    patient: { mrn: "M" },
    functionalStatus: [{ value: { code: "165245003", displayName: "Able to walk" } }],
    mentalStatus: [
      {
        value: { code: "386807006", displayName: "Memory impairment" },
        effectiveTime: "20240101",
      },
    ],
  };

  it("re-parses a known Mental Status finding tagged domain=mental, warning-free", () => {
    const doc = buildCcda(MENTAL_INIT);
    const findings = doc.getMentalStatus();
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.domain).toBe("mental");
    // The specific finding lives in the coded value (SNOMED CT), not the fixed code.
    expect(finding?.value?.kind).toBe("coded");
    expect(finding?.value?.kind === "coded" ? finding.value.code.code : undefined).toBe(
      "386807006",
    );
    expect(finding?.value?.kind === "coded" ? finding.value.code.codeSystem : undefined).toBe(
      "2.16.840.1.113883.6.96",
    );
    // The template-fixed observation code is SNOMED CT "Cognitive function finding".
    expect(finding?.code?.code).toBe("373930000");
    expect(finding?.code?.codeSystem).toBe("2.16.840.1.113883.6.96");
    expect(finding?.assessmentScale).toBeUndefined();
    expect(finding?.statusCode).toBe("completed");
    expect(finding?.effectiveTime?.value?.raw).toBe("20240101");
    expect(doc.warnings).toEqual([]);
  });

  it("emits the Mental Status section (LOINC 10190-7, …4.74 obs, 2015-08-01, fixed code 373930000)", () => {
    const doc = buildCcda(MENTAL_INIT);
    expect(doc.findSection("mentalStatus")?.code?.code).toBe("10190-7");
    const xml = serializeCcda(doc);
    // The Mental Status Section (V2) carries the R2.1 2015-08-01 stamp and has no
    // entries-required variant (…2.56.1).
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.56" extension="2015-08-01"');
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.56.1"');
    // The Mental Status Observation carries the 2015-08-01 stamp and the R2.1
    // template-fixed SNOMED CT "Cognitive function finding" code (373930000).
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.74" extension="2015-08-01"');
    expect(xml).toContain('code="373930000"');
  });

  it("emits an EXPLICIT nullFlavor=UNK value for an unrecorded finding — never a fabricated one", () => {
    const doc = buildCcda({ patient: { mrn: "M" }, mentalStatus: [{}] });
    expect(doc.warnings).toEqual([]);
    const [finding] = doc.getMentalStatus();
    // The SHALL value [1..1] is satisfied by an explicit unknown, not an invented finding.
    expect(finding?.value?.kind).toBe("coded");
    expect(finding?.value?.kind === "coded" ? finding.value.code.nullFlavor : undefined).toBe(
      "UNK",
    );
    expect(finding?.value?.kind === "coded" ? finding.value.code.code : undefined).toBeUndefined();
    const xml = serializeCcda(doc);
    expect(xml).toContain('xsi:type="CD"');
    expect(xml).toContain('nullFlavor="UNK"');
  });

  it("fills the SHALL effectiveTime with nullFlavor=UNK when no assessed time is supplied", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      mentalStatus: [{ value: { code: "281900007", displayName: "No abnormality detected" } }],
    });
    expect(doc.warnings).toEqual([]);
    const [finding] = doc.getMentalStatus();
    expect(finding?.value?.kind === "coded" ? finding.value.code.code : undefined).toBe(
      "281900007",
    );
    expect(finding?.effectiveTime?.nullFlavor).toBe("UNK");
  });

  it("never conflates mental findings with functional status (each domain stays distinct)", () => {
    const doc = buildCcda(MENTAL_INIT);
    const mental = doc.getMentalStatus();
    const functional = doc.getFunctionalStatus();
    expect(mental).toHaveLength(1);
    expect(functional).toHaveLength(1);
    expect(mental[0]?.domain).toBe("mental");
    expect(functional[0]?.domain).toBe("functional");
    // The mental finding is memory impairment; the functional finding is able to walk.
    expect(mental[0]?.value?.kind === "coded" ? mental[0].value.code.code : undefined).toBe(
      "386807006",
    );
    expect(functional[0]?.value?.kind === "coded" ? functional[0].value.code.code : undefined).toBe(
      "165245003",
    );
  });

  it("does NOT emit a Mental Status section when none is supplied", () => {
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("mentalStatus")).toBeUndefined();
    expect(doc.getMentalStatus()).toEqual([]);
    expect(serializeCcda(doc)).not.toContain('code="10190-7"');
  });

  it("does not flag the mental-status entry as misplaced (it homes to Mental Status)", () => {
    const doc = buildCcda(MENTAL_INIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain("SECTION_PLACEMENT_SUSPECT");
  });

  it("is a serialization fixed point with a Mental Status section present", () => {
    const xml = serializeCcda(buildCcda(MENTAL_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });
});

describe("buildCcda — past medical history round-trip", () => {
  /** A build carrying BOTH an active problem concern and a historical (past) one,
   * to prove the two never conflate — the past problem is a bare observation
   * (…22.4.4) routed to getPastMedicalHistory, the active one a concern act
   * (…22.4.3) routed to getProblems. */
  const PMH_INIT: BuildCcdaInit = {
    patient: { mrn: "M" },
    problems: [
      { problem: { code: "59621000", displayName: "Essential hypertension" }, status: "active" },
    ],
    pastMedicalHistory: [
      {
        problem: { code: "74400008", displayName: "Appendicitis" },
        status: "resolved",
        onset: "20050101",
      },
    ],
  };

  it("re-parses a known past problem via getPastMedicalHistory, warning-free", () => {
    const doc = buildCcda(PMH_INIT);
    const history = doc.getPastMedicalHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.value?.code).toBe("74400008");
    expect(history[0]?.value?.codeSystem).toBe("2.16.840.1.113883.6.96");
    // The onset survives as the observation effectiveTime low; the resolved-but-
    // unknown resolution is a nullFlavor high, never a fabricated date.
    expect(history[0]?.effectiveTime?.low?.raw).toBe("20050101");
    expect(history[0]?.effectiveTime?.high?.nullFlavor).toBe("UNK");
    expect(doc.warnings).toEqual([]);
  });

  it("never double-counts a past problem as an active problem concern", () => {
    const doc = buildCcda(PMH_INIT);
    // The active concern is the ONLY thing getProblems returns; the past illness
    // is a bare observation and stays in getPastMedicalHistory.
    const problems = doc.getProblems();
    expect(problems).toHaveLength(1);
    expect(problems[0]?.problems[0]?.value?.code).toBe("59621000");
    expect(doc.getPastMedicalHistory()).toHaveLength(1);
    expect(doc.getPastMedicalHistory()[0]?.value?.code).toBe("74400008");
  });

  it("emits the Past Medical History section (LOINC 11348-0, bare …4.4 obs, 2015-08-01, no concern act)", () => {
    const doc = buildCcda(PMH_INIT);
    expect(doc.findSection("pastMedicalHistory")?.code?.code).toBe("11348-0");
    const xml = serializeCcda(doc);
    // The Past Medical History Section (V3) carries the R2.1 2015-08-01 stamp and
    // has no entries-required variant (…2.20.1).
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.20" extension="2015-08-01"');
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.20.1"');
    // The bare Problem Observation carries the 2015-08-01 stamp and the fixed
    // SNOMED CT "Problem" (55607006) code.
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"');
    expect(xml).toContain('code="55607006"');
  });

  it("emits nullFlavor=UNK onset when no onset is supplied — never a fabricated date", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      pastMedicalHistory: [{ problem: { code: "74400008", displayName: "Appendicitis" } }],
    });
    expect(doc.warnings).toEqual([]);
    const [past] = doc.getPastMedicalHistory();
    expect(past?.value?.code).toBe("74400008");
    expect(past?.effectiveTime?.low?.nullFlavor).toBe("UNK");
    const xml = serializeCcda(doc);
    expect(xml).toContain('nullFlavor="UNK"');
  });

  it("does NOT emit a Past Medical History section when none is supplied", () => {
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("pastMedicalHistory")).toBeUndefined();
    expect(doc.getPastMedicalHistory()).toEqual([]);
    expect(serializeCcda(doc)).not.toContain('code="11348-0"');
  });

  it("does not flag the bare past-problem observation as misplaced", () => {
    const doc = buildCcda(PMH_INIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain("SECTION_PLACEMENT_SUSPECT");
  });

  it("is a serialization fixed point with a Past Medical History section present", () => {
    const xml = serializeCcda(buildCcda(PMH_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });
});

describe("buildCcda — plan of treatment round-trip", () => {
  /** A build carrying all six planned-entry variants AND a *performed* procedure,
   * to prove the planned items are never conflated with the performed acts — each
   * reads back with disposition "planned", statusCode "active", and a planned mood,
   * while the performed procedure stays disposition "performed". */
  const PLAN_INIT: BuildCcdaInit = {
    patient: { mrn: "M" },
    procedures: [
      { code: { code: "80146002", displayName: "Appendectomy" }, disposition: "performed" },
    ],
    planOfTreatment: [
      {
        kind: "observation",
        code: { code: "58410-2", displayName: "CBC panel" },
        mood: "RQO",
        effectiveTime: "20240801",
      },
      { kind: "procedure", code: { code: "73761001", displayName: "Colonoscopy" } },
      {
        kind: "medicationActivity",
        code: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
        mood: "RQO",
      },
      {
        kind: "encounter",
        code: { code: "99213", displayName: "Office outpatient visit 15 minutes" },
        mood: "APT",
      },
      { kind: "act", code: { code: "409073007", displayName: "Education" } },
      { kind: "supply", code: { code: "58938008", displayName: "Wheelchair" } },
    ],
  };

  it("re-parses one planned item per variant, each planned + active, warning-free", () => {
    const doc = buildCcda(PLAN_INIT);
    const planned = doc.getPlannedItems();
    expect(planned.map((p) => p.kind)).toEqual([
      "observation",
      "procedure",
      "medicationActivity",
      "encounter",
      "act",
      "supply",
    ]);
    for (const item of planned) {
      // Every plan item is future/ordered — never performed — and SHALL statusCode "active".
      expect(item.disposition).toBe("planned");
      expect(item.statusCode).toBe("active");
    }
    expect(doc.warnings).toEqual([]);
  });

  it("preserves each planned mood verbatim (RQO / INT / APT), never EVN", () => {
    const byKind = new Map(
      buildCcda(PLAN_INIT)
        .getPlannedItems()
        .map((p) => [p.kind, p.moodCode]),
    );
    expect(byKind.get("observation")).toBe("RQO");
    expect(byKind.get("medicationActivity")).toBe("RQO");
    expect(byKind.get("encounter")).toBe("APT");
    // Omitted mood defaults to INT (a planned mood) — the performed EVN is not emitted.
    expect(byKind.get("procedure")).toBe("INT");
    expect(byKind.get("act")).toBe("INT");
    expect(byKind.get("supply")).toBe("INT");
    for (const mood of byKind.values()) expect(mood).not.toBe("EVN");
  });

  it("reads the planned observation's ordered LOINC code and its point effectiveTime", () => {
    const obs = buildCcda(PLAN_INIT)
      .getPlannedItems()
      .find((p) => p.kind === "observation");
    expect(obs?.code?.code).toBe("58410-2");
    expect(obs?.code?.codeSystem).toBe("2.16.840.1.113883.6.1");
    expect(obs?.effectiveTime?.value?.raw).toBe("20240801");
  });

  it("reads the planned medication's drug from the consumable (no direct code)", () => {
    const med = buildCcda(PLAN_INIT)
      .getPlannedItems()
      .find((p) => p.kind === "medicationActivity");
    expect(med?.code?.code).toBe("314076");
    expect(med?.code?.codeSystem).toBe("2.16.840.1.113883.6.88");
  });

  it("round-trips a planned observation's expected coded result value", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      planOfTreatment: [
        {
          kind: "observation",
          code: { code: "58410-2", displayName: "CBC panel" },
          value: { code: "281900007", displayName: "No abnormality detected" },
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const [obs] = doc.getPlannedItems();
    expect(obs?.value?.kind).toBe("coded");
    expect(obs?.value?.kind === "coded" ? obs.value.code.code : undefined).toBe("281900007");
  });

  it("emits the Plan of Treatment section (LOINC 18776-5, 2014-06-09, six planned templates, no entries-required variant)", () => {
    const doc = buildCcda(PLAN_INIT);
    expect(doc.findSection("planOfTreatment")?.code?.code).toBe("18776-5");
    const xml = serializeCcda(doc);
    // The Plan of Treatment Section (V2) carries the R2.1 2014-06-09 stamp and has
    // no entries-required variant (…2.10.1).
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.10" extension="2014-06-09"');
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.10.1"');
    // Each planned-entry template carries the 2014-06-09 stamp.
    for (const root of [
      "2.16.840.1.113883.10.20.22.4.39",
      "2.16.840.1.113883.10.20.22.4.40",
      "2.16.840.1.113883.10.20.22.4.41",
      "2.16.840.1.113883.10.20.22.4.42",
      "2.16.840.1.113883.10.20.22.4.43",
      "2.16.840.1.113883.10.20.22.4.44",
    ]) {
      expect(xml).toContain(`root="${root}" extension="2014-06-09"`);
    }
  });

  it("never conflates planned items with performed procedures", () => {
    const doc = buildCcda(PLAN_INIT);
    // The performed procedure stays in getProcedures with disposition "performed";
    // it is never returned as a planned item.
    const procedures = doc.getProcedures();
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.disposition).toBe("performed");
    // The planned colonoscopy stays in getPlannedItems, planned — never a performed procedure.
    const plannedProc = doc.getPlannedItems().find((p) => p.kind === "procedure");
    expect(plannedProc?.code?.code).toBe("73761001");
    expect(plannedProc?.disposition).toBe("planned");
    expect(procedures.some((p) => p.code?.code === "73761001")).toBe(false);
  });

  it("does NOT emit a Plan of Treatment section when none is supplied", () => {
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("planOfTreatment")).toBeUndefined();
    expect(doc.getPlannedItems()).toEqual([]);
    expect(serializeCcda(doc)).not.toContain('code="18776-5"');
  });

  it("does not flag the planned entries as misplaced (they home to Plan of Treatment)", () => {
    const doc = buildCcda(PLAN_INIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain("SECTION_PLACEMENT_SUSPECT");
  });

  it("forbids appointment moods on medication/supply/observation at the type level", () => {
    // APT/ARQ are outside the base CDA mood domains for substanceAdministration
    // (x_DocumentSubstanceMood), supply (same), and observation
    // (x_ActMoodDocumentObservation) — so the type must make them unrepresentable
    // on those kinds. A schema-invalid @moodCode can never be emitted "by
    // construction", not merely discouraged.
    // @ts-expect-error — APT is not in a medication's mood domain.
    const badMed: BuildCcdaPlannedItem = {
      kind: "medicationActivity",
      code: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
      mood: "APT",
    };
    void badMed;
    // @ts-expect-error — ARQ is not in an observation's mood domain.
    const badObs: BuildCcdaPlannedItem = {
      kind: "observation",
      code: { code: "58410-2", displayName: "CBC panel" },
      mood: "ARQ",
    };
    void badObs;
    // The SAME appointment mood IS valid on an encounter — this must compile.
    const okEnc: BuildCcdaPlannedItem = {
      kind: "encounter",
      code: { code: "99213", displayName: "Office outpatient visit 15 minutes" },
      mood: "APT",
    };
    const enc = buildCcda({ patient: { mrn: "M" }, planOfTreatment: [okEnc] });
    expect(enc.warnings).toEqual([]);
    expect(enc.getPlannedItems()[0]?.moodCode).toBe("APT");
  });

  it("is a serialization fixed point with a Plan of Treatment section present", () => {
    const xml = serializeCcda(buildCcda(PLAN_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });
});

describe("buildCcda — family history round-trip", () => {
  /** A build carrying two relatives: a deceased father (male, born 1950) whose
   * myocardial infarction (age 57) was his cause of death, and a mother with a
   * living condition — proving the organizer groups conditions by relative and
   * carries the age/death sub-observations. */
  const FHX_INIT: BuildCcdaInit = {
    patient: { mrn: "M" },
    familyHistory: [
      {
        relative: {
          relationship: { code: "9947008", displayName: "Father" },
          gender: "M",
          birthTime: "19500101",
          deceased: true,
        },
        observations: [
          {
            condition: { code: "22298006", displayName: "Myocardial infarction" },
            ageAtOnset: 57,
            causeOfDeath: true,
            effectiveTime: "20070101",
          },
        ],
      },
      {
        relative: { relationship: { code: "72705000", displayName: "Mother" }, gender: "F" },
        observations: [{ condition: { code: "73211009", displayName: "Diabetes mellitus" } }],
      },
    ],
  };

  it("re-parses both relatives and their conditions via getFamilyHistory, warning-free", () => {
    const doc = buildCcda(FHX_INIT);
    const fh = doc.getFamilyHistory();
    expect(fh).toHaveLength(2);
    // Father — relationship defaults to SNOMED CT, demographics preserved.
    expect(fh[0]?.relative.relationship?.code).toBe("9947008");
    expect(fh[0]?.relative.relationship?.codeSystem).toBe("2.16.840.1.113883.6.96");
    expect(fh[0]?.relative.gender?.code).toBe("M");
    expect(fh[0]?.relative.birthTime?.raw).toBe("19500101");
    expect(fh[0]?.relative.deceased).toBe(true);
    // His condition, age at onset, cause-of-death flag, and condition time.
    const cond = fh[0]?.observations[0];
    expect(cond?.condition?.code).toBe("22298006");
    expect(cond?.ageAtOnset?.value).toBe(57);
    expect(cond?.ageAtOnset?.unit).toBe("a");
    expect(cond?.causeOfDeath).toBe(true);
    expect(cond?.effectiveTime?.low?.raw).toBe("20070101");
    // Mother — a distinct relative with her own condition.
    expect(fh[1]?.relative.relationship?.code).toBe("72705000");
    expect(fh[1]?.observations[0]?.condition?.code).toBe("73211009");
    expect(fh[1]?.observations[0]?.causeOfDeath).toBeUndefined();
    expect(doc.warnings).toEqual([]);
  });

  it("emits the Family History section (LOINC 10157-6, organizer …4.45, obs …4.46, 2015-08-01, no entries-required variant)", () => {
    const doc = buildCcda(FHX_INIT);
    expect(doc.findSection("familyHistory")?.code?.code).toBe("10157-6");
    const xml = serializeCcda(doc);
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.15" extension="2015-08-01"');
    // Family History Section (V3) has no entries-required variant (…2.15.1).
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.15.1"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.45" extension="2015-08-01"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.46" extension="2015-08-01"');
    // Age Observation (…4.31) and Family History Death Observation (…4.47) nested.
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.31"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.47"');
    // The Age Observation rides an inverted SUBJ relationship (SHALL inversionInd="true"),
    // the age being the subject of the condition; the Death Observation is a CAUS relationship.
    expect(xml).toContain('typeCode="SUBJ" inversionInd="true"');
    expect(xml).toContain('typeCode="CAUS"');
    // The deceased flag rides the sdtc extension namespace.
    expect(xml).toContain('xmlns:sdtc="urn:hl7-org:sdtc"');
    expect(xml).toContain('deceasedInd value="true"');
  });

  it("emits nullFlavor=UNK for an unknown relationship and an unknown condition — never guessed", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      familyHistory: [{ relative: {}, observations: [{}] }],
    });
    expect(doc.warnings).toEqual([]);
    const fh = doc.getFamilyHistory();
    expect(fh).toHaveLength(1);
    // An unknown relation is an explicit nullFlavor, not a fabricated relationship.
    expect(fh[0]?.relative.relationship?.nullFlavor).toBe("UNK");
    expect(fh[0]?.relative.relationship?.code).toBeUndefined();
    // An unknown condition is an explicit nullFlavor, not a fabricated illness.
    expect(fh[0]?.observations[0]?.condition?.nullFlavor).toBe("UNK");
    expect(fh[0]?.observations[0]?.condition?.code).toBeUndefined();
    // No demographics were supplied → no person <subject>, no age/death sub-obs.
    expect(fh[0]?.relative.gender).toBeUndefined();
    expect(fh[0]?.relative.deceased).toBeUndefined();
    expect(fh[0]?.observations[0]?.ageAtOnset).toBeUndefined();
    expect(fh[0]?.observations[0]?.causeOfDeath).toBeUndefined();
  });

  it("honors a caller-supplied non-SNOMED relationship code system (HL7 RoleCode)", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      familyHistory: [
        {
          relative: {
            relationship: {
              code: "FTH",
              codeSystem: "2.16.840.1.113883.5.111",
              displayName: "Father",
            },
          },
          observations: [{ condition: { code: "22298006", displayName: "Myocardial infarction" } }],
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    expect(doc.getFamilyHistory()[0]?.relative.relationship?.codeSystem).toBe(
      "2.16.840.1.113883.5.111",
    );
  });

  it("does NOT emit a Family History section when none is supplied", () => {
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("familyHistory")).toBeUndefined();
    expect(doc.getFamilyHistory()).toEqual([]);
    expect(serializeCcda(doc)).not.toContain('code="10157-6"');
  });

  it("throws rather than emit a component-less organizer for an empty observations list", () => {
    expect(() =>
      buildCcda({
        patient: { mrn: "M" },
        familyHistory: [
          {
            relative: { relationship: { code: "72705000", displayName: "Mother" } },
            observations: [],
          },
        ],
      }),
    ).toThrow(TypeError);
  });

  it("is a serialization fixed point with a Family History section present", () => {
    const xml = serializeCcda(buildCcda(FHX_INIT));
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
