/**
 * The `smartScorecard` profile — deprecated-terminology tolerance grounded in
 * **public conformance evidence**, not an invented vendor deviation matrix.
 *
 * Grounding (per ADR 0018, public artifacts are valid grounding):
 * - **SMART C-CDA Scorecard** (SMART Health IT / Boston Children's) — the public
 *   rubric that scores real C-CDA documents and explicitly flags **deprecated
 *   codes** (notably the deprecated BMI LOINC **41909-3** in place of the current
 *   **39156-5**) as a common real-world deviation.
 * - **D'Amore et al., *JAMIA* 21(6):1060 (2014)**, the SMART C-CDA Collaborative
 *   study of 21 technologies / 91 documents / 615 logged observations, which
 *   documented deprecated code systems (**ICD-9** persisting in newer documents)
 *   and other schema-valid-but-semantically-imperfect patterns.
 *
 * What it tolerates is strictly **non-safety-critical terminology-freshness
 * noise**: a deprecated-but-recognizable LOINC or a legacy code system. It does
 * **not** — and by the safety gate in `defineCcdaProfile` **cannot** — tolerate a
 * wrong dose, a mis-coded allergen, a code↔narrative mismatch, or any other
 * safety-critical deviation. Those always surface, profile or not.
 *
 * Honesty: this is a *conformance-evidence* profile, not a claim about any one
 * named EHR vendor. No per-vendor ("Epic does X") behaviour is asserted; a named
 * vendor profile awaits a real vendor-attributed grounding document.
 */

import { defineCcdaProfile } from "./define.js";
import type { CcdaProfile } from "./types.js";

/**
 * Tolerates deprecated-terminology deviations documented by the public SMART
 * C-CDA Scorecard rubric and the D'Amore JAMIA 2014 study.
 *
 * @example
 * ```ts
 * import { parseCcda, ccdaProfiles, WARNING_CODES } from "@cosyte/ccda";
 * const doc = parseCcda(xml, { profile: ccdaProfiles.smartScorecard });
 * // a deprecated BMI LOINC arrives as PROFILE_QUIRK_APPLIED (expected), not a bare warning:
 * const quirks = doc.warnings.filter((w) => w.code === WARNING_CODES.PROFILE_QUIRK_APPLIED);
 * ```
 */
export const smartScorecard: CcdaProfile = defineCcdaProfile({
  name: "smartScorecard",
  description:
    "Deprecated-terminology tolerance grounded in the public SMART C-CDA Scorecard rubric and " +
    "the D'Amore JAMIA 2014 study. Terminology-freshness noise only — never a safety-critical value.",
  provenance: {
    source: "SMART C-CDA Scorecard + D'Amore et al., JAMIA 2014 (SMART C-CDA Collaborative)",
    reference:
      "https://ccda-scorecard.smarthealthit.org/ ; D'Amore et al., J Am Med Inform Assoc " +
      "2014;21(6):1060-1068 (PMC4215060)",
    retrieved: "2026-07-18",
    note: "Public conformance rubric + peer-reviewed study of real documents; not a per-vendor matrix.",
  },
  tolerate: [
    {
      code: "DEPRECATED_LOINC",
      rationale:
        "The SMART C-CDA Scorecard flags deprecated LOINC codes (e.g. BMI 41909-3, superseded by " +
        "39156-5) as a common real-world deviation; recognizable, non-safety-critical.",
    },
    {
      code: "DEPRECATED_CODE_SYSTEM",
      rationale:
        "D'Amore et al. (JAMIA 2014) documented legacy code systems — ICD-9 persisting in newer " +
        "documents — across real C-CDA documents; the value is preserved, the deprecation expected.",
    },
    {
      code: "INVALID_NULL_FLAVOR",
      rationale:
        'The SMART C-CDA study logged malformed nullFlavor tokens (e.g. "UNC" for "UNK") in real ' +
        "documents; the raw token is preserved verbatim, the non-conformance expected.",
    },
  ],
});
