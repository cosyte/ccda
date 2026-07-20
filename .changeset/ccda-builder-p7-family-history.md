---
"@cosyte/ccda": patch
---

Phase 7 (eleventh slice) — builder emits a Family History section (CCDA-P7).

Extends `buildCcda` with one new optional input — `BuildCcdaInit.familyHistory`
(`BuildCcdaFamilyHistory[]`) — that round-trips through `getFamilyHistory()` to the same structured
content by construction. A clean build still carries **zero warnings**, and the serializer fixed point
(`parseCcda(doc.toString()).toString() === doc.toString()`) still holds.

Per-template shape, confirmed against the C-CDA R2.1 IG + the parser's own Family History extractor
(the round-trip contract) before emitting:

- **Family History Section (V3) `…22.2.15`** — LOINC `10157-6`, the **`2015-08-01`** stamp. It has
  **no** entries-required `.1` variant, so only the base `templateId` is emitted even though the section
  carries entries. Emitted only when populated (a CCD `SHOULD`, not `SHALL`, section).
- **Family History Organizer `…22.4.45`** (the **`2015-08-01`** stamp) — one per relative
  (`<organizer classCode="CLUSTER" moodCode="EVN">`), a SHALL `id`, SHALL `statusCode` fixed to
  `completed`, and a SHALL `subject/relatedSubject` (`@classCode="PRS"`) naming the family member: a
  coded `relationship` (SNOMED CT by default, e.g. `72705000` mother, `9947008` father — overridable to
  the HL7 RoleCode system for `FTH`/`MTH`), plus the MAY `administrativeGenderCode`, `birthTime`, and
  the `sdtc:deceasedInd` flag (emitted in the `urn:hl7-org:sdtc` extension namespace, read back by local
  name).
- **Family History Observation `…22.4.46`** (the **`2015-08-01`** stamp) — one `component/observation`
  per condition, with the SHALL fixed `code` (SNOMED CT `64572001` "Condition"), a SHALL `statusCode`
  (`completed`), the SHOULD [0..1] `effectiveTime`, and the SHALL coded `value` carrying the illness.
  A condition MAY nest an **Age Observation `…22.4.31`** (`entryRelationship typeCode="SUBJ"`, the
  relative's age at onset as a `PQ` in UCUM years `a`) and a **Family History Death Observation
  `…22.4.47`** (`entryRelationship typeCode="CAUS"`, the fixed SNOMED CT `419620001` "Death" value)
  marking the condition as the relative's cause of death.

Safety invariants held, matching the bar of the prior builder slices:

- **No clinical value, date, or relation is ever fabricated (the safety rule).** An unknown
  relationship is emitted as `relatedSubject/code nullFlavor="UNK"` and an unknown condition as `value
nullFlavor="UNK"` — an _explicit_ unknown, never a guessed relation or illness. The MAY demographics
  (gender, birth time, deceased flag), the Age/Death sub-observations, and the SHOULD `effectiveTime`
  are each emitted only when the caller supplies them.
- **Conditions are grouped by relative, never flattened.** Each relative's identity rides once on its
  organizer; every condition reads back under `getFamilyHistory()[i].relative` / `.observations[j]`.
- **Narrative agreement.** The section narrative reads each condition's `relative: illness` label
  referenced by `#id`, so it contains the entry's reconciled `value` display name and no
  `CODE_NARRATIVE_MISMATCH` fires.

New public types: `BuildCcdaFamilyHistory` and its members `BuildCcdaFamilyMember` /
`BuildCcdaFamilyHistoryObservation`. No parser change and no warning-code change.

Deferred: the Functional/Mental Status Organizer + Assessment Scale forms in the builder; the other
eleven document types; C-CDA document editing; the bring-your-own-credentials terminology adapter; and
the external-validator/Schematron differential-testing gate.
