/**
 * Public barrel for the `@cosyte/ccda` vendor-profile subsystem. Assembles the
 * `ccdaProfiles` namespace object (the built-ins) and re-exports the public
 * profile API: `defineCcdaProfile`, the registry accessors, the apply helpers,
 * the safety set, and the profile types.
 *
 * The individual built-ins are reached via `ccdaProfiles.smartScorecard` etc.,
 * not as top-level named exports — mirrors the sibling `@cosyte/hl7` `profiles`
 * namespace convention ("default"/"legacyR11" are too generic for a top-level
 * export).
 */

export { defineCcdaProfile } from "./define.js";
export type {
  CcdaProfile,
  DefineCcdaProfileOptions,
  QuirkTolerance,
  QuirkMatch,
  ProfileProvenance,
} from "./types.js";
export {
  getCcdaProfile,
  listCcdaProfiles,
  setDefaultCcdaProfile,
  getDefaultCcdaProfile,
} from "./registry.js";
export { applyProfile, wrapEmitterWithProfile } from "./apply.js";
export { SAFETY_CRITICAL_CODES, isSafetyCriticalCode } from "./safety.js";

import { defaultProfile } from "./default.js";
import { legacyR11 } from "./legacy-r11.js";
import { smartScorecard } from "./smart-scorecard.js";

/**
 * Namespace object exposing the built-in profiles: the conservative `default`
 * baseline plus the two evidence-backed conformance profiles (`smartScorecard`,
 * `legacyR11`), each authored via the public `defineCcdaProfile()` API and
 * carrying its cited public provenance.
 *
 * @example
 * ```ts
 * import { parseCcda, ccdaProfiles } from "@cosyte/ccda";
 * const doc = parseCcda(raw, { profile: ccdaProfiles.smartScorecard });
 * console.log(doc.profile?.name); // "smartScorecard"
 * ```
 */
export const ccdaProfiles = Object.freeze({
  default: defaultProfile,
  smartScorecard,
  legacyR11,
}) as {
  readonly default: typeof defaultProfile;
  readonly smartScorecard: typeof smartScorecard;
  readonly legacyR11: typeof legacyR11;
};
