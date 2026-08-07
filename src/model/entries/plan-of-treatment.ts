/**
 * Plan of Treatment extraction. This module returns a {@link PlannedItem} for
 * **seven** entry templates: Planned Act (`…22.4.39`), Planned Encounter
 * (`…22.4.40`), Planned Procedure (`…22.4.41`), Planned Medication Activity
 * (`…22.4.42`), Planned Supply (`…22.4.43`), Planned Observation (`…22.4.44`),
 * and Planned Immunization Activity (`…22.4.120`). They share a shape, a `code`,
 * `statusCode`, `effectiveTime`, and differ in element name, template, and where
 * the `code` is read from.
 *
 * **Seven is not the number of entry templates the section can carry, and this
 * docblock used to conflate the two.** It said "the six planned-entry templates
 * a Plan of Treatment section can carry", which was wrong twice over: it named
 * six of the seven this module models, and it described that list as the
 * section's catalog. The Plan of Treatment Section (V2, `…22.2.10`) admits
 * **eleven** entry templates. Four of them are deliberately **not**
 * {@link PlannedItem}s and are not returned here: Instruction (`…22.4.20`),
 * Handoff Communication Participants (`…22.4.141`), Nutrition Recommendation
 * (`…22.4.130`), and Goal Observation (`…22.4.121`). A Goal Observation is the
 * clearest of the four: it is `moodCode="GOL"`, which
 * {@link classifyDisposition} classifies as **neither** performed nor planned,
 * so calling it a planned item would contradict this package's own mood model.
 * The other three describe an instruction, a communication, and a dietary
 * recommendation rather than an act to be performed on the patient at a future
 * time, which is the question `getPlannedItems()` answers.
 *
 * **Those three are no longer excluded in silence: each is REPORTED**
 * (`PLAN_ENTRY_NOT_MODELED`, one warning per matching root) where planned items
 * are read. That decision was taken 2026-08-06 and it settles only the
 * *reporting*: they are still not {@link PlannedItem}s, still reach no model
 * field, and still survive only in the re-serialized document. **Goal
 * Observation is deliberately NOT reported** with them; the decision taken on it
 * was to model it, and a warning would pre-empt that with a weaker answer.
 *
 * **A planned entry NESTED in a Planned Intervention Act (`…22.4.146`) is now
 * reached too, for all seven kinds.** R2.1 gives that act an `entryRelationship`
 * for each of the seven and each holds the planned act **inline**, so until this
 * was fixed a planned drug or vaccination one markup layer in was returned as
 * nothing with nothing said, the same silence the Planned Immunization Activity
 * produced a layer out. {@link extractPlannedItems} descends into that container
 * and no other, which does **not** solve nesting in general: a Nutrition
 * Recommendation (`…22.4.130`) inline-holds six of the seven and an Intervention
 * Act (`…22.4.131`) inline-holds a Planned Intervention Act, and neither is
 * reached. See its docblock for that bound in full and for what the container
 * also holds and this still does not return. (A Goal Observation is **not** one
 * of those containers: its
 * `plannedComponent` entryRelationship targets Entry Reference, so it references
 * a planned entry rather than nesting one. Neither is a Planned Intervention
 * Act's own `[1..*]` `typeCode="RSON"` relationship, which likewise holds an
 * Entry Reference; a pointer is walked past, never followed.)
 *
 * **Planned Immunization Activity was the one genuinely missing member**, and it
 * matched no root at all until this was fixed: `getPlannedItems()` returned
 * nothing for it and raised no warning, so a scheduled vaccination vanished from
 * the model in complete silence while round-tripping byte-for-byte through
 * `serializeCcda`. A consumer reading `getPlannedItems()` to answer "what is this
 * patient scheduled to receive" got a clean, warning-free answer with the
 * vaccination missing from it, which is the confident-wrong reading this package
 * exists to refuse. Nothing was corrupted, which is exactly why nothing caught
 * it.
 *
 * **Everything here is future/ordered, never performed.** Each item's
 * `@moodCode` is read into the same performed-vs-planned {@link EventDisposition}
 * the Procedures extractor uses (a planned mood → `"planned"`); the two are
 * **never conflated**. A missing or unrecognized mood leaves the disposition
 * `undefined` (never guessed), the raw `moodCode` is always preserved so a
 * consumer can see what the document actually asserted.
 */

