---
id: conformance
title: Conformance, profiles & terminology
sidebar_label: Conformance & profiles
sidebar_position: 9
---

# Conformance, profiles & terminology

Three things you tune once, per deployment, and then stop thinking about: **which deviations your
senders are allowed to make** (a vendor profile), **which codes you consider real** (a terminology
adapter), and **how much of a document type's obligation this package can actually check** (the
required-section conformance status).

All three are read-side controls. None of them changes what the parser extracts, and none of them can
make a safety-critical deviation quiet. Every example below runs against the shipped package with no
network and no licensed service.

All sample XML is **synthetic** (an invented patient, obviously-fake OIDs); never paste a real
clinical document into a doc or a test.

---

## 1. Apply a vendor profile

**The problem:** your upstream sender has a known, benign quirk. It ships deprecated LOINC codes, or
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
ccdaProfiles.smartScorecard.tolerate.map((t) => t.code);
// => ["DEPRECATED_LOINC", "DEPRECATED_CODE_SYSTEM", "INVALID_NULL_FLAVOR"]

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
siteProfile.tolerate.map((t) => t.code);
// => ["DEPRECATED_LOINC", "DEPRECATED_CODE_SYSTEM", "INVALID_NULL_FLAVOR", "UNKNOWN_SECTION_CODE"]
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

**Types you will import here:** `CcdaProfile` (the frozen profile), `DefineCcdaProfileOptions` (the
factory's input), `QuirkTolerance` (one declared deviation, with its `rationale`), `QuirkMatch` (the
optional structural narrowing, on `sectionCode` or `templateId` only), `ProfileProvenance` (the cited
grounding) and `ProfileAttribution` (what a parsed document records about the profile that shaped it).

---

## 2. Supply a bring-your-own terminology adapter

**The problem:** you want to know whether a coded value is a real member of its code system. This
package cannot tell you. SNOMED CT is affiliate-licensed, RxNorm is UMLS-gated, CPT is AMA-licensed,
and a zero-dependency parser bundles none of their content.

So terminology is **bring-your-own**: you implement `TerminologyAdapter` (one required method,
`validateCode`) and hand it to `parseCcda`. The parser calls it at the five clinical `CodeSlot`s
(`problem`, `medication`, `allergen`, `route`, `vaccine`) on each slot's primary coding.

The contract is **fail-safe**: a negative verdict raises `SEMANTIC_CODE_INVALID` and the document's
own code is **preserved verbatim**, never corrected, never replaced by your adapter's label. Returning
`undefined` means "no opinion" and is the right answer for a system you do not cover.

The adapter below is an in-process `Set`. It opens no socket, which is what makes this example
runnable here and what makes an adapter testable in your own suite.

```ts runnable
import { parseCcda, WARNING_CODES, type TerminologyAdapter } from "@cosyte/ccda";

const SNOMED = "2.16.840.1.113883.6.96";

// A stub adapter: in-process, no network, no licensed service. Yours would call
// your own terminology engine here.
const knownSnomed = new Set(["59621000"]);
const adapter: TerminologyAdapter = {
  validateCode: (coding) =>
    coding.system === SNOMED ? { result: knownSnomed.has(coding.code) } : undefined,
};

const ccd = (problemCode: string) => `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0012"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient><name><given>Jane</given><family>Doe</family></name>
    <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/></patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Problems</title>
      <text><content ID="p1">Essential hypertension</content></text>
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <statusCode code="active"/>
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
          <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
          <value xsi:type="CD" code="${problemCode}" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>
          <text><reference value="#p1"/></text>
        </observation></entryRelationship>
      </act></entry>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

// A code the adapter recognizes: no semantic warning.
const clean = parseCcda(ccd("59621000"), { terminology: adapter });
clean.warnings.some((w) => w.code === WARNING_CODES.SEMANTIC_CODE_INVALID); // => false

