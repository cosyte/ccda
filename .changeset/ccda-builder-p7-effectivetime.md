---
"@cosyte/ccda": patch
---

Phase 7 (third slice) — builder emits the SHALL `effectiveTime` on every entry (CCDA-P7).

Closes the conformance gap the previous builder slice flagged in the README known-limitations: `buildCcda`
emitted each act/observation's `effectiveTime` **only when the caller supplied a time**, so a built
document round-tripped through `parseCcda` but was **not Schematron-complete** — several C-CDA R2.1
`SHALL`-cardinality `effectiveTime` slots could be absent. Every affected template now emits the element
its IG constraint requires, across **all** builder sections (the new Medications/Results/Vital Signs and
the pre-existing Problems/Allergies).

Where the caller supplied a time it is used; where a `SHALL` requires the element but no time is known the
slot is filled with `nullFlavor="UNK"` — satisfying the cardinality **without fabricating a clinical
timestamp**, and read back as absent (`date === undefined`), never as a real time. This mirrors exactly how
the header's `SHALL` `addr`/`telecom` and the never-guessed `dose`/`route` are handled. No confident-wrong
timestamp is ever emitted.

Per-template cardinality, confirmed against the C-CDA R2.1 IG (build.fhir.org `CDA-ccda-2.1-sd`) before
emitting:

- **Problem Concern Act `…22.4.3`** and **Allergy Concern Act `…22.4.30`** — `effectiveTime` `SHALL` [1..1]
  under the shared Concern Act rule; an **active** concern `SHALL` contain `low`, a **completed** (resolved)
  concern `SHALL` contain `high` (on the Problem Concern Act these are CONF:1198-7504 / CONF:1198-10085;
  the Allergy Concern Act carries the same rule under its own ids). Emitted `low` = onset when supplied
  else `nullFlavor="UNK"`; a resolved
  concern adds a `nullFlavor="UNK"` `high` (resolved, resolution date unknown).
- **Problem Observation `…22.4.4`** and **Allergy-Intolerance Observation `…22.4.7`** — `effectiveTime`
  with `low` (biological onset). Always emitted; `low` = onset or `nullFlavor="UNK"`.
- **Medication Activity `…22.4.16`** — the `IVL_TS` duration `effectiveTime` is `SHALL` [1..1]
  (CONF:1098-7495/-7496). Always emitted; `low` = supplied window bound or `nullFlavor="UNK"`
  (CONF:1098-32890 — carries a `low`, not an invented `@value`). The optional `PIVL_TS` frequency remains a
  distinct, caller-supplied-only sibling (no `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED`).
- **Result Observation `…22.4.2`** and **Vital Sign Observation `…22.4.27`** — `effectiveTime` `SHALL`
  [1..1]. Always emitted as a point (`@value`) or `nullFlavor="UNK"`.
- **Result Organizer `…22.4.1`** and **Vital Signs Organizer `…22.4.26`** — `effectiveTime` (spans the
  member observations). Always emitted for spec-completeness (`nullFlavor="UNK"` unless a panel time is
  supplied); the member observations each still carry their own required time.

The round-trip-by-construction invariant and the zero-warning clean build still hold, and a
`nullFlavor="UNK"` time is explicitly tested to **not** re-parse into a fabricated `Date`.

New optional inputs: `BuildCcdaResultPanel.effectiveTime` and `BuildCcdaVitalsPanel.effectiveTime` (the
organizer span time). No new required fields, no parser change, no warning-code change.

**Deferred:** a caller-supplied allergy/problem onset or resolution date (currently `nullFlavor="UNK"` when
absent); the reaction/severity/criticality sub-observation optional `effectiveTime` (0..1, no `SHALL` gap);
full XSD element-order and Schematron completeness — no external C-CDA/Schematron IG validator was
reachable in the build environment, so cardinality was grounded against the raw IG text, not asserted by a
validator run.

Synthetic-only fixtures throughout (canonical "Jane Doe", placeholder MRNs, round dates, standard
terminology codes, fake OIDs) — no realistic PHI.
