/**
 * Medications extraction — the Medication Activity (`…22.4.16`)
 * `substanceAdministration`. The drug is the RxNorm `code` reached via
 * `consumable/manufacturedProduct/manufacturedMaterial` (Medication
 * Information `…22.4.23`); `doseQuantity` and `routeCode` are safety-critical
 * (their absence is flagged, never defaulted). Timing is carried as **two
 * sibling `effectiveTime` elements distinguished by `xsi:type`**: an `IVL_TS`
 * duration (the therapy window) and a `PIVL_TS` periodic frequency.
 */

import { attr, child, children, positionOf } from "../dom.js";
import { checkCodeSlot } from "../code-systems.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parsePq, type PQ } from "../types/pq.js";
import { parseIvlPq, type IVL_PQ } from "../types/ivl-pq.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import { parseBooleanValue, type ParseCtx } from "../types/_shared.js";
import {
  missingDoseQuantity,
  missingRouteCode,
  multipleEffectiveTimesUnresolved,
} from "../../parser/warnings.js";
import {
  MEDICATION_ACTIVITY,
  chain,
  childEntries,
  entryAct,
  idsOf,
  reconcileCode,
  readNegation,
  resolveNarrative,
  statusCodeOf,
  typeOf,
} from "./shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * A periodic dosing frequency (HL7 v3 `PIVL_TS`). `period` is the interval
 * between administrations (e.g. 8 hours); `institutionSpecified` marks an
 * institution-defined timing (e.g. "with meals" rather than a fixed clock).
 *
 * @example
 * ```ts
 * import type { MedicationFrequency } from "@cosyte/ccda";
 * const f: MedicationFrequency = { period: { value: 8, unit: "h" } };
 * ```
 */
export interface MedicationFrequency {
  readonly period?: PQ;
  readonly institutionSpecified?: boolean;
}

/**
 * A Medication Activity. `drug` is the RxNorm coded product; `dose`/`doseRange`
 * is the amount per administration; `route` is the administration route;
 * `duration` is the therapy window (`IVL_TS`) and `frequency` the periodic
 * timing (`PIVL_TS`). `moodCode` distinguishes an actual administration (`EVN`)
 * from a planned/ordered one (`INT`/`RQO`) — never conflated.
 *
 * @example
 * ```ts
 * import type { Medication } from "@cosyte/ccda";
 * function rxnorm(m: Medication): string | undefined {
 *   return m.drug?.code;
 * }
 * ```
 */
export interface Medication {
  readonly ids: readonly II[];
  readonly moodCode?: string;
  readonly negated?: boolean;
  readonly nullFlavor?: string;
  readonly statusCode?: string;
  readonly drug?: CD;
  readonly dose?: PQ;
  readonly doseRange?: IVL_PQ;
  readonly route?: CD;
  readonly duration?: IVL_TS;
  readonly frequency?: MedicationFrequency;
  readonly narrative?: string;
}

/**
 * Extract every Medication Activity from a Medications `<section>` element.
 * Each `<entry>` whose `substanceAdministration` carries the Medication
 * Activity template becomes a {@link Medication}. Flags a missing
 * `doseQuantity` / `routeCode` and an unclassifiable `effectiveTime`. Never
 * throws.
 *
 * @example
 * ```ts
 * import { extractMedications } from "@cosyte/ccda";
 * const meds = extractMedications(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractMedications(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly Medication[] {
  const out: Medication[] = [];
  for (const entry of childEntries(sectionEl)) {
    const sbadm = entryAct(entry, MEDICATION_ACTIVITY);
    if (sbadm === undefined) continue;
    out.push(buildMedication(sbadm, narrativeById, ctx));
  }
  return out;
}

/** Build one Medication Activity. @internal */
function buildMedication(
  sbadm: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): Medication {
  const ids = idsOf(sbadm, ctx);
  const moodCode = attr(sbadm, "moodCode");
  const { negated, nullFlavor } = readNegation(sbadm, ctx);
  const statusCode = statusCodeOf(sbadm);

  const drugEl = chain(sbadm, "consumable", "manufacturedProduct", "manufacturedMaterial", "code");
  const drug = parseCd(drugEl, ctx);
  const drugPos = drugEl === undefined ? positionOf(sbadm) : positionOf(drugEl);
  checkCodeSlot(drug, "medication", drugPos, ctx);

  const { dose, doseRange } = readDose(sbadm, ctx);
  const route = readRoute(sbadm, ctx);
  const { duration, frequency } = readTiming(sbadm, ctx);
  const narrative = resolveNarrative(sbadm, narrativeById, ctx);
  reconcileCode(drug, narrative, "medication", drugPos, ctx);

  const out: {
    ids: readonly II[];
    moodCode?: string;
    negated?: boolean;
    nullFlavor?: string;
    statusCode?: string;
    drug?: CD;
    dose?: PQ;
    doseRange?: IVL_PQ;
    route?: CD;
    duration?: IVL_TS;
    frequency?: MedicationFrequency;
    narrative?: string;
  } = { ids };
  if (moodCode !== undefined) out.moodCode = moodCode;
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (statusCode !== undefined) out.statusCode = statusCode;
  if (drug !== undefined) out.drug = drug;
  if (dose !== undefined) out.dose = dose;
  if (doseRange !== undefined) out.doseRange = doseRange;
  if (route !== undefined) out.route = route;
  if (duration !== undefined) out.duration = duration;
  if (frequency !== undefined) out.frequency = frequency;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}

