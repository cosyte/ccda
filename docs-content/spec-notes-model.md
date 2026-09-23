---
id: spec-notes-model
title: The document model
sidebar_label: The document model
sidebar_position: 4
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
- A matched type whose `templateId` carries **no** `@extension` version stamp at all →
  `TEMPLATE_EXTENSION_ABSENT`, matched by root alone (it may pre-date R2.1).
- A matched type whose `templateId` carries an `@extension` that is **not** the R2.1 stamp
  (`2015-08-01`) → `TEMPLATE_EXTENSION_UNMODELED_RELEASE`. A different code, because it is a
  different document: one written for a release later than the one these tables target.

The generic US Realm Header / CDA-base templates are deliberately **not** in the type table, so they
are passed over: only a specific document-type `templateId` resolves a `documentType`.

## Which release a document was written for

The stamp on the resolving `templateId` reads into exactly three states, and the third is why a
boolean was not enough: `r21-stamped`, `unstamped` (no `@extension`, the R1.1-origin shape) and
`unmodeled-release` (a stamp these tables do not model). C-CDA 3.0.0 restamped every document
template `2024-05-01` and 4.0.0 and 5.0.0 kept it, so a post-R2.1 document is detectable.

**Recognizing a release is not targeting it.** `CCDA_CONFORMANCE_RELEASE` names the release this
package's conformance tables are written against, and it does not move because a later stamp is
recognized:

```ts runnable
import {
  CCDA_CONFORMANCE_RELEASE,
  CCDA_RELEASE_STAMPS,
  R21_EXTENSION,
  R30_EXTENSION,
  readTemplateStamp,
  releaseForTemplateExtension,
} from "@cosyte/ccda";

// The targeted release, as a value rather than a sentence in a README.
CCDA_CONFORMANCE_RELEASE; // => "R2.1"

// The closed table of stamps this package can NAME. Both are recognized; only
// one is targeted, and a diagnostic may never report anything outside it.
CCDA_RELEASE_STAMPS.map((entry) => entry.stamp).join(","); // => "2015-08-01,2024-05-01"
releaseForTemplateExtension(R21_EXTENSION); // => "R2.1"
releaseForTemplateExtension(R30_EXTENSION); // => "R3.0 or later"
releaseForTemplateExtension("1999-12-31"); // => undefined

// The three-state reading a required-section lookup is carried out under.
readTemplateStamp(undefined); // => "unstamped"
readTemplateStamp(R21_EXTENSION); // => "r21-stamped"
readTemplateStamp(R30_EXTENSION); // => "unmodeled-release"
```

A document in the third state is still parsed leniently, and its clinical reading is identical to the
same document stamped `2015-08-01`. What changes is the conformance claim: its required-section
obligation is reported **unevaluated** (`REQUIRED_SECTIONS_NOT_EVALUATED`, and
`evaluation: "not-evaluated"` on `requiredSectionStatus`) rather than computed under a reading that
does not reach it.

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

## Provenance: who authored it, who holds it, which encounter it covers

Three header participations answer the questions a clinician asks of a list assembled by three
systems. All three are **absent when the document carries none**, and nothing else in the document is
substituted for an absent one.

- `header.authorship` is the document-level author reading, a `CcdaAuthorship`. Its `authors` are
  every `<author>` in document order as `CcdaAuthor`s, each with its `identifiers`, its `person`
  (a `HumanName`) or its `device` (a `CcdaAuthoringDevice`), its `representedOrganization` (a
  `CcdaOrganization`), and its `time` at exactly the precision the document stated. A partial author
  time stays partial: nothing here completes a date.
- `header.custodian` is a `CcdaCustodian`, the organization responsible for the document. Its
  `organization` is omitted when the `<custodian>` carried no
  `assignedCustodian/representedCustodianOrganization` to read, so a malformed custodian is reported
  as present-with-nothing-readable rather than invented or dropped.
- `header.encompassingEncounter` is a `CcdaEncompassingEncounter`, the
  `componentOf/encompassingEncounter` an inpatient Discharge Summary carries: an `effectiveTime`
  interval whose bounds keep the document's own precision and `nullFlavor`s, and a
  `dischargeDispositionCode`. **Its bounds are never derived** from the document `effectiveTime`,
  from a `documentationOf` service event, or from any other date in the document. No `componentOf`
  means no encounter frame at all.

### An inherited author reading is marked, never asserted

CDA conducts an author down from the document to a section and on to that section's entries. This
parser reports that conduction rather than performing it silently. `CcdaSection.authorship` and each
entry's reading in `CcdaSection.entryAuthorship` (a `CcdaEntryAuthorship`, which also carries the
act's `ids` so you can join it to an extracted entry) carry an `inherited` flag:

