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
 * requirements."* Which of those emptinesses a caller is looking at is not a
 * guess: {@link requiredSectionStatus} attaches a
 * {@link RequiredSectionVerification} to every one of the twelve types, and a
 * type that was traced against the normative source names the SHALL sections it
 * still does not assert, with the reason each one is unassertable. See the
 * package README "Required-section validation" for the full provenance +
 * known-limitations note.
 */

import { DOCUMENT_TYPES, type DocumentType } from "./templates.js";

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
  // Consultation Note (…22.1.4:2015-08-01) SHALL: three in-catalog sections, read
  // off the normative C-CDA R2.1 Schematron's Consultation Note errors rule in
  // the rule's own order: History of Present Illness (CONF:1198-28907),
  // Allergies and Intolerances (entries required) (V3) (-28911), Problem
  // (entries required) (V3) (-28929). Its other two section SHALLs are choices
  // (-9504 Reason for Referral **or** Reason for Visit, -9501 Assessment and
  // Plan **or** Assessment plus Plan of Treatment), so neither half of either is
  // asserted; both are named in REQUIRED_SECTION_TRACE below. All three CONFs
  // live in a rule whose context predicate carries the R2.1 stamp, so all three
  // are R21_SCOPED_SECTIONS entries.
  consultationNote: ["historyOfPresentIllness", "allergies", "problems"],
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
  // Every Consultation Note key is new here, and every one of them comes from a
  // rule whose context is
  // `cda:ClinicalDocument[cda:templateId[@root='…22.1.4' and @extension='2015-08-01']]`,
  // so the whole row is stamp-scoped. The CCD's asymmetry (only the two new keys
  // scoped) has no analogue here: there is nothing this package asserted for a
  // Consultation Note before the trace, so there is no pre-existing unstamped
  // reading to preserve.
  consultationNote: new Set(["historyOfPresentIllness", "allergies", "problems"]),
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

/**
 * How much of a {@link DocumentType}'s required-section obligation this package
 * has actually read off the normative C-CDA R2.1 base implementation guide (its
 * `CONF:1198-` document-level conformance statements and the Schematron HL7
 * publishes in that release).
 *
 * The four states are exhaustive and mutually exclusive, so an **empty** key set
 * is never ambiguous: the value says which emptiness it is.
 *
 * - `traced-complete`: traced, and every SHALL section the source names for the
 *   type is asserted.
 * - `traced-partial`: traced, and one or more named SHALL sections are not
 *   asserted. Each is named in {@link RequiredSectionStatus.unasserted} with the
 *   reason it is unassertable.
 * - `untraced`: whatever keys the type asserts predate the trace, and no claim
 *   is made that they are complete. A citation recorded against a key does not
 *   promote the type out of this state, because a traced state is a claim about
 *   the source having been read for **that** type, not about provenance
 *   existing somewhere.
 * - `not-applicable`: the type structurally carries no sections, so it has no
 *   section obligation to trace.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus, type RequiredSectionVerification } from "@cosyte/ccda";
 * const state: RequiredSectionVerification = requiredSectionStatus("progressNote").verification;
 * // "traced-partial"
 * ```
 */
export type RequiredSectionVerification =
  | "traced-complete"
  | "traced-partial"
  | "untraced"
  | "not-applicable";

/**
 * One asserted SHALL section key together with the conformance statement it was
 * read from and the source's own name for the section, so a reviewer holding the
 * same artifact can re-check the assertion instead of re-deriving it.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus } from "@cosyte/ccda";
 * requiredSectionStatus("consultationNote").traced[0];
 * // { key: "historyOfPresentIllness", conformanceId: "CONF:1198-28907", sourceName: "History of Present Illness Section" }
 * ```
 */
export interface TracedRequiredSection {
  /** The recognized catalog section key this package asserts. */
  readonly key: string;
  /** The conformance statement the assertion was read from (`CONF:1198-` + digits). */
  readonly conformanceId: string;
  /** The source's own name for the required section. */
  readonly sourceName: string;
}

/**
 * Why a SHALL section the source names is **not** asserted. Exactly two reasons
 * exist, and neither is a judgement call:
 *
 * - `outside-section-catalog`: this parser does not recognize the section at
 *   all, so it can neither find it nor honestly report it missing.
 * - `not-unconditionally-required`: the source does not require it
 *   unconditionally (a choice such as `SHALL contain A or B`, or a rule context
 *   conditioned on something other than the R2.1 `@extension` stamp), and
 *   asserting a conditional requirement as unconditional mis-flags conformant
 *   documents.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus, type UnassertedSectionReason } from "@cosyte/ccda";
 * const why: UnassertedSectionReason | undefined =
 *   requiredSectionStatus("operativeNote").unasserted[0]?.reason;
 * // "outside-section-catalog"
 * ```
 */
