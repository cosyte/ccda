---
"@cosyte/ccda": patch
---

Check the required sections of a document stamped `2024-05-01` (C-CDA 3.0.0, 4.0.0 or 5.0.0) against C-CDA 5.0.0, and recognize the Patient Generated Document header.

- A document whose document-type `templateId` carries `2024-05-01`, and no `2015-08-01` on the same root, now has its required sections checked against the C-CDA 5.0.0 document profiles. It can draw `REQUIRED_SECTION_MISSING` where it drew `REQUIRED_SECTIONS_NOT_EVALUATED` before, and under `strict: true` that warning throws like any other, and `editCcda` refuses an edit that leaves such a section missing. A 5.0.0 Discharge Summary also requires Procedures and Results. A Diagnostic Imaging Report stamped `2024-05-01` is still reported not evaluated, because 5.0.0 has no such type, and so is any other unmodelled stamp.
- `readTemplateStamp("2024-05-01")` returns the new reading `"r30-stamped"` (it returned `"unmodeled-release"`), and `requiredSectionStatus` takes `{ stamp: "r30-stamped" }`.
- `RequiredSectionStatus` gains `release`: `"R2.1"`, `"5.0.0"`, or `undefined` when nothing was evaluated.
- A document carrying only the Patient Generated Document header (`2.16.840.1.113883.10.20.29.1`) now reads `documentType: "patientGeneratedDocument"` instead of `undefined` with `UNKNOWN_DOCUMENT_TEMPLATE`. A document that also carries another document-type `templateId` keeps that type. `DOCUMENT_TYPES` has 13 entries.
- The `TEMPLATE_EXTENSION_UNMODELED_RELEASE` message for the `2024-05-01` stamp now says the required sections are checked against 5.0.0.

What a caller must change: a `switch` over `TemplateStampReading` or `DocumentType` that names every member needs a case for `"r30-stamped"` or `"patientGeneratedDocument"`. Code that treated `REQUIRED_SECTIONS_NOT_EVALUATED` as the outcome for every `2024-05-01` document should read `REQUIRED_SECTION_MISSING` and `requiredSectionStatus(...).release` instead.