/** Read `doseQuantity` as a scalar PQ or a range IVL_PQ; flag its absence. @internal */
function readDose(
  sbadm: Element,
  ctx: ParseCtx,
): { readonly dose?: PQ; readonly doseRange?: IVL_PQ } {
  const doseEl = child(sbadm, "doseQuantity");
  if (doseEl === undefined) {
    ctx.emit(missingDoseQuantity(positionOf(sbadm)));
    return {};
  }
  // A doseQuantity expressed as a range carries <low>/<high>; otherwise it is a
  // scalar PQ on the element itself.
  if (child(doseEl, "low") !== undefined || child(doseEl, "high") !== undefined) {
    const doseRange = parseIvlPq(doseEl, ctx);
    return doseRange === undefined ? {} : { doseRange };
  }
  const dose = parsePq(doseEl, ctx);
  return dose === undefined ? {} : { dose };
}

/** Read `routeCode`; flag its absence. @internal */
function readRoute(sbadm: Element, ctx: ParseCtx): CD | undefined {
  const routeEl = child(sbadm, "routeCode");
  if (routeEl === undefined) {
    ctx.emit(missingRouteCode(positionOf(sbadm)));
    return undefined;
  }
  const route = parseCd(routeEl, ctx);
  checkCodeSlot(route, "route", positionOf(routeEl), ctx);
  return route;
}

/** Classify the sibling `effectiveTime` elements into a duration + a frequency. @internal */
function readTiming(
  sbadm: Element,
  ctx: ParseCtx,
): { readonly duration?: IVL_TS; readonly frequency?: MedicationFrequency } {
  let duration: IVL_TS | undefined;
  let frequency: MedicationFrequency | undefined;
  let unresolved = 0;

  for (const et of children(sbadm, "effectiveTime")) {
    const t = typeOf(et);
    const periodEl = child(et, "period");
    const isDuration =
      t === "IVL_TS" ||
      (t === undefined && (child(et, "low") !== undefined || child(et, "high") !== undefined));
    const isFrequency = t === "PIVL_TS" || t === "EIVL_TS" || periodEl !== undefined;

    // A single element matching both axes (e.g. an untyped element carrying both
    // low/high and a period) is genuinely ambiguous — never silently pick one.
    if (isDuration && isFrequency) {
      unresolved += 1;
    } else if (isDuration && duration === undefined) {
      const parsed = parseIvlTs(et, ctx);
      if (parsed !== undefined) duration = parsed;
    } else if (isFrequency && frequency === undefined) {
      frequency = readFrequency(et, periodEl, ctx);
    } else {
      unresolved += 1;
    }
  }

  if (unresolved > 0) {
    ctx.emit(multipleEffectiveTimesUnresolved(positionOf(sbadm), unresolved));
  }

  const out: { duration?: IVL_TS; frequency?: MedicationFrequency } = {};
  if (duration !== undefined) out.duration = duration;
  if (frequency !== undefined) out.frequency = frequency;
  return out;
}

/** Build a {@link MedicationFrequency} from a PIVL_TS `effectiveTime`. @internal */
function readFrequency(
  et: Element,
  periodEl: Element | undefined,
  ctx: ParseCtx,
): MedicationFrequency {
  const out: { period?: PQ; institutionSpecified?: boolean } = {};
  const period = parsePq(periodEl, ctx);
  if (period !== undefined) out.period = period;
  const inst = parseBooleanValue(attr(et, "institutionSpecified"));
  if (inst !== undefined) out.institutionSpecified = inst;
  return out;
}
