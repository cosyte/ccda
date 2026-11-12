---
id: limitations
title: Known limitations
sidebar_label: Known limitations
description: "Everything the parser, the builder and the editor do and do not do today, stated so you can decide before you rely on it."
---

# Known limitations

This page is the deliberate "do not over-trust" list: each boundary of the parser, the builder and
the editor, in brief and in tables. Where a boundary applies, the raw value is kept, usually with a
warning, and is not decoded further. [The boundaries of reading, building and
editing](./boundaries.md) explains each one, and the cases where a value still leaves the model with
no warning.

## In brief

- `parseCcda` recognizes all twelve document types and decodes fourteen entry families; other sections keep their narrative only.
- An entry another `<subject>` governs is withheld from the patient's read paths and reached only through `toString()`.
- A document that restates the patient as an entry subject loses those entries from the patient's read paths too.
- Code checks test a code's system at five coded slots; membership needs your terminology adapter or value-set source.
- A code in a `<translation>` is kept and re-serialized but never slot-checked.
- UCUM validation is grammatical, over a curated subset of atoms, and converts no unit.
- LOINC deprecation is checked against a curated list, not the whole LOINC release.
- Required-section checks under-warn; `requiredSectionStatus` says how far each document type was traced.
- `buildCcda` writes six of the twelve document types and refuses the other six.
- `buildCcda` refuses a coded value with no `displayName` rather than write a default label.
- `buildCcda` never invents a clinical time, an identifier or an assessment; it writes `nullFlavor="UNK"` or reports a code.
- `editCcda` adds or replaces whole sections of twelve kinds, removes none, and stamps `RPLC` revisions only.
- A vendor profile quiets only codes outside `SAFETY_CRITICAL_CODES` and never changes an extracted value.
- An Unstructured Document's `nonXMLBody` payload is exposed but never decoded.
- An element holding one attribute name twice under two prefixes of one namespace is refused with `NOT_WELL_FORMED_XML`, never read with one of the two.
- The scope is C-CDA R2.1, US Realm: no transport and no validator suite.

## Document types

| Document type               | `documentType`             | Read | Built by `buildCcda` | Required sections verified |
| --------------------------- | -------------------------- | ---- | -------------------- | -------------------------- |
| Continuity of Care Document | `ccd`                      | Yes  | Yes                  | `traced-complete`          |
| Discharge Summary           | `dischargeSummary`         | Yes  | Yes                  | `traced-partial`           |
| Referral Note               | `referralNote`             | Yes  | Yes                  | `traced-partial`           |
| Consultation Note           | `consultationNote`         | Yes  | Yes                  | `traced-partial`           |
| History and Physical        | `historyAndPhysical`       | Yes  | Yes                  | `traced-partial`           |
| Progress Note               | `progressNote`             | Yes  | Yes                  | `traced-partial`           |
| Procedure Note              | `procedureNote`            | Yes  | No                   | `traced-partial`           |
| Operative Note              | `operativeNote`            | Yes  | No                   | `traced-partial`           |
| Care Plan                   | `carePlan`                 | Yes  | No                   | `traced-complete`          |
| Diagnostic Imaging Report   | `diagnosticImagingReport`  | Yes  | No                   | `traced-partial`           |
| Unstructured Document       | `unstructuredDocument`     | Yes  | No                   | `not-applicable`           |
| Transfer Summary            | `transferSummary`          | Yes  | No                   | `traced-partial`           |
| Patient Generated Document  | `patientGeneratedDocument` | Yes  | No                   | `traced-complete`          |

The last row is the Patient Generated Document header, which `parseCcda` reads when a document
carries it alone. The last column is `requiredSectionStatus(documentType).verification`:

```ts runnable
import { DOCUMENT_TYPES, requiredSectionStatus } from "@cosyte/ccda";

const verified = DOCUMENT_TYPES.map(
  (type) => `${type}:${requiredSectionStatus(type).verification}`,
).join(" ");

verified; // => "ccd:traced-complete dischargeSummary:traced-partial referralNote:traced-partial consultationNote:traced-partial historyAndPhysical:traced-partial progressNote:traced-partial procedureNote:traced-partial operativeNote:traced-partial carePlan:traced-complete diagnosticImagingReport:traced-partial unstructuredDocument:not-applicable transferSummary:traced-partial patientGeneratedDocument:traced-complete"
```

## What each part covers

