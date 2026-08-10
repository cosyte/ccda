/**
 * Per-document-type **required-section** (SHALL) tables for C-CDA R2.1, traced
 * to the Implementation Guide's document-level templates. Each of the twelve
 * recognized {@link DocumentType}s maps to the catalog section keys it SHALL
 * contain, used by the parser to emit `REQUIRED_SECTION_MISSING` (a Tier-2
 * **warning**, never a fatal: a missing required section never blocks reading
 * the data that *is* present).
 *
 * **The CCD row is fully traced.** Its six keys are read directly off the
 * normative C-CDA R2.1 Schematron's CCD (V3) *errors* rule (see the comment on
 * the `ccd` entry for the six CONF ids). This table and the builder's
 * `DOC_TYPE_SPECS.ccd.shallSections` now name the **same six**; they disagreed
 * (four here, five there, excluding/including Vital Signs and both omitting
 * Social History) until the Schematron settled it. Keep them in lockstep: if they
 * drift again, `buildCcda` emits a set the parser will not validate, or vice
 * versa. The other rows' provenance is unchanged and varies per type.
 *
 * **Conservative by design.** This table asserts only *unconditional*,
 * high-confidence SHALL constraints whose section is in this parser's
 * recognized catalog. It deliberately **omits**:
 *
 * - **Choice constraints** (`SHALL contain A OR B`), asserting either half as
 *   unconditional would mis-flag conformant documents. The Referral Note's
 *   Assessment-and-Plan requirement (CONF:1198-29102, an *Assessment and Plan*
 *   Section, **or** an *Assessment* Section **and** a *Plan of Treatment* Section)
 *   is one such choice, so neither half is asserted here.
 * - **SHOULD / MAY** sections, only SHALL is enforced. (For the Referral Note
 *   this is why *Results* and *Plan of Treatment* are absent: the normative R2.1
 *   Schematron marks them SHOULD, CONF:1198-29090 / -29066, not SHALL.)
 * - **SHALL sections outside the recognized catalog** (e.g. Hospital Course,
 *   Physical Exam), the parser cannot recognize them, so it does not pretend to
 *   validate them.
 *
 * A document type with an **empty** list is therefore *"no unconditional,
 * in-catalog SHALL section is asserted yet"*, **not** *"this type has no
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
  // CCD (…22.1.2:2015-08-01) SHALL: six sections, read off the normative C-CDA
  // R2.1 Schematron's CCD (V3) *errors* rule: Allergies and Intolerances
  // (entries required) (V3) CONF:1198-30662, Medications (entries required) (V2)
  // -30664, Problem (entries required) (V3) -30666, Results (entries required)
  // (V3) -30670, Social History (V3) -30688, Vital Signs (entries required) (V3)
  // -30690. Procedures (-30668) and Plan of Treatment (-30686) are in the
  // *warnings* rule as SHOULD, so neither is asserted. All six are in this
  // parser's recognized catalog, so the whole set is assertable.
  ccd: ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"],
  // (see R21_SCOPED_SECTIONS below: two of those six are asserted only against a
  // document that actually carries the R2.1 stamp the CONF ids are scoped by)
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
 * Per-document-type SHALL keys whose normative constraint is **scoped to the
 * R2.1 stamp**, and which are therefore asserted only against a document whose
 * document-level `templateId` actually carries `@extension="2015-08-01"`.
 *
 * **Why this exists.** The CCD's six CONF ids do not float free: they live in a
 * Schematron rule whose context predicate is
 * `cda:ClinicalDocument[cda:templateId[@root='…22.1.2' and @extension='2015-08-01']]`.
 * They bind an R2.1-stamped CCD and say nothing at all about a document carrying
 * the same root with **no** extension (an R1.1-origin CCD, exactly the shape that
 * raises `TEMPLATE_EXTENSION_ABSENT`). Reading the asserts without their context
 * asserts a named clause against a document that clause does not reach.
 *
 * **Only the keys this package NEWLY asserted are scoped**, not all six.
 * `allergies`/`medications`/`problems`/`results` were asserted for every CCD
 * before the Schematron was obtained and stay that way: narrowing them would be
 * as unsourced as broadening them, and **there is no R1.1 Schematron in hand**.
 * So an unstamped CCD is asserted **exactly as it was before**, and the two new
 * keys are added only where a normative sentence actually covers them.
 *
 * **This is emphatically NOT a claim that R1.1 did not require Social History or
 * Vital Signs.** It is the absence of a source, recorded as silence rather than
 * guessed in either direction. If the R1.1 Schematron is ever obtained, the
 * honest move is to give R1.1 its own traced row, never to assume this one.
 * @internal
 */
const R21_SCOPED_SECTIONS: Partial<Readonly<Record<DocumentType, ReadonlySet<string>>>> = {
  ccd: new Set(["socialHistory", "vitalSigns"]),
};

/**
 * How a required-section lookup should treat version-scoped SHALL constraints.
 */
export interface RequiredSectionOptions {
  /**
   * Whether the document carries the R2.1 `@extension="2015-08-01"` stamp on its
   * document-level `templateId`. Defaults to `true`, because these tables are
   * written against C-CDA R2.1. Pass `false` for an R1.1-origin document (the
   * condition that raises `TEMPLATE_EXTENSION_ABSENT`) to drop the SHALL keys
   * whose normative constraint is scoped to the R2.1 stamp.
   */
  readonly r21Stamped?: boolean;
}

/** The SHALL keys asserted for `documentType` under `options`. @internal */
function assertedKeys(
  documentType: DocumentType,
  options?: RequiredSectionOptions,
): readonly string[] {
  const all = REQUIRED_SECTIONS[documentType];
  if (options?.r21Stamped !== false) return all;
  const scoped = R21_SCOPED_SECTIONS[documentType];
  if (scoped === undefined) return all;
  return all.filter((key) => !scoped.has(key));
}

/**
 * The catalog section keys a {@link DocumentType} SHALL contain, in a stable
 * order. Returns an empty array when no unconditional in-catalog SHALL section
 * is asserted for that type (see the module note, empty ≠ "no requirements").
 *
 * @example
 * ```ts
 * import { requiredSectionKeys } from "@cosyte/ccda";
 * requiredSectionKeys("ccd");
 * // ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"]
 * requiredSectionKeys("progressNote"); // []
 *
 * // An R1.1-origin CCD (no R2.1 stamp) drops the R2.1-scoped keys:
 * requiredSectionKeys("ccd", { r21Stamped: false });
 * // ["allergies", "medications", "problems", "results"]
 * ```
 */
export function requiredSectionKeys(
  documentType: DocumentType,
  options?: RequiredSectionOptions,
): readonly string[] {
  return assertedKeys(documentType, options);
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
 * // ["medications", "results", "socialHistory", "vitalSigns"]
 *
 * // The same document without the R2.1 stamp:
 * missingRequiredSections("ccd", new Set(["allergies", "problems"]), { r21Stamped: false });
 * // ["medications", "results"]
 * ```
 */
export function missingRequiredSections(
  documentType: DocumentType,
  presentKeys: ReadonlySet<string>,
  options?: RequiredSectionOptions,
): readonly string[] {
  return assertedKeys(documentType, options).filter((key) => !presentKeys.has(key));
}
