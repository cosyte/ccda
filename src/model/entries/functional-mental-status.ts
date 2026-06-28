/**
 * Functional Status and Mental Status extraction — two structurally identical
 * sections that differ only in their template roots and clinical domain. Each
 * carries Functional/Mental Status Observations (`…22.4.67` / `…22.4.74`) either
 * directly under an `<entry>` or clustered in a Functional/Mental Status
 * Organizer (`…22.4.66` / `…22.4.75`), and an organizer member may also be an
 * Assessment Scale Observation (`…22.4.69`, a scored scale such as a PHQ-9 or a
 * Barthel index). Both forms are read into a flat list of typed
 * {@link StatusObservation}s tagged with their {@link StatusDomain} — nothing is
 * dropped, and the two domains are never conflated.
 *
 * A standalone Assessment Scale Observation (one not inside a domain organizer)
 * is **not** captured: its domain cannot be determined from its template alone,
 * and guessing would risk filing a functional finding under mental status (or
 * vice versa). Such a scale is only read when its parent organizer anchors the
 * domain.
 */

import { child, children, positionOf } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  ASSESSMENT_SCALE_OBSERVATION,
  FUNCTIONAL_STATUS_OBSERVATION,
  FUNCTIONAL_STATUS_ORGANIZER,
  MENTAL_STATUS_OBSERVATION,
  MENTAL_STATUS_ORGANIZER,
  childEntries,
  entryAct,
  hasTemplateRoot,
  idsOf,
  readNegation,
  reconcileCode,
  resolveNarrative,
  statusCodeOf,
} from "./shared.js";
import { readObservationValue, type ObservationValue } from "./observation.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Which status section a {@link StatusObservation} came from — `"functional"`
 * (ADLs, mobility, self-care) or `"mental"` (cognition, mood). Preserved so a
 * consumer can tell the two apart without re-reading the DOM; the two are never
 * conflated.
 *
 * @example
 * ```ts
 * import type { StatusDomain } from "@cosyte/ccda";
 * const d: StatusDomain = "functional";
 * ```
 */
export type StatusDomain = "functional" | "mental";

/**
 * A single Functional/Mental Status finding. `domain` is the section it came
 * from; `assessmentScale` is `true` when the finding is an Assessment Scale
 * Observation (a scored scale) rather than a plain status observation; `code` is
 * the finding code (usually LOINC), `value` the typed result. `negated` and
 * `nullFlavor` are kept distinct, never collapsed.
 *
 * @example
 * ```ts
 * import type { StatusObservation } from "@cosyte/ccda";
 * function isScale(o: StatusObservation): boolean {
 *   return o.assessmentScale === true;
 * }
 * ```
 */
export interface StatusObservation {
  readonly ids: readonly II[];
  readonly domain: StatusDomain;
  readonly assessmentScale?: boolean;
  readonly code?: CD;
  readonly value?: ObservationValue;
  readonly negated?: boolean;
  readonly nullFlavor?: string;
  readonly statusCode?: string;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * Extract every Functional Status finding from a Functional Status `<section>`
 * element — standalone Functional Status Observations plus the members
 * (observations and assessment scales) of any Functional Status Organizer. Never
 * throws.
 *
 * @example
 * ```ts
 * import { extractFunctionalStatus } from "@cosyte/ccda";
 * const findings = extractFunctionalStatus(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractFunctionalStatus(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly StatusObservation[] {
  return extractStatus(
    sectionEl,
    "functional",
    FUNCTIONAL_STATUS_ORGANIZER,
    FUNCTIONAL_STATUS_OBSERVATION,
    narrativeById,
    ctx,
  );
}

/**
 * Extract every Mental Status finding from a Mental Status `<section>` element —
 * standalone Mental Status Observations plus the members (observations and
 * assessment scales) of any Mental Status Organizer. Never throws.
 *
 * @example
 * ```ts
 * import { extractMentalStatus } from "@cosyte/ccda";
 * const findings = extractMentalStatus(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractMentalStatus(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly StatusObservation[] {
  return extractStatus(
    sectionEl,
    "mental",
    MENTAL_STATUS_ORGANIZER,
    MENTAL_STATUS_OBSERVATION,
    narrativeById,
    ctx,
  );
}

/** Shared walk for a status section — standalone observations + organizer members. @internal */
function extractStatus(
  sectionEl: Element,
  domain: StatusDomain,
  organizerRoot: string,
  observationRoot: string,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly StatusObservation[] {
  const out: StatusObservation[] = [];
  for (const entry of childEntries(sectionEl)) {
    const organizer = entryAct(entry, organizerRoot);
    if (organizer !== undefined) {
      out.push(...organizerMembers(organizer, domain, observationRoot, narrativeById, ctx));
      continue;
    }
    const obs = entryAct(entry, observationRoot);
    if (obs !== undefined) {
      out.push(buildStatusObservation(obs, domain, false, narrativeById, ctx));
    }
  }
  return out;
}

/** A status organizer's member observations + assessment scales, in document order. @internal */
function organizerMembers(
  organizer: Element,
  domain: StatusDomain,
  observationRoot: string,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly StatusObservation[] {
  const out: StatusObservation[] = [];
  for (const comp of children(organizer, "component")) {
    const obs = child(comp, "observation");
    if (obs === undefined) continue;
    if (hasTemplateRoot(obs, observationRoot)) {
      out.push(buildStatusObservation(obs, domain, false, narrativeById, ctx));
    } else if (hasTemplateRoot(obs, ASSESSMENT_SCALE_OBSERVATION)) {
      out.push(buildStatusObservation(obs, domain, true, narrativeById, ctx));
    }
  }
  return out;
}

/** Build one status finding from its `<observation>` element. @internal */
function buildStatusObservation(
  obs: Element,
  domain: StatusDomain,
  assessmentScale: boolean,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): StatusObservation {
  const ids = idsOf(obs, ctx);
  const codeEl = child(obs, "code");
  const code = parseCd(codeEl, ctx);
  const value = readObservationValue(child(obs, "value"), ctx);
  const { negated, nullFlavor } = readNegation(obs, ctx);
  const statusCode = statusCodeOf(obs);
  const effectiveTime = parseIvlTs(child(obs, "effectiveTime"), ctx);
  const narrative = resolveNarrative(obs, narrativeById, ctx);
  reconcileCode(code, narrative, "statusObservation", positionOf(codeEl ?? obs), ctx);

  const out: {
    ids: readonly II[];
    domain: StatusDomain;
    assessmentScale?: boolean;
    code?: CD;
    value?: ObservationValue;
    negated?: boolean;
    nullFlavor?: string;
    statusCode?: string;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids, domain };
  if (assessmentScale) out.assessmentScale = true;
  if (code !== undefined) out.code = code;
  if (value !== undefined) out.value = value;
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (statusCode !== undefined) out.statusCode = statusCode;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}
