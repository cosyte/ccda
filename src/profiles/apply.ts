/**
 * The runtime side of the profile subsystem: turning an active
 * {@link CcdaProfile} into a warning transform the parser's emitter runs. A
 * profile never touches extracted clinical values — it operates purely at the
 * warning layer, downgrading a deviation it *expects* into a
 * `PROFILE_QUIRK_APPLIED` warning (flagged `expected`, carrying the original
 * `toleratedCode`) while leaving every un-expected warning untouched.
 *
 * This is deliberately a pure function over one warning at a time: it composes
 * with strict mode and the caller's `onWarning` without knowing about either.
 */

import { profileQuirkApplied, type CcdaWarning } from "../parser/warnings.js";

import type { CcdaProfile, QuirkTolerance } from "./types.js";

/**
 * Does `tolerance` apply to `warning`? The codes must match, and every
 * structural key present in the tolerance's `match` must equal the warning's
 * position — a tolerance with no `match` applies to every warning of its code.
 * Matching is on PHI-free structural identifiers only (section LOINC code,
 * template OID).
 *
 * @internal
 */
function toleranceApplies(tolerance: QuirkTolerance, warning: CcdaWarning): boolean {
  if (tolerance.code !== warning.code) return false;
  const match = tolerance.match;
  if (match === undefined) return true;
  if (match.sectionCode !== undefined && warning.position.sectionCode !== match.sectionCode) {
    return false;
  }
  if (match.templateId !== undefined && warning.position.templateId !== match.templateId) {
    return false;
  }
  return true;
}

/**
 * Apply a profile to a single warning. Returns a downgraded
 * `PROFILE_QUIRK_APPLIED` warning when the profile expects this deviation;
 * otherwise returns the original warning unchanged (referential identity
 * preserved, so an un-tolerated warning is never reallocated). A warning that
 * is already `expected` (e.g. re-processed) is passed through untouched.
 *
 * @example
 * ```ts
 * import { applyProfile, ccdaProfiles, deprecatedLoinc } from "@cosyte/ccda";
 * const w = deprecatedLoinc({ path: "code" }, "41909-3");
 * const out = applyProfile(ccdaProfiles.smartScorecard, w);
 * console.log(out.code); // "PROFILE_QUIRK_APPLIED"
 * console.log(out.toleratedCode); // "DEPRECATED_LOINC"
 * ```
 */
export function applyProfile(profile: CcdaProfile, warning: CcdaWarning): CcdaWarning {
  if (warning.expected === true) return warning;
  for (const tolerance of profile.tolerate) {
    if (toleranceApplies(tolerance, warning)) {
      return profileQuirkApplied(warning, profile.name);
    }
  }
  return warning;
}

/**
 * Wrap a downstream warning sink so every warning first passes through
 * `profile`'s tolerance transform. Returned unchanged (`next`) when `profile`
 * is `undefined`, so the no-profile path pays nothing.
 *
 * @example
 * ```ts
 * import { wrapEmitterWithProfile } from "@cosyte/ccda";
 * const emit = wrapEmitterWithProfile(baseEmit, activeProfile);
 * ```
 */
export function wrapEmitterWithProfile(
  next: (warning: CcdaWarning) => void,
  profile: CcdaProfile | undefined,
): (warning: CcdaWarning) => void {
  if (profile === undefined) return next;
  return (warning) => {
    next(applyProfile(profile, warning));
  };
}
