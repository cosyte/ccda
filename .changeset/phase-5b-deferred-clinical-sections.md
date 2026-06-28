---
"@cosyte/ccda": patch
---

Phase 5b — the deferred clinical sections. `parseCcda(xml)` now extracts five more entry families,
surfaced on `CcdaDocument` via `getPlannedItems()`, `getFunctionalStatus()`, `getMentalStatus()`,
`getFamilyHistory()`, and `getPastMedicalHistory()` (and the matching `doc.*` arrays):

- **Plan of Treatment** — the six planned-entry templates a Plan of Treatment section (`…22.2.10`) can
  carry: Planned Act (`…22.4.39`), Encounter (`…22.4.40`), Procedure (`…22.4.41`), Medication Activity
  (`…22.4.42`), Supply (`…22.4.43`), and Observation (`…22.4.44`), kept apart by a `kind` discriminant.
  **Everything here is future/ordered, never performed:** each item's `moodCode` is read into the same
  performed-vs-planned `disposition` as Procedures (a planned mood → `"planned"`) and the two are
  **never conflated** — a missing/unrecognized mood leaves `disposition` undefined rather than guessing.
  A Planned Medication Activity's drug is read from its `consumable`.
- **Functional Status** / **Mental Status** — the Functional/Mental Status Observations (`…22.4.67` /
  `…22.4.74`), read standalone or as members of a status Organizer (`…22.4.66` / `…22.4.75`), plus any
  Assessment Scale Observation (`…22.4.69`, flagged `assessmentScale`) inside such an organizer. Each
  finding is `domain`-tagged so the two are **never conflated**; a standalone assessment scale (whose
  domain can't be determined from its template alone) is deliberately not captured.
- **Family History** — the Family History Organizer (`…22.4.45`) → Observation (`…22.4.46`) tree. The
  relative's identity (relationship, gender, birth time, `sdtc:deceasedInd`) is a structured `relative`
  (not flattened into each condition); each condition carries its coded `value`, an optional Age
  Observation (`…22.4.31`, age at onset), and a `causeOfDeath` flag from a Family History Death
  Observation (`…22.4.47`).
- **Past Medical History** — the **bare** Problem Observations (`…22.4.4`) a Past Medical History
  section (`…22.2.20`) carries directly under each `<entry>` (not wrapped in a Problem Concern Act),
  reusing the Problems model — so a past problem never double-counts as an active one.

No new warning codes (the deferred sections reuse the existing Tier-2 registry), and the
per-document-type required-section table is unchanged. (The Care Plan document's SHALL sections —
`healthConcerns` + `goals` — already landed in Phase 5; a Plan of Treatment Section stays **excluded**
because a Care Plan document SHALL NOT contain one.)