import { attr, child, positionOf } from "../dom.js";
import { checkCodeSlot } from "../code-systems.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  missingProductCode,
  planEntryNotModeled,
  type UnmodeledPlanEntry,
} from "../../parser/warnings.js";
import {
  HANDOFF_COMMUNICATION_PARTICIPANTS,
  INSTRUCTION,
  NUTRITION_RECOMMENDATION,
  PLANNED_ACT,
  PLANNED_ENCOUNTER,
  PLANNED_IMMUNIZATION_ACTIVITY,
  PLANNED_INTERVENTION_ACT,
  PLANNED_MEDICATION_ACTIVITY,
  PLANNED_OBSERVATION,
  PLANNED_PROCEDURE,
  PLANNED_SUPPLY,
  anyEntryAct,
  childEntries,
  classifyDisposition,
  consumableProductCode,
  entryAct,
  hasTemplateRoot,
  idsOf,
  readNegation,
  reconcileCode,
  relatedEntryActs,
  resolveNarrative,
  sectionKeyOf,
  statusCodeOf,
  type EventDisposition,
} from "./shared.js";
import { readObservationValue, type ObservationValue } from "./observation.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Which planned-entry template a {@link PlannedItem} came from. Preserved so a
 * consumer can tell a planned medication apart from a planned procedure without
 * re-reading the DOM.
 *
 * @example
 * ```ts
 * import type { PlannedItemKind } from "@cosyte/ccda";
 * const k: PlannedItemKind = "procedure";
 * ```
 */
export type PlannedItemKind =
  | "act"
  | "encounter"
  | "procedure"
  | "medicationActivity"
  | "supply"
  | "observation"
  | "immunizationActivity";

/**
 * A single planned item from the Plan of Treatment. `kind` is the template
 * variant; `disposition` is the performed-vs-planned reading of `moodCode`
 * (normally `"planned"`, never guessed); `value` carries the expected result for
 * the observation variant. `negated` and `nullFlavor` are kept distinct, never
 * collapsed.
 *
 * `code` is the planned act's own `<code>` for five of the seven variants. For
 * the two `substanceAdministration` variants, `medicationActivity` and
 * `immunizationActivity`, it is the **product** (the drug, or the vaccine), read
 * from `consumable/manufacturedProduct`, and never the
 * `substanceAdministration`'s own `<code>`: that element is an
 * `ActSubstanceAdministrationCode` (the kind of administration act), not the
 * substance. That `[0..1]` cardinality and that binding are **base CDA R2's
 * `SubstanceAdministration` class**, not a C-CDA constraint: R2.1 constrains
 * `code` on neither template, which is precisely why an act `<code>` is legal on
 * both. An act `<code>` present on either variant is not read into this field;
 * it round-trips through `doc.toString()`.
 *
 * **Absence has three shapes there and only two of them are `undefined`, so do
 * not test this field for truthiness and stop.** It is `undefined` when no arm
 * carries a `<code>` at all (beside `MISSING_PRODUCT_CODE`) and when the arms
 * name different drugs (beside `MEDICATION_PRODUCT_ARM_CONFLICT`). But an arm
 * whose `<code>` asserts neither a symbol nor a `nullFlavor` yields a **truthy
 * but empty `CD`**, and a `nullFlavor`-only one yields a `CD` carrying just that
 * marking. Neither is `MISSING_PRODUCT_CODE`, an arm did carry a `<code>`. Read
 * `code?.code`, not `code`.
 *
 * On the two `substanceAdministration` variants that empty shape is **no longer
 * silent**: the field is slot-checked exactly as its performed twin's product
 * is, so it draws `MISSING_CODE_VALUE`. `medicationActivity` is checked at the
 * `medication` binding (RxNorm/NDC, as a performed Medication Activity's `drug`
 * is) and `immunizationActivity` at the `vaccine` binding (**CVX only**, as an
 * Immunization Activity's `vaccine` is), so a product code carrying no
 * `@codeSystem` or one outside its binding draws `MISSING_CODE_SYSTEM` or
 * `UNEXPECTED_CODE_SYSTEM`. The two bindings differ: **NDC is expected on a drug
 * and unexpected on a vaccine**, so an NDC-coded planned vaccine draws
 * `UNEXPECTED_CODE_SYSTEM` where an NDC-coded planned drug does not, matching
 * each variant's performed twin rather than each other. A `nullFlavor`-only `CD`
 * is a complete statement and stays silent, as it does everywhere else. The
 * other five variants are **not** slot-checked: their `code` is the planned act,
 * which is not one of the five bound `CodeSlot`s.
 *
 * @example
 * ```ts
 * import type { PlannedItem } from "@cosyte/ccda";
 * function isPlanned(p: PlannedItem): boolean {
 *   return p.disposition === "planned";
 * }
 * ```
 */
