/**
 * C-CDA R2.1 template + section recognition tables, traced to the C-CDA R2.1
 * Implementation Guide (IG stamp `2015-08-01`) and the HL7 CDA R2 base
 * (`POCD_MT000040`). Two recognition surfaces:
 *
 * - **Document type**, keyed by the root document `templateId` OID. Twelve
 *   document types are recognized; the R2.1 version stamp lives in the
 *   `@extension` (`2015-08-01`) and is checked separately.
 * - **Section**, keyed by section `templateId` root (primary) with a LOINC
 *   `code` fallback (secondary).
 *
 * A third, smaller table sits beside them: {@link CCDA_RELEASE_STAMPS}, the
 * closed set of document-template version stamps this package can *name*, and
 * {@link CCDA_CONFORMANCE_RELEASE}, the release its conformance tables target.
 * Naming a later release is not targeting it, and nothing here retargets the
 * package.
 *
 * These tables are pure data; the matching logic that consumes them lives in
 * `model/section.ts` and `model/document.ts`.
 */

/** The CDA R2 ClinicalDocument root class code (`POCD_MT000040`). @internal */
export const CDA_DOCUMENT_OID = "2.16.840.1.113883.10.20.22.1.1";

/** The C-CDA R2.1 version stamp carried in a recognized `templateId/@extension`. */
export const R21_EXTENSION = "2015-08-01";

/**
 * The document-template version stamp C-CDA introduced at Release 3.0.0, when
 * "all document template ids received a new extension", and which Releases
 * 4.0.0 and 5.0.0 kept: the published guide's own US Realm Header and CCD
 * StructureDefinitions both pattern `@extension` to this value on the roots this
 * package recognizes.
 *
 * **Recognized, not targeted.** This package's conformance tables are C-CDA
 * R2.1 ({@link CCDA_CONFORMANCE_RELEASE}) and this constant does not move them.
 * It exists so a document written for a later release is *named* accurately
 * rather than mistaken for one that pre-dates R2.1.
 *
 * @example
 * ```ts
 * import { R30_EXTENSION } from "@cosyte/ccda";
 * R30_EXTENSION; // "2024-05-01"
 * ```
 */
export const R30_EXTENSION = "2024-05-01";

/**
 * The C-CDA releases this package can name from a document-template version
 * stamp. **A closed set of literals this package owns**, exactly like
 * {@link DOCUMENT_TYPES}: a diagnostic naming a release names a member of this
 * list, never a value copied out of the document being parsed.
 *
 * `"R3.0 or later"` is one member rather than three because the stamp cannot
 * tell those releases apart: 3.0.0 restamped every document template and 4.0.0
 * and 5.0.0 left that stamp alone, so a document carrying it may have been
 * written for any of them. Splitting the member would be a claim the stamp does
 * not support.
 *
 * @example
 * ```ts
 * import { CCDA_RELEASES } from "@cosyte/ccda";
 * CCDA_RELEASES.includes("R2.1"); // true
 * ```
 */
export const CCDA_RELEASES = ["R2.1", "R3.0 or later"] as const;

/**
 * A C-CDA release this package can name. Closed by construction, so putting one
 * in a warning message names a parser constant rather than document content.
 *
 * @example
 * ```ts
 * import type { CcdaRelease } from "@cosyte/ccda";
 * const release: CcdaRelease = "R2.1";
 * ```
 */
export type CcdaRelease = (typeof CCDA_RELEASES)[number];

/**
 * The C-CDA release this package's conformance tables target: the
 * required-section (SHALL) tables, the recognition catalogs and the version
 * stamp every one of them is written against.
 *
 * **This is the answer to "which release does `@cosyte/ccda` validate
 * against", as a value rather than a sentence in a README.** It does not move
 * when a later release is *recognized*: recognizing a stamp is knowing which
 * guide a document was written for, which is not the same as reading it
 * correctly against that guide.
 *
 * @example
 * ```ts
 * import { CCDA_CONFORMANCE_RELEASE } from "@cosyte/ccda";
 * CCDA_CONFORMANCE_RELEASE; // "R2.1"
 * ```
 */
export const CCDA_CONFORMANCE_RELEASE: CcdaRelease = "R2.1";

/**
 * One entry of this package's closed release-stamp table: a document-template
 * `@extension` version stamp and the C-CDA release it names.
 *
 * @example
 * ```ts
 * import type { CcdaReleaseStamp } from "@cosyte/ccda";
 * const r21: CcdaReleaseStamp = { stamp: "2015-08-01", release: "R2.1" };
 * ```
 */
export interface CcdaReleaseStamp {
  /** The `templateId/@extension` value, e.g. `2015-08-01`. */
  readonly stamp: string;
  /** The release that stamp names. */
  readonly release: CcdaRelease;
}

