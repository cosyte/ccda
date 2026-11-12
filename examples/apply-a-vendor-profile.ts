/**
 * Quiet the benign deviations one sender is known for with a vendor profile, and see that a
 * safety-critical one can never be quieted.
 *
 * The input is the synthetic CCD from `examples/data/ccd.ts` with every `extension="2015-08-01"`
 * version stamp taken off its templates, which is how a sender still writing C-CDA R1.1 emits it.
 * Read without a profile, the missing stamp is a `TEMPLATE_EXTENSION_ABSENT` warning. Read with
 * the built-in `legacyR11` profile, the same deviation comes back as `PROFILE_QUIRK_APPLIED`,
 * flagged `expected` and naming the code it stands for, so a reviewer still sees what was
 * tolerated and why. The clinical data read is the same either way: a profile acts on warnings
 * only.
 *
 * A site profile extends the built-in with one more tolerance of its own, and `defineCcdaProfile`
 * refuses, at definition time, a profile that tries to tolerate a safety-critical code.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/apply-a-vendor-profile.ts
 */

import assert from "node:assert/strict";

import {
  CcdaProfileDefinitionError,
  ccdaProfiles,
  defineCcdaProfile,
  getCcdaProfile,
  isSafetyCriticalCode,
  listCcdaProfiles,
  parseCcda,
} from "@cosyte/ccda";

import { SYNTHETIC_CCD } from "./data/ccd.js";

// The same document as a sender still on R1.1 transmits it: no R2.1 version stamps.
const unstamped = SYNTHETIC_CCD.replaceAll(' extension="2015-08-01"', "");
assert.notEqual(unstamped, SYNTHETIC_CCD);

console.log(`Built-in profiles: ${listCcdaProfiles().join(", ")}`);

// No profile: the unstamped document lands in the triage queue on every read.
const plain = parseCcda(unstamped);
const plainCodes = plain.warnings.map((w) => w.code);
console.log(`Without a profile: ${plainCodes.join(", ")}`);

// The built-in legacyR11 profile expects exactly that deviation and downgrades it.
const legacyR11 = getCcdaProfile("legacyR11");
assert.ok(legacyR11 !== undefined);
const tolerated = parseCcda(unstamped, { profile: legacyR11 });
for (const w of tolerated.warnings) {
  console.log(
    `With legacyR11: ${w.code} for ${String(w.toleratedCode)}, expected ${String(w.expected)}`,
  );
}
console.log(`Profile recorded on the document: ${String(tolerated.profile?.name)}`);

// A profile of your own: everything legacyR11 tolerates, plus one reviewed deviation.
const siteProfile = defineCcdaProfile({
  name: "example-site",
  description: "Intake tolerances for one synthetic sender.",
  extends: ccdaProfiles.legacyR11,
  tolerate: [
    {
      code: "UNKNOWN_SECTION_CODE",
      rationale: "This sender carries one site-local section we have reviewed and accept.",
    },
  ],
});
console.log(`Site profile lineage: ${siteProfile.lineage.join(" > ")}`);

// The safety gate: a profile can never quiet a deviation that could change a clinical reading.
let refusedWith = "";
try {
  defineCcdaProfile({
    name: "over-tolerant",
    tolerate: [{ code: "MISSING_CODE_SYSTEM", rationale: "we would rather not see it" }],
  });
} catch (error) {
  if (!(error instanceof CcdaProfileDefinitionError)) throw error;
  refusedWith = error.name;
}
console.log(`Tolerating MISSING_CODE_SYSTEM was refused with ${refusedWith}`);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.deepEqual(listCcdaProfiles(), ["default", "smartScorecard", "legacyR11"]);
assert.deepEqual(plainCodes, ["TEMPLATE_EXTENSION_ABSENT"]);
assert.equal(tolerated.warnings.length, 1);
assert.ok(
  tolerated.warnings.every(
    (w) =>
      w.code === "PROFILE_QUIRK_APPLIED" &&
      w.toleratedCode === "TEMPLATE_EXTENSION_ABSENT" &&
      w.expected === true,
  ),
);
assert.equal(tolerated.profile?.name, "legacyR11");
// A profile changes warnings, never the data read.
assert.deepEqual(tolerated.getProblems(), plain.getProblems());
assert.equal(tolerated.getMedications()[0]?.drug?.code, "314076");
assert.deepEqual(siteProfile.lineage, ["legacyR11", "example-site"]);
assert.deepEqual(
  siteProfile.tolerate.map((t) => t.code),
  ["TEMPLATE_EXTENSION_ABSENT", "SECTION_MATCHED_BY_LOINC_FALLBACK", "UNKNOWN_SECTION_CODE"],
);
assert.equal(isSafetyCriticalCode("MISSING_CODE_SYSTEM"), true);
assert.equal(isSafetyCriticalCode("TEMPLATE_EXTENSION_ABSENT"), false);
assert.equal(refusedWith, "CcdaProfileDefinitionError");
