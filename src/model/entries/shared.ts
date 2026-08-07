/**
 * Shared structure for the C-CDA clinical entry extractors (Problems,
 * Medications, Allergies). Holds the entry-template OID roots (matched on root
 * only, the R2.1 IG pins different `@extension` stamps per template), small
 * DOM-navigation helpers the extractors share, and the two cross-cutting
 * safety-critical reconciliations: `negationInd`-vs-`nullFlavor` (never
 * collapsed) and coded-value-vs-narrative (both surfaced, no winner picked).
 */

import { attr, child, children, positionOf, xsiType } from "../dom.js";
import { sectionForLoinc, sectionForTemplateRoot } from "../../parser/templates.js";
import { parseBlAttr } from "../types/bl.js";
import { parseCd, type CD } from "../types/cd.js";
import { parseIi, type II } from "../types/ii.js";
import type { ParseCtx } from "../types/_shared.js";
import type { CcdaPosition } from "../../parser/types.js";
import {
  codeNarrativeMismatch,
  medicationProductArmConflict,
  medicationProductArmRepeated,
  medicationProductArmUnexpected,
  medicationProductCodeRepeated,
  medicationProductCodeTranslationOnly,
  narrativeReferenceBroken,
  negationVsNullFlavorAmbiguous,
  problemStatusIndeterminate,
  type NarrativeSlot,
} from "../../parser/warnings.js";
import type { Element } from "@xmldom/xmldom";

/**
 * The resolved active-vs-resolved state of a Problem/Allergy Concern Act,
 * derived from its `statusCode` (with `effectiveTime` available for refinement).
 *
 * @example
 * ```ts
 * import type { ConcernStatus } from "@cosyte/ccda";
 * const s: ConcernStatus = "active";
 * ```
 */
export type ConcernStatus = "active" | "resolved" | "inactive" | "unknown";

/** Problem Concern Act, wraps one or more Problem Observations. */
export const PROBLEM_CONCERN_ACT = "2.16.840.1.113883.10.20.22.4.3";
/** Problem Observation, carries the coded problem in `value xsi:type="CD"`. */
export const PROBLEM_OBSERVATION = "2.16.840.1.113883.10.20.22.4.4";
/** Medication Activity, the `substanceAdministration` for one medication. */
export const MEDICATION_ACTIVITY = "2.16.840.1.113883.10.20.22.4.16";
/** Medication Information, the `manufacturedMaterial` carrying the RxNorm code. */
export const MEDICATION_INFORMATION = "2.16.840.1.113883.10.20.22.4.23";
/** Allergy Concern Act, wraps one or more Allergy-Intolerance Observations. */
export const ALLERGY_CONCERN_ACT = "2.16.840.1.113883.10.20.22.4.30";
/** Allergy-Intolerance Observation, the propensity assertion + allergen. */
export const ALLERGY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.7";
/** Reaction Observation, a manifestation of an allergy. */
export const REACTION_OBSERVATION = "2.16.840.1.113883.10.20.22.4.9";
/** Severity Observation, nested in a reaction (or the allergy) propensity. */
export const SEVERITY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.8";
/** Criticality Observation, the clinical criticality of the propensity. */
export const CRITICALITY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.145";
/** Result Organizer, the panel/battery wrapper around Result Observations. */
export const RESULT_ORGANIZER = "2.16.840.1.113883.10.20.22.4.1";
/** Result Observation, a single coded lab/diagnostic result + its value. */
export const RESULT_OBSERVATION = "2.16.840.1.113883.10.20.22.4.2";
/** Vital Signs Organizer, the cluster wrapper around Vital Sign Observations. */
export const VITAL_SIGNS_ORGANIZER = "2.16.840.1.113883.10.20.22.4.26";
/** Vital Sign Observation, a single coded vital sign + its `PQ` value. */
export const VITAL_SIGN_OBSERVATION = "2.16.840.1.113883.10.20.22.4.27";
/** Immunization Activity, the `substanceAdministration` for one vaccination. */
export const IMMUNIZATION_ACTIVITY = "2.16.840.1.113883.10.20.22.4.52";
/** Immunization Medication Information, the `manufacturedMaterial` carrying the CVX. */
export const IMMUNIZATION_MEDICATION_INFORMATION = "2.16.840.1.113883.10.20.22.4.54";
/** Procedure Activity Procedure, a `<procedure>` (an altering/operative act). */
export const PROCEDURE_ACTIVITY_PROCEDURE = "2.16.840.1.113883.10.20.22.4.14";
/** Procedure Activity Act, an `<act>` procedure (a non-altering service). */
export const PROCEDURE_ACTIVITY_ACT = "2.16.840.1.113883.10.20.22.4.12";
/** Procedure Activity Observation, an `<observation>` procedure (an assessment). */
export const PROCEDURE_ACTIVITY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.13";
/** Encounter Activity, the `<encounter>` for one visit/admission. */
export const ENCOUNTER_ACTIVITY = "2.16.840.1.113883.10.20.22.4.49";
/** Smoking Status, Meaningful Use observation (current smoking status). */
export const SMOKING_STATUS_OBSERVATION = "2.16.840.1.113883.10.20.22.4.78";
/** Planned Act, a `<act>` planned/ordered service in the Plan of Treatment. */
export const PLANNED_ACT = "2.16.840.1.113883.10.20.22.4.39";
/** Planned Encounter, a planned `<encounter>` in the Plan of Treatment. */
export const PLANNED_ENCOUNTER = "2.16.840.1.113883.10.20.22.4.40";
/** Planned Procedure, a planned/ordered `<procedure>` in the Plan of Treatment. */
export const PLANNED_PROCEDURE = "2.16.840.1.113883.10.20.22.4.41";
/** Planned Medication Activity, a planned `<substanceAdministration>` in the Plan. */
export const PLANNED_MEDICATION_ACTIVITY = "2.16.840.1.113883.10.20.22.4.42";
/** Planned Supply, a planned `<supply>` (device/material) in the Plan of Treatment. */
export const PLANNED_SUPPLY = "2.16.840.1.113883.10.20.22.4.43";
/** Planned Observation, a planned/ordered `<observation>` in the Plan of Treatment. */
export const PLANNED_OBSERVATION = "2.16.840.1.113883.10.20.22.4.44";
/**
 * Planned Immunization Activity, a planned `<substanceAdministration>` whose
 * vaccine lives in its `consumable` (Immunization Medication Information,
 * {@link IMMUNIZATION_MEDICATION_INFORMATION}). **Root-only: the template
 * asserts no `@extension`**, unlike the six `…22.4.39`-`…22.4.44` planned
 * templates, which all carry the R2.1 `2014-06-09` stamp. Matching ignores the
 * extension either way ({@link hasTemplateRoot}), but the builder must not
 * invent one.
 */
export const PLANNED_IMMUNIZATION_ACTIVITY = "2.16.840.1.113883.10.20.22.4.120";
/**
 * Planned Intervention Act (V2), the `<act>` that groups the interventions
 * planned toward a goal. **It is a CONTAINER, not a planned item**: R2.1 gives
 * it an `entryRelationship` for each of the seven planned templates this package
 * models, and each of those relationships holds the planned act **inline**, so a
 * planned entry can sit one markup layer below an `<entry>`. It is not itself a
 * {@link PlannedItem} kind, it carries no `code` of its own to return, and it is
 * not admissible as a direct `<entry>` of the Plan of Treatment Section (whose
 * eleven entry templates do not include it).
 *
 * **Its `[1..*]` `typeCode="RSON"` relationship targets Entry Reference
 * (`…22.4.122`), not a Goal Observation directly** (the Entry Reference SHALL in
 * turn point at one). An Entry Reference carries an `<id>` and a
 * `nullFlavor="NP"` `<code>` and no planned template root, so root-matching walks
 * past it without following the pointer, which is the correct reading: the target
 * is elsewhere in the document and is reached on its own terms or not at all.
 */
