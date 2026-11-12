---
id: warning-codes
title: Warning and error codes
sidebar_label: Warning and error codes
description: "Every warning code parseCcda, buildCcda and editCcda report, every fatal code parseCcda throws, and every editCcda error code, with what each means."
---

# Warning and error codes

Every code the package reports, in one place. A warning is a `CcdaWarning` on `doc.warnings` (and
on `onWarning`); a fatal is a `CcdaParseError` that `parseCcda` throws; an edit error is a
`CcdaEditError` that `editCcda` throws. Each meaning below restates the warning's own message, which
comes whole from a fixed registry and never carries text from the document.

The **Safety-critical** column says whether the code is in `SAFETY_CRITICAL_CODES`. A vendor profile
can never tolerate a safety-critical code: `defineCcdaProfile` throws if one is listed. Every other
warning can be downgraded to `PROFILE_QUIRK_APPLIED` by a profile that expects it. Under
`{ strict: true }`, `parseCcda` throws the first warning that no profile expected as a
`CcdaParseError` carrying that warning's code.

The sample below holds this page to the code: it fails when a code is added to `WARNING_CODES` or
`FATAL_CODES`, or when `SAFETY_CRITICAL_CODES` changes, until the page is brought up to date.

```ts runnable
import { FATAL_CODES, SAFETY_CRITICAL_CODES, WARNING_CODES } from "@cosyte/ccda";

Object.keys(WARNING_CODES).length; // => 54
Object.keys(FATAL_CODES).length; // => 7
SAFETY_CRITICAL_CODES.size; // => 28

Object.keys(FATAL_CODES).join(","); // => "XXE_OR_DTD_PRESENT,ENTITY_EXPANSION_LIMIT,INPUT_SIZE_LIMIT_EXCEEDED,ELEMENT_DEPTH_LIMIT_EXCEEDED,NODE_COUNT_LIMIT_EXCEEDED,NOT_WELL_FORMED_XML,NOT_A_CLINICAL_DOCUMENT"
```

## Fatal codes

`parseCcda` throws a `CcdaParseError` with one of these codes. The first five are the defenses
against hostile XML; their caps default to `DEFAULT_LIMITS` and are set with the `limits` parse
option.

| Code                           | Meaning                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `XXE_OR_DTD_PRESENT`           | The input declares a DTD, a `DOCTYPE` or a custom entity, and is refused to prevent external-entity attacks.          |
| `ENTITY_EXPANSION_LIMIT`       | The input has more custom entity references than the cap allows.                                                      |
| `INPUT_SIZE_LIMIT_EXCEEDED`    | The input is larger than the byte cap.                                                                                |
| `ELEMENT_DEPTH_LIMIT_EXCEEDED` | Elements are nested deeper than the depth cap.                                                                        |
| `NODE_COUNT_LIMIT_EXCEEDED`    | The input has more elements than the node cap.                                                                        |
| `NOT_WELL_FORMED_XML`          | The input is not well-formed XML, or holds a character XML 1.0 forbids, written as it is or as a character reference. |
| `NOT_A_CLINICAL_DOCUMENT`      | The XML is well-formed, but the root element is not a `ClinicalDocument` in the HL7 v3 namespace.                     |

## Warning codes

### Document and template recognition

