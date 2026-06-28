---
"@cosyte/ccda": patch
---

Phase 2 — the clinical reconciliation triad. `parseCcda(xml)` now extracts the three reconciliation
entries from a structured body, surfaced on `CcdaDocument` via `getProblems()`, `getMedications()`,
and `getAllergies()` (and the `doc.problems` / `doc.medications` / `doc.allergies` arrays):

- **Problems** — Problem Concern Act (`…22.4.3`) → Problem Observation (`…22.4.4`); the coded
  condition (`value xsi:type="CD"`, SNOMED CT / ICD-10-CM), the concern `status`
  (active / resolved / inactive / unknown), and `effectiveTime`.
- **Medications** — Medication Activity (`…22.4.16`); the RxNorm drug reached via
  `consumable/manufacturedProduct/manufacturedMaterial/code`, `dose`/`doseRange`, `route`, and the
  two `effectiveTime` siblings split by `xsi:type` into an `IVL_TS` therapy window (`duration`) and a
  `PIVL_TS` periodic `frequency` — `moodCode` (administered vs planned) kept distinct.
- **Allergies** — Allergy Concern Act (`…22.4.30`) → Allergy-Intolerance Observation (`…22.4.7`); the
  allergen at `participant/participantRole/playingEntity/code`, each Reaction (`…22.4.9`) with its
  nested Severity (`…22.4.8`), and the propensity-level Criticality (`…22.4.145`) — severity and
  criticality never merged. `negationInd="true"` "No Known Allergies" is a distinct `noKnownAllergy`
  flag, never conflated with a `nullFlavor`.

Adds structural `@codeSystem` OID validation per coded slot (`checkCodeSlot`, exported OIDs
`SNOMED_CT` / `RXNORM` / `ICD10_CM` / `NDC` / `UNII` / `NCI_ROUTE` / …) and eleven new Tier-2 warning
codes for the entry layer. The two safety-critical reconciliations stay conservative: a
code↔narrative disagreement surfaces **both** and picks no winner; a missing `doseQuantity`/`routeCode`
is preserved-as-absent and flagged, never defaulted.
