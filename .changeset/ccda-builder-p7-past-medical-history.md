---
"@cosyte/ccda": patch
---

Phase 7 (ninth slice) — builder emits a Past Medical History section (CCDA-P7).

Extends `buildCcda` with one new optional input — `BuildCcdaInit.pastMedicalHistory`
(`BuildCcdaProblem[]`, reusing the Problems input shape) — that round-trips through
`getPastMedicalHistory()` to the same structured content by construction. A clean build still carries
**zero warnings**, and the serializer fixed point
(`parseCcda(doc.toString()).toString() === doc.toString()`) still holds.

Per-template shape, confirmed against the C-CDA R2.1 IG + the HL7 C-CDA R2.1 examples before emitting:

- **Past Medical History Section `…22.2.20`** — LOINC `11348-0`, the V3 **`2015-08-01`** stamp. It has
  **no** entries-required `.1` variant, so only the base `templateId` is emitted even though the section
  carries entries.
- **Problem Observation `…22.4.4`** (the **`2015-08-01`** stamp) — emitted as a **bare** observation
  **directly** under `<entry>`, **not** wrapped in a Problem Concern Act (`…22.4.3`) the way the Problems
  section nests it. Each carries: a SHALL `id`; the SHALL fixed SNOMED CT `code` `55607006` "Problem" (the
  specific condition is in `value`, not this `code`); a SHALL `statusCode` fixed `completed`; a SHALL
  `effectiveTime` [1..1] (onset as `low`, a `nullFlavor="UNK"` `high` for a resolved problem); and the
  SHALL `value` [1..1], the coded condition (SNOMED CT / ICD-10-CM). The bare Problem Observation build is
  now shared verbatim with the Problems section — the same reuse the parser makes (`buildProblem` serves
  both `getProblems` and `getPastMedicalHistory`).

Safety invariants held, matching the bar of the prior builder slices:

- **A past illness is never double-counted as an active problem concern.** The two extractors route on
  structure — a bare observation goes to `getPastMedicalHistory`, a concern-act-wrapped one to
  `getProblems` — so a resolved past problem never reads back as an active concern (or vice versa). A
  build carrying both an active problem and a past one keeps them in their respective accessors.
- **Onset/resolution are never fabricated.** A supplied onset is the observation `effectiveTime/low`; an
  absent onset is an explicit `nullFlavor="UNK"` `low`; a resolved-but-date-unknown problem adds a
  `nullFlavor="UNK"` `high` — never a guessed date.
- **Narrative agreement.** The section narrative reads the condition display name referenced by `#id`, so
  it agrees with the observation's reconciled `value` and no `CODE_NARRATIVE_MISMATCH` fires.
- **Emitted only when populated.** Past Medical History is not a CCD `SHALL` section, so — like the other
  optional sections — an unpopulated section is not fabricated; the empty-build output is unchanged.

No new public type (reuses `BuildCcdaProblem`). No parser change and no warning-code change.

Deferred: the Functional/Mental Status Organizer + Assessment Scale forms, and the remaining sections
(Plan of Treatment / Family History) in the builder; the other eleven document types; C-CDA document
editing; the bring-your-own-credentials terminology adapter; and the external-validator/Schematron
differential-testing gate.