export const PLANNED_INTERVENTION_ACT = "2.16.840.1.113883.10.20.22.4.146";
/**
 * Instruction (V2), an `<act>` carrying patient/provider instructions. Admitted
 * by the Plan of Treatment Section and by the Planned Intervention Act, and
 * **not** a {@link PlannedItem}: it describes something to be *told*, not an act
 * to be performed on the patient at a future time. Recognized only so the entry
 * can be reported (`PLAN_ENTRY_NOT_MODELED`) rather than excluded in silence.
 */
export const INSTRUCTION = "2.16.840.1.113883.10.20.22.4.20";
/**
 * Handoff Communication Participants, an `<act>` naming who handed care over to
 * whom. Admitted in the same two places as {@link INSTRUCTION} and modelled in
 * neither: it describes a communication, not a planned act. Reported, never
 * returned.
 */
export const HANDOFF_COMMUNICATION_PARTICIPANTS = "2.16.840.1.113883.10.20.22.4.141";
/**
 * Nutrition Recommendation, an `<act>` carrying dietary advice. Admitted in the
 * same two places as {@link INSTRUCTION} and modelled in neither. **It is also a
 * container** (it inline-holds six of the seven planned templates), and this
 * package does **not** descend into it: reporting the act is not the same as
 * reaching what it holds, and widening the nesting walk is its own decision.
 */
export const NUTRITION_RECOMMENDATION = "2.16.840.1.113883.10.20.22.4.130";
/** Functional Status Organizer, clusters Functional Status Observations. */
export const FUNCTIONAL_STATUS_ORGANIZER = "2.16.840.1.113883.10.20.22.4.66";
/** Functional Status Observation, a single coded functional-status finding + value. */
export const FUNCTIONAL_STATUS_OBSERVATION = "2.16.840.1.113883.10.20.22.4.67";
/** Mental Status Organizer, clusters Mental Status Observations. */
export const MENTAL_STATUS_ORGANIZER = "2.16.840.1.113883.10.20.22.4.75";
/** Mental Status Observation, a single coded mental-status finding + value. */
export const MENTAL_STATUS_OBSERVATION = "2.16.840.1.113883.10.20.22.4.74";
/** Assessment Scale Observation, a scored scale (e.g. PHQ-9, Glasgow Coma) carried as a direct section entry. */
export const ASSESSMENT_SCALE_OBSERVATION = "2.16.840.1.113883.10.20.22.4.69";
/** Assessment Scale Supporting Observation, a scored component (item/question) of an Assessment Scale. */
export const ASSESSMENT_SCALE_SUPPORTING_OBSERVATION = "2.16.840.1.113883.10.20.22.4.86";
/** Family History Organizer, one family member + their Family History Observations. */
export const FAMILY_HISTORY_ORGANIZER = "2.16.840.1.113883.10.20.22.4.45";
/** Family History Observation, a relative's condition (coded in `value`). */
export const FAMILY_HISTORY_OBSERVATION = "2.16.840.1.113883.10.20.22.4.46";
/** Family History Death Observation, marks a condition as the cause of death. */
export const FAMILY_HISTORY_DEATH_OBSERVATION = "2.16.840.1.113883.10.20.22.4.47";
/** Age Observation, the relative's age (a `PQ` in years) at onset/death. */
export const AGE_OBSERVATION = "2.16.840.1.113883.10.20.22.4.31";

/**
 * The performed-vs-planned disposition of a clinical act, derived from its
 * `@moodCode`: `EVN` → `"performed"`; a planned mood (`INT`/`RQO`/`PRMS`/`PRP`/
 * `APT`/`ARQ`) → `"planned"`. Shared by Procedures and the Plan of Treatment so
 * a planned act is **never** read as performed (and vice versa).
 *
 * @example
 * ```ts
 * import type { EventDisposition } from "@cosyte/ccda";
 * const d: EventDisposition = "planned";
 * ```
 */
export type EventDisposition = "performed" | "planned";

/** The HL7 ActMood codes that mark a *planned/ordered* (not performed) act. @internal */
const PLANNED_MOODS: ReadonlySet<string> = new Set(["INT", "RQO", "PRMS", "PRP", "APT", "ARQ"]);

/**
 * Classify a `@moodCode` into an {@link EventDisposition}, **never guessing**:
 * `EVN` → `"performed"`, a recognized planned mood → `"planned"`, and `undefined`
 * for a missing or unrecognized mood (the caller decides whether to flag it).
 * Pure, emits nothing, so each extractor pairs it with its own warning.
 *
 * @example
 * ```ts
 * import { classifyDisposition } from "@cosyte/ccda";
 * classifyDisposition("INT"); // "planned"
 * classifyDisposition("EVN"); // "performed"
 * classifyDisposition("GOL"); // undefined
 * ```
 */
export function classifyDisposition(moodCode: string | undefined): EventDisposition | undefined {
  if (moodCode === undefined) return undefined;
  if (moodCode === "EVN") return "performed";
  if (PLANNED_MOODS.has(moodCode)) return "planned";
  return undefined;
}

/** Each top-level entry act/organizer root mapped to its home section key. @internal */
export const ENTRY_ROOT_TO_SECTION: ReadonlyMap<string, string> = new Map([
  [PROBLEM_CONCERN_ACT, "problems"],
  [MEDICATION_ACTIVITY, "medications"],
  [ALLERGY_CONCERN_ACT, "allergies"],
  [RESULT_ORGANIZER, "results"],
  [VITAL_SIGNS_ORGANIZER, "vitalSigns"],
  [IMMUNIZATION_ACTIVITY, "immunizations"],
  [PROCEDURE_ACTIVITY_PROCEDURE, "procedures"],
  [PROCEDURE_ACTIVITY_ACT, "procedures"],
  [PROCEDURE_ACTIVITY_OBSERVATION, "procedures"],
  [ENCOUNTER_ACTIVITY, "encounters"],
  [SMOKING_STATUS_OBSERVATION, "socialHistory"],
  [PLANNED_ACT, "planOfTreatment"],
  [PLANNED_ENCOUNTER, "planOfTreatment"],
  [PLANNED_PROCEDURE, "planOfTreatment"],
  [PLANNED_MEDICATION_ACTIVITY, "planOfTreatment"],
  [PLANNED_SUPPLY, "planOfTreatment"],
  [PLANNED_OBSERVATION, "planOfTreatment"],
  // The Plan of Treatment Section is the only *section* the R2.1 catalog lets
  // carry a Planned Immunization Activity as a direct entry. Its one other listed
  // container, the Planned Intervention Act, holds it as a NESTED act, which this
  // check never inspects (it reads an `<entry>`'s own act and no deeper), so the
  // mapping cannot fire on that shape. A Goal Observation is NOT a second
  // container: its `plannedComponent` entryRelationship targets Entry Reference,
  // so it *references* a planned entry rather than nesting one. Adding a root here can only make
  // SECTION_PLACEMENT_SUSPECT fire more: the loop reports the first root whose
  // home disagrees with the section and merely continues past one that agrees.
  [PLANNED_IMMUNIZATION_ACTIVITY, "planOfTreatment"],
  [FUNCTIONAL_STATUS_ORGANIZER, "functionalStatus"],
  [FUNCTIONAL_STATUS_OBSERVATION, "functionalStatus"],
  [MENTAL_STATUS_ORGANIZER, "mentalStatus"],
  [MENTAL_STATUS_OBSERVATION, "mentalStatus"],
  [FAMILY_HISTORY_ORGANIZER, "familyHistory"],
]);

