/**
 * Documents stamped `2024-05-01` (C-CDA 3.0.0, 4.0.0 or 5.0.0) have their
 * required sections checked against C-CDA 5.0.0's document profiles, with the
 * release named on the result, and the Patient Generated Document header is
 * recognized as a document type of its own.
 *
 * The expected key sets below are written out by hand from the C-CDA 5.0.0
 * FHIR Shorthand source (HL7/CDA-ccda, tag `5.0.0`,
 * `fsh-tank/input/fsh/Document/*.fsh`): each is the set of `component` entries
 * with a minimum of 1 whose section is in this parser's catalog. They are not
 * imported from `src/`, so a table that drifts from the source fails here.
 *
 * Every fixture is synthetic ("Jane Doe", fake OIDs), no realistic PHI.
 */

import { describe, expect, it } from "vitest";

import {
  DOCUMENT_TYPES,
  WARNING_CODES,
  documentTypeForOid,
  parseCcda,
  readTemplateStamp,
  requiredSectionKeys,
  requiredSectionStatus,
  requiredSectionStatuses,
  type CcdaWarning,
  type DocumentType,
} from "../src/index.js";
import {
  ALLERGY_ENTRY_SECTION,
  FAMILY_HISTORY_SECTION,
  GOALS_SECTION,
  HEALTH_CONCERNS_SECTION,
  HISTORY_OF_PRESENT_ILLNESS_SECTION,
  HOSPITAL_DISCHARGE_DIAGNOSIS_SECTION,
  MEDICATIONS_SECTION,
  PAST_MEDICAL_HISTORY_SECTION,
  PLAN_OF_TREATMENT_SECTION,
  POST_R21_STAMP,
  PROBLEMS_SECTION,
  PROCEDURES_SECTION,
  REASON_FOR_REFERRAL_SECTION,
  RESULTS_SECTION,
  SOCIAL_HISTORY_SECTION,
  VITALS_SECTION,
  buildCcda,
} from "./__fixtures__/ccda.js";

/** The Patient Generated Document header root, from the 5.0.0 source and the R2.1 Schematron. */
const PGD_ROOT = "2.16.840.1.113883.10.20.29.1";

/** A synthetic stamp no C-CDA release has used. */
const UNKNOWN_STAMP = "1999-12-31";

function codes(warnings: readonly CcdaWarning[]): string[] {
  return warnings.map((w) => w.code);
}

/** The section keys the REQUIRED_SECTION_MISSING warnings name, in emission order. */
function missingKeys(warnings: readonly CcdaWarning[]): string[] {
  return warnings
    .filter((w) => w.code === WARNING_CODES.REQUIRED_SECTION_MISSING)
    .map((w) => /"([A-Za-z]+)"/u.exec(w.message)?.[1] ?? "?");
}

/**
 * One row per document type C-CDA 5.0.0 publishes with a structured body: its
 * template root, the in-catalog SHALL sections, and the fixture sections that
 * satisfy them.
 */
interface R5Row {
  readonly type: DocumentType;
  readonly oid: string;
  readonly required: readonly string[];
  readonly body: string;
}

const R5_ROWS: readonly R5Row[] = [
  {
    type: "ccd",
    oid: "2.16.840.1.113883.10.20.22.1.2",
    required: ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"],
    body: `${ALLERGY_ENTRY_SECTION}${MEDICATIONS_SECTION}${PROBLEMS_SECTION}${RESULTS_SECTION}${SOCIAL_HISTORY_SECTION}${VITALS_SECTION}`,
  },
  {
    // 5.0.0 adds Procedures and Results to R2.1's set; its Hospital Course and
    // Hospital Consultations requirements are named but not asserted.
    type: "dischargeSummary",
    oid: "2.16.840.1.113883.10.20.22.1.8",
    required: [
      "allergies",
      "hospitalDischargeDiagnosis",
      "planOfTreatment",
      "procedures",
      "results",
    ],
    body: `${ALLERGY_ENTRY_SECTION}${HOSPITAL_DISCHARGE_DIAGNOSIS_SECTION}${PLAN_OF_TREATMENT_SECTION}${PROCEDURES_SECTION}${RESULTS_SECTION}`,
  },
  {
    type: "referralNote",
    oid: "2.16.840.1.113883.10.20.22.1.14",
    required: ["allergies", "medications", "problems", "reasonForReferral"],
    body: `${ALLERGY_ENTRY_SECTION}${MEDICATIONS_SECTION}${PROBLEMS_SECTION}${REASON_FOR_REFERRAL_SECTION}`,
  },
  {
    type: "consultationNote",
    oid: "2.16.840.1.113883.10.20.22.1.4",
    required: ["historyOfPresentIllness", "allergies", "problems"],
    body: `${HISTORY_OF_PRESENT_ILLNESS_SECTION}${ALLERGY_ENTRY_SECTION}${PROBLEMS_SECTION}`,
  },
  {
    type: "historyAndPhysical",
    oid: "2.16.840.1.113883.10.20.22.1.3",
    required: [
      "allergies",
      "familyHistory",
      "pastMedicalHistory",
      "medications",
      "results",
      "socialHistory",
      "vitalSigns",
    ],
    body: `${ALLERGY_ENTRY_SECTION}${FAMILY_HISTORY_SECTION}${PAST_MEDICAL_HISTORY_SECTION}${MEDICATIONS_SECTION}${RESULTS_SECTION}${SOCIAL_HISTORY_SECTION}${VITALS_SECTION}`,
  },
  {
    type: "progressNote",
    oid: "2.16.840.1.113883.10.20.22.1.9",
    required: [],
    body: PROCEDURES_SECTION,
  },
  {
    type: "procedureNote",
    oid: "2.16.840.1.113883.10.20.22.1.6",
    required: [],
    body: PROCEDURES_SECTION,
  },
  {
    type: "operativeNote",
    oid: "2.16.840.1.113883.10.20.22.1.7",
    required: [],
    body: PROCEDURES_SECTION,
  },
  {
    type: "carePlan",
    oid: "2.16.840.1.113883.10.20.22.1.15",
    required: ["healthConcerns", "goals"],
    body: `${HEALTH_CONCERNS_SECTION}${GOALS_SECTION}`,
  },
  {
    type: "transferSummary",
    oid: "2.16.840.1.113883.10.20.22.1.13",
    required: [
      "allergies",
      "medications",
      "problems",
      "results",
      "vitalSigns",
      "reasonForReferral",
    ],
    body: `${ALLERGY_ENTRY_SECTION}${MEDICATIONS_SECTION}${PROBLEMS_SECTION}${RESULTS_SECTION}${VITALS_SECTION}${REASON_FOR_REFERRAL_SECTION}`,
  },
];

