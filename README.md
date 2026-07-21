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
> (`withWarnings`). A document **builder** (`buildCcda`) emits a spec-clean **CCD** or **Referral Note**
> with the US Realm header
> and populated **Problems, Allergies, Medications, Results, Vital Signs, Immunizations, Procedures,
> Encounters, Social-History smoking status, Functional Status, Mental Status, Past Medical History,
> Plan of Treatment** (planned entries, never conflated with performed), **and Family History**
> (organizer per relative, conditions with optional age-at-onset + cause-of-death) sections (each
> round-tripping through `parseCcda`). A document **editor** (`editCcda`) re-emits a parsed document
> with a section added or replaced — every untouched section preserved byte-for-byte — and stamps a
> CDA R2 revision (`relatedDocument` `RPLC` + `setId`/`versionNumber`). A **bring-your-own terminology
> adapter** (`parseCcda` / `buildCcda`'s optional `terminology` option) lets a consumer plug in their own
> licensed terminology service to semantically validate coded values — a rejected code is flagged
> (`SEMANTIC_CODE_INVALID`), never coerced. The other document types land in a later increment.

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

> A hand-constructed `CcdaDocument` (not produced by `parseCcda` or `buildCcda`) retains no source XML,
> so `toString()` throws. To construct a document from scratch, use the builder below.

## Build a document (Phase 7)

`buildCcda(init)` is the emit _factory_ symmetric with `parseCcda`: from structured input it assembles
a **spec-clean C-CDA R2.1** document and returns a real `CcdaDocument`. It emits either a **CCD**
(default) or a **Referral Note** (`documentType: "referralNote"`) — each with its own US Realm Header
specialization (document `templateId` + LOINC `code`) and document-type-specific SHALL section set. It
emits through the same DOM the parser reads, so a built document round-trips by construction — it parses
back to the same structured content, and `parseCcda(doc.toString()).toString() === doc.toString()`. A
clean build carries zero warnings.

A **Referral Note** carries the document `templateId` `2.16.840.1.113883.10.20.22.1.14` (R2.1
`2015-08-01`) and LOINC document `code` `57133-1`, and always emits its SHALL section set: the
entries-required **Problems**, **Allergies**, and **Medications** (empty `nullFlavor="NI"` when
unpopulated), plus the narrative **Reason for Referral** (`1.3.6.1.4.1.19376.1.5.3.1.3.1`, LOINC
`42349-1`, from the optional `reasonForReferral` string), **Assessment** (`…22.2.8`, LOINC `51848-0`,
unversioned — a root-only `templateId` with no `@extension` — from the optional `assessment` string),
and **Plan of Treatment** (`…22.2.10`, LOINC `18776-5`). Results and Vital Signs are not Referral Note
SHALL sections, so — unlike in a CCD — they are emitted only when the caller supplies them.

```ts
import { buildCcda, serializeCcda } from "@cosyte/ccda";

const doc = buildCcda({
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F", birthTime: "19800101" },
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
  allergies: [
    {
      allergen: { code: "7980", displayName: "Penicillin G" },
      reaction: { code: "247472004", displayName: "Hives" },
    },
    { noKnownAllergy: true }, // emitted as a negation, never as an "unknown"
  ],
  medications: [
    {
      drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" }, // RxNorm
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" }, // NCI Thesaurus
      frequency: { value: 24, unit: "h" }, // PIVL_TS period
    },
  ],
  results: [
    {
      code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
      results: [
        {
          test: { code: "2345-7", displayName: "Glucose" }, // LOINC
          quantity: { value: 95, unit: "mg/dL" }, // UCUM
          referenceRange: {
            low: { value: 70, unit: "mg/dL" },
            high: { value: 100, unit: "mg/dL" },
          },
          interpretation: { code: "N", displayName: "Normal" },
        },
      ],
    },
  ],
  vitalSigns: [
    {
      vitals: [
        {
          code: { code: "8480-6", displayName: "Systolic blood pressure" },
          quantity: { value: 120, unit: "mm[Hg]" },
        },
        {
          code: { code: "8462-4", displayName: "Diastolic blood pressure" },
          quantity: { value: 80, unit: "mm[Hg]" },
        },
      ],
    },
  ],
});

const xml = serializeCcda(doc); // spec-clean C-CDA R2.1
```

`buildCcda` emits the US Realm header (with a device author + custodian) and populated **Problems**,
**Allergies** (including the `negationInd` "No Known Allergies" form), **Medications** (RxNorm drug,
dose, `routeCode`, and the two `effectiveTime` timing siblings), **Results** (Result Organizer → Result
Observation with a UCUM `PQ` / coded / string value, reference range, interpretation), **Vital
Signs** (LOINC + UCUM), **Immunizations** (Immunization Activity → Immunization Medication
Information with a CVX vaccine, dose, route, and the SHALL administration `effectiveTime`),
**Procedures** (one of the three Procedure Activity variants — operative `<procedure>` / non-altering
`<act>` / assessment `<observation>` — with the performed-vs-planned `moodCode` split),
**Encounters** (Encounter Activity with a coded type and the SHALL `effectiveTime` visit period),
**Social History** (a Smoking Status — Meaningful Use observation with the fixed LOINC `code` and a
SNOMED CT `value`), **Functional Status** (a Functional Status Observation with the template-fixed
LOINC `code` `54522-8` and a SNOMED CT finding `value`, tagged `domain: "functional"`), and **Mental
Status** (a Mental Status Observation with the R2.1 template-fixed SNOMED CT `code` `373930000` and a
SNOMED CT finding `value`, tagged `domain: "mental"` — keyed off a distinct observation template root so
it is never conflated with Functional Status) — each status section can also carry **direct-entry
Assessment Scale Observations** (`…22.4.69`, the bare-root R2.1 form: a scored instrument such as a PHQ-9
or Glasgow Coma with a SHALL `INT` `value` score, an optional `interpretation`, and Assessment Scale
Supporting Observations `…22.4.86` as scored components; read back `assessmentScale`-flagged and
`domain`-tagged from its section, the score never fabricated) — and **Past Medical History** (historical problems as
**bare** Problem Observations `…22.4.4` directly under `<entry>`, **not** wrapped in a Problem Concern
Act — read back via `getPastMedicalHistory` and never double-counted as an active `getProblems`
concern), **Plan of Treatment** (the six planned-entry templates — Planned Act / Encounter / Procedure /
Medication Activity / Supply / Observation — each future/ordered with `statusCode` fixed to `active`,
read back via `getPlannedItems` as `disposition: "planned"` and never conflated with a performed
Procedure/Encounter), and **Family History** (a Family History Organizer `…22.4.45` per relative —
carrying the `relatedSubject` relationship (SNOMED CT), optional gender/birthTime/`sdtc:deceasedInd` —
with Family History Observations `…22.4.46` for each condition, optionally nesting an Age Observation
`…22.4.31` (age at onset) and a Family History Death Observation `…22.4.47` (cause of death); read back
via `getFamilyHistory`, grouped by relative). Safety-critical values are never guessed: an omitted medication dose/route
is left absent so the parser flags it (rather than being defaulted), a `PQ` unit is emitted verbatim and
re-checked against the computable UCUM grammar, a **refused** immunization is emitted as
`negationInd="true"` (flagged `IMMUNIZATION_REFUSED` on re-parse) never conflated with a `nullFlavor`
"unknown", a **planned** procedure is emitted as `moodCode="INT"` so the parser never reads it as
performed, and an unrecorded smoking-status / functional-status `value` is emitted as an explicit
`nullFlavor="UNK"` rather than defaulted to a real finding. A Problem or Allergy concern accepts an
`onset` and (on a `status: "resolved"` concern) a `resolution` date — filling the `effectiveTime`
`low`/`high` on the Concern Act and its observation; the `high` (whose presence itself asserts the
condition is resolved, per Problem Observation `…22.4.4`) is emitted only for a resolved concern —
`buildCcda` throws on a `resolution` without `status: "resolved"`, and a resolved-but-undated concern
keeps the `nullFlavor="UNK"` high, never a fabricated date. Each CCD SHALL section for which no content
is supplied is emitted as a spec-clean empty `nullFlavor="NI"` section; the non-required Immunizations /
Procedures / Encounters / Social History / Functional Status / Mental Status / Past Medical History /
Plan of Treatment / Family History sections are emitted only when populated. The builder now emits two of
the twelve document types (**CCD** and **Referral Note**); the remaining ten land in a later increment.
`buildCcda(init, { terminology })` accepts an optional bring-your-own terminology adapter (see "Code
systems & provenance") — every code is still emitted verbatim; the adapter can only flag, never coerce.

## Edit a document (Phase 7)

`editCcda(doc, options)` is the read→edit→write loop: it takes a document from `parseCcda` and re-emits
it with a section **added** or **replaced**, returning the re-parsed document. It rebuilds only the
targeted section (through the same emitters `buildCcda` uses) and carries every other section through
**byte-for-byte** — including content this library never models.

```ts
import { parseCcda, editCcda } from "@cosyte/ccda";

const revised = editCcda(parseCcda(xml), {
  sections: [
    // Replace the whole Medications section…
    {
      kind: "medications",
      mode: "replace",
      content: [{ drug: { code: "314076", displayName: "Lisinopril 10 MG" } }],
    },
    // …and add a section the source did not have.
    {
      kind: "familyHistory",
      content: [
        {
          relative: { relationship: { code: "72705000", displayName: "Mother" } },
          observations: [{ condition: { code: "73211009", displayName: "Diabetes mellitus" } }],
        },
      ],
    },
  ],
});

revised.header.versionNumber; // 2 — a CDA R2 revision of the source
revised.header.relatedDocuments[0]?.typeCode; // "RPLC"
```

By default an edit stamps a **CDA R2 revision**: a new `ClinicalDocument.id`, the same version-series
`setId` (minted when absent), an incremented `versionNumber`, and a `relatedDocument typeCode="RPLC"`
naming the prior version — inserted at their CDA R2 XSD sequence positions, and surfaced back on the
parsed header (`setId` / `versionNumber` / `relatedDocuments`). Pass `revision: false` to edit in place.
A source with no `ClinicalDocument.id` cannot be revised — the RPLC link's `parentDocument.id` is a CDA
R2 SHALL (1..\*) and there is no prior-version id to name — so `editCcda` throws
`CcdaEditError` (`SOURCE_MISSING_ID`) rather than fabricate one; use `revision: false` to edit it in place.

It is fail-safe: an unedited section is carried by reference (never dropped), an empty content list
emits a spec-clean `nullFlavor="NI"` shell (never fabricated entries), and an edit that would drop a
SHALL required section throws a typed `CcdaEditError`. `mode` is `"add"` (require absent), `"replace"`
(require present), or `"upsert"` (default — replace-or-add). Editing supports whole-section add/replace
across the twelve single-list section kinds; entry-level append that byte-preserves a section's other
entries (use a `replace` with the full entry set), section removal, and the `APND`/`XFRM` relationships
land in a later increment.

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
not _"this type has no requirements"_. Broadening a table is additive and safe. The **Referral Note**
now asserts **Reason for Referral** alongside Problems, Allergies, and Medications (traced to the
normative R2.1 Schematron, CONF:1198-30925) — that section became a recognized catalog key, so the
SHALL check no longer stays silent when a Referral Note omits it. Its Assessment/Plan requirement
stays out (a choice constraint), as do its Results and Plan of Treatment sections (SHOULD, not SHALL).

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
  in a status Organizer (`…22.4.66` / `…22.4.75`), plus **direct-entry Assessment Scale Observations**
  (`…22.4.69`, flagged `assessmentScale`) — the conformant C-CDA R2.1 placement — with their scored
  Assessment Scale Supporting Observations (`…22.4.86`) on `supporting` and the total score read as an
  `integer` (`xsi:type="INT"`) value. Each finding is `domain`-tagged **from its carrying section**, so
  the two are **never conflated** (the same scale OID appears in both sections — the section, not the
  template, fixes the domain); a scale in a section that is neither functional nor mental is not captured
  (its domain is unknowable, never guessed). A scale mis-nested inside an organizer is still read
  leniently.
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

**Bring-your-own terminology adapter (semantic validation).** For that last tier, `parseCcda` and
`buildCcda` accept an optional `terminology` adapter — a small, dependency-free interface
(`TerminologyAdapter`) you implement over your own licensed terminology service. `@cosyte/ccda` imports
no terminology library; it only calls the adapter you supply, and only when supplied (absent → the
recognize-only behavior above). Its shape mirrors the FHIR Terminology Module (`$validate-code`,
`$translate`) and the sibling `@cosyte/terminology` engine, so you can wire that in behind it:

```ts
import { parseCcda, type TerminologyAdapter } from "@cosyte/ccda";

const adapter: TerminologyAdapter = {
  // system is the C-CDA @codeSystem OID exactly as the document carries it.
  validateCode: (coding) =>
    coding.system === "2.16.840.1.113883.6.96" // SNOMED CT
      ? { result: mySnomedService.has(coding.code) }
      : undefined, // no opinion on other systems → no warning
};

const doc = parseCcda(xml, { terminology: adapter });
// A structurally-valid but non-member code now carries SEMANTIC_CODE_INVALID —
// surfaced verbatim, never rewritten to a "corrected" value.
```

The adapter can only ever **report**: a `validateCode` verdict of `{ result: false }` raises
`SEMANTIC_CODE_INVALID` with the code preserved verbatim (never coerced); `undefined` means "no
opinion" (silent).

The interface also declares an optional `translate` (`$translate`) method. `buildCcda` consults it at
each clinical coded slot (problem value, allergen, medication drug + route, vaccine + route) and emits
any returned coding as a spec-clean CDA R2 `<translation>` alternate **beside** the primary code — an
_additional_ coding, never a substitution:

```ts
import { buildCcda, type TerminologyAdapter } from "@cosyte/ccda";

const adapter: TerminologyAdapter = {
  validateCode: () => ({ result: true }),
  // Map a SNOMED problem to an ICD-10-CM alternate; empty matches ⇒ unmapped (never fabricated).
  translate: (coding) =>
    coding.code === "38341003" // Hypertension (SNOMED CT)
      ? {
          matches: [
            { system: "2.16.840.1.113883.6.90", code: "I10", display: "Essential hypertension" },
          ],
        }
      : { matches: [] },
};

const doc = buildCcda(init, { terminology: adapter });
// The problem <value> now carries a <translation> alongside its verbatim SNOMED code;
// parseCcda reads the primary code unchanged and surfaces the alternate in CD.translation.
```

Here too the adapter can only ever **add**: `translate` returning `undefined` (no opinion) or an empty
`matches` (unmapped) emits no `<translation>` and leaves output byte-identical, and the primary code is
never rewritten to satisfy it.

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
- **Serializer re-emits a parsed document; the builder constructs one** — `serializeCcda` / `toString()`
  faithfully re-emit a _parsed_ document (the spec-clean emit half of Postel's Law). To construct a
  document from scratch, `buildCcda` emits a spec-clean **CCD** or **Referral Note**
  (`documentType: "referralNote"`) with the US Realm header + **Problems,
  Allergies, Medications, Results, Vital Signs, Immunizations, Procedures, and Encounters** (the last
  three emitted only when populated, since none is a CCD SHALL section) — a Referral Note additionally
  specializes the header and emits its own SHALL set (Reason for Referral, Assessment, Plan of Treatment);
  the remaining ten document types and editing an existing document are a later increment. "Spec-clean" here means well-formed,
  correctly-templated, and **round-tripping** through `parseCcda` with zero warnings. Every entry now
  emits the `SHALL`-cardinality `effectiveTime` its C-CDA R2.1 template requires — the Problems/Allergies
  concern acts + observations, the Medication Activity `IVL_TS` duration, and the Results/Vital Signs
  organizers + observations. When the caller supplied a time it is used; when a `SHALL` requires the
  element but no time is known the slot is `nullFlavor="UNK"` (satisfying the cardinality without inventing
  a clinical time, read back as absent), the same fail-safe as the header's `SHALL` `addr`/`telecom` and
  the never-guessed `dose`/`route`. **Residual (not yet closed):** the builder does not assert full XSD
  element-order or the complete Schematron rule set, and this gap was grounded against the raw C-CDA R2.1
  IG text rather than a validator run — no external C-CDA/Schematron IG validator was reachable in the
  build environment — so a `buildCcda` document is expected-but-not-proven to pass an external IG
  validator. The reaction/severity/criticality sub-observations' optional (`0..1`, non-`SHALL`)
  `effectiveTime` is not emitted.
- **Vendor profiles tolerate, they never relax safety** — a `CcdaProfile` only downgrades the
  **non-safety-critical** deviations it expects (re-badged `PROFILE_QUIRK_APPLIED`, flagged
  `expected`); it can never tolerate a dose/allergen/unit/identity/code-system warning (refused at
  `defineCcdaProfile()` time) and never changes an extracted value. Two built-ins ship
  (`ccdaProfiles.smartScorecard`, `ccdaProfiles.legacyR11`), each grounded in a cited public source;
  named per-vendor profiles await a real vendor-attributed grounding document (ADR 0018).

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
- **Profile system** — a `defineCcdaProfile()` API for vendor/conformance quirks, with a
  provenance-backed registry (`ccdaProfiles`) of built-ins authored through the same public API. A
  safety gate refuses any profile that tries to tolerate a safety-critical warning code.

## License

MIT © Cosyte
