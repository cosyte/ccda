/**
 * Shared observation-value machinery for the discrete-data extractors (Results,
 * Vital Signs). A clinical observation's `value` is polymorphic — its concrete
 * HL7 v3 datatype is selected by `xsi:type` (a `PQ` measurement, a `CD`/`CE`
 * coded result, a free-text `ST`, an `IVL_PQ` range) — so this module reads it
 * into a discriminated {@link ObservationValue} union, runs the **computable
 * UCUM** unit check on any physical quantity, and reads a result's reference
 * range. The lenient invariant holds throughout: an unrecognized `xsi:type` is
 * preserved as an `unsupported` value (nothing dropped), and a `PQ` with a
 * non-UCUM unit keeps its raw unit string — units are never normalized away.
 */

import { attr, child, positionOf, text, xsiType } from "../dom.js";
import { parseCd, type CD } from "../types/cd.js";
import { parsePq, type PQ } from "../types/pq.js";
import { parseIvlPq, type IVL_PQ } from "../types/ivl-pq.js";
import type { ParseCtx } from "../types/_shared.js";
import { isUcumCaseSuspect, isValidUcumUnit } from "../ucum.js";
import type { CcdaPosition } from "../../parser/types.js";
import {
  freeTextReferenceRange,
  missingUnitOnPq,
  nonUcumUnit,
  resultValueTypeUnhandled,
  ucumCaseSuspect,
} from "../../parser/warnings.js";
import type { Element } from "@xmldom/xmldom";

/**
 * A parsed observation `value`, discriminated on `kind`. `physicalQuantity`
 * carries a UCUM-checked {@link PQ}; `coded` a {@link CD}; `string` a free-text
 * value; `integer` a count/score (`xsi:type="INT"`, the type C-CDA prefers for
 * an assessment-scale score — units are not allowed on an `INT`); `range` an
 * {@link IVL_PQ}. `unsupported` preserves an `xsi:type` the model does not
 * specialize (with any raw text) so nothing is ever discarded. `integer` keeps
 * `value` and `nullFlavor` distinct — a scored `INT` never collapses into an
 * unknown one, and vice versa.
 *
 * @example
 * ```ts
 * import type { ObservationValue } from "@cosyte/ccda";
 * function numeric(v: ObservationValue): number | undefined {
 *   if (v.kind === "physicalQuantity") return v.quantity.value;
 *   return v.kind === "integer" ? v.value : undefined;
 * }
 * ```
 */
export type ObservationValue =
  | { readonly kind: "physicalQuantity"; readonly quantity: PQ }
  | { readonly kind: "coded"; readonly code: CD }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "integer"; readonly value?: number; readonly nullFlavor?: string }
  | { readonly kind: "range"; readonly range: IVL_PQ }
  | { readonly kind: "unsupported"; readonly xsiType?: string; readonly raw?: string };

/**
 * A result's reference range. `low`/`high` are the structured numeric bounds (an
 * `IVL_PQ`); `text` is the free-text form (preserved when present). A range with
 * no structured bounds emits `FREE_TEXT_REFERENCE_RANGE` — it cannot be compared
 * numerically against the result value.
 *
 * @example
 * ```ts
 * import type { ReferenceRange } from "@cosyte/ccda";
 * const r: ReferenceRange = { low: { value: 3.5, unit: "g/dL" }, high: { value: 5, unit: "g/dL" } };
 * ```
 */
export interface ReferenceRange {
  readonly low?: PQ;
  readonly high?: PQ;
  readonly text?: string;
}

/**
 * Validate a {@link PQ}'s `@unit` with the computable UCUM grammar, emitting the
 * appropriate Tier-2 warning: `MISSING_UNIT_ON_PQ` (numeric value, no unit),
 * `UCUM_CASE_SUSPECT` (a letter-case slip of a canonical unit), or
 * `NON_UCUM_UNIT` (not well-formed UCUM). The quantity itself is never mutated —
 * the raw unit is always preserved.
 *
 * @example
 * ```ts
 * import { checkUcumUnit } from "@cosyte/ccda";
 * checkUcumUnit({ value: 5, unit: "cc" }, { path: "value" }, ctx);
 * ```
 */
export function checkUcumUnit(quantity: PQ, position: CcdaPosition, ctx: ParseCtx): void {
  const unit = quantity.unit;
  if (unit === undefined) {
    if (quantity.value !== undefined) ctx.emit(missingUnitOnPq(position));
    return;
  }
  if (isUcumCaseSuspect(unit)) {
    ctx.emit(ucumCaseSuspect(position, unit));
    return;
  }
  if (!isValidUcumUnit(unit)) ctx.emit(nonUcumUnit(position, unit));
}

/**
 * Read a polymorphic observation `<value>` into an {@link ObservationValue},
 * branching on `xsi:type`. A `PQ` is UCUM-checked; an untyped value with a
 * `@code`/`@value` is treated leniently as coded/quantity; an unrecognized
 * `xsi:type` is preserved as `unsupported` and flagged with
 * `RESULT_VALUE_TYPE_UNHANDLED`. Returns `undefined` when the element is absent.
 *
 * @example
 * ```ts
 * import { readObservationValue } from "@cosyte/ccda";
 * const v = readObservationValue(child(obs, "value"), ctx);
 * ```
 */