/**
 * The catalog `key` a `<section>` resolves to, `templateId` root first and its
 * LOINC `<code>` as the fallback, or `undefined` when neither is recognized.
 *
 * **Silent by construction, and that is deliberate**: `buildSection` has already
 * emitted the section-level recognition warnings (`UNKNOWN_SECTION_CODE`,
 * `SECTION_MATCHED_BY_LOINC_FALLBACK`) by the time any extractor runs, so the
 * throwaway `{ emit: () => {} }` context here exists to keep this from
 * double-counting them, not to hide anything. It also resolves a disagreeing
 * section (`templateId` says one thing, LOINC another) on the `templateId`
 * without a word, which is a known, filed limitation of recognition rather than
 * a rule of this function.
 *
 * It lives here rather than in `./extract.ts` because two callers need the same
 * answer: the misplaced-entry check, and the Plan of Treatment reading, which
 * scopes `PLAN_ENTRY_NOT_MODELED` to the section that admits those templates. A
 * second copy would be one more claim to keep in step.
 *
 * (No `@example` import: this helper is not on the package entry point, and
 * citing one that does not resolve is the open `@example` defect already filed.)
 *
 * @example
 * ```ts
 * sectionKeyOf(sectionEl); // "planOfTreatment"
 * ```
 */
export function sectionKeyOf(sectionEl: Element): string | undefined {
  for (const root of templateRoots(sectionEl)) {
    const info = sectionForTemplateRoot(root);
    if (info !== undefined) return info.key;
  }
  const code = parseCd(child(sectionEl, "code"), { emit: () => {} });
  if (code?.code !== undefined) {
    const info = sectionForLoinc(code.code);
    if (info !== undefined) return info.key;
  }
  return undefined;
}

/**
 * The `templateId` root OIDs carried by an element, in document order. Used to
 * recognize an act/observation by template without descending.
 *
 * @example
 * ```ts
 * import { templateRoots } from "@cosyte/ccda";
 * templateRoots(actEl).includes("2.16.840.1.113883.10.20.22.4.3");
 * ```
 */
export function templateRoots(el: Element): readonly string[] {
  const out: string[] = [];
  for (const t of children(el, "templateId")) {
    const root = attr(t, "root");
    if (root !== undefined) out.push(root);
  }
  return out;
}

/**
 * True when an element carries the given `templateId` root (extension ignored,
 * roots match across R2.0/R2.1 mixed-extension documents).
 *
 * @example
 * ```ts
 * import { hasTemplateRoot, PROBLEM_OBSERVATION } from "@cosyte/ccda";
 * if (hasTemplateRoot(observationEl, PROBLEM_OBSERVATION)) { ... }
 * ```
 */
export function hasTemplateRoot(el: Element, root: string): boolean {
  return templateRoots(el).includes(root);
}

/**
 * Walk a direct-child element chain (each step a v3-namespace child by local
 * name), returning the element at the end or `undefined` if any step is absent.
 *
 * @example
 * ```ts
 * import { chain } from "@cosyte/ccda";
 * const drugCode = chain(sbadm, "consumable", "manufacturedProduct", "manufacturedMaterial", "code");
 * ```
 */
export function chain(el: Element | undefined, ...names: readonly string[]): Element | undefined {
  let current: Element | undefined = el;
  for (const name of names) {
    if (current === undefined) return undefined;
    current = child(current, name);
  }
  return current;
}

/**
 * Resolve the coded product of a `substanceAdministration`'s `consumable`,
 * across **both** arms of the CDA R2 `ManufacturedProduct` choice.
 *
 * CDA R2 models `ManufacturedProduct` with a choice of participant:
 * `manufacturedMaterial` (a `Material`) or `manufacturedLabeledDrug` (a
 * `LabeledDrug`). Both carry the product's `CE` on a child `<code>`. C-CDA's
 * Medication Information and Immunization Medication Information templates are
 * written around `manufacturedMaterial`, so that arm is preferred and read
 * silently; the `manufacturedLabeledDrug` arm is read too, with
 * `MEDICATION_PRODUCT_ARM_UNEXPECTED`.
 *
 * Reading the alternate arm rather than warning-and-ignoring it is the
 * Postel's-Law call, and the safer one: the previous behaviour returned
 * `drug: undefined` in complete silence while dose, route and timing survived,
 * so the record read as a well-formed medication that simply had no drug.
 * Whenever a code *is* selected the caller reads it exactly as it would have
 * read a single-arm document's, so nothing about the arm changes what the entry
 * does with the code. The two states in which none is selected each carry a
 * safety-critical warning of their own: the conflict below, and
 * `MISSING_PRODUCT_CODE` when no arm carried a `<code>` at all.
 *
 * **A document carrying both arms is handled on what they say, not on which one
 * the templates prefer.** A `choice` means one arm, so two is already outside
 * the model, and the question is only whether the parser can still read a
 * determinate product out of it. The `manufacturedLabeledDrug` arm's mere
 * presence always draws `MEDICATION_PRODUCT_ARM_UNEXPECTED` (it is the arm the
 * templates are not written around, whether or not it carries a `<code>`), and
 * then:
 *
 * - **Only one arm names a product** (the other asserts no `@code`, e.g. a
 *   `nullFlavor`-only `<code>`, or carries no `<code>` at all): the one that
 *   names it is read, whichever arm it is. When *neither* names one the
 *   `manufacturedMaterial` arm is read, exactly as before this rule existed, so
 *   `MISSING_CODE_VALUE` / `MISSING_CODE_SYSTEM` / `UNEXPECTED_CODE_SYSTEM` keep
 *   seeing the element they used to. There is no contradiction to resolve,
 *   a null value is an *exceptional* value rather than a competing one, so
 *   withholding here would discard a determinate drug the document does name.
 *   This is also the direction the previous behaviour lost data in, a
 *   `nullFlavor`-only `manufacturedMaterial` used to win over a
 *   `manufacturedLabeledDrug` naming a real RxNorm concept, in silence.
 * - **Both name the same product**: redundant, not contradictory.
 *   `manufacturedMaterial` is read, exactly as before. "The same product" is
 *   read off every coding an arm offers, its own `@code` and each
 *   `<translation>` alternate, so arms that agree in a different terminology
 *   than the one they lead with agree here too, and an arm that offers an
 *   *extra* alternate the other stayed quiet about is elaborating its own
 *   concept rather than denying the other's.
 * - **Both name different products** (they share no coding at all, or, where
 *   both fell back to `<translation>`s, each also names a coding the other does
 *   not and two of those sit in the same terminology under different symbols,
 *   see {@link namesConflictingProducts}): the document names two drugs on one
 *   medication, and *nothing in it ranks the arms*. Preferring
 *   `manufacturedMaterial` here would not be reporting what the document said,
 *   it would be manufacturing a choice the document declined to make, and
 *   handing a naive consumer one of two contradictory drugs with the other
 *   silently dropped. So no code is selected, `MEDICATION_PRODUCT_ARM_CONFLICT`
 *   (safety-critical) fires, and `conflicted` tells the caller to suppress its
 *   `MISSING_PRODUCT_CODE` backstop, which would otherwise say the false thing
 *   ("no arm yielded a code") in place of the true one. This is the
 *   `CONTRADICTORY_NULL_FLAVOR` resolution applied to a structural
 *   contradiction rather than a datatype one: warn, withhold the manufactured
 *   reading, preserve everything verbatim. It is preserved: `serializeCcda`
 *   re-emits the parsed DOM, so both arms round-trip byte-for-byte. The cost is
 *   named rather than hidden: with no code selected `checkCodeSlot` has nothing
 *   to check, so the code-system and terminology warnings cannot fire for that
 *   slot, which is exactly why the conflict code is safety-critical and no
 *   profile may quiet it.
 *
 * **Disagreement is read across every arm, selection is not.** The conflict
 * check runs over *all* the `<code>` elements the `manufacturedProduct` carries,
 * both arm kinds, repeated arms of one kind, and repeated `<code>`s on one arm
 * (two sibling
 * `manufacturedMaterial`s naming different drugs is the same silent pick, one
 * arm kind in). An arm names its `@code` when it asserts one, and **otherwise**
 * the codings its `<translation>` alternates assert, a fallback rather than an
 * addition, so widening what an arm names can only make the conflict fire more,
 * never less (see {@link productCodingsOf}). Which element is then handed to the
 * slot checks is decided by primary `@code` alone, exactly as before. That split
 * is deliberate. A `<translation>` under a `<code>` that asserts no symbol is
 * where that arm states its drug, which is enough to settle whether the arms
 * *disagree*; it is not enough to *select* a reading, because this package's
 * stated boundary is that slot checks apply to a slot's primary coding and
 * translations are preserved but never slot-checked. Selecting an arm on the
 * strength of a translation would hand `checkCodeSlot` a `<code>` whose primary
 * is a `nullFlavor` and validate nothing, or require synthesizing a coding the
 * document never wrote in that position, which is the manufactured reading this
 * whole rule refuses.
 *
 * **A repeated arm is reported whether or not it agrees**
 * (`MEDICATION_PRODUCT_ARM_REPEATED`, keyed to the arms rather than to their
 * codings, exactly as the presence warning is). Repeated arms that disagree were
 * already refused; repeated arms that *agree* were reduced to one in silence, so
 * a document asserting one product three times reported identically to one
 * asserting it once. Cardinality and agreement are separate facts and get
 * separate codes.
 *
 * **And a repeated `<code>` on one arm is reported**
 * (`MEDICATION_PRODUCT_CODE_REPEATED`, **safety-critical**, positioned on the
 * arm that carries it, one warning per offending arm). `Material.code` and
 * `LabeledDrug.code` are each at most one in CDA R2, and only the **first**
 * `<code>` per arm was ever read, so an arm writing two drugs as sibling
 * `<code>`s handed the first back as the product and discarded the second
 * without comparing it or mentioning it, which is
 * `MEDICATION_PRODUCT_ARM_CONFLICT`'s exact failure on a shape that rule could
 * not see. Every `<code>` on every arm now reaches the **comparison**, so that
 * shape conflicts.
 *
 * **Selection was deliberately NOT widened with it**, and that asymmetry is the
 * same one this whole area rests on. See {@link armLeadCodes}: a second `<code>`
 * is a new candidate rather than a new arm, it sits earlier in document order
 * than a later arm's lead, and {@link selectableCode} ranks on "names a product"
 * alone, so admitting it would displace an equally-symboled but richer sibling
 * coding and take `CODE_NARRATIVE_MISMATCH`, `MISSING_CODE_VALUE`, or a
 * `<translation>` list down with it. So what a caller *reads* is unchanged,
 * which is why the new code is safety-critical rather than tolerable: it is the
 * lone signal on the shape where the lead `<code>` is `nullFlavor`-marked and
 * the sibling names the drug.
 *
 * **And when the product is named only in a `<translation>`, that is said out
 * loud** (`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`, safety-critical). Selection
 * still does not read translations, so the returned `CD` is whatever the
 * selection rule above picked and its `code` is `undefined`, exactly as before.
 * What changes is that the shape is no longer silent: `MISSING_PRODUCT_CODE`
 * cannot fire (an arm did carry a `<code>`) and `checkCodeSlot` is quiet by
 * design on a `nullFlavor`-only slot, so a consumer reading the product off the
 * slot previously saw a drugless medication with no warning at all, over a
 * document that names the drug one element down. The warning is positioned on
 * the `<code>` that carries the naming `<translation>`, and says whether that is
 * the arm returned as the `CD`: with two arms neither asserting a primary, the
 * coding may sit on the arm that was *not* selected, in which case it is not on
 * the returned `CD` at all and only the re-serialized document has it.
 *
 * Returns `undefined` when no arm carries a code; the caller decides what
 * that means for its entry type (a Medication Activity and an Immunization
 * Activity both flag it, `MISSING_PRODUCT_CODE`).
 *
 * **Provenance:** the two-arm choice is base CDA R2 structure, and that a `CD`'s
 * `<translation>` carries an alternate coding *of the same concept* is HL7 v3
 * datatype semantics. Whether the C-CDA template *forbids* the alternate arm, or
 * forbids both together, or forbids a repeated one, is a normative question this
 * repo cannot settle without the R2.1 Schematron, so nothing here claims a
 * conformance verb. The warnings say only which arms were present and whether
 * they agreed; the safety classification rests on the harm ordering.
 *
 * @example
 * ```ts
 * import { consumableProductCode } from "@cosyte/ccda";
 * const drugEl = consumableProductCode(sbadm, ctx);
 * ```
 */
