---
id: intro
title: Getting started
sidebar_position: 1
---

# @cosyte/ccda

Parse real-world, vendor-quirky C-CDA and pull fields out in one line — without reading the spec.
`@cosyte/ccda` is a near-zero-dependency TypeScript toolkit following the cosyte parser archetype: a
lenient parser (quirks become **warnings**, not failures — Postel's Law), an immutable model, and a
spec-clean, round-trip serializer. It mirrors the API shape of the reference parser, `@cosyte/hl7`.
Its single runtime dependency is the hardened W3C-DOM substrate `@xmldom/xmldom` (exact-pinned),
configured XXE-safe.

> **Status:** **published on npm at `0.0.1`** and **public** — still pre-alpha on the cosyte `0.0.x`
> version ladder (`0.0.x` until first alpha). The parser ships
> document recognition (all 12 US Realm types), the US Realm header + patient demographics, section
> framing, the reconciliation triad (Problems / Medications / Allergies), the discrete-data families
> (Results / Vital Signs / Immunizations) with a computable UCUM unit check, Procedures / Encounters /
> Social-History smoking status, the deferred clinical sections (Plan of Treatment / Functional Status /
> Mental Status / Family History / Past Medical History), per-document-type required-section (SHALL)
> validation, and a **round-trip serializer** (`serializeCcda` / `toString()`). A document **builder**
> (`buildCcda`) emits a spec-clean **CCD** or **Referral Note**, a document **editor** (`editCcda`)
> re-emits a parsed document with a section added or replaced (every untouched section byte-preserved),
> and a **bring-your-own terminology adapter** semantically validates coded values against your own
> licensed service. The other ten document types land in a later increment — see
> [Troubleshooting](./troubleshooting) for the exact "what's not yet parsed" list.

## Install

```bash
npm install @cosyte/ccda
```

## Parse a document

```ts runnable
import { parseCcda } from "@cosyte/ccda";

// Synthetic CCD — invented "Jane Q. Doe", fake OIDs/IDs. Never a real document.
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
// check flags the sections it expects but does not find — as warnings, never
// fatals, so the data that IS present still parses.
doc.warnings.every((w) => w.code === "REQUIRED_SECTION_MISSING"); // => true
```

The parser is **lenient by default** — recoverable vendor quirks become stable-coded warnings on
`doc.warnings` (also delivered live to `options.onWarning`), not failures. `{ strict: true }` escalates
the first tolerated deviation to a thrown `CcdaParseError`; unrecoverable or hostile input (DTD/XXE,
billion-laughs entity expansion, oversized/over-deep/over-wide documents, malformed XML, a
non-`ClinicalDocument` root) always throws.

## What it extracts today

- **Document type** — all 12 US Realm document types resolved from the root `templateId`.
- **US Realm header** — document identity and the `recordTarget` patient (demographics + identifiers),
  via `getPatient()` / `getMrn()`.
- **Sections** — framed by `templateId` with a LOINC-code fallback, with nested subsections, narrative
  text, and a narrative `ID`→text index, via `findSection()` / `allSections()`.
- **Clinical entries** — Problems, Medications, Allergies, Results, Vital Signs, Immunizations,
  Procedures, Encounters, Smoking Status, Plan of Treatment, Functional/Mental Status, Family History,
  and Past Medical History, with the safety-critical distinctions (performed-vs-planned,
  severity-vs-criticality, negated-vs-unknown) kept apart, never conflated.
- **HL7 v3 datatypes** — `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`, with
  variable-precision v3 datetime parsing and null-flavor handling.
- **Serialize** — `serializeCcda(doc)` / `doc.toString()` re-emits a **parsed** document as spec-clean
  XML (a fixed point), with no silent loss.
- **Build** — `buildCcda(init)` constructs a spec-clean **CCD** or **Referral Note** from structured
  input, round-tripping through the same parse model; `editCcda(doc, …)` re-emits a parsed document with a
  section added or replaced, byte-preserving every untouched section.

## Next

- **[Installation](./installation)** — prerequisites + a smoke test.
- **[Quickstart](./quickstart)** — parse a CCD and pull demographics + the problem/med/allergy triad.
- **[Core Concepts](./spec-notes-model)** — the document model, the tolerance tiers, the clinical entry
  layer, and the datatype/code-system machinery.
- **[Cookbook](./cookbook)** — task-oriented recipes.
- **[Troubleshooting & known limitations](./troubleshooting)** — the error model and the explicit
  "what's not yet parsed" list.
- The **API reference** for every export is generated from source by the docs site (TypeDoc), not
  hand-authored here.
