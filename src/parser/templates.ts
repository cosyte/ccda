/**
 * C-CDA R2.1 template + section recognition tables, traced to the C-CDA R2.1
 * Implementation Guide (IG stamp `2015-08-01`) and the HL7 CDA R2 base
 * (`POCD_MT000040`). Two recognition surfaces:
 *
 * - **Document type** — keyed by the root document `templateId` OID. Twelve
 *   document types are recognized; the R2.1 version stamp lives in the
 *   `@extension` (`2015-08-01`) and is checked separately.
 * - **Section** — keyed by section `templateId` root (primary) with a LOINC
 *   `code` fallback (secondary), per the roadmap's section-framing contract.
 *
 * These tables are pure data; the matching logic that consumes them lives in
 * `model/section.ts` and `model/document.ts`.
 */

/** The CDA R2 ClinicalDocument root class code (`POCD_MT000040`). @internal */
export const CDA_DOCUMENT_OID = "2.16.840.1.113883.10.20.22.1.1";

/** The C-CDA R2.1 version stamp carried in a recognized `templateId/@extension`. */
export const R21_EXTENSION = "2015-08-01";

/**
 * Machine keys for the twelve recognized C-CDA R2.1 document types. Stable
 * strings — consumers may branch on `doc.documentType === "ccd"`. Renaming a
 * key is a breaking change.
 *
 * @example
 * ```ts
 * import type { DocumentType } from "@cosyte/ccda";
 * const t: DocumentType = "dischargeSummary";
 * ```
 */
export type DocumentType =
  | "ccd"
  | "dischargeSummary"
  | "referralNote"
  | "consultationNote"
  | "historyAndPhysical"
  | "progressNote"
  | "procedureNote"
  | "operativeNote"
  | "carePlan"
  | "diagnosticImagingReport"
  | "unstructuredDocument"
  | "transferSummary";

/** Document-template OID → {@link DocumentType}. @internal */
const DOCUMENT_TEMPLATES: ReadonlyMap<string, DocumentType> = new Map([
  ["2.16.840.1.113883.10.20.22.1.2", "ccd"],
  ["2.16.840.1.113883.10.20.22.1.8", "dischargeSummary"],
  ["2.16.840.1.113883.10.20.22.1.14", "referralNote"],
  ["2.16.840.1.113883.10.20.22.1.4", "consultationNote"],
  ["2.16.840.1.113883.10.20.22.1.3", "historyAndPhysical"],
  ["2.16.840.1.113883.10.20.22.1.9", "progressNote"],
  ["2.16.840.1.113883.10.20.22.1.6", "procedureNote"],
  ["2.16.840.1.113883.10.20.22.1.7", "operativeNote"],
  ["2.16.840.1.113883.10.20.22.1.15", "carePlan"],
  ["2.16.840.1.113883.10.20.22.1.5", "diagnosticImagingReport"],
  ["2.16.840.1.113883.10.20.22.1.10", "unstructuredDocument"],
  ["2.16.840.1.113883.10.20.22.1.13", "transferSummary"],
]);

/**
 * Resolve a document-template OID to its {@link DocumentType}, or `undefined`
 * when the OID is not one of the twelve recognized C-CDA R2.1 types.
 *
 * @example
 * ```ts
 * import { documentTypeForOid } from "@cosyte/ccda";
 * documentTypeForOid("2.16.840.1.113883.10.20.22.1.2"); // "ccd"
 * documentTypeForOid("1.2.3");                            // undefined
 * ```
 */
export function documentTypeForOid(oid: string): DocumentType | undefined {
  return DOCUMENT_TEMPLATES.get(oid);
}

/**
 * Recognized-section descriptor. `key` is a stable machine name, `title` a
 * human label, `loinc` the section's LOINC code, and `templateRoots` the
 * section `templateId` root OID(s) (entries-optional and entries-required
 * variants) that identify it.
 *
 * @example
 * ```ts
 * import type { SectionInfo } from "@cosyte/ccda";
 * const s: SectionInfo = {
 *   key: "allergies",
 *   title: "Allergies",
 *   loinc: "48765-2",
 *   templateRoots: ["2.16.840.1.113883.10.20.22.2.6.1"],
 * };
 * ```
 */
export interface SectionInfo {
  readonly key: string;
  readonly title: string;
  readonly loinc: string;
  readonly templateRoots: readonly string[];
}

