/**
 * PQ, HL7 v3 Physical Quantity. A dimensioned number: a `@value` and an
 * optional `@unit` (UCUM). The raw value string is preserved alongside the
 * parsed number so a non-numeric `@value` is never silently coerced.
 */

import { attr } from "../dom.js";
import { contradictsAssertedValue, readNullFlavor, type ParseCtx } from "./_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Physical Quantity. `value` is the parsed number (omitted when
 * `@value` was non-numeric), `raw` is the verbatim `@value` string, and `unit`
 * is the UCUM unit when present.
 *
 * @example
 * ```ts
 * import type { PQ } from "@cosyte/ccda";
 * const dose: PQ = { value: 81, raw: "81", unit: "mg" };
 * ```
 */
export interface PQ {
  readonly value?: number;
  readonly raw?: string;
  readonly unit?: string;
  readonly nullFlavor?: string;
}

/**
 * Parse a `PQ` element into a typed {@link PQ}. Returns `undefined` when the
 * element is absent. A non-numeric `@value` is preserved in `raw` with `value`
 * omitted. Never throws.
 *
 * **A `@nullFlavor` beside a populated `@value` is a contradiction, and the
 * parser resolves it against the number.** `<doseQuantity nullFlavor="UNK"
 * value="10" unit="mg"/>` asserts both "this quantity is unknown" and "this
 * quantity is 10 mg". The parser emits `CONTRADICTORY_NULL_FLAVOR`, preserves
 * `raw` (`"10"`), `unit` (`"mg"`) and `nullFlavor` (`"UNK"`) verbatim, and
 * **omits `value`**, so `med.dose.value` is `undefined` rather than `10`.
 *
 * The reasoning, because the choice is not obvious and a warning alone was the
 * alternative. A warning alone keeps the house rule (never coerce, surface
 * verbatim, flag) but leaves the dangerous affordance intact: `dose.value`
 * still hands back `10` to the many consumers who do not read `warnings` on a
 * first integration, and of the two readings the reassuring one is the one that
 * can hurt a patient. Withholding costs nothing, because `value` is not the
 * document's bytes, it is a `number` **this parser manufactured** by
 * interpreting `raw`, and `raw` is still right there. So nothing the document
 * said is lost, and the type now forces a caller to look at what it said.
 *
 * That is also exactly what `MALFORMED_DATETIME` already does one datatype
 * over, `TS` keeps `raw` and drops the parsed `date`, so this is the existing
 * rule applied to a second reason for not trusting an interpretation, not a new
 * one.
 *
 * **The limit, stated rather than implied.** Withholding applies only where a
 * verbatim copy survives beside the derived reading, which in this model is
 * `PQ.value` and `TS.date` and nothing else. On `CD`, `II`, `ST`, `ED` and `BL`
 * the value-bearing field *is* the document's own text (`@code`, `@extension`,
 * the element's content), with no second copy, so withholding it would delete
 * what the document said rather than decline to embellish it. Those datatypes
 * therefore warn and keep the field: after this change a naive consumer reading
 * `allergy.allergen.code` still gets the code, with `nullFlavor` on the same
 * object and `CONTRADICTORY_NULL_FLAVOR` in `warnings`.
 *
 * One consequence worth naming: a contradictory PQ no longer reaches
 * `MISSING_UNIT_ON_PQ` (which keys off a defined `value`). That is not a new
 * silence, the stronger `CONTRADICTORY_NULL_FLAVOR` fires in its place, and a
 * missing unit on a value the document declared null is moot.
 *
 * @example
 * ```ts
 * import { parsePq } from "@cosyte/ccda";
 * const pq = parsePq(el, { emit: () => {} });
 * console.log(pq?.value, pq?.unit);
 * ```
 */
export function parsePq(el: Element | undefined, ctx: ParseCtx): PQ | undefined {
  if (el === undefined) return undefined;
  const out: { value?: number; raw?: string; unit?: string; nullFlavor?: string } = {};
  const raw = attr(el, "value");
  if (raw !== undefined) out.raw = raw;
  const unit = attr(el, "unit");
  if (unit !== undefined) out.unit = unit;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  // A `@unit` with no `@value` is a dimension without a magnitude, coherent
  // beside a nullFlavor rather than contradictory, so only `@value` counts.
  const contradicted = contradictsAssertedValue(el, "PQ", nullFlavor, raw !== undefined, ctx);
  if (raw !== undefined && !contradicted) {
    const num = Number(raw);
    if (!Number.isNaN(num) && raw.trim() !== "") out.value = num;
  }
  return out;
}

/**
 * Strip the derived `value` from an already-parsed {@link PQ}, keeping every
 * verbatim field. Used when the *containing* interval declares itself null, so
 * the same "preserve the bytes, decline the interpretation" rule reaches a
 * bound whose own element carried no `nullFlavor`.
 *
 * @internal
 */
export function pqWithoutDerivedValue(pq: PQ): PQ {
  if (pq.value === undefined) return pq;
  const { value: _dropped, ...rest } = pq;
  return rest;
}
