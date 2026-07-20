---
"@cosyte/ccda": patch
---

Phase 7 (twelfth slice) — builder emits Functional/Mental Status Organizers (CCDA-P7).

Extends `buildCcda` with two new optional inputs — `BuildCcdaInit.functionalStatusOrganizers`
(`BuildCcdaFunctionalStatusOrganizer[]`) and `BuildCcdaInit.mentalStatusOrganizers`
(`BuildCcdaMentalStatusOrganizer[]`) — that **group** related status findings under one organizer, the
complement to the standalone Functional/Mental Status Observations shipped in the seventh/eighth slices.
Grouped members round-trip through `getFunctionalStatus()` / `getMentalStatus()` to the same structured,
domain-tagged findings by construction. A clean build still carries **zero warnings**, and the serializer
fixed point (`parseCcda(doc.toString()).toString() === doc.toString()`) still holds.

Per-template shape, confirmed against the C-CDA R2.1 IG + the parser's own Functional/Mental Status
extractor (the round-trip contract) before emitting:

- **Functional Status Organizer (V2) `…22.4.66`** (the **`2014-06-09`** stamp) and **Mental Status
  Organizer (V2) `…22.4.75`** (the **`2015-08-01`** stamp) — each emitted as
  `<organizer classCode="CLUSTER" moodCode="EVN">` in its status section, carrying a SHALL `id`, a `code`
  (SHOULD ICF `2.16.840.1.113883.6.254` or LOINC — the Functional Status Organizer's `code` is SHALL
  [1..1], the Mental Status Organizer's is [0..1] with the "SHALL have at least one of code or
  effectiveTime" floor, CONF:1198-32426, always satisfied by the always-present `code` element), a SHALL
  `statusCode` fixed to `completed`, an optional `effectiveTime` [0..1], and one or more `component`
  members. Element order follows the CDA organizer schema (`templateId, id, code, statusCode,
  effectiveTime, component+`).
- **Members** are Functional Status Observations `…22.4.67` / Mental Status Observations `…22.4.74` —
  byte-identical to the standalone builders (a shared code path), so a grouped finding reads back with its
  fixed observation `code` (LOINC `54522-8` / SNOMED CT `373930000`) and coded finding `value` intact,
  tagged with the correct `domain`.

Safety invariants held, matching the bar of the prior builder slices:

- **No clinical value, category, or date is ever fabricated (the safety rule).** An omitted organizer
  `code` is an explicit `nullFlavor="UNK"` (never a guessed categorization); an omitted organizer
  `effectiveTime` is simply not emitted (an optional element, never a fabricated date); an omitted finding
  `value` stays `nullFlavor="UNK"`. An organizer with zero findings throws a `TypeError` — the template
  SHALL contain at least one member, so a zero-member organizer is never emitted.
- **Functional and mental status are never conflated.** Only each domain's own organizer/observation
  templates are emitted; grouped and standalone findings coexist in one section and all read back correctly
  domain-tagged.
- **Emitted only when populated.** The status sections are CCD `SHOULD` (not `SHALL`) sections, emitted when
  either the standalone findings or the organizers are non-empty; an unpopulated section is not fabricated.

New public types: `BuildCcdaFunctionalStatusOrganizer` and `BuildCcdaMentalStatusOrganizer`. No parser
change and no warning-code change.

Deferred: the **Assessment Scale Observation** (`…22.4.69`) and Assessment Scale Supporting Observation
(`…22.4.86`) — in C-CDA R2.1 the Assessment Scale Observation is a _direct section entry_ of the
Functional/Mental Status Section, **not** a component of the organizer, and the current parser reads
assessment scales only as organizer members; shipping it conformantly needs a coordinated parser increment
(read a direct-entry assessment scale by its section's domain), so it is deferred. Also deferred: capturing
the organizer's own `code`/`effectiveTime` on parse (members round-trip; the wrapper metadata does not
yet); the Self-Care Activities organizer member (`…22.4.128`); the other eleven document types; C-CDA
document editing; the bring-your-own-credentials terminology adapter; and the external-validator/Schematron
differential-testing gate.