| Part                                        | Covers                                                                                                                                                                                                                  | Does not cover                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry families decoded by `parseCcda`       | Problems, Medications, Allergies, Results, Vital Signs, Immunizations, Procedures, Encounters, Social History smoking status, Plan of Treatment, Functional Status, Mental Status, Family History, Past Medical History | The entries of every other section, which keep their narrative and raw structure                                                                                                 |
| Coded slots checked for their code system   | `problem`, `medication`, `allergen`, `route`, `vaccine`                                                                                                                                                                 | Results and Vital Signs LOINC codes, procedure, encounter and family-history codes, most planned-item codes, status values, the allergy type, reaction, severity and criticality |
| Slots `buildCcda` writes `<translation>` at | The problem value, the allergen, the medication drug and route, the vaccine and route                                                                                                                                   | Every other coded slot                                                                                                                                                           |
| Section kinds `editCcda` edits              | `problems`, `allergies`, `medications`, `results`, `vitalSigns`, `immunizations`, `procedures`, `encounters`, `socialHistory`, `pastMedicalHistory`, `planOfTreatment`, `familyHistory`                                 | Functional Status, Mental Status, Assessment, Reason for Referral and the five office-visit narratives; entry-level append; section removal; `APND` and `XFRM` revisions         |
| Built-in vendor profiles                    | `ccdaProfiles.default`, `ccdaProfiles.smartScorecard`, `ccdaProfiles.legacyR11`                                                                                                                                         | Named per-vendor profiles                                                                                                                                                        |

## Cases reported against other parsers

The open issues on other C-CDA parsers are mostly one complaint: a value the document carried came
back as nothing, with nothing said. We took each class of that complaint, wrote a synthetic document
for it, and hold every class to one rule: the value is in the typed model, or a warning with a named
code is raised on the element that holds it. `test/silent-loss.test.ts` runs them. Every class meets
the rule. Three of them used to drop the value with no warning (an entry with no `templateId`, a Goal
Observation, an implant's device) and a `REAL` value was reported but its number was not in the
model; all four were fixed in the same release.

| Class                                                                    | What we do today                                                                                                                                                                            | Result            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Allergy whose category is not food                                       | `type` keeps the propensity code and `allergen` the substance, whatever the category                                                                                                        | Kept              |
| Interval `effectiveTime` on a medication                                 | `duration.low` and `duration.high`                                                                                                                                                          | Kept              |
| Interval `effectiveTime` on a result                                     | `effectiveTime.low` and `effectiveTime.high`                                                                                                                                                | Kept              |
| `REAL` observation value                                                 | `{ kind: "real", value, raw }`: the number and the verbatim `@value`, no warning                                                                                                            | Kept              |
| `ED` observation value                                                   | `{ kind: "unsupported", xsiType: "ED", raw }` with the text, and `RESULT_VALUE_TYPE_UNHANDLED`                                                                                              | Kept and reported |
| Family History section                                                   | `getFamilyHistory()`: the relative and each condition                                                                                                                                       | Kept              |
| `negationInd` on a problem                                               | `negated: true` beside the coded `value`                                                                                                                                                    | Kept              |
| `negationInd` on a medication                                            | `negated: true` beside the `drug`                                                                                                                                                           | Kept              |
| Medication whose first `templateId` is not the Medication Activity root  | Read: every `templateId` is checked, not only the first                                                                                                                                     | Kept              |
| Timestamp with no zone offset                                            | `raw` keeps every digit; `toObject` gives no `offsetMinutes` and `toDate` gives `undefined` unless you pass `assumeOffsetMinutes`                                                           | Kept              |
| A single `participant`                                                   | The allergen is read from it like any other                                                                                                                                                 | Kept              |
| Medication entry with no `templateId`                                    | Not read, since every entry family is recognized by `templateId`; `MISSING_TEMPLATE_ID` is raised on the entry's statement. The same holds for an entry with no `templateId` in any section | Reported          |
| Goals section with a Goal Observation                                    | The section is recognized and keeps its narrative; the Goal Observation is not modeled, and `PLAN_ENTRY_NOT_MODELED` is raised on it                                                        | Reported          |
| Implant: a procedure in Medical Equipment with a Product Instance device | The procedure is read, and `devices` on it keeps the device code and its `ids` (the UDI). The guide names this entry in this section, so it draws no `SECTION_PLACEMENT_SUSPECT`            | Kept              |

A reported value is still in the document: `doc.toString()` re-serializes it faithfully, so a caller
who needs it can read it from there. Two boundaries remain beside these classes. An entry whose
statement carries a `templateId` this library does not read (a Health Concern Act, a Non-Medicinal
Supply Activity, an Advance Directive Observation) is not in the model and draws no warning. A
Product Instance's `scopingEntity`, the organization that issued the device id, is not read.

## Scope (non-goals)

- **C-CDA R2.1, US Realm.** Other CDA templates and realms are out of the current scope.
- **A parser + serializer, not a transport or a validator suite.** No MLLP/XDS delivery, no Schematron
  conformance report: this reads and re-emits documents.
- **Below 1.0.** `@cosyte/ccda` is at `0.1`, **published on npm**, and **public**. Its exported
  names, options, return shapes, and warning codes are the surface we keep stable, and below 1.0 a
  breaking change bumps the minor version and is called out in the changelog with its migration.
  Run `npm view @cosyte/ccda version` for the published version.

## Related

- [The boundaries of reading, building and editing](./boundaries.md) explains each boundary on this
  page: why it sits where it does and what a document that reaches it reads back as.
- [Warning and error codes](./warning-codes.md) gives the meaning of every code named here.
- [The clinical entry layer](./spec-notes-clinical.md) lists the fields each accessor decodes.
- The [API reference](./api/README.md) gives every export and its signature, generated from the
  source.
