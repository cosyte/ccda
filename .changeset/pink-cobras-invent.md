---
"@cosyte/ccda": minor
---

required sections: a SHALL warning fires exactly where the normative source says it should

The per-document-type required-section (SHALL) tables now cover all twelve
recognized types. Six of them (CCD, Discharge Summary, Referral Note, History and
Physical, Care Plan, Transfer Summary) had asserted sets that predated anyone
reading the normative source for them, and reported `verification: "untraced"` to
say so. Their document-level `errors` and `warnings` rules have been read off the
HL7 C-CDA R2.1 normative Schematron and the tables corrected. **No recognized
document type reports `untraced` any more.**

Two defects went in opposite directions and both are closed.

- **A conformant Discharge Summary drew a false warning.** The table asserted a
  Discharge Medications section as a SHALL. The normative source states it as a
  **SHOULD**, in that document's warnings rule (CONF:1198-30525), so a conformant
  Discharge Summary that omits the section was drawing a
  `REQUIRED_SECTION_MISSING` it had not earned. It is withdrawn, in the stamped
  and the unstamped reading alike.
- **A non-conformant document passed quietly.** The same Discharge Summary table
  omitted Plan of Treatment (CONF:1198-30528), which the errors rule requires
  unconditionally; a History and Physical asserted one of the ten SHALL sections
  its errors rule names; a Transfer Summary asserted three of six. Every one of
  those sections that this parser's catalog recognizes is asserted now.

**What changed on the published surface**, for `requiredSectionKeys`,
`missingRequiredSections`, `requiredSectionStatus` and the parser warnings that
follow from them:

- **Discharge Summary**: `dischargeMedications` withdrawn, `planOfTreatment`
  added.
- **History and Physical**: `familyHistory`, `pastMedicalHistory`, `medications`,
  `results`, `socialHistory` and `vitalSigns` added beside `allergies`.
- **Transfer Summary**: `results`, `vitalSigns` and `reasonForReferral` added.
- **CCD, Referral Note and Care Plan**: confirmed unchanged.

Expect a document of the three changed types to draw warnings it did not draw
before, and a conformant Discharge Summary with no Discharge Medications section
to fall silent. `REQUIRED_SECTION_MISSING` remains a Tier-2 warning, never a
fatal, and remains safety-critical, so no vendor profile can quiet it.

**Every key an added rule contributed is scoped to the R2.1 stamp**, because each
of those document-level rules matches only a `ClinicalDocument` whose
`templateId` carries `@extension="2015-08-01"`. An unstamped, R1.1-origin document
is therefore asserted exactly as it was before, with one exception in the safe
direction: a key withdrawn because the source states it as a SHOULD or as a choice
is withdrawn from the unstamped reading too, since "no sentence made this
unconditional" does not depend on a version stamp.

**Provenance is on the surface, not in a commit message.** Every asserted key now
carries the conformance statement it was read from and the source's own name for
the section; every SHALL section the source names that this package cannot assert
is enumerated with its reason (`outside-section-catalog` for Hospital Course,
General Status, Physical Exam and Review of Systems; `not-unconditionally-required`
for each choice); and `requiredSectionStatus(type).source` names the normative
artifact and **that artifact's own revision date**, so a reader holding a later
revision can tell a table is stale without re-deriving it. The new
`RequiredSectionSource` type is exported alongside it.

This is document-level validation only: which sections a document type SHALL
contain, never what a section or an entry SHALL contain. A quiet parse is still
not a conformance result.
