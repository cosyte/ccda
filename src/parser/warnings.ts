/**
 * Tier-2 warning registry and factories for the `@cosyte/ccda` parser
 * pipeline. Consumers compare `warning.code === WARNING_CODES.<CODE>` to
 * narrow and react; the parser uses the factories here to construct every
 * warning it emits so that messages, payload shape, and positional context
 * stay consistent across stages.
 *
 * **No factory here takes a value parameter, and no message interpolates one.**
 * Every message string comes whole from the frozen {@link WARNING_MESSAGES}
 * registry below, so the complete set of strings this module can ever produce
 * is finite, enumerable and visible in one place. A handful of codes carry a
 * variant per closed-set key (a {@link CodeSlot}, a catalog section key, a
 * boolean); those variants are generated from the parser's own catalogs at
 * module load and are registry entries in exactly the same sense.
 *
 * This replaces the claim that stood here through `0.0.4`, that messages were
 * PHI-free "by construction" because factories interpolated only structural
 * values. That was false: thirteen factories and one fatal took
 * a value parameter straight from the document, a 500,000-byte templateId root
 * produced a 500,106-byte `.message`, and in strict mode it reached `err.stack`.
 * A parser cannot tell a structural value from a clinical one at the point it
 * echoes one, because a sender controls both. **The bound is the absence of the
 * parameter, not the good behaviour of the caller.**
 *
 * Consumers locate a deviation from `code` + {@link CcdaPosition}. The position
 * is bounded in its own right (`../parser/tokens.ts`): its `path` is a member of
 * the CDA element vocabulary or `<withheld>`, and its `sectionCode` is a LOINC
 * part number or `<withheld>`.
 */

import { SECTION_KEYS } from "./templates.js";
import type { CcdaPosition } from "./types.js";

/**
 * Stable string codes for every Tier-2 warning the parser may emit. The
 * registry is frozen via `as const` so TypeScript infers the exact string
 * literal union for `WarningCode`, there is zero runtime cost and no
 * magic-string comparisons for consumers. Each code is its own value
 * (`key === value`) so the set survives `Object.values(...)` into a snapshot
 * tripwire. Renaming a code is a **breaking change**.
 *
 * @example
 * ```ts
 * import { parseCcda, WARNING_CODES } from "@cosyte/ccda";
 * const doc = parseCcda(raw);
 * if (doc.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE)) {
 *   // handle an unrecognized document type
 * }
 * ```
 */
export const WARNING_CODES = {
  UNKNOWN_DOCUMENT_TEMPLATE: "UNKNOWN_DOCUMENT_TEMPLATE",
  MISSING_TEMPLATE_ID: "MISSING_TEMPLATE_ID",
  TEMPLATE_EXTENSION_ABSENT: "TEMPLATE_EXTENSION_ABSENT",
  UNKNOWN_SECTION_CODE: "UNKNOWN_SECTION_CODE",
  SECTION_MATCHED_BY_LOINC_FALLBACK: "SECTION_MATCHED_BY_LOINC_FALLBACK",
  INVALID_NULL_FLAVOR: "INVALID_NULL_FLAVOR",
  CONTRADICTORY_NULL_FLAVOR: "CONTRADICTORY_NULL_FLAVOR",
  UNKNOWN_NAMESPACE_PREFIX: "UNKNOWN_NAMESPACE_PREFIX",
  MALFORMED_DATETIME: "MALFORMED_DATETIME",
  MULTIPLE_RECORD_TARGETS: "MULTIPLE_RECORD_TARGETS",
  MISSING_ASSIGNING_AUTHORITY: "MISSING_ASSIGNING_AUTHORITY",
  ENCODING_BOM_STRIPPED: "ENCODING_BOM_STRIPPED",
  NEGATION_VS_NULLFLAVOR_AMBIGUOUS: "NEGATION_VS_NULLFLAVOR_AMBIGUOUS",
  ALLERGEN_GRANULARITY_SUSPECT: "ALLERGEN_GRANULARITY_SUSPECT",
  CODE_NARRATIVE_MISMATCH: "CODE_NARRATIVE_MISMATCH",
  NARRATIVE_REFERENCE_BROKEN: "NARRATIVE_REFERENCE_BROKEN",
  UNEXPECTED_CODE_SYSTEM: "UNEXPECTED_CODE_SYSTEM",
  DEPRECATED_CODE_SYSTEM: "DEPRECATED_CODE_SYSTEM",
  MISSING_CODE_SYSTEM: "MISSING_CODE_SYSTEM",
  MISSING_CODE_VALUE: "MISSING_CODE_VALUE",
  MISSING_DOSE_QUANTITY: "MISSING_DOSE_QUANTITY",
  MISSING_ROUTE_CODE: "MISSING_ROUTE_CODE",
  MISSING_PRODUCT_CODE: "MISSING_PRODUCT_CODE",
  MEDICATION_PRODUCT_ARM_UNEXPECTED: "MEDICATION_PRODUCT_ARM_UNEXPECTED",
  MEDICATION_PRODUCT_ARM_CONFLICT: "MEDICATION_PRODUCT_ARM_CONFLICT",
  MEDICATION_PRODUCT_ARM_REPEATED: "MEDICATION_PRODUCT_ARM_REPEATED",
  MEDICATION_PRODUCT_CODE_REPEATED: "MEDICATION_PRODUCT_CODE_REPEATED",
  MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY: "MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY",
  MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED: "MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED",
  PROBLEM_STATUS_INDETERMINATE: "PROBLEM_STATUS_INDETERMINATE",
  SECTION_PLACEMENT_SUSPECT: "SECTION_PLACEMENT_SUSPECT",
  SUBJECT_CONTEXT_OVERRIDE: "SUBJECT_CONTEXT_OVERRIDE",
  NON_UCUM_UNIT: "NON_UCUM_UNIT",
  UCUM_CASE_SUSPECT: "UCUM_CASE_SUSPECT",
  MISSING_UNIT_ON_PQ: "MISSING_UNIT_ON_PQ",
  FREE_TEXT_REFERENCE_RANGE: "FREE_TEXT_REFERENCE_RANGE",
  RESULT_VALUE_TYPE_UNHANDLED: "RESULT_VALUE_TYPE_UNHANDLED",
  IMMUNIZATION_REFUSED: "IMMUNIZATION_REFUSED",
  DEPRECATED_LOINC: "DEPRECATED_LOINC",
  REQUIRED_SECTION_MISSING: "REQUIRED_SECTION_MISSING",
  PROCEDURE_MOOD_UNEXPECTED: "PROCEDURE_MOOD_UNEXPECTED",
  PLANNED_VS_PERFORMED_AMBIGUOUS: "PLANNED_VS_PERFORMED_AMBIGUOUS",
  MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME: "MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME",
  PLAN_ENTRY_NOT_MODELED: "PLAN_ENTRY_NOT_MODELED",
  SMOKING_STATUS_UNKNOWN: "SMOKING_STATUS_UNKNOWN",
  SMOKING_STATUS_CODE_UNRECOGNIZED: "SMOKING_STATUS_CODE_UNRECOGNIZED",
  SEMANTIC_CODE_INVALID: "SEMANTIC_CODE_INVALID",
  PROFILE_QUIRK_APPLIED: "PROFILE_QUIRK_APPLIED",
} as const;

/**
 * Discriminant type for `CcdaWarning.code`. Narrowing a warning by this code
 * lets consumers write exhaustive `switch` blocks (enabled by the
 * `switch-exhaustiveness-check` lint rule) and guarantees a typo-free
 * comparison against the `WARNING_CODES` registry.
 *
 * @example
 * ```ts
 * import type { CcdaWarning, WarningCode } from "@cosyte/ccda";
 * function describe(w: CcdaWarning): string {
 *   const code: WarningCode = w.code;
 *   switch (code) {
 *     case "UNKNOWN_DOCUMENT_TEMPLATE":
 *       return "unrecognized document type";
 *     default:
 *       return `warning: ${code}`;
 *   }
 * }
 * ```
 */
export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

/**
 * Data shape for every Tier-2 warning emitted by the parser. Warnings are
 * plain data (distinct from `CcdaParseError`, which is a thrown `Error`
 * subclass) so they can be safely accumulated into `CcdaDocument.warnings`
 * and passed to `onWarning` callbacks.
 *
 * @example
 * ```ts
 * import type { CcdaWarning } from "@cosyte/ccda";
 * const w: CcdaWarning = {
 *   code: "UNKNOWN_SECTION_CODE",
 *   message: "The section's LOINC code is not a recognized C-CDA section; retained as narrative-only.",
 *   position: { sectionCode: "99999-9" },
 * };
 * ```
 */
export interface CcdaWarning {
  readonly code: WarningCode;
  readonly message: string;
  readonly position: CcdaPosition;
  /**
   * `true` when an active {@link CcdaProfile} *expected* this deviation and
   * downgraded it, the warning is retained (never dropped) but flagged so a
   * consumer can filter known, tolerated noise from novel deviations. In strict
   * mode an `expected` warning does **not** escalate to a thrown error. Absent
   * (not `false`) when no profile touched the warning.
   */
  readonly expected?: boolean;
  /** The name of the {@link CcdaProfile} that tolerated this warning, when `expected`. */
  readonly profile?: string;
  /**
   * When `code` is {@link WARNING_CODES.PROFILE_QUIRK_APPLIED}, the original
   * warning code the profile tolerated, so the specific deviation
   * (`DEPRECATED_LOINC`, `TEMPLATE_EXTENSION_ABSENT`, …) is never lost, only
   * re-badged as expected.
   */
  readonly toleratedCode?: WarningCode;
}

/**
 * The five coded slots a {@link TerminologyAdapter} and the code-system checks
 * are wired to. A closed set the parser owns: no document text can become one.
 */
export const CODE_SLOTS = ["problem", "medication", "allergen", "route", "vaccine"] as const;

/**
 * Which coded slot a code-system warning is about. Closed by construction, so
 * naming it in a message names a parser constant rather than document content.
 *
 * @example
 * ```ts
 * import type { CodeSlot } from "@cosyte/ccda";
 * const slot: CodeSlot = "problem";
 * ```
 */
export type CodeSlot = (typeof CODE_SLOTS)[number];

/**
 * The coded slots that are reconciled against the section narrative. Wider than
 * {@link CODE_SLOTS} (narrative reconciliation runs at slots no
 * {@link TerminologyAdapter} is bound to) and closed in the same way.
 */
export const NARRATIVE_SLOTS = [
  "problem",
  "medication",
  "allergen",
  "vaccine",
  "procedure",
  "encounter",
  "plannedItem",
  "statusObservation",
  "familyHistory",
] as const;

/** Which coded slot a `CODE_NARRATIVE_MISMATCH` is about. Closed by construction. */
export type NarrativeSlot = (typeof NARRATIVE_SLOTS)[number];

/**
 * The two structural loci a `SUBJECT_CONTEXT_OVERRIDE` warning can name: the
 * top-level `<entry>` that a subject declaration governs, or the `<section>`
 * that declares one and governs no entry anywhere beneath it.
 *
 * A closed set this module owns, exactly like {@link CODE_SLOTS}: no document
 * text can become one, so naming a member in a message names a parser constant.
 * The unit is the TOP-LEVEL ENTRY and nothing smaller: a statement nested inside
 * a governed entry never gets a locus of its own, because the whole entry is
 * withheld rather than the entry returned one statement short.
 */
export const SUBJECT_LOCI = ["entry", "section"] as const;

/**
 * Which structural locus a `SUBJECT_CONTEXT_OVERRIDE` is about. Closed by
 * construction. (No `@example` import here, deliberately: this type is not on
 * the package entry point.)
 */
export type SubjectLocus = (typeof SUBJECT_LOCI)[number];

