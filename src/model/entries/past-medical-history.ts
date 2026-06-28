/**
 * Past Medical History extraction — historical problems a patient no longer has
 * an active concern about. Unlike the Problems Section (which wraps each problem
 * in a Problem Concern Act, `…22.4.3`), the Past Medical History Section
 * (`…22.2.20`) carries **bare** Problem Observations (`…22.4.4`) directly under
 * each `<entry>`. The two never double-count: a Problem Concern Act nests its
 * Problem Observation under an `entryRelationship`, so it is not a direct
 * `<entry>` child here, and a bare Problem Observation is not a concern act.
 *
 * The shared {@link buildProblem} builder is reused verbatim — a past problem has
 * the same coded shape as a current one (the distinction is the section it lives
 * in, surfaced via `getPastMedicalHistory`), so there is no separate model.
 */

import { childEntries, entryAct } from "./shared.js";
import { PROBLEM_OBSERVATION } from "./shared.js";
import { buildProblem, type Problem } from "./problem.js";
import type { ParseCtx } from "../types/_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Extract every bare Problem Observation from a Past Medical History `<section>`
 * element. Each `<entry>` whose direct `observation` carries the Problem
 * Observation template becomes a {@link Problem}. Never throws.
 *
 * @example
 * ```ts
 * import { extractPastMedicalHistory } from "@cosyte/ccda";
 * const history = extractPastMedicalHistory(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractPastMedicalHistory(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly Problem[] {
  const out: Problem[] = [];
  for (const entry of childEntries(sectionEl)) {
    const obs = entryAct(entry, PROBLEM_OBSERVATION);
    if (obs === undefined) continue;
    out.push(buildProblem(obs, narrativeById, ctx));
  }
  return out;
}
