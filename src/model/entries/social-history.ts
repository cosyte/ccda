/**
 * Social History extraction — currently the Smoking Status — Meaningful Use
 * observation (`…22.4.78`), the safety-relevant social-history fact most
 * consumers ask for. The observation carries a LOINC `code` (`72166-2`,
 * "Tobacco smoking status") and a SNOMED CT `value` drawn from the Current
 * Smoking Status value set (`2.16.840.1.113883.11.20.9.38`).
 *
 * "Unknown" is modeled explicitly: a `nullFlavor` value, or one of the SNOMED
 * "unknown if ever smoked" / "current status unknown" concepts, sets
 * `unknown: true` and emits `SMOKING_STATUS_UNKNOWN` — never silently dropped
 * or read as "never smoked". A coded value outside the value set is preserved
 * verbatim and flagged `SMOKING_STATUS_CODE_UNRECOGNIZED`.
 */

import { child, positionOf } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import { smokingStatusCodeUnrecognized, smokingStatusUnknown } from "../../parser/warnings.js";
import {
  SMOKING_STATUS_OBSERVATION,
  childEntries,
  entryAct,
  idsOf,
  resolveNarrative,
  statusCodeOf,
} from "./shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * A Smoking Status observation. `value` is the SNOMED CT smoking-status concept;
 * `unknown` is `true` when the status is explicitly unknown (a `nullFlavor` or
 * an "unknown" SNOMED concept) — distinct from simply absent. `effectiveTime` is
 * when the status was recorded.
 *
 * @example
 * ```ts
 * import type { SmokingStatus } from "@cosyte/ccda";
 * function isFormerSmoker(s: SmokingStatus): boolean {
 *   return s.value?.code === "8517006";
 * }
 * ```
 */
export interface SmokingStatus {
  readonly ids: readonly II[];
  readonly statusCode?: string;
  readonly value?: CD;
  readonly unknown: boolean;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/**
 * The SNOMED CT codes of the Current Smoking Status value set
 * (`2.16.840.1.113883.11.20.9.38`). A value outside this set is unrecognized.
 * @internal
 */
const SMOKING_STATUS_VALUE_SET: ReadonlySet<string> = new Set([
  "449868002", // Current every day smoker
  "428041000124106", // Current some day smoker
  "8517006", // Former smoker
  "266919005", // Never smoker
  "77176002", // Smoker, current status unknown
  "266927001", // Unknown if ever smoked
  "428071000124103", // Current heavy tobacco smoker
  "428061000124105", // Current light tobacco smoker
]);

/**
 * The value-set members that denote an *unknown* smoking status (as opposed to a
 * definite smoker/non-smoker reading). @internal
 */
const UNKNOWN_SMOKING_CODES: ReadonlySet<string> = new Set([
  "77176002", // Smoker, current status unknown
  "266927001", // Unknown if ever smoked
]);

/**
 * Extract every Smoking Status observation from a Social History `<section>`
 * element. Each `<entry>` whose `observation` carries the Smoking Status —
 * Meaningful Use template becomes a {@link SmokingStatus}. Never throws.
 *
 * @example
 * ```ts
 * import { extractSmokingStatus } from "@cosyte/ccda";
 * const statuses = extractSmokingStatus(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractSmokingStatus(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly SmokingStatus[] {
  const out: SmokingStatus[] = [];
  for (const entry of childEntries(sectionEl)) {
    const obs = entryAct(entry, SMOKING_STATUS_OBSERVATION);
    if (obs === undefined) continue;
    out.push(buildSmokingStatus(obs, narrativeById, ctx));
  }
  return out;
}

/** Build one Smoking Status observation. @internal */
function buildSmokingStatus(
  obs: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): SmokingStatus {
  const ids = idsOf(obs, ctx);
  const statusCode = statusCodeOf(obs);
  const valueEl = child(obs, "value");
  const value = parseCd(valueEl, ctx);
  const effectiveTime = parseIvlTs(child(obs, "effectiveTime"), ctx);
  const narrative = resolveNarrative(obs, narrativeById, ctx);

  const unknown = judgeSmokingValue(value, positionOf(valueEl ?? obs), ctx);

  const out: {
    ids: readonly II[];
    statusCode?: string;
    value?: CD;
    unknown: boolean;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids, unknown };
  if (statusCode !== undefined) out.statusCode = statusCode;
  if (value !== undefined) out.value = value;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}

/**
 * Decide whether a smoking-status value is unknown and flag an out-of-value-set
 * code. Returns `true` for a `nullFlavor` or an "unknown" SNOMED concept
 * (emitting `SMOKING_STATUS_UNKNOWN`); emits `SMOKING_STATUS_CODE_UNRECOGNIZED`
 * for a code outside the value set. @internal
 */
function judgeSmokingValue(
  value: CD | undefined,
  position: ReturnType<typeof positionOf>,
  ctx: ParseCtx,
): boolean {
  if (value === undefined) return false;
  if (value.nullFlavor !== undefined) {
    ctx.emit(smokingStatusUnknown(position));
    return true;
  }
  const code = value.code;
  if (code === undefined) return false;
  if (UNKNOWN_SMOKING_CODES.has(code)) {
    ctx.emit(smokingStatusUnknown(position));
    return true;
  }
  if (!SMOKING_STATUS_VALUE_SET.has(code)) {
    ctx.emit(smokingStatusCodeUnrecognized(position, code));
  }
  return false;
}
