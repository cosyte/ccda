---
id: spec-notes-versions
title: Which C-CDA and USCDI versions we read and build
sidebar_label: Versions we read and build
description: "Our conformance target, C-CDA R2.1 with Companion Guide R4.1, the stamps we recognize, and which later templates we model."
---

# Which C-CDA and USCDI versions we read and build

HL7 has published C-CDA R2.1 and, since 2024, 3.0.0, 4.0.0 and 5.0.0
([package list](https://hl7.org/cda/us/ccda/package-list.json), read 2026-11-11), and each carries a
different version of the United States Core Data for Interoperability (USCDI). This page says which
of them `@cosyte/ccda` targets, what it does with a document written for another, and which
templates added or reworked after R2.1 it models.
Every fact about a standard below names the page it was read from and the date it was read.

## Our target: C-CDA R2.1 with Companion Guide R4.1

We target **C-CDA Release 2.1 together with the C-CDA Companion Guide Release 4.1**. That is the pair
the US certification rules adopt: C-CDA R2.1 at 45 CFR 170.205(a)(4) and the Companion Guide R4.1 at
170.205(a)(6), with USCDI v3 at 170.213(b)
([eCFR 170.205](https://www.ecfr.gov/current/title-45/section-170.205) and
[eCFR 170.213](https://www.ecfr.gov/current/title-45/section-170.213), read 2026-11-11). HL7 maps the
pair to USCDI v3
([USCDI and C-CDA](https://hl7.org/cda/us/ccda/uscdi.html), read 2026-11-11).

The current C-CDA publication is **5.0.0**, published 2026-06-13 for USCDI v6
([package list](https://hl7.org/cda/us/ccda/package-list.json), read 2026-11-11). We read documents
written for 3.0.0, 4.0.0 and 5.0.0 leniently, and we build R2.1.

What the target means in the code today, part by part. "Stamped for 3.0.0 to 5.0.0" below means a
document whose document-type `templateId` carries a later stamp and **no** `templateId` with the same
root carries the R2.1 stamp; a document that carries both is read as R2.1
([the stamps we recognize](#the-stamps-we-recognize)).

| Part of the target                                       | What the code does today                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-CDA R2.1, read                                         | The recognition catalogs and the required-section tables are written against R2.1. `CCDA_CONFORMANCE_RELEASE` is `"R2.1"`.                                                                                                                                                                  |
| C-CDA R2.1, build                                        | `buildCcda` emits a CCD, a Referral Note or an inpatient Discharge Summary with R2.1 templates and stamps. `pnpm conformance` checks what it emits against the normative R2.1 Schematron.                                                                                                   |
| Companion Guide R4.1                                     | Named as the target, **not yet traced**. No Companion Guide constraint is in the tables, and `pnpm conformance` runs the R2.1 Schematron only, so a clean result says nothing about the Companion Guide.                                                                                    |
| A document stamped for 3.0.0 to 5.0.0, read              | Read leniently. Its clinical reading is the same as the same document stamped for R2.1.                                                                                                                                                                                                     |
| A document stamped for 3.0.0 to 5.0.0, required sections | Reported **not evaluated** today (`REQUIRED_SECTIONS_NOT_EVALUATED`, and `evaluation: "not-evaluated"` from `requiredSectionStatus`). Checking them against the 5.0.0 required sections for the document type is part of the target and is not built yet; until it is, nothing is asserted. |
| A document stamped for 3.0.0 to 5.0.0 and for R2.1       | Read as R2.1: its required sections are evaluated against the R2.1 tables, so `REQUIRED_SECTION_MISSING` can fire. The later stamp still draws `TEMPLATE_EXTENSION_UNMODELED_RELEASE` when it is on the `templateId` that resolves the type.                                                |
| A document stamped for 3.0.0 to 5.0.0, build             | Not built. `buildCcda` emits R2.1 only.                                                                                                                                                                                                                                                     |

## USCDI and the C-CDA version that carries it

From HL7's own table ([USCDI and C-CDA](https://hl7.org/cda/us/ccda/uscdi.html), read 2026-11-11),
with the publication dates from the
[package list](https://hl7.org/cda/us/ccda/package-list.json) (read 2026-11-11). The "Here" column
is for a document stamped for that publication alone; a document that also carries the R2.1 stamp on
the same root is read as R2.1.

| USCDI     | C-CDA publication                         | Published                | Here                                                    |
| --------- | ----------------------------------------- | ------------------------ | ------------------------------------------------------- |
| v1 and v2 | R2.1 with Companion Guide Release 2 and 3 | not on the pages we read | Read as R2.1                                            |
| v3        | R2.1 with Companion Guide Release 4.1     | not on the pages we read | **Our target.** R2.1 tables; Companion Guide not traced |
| v4        | 3.0.0                                     | 2024-05-18               | Read leniently; required sections not evaluated         |
| v5        | 4.0.0                                     | 2025-06-20               | Read leniently; required sections not evaluated         |
| v6        | 5.0.0, the current publication            | 2026-06-13               | Read leniently; required sections not evaluated         |

ONC published USCDI v7 on 2026-07-23
([ONC USCDI](https://isp.healthit.gov/united-states-core-data-interoperability-uscdi), read
2026-11-11). The package list we read names no C-CDA publication for it.

The certification rules adopt USCDI v3 at 170.213(b). The USCDI v1 adoption at 170.213(a) and the
Companion Guide Release 2 adoption at 170.205(a)(5) expired on 2026-01-01
([eCFR 170.213](https://www.ecfr.gov/current/title-45/section-170.213) and
[eCFR 170.205](https://www.ecfr.gov/current/title-45/section-170.205), read 2026-11-11).

## The stamps we recognize

The version stamp is the `@extension` on a document-type `templateId`. The parser resolves the
document type from the first `templateId` whose root names a recognized type, then reads the stamps
in two steps:

- **The reading** is `r21-stamped` whenever **any** `templateId` with that same root carries
  `2015-08-01`, in any order and beside any other stamp. Only when none does is the reading taken from
  the resolving `templateId`'s own `@extension`. This follows the context of the R2.1 Schematron
  rule, which matches a document carrying the stamped root anywhere among its `templateId`s.
- **The stamp warnings** read the resolving `templateId`'s own `@extension` only:
  `TEMPLATE_EXTENSION_ABSENT` when it has none, `TEMPLATE_EXTENSION_UNMODELED_RELEASE` when it has one
  that is not `2015-08-01`.

So a dual-stamped document, the usual backward-compatible shape of a 3.0.0 or later document, is
read as R2.1 and its required sections are checked against R2.1's tables, even though it can draw a
stamp warning. Section and entry `templateId`s play no part in this.

| `templateId`s with the resolving root             | Reading             | Warnings                                                                  | Required sections                           |
| ------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| `2015-08-01`                                      | `r21-stamped`       | none                                                                      | evaluated against R2.1                      |
| `2015-08-01` first, then `2024-05-01`             | `r21-stamped`       | none                                                                      | evaluated against R2.1                      |
| `2024-05-01` first, then `2015-08-01`             | `r21-stamped`       | `TEMPLATE_EXTENSION_UNMODELED_RELEASE`                                    | evaluated against R2.1                      |
| no extension first, then `2015-08-01`             | `r21-stamped`       | `TEMPLATE_EXTENSION_ABSENT`                                               | evaluated against R2.1                      |
| `2024-05-01`, and no `2015-08-01` on that root    | `unmodeled-release` | `TEMPLATE_EXTENSION_UNMODELED_RELEASE`, `REQUIRED_SECTIONS_NOT_EVALUATED` | not evaluated                               |
| no extension, and no `2015-08-01` on that root    | `unstamped`         | `TEMPLATE_EXTENSION_ABSENT`                                               | evaluated against the reduced unstamped set |
| any other value, and no `2015-08-01` on that root | `unmodeled-release` | `TEMPLATE_EXTENSION_UNMODELED_RELEASE`, `REQUIRED_SECTIONS_NOT_EVALUATED` | not evaluated                               |

`releaseForTemplateExtension` names the release a single stamp belongs to: `"R2.1"` for
`2015-08-01`, `"R3.0 or later"` for `2024-05-01`, and nothing for any other value. C-CDA 3.0.0 gave
every document template the `2024-05-01` stamp, and 4.0.0 and 5.0.0 kept it, so the stamp cannot
tell those three apart: we name them together as `"R3.0 or later"`
([C-CDA change log](https://hl7.org/cda/us/ccda/changes.html) and
[template ids](https://hl7.org/cda/us/ccda/templateids.html), read 2026-11-11).

Section and entry stamps do not name a release reliably either. Most section and entry templates in
5.0.0 still carry `2015-08-01`, 3.0.0 restamped some entry templates and no section template, and
5.0.0 stamps a few with `2025-05-01` or `2026-05-01`, among them the Pregnancy Section and the Notes
Section ([template ids](https://hl7.org/cda/us/ccda/templateids.html), read 2026-11-11). The parser
reads no release from them.

We recognize no stamp as a Companion Guide stamp. A document written to the Companion Guide reads as
whatever its document-type stamps say, so the parser cannot tell it from a plain R2.1 document.

A document stamped for a later release alone:

```ts runnable
import {
  CCDA_RELEASE_STAMPS,
  parseCcda,
  readTemplateStamp,
  releaseForTemplateExtension,
} from "@cosyte/ccda";

CCDA_RELEASE_STAMPS.map((entry) => entry.stamp); // => ["2015-08-01", "2024-05-01"]
releaseForTemplateExtension("2024-05-01"); // => "R3.0 or later"
readTemplateStamp("2024-05-01"); // => "unmodeled-release"

// A synthetic CCD stamped for C-CDA 3.0.0 or later, with no R2.1 stamp.
// Invented patient, fake OIDs.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2024-05-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2024-05-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0031"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
  <effectiveTime value="20260101"/>
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

// Read leniently: the type, the patient and the section are all there.
doc.documentType; // => "ccd"
doc.getMrn(); // => "MRN-00042"
doc.findSection("allergies")?.title; // => "Allergies"

// The release is named, and the required sections are reported unevaluated
// rather than checked against R2.1's list.
const codes = doc.warnings.map((w) => w.code);
codes.includes("TEMPLATE_EXTENSION_UNMODELED_RELEASE"); // => true
codes.includes("REQUIRED_SECTIONS_NOT_EVALUATED"); // => true
codes.includes("REQUIRED_SECTION_MISSING"); // => false
```

The same CCD dual-stamped, the later stamp first and the R2.1 stamp after it on the same root:

```ts runnable
import { parseCcda } from "@cosyte/ccda";

// A synthetic CCD carrying the CCD root twice: 2024-05-01, then 2015-08-01.
// Invented patient, fake OIDs.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2024-05-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2024-05-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0032"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
  <effectiveTime value="20260101"/>
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

// The resolving templateId carries 2024-05-01, so the stamp warning fires...
const codes = doc.warnings.map((w) => w.code);
codes.includes("TEMPLATE_EXTENSION_UNMODELED_RELEASE"); // => true

// ...but the R2.1 stamp on the same root makes the reading R2.1, so the
// required sections ARE evaluated against R2.1's CCD list. This CCD carries
// only Allergies, so the other five R2.1 requires are reported missing.
codes.includes("REQUIRED_SECTIONS_NOT_EVALUATED"); // => false
codes.filter((code) => code === "REQUIRED_SECTION_MISSING").length; // => 5
```

## Document types

C-CDA 5.0.0 lists 11 document types and two header templates
([template ids](https://hl7.org/cda/us/ccda/templateids.html), read 2026-11-11). We recognize all 12
of R2.1's document types:

- **Diagnostic Imaging Report is R2.1-only.** C-CDA 3.0.0 removed it
  ([C-CDA change log](https://hl7.org/cda/us/ccda/changes.html), read 2026-11-11). We still recognize
  it, as R2.1 defines it; a document claiming it with the `2024-05-01` stamp names a template the
  later releases do not have, and reads with `TEMPLATE_EXTENSION_UNMODELED_RELEASE` like any other.
- The other 11 types are in 5.0.0 too.
- The Patient Generated Document header (root `2.16.840.1.113883.10.20.29.1`) is not recognized. A
  document that carries only it gets no `documentType` and `UNKNOWN_DOCUMENT_TEMPLATE`.

## Templates added or reworked after R2.1, and which we model

The change log names these templates as added or reworked between 3.0.0 and 5.0.0
([C-CDA change log](https://hl7.org/cda/us/ccda/changes.html), read 2026-11-11). We checked each
against the source. **None is modeled in its later form.** The parser matches entry templates by
root and does not read their stamp, so a reworked template that kept its R2.1 root is read as R2.1's
template. This list holds the templates named in the change log as we read it, not every change in
it; the change log itself is the full record.

| Template                            | Change                 | Modeled | What the parser does with it                                                                                                                                            |
| ----------------------------------- | ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smoking Status (the 3.0.0 template) | added in 3.0.0         | no      | `getSmokingStatus()` reads only R2.1's Smoking Status, Meaningful Use observation (`2.16.840.1.113883.10.20.22.4.78`), so an entry of the new template is not returned. |
| Average Blood Pressure Organizer    | added in 3.0.0         | no      | `getVitals()` reads the Vital Signs Organizer (`2.16.840.1.113883.10.20.22.4.26`) only.                                                                                 |
| Medication Adherence                | added in 3.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Treatment Intervention Preference   | added in 3.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Care Experience Preference          | added in 3.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Individual Pronoun                  | added in 4.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Interpreter Needed                  | added in 4.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Advance Directive Existence         | added in 4.0.0         | no      | The Advance Directives section is framed (`findSection("advanceDirectives")`); no entry in it is read.                                                                  |
| Sex Parameter For Clinical Use      | added in 4.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Instruction Observation             | added in 4.0.0         | no      | Nothing reads it. Unlike R2.1's Instruction, it draws no `PLAN_ENTRY_NOT_MODELED`.                                                                                      |
| Age Range Observation               | added in 4.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Sex Observation                     | stamp changed in 4.0.0 | no      | Nothing reads it.                                                                                                                                                       |
| Pregnancy Section                   | added in 5.0.0         | no      | Not in the section catalog: framed as a narrative-only section with `UNKNOWN_SECTION_CODE`, nothing dropped.                                                            |
| Basic Industry and Occupation       | added in 5.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Care Plan Act                       | added in 5.0.0         | no      | Nothing reads it.                                                                                                                                                       |
| Notes Section                       | new version in 5.0.0   | no      | Its root is not in the section catalog. Framed as a narrative-only section with `UNKNOWN_SECTION_CODE`, unless its `<code>` is a LOINC the catalog knows.               |
| Note Activity                       | new version in 5.0.0   | no      | Nothing reads it.                                                                                                                                                       |
| Family History Organizer            | new version in 5.0.0   | no      | `getFamilyHistory()` matches the organizer by its R2.1 root (`2.16.840.1.113883.10.20.22.4.45`) and reads it as R2.1's; the 5.0.0 changes are not read.                 |

The same change log removes or deprecates R2.1 templates that we still read and build, because they
are R2.1's ([C-CDA change log](https://hl7.org/cda/us/ccda/changes.html), read 2026-11-11):

- Planned Act and Planned Observation, removed in 3.0.0: read by `getPlannedItems()` and emitted by
  `buildCcda`.
- Smoking Status, Meaningful Use, deprecated in 3.0.0: read by `getSmokingStatus()` and emitted by
  `buildCcda`.
- Instruction, deprecated in 4.0.0 in favor of Instruction Observation: recognized only to report
  `PLAN_ENTRY_NOT_MODELED`; its content is not read.
- The US Realm Header's `administrativeGenderCode`, optional from 4.0.0: R2.1 requires it, and the
  builder emits it.

## How-to guides that apply this

- [Check a document type's required sections](./check-required-sections.md), including the
  not-evaluated reading.
- [Triage warnings](./triage-warnings.md), to sort the warnings a later-release document draws.
- [Build a document](./build-a-document.md), which emits R2.1.

## Reference

- [`CCDA_CONFORMANCE_RELEASE`](./api/README.md#ccda_conformance_release),
  [`CCDA_RELEASE_STAMPS`](./api/README.md#ccda_release_stamps),
  [`readTemplateStamp`](./api/README.md#readtemplatestamp),
  [`releaseForTemplateExtension`](./api/README.md#releasefortemplateextension) and
  [`requiredSectionStatus`](./api/README.md#requiredsectionstatus).
- [Validation against C-CDA R2.1](./validation.md) and [known limitations](./limitations.md).
