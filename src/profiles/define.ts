/**
 * `defineCcdaProfile()` — the public factory for building immutable
 * {@link CcdaProfile} objects with the safety rules enforced and `describe()`
 * attached. Mirrors the sibling `@cosyte/hl7` `defineProfile()` shape (name /
 * lineage / `extends`-merge / `describe`) while modelling C-CDA quirks
 * (tolerated warning codes with provenance) rather than HL7 v2 Z-segments.
 *
 * Zero runtime deps. No `any`; immutability at the return boundary via
 * `Object.freeze` (top-level, matching the sibling's boundary-freeze doctrine).
 */

import { buildDescribe } from "./describe.js";
import {
  mergeDescription,
  mergeLineage,
  mergeProvenance,
  mergeTolerations,
  normaliseParents,
} from "./merge.js";
import type { CcdaProfile, DefineCcdaProfileOptions } from "./types.js";
import { validateOptionKeys, validateProfileName, validateTolerations } from "./validate.js";

/**
 * Build a frozen {@link CcdaProfile} from a validated options object. Throws
 * {@link CcdaProfileDefinitionError} on a bad name, an unknown option key, or an
 * invalid `tolerate` entry — including the **safety rule**: a profile may never
 * tolerate a safety-critical warning code.
 *
 * `extends` composes profiles: lineage, `tolerate`, `provenance`, and
 * `description` merge (parents left-to-right, then self; scalars are child-wins).
 * The merged `tolerate` set is re-validated so a safety-critical code cannot
 * sneak in via a hand-crafted parent.
 *
 * @param opts - The profile definition; see {@link DefineCcdaProfileOptions}.
 * @returns A frozen, immutable profile with `describe()` attached.
 * @throws {@link CcdaProfileDefinitionError} on any invalid definition.
 * @example
 * ```ts
 * import { defineCcdaProfile } from "@cosyte/ccda";
 * const site = defineCcdaProfile({
 *   name: "acme-hospital",
 *   description: "Acme's inbound-CCD tolerances",
 *   tolerate: [
 *     { code: "TEMPLATE_EXTENSION_ABSENT", rationale: "receives R1.1-origin CCDs" },
 *   ],
 *   provenance: { source: "Acme integration corpus", reference: "internal-2026" },
 * });
 * console.log(site.lineage); // ["acme-hospital"]
 * console.log(site.describe?.());
 * ```
 */
export function defineCcdaProfile(opts: DefineCcdaProfileOptions): CcdaProfile {
  // Fail-fast on name so every downstream throw can name the profile.
  validateProfileName(opts);
  validateOptionKeys(opts);

  const selfTolerate = opts.tolerate ?? [];
  // Pre-merge validation surfaces the offending profile's own name.
  validateTolerations(selfTolerate, opts.name);

  const parents = normaliseParents(opts.extends);
  const lineage = mergeLineage(parents, opts.name);
  const tolerate = mergeTolerations(parents, selfTolerate);
  const provenance = mergeProvenance(parents, opts.provenance);
  const description = mergeDescription(parents, opts.description);

  // Post-merge re-validation — a safety-critical code inherited from a
  // hand-crafted parent is refused here.
  validateTolerations(tolerate, opts.name);

  type Mutable<T> = { -readonly [K in keyof T]?: T[K] };
  const profile: Mutable<CcdaProfile> = {
    name: opts.name,
    lineage,
    tolerate,
  };
  if (description !== undefined) profile.description = description;
  if (provenance !== undefined) profile.provenance = provenance;

  const finalised = profile as CcdaProfile;
  profile.describe = (): string => buildDescribe(finalised);

  return Object.freeze(profile) as CcdaProfile;
}