/**
 * The entry templates a `PLAN_ENTRY_NOT_MODELED` warning can be about: the
 * three the Plan of Treatment Section (and the Planned Intervention Act) admit
 * that this package recognizes but does not return as a `PlannedItem`.
 *
 * A closed set this module owns, exactly like {@link CODE_SLOTS}: no document
 * text can become one, so naming a member in a message names a parser constant.
 * The names are duplicated here rather than derived from the template-root
 * constants in `../model/entries/shared.ts` for the same reason
 * `V3_DATATYPES` is, that module imports this one and a back-import would
 * close a cycle. The **OIDs** are deliberately not repeated here: they live in
 * one place (`shared.ts`), and this file names templates, never OIDs.
 *
 * **Goal Observation is deliberately not a member.** It is `moodCode="GOL"`,
 * which `classifyDisposition` calls neither performed nor planned, and modelling
 * it is a separate piece of work with its own IG grounding rather than a
 * diagnostic.
 */
export const UNMODELED_PLAN_ENTRIES = [
  "instruction",
  "handoffCommunication",
  "nutritionRecommendation",
] as const;

/**
 * Which admitted-but-unmodelled template a `PLAN_ENTRY_NOT_MODELED` is about.
 * Closed by construction. (No `@example` import here, deliberately: this type is
 * not on the package entry point, and citing one that does not resolve is the
 * open `@example` defect this repo already has filed.)
 */
export type UnmodeledPlanEntry = (typeof UNMODELED_PLAN_ENTRIES)[number];

/**
 * The frozen message registry: every string this module can put on a
 * `CcdaWarning.message`, one entry per {@link WarningCode}.
 *
 * Six codes additionally carry a per-{@link CodeSlot} variant, two a
 * per-section-key variant, one a per-datatype variant and one a two-way
 * variant; each variant table is generated below from a closed list the parser
 * owns, and the entry here is the generic wording those tables fall back to.
 * Nothing outside this file, and in particular nothing out of the document,
 * ever contributes a character.
 *
 * @internal
 */
export const WARNING_MESSAGES: Readonly<Record<WarningCode, string>> = Object.freeze({
  UNKNOWN_DOCUMENT_TEMPLATE:
    "The root templateId set names no recognized C-CDA R2.1 document type; parsed as a generic ClinicalDocument.",
  MISSING_TEMPLATE_ID: "The element carries no templateId; recognition fell back to other signals.",
  TEMPLATE_EXTENSION_ABSENT:
    "The recognized templateId carries no @extension version stamp; matched by root alone (may pre-date R2.1).",
  UNKNOWN_SECTION_CODE:
    "The section's LOINC code is not a recognized C-CDA section; retained as narrative-only.",
  SECTION_MATCHED_BY_LOINC_FALLBACK:
    "Section identified by its LOINC code fallback (no recognized templateId present).",
  INVALID_NULL_FLAVOR:
    "The nullFlavor token is not in the HL7 v3 NullFlavor code system; preserved verbatim.",
  CONTRADICTORY_NULL_FLAVOR:
    "The element declares a nullFlavor and asserts a value at the same time; the document contradicts itself, so the value is preserved verbatim but never read as the field's value.",
  UNKNOWN_NAMESPACE_PREFIX:
    "An element outside the recognized v3/xsi/sdtc namespaces, or in no namespace at all, was found; the node is retained and reported once per distinct namespace.",
  MALFORMED_DATETIME:
    "Value does not match the HL7 v3 TS datetime shape; raw preserved, parsed date left undefined.",
  MULTIPLE_RECORD_TARGETS:
    "ClinicalDocument carries more than one recordTarget element; getPatient() resolves the first and header.recordTargets carries them all.",
  MISSING_ASSIGNING_AUTHORITY: "Patient identifier has a root OID but no assigningAuthorityName.",
  ENCODING_BOM_STRIPPED: "A UTF-8 byte-order mark was stripped from the head of the input.",
  NEGATION_VS_NULLFLAVOR_AMBIGUOUS:
    'Act carries both negationInd="true" and a nullFlavor; modeled as distinct fields, not collapsed.',
  ALLERGEN_GRANULARITY_SUSPECT:
    "Allergen appears coded at product level where an ingredient-level concept is expected; granularity flagged.",
  CODE_NARRATIVE_MISMATCH:
    "A coded value and its referenced narrative disagree; both preserved, no winner chosen.",
  NARRATIVE_REFERENCE_BROKEN:
    "The narrative reference does not resolve to any ID in the section narrative.",
  UNEXPECTED_CODE_SYSTEM: "The code system OID is not expected for this slot; value preserved.",
  DEPRECATED_CODE_SYSTEM:
    "The code system OID is deprecated for this slot; prefer its modern successor. Value preserved.",
  MISSING_CODE_SYSTEM:
    "The coded value has a @code but no @codeSystem, so the symbol names no terminology; value preserved verbatim, system never inferred, and terminology validation is impossible for it.",
  MISSING_CODE_VALUE:
    "The coded value is present but asserts no @code and no @nullFlavor, so nothing distinguishes an absent concept from a lost one; value preserved verbatim, no code inferred.",
  MISSING_DOSE_QUANTITY:
    "Medication activity has no doseQuantity; dose preserved as absent, never defaulted.",
  MISSING_ROUTE_CODE:
    "Medication activity has no routeCode; route preserved as absent, never defaulted.",
  MISSING_PRODUCT_CODE:
    "Substance administration has no coded product on any manufacturedProduct arm the parser reads; the product is preserved as absent, never inferred from narrative or from the entry's other fields.",
  MEDICATION_PRODUCT_ARM_UNEXPECTED:
    "manufacturedProduct carries the manufacturedLabeledDrug arm, which C-CDA's medication templates are not written around; the arm is flagged, and unless a companion warning says the product was withheld (MEDICATION_PRODUCT_ARM_CONFLICT), absent (MISSING_PRODUCT_CODE) or unnamed (MISSING_CODE_VALUE) the product code was read and checked as usual.",
  MEDICATION_PRODUCT_ARM_CONFLICT:
    "manufacturedProduct carries arms (manufacturedMaterial / manufacturedLabeledDrug, including repeated ones) whose codings name different products, counting each arm's <translation> alternates: they share no coding, or, where both arms name their product only through translations, each also names a coding the other does not and two of those are in the same code system under different symbols. The document contradicts itself and nothing in it ranks the arms, so no product code is selected (every arm survives serialization verbatim).",
  MEDICATION_PRODUCT_ARM_REPEATED:
    "manufacturedProduct carries more than one arm of the same kind (manufacturedMaterial or manufacturedLabeledDrug), which CDA R2 models as a choice of one participant; the repeat is reported rather than absorbed, and whether the repeated arms agree is answered separately by MEDICATION_PRODUCT_ARM_CONFLICT.",
  MEDICATION_PRODUCT_CODE_REPEATED:
    "The product arm at this position carries more than one <code>, which CDA R2 models as at most one per arm; the repeat is reported rather than absorbed, every <code> on the arm is compared, and whether they agree is answered separately by MEDICATION_PRODUCT_ARM_CONFLICT. No <code> after the first on an arm is ever selected as the product.",
  MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY:
    "No manufacturedProduct arm's lead <code> asserts a primary @code, and the product is named in a <translation> alternate at this position; selection reads each arm's lead <code> only, and translations are preserved and re-serialized but are never slot-checked, so no product code is selected.",
  MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED:
    "The medication carries effectiveTime siblings that could not be classified as duration vs frequency; all preserved.",
  PROBLEM_STATUS_INDETERMINATE:
    "Problem concern statusCode is missing or unrecognized; active/resolved state is indeterminate.",
  SECTION_PLACEMENT_SUSPECT:
    "An entry template was found in a section it does not belong to; extracted but flagged.",
  SUBJECT_CONTEXT_OVERRIDE:
    "A subject declaration governs clinical content here. CDA R2 makes a subject the primary target of the statements it governs, so the content it governs is not the document's record target's own; it is withheld from every read path that promises the record target's data rather than attributed to that patient, and it survives unchanged in the re-serialized document. What the declaration names is never compared with the record target.",
  NON_UCUM_UNIT:
    "The @unit is not a well-formed UCUM unit; unit and value preserved verbatim, never normalized.",
  UCUM_CASE_SUSPECT:
    "The @unit looks like a letter-case slip of a canonical UCUM unit; value preserved, review the casing.",
  MISSING_UNIT_ON_PQ:
    "Physical-quantity value has a numeric value but no @unit; preserved as dimensionless, never defaulted.",
  FREE_TEXT_REFERENCE_RANGE:
    "Reference range is free text, not a structured low/high interval; preserved as text, not numerically comparable.",
  RESULT_VALUE_TYPE_UNHANDLED:
    "The observation value's xsi:type is not specialized; raw value preserved as unsupported.",
  IMMUNIZATION_REFUSED:
    'Immunization activity carries negationInd="true" (vaccine not administered / refused); modeled as refused, never as given.',
  DEPRECATED_LOINC:
    "The observation's LOINC code is deprecated; prefer its current successor. Code preserved.",
  REQUIRED_SECTION_MISSING:
    "The document type requires a section (SHALL) that was not found; parsed without it. missingRequiredSections() names the full set.",
  PROCEDURE_MOOD_UNEXPECTED:
    "The procedure's moodCode is neither a performed (EVN) nor a recognized planned mood; extracted but unclassified.",
  PLANNED_VS_PERFORMED_AMBIGUOUS:
    "Procedure entry has no moodCode; performed (EVN) vs planned (INT) is ambiguous, never conflated, left unclassified.",
  MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME:
    "A Planned Medication Activity was just written with no effectiveTime, which the template makes a SHALL (exactly one, CONF:1098-30468): the caller supplied none and this library never fabricates a date, so the act is emitted short that element and says nothing about when the drug is to be given. Only content the emitting call itself wrote is checked, so the absence of this warning says nothing about sections that call did not write.",
  PLAN_ENTRY_NOT_MODELED:
    "An entry template the Plan of Treatment reading admits was found where planned items are read (a section entry, or an act nested in a Planned Intervention Act); this parser recognizes it but does not model it as a planned item, so it is excluded from getPlannedItems(), reaches no other model field, and survives only in the re-serialized document.",
  SMOKING_STATUS_UNKNOWN:
    'Smoking status is recorded as unknown (nullFlavor or an "unknown" SNOMED concept); preserved, flagged as unknown.',
  SMOKING_STATUS_CODE_UNRECOGNIZED:
    "The smoking status code is not in the recognized Smoking Status value set; preserved verbatim.",
  SEMANTIC_CODE_INVALID:
    "The supplied terminology adapter reports the code is not a valid member of its system; code preserved verbatim, never coerced.",
  PROFILE_QUIRK_APPLIED:
    "An active profile expected this deviation and downgraded it; the deviation's own code is on `toleratedCode`, the tolerating profile on `profile`, and `expected` is set.",
});

/**
 * Look a message variant up by a key drawn from one of the parser's own closed
 * catalogs, falling back to the generic registry entry. The lookup is a
 * membership test, so an unlisted key yields a registry string rather than
 * putting the key itself into a message.
 *
 * @internal
 */
function variant(table: Readonly<Record<string, string>>, key: string, generic: string): string {
  return table[key] ?? generic;
}

/** Freeze a variant table generated over a closed key list. @internal */
function tableOver(
  keys: readonly string[],
  build: (key: string) => string,
): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, build(key)])));
}

const CODE_NARRATIVE_MISMATCH_BY_SLOT = tableOver(
  NARRATIVE_SLOTS,
  (slot) =>
    `Coded ${slot} value and its referenced narrative disagree; both preserved, no winner chosen.`,
);

const UNEXPECTED_CODE_SYSTEM_BY_SLOT = tableOver(
  CODE_SLOTS,
  (slot) => `The code system OID is not expected for the ${slot} slot; value preserved.`,
);

const DEPRECATED_CODE_SYSTEM_BY_SLOT = tableOver(
  CODE_SLOTS,
  (slot) =>
    `The code system OID is deprecated for the ${slot} slot; prefer its modern successor. Value preserved.`,
);

const MISSING_CODE_SYSTEM_BY_SLOT = tableOver(
  CODE_SLOTS,
  (slot) =>
    `Coded ${slot} value has a @code but no @codeSystem, so the symbol names no terminology; value preserved verbatim, system never inferred, and terminology validation is impossible for it.`,
);

const MISSING_CODE_VALUE_BY_SLOT = tableOver(
  CODE_SLOTS,
  (slot) =>
    `Coded ${slot} value is present but asserts no @code and no @nullFlavor, so nothing distinguishes an absent concept from a lost one; value preserved verbatim, no code inferred.`,
);

