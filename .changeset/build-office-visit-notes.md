---
"@cosyte/ccda": patch
---

`buildCcda` builds three more document types: a Progress Note (`documentType: "progressNote"`), a History and Physical (`"historyAndPhysical"`) and a Consultation Note (`"consultationNote"`). It now emits six of the twelve US Realm document types.

- Each carries its own document `templateId` (R2.1 `2015-08-01`) and LOINC document code (`11506-3`, `34117-2`, `11488-4`) and always emits the sections its C-CDA R2.1 errors rule requires, an empty `nullFlavor="NI"` section for any you leave out. A Progress Note emits Assessment and Plan of Treatment. A History and Physical emits Allergies, Family History, General Status, Past Medical History, Medications, Physical Exam, Results, Review of Systems, Social History, Vital Signs, Chief Complaint and Reason for Visit, Assessment and Plan of Treatment. A Consultation Note emits History of Present Illness, Allergies, Problems, Reason for Referral, Assessment and Plan of Treatment.
- `BuildCcdaInit` has five new optional narrative fields: `historyOfPresentIllness`, `chiefComplaintAndReasonForVisit`, `reviewOfSystems`, `physicalExam` and `generalStatus`. `assessment` is carried by all three new types, `reasonForReferral` by the Consultation Note, and `encompassingEncounter` by all three.
- Each new type carries the `componentOf/encompassingEncounter` frame its rule requires, with the period start you supply or `nullFlavor="UNK"`; the end and a discharge disposition are written only when you supply them. A Progress Note's encounter carries `location/healthCareFacility` and a Consultation Note carries `inFulfillmentOf/order`, each id `nullFlavor="UNK"` because the builder is told of no facility or order.
- Every built document of the three types reparses with zero warnings, and `pnpm conformance` validates a minimal and a populated document of each against the pinned R2.1 Schematron and the CDA R2 schema with zero error-severity results.
- `document()` and `documentInit()` from `@cosyte/ccda/arbitraries` now generate all six types by default. Pass `documentTypes` to keep the old three.

What a caller may need to change:

- `BuildableDocumentType` has three more members, so an exhaustive `switch` over it needs three more cases.
- Every input the builder refuses on a type that does not carry it now throws with one message shape, `` `field` is not carried by documentType "type" ``, naming the types that do carry it. A caller that matched the old text (`` is dischargeSummary content and documentType ``) updates the match; the error is still a `TypeError`.
- The parser now recognizes four sections by their `templateId` root that it used to report as `UNKNOWN_SECTION_CODE`: General Status (`2.16.840.1.113883.10.20.2.5`), Physical Exam (`2.16.840.1.113883.10.20.2.10`), Review of Systems (`1.3.6.1.4.1.19376.1.5.3.1.3.18`) and Chief Complaint and Reason for Visit (`2.16.840.1.113883.10.20.22.2.13`). A document carrying one gets the section's key (`generalStatus`, `physicalExam`, `reviewOfSystems`, `chiefComplaintAndReasonForVisit`) and one fewer warning, so a parse with `strict: true` that threw on it now succeeds. None of the four is asserted as a required section, and `requiredSectionStatus("historyAndPhysical")` now reports the first three with the reason `assertion-would-tighten-parse` instead of `outside-section-catalog`.
