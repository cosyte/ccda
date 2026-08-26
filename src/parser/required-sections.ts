/**
 * Per-document-type **required-section** (SHALL) tables for C-CDA R2.1, traced
 * to the Implementation Guide's document-level templates. Each of the twelve
 * recognized {@link DocumentType}s maps to the catalog section keys it SHALL
 * contain, used by the parser to emit `REQUIRED_SECTION_MISSING` (a Tier-2
 * **warning**, never a fatal: a missing required section never blocks reading
 * the data that *is* present).
 *
 * **Every one of the twelve rows is now read off the normative source.** Each
 * asserted key names the conformance statement it came from and the source's own
 * name for the section, each SHALL section the source names but this package
 * cannot assert is enumerated with the reason, and every row names the artifact
 * and artifact revision the reading was taken from
 * ({@link RequiredSectionStatus.source}). No type reports `untraced`.
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
 *   Schematron marks them SHOULD, CONF:1198-29090 / -29066, not SHALL. For the
 *   Discharge Summary it is why *Discharge Medications* is absent: that section
 *   is in the document's *warnings* rule, CONF:1198-30525, not its errors rule.)
 * - **SHALL sections outside the recognized catalog** (e.g. Hospital Course,
 *   Physical Exam), the parser cannot recognize them, so it does not pretend to
 *   validate them. They are still enumerated, by the source's own name and id.
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
 *
 * **A third emptiness exists and is reported as its own state.** These rules are
 * scoped to the C-CDA R2.1 version stamp, so a document stamped for a release
 * this package has not read is outside all of them. It is reported
 * `not-evaluated` ({@link RequiredSectionEvaluation}) and draws no
 * `REQUIRED_SECTION_MISSING` at all; it emphatically does **not** fall back to
 * the R1.1-origin reduction, which is a reading of a document that carries no
 * stamp and which silently dropped Social History and Vital Signs from a
 * `2024-05-01` CCD through `0.0.15`.
 *
 * **Keep the builder in lockstep.** This table and the builder's
 * `DOC_TYPE_SPECS.*.shallSections` name the same sections for the two document
 * types the builder emits (CCD, Referral Note). If they drift, `buildCcda` emits
 * a set the parser will not validate, or vice versa.
 */

