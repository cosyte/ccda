/**
 * The `legacyR11` profile — receive-tolerance for **R1.1-origin** C-CDA
 * documents, grounded in the regulation and a public corpus rather than an
 * invented vendor deviation.
 *
 * Grounding (per ADR 0018, public artifacts are valid grounding):
 * - **ONC 2015 Edition §170.315(b)(1) Transitions of Care.** Certified systems
 *   must *produce* C-CDA **R2.1** but must *receive and validate* **both R2.1 and
 *   R1.1**. So a conformant receiver genuinely encounters R1.1-origin documents
 *   whose document/section `templateId`s lack the R2.1 `2015-08-01` `@extension`
 *   stamp — exactly the condition that raises `TEMPLATE_EXTENSION_ABSENT`.
 * - **HL7/C-CDA-Examples** (github.com/HL7/C-CDA-Examples, CC0 public domain,
 *   commit `ad5007abd912a45bbd04ce96e871c70954c2b2c2`). Its README states the
 *   corpus is "all approved C-CDA **R1.1** samples **upgraded to R2.1**" and that
 *   "R2.1 is compatible with 1.1" — the canonical public demonstration that
 *   R1.1-shaped and R2.1-shaped documents are received interchangeably, and that
 *   a section is routinely identified by its LOINC `code` (the fallback that
 *   raises `SECTION_MATCHED_BY_LOINC_FALLBACK`).
 *
 * It tolerates only **structural version-tolerance noise** — the absent R2.1
 * version stamp and LOINC-fallback section identification. It cannot tolerate any
 * safety-critical deviation (enforced by the `defineCcdaProfile` safety gate);
 * an R1.1 document with a wrong dose still surfaces that warning in full.
 *
 * Honesty: a *conformance-tolerance* profile grounded in the receive-both
 * requirement and a CC0 corpus, not a per-vendor behaviour claim.
 */

import { defineCcdaProfile } from "./define.js";
import type { CcdaProfile } from "./types.js";

/**
 * Tolerates the R1.1-origin structural deviations a conformant C-CDA receiver
 * must accept (absent R2.1 version stamp; LOINC-fallback section matching).
 *
 * @example
 * ```ts
 * import { parseCcda, ccdaProfiles, WARNING_CODES } from "@cosyte/ccda";
 * const doc = parseCcda(r11OriginXml, { profile: ccdaProfiles.legacyR11 });
 * // the absent 2015-08-01 stamp arrives as an expected PROFILE_QUIRK_APPLIED:
 * const unexpected = doc.warnings.filter((w) => w.expected !== true);
 * ```
 */
export const legacyR11: CcdaProfile = defineCcdaProfile({
  name: "legacyR11",
  description:
    "Receive-tolerance for R1.1-origin documents (absent 2015-08-01 version stamp, LOINC-fallback " +
    "section matching), grounded in the ONC receive-both-R2.1-and-R1.1 requirement.",
  provenance: {
    source: "ONC 2015 Edition §170.315(b)(1) + HL7/C-CDA-Examples (CC0)",
    reference:
      "https://www.healthit.gov/test-method/transitions-care ; " +
      "github.com/HL7/C-CDA-Examples@ad5007abd912a45bbd04ce96e871c70954c2b2c2 (README)",
    retrieved: "2026-07-18",
    note: "Certified receivers must accept both R2.1 and R1.1; the CC0 corpus is R1.1 samples upgraded to R2.1.",
  },
  tolerate: [
    {
      code: "TEMPLATE_EXTENSION_ABSENT",
      rationale:
        "R1.1-origin documents carry document/section templateIds without the R2.1 2015-08-01 " +
        "@extension stamp; a conformant receiver must accept them (§170.315(b)(1) receive-both).",
    },
    {
      code: "SECTION_MATCHED_BY_LOINC_FALLBACK",
      rationale:
        "R1.1-origin and cross-network documents are routinely identified by section LOINC code when " +
        "a recognized R2.1 templateId is absent; the HL7/C-CDA-Examples corpus demonstrates this.",
    },
  ],
});