const SEMANTIC_CODE_INVALID_BY_SLOT = tableOver(
  CODE_SLOTS,
  (slot) =>
    `The supplied terminology adapter reports the ${slot} code is not a valid member of its system; code preserved verbatim, never coerced.`,
);

const SECTION_PLACEMENT_SUSPECT_BY_SECTION = tableOver(
  SECTION_KEYS,
  (key) =>
    `An entry template that belongs in the "${key}" section was found in a different section; extracted but flagged.`,
);

const REQUIRED_SECTION_MISSING_BY_SECTION = tableOver(
  SECTION_KEYS,
  (key) =>
    `The document type requires a "${key}" section (SHALL), but none was found; parsed without it.`,
);

/**
 * The HL7 v3 datatypes this parser implements. Closed, and owned here rather
 * than derived from the datatype modules so that `../model/types/` can keep
 * importing this module without a cycle.
 *
 * @internal
 */
const V3_DATATYPES = ["PQ", "TS", "CD", "II", "ST", "ED", "BL", "INT"] as const;

const CONTRADICTORY_NULL_FLAVOR_BY_DATATYPE = tableOver(
  V3_DATATYPES,
  (datatype) =>
    `${datatype} element declares a nullFlavor and asserts a value at the same time; the document contradicts itself, so the value is preserved verbatim but never read as the field's value.`,
);

/**
 * The human-readable template name for each {@link UnmodeledPlanEntry}. Owned
 * here, like the keys themselves, so this module stays free of a back-import.
 * @internal
 */
const UNMODELED_PLAN_ENTRY_NAMES: Readonly<Record<UnmodeledPlanEntry, string>> = Object.freeze({
  instruction: "Instruction",
  handoffCommunication: "Handoff Communication Participants",
  nutritionRecommendation: "Nutrition Recommendation",
});

/**
 * One wording per admitted-but-unmodelled template. Built over the closed key
 * list rather than with {@link tableOver} so the name lookup stays typed (no
 * widening to `string`, no cast). @internal
 */
const PLAN_ENTRY_NOT_MODELED_BY_ENTRY: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    UNMODELED_PLAN_ENTRIES.map((key) => [
      key,
      `A ${UNMODELED_PLAN_ENTRY_NAMES[key]} template was found where planned items are read (a section entry, or an act nested in a Planned Intervention Act); this parser recognizes it but does not model it as a planned item, so it is excluded from getPlannedItems(), reaches no other model field, and survives only in the re-serialized document.`,
    ]),
  ),
);

/**
 * One wording per {@link SubjectLocus}. Built over the closed key list, so the
 * message names a parser constant and never a word from the document. The two
 * say different things on purpose: at an entry something IS withheld, at a
 * declaring section that governs nothing, nothing is, and a safety-critical
 * warning that misdescribes the document it is about is its own defect.
 * @internal
 */
const SUBJECT_CONTEXT_OVERRIDE_BY_LOCUS: Readonly<Record<string, string>> = tableOver(
  SUBJECT_LOCI,
  (locus) =>
    locus === "entry"
      ? "A subject declaration governs this entry: its own, one carried by a statement nested inside it, or one carried by an enclosing section. CDA R2 makes a subject the primary target of the statements it governs, so the WHOLE entry is withheld from every read path that promises the record target's data (its own statement and every statement nested in it) rather than attributed to that patient, and it survives unchanged in the re-serialized document. What the declaration names is never compared with the record target, and presence alone is what withholds."
      : "This section carries a subject declaration, which CDA R2 makes the primary target of the entries it governs. It governs no entry, here or in any section nested inside it, so nothing is withheld and the declaration is reported rather than left silent; a section that declares somebody else's subject is never quiet merely because it is empty. What the declaration names is never compared with the record target.",
);

/** The two arm-relative wordings of `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`. @internal */
const TRANSLATION_ONLY_BY_ARM = Object.freeze({
  selected: `${WARNING_MESSAGES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY} The coding is somewhere on the returned CD's translation list rather than on its code (search the list, the first entry need not be the one naming the product).`,
  otherArm: `${WARNING_MESSAGES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY} This arm is not the one returned as the product CD, so the coding is reachable only in the re-serialized document.`,
});

/**
 * Every string any factory in this module can produce, for the tripwire that
 * asserts an emitted `message` is a registry member rather than something built
 * from a document.
 *
 * @internal
 */
export const ALL_WARNING_MESSAGES: ReadonlySet<string> = new Set([
  ...Object.values(WARNING_MESSAGES),
  ...Object.values(CODE_NARRATIVE_MISMATCH_BY_SLOT),
  ...Object.values(UNEXPECTED_CODE_SYSTEM_BY_SLOT),
  ...Object.values(DEPRECATED_CODE_SYSTEM_BY_SLOT),
  ...Object.values(MISSING_CODE_SYSTEM_BY_SLOT),
  ...Object.values(MISSING_CODE_VALUE_BY_SLOT),
  ...Object.values(SEMANTIC_CODE_INVALID_BY_SLOT),
  ...Object.values(SECTION_PLACEMENT_SUSPECT_BY_SECTION),
  ...Object.values(REQUIRED_SECTION_MISSING_BY_SECTION),
  ...Object.values(CONTRADICTORY_NULL_FLAVOR_BY_DATATYPE),
  ...Object.values(TRANSLATION_ONLY_BY_ARM),
  ...Object.values(PLAN_ENTRY_NOT_MODELED_BY_ENTRY),
  ...Object.values(SUBJECT_CONTEXT_OVERRIDE_BY_LOCUS),
]);

/**
 * Build an `UNKNOWN_DOCUMENT_TEMPLATE` warning. Emitted when the document's
 * root `templateId` set contains no OID matching one of the 12 recognized
 * C-CDA R2.1 document types, the document is still parsed as a generic
 * ClinicalDocument.
 *
 * @example
 * ```ts
 * import { unknownDocumentTemplate } from "@cosyte/ccda";
 * const w = unknownDocumentTemplate({ path: "/ClinicalDocument" });
 * ```
 */
export function unknownDocumentTemplate(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE,
    message: WARNING_MESSAGES.UNKNOWN_DOCUMENT_TEMPLATE,
    position,
  };
}

/**
 * Build a `MISSING_TEMPLATE_ID` warning. Emitted when an element that should
 * carry a `templateId` (the ClinicalDocument root or a section) has none,
 * recognition falls back to other signals (e.g. a section's LOINC code).
 *
 * @example
 * ```ts
 * import { missingTemplateId } from "@cosyte/ccda";
 * const w = missingTemplateId({ path: "/ClinicalDocument" });
 * ```
 */
export function missingTemplateId(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_TEMPLATE_ID,
    message: WARNING_MESSAGES.MISSING_TEMPLATE_ID,
    position,
  };
}

/**
 * Build a `TEMPLATE_EXTENSION_ABSENT` warning. Emitted when a recognized
 * `templateId` root is present but carries no `@extension` (the R2.1 version
 * stamp, e.g. `2015-08-01`), the template is matched by root alone and may
 * be an earlier release.
 *
 * @example
 * ```ts
 * import { templateExtensionAbsent } from "@cosyte/ccda";
 * const w = templateExtensionAbsent({ path: "/ClinicalDocument" });
 * ```
 */
export function templateExtensionAbsent(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.TEMPLATE_EXTENSION_ABSENT,
    message: WARNING_MESSAGES.TEMPLATE_EXTENSION_ABSENT,
    position,
  };
}

/**
 * Build an `UNKNOWN_SECTION_CODE` warning. Emitted when a section's LOINC
 * `code` is not one of the recognized C-CDA section codes and no recognized
 * `templateId` identified it either, the section is retained as
 * narrative-only.
 *
 * @example
 * ```ts
 * import { unknownSectionCode } from "@cosyte/ccda";
 * const w = unknownSectionCode({ sectionCode: "99999-9" });
 * ```
 */
export function unknownSectionCode(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.UNKNOWN_SECTION_CODE,
    message: WARNING_MESSAGES.UNKNOWN_SECTION_CODE,
    position,
  };
}

/**
 * Build a `SECTION_MATCHED_BY_LOINC_FALLBACK` warning. Emitted when a section
 * carried no recognized `templateId` but its LOINC `code` matched a known
 * C-CDA section, recognition succeeded via the fallback path.
 *
 * @example
 * ```ts
 * import { sectionMatchedByLoincFallback } from "@cosyte/ccda";
 * const w = sectionMatchedByLoincFallback({ sectionCode: "48765-2" });
 * ```
 */
export function sectionMatchedByLoincFallback(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.SECTION_MATCHED_BY_LOINC_FALLBACK,
    message: WARNING_MESSAGES.SECTION_MATCHED_BY_LOINC_FALLBACK,
    position,
  };
}

/**
 * Build an `INVALID_NULL_FLAVOR` warning. Emitted when an element's
 * `@nullFlavor` attribute carries a token outside the HL7 v3 NullFlavor code
 * system (`2.16.840.1.113883.5.1008`), the value is preserved verbatim but
 * flagged as non-conforming.
 *
 * @example
 * ```ts
 * import { invalidNullFlavor } from "@cosyte/ccda";
 * const w = invalidNullFlavor({ path: "effectiveTime" });
 * ```
 */
export function invalidNullFlavor(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.INVALID_NULL_FLAVOR,
    message: WARNING_MESSAGES.INVALID_NULL_FLAVOR,
    position,
  };
}

/**
 * Build a `CONTRADICTORY_NULL_FLAVOR` warning. Emitted when an HL7 v3 datatype
 * element declares a `@nullFlavor` **and** asserts a value in the same breath,
 * e.g. `<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>`. The document
 * says two incompatible things about one field: "this quantity is unknown" and
 * "this quantity is 10 mg".
 *
 * `datatype` is the v3 datatype that read the element (`PQ`, `TS`, `CD`, ...),
 * one of a closed list this module owns, and it selects a frozen registry
 * variant rather than being interpolated. The `nullFlavor` token the element
 * carried used to be named here and is not: it is sender-controlled text, and
 * the argument that it was "structural" is exactly the one this whole registry
 * replaced.
 *
 * **What the parser does with it.** Nothing is coerced and nothing verbatim is
 * dropped: `PQ.raw`, `PQ.unit`, `CD.code`, `II.extension` and friends are all
 * still carried on the returned value, beside the `nullFlavor`. What the parser
 * declines to do is *manufacture* a computable reading it has been told is not
 * the document's value: on `PQ` the parsed `value` number and on `TS` the
 * resolved `date` are withheld, exactly as `MALFORMED_DATETIME` already
 * withholds `TS.date`, since in both cases the verbatim `raw` survives beside
 * the omission so the caller loses nothing. See {@link parsePq} for the full
 * rule and its argued limits.
 *
 * **Provenance:** no normative SHALL is cited here and none should be invented.
 * The CDA R2 schema declares `nullFlavor` and the value-bearing attributes
 * independently, so this shape is schema-valid. The rule rests on the v3
 * datatype semantics the whole model is built on, `nullFlavor` is a property of
 * `ANY` marking the instance as an *exceptional value*, i.e. one with no proper
 * value, so a proper value asserted beside it is a contradiction rather than a
 * refinement, and on the harm ordering: of the two readings, the reassuring one
 * (`10 mg`) is the one that can hurt a patient.
 *
 * @example
 * ```ts
 * import { contradictoryNullFlavor } from "@cosyte/ccda";
 * const w = contradictoryNullFlavor({ path: "doseQuantity" }, "PQ");
 * ```
 */
export function contradictoryNullFlavor(position: CcdaPosition, datatype: string): CcdaWarning {
  return {
    code: WARNING_CODES.CONTRADICTORY_NULL_FLAVOR,
    message: variant(
      CONTRADICTORY_NULL_FLAVOR_BY_DATATYPE,
      datatype,
      WARNING_MESSAGES.CONTRADICTORY_NULL_FLAVOR,
    ),
    position,
  };
}

