---
id: quickstart
title: Quickstart
sidebar_position: 1
---

# Quickstart

This page gives you a first useful result: read a **Continuity of Care Document (CCD)** — the most
common C-CDA — and pull out who the patient is and their reconciliation triad (Problems, Medications,
Allergies), plus a lab result and an immunization, in a few lines. The CCD is what a hospital hands you
on a transition of care, so it is the fastest way to see the library earn its keep.

The parser is **lenient** — vendor quirks become stable-coded `warnings`, never silent failures — and
every coded value is preserved verbatim: a code that disagrees with its narrative surfaces **both** and
picks no winner (`CODE_NARRATIVE_MISMATCH`); a missing dose or route is flagged, never defaulted.

> Every document below is **synthetic**: an invented patient ("Jane Q. Doe"), obviously-fake OIDs and
> MRNs. A C-CDA is PHI; a fixture must never hold a real one.

## Parse a CCD and read the clinical data

`parseCcda(xml)` returns an immutable `CcdaDocument`. The convenience accessors (`getPatient`,
`getMrn`, `findSection`, `getProblems`, `getMedications`, …) answer "whose document, what kind, what's
in it" without re-walking the DOM.

```ts runnable
import { parseCcda } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0001"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of Episode Note"/>
  <title>Synthetic Continuity of Care Document</title>
  <effectiveTime value="20240101120000-0500"/>
  <languageCode code="en-US"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient>
      <name><given>Jane</given><given>Q</given><family>Doe</family></name>
      <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1" displayName="Female"/>
      <birthTime value="19800101"/>
    </patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Problems</title>
      <text><content ID="prob1">Essential hypertension</content></text>
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <statusCode code="active"/>
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
          <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
          <value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>
          <text><reference value="#prob1"/></text>
        </observation></entryRelationship>
      </act></entry>
    </section></component>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2015-08-01"/>
      <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Medications</title>
      <text><content ID="med1">Lisinopril 10 MG Oral Tablet</content></text>
      <entry><substanceAdministration classCode="SBADM" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
        <statusCode code="active"/>
        <routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Oral"/>
        <doseQuantity value="10" unit="mg"/>
        <consumable><manufacturedProduct classCode="MANU">
          <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
          <manufacturedMaterial>
            <code code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"/>
          </manufacturedMaterial>
        </manufacturedProduct></consumable>
        <text><reference value="#med1"/></text>
      </substanceAdministration></entry>
    </section></component>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
      <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Allergies</title>
      <text>No known allergies.</text>
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="2015-08-01"/>
        <statusCode code="active"/>
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN" negationInd="true">
          <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
          <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
          <value xsi:type="CD" code="419199007" codeSystem="2.16.840.1.113883.6.96" displayName="Allergy to substance"/>
        </observation></entryRelationship>
      </act></entry>
    </section></component>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"/>
      <code code="30954-2" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Results</title>
      <text><content ID="res1">Hemoglobin 13.5 g/dL</content></text>
      <entry><organizer classCode="BATTERY" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>
        <code code="58410-2" codeSystem="2.16.840.1.113883.6.1" displayName="CBC panel"/>
        <statusCode code="completed"/>
        <component><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
          <code code="718-7" codeSystem="2.16.840.1.113883.6.1" displayName="Hemoglobin"/>
          <statusCode code="completed"/>
          <value xsi:type="PQ" value="13.5" unit="g/dL"/>
          <interpretationCode code="N" codeSystem="2.16.840.1.113883.5.83"/>
        </observation></component>
      </organizer></entry>
    </section></component>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.2.1" extension="2015-08-01"/>
      <code code="11369-6" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Immunizations</title>
      <text><content ID="imm1">Influenza, seasonal, injectable</content></text>
      <entry><substanceAdministration classCode="SBADM" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.52" extension="2015-08-01"/>
        <statusCode code="completed"/>
        <effectiveTime value="20240101"/>
        <doseQuantity value="0.5" unit="mL"/>
        <consumable><manufacturedProduct classCode="MANU">
          <templateId root="2.16.840.1.113883.10.20.22.4.54" extension="2014-06-09"/>
          <manufacturedMaterial>
            <code code="140" codeSystem="2.16.840.1.113883.12.292" displayName="Influenza, seasonal, injectable"/>
          </manufacturedMaterial>
        </manufacturedProduct></consumable>
        <text><reference value="#imm1"/></text>
      </substanceAdministration></entry>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

const doc = parseCcda(xml);

// Identity — whose document, what kind.
doc.documentType; // => "ccd"
doc.getPatient()?.name?.family; // => "Doe"
doc.getPatient()?.genderCode?.code; // => "F"
doc.getPatient()?.birthTime?.raw; // => "19800101"
doc.getMrn(); // => "MRN-00042"

// Problems — the coded condition (SNOMED CT), and the concern's active/resolved status.
const concern = doc.getProblems()[0];
concern?.status; // => "active"
concern?.problems[0]?.value?.code; // => "59621000"

// Medications — the RxNorm drug and its dose.
const med = doc.getMedications()[0];
med?.drug?.code; // => "314076"
med?.dose?.value; // => 10
med?.dose?.unit; // => "mg"

// Allergies — "No Known Allergies" is a distinct flag, never confused with "unknown".
doc.getAllergies()[0]?.allergies[0]?.noKnownAllergy; // => true

// Results — the polymorphic value is UCUM-checked; here a physical quantity.
const result = doc.getResults()[0]?.results[0];
result?.code?.code; // => "718-7"
result?.value?.kind; // => "physicalQuantity"
result?.interpretation?.code; // => "N"

// Immunizations — the CVX vaccine code.
doc.getImmunizations()[0]?.vaccine?.code; // => "140"

// Clean, spec-conformant input: nothing tolerated, nothing flagged.
doc.warnings.length; // => 0
```

