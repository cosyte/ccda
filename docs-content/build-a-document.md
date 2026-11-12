---
id: build-a-document
title: Build a document
sidebar_label: Build a document
description: "Build a spec-clean C-CDA R2.1 CCD, Referral Note, Discharge Summary, Progress Note, History and Physical or Consultation Note from structured data, with no hand-written XML."
---

# Build a document

You have structured clinical data (a patient, some problems, some allergies) and need a valid C-CDA
document to send, without hand-writing XML or memorizing templateIds.

## Build a CCD

`buildCcda(init)` is the emit _factory_ symmetric with `parseCcda`. It emits through the same DOM the
parser reads, so a built document round-trips by construction and a clean build carries zero warnings.

```ts runnable
import { buildCcda, serializeCcda, parseCcda } from "@cosyte/ccda";

const doc = buildCcda({
  patient: { mrn: "MRN-00042", given: ["Jane"], family: "Doe", gender: "F", birthTime: "19800101" },
  problems: [
    { problem: { code: "59621000", displayName: "Essential hypertension" }, status: "active" },
  ],
  allergies: [
    {
      allergen: { code: "7980", displayName: "Penicillin G" },
      reaction: { code: "247472004", displayName: "Hives" },
    },
    { noKnownAllergy: true }, // a negation, never an "unknown"
  ],
});

doc.getMrn(); // => "MRN-00042"
doc.getProblems().length; // => 1
doc.warnings.length; // => 0

// Round-trips by construction: re-parsing the emitted XML is a fixed point.
const out = serializeCcda(doc);
parseCcda(out).toString() === out; // => true
```

`buildCcda` populates the reconciliation triad (Problems, Allergies, Medications) plus the
discrete-data families: Results, Vital Signs, and **Immunizations**. A vaccine is coded with CVX;
its dose and route are emitted only when supplied (never guessed), and a **refused** shot is a
`negationInd` record the parser reads back distinctly, never confused with an "unknown":

```ts runnable
import { buildCcda } from "@cosyte/ccda";

const doc = buildCcda({
  patient: { mrn: "MRN-00042" },
  immunizations: [
    {
      vaccine: {
        code: "140",
        displayName: "Influenza, split virus, trivalent, injectable, preservative free",
      }, // CVX
      dose: { value: 0.5, unit: "mL" }, // UCUM
      route: { code: "C28161", displayName: "Intramuscular" }, // NCI Thesaurus
      effectiveTime: "20240101",
    },
    // A refused shot: emitted as negationInd="true", flagged IMMUNIZATION_REFUSED, never an "unknown".
    {
      vaccine: {
        code: "140",
        displayName: "Influenza, split virus, trivalent, injectable, preservative free",
      },
      refused: true,
    },
  ],
});

doc.getImmunizations()[0]?.vaccine?.code; // => "140"
doc.getImmunizations()[1]?.refused; // => true
doc.warnings.map((w) => w.code).includes("IMMUNIZATION_REFUSED"); // => true
```

`buildCcda` also emits **Procedures** and **Encounters** when supplied. A procedure's
`disposition` sets the performed-vs-planned `moodCode` (`performed` → `EVN`, `planned` → `INT`). The
parser reads it back distinctly, so a _planned_ procedure is never reported as performed. An
encounter carries its coded type (CPT by default) and a visit period:

```ts runnable
import { buildCcda } from "@cosyte/ccda";

const doc = buildCcda({
  patient: { mrn: "MRN-00042" },
  procedures: [
    {
      code: { code: "80146002", displayName: "Appendectomy" }, // SNOMED CT
      disposition: "performed",
      effectiveTime: "20230615",
    },
    // A planned colonoscopy: moodCode="INT", read back as disposition "planned".
    { code: { code: "73761001", displayName: "Colonoscopy" }, disposition: "planned" },
  ],
  encounters: [
    {
      type: { code: "99213", displayName: "Office outpatient visit 15 minutes" }, // CPT
      period: { low: "20230615", high: "20230615" },
    },
  ],
});

doc.getProcedures()[0]?.disposition; // => "performed"
// A planned procedure is never read as performed:
doc.getProcedures()[1]?.disposition; // => "planned"
doc.getEncounters()[0]?.code?.code; // => "99213"
doc.warnings.length; // => 0
```