/**
 * Build an `UNKNOWN_NAMESPACE_PREFIX` warning. Emitted when an **element** is in
 * a namespace the parser does not recognize (anything outside `urn:hl7-org:v3`,
 * the XSI namespace and `urn:hl7-org:sdtc`, including an element carrying no
 * namespace at all), the node is still retained and round-trips through
 * `serializeCcda` unchanged. Raised **once per distinct foreign namespace** in a
 * document, positioned on the shallowest element using it rather than the first
 * in document order, and replayed after the model is built rather than where it
 * is found; see the DOM walk in `./secure-xml.ts` and `parseCcda` for both
 * reasons. Attributes are not swept.
 *
 * The code name is historical: it says `PREFIX`, but what is tested is the
 * element's **namespace**, and an element with no namespace at all raises it
 * with no prefix in sight. Renaming a code is a breaking change, so the message
 * says what the code does instead.
 *
 * @example
 * ```ts
 * import { unknownNamespacePrefix } from "@cosyte/ccda";
 * const w = unknownNamespacePrefix({ path: "/ClinicalDocument" });
 * ```
 */
export function unknownNamespacePrefix(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.UNKNOWN_NAMESPACE_PREFIX,
    message: WARNING_MESSAGES.UNKNOWN_NAMESPACE_PREFIX,
    position,
  };
}

/**
 * Build a `MALFORMED_DATETIME` warning. Emitted when an HL7 v3 `TS` value
 * does not match the `YYYYMMDDHHMMSS[.S][±ZZZZ]` shape (or a recognized
 * truncation of it), the raw string is preserved and the parsed `Date` is
 * left `undefined`.
 *
 * @example
 * ```ts
 * import { malformedDateTime } from "@cosyte/ccda";
 * const w = malformedDateTime({ path: "effectiveTime" });
 * ```
 */
export function malformedDateTime(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MALFORMED_DATETIME,
    message: WARNING_MESSAGES.MALFORMED_DATETIME,
    position,
  };
}

/**
 * Build a `MULTIPLE_RECORD_TARGETS` warning. Emitted when a ClinicalDocument
 * carries more than one `recordTarget` (more than one patient), the parser
 * keeps all of them but `getPatient()` resolves the first.
 *
 * @example
 * ```ts
 * import { multipleRecordTargets } from "@cosyte/ccda";
 * const w = multipleRecordTargets({ path: "/ClinicalDocument" });
 * ```
 */
export function multipleRecordTargets(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MULTIPLE_RECORD_TARGETS,
    message: WARNING_MESSAGES.MULTIPLE_RECORD_TARGETS,
    position,
  };
}

/**
 * Build a `MISSING_ASSIGNING_AUTHORITY` warning. Emitted when a patient
 * identifier `II` has a `@root` but no `@assigningAuthorityName`, the
 * identifier is still usable but lacks a human-readable authority label.
 *
 * @example
 * ```ts
 * import { missingAssigningAuthority } from "@cosyte/ccda";
 * const w = missingAssigningAuthority({ path: "patientRole" });
 * ```
 */
export function missingAssigningAuthority(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_ASSIGNING_AUTHORITY,
    message: WARNING_MESSAGES.MISSING_ASSIGNING_AUTHORITY,
    position,
  };
}

/**
 * Build an `ENCODING_BOM_STRIPPED` warning. Emitted once per parse when a
 * UTF-8 byte-order mark was detected and removed from the head of the input
 * before XML parsing.
 *
 * @example
 * ```ts
 * import { encodingBomStripped } from "@cosyte/ccda";
 * const w = encodingBomStripped({});
 * ```
 */
export function encodingBomStripped(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.ENCODING_BOM_STRIPPED,
    message: WARNING_MESSAGES.ENCODING_BOM_STRIPPED,
    position,
  };
}

/**
 * Build a `NEGATION_VS_NULLFLAVOR_AMBIGUOUS` warning. Emitted when a clinical
 * act carries **both** `@negationInd="true"` and a `@nullFlavor`, two distinct
 * "this did not / is not known" signals at once. The parser never collapses
 * them: both are preserved on the model and this flags the ambiguity.
 *
 * @example
 * ```ts
 * import { negationVsNullFlavorAmbiguous } from "@cosyte/ccda";
 * const w = negationVsNullFlavorAmbiguous({ path: "observation" });
 * ```
 */
export function negationVsNullFlavorAmbiguous(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS,
    message: WARNING_MESSAGES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS,
    position,
  };
}

/**
 * Build an `ALLERGEN_GRANULARITY_SUSPECT` warning. Emitted when an allergen is
 * coded at a product/branded level (a dose-form or strength is detectable in
 * the RxNorm display) where an ingredient-level concept is expected, the code
 * is preserved, the granularity is flagged for review.
 *
 * @example
 * ```ts
 * import { allergenGranularitySuspect } from "@cosyte/ccda";
 * const w = allergenGranularitySuspect({ path: "playingEntity" });
 * ```
 */
export function allergenGranularitySuspect(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.ALLERGEN_GRANULARITY_SUSPECT,
    message: WARNING_MESSAGES.ALLERGEN_GRANULARITY_SUSPECT,
    position,
  };
}

/**
 * Build a `CODE_NARRATIVE_MISMATCH` warning. Emitted when a coded entry value
 * and the narrative text it references via `<reference value="#id">` disagree.
 * The parser surfaces **both** and picks no winner, a safety-critical
 * fail-safe so a structured/narrative divergence is never silently resolved.
 *
 * @example
 * ```ts
 * import { codeNarrativeMismatch } from "@cosyte/ccda";
 * const w = codeNarrativeMismatch({ path: "value" }, "problem");
 * ```
 */
export function codeNarrativeMismatch(position: CcdaPosition, slot: NarrativeSlot): CcdaWarning {
  return {
    code: WARNING_CODES.CODE_NARRATIVE_MISMATCH,
    message: variant(
      CODE_NARRATIVE_MISMATCH_BY_SLOT,
      slot,
      WARNING_MESSAGES.CODE_NARRATIVE_MISMATCH,
    ),
    position,
  };
}

/**
 * Build a `NARRATIVE_REFERENCE_BROKEN` warning. Emitted when an entry's
 * `<reference value="#id">` points at a narrative `ID` that is not present in
 * the section's narrative index, the structured data is kept, the dangling
 * reference is flagged.
 *
 * @example
 * ```ts
 * import { narrativeReferenceBroken } from "@cosyte/ccda";
 * const w = narrativeReferenceBroken({ path: "reference" });
 * ```
 */
export function narrativeReferenceBroken(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.NARRATIVE_REFERENCE_BROKEN,
    message: WARNING_MESSAGES.NARRATIVE_REFERENCE_BROKEN,
    position,
  };
}

/**
 * Build an `UNEXPECTED_CODE_SYSTEM` warning. Emitted when a coded value's
 * `@codeSystem` OID is not one of the systems expected for that slot (e.g. a
 * non-RxNorm OID on a medication, a non-SNOMED/ICD-10 OID on a problem). The
 * value is preserved verbatim.
 *
 * @example
 * ```ts
 * import { unexpectedCodeSystem } from "@cosyte/ccda";
 * const w = unexpectedCodeSystem({ path: "value" }, "problem");
 * ```
 */
export function unexpectedCodeSystem(position: CcdaPosition, slot: CodeSlot): CcdaWarning {
  return {
    code: WARNING_CODES.UNEXPECTED_CODE_SYSTEM,
    message: variant(UNEXPECTED_CODE_SYSTEM_BY_SLOT, slot, WARNING_MESSAGES.UNEXPECTED_CODE_SYSTEM),
    position,
  };
}

/**
 * Build a `DEPRECATED_CODE_SYSTEM` warning. Emitted when a coded value uses a
 * deprecated code system (ICD-9-CM diagnosis/procedure) where its modern
 * successor (ICD-10-CM/PCS, SNOMED) is expected, the value is preserved.
 *
 * @example
 * ```ts
 * import { deprecatedCodeSystem } from "@cosyte/ccda";
 * const w = deprecatedCodeSystem({ path: "value" }, "problem");
 * ```
 */
export function deprecatedCodeSystem(position: CcdaPosition, slot: CodeSlot): CcdaWarning {
  return {
    code: WARNING_CODES.DEPRECATED_CODE_SYSTEM,
    message: variant(DEPRECATED_CODE_SYSTEM_BY_SLOT, slot, WARNING_MESSAGES.DEPRECATED_CODE_SYSTEM),
    position,
  };
}

/**
 * Build a `MISSING_CODE_SYSTEM` warning. Emitted when a coded value at a
 * recognized {@link CodeSlot} asserts a `@code` but carries **no**
 * `@codeSystem`, so nothing names the terminology the symbol belongs to. A code
 * without its system is not a code: `250.00` is diabetes in ICD-9-CM and an
 * unrelated concept elsewhere, so the symbol cannot be read, cannot be checked
 * against the slot's expected systems, and cannot be handed to a
 * {@link TerminologyAdapter} (which validates a `system` + `code` pair). The
 * value is preserved verbatim and **no system is ever inferred**, not from the
 * slot's expected list and not from a `@codeSystemName` label, which is display
 * text rather than an identifier.
 *
 * **Provenance:** this is a parser-safety warning, not a traced schema
 * violation. The CD datatype leaves `@codeSystem` optional (a `nullFlavor`-only
 * CD is well-formed), so no normative SHALL is cited here and none should be
 * invented. The rule rests on the datatype's own semantics, a `@code` is a
 * symbol defined *by* a code system, so the pair is what carries meaning, and on
 * the parser's stated promise at these slots: a coded clinical value is either
 * recognised or flagged, never silently accepted.
 *
 * @example
 * ```ts
 * import { missingCodeSystem } from "@cosyte/ccda";
 * const w = missingCodeSystem({ path: "value" }, "problem");
 * ```
 */
export function missingCodeSystem(position: CcdaPosition, slot: CodeSlot): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_CODE_SYSTEM,
    message: variant(MISSING_CODE_SYSTEM_BY_SLOT, slot, WARNING_MESSAGES.MISSING_CODE_SYSTEM),
    position,
  };
}

/**
 * Build a `MISSING_CODE_VALUE` warning. Emitted when a coded value at a
 * recognized {@link CodeSlot} is **present** as an element but asserts no
 * usable `@code` (absent, empty, or whitespace) **and** declares no
 * `@nullFlavor` to explain the gap, e.g. a system-only
 * `<value codeSystem="2.16.840.1.113883.6.96"/>`.
 *
 * This is the mirror of {@link missingCodeSystem}: there a symbol names no
 * terminology, here a terminology names no symbol. Neither half alone
 * identifies a concept. The distinction that keeps this quiet on well-formed
 * documents is the `nullFlavor`: a `CD` that says `nullFlavor="UNK"` and
 * nothing else is a *complete* statement ("this concept is unknown") and stays
 * silent, while one that says nothing at all leaves a reader unable to tell
 * whether the concept was absent in the source or lost in transformation.
 *
 * **Provenance:** no normative SHALL is cited and none is invented. The CD
 * datatype leaves `@code` optional, which is exactly why a `nullFlavor`-only CD
 * is well-formed. The warning rests on the parser's stated promise at these
 * five slots, a coded clinical value is either recognised or flagged, and on
 * the same harm ordering that puts `MISSING_DOSE_QUANTITY` in
 * `SAFETY_CRITICAL_CODES`: an undeclared absence at a safety-critical slot.
 *
 * @example
 * ```ts
 * import { missingCodeValue } from "@cosyte/ccda";
 * const w = missingCodeValue({ path: "value" }, "problem");
 * ```
 */
export function missingCodeValue(position: CcdaPosition, slot: CodeSlot): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_CODE_VALUE,
    message: variant(MISSING_CODE_VALUE_BY_SLOT, slot, WARNING_MESSAGES.MISSING_CODE_VALUE),
    position,
  };
}