export type UnassertedSectionReason = "outside-section-catalog" | "not-unconditionally-required";

/**
 * A SHALL section the normative source names for a document type that this
 * package deliberately does not assert, named so a caller can enumerate exactly
 * what the parser is not checking, and why.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus } from "@cosyte/ccda";
 * requiredSectionStatus("diagnosticImagingReport").unasserted[0];
 * // { sourceName: "Findings Section (DIR)", conformanceId: "CONF:1198-30697", reason: "outside-section-catalog" }
 * ```
 */
export interface UnassertedRequiredSection {
  /** The source's own name for the section. */
  readonly sourceName: string;
  /** The conformance statement that requires it. */
  readonly conformanceId: string;
  /** Which of the two permitted reasons keeps it out of the asserted set. */
  readonly reason: UnassertedSectionReason;
}

/**
 * A document type's required-section obligation **and** how much of it was
 * verified against the normative source: the asserted keys a caller already gets
 * from {@link requiredSectionKeys}, plus the verification state, the provenance
 * of every key traced here, and every named SHALL section left unasserted.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus } from "@cosyte/ccda";
 * const status = requiredSectionStatus("consultationNote");
 * status.verification; // "traced-partial"
 * status.keys; // ["historyOfPresentIllness", "allergies", "problems"]
 * status.unasserted.map((u) => u.reason); // ["not-unconditionally-required", ...]
 * ```
 */
export interface RequiredSectionStatus {
  /** The document type this status is about. */
  readonly documentType: DocumentType;
  /** How much of this type's obligation was read off the normative source. */
  readonly verification: RequiredSectionVerification;
  /** The asserted SHALL keys, identical to {@link requiredSectionKeys}. */
  readonly keys: readonly string[];
  /** Provenance for each asserted key that was traced, in `keys` order. */
  readonly traced: readonly TracedRequiredSection[];
  /** Named SHALL sections this package does not assert, with the reason. */
  readonly unasserted: readonly UnassertedRequiredSection[];
}

/** The verification record behind one document type's status. @internal */
interface DocumentTypeTrace {
  readonly verification: RequiredSectionVerification;
  readonly traced: readonly TracedRequiredSection[];
  readonly unasserted: readonly UnassertedRequiredSection[];
}

/** A traced row with no trace of its own: the shape shared by every `untraced` type. @internal */
const NOT_TRACED: DocumentTypeTrace = { verification: "untraced", traced: [], unasserted: [] };

/**
 * Document type → what was read off the normative source **for that type**.
 *
 * **A state says what was verified, not what the repository has ever cited.**
 * The six rows that already asserted keys stay `untraced`, including the two
 * whose keys carry conformance ids from an earlier trace (CCD, Referral Note):
 * `traced-complete` is a completeness claim about the source, and re-reading the
 * source for those six is deliberately not part of this table's work. Their
 * citations are untouched, in the comments on `REQUIRED_SECTIONS` above.
 *
 * Every id below is a `CONF:1198-` statement of the C-CDA R2.1 base
 * implementation guide, read from the Schematron HL7 publishes for that release.
 * Nothing from that artifact is vendored here: an id and the source's own name
 * for a section are the whole of what is copied.
 *
 * @internal
 */
