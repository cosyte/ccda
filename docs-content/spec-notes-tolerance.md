---
id: spec-notes-tolerance
title: Tolerance & the warning model
sidebar_label: Tolerance & warnings
sidebar_position: 2
---

# Tolerance tiers & the warning-code model

`@cosyte/ccda` follows the cosyte parser archetype's **tiered tolerance** model. Real-world C-CDA is
vendor-quirky; the parser is liberal on input (Postel's Law) so a deviation becomes a **warning you
triage**, not an exception that halts your pipeline — while a genuinely unrecoverable or hostile
document is a hard failure.

## The tiers

| Tier | Behavior | Example |
|---|---|---|
| **0 / 1** | Accepted silently — conformant or trivially recoverable. | A section recognized by its `templateId`. |
| **2** | **Warning** with a stable code + PHI-free position; recovery continues. Escalates to a throw under `{ strict: true }`. | An unrecognized section LOINC code, a missing `doseQuantity`, a code/narrative mismatch. |
| **3** | **Fatal** — a thrown `CcdaParseError`, always (even in lenient mode). | Malformed XML, a non-`ClinicalDocument` root, a security tripwire. |

## The warning-code model

Every Tier-2 warning carries a **stable string code** (`WARNING_CODES.*`), a PHI-free `message`, and a
structural `position`. Consumers branch on `w.code` — so **renaming a code is a breaking change**. The
message and position interpolate only structural values (element names, OIDs, LOINC codes, positions),
never a patient name, an identifier, or narrative text: you can log the whole `.warnings` array without
leaking PHI.

Warnings are collected on `doc.warnings` and also delivered live to the `onWarning` callback, in
discovery order:

```ts runnable
import { parseCcda, WARNING_CODES } from "@cosyte/ccda";

// A medication with no doseQuantity and no routeCode — both safety-critical, both flagged.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.9" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0005"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic Progress Note</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient>
      <name><given>Jane</given><family>Doe</family></name>
      <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>
    </patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2015-08-01"/>
      <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Medications</title>
      <text><content ID="m1">Aspirin</content></text>
      <entry><substanceAdministration classCode="SBADM" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
        <statusCode code="active"/>
        <consumable><manufacturedProduct classCode="MANU">
          <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
          <manufacturedMaterial><code code="1191" codeSystem="2.16.840.1.113883.6.88" displayName="Aspirin"/></manufacturedMaterial>
        </manufacturedProduct></consumable>
        <text><reference value="#m1"/></text>
      </substanceAdministration></entry>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

const collected: string[] = [];
const doc = parseCcda(xml, { onWarning: (w) => collected.push(w.code) });

// The drug is read; the missing safety-critical fields are preserved-as-absent, never defaulted.
doc.getMedications()[0]?.drug?.code; // => "1191"
doc.getMedications()[0]?.dose; // => undefined
doc.warnings.some((w) => w.code === WARNING_CODES.MISSING_DOSE_QUANTITY); // => true
doc.warnings.some((w) => w.code === WARNING_CODES.MISSING_ROUTE_CODE); // => true
collected.length; // => 2
```

## Strict mode

`{ strict: true }` escalates the **first** tolerated Tier-2 deviation to a thrown `CcdaParseError`
carrying the same code — a spec-conformance gate for a trusted sender. Fail-safe by design: a clean,
conformant document parses identically in both modes.

## Fatal codes (always throw)

Seven Tier-3 codes are unrecoverable and throw a `CcdaParseError` regardless of `strict`. The first
five are **security fatals** raised by the hardened XML substrate before/while building the DOM — the
load-bearing defense against hostile XML:

| Fatal code | Meaning |
|---|---|
| `XXE_OR_DTD_PRESENT` | The document declared a DTD or an external entity. |
| `ENTITY_EXPANSION_LIMIT` | Too many `&…;` entity references (billion-laughs). |
| `INPUT_SIZE_LIMIT_EXCEEDED` | Decoded input exceeds the byte cap. |
| `ELEMENT_DEPTH_LIMIT_EXCEEDED` | Element nesting too deep. |
| `NODE_COUNT_LIMIT_EXCEEDED` | Too many element nodes. |
| `NOT_WELL_FORMED_XML` | The bytes did not parse as XML. |
| `NOT_A_CLINICAL_DOCUMENT` | Well-formed, but the root element is not `ClinicalDocument`. |

Narrow on `err.code`:

```ts runnable
import { parseCcda, CcdaParseError, FATAL_CODES } from "@cosyte/ccda";

let code: string | undefined;
try {
  // Well-formed XML, but the root is not a ClinicalDocument.
  parseCcda("<Foo>hello</Foo>");
} catch (err) {
  if (err instanceof CcdaParseError) code = err.code;
}
code; // => "NOT_A_CLINICAL_DOCUMENT"
code === FATAL_CODES.NOT_A_CLINICAL_DOCUMENT; // => true
```

The safety caps (`maxInputBytes`, `maxDepth`, `maxNodeCount`, `maxEntityExpansions`) have library
defaults; tighten them — or, at your own risk, loosen them — via `ParseCcdaOptions.limits`.