describe("the 2024-05-01 stamp has its own reading", () => {
  it("reads 2024-05-01 as r30-stamped, and only that stamp", () => {
    expect(readTemplateStamp(POST_R21_STAMP)).toBe("r30-stamped");
    expect(readTemplateStamp("2015-08-01")).toBe("r21-stamped");
    expect(readTemplateStamp(undefined)).toBe("unstamped");
    for (const other of [UNKNOWN_STAMP, "2024-05-02", "2025-05-01", "2026-05-01", ""]) {
      expect(readTemplateStamp(other), other).toBe("unmodeled-release");
    }
  });
});

describe("a document stamped 2024-05-01 is checked against C-CDA 5.0.0", () => {
  for (const row of R5_ROWS) {
    it(`${row.type}: an empty body reports each 5.0.0 SHALL section missing`, () => {
      const doc = parseCcda(
        buildCcda({ docTypeOid: row.oid, extension: POST_R21_STAMP, sections: "" }),
      );
      expect(doc.documentType).toBe(row.type);
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTIONS_NOT_EVALUATED);
      expect(missingKeys(doc.warnings)).toEqual(row.required);
    });

    it(`${row.type}: a body carrying them reports none missing`, () => {
      const doc = parseCcda(
        buildCcda({ docTypeOid: row.oid, extension: POST_R21_STAMP, sections: row.body }),
      );
      expect(doc.documentType).toBe(row.type);
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTIONS_NOT_EVALUATED);
      expect(missingKeys(doc.warnings)).toEqual([]);
    });

    it(`${row.type}: the status names release 5.0.0 and is evaluated`, () => {
      const status = requiredSectionStatus(row.type, { stamp: "r30-stamped" });
      expect(status.evaluation).toBe("evaluated");
      expect(status.release).toBe("5.0.0");
      expect(status.keys).toEqual(row.required);
      expect(status.traced.map((t) => t.key)).toEqual(row.required);
      expect(status.source?.artifact).toContain("5.0.0");
      expect(requiredSectionKeys(row.type, { stamp: "r30-stamped" })).toEqual(row.required);
    });
  }

  it("unstructuredDocument: a nonXMLBody document is evaluated against 5.0.0 with nothing to assert", () => {
    const doc = parseCcda(
      buildCcda({
        docTypeOid: "2.16.840.1.113883.10.20.22.1.10",
        extension: POST_R21_STAMP,
        nonXmlBody: true,
      }),
    );
    expect(doc.documentType).toBe("unstructuredDocument");
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTIONS_NOT_EVALUATED);
    expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
    const status = requiredSectionStatus("unstructuredDocument", { stamp: "r30-stamped" });
    expect(status.evaluation).toBe("evaluated");
    expect(status.release).toBe("5.0.0");
    expect(status.verification).toBe("not-applicable");
  });

  it("names the 5.0.0 Discharge Summary sections it does not assert, with the reason", () => {
    const status = requiredSectionStatus("dischargeSummary", { stamp: "r30-stamped" });
    expect(status.verification).toBe("traced-partial");
    expect(status.unasserted.map((u) => [u.sourceName, u.reason])).toEqual([
      ["Hospital Course Section", "assertion-would-tighten-parse"],
      ["Hospital Consultations Section", "outside-section-catalog"],
    ]);
  });

  it("keeps the R2.1 reading of the same Discharge Summary unchanged", () => {
    expect(requiredSectionKeys("dischargeSummary")).toEqual([
      "allergies",
      "hospitalDischargeDiagnosis",
      "planOfTreatment",
    ]);
    expect(requiredSectionStatus("dischargeSummary").release).toBe("R2.1");
    expect(requiredSectionStatus("dischargeSummary", { r21Stamped: false }).release).toBe("R2.1");
  });

  it("reports Diagnostic Imaging Report stamped 2024-05-01 not evaluated: 5.0.0 has no such type", () => {
    const doc = parseCcda(
      buildCcda({
        docTypeOid: "2.16.840.1.113883.10.20.22.1.5",
        extension: POST_R21_STAMP,
        sections: "",
      }),
    );
    expect(doc.documentType).toBe("diagnosticImagingReport");
    expect(codes(doc.warnings)).toContain(WARNING_CODES.REQUIRED_SECTIONS_NOT_EVALUATED);
    const status = requiredSectionStatus("diagnosticImagingReport", { stamp: "r30-stamped" });
    expect(status.evaluation).toBe("not-evaluated");
    expect(status.release).toBeUndefined();
    expect(status.keys).toEqual([]);
  });

  it("still reports a stamp no release uses not evaluated, with no release named", () => {
    const doc = parseCcda(buildCcda({ extension: UNKNOWN_STAMP, sections: "" }));
    expect(codes(doc.warnings)).toContain(WARNING_CODES.REQUIRED_SECTIONS_NOT_EVALUATED);
    expect(missingKeys(doc.warnings)).toEqual([]);
    const status = requiredSectionStatus("ccd", { stamp: "unmodeled-release" });
    expect(status.evaluation).toBe("not-evaluated");
    expect(status.release).toBeUndefined();
  });

  it("keeps the stamp warning on a 2024-05-01 document and says what it is checked against", () => {
    const doc = parseCcda(buildCcda({ extension: POST_R21_STAMP, sections: "" }));
    const stamp = doc.warnings.find(
      (w) => w.code === WARNING_CODES.TEMPLATE_EXTENSION_UNMODELED_RELEASE,
    );
    expect(stamp?.message).toContain(POST_R21_STAMP);
    expect(stamp?.message).toContain("5.0.0");
  });
});

