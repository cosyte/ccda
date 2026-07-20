/**
 * Per-document-type **required-section** (SHALL) tables for C-CDA R2.1, traced
 * to the Implementation Guide's document-level templates. Each of the twelve
 * recognized {@link DocumentType}s maps to the catalog section keys it SHALL
 * contain — used by the parser to emit `REQUIRED_SECTION_MISSING` (a Tier-2
 * **warning**, never a fatal: a missing required section never blocks reading
 * the data that *is* present).
 *
 * **Conservative by design.** This table asserts only *unconditional*,
 * high-confidence SHALL constraints whose section is in this parser's
 * recognized catalog. It deliberately **omits**:
 *
 * - **Choice constraints** (`SHALL contain A OR B`) — asserting either half as
 *   unconditional would mis-flag conformant documents. The Referral Note's
 *   Assessment-and-Plan requirement (CONF:1198-29102 — an *Assessment and Plan*
 *   Section, **or** an *Assessment* Section **and** a *Plan of Treatment* Section)
 *   is one such choice, so neither half is asserted here.
 * - **SHOULD / MAY** sections — only SHALL is enforced. (For the Referral Note
 *   this is why *Results* and *Plan of Treatment* are absent: the normative R2.1
 *   Schematron marks them SHOULD, CONF:1198-29090 / -29066, not SHALL.)
 * - **SHALL sections outside the recognized catalog** (e.g. Hospital Course,
 *   Physical Exam) — the parser cannot recognize them, so it does not pretend to
 *   validate them.
 *
 * A document type with an **empty** list is therefore *"no unconditional,
 * in-catalog SHALL section is asserted yet"* — **not** *"this type has no
 * requirements."* Several types (Consultation Note, Progress Note, Procedure
 * Note, Operative Note, Diagnostic Imaging Report, Unstructured Document) carry
 * an empty list pending per-type verification; broadening them is additive and
 * safe. See the package README "Required-section validation" for the full
 * provenance + known-limitations note.
 */

import type { DocumentType } from "./templates.js";

/**
 * Document type → the catalog section keys it SHALL contain (unconditional,
 * in-catalog, high-confidence only). The keys are {@link SectionInfo.key}
 * values; an empty array means no SHALL section is asserted for that type yet.
 * @internal
 */
const REQUIRED_SECTIONS: Readonly<Record<DocumentType, readonly string[]>> = {
  ccd: ["allergies", "medications", "problems", "results"],
  dischargeSummary: ["allergies", "hospitalDischargeDiagnosis", "dischargeMedications"],
  // Referral Note (…22.1.14) SHALL: Problem (CONF:1198-29087), Allergies
  // (-30912), Medications (-30923), and Reason for Referral (-30925). The
  // Reason for Referral Section became a recognized catalog key, so it is now
  // asserted here; the Assessment/Plan choice (-29102) stays omitted per the
  // module note. Traced to the normative R2.1 Schematron.
  referralNote: ["allergies", "medications", "problems", "reasonForReferral"],
  consultationNote: [],
  historyAndPhysical: ["allergies"],
  progressNote: [],
  procedureNote: [],
  operativeNote: [],
  carePlan: ["healthConcerns", "goals"],
  diagnosticImagingReport: [],
  unstructuredDocument: [],
  transferSummary: ["allergies", "medications", "problems"],
};

/**
 * The catalog section keys a {@link DocumentType} SHALL contain, in a stable
 * order. Returns an empty array when no unconditional in-catalog SHALL section
 * is asserted for that type (see the module note — empty ≠ "no requirements").
 *
 * @example
 * ```ts
 * import { requiredSectionKeys } from "@cosyte/ccda";
 * requiredSectionKeys("ccd"); // ["allergies", "medications", "problems", "results"]
 * requiredSectionKeys("progressNote"); // []
 * ```
 */
export function requiredSectionKeys(documentType: DocumentType): readonly string[] {
  return REQUIRED_SECTIONS[documentType];
}

/**
 * The SHALL section keys a {@link DocumentType} requires that are **absent** from
 * `presentKeys`, preserving the type's declared order. The parser passes the set
 * of recognized section keys it framed; each returned key becomes one
 * `REQUIRED_SECTION_MISSING` warning. Returns an empty array when every required
 * section is present (or the type asserts none).
 *
 * @example
 * ```ts
 * import { missingRequiredSections } from "@cosyte/ccda";
 * missingRequiredSections("ccd", new Set(["allergies", "problems"]));
 * // ["medications", "results"]
 * ```
 */
export function missingRequiredSections(
  documentType: DocumentType,
  presentKeys: ReadonlySet<string>,
): readonly string[] {
  return REQUIRED_SECTIONS[documentType].filter((key) => !presentKeys.has(key));
}