/**
 * Build a `MISSING_PRODUCT_CODE` warning. Emitted when a `substanceAdministration`
 * carries a `consumable` whose `manufacturedProduct` yields **no** product code
 * on any arm the parser reads, so the drug or vaccine identity is absent.
 *
 * This is the backstop that makes "no product" loud rather than a `undefined`
 * field on an otherwise well-formed record: dose, route and timing can all
 * survive a missing consumable, so without this warning the entry reads as a
 * complete medication that simply has no drug. It fires for a missing
 * `consumable` entirely, an empty `manufacturedProduct`, and any arm the parser
 * does not read.
 *
 * **Provenance:** stated rather than traced. The C-CDA Medication Information
 * and Immunization Medication Information templates are written around a coded
 * product, but the exact conformance verb and CONF id are not cited here
 * because this repo does not hold the normative R2.1 Schematron. The warning
 * rests on the harm ordering instead, and is classified alongside
 * `MISSING_DOSE_QUANTITY` for the same reason: an absent safety-critical field
 * on a medication is never defaulted and never silent.
 *
 * @example
 * ```ts
 * import { missingProductCode } from "@cosyte/ccda";
 * const w = missingProductCode({ path: "substanceAdministration" });
 * ```
 */
export function missingProductCode(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_PRODUCT_CODE,
    message: WARNING_MESSAGES.MISSING_PRODUCT_CODE,
    position,
  };
}

/**
 * Build a `MEDICATION_PRODUCT_ARM_UNEXPECTED` warning. CDA R2 models
 * `ManufacturedProduct` with a **choice** of participant: `manufacturedMaterial`
 * (a `Material`) or `manufacturedLabeledDrug` (a `LabeledDrug`). C-CDA's
 * Medication Information and Immunization Medication Information templates are
 * written around the `manufacturedMaterial` arm, so this fires whenever a
 * `manufacturedLabeledDrug` arm is **present**, whether it stands alone, sits
 * beside a `manufacturedMaterial`, or carries no `<code>` at all. Keying it to
 * the arm rather than to its `<code>` is deliberate: a name-only `LabeledDrug`
 * is the same deviation from the templates, and keying on the code let markup
 * shape rather than meaning decide whether it was reported. Two arms naming
 * *different* products is not this warning, it is
 * `MEDICATION_PRODUCT_ARM_CONFLICT` ({@link medicationProductArmConflict}),
 * which is safety-critical and fires alongside this one.
 *
 * **When this warning stands alone, the arm's `<code>` is read rather than
 * refused**, which is Postel's Law on the parse side: the alternate arm is a
 * valid CDA R2 shape carrying the same `CE`, and the previous behaviour of
 * returning `drug: undefined` in silence was strictly worse than reading it and
 * flagging the deviation. The selected element is then handed to whatever the
 * call site does with a product code, unchanged by which arm it came off.
 *
 * **There are three states in which no product identity comes back, and none of
 * them is this warning's to carry.** In the first,
 * `MEDICATION_PRODUCT_ARM_CONFLICT` fires beside this one: the arms disagreed,
 * so no product code is selected and no code-system or terminology check runs
 * for that slot. In the second, no arm carried a `<code>` at all (the shape a
 * name-only `LabeledDrug` produces) and `MISSING_PRODUCT_CODE` fires beside this
 * one instead. In the third an element **is** selected, so neither of those can
 * fire, and it still names nothing: an arm whose `<code>` asserts neither a
 * symbol nor a `nullFlavor`, where the companion is `MISSING_CODE_VALUE`. That
 * third state was missing from this list, which made the enumeration look
 * exhaustive when it covered only the shapes where *selection* failed rather
 * than every shape where *identity* is absent. `MISSING_CODE_VALUE` is in
 * `SAFETY_CRITICAL_CODES` like the other two, so the classification is
 * unaffected; the argument for it was incomplete, not wrong. The classification
 * below is stated conditionally for that reason: it used to be argued from "the
 * drug is present and fully checked", full stop, which stopped being true the
 * moment the conflict state existed, and which was never true of the second or
 * third state either.
 *
 * **Provenance:** the two-arm choice is base CDA R2 structure. Whether the
 * C-CDA template *forbids* the alternate arm is a normative question this repo
 * cannot answer without the R2.1 Schematron, so no conformance verb is claimed
 * here, the warning says only which arm was present. That also decides the
 * safety classification, and the argument has two halves rather than one.
 * Wherever this code is the *only* thing fired, a `<code>` element **was**
 * selected, and it is read exactly as the same document would have been read
 * with one arm: whatever the call site does with a product code, it does
 * unchanged. ("Unchanged" rather than "fully checked", deliberately: the slot
 * checks are structural recognition, plus the opt-in semantic tier when a caller
 * supplies a `TerminologyAdapter`, while a `<translation>` alternate is
 * preserved and never slot-checked at all, so "checked" would claim more than
 * any call site delivers. What the call sites *do* is now
 * uniform. Every consumable site, a Medication Activity, an Immunization
 * Activity, a Planned Medication Activity and a Planned Immunization Activity,
 * runs the selected code through {@link checkCodeSlot} **and** reconciles it
 * against the narrative. It used to
 * differ, the planned site only reconciling, and that is precisely what made
 * this argument false there: the companion this classification leans on for the
 * empty-`<code>` shape is `MISSING_CODE_VALUE`, which could not then fire on a
 * planned drug.) So this
 * code reports known, meaning-preserving vendor noise a profile may defensibly
 * tolerate. Wherever **no product identity** comes back, this code is by
 * construction not alone: `MEDICATION_PRODUCT_ARM_CONFLICT` (the arms
 * disagreed, nothing selected), `MISSING_PRODUCT_CODE` (no arm carried a
 * `<code>` at all, the shape a name-only `LabeledDrug` produces), or
 * `MISSING_CODE_VALUE` (an element was selected and asserts neither a symbol nor
 * a `nullFlavor`) fires beside it. **All three** are in `SAFETY_CRITICAL_CODES`
 * and none of them may any profile quiet. Tolerating this one can therefore
 * never buy silence about an absent or withheld drug, which is why it is
 * deliberately **not** in `SAFETY_CRITICAL_CODES`. Its exclusion is unchanged by
 * that reasoning: it is the justification that was corrected, not the
 * classification.
 *
 * @example
 * ```ts
 * import { medicationProductArmUnexpected } from "@cosyte/ccda";
 * const w = medicationProductArmUnexpected({ path: "consumable" });
 * ```
 */
export function medicationProductArmUnexpected(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MEDICATION_PRODUCT_ARM_UNEXPECTED,
    message: WARNING_MESSAGES.MEDICATION_PRODUCT_ARM_UNEXPECTED,
    position,
  };
}

/**
 * Build a `MEDICATION_PRODUCT_ARM_CONFLICT` warning. Emitted when the arms one
 * `manufacturedProduct` carries do not agree on a single product: a different
 * `@code`, or one `@code` under two different `@codeSystem`s.
 *
 * **Which arms are compared.** Every `manufacturedMaterial/code` and every
 * `manufacturedLabeledDrug/code` the product carries. That covers **both** arms
 * of the CDA R2 choice, the shape this code was introduced for, and **repeated**
 * arms of one kind: two sibling `manufacturedMaterial`s naming different drugs
 * is the identical silent pick, one arm kind in, and `ManufacturedProduct`
 * models one participant, so a repeat is already outside the model.
 *
 * **What each arm is taken to name.** Its `<code>`'s own `@code` when it asserts
 * one, and **otherwise** the codings its `<translation>` alternates assert. A
 * `nullFlavor="OTH"` `<code>` beside a `<translation>` is the documented C-CDA
 * idiom for "not codable in the bound value set, here is an alternate coding",
 * so on that shape the arm's whole product identity is in the translation, and a
 * `@code`-only comparison read it as naming nothing and selected the other arm
 * in silence.
 *
 * **The translations are a fallback, never an addition.** They are read only for
 * an arm whose `<code>` asserts no symbol, so two arms that both assert one are
 * compared on those symbols and nothing else, exactly as before translations
 * were read at all. Adding them would let a coding the two arms happen to share
 * *withdraw* a conflict the primaries assert, and a shared translation is
 * routinely coarser than either primary (an RxNorm ingredient, a local formulary
 * id, an NDC spanning presentations), so two arms naming two strengths of one
 * drug would agree and one strength would be handed back. Reading `A = B` out of
 * `A = Z` and `B = Z` is a transitive closure the document never wrote. Widening
 * what an arm names can therefore only make this warning fire **more**, never
 * less.
 *
 * **When BOTH arms fall back to translations, sharing one coding is not always
 * enough to agree.** That pairing is the one place the transitive closure above
 * could still hide a disagreement, because neither arm asserts a primary to be
 * compared: two arms translating to a shared coarser concept plus two different
 * strengths agree on the coarse coding while naming two products. So they also
 * conflict when each names a coding the other does not **and** two of those
 * unshared codings are in the same code system under different symbols.
 *
 * **That last test is a parser's reading, not a fact the document asserts, and
 * it is deliberately the fail-safe one.** Two different symbols in one code
 * system usually are two products, but not always: two NDC package codes can
 * describe one drug, and an RxNorm branded drug and its clinical equivalent are
 * one product at two granularities. Deciding which is which is terminology work
 * this parser refuses to do (it is a `TerminologyAdapter`'s job), so the choice
 * is between over-firing and under-firing, and this rule over-fires. The cost is
 * a withheld product beside a loud safety-critical code; the alternative cost is
 * handing back one of two strengths in silence. An arm that merely
 * offers an *extra* alternate the other stayed quiet about (an NDC beside the
 * RxNorm concept both share) is elaborating its own concept, which HL7 v3 says a
 * `<translation>` does, and is deliberately **not** a conflict: a shorter list is
 * not a denial. Codings in different code systems are never compared, since
 * deciding whether an NDC and an RxNorm concept denote one product is
 * terminology work rather than parsing.
 *
 * An arm that names no product at all (no `@code` and no `<translation>`
 * carrying one, e.g. a `nullFlavor`-only `<code>`, or no `<code>` at all) never
 * conflicts with one that does, the same rule `contradictsAssertedValue` applies
 * one layer down: only a *value-bearing* assertion can contradict, because in
 * HL7 v3 a `nullFlavor` marks an **exceptional value** rather than a competing
 * one. Such a document is read from whichever arm names the drug.
 *
 * **The parser refuses to choose, and the product is withheld.** Two drugs
 * named on one medication is a contradictory document, and picking one is a
 * reading this parser would be *manufacturing*, not reporting: nothing in the
 * document ranks the arms. It is the same resolution
 * `CONTRADICTORY_NULL_FLAVOR` reaches on a `nullFlavor` beside a value, for the
 * same reason, of the available readings the reassuring one is the one that can
 * hurt a patient. `drug` / `vaccine` is therefore `undefined` and this warning
 * is the signal. Nothing the document said is lost: `serializeCcda` re-emits
 * the parsed DOM, so **both** arms survive a round-trip byte-for-byte, and a
 * caller that needs them can read them off `doc.toString()`.
 *
 * `MISSING_PRODUCT_CODE` deliberately does **not** also fire here. It says no
 * arm yielded a code, which would be false, and this warning is the stronger,
 * more specific statement, the same substitution `CONTRADICTORY_NULL_FLAVOR`
 * makes for `MISSING_UNIT_ON_PQ` on a withheld quantity. The other cost is
 * named rather than hidden: with no code selected, {@link checkCodeSlot} has
 * nothing to check, so `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`,
 * `UNEXPECTED_CODE_SYSTEM`, `DEPRECATED_CODE_SYSTEM` and `SEMANTIC_CODE_INVALID`
 * cannot fire for that
 * slot either. This warning is the lone signal by construction, which is why
 * it is safety-critical and why it is scoped as narrowly as it is.
 *
 * **Provenance:** stated rather than traced. That `ManufacturedProduct` models
 * its participant as a *choice* (one arm, not both, and not a repeated one) is
 * base CDA R2 structure, and that a `CD`'s `<translation>` carries an alternate
 * coding *of the same concept* is HL7 v3 datatype semantics. No conformance verb
 * is claimed here, this repo does not hold the normative R2.1 Schematron and
 * does not invent a SHALL for it. The classification rests on the harm ordering:
 * a silently chosen drug where the document named two is the "silently mis-reads
 * a dose or a code system" harm exactly, so this is safety-critical and no
 * profile may tolerate it.
 *
 * @example
 * ```ts
 * import { medicationProductArmConflict } from "@cosyte/ccda";
 * const w = medicationProductArmConflict({ path: "manufacturedProduct" });
 * ```
 */
