---
"@cosyte/ccda": patch
---

Phase 7 (thirteenth slice) — parser reads + builder emits direct-entry Assessment Scale Observations (CCDA-P7).

A **coordinated parser + builder increment** for the **Assessment Scale Observation** (`…22.4.69`) and its
**Assessment Scale Supporting Observation** (`…22.4.86`) — formal scored instruments (a PHQ-9 depression
screen, a Glasgow Coma scale, a Barthel index) carried by the Functional Status and Mental Status sections.
Verified firsthand against the C-CDA R2.1 Schematron (`HL7/cda-ccda-2.1`, CONF:81-14434…19088) and the two
HL7 CC0 R2.1 examples (`Mental Status/Patient Health Questionnaire PHQ-9`,
`Functional Status/Functional Assessment - Glasgow Coma`): C-CDA R2.1 carries the Assessment Scale
Observation as a **direct section entry** (`entry/observation`), **not** as a Functional/Mental Status
Organizer member — the exact placement the twelfth slice deferred here. A clean build carries **zero
warnings** and the serializer fixed point (`parseCcda(doc.toString()).toString() === doc.toString()`) holds.

**Parser (read).**

- `extractFunctionalStatus` / `extractMentalStatus` now read a **direct-entry** Assessment Scale
  Observation (`…22.4.69`) as a `StatusObservation` flagged `assessmentScale: true`. Its **domain is the
  carrying section's** (Functional → `"functional"`, Mental → `"mental"`), gated on the section's own
  templateId root or LOINC section code — the same template OID appears in both sections, so the gate is
  what stops a scale in one section from being pulled into the other domain. A scale in a section that is
  neither is not read (its domain is unknowable — never guessed). The lenient organizer-member reading is
  retained (Postel's Law tolerance for a mis-nested scale).
- The scale's scored components — Assessment Scale Supporting Observations (`…22.4.86`) — are read into a
  new `SupportingObservation[]` on `StatusObservation.supporting` (`ids`, `code`, `value`, `narrative`), so
  the scale detail is never silently dropped.
- **New `integer` observation-value kind.** `ObservationValue` gains
  `{ kind: "integer"; value?: number; nullFlavor?: string }` for `<value xsi:type="INT">` — the type C-CDA
  prefers for a questionnaire score (units are not allowed on an `INT`). `value` and `nullFlavor` are kept
  distinct — an explicit-unknown score (`nullFlavor="UNK"`) is never collapsed into a real one.

**Builder (emit).**

- Two new optional `BuildCcdaInit` inputs — `functionalStatusScales` and `mentalStatusScales`
  (`BuildCcdaAssessmentScale[]`) — emit direct-entry Assessment Scale Observations into their sections. Each
  carries the **bare-root** templateId `…22.4.69` (R2.1 SHALL: `@root` with **no** `@extension`,
  CONF:81-14436/14437), a SHALL `id`, the scale `code` (LOINC default), a SHALL `statusCode` fixed to
  `completed`, the SHALL `effectiveTime` [1..1], and the SHALL `value` [1..1] carrying the total score as
  `xsi:type="INT"`. Supporting components are optional Assessment Scale Supporting Observations
  (`…22.4.86`, bare root) grouped by `entryRelationship typeCode="COMP"`, each with its own SHALL `value`
  [1..*] INT score.
- **The score is never fabricated.** An omitted total or item score is emitted as `value nullFlavor="UNK"`
  — an explicit unknown the parser reads back as an `integer` value with no number, never a guessed 0. An
  omitted `effectiveTime` is `nullFlavor="UNK"`; the optional `interpretation` and `supporting` items are
  emitted only when supplied.
- **The two domains are never conflated.** Only the carrying section's templates are emitted, so each scale
  reads back tagged `domain: "functional"` or `"mental"` from its section — proven by a both-sections
  round-trip. Emitted only when populated (the status sections are CCD `SHOULD`, not `SHALL`).

New public types: `BuildCcdaAssessmentScale`, `BuildCcdaAssessmentScaleItem`, `SupportingObservation`. No
warning-code change.

Deferred: the supporting observation's optional second `CO`/`CD` coded answer and `IVL_INT` reference range
(both tolerated on parse — read without warning — but not yet modeled); capturing the organizer's own
`code`/`effectiveTime` on parse; the other eleven document types; C-CDA document editing; the
bring-your-own-credentials terminology adapter; and the external-validator/Schematron differential-testing
gate.
