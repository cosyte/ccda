---
"@cosyte/ccda": patch
---

Settle the CCD required-section (SHALL) set against the normative C-CDA R2.1 Schematron: it is six sections, and the parser and builder now agree on it.

`buildCcda` named five SHALL sections for a CCD (including Vital Signs) while `requiredSectionKeys("ccd")` named four (excluding it). The live consequence was an asymmetry: a built CCD always carried a Vital Signs section, but `parseCcda` stayed silent when a third-party CCD lacked one. Both halves now name the same six, read off the CCD (V3) errors rule of the normative Schematron published by HL7: Allergies and Intolerances (CONF:1198-30662), Medications (-30664), Problem (-30666), Results (-30670), Social History (-30688) and Vital Signs (-30690). Procedures (-30668) and Plan of Treatment (-30686) sit in that template's warnings rule as SHOULD, so neither is asserted.

Those six CONF ids are **scoped to the R2.1 stamp**: the rule they live in matches only a `ClinicalDocument` whose CCD `templateId` carries `@extension="2015-08-01"`. So `socialHistory` and `vitalSigns` are asserted **only** against an R2.1-stamped document. An R1.1-origin CCD (the same root with no extension, the condition that raises `TEMPLATE_EXTENSION_ABSENT`) keeps exactly its previous reading of Allergies, Medications, Problems and Results. That is not a claim that R1.1 omitted the other two; there is no R1.1 Schematron in hand, and narrowing the original four would be as unsourced as broadening them. `requiredSectionKeys` and `missingRequiredSections` both take an optional `{ r21Stamped: false }` for the unstamped reading, and the new `RequiredSectionOptions` type is exported. The stamp is detected the way the Schematron's context predicate is written, existentially: a document is R2.1-scoped when **any** of its document-level `templateId`s carries the root together with `@extension="2015-08-01"`, so the common dual-stamped backward-compatible shape (both the extension'd and the bare `templateId`) is read correctly whatever order the two appear in.

What changes for you:

- `requiredSectionKeys("ccd")` and `missingRequiredSections("ccd", ...)` now include `socialHistory` and `vitalSigns`. An R2.1-stamped CCD that lacks either now raises a `REQUIRED_SECTION_MISSING` warning it previously did not. This is a warning, never a fatal, so nothing stops parsing. R1.1-origin CCDs are unaffected.
- `buildCcda` now always emits a Social History section for a CCD, as a spec-clean empty `nullFlavor="NI"` shell when no `smokingStatus` is supplied. That shell is conformant and invents no clinical fact: the Social History Section (V3) requires only `code`, `title` and `text`, and its Smoking Status entry is SHOULD, not SHALL. It has no entries-required template variant, so the shell still carries exactly the template the CCD SHALL constraint names.
- A CCD that does supply a `smokingStatus` emits the Social History section exactly once, as before.

Document types whose SHALL set excludes Social History, such as the Referral Note, are unchanged: they still emit it only when populated.