export function consumableProductCode(
  sbadm: Element,
  ctx: ParseCtx,
): { readonly el?: Element; readonly product?: Element; readonly conflicted?: boolean } {
  const product = chain(sbadm, "consumable", "manufacturedProduct");
  if (product === undefined) return {};
  // The presence warning keys off the ARM, not its <code>: a
  // manufacturedLabeledDrug carrying only a <name> is still the arm the C-CDA
  // templates are not written around, and flagging it on the code alone made
  // markup shape rather than meaning decide whether the deviation was reported.
  if (chain(product, "manufacturedLabeledDrug") !== undefined) {
    ctx.emit(medicationProductArmUnexpected(positionOf(product)));
  }

  // Cardinality is reported on the ARMS, for the same reason the presence
  // warning above is: `ManufacturedProduct` models a choice of ONE participant,
  // so a repeated arm is outside the model whatever its <code> says, and
  // repeated arms that AGREE were previously reduced to one in silence, leaving
  // a document that asserts the same product three times indistinguishable from
  // one that asserts it once. Whether the repeats agree is a separate question,
  // answered below by the conflict rule.
  if (
    children(product, "manufacturedMaterial").length > 1 ||
    children(product, "manufacturedLabeledDrug").length > 1
  ) {
    ctx.emit(medicationProductArmRepeated(positionOf(product)));
  }

  // The same cardinality question one markup layer in. `Material.code` and
  // `LabeledDrug.code` are each at most one in CDA R2, so a second <code> on
  // ONE arm is outside the model exactly as a second arm is -- and it used to be
  // dropped before it was ever compared, because only the first <code> per arm
  // was read. Reported per ARM rather than per product, because unlike the
  // repeated arm (a fact about the manufacturedProduct) this is a fact about a
  // particular arm, and the `position` names which one; a product with two
  // offending arms draws two warnings at two locations rather than one that
  // points at only one of them.
  for (const arm of productArms(product)) {
    if (children(arm, "code").length > 1) ctx.emit(medicationProductCodeRepeated(positionOf(arm)));
  }

  const materialCodes = armCodes(product, "manufacturedMaterial");
  const labeledCodes = armCodes(product, "manufacturedLabeledDrug");

  // Disagreement is read across everything the product carries: both arm kinds,
  // repeated arms of one kind, every <code> an arm carries rather than just its
  // first, and (for a <code> that asserts no symbol) its <translation>
  // alternates. A pick between two named drugs is the same harm whichever markup
  // shape hides it.
  if (offersConflictingProducts(materialCodes, labeledCodes)) {
    ctx.emit(medicationProductArmConflict(positionOf(product)));
    return { product, conflicted: true };
  }

  // **Selection reads the LEAD <code> of each arm and nothing else, and widening
  // the comparison above deliberately did not widen this.** "Disagreement is
  // read across every arm, selection is not" is the split this whole area is
  // built on, and a second <code> is a new candidate, not a new arm. Letting one
  // into selection moves the pick to an element EARLIER in document order than
  // the one chosen before, which is completeness-blind: a bare <code code="X"/>
  // would displace a sibling arm's <code code="X" displayName="..."/>, and with
  // the displayName goes CODE_NARRATIVE_MISMATCH, the only guard on the
  // structured code disagreeing with the narrative, on a document where it
  // previously fired correctly. Same for a displaced <code> carrying the
  // <translation>s, and same for MISSING_CODE_VALUE on a displaced empty <code>.
  // Every one of those is a safety-critical signal traded for a symbol that was
  // already identical, since only codings that AGREE can survive the conflict
  // check above. So what is read is byte-identical to what was read before this
  // rule existed WHEREVER A PRODUCT IS STILL RETURNED: the comparison and the
  // cardinality report are the only additions, but the widened comparison does
  // withhold the product on the shapes where it now finds a disagreement, which
  // is exactly the defect this rule exists to close.
  const material = selectableCode(armLeadCodes(product, "manufacturedMaterial"));
  const labeled = selectableCode(armLeadCodes(product, "manufacturedLabeledDrug"));

  // Only one arm can name a product now, or they name the same one, so the pick
  // is the document's rather than the parser's. The labeled arm is read in
  // exactly one situation: it names a product and the material arm does not.
  // That is the gap this rule exists to close, a material arm asserting no
  // symbol used to win over a labeled arm naming a real drug, in silence.
  // Everything else reads `manufacturedMaterial`, including the case where
  // NEITHER arm names a symbol, so the empty-slot machinery
  // (MISSING_CODE_VALUE, MISSING_CODE_SYSTEM, UNEXPECTED_CODE_SYSTEM) still
  // sees exactly the element it saw before this rule existed.
  const el = selectAcrossArms(material, labeled);
  // The selected element asserts no primary symbol, so (by the rule just above)
  // NO arm does: had any named one it would have been selected. If some arm
  // nonetheless names a product in a <translation>, the document names a drug
  // and the product slot reads empty, which until now happened in total silence
  // (MISSING_PRODUCT_CODE does not fire, an arm did carry a <code>, and
  // checkCodeSlot is quiet by design on a nullFlavor-only slot). The reading is
  // NOT changed: selecting a translation would hand the slot checks a coding
  // the document never wrote in that position. Only the silence is.
  //
  // The warning is positioned on the <code> that CARRIES the naming
  // translation, which is not always the selected one: with two arms neither
  // asserting a primary, the material arm is selected while the labeled arm may
  // be the one holding the coding, and only ONE arm ever becomes the returned
  // `CD`. Pointing at the selected element there would send a reader to an
  // element that does not have what the warning says exists.
  //
  // It scans the LEAD <code>s, the same list selection just drew from, which is
  // what keeps its precondition true: nothing selectable asserts a primary, so
  // any coding still found there is by definition a translation fallback.
  // Handing it the widened list would break exactly that, because a non-lead
  // <code> may assert a primary @code, and the warning would then point at an
  // element whose product is not in a <translation> at all while its message
  // says no arm asserts a primary. That is the same false remediation
  // instruction #62's first cut shipped, and it is not repeated here.
  if (el !== undefined && !namesAProduct(el)) {
    const naming = firstTranslationNamingProduct(
      armLeadCodes(product, "manufacturedMaterial"),
      armLeadCodes(product, "manufacturedLabeledDrug"),
    );
    if (naming !== undefined) {
      ctx.emit(medicationProductCodeTranslationOnly(positionOf(naming), naming === el));
    }
  }
  return el === undefined ? { product } : { el, product };
}

