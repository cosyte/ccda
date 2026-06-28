/**
 * Procedures extraction — the three Procedure Activity templates a Procedures
 * section can carry: an altering/operative `<procedure>` (Procedure Activity
 * Procedure `…22.4.14`), a non-altering `<act>` service (Procedure Activity Act
 * `…22.4.12`), and an `<observation>` assessment (Procedure Activity Observation
 * `…22.4.13`). They share a shape — a procedure `code`, `statusCode`,
 * `effectiveTime` — and differ only in element name + template.
 *
 * **`moodCode` is safety-critical here.** A performed procedure (`EVN`) and a
 * planned/ordered one (`INT`/`RQO`/…) are **never conflated**: the mood is
 * modeled as a `disposition` of `"performed"` vs `"planned"`. A missing mood is
 * `PLANNED_VS_PERFORMED_AMBIGUOUS` (disposition left undefined); an unrecognized
 * mood is `PROCEDURE_MOOD_UNEXPECTED` — both extract the procedure, neither
 * guesses its disposition.
 */

import { attr, child, positionOf } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import type { II } from "../types/ii.js";
import { parseIvlTs, type IVL_TS } from "../types/ivl-ts.js";
import type { ParseCtx } from "../types/_shared.js";
import { plannedVsPerformedAmbiguous, procedureMoodUnexpected } from "../../parser/warnings.js";
import {
  PROCEDURE_ACTIVITY_ACT,
  PROCEDURE_ACTIVITY_OBSERVATION,
  PROCEDURE_ACTIVITY_PROCEDURE,
  childEntries,
  entryAct,
  idsOf,
  readNegation,
  reconcileCode,
  resolveNarrative,
  statusCodeOf,
} from "./shared.js";
import { readObservationValue, type ObservationValue } from "./observation.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Which of the three Procedure Activity templates an extracted procedure came
 * from — `"procedure"` (altering/operative), `"act"` (non-altering service), or
 * `"observation"` (assessment). Preserved so a consumer can tell an operative
 * act apart from a diagnostic observation without re-reading the DOM.
 *
 * @example
 * ```ts
 * import type { ProcedureKind } from "@cosyte/ccda";
 * const k: ProcedureKind = "procedure";
 * ```
 */
export type ProcedureKind = "procedure" | "act" | "observation";

/**
 * The performed-vs-planned disposition of a procedure, derived from its
 * `@moodCode`: `EVN` → `"performed"`; a planned mood (`INT`/`RQO`/`PRMS`/`PRP`/
 * `APT`/`ARQ`) → `"planned"`. Absent when the mood is missing or unrecognized —
 * never guessed, so a planned procedure is never read as performed.
 *
 * @example
 * ```ts
 * import type { ProcedureDisposition } from "@cosyte/ccda";
 * const d: ProcedureDisposition = "performed";
 * ```
 */
export type ProcedureDisposition = "performed" | "planned";

/**
 * A single procedure. `kind` is the template variant; `code` is the procedure
 * code (SNOMED CT / CPT / ICD-10-PCS / LOINC); `disposition` is the
 * performed-vs-planned reading of `moodCode`; `value` carries the result for the
 * observation variant. `negated` (a `negationInd` "did not happen") and
 * `nullFlavor` ("unknown") are kept distinct, never collapsed.
 *
 * @example
 * ```ts
 * import type { Procedure } from "@cosyte/ccda";
 * function wasPerformed(p: Procedure): boolean {
 *   return p.disposition === "performed";
 * }
 * ```
 */
export interface Procedure {
  readonly ids: readonly II[];
  readonly kind: ProcedureKind;
  readonly moodCode?: string;
  readonly disposition?: ProcedureDisposition;
  readonly negated?: boolean;
  readonly nullFlavor?: string;
  readonly statusCode?: string;
  readonly code?: CD;
  readonly value?: ObservationValue;
  readonly effectiveTime?: IVL_TS;
  readonly narrative?: string;
}

