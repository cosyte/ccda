/**
 * Vital Signs extraction — the Vital Signs Organizer (`…22.4.26`) → Vital Sign
 * Observation (`…22.4.27`) tree. The organizer clusters one reading event (a set
 * of vitals taken together); each member Vital Sign Observation carries a LOINC
 * `code` (e.g. `8480-6` systolic BP), a `PQ` `value`, an optional
 * `interpretationCode`, and the `effectiveTime` of the reading. Units are
 * safety-critical: a `PQ` is preserved with its raw unit and flagged when the
 * unit is not valid UCUM — never normalized away.
 */

import { child, positionOf } from "../dom.js";
import { checkLoincDeprecation } from "../code-systems.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  VITAL_SIGNS_ORGANIZER,
  VITAL_SIGN_OBSERVATION,
  childEntries,
  componentObservations,
  entryAct,
  idsOf,
  resolveNarrative,
  statusCodeOf,
} from "./shared.js";
import { readObservationValue, type ObservationValue } from "./observation.js";
import type { Element } from "@xmldom/xmldom";

/**
 * A single Vital Sign Observation. `code` is the LOINC vital; `value` is the
 * typed reading (normally a UCUM-checked quantity); `interpretation` is the
 * H/L/N flag; `effectiveTime` is when the reading was taken.
 *
 * @example
 * ```ts
 * import type { VitalSign } from "@cosyte/ccda";
 * function systolic(v: VitalSign): number | undefined {
 *   return v.code?.code === "8480-6" && v.value?.kind === "physicalQuantity"
 *     ? v.value.quantity.value
 *     : undefined;
 * }
 * ```
 */
export interface VitalSign {
  readonly ids: readonly II[];
  readonly code?: CD;
  readonly value?: ObservationValue;
  readonly interpretation?: CD;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * A Vital Signs Organizer: the cluster wrapper around one or more
 * {@link VitalSign} observations taken together. `code` is the cluster code;
 * `statusCode` is the organizer status; `vitals` are the member readings.
 *
 * @example
 * ```ts
 * import type { VitalSignsOrganizer } from "@cosyte/ccda";
 * function clusterSize(o: VitalSignsOrganizer): number {
 *   return o.vitals.length;
 * }
 * ```
 */
export interface VitalSignsOrganizer {
  readonly ids: readonly II[];
  readonly code?: CD;
  readonly statusCode?: string;
  readonly vitals: readonly VitalSign[];
}

/**
 * Extract every Vital Signs Organizer from a Vital Signs `<section>` element.
 * Each `<entry>` whose `organizer` carries the Vital Signs Organizer template
 * becomes a {@link VitalSignsOrganizer}; its `component/observation` members
 * become {@link VitalSign}s. Never throws.
 *
 * @example
 * ```ts
 * import { extractVitals } from "@cosyte/ccda";
 * const clusters = extractVitals(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractVitals(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly VitalSignsOrganizer[] {
  const out: VitalSignsOrganizer[] = [];
  for (const entry of childEntries(sectionEl)) {
    const organizer = entryAct(entry, VITAL_SIGNS_ORGANIZER);
    if (organizer === undefined) continue;
    out.push(buildOrganizer(organizer, narrativeById, ctx));
  }
  return out;
}

/** Build one Vital Signs Organizer. @internal */
function buildOrganizer(
  organizer: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): VitalSignsOrganizer {
  const ids = idsOf(organizer, ctx);
  const code = parseCd(child(organizer, "code"), ctx);
  const statusCode = statusCodeOf(organizer);
  const vitals = componentObservations(organizer, VITAL_SIGN_OBSERVATION).map((obs) =>
    buildVital(obs, narrativeById, ctx),
  );

  const out: {
    ids: readonly II[];
    code?: CD;
    statusCode?: string;
    vitals: readonly VitalSign[];
  } = { ids, vitals };
  if (code !== undefined) out.code = code;
  if (statusCode !== undefined) out.statusCode = statusCode;
  return out;
}

/** Build one Vital Sign Observation. @internal */
function buildVital(
  obs: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): VitalSign {
  const ids = idsOf(obs, ctx);
  const codeEl = child(obs, "code");
  const code = parseCd(codeEl, ctx);
  checkLoincDeprecation(code, codeEl === undefined ? positionOf(obs) : positionOf(codeEl), ctx);

  const value = readObservationValue(child(obs, "value"), ctx);
  const interpretation = parseCd(child(obs, "interpretationCode"), ctx);
  const effectiveTime = parseIvlTs(child(obs, "effectiveTime"), ctx);
  const narrative = resolveNarrative(obs, narrativeById, ctx);

  const out: {
    ids: readonly II[];
    code?: CD;
    value?: ObservationValue;
    interpretation?: CD;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids };
  if (code !== undefined) out.code = code;
  if (value !== undefined) out.value = value;
  if (interpretation !== undefined) out.interpretation = interpretation;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}