/**
 * Pick between the two arm kinds' selectable `<code>`s. The labeled arm is read
 * in exactly one situation: it names a product and the material arm does not.
 * @internal
 */
function selectAcrossArms(
  material: Element | undefined,
  labeled: Element | undefined,
): Element | undefined {
  if (material === undefined) return labeled;
  if (labeled !== undefined && !namesAProduct(material) && namesAProduct(labeled)) return labeled;
  return material;
}

/**
 * The first arm `<code>` that names a product **only** through a
 * `<translation>`, scanning the `manufacturedMaterial` arms before the
 * `manufacturedLabeledDrug` ones (which is document order only when the
 * document writes them in that order). Called only when nothing selectable
 * asserts a primary `@code`, so any coding {@link productCodingsOf} still finds
 * is by definition a translation fallback. The scan starts from the same list
 * the selection above draws from and in the same order, so the element it
 * returns is the selected one exactly when the selected arm is the one holding
 * the coding, which is what the warning reports.
 * @internal
 */
function firstTranslationNamingProduct(
  materials: readonly Element[],
  labeled: readonly Element[],
): Element | undefined {
  return [...materials, ...labeled].find((code) => productCodingsOf(code).codings.length > 0);
}

/** The trimmed `@code` of a `<code>` element, or `undefined` when it asserts no symbol. @internal */
function symbolOf(el: Element): string | undefined {
  const symbol = attr(el, "code")?.trim();
  return symbol === undefined || symbol === "" ? undefined : symbol;
}

/**
 * Whether a `<code>` element is **selectable** as the product coding: it asserts
 * a non-empty primary `@code`.
 *
 * Primary-only, deliberately, and not the same question
 * {@link namesConflictingProducts} asks. This one decides which element is handed
 * to `checkCodeSlot`, and the slot checks read a slot's primary coding, so an
 * arm whose only symbol sits in a `<translation>` is not selectable: choosing it
 * would validate a `nullFlavor` primary against nothing.
 * @internal
 */
function namesAProduct(el: Element): boolean {
  return symbolOf(el) !== undefined;
}

/** One coding an arm offers: a symbol, with the terminology it was asserted under. @internal */
interface ProductCoding {
  readonly symbol: string;
  readonly system?: string;
}

/** One `<code>` or `<translation>` element read as a coding, or `undefined` when it names nothing. @internal */
function codingOf(el: Element): ProductCoding | undefined {
  const symbol = symbolOf(el);
  if (symbol === undefined) return undefined;
  const system = attr(el, "codeSystem")?.trim();
  return system === undefined || system === "" ? { symbol } : { symbol, system };
}

/**
 * What one arm names, and **how**: the codings themselves, plus whether they
 * came from the `<translation>` fallback rather than from the arm's own `@code`.
 *
 * The provenance is not decoration. Two arms that both assert a primary are
 * compared on those primaries alone, while two arms that both fell back to
 * translations are compared under a stricter rule ({@link namesConflictingProducts}),
 * so the comparison has to know which it is holding.
 * @internal
 */
interface ArmCodings {
  readonly codings: readonly ProductCoding[];
  readonly fromTranslation: boolean;
}

/**
 * What a product arm's `<code>` **names**: its own `@code` when it asserts one,
 * and otherwise the codings its direct `<translation>` alternates assert. Empty
 * when the arm names no product at all.
 *
 * **The translations are a fallback, never an addition, and that asymmetry is
 * the safety property.** Falling back closes the blind spot a `@code`-only check
 * leaves: `nullFlavor="OTH"` beside a `<translation>` is the documented C-CDA
 * idiom for "not codable in the bound value set, here is an alternate coding",
 * which this package already treats as coherent rather than contradictory, so on
 * that shape the arm's whole product identity lives in the translation. Keying
 * only on `@code` made such an arm name *no* product, and a labeled arm whose
 * translation named a different RxNorm drug never reached the conflict rule: the
 * material arm was selected in silence, which is the same "quietly picks between
 * two drugs" failure the rule exists to refuse.
 *
 * **Adding them to a `@code` that already asserts one would be strictly
 * dangerous, and is deliberately not done.** It would let a coding shared by two
 * arms *withdraw* a conflict the primaries assert, and a shared translation is
 * routinely **coarser** than either primary: an RxNorm ingredient, a local
 * formulary id, an NDC spanning presentations. Two arms reading "Lisinopril
 * 10 MG" and "Lisinopril 20 MG" that both translate to the lisinopril ingredient
 * would agree, and the parser would hand back one strength of a document that
 * names two. The document asserts each translation is an alternate coding of
 * *its own* concept, which is a statement about that arm, not an equation
 * between arms; concluding `A = B` from `A = Z` and `B = Z` is a transitive
 * closure the document never wrote, and it is false exactly when `Z` is coarser.
 * So this function can only ever make the conflict rule fire **more** than the
 * primaries alone would, never less.
 *
 * Nested translations are not descended into, matching `parseCd`: C-CDA does not
 * nest them.
 * @internal
 */
function productCodingsOf(el: Element): ArmCodings {
  const primary = codingOf(el);
  if (primary !== undefined) return { codings: [primary], fromTranslation: false };
  const codings = children(el, "translation")
    .map(codingOf)
    .filter((coding): coding is ProductCoding => coding !== undefined);
  return { codings, fromTranslation: true };
}