| Code                                   | Meaning                                                                                                                                                                                                      | Safety-critical |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `UNKNOWN_DOCUMENT_TEMPLATE`            | The root `templateId` set names no recognized C-CDA R2.1 document type; the document is read as a generic `ClinicalDocument`.                                                                                | No              |
| `MISSING_TEMPLATE_ID`                  | The element carries no `templateId`. On a document or a section, recognition fell back to other signals; on an entry's clinical statement, the entry is not read and survives only in the re-serialized XML. | No              |
| `TEMPLATE_EXTENSION_ABSENT`            | The recognized `templateId` has no `@extension` version stamp, so it was matched by its root alone (the document may predate R2.1).                                                                          | No              |
| `TEMPLATE_EXTENSION_UNMODELED_RELEASE` | The recognized `templateId` carries a version stamp for a C-CDA release this package does not model; the document is read leniently.                                                                         | No              |
| `REQUIRED_SECTIONS_NOT_EVALUATED`      | The document type's required (SHALL) sections were not checked, because its `templateId` names a release the tables do not reach. No `REQUIRED_SECTION_MISSING` is reported for the document.                | No              |
| `UNKNOWN_NAMESPACE_PREFIX`             | An element outside the v3, `xsi` and `sdtc` namespaces, or in no namespace, was found. The node is kept and reported once per namespace.                                                                     | No              |
| `ENCODING_BOM_STRIPPED`                | A UTF-8 byte-order mark was removed from the start of the input.                                                                                                                                             | No              |

### Sections

| Code                                | Meaning                                                                                                                                                  | Safety-critical |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `UNKNOWN_SECTION_CODE`              | The section's LOINC code names no recognized C-CDA section; the section is kept as narrative only.                                                       | No              |
| `SECTION_MATCHED_BY_LOINC_FALLBACK` | The section was recognized by its LOINC code, since it carries no recognized `templateId`.                                                               | No              |
| `SECTION_PLACEMENT_SUSPECT`         | An entry template was found in a section it does not belong to; the entry is read and flagged.                                                           | No              |
| `REQUIRED_SECTION_MISSING`          | The document type requires a section (SHALL) that is not there; the document is read without it, and `missingRequiredSections()` names the full set.     | Yes             |
| `SUBJECT_CONTEXT_OVERRIDE`          | A `<subject>` declaration governs this content, so it is not the record target's own: the entry is withheld from every read path for the patient's data. | Yes             |

### Patient and author

| Code                          | Meaning                                                                                                                                                 | Safety-critical |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `MULTIPLE_RECORD_TARGETS`     | The document has more than one `recordTarget`; `getPatient()` reads the first, and `header.recordTargets` holds them all.                               | Yes             |
| `MISSING_ASSIGNING_AUTHORITY` | A patient identifier has a root OID but no `assigningAuthorityName`.                                                                                    | Yes             |
| `UNIDENTIFIED_AUTHOR`         | An author carries neither an `assignedPerson` nor an `assignedAuthoringDevice`; it is kept and marked unidentified, and no identity is inferred for it. | No              |

### Datatypes and null flavors

| Code                               | Meaning                                                                                                                       | Safety-critical |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `INVALID_NULL_FLAVOR`              | The `nullFlavor` is not a code of the HL7 v3 NullFlavor code system; it is kept as written.                                   | No              |
| `CONTRADICTORY_NULL_FLAVOR`        | The element declares a `nullFlavor` and a value at once; the value is kept as written but is never read as the field's value. | Yes             |
| `MALFORMED_DATETIME`               | The value does not have the shape of an HL7 v3 `TS` datetime; the raw text is kept and the parsed date is `undefined`.        | Yes             |
| `NEGATION_VS_NULLFLAVOR_AMBIGUOUS` | The act carries both `negationInd="true"` and a `nullFlavor`; the two are kept as separate fields, never merged.              | Yes             |

### Coded values and terminology

