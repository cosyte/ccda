/**
 * `buildCcda` for the three office-visit document types: the Progress Note, the History and
 * Physical, and the Consultation Note.
 *
 * Every identifier asserted here (document template roots, LOINC document codes, section roots,
 * their version stamps and LOINC section codes, and the header slots each type requires) was read
 * off the normative C-CDA R2.1 Schematron at the revision `scripts/conformance/artifacts.json`
 * pins, and each SHALL is cited by its CONF id. `pnpm conformance` validates the same documents
 * against that Schematron and the CDA R2 schema; this file grades what the parser can see.
 *
 * Every value is synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildCcda,
  parseCcda,
  requiredSectionKeys,
  serializeCcda,
  type BuildableDocumentType,
  type BuildCcdaInit,
} from "../src/index.js";
import { BUILT_DOCUMENT_CASES } from "./__fixtures__/conformance.js";

const WHEN = "20240102030405+0000";
const PATIENT = { mrn: "MRN002" } as const;

type OfficeType = Extract<
  BuildableDocumentType,
  "progressNote" | "historyAndPhysical" | "consultationNote"
>;

const OFFICE_TYPES: readonly OfficeType[] = [
  "progressNote",
  "historyAndPhysical",
  "consultationNote",
];

/** The document template root and LOINC document code each type carries. */
const HEADER: Record<OfficeType, { readonly root: string; readonly code: string }> = {
  progressNote: { root: "2.16.840.1.113883.10.20.22.1.9", code: "11506-3" },
  historyAndPhysical: { root: "2.16.840.1.113883.10.20.22.1.3", code: "34117-2" },
  consultationNote: { root: "2.16.840.1.113883.10.20.22.1.4", code: "11488-4" },
};

/**
 * The section keys each type always carries, read back through the parser. Progress Note: the
 * Assessment/Plan choice (CONF:1198-30657). History and Physical: its ten SHALL sections
 * (-30572 to -30612) and its two choices (-30613, -30614). Consultation Note: its three SHALL
 * sections (-28907, -28911, -28929) and its two choices (-9504, -9501).
 */
const SHALL_KEYS: Record<OfficeType, readonly string[]> = {
  progressNote: ["assessment", "planOfTreatment"],
  historyAndPhysical: [
    "allergies",
    "familyHistory",
    "generalStatus",
    "pastMedicalHistory",
    "medications",
    "physicalExam",
    "results",
    "reviewOfSystems",
    "socialHistory",
    "vitalSigns",
    "chiefComplaintAndReasonForVisit",
    "assessment",
    "planOfTreatment",
  ],
  consultationNote: [
    "historyOfPresentIllness",
    "allergies",
    "problems",
    "reasonForReferral",
    "assessment",
    "planOfTreatment",
  ],
};

/** The five office-visit narratives: the root, its stamp (`null` for none) and its LOINC code. */
const NARRATIVES = {
  historyOfPresentIllness: { root: "1.3.6.1.4.1.19376.1.5.3.1.3.4", ext: null, code: "10164-2" },
  chiefComplaintAndReasonForVisit: {
    root: "2.16.840.1.113883.10.20.22.2.13",
    ext: null,
    code: "46239-0",
  },
  reviewOfSystems: { root: "1.3.6.1.4.1.19376.1.5.3.1.3.18", ext: null, code: "10187-3" },
  physicalExam: { root: "2.16.840.1.113883.10.20.2.10", ext: "2015-08-01", code: "29545-1" },
  generalStatus: { root: "2.16.840.1.113883.10.20.2.5", ext: null, code: "10210-3" },
} as const;

type NarrativeKey = keyof typeof NARRATIVES;
const NARRATIVE_KEYS = Object.keys(NARRATIVES) as NarrativeKey[];

