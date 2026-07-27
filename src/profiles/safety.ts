/**
 * The safety spine of the profile subsystem: the set of {@link WarningCode}s a
 * profile is **forbidden** to tolerate. A vendor profile exists to quiet known,
 * benign structural/version/deprecation noise, never to hide a deviation that
 * could change a clinical reading. Every code below flags a **safety-critical**
 * condition from the roadmap's §4 harm-ordered list (patient identity, the
 * allergy negation/granularity distinction, dose/route/unit, planned-vs-
 * performed, code↔narrative disagreement, unhandled value types, or a missing
 * required section); tolerating any of them is refused at *definition time* by
 * `defineCcdaProfile`, so no profile, built-in or user-authored, can ever
 * downgrade one to an "expected" quirk.
 *
 * This list is deliberately conservative: when a code's clinical bearing is
 * ambiguous, it belongs here. Adding a code here can only *forbid more*; it
 * never relaxes an existing profile silently (a profile that named it would
 * start throwing, a loud, reviewable failure).
 */

import { WARNING_CODES, type WarningCode } from "../parser/warnings.js";

/**
 * Build a genuinely immutable `ReadonlySet` view over a fixed list of values.
 *
 * `Object.freeze(new Set(...))` does **not** do this. Freezing seals an
 * object's own properties, while `Set.prototype.add` / `delete` / `clear`
 * mutate the set's internal slot, which `Object.freeze` does not touch, so
 * `frozen.delete(code)` succeeds and returns `true`. That made the freeze on
 * this set decorative: anything holding the exported reference could have
 * removed a safety-critical code at runtime and re-opened the very gate
 * `defineCcdaProfile` refuses at definition time.
 *
 * The fix is a frozen façade that exposes only the read half of the `Set`
 * surface, delegating to a `Set` closed over in this module and reachable from
 * nowhere else. `add` / `delete` / `clear` are not properties of the result at
 * all, so calling one throws `TypeError` rather than quietly succeeding, and
 * the freeze then stops anyone bolting one on.
 *
 * @internal
 */
function immutableSet<T>(values: readonly T[]): ReadonlySet<T> {
  const inner = new Set<T>(values);
  const view: ReadonlySet<T> = Object.freeze({
    get size() {
      return inner.size;
    },
    has: (value: T) => inner.has(value),
    forEach: (
      callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void,
      thisArg?: unknown,
    ) => {
      for (const v of inner) callbackfn.call(thisArg, v, v, view);
    },
    keys: () => inner.keys(),
    values: () => inner.values(),
    entries: () => inner.entries(),
    [Symbol.iterator]: () => inner[Symbol.iterator](),
  });
  return view;
}

/**
 * Warning codes no profile may list in its `tolerate` set. Genuinely immutable:
 * it exposes only the read half of the `Set` surface and is frozen, so a
 * safety-critical code cannot be deleted at runtime to smuggle it past the
 * gate. (`Object.freeze(new Set(...))` would **not** achieve this, `delete`
 * mutates an internal slot a freeze does not reach.)
 *
 * @example
 * ```ts
 * import { SAFETY_CRITICAL_CODES } from "@cosyte/ccda";
 * console.log(SAFETY_CRITICAL_CODES.has("MISSING_DOSE_QUANTITY")); // true
 * ```
 */
