/**
 * Tests for the `buildCcda` document builder (CCDA-P7). The builder emits a
 * spec-clean C-CDA R2.1 CCD through the *same DOM the parser reads*, so the
 * central guarantees are:
 *
 *   - **round-trip fidelity**, a document `buildCcda` emits parses back to the
 *     same structured content across every populated section (Problems,
 *     Allergies, Medications, Results, Vital Signs), and serialization is a
 *     fixed point;
 *   - **spec-clean emit**, a clean build produces zero warnings (correct
 *     templateIds, LOINC section codes, RxNorm/LOINC/UCUM coding, structured +
 *     narrative agreement, empty sections as `nullFlavor="NI"`); and
 *   - **the safety-critical fail-safes**, "No Known Allergies" is a negation
 *     never collapsed into an unknown, and a missing dose/route or a bad UCUM
 *     unit is surfaced, never silently defaulted to a confident-wrong value.
 */

import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import type { Element } from "@xmldom/xmldom";

import {
  buildCcda,
  editCcda,
  parseCcda,
  serializeCcda,
  missingRequiredSections,
  requiredSectionStatus,
  DOCUMENT_TYPES,
  type BuildCcdaInit,
  type BuildCcdaPlannedItem,
  type TerminologyAdapter,
} from "../src/index.js";
import { ALL_WARNING_MESSAGES } from "../src/parser/warnings.js";
import { BUILDER_BASELINE_DOCUMENTS } from "./__fixtures__/builder-baseline.js";
import { BUILT_DOCUMENT_CASES } from "./__fixtures__/conformance.js";

const PROBLEM_OBSERVATION = "2.16.840.1.113883.10.20.22.4.4";
const ALLERGY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.7";
const SMOKING_STATUS_OBSERVATION = "2.16.840.1.113883.10.20.22.4.78";

/**
 * The ordered direct-child element tag names of the first `<observation>` whose
 * first `<templateId>` carries `templateRoot`. Used to assert the CDA R2
 * `POCD_MT000040.Observation` element sequence (…code, text, statusCode,
 * effectiveTime, …, value…) is honored on emit, an `xs:sequence`, so a `<text>`
 * emitted after `<value>` is XSD-invalid, not a cosmetic reordering.
 */
function observationChildOrder(xml: string, templateRoot: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const observations = Array.from(doc.getElementsByTagName("observation"));
  for (const obs of observations) {
    const templateId = Array.from(obs.childNodes).find(
      (n): n is Element => (n as Element).nodeName === "templateId",
    );
    if (templateId?.getAttribute("root") === templateRoot) {
      return Array.from(obs.childNodes)
        .filter((n) => n.nodeType === 1)
        .map((n) => (n as Element).nodeName);
    }
  }
  throw new Error(`no <observation> with templateId root ${templateRoot} found`);
}

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
      vaccine: {
        code: "140",
        displayName: "Influenza, split virus, trivalent, injectable, preservative free",
      },
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