export function medicationProductArmConflict(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MEDICATION_PRODUCT_ARM_CONFLICT,
    message: WARNING_MESSAGES.MEDICATION_PRODUCT_ARM_CONFLICT,
    position,
  };
}

/**
 * Build a `MEDICATION_PRODUCT_ARM_REPEATED` warning. Emitted when one
 * `manufacturedProduct` carries **more than one arm of the same kind**: two or
 * more `manufacturedMaterial`s, or two or more `manufacturedLabeledDrug`s.
 *
 * CDA R2 models `ManufacturedProduct`'s participant as a **choice**, one arm,
 * so a repeat is already outside the model. Repeated arms that *disagree* were
 * already caught ({@link medicationProductArmConflict}), but repeated arms that
 * **agree** were reduced to one in complete silence, which left a document
 * asserting the same product three times indistinguishable, in everything the
 * parser reported, from one asserting it once. Cardinality was observable only
 * when the codings happened to differ, so a consumer could not tell "this
 * sender repeats the arm" from "this sender writes one arm", and a de-duplicated
 * repeat is a structural fact about the document that the parser had silently
 * absorbed.
 *
 * **Keyed to the arms, not to their codings**, exactly as
 * {@link medicationProductArmUnexpected} is keyed to the arm rather than to its
 * `<code>`. Whether the repeats agree is a different question with a different
 * code already answering it, and letting agreement decide whether the repeat is
 * reported would make markup *content* rather than markup *shape* decide whether
 * a structural deviation was named. An arm carrying no `<code>` at all counts:
 * it is still an arm.
 *
 * **Deliberately not safety-critical, and the argument is conditional in the
 * same shape as {@link medicationProductArmUnexpected}'s.** Wherever this fires
 * *alone*, a `<code>` element was selected and read exactly as a single-arm
 * document's would have been, so it reports known vendor shape rather than lost
 * clinical data and a profile may defensibly tolerate it. The states in which
 * that sentence would not be enough each carry an unquietable companion, and
 * there are **four** of them rather than the three this list used to name:
 * `MEDICATION_PRODUCT_ARM_CONFLICT` where the arms named different products and
 * nothing was selected, `MISSING_PRODUCT_CODE` where no arm carried a `<code>`
 * at all, `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` where an element was
 * selected but the product is named only in a `<translation>`, and
 * `MISSING_CODE_VALUE` where the selected element asserts neither a symbol nor a
 * `nullFlavor` (two empty-`<code/>` material arms is exactly that shape, and
 * this code fires on it). The fourth was the one this enumeration omitted; it is
 * also the companion that had to be made reachable on a planned
 * medication for the argument to hold at every consumable call site. All four
 * are in `SAFETY_CRITICAL_CODES`, so tolerating this one can never buy silence
 * about a withheld, absent, unselected, or unnamed drug. (A selected `<code>`
 * that merely asserts a `nullFlavor` and nothing else is not one of those
 * states: that is the document completely stating the product is unknown, and it
 * reads here exactly as it would on a single arm.)
 *
 * **Provenance:** that `ManufacturedProduct` models one participant rather than
 * a list is base CDA R2 structure. Whether a C-CDA template *forbids* the repeat
 * is a normative question this repo cannot settle without the R2.1 Schematron,
 * so no conformance verb is claimed: the warning says only that an arm repeats.
 *
 * @example
 * ```ts
 * import { medicationProductArmRepeated } from "@cosyte/ccda";
 * const w = medicationProductArmRepeated({ path: "manufacturedProduct" });
 * ```
 */
export function medicationProductArmRepeated(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MEDICATION_PRODUCT_ARM_REPEATED,
    message: WARNING_MESSAGES.MEDICATION_PRODUCT_ARM_REPEATED,
    position,
  };
}

/**
 * Build a `MEDICATION_PRODUCT_CODE_REPEATED` warning. Emitted when **one**
 * product arm, a single `manufacturedMaterial` or a single
 * `manufacturedLabeledDrug`, carries **more than one `<code>` child**.
 *
 * The sibling of {@link medicationProductArmRepeated}, one markup layer in, and
 * it closes the same silent drop. CDA R2 gives `Material` and `LabeledDrug` at
 * most one `code` each, so a second `<code>` is already outside the model; but
 * arm selection read only the **first** `<code>` per arm, so the second never
 * reached the conflict rule and was never mentioned. An arm writing two RxNorm
 * drugs as sibling `<code>`s therefore handed the first one back as *the*
 * product, in complete silence, with the second discarded: the identical
 * "quietly picks between two named drugs" failure
 * {@link medicationProductArmConflict} exists to refuse, on a shape that rule
 * could not see. Every `<code>` on every arm is now compared, so that shape
 * conflicts, and this code reports the cardinality itself.
 *
 * **Reported per arm, not per `manufacturedProduct`, which is the one place it
 * departs from {@link medicationProductArmRepeated}.** That warning states a
 * fact about the `manufacturedProduct` (its arms repeat) and is positioned on
 * it; this one states a fact about a *particular arm*, and the `position` names
 * which. A product with two offending arms draws two warnings at two locations
 * rather than one warning pointing at only one of them, so the position never
 * sends a reader to an element that does not carry what the message describes.
 *
 * **Keyed to the `<code>` elements, not to what they say**, exactly as the
 * repeated-arm and unexpected-arm codes are keyed to arms: whether the repeats
 * *agree* is a separate question with {@link medicationProductArmConflict}
 * already answering it, and letting agreement decide whether the repeat is named
 * would make markup content rather than markup shape decide whether a structural
 * deviation was reported.
 *
 * **In `SAFETY_CRITICAL_CODES`, unlike {@link medicationProductArmRepeated}, and
 * the difference is selection.** With two *arms*, the one naming a product is
 * the one read, so wherever the repeated-arm code fires alone a drug the
 * document names was returned and read exactly as a single-arm document's would
 * have been. With two `<code>`s on **one** arm, selection deliberately reads
 * only the lead one, so whatever the second says is never on the returned `CD`.
 * That leaves a state in which this code fires **alone** and a named drug is
 * lost: the lead `<code>` asserts a `nullFlavor` and the sibling names an RxNorm
 * product, so the product slot comes back empty over a document that names the
 * drug one element along. Nothing else fires there. `MISSING_PRODUCT_CODE`
 * cannot (a `<code>` exists), {@link medicationProductArmConflict} cannot (an
 * exceptional value is not a rival drug, which is what lets a null-marked arm
 * lose to a naming one everywhere else), and {@link checkCodeSlot} is quiet by
 * design on a `nullFlavor`-only slot. That is
 * {@link medicationProductCodeTranslationOnly}'s harm exactly, with a sibling
 * `<code>` in place of a `<translation>`, and it is classified the same way for
 * the same reason: tolerating it would restore a silent empty product slot over
 * a drug the document names. The milder states are lossy in the same direction,
 * just less. A `displayName` or a `<translation>` list on the non-lead sibling
 * is dropped from the model too, and the `displayName` is what
 * `CODE_NARRATIVE_MISMATCH` reads.
 *
 * **So it over-fires on the benign repeat, deliberately.** Two byte-identical
 * `<code>`s lose nothing, and no profile can quiet the code anyway. Splitting
 * that shape off into a second code would mean deciding, from what the codings
 * happen to *say*, whether a structural deviation gets named, which is the exact
 * inversion {@link medicationProductArmRepeated} refuses one layer out. One
 * markup shape, one structural fact, one code. The only choice is which way to
 * be wrong, and over-firing here costs a warning on a coherent document while
 * under-firing costs a dropped drug on an incoherent one.
 *
 * **Nothing about this changes what is read, wherever a product is still
 * returned at all.** Selection stays on each arm's lead `<code>`, so the
 * returned `CD` is exactly the one the parser returned before repeated
 * `<code>`s were considered. The exception is the shapes where the widened
 * comparison now finds a disagreement: there
 * {@link medicationProductArmConflict} withholds the product outright, so a
 * document that used to yield a coded `CD` yields none. That is intended,
 * not a side effect. Admitting the newly-visible
 * candidates into selection would have displaced richer sibling codings on equal
 * symbols and taken `CODE_NARRATIVE_MISMATCH` and `MISSING_CODE_VALUE` down with
 * them. What changed beside this code is only that every `<code>` now reaches
 * {@link medicationProductArmConflict}'s comparison.
 *
 * **Provenance:** that `Material.code` and `LabeledDrug.code` are each at most
 * one is base CDA R2 structure. Whether a C-CDA template *forbids* the repeat is
 * a normative question this repo cannot settle without the R2.1 Schematron, so
 * no conformance verb is claimed: the warning says only that one arm carries
 * more than one `<code>`.
 *
 * @example
 * ```ts
 * import { medicationProductCodeRepeated } from "@cosyte/ccda";
 * const w = medicationProductCodeRepeated({ path: "manufacturedMaterial" });
 * ```
 */
export function medicationProductCodeRepeated(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MEDICATION_PRODUCT_CODE_REPEATED,
    message: WARNING_MESSAGES.MEDICATION_PRODUCT_CODE_REPEATED,
    position,
  };
}

/**
 * Build a `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` warning. Emitted when
 * **no** arm's **lead** `<code>` asserts a primary `@code` and at least one of
 * them names a product in a `<translation>` alternate instead.
 *
 * **"Lead `<code>`", not "arm", and the message says so.** Selection reads each
 * arm's first `<code>` and no other, so an arm carrying a *second* `<code>` that
 * does assert a primary is still a slot with no selected product, and this
 * warning still fires. The message used to open "No manufacturedProduct arm
 * asserts a primary `@code`" and say the product was named "only" in a
 * translation, both of which are false on that shape, where a sibling `<code>`
 * asserts one and `MEDICATION_PRODUCT_CODE_REPEATED` fires beside this warning
 * to say so. Narrowed here rather than left, because a safety-critical warning
 * that misdescribes the document it is about is the same defect as one that
 * points at a coding that is not there.
 *
 * `nullFlavor="OTH"` beside a `<translation>` is the documented C-CDA idiom for
 * "not codable in the bound value set, here is an alternate coding", so on that
 * shape the arm's whole product identity is in the translation. The conflict
 * rule already reads it, which is what lets a null-marked arm disagree with a
 * named one. **Selection deliberately does not**, and does not change here:
 * this package's stated boundary is that slot checks apply to a slot's *primary*
 * coding, so lifting a translation into the product position would hand
 * {@link checkCodeSlot} a coding the document never wrote there, which is the
 * manufactured reading the whole area refuses.
 *
 * What changes is the silence between those two rules. `drug.code` (or
 * `vaccine.code`) is `undefined`, and a consumer reading the product off the
 * slot got a medication with a dose, a route and a timing and no drug, with
 * **no warning of any kind**: `MISSING_PRODUCT_CODE` does not fire (an arm *did*
 * carry a `<code>`), and {@link checkCodeSlot} is silent by design on a slot
 * whose only assertion is a `nullFlavor`, because a declared `nullFlavor` is a
 * complete statement that the concept is unknown. Here it is not unknown: the
 * document names it one element down.
 *
 * **Where the coding is reachable depends on which arm carries it, and the
 * warning says which.** Only one arm ever becomes the returned `CD`. When the
 * arm holding the translation is that one, the coding is somewhere on
 * `drug.translation`, since the `CD` comes back with its `nullFlavor` and its
 * translations intact; **search that list rather than reading `[0]`**, because a
 * `<code>` may carry several `<translation>`s and the first can be a
 * `nullFlavor`-marked one or an alternate in a code system the reader does not
 * want. When it is **not** (two arms, neither asserting a primary, the
 * translation on the arm that was not selected), the returned `CD` is the other
 * arm's and no *product-naming* coding is on it, so the coding is reachable only
 * in the serialized document. `onSelectedArm` distinguishes them in the message,
 * and the `position` always points at the `<code>` that carries the translation
 * rather than at the selected element, so it never sends a reader to an element
 * that does not hold what the warning says exists.
 * `serializeCcda` re-emits the parsed DOM either way, so every arm and every
 * `<translation>` survives `doc.toString()` byte-for-byte.
 *
 * This warning is that missing signal, and it is in `SAFETY_CRITICAL_CODES`
 * because tolerating it would restore a silent `undefined` where the document
 * names a drug, the same harm `MISSING_PRODUCT_CODE` is classified for, one
 * markup layer down. **It is the lone signal on the `nullFlavor`-marked shape**
 * (the documented idiom), where nothing else fires. On the variant where the
 * `<code>` carries a `<translation>` and asserts neither a symbol nor a
 * `nullFlavor`, `MISSING_CODE_VALUE` fires beside it, which is itself
 * safety-critical, so the classification does not rest on being alone there.
 *
 * It is **not** `MISSING_PRODUCT_CODE`, which asserts that no arm carried a
 * coded product at all: that would be false here. It does **not** fire behind
 * `MEDICATION_PRODUCT_ARM_CONFLICT`, which is the stronger, more specific
 * statement about the same slot and is the lone signal there, exactly the
 * suppression `MISSING_PRODUCT_CODE` already makes.
 *
 * **Provenance:** that a `CD`'s `<translation>` carries an alternate coding of
 * the same concept is HL7 v3 datatype semantics, and that `nullFlavor="OTH"`
 * beside one is the C-CDA idiom for an uncodable concept is C-CDA guidance. No
 * conformance verb is claimed, and no SHALL is invented: the warning reports
 * where the coding is and that the product slot was left empty.
 *
 * @example
 * ```ts
 * import { medicationProductCodeTranslationOnly } from "@cosyte/ccda";
 * const w = medicationProductCodeTranslationOnly({ path: "code" }, true);
 * ```
 */
