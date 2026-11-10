---
id: check-codes-with-your-terminology
title: Check codes with your own terminology service
sidebar_label: Check codes with your terminology
description: "Plug your own licensed terminology service into the parser through a small adapter, so a code that is not a real member is flagged."
---

# Check codes with your own terminology service

You want to know whether a coded value is a real member of its code system. This
package cannot tell you. SNOMED CT is affiliate-licensed, RxNorm is UMLS-gated, CPT is AMA-licensed,
and this package, with its one runtime dependency, bundles none of their content.

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

## Reference

Types you will import here: `TerminologyAdapter` (the contract you implement), `TerminologyCoding`
(one coding handed to you, whose `system` is the C-CDA `@codeSystem` OID, never a URI),
`CodeValidationResult` (your verdict), `CodeTranslationResult` (the optional `translate` reply) and
`CodeSlot` (the five slot names an adapter is consulted at). `checkCodeSlot` is the structural check
that runs regardless of whether you supply an adapter.

- [`TerminologyAdapter`](./api/README.md#terminologyadapter), [`TerminologyCoding`](./api/README.md#terminologycoding),
  [`CodeValidationResult`](./api/README.md#codevalidationresult),
  [`CodeTranslationResult`](./api/README.md#codetranslationresult) and [`CodeSlot`](./api/README.md#codeslot).

## Related

- [Check value-set membership](./check-value-set-membership.md), the question an adapter cannot answer.
- [Code systems and provenance](./code-systems.md) explains which slots are checked and why.
- This is one of four read-side controls you set once per deployment:
  [a vendor profile](./apply-a-vendor-profile.md),
  [a terminology adapter](./check-codes-with-your-terminology.md),
  [a value-set source](./check-value-set-membership.md) and
  [the required-section status](./check-required-sections.md). None of them changes what the parser
  extracts, and none of them can make a safety-critical deviation quiet.