/**
 * Whether two codings name the same product: the same symbol, and not that
 * symbol under two different terminologies.
 *
 * A coding that omits `@codeSystem` is not treated as a disagreement:
 * `MISSING_CODE_SYSTEM` already covers that shape and refusing here would
 * withhold the product and make the parser *quieter* about it, the exact
 * direction this rule exists to reverse.
 * @internal
 */
function codingsAgree(a: ProductCoding, b: ProductCoding): boolean {
  if (a.symbol !== b.symbol) return false;
  return a.system === undefined || b.system === undefined || a.system === b.system;
}

/**
 * Whether two arms name **different** products, the shape on which the parser
 * refuses to pick an arm. Each side is the arm's coding set from
 * {@link productCodingsOf}.
 *
 * An arm that names no product (no `@code` and no `<translation>` carrying one)
 * has an empty set and never conflicts with one that does. That is not leniency,
 * it is the same
 * rule `contradictsAssertedValue` already applies one layer down: only a
 * *value-bearing* assertion can contradict, and in HL7 v3 a `nullFlavor` marks
 * an **exceptional value**, one with no proper value, rather than a competing
 * one. A `nullFlavor`-only `<code>` is a complete statement that the concept is
 * unknown, which is precisely what `MISSING_CODE_VALUE` was scoped around, and
 * treating it as a rival drug would discard the RxNorm code the document does
 * name (and with it every `checkCodeSlot` check on that code) to protect
 * against a contradiction that is not there.
 *
 * **Two arms that both assert a primary `@code`** are compared exactly as they
 * were before translations were read at all: symbol against symbol, system
 * against system, one coding each. Because {@link productCodingsOf} reads
 * translations only as a *fallback*, no translation can ever talk an asserted
 * pair of primaries out of a disagreement. See {@link productCodingsOf} for why
 * the other direction is unsound.
 *
 * **Two arms that BOTH fell back to translations** get one extra test on top of
 * that, and only that one. Sharing a coding is still enough to agree, but it
 * stops being enough when *each* arm also names a coding the other does not and
 * two of those unshared codings sit **in the same terminology under different
 * symbols**. It is the shape the "some coding agrees" test could not see: two
 * arms whose primaries are both uncodable, one
 * translating to a coarser shared concept plus a strength and the other to that
 * same shared concept plus a *different* strength, agree on the coarse coding
 * while naming two products, and handing one of them back is the failure this
 * rule exists to refuse.
 *
 * **A shorter list is not a denial, and is deliberately not a conflict.** HL7 v3
 * defines `CD.translation` as codings of *this* concept in other code systems,
 * so an arm that offers an extra alternate (an NDC beside the RxNorm both arms
 * share) is elaborating its own concept, not contradicting an arm that stayed
 * quiet about that terminology. Requiring the sets to cover each other would
 * draw an unquietable safety-critical code on a coherent document. Two codings
 * in *different* systems are likewise never a disagreement: deciding that an NDC
 * and an RxNorm concept denote different products is terminology work, which is
 * a `TerminologyAdapter`'s job and would be a manufactured reading here.
 *
 * **The same-terminology test is a parser's reading, not something the document
 * asserts, and it deliberately over-fires rather than under-fires.** Two
 * different symbols in one code system usually are two products, but not always:
 * two NDC package codes can describe one drug, and an RxNorm branded drug and
 * its clinical equivalent are one product at two granularities. Telling those
 * apart is the same terminology work refused just above, so the only choice is
 * which way to be wrong. Over-firing costs a withheld product beside a loud
 * safety-critical code; under-firing costs one of two strengths handed back in
 * silence. The whole area is built on preferring the first.
 *
 * **One arm primary, the other translation-derived** keeps the "some coding
 * agrees" rule untouched. The primary side offers exactly one coding, so
 * agreement means the fallback side asserted, in the document's own words, that
 * its concept is coded by exactly the symbol the other arm leads with. That is
 * the document linking the two arms directly rather than through a shared third
 * code.
 *
 * Every branch above only ever *adds* conflicts to what the base "some coding
 * agrees" test reports: that test is the first clause here, and the extra
 * same-terminology clause can only turn a non-conflict into a conflict. No
 * terminology equivalence is inferred anywhere: deciding that two codings the
 * document never linked denote one concept is a `TerminologyAdapter`'s job, and
 * guessing it in the parser would be the same manufactured reading this check
 * refuses.
 * @internal
 */
function namesConflictingProducts(a: ArmCodings, b: ArmCodings): boolean {
  if (a.codings.length === 0 || b.codings.length === 0) return false;
  if (!a.codings.some((x) => b.codings.some((y) => codingsAgree(x, y)))) return true;
  if (!a.fromTranslation || !b.fromTranslation) return false;
  const aOnly = unsharedCodings(a.codings, b.codings);
  const bOnly = unsharedCodings(b.codings, a.codings);
  return aOnly.some((x) => bOnly.some((y) => contradictsWithinOneSystem(x, y)));
}

/** The codings on one side that no coding on the other side agrees with. @internal */
function unsharedCodings(
  side: readonly ProductCoding[],
  other: readonly ProductCoding[],
): readonly ProductCoding[] {
  return side.filter((x) => !other.some((y) => codingsAgree(x, y)));
}

/**
 * Whether two codings disagree *within one terminology*: both name their system,
 * name the **same** one, and give different symbols. A coding that omits
 * `@codeSystem` is never a disagreement here, exactly as in {@link codingsAgree}:
 * `MISSING_CODE_SYSTEM` already covers that shape, and refusing on it would
 * withhold a product over a gap that warning has already named.
 * @internal
 */
function contradictsWithinOneSystem(a: ProductCoding, b: ProductCoding): boolean {
  return a.system !== undefined && a.system === b.system && a.symbol !== b.symbol;
}

/**
 * Every `<code>` element the arms of the given kind carry, in document order.
 * **The comparison list.**
 *
 * **Every one, not the first per arm.** `Material.code` and `LabeledDrug.code`
 * are each at most one in CDA R2, so an arm carrying two `<code>` children is
 * already outside the model, exactly as a repeated *arm* is. Reading only the
 * first dropped the second before it reached the conflict rule, which is the
 * same silent pick between two named products that rule exists to refuse, one
 * markup layer further in: an arm writing Lisinopril and Aspirin as sibling
 * `<code>`s handed back Lisinopril, and said nothing at all. The repeat itself
 * is reported separately ({@link medicationProductCodeRepeated}); this function
 * only stops hiding the elements from the comparison.
 *
 * **Not the selection list**, deliberately. See {@link armLeadCodes}.
 * @internal
 */
function armCodes(product: Element, arm: string): readonly Element[] {
  return children(product, arm).flatMap((el) => children(el, "code"));
}

/**
 * The **lead** `<code>` of each arm of the given kind, in document order: the
 * one element per arm that CDA R2's `0..1` cardinality actually admits. **The
 * selection list.**
 *
 * Selection is a narrower question than disagreement and stays on this list even
 * though {@link armCodes} compares more. A second `<code>` is a new *candidate*,
 * not a new arm, and every candidate it adds sits EARLIER in document order than
 * the lead `<code>` of a later arm, so admitting them re-decides picks the
 * document never re-decided. `selectableCode` ranks on "names a product" alone,
 * which is completeness-blind on purpose, so the newcomer would displace an
 * equally-symboled but richer sibling: a bare `<code code="X"/>` over a
 * `<code code="X" displayName="..."/>`, taking `CODE_NARRATIVE_MISMATCH` (the
 * only guard on the structured code contradicting the narrative) down with it;
 * over a `<code code="X">` carrying the `<translation>`s; or over an empty
 * `<code/>` that `MISSING_CODE_VALUE` would have fired on. All three are
 * safety-critical signals, and all three would be traded for a symbol that was
 * already identical, since only codings that AGREE survive the conflict check.
 * Ranking the candidates by completeness instead would be the parser choosing
 * between codings the document wrote as equals, which is the manufactured
 * reading this whole area refuses. So the product a caller reads is
 * byte-identical to what it was before repeated `<code>`s were considered,
 * wherever one is still returned at all: the widened comparison in
 * {@link armCodes} withholds it entirely on the shapes where it now finds a
 * disagreement.
 * @internal
 */