/** The element name + template root for each Procedure Activity variant. @internal */
const PROCEDURE_VARIANTS: ReadonlyArray<{
  readonly element: string;
  readonly root: string;
  readonly kind: ProcedureKind;
}> = [
  { element: "procedure", root: PROCEDURE_ACTIVITY_PROCEDURE, kind: "procedure" },
  { element: "act", root: PROCEDURE_ACTIVITY_ACT, kind: "act" },
  { element: "observation", root: PROCEDURE_ACTIVITY_OBSERVATION, kind: "observation" },
];

/** The HL7 ActMood codes that mark a *planned/ordered* (not performed) act. @internal */
const PLANNED_MOODS: ReadonlySet<string> = new Set(["INT", "RQO", "PRMS", "PRP", "APT", "ARQ"]);

/**
 * Extract every procedure from a Procedures `<section>` element. Each `<entry>`
 * whose `procedure`/`act`/`observation` carries one of the three Procedure
 * Activity templates becomes a {@link Procedure}. Never throws.
 *
 * @example
 * ```ts
 * import { extractProcedures } from "@cosyte/ccda";
 * const procedures = extractProcedures(sectionEl, section.narrativeById, ctx);
 * ```
 */
export function extractProcedures(
  sectionEl: Element,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): readonly Procedure[] {
  const out: Procedure[] = [];
  for (const entry of childEntries(sectionEl)) {
    for (const variant of PROCEDURE_VARIANTS) {
      const el = entryAct(entry, variant.root);
      if (el === undefined) continue;
      out.push(buildProcedure(el, variant.kind, narrativeById, ctx));
      break;
    }
  }
  return out;
}

/** Build one procedure from its act element. @internal */
function buildProcedure(
  el: Element,
  kind: ProcedureKind,
  narrativeById: ReadonlyMap<string, string>,
  ctx: ParseCtx,
): Procedure {
  const ids = idsOf(el, ctx);
  const moodCode = attr(el, "moodCode");
  const disposition = classifyMood(el, moodCode, ctx);
  const { negated, nullFlavor } = readNegation(el, ctx);
  const statusCode = statusCodeOf(el);

  const codeEl = child(el, "code");
  const code = parseCd(codeEl, ctx);
  const value = kind === "observation" ? readObservationValue(child(el, "value"), ctx) : undefined;
  const effectiveTime = parseIvlTs(child(el, "effectiveTime"), ctx);
  const narrative = resolveNarrative(el, narrativeById, ctx);
  reconcileCode(code, narrative, "procedure", positionOf(codeEl ?? el), ctx);

  const out: {
    ids: readonly II[];
    kind: ProcedureKind;
    moodCode?: string;
    disposition?: ProcedureDisposition;
    negated?: boolean;
    nullFlavor?: string;
    statusCode?: string;
    code?: CD;
    value?: ObservationValue;
    effectiveTime?: IVL_TS;
    narrative?: string;
  } = { ids, kind };
  if (moodCode !== undefined) out.moodCode = moodCode;
  if (disposition !== undefined) out.disposition = disposition;
  if (negated !== undefined) out.negated = negated;
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  if (statusCode !== undefined) out.statusCode = statusCode;
  if (code !== undefined) out.code = code;
  if (value !== undefined) out.value = value;
  if (effectiveTime !== undefined) out.effectiveTime = effectiveTime;
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}

/**
 * Classify a procedure's `@moodCode` into a {@link ProcedureDisposition}.
 * Emits `PLANNED_VS_PERFORMED_AMBIGUOUS` for a missing mood and
 * `PROCEDURE_MOOD_UNEXPECTED` for an unrecognized one — returning `undefined`
 * in both cases (disposition is never guessed). @internal
 */
function classifyMood(
  el: Element,
  moodCode: string | undefined,
  ctx: ParseCtx,
): ProcedureDisposition | undefined {
  if (moodCode === undefined) {
    ctx.emit(plannedVsPerformedAmbiguous(positionOf(el)));
    return undefined;
  }
  if (moodCode === "EVN") return "performed";
  if (PLANNED_MOODS.has(moodCode)) return "planned";
  ctx.emit(procedureMoodUnexpected(positionOf(el), moodCode));
  return undefined;
}
