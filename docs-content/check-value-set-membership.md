---
id: check-value-set-membership
title: Check a coded value against its value set
sidebar_label: Check value-set membership
description: "Check each coded slot against the value set C-CDA binds it to, using value-set expansions you hold, with every finding naming its release."
---

# Check a coded value against its value set

The code system is right, the code is real, and the value is still wrong. C-CDA does
not only bind a slot to a code system, it binds it to a **value set**, and where that binding is
**Required** the standard states membership as a SHALL. A code that passes a [terminology adapter](./check-codes-with-your-terminology.md) can
still sit outside the bound value set, and a certifier and a receiving clinician both care about
exactly that case.

Member codes are licensed data (SNOMED CT, RxNorm, and CVX expansions), so this is bring-your-own too:
this package declares the **value set identifiers** and their provenance, you hold the expansions, and
`isMember` is the one question it asks you.

`valueSetBinding` is the declaration, per checked slot. Every row says how strongly C-CDA R2.1 binds
the value set, and names the conformance statement, the template, and the artifact revision the
reading was taken from, so no binding is asserted that the normative source was not read for:

```ts runnable
import { valueSetBinding, valueSetBindings } from "@cosyte/ccda";

const medication = valueSetBinding("medication");
medication.strength; // => "required"
medication.valueSet; // => "2.16.840.1.113762.1.4.1010.4"
medication.conformanceId; // => "CONF:1098-7412"
medication.source.revision; // => "2025-09-08"

// Not every checked slot carries a Required binding, and the difference is the
// difference between a conformance failure and a suggestion. The Problem
// Observation's value SHALL be present, and its code only SHOULD come from the
// Problem value set, which C-CDA represents as a Preferred binding.
valueSetBinding("problem").strength; // => "preferred"

valueSetBindings().filter((b) => b.strength === "required").length; // => 4
```

Supply a `ValueSetSource` and the parser reports what you say. It never refuses, rewrites, reorders, or
drops a value on a negative verdict, and it never asks about a Preferred row:

```ts runnable
import { parseCcda, WARNING_CODES, type ValueSetSource } from "@cosyte/ccda";

// Your package, in process. One expansion held, deliberately: the second slot
// below shows what happens to a value set you do NOT hold.
const routes = new Set(["C38288"]);
const valueSets: ValueSetSource = {
  release: "example-value-set-package-2026.1",
  isMember: ({ valueSet, coding }) => {
    if (valueSet !== "2.16.840.1.113883.3.88.12.3221.8.7") return { membership: "no-expansion" };
    return { membership: routes.has(coding.code) ? "member" : "not-a-member" };
  },
};

const ccd = (routeCode: string) => `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.9" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0013"/>
  <code code="11506-3" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic progress note</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient><name><given>Jane</given><family>Doe</family></name>
    <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/></patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"/>
      <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Medications</title>
      <text><content ID="m1">Lisinopril</content></text>
      <entry><substanceAdministration classCode="SBADM" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
        <id root="2.16.840.1.113883.19.5.99999.2" extension="MED-1"/>
        <statusCode code="active"/>
        <effectiveTime xsi:type="IVL_TS"><low value="20240101"/></effectiveTime>
        <routeCode code="${routeCode}" codeSystem="2.16.840.1.113883.3.26.1.1"/>
        <doseQuantity value="1" unit="{tablet}"/>
        <consumable><manufacturedProduct classCode="MANU">
          <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
          <manufacturedMaterial>
            <code code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"/>
          </manufacturedMaterial>
        </manufacturedProduct></consumable>
      </substanceAdministration></entry>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

// No source supplied: nothing is asked, and membership is never inferred from
// the code system alone.
const quiet = parseCcda(ccd("C38288"));
quiet.warnings.some((w) => w.code === WARNING_CODES.VALUE_SET_BINDING_VIOLATED); // => false

// A route your expansion does not contain, at a Required binding: a SHALL
// violation, reported with the value set and the release that answered.
const flagged = parseCcda(ccd("C38276"), { valueSets });
const violation = flagged.warnings.find((w) => w.code === WARNING_CODES.VALUE_SET_BINDING_VIOLATED);
violation?.valueSet; // => "2.16.840.1.113883.3.88.12.3221.8.7"
violation?.valueSetRelease; // => "example-value-set-package-2026.1"

// The document's own value is untouched, exactly as with the terminology adapter.
flagged.getMedications()[0]?.route?.code; // => "C38276"

// The medication product's value set is one this source does not hold, so that
// binding is reported NOT EVALUATED rather than passed over in silence.
flagged.warnings.some((w) => w.code === WARNING_CODES.VALUE_SET_BINDING_NOT_EVALUATED); // => true
```

**Three answers, and the third is why this is not a boolean.** `member` is silent, `not-a-member` at a
Required binding raises `VALUE_SET_BINDING_VIOLATED`, and `no-expansion` raises
`VALUE_SET_BINDING_NOT_EVALUATED`: a package that quietly skipped a value set it does not hold would
read exactly like one that checked and found the code fine. Returning `undefined` is the fourth answer
and the only silent one, and it means "not my authority", the same "no opinion" an adapter gives.

**`release` is required, and it is what keeps the finding honest.** C-CDA states that for a Required
binding any valid expansion of a value set is conformant, so "not a member" is only ever a statement
about the expansion that answered. The release you declare rides on every finding beside the value set
OID. Neither ever appears in a message: messages come whole from the frozen registry, and the coded
value that caused the finding appears nowhere in it at all.

An exception your `isMember` raises is **not** swallowed. A failing value-set service surfaces to you
rather than being masked into a document that merely looks checked.

## Reference

Types you will import here: `ValueSetSource` (the contract you implement, carrying `release` and
`isMember`), `ValueSetMembershipQuery` (the question: a bound value set OID and the document's coding),
`ValueSetMembershipAnswer` (your three-state reply), `ValueSetBinding` (one declared row),
`ValueSetBindingStrength` (`required` or `preferred`), `ValueSetBindingSource` (the normative artifact
and its own revision) and `BoundValueSet` (the closed set of value set OIDs a finding can name).
`valueSetBinding` and `valueSetBindings` read the declaration; `valueSetBindingViolated` and
`valueSetBindingNotEvaluated` are the warning factories behind the two codes, exported for the same
reason `semanticCodeInvalid` is.

- [`valueSetBinding`](./api/README.md#valuesetbinding), [`valueSetBindings`](./api/README.md#valuesetbindings),
  [`ValueSetSource`](./api/README.md#valuesetsource) and
  [`ValueSetMembershipAnswer`](./api/README.md#valuesetmembershipanswer).

## Related

- [Check codes with your own terminology service](./check-codes-with-your-terminology.md), the
  question this one comes after.
- [Code systems and provenance](./code-systems.md#value-set-bindings-bring-your-own-expansions)
  explains the bindings.
- This is one of four read-side controls you set once per deployment:
  [a vendor profile](./apply-a-vendor-profile.md),
  [a terminology adapter](./check-codes-with-your-terminology.md),
  [a value-set source](./check-value-set-membership.md) and
  [the required-section status](./check-required-sections.md). None of them changes what the parser
  extracts, and none of them can make a safety-critical deviation quiet.