/**
 * **The closed, package-owned table of C-CDA document-template version stamps.**
 * Two entries today: R2.1's `2015-08-01` and the `2024-05-01` stamp C-CDA
 * introduced at Release 3.0.0 and carried through 4.0.0 and 5.0.0.
 *
 * Every stamp a diagnostic here can report comes from this table. The document's
 * own `@extension` is compared against it and is never echoed: a value that is
 * not a member yields a message that names no stamp at all, which is the same
 * membership discipline `NULL_FLAVORS` and the section catalog use.
 *
 * @example
 * ```ts
 * import { CCDA_RELEASE_STAMPS } from "@cosyte/ccda";
 * CCDA_RELEASE_STAMPS.map((e) => e.stamp); // ["2015-08-01", "2024-05-01"]
 * ```
 */
export const CCDA_RELEASE_STAMPS: readonly CcdaReleaseStamp[] = Object.freeze([
  Object.freeze({ stamp: R21_EXTENSION, release: "R2.1" as const }),
  Object.freeze({ stamp: R30_EXTENSION, release: "R3.0 or later" as const }),
]);

/** Version stamp → the release it names. @internal */
const RELEASE_BY_STAMP: ReadonlyMap<string, CcdaRelease> = new Map(
  CCDA_RELEASE_STAMPS.map((entry) => [entry.stamp, entry.release] as const),
);

/**
 * The C-CDA release a document-template `@extension` names, or `undefined` when
 * the value is not a member of {@link CCDA_RELEASE_STAMPS}. A **membership
 * test**, never a shape test: the argument may be any string a sender wrote, and
 * only a member is ever returned.
 *
 * @example
 * ```ts
 * import { releaseForTemplateExtension } from "@cosyte/ccda";
 * releaseForTemplateExtension("2024-05-01"); // "R3.0 or later"
 * releaseForTemplateExtension("1999-01-01"); // undefined
 * ```
 */
export function releaseForTemplateExtension(extension: string): CcdaRelease | undefined {
  return RELEASE_BY_STAMP.get(extension);
}

/**
 * The three readings a document-level `templateId`'s version stamp can take,
 * and the reason a boolean cannot carry them. A `boolean` says "R2.1-stamped or
 * not", which reads a document from the future as one from the past: it is the
 * distinction between *no stamp at all* (an R1.1-origin document, whose SHALL
 * obligations this package deliberately does not narrow) and *a stamp this
 * package does not model* (a later release, whose obligations this package has
 * not read and therefore must not compute).
 *
 * - `r21-stamped`: the R2.1 stamp is present, so the R2.1-scoped tables apply.
 * - `unstamped`: no `@extension` at all; the pre-R2.1 reading, unchanged.
 * - `unmodeled-release`: an `@extension` that is not the R2.1 stamp, whether or
 *   not it is a member of {@link CCDA_RELEASE_STAMPS}. This package has not read
 *   that release's obligations and reports them unevaluated rather than reducing
 *   them.
 *
 * @example
 * ```ts
 * import type { TemplateStampReading } from "@cosyte/ccda";
 * const reading: TemplateStampReading = "unmodeled-release";
 * ```
 */
export type TemplateStampReading = "r21-stamped" | "unstamped" | "unmodeled-release";

/**
 * Read a document-level `templateId/@extension` into a
 * {@link TemplateStampReading}. `undefined` (the attribute absent, which is how
 * `attr` reports an empty one too) reads `unstamped`; the R2.1 stamp reads
 * `r21-stamped`; anything else reads `unmodeled-release`. Total and
 * deterministic: every input lands in exactly one of the three.
 *
 * @example
 * ```ts
 * import { readTemplateStamp } from "@cosyte/ccda";
 * readTemplateStamp(undefined);      // "unstamped"
 * readTemplateStamp("2015-08-01");   // "r21-stamped"
 * readTemplateStamp("2024-05-01");   // "unmodeled-release"
 * ```
 */
export function readTemplateStamp(extension: string | undefined): TemplateStampReading {
  if (extension === undefined) return "unstamped";
  return extension === R21_EXTENSION ? "r21-stamped" : "unmodeled-release";
}

/**
 * Machine keys for the twelve recognized C-CDA R2.1 document types. Stable
 * strings, consumers may branch on `doc.documentType === "ccd"`. Renaming a
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
 * Every recognized {@link DocumentType}, in the recognition table's own order.
 * The runtime enumeration behind the type union: a consumer can walk all twelve
 * without hand-writing the list (and without it going stale when a thirteenth
 * type is recognized).
 *
 * @example
 * ```ts
 * import { DOCUMENT_TYPES } from "@cosyte/ccda";
 * DOCUMENT_TYPES.length; // 12
 * DOCUMENT_TYPES.includes("carePlan"); // true
 * ```
 */
