---
"@cosyte/ccda": patch
---

Phase 7 (tenth slice) — builder emits a Plan of Treatment section (CCDA-P7).

Extends `buildCcda` with one new optional input — `BuildCcdaInit.planOfTreatment`
(`BuildCcdaPlannedItem[]`) — that round-trips through `getPlannedItems()` to the same structured
content by construction. A clean build still carries **zero warnings**, and the serializer fixed point
(`parseCcda(doc.toString()).toString() === doc.toString()`) still holds.

Per-template shape, confirmed against the C-CDA R2.1 IG + the HL7 C-CDA R2.1 examples before emitting:

- **Plan of Treatment Section (V2) `…22.2.10`** — LOINC `18776-5`, the **`2014-06-09`** stamp. It has
  **no** entries-required `.1` variant, so only the base `templateId` is emitted even though the section
  carries entries. Emitted only when populated (a CCD `SHOULD`, not `SHALL`, section).
- **The six planned-entry templates**, each the **`2014-06-09`** stamp — Planned Act `…22.4.39`
  (`<act classCode="ACT">`), Planned Encounter `…22.4.40` (`<encounter classCode="ENC">`), Planned
  Procedure `…22.4.41` (`<procedure classCode="PROC">`), Planned Medication Activity `…22.4.42`
  (`<substanceAdministration classCode="SBADM">`, drug in the `consumable/manufacturedProduct/
  manufacturedMaterial/code`, no direct `<code>`), Planned Supply `…22.4.43` (`<supply classCode="SPLY">`),
  and Planned Observation `…22.4.44` (`<observation classCode="OBS">`, carrying an optional expected
  `value`). Each carries a SHALL `id`, its coded order (default code system by kind: SNOMED CT for an
  act/procedure/supply, CPT for an encounter, LOINC for an observation, RxNorm for a medication), a
  planned `@moodCode`, and the SHALL `statusCode` fixed to `active`.

Safety invariants held, matching the bar of the prior builder slices:

- **Planned is never conflated with performed (the safety rule).** No variant admits the performed `EVN`
  mood, and `statusCode` is fixed to `active` (never a performed `completed`), so every entry reads back
  through the parser as `disposition: "planned"` — never mistaken for a performed Procedure or Encounter.
  A build carrying both a performed procedure and a planned one keeps them in `getProcedures()` vs
  `getPlannedItems()` respectively.
- **The planned `@moodCode` domain is correct by construction.** `BuildCcdaPlannedItem` is a per-kind
  discriminated union: act/encounter/procedure accept the full Planned moodCode value set including the
  appointment moods `APT`/`ARQ` (`PlannedActMood`), while medication/supply/observation accept only
  `INT`/`RQO`/`PRMS`/`PRP` (`PlannedOrderMood`) — because the base CDA R2 mood domains for
  `substanceAdministration`/`supply` (`x_DocumentSubstanceMood`) and `observation`
  (`x_ActMoodDocumentObservation`) **exclude** `APT`/`ARQ`. A schema-invalid appointment `@moodCode` on a
  drug order or a lab is therefore not representable — the type prevents it, not merely discourages it.
- **Optional data is never fabricated.** The planned `effectiveTime` (SHOULD [0..1]) and the Planned
  Observation's expected `value` [0..1] are emitted only when supplied — an undated plan carries no
  fabricated date, and no confident-wrong result is invented.
- **Narrative agreement.** The section narrative reads each item's display name referenced by `#id`, so it
  agrees with the entry's reconciled `code` and no `CODE_NARRATIVE_MISMATCH` fires.

New public types: `BuildCcdaPlannedItem` (union) and its members `BuildCcdaPlannedAct` /
`BuildCcdaPlannedOrder` / `BuildCcdaPlannedObservation`, plus the mood types `PlannedActMood` /
`PlannedOrderMood`. No parser change and no warning-code change.

Deferred: the Functional/Mental Status Organizer + Assessment Scale forms and the Family History section
in the builder; the other eleven document types; C-CDA document editing; the bring-your-own-credentials
terminology adapter; and the external-validator/Schematron differential-testing gate.
