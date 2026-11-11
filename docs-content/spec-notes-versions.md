---
id: spec-notes-versions
title: Which C-CDA and USCDI versions we read and build
sidebar_label: Versions we read and build
description: "Our conformance target, C-CDA R2.1 with Companion Guide R4.1, the stamps we recognize, and which later templates we model."
---

# Which C-CDA and USCDI versions we read and build

HL7 has published C-CDA R2.1 and, since 2024, 3.0.0, 4.0.0 and 5.0.0, and each carries a different
version of the United States Core Data for Interoperability (USCDI). This page says which of them
`@cosyte/ccda` targets, what it does with a document written for another, and which templates added
after R2.1 it models.
Every fact about a standard below names the page it was read from and the date it was read.

## Our target: C-CDA R2.1 with Companion Guide R4.1

We target **C-CDA Release 2.1 together with the C-CDA Companion Guide Release 4.1**. That is the pair
the US certification rules adopt: C-CDA R2.1 at 45 CFR 170.205(a)(4) and the Companion Guide R4.1 at
170.205(a)(6), with USCDI v3 at 170.213(b)
([eCFR 170.205](https://www.ecfr.gov/current/title-45/section-170.205) and
[eCFR 170.213](https://www.ecfr.gov/current/title-45/section-170.213), read 2026-09-25). HL7 maps the
pair to USCDI v3
([USCDI and C-CDA](https://hl7.org/cda/us/ccda/uscdi.html), read 2026-11-11).

The current C-CDA publication is **5.0.0**, published 2026-06-13 for USCDI v6
([package list](https://hl7.org/cda/us/ccda/package-list.json), read 2026-09-25). We read documents
written for 3.0.0, 4.0.0 and 5.0.0 leniently, and we build R2.1.

What the target means in the code today, part by part:

| Part of the target                                       | What the code does today                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-CDA R2.1, read                                         | The recognition catalogs and the required-section tables are written against R2.1. `CCDA_CONFORMANCE_RELEASE` is `"R2.1"`.                                                                                                                                                                  |
| C-CDA R2.1, build                                        | `buildCcda` emits a CCD, a Referral Note or an inpatient Discharge Summary with R2.1 templates and stamps. `pnpm conformance` checks what it emits against the normative R2.1 Schematron.                                                                                                   |
| Companion Guide R4.1                                     | Named as the target, **not yet traced**. No Companion Guide constraint is in the tables, and `pnpm conformance` runs the R2.1 Schematron only, so a clean result says nothing about the Companion Guide.                                                                                    |
| A document stamped for 3.0.0 to 5.0.0, read              | Read leniently. Its clinical reading is the same as the same document stamped for R2.1.                                                                                                                                                                                                     |
| A document stamped for 3.0.0 to 5.0.0, required sections | Reported **not evaluated** today (`REQUIRED_SECTIONS_NOT_EVALUATED`, and `evaluation: "not-evaluated"` from `requiredSectionStatus`). Checking them against the 5.0.0 required sections for the document type is part of the target and is not built yet; until it is, nothing is asserted. |
| A document stamped for 3.0.0 to 5.0.0, build             | Not built. `buildCcda` emits R2.1 only.                                                                                                                                                                                                                                                     |

## USCDI and the C-CDA version that carries it

From HL7's own table ([USCDI and C-CDA](https://hl7.org/cda/us/ccda/uscdi.html), read 2026-11-11),
with the publication dates from the
[package list](https://hl7.org/cda/us/ccda/package-list.json) (read 2026-09-25):

| USCDI     | C-CDA publication                         | Published                | Here                                                    |
| --------- | ----------------------------------------- | ------------------------ | ------------------------------------------------------- |
| v1 and v2 | R2.1 with Companion Guide Release 2 and 3 | not on the pages we read | Read as R2.1                                            |
| v3        | R2.1 with Companion Guide Release 4.1     | not on the pages we read | **Our target.** R2.1 tables; Companion Guide not traced |
| v4        | 3.0.0                                     | 2024-05-18               | Read leniently; required sections not evaluated         |
| v5        | 4.0.0                                     | 2025-06-20               | Read leniently; required sections not evaluated         |
| v6        | 5.0.0, the current publication            | 2026-06-13               | Read leniently; required sections not evaluated         |

ONC published USCDI v7 on 2026-07-23
([ONC USCDI](https://www.healthit.gov/isp/united-states-core-data-interoperability-uscdi), read
2026-09-25). The package list we read names no C-CDA publication for it.

The certification rules adopt USCDI v3; the USCDI v1 adoption and the Companion Guide Release 2
adoption expired on 2026-01-01
([eCFR 170.213](https://www.ecfr.gov/current/title-45/section-170.213) and
[eCFR 170.205](https://www.ecfr.gov/current/title-45/section-170.205), read 2026-09-25).

## The stamps we recognize

The parser reads the version stamp, the `@extension`, on the `templateId` that resolves the document
type, and nothing else, into one of three readings:

| `@extension` on the resolving `templateId` | Release we name   | Reading             | Warnings                                                                  |
| ------------------------------------------ | ----------------- | ------------------- | ------------------------------------------------------------------------- |
| `2015-08-01`                               | `"R2.1"`          | `r21-stamped`       | none                                                                      |
| `2024-05-01`                               | `"R3.0 or later"` | `unmodeled-release` | `TEMPLATE_EXTENSION_UNMODELED_RELEASE`, `REQUIRED_SECTIONS_NOT_EVALUATED` |
| none                                       | none              | `unstamped`         | `TEMPLATE_EXTENSION_ABSENT`                                               |
| any other value                            | none              | `unmodeled-release` | `TEMPLATE_EXTENSION_UNMODELED_RELEASE`, `REQUIRED_SECTIONS_NOT_EVALUATED` |

C-CDA 3.0.0 gave every document template the `2024-05-01` stamp, and 4.0.0 and 5.0.0 kept it, so the
stamp cannot tell those three apart: we name them together as `"R3.0 or later"`. Section and entry
templates are not a release signal, since 3.0.0 restamped only some entry templates and no section
template ([C-CDA change log](https://hl7.org/cda/us/ccda/changes.html), read 2026-11-11).

We recognize no stamp as a Companion Guide stamp. A document written to the Companion Guide reads as
whatever its document-type stamp says, so the parser cannot tell it from a plain R2.1 document.

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

// A synthetic CCD stamped for C-CDA 3.0.0 or later. Invented patient, fake OIDs.
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

## Document types

C-CDA 5.0.0 lists 11 document types and two header templates
([template ids](https://hl7.org/cda/us/ccda/templateids.html), read 2026-11-11). We recognize 12, all
of R2.1's:

- **Diagnostic Imaging Report is R2.1-only.** C-CDA 3.0.0 removed it
  ([C-CDA change log](https://hl7.org/cda/us/ccda/changes.html), read 2026-11-11). We still recognize
  it, as R2.1 defines it; a document claiming it with the `2024-05-01` stamp names a template the
  later releases do not have, and reads with `TEMPLATE_EXTENSION_UNMODELED_RELEASE` like any other.
- The other 11 types are in 5.0.0 too.
- The Patient Generated Document header (root `2.16.840.1.113883.10.20.29.1`) is not recognized. A
  document that carries only it gets no `documentType` and `UNKNOWN_DOCUMENT_TEMPLATE`.

## Templates added after R2.1, and which we model

The change log names these templates as added or reworked between 3.0.0 and 5.0.0
([C-CDA change log](https://hl7.org/cda/us/ccda/changes.html), read 2026-11-11). We checked each
against the source. **None is modeled.** This list holds the templates named in the change log as we
read it, not every change in it; the change log itself is the full record.

| Template                            | Modeled | What the parser does with it                                                                                                                                            |
| ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pregnancy Section                   | no      | Not in the section catalog: framed as a narrative-only section with `UNKNOWN_SECTION_CODE`, nothing dropped.                                                            |
| Smoking Status (the 3.0.0 template) | no      | `getSmokingStatus()` reads only R2.1's Smoking Status, Meaningful Use observation (`2.16.840.1.113883.10.20.22.4.78`), so an entry of the new template is not returned. |
| Individual Pronoun                  | no      | Nothing reads it.                                                                                                                                                       |
| Interpreter Needed                  | no      | Nothing reads it.                                                                                                                                                       |
| Basic Industry and Occupation       | no      | Nothing reads it.                                                                                                                                                       |
| Advance Directive Existence         | no      | The Advance Directives section is framed (`findSection("advanceDirectives")`); no entry in it is read.                                                                  |
| Average Blood Pressure Organizer    | no      | `getVitals()` reads the Vital Signs Organizer (`2.16.840.1.113883.10.20.22.4.26`) only.                                                                                 |
| Age Range Observation               | no      | Nothing reads it.                                                                                                                                                       |
| Care Plan Act                       | no      | Nothing reads it.                                                                                                                                                       |

The same change log removes or deprecates R2.1 templates that we still read and build, because they
are R2.1's:

- Planned Act and Planned Observation, removed after R2.1: read by `getPlannedItems()` and emitted by
  `buildCcda`.
- Smoking Status, Meaningful Use, deprecated: read by `getSmokingStatus()` and emitted by
  `buildCcda`.
- Instruction, deprecated: recognized only to report `PLAN_ENTRY_NOT_MODELED`; its content is not
  read.
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
