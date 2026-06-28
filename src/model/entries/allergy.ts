/**
 * Allergies extraction — the Allergy Concern Act (`…22.4.30`) →
 * Allergy-Intolerance Observation (`…22.4.7`) tree. The allergen substance is
 * **not** the observation `value` (that is the propensity *type*) but lives at
 * `participant/participantRole/playingEntity/code`. Reactions (`…22.4.9`) carry
 * a manifestation and may nest a **Severity** (`…22.4.8`); **Criticality**
 * (`…22.4.145`) is a separate propensity-level observation — severity and
 * criticality are different axes and are never merged. `negationInd="true"` on
 * the observation is the "No Known Allergies" assertion — modeled distinctly
 * from a `nullFlavor` (value unknown).
 */

import { child, positionOf } from "../dom.js";
import { checkCodeSlot, looksProductLevel, RXNORM } from "../code-systems.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import { allergenGranularitySuspect } from "../../parser/warnings.js";
import {
  ALLERGY_CONCERN_ACT,
  ALLERGY_OBSERVATION,
  CRITICALITY_OBSERVATION,
  REACTION_OBSERVATION,
  SEVERITY_OBSERVATION,
  chain,
  childEntries,
  entryAct,
  idsOf,
  reconcileCode,
  readNegation,
  relatedObservations,
  resolveConcernStatus,
  resolveNarrative,
  type ConcernStatus,
} from "./shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * One reaction (manifestation) of an allergy. `manifestation` is the coded
 * clinical effect (e.g. hives); `severity` is the reaction's nested Severity
 * Observation value — distinct from the propensity's overall criticality.
 *
 * @example
 * ```ts
 * import type { AllergyReaction } from "@cosyte/ccda";
 * const r: AllergyReaction = { manifestation: { code: "247472004", codeSystem: "2.16.840.1.113883.6.96" } };
 * ```
 */
export interface AllergyReaction {
  readonly manifestation?: CD;
  readonly severity?: CD;
}

/**
 * An Allergy-Intolerance Observation. `allergen` is the offending substance
 * (RxNorm / UNII / SNOMED) from the playing entity; `type` is the propensity
 * type (the observation `value`). `noKnownAllergy` is the `negationInd="true"`
 * "no known allergies" assertion — **distinct** from `nullFlavor` (substance
 * unknown). `criticality` is the propensity criticality; per-reaction severity
 * lives on each {@link AllergyReaction}.
 *
 * @example
 * ```ts
 * import type { Allergy } from "@cosyte/ccda";
 * function allergenCode(a: Allergy): string | undefined {
 *   return a.noKnownAllergy ? undefined : a.allergen?.code;
 * }
 * ```
 */
export interface Allergy {
  readonly ids: readonly II[];
  readonly negated?: boolean;
  readonly nullFlavor?: string;
  readonly noKnownAllergy: boolean;
  readonly type?: CD;
  readonly allergen?: CD;
  readonly allergenLevelSuspect?: boolean;
  readonly reactions: readonly AllergyReaction[];
  readonly criticality?: CD;
  readonly narrative?: string;
}

/**
 * An Allergy Concern Act: the concern wrapper around one or more
 * {@link Allergy} observations. `status` is the active/resolved/inactive state
 * from the concern `statusCode`; `effectiveTime` is the concern window.
 *
 * @example
 * ```ts
 * import type { AllergyConcern } from "@cosyte/ccda";
 * function isActive(c: AllergyConcern): boolean {
 *   return c.status === "active";
 * }
 * ```
 */
export interface AllergyConcern {
  readonly ids: readonly II[];
  readonly status: ConcernStatus;
  readonly effectiveTime?: IVL_TS;
  readonly allergies: readonly Allergy[];
}