function armLeadCodes(product: Element, arm: string): readonly Element[] {
  return children(product, arm)
    .map((el) => child(el, "code"))
    .filter((code): code is Element => code !== undefined);
}

/** Every arm of a `manufacturedProduct`, both kinds, materials first. @internal */
function productArms(product: Element): readonly Element[] {
  return [
    ...children(product, "manufacturedMaterial"),
    ...children(product, "manufacturedLabeledDrug"),
  ];
}

/**
 * The `<code>` the product code is selected from among the **lead** `<code>`s of
 * the arms of one kind: the first, in document order, that names a product, else
 * the first there is. One candidate per arm, never two.
 *
 * Preferring the first arm that names one is the same rule already applied
 * *across* arm kinds, applied within one kind: with only one arm naming a
 * product the pick is the document's rather than the parser's, so reading the
 * null-marked sibling arm instead would drop a drug the document names exactly
 * once, in silence. Falling back to the first arm's `<code>` when none names a
 * product keeps the empty-slot machinery (`MISSING_CODE_VALUE`,
 * `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM`) seeing exactly the element it
 * saw before repeated arms were considered. Selection is only ever reached when
 * nothing conflicts.
 *
 * **The rule is deliberately NOT applied within one arm.** A repeated `<code>`
 * on a single arm is compared (see {@link armCodes}) and reported
 * ({@link medicationProductCodeRepeated}), but never becomes a candidate here.
 *
 * **The list handed in is {@link armLeadCodes}, never {@link armCodes}**, and
 * that is load-bearing rather than incidental: this function ranks on "names a
 * product" alone, so it is completeness-blind. See {@link armLeadCodes} for
 * which extra candidates that would let in, and what admitting them costs.
 * @internal
 */
function selectableCode(codes: readonly Element[]): Element | undefined {
  return codes.find(namesAProduct) ?? codes[0];
}

/**
 * Whether the `<code>` elements a `manufacturedProduct` carries fail to agree on
 * one product.
 *
 * The candidates are **every** `<code>` under **every** `manufacturedMaterial`
 * and **every** `manufacturedLabeledDrug`, so repeated arms of one kind are
 * compared, and so are repeated `<code>`s within one arm. Two sibling
 * `manufacturedMaterial`s naming different drugs is the identical silent pick to
 * the two-arm case, only one arm kind in: the first was read and the second
 * dropped without a word. Two sibling `<code>`s under *one*
 * `manufacturedMaterial` is that same pick again, one markup layer further in,
 * and it was invisible for exactly the same reason (see {@link armCodes}).
 * `ManufacturedProduct` models one participant and `Material`/`LabeledDrug`
 * carry at most one `code` each, so both repeats are already outside the model,
 * and the parser's job on either is the same as on any contradiction it cannot
 * rank, refuse and say so.
 *
 * Agreement is not transitive (an arm omitting `@codeSystem` agrees with the
 * same symbol under any system), so the comparison is genuinely pairwise. It is
 * run over *distinct* codings rather than raw arms so that a document repeating
 * one arm N times costs N rather than N squared, and it short-circuits on the
 * first disagreement, which is the case a hostile input would have to avoid to
 * be expensive at all. The dedup key is `JSON.stringify`d rather than joined on
 * a separator, so a `@code` or `@codeSystem` containing the separator cannot
 * collide two arms into one and drop the disagreement the discarded one carried.
 * @internal
 */
function offersConflictingProducts(
  materials: readonly Element[],
  labeled: readonly Element[],
): boolean {
  const seen = new Set<string>();
  const named: ArmCodings[] = [];
  for (const code of [...materials, ...labeled]) {
    const arm = productCodingsOf(code);
    if (arm.codings.length === 0) continue;
    // Provenance is part of the key: two arms offering the same symbols under
    // different provenance are compared under different rules, so collapsing
    // them would drop a comparison rather than repeat one.
    const key = JSON.stringify([
      arm.fromTranslation,
      arm.codings.map((c) => [c.symbol, c.system ?? null]),
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    named.push(arm);
  }
  return named.some((a, i) => named.slice(i + 1).some((b) => namesConflictingProducts(a, b)));
}

/** Breadth-first search for the first descendant with the given local name. @internal */
function firstDescendant(el: Element, localName: string): Element | undefined {
  let level: readonly Element[] = childElementsOf(el);
  while (level.length > 0) {
    const next: Element[] = [];
    for (const node of level) {
      if (node.localName === localName) return node;
      next.push(...childElementsOf(node));
    }
    level = next;
  }
  return undefined;
}

/** Direct child elements of any namespace. @internal */
function childElementsOf(el: Element): readonly Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType === 1) out.push(n as Element);
  }
  return out;
}

/**
 * All `entryRelationship/observation` children of an act/observation whose
 * `observation` carries the given `templateId` root. Used to pull the typed
 * sub-observations (problem, reaction, severity, criticality) out of a concern
 * or propensity act.
 *
 * @example
 * ```ts
 * import { relatedObservations, PROBLEM_OBSERVATION } from "@cosyte/ccda";
 * const problems = relatedObservations(concernAct, PROBLEM_OBSERVATION);
 * ```
 */
export function relatedObservations(el: Element, root: string): readonly Element[] {
  const out: Element[] = [];
  for (const er of children(el, "entryRelationship")) {
    const obs = child(er, "observation");
    if (obs !== undefined && hasTemplateRoot(obs, root)) out.push(obs);
  }
  return out;
}

/**
 * The clinical act each of an element's `entryRelationship` children holds, in
 * the order those relationships appear, regardless of template or `@typeCode`.
 * The counterpart of {@link relatedObservations} for callers that must match on
 * the nested act's own `templateId` rather than on a root supplied up front, and
 * that must see `act` / `substanceAdministration` / `procedure` / `encounter` /
 * `supply` / `organizer` as well as `observation`.
 *
 * **One act per relationship, chosen exactly as {@link anyEntryAct} chooses an
 * `<entry>`'s, and the wording matters.** CDA gives `entryRelationship` a single
 * act, so on any conformant document "one per relationship" and "every act it
 * holds" are the same set. They part company only on a malformed relationship
 * carrying two, where this returns the first in {@link ACT_NAMES} order and not
 * the first in document order, and says nothing about the other. That is the
 * same reading every `<entry>` already gets rather than a new rule, but do not
 * describe this as returning everything nested: it does not.
 *
 * **This returns what an `entryRelationship` CONTAINS; it never follows what one
 * REFERENCES.** A C-CDA pointer is an Entry Reference (`…22.4.122`) act carrying
 * an `<id>`, and the element handed back here is that Entry Reference itself, not
 * whatever it names. Resolving the pointer is the caller's decision and no caller
 * makes it today.
 *
 * Not on the published entry point, so the example imports the module rather
 * than the package: saying `@cosyte/ccda` here would name a place this does not
 * live.
 *
 * @example
 * ```ts
 * import { relatedEntryActs } from "./shared.js";
 * const nested = relatedEntryActs(plannedInterventionActEl);
 * ```
 */
export function relatedEntryActs(el: Element): readonly Element[] {
  const out: Element[] = [];
  for (const er of children(el, "entryRelationship")) {
    for (const name of ACT_NAMES) {
      const act = child(er, name);
      if (act !== undefined) {
        out.push(act);
        break;
      }
    }
  }
  return out;
}

/**
 * All `component/observation` children of an organizer whose `observation`
 * carries the given `templateId` root. An organizer (Result, Vital Signs) nests
 * its member observations through `<component>` rather than `entryRelationship`.
 *
 * @example
 * ```ts
 * import { componentObservations, RESULT_OBSERVATION } from "@cosyte/ccda";
 * const results = componentObservations(organizer, RESULT_OBSERVATION);
 * ```
 */
