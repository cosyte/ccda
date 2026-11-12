---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "From symptom to cause: when the parser throws and when it warns, the common symptoms, and keeping document content out of logs."
---

# Troubleshooting

From a symptom to its cause. The parser is lenient: only a structurally broken or hostile document
throws, and everything a real-world sender does short of that is a coded warning you triage. The
boundaries of what the parser, the builder and the editor do are listed in full in
[Known limitations](./limitations.md).

## When does it throw vs warn?

Only the **seven** Tier-3 structural/security conditions throw a `CcdaParseError`; everything else is a
Tier-2 warning on `doc.warnings`.

```ts runnable throws
import { parseCcda } from "@cosyte/ccda";

// Well-formed XML whose root is not a ClinicalDocument: a structural fatal.
parseCcda("<Foo>hello</Foo>"); // throws CcdaParseError (NOT_A_CLINICAL_DOCUMENT)
```

| Fatal code (throws)            | Meaning                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `XXE_OR_DTD_PRESENT`           | The document declared a DTD or an external entity.                               |
| `ENTITY_EXPANSION_LIMIT`       | Too many `&…;` entity references (billion-laughs).                               |
| `INPUT_SIZE_LIMIT_EXCEEDED`    | Decoded input exceeds the byte cap.                                              |
| `ELEMENT_DEPTH_LIMIT_EXCEEDED` | Element nesting too deep.                                                        |
| `NODE_COUNT_LIMIT_EXCEEDED`    | Too many element nodes.                                                          |
| `NOT_WELL_FORMED_XML`          | The bytes did not parse as XML, or held a character XML 1.0 forbids (see below). |
| `NOT_A_CLINICAL_DOCUMENT`      | Well-formed, but the root element is not `ClinicalDocument`.                     |

Narrow on the caught error via `err instanceof CcdaParseError` and `err.code === FATAL_CODES.*` (see
[Tolerance & the warning model](./spec-notes-tolerance.md)). Everything a real-world EHR does short of
that (an unknown section code, a missing dose, a code/narrative mismatch, an unexpected code system, a
non-UCUM unit) is a warning you triage, not an exception you catch.

A text that holds a character XML 1.0 forbids (a control character such as U+0001 other than tab,
line feed and carriage return, an unpaired surrogate, U+FFFE or U+FFFF), written as it is or as a
character reference such as `&#1;`, is not XML, so `parseCcda` and `editCcda` throw
`NOT_WELL_FORMED_XML` for it rather than reading it. The error names neither the character nor where
it sits.

## Common symptoms

| Symptom                                         | Likely cause                                                                        | What to do                                                                                                                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `documentType` is `undefined`                   | The root `templateId` set contains no recognized document-type OID (or none at all) | Check for `UNKNOWN_DOCUMENT_TEMPLATE` / `MISSING_TEMPLATE_ID`; the document still parsed as a generic `ClinicalDocument`.                                                                              |
| A section has `key: undefined`                  | Its `templateId` and LOINC `code` matched nothing in the catalog                    | `UNKNOWN_SECTION_CODE` was raised; the section is retained as narrative-only: read `section.narrativeText`.                                                                                            |
| `getMedications()[0].dose` is `undefined`       | The Medication Activity carried no `doseQuantity`                                   | `MISSING_DOSE_QUANTITY` was raised; the value is preserved-as-absent, never defaulted.                                                                                                                 |
| A procedure's `disposition` is `undefined`      | The entry had no `moodCode`, or an unrecognized one                                 | `PLANNED_VS_PERFORMED_AMBIGUOUS` / `PROCEDURE_MOOD_UNEXPECTED` was raised; performed and planned are never conflated.                                                                                  |
| A `CODE_NARRATIVE_MISMATCH` warning             | A coded value and its referenced narrative disagree                                 | Both are preserved and no winner is chosen; route the record to human review.                                                                                                                          |
| A `NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT` warning | The `PQ` `@unit` is not well-formed UCUM (or a case slip)                           | The raw unit is preserved, never normalized; a case slip is usually a single-character fix.                                                                                                            |
| `doc.toString()` throws                         | The document was hand-constructed, not produced by `parseCcda` or `buildCcda`       | Only parsed/built documents retain source XML to serialize; construct from scratch with `buildCcda`.                                                                                                   |
| An entry you can see in the XML is not returned | A `<subject>` on that entry, on a statement inside it, or on its section            | `SUBJECT_CONTEXT_OVERRIDE` was raised, one per withheld entry: it is somebody else's clinical statement and is withheld from every record-target read path. It still round-trips through `toString()`. |

## Keeping PHI out of logs

Every warning `message` and every `CcdaParseError` message comes **whole from a frozen registry**. No
factory takes a value parameter, so nothing the document said, and nothing a sender chose, can reach a
message: not a template OID, not a `nullFlavor` token, not a unit, not an element name. A diagnostic
tells you `code` plus `position`, and that is the entire contract.

The `position` is bounded too, rather than copied. Its `path` is an element local name echoed only when
it is one this parser navigates (`<withheld>` otherwise), its `sectionCode` is echoed only when it
has the shape of a LOINC part number, and its `templateId` only when it has the shape of an HL7 v3
UID. `line` and `column` still locate the element exactly.

So you can log the full `.warnings` array, and a thrown `CcdaParseError`'s `message`, `stack`, and
`position`, without leaking. Keep the same discipline in your own code: log the code and the position,
not the field content. A `CcdaParseError` deliberately retains **no raw input snippet**, precisely
because a C-CDA payload is a clinical document and any snippet would risk leaking PHI.

**This page said the opposite through `0.0.4`**, claiming messages were PHI-free "by
construction" while thirteen warning factories and one fatal interpolated a value straight from the
document. A 500,000-byte `templateId` root produced a 500,106-byte `.message`, and under
`{ strict: true }` it reached `err.stack`. If you shipped `.warnings` to a log aggregator on any
version at or before `0.0.4`, treat those log lines as potentially carrying document content.

## Where to look next

- [Known limitations](./limitations.md) states exactly what the parser, the builder and the editor
  do and do not do today, section by section.
- [Tolerance and the warning model](./spec-notes-tolerance.md) explains the warning codes, and the
  reference lists every one under [`WARNING_CODES`](./api/README.md#warning_codes) and every fatal
  code under [`FATAL_CODES`](./api/README.md#fatal_codes).