/** The recognized C-CDA section catalog. @internal */
const SECTION_CATALOG: readonly SectionInfo[] = [
  {
    key: "allergies",
    title: "Allergies",
    loinc: "48765-2",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.6", "2.16.840.1.113883.10.20.22.2.6.1"],
  },
  {
    key: "medications",
    title: "Medications",
    loinc: "10160-0",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.1", "2.16.840.1.113883.10.20.22.2.1.1"],
  },
  {
    key: "problems",
    title: "Problems",
    loinc: "11450-4",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.5", "2.16.840.1.113883.10.20.22.2.5.1"],
  },
  {
    key: "results",
    title: "Results",
    loinc: "30954-2",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.3", "2.16.840.1.113883.10.20.22.2.3.1"],
  },
  {
    key: "vitalSigns",
    title: "Vital Signs",
    loinc: "8716-3",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.4", "2.16.840.1.113883.10.20.22.2.4.1"],
  },
  {
    key: "procedures",
    title: "Procedures",
    loinc: "47519-4",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.7", "2.16.840.1.113883.10.20.22.2.7.1"],
  },
  {
    key: "immunizations",
    title: "Immunizations",
    loinc: "11369-6",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.2", "2.16.840.1.113883.10.20.22.2.2.1"],
  },
  {
    key: "socialHistory",
    title: "Social History",
    loinc: "29762-2",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.17"],
  },
  {
    key: "encounters",
    title: "Encounters",
    loinc: "46240-8",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.22", "2.16.840.1.113883.10.20.22.2.22.1"],
  },
  {
    key: "planOfTreatment",
    title: "Plan of Treatment",
    loinc: "18776-5",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.10"],
  },
  {
    key: "functionalStatus",
    title: "Functional Status",
    loinc: "47420-5",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.14"],
  },
  {
    key: "familyHistory",
    title: "Family History",
    loinc: "10157-6",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.15"],
  },
  {
    key: "medicalEquipment",
    title: "Medical Equipment",
    loinc: "46264-8",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.23"],
  },
  {
    key: "payers",
    title: "Payers",
    loinc: "48768-6",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.18"],
  },
  {
    key: "advanceDirectives",
    title: "Advance Directives",
    loinc: "42348-3",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.21", "2.16.840.1.113883.10.20.22.2.21.1"],
  },
  {
    key: "assessment",
    title: "Assessment",
    loinc: "51848-0",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.8"],
  },
  {
    key: "hospitalDischargeDiagnosis",
    title: "Hospital Discharge Diagnosis",
    loinc: "11535-2",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.24"],
  },
  {
    key: "dischargeMedications",
    title: "Discharge Medications",
    loinc: "10183-2",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.11", "2.16.840.1.113883.10.20.22.2.11.1"],
  },
  {
    key: "historyOfPresentIllness",
    title: "History of Present Illness",
    loinc: "10164-2",
    templateRoots: ["1.3.6.1.4.1.19376.1.5.3.1.3.4"],
  },
  {
    key: "pastMedicalHistory",
    title: "Past Medical History",
    loinc: "11348-0",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.20"],
  },
  {
    key: "mentalStatus",
    title: "Mental Status",
    loinc: "10190-7",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.56"],
  },
  {
    key: "nutrition",
    title: "Nutrition",
    loinc: "61144-2",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.57"],
  },
  {
    key: "goals",
    title: "Goals",
    loinc: "61146-7",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.60"],
  },
  {
    key: "healthConcerns",
    title: "Health Concerns",
    loinc: "75310-3",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.58"],
  },
  {
    key: "instructions",
    title: "Instructions",
    loinc: "69730-0",
    templateRoots: ["2.16.840.1.113883.10.20.22.2.45"],
  },
  { key: "reasonForVisit", title: "Reason for Visit", loinc: "29299-5", templateRoots: [] },
  { key: "chiefComplaint", title: "Chief Complaint", loinc: "10154-3", templateRoots: [] },
];

/** Section `templateId` root OID → {@link SectionInfo}. @internal */
const SECTION_BY_TEMPLATE: ReadonlyMap<string, SectionInfo> = new Map(
  SECTION_CATALOG.flatMap((s) => s.templateRoots.map((root) => [root, s] as const)),
);

/** Section LOINC code → {@link SectionInfo}. @internal */
const SECTION_BY_LOINC: ReadonlyMap<string, SectionInfo> = new Map(
  SECTION_CATALOG.map((s) => [s.loinc, s] as const),
);

/**
 * Resolve a section `templateId` root OID to its {@link SectionInfo}, or
 * `undefined` when unrecognized. This is the primary section-recognition path.
 *
 * @example
 * ```ts
 * import { sectionForTemplateRoot } from "@cosyte/ccda";
 * sectionForTemplateRoot("2.16.840.1.113883.10.20.22.2.6.1")?.key; // "allergies"
 * ```
 */
export function sectionForTemplateRoot(root: string): SectionInfo | undefined {
  return SECTION_BY_TEMPLATE.get(root);
}

/**
 * Resolve a section LOINC `code` to its {@link SectionInfo}, or `undefined`
 * when unrecognized. This is the fallback section-recognition path used when no
 * recognized `templateId` is present.
 *
 * @example
 * ```ts
 * import { sectionForLoinc } from "@cosyte/ccda";
 * sectionForLoinc("11450-4")?.key; // "problems"
 * ```
 */
export function sectionForLoinc(loinc: string): SectionInfo | undefined {
  return SECTION_BY_LOINC.get(loinc);
}