export function componentObservations(el: Element, root: string): readonly Element[] {
  const out: Element[] = [];
  for (const comp of children(el, "component")) {
    const obs = child(comp, "observation");
    if (obs !== undefined && hasTemplateRoot(obs, root)) out.push(obs);
  }
  return out;
}

/**
 * Read the `statusCode/@code` of an act/observation (the v3 ActStatus token),
 * lower-cased, or `undefined` when absent.
 *
 * @example
 * ```ts
 * import { statusCodeOf } from "@cosyte/ccda";
 * statusCodeOf(concernAct); // "active" | "completed" | ...
 * ```
 */
export function statusCodeOf(el: Element): string | undefined {
  const sc = child(el, "statusCode");
  if (sc === undefined) return undefined;
  const code = attr(sc, "code");
  return code === undefined ? undefined : code.toLowerCase();
}

/**
 * Read the negation/nullFlavor pair off a clinical act as two **distinct,
 * never-collapsed** fields. Emits `NEGATION_VS_NULLFLAVOR_AMBIGUOUS` when both
 * are present (a sender asserting "did not happen" and "value unknown" at
 * once). Returns both so the caller models them separately.
 *
 * @example
 * ```ts
 * import { readNegation } from "@cosyte/ccda";
 * const { negated, nullFlavor } = readNegation(observationEl, ctx);
 * ```
 */
export function readNegation(
  el: Element,
  ctx: ParseCtx,
): { readonly negated?: boolean; readonly nullFlavor?: string } {
  const negated = parseBlAttr(el, "negationInd");
  const nullFlavor = attr(el, "nullFlavor");
  if (negated === true && nullFlavor !== undefined) {
    ctx.emit(negationVsNullFlavorAmbiguous(positionOf(el)));
  }
  const out: { negated?: boolean; nullFlavor?: string } = {};
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}

/**
 * Resolve an entry's narrative reference. Searches the act subtree for the
 * first `<reference value="#id">`, looks the `id` up in the section's narrative
 * index, and returns the narrative text. Emits `NARRATIVE_REFERENCE_BROKEN`
 * when the `#id` resolves to nothing. Returns `undefined` when there is no
 * reference at all.
 *
 * @example
 * ```ts
 * import { resolveNarrative } from "@cosyte/ccda";
 * const narrative = resolveNarrative(observationEl, section.narrativeById, ctx);
 * ```
 */
export function resolveNarrative(
  el: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): string | undefined {
  const ref = firstDescendant(el, "reference");
  if (ref === undefined) return undefined;
  const value = attr(ref, "value");
  if (value === undefined || !value.startsWith("#")) return undefined;
  const id = value.slice(1);
  const narrative = narrativeById.get(id);
  if (narrative === undefined) {
    ctx.emit(narrativeReferenceBroken(positionOf(ref)));
    return undefined;
  }
  return narrative;
}

/**
 * Reconcile a coded value against its resolved narrative. When both a display
 * label (the code's `displayName`/`originalText`) and a narrative are present
 * and neither contains the other (case-insensitive), emits
 * `CODE_NARRATIVE_MISMATCH`, surfacing the divergence without picking a winner.
 * Conservative by design: silent when either side is absent.
 *
 * @example
 * ```ts
 * import { reconcileCode } from "@cosyte/ccda";
 * reconcileCode(problemValue, narrative, "problem", positionOf(valueEl), ctx);
 * ```
 */
export function reconcileCode(
  code: CD | undefined,
  narrative: string | undefined,
  slot: NarrativeSlot,
  position: CcdaPosition,
  ctx: ParseCtx,
): void {
  if (narrative === undefined) return;
  const label = code?.displayName ?? code?.originalText;
  if (label === undefined || label.trim() === "") return;
  const a = label.trim().toLowerCase();
  const b = narrative.trim().toLowerCase();
  if (!b.includes(a) && !a.includes(b)) {
    ctx.emit(codeNarrativeMismatch(position, slot));
  }
}

/**
 * Resolve a concern act's {@link ConcernStatus} from its `statusCode` (the four
 * Concern Act ActStatus values). `completed` is the only one that ran its course
 * → `"resolved"`; `aborted` (stopped early) and `suspended` (on hold) are both
 * `"inactive"`, neither is collapsed into `"resolved"`, since "cancelled" is not
 * "ran to resolution". Emits `PROBLEM_STATUS_INDETERMINATE` when the status is
 * absent or outside the recognized set, returning `"unknown"` (never a guessed
 * `"active"`).
 *
 * @example
 * ```ts
 * import { resolveConcernStatus } from "@cosyte/ccda";
 * const status = resolveConcernStatus(concernAct, ctx);
 * ```
 */
export function resolveConcernStatus(act: Element, ctx: ParseCtx): ConcernStatus {
  switch (statusCodeOf(act)) {
    case "active":
      return "active";
    case "completed":
      return "resolved";
    case "aborted":
    case "suspended":
      return "inactive";
    case undefined:
    default:
      ctx.emit(problemStatusIndeterminate(positionOf(act)));
      return "unknown";
  }
}

/**
 * The `xsi:type` local name of an element (namespace prefix stripped), or
 * `undefined`. Distinguishes an `effectiveTime`'s `IVL_TS` (duration) from a
 * `PIVL_TS`/`EIVL_TS` (frequency) without committing to a prefix.
 *
 * @example
 * ```ts
 * import { typeOf } from "@cosyte/ccda";
 * if (typeOf(effectiveTimeEl) === "PIVL_TS") { ... }
 * ```
 */
export function typeOf(el: Element): string | undefined {
  return xsiType(el);
}

/**
 * The direct `<entry>` child elements of a `<section>`, in document order.
 *
 * @example
 * ```ts
 * import { childEntries } from "@cosyte/ccda";
 * for (const entry of childEntries(sectionEl)) { ... }
 * ```
 */
export function childEntries(sectionEl: Element): readonly Element[] {
  return children(sectionEl, "entry");
}

/**
 * The clinical act inside an `<entry>`, its first `act` /
 * `substanceAdministration` / `observation` / `organizer` child, that carries
 * the given `templateId` root, or `undefined` when the entry holds no such act.
 *
 * @example
 * ```ts
 * import { entryAct, PROBLEM_CONCERN_ACT } from "@cosyte/ccda";
 * const act = entryAct(entryEl, PROBLEM_CONCERN_ACT);
 * ```
 */
export function entryAct(entry: Element, root: string): Element | undefined {
  for (const name of ACT_NAMES) {
    const el = child(entry, name);
    if (el !== undefined && hasTemplateRoot(el, root)) return el;
  }
  return undefined;
}

/**
 * The clinical act inside an `<entry>` regardless of template, its first
 * `act` / `substanceAdministration` / `observation` / `organizer` child. Used
 * to inspect an entry's templates for misplacement detection.
 *
 * @example
 * ```ts
 * import { anyEntryAct } from "@cosyte/ccda";
 * const act = anyEntryAct(entryEl);
 * ```
 */
export function anyEntryAct(entry: Element): Element | undefined {
  for (const name of ACT_NAMES) {
    const el = child(entry, name);
    if (el !== undefined) return el;
  }
  return undefined;
}

/** The element names a C-CDA `<entry>` clinical act can take. @internal */
const ACT_NAMES = [
  "act",
  "substanceAdministration",
  "observation",
  "organizer",
  "procedure",
  "encounter",
  "supply",
] as const;

/**
 * Parse the direct `<id>` children of an act/observation into {@link II}s.
 *
 * @example
 * ```ts
 * import { idsOf } from "@cosyte/ccda";
 * const ids = idsOf(actEl, ctx);
 * ```
 */
export function idsOf(el: Element, ctx: ParseCtx): readonly II[] {
  return children(el, "id")
    .map((idEl) => parseIi(idEl, ctx))
    .filter((ii): ii is II => ii !== undefined);
}