export function medicationProductCodeTranslationOnly(
  position: CcdaPosition,
  onSelectedArm: boolean,
): CcdaWarning {
  return {
    code: WARNING_CODES.MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY,
    message: onSelectedArm ? TRANSLATION_ONLY_BY_ARM.selected : TRANSLATION_ONLY_BY_ARM.otherArm,
    position,
  };
}

/**
 * Build a `MISSING_DOSE_QUANTITY` warning. Emitted when a Medication Activity
 * carries no `doseQuantity`, a safety-critical field. The dose is preserved as
 * absent (never defaulted) and the gap is flagged.
 *
 * @example
 * ```ts
 * import { missingDoseQuantity } from "@cosyte/ccda";
 * const w = missingDoseQuantity({ path: "substanceAdministration" });
 * ```
 */
export function missingDoseQuantity(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_DOSE_QUANTITY,
    message: WARNING_MESSAGES.MISSING_DOSE_QUANTITY,
    position,
  };
}

/**
 * Build a `MISSING_ROUTE_CODE` warning. Emitted when a Medication Activity
 * carries no `routeCode`. The route is preserved as absent (never defaulted)
 * and the gap is flagged.
 *
 * @example
 * ```ts
 * import { missingRouteCode } from "@cosyte/ccda";
 * const w = missingRouteCode({ path: "substanceAdministration" });
 * ```
 */
export function missingRouteCode(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_ROUTE_CODE,
    message: WARNING_MESSAGES.MISSING_ROUTE_CODE,
    position,
  };
}

/**
 * Build a `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED` warning. A Medication Activity
 * carries its dosing period (`IVL_TS`) and frequency (`PIVL_TS`) as sibling
 * `effectiveTime` elements distinguished by `xsi:type`. This is emitted when
 * extra `effectiveTime` siblings cannot be classified into those two slots,
 * all are preserved, none discarded.
 *
 * @example
 * ```ts
 * import { multipleEffectiveTimesUnresolved } from "@cosyte/ccda";
 * const w = multipleEffectiveTimesUnresolved({ path: "substanceAdministration" });
 * ```
 */
export function multipleEffectiveTimesUnresolved(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED,
    message: WARNING_MESSAGES.MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED,
    position,
  };
}

/**
 * Build a `PROBLEM_STATUS_INDETERMINATE` warning. Emitted when a Problem
 * Concern Act's `statusCode` is absent or carries a token outside the
 * recognized `active`/`completed`/`suspended`/`aborted` set, the active vs
 * resolved state cannot be determined, so it is reported as `unknown`.
 *
 * @example
 * ```ts
 * import { problemStatusIndeterminate } from "@cosyte/ccda";
 * const w = problemStatusIndeterminate({ path: "act" });
 * ```
 */
export function problemStatusIndeterminate(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.PROBLEM_STATUS_INDETERMINATE,
    message: WARNING_MESSAGES.PROBLEM_STATUS_INDETERMINATE,
    position,
  };
}

/**
 * Build a `SECTION_PLACEMENT_SUSPECT` warning. Emitted when a recognized
 * clinical entry template appears in a section where it does not belong (e.g. a
 * Medication Activity inside the Problems section), the entry is still
 * extracted, but the misplacement is flagged.
 *
 * @example
 * ```ts
 * import { sectionPlacementSuspect } from "@cosyte/ccda";
 * const w = sectionPlacementSuspect({ path: "entry" }, "medications");
 * ```
 */
export function sectionPlacementSuspect(
  position: CcdaPosition,
  entryExpectedSection: string,
): CcdaWarning {
  return {
    code: WARNING_CODES.SECTION_PLACEMENT_SUSPECT,
    message: variant(
      SECTION_PLACEMENT_SUSPECT_BY_SECTION,
      entryExpectedSection,
      WARNING_MESSAGES.SECTION_PLACEMENT_SUSPECT,
    ),
    position,
  };
}

/**
 * Build a `SUBJECT_CONTEXT_OVERRIDE` warning, the safety-critical report that a
 * `<subject>` declaration governs clinical content. CDA R2 gives `Section.subject`
 * cardinality `0..1` and defines it as the "Primary target of the entries
 * recorded in a section"; C-CDA admits the same override on a clinical
 * statement. So a document may legitimately carry a relative's, a donor's or a
 * contact's statement inside the patient's document, and every read path this
 * package documents as the record target's own data must not hand it back.
 *
 * **Presence is the trigger, and that is the whole rule.** The declaration is an
 * override whatever it names: no identifier, name or other content is ever
 * compared with the record target. Comparing would make the outcome depend on
 * vendor identifier hygiene and would be exactly the guess this library's
 * fail-safe rule forbids, so a document that redundantly restates the patient as
 * an entry subject loses those entries from the record-target read paths and
 * gains this warning. That is the safe direction of the error, and it is the
 * accepted cost.
 *
 * **The unit is the top-level `<entry>`, for withholding and for counting.** A
 * declaration anywhere inside an entry withholds that whole entry: a Problem
 * Concern Act handed back one observation short, silently, is the confidently
 * wrong clinical answer this exists to prevent. `locus` is a member of the closed
 * {@link SUBJECT_LOCI} list, so the variant wording names a parser constant and
 * never document text.
 *
 * **The one declaration that is not an override** is the subject slot a Family
 * History Organizer carries itself: that is the template's own mechanism for
 * naming the relative, whatever the slot contains (a readable related subject, an
 * empty element, a null flavor), so it draws no warning and re-overrides an
 * enclosing section declaration. The family-history read path is unaffected in
 * every document shape.
 *
 * (No `@example` import: this factory is not on the package entry point.)
 *
 * @example
 * ```ts
 * const w = subjectContextOverride({ path: "entry", sectionCode: "11450-4" }, "entry");
 * ```
 */
export function subjectContextOverride(position: CcdaPosition, locus: SubjectLocus): CcdaWarning {
  return {
    code: WARNING_CODES.SUBJECT_CONTEXT_OVERRIDE,
    message: variant(
      SUBJECT_CONTEXT_OVERRIDE_BY_LOCUS,
      locus,
      WARNING_MESSAGES.SUBJECT_CONTEXT_OVERRIDE,
    ),
    position,
  };
}

/**
 * Build a `NON_UCUM_UNIT` warning. Emitted when a `PQ` `@unit` is not a
 * well-formed UCUM unit (validated by the computable grammar). The raw unit
 * string and the value are **preserved verbatim**, never normalized away, so
 * the quantity is never silently re-dimensioned. The unit itself is **not
 * named**: this warning fires precisely when the string is not a UCUM unit, so
 * at the moment it is reported nothing distinguishes it from any other text a
 * sender put in the attribute. Read it off the model (`PQ.unit`).
 *
 * @example
 * ```ts
 * import { nonUcumUnit } from "@cosyte/ccda";
 * const w = nonUcumUnit({ path: "value" });
 * ```
 */
export function nonUcumUnit(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.NON_UCUM_UNIT,
    message: WARNING_MESSAGES.NON_UCUM_UNIT,
    position,
  };
}

/**
 * Build a `UCUM_CASE_SUSPECT` warning. Emitted when a `PQ` `@unit` differs only
 * in letter case from a canonical clinical UCUM spelling, `ML` for `mL`
 * (megaliter vs milliliter), `Mg` for `mg`, `mEq` for `meq`. The value is
 * preserved; the likely fix is a single case change.
 *
 * @example
 * ```ts
 * import { ucumCaseSuspect } from "@cosyte/ccda";
 * const w = ucumCaseSuspect({ path: "value" });
 * ```
 */
export function ucumCaseSuspect(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.UCUM_CASE_SUSPECT,
    message: WARNING_MESSAGES.UCUM_CASE_SUSPECT,
    position,
  };
}

/**
 * Build a `MISSING_UNIT_ON_PQ` warning. Emitted when a physical-quantity value
 * carries a numeric `@value` but no `@unit`, a dimensionless measurement where
 * a unit is expected. The value is preserved; the missing unit is flagged, never
 * defaulted.
 *
 * @example
 * ```ts
 * import { missingUnitOnPq } from "@cosyte/ccda";
 * const w = missingUnitOnPq({ path: "value" });
 * ```
 */
export function missingUnitOnPq(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_UNIT_ON_PQ,
    message: WARNING_MESSAGES.MISSING_UNIT_ON_PQ,
    position,
  };
}

/**
 * Build a `FREE_TEXT_REFERENCE_RANGE` warning. Emitted when a result's
 * `referenceRange` carries free text instead of a structured `IVL_PQ`
 * (`low`/`high`), the text is preserved on the range, but it cannot be compared
 * numerically against the result value.
 *
 * @example
 * ```ts
 * import { freeTextReferenceRange } from "@cosyte/ccda";
 * const w = freeTextReferenceRange({ path: "referenceRange" });
 * ```
 */
export function freeTextReferenceRange(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.FREE_TEXT_REFERENCE_RANGE,
    message: WARNING_MESSAGES.FREE_TEXT_REFERENCE_RANGE,
    position,
  };
}

/**
 * Build a `RESULT_VALUE_TYPE_UNHANDLED` warning. Emitted when a result/vital
 * observation `value` carries an `xsi:type` the model does not specialize
 * (anything beyond `PQ`/`CD`/`CE`/`ST`/`IVL_PQ`). The raw value is preserved as
 * an `unsupported` value so nothing is dropped, only the typed view is absent.
 * The type name is **not** in the message; it is on the model as
 * `unsupported.xsiType`, bounded to the HL7 v3 datatype names.
 *
 * @example
 * ```ts
 * import { resultValueTypeUnhandled } from "@cosyte/ccda";
 * const w = resultValueTypeUnhandled({ path: "value" });
 * ```
 */
export function resultValueTypeUnhandled(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED,
    message: WARNING_MESSAGES.RESULT_VALUE_TYPE_UNHANDLED,
    position,
  };
}

/**
 * Build an `IMMUNIZATION_REFUSED` warning. Emitted (informationally) when an
 * Immunization Activity carries `@negationInd="true"`, the vaccine was **not**
 * administered (refused / not given). The negation is modeled distinctly on
 * `refused`; this surfaces it so a refusal is never read as an administration.
 *
 * @example
 * ```ts
 * import { immunizationRefused } from "@cosyte/ccda";
 * const w = immunizationRefused({ path: "substanceAdministration" });
 * ```
 */
export function immunizationRefused(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.IMMUNIZATION_REFUSED,
    message: WARNING_MESSAGES.IMMUNIZATION_REFUSED,
    position,
  };
}