/** One synthetic narrative per office-visit field. */
const NARRATIVE_TEXT: Record<NarrativeKey, string> = {
  historyOfPresentIllness: "Synthetic history of the present illness.",
  chiefComplaintAndReasonForVisit: "Synthetic chief complaint.",
  reviewOfSystems: "Synthetic review of systems, negative.",
  physicalExam: "Synthetic examination, unremarkable.",
  generalStatus: "Synthetic general status, well appearing.",
};

function minimal(documentType: OfficeType): BuildCcdaInit {
  return { documentType, patient: PATIENT, effectiveTime: WHEN };
}

function populated(documentType: OfficeType): BuildCcdaInit {
  return {
    ...minimal(documentType),
    ...NARRATIVE_TEXT,
    assessment: "Synthetic assessment.",
    ...(documentType === "consultationNote" ? { reasonForReferral: "Synthetic reason." } : {}),
    encompassingEncounter: { period: { low: "20240102", high: "20240102" } },
    problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
    allergies: [{ noKnownAllergy: true }],
    medications: [
      {
        drug: { code: "314076", displayName: "lisinopril 10 MG Oral Tablet" },
        dose: { value: 1, unit: "{tablet}" },
        route: { code: "C38288", displayName: "Oral" },
      },
    ],
    pastMedicalHistory: [
      { problem: { code: "44054006", displayName: "Diabetes mellitus type 2" }, onset: "20100101" },
    ],
    familyHistory: [
      {
        relative: { relationship: { code: "72705000", displayName: "Mother" } },
        observations: [{ condition: { code: "59621000", displayName: "Essential hypertension" } }],
      },
    ],
    planOfTreatment: [
      { kind: "encounter", code: { code: "99213", displayName: "Office visit" }, mood: "INT" },
    ],
  };
}