describe("buildCcda, document identity + header", () => {
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

describe("buildCcda, spec-clean emit (zero warnings)", () => {
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

describe("buildCcda, round-trip through the parse model", () => {
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

describe("buildCcda, allergies + the negation/nullFlavor safety rule", () => {
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
    // AC-1. The negated form now carries the substance participant its template's
    // SHALL requires (CONF:1098-7402), with the playing entity's code
    // nullFlavor="NA": not applicable, because "no known allergies" names no
    // substance. So the allergen slot is PRESENT and explicitly empty rather than
    // absent, which is what a real-world NKA entry from any other system has always
    // parsed to here. The safety-bearing reads are unchanged and are asserted above:
    // this is a negation, not an unknown, and there is no code to mistake for one.
    expect(nka?.allergen?.code).toBeUndefined();
    expect(nka?.allergen?.nullFlavor).toBe("NA");
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

describe("buildCcda, problem/allergy onset + resolution dates", () => {
  it("carries a resolved problem's onset as low and resolution as high (concern + observation)", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      problems: [
        {
          problem: { code: "195967001", displayName: "Asthma" },
          status: "resolved",
          onset: "20180301",
          resolution: "20220615",
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const concern = doc.getProblems()[0];
    expect(concern?.status).toBe("resolved");
    // Concern Act effectiveTime window: low = onset, high = resolution date.
    expect(concern?.effectiveTime?.low?.raw).toBe("20180301");
    expect(concern?.effectiveTime?.high?.raw).toBe("20220615");
    expect(concern?.effectiveTime?.high?.date).toBeInstanceOf(Date);
    // The nested Problem Observation carries the same window (low = onset, high =
    // the "resolution date" that asserts the condition is biologically resolved).
    expect(concern?.problems[0]?.effectiveTime?.low?.raw).toBe("20180301");
    expect(concern?.problems[0]?.effectiveTime?.high?.raw).toBe("20220615");
  });

  it("emits a nullFlavor='UNK' high for a resolved problem whose resolution date is unknown", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      problems: [
        {
          problem: { code: "44054006", displayName: "Type 2 diabetes mellitus" },
          status: "resolved",
        },
      ],
    });
    const concern = doc.getProblems()[0];
    // A resolved concern SHALL still carry a high, nullFlavor when the date is
    // unknown, never a fabricated date, and its presence still asserts resolved.
    expect(concern?.effectiveTime?.high?.nullFlavor).toBe("UNK");
    expect(concern?.effectiveTime?.high?.date).toBeUndefined();
    expect(concern?.problems[0]?.effectiveTime?.high?.nullFlavor).toBe("UNK");
  });

  it("emits no high element for an active problem (a high would falsely assert resolution)", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      problems: [
        {
          problem: { code: "59621000", displayName: "Essential hypertension" },
          status: "active",
          onset: "20210101",
        },
      ],
    });
    const concern = doc.getProblems()[0];
    expect(concern?.effectiveTime?.low?.raw).toBe("20210101");
    expect(concern?.effectiveTime?.high).toBeUndefined();
    expect(concern?.problems[0]?.effectiveTime?.high).toBeUndefined();
  });

  it("rejects a problem resolution date without status:'resolved' (a contradiction)", () => {
    expect(() =>
      buildCcda({
        patient: { mrn: "M" },
        problems: [
          {
            problem: { code: "59621000", displayName: "Essential hypertension" },
            resolution: "20220615",
          },
        ],
      }),
    ).toThrow(TypeError);
  });

  it("carries an allergy concern's onset + resolution on its effectiveTime window", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      allergies: [
        {
          allergen: { code: "7980", displayName: "Penicillin G" },
          status: "resolved",
          onset: "20150101",
          resolution: "20200202",
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const concern = doc.getAllergies()[0];
    expect(concern?.status).toBe("resolved");
    expect(concern?.effectiveTime?.low?.raw).toBe("20150101");
    expect(concern?.effectiveTime?.high?.raw).toBe("20200202");
    expect(concern?.effectiveTime?.high?.date).toBeInstanceOf(Date);
  });

  it("emits an allergy onset low as nullFlavor='UNK' when no onset is supplied", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      allergies: [{ allergen: { code: "7980", displayName: "Penicillin G" } }],
    });
    const concern = doc.getAllergies()[0];
    expect(concern?.effectiveTime?.low?.nullFlavor).toBe("UNK");
    expect(concern?.effectiveTime?.high).toBeUndefined();
  });

  it("rejects an allergy resolution date without status:'resolved'", () => {
    expect(() =>
      buildCcda({
        patient: { mrn: "M" },
        allergies: [
          { allergen: { code: "7980", displayName: "Penicillin G" }, resolution: "20200202" },
        ],
      }),
    ).toThrow(TypeError);
  });

  it("carries a resolution date on a resolved Past Medical History problem", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      pastMedicalHistory: [
        {
          problem: { code: "195967001", displayName: "Asthma" },
          status: "resolved",
          onset: "20100101",
          resolution: "20150505",
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const pmh = doc.getPastMedicalHistory()[0];
    expect(pmh?.effectiveTime?.low?.raw).toBe("20100101");
    expect(pmh?.effectiveTime?.high?.raw).toBe("20150505");
  });
});

describe("buildCcda, emit conformance (header + section cardinality)", () => {
  it("emits SHALL addr + telecom on patientRole, assignedAuthor, and custodian org", () => {
    const xml = serializeCcda(buildCcda({ patient: { mrn: "M" } }));
    // Three participations × (addr + telecom) = at least three of each.
    expect((xml.match(/<addr /g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((xml.match(/<telecom /g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("empty required sections declare BOTH templateIds and carry nullFlavor with no entries", () => {
    // AC-1. This assertion used to read the other way round, on the argument that an
    // entries-required template with zero entries violates its "SHALL contain at least
    // one entry" statement. Measured against the normative Schematron at the revision
    // scripts/conformance/artifacts.json pins, that is wrong twice over: the section's
    // own assertion admits a nullFlavor-ed section with no entries (it refuses only the
    // combination of a nullFlavor AND entries), and the CCD's header rule names the
    // entries-REQUIRED identifier for each of its five clinical SHALL sections, so
    // declaring only the entries-optional one failed the document-level rule five times.
    // Medications is stamped 2014-06-09, NOT 2015-08-01: R2.1 never re-issued this
    // section at the later stamp. See CCD_SHALL_SECTION_STAMPS below.
    const xml = serializeCcda(buildCcda({ patient: { mrn: "M" } }));
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.1" extension="2014-06-09"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.3" extension="2015-08-01"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"');
    // The escape the section rule grants is nullFlavor-with-no-entries, so both halves
    // of it are the assertion: every empty section is null-flavored, and none has entries.
    expect((xml.match(/<section nullFlavor="NI">/g) ?? []).length).toBe(6);
    expect(xml).not.toContain("<entry>");
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

/**
 * The six CCD SHALL section templates, transcribed from the normative C-CDA R2.1
 * Schematron's CCD (V3) errors rule. Source: `HL7/CDA-ccda-2.1`,
 * `validation/Consolidated CDA Templates for Clinical Notes (US Realm) DSTU R2.1.sch`,
 * 1,010,531 bytes, sha256
 * `04be58046a675735616e46cf52053688a2fc9d0c88010f14fd1c5a2f4ca5bd54`.
 *
 * The asserts sit in the ABSTRACT rule
 * `r-urn-hl7ii-2.16.840.1.113883.10.20.22.1.2-2015-08-01-errors-abstract`, which
 * carries no context of its own; the selecting context comes from the concrete
 * rule that `sch:extends` it,
 * `cda:ClinicalDocument[cda:templateId[@root='2.16.840.1.113883.10.20.22.1.2' and @extension='2015-08-01']]`,
 * i.e. an R2.1-stamped CCD.
 *
 * Each assert tests a `@root` **and** an `@extension`. Medications is the odd one
 * out at `2014-06-09`; emitting its root under `2015-08-01` failed CONF:1198-30664
 * on every CCD this builder produced.
 *
 * This is a TRANSCRIPTION of six asserts, not a Schematron run. It pins this
 * defect class for the six SHALL sections and nothing wider.
 */
const CCD_SHALL_SECTION_STAMPS = [
  { conf: "1198-30662", name: "Allergies (entries required) (V3)", root: "2.16.840.1.113883.10.20.22.2.6.1", ext: "2015-08-01" }, // prettier-ignore
  { conf: "1198-30664", name: "Medications (entries required) (V2)", root: "2.16.840.1.113883.10.20.22.2.1.1", ext: "2014-06-09" }, // prettier-ignore
  { conf: "1198-30666", name: "Problem (entries required) (V3)", root: "2.16.840.1.113883.10.20.22.2.5.1", ext: "2015-08-01" }, // prettier-ignore
  { conf: "1198-30670", name: "Results (entries required) (V3)", root: "2.16.840.1.113883.10.20.22.2.3.1", ext: "2015-08-01" }, // prettier-ignore
  { conf: "1198-30688", name: "Social History (V3)", root: "2.16.840.1.113883.10.20.22.2.17", ext: "2015-08-01" }, // prettier-ignore
  { conf: "1198-30690", name: "Vital Signs (entries required) (V3)", root: "2.16.840.1.113883.10.20.22.2.4.1", ext: "2015-08-01" }, // prettier-ignore
] as const;

describe("buildCcda, the six CCD SHALL section template stamps", () => {
  const xml = serializeCcda(buildCcda(RICH_INIT));

  it.each(CCD_SHALL_SECTION_STAMPS)(
    "a fully populated CCD carries $name at $ext (CONF:$conf)",
    ({ root, ext }) => {
      expect(xml).toContain(`root="${root}" extension="${ext}"`);
    },
  );

  it("never emits the Medications section under the 2015-08-01 stamp", () => {
    // The regression proper. R2.1 defines NO 2015-08-01 variant of either
    // Medications section root, so this pair is unsatisfiable by any rule and
    // its presence means the R21 default leaked back in.
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.1" extension="2015-08-01"');
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.1.1" extension="2015-08-01"');
  });

  it("stamps the Medications section identically when it is empty", () => {
    // AC-1. An empty CCD now emits BOTH roots at 2014-06-09 and carries
    // nullFlavor="NI" with no entries, which is the shape that satisfies
    // CONF:1198-30664 and the section's own entry rule at the same time; the
    // paragraph above this test's sibling in "emit conformance" has the
    // measurement. What is pinned here is that the stamp is right on BOTH roots:
    // the 2015-08-01 leak this file exists to catch would show on either one.
    const empty = serializeCcda(buildCcda({ patient: { mrn: "M" } }));
    expect(empty).toContain('root="2.16.840.1.113883.10.20.22.2.1" extension="2014-06-09"');
    expect(empty).toContain('root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"');
  });

  it("stamps the Referral Note's Medications section the same way", () => {
    // The Referral Note errors rule requires …22.2.1.1 at 2014-06-09 too, so
    // the section template's identity is document-type independent. Its assert
    // is CONF:1198-30923, NOT 1198-30664: the latter sits in the CCD (…22.1.2)
    // pattern, whose concrete rule selects only a ClinicalDocument carrying
    // …22.1.2 at 2015-08-01 (both halves of the predicate), and a Referral Note
    // carries …22.1.1 + …22.1.14 instead,
    // so it falls outside that context entirely. The two asserts are
    // byte-identical in their test XPath and differ only in the selecting rule.
    const rn = serializeCcda(
      buildCcda({
        documentType: "referralNote",
        patient: { mrn: "RN003" },
        medications: [{ drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" } }],
      }),
    );
    expect(rn).toContain('root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"');
    expect(rn).not.toContain('root="2.16.840.1.113883.10.20.22.2.1.1" extension="2015-08-01"');
    expect(rn).not.toContain('root="2.16.840.1.113883.10.20.22.2.1" extension="2015-08-01"');
  });

  it("re-parses the restamped Medications section with zero warnings", () => {
    // Section recognition matches on templateId ROOT alone, so restamping must
    // not disturb parse, and the round-trip must stay clean.
    const doc = buildCcda(RICH_INIT);
    expect(doc.findSection("medications")?.code?.code).toBe("10160-0");
    expect(parseCcda(xml).warnings).toEqual([]);
  });
});

describe("buildCcda, medications round-trip", () => {
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

  it("does NOT default a missing dose/route, it flags them, never invents a value", () => {
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

describe("buildCcda, results round-trip", () => {
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

describe("buildCcda, vital signs round-trip", () => {
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
    // "Kg" is a case slip of "kg", surfaced, never silently accepted.
    expect(doc.warnings.map((w) => w.code)).toContain("UCUM_CASE_SUSPECT");
  });
});

describe("buildCcda, immunizations round-trip", () => {
  it("re-parses the CVX vaccine, dose, route, and administration date", () => {
    const [flu] = buildCcda(RICH_INIT).getImmunizations();
    expect(flu?.vaccine?.code).toBe("140");
    expect(flu?.vaccine?.codeSystem).toBe("2.16.840.1.113883.12.292"); // CVX
    expect(flu?.dose?.value).toBe(0.5);
    expect(flu?.dose?.unit).toBe("mL");
    expect(flu?.route?.code).toBe("C28161");
    expect(flu?.route?.codeSystem).toBe("2.16.840.1.113883.3.26.1.1"); // NCI Thesaurus
    expect(flu?.effectiveTime?.value?.raw).toBe("20240101");
    expect(flu?.narrative).toBe("Influenza, split virus, trivalent, injectable, preservative free");
    // AC-1. The Immunization Activity SHALL carry @negationInd (CONF:1198-8985),
    // on the administered arm too, so an administered shot now states
    // negationInd="false" and reads back as `refused: false`. That is the entry's
    // own claim written where the guide requires it, not a default standing in for
    // an unknown, and it is still distinct from the refused case below.
    expect(flu?.refused).toBe(false);
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
        {
          vaccine: {
            code: "140",
            displayName: "Influenza, split virus, trivalent, injectable, preservative free",
          },
          refused: true,
        },
      ],
    });
    const shot = doc.getImmunizations()[0];
    expect(shot?.refused).toBe(true);
    expect(shot?.nullFlavor).toBeUndefined();
    // The refusal is clinically load-bearing, surfaced, never silently dropped.
    expect(doc.warnings.map((w) => w.code)).toContain("IMMUNIZATION_REFUSED");
  });

  it("does NOT emit an Immunizations section when none are supplied", () => {
    const xml = serializeCcda(buildCcda({ patient: { mrn: "M" } }));
    // Immunizations is not a CCD SHALL section, an empty one is not fabricated.
    expect(xml).not.toContain('code="11369-6"');
    expect(buildCcda({ patient: { mrn: "M" } }).findSection("immunizations")).toBeUndefined();
  });

  it("fills the SHALL administration effectiveTime with nullFlavor when omitted, read back as absent", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      immunizations: [
        {
          vaccine: {
            code: "140",
            displayName: "Influenza, split virus, trivalent, injectable, preservative free",
          },
        },
      ],
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

describe("buildCcda, procedures round-trip", () => {
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
    // Procedure Activity Observation (…22.4.13) SHALL carry a value [1..1], the
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

describe("buildCcda, encounters round-trip", () => {
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

describe("buildCcda, social history (smoking status) round-trip", () => {
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
    // The Smoking Status, Meaningful Use observation carries the 2014-06-09 stamp
    // and the fixed LOINC "Tobacco smoking status" code.
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.78" extension="2014-06-09"');
    expect(xml).toContain('code="72166-2"');
  });

  it("emits an EXPLICIT nullFlavor=UNK value for an unrecorded status, never a fabricated reading", () => {
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

  it("emits an empty nullFlavor=NI Social History section when none is supplied", () => {
    // Social History (V3) IS a CCD SHALL section (CONF:1198-30688), so it is
    // always emitted for a CCD. Empty means a spec-clean nullFlavor="NI" shell,
    // exactly as for the other five: the section's own errors rule demands only
    // code/title/text (CONF:1198-14819 / -7938 / -7939) and its Smoking Status
    // entry is SHOULD (CONF:1198-14823), so the shell asserts no clinical fact.
    const doc = buildCcda({ patient: { mrn: "M" } });
    expect(doc.findSection("socialHistory")).toBeDefined();
    // Still no fabricated smoking status: an NI shell carries no entry.
    expect(doc.getSmokingStatus()).toEqual([]);
    const xml = serializeCcda(doc);
    expect(xml).toContain('code="29762-2"');
    // The Social History Section template has no entries-required variant, so the
    // shell carries the very @root/@extension pair CONF:1198-30688 names.
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.2.17" extension="2015-08-01"');
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.17.1"');
  });

  it("emits the Social History section exactly once when a smoking status IS supplied", () => {
    // Regression guard: Social History is now emitted by the SHALL loop, and the
    // populated-only conditional that used to emit it still exists for the
    // document types whose SHALL set excludes it. Without the `shall.has` guard
    // on that conditional, a CCD carrying a smoking status emits the section
    // TWICE.
    const doc = buildCcda({
      patient: { mrn: "M" },
      smokingStatus: [{ value: { code: "266919005", displayName: "Never smoker" } }],
    });
    const xml = serializeCcda(doc);
    expect(xml.split('code="29762-2"').length - 1).toBe(1);
    expect(doc.getSmokingStatus()).toHaveLength(1);
    expect(doc.warnings).toEqual([]);
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

describe("buildCcda, functional status round-trip", () => {
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

  it("emits an EXPLICIT nullFlavor=UNK value for an unrecorded finding, never a fabricated one", () => {
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

describe("buildCcda, mental status round-trip", () => {
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

  it("emits an EXPLICIT nullFlavor=UNK value for an unrecorded finding, never a fabricated one", () => {
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

describe("buildCcda, functional/mental status organizers", () => {
  /** A functional organizer (ICF-coded self-care cluster) grouping two findings
   * plus the Self-Care Activities observation its template SHALL contain, a mental
   * organizer (uncoded) grouping two, and one standalone functional finding, to
   * prove grouping, domain separation, and mixed grouped/standalone. */
  const ORG_INIT: BuildCcdaInit = {
    patient: { mrn: "M" },
    functionalStatusOrganizers: [
      {
        code: {
          code: "d5",
          displayName: "Self-care",
          codeSystem: "2.16.840.1.113883.6.254",
          codeSystemName: "ICF",
        },
        effectiveTime: "20240101",
        findings: [
          { value: { code: "129019007", displayName: "Self-care" } },
          { value: { code: "165245003", displayName: "Able to walk" } },
        ],
        selfCareActivities: [
          {
            code: { code: "54520-2", displayName: "Bathing" },
            value: { code: "371153006", displayName: "Independent" },
            effectiveTime: "20240101",
          },
        ],
      },
    ],
    functionalStatus: [{ value: { code: "105503008", displayName: "Dependent on wheelchair" } }],
    mentalStatusOrganizers: [
      {
        findings: [
          { value: { code: "386807006", displayName: "Memory impairment" } },
          { value: { code: "247663003", displayName: "Orientation finding" } },
        ],
      },
    ],
  };

  it("round-trips organizer members as flat, domain-tagged findings, warning-free", () => {
    const doc = buildCcda(ORG_INIT);
    const functional = doc.getFunctionalStatus();
    const mental = doc.getMentalStatus();
    // Two grouped findings + the grouped self-care activity + one standalone finding;
    // two grouped mental findings.
    expect(functional).toHaveLength(4);
    expect(mental).toHaveLength(2);
    expect(functional.every((f) => f.domain === "functional")).toBe(true);
    expect(mental.every((f) => f.domain === "mental")).toBe(true);
    // Grouped members read back with their coded finding value + the fixed obs code.
    const codes = functional.map((f) =>
      f.value?.kind === "coded" ? f.value.code.code : undefined,
    );
    expect(codes).toContain("129019007");
    expect(codes).toContain("165245003");
    expect(codes).toContain("105503008");
    // The Self-Care Activities member reads back too, as an ordinary functional
    // finding: its `code` is the activity assessed, its `value` the ability.
    expect(codes).toContain("371153006");
    expect(functional.map((f) => f.code?.code)).toContain("54520-2");
    expect(functional.filter((f) => f.code?.code === "54522-8")).toHaveLength(3);
    expect(mental.every((f) => f.code?.code === "373930000")).toBe(true);
    // Nothing is flagged as an assessment scale (none emitted this slice).
    expect(functional.every((f) => f.assessmentScale === undefined)).toBe(true);
    expect(doc.warnings).toEqual([]);
  });

  it("writes the findings standalone, and says so, when no self-care activity is supplied", () => {
    // The R2.1 Functional Status Organizer SHALL contain a Self-Care Activities (ADL and
    // IADL) observation (CONF:1098-31432). With none supplied there is no conformant
    // organizer to write, and neither fabricating the activity nor claiming the template
    // anyway is available to an emitter that never invents content: the findings go out
    // standalone and the document carries MISSING_SELF_CARE_ACTIVITY.
    const doc = buildCcda({
      patient: { mrn: "M" },
      functionalStatusOrganizers: [
        {
          code: { code: "118228005", displayName: "Musculoskeletal function" },
          effectiveTime: "20240101",
          findings: [
            { value: { code: "129019007", displayName: "Self-care" } },
            { value: { code: "165245003", displayName: "Able to walk" } },
          ],
        },
      ],
    });
    expect(doc.warnings.map((w) => w.code)).toEqual(["MISSING_SELF_CARE_ACTIVITY"]);
    const xml = serializeCcda(doc);
    expect(xml).not.toContain("2.16.840.1.113883.10.20.22.4.66");
    expect(xml).not.toContain("<organizer");
    // Every finding survives, as a Functional Status Observation of its own.
    expect(xml.split('root="2.16.840.1.113883.10.20.22.4.67"')).toHaveLength(3);
    const codes = doc
      .getFunctionalStatus()
      .map((f) => (f.value?.kind === "coded" ? f.value.code.code : undefined));
    expect(codes).toStrictEqual(["129019007", "165245003"]);
  });

  it("emits the Self-Care Activities observation with every SHALL its template states", () => {
    const xml = serializeCcda(buildCcda(ORG_INIT));
    // …22.4.128, unversioned (CONF:1098-28457), inside a component of the organizer.
    expect(xml).toContain('<templateId root="2.16.840.1.113883.10.20.22.4.128"/>');
    expect(xml).toContain('code="54520-2"');
    expect(xml).toContain('<value code="371153006"');
    expect(xml).toMatch(
      /<observation[^>]*>(?:(?!<\/observation>)[\s\S])*?4\.128[\s\S]*?xsi:type="CD"/,
    );
  });

  it("emits EXPLICIT nullFlavor=UNK self-care slots rather than inventing an activity", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      functionalStatusOrganizers: [
        {
          findings: [{ value: { code: "165245003", displayName: "Able to walk" } }],
          selfCareActivities: [{}],
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const xml = serializeCcda(doc);
    const activity = xml.slice(xml.indexOf("2.16.840.1.113883.10.20.22.4.128"));
    // The activity, the ability and the assessment time are all explicit unknowns; the
    // statusCode is the one slot the template fixes, so it is the one slot that is filled.
    expect(activity).toContain('<code nullFlavor="UNK"/>');
    expect(activity).toContain('<effectiveTime nullFlavor="UNK"/>');
    expect(activity).toContain('<value nullFlavor="UNK" xsi:type="CD"/>');
    expect(activity).toContain('<statusCode code="completed"/>');
  });

  it("emits the organizer as a CLUSTER with the correct template stamps + ICF code", () => {
    const xml = serializeCcda(buildCcda(ORG_INIT));
    // Functional Status Organizer (…4.66, 2014-06-09); Mental Status Organizer (…4.75, 2015-08-01).
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.66" extension="2014-06-09"');
    expect(xml).toContain('root="2.16.840.1.113883.10.20.22.4.75" extension="2015-08-01"');
    expect(xml).toContain('<organizer classCode="CLUSTER" moodCode="EVN">');
    // The organizer categorization code is the caller's ICF code (SHOULD ICF/LOINC).
    expect(xml).toContain('code="d5"');
    expect(xml).toContain('codeSystem="2.16.840.1.113883.6.254"');
    // The organizer carries its optional effectiveTime when supplied.
    expect(xml).toContain('<effectiveTime value="20240101"/>');
  });

  it("emits an EXPLICIT nullFlavor=UNK organizer code when no categorization is supplied", () => {
    // The mental organizer in ORG_INIT has no code → nullFlavor UNK, never fabricated.
    const doc = buildCcda({
      patient: { mrn: "M" },
      mentalStatusOrganizers: [
        { findings: [{ value: { code: "386807006", displayName: "Memory impairment" } }] },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const xml = serializeCcda(doc);
    // The organizer's SHALL code [1..1] is an explicit unknown category.
    expect(xml).toMatch(/<organizer[^>]*>[\s\S]*?<code nullFlavor="UNK"\/>/);
    expect(doc.getMentalStatus()).toHaveLength(1);
  });

  it("omits the organizer effectiveTime when none is supplied, never a fabricated date", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      functionalStatusOrganizers: [
        {
          findings: [{ value: { code: "129019007", displayName: "Self-care" } }],
          selfCareActivities: [{ value: { code: "371153006", displayName: "Independent" } }],
        },
      ],
    });
    const xml = serializeCcda(doc);
    // The organizer wrapper (not its member observation) carries no effectiveTime.
    const orgFragment = xml.slice(
      xml.indexOf("<organizer"),
      xml.indexOf("<component>", xml.indexOf("<organizer")),
    );
    expect(orgFragment).not.toContain("effectiveTime");
  });

  it("throws on an empty organizer, the template SHALL contain at least one member", () => {
    expect(() =>
      buildCcda({ patient: { mrn: "M" }, functionalStatusOrganizers: [{ findings: [] }] }),
    ).toThrow(/at least one finding/);
    expect(() =>
      buildCcda({ patient: { mrn: "M" }, mentalStatusOrganizers: [{ findings: [] }] }),
    ).toThrow(/at least one finding/);
  });

  it("is a serialization fixed point with grouped status organizers present", () => {
    const xml = serializeCcda(buildCcda(ORG_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });

  it("does not flag organizer members as misplaced (they home to their status section)", () => {
    const doc = buildCcda(ORG_INIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain("SECTION_PLACEMENT_SUSPECT");
  });
});

describe("buildCcda, direct-entry assessment scales", () => {
  /** A PHQ-9 in Mental Status (score + interpretation + two supporting items) and a
   * Glasgow Coma total in Functional Status, the two carrying sections for a
   * direct-entry Assessment Scale Observation. */
  const SCALE_INIT: BuildCcdaInit = {
    patient: { mrn: "M" },
    mentalStatusScales: [
      {
        code: { code: "44249-1", displayName: "PHQ-9 quick depression assessment panel" },
        score: 12,
        effectiveTime: "20240101",
        interpretation: { code: "H", displayName: "High" },
        supporting: [
          { code: { code: "44250-9", displayName: "Little interest or pleasure" }, score: 0 },
          { code: { code: "44255-8", displayName: "Feeling down or hopeless" }, score: 1 },
        ],
      },
    ],
    functionalStatusScales: [
      { code: { code: "9269-2", displayName: "Glasgow coma score total" }, score: 9 },
    ],
  };

  it("round-trips each scale into its section's domain, flagged, INT-scored, warning-free", () => {
    const doc = buildCcda(SCALE_INIT);
    const mental = doc.getMentalStatus();
    const functional = doc.getFunctionalStatus();
    expect(mental).toHaveLength(1);
    expect(functional).toHaveLength(1);
    expect(mental[0]?.domain).toBe("mental");
    expect(functional[0]?.domain).toBe("functional");
    expect(mental.every((s) => s.assessmentScale === true)).toBe(true);
    expect(functional.every((s) => s.assessmentScale === true)).toBe(true);
    // The score round-trips as an INT (not a PQ), units are not allowed on an INT.
    expect(mental[0]?.value?.kind === "integer" ? mental[0].value.value : undefined).toBe(12);
    expect(functional[0]?.value?.kind === "integer" ? functional[0].value.value : undefined).toBe(
      9,
    );
    // The two supporting items round-trip with their INT scores.
    expect(mental[0]?.supporting).toHaveLength(2);
    expect(
      mental[0]?.supporting?.[0]?.value?.kind === "integer"
        ? mental[0].supporting[0].value.value
        : undefined,
    ).toBe(0);
    expect(doc.warnings).toEqual([]);
  });

  it("emits the bare-root templates (no @extension) the R2.1 IG requires + INT score", () => {
    const xml = serializeCcda(buildCcda(SCALE_INIT));
    // Assessment Scale Observation / Supporting Observation SHALL carry @root with NO @extension.
    expect(xml).toContain('<templateId root="2.16.840.1.113883.10.20.22.4.69"/>');
    expect(xml).toContain('<templateId root="2.16.840.1.113883.10.20.22.4.86"/>');
    expect(xml).not.toMatch(/root="2\.16\.840\.1\.113883\.10\.20\.22\.4\.69" extension/);
    expect(xml).not.toMatch(/root="2\.16\.840\.1\.113883\.10\.20\.22\.4\.86" extension/);
    // The total score is an INT value carrying no unit.
    expect(xml).toMatch(/<value value="12" xsi:type="INT"\/>/);
  });

  it("emits an EXPLICIT nullFlavor=UNK INT score when none is supplied, never fabricated", () => {
    const doc = buildCcda({
      patient: { mrn: "M" },
      functionalStatusScales: [
        { code: { code: "9269-2", displayName: "Glasgow coma score total" } },
      ],
    });
    expect(doc.warnings).toEqual([]);
    const scale = doc.getFunctionalStatus()[0];
    // An unknown score reads back as an integer value with no number, never a guessed 0.
    expect(scale?.value?.kind).toBe("integer");
    expect(scale?.value?.kind === "integer" ? scale.value.value : "set").toBeUndefined();
    expect(scale?.value?.kind === "integer" ? scale.value.nullFlavor : undefined).toBe("UNK");
    const xml = serializeCcda(doc);
    expect(xml).toMatch(/<value nullFlavor="UNK" xsi:type="INT"\/>/);
  });

  it("does not flag the direct-entry scale as misplaced in either section", () => {
    const doc = buildCcda(SCALE_INIT);
    expect(doc.warnings.map((w) => w.code)).not.toContain("SECTION_PLACEMENT_SUSPECT");
  });

  it("is a serialization fixed point with direct-entry scales present", () => {
    const xml = serializeCcda(buildCcda(SCALE_INIT));
    expect(parseCcda(xml).toString()).toBe(xml);
  });
});

describe("buildCcda, past medical history round-trip", () => {
  /** A build carrying BOTH an active problem concern and a historical (past) one,
   * to prove the two never conflate, the past problem is a bare observation
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

  it("emits nullFlavor=UNK onset when no onset is supplied, never a fabricated date", () => {
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

describe("buildCcda, plan of treatment round-trip", () => {
  /** A build carrying six of the seven planned-entry variants AND a *performed* procedure,
   * (the seventh, `immunizationActivity`, has its own round-trip test in `entries.test.ts`),
   * to prove the planned items are never conflated with the performed acts, each
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
        // SHALL [1..1] on `…22.4.42` (CONF:1098-30468). Supplied here so this
        // fixture stays the *clean* one; omitting it is now reported
        // (MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME) and has its own tests
        // below, rather than riding along in every assertion that uses
        // PLAN_INIT. Before this it was absent and the fixture asserted
        // "warning-free" over a document short a SHALL element.
        effectiveTime: "20240801",
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
      // Every plan item is future/ordered, never performed, and SHALL statusCode "active".
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
    // Omitted mood defaults to INT (a planned mood), the performed EVN is not emitted.
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

  it("emits the Plan of Treatment section (LOINC 18776-5, 2014-06-09, six of the seven planned templates, no entries-required variant)", () => {
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
    // The planned colonoscopy stays in getPlannedItems, planned, never a performed procedure.
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
    // (x_ActMoodDocumentObservation), so the type must make them unrepresentable
    // on those kinds. A schema-invalid @moodCode can never be emitted "by
    // construction", not merely discouraged.
    // @ts-expect-error, APT is not in a medication's mood domain.
    const badMed: BuildCcdaPlannedItem = {
      kind: "medicationActivity",
      code: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
      mood: "APT",
    };
    void badMed;
    // @ts-expect-error, ARQ is not in an observation's mood domain.
    const badObs: BuildCcdaPlannedItem = {
      kind: "observation",
      code: { code: "58410-2", displayName: "CBC panel" },
      mood: "ARQ",
    };
    void badObs;
    // The SAME appointment mood IS valid on an encounter, this must compile.
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

/**
 * The emit-time diagnostic for a Planned Medication Activity written short its
 * SHALL `effectiveTime` (`…22.4.42`, `[1..1]`, CONF:1098-30468), raised by
 * **both** writers: `buildCcda` and `editCcda`.
 *
 * The decision taken was **keep the field optional, report the omission**:
 * requiring it on `BuildCcdaPlannedOrder` would break a published input type.
 * So the things worth pinning are that the input type still accepts the
 * omission (it compiles), that the emitted XML is **unchanged** by the
 * diagnostic (no fabricated date, no nullFlavor), and that the diagnostic
 * actually appears.
 *
 * The `editCcda` half is what makes the SCOPE worth pinning as hard as the
 * check. It reads the **surviving grafted** components of the emitted DOM, which
 * is two claims, each with its own test below: an offending edit discarded by a
 * later one says nothing (reading the ordered edit list instead reported a SHALL
 * violation against a conformant document, measured and reverted), and an
 * untouched section the source brought with it is never re-reported (an edit is
 * not a validator of documents its caller did not write).
 */
describe("planned medication effectiveTime diagnostic, on both writers", () => {
  const noTime: BuildCcdaInit = {
    patient: { mrn: "M" },
    planOfTreatment: [
      { kind: "medicationActivity", code: { code: "314076", displayName: "Lisinopril 10 MG" } },
    ],
  };
  const withTime: BuildCcdaInit = {
    patient: { mrn: "M" },
    planOfTreatment: [
      {
        kind: "medicationActivity",
        code: { code: "314076", displayName: "Lisinopril 10 MG" },
        effectiveTime: "20240801",
      },
    ],
  };

  it("reports the omission rather than refusing the build or fabricating a date", () => {
    const doc = buildCcda(noTime);
    expect(doc.warnings.map((w) => w.code)).toStrictEqual([
      "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
    ]);
    // The emitted document is EXACTLY what it was before the diagnostic existed:
    // short the element, with nothing invented in its place. A nullFlavor here
    // would be a fabricated statement ("the time is unknown") the caller never
    // made, and a date would be worse.
    expect(doc.toString()).not.toContain("effectiveTime nullFlavor");
    const sbadm = doc.toString().slice(doc.toString().indexOf("22.4.42"));
    expect(sbadm.slice(0, sbadm.indexOf("</substanceAdministration>"))).not.toContain(
      "<effectiveTime",
    );
  });

  it("stays silent when the caller supplies the SHALL effectiveTime", () => {
    const doc = buildCcda(withTime);
    expect(doc.warnings).toEqual([]);
    expect(doc.getPlannedItems()[0]?.effectiveTime?.value?.raw).toBe("20240801");
  });

  it("raises one diagnostic per offending item, and none for the other six kinds", () => {
    // The five `[0..1]` kinds are conformant without a time and must stay silent;
    // only the two `substanceAdministration` variants are `[1..1]`, and the
    // immunization's field is required by its type, so it cannot reach here.
    const doc = buildCcda({
      patient: { mrn: "M" },
      planOfTreatment: [
        { kind: "act", code: { code: "409073007", displayName: "Education" } },
        { kind: "procedure", code: { code: "73761001", displayName: "Colonoscopy" } },
        { kind: "encounter", code: { code: "99213", displayName: "Office visit" } },
        { kind: "supply", code: { code: "58938008", displayName: "Wheelchair" } },
        { kind: "observation", code: { code: "58410-2", displayName: "CBC panel" } },
        { kind: "medicationActivity", code: { code: "314076", displayName: "Lisinopril 10 MG" } },
        { kind: "medicationActivity", code: { code: "197361", displayName: "Amlodipine 5 MG" } },
        {
          kind: "immunizationActivity",
          code: { code: "140", displayName: "Influenza, split virus, trivalent" },
          effectiveTime: "20241001",
        },
      ],
    });
    expect(doc.warnings.map((w) => w.code)).toStrictEqual([
      "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
      "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
    ]);
  });

  it("carries a PHI-free registry message and a bounded position", () => {
    const w = buildCcda(noTime).warnings[0];
    expect(w?.message).toContain("CONF:1098-30468");
    // No value parameter reaches any factory, so nothing from the input can be
    // in the string: the drug name is the obvious candidate.
    expect(w?.message).not.toContain("Lisinopril");
    expect(w?.position).toStrictEqual({
      path: "substanceAdministration",
      sectionCode: "18776-5",
    });
  });

  it("appends after the parse warnings rather than interleaving with them", () => {
    // Forced with a real parse warning beside the build diagnostic: a
    // terminology adapter that rejects the drug makes the re-parse raise
    // SEMANTIC_CODE_INVALID, so there is something for the ordering to be
    // relative to. Asserting `.at(-1)` on a single-warning document would be a
    // probe that cannot fail.
    const rejectAll: TerminologyAdapter = { validateCode: () => ({ result: false }) };
    const doc = buildCcda(noTime, { terminology: rejectAll });
    const codes = doc.warnings.map((w) => w.code);
    expect(codes).toContain("SEMANTIC_CODE_INVALID");
    expect(codes.indexOf("SEMANTIC_CODE_INVALID")).toBeLessThan(
      codes.indexOf("MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME"),
    );
    expect(codes.at(-1)).toBe("MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME");
  });

  /** The offending planned order, and its conformant twin. */
  const ORDER_NO_TIME = {
    kind: "medicationActivity",
    code: { code: "314076", displayName: "Lisinopril 10 MG" },
  } as const;
  const ORDER_WITH_TIME = { ...ORDER_NO_TIME, effectiveTime: "20240801" } as const;
  const planEdit = (
    ...content: readonly (typeof ORDER_NO_TIME | typeof ORDER_WITH_TIME)[]
  ): Parameters<typeof editCcda>[1] => ({
    sections: content.map((c) => ({ kind: "planOfTreatment", mode: "upsert", content: [c] })),
  });

  it("ALSO fires from editCcda, on the section that edit grafted", () => {
    // The residual `#98` stated and did not close. `editCcda` writes this section
    // through the same emitter from the same input type, so a document it emits
    // can be short the same SHALL element; it now says so, with the same code.
    const grafted = editCcda(buildCcda({ patient: { mrn: "M" } }), planEdit(ORDER_NO_TIME));
    expect(grafted.warnings.map((w) => w.code)).toStrictEqual([
      "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
    ]);
    // The emitted XML is unchanged by the diagnostic, exactly as on the builder:
    // the document really is short the element, with nothing invented in its
    // place, which is what makes the report a statement ABOUT the document.
    const sbadm = grafted.toString().slice(grafted.toString().indexOf("22.4.42"));
    expect(sbadm.slice(0, sbadm.indexOf("</substanceAdministration>"))).not.toContain(
      "<effectiveTime",
    );
    expect(grafted.toString()).not.toContain("effectiveTime nullFlavor");
  });

  it("names NEITHER emitter, so the same message is true of both writers", () => {
    // The message was worded around `buildCcda` while that was the only writer
    // raising it, which made it false the moment a second one did. A warning that
    // misdescribes its own document is the defect this repo names explicitly, and
    // which call produced a document is not a fact about the document.
    const built = buildCcda(noTime).warnings[0];
    const edited = editCcda(buildCcda({ patient: { mrn: "M" } }), planEdit(ORDER_NO_TIME))
      .warnings[0];
    expect(edited?.message).toBe(built?.message);
    expect(built?.message).not.toContain("buildCcda");
    expect(built?.message).not.toContain("editCcda");
    // And it does not overclaim in the other direction either. It is scoped to
    // the ACT, not to the document, because `editCcda`'s check covers only what
    // that call wrote: a universal ("the emitted document carries…") would make
    // the warning's ABSENCE read as a guarantee the check never gives.
    expect(built?.message).toContain("Only content the emitting call itself wrote is checked");
    // Still the registry entry rather than anything assembled per call site.
    expect(ALL_WARNING_MESSAGES.has(built?.message ?? "")).toBe(true);
  });

  it("reports the SURVIVING edit when a later one replaces an earlier offending section", () => {
    // The ordering that matters, in the direction the trap below does not cover:
    // the conformant edit is discarded and the offending one survives, so the
    // emitted document IS short the element and the report is about what is
    // there. One report, not two, because one act survived.
    const revised = editCcda(
      buildCcda({ patient: { mrn: "M" } }),
      planEdit(ORDER_WITH_TIME, ORDER_NO_TIME),
    );
    expect(revised.warnings.map((w) => w.code)).toStrictEqual([
      "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
    ]);
    expect(revised.toString()).not.toContain("20240801");
  });

  it("stays silent on an offending act the SOURCE brought, when the edit touched another section", () => {
    // The other half of the scope, and the reason it is not simply "scan the
    // emitted document". An untouched section is the source's content, carried by
    // reference; re-reporting it would make an edit a validator of a document its
    // caller did not write, and would fire again on every later edit of an
    // unrelated section. The act is provably still there and still short.
    const source = parseCcda(
      buildCcda({ patient: { mrn: "M" }, planOfTreatment: [ORDER_NO_TIME] }).toString(),
    );
    const revised = editCcda(source, {
      sections: [{ kind: "medications", mode: "upsert", content: [] }],
    });
    expect(revised.warnings.map((w) => w.code)).not.toContain(
      "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
    );
    const sbadm = revised.toString().slice(revised.toString().indexOf("22.4.42"));
    expect(sbadm.slice(0, sbadm.indexOf("</substanceAdministration>"))).not.toContain(
      "<effectiveTime",
    );
  });

  it("stays silent when the edit grafts a conformant planned medication", () => {
    const revised = editCcda(buildCcda({ patient: { mrn: "M" } }), planEdit(ORDER_WITH_TIME));
    expect(revised.warnings).toEqual([]);
  });

  it("stays silent on the conformant two-edit shape an input-reading check warned on", () => {
    // THE TRAP THAT SIZED THE DESIGN, kept verbatim in shape and still silent.
    // Two planOfTreatment edits in one call: the offending one is discarded by
    // the later one, so the EMITTED document carries the element and is
    // conformant. A check reading the edit LIST reports a SHALL violation about a
    // document that does not have one, and a warning that misdescribes its own
    // document is the defect this repo names explicitly. That version was
    // measured and reverted; this one reads the SURVIVING grafted components, so
    // it sees the conformant act that is there rather than the discarded one that
    // is not. Anyone who moves the check back onto `options.sections` fails here.
    const base = buildCcda({ patient: { mrn: "M" } });
    const revised = editCcda(base, {
      sections: [
        {
          kind: "planOfTreatment",
          mode: "upsert",
          content: [
            {
              kind: "medicationActivity",
              code: { code: "314076", displayName: "Lisinopril 10 MG" },
            },
          ],
        },
        {
          kind: "planOfTreatment",
          mode: "upsert",
          content: [
            {
              kind: "medicationActivity",
              code: { code: "314076", displayName: "Lisinopril 10 MG" },
              effectiveTime: "20240801",
            },
          ],
        },
      ],
    });
    expect(revised.toString()).toContain("20240801");
    expect(revised.warnings.map((w) => w.code)).not.toContain(
      "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
    );
    // The library's own re-parse of the same bytes agrees the document is clean.
    expect(parseCcda(revised.toString()).warnings).toEqual([]);
  });

  it("never fires on a PARSED document, only on a built one", () => {
    // The read path is deliberately unchanged: re-parsing the very XML the
    // builder just emitted (short the SHALL element) raises nothing. Widening
    // this to `parseCcda` would move rows on every third-party document and is
    // its own decision.
    const built = buildCcda(noTime);
    const reparsed = parseCcda(built.toString());
    expect(reparsed.warnings.map((w) => w.code)).not.toContain(
      "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
    );
    expect(reparsed.warnings).toEqual([]);
  });

  it("leaves the emitted XML byte-identical to a build with the diagnostic ignored", () => {
    // The diagnostic is a statement ABOUT the document, never a change TO it:
    // serialization is still a fixed point and the document still round-trips.
    const xml = serializeCcda(buildCcda(noTime));
    expect(parseCcda(xml).toString()).toBe(xml);
  });
});

describe("buildCcda, family history round-trip", () => {
  /** A build carrying two relatives: a deceased father (male, born 1950) whose
   * myocardial infarction (age 57) was his cause of death, and a mother with a
   * living condition, proving the organizer groups conditions by relative and
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
    // Father, relationship defaults to SNOMED CT, demographics preserved.
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
    // Mother, a distinct relative with her own condition.
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

  it("emits nullFlavor=UNK for an unknown relationship and an unknown condition, never guessed", () => {
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

describe("buildCcda, defaults, escaping, and input validation", () => {
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
    // `consultationNote` rather than `dischargeSummary`: the latter is a type the
    // builder emits now, so asking for it is no longer the unhappy path.
    // @ts-expect-error, documentType is typed to the three buildable types; exercise the runtime guard.
    expect(() => buildCcda({ documentType: "consultationNote", patient: { mrn: "M" } })).toThrow(
      TypeError,
    );
  });
});

describe("buildCcda, SHALL effectiveTime conformance (all sections)", () => {
  /** A populated build that supplies NO times anywhere, every SHALL effectiveTime
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
    const xml = serializeCcda(doc);
    // AC-1. The two organizers carry the supplied time in the SHAPE each one's
    // template requires, and the two shapes differ. The Vital Signs Organizer's
    // effectiveTime stays a point, an @value. The Result Organizer's is an interval:
    // CONF:1198-32488 and -32489 require exactly one low and exactly one high
    // whenever the element is present, so the supplied time becomes the low and the
    // high is nullFlavor="UNK" (nothing tells the builder when the panel ended).
    expect(xml).toContain('<effectiveTime value="20240102"/>');
    expect(xml).toContain('<effectiveTime><low value="20240102"/><high nullFlavor="UNK"/>');
  });
});

describe("buildCcda, HL7 v3 TS date-format validation (fail loud, never coerce)", () => {
  // Every caller-supplied date the builder emits routes through the shared
  // assertHl7Ts guard. A malformed date must throw a TypeError at build time,
  // the builder never serializes a schema-invalid or guessed timestamp.

  it("accepts legitimate partial precision (YYYY, YYYYMM, YYYYMMDD) unchanged, warning-free", () => {
    for (const onset of ["2021", "202103", "20210301"]) {
      const doc = buildCcda({
        patient: { mrn: "M" },
        problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" }, onset }],
      });
      expect(doc.warnings).toEqual([]);
      const low = doc.getProblems()[0]?.effectiveTime?.low;
      expect(low?.raw).toBe(onset);
      expect(low?.date).toBeInstanceOf(Date);
    }
  });

  it("accepts full precision with fractional seconds and a ±ZZZZ offset", () => {
    for (const onset of [
      "20210301153045",
      "20210301153045.5",
      "20210301153045-0500",
      "202103011530+00",
    ]) {
      const doc = buildCcda({
        patient: { mrn: "M" },
        problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" }, onset }],
      });
      expect(doc.warnings).toEqual([]);
      expect(doc.getProblems()[0]?.effectiveTime?.low?.date).toBeInstanceOf(Date);
    }
  });

  it("throws TypeError on malformed date shapes (dashes, month names, garbage, empty)", () => {
    for (const bad of ["2026-07-21", "July 2026", "07/21/2026", "not-a-date", "", "2026 07 21"]) {
      expect(() =>
        buildCcda({
          patient: { mrn: "M" },
          problems: [
            { problem: { code: "59621000", displayName: "Essential hypertension" }, onset: bad },
          ],
        }),
      ).toThrow(TypeError);
    }
  });

  it("throws TypeError when an offset or fraction is hung on a value with no time-of-day", () => {
    // A ±ZZZZ offset or a .fraction is only legal once the hour is present
    // (`YYYYMMDDHHMMSS.UUUU[±ZZzz]`). A dropped-dash ISO date such as "2026-0721"
    // must fail loud, not be silently reinterpreted as a -07:21 offset.
    for (const bad of ["2026-0721", "2026+0500", "202607.5", "20260721.5", "20260721-0500"]) {
      expect(() =>
        buildCcda({
          patient: { mrn: "M" },
          problems: [
            { problem: { code: "59621000", displayName: "Essential hypertension" }, onset: bad },
          ],
        }),
      ).toThrow(TypeError);
    }
  });

  it("throws TypeError on calendar-invalid and out-of-range components", () => {
    // Feb 30, month 13, day 00, hour 24, minute 60, structurally digit-shaped
    // but not a real instant; parseV3DateTime rejects each, so the builder must too.
    for (const bad of ["20260230", "20261301", "20260300", "2026030124", "202603011560"]) {
      expect(() =>
        buildCcda({
          patient: { mrn: "M" },
          problems: [
            { problem: { code: "59621000", displayName: "Essential hypertension" }, onset: bad },
          ],
        }),
      ).toThrow(TypeError);
    }
  });

  it("names the offending field and value in the error message", () => {
    expect(() =>
      buildCcda({
        patient: { mrn: "M" },
        problems: [
          {
            problem: { code: "59621000", displayName: "Essential hypertension" },
            onset: "2026-07-21",
          },
        ],
      }),
    ).toThrow(/problem\.onset.*2026-07-21.*HL7 v3/s);
  });

  it("rejects a malformed date at every builder date-emission site", () => {
    const BAD = "2026-07-21"; // dashes, invalid HL7 TS at every site
    const base = { patient: { mrn: "M" as const } };
    // Each entry supplies one malformed date at a distinct emission site.
    const cases: Array<[string, BuildCcdaInit]> = [
      ["patient.birthTime", { patient: { mrn: "M", birthTime: BAD } }],
      ["document.effectiveTime", { ...base, effectiveTime: BAD }],
      [
        "problem.onset",
        {
          ...base,
          problems: [{ problem: { code: "59621000", displayName: "HTN" }, onset: BAD }],
        },
      ],
      [
        "problem.resolution",
        {
          ...base,
          problems: [
            {
              problem: { code: "59621000", displayName: "HTN" },
              status: "resolved",
              resolution: BAD,
            },
          ],
        },
      ],
      [
        "allergy.onset",
        {
          ...base,
          allergies: [{ allergen: { code: "2670", displayName: "Codeine" }, onset: BAD }],
        },
      ],
      [
        "medication.duration.low",
        {
          ...base,
          medications: [
            {
              drug: { code: "314076", displayName: "Lisinopril" },
              dose: { value: 1, unit: "{tablet}" },
              route: { code: "C38288", displayName: "Oral" },
              duration: { low: BAD },
            },
          ],
        },
      ],
      [
        "medication.duration.high",
        {
          ...base,
          medications: [
            {
              drug: { code: "314076", displayName: "Lisinopril" },
              dose: { value: 1, unit: "{tablet}" },
              route: { code: "C38288", displayName: "Oral" },
              duration: { high: BAD },
            },
          ],
        },
      ],
      [
        "allergy.resolution",
        {
          ...base,
          allergies: [
            {
              allergen: { code: "2670", displayName: "Codeine" },
              status: "resolved",
              resolution: BAD,
            },
          ],
        },
      ],
      [
        "vitalsPanel.effectiveTime",
        {
          ...base,
          vitalSigns: [
            {
              effectiveTime: BAD,
              vitals: [
                {
                  code: { code: "8480-6", displayName: "Systolic BP" },
                  quantity: { value: 120, unit: "mm[Hg]" },
                },
              ],
            },
          ],
        },
      ],
      [
        "functionalStatus.effectiveTime",
        {
          ...base,
          functionalStatus: [
            { value: { code: "165245003", displayName: "Able to walk" }, effectiveTime: BAD },
          ],
        },
      ],
      [
        "functionalStatusOrganizer.effectiveTime",
        {
          ...base,
          functionalStatusOrganizers: [
            {
              effectiveTime: BAD,
              findings: [{ value: { code: "165245003", displayName: "Able to walk" } }],
              // The organizer is only written when it carries the Self-Care
              // Activities observation its template SHALL contain, and its own
              // effectiveTime is only read on the path that writes it.
              selfCareActivities: [{ value: { code: "371153006", displayName: "Independent" } }],
            },
          ],
        },
      ],
      [
        "functionalStatusOrganizers[].selfCareActivities[].effectiveTime",
        {
          ...base,
          functionalStatusOrganizers: [
            {
              findings: [{ value: { code: "165245003", displayName: "Able to walk" } }],
              selfCareActivities: [
                { value: { code: "371153006", displayName: "Independent" }, effectiveTime: BAD },
              ],
            },
          ],
        },
      ],
      [
        "mentalStatus.effectiveTime",
        {
          ...base,
          mentalStatus: [
            { value: { code: "247663003", displayName: "Alert" }, effectiveTime: BAD },
          ],
        },
      ],
      [
        "mentalStatusOrganizer.effectiveTime",
        {
          ...base,
          mentalStatusOrganizers: [
            {
              effectiveTime: BAD,
              findings: [{ value: { code: "247663003", displayName: "Alert" } }],
            },
          ],
        },
      ],
      [
        "assessmentScale.effectiveTime",
        {
          ...base,
          functionalStatusScales: [
            {
              code: { code: "85908-2", displayName: "Barthel index" },
              score: 90,
              effectiveTime: BAD,
            },
          ],
        },
      ],
      [
        "plannedItem.effectiveTime",
        {
          ...base,
          planOfTreatment: [
            {
              kind: "observation",
              code: { code: "24357-6", displayName: "Urinalysis" },
              effectiveTime: BAD,
            },
          ],
        },
      ],
      [
        "resultPanel.effectiveTime",
        {
          ...base,
          results: [
            {
              code: { code: "24323-8", displayName: "CMP" },
              effectiveTime: BAD,
              results: [
                {
                  test: { code: "2345-7", displayName: "Glucose" },
                  quantity: { value: 95, unit: "mg/dL" },
                },
              ],
            },
          ],
        },
      ],
      [
        "result.effectiveTime",
        {
          ...base,
          results: [
            {
              code: { code: "24323-8", displayName: "CMP" },
              results: [
                {
                  test: { code: "2345-7", displayName: "Glucose" },
                  quantity: { value: 95, unit: "mg/dL" },
                  effectiveTime: BAD,
                },
              ],
            },
          ],
        },
      ],
      [
        "vital.effectiveTime",
        {
          ...base,
          vitalSigns: [
            {
              vitals: [
                {
                  code: { code: "8480-6", displayName: "Systolic BP" },
                  quantity: { value: 120, unit: "mm[Hg]" },
                  effectiveTime: BAD,
                },
              ],
            },
          ],
        },
      ],
      [
        "immunization.effectiveTime",
        {
          ...base,
          immunizations: [
            { vaccine: { code: "140", displayName: "Influenza" }, effectiveTime: BAD },
          ],
        },
      ],
      [
        "procedure.effectiveTime",
        {
          ...base,
          procedures: [
            { code: { code: "80146002", displayName: "Appendectomy" }, effectiveTime: BAD },
          ],
        },
      ],
      [
        "encounter.period.low",
        {
          ...base,
          encounters: [
            { type: { code: "99213", displayName: "Office visit" }, period: { low: BAD } },
          ],
        },
      ],
      [
        "encounter.period.high",
        {
          ...base,
          encounters: [
            {
              type: { code: "99213", displayName: "Office visit" },
              period: { low: "20240101", high: BAD },
            },
          ],
        },
      ],
      [
        "smokingStatus.effectiveTime",
        {
          ...base,
          smokingStatus: [
            { value: { code: "266919005", displayName: "Never smoker" }, effectiveTime: BAD },
          ],
        },
      ],
      [
        "familyHistory.birthTime",
        {
          ...base,
          familyHistory: [
            {
              relative: {
                relationship: { code: "9947008", displayName: "Father" },
                birthTime: BAD,
              },
              observations: [{ condition: { code: "22298006", displayName: "MI" } }],
            },
          ],
        },
      ],
      [
        "familyHistory.observation.effectiveTime",
        {
          ...base,
          familyHistory: [
            {
              relative: { relationship: { code: "9947008", displayName: "Father" } },
              observations: [
                { condition: { code: "22298006", displayName: "MI" }, effectiveTime: BAD },
              ],
            },
          ],
        },
      ],
    ];
    for (const [label, init] of cases) {
      try {
        buildCcda(init);
        throw new Error(`expected ${label} to reject a malformed date but it did not`);
      } catch (e) {
        expect(e, label).toBeInstanceOf(TypeError);
        expect((e as Error).message, label).toContain("HL7 v3");
      }
    }
  });
});

describe("buildCcda, Referral Note document type", () => {
  /**
   * A Referral Note carrying the reconciliation triad plus its narrative SHALL
   * sections. Grounded in the CC0 onc-healthit ToC Referral Note certification
   * sample (`170.315_b1_toc_amb_rn_r21_sample1`): document code `57133-1`, and
   * the Reason for Referral (V2) / Assessment / Plan of Treatment sections.
   */
  const RN_INIT: BuildCcdaInit = {
    documentType: "referralNote",
    patient: { mrn: "RN001", given: ["Jane"], family: "Doe", gender: "F", birthTime: "19600101" },
    problems: [
      {
        problem: { code: "271737000", displayName: "Anemia" },
        status: "active",
        onset: "20240101",
      },
    ],
    allergies: [{ noKnownAllergy: true }],
    medications: [
      {
        drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
        dose: { value: 1, unit: "{tablet}" },
        route: { code: "C38288", displayName: "Oral" },
      },
    ],
    reasonForReferral: "Referred to Community Health for suspected anemia and high fever.",
    assessment: "Fever with suspected anemia; monitor temperature and blood pressure.",
    planOfTreatment: [
      { kind: "procedure", code: { code: "396550006", displayName: "Blood test" } },
    ],
  };

  it("specializes the header with the Referral Note document code + templateId", () => {
    const doc = buildCcda(RN_INIT);
    expect(doc.documentType).toBe("referralNote");
    expect(doc.header.code?.code).toBe("57133-1");
    expect(doc.header.code?.codeSystem).toBe("2.16.840.1.113883.6.1");
    expect(doc.header.title).toBe("Referral Note");
    expect(serializeCcda(doc)).toContain(
      'root="2.16.840.1.113883.10.20.22.1.14" extension="2015-08-01"',
    );
  });

  it("honors a title override while keeping the Referral Note document code", () => {
    const doc = buildCcda({ ...RN_INIT, title: "Cardiology referral" });
    expect(doc.header.title).toBe("Cardiology referral");
    expect(doc.header.code?.code).toBe("57133-1");
  });

  it("emits a zero-warning, fixed-point round-trip Referral Note", () => {
    const doc = buildCcda(RN_INIT);
    expect(doc.warnings).toEqual([]);
    const xml = serializeCcda(doc);
    expect(parseCcda(xml).toString()).toBe(xml);
  });

  it("emits the Referral Note SHALL section set, every section recognized", () => {
    const doc = buildCcda(RN_INIT);
    for (const key of [
      "problems",
      "allergies",
      "medications",
      "reasonForReferral",
      "assessment",
      "planOfTreatment",
    ]) {
      expect(doc.findSection(key), key).toBeDefined();
    }
  });

  it("round-trips the reconciliation triad entries", () => {
    const doc = buildCcda(RN_INIT);
    expect(doc.getProblems()).toHaveLength(1);
    expect(doc.getProblems()[0]?.problems[0]?.value?.code).toBe("271737000");
    // "No known allergies" is a negation, never collapsed to unknown.
    expect(doc.getAllergies()[0]?.allergies[0]?.noKnownAllergy).toBe(true);
    expect(doc.getMedications()).toHaveLength(1);
    expect(doc.getMedications()[0]?.drug?.code).toBe("314076");
  });

  it("round-trips the narrative Reason for Referral + Assessment text", () => {
    const doc = buildCcda(RN_INIT);
    expect(doc.findSection("reasonForReferral")?.narrativeText).toContain("suspected anemia");
    expect(doc.findSection("assessment")?.narrativeText).toContain("monitor temperature");
  });

  it("emits the Assessment templateId root-only (unversioned in R2.1, no @extension)", () => {
    const xml = serializeCcda(buildCcda(RN_INIT));
    expect(xml).toContain('<templateId root="2.16.840.1.113883.10.20.22.2.8"/>');
    expect(xml).not.toContain('root="2.16.840.1.113883.10.20.22.2.8" extension');
    // The Reason for Referral (V2) carries its IHE root + the 2014-06-09 stamp.
    expect(xml).toContain(
      '<templateId root="1.3.6.1.4.1.19376.1.5.3.1.3.1" extension="2014-06-09"/>',
    );
  });

  it("emits every Referral Note SHALL section even with no clinical content", () => {
    const doc = buildCcda({ documentType: "referralNote", patient: { mrn: "RN002" } });
    expect(doc.warnings).toEqual([]);
    for (const key of [
      "problems",
      "allergies",
      "medications",
      "reasonForReferral",
      "assessment",
      "planOfTreatment",
    ]) {
      expect(doc.findSection(key), key).toBeDefined();
    }
    expect(doc.getProblems()).toEqual([]);
    expect(doc.getMedications()).toEqual([]);
    // Results / Vital Signs are not Referral Note SHALL sections, not fabricated.
    expect(doc.findSection("results")).toBeUndefined();
    expect(doc.findSection("vitalSigns")).toBeUndefined();
  });

  it("adds Results / Vital Signs to a Referral Note only when the caller supplies them", () => {
    const doc = buildCcda({
      documentType: "referralNote",
      patient: { mrn: "RN003" },
      results: [
        {
          code: { code: "24323-8", displayName: "CMP" },
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
              code: { code: "8480-6", displayName: "Systolic BP" },
              quantity: { value: 120, unit: "mm[Hg]" },
            },
          ],
        },
      ],
    });
    expect(doc.warnings).toEqual([]);
    expect(doc.findSection("results")).toBeDefined();
    expect(doc.findSection("vitalSigns")).toBeDefined();
  });

  it("rejects an unsupported document type with a TypeError", () => {
    // `consultationNote` rather than `dischargeSummary`: the latter is a type the
    // builder emits now, so asking for it is no longer the unhappy path.
    // @ts-expect-error, exercise the runtime guard for untyped (JS) callers.
    expect(() => buildCcda({ documentType: "consultationNote", patient: { mrn: "X" } })).toThrow(
      TypeError,
    );
  });
});

describe("buildCcda, CDA R2 observation element ordering (text before statusCode/value)", () => {
  // POCD_MT000040.Observation is an xs:sequence: realmCode, typeId, templateId,
  // id, code, derivationExpr, text, statusCode, effectiveTime, …, value, …, so
  // `<text>` MUST precede statusCode/effectiveTime/value. Emitting the narrative
  // reference later is XSD-invalid (it fails the core-CDA-R2 XSD stage before the
  // Schematron even runs), not a cosmetic nit. These three builders previously
  // appended `<text>` after the value (and, for allergies, after every
  // entryRelationship); this locks the schema order in.
  const orderOf = (names: string[]) => ({
    text: names.indexOf("text"),
    statusCode: names.indexOf("statusCode"),
    value: names.indexOf("value"),
  });

  it("Problem Observation (…22.4.4) emits text before statusCode and value", () => {
    const xml = serializeCcda(
      buildCcda({
        patient: { mrn: "M" },
        problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
      }),
    );
    const names = observationChildOrder(xml, PROBLEM_OBSERVATION);
    const o = orderOf(names);
    expect(o.text).toBeGreaterThanOrEqual(0);
    expect(o.text).toBeLessThan(o.statusCode);
    expect(o.text).toBeLessThan(o.value);
  });

  it("Allergy Observation (…22.4.7) emits text before statusCode, value, and entryRelationship", () => {
    const xml = serializeCcda(
      buildCcda({
        patient: { mrn: "M" },
        allergies: [
          {
            allergen: { code: "7980", displayName: "Penicillin" },
            reaction: { code: "247472004", displayName: "Hives" },
          },
        ],
      }),
    );
    const names = observationChildOrder(xml, ALLERGY_OBSERVATION);
    const o = orderOf(names);
    expect(o.text).toBeGreaterThanOrEqual(0);
    expect(o.text).toBeLessThan(o.statusCode);
    expect(o.text).toBeLessThan(o.value);
    expect(o.text).toBeLessThan(names.indexOf("entryRelationship"));
  });

  it("Smoking Status Observation (…22.4.78) emits text before statusCode and value", () => {
    const xml = serializeCcda(
      buildCcda({
        patient: { mrn: "M" },
        smokingStatus: [{ value: { code: "266919005", displayName: "Never smoker" } }],
      }),
    );
    const names = observationChildOrder(xml, SMOKING_STATUS_OBSERVATION);
    const o = orderOf(names);
    expect(o.text).toBeGreaterThanOrEqual(0);
    expect(o.text).toBeLessThan(o.statusCode);
    expect(o.text).toBeLessThan(o.value);
  });
});

/**
 * The narrative is the half a clinician reads, and the builder regenerates it
 * from the same `BuildCode.displayName` the coded entry carries, linking the two
 * with a `<reference>`. `displayName` is required by `BuildCode`, so none of this
 * is reachable from a typed caller, but the package ships JavaScript and does its
 * input validation at runtime, so every narrative slot was reachable with it
 * absent, and eight of them rendered a confident sentence the entry did not
 * support.
 *
 * The worst was the Allergies section: `label ?? "No known allergies"` gave a
 * **positively-asserted** allergy (`value` `419199007`, NO `negationInd`, the
 * allergen on the `participant`) a narrative byte-identical to the **negated**
 * no-known-allergies form, linked to that entry by an intact `<reference>` and
 * drawing zero warnings, so the attested half asserted the clinical opposite of
 * its own entry. Seven more slots wrote the literal string `undefined`.
 *
 * Every assertion below reads the **emitted bytes**, and the allergy ones follow
 * the document's own `<reference>` linkage so the narrative and the entry are
 * graded together rather than separately.
 */
describe("buildCcda, a narrative label is refused rather than fabricated", () => {
  /** A well-formed code, used to isolate the one slot each row is measuring. */
  const OK_CODE = { code: "1", displayName: "Ok" };

  /**
   * Every Allergy-Intolerance Observation in `xml`, read as the pair the defect
   * inverted: whether the observation is negated, and the narrative text its own
   * `<text><reference>` resolves to. Throws when a reference does not resolve, so
   * a broken linkage cannot be mistaken for agreement.
   */
  function allergyNarrativePairs(xml: string): { negated: boolean; narrative: string }[] {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const contents = new Map<string, string>();
    for (const c of Array.from(doc.getElementsByTagName("content"))) {
      const contentId = c.getAttribute("ID");
      if (contentId !== null) contents.set(contentId, c.textContent ?? "");
    }
    const pairs: { negated: boolean; narrative: string }[] = [];
    for (const obs of Array.from(doc.getElementsByTagName("observation"))) {
      const templateId = Array.from(obs.childNodes).find(
        (n): n is Element => (n as Element).nodeName === "templateId",
      );
      if (templateId?.getAttribute("root") !== ALLERGY_OBSERVATION) continue;
      const reference = Array.from(obs.getElementsByTagName("reference")).find((r) =>
        (r.getAttribute("value") ?? "").startsWith("#"),
      );
      const target = (reference?.getAttribute("value") ?? "").slice(1);
      const narrative = contents.get(target);
      if (narrative === undefined) {
        throw new Error(`allergy observation references "#${target}", which resolves to nothing`);
      }
      pairs.push({ negated: obs.getAttribute("negationInd") === "true", narrative });
    }
    return pairs;
  }

  /**
   * The anti-inversion invariant, over the emitted bytes: the no-known-allergies
   * sentence appears as an allergy's linked narrative **iff** that allergy's own
   * observation is negated.
   */
  function narrativeAgreesWithEntry(xml: string): boolean {
    return allergyNarrativePairs(xml).every(
      ({ negated, narrative }) => negated === (narrative === "No known allergies"),
    );
  }

  const PENICILLIN = { code: "7980", codeSystem: "2.16.840.1.113883.6.88" };

  function allergyXml(allergen: Record<string, string>): string {
    return serializeCcda(
      buildCcda({
        patient: { mrn: "M" },
        // @ts-expect-error, `displayName` is required; exercise the runtime guard.
        allergies: [{ allergen, reaction: { code: "247472004", displayName: "Hives" } }],
      }),
    );
  }

  it("NEGATIVE CONTROL: the invariant goes red on an inverted document", () => {
    // The exact shape the defect emitted, reconstructed from a document this
    // builder still accepts by moving ONLY the narrative sentence: the entry is
    // untouched, so it stays positively asserted while its linked narrative reads
    // as the negation. If this passed, every assertion below would be vacuous.
    const sound = allergyXml({ ...PENICILLIN, displayName: "Penicillin G" });
    expect(narrativeAgreesWithEntry(sound)).toBe(true);
    const inverted = sound.replace(">Penicillin G</content>", ">No known allergies</content>");
    expect(inverted).not.toBe(sound);
    expect(inverted).toContain(">No known allergies</content>");
    expect(inverted).not.toContain('negationInd="true"');
    expect(narrativeAgreesWithEntry(inverted)).toBe(false);
  });

  it("refuses a positively-asserted allergy whose allergen carries no displayName", () => {
    // NON-VACUITY: the same fixture WITH a label builds, reaches the narrative
    // branch, and emits the positively-asserted entry the defect mis-narrated.
    const sound = allergyXml({ ...PENICILLIN, displayName: "Penicillin G" });
    expect(sound).toContain(">Penicillin G</content>");
    expect(sound).toContain('code="419199007"');
    expect(sound).toContain('<code code="7980" codeSystem="2.16.840.1.113883.6.88"');
    expect(sound).not.toContain("negationInd");
    expect(sound).not.toContain("No known allergies");
    expect(allergyNarrativePairs(sound)).toEqual([{ negated: false, narrative: "Penicillin G" }]);

    // THE DEFECT: with the label absent this built a document whose narrative was
    // "No known allergies" beside that same un-negated entry, with zero warnings.
    expect(() => allergyXml(PENICILLIN)).toThrow(TypeError);
    expect(() => allergyXml(PENICILLIN)).toThrow(/`allergies\[\]\.allergen\.displayName`/);
    // An empty or whitespace-only label is refused for the same reason: there is
    // no narrative in it either. Reachable from TypeScript, unlike the case above.
    expect(() => allergyXml({ ...PENICILLIN, displayName: "" })).toThrow(TypeError);
    expect(() => allergyXml({ ...PENICILLIN, displayName: "   " })).toThrow(TypeError);
  });

  it("emits the no-known-allergies narrative only through a negated entry", () => {
    const nka = serializeCcda(
      buildCcda({
        patient: { mrn: "M" },
        allergies: [
          { noKnownAllergy: true },
          { allergen: { ...PENICILLIN, displayName: "Penicillin G" } },
        ],
      }),
    );
    expect(nka).toContain(">No known allergies</content>");
    expect(nka).toContain('negationInd="true"');
    expect(allergyNarrativePairs(nka)).toEqual([
      { negated: true, narrative: "No known allergies" },
      { negated: false, narrative: "Penicillin G" },
    ]);
    expect(narrativeAgreesWithEntry(nka)).toBe(true);
  });

  /**
   * Every narrative slot the builder fills from a caller-supplied `BuildCode`,
   * with the label absent. On `0c4d67f` the allergy row emitted the negation
   * sentence and the rest emitted the literal string `undefined` (bare, or
   * interpolated into a `label: value` line, or replaced by a fabricated
   * "unknown"), all with zero warnings. Each now refuses, naming its own field.
   */
  const SLOTS: ReadonlyArray<readonly [string, string, unknown]> = [
    ["problems[].problem", "problems", { problems: [{ problem: {} }] }],
    ["allergies[].allergen", "allergies", { allergies: [{ allergen: {} }] }],
    ["medications[].drug", "medications", { medications: [{ drug: {} }] }],
    [
      "results[].results[].test",
      "results",
      { results: [{ code: OK_CODE, results: [{ test: {}, stringValue: "x" }] }] },
    ],
    [
      "results[].results[].codedValue",
      "results",
      { results: [{ code: OK_CODE, results: [{ test: OK_CODE, codedValue: {} }] }] },
    ],
    [
      "vitalSigns[].vitals[].code",
      "vital signs",
      { vitalSigns: [{ vitals: [{ code: {}, quantity: { value: 1, unit: "kg" } }] }] },
    ],
    ["immunizations[].vaccine", "immunizations", { immunizations: [{ vaccine: {} }] }],
    ["procedures[].code", "procedures", { procedures: [{ code: {} }] }],
    ["encounters[].type", "encounters", { encounters: [{ type: {} }] }],
    [
      "pastMedicalHistory[].problem",
      "past medical history",
      { pastMedicalHistory: [{ problem: {} }] },
    ],
    [
      "planOfTreatment[].code",
      "plan of treatment",
      { planOfTreatment: [{ kind: "observation", code: {} }] },
    ],
    [
      "familyHistory[].relative.relationship",
      "family history",
      {
        familyHistory: [{ relative: { relationship: {} }, observations: [{ condition: OK_CODE }] }],
      },
    ],
    [
      "familyHistory[].observations[].condition",
      "family history",
      {
        familyHistory: [{ relative: { relationship: OK_CODE }, observations: [{ condition: {} }] }],
      },
    ],
    ["smokingStatus[].value", "social history", { smokingStatus: [{ value: {} }] }],
    ["functionalStatus[].value", "functional status", { functionalStatus: [{ value: {} }] }],
    ["mentalStatus[].value", "mental status", { mentalStatus: [{ value: {} }] }],
    // The organizer-nested twins of the two rows above. The SAME narrative shape
    // is reached from a SECOND input path, so the message has to name the path the
    // caller actually used: a refusal naming `functionalStatus[].value` for a
    // finding supplied under `functionalStatusOrganizers` is a diagnostic about a
    // field they never set.
    [
      "functionalStatusOrganizers[].findings[].value",
      "functional status organizers",
      { functionalStatusOrganizers: [{ code: OK_CODE, findings: [{ value: {} }] }] },
    ],
    [
      "mentalStatusOrganizers[].findings[].value",
      "mental status organizers",
      { mentalStatusOrganizers: [{ code: OK_CODE, findings: [{ value: {} }] }] },
    ],
    [
      "functionalStatusScales[].code",
      "functional status scales",
      { functionalStatusScales: [{ code: {}, score: 3 }] },
    ],
    [
      "mentalStatusScales[].code",
      "mental status scales",
      { mentalStatusScales: [{ code: {}, score: 3 }] },
    ],
  ];

  it.each(SLOTS)("refuses %s, the narrative slot in the %s section", (field, _section, extra) => {
    const init: BuildCcdaInit = { patient: { mrn: "M" }, ...(extra as Partial<BuildCcdaInit>) };
    expect(() => buildCcda(init)).toThrow(TypeError);
    expect(() => buildCcda(init)).toThrow(
      new RegExp(`\`${field.replaceAll("[", "\\[").replaceAll("]", "\\]")}\\.displayName\``),
    );
  });

  it("refuses through editCcda too, the second writer of the same sections", () => {
    // `editCcda` grafts its sections with `buildSectionComponent`, the same
    // emitter, so the guard reaches the second writer for free. `#99` paid for
    // the lesson that a check on one emitter is not a check on the document.
    const source = buildCcda({ patient: { mrn: "M" } });
    const edit = (allergen: object): (() => unknown) => {
      return () =>
        editCcda(source, {
          sections: [
            // @ts-expect-error, `displayName` is required; exercise the runtime guard.
            { kind: "allergies", mode: "upsert", content: [{ allergen }] },
          ],
        });
    };
    expect(edit({ code: "7980" })).toThrow(TypeError);
    expect(edit({ code: "7980" })).toThrow(/`allergies\[\]\.allergen\.displayName`/);
    // NON-VACUITY: labelled, the same edit lands and carries the label, not the
    // negation sentence, and the entry it links to is not negated.
    const edited = editCcda(source, {
      sections: [
        {
          kind: "allergies",
          mode: "upsert",
          content: [{ allergen: { ...PENICILLIN, displayName: "Penicillin G" } }],
        },
      ],
    });
    const xml = edited.toString();
    expect(xml).toContain(">Penicillin G</content>");
    expect(xml).not.toContain("No known allergies");
    expect(allergyNarrativePairs(xml)).toEqual([{ negated: false, narrative: "Penicillin G" }]);
  });

  it("NON-VACUITY: every slot above builds and reaches its narrative when labelled", () => {
    // The same eighteen fixtures with a label, proving each one genuinely reaches
    // the narrative branch the refusal guards rather than failing somewhere else.
    for (const [field, , extra] of SLOTS) {
      const labelled = JSON.parse(
        JSON.stringify(extra).replaceAll("{}", '{"code":"9","displayName":"Labelled"}'),
      ) as Partial<BuildCcdaInit>;
      const init: BuildCcdaInit = { patient: { mrn: "M" }, ...labelled };
      const xml = serializeCcda(buildCcda(init));
      expect(xml, field).toContain("Labelled");
      expect(xml, field).not.toContain(">undefined<");
      expect(xml, field).not.toContain("No known allergies");
    }
  });
  // S0352-ccda-7's own suite follows the closing brace below.
});

/**
 * S0352-ccda-7: the inpatient Discharge Summary, the third document type `buildCcda` emits.
 *
 * Every test below names the criterion it grades QUALIFIED with this spec's id (`S0352 AC-n`).
 * The conformance suite already carries bare `AC-1` through `AC-8` names from an earlier spec,
 * so an unqualified id here would grade nothing anybody could find (`testing` T1).
 */
describe("S0352-ccda-7: buildCcda emits an inpatient Discharge Summary", () => {
  /** The Discharge Summary document template, read off the pinned normative R2.1 Schematron. */
  const DISCHARGE_SUMMARY_TEMPLATE = "2.16.840.1.113883.10.20.22.1.8";
  /** The Hospital Course Section, an IHE PCC template outside this parser's section catalog. */
  const HOSPITAL_COURSE_ROOT = "1.3.6.1.4.1.19376.1.5.3.1.3.5";
  /** Its LOINC `code`, CONF:81-15488. */
  const HOSPITAL_COURSE_LOINC = "8648-8";
  /** The Discharge Diagnosis Section (V3) and the Hospital Discharge Diagnosis act (V3). */
  const DISCHARGE_DIAGNOSIS_SECTION = "2.16.840.1.113883.10.20.22.2.24";
  const DISCHARGE_DIAGNOSIS_ACT = "2.16.840.1.113883.10.20.22.4.33";

  /** A Discharge Summary carrying nothing but a patient and a fixed document time. */
  const MINIMAL: BuildCcdaInit = {
    documentType: "dischargeSummary",
    patient: { mrn: "MRN002" },
    effectiveTime: "20240102030405+0000",
  };

  /** The same document with every Discharge Summary input supplied. */
  const POPULATED_SUMMARY: BuildCcdaInit = {
    ...MINIMAL,
    hospitalCourse: "Admitted for observation. Uneventful course, discharged home.",
    dischargeDiagnoses: [
      { problem: { code: "59621000", displayName: "Essential hypertension" }, onset: "20240102" },
    ],
    encompassingEncounter: {
      period: { low: "20240102", high: "20240108" },
      dischargeDisposition: { code: "01", displayName: "Discharged to Home or Self Care" },
    },
  };

  /** The `<componentOf>` element's own text, so a test can assert on it and nothing else. */
  function componentOfXml(xml: string): string {
    const start = xml.indexOf("<componentOf>");
    const end = xml.indexOf("</componentOf>");
    expect(start, "the document carries no componentOf").toBeGreaterThan(-1);
    return xml.slice(start, end + "</componentOf>".length);
  }

  describe("S0352 AC-1: a typed init reparses with a known warning set and round-trips exactly", () => {
    it("S0352 AC-1: every supported type round-trips to an identical string", () => {
      const inits: BuildCcdaInit[] = [
        { patient: { mrn: "M" } },
        { documentType: "referralNote", patient: { mrn: "M" } },
        MINIMAL,
        POPULATED_SUMMARY,
      ];
      for (const init of inits) {
        const xml = serializeCcda(buildCcda(init));
        expect(serializeCcda(parseCcda(xml)), init.documentType ?? "ccd").toBe(xml);
      }
    });

    it("S0352 AC-1: a CCD and a Referral Note still reparse with zero warnings", () => {
      // The half of AC-1 that is unqualified, asserted so the Discharge Summary's documented
      // exception below cannot quietly become the rule for the other two types.
      expect(buildCcda({ patient: { mrn: "M" } }).warnings).toEqual([]);
      expect(buildCcda({ documentType: "referralNote", patient: { mrn: "M" } }).warnings).toEqual(
        [],
      );
    });

    it("S0352 AC-1: a Discharge Summary reparses with exactly one warning, for the Hospital Course Section", () => {
      // DOCUMENTED DEVIATION, recorded in this item's notes.md. The Discharge Summary's errors
      // rule SHALL contain a Hospital Course Section (CONF:1198-30522), and that section is an
      // IHE PCC template outside this parser's section catalog, so the parser reports that it
      // does not know the template. Emitting the section is not optional (`pnpm conformance`
      // fails without it) and recognizing it is a parser change this spec puts out of scope.
      // The assertion is EXACT rather than a tolerance: one warning, that code, that section. A
      // second warning of any kind, or this one naming a different section, fails.
      for (const init of [MINIMAL, POPULATED_SUMMARY]) {
        const warnings = buildCcda(init).warnings;
        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.code).toBe("UNKNOWN_SECTION_CODE");
        expect(warnings[0]?.position?.sectionCode).toBe(HOSPITAL_COURSE_LOINC);
        expect(warnings[0]?.position?.templateId).toBe(HOSPITAL_COURSE_ROOT);
      }
    });
  });

  describe("S0352 AC-2: every SHALL section of the type is emitted, empty ones as no-information", () => {
    it("S0352 AC-2: an init with no clinical content at all emits all four SHALL sections", () => {
      const xml = serializeCcda(buildCcda(MINIMAL));
      // The four the document's errors rule names, in the rule's own order: Allergies
      // (CONF:1198-30520), Hospital Course (-30522), Discharge Diagnosis (-30524), Plan of
      // Treatment (-30528). Asserted by template identifier rather than by title, because the
      // identifier is what the normative rule matches on.
      const roots = [
        '<templateId root="2.16.840.1.113883.10.20.22.2.6" extension="2015-08-01"/>',
        `<templateId root="${HOSPITAL_COURSE_ROOT}"/>`,
        `<templateId root="${DISCHARGE_DIAGNOSIS_SECTION}" extension="2015-08-01"/>`,
        '<templateId root="2.16.840.1.113883.10.20.22.2.10" extension="2014-06-09"/>',
      ];
      for (const root of roots) expect(xml, root).toContain(root);
      for (let i = 1; i < roots.length; i++) {
        expect(xml.indexOf(roots[i - 1] ?? ""), roots[i]).toBeLessThan(xml.indexOf(roots[i] ?? ""));
      }
    });

    it("S0352 AC-2: each unsupplied section is an EXPLICIT no-information section, not an absent one", () => {
      const xml = serializeCcda(buildCcda(MINIMAL));
      // Four sections, four `nullFlavor="NI"` shells with a "No information" narrative and no
      // entries. A fabricated narrative in any of them would be clinical content nobody supplied.
      expect(xml.split('<section nullFlavor="NI">')).toHaveLength(5);
      expect(xml.split("<text>No information</text>")).toHaveLength(5);
      expect(xml).not.toContain("<entry>");
    });

    it("S0352 AC-2: the Discharge Diagnosis Section carries the code translation its template requires", () => {
      // CONF:1198-32834: the section `code` SHALL contain exactly one translation `78375-3`.
      // Unconditional, so the empty section carries it too.
      for (const init of [MINIMAL, POPULATED_SUMMARY]) {
        expect(serializeCcda(buildCcda(init))).toContain(
          '<translation code="78375-3" codeSystem="2.16.840.1.113883.6.1"',
        );
      }
    });

    it("S0352 AC-2: supplied diagnoses become Problem Observations under ONE Hospital Discharge Diagnosis act", () => {
      const xml = serializeCcda(
        buildCcda({
          ...POPULATED_SUMMARY,
          dischargeDiagnoses: [
            { problem: { code: "59621000", displayName: "Essential hypertension" } },
            { problem: { code: "44054006", displayName: "Type 2 diabetes mellitus" } },
          ],
        }),
      );
      // CONF:1198-7666 puts every diagnosis under one act as an entryRelationship, rather than
      // one act per diagnosis: the act is the "these are the discharge diagnoses" assertion.
      expect(xml.split(`<templateId root="${DISCHARGE_DIAGNOSIS_ACT}"`)).toHaveLength(2);
      expect(xml).toContain(">Essential hypertension</content>");
      expect(xml).toContain(">Type 2 diabetes mellitus</content>");
    });
  });

  describe("S0352 AC-3: the componentOf encompassingEncounter the template requires", () => {
    it("S0352 AC-3: a Discharge Summary carries componentOf with both bounds and a disposition", () => {
      const frame = componentOfXml(serializeCcda(buildCcda(POPULATED_SUMMARY)));
      expect(frame).toContain("<encompassingEncounter>");
      expect(frame).toContain('<low value="20240102"/>');
      expect(frame).toContain('<high value="20240108"/>');
      expect(frame).toContain('<dischargeDispositionCode code="01"');
    });

    it("S0352 AC-3: componentOf sits in the CDA R2 ClinicalDocument element order", () => {
      // POCD_MT000040.ClinicalDocument is an xs:sequence ending
      // …authorization*, componentOf?, component. Emitting componentOf anywhere else is
      // XSD-invalid and fails before the Schematron is reached, which is not cosmetic.
      const xml = serializeCcda(buildCcda(POPULATED_SUMMARY));
      expect(xml.indexOf("<custodian>")).toBeLessThan(xml.indexOf("<componentOf>"));
      expect(xml.indexOf("</componentOf>")).toBeLessThan(
        xml.indexOf("<component><structuredBody>"),
      );
    });

    it("S0352 AC-3: the encounter's own children are in the CDA R2 EncompassingEncounter order", () => {
      // POCD_MT000040.EncompassingEncounter: … id*, code?, effectiveTime,
      // dischargeDispositionCode?, responsibleParty?, … The id is CONF:1198-9959, which lives in
      // the shared US Realm Header rule rather than in the Discharge Summary's own.
      const frame = componentOfXml(serializeCcda(buildCcda(POPULATED_SUMMARY)));
      expect(frame.indexOf("<id ")).toBeLessThan(frame.indexOf("<effectiveTime>"));
      expect(frame.indexOf("<effectiveTime>")).toBeLessThan(
        frame.indexOf("<dischargeDispositionCode"),
      );
    });

    it("S0352 AC-3: neither a CCD nor a Referral Note carries the frame", () => {
      // Emitting an encounter for a type whose rule does not carry the frame would assert an
      // encounter the document never claimed.
      const inits: BuildCcdaInit[] = [
        { patient: { mrn: "M" } },
        { documentType: "referralNote", patient: { mrn: "M" } },
      ];
      for (const init of inits) {
        expect(serializeCcda(buildCcda(init))).not.toContain("<componentOf>");
      }
    });
  });

  describe("S0352 AC-4 / AC-9 / AC-12: the other nine types are refused, by derivation", () => {
    it("S0352 AC-4: an unimplemented type throws a TypeError NAMING the requested type", () => {
      const ask = (): unknown =>
        buildCcda({ documentType: "carePlan", patient: { mrn: "M" } } as unknown as BuildCcdaInit);
      expect(ask).toThrow(TypeError);
      expect(ask).toThrow(/carePlan/);
    });

    it("S0352 AC-9: exactly three of the exported enumeration build, and the other nine throw", () => {
      // The nine are DERIVED from `DOCUMENT_TYPES`, the package's own exported enumeration,
      // rather than from a list written into this test: a thirteenth recognized type joins this
      // walk the moment it is recognized, and it has to be classified deliberately.
      expect(DOCUMENT_TYPES).toHaveLength(12);
      const built: string[] = [];
      const refused: string[] = [];
      for (const documentType of DOCUMENT_TYPES) {
        try {
          const doc = buildCcda({
            documentType,
            patient: { mrn: "M" },
          } as unknown as BuildCcdaInit);
          expect(doc.documentType, documentType).toBe(documentType);
          built.push(documentType);
        } catch (error) {
          expect(error, documentType).toBeInstanceOf(TypeError);
          // The refusal names the type asked for, so a caller is told WHICH request was refused.
          expect((error as TypeError).message, documentType).toContain(documentType);
          refused.push(documentType);
        }
      }
      expect([...built].sort()).toStrictEqual(["ccd", "dischargeSummary", "referralNote"]);
      expect(refused).toHaveLength(9);
      expect([...built, ...refused].sort()).toStrictEqual([...DOCUMENT_TYPES].sort());
    });

    it("S0352 AC-12: a value outside the enumeration is REFUSED, not crashed into and not defaulted", () => {
      // Including the values an untyped JavaScript caller can reach the builder with. The
      // prototype keys are the reason the guard is `Object.hasOwn` and not `in`: with `in` they
      // pass the membership test and index the spec table to a function.
      //
      // THE ASSERTION IS THE REFUSAL'S OWN MESSAGE, NOT MERELY `TypeError`. Measured: with the
      // guard written as `in`, every prototype key below passes the membership test and the
      // builder then dies on `Cannot read properties of undefined (reading 'displayName')`,
      // which IS a TypeError and which a bare `.toThrow(TypeError)` accepts. A crash and a
      // refusal are the one pair this criterion exists to tell apart, exactly as
      // `test/conformance/fail-safe.test.ts` asserts an exact exit code rather than a non-zero
      // one, so the message has to be the guard's.
      for (const documentType of [
        "",
        "ccd ",
        "CCD",
        "notADocumentType",
        "toString",
        "constructor",
        "__proto__",
        "hasOwnProperty",
      ]) {
        const ask = (): unknown =>
          buildCcda({ documentType, patient: { mrn: "M" } } as unknown as BuildCcdaInit);
        expect(ask, documentType).toThrow(TypeError);
        expect(ask, documentType).toThrow(/buildCcda: documentType .* is not supported yet/);
      }
    });

    it("S0352 AC-4: a refused build emits no document at all", () => {
      // "rather than emit a document resembling it": the throw has to be the whole outcome, so
      // nothing is returned and nothing partially built escapes.
      let emitted: unknown;
      let refused = false;
      try {
        emitted = buildCcda({
          documentType: "operativeNote",
          patient: { mrn: "M" },
        } as unknown as BuildCcdaInit);
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
      expect(emitted).toBeUndefined();
    });
  });

  describe("S0352 AC-5: a reparsed Discharge Summary reports its type and its obligation", () => {
    it("S0352 AC-5: the reparse reports dischargeSummary, no missing section, and an evaluated obligation", () => {
      const doc = buildCcda(POPULATED_SUMMARY);
      expect(doc.documentType).toBe("dischargeSummary");
      const present = new Set(
        doc.sections
          .map((section) => section.key)
          .filter((key): key is string => key !== undefined),
      );
      expect(missingRequiredSections("dischargeSummary", present)).toStrictEqual([]);
      expect(requiredSectionStatus("dischargeSummary").evaluation).toBe("evaluated");
      // The document carries the R2.1 stamp on its document-level templateId, which is what puts
      // it inside the stamp-scoped half of the table rather than the R1.1-origin reduction.
      expect(serializeCcda(doc)).toContain(
        `<templateId root="${DISCHARGE_SUMMARY_TEMPLATE}" extension="2015-08-01"/>`,
      );
      expect(doc.warnings.some((w) => w.code === "REQUIRED_SECTION_MISSING")).toBe(false);
    });
  });

  describe("S0352 AC-6: the encounter frame is surfaced as supplied, never derived", () => {
    it("S0352 AC-6: both bounds and the disposition read back at the supplied precision and coding", () => {
      const encounter = buildCcda(POPULATED_SUMMARY).header.encompassingEncounter;
      // `raw` is the bound exactly as the document stated it. A day-precision bound stays
      // day-precision: completing it to a timestamp invents a fact (`clinical-safety` C3).
      expect(encounter?.effectiveTime?.low?.raw).toBe("20240102");
      expect(encounter?.effectiveTime?.high?.raw).toBe("20240108");
      expect(encounter?.dischargeDispositionCode?.code).toBe("01");
      expect(encounter?.dischargeDispositionCode?.displayName).toBe(
        "Discharged to Home or Self Care",
      );
      // The code system defaults to the one every member of the value set the constraint names
      // carries, read off the pinned vocabulary artifact rather than from memory.
      expect(encounter?.dischargeDispositionCode?.codeSystem).toBe("2.16.840.1.113883.6.301.5");
    });

    it("S0352 AC-6: a caller-supplied code system is emitted verbatim rather than coerced", () => {
      const encounter = buildCcda({
        ...POPULATED_SUMMARY,
        encompassingEncounter: {
          period: { low: "20240102", high: "20240108" },
          dischargeDisposition: {
            code: "306689006",
            codeSystem: "2.16.840.1.113883.6.96",
            displayName: "Discharge to home",
          },
        },
      }).header.encompassingEncounter;
      expect(encounter?.dischargeDispositionCode?.codeSystem).toBe("2.16.840.1.113883.6.96");
      expect(encounter?.dischargeDispositionCode?.code).toBe("306689006");
    });

    it("S0352 AC-6: no bound is derived from the document effectiveTime or a service event", () => {
      // The document time is deliberately unlike either bound, so a copied value would show.
      const doc = buildCcda({ ...POPULATED_SUMMARY, effectiveTime: "20991231235959+0000" });
      const frame = componentOfXml(serializeCcda(doc));
      expect(frame).not.toContain("20991231");
      expect(doc.header.encompassingEncounter?.effectiveTime?.low?.raw).toBe("20240102");
      // There is no documentationOf service event on this type at all, so nothing could have
      // been taken from one either.
      expect(serializeCcda(doc)).not.toContain("<documentationOf>");
    });
  });

  describe("S0352 AC-11: an omitted encounter slot is an EXPLICIT unknown, never a fabricated value", () => {
    // THE BRANCH TAKEN, ASSERTED EXACTLY. AC-11 admits either an explicit unknown or a typed
    // refusal, and a criterion satisfied by whichever turned up grades neither. The branch taken
    // here is the EXPLICIT UNKNOWN, for both the encounter bound and the disposition code: the
    // normative Schematron requires only that those elements be PRESENT (CONF:1198-8473
    // `count(cda:low)=1`, -8475 `count(cda:high)=1`, -8476 `count(cda:dischargeDispositionCode)=1`)
    // and asserts nothing a `nullFlavor` form violates, so a `nullFlavor="UNK"` slot satisfies
    // every one of them without stating a clinical fact. These tests assert that branch and would
    // fail against the other one.

    it("S0352 AC-11: an omitted encounter bound is nullFlavor UNK and the build does NOT throw", () => {
      const doc = buildCcda({
        ...MINIMAL,
        encompassingEncounter: {
          period: { low: "20240102" },
          dischargeDisposition: { code: "01", displayName: "Discharged to Home or Self Care" },
        },
      });
      const frame = componentOfXml(serializeCcda(doc));
      expect(frame).toContain('<low value="20240102"/>');
      expect(frame).toContain('<high nullFlavor="UNK"/>');
      // Read back as an explicit unknown, NOT as a date, and never as the low copied across.
      const high = doc.header.encompassingEncounter?.effectiveTime?.high;
      expect(high?.nullFlavor).toBe("UNK");
      expect(high?.raw).toBeUndefined();
      expect(high?.date).toBeUndefined();
    });

    it("S0352 AC-11: an omitted low bound takes the same branch", () => {
      const doc = buildCcda({
        ...MINIMAL,
        encompassingEncounter: { period: { high: "20240108" } },
      });
      expect(componentOfXml(serializeCcda(doc))).toContain('<low nullFlavor="UNK"/>');
      const low = doc.header.encompassingEncounter?.effectiveTime?.low;
      expect(low?.nullFlavor).toBe("UNK");
      expect(low?.raw).toBeUndefined();
    });

    it("S0352 AC-11: an omitted discharge disposition is nullFlavor UNK and the build does NOT throw", () => {
      const doc = buildCcda({
        ...MINIMAL,
        encompassingEncounter: { period: { low: "20240102", high: "20240108" } },
      });
      expect(componentOfXml(serializeCcda(doc))).toContain(
        '<dischargeDispositionCode nullFlavor="UNK"/>',
      );
      const disposition = doc.header.encompassingEncounter?.dischargeDispositionCode;
      expect(disposition?.nullFlavor).toBe("UNK");
      expect(disposition?.code).toBeUndefined();
      expect(disposition?.displayName).toBeUndefined();
    });

    it("S0352 AC-11: an init naming no encounter at all still emits the frame, wholly unknown", () => {
      const frame = componentOfXml(serializeCcda(buildCcda(MINIMAL)));
      expect(frame).toContain('<low nullFlavor="UNK"/>');
      expect(frame).toContain('<high nullFlavor="UNK"/>');
      expect(frame).toContain('<dischargeDispositionCode nullFlavor="UNK"/>');
      // No `@value` and no `@code` anywhere in the frame beside a nullFlavor: a nullFlavor
      // asserted beside a value is a contradiction, not a refinement.
      expect(frame).not.toContain("value=");
      expect(frame).not.toContain("code=");
    });

    it("S0352 AC-11: an omitted required section is an explicit no-information section", () => {
      // The third slot AC-11 names. Same branch, same reason: the section is present so the
      // document's SHALL is satisfied, and it says "no information" rather than inventing a
      // hospital course or a diagnosis.
      const xml = serializeCcda(buildCcda(MINIMAL));
      const fromCourse = xml.slice(xml.indexOf(`<templateId root="${HOSPITAL_COURSE_ROOT}"/>`));
      expect(fromCourse.slice(0, fromCourse.indexOf("</section>"))).toContain(
        "<text>No information</text>",
      );
      expect(xml).not.toContain("<entry>");
    });
  });

  describe("S0352 AC-10: the CCD and the Referral Note are byte-identical to the pre-change builder", () => {
    /** Every conformance case that is not a Discharge Summary, which is what AC-10 freezes. */
    const frozen = BUILT_DOCUMENT_CASES.filter(
      (entry) => entry.documentType !== "dischargeSummary",
    );

    it("S0352 AC-10: every CCD and Referral Note conformance init emits its committed baseline bytes", () => {
      // The baseline was captured from the builder BEFORE any edit under `src/builder/` and
      // committed as `test/__fixtures__/builder-baseline.ts`. A baseline taken afterwards would
      // compare the change to itself and pass unconditionally.
      expect(frozen.length).toBeGreaterThan(0);
      for (const entry of frozen) {
        const baseline = BUILDER_BASELINE_DOCUMENTS[entry.name];
        expect(baseline, `no committed baseline for ${entry.name}`).toBeDefined();
        expect(serializeCcda(buildCcda(entry.init)), entry.name).toBe(baseline);
      }
    });

    it("S0352 AC-10: the baseline covers every frozen case the harness builds, and no other", () => {
      // A baseline that silently lost a case would make the comparison above vacuous for it.
      expect(Object.keys(BUILDER_BASELINE_DOCUMENTS).sort()).toStrictEqual(
        frozen.map((entry) => entry.name).sort(),
      );
    });
  });
});
