/**
 * The profile **registry**: the named built-in set (with provenance) plus a
 * process-scoped default. Mirrors the sibling `@cosyte/hl7`
 * `setDefaultProfile`/`getDefaultProfile` convention. `parseCcda(raw)` with no
 * explicit `profile` option consults {@link getDefaultCcdaProfile}; an explicit
 * `profile` option always wins, and `profile: null` opts out of the default for
 * a single call.
 *
 * The single mutable module-scoped `let` is the only such state in the profile
 * subsystem — an intentional, documented trade-off (identical to the sibling).
 * Tests that set a default MUST clear it in teardown (`setDefaultCcdaProfile(null)`)
 * to avoid cross-test bleed.
 */

import { defaultProfile } from "./default.js";
import { legacyR11 } from "./legacy-r11.js";
import { smartScorecard } from "./smart-scorecard.js";
import type { CcdaProfile } from "./types.js";

/**
 * The built-in profiles, keyed by name. Frozen so the registry cannot be
 * mutated at runtime. Each carries its own {@link ProfileProvenance} (except the
 * conservative `default` baseline).
 *
 * @internal
 */
const BUILT_INS: ReadonlyMap<string, CcdaProfile> = new Map<string, CcdaProfile>([
  [defaultProfile.name, defaultProfile],
  [smartScorecard.name, smartScorecard],
  [legacyR11.name, legacyR11],
]);

/**
 * Look up a built-in profile by name. Returns `undefined` when no built-in has
 * that name (a user-defined profile is not in this registry — pass it directly).
 *
 * @example
 * ```ts
 * import { getCcdaProfile } from "@cosyte/ccda";
 * const p = getCcdaProfile("smartScorecard");
 * console.log(p?.provenance?.source);
 * ```
 */
export function getCcdaProfile(name: string): CcdaProfile | undefined {
  return BUILT_INS.get(name);
}

/**
 * The names of every built-in profile, in registration order.
 *
 * @example
 * ```ts
 * import { listCcdaProfiles } from "@cosyte/ccda";
 * console.log(listCcdaProfiles()); // ["default", "smartScorecard", "legacyR11"]
 * ```
 */
export function listCcdaProfiles(): readonly string[] {
  return Object.freeze([...BUILT_INS.keys()]);
}

/**
 * Process-scoped default profile. `undefined` means "unset" — `parseCcda`
 * applies no profile in that state.
 *
 * @internal
 */
let _defaultProfile: CcdaProfile | undefined = undefined;

/**
 * Register a process-scoped default profile that `parseCcda(raw)` applies when
 * no explicit `profile` option is passed. Pass `null` (or `undefined`) to clear.
 * An explicit `parseCcda(raw, { profile })` always wins; `{ profile: null }`
 * opts out of the default for a single call.
 *
 * **Test hygiene:** the only mutable module-scoped state here — tests that call
 * this MUST clear it in teardown or default-profile bleed infects later tests.
 *
 * @example
 * ```ts
 * import { setDefaultCcdaProfile, ccdaProfiles, parseCcda } from "@cosyte/ccda";
 * setDefaultCcdaProfile(ccdaProfiles.legacyR11);
 * const doc = parseCcda(xml); // uses legacyR11
 * setDefaultCcdaProfile(null); // clear
 * ```
 */
export function setDefaultCcdaProfile(profile: CcdaProfile | null): void {
  _defaultProfile = profile ?? undefined;
}

/**
 * Return the current process-scoped default profile, or `undefined` if none is
 * registered.
 *
 * @example
 * ```ts
 * import { getDefaultCcdaProfile } from "@cosyte/ccda";
 * const p = getDefaultCcdaProfile();
 * if (p !== undefined) console.log("default profile:", p.name);
 * ```
 */
export function getDefaultCcdaProfile(): CcdaProfile | undefined {
  return _defaultProfile;
}
