---
id: intro
title: Overview
sidebar_label: Overview
description: "What @cosyte/ccda does, who it is for and what it is not: a lenient C-CDA parser with a spec-clean serializer, builder and editor."
---

# @cosyte/ccda

Parse real-world, vendor-quirky C-CDA and pull fields out in one line, without reading the spec.
`@cosyte/ccda` is a near-zero-dependency TypeScript toolkit following the Cosyte parser archetype: a
lenient parser (quirks become **warnings**, not failures: Postel's Law), an immutable model, and a
spec-clean, round-trip serializer. It mirrors the API shape of the reference parser, `@cosyte/hl7`.
Its single runtime dependency is the W3C-DOM substrate `@xmldom/xmldom` (exact-pinned),
configured XXE-safe.

> **Status:** `0.1`, **published on npm**, and **public**. The exported names, options, return
> shapes, and warning codes are the surface we keep stable, and below 1.0 a breaking change bumps
> the minor version and is called out in the changelog with its migration. Run
> `npm view @cosyte/ccda version` for the current version. The parser ships
> document recognition (all 12 US Realm types), the US Realm header + patient demographics, section
> framing, the reconciliation triad (Problems / Medications / Allergies), the discrete-data families
> (Results / Vital Signs / Immunizations) with a computable UCUM unit check, Procedures / Encounters /
> Social-History smoking status, the care-planning and history families (Plan of Treatment /
> Functional Status / Mental Status / Family History / Past Medical History), per-document-type
> required-section (SHALL)
> validation, and a **round-trip serializer** (`serializeCcda` / `toString()`). A document **builder**
> (`buildCcda`) emits a spec-clean **CCD**, **Referral Note**, or inpatient **Discharge Summary**, a
> document **editor** (`editCcda`)
> re-emits a parsed document with a section added or replaced (every untouched section byte-preserved),
> and a **bring-your-own terminology adapter** semantically validates coded values against your own
> licensed service. The builder emits three of the twelve document types; the other nine are not
> implemented. See [Known limitations](./limitations.md) for exactly what the parser, builder, and
> editor do and do not do today.

## Install

```bash
npm install @cosyte/ccda
```

## Parse a document

```ts runnable
import { parseCcda } from "@cosyte/ccda";

// Synthetic CCD: invented "Jane Q. Doe", fake OIDs/IDs. Never a real document.
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
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
      <patient>
        <name><given>Jane</given><given>Q</given><family>Doe</family></name>
        <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1" displayName="Female"/>
        <birthTime value="19800101"/>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Problems</title>
          <text><content ID="prob1">Essential hypertension</content></text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
              <statusCode code="active"/>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
                  <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
                  <value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>
                  <text><reference value="#prob1"/></text>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>
    </structuredBody>
  </component>
</ClinicalDocument>`;

const doc = parseCcda(xml);

doc.documentType; // => "ccd"
doc.getPatient()?.name?.family; // => "Doe"
doc.getMrn(); // => "MRN-00042"
doc.findSection("problems")?.title; // => "Problems"
doc.getProblems()[0]?.status; // => "active"
doc.getProblems()[0]?.problems[0]?.value?.code; // => "59621000"

// This CCD carries only a Problems section, so the required-section (SHALL)
// check flags the sections it expects but does not find, as warnings, never
// fatals, so the data that IS present still parses.
doc.warnings.every((w) => w.code === "REQUIRED_SECTION_MISSING"); // => true
```

The parser is **lenient by default**: recoverable vendor quirks become stable-coded warnings on
`doc.warnings` (also delivered live to `options.onWarning`), not failures. `{ strict: true }` escalates
the first tolerated deviation to a thrown `CcdaParseError`; unrecoverable or hostile input (DTD/XXE,
billion-laughs entity expansion, oversized/over-deep/over-wide documents, XML that does not
parse, a non-`ClinicalDocument` root) always throws.

## What it extracts today

- **Document type**: all 12 US Realm document types resolved from the root `templateId`.
- **US Realm header**: document identity and the `recordTarget` patient (demographics + identifiers),
  via `getPatient()` / `getMrn()`.
- **Sections**: framed by `templateId` with a LOINC-code fallback, with nested subsections, narrative
  text, and a narrative `ID`→text index, via `findSection()` / `allSections()`.
- **Clinical entries**: Problems, Medications, Allergies, Results, Vital Signs, Immunizations,
  Procedures, Encounters, Smoking Status, Plan of Treatment, Functional/Mental Status, Family History,
  and Past Medical History, with the safety-critical distinctions (performed-vs-planned,
  severity-vs-criticality, negated-vs-unknown) kept apart, never conflated.
- **HL7 v3 datatypes**: `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`, with
  variable-precision v3 datetime parsing and null-flavor handling.
- **Serialize**: `serializeCcda(doc)` / `doc.toString()` re-emits a **parsed** document as spec-clean
  XML (a fixed point), with no silent loss.
- **Build**: `buildCcda(init)` constructs a spec-clean **CCD**, **Referral Note**, or inpatient
  **Discharge Summary** from structured input, round-tripping through the same parse model;
  `editCcda(doc, …)` re-emits a parsed document with a section added or replaced, byte-preserving
  every untouched section.

## Who it is for, and what it is not

It is for teams that receive or send C-CDA documents in Node.js or TypeScript: reading a CCD,
Referral Note or Discharge Summary that arrived on a transition of care, building one to send, or
correcting one section of a document and sending the revision.

It is not a transport (no MLLP or XDS delivery), not a terminology service (it recognizes
code systems and asks your own service about membership), and not a certified validator (the
required-section and value-set checks are stated with how far each was traced, and a quiet parse is
not a conformance result). It reads C-CDA R2.1, US Realm; other CDA templates and realms are out of
scope.

Our conformance target is C-CDA R2.1 with Companion Guide R4.1 (USCDI v3): we build R2.1, read
3.0.0 to 5.0.0 documents leniently, and do not trace the Companion Guide yet
([versions we read and build](./spec-notes-versions.md)).

## Next

- **[Installation](./installation.md)**: prerequisites and a smoke test.
- **[Quickstart](./quickstart.md)**: parse a CCD and pull the patient and the problem, medication and
  allergy lists.
- **How-to guides**: [read the active problem list](./read-the-problem-list.md),
  [triage warnings](./triage-warnings.md), [build a document](./build-a-document.md),
  [edit a document](./edit-a-document.md), [serialize a document](./serialize-a-document.md),
  [apply a vendor profile](./apply-a-vendor-profile.md), and the conformance checks.
- **Explanation**: [the document model](./spec-notes-model.md),
  [the versions we read and build](./spec-notes-versions.md),
  [tolerance and the warning model](./spec-notes-tolerance.md),
  [the clinical entry layer](./spec-notes-clinical.md) and
  [the parser archetype](./parser-archetype.md).
- **Reference**: [what it extracts](./what-it-extracts.md), [known limitations](./limitations.md), and
  the [API reference](./api/README.md), generated from the TSDoc comments in the source.
- **[Troubleshooting](./troubleshooting.md)**: when it throws, when it warns, and the common
  symptoms.