| Code                              | Meaning                                                                                                                                                                    | Safety-critical |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `UNEXPECTED_CODE_SYSTEM`          | The code system OID is not one expected at this coded slot; the value is kept.                                                                                             | Yes             |
| `DEPRECATED_CODE_SYSTEM`          | The code system OID is deprecated at this slot, and a modern successor exists; the value is kept.                                                                          | No              |
| `MISSING_CODE_SYSTEM`             | The coded value has a `@code` but no `@codeSystem`, so it names no terminology; no system is inferred, and it is never handed to a terminology adapter.                    | Yes             |
| `MISSING_CODE_VALUE`              | The coded value has neither a `@code` nor a `@nullFlavor`, so an absent concept cannot be told from a lost one; no code is inferred.                                       | Yes             |
| `CODE_NARRATIVE_MISMATCH`         | A coded value and the narrative it references disagree; both are kept and neither is chosen.                                                                               | Yes             |
| `NARRATIVE_REFERENCE_BROKEN`      | The narrative reference points at no ID in the section narrative.                                                                                                          | Yes             |
| `DEPRECATED_LOINC`                | The observation's LOINC code is deprecated, and a current successor exists; the code is kept.                                                                              | No              |
| `SEMANTIC_CODE_INVALID`           | The terminology adapter you supplied says the code is not a valid member of its system; the code is kept as written.                                                       | No              |
| `VALUE_SET_BINDING_VIOLATED`      | The value-set source you supplied says the code is not in the value set C-CDA R2.1 binds this slot to with a Required binding. `valueSet` and `valueSetRelease` say which. | No              |
| `VALUE_SET_BINDING_NOT_EVALUATED` | The value-set source you supplied holds no expansion of the bound value set, so membership was not checked; the silence says nothing about membership.                     | No              |

### Medications and immunizations

| Code                                       | Meaning                                                                                                                                                      | Safety-critical |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `MISSING_DOSE_QUANTITY`                    | The medication activity has no `doseQuantity`; the dose is absent, never defaulted.                                                                          | Yes             |
| `MISSING_ROUTE_CODE`                       | The medication activity has no `routeCode`; the route is absent, never defaulted.                                                                            | Yes             |
| `MISSING_PRODUCT_CODE`                     | No `manufacturedProduct` arm carries a coded product; the product is absent, never inferred from the narrative or the entry's other fields.                  | Yes             |
| `MEDICATION_PRODUCT_ARM_UNEXPECTED`        | The product is on the `manufacturedLabeledDrug` arm, which the C-CDA medication templates are not written around. Read alone, the product was read as usual. | No              |
| `MEDICATION_PRODUCT_ARM_CONFLICT`          | The product arms name different products; no product code is selected, and every arm survives in the re-serialized XML.                                      | Yes             |
| `MEDICATION_PRODUCT_ARM_REPEATED`          | More than one arm of the same kind is present, where CDA R2 allows one; whether they agree is answered by `MEDICATION_PRODUCT_ARM_CONFLICT`.                 | No              |
| `MEDICATION_PRODUCT_CODE_REPEATED`         | One product arm carries more than one `<code>`; every one is compared, and only the first is ever selected.                                                  | Yes             |
| `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` | No arm's first `<code>` asserts a primary `@code`, and the product is named only in a `<translation>`; no product code is selected.                          | Yes             |
| `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED`      | The medication has `effectiveTime` siblings that could not be told apart as duration and frequency; all are kept.                                            | Yes             |
| `IMMUNIZATION_REFUSED`                     | The immunization activity carries `negationInd="true"`: the vaccine was not given or was refused, and it is read as refused, never as given.                 | No              |

### Results, vital signs and units

| Code                          | Meaning                                                                                                                       | Safety-critical |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `NON_UCUM_UNIT`               | The `@unit` is not a well-formed UCUM unit; the unit and the value are kept as written.                                       | Yes             |
| `UCUM_CASE_SUSPECT`           | The `@unit` looks like a letter-case slip of a UCUM unit; the value is kept.                                                  | Yes             |
| `MISSING_UNIT_ON_PQ`          | A physical quantity has a number but no `@unit`; it is kept as dimensionless, never defaulted.                                | Yes             |
| `FREE_TEXT_REFERENCE_RANGE`   | The reference range is free text, not a low and high interval; it is kept as text and cannot be compared as numbers.          | No              |
| `RESULT_VALUE_TYPE_UNHANDLED` | The observation value's `xsi:type` is not one the model reads; it is read as unsupported, keeping the type name and any text. | Yes             |

