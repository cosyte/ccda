/**
 * Problems extraction — the Problem Concern Act (`…22.4.3`) → Problem
 * Observation (`…22.4.4`) tree. The coded problem lives in the observation's
 * `value xsi:type="CD"` (SNOMED CT or ICD-10-CM); the concern act's
 * `statusCode` plus `effectiveTime` carry the active-vs-resolved state. The
 * concern wrapper is preserved (not flattened) because its status is
 * safety-relevant — an inactive/resolved problem must never read as active.
 */

import { child, positionOf } from "../dom.js";
import { checkCodeSlot } from "../code-systems.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import {
  PROBLEM_CONCERN_ACT,
  PROBLEM_OBSERVATION,
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

/** Resolved active-vs-resolved state of a {@link ProblemConcern}. */
export type ProblemStatus = ConcernStatus;

/**
 * A single Problem Observation. `value` is the coded condition (SNOMED CT /
 * ICD-10-CM) — the field most consumers want; `code` is the observation's
 * problem-type code. `negated` (from `@negationInd`) and `nullFlavor` are
 * **distinct** — a negated problem ("no chest pain") is not an unknown one.
 *
 * @example
 * ```ts
 * import type { Problem } from "@cosyte/ccda";
 * const p: Problem = { ids: [], value: { code: "59621000", codeSystem: "2.16.840.1.113883.6.96" } };
 * ```
 */
export interface Problem {
  readonly ids: readonly II[];
  readonly code?: CD;
  readonly value?: CD;
  readonly negated?: boolean;
  readonly nullFlavor?: string;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * A Problem Concern Act: the clinical-concern wrapper around one or more
 * {@link Problem} observations. `status` is the resolved active/resolved/
 * inactive state (from the concern `statusCode`); `effectiveTime` is the
 * concern window (onset → resolution).
 *
 * @example
 * ```ts
 * import type { ProblemConcern } from "@cosyte/ccda";
 * function isActive(c: ProblemConcern): boolean {
 *   return c.status === "active";
 * }
 * ```
 */
export interface ProblemConcern {
  readonly ids: readonly II[];
  readonly status: ProblemStatus;
  readonly effectiveTime?: IVL_TS;
  readonly problems: readonly Problem[];
}

/**
 * Extract every Problem Concern Act from a Problems `<section>` element. Each
 * `<entry>` whose act carries the Problem Concern Act template becomes a
 * {@link ProblemConcern}; the nested Problem Observations become
 * {@link Problem}s. Reconciles each problem's coded value against its narrative
 * reference. Never throws.
 *
 * @example
 * ```ts
 * import { extractProblems } from "@cosyte/ccda";
 * const concerns = extractProblems(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractProblems(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly ProblemConcern[] {
  const out: ProblemConcern[] = [];
  for (const entry of childEntries(sectionEl)) {
    const act = entryAct(entry, PROBLEM_CONCERN_ACT);
    if (act === undefined) continue;
    out.push(buildConcern(act, narrativeById, ctx));
  }
  return out;
}

/** Build one Problem Concern Act. @internal */
function buildConcern(
  act: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): ProblemConcern {
  const ids = idsOf(act, ctx);
  const status = resolveConcernStatus(act, ctx);
  const effectiveTime = parseIvlTs(child(act, "effectiveTime"), ctx);
  const problems = relatedObservations(act, PROBLEM_OBSERVATION).map((obs) =>
    buildProblem(obs, narrativeById, ctx),
  );

  const out: {
    ids: readonly II[];
    status: ProblemStatus;
    effectiveTime?: IVL_TS;
    problems: readonly Problem[];
  } = { ids, status, problems };
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  return out;
}

/** Build one Problem Observation. @internal */
function buildProblem(
  obs: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): Problem {
  const ids = idsOf(obs, ctx);
  const code = parseCd(child(obs, "code"), ctx);
  const valueEl = child(obs, "value");
  const value = parseCd(valueEl, ctx);
  const { negated, nullFlavor } = readNegation(obs, ctx);
  const effectiveTime = parseIvlTs(child(obs, "effectiveTime"), ctx);
  const narrative = resolveNarrative(obs, narrativeById, ctx);

  const valuePos = valueEl === undefined ? positionOf(obs) : positionOf(valueEl);
  checkCodeSlot(value, "problem", valuePos, ctx);
  reconcileCode(value, narrative, "problem", valuePos, ctx);

  const out: {
    ids: readonly II[];
    code?: CD;
    value?: CD;
    negated?: boolean;
    nullFlavor?: string;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids };
  if (code !== undefined) out.code = code;
  if (value !== undefined) out.value = value;
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}