export interface PlannedItem {
  readonly ids: readonly II[];
  readonly kind: PlannedItemKind;
  readonly moodCode?: string;
  readonly disposition?: EventDisposition;
  readonly negated?: boolean;
  readonly nullFlavor?: string;
  readonly statusCode?: string;
  readonly code?: CD;
  readonly value?: ObservationValue;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * The element name + template root for each planned-entry variant.
 *
 * **Order is load-bearing and the immunization variant is deliberately last.**
 * {@link extractPlannedItems} takes the first root an entry's act matches and
 * stops, so this array ranks the templates for an act that declares more than
 * one of them. Both `substanceAdministration` variants read the same
 * `consumable/manufacturedProduct`, so an act carrying **both** `…22.4.42` and
 * `…22.4.120` yields the same `code` either way; what the ranking decides is the
 * reported `kind` and, with it, which binding the slot check uses (RxNorm/NDC
 * against CVX). Appending rather than inserting keeps that act reading exactly
 * as it read before `…22.4.120` was recognized at all, which is the difference
 * between a measured no-op and a row that could go from warned to silent (a
 * CVX-coded act read as a planned medication draws `UNEXPECTED_CODE_SYSTEM`;
 * read as a planned immunization it draws nothing). Nothing in a document that
 * stacks the two templates ranks them, so the tie is broken by not moving.
 * A matrix row pins it. @internal
 */
const PLANNED_VARIANTS: ReadonlyArray<{
  readonly element: string;
  readonly root: string;
  readonly kind: PlannedItemKind;
}> = [
  { element: "act", root: PLANNED_ACT, kind: "act" },
  { element: "encounter", root: PLANNED_ENCOUNTER, kind: "encounter" },
  { element: "procedure", root: PLANNED_PROCEDURE, kind: "procedure" },
  {
    element: "substanceAdministration",
    root: PLANNED_MEDICATION_ACTIVITY,
    kind: "medicationActivity",
  },
  { element: "supply", root: PLANNED_SUPPLY, kind: "supply" },
  { element: "observation", root: PLANNED_OBSERVATION, kind: "observation" },
  {
    element: "substanceAdministration",
    root: PLANNED_IMMUNIZATION_ACTIVITY,
    kind: "immunizationActivity",
  },
];

/**
 * The three templates the Plan of Treatment Section and the Planned Intervention
 * Act admit alongside the seven planned kinds, which this module recognizes and
 * does **not** return as a {@link PlannedItem}. Each one is reported
 * (`PLAN_ENTRY_NOT_MODELED`) where planned items are read, rather than excluded
 * in silence.
 *
 * **Recognizing a template for a warning is not modelling it, and this list must
 * not be read as a step toward returning them.** Nothing here reaches the model:
 * no `PlannedItemKind` was added, `PLANNED_VARIANTS` is untouched, and every one
 * of these acts still survives only in the re-serialized document. The reason
 * they are not planned items is unchanged too, and it is a reading of what they
 * *are* rather than a gap: an instruction is something to be told, a handoff
 * names who took over care, a nutrition recommendation is dietary advice. None
 * answers "what is this patient scheduled to have done", which is the question
 * {@link extractPlannedItems} answers.
 *
 * **Goal Observation (`…22.4.121`) is deliberately absent.** It is the fourth
 * template the section admits and does not return, but it is `moodCode="GOL"`,
 * which {@link classifyDisposition} calls neither performed nor planned, and the
 * decision taken on it was to *model* it (with its own IG grounding and its own
 * conformance surface) rather than to report it. A warning here would pre-empt
 * that work with a weaker answer. @internal
 */
const UNMODELED_PLAN_ENTRY_ROOTS: ReadonlyMap<string, UnmodeledPlanEntry> = new Map([
  [INSTRUCTION, "instruction"],
  [HANDOFF_COMMUNICATION_PARTICIPANTS, "handoffCommunication"],
  [NUTRITION_RECOMMENDATION, "nutritionRecommendation"],
]);

/**
 * The catalog keys of the sections whose *direct* entries draw
 * `PLAN_ENTRY_NOT_MODELED`.
 *
 * **Two, and the second is traced rather than assumed.** The C-CDA R2.1
 * Interventions Section (V3) admits a Handoff Communication Participants act as a
 * direct `<entry>` in as many words: "MAY contain zero or more [0..\*] entry
 * (CONF:1198-32402) such that it SHALL contain exactly one [1..1] Handoff
 * Communication Participants (identifier: 2.16.840.1.113883.10.20.22.4.141)
 * (CONF:1198-32403)". So the one position this package silently dropped that the
 * IG explicitly admits is now reported.
 *
 * **The internal reason is the stronger one.** This module already reports all
 * three templates nested in a Planned Intervention Act *with no section
 * condition*, and the Planned Intervention Act's conformant home is the
 * Interventions Section. Before this, moving a Handoff one level up, out of the
 * container and into a direct entry of the same section, took it from reported to
 * silent. A report that a document's own nesting depth turns off is not a bound,
 * it is an accident.
 *
 * **Instruction and Nutrition Recommendation are in scope here too, and that is a
 * choice with a stated reason rather than an extension of the citation.** The
 * Interventions Section's contained-template set is exactly three: Intervention
 * Act (`…22.4.131`), Handoff (`…22.4.141`), Planned Intervention Act
 * (`…22.4.146`). An Instruction or a Nutrition Recommendation as a *direct* entry
 * there is therefore not admitted, but it is still recognized here and still
 * dropped, so reporting it says something true about this package that silence
 * does not. The warning has always been about a **modelling gap, not
 * conformance**, and splitting the scope per template would encode a containment
 * catalog, which is the untraced move this area has already retracted once.
 *
 * **What this still does NOT cover, measured rather than implied.** Handoff's own
 * contained-by set is four: Plan of Treatment Section, Planned Intervention Act,
 * Intervention Act, Interventions Section. The first, second and fourth report;
 * the **third does not**, because an Intervention Act (`…22.4.131`) is not a
 * container this package descends into at all. That is unchanged by this widening
 * and pinned by test. @internal
 */
const PLAN_ENTRY_REPORT_SECTION_KEYS: ReadonlySet<string> = new Set([
  "planOfTreatment",
  "interventions",
]);

/**
 * Report an act that carries one of {@link UNMODELED_PLAN_ENTRY_ROOTS}, once per
 * matching root. Returns nothing and changes nothing: the act is not extracted,
 * not counted, and not returned, before or after.
 *
 * Every root the act declares is checked rather than the first, because an act
 * stacking two of these three states both, and picking one would be a ranking no
 * document supplies. @internal
 */
function reportUnmodeledPlanEntry(act: Element, ctx: ParseCtx): void {
  for (const [root, entry] of UNMODELED_PLAN_ENTRY_ROOTS) {
    if (hasTemplateRoot(act, root)) ctx.emit(planEntryNotModeled(entry, positionOf(act)));
  }
}

/**
 * The planned variants whose `code` is the **product in the `consumable`**, not
 * the act's own `<code>`. Both are `substanceAdministration`s; C-CDA puts the
 * substance in `consumable/manufacturedProduct` for each, and the act's own
 * `<code>` is base CDA R2's `ActSubstanceAdministrationCode` on both (R2.1
 * constrains `code` on neither template). @internal
 */
const CONSUMABLE_KINDS: ReadonlySet<PlannedItemKind> = new Set<PlannedItemKind>([
  "medicationActivity",
  "immunizationActivity",
]);

/**
 * The `CodeSlot` each planned variant's `code` is checked against, for the two
 * variants that have one. Every other kind is absent here and unchecked; see
 * {@link checkPlannedCodeSlot} for why that is a choice rather than a
 * necessity. @internal
 */
const PLANNED_CODE_SLOTS: ReadonlyMap<PlannedItemKind, "medication" | "vaccine"> = new Map([
  ["medicationActivity", "medication"],
  ["immunizationActivity", "vaccine"],
]);

/**
 * Extract every planned item from a `<section>` element: each `<entry>` whose act
 * carries one of the seven templates in {@link PLANNED_VARIANTS}, **and** each of
 * the seven nested inside a Planned Intervention Act
 * ({@link PLANNED_INTERVENTION_ACT}, `…22.4.146`). Never throws.
 *
 * **The container is named rather than inferred, and it is the only one.** R2.1
 * gives the Planned Intervention Act an `entryRelationship` for
 * every one of the seven, each holding the planned act **inline**, so before this
 * a planned entry sitting there was returned as nothing with nothing said, for
 * all seven kinds. A Planned Intervention Act nested in a Planned Intervention
 * Act is descended into too, because the walk is the same walk; the DOM is a
 * tree, so it terminates.
 *
 * **It is the only container descended into, and R2.1 has others, so this does
 * NOT solve nesting in general.** A Nutrition Recommendation (`…22.4.130`)
 * inline-holds six of the seven by the identical `entryRelationship` pattern
 * (every planned template except `…22.4.120`), and an Intervention Act
 * (`…22.4.131`, the performed sibling and the `SHOULD` entry of an Interventions
 * Section) inline-holds a Planned Intervention Act. A planned entry in either is
 * still returned as nothing with nothing said. That is left as it was found: the
 * scope taken here is the one container, and widening it is a decision with its
 * own base-measured matrix, not a tidy-up. A test pins both as unreached so the
 * bound is measured rather than asserted.
 *
 * **An `entryRelationship` is read for what it CONTAINS, never followed for what
 * it REFERENCES.** The template's `[1..*]` `typeCode="RSON"` relationship holds an
 * Entry Reference (`…22.4.122`) whose own SHALL points at a Goal Observation.
 * That act carries no planned template root, so it is walked past rather than
 * resolved: its target lives elsewhere in the document and is reached on its own
 * terms, and resolving a pointer here would return an item the container does not
 * hold.
 *
 * **Which acts a Planned Intervention Act holds and this still does not return:**
 * the performed ones (`MedicationActivity`, `ImmunizationActivity`,
 * `ProcedureActivityProcedure`, `EncounterActivity`, and the rest, none of which
 * is planned and none of which carries a planned root), and the same three
 * non-item templates the section itself admits (Instruction `…22.4.20`, Handoff
 * Communication Participants `…22.4.141`, Nutrition Recommendation `…22.4.130`).
 * **Those three are now REPORTED at both levels** (`PLAN_ENTRY_NOT_MODELED`),
 * still not returned. The performed acts are not, and must not be: they are
 * modelled elsewhere and reached by their own extractors, so a "not modelled"
 * report on one would be false.
 *
 * **The two levels are scoped differently, and the scope is a BOUND this package
 * chose, not a catalog of which sections C-CDA admits these templates in.** A
 * direct `<entry>` is reported in the **two** sections named on
 * {@link PLAN_ENTRY_REPORT_SECTION_KEYS}: `planOfTreatment`, the section this
 * accessor is named for, and `interventions`, the Interventions Section (V3),
 * which admits a Handoff as a direct entry in as many words (CONF:1198-32402 /
 * 1198-32403, quoted on that constant) and is where R2.1 puts the container the
 * nested half already reads. Inside a Planned Intervention Act there is no
 * section condition at all, because the container is what the report is relative
 * to there and it is read wherever it sits.
 *
 * An Instruction sitting in the **Instructions Section** (`…22.2.45`) is
 * deliberately still silent: it is that section's own required entry, and
 * reporting a conformant document's required entry as "not modelled" would be
 * noise rather than a finding.
 *
 * **The residual, stated rather than implied: these three templates appear in
 * more places than the report covers, and an occurrence outside them is still
 * dropped in silence.** Two are measured and pinned by test. A Handoff nested in
 * an **Intervention Act** (`…22.4.131`) is silent, because that act is not a
 * container this package descends into. Any of the three as a direct entry of a
 * section this catalog does not recognize at all is silent, because there is no
 * key to match. Widening further is its own decision with its own base-measured
 * matrix, not a tidy-up.
 *
 * **A returned item does not say whether it was a direct `<entry>` or nested.**
 * The Planned Intervention Act is not modelled: this package carries no container
 * type, no goal linkage, and no `nested` flag, so the grouping toward a goal is
 * available only from `doc.toString()`. What `getPlannedItems()` answers is which
 * acts are planned for this patient, and a nested one is planned on exactly the
 * same terms as a direct one. Each item keeps its own `ids`, so a caller that
 * needs the grouping can correlate.
 *
 * @example
 * ```ts
 * import { extractPlannedItems } from "@cosyte/ccda";
 * const planned = extractPlannedItems(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractPlannedItems(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly PlannedItem[] {
  const out: PlannedItem[] = [];
  // Resolved once per section, not per entry: the direct-entry report below is
  // scoped to the Plan of Treatment and Interventions sections (a bound, stated
  // on the constant), and recognition walks the section's templateIds and <code>.
  const sectionKey = sectionKeyOf(sectionEl);
  const inReportingSection =
    sectionKey !== undefined && PLAN_ENTRY_REPORT_SECTION_KEYS.has(sectionKey);
  for (const entry of childEntries(sectionEl)) {
    for (const variant of PLANNED_VARIANTS) {
      const el = entryAct(entry, variant.root);
      if (el === undefined) continue;
      out.push(buildPlannedItem(el, variant.kind, narrativeById, ctx));
      break;
    }
    // Checked independently of the loop above rather than as an eighth variant
    // in it, so an act that somehow stacks a planned root AND `…22.4.146` yields
    // its own item *and* the ones it contains. Ranking them against each other
    // would drop one or the other over a shape no document ranks, and this
    // accessor's whole defect was dropping things. `anyEntryAct` rather than an
    // eighth `entryAct` call: an `<entry>` carries one act, so one scan answers
    // it, and this extractor runs on every `<section>` of every document.
    const act = anyEntryAct(entry);
    if (act === undefined) continue;
    // The admitted-but-unmodelled three, reported rather than excluded in
    // silence, and scoped as a direct entry to the two sections named on
    // `PLAN_ENTRY_REPORT_SECTION_KEYS`. Independent of both the variant loop
    // above and the container walk below: an act stacking a planned root and one
    // of these states both, and reporting must never change which acts are
    // extracted.
    if (inReportingSection) reportUnmodeledPlanEntry(act, ctx);
    if (hasTemplateRoot(act, PLANNED_INTERVENTION_ACT)) {
      collectNested(act, narrativeById, ctx, out);
    }
  }
  return out;
}

/**
 * Append every planned item a Planned Intervention Act holds inline, descending
 * through a nested Planned Intervention Act by the same rule.
 *
 * Matching is on the nested act's **`templateId` root alone**, exactly as
 * {@link extractPlannedItems} matches a direct entry act, and that is what keeps
 * the performed acts the same container admits out of the result: a Medication
 * Activity (`…22.4.16`) and a Planned Medication Activity (`…22.4.42`) are both
 * `substanceAdministration`s, so an element-name or `@moodCode` test would either
 * admit the performed one or start guessing at a mood the template already
 * settles. `@moodCode` is still read onto every item's `disposition`, so a
 * planned template carrying a performed mood is reported as what it says rather
 * than as what its template promised. @internal
 */
function collectNested(
  container: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
  out: PlannedItem[],
): void {
  for (const nested of relatedEntryActs(container)) {
    const variant = PLANNED_VARIANTS.find((v) => hasTemplateRoot(nested, v.root));
    if (variant !== undefined) out.push(buildPlannedItem(nested, variant.kind, narrativeById, ctx));
    // Reported here with **no section-key condition**, unlike the direct-entry
    // half. The report is relative to the container at this level, and the
    // container is read wherever it sits (this package already reaches it in the
    // Interventions Section, `…21.2.3`, which is where R2.1 puts it and not the
    // Plan of Treatment), so gating on the section key would have made this half
    // silent on exactly the documents that place it conformantly. The
    // direct-entry half is scoped to the section this accessor is named for; see
    // the docblock above for what that scope does NOT cover.
    reportUnmodeledPlanEntry(nested, ctx);
    if (hasTemplateRoot(nested, PLANNED_INTERVENTION_ACT)) {
      collectNested(nested, narrativeById, ctx, out);
    }
  }
}

/** Build one planned item from its act element. @internal */
function buildPlannedItem(
  el: Element,
  kind: PlannedItemKind,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): PlannedItem {
  const ids = idsOf(el, ctx);
  const moodCode = attr(el, "moodCode");
  const disposition = classifyDisposition(moodCode);
  const { negated, nullFlavor } = readNegation(el, ctx);
  const statusCode = statusCodeOf(el);

  const codeEl = plannedCodeElement(el, kind, ctx);
  const code = parseCd(codeEl, ctx);
  const codePos = positionOf(codeEl ?? el);
  checkPlannedCodeSlot(code, kind, codePos, ctx);
  const value = kind === "observation" ? readObservationValue(child(el, "value"), ctx) : undefined;
  const effectiveTime = parseIvlTs(child(el, "effectiveTime"), ctx);
  const narrative = resolveNarrative(el, narrativeById, ctx);
  reconcileCode(code, narrative, "plannedItem", codePos, ctx);

  const out: {
    ids: readonly II[];
    kind: PlannedItemKind;
    moodCode?: string;
    disposition?: EventDisposition;
    negated?: boolean;
    nullFlavor?: string;
    statusCode?: string;
    code?: CD;
    value?: ObservationValue;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids, kind };
  if (moodCode !== undefined) out.moodCode = moodCode;
  if (disposition !== undefined) out.disposition = disposition;
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (statusCode !== undefined) out.statusCode = statusCode;
  if (code !== undefined) out.code = code;
  if (value !== undefined) out.value = value;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}

/**
 * Slot-check a planned item's `code` against the terminologies C-CDA expects
 * there. Two of the seven variants are wired: `medicationActivity` to the
 * `medication` slot, `immunizationActivity` to the `vaccine` slot.
 *
 * **Why those two and no others.** A planned item's `code` is the planned act
 * itself for the other five variants: a LOINC observation, a SNOMED act, a CPT
 * encounter, a SNOMED or ICD-10-PCS procedure, a SNOMED supply. None of those is
 * one of the five bound `CodeSlot`s. The two `substanceAdministration` variants
 * are the exception because their `code` is not an act at all: it is the product
 * from `consumable/manufacturedProduct` (see {@link plannedCodeElement}), the
 * same coded value in the same terminology at the same slot as its performed
 * twin's `drug` / `vaccine`, so it gets the same check. **The two bindings are
 * not the same binding**: `medication` expects RxNorm **or** NDC, `vaccine`
 * expects CVX alone, so an NDC-coded planned vaccine draws
 * `UNEXPECTED_CODE_SYSTEM` and an NDC-coded planned drug does not. Each variant
 * matches its own performed twin, which is the bar; matching each other would
 * mean inventing a binding for one of them.
 *
 * **Leaving the other five unchecked is a CHOICE, not a necessity, and the
 * earlier wording overstated it.** It used to say binding them "would mean
 * inventing a value set this repo cannot cite without the normative R2.1
 * artifacts". That is true of the *system* checks only. `checkCodeSlot` fires
 * `MISSING_CODE_VALUE` and `MISSING_CODE_SYSTEM` **before** it reads
 * `SLOT_BINDINGS[slot]` at all: the first asks whether the element names any
 * symbol or declares a `nullFlavor`, the second whether an asserted symbol names
 * any system. Neither consults a binding, so both could be raised on a planned
 * act's `<code>` today without citing a value set. Only
 * `UNEXPECTED_CODE_SYSTEM`, `DEPRECATED_CODE_SYSTEM` and the adapter tier need
 * one. So the honest statement is that this package **has chosen** not to report
 * an empty or system-less `<code>` on the five act-coded planned kinds, not that
 * it cannot. **Do not quietly widen it either way**: raising those two on five
 * more kinds changes what conformant documents report and needs its own argued
 * decision and its own base-measured matrix, exactly as wiring this variant did.
 *
 * **What this makes reachable, stated exactly rather than roundly.** Four codes,
 * not five: `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM`
 * and (with a caller-supplied `TerminologyAdapter`) `SEMANTIC_CODE_INVALID`.
 * `DEPRECATED_CODE_SYSTEM` is **not** among them: neither the `medication` nor
 * the `vaccine` binding declares any deprecated system, so that code cannot fire
 * at either slot on a *performed* medication or immunization either, and parity
 * is the whole claim here. An ICD-9 OID on a drug or a vaccine draws
 * `UNEXPECTED_CODE_SYSTEM` in both places.
 *
 * **The gap it closes.** `MEDICATION_PRODUCT_ARM_UNEXPECTED` and
 * `MEDICATION_PRODUCT_ARM_REPEATED` are deliberately tolerable, and that rests
 * on an argument: every state in which they fire without a `<code>` having been
 * selected and read normally carries an unquietable companion, and on the shape
 * where an arm's `<code>` asserts neither a symbol nor a `nullFlavor` that named
 * companion is `MISSING_CODE_VALUE`. It could not fire here, so the argument was
 * false at this call site and only at this call site: a planned medication whose
 * only arm was `<manufacturedLabeledDrug><code/></manufacturedLabeledDrug>` had
 * **no drug identity at all** and carried a single profile-quietable warning,
 * which the documented filter-the-expected-noise pattern reduces to silence. On
 * the Plan of Treatment, which says what a patient is about to be given.
 *
 * **This function is monotone by construction; recognizing a new template is
 * not, and a change must not do both at once.**
 * `checkCodeSlot` only ever emits: it selects nothing, withholds nothing, and
 * does not touch the returned `CD`, so nothing routed through here can go from
 * warned to silent. Recognizing a **new template** is a different kind of
 * change, because it moves what is extracted, so it can move rows in both
 * directions and the ordering rule on {@link PLANNED_VARIANTS} exists to bound
 * that. Both are measured against base by the matrices in
 * `test/entries.test.ts` rather than argued. @internal
 */
function checkPlannedCodeSlot(
  code: CD | undefined,
  kind: PlannedItemKind,
  position: { readonly path?: string; readonly line?: number; readonly column?: number },
  ctx: ParseCtx,
): void {
  const slot = PLANNED_CODE_SLOTS.get(kind);
  if (slot === undefined) return;
  checkCodeSlot(code, slot, position, ctx);
}

/**
 * The code element for a planned item: the direct `<code>` for five of the seven
 * variants, and the `consumable/manufacturedProduct` product code for the two
 * `substanceAdministration` variants, a Planned Medication Activity (drug) and a
 * Planned Immunization Activity (vaccine), each of whose product lives in the
 * consumable, on either arm of the CDA R2 `ManufacturedProduct` choice.
 *
 * **Neither one's product is ever the act's own `<code>`, so the consumable is
 * read whether or not one is present.** In CDA R2
 * `SubstanceAdministration.code` is an `ActSubstanceAdministrationCode`, the
 * *kind of administration act* ("drug therapy", "immunization"); the substance
 * itself participates through `consumable/manufacturedProduct`. Nothing about
 * the planned mood changes that, so an act `<code>` is not a weaker drug code
 * to fall back on, it is a different fact about a different thing.
 *
 * This used to return the direct `<code>` first and only fall through to the
 * consumable when there was none, which made a planned medication carrying an
 * act `<code>` (CDA R2 gives `SubstanceAdministration.code` `[0..1]`, and the C-CDA
 * templates are open, so it is legal; how often vendors write one is not a claim
 * this repo can cite) read its *act type* into the drug slot
 * and never call {@link consumableProductCode} at all. Everything that function
 * says was therefore unreachable at this call site:
 * `MEDICATION_PRODUCT_ARM_CONFLICT` above all, so two `manufacturedProduct`
 * arms naming two **different drugs** went completely unmentioned on the Plan
 * of Treatment, which is the section describing what a patient is about to be
 * given; and with it `MISSING_PRODUCT_CODE`, `MEDICATION_PRODUCT_ARM_UNEXPECTED`,
 * `MEDICATION_PRODUCT_ARM_REPEATED`, `MEDICATION_PRODUCT_CODE_REPEATED` and
 * `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`. `CODE_NARRATIVE_MISMATCH` was
 * reachable but blind to its subject: it reconciled the act code's label
 * against a narrative that describes the drug, so it could not see a structured
 * drug contradicting the narrative drug, and fired on well-formed documents
 * instead.
 *
 * The model was incoherent in the same way. `code` was the drug on a planned
 * medication with no act `<code>` and the act type on one with it, so a
 * consumer reading `code` off a `medicationActivity` could not rely on it being
 * either. It is now always the drug there, exactly as `drug` is on a performed
 * Medication Activity and `vaccine` is on an Immunization Activity, the other
 * two `consumable` call sites, both of which have always ignored the act's own
 * `<code>`. The builder already assumed this reading: it emits the drug in the
 * `consumable` and **no** direct `<code>` for this variant, which is precisely
 * why no round-trip test could ever exercise the defect.
 *
 * What is given up is stated rather than hidden: the act `<code>`'s coding is
 * not on the model for either consumable-bearing variant, as it is not for the
 * other two call sites. It survives verbatim, `serializeCcda` re-emits the
 * parsed DOM, so `doc.toString()` still carries it. Promoting it into the
 * product slot is the manufactured reading this area refuses everywhere else.
 * The other five planned kinds are untouched: their `<code>` *is* the planned
 * act, and they have no consumable to read.
 *
 * **The Planned Immunization Activity joined this path rather than getting one
 * of its own, because it has the identical shape**: a `substanceAdministration`
 * in a planned mood, base CDA R2's `code` `[0..1]` `ActSubstanceAdministrationCode`
 * (R2.1 constrains `code` on neither template), and C-CDA's
 * `consumable/manufacturedProduct`
 * `[1..1]` carrying Immunization Medication Information (`…22.4.54`), whose
 * `manufacturedMaterial/code` is the CVX. So every product warning
 * {@link consumableProductCode} raises
 * reaches a planned vaccination too; until this template was matched at all,
 * none of them reached one. @internal
 */
function plannedCodeElement(
  el: Element,
  kind: PlannedItemKind,
  ctx: ParseCtx,
): Element | undefined {
  // The five act-coded kinds: the direct <code> is the planned act itself, and
  // an absence there is not a lost product, so nothing is flagged.
  if (!CONSUMABLE_KINDS.has(kind)) return child(el, "code");
  const { el: productEl, conflicted } = consumableProductCode(el, ctx);
  // A planned medication or vaccination with no product code on any arm has no
  // product at all, which is flagged for the same reason it is on a performed
  // Medication or Immunization Activity: a planned dose of nothing is not a
  // lesser gap. The one exception is a product withheld because the arms named
  // different products, which already drew the stronger
  // `MEDICATION_PRODUCT_ARM_CONFLICT`; "no arm yielded a code" would be false
  // there, so the backstop stands down.
  if (productEl === undefined && conflicted !== true) ctx.emit(missingProductCode(positionOf(el)));
  return productEl;
}