export function readObservationValue(
  valueEl: Element | undefined,
  ctx: ParseCtx,
): ObservationValue | undefined {
  if (valueEl === undefined) return undefined;
  const position = positionOf(valueEl);
  const t = xsiType(valueEl) ?? inferType(valueEl);

  switch (t) {
    case "PQ": {
      const quantity = parsePq(valueEl, ctx);
      if (quantity === undefined) return undefined;
      checkUcumUnit(quantity, position, ctx);
      return { kind: "physicalQuantity", quantity };
    }
    case "CD":
    case "CE": {
      const code = parseCd(valueEl, ctx);
      return code === undefined ? undefined : { kind: "coded", code };
    }
    case "ST": {
      const value = text(valueEl);
      return value === undefined ? undefined : { kind: "string", value };
    }
    case "INT": {
      // A count/score (an assessment-scale score, a questionnaire answer). Units
      // are not allowed on an INT, so there is no UCUM check. Value and nullFlavor
      // are read as distinct fields — an explicit-unknown score (nullFlavor="UNK")
      // is never collapsed into a real one, nor a real one dropped.
      const raw = attr(valueEl, "value");
      const nullFlavor = attr(valueEl, "nullFlavor");
      if (raw !== undefined) {
        // Strict numeric parse — reject whitespace-only / non-numeric so a malformed
        // INT is never coerced into a fabricated score (e.g. Number(" ") === 0). An
        // un-parseable @value is preserved + flagged (Postel: never a silent drop),
        // exactly as any other unhandled typed value.
        const trimmed = raw.trim();
        const n = trimmed === "" ? Number.NaN : Number(trimmed);
        if (!Number.isFinite(n)) return readUnsupported(valueEl, "INT", position, ctx);
        const out: { kind: "integer"; value: number; nullFlavor?: string } = {
          kind: "integer",
          value: n,
        };
        if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
        return out;
      }
      // No @value: an explicit-unknown score (nullFlavor="UNK") or a bare INT — read
      // as an integer with no number, never a fabricated one, and never a warning
      // (a nullFlavor score is a legitimate, spec-clean "unknown").
      const out: { kind: "integer"; nullFlavor?: string } = { kind: "integer" };
      if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
      return out;
    }
    case "IVL_PQ": {
      const range = parseIvlPq(valueEl, ctx);
      if (range === undefined) return undefined;
      if (range.low !== undefined) checkUcumUnit(range.low, position, ctx);
      if (range.high !== undefined) checkUcumUnit(range.high, position, ctx);
      return { kind: "range", range };
    }
    case undefined:
    default:
      return readUnsupported(valueEl, t, position, ctx);
  }
}

/**
 * Read a result's reference range from a Result Observation. Prefers the
 * structured `observationRange/value xsi:type="IVL_PQ"` bounds; falls back to
 * the free-text form (emitting `FREE_TEXT_REFERENCE_RANGE`). Returns `undefined`
 * when the observation carries no `referenceRange`.
 *
 * @example
 * ```ts
 * import { readReferenceRange } from "@cosyte/ccda";
 * const range = readReferenceRange(resultObs, ctx);
 * ```
 */
export function readReferenceRange(obs: Element, ctx: ParseCtx): ReferenceRange | undefined {
  const rr = child(obs, "referenceRange");
  if (rr === undefined) return undefined;
  const range = child(rr, "observationRange") ?? rr;

  const out: { low?: PQ; high?: PQ; text?: string } = {};
  let structured = false;
  const valueEl = child(range, "value");
  if (valueEl !== undefined && xsiType(valueEl) === "IVL_PQ") {
    const ivl = parseIvlPq(valueEl, ctx);
    if (ivl?.low !== undefined) {
      out.low = ivl.low;
      structured = true;
    }
    if (ivl?.high !== undefined) {
      out.high = ivl.high;
      structured = true;
    }
  }

  const textEl = child(range, "text");
  const txt = textEl === undefined ? undefined : text(textEl);
  if (txt !== undefined) out.text = txt;

  if (!structured) ctx.emit(freeTextReferenceRange(positionOf(rr)));
  return Object.keys(out).length === 0 ? undefined : out;
}

/** Preserve an unrecognized/untyped value as `unsupported`, flagging a typed one. @internal */
function readUnsupported(
  valueEl: Element,
  t: string | undefined,
  position: CcdaPosition,
  ctx: ParseCtx,
): ObservationValue {
  if (t !== undefined) ctx.emit(resultValueTypeUnhandled(position, t));
  const raw = text(valueEl);
  const out: { kind: "unsupported"; xsiType?: string; raw?: string } = { kind: "unsupported" };
  if (t !== undefined) out.xsiType = t;
  if (raw !== undefined) out.raw = raw;
  return out;
}

/** Best-effort type for a value with no `xsi:type` (vendor quirk). @internal */
function inferType(valueEl: Element): string | undefined {
  if (attr(valueEl, "code") !== undefined) return "CD";
  if (attr(valueEl, "value") !== undefined) return "PQ";
  return undefined;
}