import { DOCUMENT_TYPES, type DocumentType, type TemplateStampReading } from "./templates.js";

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
  //
  // Discharge Summary (…22.1.8:2015-08-01) SHALL: four sections, read off the
  // normative C-CDA R2.1 Schematron's Discharge Summary *errors* rule in the
  // rule's own order: Allergies and Intolerances Section (entries optional) (V3)
  // (CONF:1198-30520), Hospital Course Section (-30522), Discharge Diagnosis
  // Section (V3) (-30524), Plan of Treatment Section (V2) (-30528). Hospital
  // Course is an IHE PCC template outside this parser's catalog, so it is
  // enumerated rather than asserted. **Discharge Medications is NOT a SHALL
  // here**: the source puts it in the document's *warnings* rule as a SHOULD
  // (CONF:1198-30525), so asserting it drew a false REQUIRED_SECTION_MISSING on
  // a conformant Discharge Summary that omits it. It was withdrawn for that
  // reason and Plan of Treatment, which the errors rule does require, added.
  dischargeSummary: ["allergies", "hospitalDischargeDiagnosis", "planOfTreatment"],
  // Referral Note (…22.1.14:2015-08-01) SHALL: Problem (CONF:1198-29087),
  // Allergies (-30912), Medications (-30923), and Reason for Referral (-30925).
  // All four are in this parser's catalog and all four are asserted; the
  // Assessment/Plan choice (-29102) stays omitted per the module note. The
  // re-read against the normative R2.1 Schematron confirmed this set unchanged,
  // so the keys keep their pre-existing unstamped reading.
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
  // History and Physical (…22.1.3:2015-08-01) SHALL: ten sections, read off the
  // Schematron's History and Physical *errors* rule in the rule's own order.
  // Seven are in this parser's catalog and are asserted: Allergies and
  // Intolerances (entries optional) (V3) (CONF:1198-30572), Family History (V3)
  // (-30584), Past Medical History (V3) (-30588), Medications (entries optional)
  // (V2) (-30596), Results (entries optional) (V3) (-30606), Social History (V3)
  // (-30610), Vital Signs (entries optional) (V3) (-30612). Three are outside the
  // catalog and are enumerated instead: General Status (-30586), Physical Exam
  // (V3) (-30598), Review of Systems (-30608). The rule's two choices (-30613
  // chief-complaint/reason-for-visit, -30614 assessment/plan) assert neither
  // half. Only `allergies` was asserted before this trace, so the other six are
  // stamp-scoped (see R21_SCOPED_SECTIONS).
  historyAndPhysical: [
    "allergies",
    "familyHistory",
    "pastMedicalHistory",
    "medications",
    "results",
    "socialHistory",
    "vitalSigns",
  ],
  progressNote: [],
  procedureNote: [],
  operativeNote: [],
  // Care Plan (…22.1.15:2015-08-01) SHALL: exactly two sections, read off the
  // Schematron's Care Plan *errors* rule: Health Concerns Section (V2)
  // (CONF:1198-28756) and Goals Section (-28762). Both are in this parser's
  // catalog, so the whole obligation is asserted. The same rule SHALL NOT admit a
  // Plan of Treatment Section (-31044), which is a prohibition rather than an
  // obligation and so is not a required-section claim either way.
  carePlan: ["healthConcerns", "goals"],
  diagnosticImagingReport: [],
  unstructuredDocument: [],
  // Transfer Summary (…22.1.13:2015-08-01) SHALL: six sections, read off the
  // Schematron's Transfer Summary *errors* rule in the rule's own order, all six
  // in this parser's catalog: Allergies and Intolerances (entries required) (V3)
  // (CONF:1198-28256), Medications (entries required) (V2) (-28278), Problem
  // (entries required) (V3) (-28284), Results (entries required) (V3) (-28288),
  // Vital Signs (entries required) (V3) (-28292), Reason for Referral Section
  // (V2) (-31343). The rule's assessment/plan choice (-31582) asserts neither
  // half. Allergies, Medications and Problems were asserted before this trace;
  // the other three are stamp-scoped (see R21_SCOPED_SECTIONS).
  transferSummary: [
    "allergies",
    "medications",
    "problems",
    "results",
    "vitalSigns",
    "reasonForReferral",
  ],
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
 *
 * **The same asymmetry governs every row below**, because every document-level
 * rule read here carries the R2.1 stamp in its context predicate: a key this
 * package already asserted keeps its unstamped reading, a key first asserted
 * from one of those rules is scoped to the stamp. A key **withdrawn** because the
 * source states it as SHOULD or as a choice is withdrawn from *both* readings:
 * the withdrawal is a statement that no sentence made it unconditional, which
 * the stamp does not change.
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
  // Plan of Treatment (CONF:1198-30528) is the one key the Discharge Summary
  // trace added, so it is the one key scoped to the stamp. Allergies and
  // Discharge Diagnosis keep the unstamped reading they already had.
  dischargeSummary: new Set(["planOfTreatment"]),
  // `allergies` is the only History and Physical key that predates the trace, so
  // the other six are scoped.
  historyAndPhysical: new Set([
    "familyHistory",
    "pastMedicalHistory",
    "medications",
    "results",
    "socialHistory",
    "vitalSigns",
  ]),
  // Allergies, Medications and Problems predate the trace for a Transfer
  // Summary; Results, Vital Signs and Reason for Referral are new from the
  // stamped rule.
  transferSummary: new Set(["results", "vitalSigns", "reasonForReferral"]),
};

/**
 * How a required-section lookup should treat version-scoped SHALL constraints.
 *
 * **Two routes, and the newer one is a superset.** `r21Stamped` is the published
 * two-state option and its behaviour is a compatibility contract: it is
 * unchanged, and `requiredSectionKeys("ccd", { r21Stamped: false })` returns
 * exactly what it always returned. `stamp` is the three-state route, added
 * because a boolean cannot express the third state at all (see
 * {@link TemplateStampReading}) and repurposing it would have moved a published
 * behaviour rather than adding one. When both are supplied, `stamp` wins: it is
 * strictly more specific.
 */
export interface RequiredSectionOptions {
  /**
   * Whether the document carries the R2.1 `@extension="2015-08-01"` stamp on its
   * document-level `templateId`. Defaults to `true`, because these tables are
   * written against C-CDA R2.1. Pass `false` for an R1.1-origin document (the
   * condition that raises `TEMPLATE_EXTENSION_ABSENT`) to drop the SHALL keys
   * whose normative constraint is scoped to the R2.1 stamp.
   *
   * **It cannot describe a document from a later release**, which is what
   * {@link RequiredSectionOptions.stamp} is for: `false` there means "no stamp
   * at all", and answering `false` for a `2024-05-01` document takes the
   * R1.1-origin reduction on a document that release never wrote.
   */
  readonly r21Stamped?: boolean;
  /**
   * The three-state reading of the document-level `templateId`'s version stamp.
   * Supersedes {@link RequiredSectionOptions.r21Stamped} when both are given.
   *
   * `unmodeled-release` is the state the boolean cannot hold: the obligation is
   * **not evaluated**, so the key set is empty and
   * {@link RequiredSectionStatus.evaluation} says which emptiness that is.
   */
  readonly stamp?: TemplateStampReading;
}

