/**
 * Family History extraction — the Family History Organizer (`…22.4.45`) → Family
 * History Observation (`…22.4.46`) tree. The organizer names one family member
 * (the `relatedSubject`: relationship, gender, birth time, deceased flag); each
 * member observation is a condition that relative had — coded in `value` — with
 * an optional Age Observation (`…22.4.31`, the relative's age at onset) and an
 * optional Family History Death Observation (`…22.4.47`, marking the condition
 * as the cause of death).
 *
 * The relative's identity is preserved as a structured {@link FamilyMember} (not
 * flattened into each condition) so a consumer can group conditions by relative.
 * The deceased flag lives in the `sdtc:deceasedInd` extension element, which is
 * outside the HL7 v3 namespace — it is read by local name rather than the
 * v3-scoped child lookup.
 */

import { child, childElements, children, positionOf } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import { parsePq, type PQ } from "../types/pq.js";
import { parseTs, type TS } from "../types/ts.js";
import { parseBlAttr } from "../types/bl.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  AGE_OBSERVATION,
  FAMILY_HISTORY_DEATH_OBSERVATION,
  FAMILY_HISTORY_OBSERVATION,
  FAMILY_HISTORY_ORGANIZER,
  childEntries,
  entryAct,
  hasTemplateRoot,
  idsOf,
  reconcileCode,
  readNegation,
  relatedObservations,
  resolveNarrative,
} from "./shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * The family member a {@link FamilyHistory} group describes. `relationship` is
 * the coded relation (e.g. SNOMED/HL7 `FTH` father); `gender` the relative's
 * administrative gender; `birthTime` their birth date; `deceased` the
 * `sdtc:deceasedInd` flag. All optional — a document may name only the relation.
 *
 * @example
 * ```ts
 * import type { FamilyMember } from "@cosyte/ccda";
 * const m: FamilyMember = { relationship: { code: "FTH", displayName: "Father" } };
 * ```
 */
export interface FamilyMember {
  readonly relationship?: CD;
  readonly gender?: CD;
  readonly birthTime?: TS;
  readonly deceased?: boolean;
}

/**
 * A single condition in a relative's history. `condition` is the coded problem
 * (SNOMED CT / ICD-10-CM); `ageAtOnset` is the relative's age (a `PQ` in years)
 * from the nested Age Observation; `causeOfDeath` is `true` when a Family History
 * Death Observation marks this condition as the cause of death. `negated` and
 * `nullFlavor` are kept distinct, never collapsed.
 *
 * @example
 * ```ts
 * import type { FamilyHistoryObservation } from "@cosyte/ccda";
 * function fatal(o: FamilyHistoryObservation): boolean {
 *   return o.causeOfDeath === true;
 * }
 * ```
 */
