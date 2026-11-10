---
id: apply-a-vendor-profile
title: Apply a vendor profile
sidebar_label: Apply a vendor profile
description: "Quiet the benign deviations one sender is known for with a named profile, while every safety-critical warning stays loud."
---

# Apply a vendor profile

Your upstream sender has a known, benign quirk. It ships deprecated LOINC codes, or
omits the R2.1 version stamp. You do not want that noise in your triage queue every day, but you also
do not want to disable warnings wholesale and lose the ones that matter.

A **profile** is a named, frozen declaration of the deviations you expect from a source, each one
carrying a written rationale. `parseCcda(raw, { profile })` downgrades exactly those and nothing else.
The built-ins live on the `ccdaProfiles` namespace; `getCcdaProfile` and `listCcdaProfiles` reach the
registry by name, and `setDefaultCcdaProfile` / `getDefaultCcdaProfile` set a process-wide default so
you do not have to thread the option through every call site.

Build your own with `defineCcdaProfile`, extending a built-in where one is close. `lineage` records
what it was built from, and `describe()` prints a reviewable summary.

**The safety gate is not advisory.** `defineCcdaProfile` **throws** a `CcdaProfileDefinitionError`
if you try to tolerate a code in `SAFETY_CRITICAL_CODES` (patient identity, allergy, dose, unit,
value integrity). Check one yourself with `isSafetyCriticalCode`. A profile quiets structural noise;
it can never quiet a deviation that could change a clinical reading.

```ts runnable
import {
  defineCcdaProfile,
  ccdaProfiles,
  getCcdaProfile,
  listCcdaProfiles,
  isSafetyCriticalCode,
  CcdaProfileDefinitionError,
} from "@cosyte/ccda";

// The built-ins, each authored through the public factory and carrying its cited grounding.
// `listCcdaProfiles` returns registry NAMES; `getCcdaProfile` resolves one to the profile.
listCcdaProfiles(); // => ["default", "smartScorecard", "legacyR11"]
getCcdaProfile("legacyR11")?.name; // => "legacyR11"
ccdaProfiles.smartScorecard.tolerate.map((t) => t.code); // => ["DEPRECATED_LOINC", "DEPRECATED_CODE_SYSTEM", "INVALID_NULL_FLAVOR"]

// Extend one for a single sender. `tolerate` is additive over the parent.
const siteProfile = defineCcdaProfile({
  name: "example-site",
  description: "Intake tolerances for one regional sender.",
  extends: ccdaProfiles.smartScorecard,
  tolerate: [
    {
      code: "UNKNOWN_SECTION_CODE",
      rationale: "This sender carries two site-local sections we have reviewed and accept.",
    },
  ],
});

siteProfile.lineage; // => ["smartScorecard", "example-site"]
siteProfile.tolerate.map((t) => t.code); // => ["DEPRECATED_LOINC", "DEPRECATED_CODE_SYSTEM", "INVALID_NULL_FLAVOR", "UNKNOWN_SECTION_CODE"]
typeof siteProfile.describe; // => "function"

// The safety gate refuses at definition time, not at parse time.
isSafetyCriticalCode("SUBJECT_CONTEXT_OVERRIDE"); // => true
isSafetyCriticalCode("DEPRECATED_LOINC"); // => false

let refused = false;
try {
  defineCcdaProfile({
    name: "over-tolerant",
    tolerate: [{ code: "SUBJECT_CONTEXT_OVERRIDE", rationale: "we would rather not see it" }],
  });
} catch (err) {
  refused = err instanceof CcdaProfileDefinitionError;
}
refused; // => true
```

Pass it to a parse with `parseCcda(raw, { profile: siteProfile })`. The parsed document records which
profile shaped it on `doc.profile` (a `ProfileAttribution`), so a downstream reviewer can see what was
tolerated and why rather than wondering where a warning went. `applyProfile` and
`wrapEmitterWithProfile` are the same transform exposed directly, for a pipeline that collects
warnings on its own channel.

## Reference

Types you will import here: `CcdaProfile` (the frozen profile), `DefineCcdaProfileOptions` (the
factory's input), `QuirkTolerance` (one declared deviation, with its `rationale`), `QuirkMatch` (the
optional structural narrowing, on `sectionCode` or `templateId` only), `ProfileProvenance` (the cited
grounding) and `ProfileAttribution` (what a parsed document records about the profile that shaped it).

- [`defineCcdaProfile`](./api/README.md#defineccdaprofile), [`ccdaProfiles`](./api/README.md#ccdaprofiles),
  [`getCcdaProfile`](./api/README.md#getccdaprofile), [`listCcdaProfiles`](./api/README.md#listccdaprofiles),
  [`setDefaultCcdaProfile`](./api/README.md#setdefaultccdaprofile) and
  [`isSafetyCriticalCode`](./api/README.md#issafetycriticalcode).
- [`CcdaProfile`](./api/README.md#ccdaprofile), [`DefineCcdaProfileOptions`](./api/README.md#defineccdaprofileoptions),
  [`QuirkTolerance`](./api/README.md#quirktolerance) and
  [`ProfileAttribution`](./api/README.md#profileattribution).

## Related

- [Tolerance and the warning model](./spec-notes-tolerance.md#the-version-stamp-and-what-a-profile-may-quiet-about-it)
  explains what a profile may and may not quiet.
- [Triage warnings](./triage-warnings.md), for the warnings a profile leaves in place.
- This is one of four read-side controls you set once per deployment:
  [a vendor profile](./apply-a-vendor-profile.md),
  [a terminology adapter](./check-codes-with-your-terminology.md),
  [a value-set source](./check-value-set-membership.md) and
  [the required-section status](./check-required-sections.md). None of them changes what the parser
  extracts, and none of them can make a safety-critical deviation quiet.