/** The `templateId` elements on the section whose LOINC code is `code`. */
function sectionXml(xml: string, code: string): string {
  const at = xml.indexOf(`<code code="${code}"`);
  expect(at, `no section coded ${code}`).toBeGreaterThan(-1);
  const start = xml.lastIndexOf("<section", at);
  return xml.slice(start, xml.indexOf("</section>", at) + "</section>".length);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("buildCcda builds a Progress Note, a History and Physical and a Consultation Note", () => {
  it("emits each type's own document template and LOINC document code", () => {
    for (const type of OFFICE_TYPES) {
      const xml = serializeCcda(buildCcda(minimal(type)));
      expect(xml, type).toContain(
        `<templateId root="${HEADER[type].root}" extension="2015-08-01"/>`,
      );
      expect(xml, type).toContain(`code="${HEADER[type].code}"`);
      expect(parseCcda(xml).documentType, type).toBe(type);
    }
  });

  it("reparses with zero warnings and round-trips to an identical string, minimal and populated", () => {
    const inits = [
      ...OFFICE_TYPES.flatMap((type) => [minimal(type), populated(type)]),
      ...BUILT_DOCUMENT_CASES.filter((c) =>
        (OFFICE_TYPES as string[]).includes(c.documentType),
      ).map((c) => c.init),
    ];
    expect(inits.length).toBeGreaterThan(6);
    for (const init of inits) {
      const built = buildCcda(init);
      const label = String(init.documentType);
      expect(built.warnings, label).toEqual([]);
      const xml = serializeCcda(built);
      const back = parseCcda(xml);
      expect(back.warnings, label).toEqual([]);
      expect(serializeCcda(back), label).toBe(xml);
    }
  });

  it("always carries each type's SHALL sections, once each, and every required key", () => {
    for (const type of OFFICE_TYPES) {
      const doc = buildCcda(minimal(type));
      const keys = doc.sections.map((s) => s.key);
      for (const key of SHALL_KEYS[type]) {
        expect(
          keys.filter((k) => k === key),
          `${type} ${key}`,
        ).toHaveLength(1);
      }
      for (const key of requiredSectionKeys(type)) {
        expect(doc.findSection(key), `${type} required ${key}`).toBeDefined();
      }
      // Nothing beyond the SHALL set is fabricated for a caller who supplied nothing.
      expect(keys, type).toHaveLength(SHALL_KEYS[type].length);
    }
  });

  it("writes an omitted SHALL narrative as an empty nullFlavor section, never invented text", () => {
    const xml = serializeCcda(buildCcda(minimal("historyAndPhysical")));
    for (const key of NARRATIVE_KEYS.filter((k) => k !== "historyOfPresentIllness")) {
      const section = sectionXml(xml, NARRATIVES[key].code);
      expect(section, key).toContain('<section nullFlavor="NI">');
      expect(section, key).toContain("<text>No information</text>");
    }
  });

  it("stamps each narrative section with the templateId its rule context matches", () => {
    const xml = serializeCcda(buildCcda(populated("historyAndPhysical")));
    for (const key of NARRATIVE_KEYS) {
      const { root, ext, code } = NARRATIVES[key];
      const section = sectionXml(xml, code);
      const expected =
        ext === null
          ? `<templateId root="${root}"/>`
          : `<templateId root="${root}" extension="${ext}"/>`;
      expect(section, key).toContain(expected);
      expect(count(section, "<templateId "), key).toBe(1);
      expect(section, key).toContain(NARRATIVE_TEXT[key]);
    }
  });

  it("reads every supplied narrative back from its own section", () => {
    for (const type of OFFICE_TYPES) {
      const doc = buildCcda(populated(type));
      for (const key of NARRATIVE_KEYS) {
        const section = doc.findSection(key);
        expect(section?.recognizedBy, `${type} ${key}`).toBe("templateId");
        expect(section?.narrativeText, `${type} ${key}`).toBe(NARRATIVE_TEXT[key]);
      }
      expect(doc.findSection("assessment")?.narrativeText, type).toBe("Synthetic assessment.");
    }
  });

  it("emits an optional narrative only when supplied", () => {
    // A Progress Note requires none of the five, so none is fabricated, and each supplied one
    // is emitted rather than dropped.
    const bare = buildCcda(minimal("progressNote"));
    for (const key of NARRATIVE_KEYS) expect(bare.findSection(key), key).toBeUndefined();
    const one = buildCcda({ ...minimal("progressNote"), physicalExam: "Synthetic exam." });
    expect(one.findSection("physicalExam")?.narrativeText).toBe("Synthetic exam.");
    expect(one.findSection("reviewOfSystems")).toBeUndefined();
  });

  it("emits the clinical content of a History and Physical in its SHALL sections, once", () => {
    const doc = buildCcda(populated("historyAndPhysical"));
    expect(doc.getPastMedicalHistory()).toHaveLength(1);
    expect(doc.getPastMedicalHistory()[0]?.value?.code).toBe("44054006");
    expect(doc.getFamilyHistory()).toHaveLength(1);
    expect(doc.getMedications()).toHaveLength(1);
    expect(doc.getProblems()).toHaveLength(1);
    for (const key of ["pastMedicalHistory", "familyHistory", "medications"]) {
      expect(
        doc.sections.filter((s) => s.key === key),
        key,
      ).toHaveLength(1);
    }
  });
});

describe("the header slots each office-visit type requires", () => {
  function componentOf(xml: string): string {
    const start = xml.indexOf("<componentOf>");
    expect(start, "no componentOf").toBeGreaterThan(-1);
    return xml.slice(start, xml.indexOf("</componentOf>") + "</componentOf>".length);
  }

  it("frames every office-visit type in an encompassingEncounter with an id and a low bound", () => {
    // CONF:1198-7595 / -8338 / -8386 for the frame, -9959 for its id, -7599 for the low.
    for (const type of OFFICE_TYPES) {
      const frame = componentOf(serializeCcda(buildCcda(minimal(type))));
      expect(frame, type).toMatch(/<encompassingEncounter><id root="[^"]+" extension="[^"]+"\/>/);
      expect(frame, type).toContain('<effectiveTime><low nullFlavor="UNK"/></effectiveTime>');
      // No discharge slot is required of these types, so none is written as an unknown.
      expect(frame, type).not.toContain("<high");
      expect(frame, type).not.toContain("dischargeDispositionCode");
    }
  });

  it("writes a supplied period and disposition verbatim and never derives a missing one", () => {
    const xml = serializeCcda(
      buildCcda({
        ...minimal("historyAndPhysical"),
        encompassingEncounter: {
          period: { low: "20240102", high: "20240103" },
          dischargeDisposition: { code: "01", displayName: "Discharged to Home or Self Care" },
        },
      }),
    );
    const frame = componentOf(xml);
    expect(frame).toContain('<low value="20240102"/><high value="20240103"/>');
    expect(frame).toContain('<dischargeDispositionCode code="01"');
  });

  it("gives a Progress Note's encounter a health care facility with an unknown id", () => {
    // CONF:1198-30879, -30880, -30881. The facility is not invented.
    const frame = componentOf(serializeCcda(buildCcda(minimal("progressNote"))));
    expect(frame).toContain(
      '<location><healthCareFacility><id nullFlavor="UNK"/></healthCareFacility></location>',
    );
    for (const type of ["historyAndPhysical", "consultationNote"] as const) {
      expect(componentOf(serializeCcda(buildCcda(minimal(type)))), type).not.toContain(
        "<location>",
      );
    }
  });

  it("gives a Consultation Note the order it fulfills, with an unknown id, before componentOf", () => {
    // CONF:1198-8382, -29923, -29924. CDA R2 orders inFulfillmentOf before componentOf.
    const xml = serializeCcda(buildCcda(minimal("consultationNote")));
    expect(xml).toContain(
      '<inFulfillmentOf><order><id nullFlavor="UNK"/></order></inFulfillmentOf>',
    );
    expect(xml.indexOf("</custodian>")).toBeLessThan(xml.indexOf("<inFulfillmentOf>"));
    expect(xml.indexOf("</inFulfillmentOf>")).toBeLessThan(xml.indexOf("<componentOf>"));
    for (const type of ["progressNote", "historyAndPhysical"] as const) {
      expect(serializeCcda(buildCcda(minimal(type))), type).not.toContain("<inFulfillmentOf>");
    }
  });
});

describe("office-visit inputs are emitted or refused, never dropped", () => {
  it("refuses an office-visit narrative on a type that carries no such section", () => {
    for (const documentType of ["ccd", "referralNote", "dischargeSummary"] as const) {
      for (const field of NARRATIVE_KEYS) {
        const ask = (): unknown =>
          buildCcda({ documentType, patient: PATIENT, [field]: "Synthetic." });
        expect(ask, `${field} on ${documentType}`).toThrow(TypeError);
        expect(ask, `${field} on ${documentType}`).toThrow(
          new RegExp(`\`${field}\` is not carried by documentType "${documentType}"`),
        );
      }
    }
  });

  it("refuses a reason for referral on a Progress Note and a History and Physical", () => {
    for (const documentType of ["progressNote", "historyAndPhysical"] as const) {
      expect(() =>
        buildCcda({ documentType, patient: PATIENT, reasonForReferral: "Synthetic." }),
      ).toThrow(/`reasonForReferral` is not carried by documentType/);
    }
  });

  it("refuses the Discharge Summary's own inputs on every office-visit type", () => {
    for (const documentType of OFFICE_TYPES) {
      expect(() =>
        buildCcda({ documentType, patient: PATIENT, hospitalCourse: "Synthetic." }),
      ).toThrow(/`hospitalCourse` is not carried by documentType/);
      expect(() =>
        buildCcda({
          documentType,
          patient: PATIENT,
          dischargeDiagnoses: [{ problem: { code: "59621000", displayName: "Hypertension" } }],
        }),
      ).toThrow(/`dischargeDiagnoses` is not carried by documentType/);
    }
  });
});