- `inherited: false`: this level carried these `<author>` participations itself.
- `inherited: true`: this level carried none, and these are the nearest enclosing level's.

The distinction is the whole point. "The nearest enclosing author is Dr Lirio" and "this entry was
authored by Dr Lirio" are different claims and only the first is one the document made. When no level
carries an author, the reading is **absent** at every level: the record target, the custodian, a legal
authenticator and an informant are never read as the author.

An `<author>` whose `assignedAuthor` carries neither an `assignedPerson` nor an
`assignedAuthoringDevice` is kept, marked `unidentified: true`, and reported with
`UNIDENTIFIED_AUTHOR`. It still conducts to nested levels. Dropping it would turn "the document names
an author whose identity it never states" into "the document names no author", which is a more
reassuring claim than the document supports.

Entries an overriding `<subject>` declaration governs are absent from `entryAuthorship` entirely, not
even their `ids`, exactly as they are absent from every extracted entry family.

`entryAuthorship` is optional on the type and populated on every section the parser frames, empty
where the section has no entry act to read. It is optional because `CcdaSection` is an input surface
too (`CcdaDocumentInit.sections`), so a section literal you already build keeps compiling. Framing
reads each act's `<id>`s without reporting on them: the entry-extraction walk parses those same
elements, so a deviation on one is reported once, by that walk, exactly as before.

```ts runnable
import { parseCcda } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.9" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0007"/>
  <code code="11506-3" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic Progress Note</title>
  <effectiveTime value="20240301"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient>
      <name><given>Jane</given><family>Doe</family></name>
      <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>
    </patient>
  </patientRole></recordTarget>
  <author>
    <time value="202403"/>
    <assignedAuthor>
      <id root="2.16.840.1.113883.4.6" extension="NPI-SYNTH-1"/>
      <assignedPerson><name><given>Avery</given><family>Lirio</family></name></assignedPerson>
      <representedOrganization>
        <id root="2.16.840.1.113883.19.5.99999.3"/>
        <name>Synthetic Cardiology Practice</name>
      </representedOrganization>
    </assignedAuthor>
  </author>
  <custodian><assignedCustodian><representedCustodianOrganization>
    <id root="2.16.840.1.113883.19.5.99999.4"/>
    <name>Synthetic Health Organization</name>
  </representedCustodianOrganization></assignedCustodian></custodian>
  <component><structuredBody>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
      <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Allergies</title>
      <text>No known allergies.</text>
      <author>
        <time value="20240302"/>
        <assignedAuthor>
          <id root="2.16.840.1.113883.4.6" extension="NPI-SYNTH-2"/>
          <assignedPerson><name><given>Bryn</given><family>Okonkwo</family></name></assignedPerson>
        </assignedAuthor>
      </author>
    </section></component>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Problems</title>
      <text>None recorded.</text>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

const doc = parseCcda(xml);

// The document names its author, and the author time keeps month precision.
doc.header.authorship?.inherited; // => false
doc.header.authorship?.authors[0]?.person?.family; // => "Lirio"
doc.header.authorship?.authors[0]?.time?.raw; // => "202403"
doc.header.authorship?.authors[0]?.representedOrganization?.name; // => "Synthetic Cardiology Practice"
doc.header.custodian?.organization?.name; // => "Synthetic Health Organization"

// The Allergies section states its own author, so nothing is inherited there.
doc.findSection("allergies")?.authorship?.inherited; // => false
doc.findSection("allergies")?.authorship?.authors[0]?.person?.family; // => "Okonkwo"

// The Problems section states none, so it reports the document's, marked inherited.
doc.findSection("problems")?.authorship?.inherited; // => true
doc.findSection("problems")?.authorship?.authors[0]?.person?.family; // => "Lirio"

// No componentOf in this document, so there is no encounter frame at all.
doc.header.encompassingEncounter; // => undefined
```

## Section framing

Every `<section>` is framed by `templateId` root (primary) with a LOINC `code` fallback:

- Recognized by `templateId` → `recognizedBy: "templateId"`.
- Recognized only by LOINC code → `SECTION_MATCHED_BY_LOINC_FALLBACK`, `recognizedBy: "loinc"`.
- Neither recognizes it, but it carries the Hospital Course root (`1.3.6.1.4.1.19376.1.5.3.1.3.5`) →
  `key: "hospitalCourse"`, `recognizedBy: "templateId"`, no warning. Asked last and by that root
  only, so it never changes a key the first two found and its LOINC code alone recognizes nothing.
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
