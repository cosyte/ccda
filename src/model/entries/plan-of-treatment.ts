/**
 * Plan of Treatment extraction, the six planned-entry templates a Plan of
 * Treatment section (`…22.2.10`) can carry: Planned Act (`…22.4.39`), Planned
 * Encounter (`…22.4.40`), Planned Procedure (`…22.4.41`), Planned Medication
 * Activity (`…22.4.42`), Planned Supply (`…22.4.43`), and Planned Observation
 * (`…22.4.44`). They share a shape, a `code`, `statusCode`, `effectiveTime`,
 * and differ only in element name + template.
 *
 * **Everything here is future/ordered, never performed.** Each item's
 * `@moodCode` is read into the same performed-vs-planned {@link EventDisposition}
 * the Procedures extractor uses (a planned mood → `"planned"`); the two are
 * **never conflated**. A missing or unrecognized mood leaves the disposition
 * `undefined` (never guessed), the raw `moodCode` is always preserved so a
 * consumer can see what the document actually asserted.
 */

import { attr, child, positionOf } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import { missingProductCode } from "../../parser/warnings.js";
import {
  PLANNED_ACT,
  PLANNED_ENCOUNTER,
  PLANNED_MEDICATION_ACTIVITY,
  PLANNED_OBSERVATION,
  PLANNED_PROCEDURE,
  PLANNED_SUPPLY,
  childEntries,
  classifyDisposition,
  consumableProductCode,
  entryAct,
  idsOf,
  readNegation,
  reconcileCode,
  resolveNarrative,
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
  | "observation";

/**
 * A single planned item from the Plan of Treatment. `kind` is the template
 * variant; `disposition` is the performed-vs-planned reading of `moodCode`
 * (normally `"planned"`, never guessed); `value` carries the expected result for
 * the observation variant. `negated` and `nullFlavor` are kept distinct, never
 * collapsed.
 *
 * `code` is the planned act's own `<code>` for five of the six variants. For a
 * `medicationActivity` it is the **drug**, read from
 * `consumable/manufacturedProduct`, and never the `substanceAdministration`'s
 * own `<code>`: that element is an `ActSubstanceAdministrationCode` (the kind of
 * administration act), not the substance. An act `<code>` present on that
 * variant is not read into this field; it round-trips through `doc.toString()`.
 *
 * **Absence has three shapes there and only two of them are `undefined`, so do
 * not test this field for truthiness and stop.** It is `undefined` when no arm
 * carries a `<code>` at all (beside `MISSING_PRODUCT_CODE`) and when the arms
 * name different drugs (beside `MEDICATION_PRODUCT_ARM_CONFLICT`). But an arm
 * whose `<code>` asserts neither a symbol nor a `nullFlavor` yields a **truthy
 * but empty `CD`**, and a `nullFlavor`-only one yields a `CD` carrying just that
 * marking. Neither is `MISSING_PRODUCT_CODE` (an arm did carry a `<code>`), and
 * unlike a performed Medication Activity's `drug` this field is **not** one of
 * the five wired `CodeSlot`s, so `MISSING_CODE_VALUE` cannot fire on it either
 * and the empty shape is silent. Read `code?.code`, not `code`.
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

/** The element name + template root for each planned-entry variant. @internal */
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
];

/**
 * Extract every planned item from a Plan of Treatment `<section>` element. Each
 * `<entry>` whose act carries one of the six planned-entry templates becomes a
 * {@link PlannedItem}. Never throws.
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
  for (const entry of childEntries(sectionEl)) {
    for (const variant of PLANNED_VARIANTS) {
      const el = entryAct(entry, variant.root);
      if (el === undefined) continue;
      out.push(buildPlannedItem(el, variant.kind, narrativeById, ctx));
      break;
    }
  }
  return out;
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
  const value = kind === "observation" ? readObservationValue(child(el, "value"), ctx) : undefined;
  const effectiveTime = parseIvlTs(child(el, "effectiveTime"), ctx);
  const narrative = resolveNarrative(el, narrativeById, ctx);
  reconcileCode(code, narrative, "plannedItem", positionOf(codeEl ?? el), ctx);

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
 * The code element for a planned item: the direct `<code>` for five of the six
 * variants, and the `consumable/manufacturedProduct` product code for a Planned
 * Medication Activity (whose drug lives in the consumable, on either arm of the
 * CDA R2 `ManufacturedProduct` choice).
 *
 * **A Planned Medication Activity's drug is never the act's own `<code>`, so
 * the consumable is read whether or not one is present.** In CDA R2
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
 * not on the model for this variant, as it is not for the other two call sites.
 * It survives verbatim, `serializeCcda` re-emits the parsed DOM, so
 * `doc.toString()` still carries it. Promoting it into the drug slot is the
 * manufactured reading this area refuses everywhere else. The other five
 * planned kinds are untouched: their `<code>` *is* the planned act, and they
 * have no consumable to read. @internal
 */
function plannedCodeElement(
  el: Element,
  kind: PlannedItemKind,
  ctx: ParseCtx,
): Element | undefined {
  // The five non-medication kinds: the direct <code> is the planned act itself,
  // and an absence there is not a lost drug, so nothing is flagged.
  if (kind !== "medicationActivity") return child(el, "code");
  const { el: productEl, conflicted } = consumableProductCode(el, ctx);
  // A planned medication with no product code on any arm has no drug at all,
  // which is flagged for the same reason it is on a performed Medication
  // Activity: a planned dose of nothing is not a lesser gap. The one exception
  // is a product withheld because the arms named different drugs, which already
  // drew the stronger `MEDICATION_PRODUCT_ARM_CONFLICT`; "no arm yielded a
  // code" would be false there, so the backstop stands down.
  if (productEl === undefined && conflicted !== true) ctx.emit(missingProductCode(positionOf(el)));
  return productEl;
}
