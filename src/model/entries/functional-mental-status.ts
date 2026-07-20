/**
 * Functional Status and Mental Status extraction — two structurally identical
 * sections that differ only in their template roots and clinical domain. Each
 * carries Functional/Mental Status Observations (`…22.4.67` / `…22.4.74`) either
 * directly under an `<entry>` or clustered in a Functional/Mental Status
 * Organizer (`…22.4.66` / `…22.4.75`), plus Assessment Scale Observations
 * (`…22.4.69`, a scored scale such as a PHQ-9 or a Glasgow Coma) — which C-CDA
 * R2.1 places as **direct section entries**, each grouping its scored
 * Assessment Scale Supporting Observations (`…22.4.86`) via `entryRelationship`.
 * Every form is read into a flat list of typed {@link StatusObservation}s tagged
 * with their {@link StatusDomain} — nothing is dropped, and the two domains are
 * never conflated.
 *
 * A direct-entry Assessment Scale Observation's domain is the section that
 * carries it — a scale in the Functional Status section is functional, one in
 * the Mental Status section is mental — so it is read (flagged `assessmentScale`)
 * without ever guessing a domain from the template alone. A scale wrongly nested
 * inside a domain organizer is still read leniently (its parent organizer
 * anchors the domain), but the conformant placement the builder emits is the
 * direct section entry.
 */

import { attr, child, children, positionOf } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  ASSESSMENT_SCALE_OBSERVATION,
  ASSESSMENT_SCALE_SUPPORTING_OBSERVATION,
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
  relatedObservations,
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
  /**
   * The scored component observations of an Assessment Scale Observation
   * (`…22.4.86`), present only when `assessmentScale` is `true` and the scale
   * carries components (e.g. the individual PHQ-9 questions under the total
   * score). Absent for a plain status observation.
   */
  readonly supporting?: readonly SupportingObservation[];
}

/**
 * One scored component of an Assessment Scale Observation — an Assessment Scale
 * Supporting Observation (`…22.4.86`), such as a single PHQ-9 question or a
 * Glasgow Coma sub-score. `code` is the item code (LOINC/SNOMED), `value` its
 * scored answer (usually an `integer`). Modeled so the scale's detail is never
 * silently dropped on parse.
 *
 * @example
 * ```ts
 * import type { SupportingObservation } from "@cosyte/ccda";
 * function itemScore(o: SupportingObservation): number | undefined {
 *   return o.value?.kind === "integer" ? o.value.value : undefined;
 * }
 * ```
 */
export interface SupportingObservation {
  readonly ids: readonly II[];
  readonly code?: CD;
  readonly value?: ObservationValue;
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
    FUNCTIONAL_STATUS_SECTION,
    FUNCTIONAL_STATUS_SECTION_LOINC,
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
    MENTAL_STATUS_SECTION,
    MENTAL_STATUS_SECTION_LOINC,
    narrativeById,
    ctx,
  );
}

/** Functional Status Section templateId root + its LOINC section code. @internal */
const FUNCTIONAL_STATUS_SECTION = "2.16.840.1.113883.10.20.22.2.14";
/** @internal */
const FUNCTIONAL_STATUS_SECTION_LOINC = "47420-5";
/** Mental Status Section templateId root + its LOINC section code. @internal */
const MENTAL_STATUS_SECTION = "2.16.840.1.113883.10.20.22.2.56";
/** @internal */
const MENTAL_STATUS_SECTION_LOINC = "10190-7";

/**
 * Whether a `<section>` is the given status-domain section — by templateId root
 * (primary) or its LOINC section `<code>` (fallback). A **direct-entry Assessment
 * Scale Observation** (`…22.4.69`) carries the *same* template in both the
 * Functional and Mental Status sections, so its domain can only be read from the
 * section that carries it — this gate is what stops a scale in one section from
 * being pulled into the other domain. @internal
 */
function isDomainSection(sectionEl: Element, sectionRoot: string, sectionLoinc: string): boolean {
  if (hasTemplateRoot(sectionEl, sectionRoot)) return true;
  const code = child(sectionEl, "code");
  return code !== undefined && attr(code, "code") === sectionLoinc;
}

/** Shared walk for a status section — standalone observations + organizer members. @internal */
function extractStatus(
  sectionEl: Element,
  domain: StatusDomain,
  organizerRoot: string,
  observationRoot: string,
  sectionRoot: string,
  sectionLoinc: string,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly StatusObservation[] {
  const out: StatusObservation[] = [];
  // A direct-entry Assessment Scale Observation carries the SAME template in both
  // status sections, so it is only read when THIS section is the matching-domain
  // section — the domain comes from the section, never guessed from the template.
  const readScales = isDomainSection(sectionEl, sectionRoot, sectionLoinc);
  for (const entry of childEntries(sectionEl)) {
    const organizer = entryAct(entry, organizerRoot);
    if (organizer !== undefined) {
      out.push(...organizerMembers(organizer, domain, observationRoot, narrativeById, ctx));
      continue;
    }
    if (readScales) {
      const scale = entryAct(entry, ASSESSMENT_SCALE_OBSERVATION);
      if (scale !== undefined) {
        out.push(buildStatusObservation(scale, domain, true, narrativeById, ctx));
        continue;
      }
    }
    const obs = entryAct(entry, observationRoot);
    if (obs !== undefined) {
      out.push(buildStatusObservation(obs, domain, false, narrativeById, ctx));
    }
  }
  return out;
}

/** The scored component observations (`…22.4.86`) of an Assessment Scale, in document order. @internal */
function supportingObservations(
  scale: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly SupportingObservation[] {
  const out: SupportingObservation[] = [];
  for (const obs of relatedObservations(scale, ASSESSMENT_SCALE_SUPPORTING_OBSERVATION)) {
    const ids = idsOf(obs, ctx);
    const code = parseCd(child(obs, "code"), ctx);
    const value = readObservationValue(child(obs, "value"), ctx);
    const narrative = resolveNarrative(obs, narrativeById, ctx);
    const item: { ids: readonly II[]; code?: CD; value?: ObservationValue; narrative?: string } = {
      ids,
    };
    if (code !== undefined) item.code = code;
    if (value !== undefined) item.value = value;
    if (narrative !== undefined) item.narrative = narrative;
    out.push(item);
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
    supporting?: readonly SupportingObservation[];
  } = { ids, domain };
  if (assessmentScale) out.assessmentScale = true;
  if (code !== undefined) out.code = code;
  if (value !== undefined) out.value = value;
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (statusCode !== undefined) out.statusCode = statusCode;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  if (assessmentScale) {
    const supporting = supportingObservations(obs, narrativeById, ctx);
    if (supporting.length > 0) out.supporting = supporting;
  }
  return out;
}
