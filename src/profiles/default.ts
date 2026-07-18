/**
 * The `default` conservative baseline profile. Tolerates **nothing** — every
 * deviation surfaces as its own warning, unmodified. It exists so "no profile"
 * and "the default profile" are the same, explicit, behaviour, and so a
 * consumer can name the baseline when composing (`extends: ccdaProfiles.default`)
 * without importing a special sentinel. Absence of a profile means this
 * conservative default applied — not that a document was fully understood.
 *
 * Authored through the public `defineCcdaProfile()` API — zero privileged
 * coupling; it is exactly what a user would write.
 */

import { defineCcdaProfile } from "./define.js";
import type { CcdaProfile } from "./types.js";

/**
 * The conservative baseline profile: no tolerated quirks.
 *
 * @example
 * ```ts
 * import { parseCcda, ccdaProfiles } from "@cosyte/ccda";
 * const doc = parseCcda(xml, { profile: ccdaProfiles.default });
 * // identical to parseCcda(xml) with no profile.
 * ```
 */
export const defaultProfile: CcdaProfile = defineCcdaProfile({
  name: "default",
  description: "Conservative baseline — tolerates nothing; every deviation surfaces as a warning.",
  tolerate: [],
});
