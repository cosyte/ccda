---
"@cosyte/ccda": patch
---

Phase 7 (second slice) — richer builder section emitters: **Medications, Results, Vital Signs** (CCDA-P7).

Extends `buildCcda` from the header + Problems + Allergies of the first slice to emit **populated,
discrete-data** clinical sections that were previously emitted as empty `nullFlavor="NI"`
placeholders. Every new section round-trips through `parseCcda` to the same structured content **by
construction** (the builder still emits through the same DOM the parser reads), and a clean build
still carries **zero warnings**.

- **Medications** — Medication Activity `…22.4.16` `substanceAdministration` → Medication Information
  `…22.4.23`; the drug at `consumable/manufacturedProduct/manufacturedMaterial/code` (**RxNorm** by
  default, or NDC). The periodic frequency (a `PIVL_TS` period) and the therapy window (an `IVL_TS`
  low/high) are emitted as **two distinct `effectiveTime` siblings** so the parser reads them back on
  separate axes (no `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED`). `dose` (`doseQuantity`) and `route`
  (`routeCode`, **NCI Thesaurus** by default) are **never defaulted** — an omitted one is left absent
  so the parser flags it (`MISSING_DOSE_QUANTITY` / `MISSING_ROUTE_CODE`), the same fail-safe the
  allergy propensity-`type` default established.
- **Results** — Result Organizer `…22.4.1` → Result Observation `…22.4.2`; a LOINC panel + test code
  and a typed `value` in **exactly one** form: a UCUM-checked `PQ` `quantity`, a `CD` `codedValue`, or
  a `ST` `stringValue`. The builder throws `TypeError` if none (or more than one) is set, so a result
  value is never silently dropped or invented. Optional structured `IVL_PQ` `referenceRange` (emitted
  so it round-trips numerically rather than as `FREE_TEXT_REFERENCE_RANGE`) and `interpretationCode`.
- **Vital Signs** — Vital Signs Organizer `…22.4.26` → Vital Sign Observation `…22.4.27`; a LOINC vital
  code and a **UCUM** `PQ` reading. The organizer carries the SNOMED `46680005` "Vital signs" cluster
  code.

**Units stay safety-critical.** Result/Vital `PQ` units are emitted verbatim and validated by the
computable UCUM grammar on re-parse — a non-UCUM or case-slipped unit (`Kg` for `kg`) surfaces
`NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT` rather than being silently "corrected". Each populated section
declares the entries-required `.1` templateId; a section for which no content is supplied stays a
spec-clean empty `nullFlavor="NI"` section (entries-optional templateId only), so the document remains
conformant with no `REQUIRED_SECTION_MISSING`.

New public exports: the input types `BuildCcdaMedication`, `BuildCcdaResultPanel`, `BuildCcdaResult`,
`BuildCcdaVitalsPanel`, `BuildCcdaVital`, and `BuildQuantity`. No parser change, no warning-code
change.

**Deferred to a later CCDA-P7 increment:** the remaining sections (Immunizations, Procedures,
Encounters, Plan of Treatment, Social History, …), the other eleven document types, C-CDA document
_editing_, and the bring-your-own-credentials semantic-terminology adapter + optional bundled
redistributable data.

Synthetic-only fixtures throughout (the canonical "Jane Doe", generic placeholder MRNs, round dates,
standard terminology codes, fake OIDs) — no realistic PHI.
