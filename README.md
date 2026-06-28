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

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. Through **Phase 3** the parser ships
> document recognition, the US Realm header + patient demographics, section framing, the
> reconciliation triad (Problems / Medications / Allergies), and the discrete-data families
> (Results / Vital Signs / Immunizations) with a computable UCUM unit check. A spec-clean serializer
> lands in a later phase.

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

### Code systems & provenance

Slot validation (`checkCodeSlot`, exported OIDs `SNOMED_CT` / `RXNORM` / `ICD10_CM` / `NDC` / `UNII` /
`NCI_ROUTE` / …) is **structural recognition only** — it checks that a coded value's `@codeSystem` OID
is one expected for its slot and flags a deprecated (ICD-9) or unexpected terminology. It deliberately
does **not** verify that a code is a real member of its system: that needs licensed terminology
content (SNOMED CT / RxNorm via UMLS), which this suite never bundles. The OIDs themselves are public
identifiers, not redistributable code-system data — bring your own terminology service for membership
checks.

## Known limitations

- **Six entry families (so far)** — Problems / Medications / Allergies / Results / Vital Signs /
  Immunizations are extracted; the remaining sections (Procedures, Encounters, …) still carry only
  identity and narrative.
- **UCUM validation is grammatical, on a curated atom subset** — the validator checks that a unit is
  well-formed UCUM (case-sensitive prefixes/atoms, `.`/`/` terms, `[…]` and `{…}` forms) against a
  curated table of the prefixes and atoms that appear in lab Results and Vital Signs, not the full
  UCUM atom registry. A valid but uncurated atom may read as `NON_UCUM_UNIT`; the raw unit is always
  preserved, so nothing is lost.
- **LOINC deprecation is a curated set** — `checkLoincDeprecation` flags a curated list of known
  deprecated LOINC codes, not every deprecation in the LOINC release. As with all code-system checks,
  this is recognition only — membership validation needs a licensed terminology service.
- **No serializer/builder yet** — parse only; the spec-clean emit half of Postel's Law is a later phase.
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