`buildCcda` also emits a **Social History** section carrying **Smoking Status** observations when
supplied. A known status is a SNOMED CT concept from the Current Smoking Status value set. An
_unknown_ status is never guessed: omit `value` and the builder emits an explicit `nullFlavor="UNK"`,
which the parser reads back as `unknown`, absent status is never read as "never smoker":

```ts runnable
import { buildCcda } from "@cosyte/ccda";

const doc = buildCcda({
  patient: { mrn: "MRN-00042" },
  smokingStatus: [
    { value: { code: "8517006", displayName: "Former smoker" }, effectiveTime: "20240101" }, // SNOMED CT
    {}, // status not recorded → an EXPLICIT nullFlavor="UNK", never invented as a reading
  ],
});

doc.getSmokingStatus()[0]?.value?.code; // => "8517006"
doc.getSmokingStatus()[0]?.unknown; // => false
// A missing status is surfaced as unknown, not defaulted to a value:
doc.getSmokingStatus()[1]?.unknown; // => true
```

> Current builder scope: `buildCcda` emits a **CCD** (the default), a **Referral Note**
> (`documentType: "referralNote"`), an inpatient **Discharge Summary**
> (`documentType: "dischargeSummary"`), a **Progress Note** (`"progressNote"`), a **History and
> Physical** (`"historyAndPhysical"`) or a **Consultation Note** (`"consultationNote"`). A CCD carries the US Realm header, the six CCD SHALL sections
> (Problems, Allergies, Medications, Results, Vital Signs, and **Social History** (Smoking Status),
> emitted empty as `nullFlavor="NI"` when no
> content is supplied), and **Immunizations**, **Procedures**, **Encounters**,
> **Functional Status**, **Mental Status** (each carrying standalone findings,
> Functional/Mental Status Organizers, and **direct-entry Assessment Scale Observations** `…22.4.69` with
> their Supporting Observations `…22.4.86` and an `INT` score), **Past Medical History**, **Plan of
> Treatment** (planned entries, never conflated with performed), and **Family History** (a Family
> History Organizer per relative, with conditions carrying optional age-at-onset + cause-of-death)
> sections when populated. A Referral Note specializes the header and always emits Problems,
> Allergies, Medications, **Reason for Referral**, **Assessment**, and Plan of Treatment, which makes
> Results, Vital Signs, and Social History populated-only. A Discharge Summary specializes it again
> and always emits Allergies, **Hospital Course**, **Discharge Diagnosis**, and Plan of Treatment,
> plus the `componentOf/encompassingEncounter` frame its template requires. The three office-visit
> types are described in [their own recipe](#build-a-progress-note-a-history-and-physical-or-a-consultation-note).
> All six accept an optional bring-your-own `terminology` adapter. The other six US Realm document
> types are not implemented.

## Build a CCD with medications, results and vital signs

```ts runnable
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
xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'); // => true
doc.documentType; // => "ccd"
doc.getMedications()[0]?.drug?.code; // => "314076"
doc.getAllergies()[1]?.allergies[0]?.noKnownAllergy; // => true
doc.warnings.length; // => 0
```

## Build a Discharge Summary, with its encounter frame

`BuildableDocumentType` is the union of the six types `buildCcda` emits (`"ccd"`,
`"referralNote"`, `"dischargeSummary"`, `"progressNote"`, `"historyAndPhysical"`,
`"consultationNote"`); ask for any other type and you get a `TypeError` naming what you asked for,
never a document that merely resembles it.

A Discharge Summary carries one more thing than a CCD or a Referral Note: the encounter it
summarizes.
Supply the period and the discharge disposition through `encompassingEncounter`, a
`BuildCcdaEncompassingEncounter`. Any slot you leave out is emitted as an explicit
`nullFlavor="UNK"` and reparses as absent, never as a guessed date or a guessed disposition; an
admission date, a discharge date, and a discharge disposition are each facts a clinician acts on.

```ts runnable
import { buildCcda } from "@cosyte/ccda";

const summary = buildCcda({
  documentType: "dischargeSummary",
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
  hospitalCourse: "Admitted for observation. Uneventful course, discharged home.",
  dischargeDiagnoses: [
    { problem: { code: "59621000", displayName: "Essential hypertension" }, onset: "20240102" },
  ],
  encompassingEncounter: {
    period: { low: "20240102", high: "20240108" },
    // `codeSystem` defaults to the NUBC UB-04 Patient Discharge Status code set.
    dischargeDisposition: { code: "01", displayName: "Discharged to Home or Self Care" },
  },
});

summary.header.encompassingEncounter?.effectiveTime?.low?.raw; // => "20240102"
summary.header.encompassingEncounter?.dischargeDispositionCode?.code; // => "01"
summary.warnings.length; // => 0
summary.findSection("hospitalCourse")?.narrativeText; // => "Admitted for observation. Uneventful course, discharged home."
```

> **A Discharge Summary reparses with zero warnings, and its Hospital Course is recognized but not
> required.** The SHALL Hospital Course Section is an IHE PCC template the parser recognizes by its
> root, so `findSection("hospitalCourse")` resolves. The parser does not assert it as a required
> section, so a reparse will not report it MISSING from a document that lacks it: the conformance
> run in our repository (`pnpm conformance`) is the check on its presence.
>
> **What you supply is emitted or refused.** `problems` and `medications` are emitted when you pass
> them (the medications in the Medications Section, not the Discharge Medications Section). Passing
> `assessment` or `reasonForReferral`, which a Discharge Summary does not carry, throws a
> `TypeError`, as does passing `hospitalCourse` or `dischargeDiagnoses` to any other type, or
> `encompassingEncounter` to a CCD or a Referral Note.

## Build a Progress Note, a History and Physical or a Consultation Note

The three office-visit types each carry their own document `templateId` (R2.1 `2015-08-01`) and
LOINC document `code`: a **Progress Note** `2.16.840.1.113883.10.20.22.1.9` with `11506-3`, a
**History and Physical** `2.16.840.1.113883.10.20.22.1.3` with `34117-2`, and a **Consultation
Note** `2.16.840.1.113883.10.20.22.1.4` with `11488-4`. Each always emits the sections its rule
requires, an empty `nullFlavor="NI"` section for each you leave out:

- **Progress Note**: Assessment and Plan of Treatment, the pair that meets its Assessment/Plan
  choice (CONF:1198-30657). It requires no other section.
- **History and Physical**: Allergies, Family History, General Status, Past Medical History,
  Medications, Physical Exam, Results, Review of Systems, Social History and Vital Signs, plus Chief
  Complaint and Reason for Visit, Assessment and Plan of Treatment for its two choices.
- **Consultation Note**: History of Present Illness, Allergies, Problems, Reason for Referral,
  Assessment and Plan of Treatment.

The narratives are plain strings: `historyOfPresentIllness`, `chiefComplaintAndReasonForVisit`,
`reviewOfSystems`, `physicalExam` and `generalStatus`, beside `assessment` and (for a Consultation
Note) `reasonForReferral`. A Progress Note or a Consultation Note emits one it does not require only
when you supply it. A CCD, a Referral Note or a Discharge Summary refuses all five with a
`TypeError`.

Each of the three carries the `componentOf/encompassingEncounter` frame its rule requires. The
period start you supply is emitted, and an omitted one is `nullFlavor="UNK"`; the end and a
discharge disposition are emitted only when you supply them. A Progress Note's encounter also
carries the `location/healthCareFacility` its rule requires, and a Consultation Note carries the
`inFulfillmentOf/order` its rule requires. The builder takes no facility or order input, so both ids
are `nullFlavor="UNK"` rather than invented.

```ts runnable
import { buildCcda } from "@cosyte/ccda";

const hp = buildCcda({
  documentType: "historyAndPhysical",
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
  chiefComplaintAndReasonForVisit: "Headaches for two weeks.",
  physicalExam: "Alert, no distress. Heart regular. Lungs clear.",
  assessment: "Tension-type headache.",
  pastMedicalHistory: [
    { problem: { code: "59621000", displayName: "Essential hypertension" }, onset: "20150101" },
  ],
  encompassingEncounter: { period: { low: "20240102" } },
});

hp.documentType; // => "historyAndPhysical"
hp.warnings.length; // => 0
hp.sections.length; // => 13
hp.findSection("physicalExam")?.narrativeText; // => "Alert, no distress. Heart regular. Lungs clear."
hp.findSection("reviewOfSystems")?.narrativeText; // => "No information"
hp.getPastMedicalHistory()[0]?.value?.code; // => "59621000"
hp.header.encompassingEncounter?.effectiveTime?.low?.raw; // => "20240102"

const consult = buildCcda({
  documentType: "consultationNote",
  patient: { mrn: "MRN001" },
  historyOfPresentIllness: "Referred for blood pressure above goal on two agents.",
  reasonForReferral: "Evaluation of resistant hypertension.",
});

consult.documentType; // => "consultationNote"
consult.warnings.length; // => 0
consult.findSection("historyOfPresentIllness")?.narrativeText; // => "Referred for blood pressure above goal on two agents."
```

> **Recognized, and not all asserted.** The parser recognizes every section these types emit, so
> each reparses with zero warnings. The History and Physical's General Status, Physical Exam and
> Review of Systems sections are recognized by their roots but not asserted as required, so a reparse
> will not report one missing; the conformance run in our repository (`pnpm conformance`) is the
> check on their presence.

## Build a Referral Note

A **Referral Note** carries the document `templateId` `2.16.840.1.113883.10.20.22.1.14` (R2.1
`2015-08-01`) and LOINC document `code` `57133-1`, and always emits six sections: its SHALL
entries-required **Problems**, **Allergies**, and **Medications** (empty `nullFlavor="NI"` when
unpopulated), the narrative SHALL **Reason for Referral** (`1.3.6.1.4.1.19376.1.5.3.1.3.1`, LOINC
`42349-1`, from the optional `reasonForReferral` string), and **Assessment** (`…22.2.8`, LOINC
`51848-0`, unversioned, a root-only `templateId` with no `@extension`, from the optional `assessment`
string) with **Plan of Treatment** (`…22.2.10`, LOINC `18776-5`), the pair that satisfies its
Assessment/Plan choice (CONF:1198-29102). Results, Vital Signs, and Social History are
not Referral Note SHALL sections, so, unlike in a CCD, they are emitted only when the caller supplies
them.

```ts runnable
import { buildCcda } from "@cosyte/ccda";

const referral = buildCcda({
  documentType: "referralNote",
  patient: { mrn: "MRN-00042", given: ["Jane"], family: "Doe", gender: "F" },
  reasonForReferral: "Evaluation of persistent hypertension.",
  assessment: "Blood pressure above goal on one agent.",
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
});

referral.documentType; // => "referralNote"
referral.findSection("reasonForReferral")?.narrativeText; // => "Evaluation of persistent hypertension."
referral.findSection("assessment")?.narrativeText; // => "Blood pressure above goal on one agent."
referral.warnings.length; // => 0
```

## What the builder emits

`buildCcda` emits the US Realm header (with a device author + custodian) and populated **Problems**,
**Allergies** (including the `negationInd` "No Known Allergies" form), **Medications** (RxNorm drug,
dose, `routeCode`, and the two `effectiveTime` timing siblings), **Results** (Result Organizer → Result
Observation with a UCUM `PQ` / coded / string value, reference range, interpretation), **Vital
Signs** (LOINC + UCUM), **Immunizations** (Immunization Activity → Immunization Medication
Information with a CVX vaccine, dose, route, and the SHALL administration `effectiveTime`),
**Procedures** (one of the three Procedure Activity variants: operative `<procedure>` / non-altering
`<act>` / assessment `<observation>`, with the performed-vs-planned `moodCode` split),
**Encounters** (Encounter Activity with a coded type and the SHALL `effectiveTime` visit period),
**Social History** (a Smoking Status (Meaningful Use) observation with the fixed LOINC `code` and a
SNOMED CT `value`), **Functional Status** (a Functional Status Observation with the template-fixed
LOINC `code` `54522-8` and a SNOMED CT finding `value`, tagged `domain: "functional"`), and **Mental
Status** (a Mental Status Observation with the R2.1 template-fixed SNOMED CT `code` `373930000` and a
SNOMED CT finding `value`, tagged `domain: "mental"`, keyed off a distinct observation template root so
it is never conflated with Functional Status). Each status section can also carry **direct-entry
Assessment Scale Observations** (`…22.4.69`, the bare-root R2.1 form: a scored instrument such as a PHQ-9
or Glasgow Coma with a SHALL `INT` `value` score, an optional `interpretation`, and Assessment Scale
Supporting Observations `…22.4.86` as scored components; read back `assessmentScale`-flagged and
`domain`-tagged from its section, the score never fabricated). It also emits **Past Medical History** (historical problems as
**bare** Problem Observations `…22.4.4` directly under `<entry>`, **not** wrapped in a Problem Concern
Act, read back via `getPastMedicalHistory` and never double-counted as an active `getProblems`
concern), **Plan of Treatment** (the seven planned-entry templates: Planned Act / Encounter / Procedure /
Medication Activity / Supply / Observation / Immunization Activity, each future/ordered with
`statusCode` fixed to `active`, read back via `getPlannedItems` as `disposition: "planned"` and never
conflated with a performed Procedure/Encounter; the immunization variant's `effectiveTime` is required
rather than optional, because its template makes it `[1..1]`. Planned Medication Activity is
`[1..1]` too (CONF:1098-30468) and its builder input still types the field as optional, so a planned
medication can be built short that element. **That omission is now reported rather than silent**: the
returned document carries `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, appended after the re-parse's
warnings. The field stays optional on purpose, because requiring it would break a published input
type, and the builder still emits exactly what it was given: no date is fabricated, no `nullFlavor` is
invented, and the emitted XML is byte-identical to what it was before the diagnostic existed. This is
one of the two warnings only the **emit side** raises (the other is `MISSING_SELF_CARE_ACTIVITY`,
under [Known limitations](./limitations.md)): re-parsing the same document says nothing.
**`editCcda` raises it too**, on the sections that edit grafted, so a planned medication written in
by an edit is no longer emitted short that element in silence.
The five non-`substanceAdministration` variants are genuinely `[0..1]` and
stay silent), and
**Family History** (a Family History Organizer `…22.4.45` per relative,
carrying the `relatedSubject` relationship (SNOMED CT), optional gender/birthTime/`sdtc:deceasedInd`,
with Family History Observations `…22.4.46` for each condition, optionally nesting an Age Observation
`…22.4.31` (age at onset) and a Family History Death Observation `…22.4.47` (cause of death); read back
via `getFamilyHistory`, grouped by relative). Safety-critical values are never guessed: an omitted medication dose/route
is left absent so the parser flags it (rather than being defaulted), a `PQ` unit is emitted verbatim and
re-checked against the computable UCUM grammar, a **refused** immunization is emitted as
`negationInd="true"` (flagged `IMMUNIZATION_REFUSED` on re-parse) never conflated with a `nullFlavor`
"unknown", a **planned** procedure is emitted as `moodCode="INT"` so the parser never reads it as
performed, and an unrecorded smoking-status / functional-status `value` is emitted as an explicit
`nullFlavor="UNK"` rather than defaulted to a real finding. A Problem or Allergy concern accepts an
`onset` and (on a `status: "resolved"` concern) a `resolution` date, filling the `effectiveTime`
`low`/`high` on the Concern Act and its observation; the `high` (whose presence itself asserts the
condition is resolved, per Problem Observation `…22.4.4`) is emitted only for a resolved concern.
`buildCcda` throws on a `resolution` without `status: "resolved"`, and a resolved-but-undated concern
keeps the `nullFlavor="UNK"` high, never a fabricated date. Each CCD SHALL section for which no content
is supplied is emitted as a spec-clean empty `nullFlavor="NI"` section; the non-required Immunizations /
Procedures / Encounters / Functional Status / Mental Status / Past Medical History /
Plan of Treatment / Family History sections are emitted only when populated. The builder emits six of
the twelve document types (**CCD**, **Referral Note**, inpatient **Discharge Summary**, **Progress
Note**, **History and Physical**, and **Consultation Note**); the other six are **not implemented**,
and any
other `documentType` throws a `TypeError` rather than emitting something that merely resembles the type
you asked for. Any C-CDA section outside the set listed above cannot be built at all.
`buildCcda(init, { terminology })` accepts an optional bring-your-own terminology adapter (see [Code
systems and provenance](./code-systems.md)). Every code is still emitted verbatim; the adapter can only flag, never coerce.

## Reference

- [`buildCcda`](./api/README.md#buildccda), its input [`BuildCcdaInit`](./api/README.md#buildccdainit)
  and options [`BuildCcdaOptions`](./api/README.md#buildccdaoptions).
- [`BuildableDocumentType`](./api/README.md#buildabledocumenttype) and
  [`BuildCcdaEncompassingEncounter`](./api/README.md#buildccdaencompassingencounter).

## Related

- [Edit a document](./edit-a-document.md), to change a section of a document you already have.
- [Known limitations](./limitations.md#building-a-document) lists every boundary of the builder.