/**
 * Resolve the two option routes to one reading. `stamp` wins when present;
 * otherwise the published boolean maps onto the two states it can express.
 * @internal
 */
function stampReading(options?: RequiredSectionOptions): TemplateStampReading {
  if (options?.stamp !== undefined) return options.stamp;
  return options?.r21Stamped === false ? "unstamped" : "r21-stamped";
}

/** The SHALL keys asserted for `documentType` under `options`. @internal */
function assertedKeys(
  documentType: DocumentType,
  options?: RequiredSectionOptions,
): readonly string[] {
  const reading = stampReading(options);
  // A release this package has not read has no asserted set here, and the
  // R1.1-origin reduction is emphatically NOT the fallback: the reduction is a
  // statement about a document that carries no stamp, and applying it to one
  // stamped for a later release is how a post-R2.1 CCD came to lose Social
  // History and Vital Signs in silence.
  if (reading === "unmodeled-release") return [];
  const all = REQUIRED_SECTIONS[documentType];
  if (reading !== "unstamped") return all;
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
 *
 * // A CCD stamped for a release this package does not model asserts NOTHING,
 * // and it is not the R1.1-origin reduction:
 * requiredSectionKeys("ccd", { stamp: "unmodeled-release" }); // []
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
 *
 * // The same document stamped for an unmodelled release: nothing is reported
 * // missing, because nothing was evaluated. See requiredSectionStatus().
 * missingRequiredSections("ccd", new Set(["allergies", "problems"]), {
 *   stamp: "unmodeled-release",
 * });
 * // []
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
 * **A state is about the TYPE, and no option moves it.** The orthogonal question,
 * whether an obligation was computed for the document in front of you at all, is
 * {@link RequiredSectionEvaluation}, which is where a stamp naming an unmodelled
 * release shows up. Reading `traced-complete` beside an empty key set is not a
 * contradiction; it means the type's obligation is fully read and this lookup
 * did not evaluate it.
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
 *   existing somewhere. **No recognized document type reports this today**: the
 *   value stays in the vocabulary because it is the honest state for a type
 *   whose obligation has not been read, and removing it from the union would be
 *   a breaking change that buys nothing.
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
 * Whether a {@link RequiredSectionStatus}'s key set was **computed for this
 * document at all**, as opposed to computed and found empty.
 *
 * This is the axis {@link RequiredSectionVerification} deliberately does not
 * carry. `verification` is a claim about the *type*: how much of that document
 * type's obligation this package has read off the normative source, which no
 * option moves. `evaluation` is a claim about the *lookup*: whether the version
 * stamp supplied put the document inside the tables at all.
 *
 * - `evaluated`: the keys below are this type's obligation under the supplied
 *   stamp reading. An empty set means the type asserts none, and `verification`
 *   says which emptiness that is.
 * - `not-evaluated`: **no obligation was computed.** The only route to it today
 *   is `{ stamp: "unmodeled-release" }`: the document names a C-CDA release this
 *   package has not read, so `keys` is empty because nothing was asked, not
 *   because nothing is required. Reducing the set instead would be a confident
 *   wrong statement about conformance, which is the failure this state exists to
 *   prevent.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus, type RequiredSectionEvaluation } from "@cosyte/ccda";
 * const e: RequiredSectionEvaluation = requiredSectionStatus("ccd", {
 *   stamp: "unmodeled-release",
 * }).evaluation;
 * // "not-evaluated"
 * ```
 */
export type RequiredSectionEvaluation = "evaluated" | "not-evaluated";

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
 * The normative artifact a document type's obligation was read from, and that
 * artifact's **own** revision date, so a reviewer holding a later revision can
 * tell a table has gone stale without re-deriving it.
 *
 * `revision` is the artifact's self-reported revision, never the date this
 * package read it: a re-read that changes nothing does not move it, and a
 * newer artifact does move it even if nobody has looked yet. That is the
 * property a staleness check needs.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus } from "@cosyte/ccda";
 * requiredSectionStatus("ccd").source?.revision; // "2025-09-08"
 * ```
 */
