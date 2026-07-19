---
"@cosyte/ccda": patch
---

Phase 7 (eighth slice) — builder emits a Mental Status section (CCDA-P7).

Extends `buildCcda` with one new optional input — `BuildCcdaInit.mentalStatus`
(`BuildCcdaMentalStatus[]`) — that round-trips through `getMentalStatus()` to the same structured
content by construction. A clean build still carries **zero warnings**, and the serializer fixed point
(`parseCcda(doc.toString()).toString() === doc.toString()`) still holds.

Per-template shape, confirmed against the C-CDA R2.1 IG + the HL7 C-CDA R2.1 examples before emitting:

- **Mental Status Section `…22.2.56`** — LOINC `10190-7`, the V2 **`2015-08-01`** stamp. It has **no**
  entries-required `.1` variant, so only the base `templateId` is emitted even though the section carries
  entries. (Unlike Functional Status, which keeps the `2014-06-09` version, the Mental Status Section was
  **introduced in the R2.1 August 2015 errata** — split out of Functional Status, "not backwards
  compatible with prior `…22.2.14`" — hence the `2015-08-01` stamp.)
- **Mental Status Observation `…22.4.74`** (the **`2015-08-01`** stamp) — emitted as a standalone
  observation directly under `<entry>`. Each carries: a SHALL `id`; the SHALL, R2.1 template-**fixed**
  SNOMED CT `code` `373930000` "Cognitive function finding" (the specific finding is **not** in this
  `code`); a SHALL `statusCode` fixed `completed`; a SHALL `effectiveTime` [1..1], the assessed time as a
  point `@value` or `nullFlavor="UNK"` when unknown; and the SHALL `value` [1..1], the SNOMED CT finding.

Safety invariants held, matching the bar of the prior builder slices:

- **Mental and functional status are never conflated.** Only Mental Status templates are emitted here,
  and the two extractors key off their distinct observation template roots (`…22.4.67` vs `…22.4.74`), so
  the parser reads every finding back tagged `domain: "mental"` — never filed under Functional Status (or
  vice versa).
- **Unknown is never defaulted to a finding.** When the caller supplies no `value`, the SHALL `value` is
  an **explicit `nullFlavor="UNK"`** — never invented as a real finding; the SHALL `effectiveTime` is
  likewise `nullFlavor="UNK"` when no assessed time is given, never a fabricated date.
- **Narrative agreement.** The section narrative reads `Cognitive function finding: <finding>` (the fixed
  `code` label plus the finding), so it agrees with the observation's reconciled `code` and no
  `CODE_NARRATIVE_MISMATCH` fires.
- **Emitted only when populated.** Mental Status is not a CCD `SHALL` section, so — like Functional Status
  / Immunizations / Procedures / Encounters / Social History — an unpopulated section is not fabricated;
  the empty-build output is unchanged.

New public type `BuildCcdaMentalStatus`. No parser change and no warning-code change.

Deferred: the Functional/Mental Status Organizer + Assessment Scale forms, and the remaining sections
(Plan of Treatment / Family History / Past Medical History) in the builder; the other eleven document
types; C-CDA document editing; the bring-your-own-credentials terminology adapter; and the
external-validator/Schematron differential-testing gate.
