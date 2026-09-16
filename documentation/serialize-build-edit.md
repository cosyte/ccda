# Serialize, build and edit, in full

The emit half of this package: re-emitting a parsed document, building one from structured
input, and editing a section of one you already parsed. Moved out of `README.md` so the front
page stays short enough to read in one sitting. Nothing is rewritten: the headings and the
prose below are the ones `README.md` carried, at the heading levels it used, and `README.md`
links here from each heading the text left behind.

## Serialize & round-trip

The conservative _emit_ half of Postel's Law. `serializeCcda(doc)` (or `doc.toString()`) re-emits a
parsed document as spec-clean C-CDA XML with a guaranteed UTF-8 declaration:

```ts
import { parseCcda, serializeCcda } from "@cosyte/ccda";

const doc = parseCcda(xml);
const out = serializeCcda(doc); // === doc.toString()
```

- **Faithful, no silent loss.** The output is snapshotted from the parsed XML at parse time, not
  rebuilt from the read-model, so every attribute, namespace declaration (`xmlns` / `xmlns:xsi` /
  `xmlns:sdtc`), `templateId`, and unmodeled element survives. Serialization is a **fixed point**:
  `parseCcda(serializeCcda(doc))` re-serializes to the identical string.
- **Immutable copy-with.** Models are immutable; the sanctioned mutation is `doc.withWarnings(extra)`,
  which returns a **new** document with extra warnings appended, sharing every parsed field by
  reference and leaving the original untouched.

> A hand-constructed `CcdaDocument` (not produced by `parseCcda` or `buildCcda`) retains no source XML,
> so `toString()` throws. To construct a document from scratch, use the builder below.

## Build a document

`buildCcda(init)` is the emit _factory_ symmetric with `parseCcda`: from structured input it assembles
a **spec-clean C-CDA R2.1** document and returns a real `CcdaDocument`. It emits either a **CCD**
(default) or a **Referral Note** (`documentType: "referralNote"`): each with its own US Realm Header
specialization (document `templateId` + LOINC `code`) and document-type-specific SHALL section set. It
emits through the same DOM the parser reads, so a built document round-trips by construction: it parses
back to the same structured content, and `parseCcda(doc.toString()).toString() === doc.toString()`. A
clean build carries zero warnings.

