---
"@cosyte/ccda": patch
---

Phase 7 (seventh slice) — builder emits a Functional Status section (CCDA-P7).

Extends `buildCcda` with one new optional input — `BuildCcdaInit.functionalStatus`
(`BuildCcdaFunctionalStatus[]`) — that round-trips through `getFunctionalStatus()` to the same
structured content by construction. A clean build still carries **zero warnings**, and the serializer
fixed point (`parseCcda(doc.toString()).toString() === doc.toString()`) still holds.

Per-template shape, confirmed against the C-CDA R2.1 IG (build.fhir.org `CDA-ccda-2.1-sd`) before
emitting:

- **Functional Status Section `…22.2.14`** — LOINC `47420-5`, the V2 **`2014-06-09`** stamp. It has
  **no** entries-required `.1` variant, so only the base `templateId` is emitted even though the section
  carries entries.
- **Functional Status Observation `…22.4.67`** (the **`2014-06-09`** stamp) — emitted as a standalone
  observation directly under `<entry>` (a conformant `entry:funcStatusObs` slice). Each carries: a SHALL
  `id`; the SHALL, template-**fixed** LOINC `code` `54522-8` "Functional status" (the specific finding is
  **not** in this `code`); a SHALL `statusCode` fixed `completed`; a SHALL `effectiveTime` [1..1]
  (CONF:1098-13930), the assessed time as a point `@value` or `nullFlavor="UNK"` when unknown; and the
  SHALL `value` [1..1] (CONF:1098-13932), the SNOMED CT finding.

Safety invariants held, matching the bar of the prior builder slices:

- **Functional and mental status are never conflated.** Only Functional Status templates are emitted, so
  the parser reads every finding back tagged `domain: "functional"` — never filed under Mental Status
  (`getMentalStatus()` stays empty).
- **Unknown is never defaulted to a finding.** When the caller supplies no `value`, the SHALL `value` is
  an **explicit `nullFlavor="UNK"`** — never invented as a real finding; the SHALL `effectiveTime` is
  likewise `nullFlavor="UNK"` when no assessed time is given, never a fabricated date.
- **Narrative agreement.** The section narrative reads `Functional status: <finding>` (the fixed `code`
  label plus the finding), so it agrees with the observation's reconciled `code` and no
  `CODE_NARRATIVE_MISMATCH` fires.
- **Emitted only when populated.** Functional Status is not a CCD `SHALL` section, so — like Immunizations
  / Procedures / Encounters / Social History — an unpopulated section is not fabricated; the empty-build
  output is unchanged.

New public type `BuildCcdaFunctionalStatus`. No parser change and no warning-code change.

Deferred: Mental Status, the Functional/Mental Status Organizer + Assessment Scale forms, and the
remaining sections (Plan of Treatment / Family History / Past Medical History / …) in the builder; the
other eleven document types; C-CDA document editing; the bring-your-own-credentials terminology adapter;
and the external-validator/Schematron differential-testing gate.