/**
 * Build a `DEPRECATED_LOINC` warning. Emitted when a result/vital observation
 * `code` is a known-deprecated LOINC (e.g. BMI `41909-3`, superseded by
 * `39156-5`), the code is preserved; the deprecation is flagged for review. The
 * code is **not** named in the message; it is the observation's own `code`, and
 * this warning only fires for a member of the curated deprecated set.
 *
 * @example
 * ```ts
 * import { deprecatedLoinc } from "@cosyte/ccda";
 * const w = deprecatedLoinc({ path: "code" });
 * ```
 */
export function deprecatedLoinc(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.DEPRECATED_LOINC,
    message: WARNING_MESSAGES.DEPRECATED_LOINC,
    position,
  };
}

/**
 * Build a `REQUIRED_SECTION_MISSING` warning. Emitted when a recognized
 * document type's required (SHALL) section is absent from the document, a
 * conformance gap surfaced as a **warning, never a fatal**, so the document
 * still parses (fail-safe: a missing required section never blocks reading the
 * data that *is* present). `sectionKey` selects a frozen message variant from
 * the section catalog's own key list, so an unrecognized key falls back to the
 * generic registry entry rather than reaching the message.
 *
 * @example
 * ```ts
 * import { requiredSectionMissing } from "@cosyte/ccda";
 * const w = requiredSectionMissing({ path: "/ClinicalDocument" }, "problems");
 * ```
 */
export function requiredSectionMissing(position: CcdaPosition, sectionKey: string): CcdaWarning {
  return {
    code: WARNING_CODES.REQUIRED_SECTION_MISSING,
    message: variant(
      REQUIRED_SECTION_MISSING_BY_SECTION,
      sectionKey,
      WARNING_MESSAGES.REQUIRED_SECTION_MISSING,
    ),
    position,
  };
}

/**
 * Build a `PROCEDURE_MOOD_UNEXPECTED` warning. Emitted when a Procedure entry
 * carries a `@moodCode` outside the recognized performed (`EVN`) or planned
 * (`INT`/`RQO`/`PRMS`/`PRP`/`APT`/`ARQ`) set, the procedure is still extracted,
 * but its performed-vs-planned disposition cannot be classified. The observed
 * `@moodCode` is **not** named: it is an arbitrary attribute value at the point
 * this fires. It survives on the entry's `disposition` inputs and in
 * `doc.toString()`.
 *
 * @example
 * ```ts
 * import { procedureMoodUnexpected } from "@cosyte/ccda";
 * const w = procedureMoodUnexpected({ path: "procedure" });
 * ```
 */
export function procedureMoodUnexpected(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.PROCEDURE_MOOD_UNEXPECTED,
    message: WARNING_MESSAGES.PROCEDURE_MOOD_UNEXPECTED,
    position,
  };
}

/**
 * Build a `PLANNED_VS_PERFORMED_AMBIGUOUS` warning. Emitted when a Procedure
 * entry carries **no** `@moodCode` at all, the parser cannot tell whether the
 * procedure was actually performed (`EVN`) or merely planned/ordered (`INT`).
 * The two are **never conflated**: the procedure is extracted with an undefined
 * disposition and the ambiguity is flagged.
 *
 * @example
 * ```ts
 * import { plannedVsPerformedAmbiguous } from "@cosyte/ccda";
 * const w = plannedVsPerformedAmbiguous({ path: "procedure" });
 * ```
 */
export function plannedVsPerformedAmbiguous(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.PLANNED_VS_PERFORMED_AMBIGUOUS,
    message: WARNING_MESSAGES.PLANNED_VS_PERFORMED_AMBIGUOUS,
    position,
  };
}

/**
 * Build a `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` warning. **Emitted by the
 * emit side (`buildCcda` and `editCcda`), never by `parseCcda`**: it reports that
 * a document this library has just *written* carries a Planned Medication
 * Activity (`…22.4.42`) short the `effectiveTime` that template SHALL carry
 * exactly once (CONF:1098-30468).
 *
 * **The message names neither emitter, deliberately, and must not be narrowed to
 * one again.** It was worded around `buildCcda` while that was the only writer
 * raising it, which made it false the moment a second writer did; a warning that
 * misdescribes its own document is the same defect this package already names for
 * a warning pointing at a coding that is not there. Which writer raised it is not
 * a fact about the document, and a consumer that needs it knows which call it
 * made.
 *
 * **Both raisers read the emitted DOM**, so what the warning asserts is a
 * property of the bytes the caller is about to receive rather than of the input
 * that produced them. That distinction is not academic: `editCcda` takes an
 * *ordered* list of edits where a later one discards an earlier one's content, so
 * an input-reading check reports a SHALL violation against a conformant document.
 *
 * The field stays **optional** on `BuildCcdaPlannedOrder`: requiring it would be
 * a breaking change to a published input type, and the decision taken was to
 * report the gap rather than close it by breaking callers. Neither emitter
 * fabricates a date and neither refuses the write; each emits what it was given
 * and says so.
 *
 * Nothing changes on the read path. A *parsed* Planned Medication Activity with
 * no `effectiveTime` is as silent as it has always been, and widening this to
 * `parseCcda` would move rows on every third-party document, which is its own
 * decision with its own base-measured matrix.
 *
 * (No `@example` import: this factory is not on the package entry point.)
 *
 * @example
 * ```ts
 * const w = missingPlannedMedicationEffectiveTime({
 *   path: "substanceAdministration",
 *   sectionCode: "18776-5",
 * });
 * ```
 */
export function missingPlannedMedicationEffectiveTime(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME,
    message: WARNING_MESSAGES.MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME,
    position,
  };
}

/**
 * Build a `PLAN_ENTRY_NOT_MODELED` warning. Emitted when one of the three
 * templates the Plan of Treatment Section and the Planned Intervention Act admit
 * alongside the seven planned kinds is found where planned items are read, and
 * this package does not return it: Instruction, Handoff Communication
 * Participants, or Nutrition Recommendation. Before this the entry was excluded
 * in complete silence.
 *
 * `entry` is a member of the closed {@link UNMODELED_PLAN_ENTRIES} list, so the
 * variant wording names a parser constant and never document text.
 *
 * **Goal Observation, the fourth admitted-but-unreturned template, is
 * deliberately not reported here.** Modelling it is a separate piece of work
 * (it is `moodCode="GOL"`, neither performed nor planned in this package's mood
 * model, and a conformant Planned Intervention Act must reference one), and a
 * diagnostic is not a stand-in for it.
 *
 * (No `@example` import: this factory is not on the package entry point.)
 *
 * @example
 * ```ts
 * const w = planEntryNotModeled("instruction", { path: "act", sectionCode: "18776-5" });
 * ```
 */
export function planEntryNotModeled(
  entry: UnmodeledPlanEntry,
  position: CcdaPosition,
): CcdaWarning {
  return {
    code: WARNING_CODES.PLAN_ENTRY_NOT_MODELED,
    message: variant(
      PLAN_ENTRY_NOT_MODELED_BY_ENTRY,
      entry,
      WARNING_MESSAGES.PLAN_ENTRY_NOT_MODELED,
    ),
    position,
  };
}

/**
 * Build a `SMOKING_STATUS_UNKNOWN` warning. Emitted when a Smoking Status
 * observation's value is explicitly an "unknown" concept, a `@nullFlavor`, or
 * one of the SNOMED "unknown if ever smoked" / "current status unknown" codes.
 * The value is preserved; this surfaces that smoking status is recorded as
 * genuinely unknown rather than simply absent.
 *
 * @example
 * ```ts
 * import { smokingStatusUnknown } from "@cosyte/ccda";
 * const w = smokingStatusUnknown({ path: "observation/value" });
 * ```
 */
export function smokingStatusUnknown(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.SMOKING_STATUS_UNKNOWN,
    message: WARNING_MESSAGES.SMOKING_STATUS_UNKNOWN,
    position,
  };
}

/**
 * Build a `SMOKING_STATUS_CODE_UNRECOGNIZED` warning. Emitted when a Smoking
 * Status observation's coded value is not a member of the expected Smoking
 * Status value set (`2.16.840.1.113883.11.20.9.38`), the code is preserved
 * verbatim, but it falls outside the recognized smoking-status concepts. The
 * code is **not** named: this warning fires exactly when it is outside the
 * value set, so nothing at that point distinguishes it from any other text.
 *
 * @example
 * ```ts
 * import { smokingStatusCodeUnrecognized } from "@cosyte/ccda";
 * const w = smokingStatusCodeUnrecognized({ path: "observation/value" });
 * ```
 */
export function smokingStatusCodeUnrecognized(position: CcdaPosition): CcdaWarning {
  return {
    code: WARNING_CODES.SMOKING_STATUS_CODE_UNRECOGNIZED,
    message: WARNING_MESSAGES.SMOKING_STATUS_CODE_UNRECOGNIZED,
    position,
  };
}

/**
 * Build a `SEMANTIC_CODE_INVALID` warning. Emitted only when a consumer-supplied
 * bring-your-own {@link TerminologyAdapter} reports (via `validateCode`) that a
 * coded value is **not** a valid, active member of its code system, the semantic
 * validation tier structural recognition cannot reach without a licensed
 * terminology. The code is **preserved verbatim** (never coerced to a
 * "corrected" value); this surfaces the adapter's negative verdict so a
 * structurally-valid but wrong code, the highest-severity real-world defect, is
 * not silently trusted. The message names the {@link CodeSlot} and nothing
 * else. It used to carry the observed `@codeSystem` OID as a "structural
 * identifier"; a sender controls that attribute exactly as it controls the code
 * beside it, so it is gone. The adapter's own `message` has never been
 * interpolated and still is not: it is consumer text about a coded value.
 *
 * @example
 * ```ts
 * import { semanticCodeInvalid } from "@cosyte/ccda";
 * const w = semanticCodeInvalid({ path: "value" }, "problem");
 * ```
 */
export function semanticCodeInvalid(position: CcdaPosition, slot: CodeSlot): CcdaWarning {
  return {
    code: WARNING_CODES.SEMANTIC_CODE_INVALID,
    message: variant(SEMANTIC_CODE_INVALID_BY_SLOT, slot, WARNING_MESSAGES.SEMANTIC_CODE_INVALID),
    position,
  };
}

/**
 * Build a `PROFILE_QUIRK_APPLIED` warning, the downgraded form an active
 * {@link CcdaProfile} produces from a deviation it *expects*. The original
 * warning is **not dropped**: its code moves to `toleratedCode`, the deviation
 * is re-badged `PROFILE_QUIRK_APPLIED`, `expected` is set, and the tolerating
 * profile is named, so a consumer can filter known, grounded noise while the
 * fact of the deviation, and where it was, survive. A profile can only ever
 * reach this path for a **non-safety-critical** code (enforced at profile-
 * definition time); safety-critical warnings can never be tolerated.
 *
 * **The original `message` is not carried forward, and `profileName` is not
 * interpolated.** Both used to be, which made this the one factory whose output
 * was assembled rather than looked up. What the deviation was is on
 * `toleratedCode`, who tolerated it is on `profile`, and where it was is on
 * `position`, all typed fields.
 *
 * **Say what that costs rather than "nothing is lost".** Two things do not
 * survive the re-badge. The tolerated code's own message is not reachable from
 * the returned warning, because {@link WARNING_MESSAGES} is internal and is not
 * on the package entry point. And where the original carried a per-closed-key
 * variant, the key is not recoverable from `toleratedCode` alone: a tolerated
 * `UNEXPECTED_CODE_SYSTEM` no longer says which {@link CodeSlot} it was about.
 * The trade is deliberate, and narrow because a profile may only ever tolerate a
 * **non**-safety-critical code, but it is a trade.
 *
 * @example
 * ```ts
 * import { profileQuirkApplied, deprecatedLoinc } from "@cosyte/ccda";
 * const original = deprecatedLoinc({ path: "code" });
 * const w = profileQuirkApplied(original, "smartScorecard");
 * ```
 */
export function profileQuirkApplied(original: CcdaWarning, profileName: string): CcdaWarning {
  return {
    code: WARNING_CODES.PROFILE_QUIRK_APPLIED,
    message: WARNING_MESSAGES.PROFILE_QUIRK_APPLIED,
    position: original.position,
    expected: true,
    profile: profileName,
    toleratedCode: original.code,
  };
}
