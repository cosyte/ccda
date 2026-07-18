---
id: troubleshooting
title: Troubleshooting & known limitations
sidebar_label: Troubleshooting
sidebar_position: 1
---

# Troubleshooting & known limitations

`@cosyte/ccda` is built to be **correct and honest about its edges** rather than to claim more than it
delivers. Mis-reading a dose, an allergy, a code system, or a patient identifier can cause real
clinical harm, so this page is the deliberate "do not over-trust" list: the error model, common
symptoms, and — critically — the explicit list of **what is not yet parsed**. Everything here is a
documented boundary, not a bug: the lenient parser never silently drops or garbles data; where a
limitation applies, the raw value is preserved (often with a warning), it is simply not further
decoded.

## When does it throw vs warn?

Only the **seven** Tier-3 structural/security conditions throw a `CcdaParseError`; everything else is a
Tier-2 warning on `doc.warnings`.

```ts runnable throws
import { parseCcda } from "@cosyte/ccda";

// Well-formed XML whose root is not a ClinicalDocument — a structural fatal.
parseCcda("<Foo>hello</Foo>"); // throws CcdaParseError (NOT_A_CLINICAL_DOCUMENT)
```

| Fatal code (throws)            | Meaning                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `XXE_OR_DTD_PRESENT`           | The document declared a DTD or an external entity.           |
| `ENTITY_EXPANSION_LIMIT`       | Too many `&…;` entity references (billion-laughs).           |
| `INPUT_SIZE_LIMIT_EXCEEDED`    | Decoded input exceeds the byte cap.                          |
| `ELEMENT_DEPTH_LIMIT_EXCEEDED` | Element nesting too deep.                                    |
| `NODE_COUNT_LIMIT_EXCEEDED`    | Too many element nodes.                                      |
| `NOT_WELL_FORMED_XML`          | The bytes did not parse as XML.                              |
| `NOT_A_CLINICAL_DOCUMENT`      | Well-formed, but the root element is not `ClinicalDocument`. |

Narrow on the caught error via `err instanceof CcdaParseError` and `err.code === FATAL_CODES.*` (see
[Tolerance & the warning model](./spec-notes-tolerance)). Everything a real-world EHR does short of
that — an unknown section code, a missing dose, a code/narrative mismatch, an unexpected code system, a
non-UCUM unit — is a warning you triage, not an exception you catch.

## Common symptoms

| Symptom                                         | Likely cause                                                                        | What to do                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `documentType` is `undefined`                   | The root `templateId` set contains no recognized document-type OID (or none at all) | Check for `UNKNOWN_DOCUMENT_TEMPLATE` / `MISSING_TEMPLATE_ID`; the document still parsed as a generic `ClinicalDocument`. |
| A section has `key: undefined`                  | Its `templateId` and LOINC `code` matched nothing in the catalog                    | `UNKNOWN_SECTION_CODE` was raised; the section is retained as narrative-only — read `section.narrativeText`.              |
| `getMedications()[0].dose` is `undefined`       | The Medication Activity carried no `doseQuantity`                                   | `MISSING_DOSE_QUANTITY` was raised; the value is preserved-as-absent, never defaulted.                                    |
| A procedure's `disposition` is `undefined`      | The entry had no `moodCode`, or an unrecognized one                                 | `PLANNED_VS_PERFORMED_AMBIGUOUS` / `PROCEDURE_MOOD_UNEXPECTED` was raised; performed and planned are never conflated.     |
| A `CODE_NARRATIVE_MISMATCH` warning             | A coded value and its referenced narrative disagree                                 | Both are preserved and no winner is chosen; route the record to human review.                                             |
| A `NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT` warning | The `PQ` `@unit` is not well-formed UCUM (or a case slip)                           | The raw unit is preserved, never normalized; a case slip is usually a single-character fix.                               |
| `doc.toString()` throws                         | The document was hand-constructed, not produced by `parseCcda` or `buildCcda`       | Only parsed/built documents retain source XML to serialize; construct from scratch with `buildCcda`.                      |

## Keeping PHI out of logs

Every warning `message` and error is **PHI-free by construction** — it carries the stable code and a
structural position (element path, OID, LOINC code, line/column), never a patient name, an identifier,
a date, or narrative text. You can log the full `.warnings` array without leaking. Keep the same
discipline in your own code: log the code and position, not the field content. A `CcdaParseError`
deliberately retains **no raw input snippet**, precisely because a C-CDA payload is a clinical document
and any snippet would risk leaking PHI.