// A code it rejects: warned, and the document's own value is left exactly as it was.
const flagged = parseCcda(ccd("99999999"), { terminology: adapter });
flagged.warnings.some((w) => w.code === WARNING_CODES.SEMANTIC_CODE_INVALID); // => true
flagged.getProblems()[0]?.problems[0]?.value?.code; // => "99999999"
```

**Read the clean run precisely.** It means those five slots passed your adapter, not that the
document was terminology-verified. `<translation>` alternates are preserved but never slot-checked,
and `MISSING_CODE_SYSTEM` / `MISSING_CODE_VALUE` are safety-critical: no profile can tolerate them,
whatever your adapter says.

`translate` is an optional second method. `buildCcda` emits each returned coding **beside** the
primary code as a `<translation>`, never replacing it, and an empty `matches` array emits nothing.
The library never fabricates a target.

**Types you will import here:** `TerminologyAdapter` (the contract you implement), `TerminologyCoding`
(one coding handed to you, whose `system` is the C-CDA `@codeSystem` OID, never a URI),
`CodeValidationResult` (your verdict), `CodeTranslationResult` (the optional `translate` reply) and
`CodeSlot` (the five slot names an adapter is consulted at). `checkCodeSlot` is the structural check
that runs regardless of whether you supply an adapter.

---

## 3. Read a document type's required-section status

**The problem:** `REQUIRED_SECTION_MISSING` tells you a section this package expects is absent. Before
you route on that, you need to know how much of that document type's obligation this package has
actually read off the normative source, and whether it evaluated the obligation at all.

`requiredSectionKeys` gives the asserted SHALL keys for a type. `missingRequiredSections` diffs them
against the sections you framed. `requiredSectionStatus` is the honest surface behind both: it carries
the keys **plus** the provenance of each one, plus two independent state axes.

- **`verification`** is a claim about the _type_: `traced-complete`, `traced-partial`, `untraced` or
  `not-applicable`. How much of that type's obligation was read off the normative artifact.
- **`evaluation`** is a claim about the _lookup_: `evaluated` or `not-evaluated`. Whether the version
  stamp you supplied put the document inside the tables at all.

That split is the point. An empty `keys` set is never ambiguous, because the two states together say
**which** emptiness it is: nothing required, nothing asserted, or nothing asked.

```ts runnable
import { requiredSectionKeys, missingRequiredSections, requiredSectionStatus } from "@cosyte/ccda";

// A CCD's obligation is fully traced to the normative artifact, and every key
// carries the conformance statement it was read from.
const ccd = requiredSectionStatus("ccd");
ccd.verification; // => "traced-complete"
ccd.evaluation; // => "evaluated"
ccd.keys;
// => ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"]
ccd.traced[0]?.conformanceId; // => "CONF:1198-30662"
ccd.source?.revision; // => "2025-09-08"

// Same keys, without the provenance, from the lighter accessor.
requiredSectionKeys("ccd");
// => ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"]

// What a document that framed only two of them is missing.
missingRequiredSections("ccd", new Set(["allergies", "problems"]));
// => ["medications", "results", "socialHistory", "vitalSigns"]

// EMPTY BECAUSE NOTHING IS REQUIRED: an Unstructured Document carries no
// structuredBody at all, so the obligation does not apply to it.
const unstructured = requiredSectionStatus("unstructuredDocument");
unstructured.verification; // => "not-applicable"
unstructured.keys; // => []

// EMPTY BECAUSE NOTHING WAS ASKED: the document names a C-CDA release this
// package has not read. Reducing the obligation instead would be a confident
// wrong statement about conformance.
const future = requiredSectionStatus("ccd", { stamp: "unmodeled-release" });
future.evaluation; // => "not-evaluated"
future.keys; // => []
```

Two readings that are easy to get backwards, and both are load-bearing:

- **An unmodelled version stamp reports the obligation _unevaluated_, never _reduced_.** It is not the
  same as the R1.1-origin reduction, which applies to a document carrying **no** stamp at all and does
  drop the R2.1-scoped keys (`requiredSectionKeys("ccd", { r21Stamped: false })` returns four, not
  six). Treating a future release like an old one is how a document silently loses Social History and
  Vital Signs.
- **`unasserted` is not a gap list.** It names SHALL sections the source states that this package
  deliberately does not assert, each with one of two reasons: the section is outside the recognized
  catalog, or the source requires it only conditionally. Asserting a SHOULD, or one half of a choice,
  mis-flags a conformant document, which is the same defect as missing a SHALL with the sign flipped.

`requiredSectionStatuses()` returns the status for every recognized document type at once, which is
the call to make if you are building a conformance dashboard rather than checking one document.

**Types you will import here:** `RequiredSectionStatus` (the whole record), `RequiredSectionVerification`
and `RequiredSectionEvaluation` (the two state axes above), `RequiredSectionOptions` (the `r21Stamped`
and `stamp` inputs), `RequiredSectionSource` (the normative artifact and its own revision date),
`TracedRequiredSection` (one asserted key with its `CONF:` statement) and `UnassertedRequiredSection`
with `UnassertedSectionReason` (a named SHALL section this package does not assert, and which of the
two permitted reasons applies).