export const DOCUMENT_TYPES: readonly DocumentType[] = [...DOCUMENT_TEMPLATES.values()];

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
    // Reason for Referral Section (V2). An IHE PCC template (no C-CDA `…22.2.*`
    // OID); the R2.1 Referral Note document SHALL carry it. Recognized by its
    // stable IHE root, the version stamp lives in the `@extension`
    // (`2014-06-09`), tolerated per the roadmap's root-primary contract.
    key: "reasonForReferral",
    title: "Reason for Referral",
    loinc: "42349-1",
    templateRoots: ["1.3.6.1.4.1.19376.1.5.3.1.3.1"],
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
    // Interventions Section (V3). **Its root sits in the `…10.20.21.2.*` arc,
    // not the `…10.20.22.2.*` arc every other C-CDA section here uses** (only
    // Reason for Referral and History of Present Illness also depart, and those
    // are IHE PCC roots). That is the template's own OID, not a typo, and it is
    // worth stating because `2.16.840.1.113883.10.20.22.2.3` (`22`, not `21`) is
    // the **Results** section already in this catalog, four entries up.
    //
    // This is the conformant home of the Planned Intervention Act (`…22.4.146`),
    // the container `extractPlannedItems` descends into. The read path was taught
    // to find those nested entries before the section framing knew their home, so
    // a document putting the container exactly where R2.1 puts it drew
    // `UNKNOWN_SECTION_CODE`.
    //
    // **Three `@extension`s are in circulation on this one root** and matching
    // ignores all of them: unversioned (R1.1), `2014-06-09` (V2), `2015-08-01`
    // (V3, the R2.1 stamp). That is not a special tolerance granted to this
    // entry, it is this catalog's root-primary contract, applied uniformly to
    // every root in the table. **There is no entries-required sibling root**:
    // unlike Allergies (`…22.2.6` entries-optional / `…22.2.6.1` entries-required)
    // or Results (`…22.2.3` / `…22.2.3.1`), Interventions has exactly one root,
    // so a `…21.2.3.1` would be a document's invention, not a template. Note the
    // direction: in C-CDA the BASE root is the entries-optional variant and the
    // `.1` sibling is the entries-required one.
    //
    // **`loinc` is the section code; `title` is this catalog's own human label,
    // and neither is the C-CDA `displayName`.** LOINC's own long name for
    // `62387-6` is "Interventions Narrative", while the C-CDA IG labels the
    // section "Interventions Provided". Nothing in this package matches on
    // either string: `SectionInfo.title` is read nowhere in `src/`, it is a
    // label consumers get back from {@link sectionForTemplateRoot}, while a
    // framed `CcdaSection.title` is the document's own `<title>`. So the
    // divergence costs nothing, but do not "correct" one of these strings into
    // the other. R3.0+ renamed the same root+extension to **Activities
    // Section**, keeping LOINC `62387-6`; this catalog is R2.1.
    //
    // **Provenance:** every spec claim in this comment is **stated, not traced**
    // -- the OID, the LOINC code, the single-root shape, the three `@extension`s
    // said to be in circulation, and the R3.0+ rename to Activities Section. No
    // CONF id is cited **for this entry**, because none was read from the IG
    // while writing it. (That is a statement about this entry only:
    // `required-sections.ts` does cite CONF ids genuinely traced to the
    // normative R2.1 Schematron, and nothing here licenses distrusting those.)
    // An earlier draft attributed a `displayName` requirement to
    // `CONF:1198-15378` and stamped the LOINC name "LOINC 2.82", an unverified
    // release number that could not be checked from this repo (LOINC ships each
    // February and August). Both were invented precision and were removed rather
    // than re-guessed. Nothing here matches on a display string, so no behaviour
    // depends on either. What IS load-bearing and IS verified in-repo is the
    // OID's distinctness from `…22.2.3` (Results) and the root-primary matching
    // contract, both pinned in `test/parse.test.ts`. **The OID itself is this
    // entry's only real behavioural risk and wants a second source before the
    // next publish.**
    key: "interventions",
    title: "Interventions",
    loinc: "62387-6",
    templateRoots: ["2.16.840.1.113883.10.20.21.2.3"],
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

/**
 * Every recognized section catalog `key`. The closed list the warning registry
 * generates its per-section message variants over, so a section key can be
 * named in a message without the document ever contributing a character.
 *
 * @internal
 */
export const SECTION_KEYS: readonly string[] = SECTION_CATALOG.map((s) => s.key);

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
