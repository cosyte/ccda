/**
 * Encounters extraction — the Encounter Activity (`…22.4.49`) `<encounter>`.
 * Each encounter is one visit/admission: its type `code` (CPT / SNOMED CT / HL7
 * ActEncounterCode), `statusCode`, and the visit period `effectiveTime`
 * (`IVL_TS`). Scope here is the encounter envelope; nested Encounter Diagnosis
 * acts are left for a later phase (their problems already surface through the
 * Problems section).
 */

import { attr, child, positionOf } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  ENCOUNTER_ACTIVITY,
  childEntries,
  entryAct,
  idsOf,
  reconcileCode,
  resolveNarrative,
  statusCodeOf,
} from "./shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * A single Encounter Activity. `code` is the encounter type; `statusCode` is the
 * encounter status; `effectiveTime` is the visit/admission period; `narrative`
 * is the resolved `<text>` reference.
 *
 * @example
 * ```ts
 * import type { Encounter } from "@cosyte/ccda";
 * function encounterType(e: Encounter): string | undefined {
 *   return e.code?.code;
 * }
 * ```
 */
export interface Encounter {
  readonly ids: readonly II[];
  readonly moodCode?: string;
  readonly statusCode?: string;
  readonly code?: CD;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * Extract every Encounter Activity from an Encounters `<section>` element. Each
 * `<entry>` whose `encounter` carries the Encounter Activity template becomes an
 * {@link Encounter}. Never throws.
 *
 * @example
 * ```ts
 * import { extractEncounters } from "@cosyte/ccda";
 * const encounters = extractEncounters(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractEncounters(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly Encounter[] {
  const out: Encounter[] = [];
  for (const entry of childEntries(sectionEl)) {
    const enc = entryAct(entry, ENCOUNTER_ACTIVITY);
    if (enc === undefined) continue;
    out.push(buildEncounter(enc, narrativeById, ctx));
  }
  return out;
}

/** Build one Encounter Activity. @internal */
function buildEncounter(
  enc: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): Encounter {
  const ids = idsOf(enc, ctx);
  const moodCode = attr(enc, "moodCode");
  const statusCode = statusCodeOf(enc);
  const codeEl = child(enc, "code");
  const code = parseCd(codeEl, ctx);
  const effectiveTime = parseIvlTs(child(enc, "effectiveTime"), ctx);
  const narrative = resolveNarrative(enc, narrativeById, ctx);
  reconcileCode(code, narrative, "encounter", positionOf(codeEl ?? enc), ctx);

  const out: {
    ids: readonly II[];
    moodCode?: string;
    statusCode?: string;
    code?: CD;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids };
  if (moodCode !== undefined) out.moodCode = moodCode;
  if (statusCode !== undefined) out.statusCode = statusCode;
  if (code !== undefined) out.code = code;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}