export interface FamilyHistoryObservation {
  readonly ids: readonly II[];
  readonly condition?: CD;
  readonly negated?: boolean;
  readonly nullFlavor?: string;
  readonly ageAtOnset?: PQ;
  readonly causeOfDeath?: boolean;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * A Family History Organizer: one relative plus the conditions recorded for
 * them. `relative` carries the structured family-member identity; `observations`
 * are that relative's conditions.
 *
 * @example
 * ```ts
 * import type { FamilyHistory } from "@cosyte/ccda";
 * function conditionCount(h: FamilyHistory): number {
 *   return h.observations.length;
 * }
 * ```
 */
export interface FamilyHistory {
  readonly ids: readonly II[];
  readonly relative: FamilyMember;
  readonly observations: readonly FamilyHistoryObservation[];
}

/**
 * Extract every Family History Organizer from a Family History `<section>`
 * element. Each `<entry>` whose `organizer` carries the Family History Organizer
 * template becomes a {@link FamilyHistory}; its `component/observation` members
 * become {@link FamilyHistoryObservation}s. Never throws.
 *
 * @example
 * ```ts
 * import { extractFamilyHistory } from "@cosyte/ccda";
 * const history = extractFamilyHistory(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractFamilyHistory(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly FamilyHistory[] {
  const out: FamilyHistory[] = [];
  for (const entry of childEntries(sectionEl)) {
    const organizer = entryAct(entry, FAMILY_HISTORY_ORGANIZER);
    if (organizer === undefined) continue;
    out.push(buildFamilyHistory(organizer, narrativeById, ctx));
  }
  return out;
}

/** Build one Family History Organizer. @internal */
function buildFamilyHistory(
  organizer: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): FamilyHistory {
  const ids = idsOf(organizer, ctx);
  const relative = readRelative(organizer, ctx);
  const observations: FamilyHistoryObservation[] = [];
  for (const comp of children(organizer, "component")) {
    const obs = child(comp, "observation");
    if (obs === undefined) continue;
    if (hasTemplateRoot(obs, FAMILY_HISTORY_OBSERVATION)) {
      observations.push(buildObservation(obs, narrativeById, ctx));
    }
  }
  return { ids, relative, observations };
}

/** Read the relative's structured identity from the organizer's `subject`. @internal */
function readRelative(organizer: Element, ctx: ParseCtx): FamilyMember {
  const relatedSubject = child(child(organizer, "subject") ?? organizer, "relatedSubject");
  if (relatedSubject === undefined) return {};

  const relationship = parseCd(child(relatedSubject, "code"), ctx);
  const person = child(relatedSubject, "subject");
  const gender =
    person === undefined ? undefined : parseCd(child(person, "administrativeGenderCode"), ctx);
  const birthTime = person === undefined ? undefined : parseTs(child(person, "birthTime"), ctx);
  const deceased = person === undefined ? undefined : readDeceased(person);

  const out: { relationship?: CD; gender?: CD; birthTime?: TS; deceased?: boolean } = {};
  if (relationship !== undefined) out.relationship = relationship;
  if (gender !== undefined) out.gender = gender;
  if (birthTime !== undefined) out.birthTime = birthTime;
  if (deceased !== undefined) out.deceased = deceased;
  return out;
}

/** Read the `sdtc:deceasedInd` flag (outside the v3 namespace) by local name. @internal */
function readDeceased(person: Element): boolean | undefined {
  for (const el of childElements(person)) {
    if (el.localName === "deceasedInd") return parseBlAttr(el, "value");
  }
  return undefined;
}

/** Build one Family History Observation. @internal */
function buildObservation(
  obs: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): FamilyHistoryObservation {
  const ids = idsOf(obs, ctx);
  const valueEl = child(obs, "value");
  const condition = parseCd(valueEl, ctx);
  const { negated, nullFlavor } = readNegation(obs, ctx);
  const effectiveTime = parseIvlTs(child(obs, "effectiveTime"), ctx);
  const ageAtOnset = readAge(obs, ctx);
  const causeOfDeath = relatedObservations(obs, FAMILY_HISTORY_DEATH_OBSERVATION).length > 0;
  const narrative = resolveNarrative(obs, narrativeById, ctx);
  reconcileCode(condition, narrative, "familyHistory", positionOf(valueEl ?? obs), ctx);

  const out: {
    ids: readonly II[];
    condition?: CD;
    negated?: boolean;
    nullFlavor?: string;
    ageAtOnset?: PQ;
    causeOfDeath?: boolean;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids };
  if (condition !== undefined) out.condition = condition;
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (ageAtOnset !== undefined) out.ageAtOnset = ageAtOnset;
  if (causeOfDeath) out.causeOfDeath = true;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}

/** Read the relative's age at onset from a nested Age Observation, if present. @internal */
function readAge(obs: Element, ctx: ParseCtx): PQ | undefined {
  const ageObs = relatedObservations(obs, AGE_OBSERVATION)[0];
  if (ageObs === undefined) return undefined;
  return parsePq(child(ageObs, "value"), ctx);
}