const REQUIRED_SECTION_TRACE: Readonly<Record<DocumentType, DocumentTypeTrace>> = {
  ccd: NOT_TRACED,
  dischargeSummary: NOT_TRACED,
  referralNote: NOT_TRACED,
  historyAndPhysical: NOT_TRACED,
  carePlan: NOT_TRACED,
  transferSummary: NOT_TRACED,
  consultationNote: {
    verification: "traced-partial",
    traced: [
      {
        key: "historyOfPresentIllness",
        conformanceId: "CONF:1198-28907",
        sourceName: "History of Present Illness Section",
      },
      {
        key: "allergies",
        conformanceId: "CONF:1198-28911",
        sourceName: "Allergies and Intolerances Section (entries required) (V3)",
      },
      {
        key: "problems",
        conformanceId: "CONF:1198-28929",
        sourceName: "Problem Section (entries required) (V3)",
      },
    ],
    unasserted: [
      {
        sourceName: "Reason for Referral Section or Reason for Visit Section",
        conformanceId: "CONF:1198-9504",
        reason: "not-unconditionally-required",
      },
      {
        sourceName:
          "Assessment and Plan Section, or an Assessment Section and a Plan of Treatment Section",
        conformanceId: "CONF:1198-9501",
        reason: "not-unconditionally-required",
      },
    ],
  },
  progressNote: {
    // The open question this settles: a Progress Note really does name no
    // unconditional SHALL section. Its one section obligation is the
    // Assessment/Plan choice, so the empty key set is now a traced fact rather
    // than an unread table.
    verification: "traced-partial",
    traced: [],
    unasserted: [
      {
        sourceName:
          "Assessment and Plan Section (V2), or an Assessment Section and a Plan of Treatment Section (V2)",
        conformanceId: "CONF:1198-30657",
        reason: "not-unconditionally-required",
      },
    ],
  },
  procedureNote: {
    verification: "traced-partial",
    traced: [],
    unasserted: [
      {
        sourceName: "Complications Section (V3)",
        conformanceId: "CONF:1198-30387",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Procedure Description Section",
        conformanceId: "CONF:1198-30356",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Procedure Indications Section (V2)",
        conformanceId: "CONF:1198-30358",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Postprocedure Diagnosis Section (V3)",
        conformanceId: "CONF:1198-30360",
        reason: "outside-section-catalog",
      },
      {
        sourceName:
          "Assessment and Plan Section (V2), or an Assessment Section and a Plan of Treatment Section (V2)",
        conformanceId: "CONF:1198-30412",
        reason: "not-unconditionally-required",
      },
    ],
  },
  operativeNote: {
    verification: "traced-partial",
    traced: [],
    unasserted: [
      {
        sourceName: "Anesthesia Section (V2)",
        conformanceId: "CONF:1198-30487",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Complications Section (V3)",
        conformanceId: "CONF:1198-30489",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Preoperative Diagnosis Section (V3)",
        conformanceId: "CONF:1198-30491",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Procedure Estimated Blood Loss Section",
        conformanceId: "CONF:1198-30493",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Procedure Findings Section (V3)",
        conformanceId: "CONF:1198-30495",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Procedure Specimens Taken Section",
        conformanceId: "CONF:1198-30497",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Procedure Description Section",
        conformanceId: "CONF:1198-30499",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Postoperative Diagnosis Section",
        conformanceId: "CONF:1198-30501",
        reason: "outside-section-catalog",
      },
    ],
  },
  diagnosticImagingReport: {
    verification: "traced-partial",
    traced: [],
    unasserted: [
      {
        sourceName: "Findings Section (DIR)",
        conformanceId: "CONF:1198-30697",
        reason: "outside-section-catalog",
      },
    ],
  },
  unstructuredDocument: {
    // Decided structurally, not by a SHALL trace, and both halves of that were
    // confirmed against the source before the state was written down. The R2.1
    // Unstructured Document template does not admit a `structuredBody`: its
    // component SHALL contain exactly one `nonXMLBody` (CONF:1198-31086), and
    // the rule names no section at all. A body with no sections has no section
    // obligation, which is a different statement from "not verified yet".
    verification: "not-applicable",
    traced: [],
    unasserted: [],
  },
};

/**
 * The required-section obligation of `documentType` **with its verification
 * state attached**: the same asserted keys {@link requiredSectionKeys} returns
 * under the same options, plus how much of the obligation was read off the
 * normative source and what is deliberately left unasserted.
 *
 * `options` narrows `keys` (and the `traced` rows beside them) exactly as
 * {@link requiredSectionKeys} does. It does **not** move `verification`: the
 * state records what was verified about the type, not what a particular document
 * is asserted against.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus } from "@cosyte/ccda";
 * requiredSectionStatus("unstructuredDocument").verification; // "not-applicable"
 * requiredSectionStatus("ccd").verification; // "untraced"
 * requiredSectionStatus("consultationNote", { r21Stamped: false }).keys; // []
 * ```
 */
export function requiredSectionStatus(
  documentType: DocumentType,
  options?: RequiredSectionOptions,
): RequiredSectionStatus {
  const trace = REQUIRED_SECTION_TRACE[documentType];
  const keys = assertedKeys(documentType, options);
  const asserted = new Set(keys);
  return {
    documentType,
    verification: trace.verification,
    keys,
    traced: trace.traced.filter((row) => asserted.has(row.key)),
    unasserted: trace.unasserted,
  };
}

/**
 * Every recognized document type's {@link RequiredSectionStatus}, in
 * {@link DOCUMENT_TYPES} order. The enumeration a consumer uses to see the whole
 * picture at once: twelve entries, each carrying exactly one verification state.
 *
 * @example
 * ```ts
 * import { requiredSectionStatuses } from "@cosyte/ccda";
 * requiredSectionStatuses().filter((s) => s.verification === "untraced").length; // 6
 * ```
 */
export function requiredSectionStatuses(
  options?: RequiredSectionOptions,
): readonly RequiredSectionStatus[] {
  return DOCUMENT_TYPES.map((documentType) => requiredSectionStatus(documentType, options));
}