export const SAFETY_CRITICAL_CODES: ReadonlySet<WarningCode> = immutableSet<WarningCode>([
  // Patient identity, wrong patient is catastrophic.
  WARNING_CODES.MISSING_ASSIGNING_AUTHORITY,
  WARNING_CODES.MULTIPLE_RECORD_TARGETS,
  // Allergy safety, the negation/granularity distinctions must never be quieted.
  WARNING_CODES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS,
  WARNING_CODES.ALLERGEN_GRANULARITY_SUSPECT,
  // Medication safety, dose / route / timing.
  WARNING_CODES.MISSING_DOSE_QUANTITY,
  WARNING_CODES.MISSING_ROUTE_CODE,
  WARNING_CODES.MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED,
  // Results / vitals units, a wrong unit silently corrupts the value.
  WARNING_CODES.NON_UCUM_UNIT,
  WARNING_CODES.UCUM_CASE_SUSPECT,
  WARNING_CODES.MISSING_UNIT_ON_PQ,
  // Value integrity, code↔narrative disagreement and unmodeled value types.
  WARNING_CODES.CODE_NARRATIVE_MISMATCH,
  WARNING_CODES.NARRATIVE_REFERENCE_BROKEN,
  WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED,
  // Wrong/unknown code system for a clinical slot, the same "can't vouch for
  // this code" harm family as CODE_NARRATIVE_MISMATCH; fires on the
  // problem / medication / allergen / route / vaccine slots. Distinct from
  // DEPRECATED_CODE_SYSTEM (a *known* legacy system with preserved meaning,
  // which is defensibly tolerable), this is an *unexpected/wrong* one.
  WARNING_CODES.UNEXPECTED_CODE_SYSTEM,
  // No code system at all on an asserted code, strictly worse than
  // UNEXPECTED_CODE_SYSTEM: there the system is wrong but known, so a reader
  // can still tell what was meant; here the symbol names no terminology, and
  // "250.00" is diabetes in ICD-9-CM and something else elsewhere. It is also
  // the *lone* signal, exactly the MALFORMED_DATETIME argument: with no
  // system the value can never reach a TerminologyAdapter (which validates a
  // system + code pair), so SEMANTIC_CODE_INVALID can never fire behind it.
  // Tolerating it would restore the silent-pass defect it exists to fix.
  // Provenance, stated so it is not mistaken for a traced constraint: no
  // normative SHALL is cited (the CD datatype leaves @codeSystem optional).
  // The classification rests on the harm ordering above, which is what this
  // set has always encoded, per the "when clinical bearing is ambiguous it
  // belongs here" rule in this file's header.
  WARNING_CODES.MISSING_CODE_SYSTEM,
  // The mirror of MISSING_CODE_SYSTEM: a coded slot that is present but names
  // no symbol and declares no nullFlavor. A system without a code identifies a
  // concept no better than a code without a system, and the missing
  // `nullFlavor` is precisely what makes it undeclared rather than a
  // conforming "unknown". Same classification as MISSING_DOSE_QUANTITY, and
  // for the same reason: an undeclared absence at a safety-critical slot,
  // where a reader cannot tell an absent concept from one lost in
  // transformation. It is also effectively the lone signal: with no symbol there
  // is nothing for a TerminologyAdapter to recognise, so SEMANTIC_CODE_INVALID
  // is not a signal that can be relied on behind it.
  WARNING_CODES.MISSING_CODE_VALUE,
  // A substanceAdministration with no coded product on any arm the parser
  // reads: the drug or vaccine identity itself is missing. Strictly worse than
  // MISSING_DOSE_QUANTITY (already here), which loses how much of a known
  // drug; this loses *which drug*, while dose, route and timing survive and
  // make the record look complete. Never tolerable.
  WARNING_CODES.MISSING_PRODUCT_CODE,
  // A nullFlavor asserted beside a populated value, e.g. a doseQuantity that
  // says both "unknown" and "10 mg". The document contradicts itself, and of
  // the two readings the reassuring one is the one that can hurt a patient,
  // which is the whole harm this file's ordering exists to encode. It is the
  // lone signal on the shapes where the derived reading is withheld (a PQ
  // with no `value` never reaches MISSING_UNIT_ON_PQ, a TS with no `date`
  // never reaches MALFORMED_DATETIME), and on the shapes where the value is
  // kept (CD, II, ST, ED, BL) it is the *only* thing standing between a naive
  // consumer and a value the document disowned. Tolerating it would restore
  // the silent pass in both directions. Provenance, stated so it is not
  // mistaken for a traced constraint: no normative SHALL is cited, the CDA R2
  // schema declares nullFlavor and the value attributes independently. The
  // classification rests on v3 datatype semantics (a nullFlavor marks an
  // exceptional value, one with no proper value) and on the harm ordering.
  WARNING_CODES.CONTRADICTORY_NULL_FLAVOR,
  // A malformed HL7 v3 datetime, medication timing / problem active-vs-
  // resolved (effectiveTime) is safety-critical, and the parsed date is
  // *already dropped* on malformation, so this warning is the only surviving
  // signal that a datetime was lost. Never quiet the lone signal.
  WARNING_CODES.MALFORMED_DATETIME,
  // Status / mood, active-vs-resolved and planned-vs-performed conflation.
  WARNING_CODES.PROBLEM_STATUS_INDETERMINATE,
  WARNING_CODES.PLANNED_VS_PERFORMED_AMBIGUOUS,
  WARNING_CODES.PROCEDURE_MOOD_UNEXPECTED,
  // Conformance floor, a missing SHALL section is a real gap, not vendor noise.
  WARNING_CODES.REQUIRED_SECTION_MISSING,
  // The profile marker itself is not a tolerable deviation.
  WARNING_CODES.PROFILE_QUIRK_APPLIED,
]);

/**
 * True when `code` is safety-critical and therefore forbidden in a profile's
 * `tolerate` set.
 *
 * @example
 * ```ts
 * import { isSafetyCriticalCode } from "@cosyte/ccda";
 * console.log(isSafetyCriticalCode("DEPRECATED_LOINC")); // false
 * console.log(isSafetyCriticalCode("CODE_NARRATIVE_MISMATCH")); // true
 * ```
 */
export function isSafetyCriticalCode(code: WarningCode): boolean {
  return SAFETY_CRITICAL_CODES.has(code);
}
