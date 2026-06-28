/**
 * Immunizations extraction — the Immunization Activity (`…22.4.52`)
 * `substanceAdministration`. The vaccine is the CVX `code` reached via
 * `consumable/manufacturedProduct/manufacturedMaterial` (Immunization Medication
 * Information `…22.4.54`); `doseQuantity` and `routeCode` are carried when
 * present. `negationInd="true"` means a **refused/not-administered** vaccination
 * — surfaced as `refused` and flagged (`IMMUNIZATION_REFUSED`), never silently
 * dropped or conflated with a `nullFlavor` "unknown".
 */

import { attr, child, positionOf } from "../dom.js";
import { checkCodeSlot } from "../code-systems.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parsePq, type PQ } from "../types/pq.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import { immunizationRefused } from "../../parser/warnings.js";
import {
  IMMUNIZATION_ACTIVITY,
  chain,
  childEntries,
  entryAct,
  idsOf,
  readNegation,
  reconcileCode,
  resolveNarrative,
  statusCodeOf,
} from "./shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * An Immunization Activity. `vaccine` is the CVX coded product; `dose` is the
 * amount administered; `route` is the administration route; `effectiveTime` is
 * when it was given. `refused` is `true` for a `negationInd` not-administered
 * record; `nullFlavor` carries an "unknown" marker — the two are kept distinct.
 * `moodCode` distinguishes an actual administration (`EVN`) from a planned one.
 *
 * @example
 * ```ts
 * import type { Immunization } from "@cosyte/ccda";
 * function cvx(i: Immunization): string | undefined {
 *   return i.vaccine?.code;
 * }
 * ```
 */
export interface Immunization {
  readonly ids: readonly II[];
  readonly moodCode?: string;
  readonly refused?: boolean;
  readonly nullFlavor?: string;
  readonly statusCode?: string;
  readonly vaccine?: CD;
  readonly dose?: PQ;
  readonly route?: CD;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * Extract every Immunization Activity from an Immunizations `<section>` element.
 * Each `<entry>` whose `substanceAdministration` carries the Immunization
 * Activity template becomes an {@link Immunization}. A `negationInd` record is
 * flagged `IMMUNIZATION_REFUSED`. Never throws.
 *
 * @example
 * ```ts
 * import { extractImmunizations } from "@cosyte/ccda";
 * const shots = extractImmunizations(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractImmunizations(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly Immunization[] {
  const out: Immunization[] = [];
  for (const entry of childEntries(sectionEl)) {
    const sbadm = entryAct(entry, IMMUNIZATION_ACTIVITY);
    if (sbadm === undefined) continue;
    out.push(buildImmunization(sbadm, narrativeById, ctx));
  }
  return out;
}

/** Build one Immunization Activity. @internal */
function buildImmunization(
  sbadm: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): Immunization {
  const ids = idsOf(sbadm, ctx);
  const moodCode = attr(sbadm, "moodCode");
  const { negated, nullFlavor } = readNegation(sbadm, ctx);
  const statusCode = statusCodeOf(sbadm);
  if (negated === true) ctx.emit(immunizationRefused(positionOf(sbadm)));

  const vaccineEl = chain(
    sbadm,
    "consumable",
    "manufacturedProduct",
    "manufacturedMaterial",
    "code",
  );
  const vaccine = parseCd(vaccineEl, ctx);
  const vaccinePos = vaccineEl === undefined ? positionOf(sbadm) : positionOf(vaccineEl);
  checkCodeSlot(vaccine, "vaccine", vaccinePos, ctx);

  const dose = parsePq(child(sbadm, "doseQuantity"), ctx);
  const route = readRoute(sbadm, ctx);
  const effectiveTime = parseIvlTs(child(sbadm, "effectiveTime"), ctx);
  const narrative = resolveNarrative(sbadm, narrativeById, ctx);
  reconcileCode(vaccine, narrative, "vaccine", vaccinePos, ctx);

  const out: {
    ids: readonly II[];
    moodCode?: string;
    refused?: boolean;
    nullFlavor?: string;
    statusCode?: string;
    vaccine?: CD;
    dose?: PQ;
    route?: CD;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids };
  if (moodCode !== undefined) out.moodCode = moodCode;
  if (negated !== undefined) out.refused = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (statusCode !== undefined) out.statusCode = statusCode;
  if (vaccine !== undefined) out.vaccine = vaccine;
  if (dose !== undefined) out.dose = dose;
  if (route !== undefined) out.route = route;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}

/** Read `routeCode` when present (not required for an immunization). @internal */
function readRoute(sbadm: Element, ctx: ParseCtx): CD | undefined {
  const routeEl = child(sbadm, "routeCode");
  if (routeEl === undefined) return undefined;
  const route = parseCd(routeEl, ctx);
  checkCodeSlot(route, "route", positionOf(routeEl), ctx);
  return route;
}