### Problems, procedures, plans and status

| Code                               | Meaning                                                                                                                                                                               | Safety-critical |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `PROBLEM_STATUS_INDETERMINATE`     | The problem concern's `statusCode` is missing or not recognized, so whether it is active or resolved cannot be said.                                                                  | Yes             |
| `ALLERGEN_GRANULARITY_SUSPECT`     | The allergen looks coded at product level where an ingredient-level concept is expected.                                                                                              | Yes             |
| `PROCEDURE_MOOD_UNEXPECTED`        | The procedure's `moodCode` is neither performed (`EVN`) nor a recognized planned mood; the procedure is read and left unclassified.                                                   | Yes             |
| `PLANNED_VS_PERFORMED_AMBIGUOUS`   | The procedure has no `moodCode`, so performed and planned cannot be told apart; it is left unclassified.                                                                              | Yes             |
| `PLAN_ENTRY_NOT_MODELED`           | An entry template is recognized but not modeled (an Instruction, a Handoff Communication, a Nutrition Recommendation, a Goal Observation); it survives only in the re-serialized XML. | No              |
| `SMOKING_STATUS_UNKNOWN`           | Smoking status is recorded as unknown, by a `nullFlavor` or an "unknown" SNOMED CT concept.                                                                                           | No              |
| `SMOKING_STATUS_CODE_UNRECOGNIZED` | The smoking status code is not in the Smoking Status value set; it is kept as written.                                                                                                | No              |

### Building and editing

`buildCcda` and `editCcda` report these on the document they return, about content the call itself
wrote.

| Code                                        | Meaning                                                                                                                                                            | Safety-critical |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` | A Planned Medication Activity was written with no `effectiveTime`, which its template requires; no date is invented, so the act is written without it.             | No              |
| `MISSING_SELF_CARE_ACTIVITY`                | A Functional Status Organizer was asked for with no self-care activity, which its template requires; its findings were written as standalone observations instead. | No              |

### Profiles

| Code                    | Meaning                                                                                                                                                   | Safety-critical |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `PROFILE_QUIRK_APPLIED` | An active profile expected this deviation and downgraded it: the original code is on `toleratedCode`, the profile on `profile`, and `expected` is `true`. | Yes             |

## Edit error codes

`editCcda` throws a `CcdaEditError` with one of these codes (`CcdaEditErrorCode`).

| Code                       | Meaning                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NO_SOURCE_DOCUMENT`       | The source is not a `CcdaDocument` from `parseCcda` or `buildCcda`, or keeps no XML to edit.                                    |
| `NO_STRUCTURED_BODY`       | A section edit was asked of a document with no `structuredBody`, such as an Unstructured Document.                              |
| `SECTION_ALREADY_PRESENT`  | An `add` edit names a section the document already has; use `replace` or `upsert`.                                              |
| `SECTION_ABSENT`           | A `replace` edit names a section the document does not have; use `add` or `upsert`.                                             |
| `REQUIRED_SECTION_MISSING` | The edit would leave the document without a section its type requires (SHALL).                                                  |
| `SOURCE_MISSING_ID`        | A revision was asked of a source whose `ClinicalDocument.id` is absent or carries a `nullFlavor`, so it names no prior version. |

## Related

- [Triage warnings](./triage-warnings.md), to sort these by what to do about each.
- [Apply a vendor profile](./apply-a-vendor-profile.md), to quiet the ones a sender is known for.
- [Tolerance and the warning model](./spec-notes-tolerance.md), on why a deviation is a warning and
  not an error.
- [`WARNING_CODES`](./api/README.md#warning_codes), [`FATAL_CODES`](./api/README.md#fatal_codes),
  [`SAFETY_CRITICAL_CODES`](./api/README.md#safety_critical_codes) and
  [`CcdaEditError`](./api/README.md#ccdaediterror) in the API reference.
