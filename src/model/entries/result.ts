/**
 * Results extraction — the Result Organizer (`…22.4.1`) → Result Observation
 * (`…22.4.2`) tree. The organizer is the panel/battery (e.g. a CBC); each member
 * Result Observation carries a LOINC test `code`, a polymorphic `value` (a
 * UCUM-checked `PQ`, a coded `CD`, free text, or an `IVL_PQ` range), an optional
 * reference range, and an `interpretationCode` (H/L/N…). Units are
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
  RESULT_OBSERVATION,
  RESULT_ORGANIZER,
  childEntries,
  componentObservations,
  entryAct,
  idsOf,
  resolveNarrative,
  statusCodeOf,
} from "./shared.js";
import {
  readObservationValue,
  readReferenceRange,
  type ObservationValue,
  type ReferenceRange,
} from "./observation.js";
import type { Element } from "@xmldom/xmldom";

/**
 * A single Result Observation. `code` is the LOINC test; `value` is the typed
 * result (a UCUM-checked quantity, coded value, string, or range);
 * `referenceRange` is the normal interval; `interpretation` is the H/L/N flag.
 *
 * @example
 * ```ts
 * import type { Result } from "@cosyte/ccda";
 * function highFlag(r: Result): boolean {
 *   return r.interpretation?.code === "H";
 * }
 * ```
 */
export interface Result {
  readonly ids: readonly II[];
  readonly code?: CD;
  readonly value?: ObservationValue;
  readonly referenceRange?: ReferenceRange;
  readonly interpretation?: CD;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * A Result Organizer: the panel/battery wrapper around one or more
 * {@link Result} observations. `code` is the panel LOINC; `statusCode` is the
 * organizer status; `results` are the member observations.
 *
 * @example
 * ```ts
 * import type { ResultOrganizer } from "@cosyte/ccda";
 * function panelSize(o: ResultOrganizer): number {
 *   return o.results.length;
 * }
 * ```
 */
export interface ResultOrganizer {
  readonly ids: readonly II[];
  readonly code?: CD;
  readonly statusCode?: string;
  readonly results: readonly Result[];
}

/**
 * Extract every Result Organizer from a Results `<section>` element. Each
 * `<entry>` whose `organizer` carries the Result Organizer template becomes a
 * {@link ResultOrganizer}; its `component/observation` members become
 * {@link Result}s. Never throws.
 *
 * @example
 * ```ts
 * import { extractResults } from "@cosyte/ccda";
 * const panels = extractResults(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractResults(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly ResultOrganizer[] {
  const out: ResultOrganizer[] = [];
  for (const entry of childEntries(sectionEl)) {
    const organizer = entryAct(entry, RESULT_ORGANIZER);
    if (organizer === undefined) continue;
    out.push(buildOrganizer(organizer, narrativeById, ctx));
  }
  return out;
}

/** Build one Result Organizer. @internal */
function buildOrganizer(
  organizer: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): ResultOrganizer {
  const ids = idsOf(organizer, ctx);
  const code = parseCd(child(organizer, "code"), ctx);
  const statusCode = statusCodeOf(organizer);
  const results = componentObservations(organizer, RESULT_OBSERVATION).map((obs) =>
    buildResult(obs, narrativeById, ctx),
  );

  const out: { ids: readonly II[]; code?: CD; statusCode?: string; results: readonly Result[] } = {
    ids,
    results,
  };
  if (code !== undefined) out.code = code;
  if (statusCode !== undefined) out.statusCode = statusCode;
  return out;
}

/** Build one Result Observation. @internal */
function buildResult(
  obs: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): Result {
  const ids = idsOf(obs, ctx);
  const codeEl = child(obs, "code");
  const code = parseCd(codeEl, ctx);
  checkLoincDeprecation(code, codeEl === undefined ? positionOf(obs) : positionOf(codeEl), ctx);

  const value = readObservationValue(child(obs, "value"), ctx);
  const referenceRange = readReferenceRange(obs, ctx);
  const interpretation = parseCd(child(obs, "interpretationCode"), ctx);
  const effectiveTime = parseIvlTs(child(obs, "effectiveTime"), ctx);
  const narrative = resolveNarrative(obs, narrativeById, ctx);

  const out: {
    ids: readonly II[];
    code?: CD;
    value?: ObservationValue;
    referenceRange?: ReferenceRange;
    interpretation?: CD;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids };
  if (code !== undefined) out.code = code;
  if (value !== undefined) out.value = value;
  if (referenceRange !== undefined) out.referenceRange = referenceRange;
  if (interpretation !== undefined) out.interpretation = interpretation;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}
