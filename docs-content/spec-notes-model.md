---
id: spec-notes-model
title: The document model
sidebar_label: The document model
sidebar_position: 1
---

# The document model: recognition, header, sections

A C-CDA is a CDA R2 `ClinicalDocument`: a **US Realm header** (who, what kind, when) wrapping a
**body** that is either a `structuredBody` (a tree of `<section>`s) or a `nonXMLBody` (a wrapped PDF /
scanned document). `parseCcda` frames all three into one immutable `CcdaDocument`.

## Document recognition

The document **type** is resolved from the root `templateId` OIDs against the 12 recognized US Realm
types (CCD, Discharge Summary, Referral Note, Consultation Note, History & Physical, Progress Note,
Procedure Note, Operative Note, Care Plan, Diagnostic Imaging Report, Unstructured Document, Transfer
Summary). Recognition is fail-safe:

- No `templateId` at all → `MISSING_TEMPLATE_ID`, `documentType` is `undefined`.
- `templateId`s present but none map to a known type → `UNKNOWN_DOCUMENT_TEMPLATE`, still parsed as a
  generic `ClinicalDocument`.
- A matched type whose `templateId` lacks the R2.1 `@extension` version stamp (`2015-08-01`) →
  `TEMPLATE_EXTENSION_ABSENT`, matched by root alone (it may pre-date R2.1).

The generic US Realm Header / CDA-base templates are deliberately **not** in the type table, so they
are passed over: only a specific document-type `templateId` resolves a `documentType`.

## The US Realm header

`getPatient()` returns the first `recordTarget` patient (a document with more than one emits
`MULTIPLE_RECORD_TARGETS` and this resolves the first); `getMrn()` returns the patient's medical record
number, the **first** `patientRole/id` extension, via `pickMrn`, and `undefined` when that id
carries a `nullFlavor`: reading it out would be a selection rather than a report, and a bare
`string` has nowhere to carry the marking that qualified it. It withholds rather than falling
through to the next id, since nothing in a C-CDA ranks `patientRole/id` entries and the next one is
as likely to be an account or member number. The verbatim value is still on
`getPatient()?.identifiers`, with its `nullFlavor` beside it. The header also carries the document
`code`, `title`, `effectiveTime`, `confidentialityCode`, and `languageCode`.

## Section framing

Every `<section>` is framed by `templateId` root (primary) with a LOINC `code` fallback:

- Recognized by `templateId` → `recognizedBy: "templateId"`.
- Recognized only by LOINC code → `SECTION_MATCHED_BY_LOINC_FALLBACK`, `recognizedBy: "loinc"`.
- Neither recognizes it → `UNKNOWN_SECTION_CODE`, retained as **narrative-only** (nothing is dropped).

`findSection(key)` walks top-level sections then their subsections (depth-first); `allSections()`
returns every section flattened in document order. Each section carries its `title`, `code`,
`narrativeText`, and a narrative `ID`→text index (`narrativeById`) so the clinical-entry layer can
resolve `<reference value="#id">` back to the human-readable text.

```ts runnable
import { parseCcda } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0004"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
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
      <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
      <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Allergies</title>
      <text>No known allergies.</text>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

const doc = parseCcda(xml);

doc.documentType; // => "ccd"
doc.header.title; // => "Synthetic CCD"
doc.allSections().map((s) => s.key); // => ["allergies"]
doc.findSection("allergies")?.recognizedBy; // => "templateId"
doc.findSection("allergies")?.narrativeText; // => "No known allergies."
```

## Unstructured documents

An Unstructured Document carries a `nonXMLBody` instead of a `structuredBody`. The parser exposes its
wrapped content on `doc.nonXmlBody` as an `ED` datatype and **leaves any base64 payload inert**: it is
never decoded (decoding an arbitrary embedded blob is a needless attack surface and a PHI-handling
decision the caller owns).

## Immutability

A `CcdaDocument` is frozen at the model boundary: accessors return the parsed data by reference and
callers cannot mutate parser output. The one sanctioned copy-with is `doc.withWarnings(extra)`, which
returns a **new** document with extra warnings appended, sharing every parsed field by reference and
leaving the original untouched. `buildCcda` and `editCcda` follow the same discipline: neither mutates
a document in place, each returns a new one.
