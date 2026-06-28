---
"@cosyte/ccda": patch
---

Phase 3 — discrete clinical data: Results, Vital Signs, Immunizations. `parseCcda(xml)` now extracts
the three discrete-data entry families, surfaced on `CcdaDocument` via `getResults()`, `getVitals()`,
and `getImmunizations()` (and the `doc.results` / `doc.vitals` / `doc.immunizations` arrays):

- **Results** — Result Organizer (`…22.4.1`) → Result Observation (`…22.4.2`); the LOINC-coded
  analyte, the polymorphic observation `value` read into a discriminated `ObservationValue` union
  (`physicalQuantity` / `coded` / `string` / `range` / `unsupported`, selected by `xsi:type`), the
  `referenceRange` (structured `IVL_PQ` bounds, else free-text), and the `interpretationCode`.
- **Vital Signs** — Vital Signs Organizer (`…22.4.26`) → Vital Sign Observation (`…22.4.27`); the
  same UCUM-checked `ObservationValue` machinery, no reference range.
- **Immunizations** — Immunization Activity (`…22.4.52`); the CVX vaccine reached via
  `consumable/manufacturedProduct/manufacturedMaterial/code`, `dose`, `route`, `effectiveTime`, and
  `statusCode`. A `negationInd="true"` refusal is a distinct `refused` flag (`IMMUNIZATION_REFUSED`),
  never conflated with a `nullFlavor`.

Adds a **computable, zero-dep UCUM grammar** (`isValidUcumUnit`, `isUcumCaseSuspect`) that runs on
every physical quantity: a non-UCUM unit is flagged (`NON_UCUM_UNIT`) and a case slip
(`UCUM_CASE_SUSPECT`) caught, but the raw unit string is always preserved — units are never
normalized away. Recognizes the CVX and HL7 `INTERPRETATION` code systems and checks LOINC
deprecation (`checkLoincDeprecation`). Seven new Tier-2 warning codes for the discrete-data layer:
`NON_UCUM_UNIT`, `UCUM_CASE_SUSPECT`, `MISSING_UNIT_ON_PQ`, `FREE_TEXT_REFERENCE_RANGE`,
`RESULT_VALUE_TYPE_UNHANDLED`, `IMMUNIZATION_REFUSED`, `DEPRECATED_LOINC`. An unrecognized
`value xsi:type` is preserved as `unsupported` — nothing is dropped.
