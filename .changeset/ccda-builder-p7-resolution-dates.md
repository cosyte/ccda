---
"@cosyte/ccda": patch
---

Phase 7 (seventeenth slice) — builder accepts caller-supplied problem/allergy resolution + onset dates (CCDA-P7).

A resolved Problem or Allergy concern can now carry a real resolution date on its
`effectiveTime/high` instead of only `nullFlavor="UNK"`. `BuildCcdaProblem` gains a `resolution`
field (it already had `onset`); `BuildCcdaAllergy` gains both `onset` and `resolution` (it previously
had neither, so every emitted allergy concern was forced to a `nullFlavor="UNK"` low). `onset` fills
the SHALL `effectiveTime/low` and `resolution` fills the `effectiveTime/high` on both the Concern Act
and its nested observation; both round-trip through `parseCcda`.

The `high` is emitted only for a `status: "resolved"` concern, because its mere presence asserts
resolution — traced firsthand to the C-CDA R2.1 Problem Observation
(`2.16.840.1.113883.10.20.22.4.4`): "the existence of a high element within a problem does indicate
that the problem has been resolved". `buildCcda` throws a `TypeError` when a `resolution` is supplied
without `status: "resolved"` rather than emit a self-inconsistent document. A resolved concern whose
date is unknown still emits the `nullFlavor="UNK"` high; an absent onset stays `nullFlavor="UNK"` low;
an active concern emits no high. Past Medical History (bare Problem Observations) benefits
automatically. No warning-code change; additive to `BuildCcdaProblem` / `BuildCcdaAllergy` only.