## What's not yet parsed

Depth tracks the parser, and never leads it. As of **Phase 5b**, these are the deliberate boundaries —
authored here so a reader never relies on something absent. They grow as the parser ships more phases.

- **Document builder emits a CCD with five discrete-data sections.** `buildCcda(init)` constructs a
  spec-clean CCD (US Realm header + **Problems, Allergies, Medications, Results, Vital Signs**; any CCD
  SHALL section with no supplied content emitted empty, `nullFlavor="NI"`) and round-trips through the
  parse model with zero warnings. Every entry emits the `SHALL`-cardinality `effectiveTime` its template
  requires — the caller's time when supplied, else `nullFlavor="UNK"` (never a fabricated timestamp, read
  back as absent). The remaining sections, the other eleven document types, editing an existing document,
  and a bring-your-own-credentials terminology adapter are a later increment. The builder does not assert
  full XSD element-order or the complete Schematron rule set (grounded against the raw IG text, not a
  validator run), so a built document is expected-but-not-proven to pass an external IG validator.
  `serializeCcda` / `toString()` re-emit a **parsed or built** document; a hand-constructed
  `CcdaDocument` (neither parsed nor built) cannot be serialized (`toString()` throws).
- **Fourteen entry families are extracted; other sections carry identity + narrative only.** Problems,
  Medications, Allergies, Results, Vital Signs, Immunizations, Procedures, Encounters, Social-History
  smoking status, Plan of Treatment, Functional Status, Mental Status, Family History, and Past Medical
  History decode to structured entries. Any other section (e.g. Hospital Course, Physical Exam, Advance
  Directives, Medical Equipment) is framed and its narrative retained, but its entries are not yet
  modeled. Nothing is dropped — the narrative and raw structure are preserved.
- **Code checks are recognition, not membership.** `checkCodeSlot` / `checkLoincDeprecation` verify a
  code's _system_ is the one expected for its slot (and flag deprecated/unexpected systems); they do
  **not** verify a code is a real member of SNOMED CT / RxNorm / LOINC. That needs a licensed
  terminology service — bring your own.
- **UCUM validation is grammatical, on a curated atom subset.** The validator checks well-formed UCUM
  against the prefixes/atoms that appear in lab Results and Vital Signs, not the full UCUM registry. A
  valid-but-uncurated atom may read as `NON_UCUM_UNIT`; the raw unit is always preserved.
- **`nonXMLBody` base64 is left inert.** An Unstructured Document's wrapped payload is exposed but never
  decoded — decoding an arbitrary embedded blob is a needless attack surface and a PHI decision the
  caller owns.
- **Vendor profiles only quiet benign noise.** `parseCcda(xml, { profile })` (or a process default via
  `setDefaultCcdaProfile`) applies a `CcdaProfile` that downgrades the non-safety-critical deviations it
  expects to `PROFILE_QUIRK_APPLIED` (flagged `expected`, carrying the original `toleratedCode`) — it
  never drops a warning and never touches an extracted value. A profile **cannot** tolerate a
  safety-critical warning (dose, unit, allergen, identity, wrong code system, malformed datetime, …);
  `defineCcdaProfile()` throws if you try. Built-ins: `ccdaProfiles.smartScorecard` (deprecated
  terminology) and `ccdaProfiles.legacyR11` (R1.1-origin structural tolerance), each with cited
  provenance; named per-vendor profiles await a real grounding document (ADR 0018).
- **The required-section (SHALL) table is conservative.** It asserts only unconditional, in-catalog,
  high-confidence SHALL constraints; it omits choice constraints (`SHALL contain A OR B`), SHOULD/MAY
  sections, and SHALL sections outside the recognized catalog. An empty table for a document type means
  "no unconditional in-catalog SHALL section is asserted yet," not "this type has no requirements."

## Scope (non-goals)

- **C-CDA R2.1, US Realm.** Other CDA templates and realms are out of the current scope.
- **A parser + serializer, not a transport or a validator suite.** No MLLP/XDS delivery, no Schematron
  conformance report — this reads and re-emits documents.
- **Not yet published.** The package sits on the `0.0.x`-until-first-alpha ladder and is **not on npm**;
  the first provenance publish is gated on the coordinated public launch.

For the phase-by-phase surface and the exact fields each accessor decodes, see the package's `README.md`
and `CLAUDE.md` status sections and the [Core Concepts](./spec-notes-clinical).
