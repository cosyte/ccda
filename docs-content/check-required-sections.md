---
id: check-required-sections
title: Check a document type's required sections
sidebar_label: Check required sections
description: "Read which sections a document type must carry, how far that list was traced to the C-CDA source, and what a document lacks."
---

# Check a document type's required sections

`REQUIRED_SECTION_MISSING` tells you a section this package expects is absent. Before
you route on that, you need to know how much of that document type's obligation this package has
actually read off the normative source, and whether it evaluated the obligation at all.

`requiredSectionKeys` gives the asserted SHALL keys for a type. `missingRequiredSections` diffs them
against the sections you framed. `requiredSectionStatus` is the honest surface behind both: it carries
the keys **plus** the provenance of each one, plus two independent state axes.

- **`verification`** is a claim about the _type_: `traced-complete`, `traced-partial`, `untraced`, or
  `not-applicable`. How much of that type's obligation was read off the normative artifact.
- **`evaluation`** is a claim about the _lookup_: `evaluated` or `not-evaluated`. Whether the version
  stamp you supplied put the document inside the tables at all.
- **`release`** names the C-CDA release the keys were read against: `"R2.1"` for a document stamped
  `2015-08-01` or carrying no stamp, `"5.0.0"` for one stamped `2024-05-01` (pass
  `{ stamp: "r30-stamped" }`), and `undefined` when nothing was evaluated.

That split is the point. An empty `keys` set is never ambiguous, because the two states together say
**which** emptiness it is: nothing required, nothing asserted, or nothing asked.

```ts runnable
import { requiredSectionKeys, missingRequiredSections, requiredSectionStatus } from "@cosyte/ccda";

// A CCD's obligation is fully traced to the normative artifact, and every key
// carries the conformance statement it was read from.
const ccd = requiredSectionStatus("ccd");
ccd.verification; // => "traced-complete"
ccd.evaluation; // => "evaluated"
ccd.release; // => "R2.1"
ccd.keys; // => ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"]
ccd.traced[0]?.conformanceId; // => "CONF:1198-30662"
ccd.source?.revision; // => "2025-09-08"

// Same keys, without the provenance, from the lighter accessor.
requiredSectionKeys("ccd"); // => ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"]

// What a document that framed only two of them is missing.
missingRequiredSections("ccd", new Set(["allergies", "problems"])); // => ["medications", "results", "socialHistory", "vitalSigns"]

// EMPTY BECAUSE NOTHING IS REQUIRED: an Unstructured Document carries no
// structuredBody at all, so the obligation does not apply to it.
const unstructured = requiredSectionStatus("unstructuredDocument");
unstructured.verification; // => "not-applicable"
unstructured.keys; // => []

// A document stamped 2024-05-01 (C-CDA 3.0.0 to 5.0.0) is read against the
// C-CDA 5.0.0 document profiles. A 5.0.0 Discharge Summary also requires
// Procedures and Results.
const r5 = requiredSectionStatus("dischargeSummary", { stamp: "r30-stamped" });
r5.release; // => "5.0.0"
r5.keys; // => ["allergies", "hospitalDischargeDiagnosis", "planOfTreatment", "procedures", "results"]

// EMPTY BECAUSE NOTHING WAS ASKED: the document names a C-CDA release this
// package has not read. Reducing the obligation instead would be a confident
// wrong statement about conformance.
const future = requiredSectionStatus("ccd", { stamp: "unmodeled-release" });
future.evaluation; // => "not-evaluated"
future.release; // => undefined
future.keys; // => []
```

Two readings that are easy to get backwards, and both are load-bearing:

- **An unmodelled version stamp reports the obligation _unevaluated_, never _reduced_.** It is not the
  same as the R1.1-origin reduction, which applies to a document carrying **no** stamp at all and does
  drop the R2.1-scoped keys (`requiredSectionKeys("ccd", { r21Stamped: false })` returns four, not
  six). Treating a future release like an old one is how a document silently loses Social History and
  Vital Signs.
- **`unasserted` is not a gap list.** It names SHALL sections the source states that this package
  deliberately does not assert, each with one of three reasons: the section is outside the recognized
  catalog (`outside-section-catalog`), the source requires it only conditionally
  (`not-unconditionally-required`), or the parser recognizes it and asserting it would make the parse
  of documents that omit it stricter (`assertion-would-tighten-parse`, today only the Discharge
  Summary's Hospital Course). Asserting a SHOULD, or one half of a choice, mis-flags a conformant
  document, which is the same defect as missing a SHALL with the sign flipped.

`requiredSectionStatuses()` returns the status for every recognized document type at once, which is
the call to make if you are building a conformance dashboard rather than checking one document.

## Reference

Types you will import here: `RequiredSectionStatus` (the whole record), `RequiredSectionVerification`
and `RequiredSectionEvaluation` (the two state axes above), `RequiredSectionOptions` (the `r21Stamped`
and `stamp` inputs), `RequiredSectionSource` (the normative artifact and its own revision date),
`TracedRequiredSection` (one asserted key with its `CONF:` statement) and `UnassertedRequiredSection`
with `UnassertedSectionReason` (a named SHALL section this package does not assert, and which of the
three reasons above applies).

- [`requiredSectionStatus`](./api/README.md#requiredsectionstatus),
  [`requiredSectionStatuses`](./api/README.md#requiredsectionstatuses),
  [`requiredSectionKeys`](./api/README.md#requiredsectionkeys) and
  [`missingRequiredSections`](./api/README.md#missingrequiredsections).

## Related

- [Validation against C-CDA R2.1](./validation.md) explains which release the tables are written
  against and what each document type asserts.
- This is one of four read-side controls you set once per deployment:
  [a vendor profile](./apply-a-vendor-profile.md),
  [a terminology adapter](./check-codes-with-your-terminology.md),
  [a value-set source](./check-value-set-membership.md) and
  [the required-section status](./check-required-sections.md). None of them changes what the parser
  extracts, and none of them can make a safety-critical deviation quiet.