/**
 * Extract every Allergy Concern Act from an Allergies `<section>` element. Each
 * `<entry>` whose act carries the Allergy Concern Act template becomes an
 * {@link AllergyConcern}; the nested Allergy-Intolerance Observations become
 * {@link Allergy}s (including the "No Known Allergies" negated form). Never
 * throws.
 *
 * @example
 * ```ts
 * import { extractAllergies } from "@cosyte/ccda";
 * const concerns = extractAllergies(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractAllergies(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly AllergyConcern[] {
  const out: AllergyConcern[] = [];
  for (const entry of childEntries(sectionEl)) {
    const act = entryAct(entry, ALLERGY_CONCERN_ACT);
    if (act === undefined) continue;
    out.push(buildConcern(act, narrativeById, ctx));
  }
  return out;
}

/** Build one Allergy Concern Act. @internal */
function buildConcern(
  act: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): AllergyConcern {
  const ids = idsOf(act, ctx);
  const status = resolveConcernStatus(act, ctx);
  const effectiveTime = parseIvlTs(child(act, "effectiveTime"), ctx);
  const allergies = relatedObservations(act, ALLERGY_OBSERVATION).map((obs) =>
    buildAllergy(obs, narrativeById, ctx),
  );

  const out: {
    ids: readonly II[];
    status: ConcernStatus;
    effectiveTime?: IVL_TS;
    allergies: readonly Allergy[];
  } = { ids, status, allergies };
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  return out;
}

/** Build one Allergy-Intolerance Observation. @internal */
function buildAllergy(
  obs: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): Allergy {
  const ids = idsOf(obs, ctx);
  const { negated, nullFlavor } = readNegation(obs, ctx);
  const noKnownAllergy = negated === true;
  const type = parseCd(child(obs, "value"), ctx);

  const allergenEl = chain(obs, "participant", "participantRole", "playingEntity", "code");
  const allergen = parseCd(allergenEl, ctx);
  let allergenLevelSuspect: boolean | undefined;
  if (allergen !== undefined && allergenEl !== undefined) {
    const allergenPos = positionOf(allergenEl);
    checkCodeSlot(allergen, "allergen", allergenPos, ctx);
    if (allergen.codeSystem === RXNORM && looksProductLevel(allergen.displayName)) {
      ctx.emit(allergenGranularitySuspect(allergenPos));
      allergenLevelSuspect = true;
    }
  }

  const reactions = relatedObservations(obs, REACTION_OBSERVATION).map((r) =>
    buildReaction(r, ctx),
  );
  const criticalityEl = relatedObservations(obs, CRITICALITY_OBSERVATION)[0];
  const criticality =
    criticalityEl === undefined ? undefined : parseCd(child(criticalityEl, "value"), ctx);

  const narrative = resolveNarrative(obs, narrativeById, ctx);
  const allergenPos = allergenEl === undefined ? positionOf(obs) : positionOf(allergenEl);
  reconcileCode(allergen, narrative, "allergen", allergenPos, ctx);

  const out: {
    ids: readonly II[];
    negated?: boolean;
    nullFlavor?: string;
    noKnownAllergy: boolean;
    type?: CD;
    allergen?: CD;
    allergenLevelSuspect?: boolean;
    reactions: readonly AllergyReaction[];
    criticality?: CD;
    narrative?: string;
  } = { ids, noKnownAllergy, reactions };
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (type !== undefined) out.type = type;
  if (allergen !== undefined) out.allergen = allergen;
  if (allergenLevelSuspect !== undefined) out.allergenLevelSuspect = allergenLevelSuspect;
  if (criticality !== undefined) out.criticality = criticality;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}

/** Build one reaction with its optional nested severity. @internal */
function buildReaction(reaction: Element, ctx: ParseCtx): AllergyReaction {
  const manifestation = parseCd(child(reaction, "value"), ctx);
  const severityEl = relatedObservations(reaction, SEVERITY_OBSERVATION)[0];
  const severity = severityEl === undefined ? undefined : parseCd(child(severityEl, "value"), ctx);

  const out: { manifestation?: CD; severity?: CD } = {};
  if (manifestation !== undefined) out.manifestation = manifestation;
  if (severity !== undefined) out.severity = severity;
  return out;
}
