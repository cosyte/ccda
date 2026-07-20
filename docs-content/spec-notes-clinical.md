---
id: spec-notes-clinical
title: The clinical entry layer
sidebar_label: Clinical entries
sidebar_position: 3
---

# The clinical entry layer

Beyond identity + narrative, `parseCcda` extracts the structured clinical entries into typed accessors.
Each family is reached in one call; every safety-critical distinction is **kept apart, never conflated**.

| Accessor | What it returns |
|---|---|
| `getProblems()` | Problem Concern Acts → coded conditions (SNOMED CT / ICD-10-CM) + active/resolved status. |
| `getMedications()` | Medication Activities → RxNorm drug, dose, route, therapy window vs periodic frequency. |
| `getAllergies()` | Allergy Concern Acts → allergen, reactions (manifestation + severity), criticality, the "No Known Allergies" flag. |
| `getResults()` | Result Organizers → LOINC analyte, polymorphic UCUM-checked value, reference range, interpretation. |
| `getVitals()` | Vital Signs Organizers → the same UCUM-checked value machinery. |
| `getImmunizations()` | Immunization Activities → CVX vaccine, dose, route, date, the `refused` flag. |
| `getProcedures()` | Performed **or** planned procedures, split by `moodCode`. |
| `getEncounters()` | Encounter Activities → visit type, status, period. |
| `getSmokingStatus()` | Smoking Status observations → SNOMED value + an explicit `unknown` flag. |
| `getPlannedItems()` | Plan of Treatment entries — all future/ordered, never performed. |
| `getFunctionalStatus()` / `getMentalStatus()` | Functional / Mental Status findings + direct-entry Assessment Scale Observations (`assessmentScale`, with an `INT` score + `supporting` items), domain-tagged so the two never merge. |
| `getFamilyHistory()` | One entry per relative — structured identity + their conditions. |
| `getPastMedicalHistory()` | Bare historical Problem Observations (never double-counted as active). |

## The safety-critical distinctions

These are the reconciliations where a silent guess could harm someone, so the parser refuses to guess:

- **Performed vs planned** (Procedures, Plan of Treatment) — the `moodCode` drives a `disposition` of
  `"performed"` (`EVN`) vs `"planned"` (`INT`/`RQO`/…). A missing mood is `PLANNED_VS_PERFORMED_AMBIGUOUS`
  and an unrecognized one is `PROCEDURE_MOOD_UNEXPECTED`; both leave `disposition` undefined rather than
  guess. A planned colonoscopy is **never** read as a performed one.
- **Severity vs criticality** (Allergies) — a reaction's `severity` (how bad this event was) and the
  propensity's `criticality` (how dangerous future exposure is) are different axes, kept on different
  fields, never merged.
- **Negated vs unknown** — "No Known Allergies" (`noKnownAllergy`, from `negationInd`) and a refused
  immunization (`refused`) are distinct from a `nullFlavor` "unknown". A refusal is never read as an
  administration.
- **Code vs narrative** — when a coded value disagrees with the narrative text it references, the
  parser surfaces **both** (`CODE_NARRATIVE_MISMATCH`) and picks no winner.
- **Missing safety fields** — a missing `doseQuantity` / `routeCode` is preserved-as-absent and flagged,
  never defaulted.

The performed-vs-planned split, exercised:

```ts runnable
import { parseCcda } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.9" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0006"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic Procedure Note</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient>
      <name><given>Jane</given><family>Doe</family></name>
      <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>
    </patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.7.1" extension="2014-06-09"/>
      <code code="47519-4" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Procedures</title>
      <text><content ID="p1">Appendectomy</content></text>
      <entry><procedure classCode="PROC" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"/>
        <code code="80146002" codeSystem="2.16.840.1.113883.6.96" displayName="Appendectomy"/>
        <statusCode code="completed"/>
        <effectiveTime value="20230615"/>
        <text><reference value="#p1"/></text>
      </procedure></entry>
      <entry><procedure classCode="PROC" moodCode="INT">
        <templateId root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"/>
        <code code="73761001" codeSystem="2.16.840.1.113883.6.96" displayName="Colonoscopy"/>
        <statusCode code="active"/>
      </procedure></entry>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

const procs = doc(xml);

// The performed appendectomy and the planned colonoscopy are kept strictly apart.
procs[0]?.disposition; // => "performed"
procs[0]?.code?.code; // => "80146002"
procs[1]?.disposition; // => "planned"
procs[1]?.code?.code; // => "73761001"

function doc(x: string) {
  return parseCcda(x).getProcedures();
}
```

## Required-section (SHALL) validation

For a recognized document type, an absent required (SHALL) catalog section surfaces a
`REQUIRED_SECTION_MISSING` **warning** — never a fatal, so a missing section never blocks reading the
data that *is* present. The table is **conservative**: it asserts only unconditional, in-catalog,
high-confidence SHALL constraints and omits choice constraints (`SHALL contain A OR B`), SHOULD/MAY
sections, and SHALL sections outside the recognized catalog. `requiredSectionKeys(documentType)` and
`missingRequiredSections(documentType, presentKeys)` expose the table directly.