describe("the Patient Generated Document header", () => {
  it("resolves its root to patientGeneratedDocument", () => {
    expect(documentTypeForOid(PGD_ROOT)).toBe("patientGeneratedDocument");
    expect(DOCUMENT_TYPES).toContain("patientGeneratedDocument");
    expect(requiredSectionStatuses().map((s) => s.documentType)).toEqual([...DOCUMENT_TYPES]);
  });

  for (const stamp of ["2015-08-01", POST_R21_STAMP]) {
    it(`gives a document carrying only it (stamped ${stamp}) a documentType`, () => {
      const doc = parseCcda(
        buildCcda({
          rawTemplateIds: `<templateId root="${PGD_ROOT}" extension="${stamp}"/>`,
          sections: PROCEDURES_SECTION,
        }),
      );
      expect(doc.documentType).toBe("patientGeneratedDocument");
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE);
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTIONS_NOT_EVALUATED);
      expect(codes(doc.warnings)).not.toContain(WARNING_CODES.REQUIRED_SECTION_MISSING);
      expect(doc.findSection("procedures")).toBeDefined();
    });
  }

  it("never outranks a document-type template, in either order", () => {
    const ccd = "2.16.840.1.113883.10.20.22.1.2";
    for (const raw of [
      `<templateId root="${PGD_ROOT}" extension="2015-08-01"/><templateId root="${ccd}" extension="2015-08-01"/>`,
      `<templateId root="${ccd}" extension="2015-08-01"/><templateId root="${PGD_ROOT}" extension="2015-08-01"/>`,
    ]) {
      const doc = parseCcda(buildCcda({ rawTemplateIds: raw, sections: "" }));
      expect(doc.documentType).toBe("ccd");
      // Read as the CCD it is: all six R2.1 SHALL sections are reported.
      expect(missingKeys(doc.warnings)).toHaveLength(6);
    }
  });

  it("asserts no section, under either release, and says the source was read", () => {
    for (const options of [undefined, { stamp: "r30-stamped" as const }]) {
      const status = requiredSectionStatus("patientGeneratedDocument", options);
      expect(status.evaluation).toBe("evaluated");
      expect(status.keys).toEqual([]);
      expect(status.unasserted).toEqual([]);
      expect(status.verification).toBe("traced-complete");
    }
    expect(requiredSectionStatus("patientGeneratedDocument").release).toBe("R2.1");
    expect(
      requiredSectionStatus("patientGeneratedDocument", { stamp: "r30-stamped" }).release,
    ).toBe("5.0.0");
  });
});