export interface RequiredSectionSource {
  /** The normative artifact, named as standards provenance. */
  readonly artifact: string;
  /** That artifact's own revision date, `YYYY-MM-DD`. */
  readonly revision: string;
}

/**
 * The single normative artifact every row in this module was read from: the
 * C-CDA R2.1 Schematron HL7 publishes for that release, "Consolidated CDA
 * Templates for Clinical Notes (US Realm) DSTU R2.1".
 *
 * **The revision is the artifact's own, taken from its head comment.** That
 * comment records the base generation ("Schematron generated from Trifolia on
 * 9/2/2022") followed by a dated manual-update log; the revision below is the
 * date of the last entry in that log. A publication that adds a log entry is a
 * newer revision of the same artifact and every table here is stale against it
 * until re-read.
 * @internal
 */
const R21_SCHEMATRON: RequiredSectionSource = {
  artifact: "HL7 C-CDA R2.1 normative Schematron (Consolidated CDA Templates for Clinical Notes)",
  revision: "2025-09-08",
};

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
 * status.source?.revision; // "2025-09-08"
 * ```
 */
export interface RequiredSectionStatus {
  /** The document type this status is about. */
  readonly documentType: DocumentType;
  /** How much of this type's obligation was read off the normative source. */
  readonly verification: RequiredSectionVerification;
  /**
   * Whether an obligation was computed for the supplied stamp reading at all.
   * `not-evaluated` says the empty `keys` below mean "nothing was asked",
   * never "nothing is required".
   */
  readonly evaluation: RequiredSectionEvaluation;
  /** The asserted SHALL keys, identical to {@link requiredSectionKeys}. */
  readonly keys: readonly string[];
  /** Provenance for each asserted key that was traced, in `keys` order. */
  readonly traced: readonly TracedRequiredSection[];
  /** Named SHALL sections this package does not assert, with the reason. */
  readonly unasserted: readonly UnassertedRequiredSection[];
  /**
   * The normative artifact this type's obligation was read from, and that
   * artifact's own revision date. `undefined` only where `verification` is
   * `untraced`, which nothing reports today: every recognized type names its
   * source.
   */
  readonly source: RequiredSectionSource | undefined;
}

/** The verification record behind one document type's status. @internal */
interface DocumentTypeTrace {
  readonly verification: RequiredSectionVerification;
  readonly traced: readonly TracedRequiredSection[];
  readonly unasserted: readonly UnassertedRequiredSection[];
  /** The artifact this row was read from; `undefined` only for an untraced row. */
  readonly source: RequiredSectionSource | undefined;
}

/**
 * Document type → what was read off the normative source **for that type**.
 *
 * **A state says what was verified, not what the repository has ever cited.**
 * `traced-complete` is a completeness claim about the source, so a row earns it
 * only by having its document-level rules re-read; a recorded conformance id
 * never promotes a row on its own. Every row below has been read, so none is
 * `untraced`, and each names the artifact and artifact revision it was read
 * from.
 *
 * Every id below is a `CONF:1198-` statement of the C-CDA R2.1 base
 * implementation guide, read from the Schematron HL7 publishes for that release.
 * Nothing from that artifact is vendored here: an id and the source's own name
 * for a section are the whole of what is copied.
 *
 * `traced` is written in `keys` order for each row, because
 * {@link requiredSectionStatus} filters it against the asserted set and promises
 * the caller that order.
 *
 * @internal
 */
const REQUIRED_SECTION_TRACE: Readonly<Record<DocumentType, DocumentTypeTrace>> = {
  ccd: {
    // Six SHALL sections, six in this parser's catalog, six asserted: the
    // obligation is covered, so the row is complete rather than partial. The
    // Procedures (CONF:1198-30668) and Plan of Treatment (-30686) sections a CCD
    // names are in the *warnings* rule as SHOULD, so they are not part of the
    // SHALL obligation and are not "unasserted SHALL sections" either.
    verification: "traced-complete",
    traced: [
      {
        key: "allergies",
        conformanceId: "CONF:1198-30662",
        sourceName: "Allergies and Intolerances Section (entries required) (V3)",
      },
      {
        key: "medications",
        conformanceId: "CONF:1198-30664",
        sourceName: "Medications Section (entries required) (V2)",
      },
      {
        key: "problems",
        conformanceId: "CONF:1198-30666",
        sourceName: "Problem Section (entries required) (V3)",
      },
      {
        key: "results",
        conformanceId: "CONF:1198-30670",
        sourceName: "Results Section (entries required) (V3)",
      },
      {
        key: "socialHistory",
        conformanceId: "CONF:1198-30688",
        sourceName: "Social History Section (V3)",
      },
      {
        key: "vitalSigns",
        conformanceId: "CONF:1198-30690",
        sourceName: "Vital Signs Section (entries required) (V3)",
      },
    ],
    unasserted: [],
    source: R21_SCHEMATRON,
  },
  dischargeSummary: {
    // Four SHALL sections, three of them in catalog and asserted. Hospital Course
    // is an IHE PCC template this parser does not recognize, so it is named here
    // rather than asserted. Discharge Medications is deliberately absent from
    // BOTH lists: the source states it as a SHOULD (CONF:1198-30525, in the
    // document's warnings rule), so it is not a SHALL section left unasserted, it
    // is not a SHALL section at all.
    verification: "traced-partial",
    traced: [
      {
        key: "allergies",
        conformanceId: "CONF:1198-30520",
        sourceName: "Allergies and Intolerances Section (entries optional) (V3)",
      },
      {
        key: "hospitalDischargeDiagnosis",
        conformanceId: "CONF:1198-30524",
        sourceName: "Discharge Diagnosis Section (V3)",
      },
      {
        key: "planOfTreatment",
        conformanceId: "CONF:1198-30528",
        sourceName: "Plan of Treatment Section (V2)",
      },
    ],
    unasserted: [
      {
        sourceName: "Hospital Course Section",
        conformanceId: "CONF:1198-30522",
        reason: "outside-section-catalog",
      },
    ],
    source: R21_SCHEMATRON,
  },
  referralNote: {
    verification: "traced-partial",
    traced: [
      {
        key: "allergies",
        conformanceId: "CONF:1198-30912",
        sourceName: "Allergies and Intolerances Section (entries required) (V3)",
      },
      {
        key: "medications",
        conformanceId: "CONF:1198-30923",
        sourceName: "Medications Section (entries required) (V2)",
      },
      {
        key: "problems",
        conformanceId: "CONF:1198-29087",
        sourceName: "Problem Section (entries required) (V3)",
      },
      {
        key: "reasonForReferral",
        conformanceId: "CONF:1198-30925",
        sourceName: "Reason for Referral Section (V2)",
      },
    ],
    unasserted: [
      {
        sourceName:
          "Assessment and Plan Section (V2), or an Assessment Section and a Plan of Treatment Section (V2)",
        conformanceId: "CONF:1198-29102",
        reason: "not-unconditionally-required",
      },
    ],
    source: R21_SCHEMATRON,
  },
  historyAndPhysical: {
    // Ten SHALL sections, seven in catalog and asserted, three outside it. Both
    // of the rule's choices are named too, each as one row carrying the source's
    // own enumeration of its alternatives: the choice is one conformance
    // statement, and splitting it into a row per alternative would record one id
    // against several sections.
    verification: "traced-partial",
    traced: [
      {
        key: "allergies",
        conformanceId: "CONF:1198-30572",
        sourceName: "Allergies and Intolerances Section (entries optional) (V3)",
      },
      {
        key: "familyHistory",
        conformanceId: "CONF:1198-30584",
        sourceName: "Family History Section (V3)",
      },
      {
        key: "pastMedicalHistory",
        conformanceId: "CONF:1198-30588",
        sourceName: "Past Medical History (V3)",
      },
      {
        key: "medications",
        conformanceId: "CONF:1198-30596",
        sourceName: "Medications Section (entries optional) (V2)",
      },
      {
        key: "results",
        conformanceId: "CONF:1198-30606",
        sourceName: "Results Section (entries optional) (V3)",
      },
      {
        key: "socialHistory",
        conformanceId: "CONF:1198-30610",
        sourceName: "Social History Section (V3)",
      },
      {
        key: "vitalSigns",
        conformanceId: "CONF:1198-30612",
        sourceName: "Vital Signs Section (entries optional) (V3)",
      },
    ],
    unasserted: [
      {
        sourceName: "General Status Section",
        conformanceId: "CONF:1198-30586",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Physical Exam Section (V3)",
        conformanceId: "CONF:1198-30598",
        reason: "outside-section-catalog",
      },
      {
        sourceName: "Review of Systems Section",
        conformanceId: "CONF:1198-30608",
        reason: "outside-section-catalog",
      },
      {
        sourceName:
          "Chief Complaint and Reason for Visit Section, or a Chief Complaint Section, or a Reason for Visit Section",
        conformanceId: "CONF:1198-30613",
        reason: "not-unconditionally-required",
      },
      {
        sourceName:
          "Assessment and Plan Section (V2), or an Assessment Section and a Plan of Treatment Section (V2)",
        conformanceId: "CONF:1198-30614",
        reason: "not-unconditionally-required",
      },
    ],
    source: R21_SCHEMATRON,
  },
  carePlan: {
    // Two SHALL sections, both in catalog, both asserted. The same rule also
    // states that a Care Plan SHALL NOT carry a Plan of Treatment Section
    // (CONF:1198-31044); a prohibition is not a section obligation, so it is
    // neither asserted nor listed as unasserted here.
    verification: "traced-complete",
    traced: [
      {
        key: "healthConcerns",
        conformanceId: "CONF:1198-28756",
        sourceName: "Health Concerns Section (V2)",
      },
      {
        key: "goals",
        conformanceId: "CONF:1198-28762",
        sourceName: "Goals Section",
      },
    ],
    unasserted: [],
    source: R21_SCHEMATRON,
  },
  transferSummary: {
    verification: "traced-partial",
    traced: [
      {
        key: "allergies",
        conformanceId: "CONF:1198-28256",
        sourceName: "Allergies and Intolerances Section (entries required) (V3)",
      },
      {
        key: "medications",
        conformanceId: "CONF:1198-28278",
        sourceName: "Medications Section (entries required) (V2)",
      },
      {
        key: "problems",
        conformanceId: "CONF:1198-28284",
        sourceName: "Problem Section (entries required) (V3)",
      },
      {
        key: "results",
        conformanceId: "CONF:1198-28288",
        sourceName: "Results Section (entries required) (V3)",
      },
      {
        key: "vitalSigns",
        conformanceId: "CONF:1198-28292",
        sourceName: "Vital Signs Section (entries required) (V3)",
      },
      {
        key: "reasonForReferral",
        conformanceId: "CONF:1198-31343",
        sourceName: "Reason for Referral Section (V2)",
      },
    ],
    unasserted: [
      {
        sourceName:
          "Assessment and Plan Section (V2), or an Assessment Section and a Plan of Treatment Section (V2)",
        conformanceId: "CONF:1198-31582",
        reason: "not-unconditionally-required",
      },
    ],
    source: R21_SCHEMATRON,
  },
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
    source: R21_SCHEMATRON,
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
    source: R21_SCHEMATRON,
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
    source: R21_SCHEMATRON,
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
    source: R21_SCHEMATRON,
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
    source: R21_SCHEMATRON,
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
    source: R21_SCHEMATRON,
  },
};

/**
 * The required-section obligation of `documentType` **with its verification
 * state attached**: the same asserted keys {@link requiredSectionKeys} returns
 * under the same options, plus how much of the obligation was read off the
 * normative source and what is deliberately left unasserted.
 *
 * `options` narrows `keys` (and the `traced` rows beside them) exactly as
 * {@link requiredSectionKeys} does, and sets `evaluation`. It does **not** move
 * `verification`, nor `unasserted`, nor `source`: those record what was read
 * about the type, not what a particular document is asserted against.
 *
 * @example
 * ```ts
 * import { requiredSectionStatus } from "@cosyte/ccda";
 * requiredSectionStatus("unstructuredDocument").verification; // "not-applicable"
 * requiredSectionStatus("ccd").verification; // "traced-complete"
 * requiredSectionStatus("ccd").source?.revision; // "2025-09-08"
 * requiredSectionStatus("consultationNote", { r21Stamped: false }).keys; // []
 * requiredSectionStatus("ccd", { stamp: "unmodeled-release" }).evaluation;
 * // "not-evaluated"
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
    evaluation: stampReading(options) === "unmodeled-release" ? "not-evaluated" : "evaluated",
    keys,
    traced: trace.traced.filter((row) => asserted.has(row.key)),
    unasserted: trace.unasserted,
    source: trace.source,
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
 * requiredSectionStatuses().filter((s) => s.verification === "untraced").length; // 0
 * ```
 */
export function requiredSectionStatuses(
  options?: RequiredSectionOptions,
): readonly RequiredSectionStatus[] {
  return DOCUMENT_TYPES.map((documentType) => requiredSectionStatus(documentType, options));
}
