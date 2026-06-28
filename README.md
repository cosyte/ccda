# @cosyte/ccda

> C-CDA parser, serializer, and builder for Node.js and TypeScript — **lenient on parse,
> spec-clean on emit**.

[![npm version](https://img.shields.io/npm/v/@cosyte/ccda.svg)](https://www.npmjs.com/package/@cosyte/ccda)
[![CI](https://img.shields.io/github/actions/workflow/status/cosyte/ccda/ci.yml?branch=main&label=CI)](https://github.com/cosyte/ccda/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

`@cosyte/ccda` is a near-zero-dependency TypeScript toolkit that follows the cosyte parser archetype: a
lenient parser that turns real-world, vendor-quirky input into **warnings** rather than failures
(Postel's Law). It mirrors the API shape of the reference parser,
[`@cosyte/hl7`](https://github.com/cosyte/hl7). Its single runtime dependency is
[`@xmldom/xmldom`](https://www.npmjs.com/package/@xmldom/xmldom) (exact-pinned), the hardened W3C-DOM
substrate for C-CDA's XML.

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. Through **Phase 5b** the parser ships
> document recognition, the US Realm header + patient demographics, section framing, the
> reconciliation triad (Problems / Medications / Allergies), the discrete-data families
> (Results / Vital Signs / Immunizations) with a computable UCUM unit check, Procedures (with a
> safety-critical performed-vs-planned `moodCode` split) / Encounters / Social-History smoking status,
> the deferred clinical sections (Plan of Treatment / Functional Status / Mental Status / Family
> History / Past Medical History), and per-document-type required-section (SHALL) validation — plus a
> **spec-clean, round-trip serializer** (`serializeCcda` / `toString()`) and immutable copy-with
> (`withWarnings`). A document **builder** API lands in a later phase.

## Install

```bash
npm install @cosyte/ccda
```

## Parse

```ts
import { parseCcda } from "@cosyte/ccda";

const doc = parseCcda(xml);

doc.documentType; // e.g. "ccd" — one of the 12 US Realm document types (or undefined)
doc.getPatient()?.name?.family; // patient demographics from the recordTarget
doc.getMrn(); // the patient's medical record number
doc.findSection("allergies")?.narrativeText; // framed section narrative
doc.getProblems()[0]?.problems[0]?.value?.code; // coded condition (SNOMED CT / ICD-10-CM)
doc.getMedications()[0]?.drug?.code; // RxNorm drug
doc.getAllergies()[0]?.allergies[0]?.allergen?.code; // offending substance
doc.getResults()[0]?.results[0]?.value; // polymorphic ObservationValue (UCUM-checked PQ, coded, …)
doc.getVitals()[0]?.vitals[0]?.value; // e.g. systolic BP, units intact
doc.getImmunizations()[0]?.vaccine?.code; // CVX vaccine code
doc.getProcedures()[0]?.disposition; // "performed" vs "planned" (moodCode, never guessed)
doc.getEncounters()[0]?.code?.code; // encounter type (CPT / SNOMED / ActEncounterCode)
doc.getSmokingStatus()[0]?.value?.code; // SNOMED smoking-status concept
doc.getPlannedItems()[0]?.disposition; // planned only — never read as performed
doc.getFunctionalStatus()[0]?.value; // functional finding (domain-tagged, never mental)
doc.getFamilyHistory()[0]?.relative?.relationship?.code; // relative + their conditions
doc.getPastMedicalHistory()[0]?.value?.code; // historical problem (bare, not a concern)
doc.warnings; // stable, positional tolerance warnings (never throws on quirks)
```

The parser is **lenient by default** — recoverable vendor quirks become stable-coded `CcdaWarning`s on
`doc.warnings` (also forwarded to `options.onWarning`), not failures. `{ strict: true }` escalates the
first tolerated deviation to a thrown `CcdaParseError`. Unrecoverable or hostile input (DTD/XXE,
billion-laughs entity expansion, oversized/over-deep/over-wide documents, malformed XML, a
non-`ClinicalDocument` root) is always a thrown `CcdaParseError`.

## What it extracts (Phase 1)

- **Document type** — all 12 US Realm document types resolved from the root `templateId` (CCD,
  Discharge Summary, Referral Note, Consultation Note, History & Physical, Progress Note, Procedure
  Note, Operative Note, Care Plan, Diagnostic Imaging Report, Unstructured Document, Transfer Summary).
- **US Realm header** — document identity (`code`, `title`, `effectiveTime`, `confidentialityCode`,
  `languageCode`) and the `recordTarget` patient (name parts, gender, birth time, marital status, race,
  ethnic group) + identifiers, via `getPatient()` / `getMrn()`.
- **Sections** — framed by `templateId` with a LOINC-code fallback, including nested subsections,
  narrative text, and a narrative `ID`→text index for later reference resolution, via `findSection()` /
  `allSections()`. Unstructured documents expose their `nonXMLBody` (base64 left inert).
- **HL7 v3 datatypes** — `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`, with
  variable-precision v3 datetime parsing and null-flavor handling.

## What it extracts (Phase 2) — the reconciliation triad

- **Problems** — Problem Concern Acts via `getProblems()`: the coded condition (`value`, SNOMED CT /
  ICD-10-CM), the concern `status` (active / resolved / inactive / unknown), and `effectiveTime`.
- **Medications** — Medication Activities via `getMedications()`: the RxNorm `drug`, the
  `dose` / `doseRange`, the `route`, and the therapy-window `duration` (`IVL_TS`) split from the
  periodic `frequency` (`PIVL_TS`); `moodCode` distinguishes an administration from a plan/order.
- **Allergies** — Allergy Concern Acts via `getAllergies()`: the `allergen` substance, each reaction's
  `manifestation` + `severity`, and the propensity `criticality` (severity and criticality never
  merged). "No Known Allergies" is a distinct `noKnownAllergy` flag, never confused with a `nullFlavor`.

Two safety-critical reconciliations stay conservative: a coded value that disagrees with its narrative
surfaces **both** (`CODE_NARRATIVE_MISMATCH`) and picks no winner, and a missing `doseQuantity` /
`routeCode` is preserved-as-absent and flagged, never silently defaulted.

## What it extracts (Phase 3) — discrete clinical data

- **Results** — Result Organizers via `getResults()`: the LOINC-coded analyte, the polymorphic
  observation `value` as a discriminated `ObservationValue` (`physicalQuantity` / `coded` / `string` /
  `range` / `unsupported`, selected by `xsi:type`), the `referenceRange` (structured `IVL_PQ` bounds,
  else free-text), and the `interpretation`.
- **Vital Signs** — Vital Signs Organizers via `getVitals()`: the same UCUM-checked `ObservationValue`
  machinery, no reference range.
- **Immunizations** — Immunization Activities via `getImmunizations()`: the CVX `vaccine`, `dose`,
  `route`, `effectiveTime`, and `statusCode`. A refusal (`negationInd="true"`) is a distinct `refused`
  flag (`IMMUNIZATION_REFUSED`), never confused with a `nullFlavor`.

Every physical quantity is checked against a **computable, zero-dependency UCUM grammar**
(`isValidUcumUnit`, `isUcumCaseSuspect`): a non-UCUM unit is flagged (`NON_UCUM_UNIT`) and a
letter-case slip caught (`UCUM_CASE_SUSPECT`), but the **raw unit is always preserved — never
normalized away**. An unrecognized `value xsi:type` is kept as `unsupported`; nothing is dropped.

## Serialize & round-trip (Phase 4)

The conservative _emit_ half of Postel's Law. `serializeCcda(doc)` (or `doc.toString()`) re-emits a
parsed document as spec-clean C-CDA XML with a guaranteed UTF-8 declaration:

```ts
import { parseCcda, serializeCcda } from "@cosyte/ccda";

const doc = parseCcda(xml);
const out = serializeCcda(doc); // === doc.toString()
```

- **Faithful, no silent loss.** The output is snapshotted from the parsed XML at parse time, not
  rebuilt from the read-model, so every attribute, namespace declaration (`xmlns` / `xmlns:xsi` /
  `xmlns:sdtc`), `templateId`, and unmodeled element survives. Serialization is a **fixed point** —
  `parseCcda(serializeCcda(doc))` re-serializes to the identical string.
- **Immutable copy-with.** Models are immutable; the sanctioned mutation is `doc.withWarnings(extra)`,
  which returns a **new** document with extra warnings appended, sharing every parsed field by
  reference and leaving the original untouched.

> A hand-constructed document (not produced by `parseCcda`) retains no source XML, so `toString()`
> throws — a document builder API lands in a later phase.

## What it extracts (Phase 5) — Procedures, Encounters, Social History

- **Procedures** — via `getProcedures()`: the three Procedure Activity templates — an
  altering/operative `<procedure>` (`…22.4.14`), a non-altering `<act>` service (`…22.4.12`), and an
  assessment `<observation>` (`…22.4.13`) — kept apart by a `kind` discriminant. **`moodCode` is
  safety-critical:** a performed procedure (`EVN`) and a planned/ordered one
  (`INT`/`RQO`/`PRMS`/`PRP`/`APT`/`ARQ`) become a `disposition` of `"performed"` vs `"planned"` and are
  **never conflated** — a missing mood is `PLANNED_VS_PERFORMED_AMBIGUOUS`, an unrecognized mood is
  `PROCEDURE_MOOD_UNEXPECTED`, both leaving `disposition` undefined rather than guessing.
- **Encounters** — via `getEncounters()`: the Encounter Activity (`…22.4.49`) — the visit type `code`,
  `statusCode`, and visit-period `effectiveTime`.
- **Social History — Smoking Status** — via `getSmokingStatus()`: the Smoking Status — Meaningful Use
  observation (`…22.4.78`). An explicitly-unknown status (a `nullFlavor` or an "unknown" SNOMED concept)
  sets `unknown: true` and emits `SMOKING_STATUS_UNKNOWN` — never silently read as "never smoked"; a
  value outside the Current Smoking Status value set is preserved and flagged
  `SMOKING_STATUS_CODE_UNRECOGNIZED`.

### Required-section validation

For a recognized `DocumentType`, a required (SHALL) catalog section that is absent surfaces a
`REQUIRED_SECTION_MISSING` **warning** — never a fatal, so a missing section never blocks reading the
data that _is_ present. `requiredSectionKeys(documentType)` and
`missingRequiredSections(documentType, presentKeys)` expose the table directly.

The table is **conservative**: it asserts only unconditional, in-catalog, high-confidence SHALL
constraints and deliberately omits choice constraints (`SHALL contain A OR B`), SHOULD/MAY sections,
and SHALL sections outside the recognized catalog (e.g. Hospital Course, Physical Exam). A document
type with an empty table therefore means _"no unconditional in-catalog SHALL section is asserted yet"_ —
not _"this type has no requirements"_. Broadening a table is additive and safe.

## What it extracts (Phase 5b) — the deferred clinical sections

- **Plan of Treatment** — via `getPlannedItems()`: the six planned-entry templates a Plan of Treatment
  section (`…22.2.10`) can carry — Planned Act (`…22.4.39`), Encounter (`…22.4.40`), Procedure
  (`…22.4.41`), Medication Activity (`…22.4.42`), Supply (`…22.4.43`), and Observation (`…22.4.44`) —
  kept apart by a `kind` discriminant. **Everything here is future/ordered, never performed:** each
  item's `moodCode` is read into the same performed-vs-planned `disposition` as Procedures (a planned
  mood → `"planned"`), and the two are **never conflated**; a missing/unrecognized mood leaves
  `disposition` undefined rather than guessing.
- **Functional Status** / **Mental Status** — via `getFunctionalStatus()` / `getMentalStatus()`: the
  Functional/Mental Status Observations (`…22.4.67` / `…22.4.74`), read whether standalone or clustered
  in a status Organizer (`…22.4.66` / `…22.4.75`), plus any Assessment Scale Observation (`…22.4.69`,
  flagged `assessmentScale`) inside such an organizer. Each finding is `domain`-tagged so the two are
  **never conflated**; a standalone assessment scale (whose domain can't be determined from its template
  alone) is deliberately not captured.
- **Family History** — via `getFamilyHistory()`: the Family History Organizer (`…22.4.45`) → Observation
  (`…22.4.46`) tree. The relative's identity (relationship, gender, birth time, `sdtc:deceasedInd`) is a
  structured `relative` (not flattened into each condition); each condition carries its coded `value`,
  an optional Age Observation (`…22.4.31`, age at onset), and a `causeOfDeath` flag from a Family History
  Death Observation (`…22.4.47`).
- **Past Medical History** — via `getPastMedicalHistory()`: the **bare** Problem Observations (`…22.4.4`)
  a Past Medical History section (`…22.2.20`) carries directly under each `<entry>` (not wrapped in a
  Problem Concern Act), reusing the Problems model — so a past problem never double-counts as an active
  one.

### Code systems & provenance

Slot validation (`checkCodeSlot`, exported OIDs `SNOMED_CT` / `RXNORM` / `ICD10_CM` / `NDC` / `UNII` /
`NCI_ROUTE` / …) is **structural recognition only** — it checks that a coded value's `@codeSystem` OID
is one expected for its slot and flags a deprecated (ICD-9) or unexpected terminology. It deliberately
does **not** verify that a code is a real member of its system: that needs licensed terminology
content (SNOMED CT / RxNorm via UMLS), which this suite never bundles. The OIDs themselves are public
identifiers, not redistributable code-system data — bring your own terminology service for membership
checks.

## Known limitations

- **Fourteen entry families (so far)** — Problems / Medications / Allergies / Results / Vital Signs /
  Immunizations / Procedures / Encounters / Social-History smoking status / Plan of Treatment /
  Functional Status / Mental Status / Family History / Past Medical History are extracted; any remaining
  sections still carry only identity and narrative.
- **UCUM validation is grammatical, on a curated atom subset** — the validator checks that a unit is
  well-formed UCUM (case-sensitive prefixes/atoms, `.`/`/` terms, `[…]` and `{…}` forms) against a
  curated table of the prefixes and atoms that appear in lab Results and Vital Signs, not the full
  UCUM atom registry. A valid but uncurated atom may read as `NON_UCUM_UNIT`; the raw unit is always
  preserved, so nothing is lost.
- **LOINC deprecation is a curated set** — `checkLoincDeprecation` flags a curated list of known
  deprecated LOINC codes, not every deprecation in the LOINC release. As with all code-system checks,
  this is recognition only — membership validation needs a licensed terminology service.
- **Serializer is round-trip emit, not a builder** — `serializeCcda` / `toString()` faithfully re-emit
  a _parsed_ document (the spec-clean emit half of Postel's Law); constructing or editing a document
  from scratch needs the builder API, which is a later phase.
- **No vendor profile system yet** — `getMrn()` selects the first `patientRole/id` extension; a
  profile-aware override is planned.

## The cosyte parser archetype

- **Postel's Law** — liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance** — Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes** — warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Near-zero dependencies** — one exact-pinned runtime dep (`@xmldom/xmldom`) for the XML substrate;
  healthcare integrations vet every dependency, so the cap is **≤ 3** justified deps.
- **PHI-safe diagnostics** — every warning/fatal message and position carries only structural locators
  (element names, OIDs, coded tokens, line/column); clinical values never reach a diagnostic.
- **Dual ESM + CJS** — built with `tsup`, validated with `attw`.
- **Immutability** — parsed models are immutable; mutation is via explicit methods.
- **Profile system** — a `defineProfile()` API for vendor quirks (to be added), with built-in
  profiles authored through the same public API.

## License

MIT © Cosyte
