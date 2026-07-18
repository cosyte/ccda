/**
 * Public type surface for the `@cosyte/ccda` vendor-profile subsystem. A
 * {@link CcdaProfile} bundles a **named, provenance-backed set of expected
 * deviations** ("quirks") a class of real-world C-CDA documents is known to
 * carry. It mirrors the sibling `@cosyte/hl7` profile shape (`name` / `lineage`
 * / `describe()` / `extends`-merge) but models C-CDA's quirks rather than HL7 v2
 * Z-segments: a profile never changes an extracted clinical value, it only
 * declares which **already-emitted, non-safety-critical warning codes** it
 * *expects*, so a consumer can distinguish a known, tolerated deviation from a
 * novel one.
 *
 * The two load-bearing safety rules, enforced by `defineCcdaProfile`:
 *
 * 1. **A profile can never tolerate a safety-critical warning code**
 *    (dose/allergen/negation/narrative-mismatch/identity — see
 *    `src/profiles/safety.ts`). Tolerating one is a *definition-time throw*, not
 *    a silent relaxation.
 * 2. **A tolerated deviation is downgraded, never dropped.** The parser still
 *    records it (re-coded {@link WARNING_CODES.PROFILE_QUIRK_APPLIED}, flagged
 *    `expected: true`, carrying the original `toleratedCode`) so nothing is
 *    silently hidden — Postel's Law with a receipt.
 */

import type { WarningCode } from "../parser/warnings.js";

/**
 * Provenance for a {@link CcdaProfile} — the **real, cited public artifact** a
 * profile's quirks are grounded in. Per ADR 0018, a quirk is encoded only when a
 * real document (including a public HL7/ONC/IHE sample or a published
 * conformance study) grounds it; this record is where that grounding is stated,
 * so a reviewer can trace every tolerated deviation back to evidence rather than
 * invention.
 *
 * @example
 * ```ts
 * import type { ProfileProvenance } from "@cosyte/ccda";
 * const prov: ProfileProvenance = {
 *   source: "SMART C-CDA Scorecard",
 *   reference: "https://ccda-scorecard.smarthealthit.org/",
 *   retrieved: "2026-07-18",
 * };
 * ```
 */
export interface ProfileProvenance {
  /** Short human-readable name of the grounding source (corpus, study, or guide). */
  readonly source: string;
  /** A citation the grounding can be traced to — a URL, DOI, or repo+commit. */
  readonly reference: string;
  /** When the grounding was last verified (ISO date) or the pinned commit SHA. */
  readonly retrieved?: string;
  /** Optional clarifying note about what in the source grounds the quirks. */
  readonly note?: string;
}

/**
 * Optional structural narrowing for a {@link QuirkTolerance}. When present, the
 * tolerance applies only to warnings whose PHI-free {@link CcdaPosition} matches
 * every provided field — so a profile can expect a deviation in one section
 * (e.g. deprecated LOINC only within Vital Signs) without blanket-tolerating it
 * everywhere. Matching is on **structural identifiers only** (LOINC section
 * code, template OID); there is no matching on clinical values, by construction.
 *
 * @example
 * ```ts
 * import type { QuirkMatch } from "@cosyte/ccda";
 * const onlyVitals: QuirkMatch = { sectionCode: "8716-3" };
 * ```
 */
export interface QuirkMatch {
  /** Match only warnings carrying this section LOINC code in their position. */
  readonly sectionCode?: string;
  /** Match only warnings carrying this template OID in their position. */
  readonly templateId?: string;
}

/**
 * One expected deviation declared by a profile. `code` names an **existing,
 * non-safety-critical** {@link WarningCode} the profile expects; `rationale`
 * documents why (grounded in the profile's {@link ProfileProvenance}); optional
 * `match` narrows it to a structural location. `defineCcdaProfile` throws if
 * `code` is safety-critical or not a real warning code.
 *
 * @example
 * ```ts
 * import type { QuirkTolerance } from "@cosyte/ccda";
 * const t: QuirkTolerance = {
 *   code: "DEPRECATED_LOINC",
 *   rationale: "Scorecard-documented deprecated BMI LOINC 41909-3 in real docs.",
 * };
 * ```
 */
export interface QuirkTolerance {
  /** The existing, non-safety-critical warning code this profile expects. */
  readonly code: WarningCode;
  /** Why the profile expects this deviation — grounded in its provenance. */
  readonly rationale: string;
  /** Optional structural narrowing (section code / template OID). */
  readonly match?: QuirkMatch;
}

/**
 * A frozen, immutable vendor/conformance profile. Produced by
 * {@link defineCcdaProfile}; consumers pass it to `parseCcda(raw, { profile })`
 * (or register it as the process default). Hand-authoring the object literal is
 * supported but discouraged — the factory validates the safety rules and
 * attaches `describe()`.
 *
 * @example
 * ```ts
 * import { parseCcda, ccdaProfiles } from "@cosyte/ccda";
 * const doc = parseCcda(xml, { profile: ccdaProfiles.smartScorecard });
 * console.log(doc.profile?.name); // "smartScorecard"
 * ```
 */
export interface CcdaProfile {
  /** The profile's unique name (registry key / attribution label). */
  readonly name: string;
  /** Optional human-readable description. */
  readonly description?: string;
  /** Resolved lineage — `[...parents, name]`, first-occurrence deduped. */
  readonly lineage: readonly string[];
  /** The expected, non-safety-critical deviations this profile tolerates. */
  readonly tolerate: readonly QuirkTolerance[];
  /** The cited public grounding for this profile's quirks (absent for `default`). */
  readonly provenance?: ProfileProvenance;
  /** Multi-line human-readable summary; always present on factory-built profiles. */
  readonly describe?: () => string;
}

/**
 * Options accepted by {@link defineCcdaProfile}. Mirrors the {@link CcdaProfile}
 * shape minus the derived `lineage`/`describe`, plus the `extends` input key.
 * Every field except `name` is optional.
 *
 * @example
 * ```ts
 * import { defineCcdaProfile, type DefineCcdaProfileOptions } from "@cosyte/ccda";
 * const opts: DefineCcdaProfileOptions = {
 *   name: "my-site",
 *   extends: ccdaProfiles.smartScorecard,
 *   tolerate: [{ code: "UNKNOWN_SECTION_CODE", rationale: "site-local sections" }],
 * };
 * const p = defineCcdaProfile(opts);
 * ```
 */
export interface DefineCcdaProfileOptions {
  readonly name: string;
  readonly description?: string;
  readonly tolerate?: readonly QuirkTolerance[];
  readonly provenance?: ProfileProvenance;
  readonly extends?: CcdaProfile | readonly CcdaProfile[];
}
