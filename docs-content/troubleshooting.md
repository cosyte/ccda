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
symptoms, and, critically, the explicit statement of **what the parser, the builder, and the editor
do and do not do today**. Everything here is a documented boundary, not a bug: the lenient parser
never silently drops or garbles data; where a limitation applies, the raw value is preserved (often
with a warning), it is simply not further decoded.

## When does it throw vs warn?

Only the **seven** Tier-3 structural/security conditions throw a `CcdaParseError`; everything else is a
Tier-2 warning on `doc.warnings`.

```ts runnable throws
import { parseCcda } from "@cosyte/ccda";

// Well-formed XML whose root is not a ClinicalDocument: a structural fatal.
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
that (an unknown section code, a missing dose, a code/narrative mismatch, an unexpected code system, a
non-UCUM unit) is a warning you triage, not an exception you catch.

## Common symptoms

| Symptom                                         | Likely cause                                                                        | What to do                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `documentType` is `undefined`                   | The root `templateId` set contains no recognized document-type OID (or none at all) | Check for `UNKNOWN_DOCUMENT_TEMPLATE` / `MISSING_TEMPLATE_ID`; the document still parsed as a generic `ClinicalDocument`. |
| A section has `key: undefined`                  | Its `templateId` and LOINC `code` matched nothing in the catalog                    | `UNKNOWN_SECTION_CODE` was raised; the section is retained as narrative-only: read `section.narrativeText`.              |
| `getMedications()[0].dose` is `undefined`       | The Medication Activity carried no `doseQuantity`                                   | `MISSING_DOSE_QUANTITY` was raised; the value is preserved-as-absent, never defaulted.                                    |
| A procedure's `disposition` is `undefined`      | The entry had no `moodCode`, or an unrecognized one                                 | `PLANNED_VS_PERFORMED_AMBIGUOUS` / `PROCEDURE_MOOD_UNEXPECTED` was raised; performed and planned are never conflated.     |
| A `CODE_NARRATIVE_MISMATCH` warning             | A coded value and its referenced narrative disagree                                 | Both are preserved and no winner is chosen; route the record to human review.                                             |
| A `NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT` warning | The `PQ` `@unit` is not well-formed UCUM (or a case slip)                           | The raw unit is preserved, never normalized; a case slip is usually a single-character fix.                               |
| `doc.toString()` throws                         | The document was hand-constructed, not produced by `parseCcda` or `buildCcda`       | Only parsed/built documents retain source XML to serialize; construct from scratch with `buildCcda`.                      |

## Keeping PHI out of logs

Every warning `message` and error is **PHI-free by construction**: it carries the stable code and a
structural position (element path, OID, LOINC code, line/column), never a patient name, an identifier,
a date, or narrative text. You can log the full `.warnings` array without leaking. Keep the same
discipline in your own code: log the code and position, not the field content. A `CcdaParseError`
deliberately retains **no raw input snippet**, precisely because a C-CDA payload is a clinical document
and any snippet would risk leaking PHI.

## What it does, and does not do, today

Depth tracks the code, and never leads it. Everything below is a deliberate boundary rather than a
bug, and every claim was checked against the shipped source before it was written. Where a boundary
is genuinely open, this page says so instead of resolving it in your favor. There are no phase
numbers here on purpose: a version you can install should tell you what it does, not which
milestone it stopped at.

### Reading a document

- **All twelve document types are recognized; fourteen entry families are decoded.** `parseCcda`
  resolves every C-CDA R2.1 US Realm document type from the root `templateId`. Problems,
  Medications, Allergies, Results, Vital Signs, Immunizations, Procedures, Encounters,
  Social-History smoking status, Plan of Treatment, Functional Status, Mental Status, Family
  History, and Past Medical History decode to structured entries. Every other section is framed and
  its narrative retained, but its entries are not modeled, and recognition of those sections has
  three outcomes. A catalog section matched on its `templateId` (Advance Directives, Medical
  Equipment, Payers, Instructions, Nutrition, Goals, and the rest) gets a stable `key` and no
  warning. A catalog section matched only by its LOINC code also gets its `key`, but raises
  `SECTION_MATCHED_BY_LOINC_FALLBACK`; Reason for Visit and Chief Complaint carry no recognized
  `templateId` at all, so they always take this path. A section the catalog does not recognize
  (Hospital Course and Physical Exam among them) reads back with `key: undefined` and raises
  `UNKNOWN_SECTION_CODE`, or, if it carries no section `code` to match on, silently. None of the
  three drops anything: the narrative and the raw structure are preserved, and the document still
  re-serializes faithfully.
- **Code checks are recognition, not membership, unless you supply an adapter.** `checkCodeSlot` /
  `checkLoincDeprecation` verify that a code's _system_ is the one expected for its slot (and flag
  deprecated or unexpected systems); on their own they do **not** verify that a code is a real,
  active member of SNOMED CT / RxNorm / LOINC. That tier needs a licensed terminology service, so it
  is bring-your-own: pass a `TerminologyAdapter` to `parseCcda` or `buildCcda` and it is consulted
  at the five recognized coded slots (`problem`, `medication`, `allergen`, `route`, `vaccine`). A
  code the adapter rejects is surfaced **verbatim** and flagged `SEMANTIC_CODE_INVALID`, never
  rewritten to a "corrected" value; an adapter returning `undefined` has no opinion and produces no
  warning. With no adapter, behavior is recognition-only.
  **Those five slots are the whole of it, so read a silent document carefully.** Every other coded
  value is never handed to your adapter and therefore can never raise `SEMANTIC_CODE_INVALID`: the
  Results and Vital Signs LOINC codes, the procedure, encounter, planned-item, and family-history
  codes, the smoking-status, functional-status, and mental-status observation values, the allergy
  propensity type, and the reaction, severity, and criticality observations. A clean run means the
  five checked slots passed, not that the document's terminology was verified.
- **UCUM validation is grammatical, on a curated atom subset.** The validator checks well-formed UCUM
  against the prefixes/atoms that appear in lab Results and Vital Signs, not the full UCUM registry. A
  valid-but-uncurated atom may read as `NON_UCUM_UNIT`; the raw unit is always preserved. It does not
  convert or dimension-check units.
- **`nonXMLBody` base64 is left inert.** An Unstructured Document's wrapped payload is exposed but never
  decoded: decoding an arbitrary embedded blob is a needless attack surface and a PHI decision the
  caller owns.
- **Vendor profiles only quiet benign noise.** `parseCcda(xml, { profile })` (or a process default via
  `setDefaultCcdaProfile`) applies a `CcdaProfile` that downgrades the non-safety-critical deviations it
  expects to `PROFILE_QUIRK_APPLIED` (flagged `expected`, carrying the original `toleratedCode`). It
  never drops a warning and never touches an extracted value. A profile **cannot** tolerate a
  safety-critical warning (dose, unit, allergen, identity, wrong code system, malformed datetime, …);
  `defineCcdaProfile()` throws if you try. Built-ins: `ccdaProfiles.smartScorecard` (deprecated
  terminology) and `ccdaProfiles.legacyR11` (R1.1-origin structural tolerance), each with cited
  provenance, plus `ccdaProfiles.default`, which tolerates nothing and is identical to passing no
  profile at all. There is no named per-vendor profile: one is added only when a real, de-identified
  document from that vendor grounds the quirk, never from an invented one.
- **The required-section (SHALL) table is conservative, and six of the twelve types are empty.** It
  asserts only unconditional, in-catalog, high-confidence SHALL constraints; it omits choice
  constraints (`SHALL contain A OR B`), SHOULD/MAY sections, and SHALL sections outside the
  recognized catalog. Consultation Note, Progress Note, Procedure Note, Operative Note, Diagnostic
  Imaging Report, and Unstructured Document currently assert **nothing**, pending per-type
  verification against the IG. This under-warns rather than over-warns: a document of one of those
  types that is missing every section its type requires parses clean, with no
  `REQUIRED_SECTION_MISSING`. Read an empty table as "no unconditional in-catalog SHALL section is
  asserted yet," never as "this type has no requirements," and do not treat a quiet parse as a
  conformance result.

### Building a document

- **`buildCcda` emits two of the twelve document types.** A **CCD** (the default) and a **Referral
  Note** (`documentType: "referralNote"`). Any other value throws a `TypeError` rather than emitting
  something that merely resembles the type you asked for. The other ten types are not implemented.
- **Which sections a build can carry.** For a CCD, Problems, Allergies, Medications, Results, and
  Vital Signs are always emitted, as spec-clean empty `nullFlavor="NI"` sections when you supply no
  content. Immunizations, Procedures, Encounters, Social History (smoking status), Functional
  Status, Mental Status, Past Medical History, Plan of Treatment, and Family History are emitted
  only when populated, so an empty one is never fabricated. A Referral Note instead always emits
  Problems, Allergies, Medications, Reason for Referral, Assessment, and Plan of Treatment, and
  demotes Results and Vital Signs to populated-only. Any C-CDA section outside that set cannot be
  built.
- **Every entry carries the `effectiveTime` its template requires.** The caller's time when supplied,
  else `nullFlavor="UNK"`: the SHALL cardinality is satisfied without a fabricated clinical
  timestamp, and the parser reads that back as absent, never as a real `Date`.
- **`<translation>` alternates are emitted only at the recognized coded slots.** If your adapter
  implements the optional `translate`, `buildCcda` emits each returned coding as a spec-clean CDA R2
  `<translation>` **beside** the primary code, never replacing it. The wired slots are the problem
  value, the allergen, the medication drug and route, and the vaccine and route. The Results and
  Vital Signs LOINC codes, the reaction/severity/criticality observations, and the procedure,
  encounter, planned-item, and family-history codes are **not** wired. An adapter without
  `translate`, or one returning no matches, leaves the output byte-identical: an unmapped code never
  produces a guessed alternate.
- **A built document is expected, but not proven, to pass an external IG validator.** The builder does
  not assert full
  XSD element order or the complete Schematron rule set, and its conformance was grounded against the
  raw C-CDA R2.1 IG text rather than a validator run. A clean build does round-trip through
  `parseCcda` with zero warnings, but that is a strictly weaker guarantee than external validation.
  If your pipeline requires IG conformance, validate the output yourself.
- **`serializeCcda` / `toString()` need a parsed or built document.** `buildCcda` returns the parse of
  the XML it just emitted, so a built document serializes. A hand-constructed `CcdaDocument` retains
  no source XML and throws.

### Editing a document

- **`editCcda` adds or replaces a whole section, across twelve section kinds.** `problems`,
  `allergies`, `medications`, `results`, `vitalSigns`, `immunizations`, `procedures`, `encounters`,
  `socialHistory`, `pastMedicalHistory`, `planOfTreatment`, and `familyHistory`. Functional Status
  and Mental Status are **buildable but not editable**: each is assembled from three separate content
  lists, which the single-list edit shape does not fit. The Referral Note's narrative-only Assessment
  and Reason for Referral sections are likewise not editable.
- **No entry-level append, and no section removal.** Adding one problem to an existing Problems
  section means a `replace` carrying the full entry set, which rebuilds that section from your typed
  input: anything in the original section you do not carry over, including detail this library does
  not model, is absent from the result. Every section you did **not** target is still carried through
  byte-for-byte. A true append that byte-preserves a section's other entries needs a lossless
  read-model that does not exist yet, and there is no way to remove a section at all.
- **`RPLC` only.** An edit stamps a CDA R2 replacement revision (`relatedDocument typeCode="RPLC"`
  plus `setId` / `versionNumber`), or no revision at all with `revision: false`. The `APND` (append)
  and `XFRM` (transform) document relationships are not emitted.
- **An edit needs a parsed source, and a section edit needs a `structuredBody`.** A hand-constructed
  document throws `CcdaEditError` (`NO_SOURCE_DOCUMENT`). A document with no `structuredBody`, such
  as an Unstructured Document, throws `NO_STRUCTURED_BODY` **only when you actually pass a section
  edit**: with no `sections`, `editCcda` just stamps the revision and returns, so a revision-only
  edit of an Unstructured Document succeeds. A revision of a source carrying no `ClinicalDocument.id`
  throws `SOURCE_MISSING_ID` rather than inventing the id the `RPLC` link has to name, and an edit
  that would drop a SHALL required section throws `REQUIRED_SECTION_MISSING` instead of emitting a
  non-conformant document.
- **On this path the terminology adapter validates but does not translate.** `editCcda` forwards a
  supplied adapter to its final re-parse, so a rejected code in the edited document is still flagged
  `SEMANTIC_CODE_INVALID`. It does not emit `<translation>` alternates into the section it rebuilds;
  only `buildCcda` does that.

## Scope (non-goals)

- **C-CDA R2.1, US Realm.** Other CDA templates and realms are out of the current scope.
- **A parser + serializer, not a transport or a validator suite.** No MLLP/XDS delivery, no Schematron
  conformance report: this reads and re-emits documents.
- **Pre-alpha on the `0.0.x` ladder.** `@cosyte/ccda` is **published on npm at `0.0.1`** and **public**,
  but still pre-alpha: on the `0.0.x`-until-first-alpha ladder, the API can still change.

For the exact fields each accessor decodes, see [Core Concepts](./spec-notes-clinical); for every
export and its signature, see the API reference, which is generated from the source rather than
hand-written, so it cannot drift from the shipped code.