The `noKnownAllergy` flag is the safety primitive on the allergy side — a negated "no known allergies"
assertion is never read as an absent or unknown one. On the medication side, `dose` and `route` are
preserved-as-absent and flagged (`MISSING_DOSE_QUANTITY` / `MISSING_ROUTE_CODE`) when missing, never
silently defaulted.

## Lenient by default; strict when you want it

A recoverable vendor quirk becomes a stable-coded warning, not a failure. Here an unrecognized section
LOINC code is tolerated — the section is retained as narrative-only and an `UNKNOWN_SECTION_CODE`
warning is raised:

```ts runnable
import { parseCcda, WARNING_CODES } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.9" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0002"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic Progress Note</title>
  <effectiveTime value="20240201"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00099" assigningAuthorityName="Sample Hospital"/>
    <patient>
      <name><given>John</given><family>Public</family></name>
      <administrativeGenderCode code="M" codeSystem="2.16.840.1.113883.5.1"/>
    </patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <code code="99999-9" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Vendor-specific</title>
      <text>Some local content.</text>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

// Lenient (default): the quirk is a warning, the document still parses.
const doc = parseCcda(xml);
doc.documentType; // => "progressNote"
doc.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_SECTION_CODE); // => true

// Strict: the first tolerated deviation is escalated to a throw. The thrown
// CcdaParseError.code carries the escalated warning code.
let escalated: string | undefined;
try {
  parseCcda(xml, { strict: true });
} catch (err) {
  escalated = (err as { code?: string }).code;
}
typeof escalated; // => "string"
```

## Unrecoverable input throws — everything else is a warning

Only unrecoverable structural / hostile input throws a typed `CcdaParseError` — malformed XML, a
non-`ClinicalDocument` root, or a security tripwire (DTD/XXE, entity-expansion, or size/depth/node
limits). A well-formed document with vendor quirks never throws; the quirks collect on `.warnings`.

```ts runnable throws
import { parseCcda } from "@cosyte/ccda";

// Not a ClinicalDocument at all — a structural fatal, not a tolerated quirk.
parseCcda("<Foo>not a clinical document</Foo>"); // throws CcdaParseError (NOT_A_CLINICAL_DOCUMENT)
```

## Next

- [Core Concepts](./spec-notes-model) — the document model, the tolerance tiers, the clinical entry
  layer, and the datatype/code-system machinery.
- [Cookbook](./cookbook) — recipes: active-problem filtering, the code/narrative fail-safe, the
  performed-vs-planned split, warning triage, and the round-trip serializer.
- [Troubleshooting & known limitations](./troubleshooting) — the fatal codes, the fail-safe rules, and
  the explicit "what's not yet parsed" list.

> **About runnable examples.** The blocks tagged ` ```ts runnable ` above are extracted by the test
> suite, executed against the built package, and their `// =>` results asserted — so a documented
> example can never silently drift from the code (`docSnippetSuite()`, the documentation analog of the
> parser conformance runners). Blocks shown as plain ` ```ts ` are illustrative.
