/**
 * The safety spine of the profile subsystem: the set of {@link WarningCode}s a
 * profile is **forbidden** to tolerate. A vendor profile exists to quiet known,
 * benign structural/version/deprecation noise — never to hide a deviation that
 * could change a clinical reading. Every code below flags a **safety-critical**
 * condition from the roadmap's §4 harm-ordered list (patient identity, the
 * allergy negation/granularity distinction, dose/route/unit, planned-vs-
 * performed, code↔narrative disagreement, unhandled value types, or a missing
 * required section); tolerating any of them is refused at *definition time* by
 * `defineCcdaProfile`, so no profile — built-in or user-authored — can ever
 * downgrade one to an "expected" quirk.
 *
 * This list is deliberately conservative: when a code's clinical bearing is
 * ambiguous, it belongs here. Adding a code here can only *forbid more*; it
 * never relaxes an existing profile silently (a profile that named it would
 * start throwing, a loud, reviewable failure).
 */

import { WARNING_CODES, type WarningCode } from "../parser/warnings.js";

/**
 * Warning codes no profile may list in its `tolerate` set. Frozen so it cannot
 * be mutated at runtime to smuggle a safety-critical code past the gate.
 *
 * @example
 * ```ts
 * import { SAFETY_CRITICAL_CODES } from "@cosyte/ccda";
 * console.log(SAFETY_CRITICAL_CODES.has("MISSING_DOSE_QUANTITY")); // true
 * ```
 */
export const SAFETY_CRITICAL_CODES: ReadonlySet<WarningCode> = Object.freeze(
  new Set<WarningCode>([
    // Patient identity — wrong patient is catastrophic.
    WARNING_CODES.MISSING_ASSIGNING_AUTHORITY,
    WARNING_CODES.MULTIPLE_RECORD_TARGETS,
    // Allergy safety — the negation/granularity distinctions must never be quieted.
    WARNING_CODES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS,
    WARNING_CODES.ALLERGEN_GRANULARITY_SUSPECT,
    // Medication safety — dose / route / timing.
    WARNING_CODES.MISSING_DOSE_QUANTITY,
    WARNING_CODES.MISSING_ROUTE_CODE,
    WARNING_CODES.MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED,
    // Results / vitals units — a wrong unit silently corrupts the value.
    WARNING_CODES.NON_UCUM_UNIT,
    WARNING_CODES.UCUM_CASE_SUSPECT,
    WARNING_CODES.MISSING_UNIT_ON_PQ,
    // Value integrity — code↔narrative disagreement and unmodeled value types.
    WARNING_CODES.CODE_NARRATIVE_MISMATCH,
    WARNING_CODES.NARRATIVE_REFERENCE_BROKEN,
    WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED,
    // Wrong/unknown code system for a clinical slot — the same "can't vouch for
    // this code" harm family as CODE_NARRATIVE_MISMATCH; fires on the
    // problem / medication / allergen / route / vaccine slots. Distinct from
    // DEPRECATED_CODE_SYSTEM (a *known* legacy system with preserved meaning,
    // which is defensibly tolerable) — this is an *unexpected/wrong* one.
    WARNING_CODES.UNEXPECTED_CODE_SYSTEM,
    // A malformed HL7 v3 datetime — medication timing / problem active-vs-
    // resolved (effectiveTime) is safety-critical, and the parsed date is
    // *already dropped* on malformation, so this warning is the only surviving
    // signal that a datetime was lost. Never quiet the lone signal.
    WARNING_CODES.MALFORMED_DATETIME,
    // Status / mood — active-vs-resolved and planned-vs-performed conflation.
    WARNING_CODES.PROBLEM_STATUS_INDETERMINATE,
    WARNING_CODES.PLANNED_VS_PERFORMED_AMBIGUOUS,
    WARNING_CODES.PROCEDURE_MOOD_UNEXPECTED,
    // Conformance floor — a missing SHALL section is a real gap, not vendor noise.
    WARNING_CODES.REQUIRED_SECTION_MISSING,
    // The profile marker itself is not a tolerable deviation.
    WARNING_CODES.PROFILE_QUIRK_APPLIED,
  ]),
);

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