A **Referral Note** carries the document `templateId` `2.16.840.1.113883.10.20.22.1.14` (R2.1
`2015-08-01`) and LOINC document `code` `57133-1`, and always emits its SHALL section set: the
entries-required **Problems**, **Allergies**, and **Medications** (empty `nullFlavor="NI"` when
unpopulated), plus the narrative **Reason for Referral** (`1.3.6.1.4.1.19376.1.5.3.1.3.1`, LOINC
`42349-1`, from the optional `reasonForReferral` string), **Assessment** (`…22.2.8`, LOINC `51848-0`,
unversioned, a root-only `templateId` with no `@extension`, from the optional `assessment` string),
and **Plan of Treatment** (`…22.2.10`, LOINC `18776-5`). Results, Vital Signs and Social History are
not Referral Note SHALL sections, so, unlike in a CCD, they are emitted only when the caller supplies
them.

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
the one warning the **emit side** can raise that `parseCcda` cannot: re-parsing the same document says
nothing. **`editCcda` raises it too**, on the sections that edit grafted, so a planned medication
written in by an edit is no longer emitted short that element in silence.
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
Plan of Treatment / Family History sections are emitted only when populated. The builder emits two of
the twelve document types (**CCD** and **Referral Note**); the other ten are **not implemented**, and any
other `documentType` throws a `TypeError` rather than emitting something that merely resembles the type
you asked for. Any C-CDA section outside the set listed above cannot be built at all.
`buildCcda(init, { terminology })` accepts an optional bring-your-own terminology adapter (see "Code
systems & provenance"). Every code is still emitted verbatim; the adapter can only flag, never coerce.

## Edit a document

`editCcda(doc, options)` is the read→edit→write loop: it takes a document from `parseCcda` and re-emits
it with a section **added** or **replaced**, returning the re-parsed document. It rebuilds only the
targeted section (through the same emitters `buildCcda` uses) and carries every other section through
**byte-for-byte**, including content this library never models.

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

revised.header.versionNumber; // 2, a CDA R2 revision of the source
revised.header.relatedDocuments[0]?.typeCode; // "RPLC"
```

By default an edit stamps a **CDA R2 revision**: a new `ClinicalDocument.id`, the same version-series
`setId` (minted when absent), an incremented `versionNumber`, and a `relatedDocument typeCode="RPLC"`
naming the prior version, inserted at their CDA R2 XSD sequence positions, and surfaced back on the
parsed header (`setId` / `versionNumber` / `relatedDocuments`). Pass `revision: false` to edit in place.
A source with no `ClinicalDocument.id` cannot be revised: the RPLC link's `parentDocument.id` is a CDA
R2 SHALL (1..\*) and there is no prior-version id to name, so `editCcda` throws
`CcdaEditError` (`SOURCE_MISSING_ID`) rather than fabricate one; use `revision: false` to edit it in place.

**A minted `setId` is labelled as synthetic.** CDA R2 requires a replacement and its `parentDocument`
to share a version-series `setId`, so one is minted when the source has none; minting it invents an
identifier, and the invention is made obvious rather than hidden. A minted id is
`SYNTHETIC-SETID-…` under a synthetic assigning-authority root
(`2.16.840.1.113883.19.5.99999`, in HL7's example arc), and `isSyntheticSetId(doc.header.setId)`
is the check. Both halves are required, because either alone is something a real document could carry.
A `setId` the source already asserted, or one you pass as `revision.setId`, is **never** relabelled.

**The residual, stated plainly: nothing forces a receiving system to read the label.** A receiver that
ignores the prefix and the root treats a minted `setId` exactly as it treats a real one, and this
library cannot make it do otherwise. A `false` from `isSyntheticSetId` is likewise not a promise the
id is real, only that this library did not mint it under this scheme.

**An edit reports what it wrote, over the sections it actually grafted.** A grafted Plan of Treatment
can carry a Planned Medication Activity short the `effectiveTime` its template SHALLs, so the returned
document raises `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, appended after the re-parse's warnings,
with the emitted XML unchanged. The scope is deliberately narrow in **both** directions and neither
half is an optimisation. It reads what **survived** into the emitted document, so an offending edit
that a later edit in the same call discarded says nothing (`sections` is an ordered list, and reading
the list rather than the result reports a violation against a document that does not have one). And it
covers only what **this call grafted**, so an offending act the source brought with it is never
re-reported: an edit is not a validator of a document its caller did not write.

It is fail-safe: an unedited section is carried by reference (never dropped), an empty content list
emits a spec-clean `nullFlavor="NI"` shell (never fabricated entries), and an edit that would drop a
SHALL required section throws a typed `CcdaEditError`. `mode` is `"add"` (require absent), `"replace"`
(require present), or `"upsert"` (default: replace-or-add). `editCcda(doc, { terminology })` forwards an
optional adapter to the final re-parse, so an adapter-rejected code in a grafted **or** untouched section
is flagged; the edit still emits every code verbatim.

**What editing does not cover.** The twelve editable section kinds are `problems`, `allergies`,
`medications`, `results`, `vitalSigns`, `immunizations`, `procedures`, `encounters`, `socialHistory`,
`pastMedicalHistory`, `planOfTreatment`, and `familyHistory`. **Functional Status and Mental Status are
buildable but not editable**: each is assembled from three separate content lists, which the single-list
edit shape does not fit. The Referral Note's narrative-only Assessment and Reason for Referral sections
are likewise not editable. There is **no entry-level append**: adding one problem to an existing
Problems section means a `replace` carrying the full entry set, which rebuilds that section from your
typed input, so anything in the original section you do not carry over, **including detail this library
does not model**, is absent from the result (every section you did not target is still carried through
byte-for-byte). There is no way to remove a section at all, and the `APND` / `XFRM` document
relationships are not implemented: an edit stamps `RPLC` only.

