/**
 * Plan of Treatment extraction — the six planned-entry templates a Plan of
 * Treatment section (`…22.2.10`) can carry: Planned Act (`…22.4.39`), Planned
 * Encounter (`…22.4.40`), Planned Procedure (`…22.4.41`), Planned Medication
 * Activity (`…22.4.42`), Planned Supply (`…22.4.43`), and Planned Observation
 * (`…22.4.44`). They share a shape — a `code`, `statusCode`, `effectiveTime` —
 * and differ only in element name + template.
 *
 * **Everything here is future/ordered, never performed.** Each item's
 * `@moodCode` is read into the same performed-vs-planned {@link EventDisposition}
 * the Procedures extractor uses (a planned mood → `"planned"`); the two are
 * **never conflated**. A missing or unrecognized mood leaves the disposition
 * `undefined` (never guessed) — the raw `moodCode` is always preserved so a
 * consumer can see what the document actually asserted.
 */

import { attr, child, positionOf } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  PLANNED_ACT,
  PLANNED_ENCOUNTER,
  PLANNED_MEDICATION_ACTIVITY,
  PLANNED_OBSERVATION,
  PLANNED_PROCEDURE,
  PLANNED_SUPPLY,
  chain,
  childEntries,
  classifyDisposition,
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
 * variant; `code` is the planned act/observation/drug code; `disposition` is the
 * performed-vs-planned reading of `moodCode` (normally `"planned"`, never
 * guessed); `value` carries the expected result for the observation variant.
 * `negated` and `nullFlavor` are kept distinct, never collapsed.
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

  const codeEl = plannedCodeElement(el, kind);
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
 * The code element for a planned item — the direct `<code>` for most variants,
 * or the `consumable/manufacturedProduct/manufacturedMaterial/code` for a
 * Planned Medication Activity (whose drug lives in the consumable). @internal
 */
function plannedCodeElement(el: Element, kind: PlannedItemKind): Element | undefined {
  const direct = child(el, "code");
  if (direct !== undefined) return direct;
  if (kind === "medicationActivity") {
    return chain(el, "consumable", "manufacturedProduct", "manufacturedMaterial", "code");
  }
  return undefined;
}
