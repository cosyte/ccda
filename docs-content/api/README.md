# @cosyte/ccda

## Classes

### CcdaDocument

The immutable parsed C-CDA document. Carries the recognized identity, the
header, the top-level sections (empty for an unstructured document, see
`nonXmlBody`), and the frozen lenient-parse warnings.

#### Example

```ts
import { parseCcda } from "@cosyte/ccda";
const doc = parseCcda(xml);
console.log(doc.documentType, doc.getPatient()?.name?.family, doc.getMrn());
```

#### Constructors

##### Constructor

> **new CcdaDocument**(`init`): [`CcdaDocument`](#ccdadocument)

**`Internal`**

Construct a `CcdaDocument`. Freezes the `warnings` array (after a `slice`)
so callers cannot mutate parser output after handoff.

###### Parameters

###### init

[`CcdaDocumentInit`](#ccdadocumentinit)

###### Returns

[`CcdaDocument`](#ccdadocument)

#### Properties

##### allergies

> `readonly` **allergies**: readonly [`AllergyConcern`](#allergyconcern)[]

Extracted Allergy Concern Acts (across all sections). Empty when none.

##### documentType

> `readonly` **documentType**: [`DocumentType`](#documenttype-4) \| `undefined`

The recognized document type, or `undefined` when the root `templateId` is unrecognized/absent.

##### encounters

> `readonly` **encounters**: readonly [`Encounter`](#encounter)[]

Extracted Encounter Activities, visits/admissions (across all sections). Empty when none.

##### familyHistory

> `readonly` **familyHistory**: readonly [`FamilyHistory`](#familyhistory-4)[]

Extracted Family History Organizers, one per relative (across all sections). Empty when none.

##### functionalStatus

> `readonly` **functionalStatus**: readonly [`StatusObservation`](#statusobservation)[]

Extracted Functional Status findings (across all sections). Empty when none.

##### header

> `readonly` **header**: [`CcdaHeader`](#ccdaheader)

The parsed US Realm Header.

##### immunizations

> `readonly` **immunizations**: readonly [`Immunization`](#immunization)[]

Extracted Immunization Activities (across all sections). Empty when none.

##### medications

> `readonly` **medications**: readonly [`Medication`](#medication)[]

Extracted Medication Activities (across all sections). Empty when none.

##### mentalStatus

> `readonly` **mentalStatus**: readonly [`StatusObservation`](#statusobservation)[]

Extracted Mental Status findings (across all sections). Empty when none.

##### nonXmlBody

> `readonly` **nonXmlBody**: [`ED`](#ed) \| `undefined`

The quarantined `nonXMLBody` content for an unstructured document (base64 never decoded).

##### pastMedicalHistory

> `readonly` **pastMedicalHistory**: readonly [`Problem`](#problem-1)[]

Extracted Past Medical History problems, bare historical Problem Observations. Empty when none.

##### plannedItems

> `readonly` **plannedItems**: readonly [`PlannedItem`](#planneditem)[]

Extracted planned items from the Plan of Treatment, all future/ordered (across all sections). Empty when none.

##### problems

> `readonly` **problems**: readonly [`ProblemConcern`](#problemconcern)[]

Extracted Problem Concern Acts (across all sections). Empty when none.

##### procedures

> `readonly` **procedures**: readonly [`Procedure`](#procedure)[]

Extracted procedures, performed or planned (across all sections). Empty when none.

##### profile

> `readonly` **profile**: [`ProfileAttribution`](#profileattribution) \| `undefined`

The profile applied at parse time (name + lineage), or `undefined` when none was active.

##### results

> `readonly` **results**: readonly [`ResultOrganizer`](#resultorganizer)[]

Extracted Result Organizers, lab/diagnostic panels (across all sections). Empty when none.

##### sections

> `readonly` **sections**: readonly [`CcdaSection`](#ccdasection)[]

Top-level framed sections from the `structuredBody`. Empty for an unstructured document.

##### smokingStatus

> `readonly` **smokingStatus**: readonly [`SmokingStatus`](#smokingstatus-4)[]

Extracted Smoking Status observations from Social History. Empty when none.

##### templateIds

> `readonly` **templateIds**: readonly [`II`](#ii)[]

The root `templateId`s, in document order (raw recognition signal).

##### vitals

> `readonly` **vitals**: readonly [`VitalSignsOrganizer`](#vitalsignsorganizer)[]

Extracted Vital Signs Organizers, vital-reading clusters (across all sections). Empty when none.

##### warnings

> `readonly` **warnings**: readonly [`CcdaWarning`](#ccdawarning)[]

Lenient-parse warnings, frozen at the model boundary.

#### Methods

##### allSections()

> **allSections**(): readonly [`CcdaSection`](#ccdasection)[]

Every section in the document, flattened depth-first (top-level sections
followed by their nested subsections). Order is document order.

###### Returns

readonly [`CcdaSection`](#ccdasection)[]

###### Example

```ts
for (const s of doc.allSections()) console.log(s.key ?? "(unrecognized)");
```

##### findSection()

> **findSection**(`key`): [`CcdaSection`](#ccdasection) \| `undefined`

Find the first recognized section with the given catalog `key`, searching
top-level sections then their subsections (depth-first). Returns
`undefined` when no recognized section matches.

###### Parameters

###### key

`string`

###### Returns

[`CcdaSection`](#ccdasection) \| `undefined`

###### Example

```ts
const allergies = doc.findSection("allergies");
console.log(allergies?.narrativeText);
```

##### getAllergies()

> **getAllergies**(): readonly [`AllergyConcern`](#allergyconcern)[]

The patient's Allergy Concern Acts, each wrapping one or more
allergy/intolerance observations (including the "No Known Allergies"
negated form). Empty when the document carries no Allergies entries.

###### Returns

readonly [`AllergyConcern`](#allergyconcern)[]

###### Example

```ts
const nka = doc.getAllergies().some((c) => c.allergies.some((a) => a.noKnownAllergy));
```

##### getEncounters()

> **getEncounters**(): readonly [`Encounter`](#encounter)[]

The patient's Encounter Activities, each carrying the encounter type `code`,
status, and visit period. Empty when the document carries no Encounters
entries.

###### Returns

readonly [`Encounter`](#encounter)[]

###### Example

```ts
for (const e of doc.getEncounters()) console.log(e.code?.code, e.effectiveTime);
```

##### getFamilyHistory()

> **getFamilyHistory**(): readonly [`FamilyHistory`](#familyhistory-4)[]

The patient's Family History, one [FamilyHistory](#familyhistory-4) per relative, each
carrying the relative's structured identity and their recorded conditions.
Empty when the document carries no Family History entries.

###### Returns

readonly [`FamilyHistory`](#familyhistory-4)[]

###### Example

```ts
for (const h of doc.getFamilyHistory())
  console.log(h.relative.relationship?.code, h.observations.length);
```

##### getFunctionalStatus()

> **getFunctionalStatus**(): readonly [`StatusObservation`](#statusobservation)[]

The patient's Functional Status findings, ADLs, mobility, and self-care
observations (plus any scored assessment scales). Empty when the document
carries no Functional Status entries.

###### Returns

readonly [`StatusObservation`](#statusobservation)[]

###### Example

```ts
const scales = doc.getFunctionalStatus().filter((o) => o.assessmentScale);
console.log(scales[0]?.code?.code);
```

##### getImmunizations()

> **getImmunizations**(): readonly [`Immunization`](#immunization)[]

The patient's Immunization Activities, each carrying the CVX vaccine, dose,
route, and date (including the `refused` not-administered form). Empty when
the document carries no Immunizations entries.

###### Returns

readonly [`Immunization`](#immunization)[]

###### Example

```ts
const given = doc.getImmunizations().filter((i) => i.refused !== true);
console.log(given[0]?.vaccine?.code);
```

##### getMedications()

> **getMedications**(): readonly [`Medication`](#medication)[]

The patient's Medication Activities, each carrying the RxNorm drug, dose,
route, and timing. Empty when the document carries no Medications entries.

###### Returns

readonly [`Medication`](#medication)[]

###### Example

```ts
for (const m of doc.getMedications()) console.log(m.drug?.code, m.dose?.value);
```

##### getMentalStatus()

> **getMentalStatus**(): readonly [`StatusObservation`](#statusobservation)[]

The patient's Mental Status findings, cognition and mood observations (plus
any scored assessment scales such as a PHQ-9). Empty when the document
carries no Mental Status entries.

###### Returns

readonly [`StatusObservation`](#statusobservation)[]

###### Example

```ts
for (const o of doc.getMentalStatus()) console.log(o.code?.code, o.value?.kind);
```

##### getMrn()

> **getMrn**(): `string` \| `undefined`

The patient's MRN string, the **first** `patientRole/id` extension (see
[pickMrn](#pickmrn)). `undefined` when there is no patient, when that id has no
`extension`, or when it carries a `nullFlavor`: the document disowned that
identifier, and a bare `string` return has nowhere to carry the marking that
qualified it. It withholds rather than falling through to the next `<id>`,
since nothing in a C-CDA ranks `patientRole/id` entries and the next one is
as likely to be an account or member number. The verbatim value is still
reachable at `getPatient()?.identifiers`, where the `nullFlavor` travels
with it.

###### Returns

`string` \| `undefined`

###### Example

```ts
console.log(doc.getMrn() ?? "no MRN");
```

##### getPastMedicalHistory()

> **getPastMedicalHistory**(): readonly [`Problem`](#problem-1)[]

The patient's Past Medical History, historical problems carried as bare
Problem Observations (distinct from the active-concern Problems section).
Empty when the document carries no Past Medical History entries.

###### Returns

readonly [`Problem`](#problem-1)[]

###### Example

```ts
console.log(doc.getPastMedicalHistory()[0]?.value?.code);
```

##### getPatient()

> **getPatient**(): [`CcdaPatient`](#ccdapatient) \| `undefined`

The first `recordTarget` patient, or `undefined` when the document carries
none. A document with multiple record targets emits
`MULTIPLE_RECORD_TARGETS` at parse time; this returns the first.

###### Returns

[`CcdaPatient`](#ccdapatient) \| `undefined`

###### Example

```ts
const p = doc.getPatient();
console.log(p?.name?.family ?? "unknown patient");
```

##### getPlannedItems()

> **getPlannedItems**(): readonly [`PlannedItem`](#planneditem)[]

The patient's planned items from the Plan of Treatment, each future/ordered
(never performed), carrying its planned `code`, `kind`, and a `disposition`
of `"planned"` derived from `moodCode` (never read as performed). Empty when
the document carries no Plan of Treatment entries.

**Two bounds, because a quiet result here is not a complete one.** This
returns **seven** entry templates and the Plan of Treatment Section admits
**eleven**: Instruction (`…22.4.20`), Handoff Communication Participants
(`…22.4.141`), Nutrition Recommendation (`…22.4.130`) and Goal Observation
(`…22.4.121`) are not acts planned for the patient and are not returned, and
nothing is raised about them. A Goal Observation is the clearest of the four:
it is `moodCode="GOL"`, which this parser calls neither performed nor
planned. And a planned entry is reached as a direct `<entry>` act or nested
inside a **Planned Intervention Act** (`…22.4.146`), the one container R2.1
lets hold all seven inline. **Nesting is not solved in general**: R2.1 also
puts planned acts inside a Nutrition Recommendation (`…22.4.130`, six of the
seven) and a Planned Intervention Act inside an Intervention Act
(`…22.4.131`), and a planned entry in either is still not reached. All of it
re-serializes faithfully, so `toString()` is the fallback.

###### Returns

readonly [`PlannedItem`](#planneditem)[]

###### Example

```ts
const orders = doc.getPlannedItems().filter((p) => p.kind === "medicationActivity");
console.log(orders[0]?.code?.code);
```

##### getProblems()

> **getProblems**(): readonly [`ProblemConcern`](#problemconcern)[]

The patient's Problem Concern Acts, each wrapping one or more coded
problems with an active/resolved status. Empty when the document carries no
Problems entries.

###### Returns

readonly [`ProblemConcern`](#problemconcern)[]

###### Example

```ts
const active = doc.getProblems().filter((c) => c.status === "active");
console.log(active[0]?.problems[0]?.value?.code);
```

##### getProcedures()

> **getProcedures**(): readonly [`Procedure`](#procedure)[]

The patient's procedures, each carrying its procedure `code`, status, and a
`disposition` of `"performed"` vs `"planned"` derived from `moodCode` (never
conflated). Empty when the document carries no Procedures entries.

###### Returns

readonly [`Procedure`](#procedure)[]

###### Example

```ts
const performed = doc.getProcedures().filter((p) => p.disposition === "performed");
console.log(performed[0]?.code?.code);
```

##### getResults()

> **getResults**(): readonly [`ResultOrganizer`](#resultorganizer)[]

The patient's Result Organizers, lab/diagnostic panels, each carrying its
member Result Observations with UCUM-checked values and reference ranges.
Empty when the document carries no Results entries.

###### Returns

readonly [`ResultOrganizer`](#resultorganizer)[]

###### Example

```ts
for (const panel of doc.getResults())
  for (const r of panel.results) console.log(r.code?.code, r.interpretation?.code);
```

##### getSmokingStatus()

> **getSmokingStatus**(): readonly [`SmokingStatus`](#smokingstatus-4)[]

The patient's Smoking Status observations (from Social History), each
carrying the SNOMED smoking-status `value` and an `unknown` flag for the
explicitly-unknown form. Empty when the document records no smoking status.

###### Returns

readonly [`SmokingStatus`](#smokingstatus-4)[]

###### Example

```ts
const known = doc.getSmokingStatus().filter((s) => !s.unknown);
console.log(known[0]?.value?.code);
```

##### getVitals()

> **getVitals**(): readonly [`VitalSignsOrganizer`](#vitalsignsorganizer)[]

The patient's Vital Signs Organizers, reading clusters, each carrying its
member Vital Sign Observations with UCUM-checked `PQ` values. Empty when the
document carries no Vital Signs entries.

###### Returns

readonly [`VitalSignsOrganizer`](#vitalsignsorganizer)[]

###### Example

```ts
for (const cluster of doc.getVitals())
  for (const v of cluster.vitals) console.log(v.code?.code, v.value);
```

##### toString()

> **toString**(): `string`

Serialize this document back to spec-clean C-CDA XML, the conservative
*emit* half of the Postel's-Law contract. Returns the faithful re-emission
of the source the parser read (no silent loss of unmodeled content), with a
guaranteed XML declaration. Serialization is a fixed point:
`parseCcda(doc.toString()).toString() === doc.toString()`.

###### Returns

`string`

The spec-clean XML text.

###### Throws

If this document was hand-constructed (not produced by
  [parseCcda](#parseccda)) and so retains no source document to emit.

###### Example

```ts
const doc = parseCcda(xml);
const xmlOut = doc.toString();
```

##### withWarnings()

> **withWarnings**(`additional`): [`CcdaDocument`](#ccdadocument)

Return a **new** `CcdaDocument` with `additional` warnings appended,
structurally sharing every parsed field (header, sections, entries, and the
serialized snapshot) with this instance by reference. The original is never
mutated. A downstream pass (e.g. profile-aware validation) uses
this to annotate a document without re-parsing.

###### Parameters

###### additional

readonly [`CcdaWarning`](#ccdawarning)[]

Warnings to append after the existing ones.

###### Returns

[`CcdaDocument`](#ccdadocument)

A new document; this instance is unchanged.

###### Example

```ts
const annotated = doc.withWarnings([
  { code: "SECTION_PLACEMENT_SUSPECT", message: "...", position: {} },
]);
// doc.warnings is unchanged; annotated.warnings has the extra entry.
```

***

### CcdaEditError

The typed error [editCcda](#editccda) throws when an edit cannot be applied safely
, a hand-constructed source with no XML to edit, a structured-body-less
document, an add/replace precondition violation, an edit that would drop a
per-document-type SHALL required section, or a revision of a source whose
`ClinicalDocument.id` is absent or marked `nullFlavor` (the RPLC link has no
prior version it can truthfully name). Consumers narrow via `code`.

#### Example

```ts
import { editCcda, CcdaEditError } from "@cosyte/ccda";
try {
  editCcda(doc, { sections: [{ kind: "problems", mode: "add", content: [] }] });
} catch (err) {
  if (err instanceof CcdaEditError && err.code === "SECTION_ALREADY_PRESENT") {
    // the document already has a Problems section, use "replace" or "upsert"
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new CcdaEditError**(`code`, `message`): [`CcdaEditError`](#ccdaediterror)

**`Internal`**

Construct a new `CcdaEditError`.

###### Parameters

###### code

[`CcdaEditErrorCode`](#ccdaediterrorcode-1)

The stable failure code.

###### message

`string`

A human-readable, PHI-free explanation.

###### Returns

[`CcdaEditError`](#ccdaediterror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`CcdaEditErrorCode`](#ccdaediterrorcode-1)

The stable [CcdaEditErrorCode](#ccdaediterrorcode-1) discriminant.

***

### CcdaParseError

Thrown by `parseCcda` (and the secure XML substrate it calls) when the
input violates one of the seven unrecoverable Tier-3 rules, a declared
DTD/external entity, entity-expansion or size/depth/node-count limits,
malformed XML, or a well-formed document whose root is not
`ClinicalDocument`. Carries a bounded structural [CcdaPosition](#ccdaposition) and a
`message` taken whole from FATAL\_MESSAGES; unlike some sibling parsers
it retains no raw input snippet, precisely because C-CDA payloads are clinical
documents and any snippet would risk leaking PHI. Nothing the document said
reaches `err.message` or, under `{ strict: true }`, `err.stack`.

#### Example

```ts
import { parseCcda, CcdaParseError } from "@cosyte/ccda";
try {
  parseCcda(raw);
} catch (err) {
  if (err instanceof CcdaParseError && err.code === "NOT_A_CLINICAL_DOCUMENT") {
    // err.position, err.code available, no PHI in either
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new CcdaParseError**(`code`, `message`, `position`): [`CcdaParseError`](#ccdaparseerror)

**`Internal`**

Construct a new `CcdaParseError`. All three fields are required so every
thrower populates a code, a message (which must come from
FATAL\_MESSAGES, never be built from the input), and a structural
position.

###### Parameters

###### code

[`FatalCode`](#fatalcode)

###### message

`string`

###### position

[`CcdaPosition`](#ccdaposition)

###### Returns

[`CcdaParseError`](#ccdaparseerror)

###### Overrides

`Error.constructor`

#### Properties

##### code

> `readonly` **code**: [`FatalCode`](#fatalcode)

##### position

> `readonly` **position**: [`CcdaPosition`](#ccdaposition)

***

### CcdaProfileDefinitionError

Thrown by `defineCcdaProfile` when a profile definition is structurally
invalid, a missing/empty `name`, an unknown option key, a `tolerate` entry
whose `code` is not a real [WarningCode](#warningcode), a missing `rationale`, or,
the load-bearing safety rule, an attempt to tolerate a **safety-critical**
warning code. Distinct from [CcdaParseError](#ccdaparseerror) (which is about a
*document*): this is about a malformed *profile*, so it is never part of the
lenient parse path and carries no `CcdaPosition`.

#### Example

```ts
import { defineCcdaProfile, CcdaProfileDefinitionError } from "@cosyte/ccda";
try {
  defineCcdaProfile({ name: "bad", tolerate: [{ code: "MISSING_DOSE_QUANTITY", rationale: "x" }] });
} catch (err) {
  if (err instanceof CcdaProfileDefinitionError) {
    // a profile may never tolerate a safety-critical code
  }
}
```

#### Extends

- `Error`

#### Constructors

##### Constructor

> **new CcdaProfileDefinitionError**(`message`, `profileName?`): [`CcdaProfileDefinitionError`](#ccdaprofiledefinitionerror)

**`Internal`**

Construct a new `CcdaProfileDefinitionError`.

###### Parameters

###### message

`string`

###### profileName?

`string`

###### Returns

[`CcdaProfileDefinitionError`](#ccdaprofiledefinitionerror)

###### Overrides

`Error.constructor`

#### Properties

##### profileName

> `readonly` **profileName**: `string` \| `undefined`

The offending profile's name, when known at throw time.

## Interfaces

### Allergy

An Allergy-Intolerance Observation. `allergen` is the offending substance
(RxNorm / UNII / SNOMED) from the playing entity; `type` is the propensity
type (the observation `value`). `noKnownAllergy` is the `negationInd="true"`
"no known allergies" assertion, **distinct** from `nullFlavor` (substance
unknown). `criticality` is the propensity criticality; per-reaction severity
lives on each [AllergyReaction](#allergyreaction).

#### Example

```ts
import type { Allergy } from "@cosyte/ccda";
function allergenCode(a: Allergy): string | undefined {
  return a.noKnownAllergy ? undefined : a.allergen?.code;
}
```

#### Properties

##### allergen?

> `readonly` `optional` **allergen?**: [`CD`](#cd)

##### allergenLevelSuspect?

> `readonly` `optional` **allergenLevelSuspect?**: `boolean`

##### criticality?

> `readonly` `optional` **criticality?**: [`CD`](#cd)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### negated?

> `readonly` `optional` **negated?**: `boolean`

##### noKnownAllergy

> `readonly` **noKnownAllergy**: `boolean`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### reactions

> `readonly` **reactions**: readonly [`AllergyReaction`](#allergyreaction)[]

##### type?

> `readonly` `optional` **type?**: [`CD`](#cd)

***

### AllergyConcern

An Allergy Concern Act: the concern wrapper around one or more
[Allergy](#allergy) observations. `status` is the active/resolved/inactive state
from the concern `statusCode`; `effectiveTime` is the concern window.

#### Example

```ts
import type { AllergyConcern } from "@cosyte/ccda";
function isActive(c: AllergyConcern): boolean {
  return c.status === "active";
}
```

#### Properties

##### allergies

> `readonly` **allergies**: readonly [`Allergy`](#allergy)[]

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### status

> `readonly` **status**: [`ConcernStatus`](#concernstatus)

***

### AllergyReaction

One reaction (manifestation) of an allergy. `manifestation` is the coded
clinical effect (e.g. hives); `severity` is the reaction's nested Severity
Observation value, distinct from the propensity's overall criticality.

#### Example

```ts
import type { AllergyReaction } from "@cosyte/ccda";
const r: AllergyReaction = { manifestation: { code: "247472004", codeSystem: "2.16.840.1.113883.6.96" } };
```

#### Properties

##### manifestation?

> `readonly` `optional` **manifestation?**: [`CD`](#cd)

##### severity?

> `readonly` `optional` **severity?**: [`CD`](#cd)

***

### BL

Parsed HL7 v3 Boolean. `value` is the parsed boolean (omitted when the
`@value` token was neither `"true"` nor `"false"`); `nullFlavor` is set when
the element declared one.

#### Example

```ts
import type { BL } from "@cosyte/ccda";
const flag: BL = { value: true };
```

#### Properties

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### value?

> `readonly` `optional` **value?**: `boolean`

***

### BuildCcdaAllergy

An Allergy Concern for the Allergies section. Either an `allergen` (RxNorm at
ingredient level by default, or UNII / SNOMED CT) **or** `noKnownAllergy:
true` (the `negationInd` "No Known Allergies" assertion) is required, the two
are never conflated. `reaction`, `severity`, and `criticality` are optional;
severity (of a reaction) and criticality (of the propensity) are distinct axes.

#### Example

```ts
import type { BuildCcdaAllergy } from "@cosyte/ccda";
const penicillin: BuildCcdaAllergy = {
  allergen: { code: "7980", displayName: "Penicillin G" },
  reaction: { code: "247472004", displayName: "Hives" },
  criticality: { code: "CRITH", displayName: "High criticality" },
};
const nka: BuildCcdaAllergy = { noKnownAllergy: true };
```

#### Properties

##### allergen?

> `readonly` `optional` **allergen?**: [`BuildCode`](#buildcode)

The offending substance (RxNorm ingredient default, or UNII / SNOMED CT).

##### criticality?

> `readonly` `optional` **criticality?**: [`BuildCode`](#buildcode)

The propensity criticality (HL7 ObservationValue by default), optional.

##### noKnownAllergy?

> `readonly` `optional` **noKnownAllergy?**: `boolean`

Assert "No Known Allergies" (`negationInd="true"`), mutually exclusive with `allergen`.

##### onset?

> `readonly` `optional` **onset?**: `string`

Onset date as an HL7 date string, the Allergy Concern Act `effectiveTime/low`
(when the allergy became a tracked concern), optional. When omitted the SHALL
`low` is emitted as `nullFlavor="UNK"`, never a fabricated date.

##### reaction?

> `readonly` `optional` **reaction?**: [`BuildCode`](#buildcode)

The reaction manifestation (SNOMED CT by default), optional.

##### resolution?

> `readonly` `optional` **resolution?**: `string`

Resolution date as an HL7 date string, the concern `effectiveTime/high`
(when the concern was completed). Requires `status: "resolved"`, exactly as a
[BuildCcdaProblem](#buildccdaproblem) resolution does; [buildCcda](#buildccda) rejects a
resolution date on a non-resolved allergy. A resolved allergy whose date is
unknown still emits a `nullFlavor="UNK"` `high`.

##### severity?

> `readonly` `optional` **severity?**: [`BuildCode`](#buildcode)

The reaction's severity (SNOMED CT by default), optional.

##### status?

> `readonly` `optional` **status?**: `"active"` \| `"resolved"` \| `"inactive"`

Active / resolved / inactive; defaults to `"active"`.

##### type?

> `readonly` `optional` **type?**: [`BuildCode`](#buildcode)

The propensity **type**, the Allergy-Intolerance Observation `value` (SNOMED
CT by default), from the C-CDA Allergy/Intolerance Type value set: e.g. drug
allergy `416098002`, food allergy `414285001`, environmental `426232007`.
Defaults to the neutral `419199007` "Allergy to substance", the builder does
**not** guess "Drug allergy" for a non-drug allergen.

***

### BuildCcdaAssessmentScale

A direct-entry Assessment Scale Observation (`…22.4.69`) for the Functional
Status or Mental Status section, a formal scored instrument (e.g. a PHQ-9
depression screen or a Glasgow Coma scale). C-CDA R2.1 carries the Assessment
Scale Observation as a **direct section entry** (`entry/observation`), *not* as
a Functional/Mental Status Organizer member, so the builder emits it directly
under the section, and the parser reads it back tagged `assessmentScale: true`
with the section's `domain`. The template id is the **bare root** `…22.4.69`
(R2.1 SHALL: `@root` with **no** `@extension`).

**`code` is the scale panel code** (LOINC by default, e.g. PHQ-9 `44249-1`).
`score` is the total score, emitted as the SHALL `value` [1..1] with
`xsi:type="INT"` (the type C-CDA prefers for a questionnaire, units are not
allowed on an `INT`). **The score is never fabricated:** when `score` is
omitted the SHALL `value` is `nullFlavor="UNK"`, an explicit unknown. The SHALL
`effectiveTime` [1..1] is the administration time (`nullFlavor="UNK"` when
omitted). `interpretation` (e.g. High/Low/Normal) and the `supporting`
components (the individual items) are optional, each emitted only when
supplied, never invented.

#### Example

```ts
import type { BuildCcdaAssessmentScale } from "@cosyte/ccda";
const phq9: BuildCcdaAssessmentScale = {
  code: { code: "44249-1", displayName: "PHQ-9 quick depression assessment panel" }, // LOINC
  score: 12,
  effectiveTime: "20240101",
  interpretation: { code: "H", displayName: "High" },
  supporting: [
    { code: { code: "44250-9", displayName: "Little interest or pleasure in doing things" }, score: 0 },
  ],
};
```

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The scale/panel code (LOINC by default, e.g. PHQ-9 `44249-1`).

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

When the scale was administered (HL7 date string); `nullFlavor="UNK"` when omitted.

##### interpretation?

> `readonly` `optional` **interpretation?**: [`BuildCode`](#buildcode)

The score interpretation (HL7 ObservationInterpretation by default), optional.

##### score?

> `readonly` `optional` **score?**: `number`

The total score (`xsi:type="INT"`). Omit → SHALL `value nullFlavor="UNK"`.

##### supporting?

> `readonly` `optional` **supporting?**: readonly [`BuildCcdaAssessmentScaleItem`](#buildccdaassessmentscaleitem)[]

The individual scored components; each an Assessment Scale Supporting Observation. Optional.

***

### BuildCcdaAssessmentScaleItem

One scored component of an Assessment Scale, an Assessment Scale Supporting
Observation (`…22.4.86`), e.g. a single PHQ-9 question or a Glasgow Coma
sub-score. `code` is the item's LOINC/SNOMED code (SHALL, LOINC default);
`score` its integer answer (the SHALL `value`, `xsi:type="INT"`).

**The answer is never fabricated.** When `score` is omitted the SHALL `value`
is emitted as `nullFlavor="UNK"`, an *explicit* unknown, never a guessed
number. Units are not allowed on an `INT`, so a supporting item carries no unit.

#### Example

```ts
import type { BuildCcdaAssessmentScaleItem } from "@cosyte/ccda";
const q1: BuildCcdaAssessmentScaleItem = {
  code: { code: "44250-9", displayName: "Little interest or pleasure in doing things" },
  score: 0,
};
```

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The component's LOINC/SNOMED code (LOINC default).

##### score?

> `readonly` `optional` **score?**: `number`

The integer answer/score (`xsi:type="INT"`). Omit → `value nullFlavor="UNK"`.

***

### BuildCcdaEncompassingEncounter

The `componentOf/encompassingEncounter` frame a Discharge Summary SHALL carry
(CONF:1198-8471, -8472): the inpatient stay the document summarises. Ignored
for a document type whose rule does not require the frame, because emitting an
encounter a CCD never claimed would be asserting one.

**NOTHING HERE IS EVER FABRICATED, AND EVERY SLOT IS REQUIRED BY THE
TEMPLATE.** The encounter's `effectiveTime` SHALL carry a `low` and a `high`
(CONF:1198-8473, -8475) and the encounter SHALL carry a
`dischargeDispositionCode` (CONF:1198-8476), so all three elements are always
emitted. A bound or a disposition the caller did not supply is emitted as an
**explicit** `nullFlavor="UNK"`, which satisfies the cardinality without
stating a clinical fact and which [parseCcda](#parseccda) reads back as absent
rather than as a date or a code. An admission date, a discharge date and a
discharge disposition are each things a clinician acts on, and a guessed one
is a wrong clinical fact on the wire.

A supplied bound keeps exactly the precision it was given: a day-precision
`"20240102"` stays day-precision and is never completed to a time.

#### Example

```ts
import type { BuildCcdaEncompassingEncounter } from "@cosyte/ccda";
const stay: BuildCcdaEncompassingEncounter = {
  period: { low: "20240102", high: "20240108" },
  dischargeDisposition: { code: "01", displayName: "Discharged to Home or Self Care" },
};
```

#### Properties

##### dischargeDisposition?

> `readonly` `optional` **dischargeDisposition?**: [`BuildCode`](#buildcode)

The discharge disposition. `codeSystem` defaults to the NUBC UB-04 Patient
Discharge Status code set, the system every member of the value set the
template names carries; supply your own to code it elsewhere, since that
binding is a SHOULD. Omitted entirely, the element is emitted
`nullFlavor="UNK"`: the builder has no defensible default for where a
patient went.

##### period?

> `readonly` `optional` **period?**: `object`

The encounter period as HL7 date strings (an `IVL_TS` low/high), the
admission and discharge times. Either bound may be omitted and an omitted
one is emitted `nullFlavor="UNK"`; the element itself is always emitted,
because the template requires both bounds to be present.

###### high?

> `readonly` `optional` **high?**: `string`

###### low?

> `readonly` `optional` **low?**: `string`

***

### BuildCcdaEncounter

An Encounter Activity for the Encounters section (`…22.4.49`). `type` is the
coded encounter type (CPT by default, or SNOMED CT / HL7 ActEncounterCode) and
is required, the template SHALL contain a `code` [1..1]. `period` is the
visit/admission window emitted as the SHALL `effectiveTime` [1..1] (an
`IVL_TS`); when omitted the SHALL slot is filled with a `nullFlavor="UNK"`
`low` rather than a fabricated date. `status` maps to the optional `statusCode`.

#### Example

```ts
import type { BuildCcdaEncounter } from "@cosyte/ccda";
const visit: BuildCcdaEncounter = {
  type: { code: "99213", displayName: "Office outpatient visit 15 minutes" }, // CPT
  status: "completed",
  period: { low: "20230615", high: "20230615" },
};
```

#### Properties

##### period?

> `readonly` `optional` **period?**: `object`

The visit/admission period as HL7 date strings (an `IVL_TS` low/high); either
bound optional. Emitted as the SHALL `effectiveTime`; `nullFlavor="UNK"` low
when omitted.

###### high?

> `readonly` `optional` **high?**: `string`

###### low?

> `readonly` `optional` **low?**: `string`

##### status?

> `readonly` `optional` **status?**: `string`

The encounter `statusCode`; defaults to `"completed"`.

##### type

> `readonly` **type**: [`BuildCode`](#buildcode)

The coded encounter type (CPT by default, or SNOMED CT / HL7 ActEncounterCode).

***

### BuildCcdaFamilyHistory

One Family History Organizer (`…22.4.45`) for the Family History section, a
single `relative` plus the `observations` (conditions) recorded for them. The
relative's identity is carried once on the organizer (not flattened into each
condition), so the parser reads every condition back grouped under its relative.

#### Example

```ts
import type { BuildCcdaFamilyHistory } from "@cosyte/ccda";
const father: BuildCcdaFamilyHistory = {
  relative: { relationship: { code: "9947008", displayName: "Father" }, deceased: true },
  observations: [
    { condition: { code: "22298006", displayName: "Myocardial infarction" }, causeOfDeath: true },
  ],
};
```

#### Properties

##### observations

> `readonly` **observations**: readonly [`BuildCcdaFamilyHistoryObservation`](#buildccdafamilyhistoryobservation)[]

The conditions recorded for the relative; each becomes a Family History
Observation. **Must be non-empty**, the organizer SHALL carry at least one
observation component; pass `[{}]` (an unknown condition) rather than an empty
list, else [buildCcda](#buildccda) throws a `TypeError`.

##### relative

> `readonly` **relative**: [`BuildCcdaFamilyMember`](#buildccdafamilymember)

The family member this organizer describes.

***

### BuildCcdaFamilyHistoryObservation

A single condition recorded for a relative, one Family History Observation
(`…22.4.46`). The illness is the coded `condition` (SNOMED CT by default);
`ageAtOnset` (whole UCUM years) becomes a nested Age Observation (`…22.4.31`);
`causeOfDeath` adds a Family History Death Observation (`…22.4.47`) marking this
condition as the relative's cause of death; `effectiveTime` (an HL7 date
string) is the SHOULD [0..1] time of the condition.

**The condition is never fabricated.** When `condition` is omitted the SHALL
`value` is emitted as `nullFlavor="UNK"`, an *explicit* unknown, never a
guessed illness. `ageAtOnset`, `causeOfDeath`, and `effectiveTime` are optional
, each emitted only when supplied, never invented.

#### Example

```ts
import type { BuildCcdaFamilyHistoryObservation } from "@cosyte/ccda";
const mi: BuildCcdaFamilyHistoryObservation = {
  condition: { code: "22298006", displayName: "Myocardial infarction" }, // SNOMED CT
  ageAtOnset: 57,
  causeOfDeath: true,
};
```

#### Properties

##### ageAtOnset?

> `readonly` `optional` **ageAtOnset?**: `number`

The relative's age at onset in whole years, a nested Age Observation, emitted only when supplied.

##### causeOfDeath?

> `readonly` `optional` **causeOfDeath?**: `boolean`

When `true`, marks this condition as the relative's cause of death (Family History Death Observation).

##### condition?

> `readonly` `optional` **condition?**: [`BuildCode`](#buildcode)

The coded condition the relative had (SNOMED CT default). Omit for an explicit
unknown (`value nullFlavor="UNK"`), never guessed.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The time/date of the condition (HL7 date string); the SHOULD [0..1] effectiveTime, emitted only when supplied.

***

### BuildCcdaFamilyMember

The relative a [BuildCcdaFamilyHistory](#buildccdafamilyhistory) organizer describes, the family
member whose conditions the organizer records. Emitted as the organizer's
`subject/relatedSubject` (a `@classCode="PRS"` personal relationship).

**The relationship is never fabricated.** `relationship` is the coded relation
of the relative to the patient, SNOMED CT by default (e.g. `72705000` mother,
`9947008` father, `394859005`… ), overridable via `codeSystem` (e.g. the HL7
RoleCode `FTH`/`MTH` on `2.16.840.1.113883.5.111`). When omitted, the SHALL
`relatedSubject/code` is emitted as `nullFlavor="UNK"`, an *explicit* unknown
relation, never guessed. `gender` (an HL7 AdministrativeGender code, e.g.
`"M"`/`"F"`), `birthTime` (an HL7 date string), and `deceased` (the
`sdtc:deceasedInd` flag) are all optional MAY elements, each emitted only when
supplied, never fabricated.

#### Example

```ts
import type { BuildCcdaFamilyMember } from "@cosyte/ccda";
const mother: BuildCcdaFamilyMember = {
  relationship: { code: "72705000", displayName: "Mother" }, // SNOMED CT
  gender: "F",
  deceased: true,
};
```

#### Properties

##### birthTime?

> `readonly` `optional` **birthTime?**: `string`

The relative's birth date (HL7 date string); emitted only when supplied.

##### deceased?

> `readonly` `optional` **deceased?**: `boolean`

Whether the relative is deceased (`sdtc:deceasedInd`); emitted only when supplied.

##### gender?

> `readonly` `optional` **gender?**: `string`

The relative's HL7 AdministrativeGender code (e.g. `"M"`/`"F"`); emitted only when supplied.

##### relationship?

> `readonly` `optional` **relationship?**: [`BuildCode`](#buildcode)

The coded relationship of the relative to the patient (SNOMED CT default).
Omit for an explicit unknown (`relatedSubject/code nullFlavor="UNK"`), never
guessed.

***

### BuildCcdaFunctionalStatus

A Functional Status finding for the Functional Status section, a Functional
Status Observation (`…22.4.67`, the `2014-06-09` stamp). The observation's
`code` is **fixed** to LOINC `54522-8` "Functional status" by the template;
the specific finding is the coded `value`. `value` is the SNOMED CT finding
(e.g. able to walk `165245003`, dependent on wheelchair `105503008`,
self-care `129019007`).

**Functional and mental status are never conflated.** This builds only the
Functional Status templates (section `…22.2.14`, observation `…22.4.67`), so
the parser reads every finding back tagged `domain: "functional"`, a
functional finding is never filed under mental status (or vice versa).

**Unknown is never defaulted to a finding.** When `value` is omitted the
observation's SHALL `value` is emitted as `nullFlavor="UNK"`, an *explicit*
unknown, never invented as a real finding. `effectiveTime` is when the status
was assessed; the template's SHALL effectiveTime is filled with
`nullFlavor="UNK"` when the caller supplies none, never a fabricated date.

#### Example

```ts
import type { BuildCcdaFunctionalStatus } from "@cosyte/ccda";
const ambulation: BuildCcdaFunctionalStatus = {
  value: { code: "165245003", displayName: "Able to walk" }, // SNOMED CT
  effectiveTime: "20240101",
};
const unrecorded: BuildCcdaFunctionalStatus = {}; // → value nullFlavor="UNK"
```

#### Properties

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The date the status was assessed (HL7 date string); `nullFlavor="UNK"` when omitted.

##### value?

> `readonly` `optional` **value?**: [`BuildCode`](#buildcode)

The SNOMED CT functional-status finding (the observation `value`). Omit for
an explicit unknown (`value nullFlavor="UNK"`), never defaulted to a real
finding.

***

### BuildCcdaFunctionalStatusOrganizer

A Functional Status Organizer for the Functional Status section, a Functional
Status Organizer (`…22.4.66`, the `2014-06-09` stamp, `@classCode="CLUSTER"`)
that **groups** two or more related Functional Status Observations (`…22.4.67`)
under one categorization. Use it instead of standalone findings when the
assessment is a cluster (e.g. all self-care ADLs recorded together); each
grouped observation is otherwise identical to a standalone
[BuildCcdaFunctionalStatus](#buildccdafunctionalstatus) and reads back tagged `domain: "functional"`.

**`code` is the organizer's categorization, not a finding.** It SHALL be present
[1..1] and SHOULD be drawn from ICF (`2.16.840.1.113883.6.254`) or LOINC, pass
the ICF chapter/category (e.g. `d5` "Self-care") via `code` with its
`codeSystem`. When omitted the SHALL `code` is emitted as `nullFlavor="UNK"`, an
*explicit* unknown category, never a fabricated one. `codeSystem` defaults to
LOINC when a `code` is supplied without one.

**`findings` must be non-empty.** The organizer SHALL contain at least one
[1..\*] Functional Status Observation; an empty organizer is a `TypeError`
(never an organizer emitted with zero members). The Assessment Scale Observation
(`…22.4.69`), a scored scale such as a Barthel index, is a *direct section
entry* in C-CDA R2.1, **not** an organizer component; only status observations
are grouped here.

**`selfCareActivities` decides whether the organizer is emitted at all, and
that is a conformance rule rather than a preference.** The R2.1 template SHALL
also contain at least one [1..\*] component holding a Self-Care Activities (ADL
and IADL) observation (`…22.4.128`, CONF:1098-31432), measured against the
normative Schematron this repository pins. When none is supplied there is no
conformant organizer to emit and none is fabricated, so the `findings` are
emitted as standalone Functional Status Observations instead, which every
reader of this section understands, and the built document carries
`MISSING_SELF_CARE_ACTIVITY` saying the grouping was dropped and why. Supply
one activity and the organizer is emitted with its categorization and its
`effectiveTime` intact.

#### Example

```ts
import type { BuildCcdaFunctionalStatusOrganizer } from "@cosyte/ccda";
const selfCare: BuildCcdaFunctionalStatusOrganizer = {
  code: { code: "d5", displayName: "Self-care", codeSystem: "2.16.840.1.113883.6.254" }, // ICF
  effectiveTime: "20240101",
  findings: [
    { value: { code: "129019007", displayName: "Self-care" } }, // SNOMED CT
    { value: { code: "165245003", displayName: "Able to walk" } },
  ],
  selfCareActivities: [
    {
      code: { code: "54520-2", displayName: "Bathing" }, // LOINC, ADL Result Type
      value: { code: "371153006", displayName: "Independent" }, // SNOMED CT, Ability
    },
  ],
};
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`BuildCode`](#buildcode)

The organizer's categorization `code` (SHOULD be ICF or LOINC). Omit for an
explicit unknown (`code nullFlavor="UNK"`), never a fabricated category.
`codeSystem` defaults to LOINC when a `code` is supplied without one.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

When the grouped assessment was performed (HL7 date string); omitted (not fabricated) when absent.

##### findings

> `readonly` **findings**: readonly [`BuildCcdaFunctionalStatus`](#buildccdafunctionalstatus)[]

The Functional Status Observations grouped by this organizer. **Must be
non-empty**, the organizer SHALL contain at least one member.

##### selfCareActivities?

> `readonly` `optional` **selfCareActivities?**: readonly [`BuildCcdaSelfCareActivity`](#buildccdaselfcareactivity)[]

The Self-Care Activities (ADL and IADL) observations grouped by this
organizer. The template SHALL contain at least one; with none supplied the
organizer is not emitted and its findings are emitted standalone, reported
as `MISSING_SELF_CARE_ACTIVITY`.

***

### BuildCcdaImmunization

An Immunization Activity for the Immunizations section. `vaccine` is the CVX
coded product (CVX by default). `dose` and `route` are optional and **never
guessed**, an omitted one is simply left absent. `refused: true` emits the
administration with `negationInd="true"` (a *not-administered* / refused
record), which the parser reads back as `refused` and flags
`IMMUNIZATION_REFUSED`, the clinically load-bearing refusal is surfaced, never
conflated with a `nullFlavor` "unknown". `effectiveTime` is the administration
date; when omitted the SHALL slot is filled with `nullFlavor="UNK"`.

#### Example

```ts
import type { BuildCcdaImmunization } from "@cosyte/ccda";
const flu: BuildCcdaImmunization = {
  vaccine: { code: "140", displayName: "Influenza, split virus, trivalent, injectable, preservative free" }, // CVX
  dose: { value: 0.5, unit: "mL" },
  route: { code: "C28161", displayName: "Intramuscular" }, // NCI Thesaurus
  effectiveTime: "20240101",
};
const refused: BuildCcdaImmunization = {
  vaccine: { code: "140", displayName: "Influenza, split virus, trivalent, injectable, preservative free" },
  refused: true,
};
```

#### Properties

##### dose?

> `readonly` `optional` **dose?**: [`BuildQuantity`](#buildquantity)

The amount administered (`doseQuantity`), optional, never defaulted.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The administration date as an HL7 date string; `nullFlavor="UNK"` when omitted.

##### refused?

> `readonly` `optional` **refused?**: `boolean`

Emit a refused / not-administered record (`negationInd="true"`); parser flags `IMMUNIZATION_REFUSED`.

##### route?

> `readonly` `optional` **route?**: [`BuildCode`](#buildcode)

The administration route (`routeCode`); NCI Thesaurus by default.

##### status?

> `readonly` `optional` **status?**: `string`

The `statusCode`; defaults to `"completed"`.

##### vaccine

> `readonly` **vaccine**: [`BuildCode`](#buildcode)

The CVX-coded vaccine product (CVX by default).

***

### BuildCcdaInit

Input to [buildCcda](#buildccda). `patient` is required; each clinical collection
backing a CCD SHALL section (`problems`, `allergies`, `medications`, `results`,
`vitalSigns`, `smokingStatus`) defaults to empty, in which case its section is
emitted as a spec-clean empty `nullFlavor="NI"` section. `immunizations` is optional, its section is emitted
only when populated (Immunizations is not a CCD SHALL section). `documentType`
is `"ccd"` (the default), `"referralNote"` or `"dischargeSummary"`; the other
nine C-CDA R2.1 document types are not implemented.

#### Example

```ts
import type { BuildCcdaInit } from "@cosyte/ccda";
const init: BuildCcdaInit = {
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
  allergies: [{ noKnownAllergy: true }],
};
```

#### Properties

##### allergies?

> `readonly` `optional` **allergies?**: readonly [`BuildCcdaAllergy`](#buildccdaallergy)[]

Allergy Concerns for the Allergies section; empty section when omitted.

##### assessment?

> `readonly` `optional` **assessment?**: `string`

The Assessment Section narrative (`documentType: "referralNote"` only; with
Plan of Treatment it satisfies the Referral Note's Assessment/Plan choice,
CONF:1198-29102). Narrative-only, so this is a free-text
clinician summary; when omitted the section is emitted as a spec-clean
empty `nullFlavor="NI"` section (never a fabricated assessment). Ignored for
a CCD; refused with a `TypeError` for a Discharge Summary, which carries no
Assessment Section.

##### confidentiality?

> `readonly` `optional` **confidentiality?**: `string`

The confidentiality code; defaults to `"N"` (normal).

##### custodianName?

> `readonly` `optional` **custodianName?**: `string`

The custodian organization name; defaults to a synthetic label.

##### dischargeDiagnoses?

> `readonly` `optional` **dischargeDiagnoses?**: readonly [`BuildCcdaProblem`](#buildccdaproblem)[]

The discharge diagnoses for the Discharge Diagnosis Section
(`documentType: "dischargeSummary"` only, a Discharge Summary SHALL section,
CONF:1198-30524). Each is emitted as a Problem Observation (V3) under the
single Hospital Discharge Diagnosis act the section's entry requires; when
omitted the SHALL section is emitted as an empty `nullFlavor="NI"` section,
which is conformant because the section's entry is optional
(CONF:1198-15489). Read back through `getProblems` is NOT how these surface:
they are diagnoses of the stay, not the concern list. Refused with a
`TypeError` for the other document types, rather than dropped.

##### documentId?

> `readonly` `optional` **documentId?**: `string`

The document `id`'s extension; a synthetic id is generated when omitted.

##### documentType?

> `readonly` `optional` **documentType?**: [`BuildableDocumentType`](#buildabledocumenttype)

The document type, `"ccd"` (default), `"referralNote"` or
`"dischargeSummary"`. Each specializes the US Realm Header (its own document
`templateId` + LOINC `code`) and its SHALL section set; the other nine C-CDA
R2.1 document types are not emitted, and asking for one throws rather than
emitting a document that merely resembles it.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string` \| `Date`

The document `effectiveTime` (a `Date` is formatted to UTC); defaults to now.

##### encompassingEncounter?

> `readonly` `optional` **encompassingEncounter?**: [`BuildCcdaEncompassingEncounter`](#buildccdaencompassingencounter)

The `componentOf/encompassingEncounter` frame
(`documentType: "dischargeSummary"` only, CONF:1198-8471). Supplies the
encounter period's two bounds and the discharge disposition; each slot the
caller omits is emitted as an explicit `nullFlavor="UNK"` rather than
guessed. When the whole field is omitted the frame is still emitted, with
every slot unknown, because the document type's rule requires it. Refused
with a `TypeError` for the other document types, whose rules do not carry
the frame, rather than dropped.

##### encounters?

> `readonly` `optional` **encounters?**: readonly [`BuildCcdaEncounter`](#buildccdaencounter)[]

Encounter Activities; the Encounters section is emitted only when non-empty (a CCD SHOULD section).

##### familyHistory?

> `readonly` `optional` **familyHistory?**: readonly [`BuildCcdaFamilyHistory`](#buildccdafamilyhistory)[]

Family history for the Family History section; the section is emitted only
when non-empty (a CCD SHOULD section). Each entry is one relative (a Family
History Organizer) carrying that relative's conditions, read back via
`getFamilyHistory`, grouped by relative.

##### functionalStatus?

> `readonly` `optional` **functionalStatus?**: readonly [`BuildCcdaFunctionalStatus`](#buildccdafunctionalstatus)[]

Standalone Functional Status findings; the Functional Status section is emitted when this or [functionalStatusOrganizers](#functionalstatusorganizers) is non-empty (a CCD SHOULD section).

##### functionalStatusOrganizers?

> `readonly` `optional` **functionalStatusOrganizers?**: readonly [`BuildCcdaFunctionalStatusOrganizer`](#buildccdafunctionalstatusorganizer)[]

Functional Status Organizers (each grouping ≥1 Functional Status Observation
under one categorization); emitted into the Functional Status section
alongside any standalone [functionalStatus](#functionalstatus-1) findings. The section is
emitted when either is non-empty.

##### functionalStatusScales?

> `readonly` `optional` **functionalStatusScales?**: readonly [`BuildCcdaAssessmentScale`](#buildccdaassessmentscale)[]

Direct-entry Assessment Scale Observations (`…22.4.69`) for the Functional
Status section, scored instruments (e.g. a Barthel index, a Glasgow Coma
scale). Emitted as direct section entries (the conformant R2.1 placement),
read back tagged `assessmentScale: true`, `domain: "functional"`. The
Functional Status section is emitted when this, [functionalStatus](#functionalstatus-1), or
[functionalStatusOrganizers](#functionalstatusorganizers) is non-empty.

##### hospitalCourse?

> `readonly` `optional` **hospitalCourse?**: `string`

The Hospital Course Section narrative (`documentType: "dischargeSummary"`
only, a Discharge Summary SHALL section, CONF:1198-30522). Narrative-only,
so this is the free-text account of the stay; when omitted the SHALL section
is emitted as a spec-clean empty `nullFlavor="NI"` section, never an
invented course. Refused with a `TypeError` for the other document types,
rather than dropped.

##### immunizations?

> `readonly` `optional` **immunizations?**: readonly [`BuildCcdaImmunization`](#buildccdaimmunization)[]

Immunization Activities; the Immunizations section is emitted only when non-empty.

##### languageCode?

> `readonly` `optional` **languageCode?**: `string`

The document language; defaults to `"en-US"`.

##### medications?

> `readonly` `optional` **medications?**: readonly [`BuildCcdaMedication`](#buildccdamedication)[]

Medication Activities for the Medications section; an empty section when
omitted for a CCD or a Referral Note, whose SHALL sets include it. A
Discharge Summary's does not, so for that type the section is emitted only
when this is non-empty, and always as the Medications Section, never as the
Discharge Medications Section.

##### mentalStatus?

> `readonly` `optional` **mentalStatus?**: readonly [`BuildCcdaMentalStatus`](#buildccdamentalstatus)[]

Standalone Mental Status findings; the Mental Status section is emitted when this or [mentalStatusOrganizers](#mentalstatusorganizers) is non-empty (a CCD SHOULD section).

##### mentalStatusOrganizers?

> `readonly` `optional` **mentalStatusOrganizers?**: readonly [`BuildCcdaMentalStatusOrganizer`](#buildccdamentalstatusorganizer)[]

Mental Status Organizers (each grouping ≥1 Mental Status Observation under one
categorization); emitted into the Mental Status section alongside any
standalone [mentalStatus](#mentalstatus-1) findings. The section is emitted when either is
non-empty.

##### mentalStatusScales?

> `readonly` `optional` **mentalStatusScales?**: readonly [`BuildCcdaAssessmentScale`](#buildccdaassessmentscale)[]

Direct-entry Assessment Scale Observations (`…22.4.69`) for the Mental Status
section, scored instruments (e.g. a PHQ-9 depression screen, a MoCA). Emitted
as direct section entries (the conformant R2.1 placement), read back tagged
`assessmentScale: true`, `domain: "mental"`. The Mental Status section is
emitted when this, [mentalStatus](#mentalstatus-1), or [mentalStatusOrganizers](#mentalstatusorganizers) is
non-empty.

##### pastMedicalHistory?

> `readonly` `optional` **pastMedicalHistory?**: readonly [`BuildCcdaProblem`](#buildccdaproblem)[]

Historical problems for the Past Medical History section; the section is
emitted only when non-empty (a CCD MAY section). Each is a bare Problem
Observation (not a concern act), read back via `getPastMedicalHistory`, never
conflated with the active Problems returned by `getProblems`.

##### patient

> `readonly` **patient**: [`BuildCcdaPatient`](#buildccdapatient)

The single record-target patient (required).

##### planOfTreatment?

> `readonly` `optional` **planOfTreatment?**: readonly [`BuildCcdaPlannedItem`](#buildccdaplanneditem)[]

Planned items for the Plan of Treatment section; the section is emitted only
when non-empty (a CCD SHOULD section). Every item is future/ordered, read
back via `getPlannedItems` with `disposition: "planned"`, never conflated
with the performed Procedures/Encounters.

##### problems?

> `readonly` `optional` **problems?**: readonly [`BuildCcdaProblem`](#buildccdaproblem)[]

Problem Concerns for the Problems section; an empty section when omitted
for a CCD or a Referral Note, whose SHALL sets include it. A Discharge
Summary's does not, so for that type the section is emitted only when this
is non-empty.

##### procedures?

> `readonly` `optional` **procedures?**: readonly [`BuildCcdaProcedure`](#buildccdaprocedure)[]

Procedures; the Procedures section is emitted only when non-empty (a CCD SHOULD section).

##### reasonForReferral?

> `readonly` `optional` **reasonForReferral?**: `string`

The Reason for Referral Section narrative (`documentType: "referralNote"`
only, a Referral Note SHALL section). Narrative-only free text; when omitted
the SHALL section is emitted as an empty `nullFlavor="NI"` section (never a
fabricated reason). Ignored for a CCD; refused with a `TypeError` for a
Discharge Summary, which carries no Reason for Referral Section.

##### results?

> `readonly` `optional` **results?**: readonly [`BuildCcdaResultPanel`](#buildccdaresultpanel)[]

Result panels for the Results section; an empty section when omitted for a
CCD, whose SHALL set includes it. For a Referral Note or a Discharge Summary
the section is emitted only when this is non-empty.

##### smokingStatus?

> `readonly` `optional` **smokingStatus?**: readonly [`BuildCcdaSmokingStatus`](#buildccdasmokingstatus)[]

Smoking Status observations for the Social History section. Social History is
a **CCD SHALL** section (CONF:1198-30688), so for a CCD the section is always
emitted, as a `nullFlavor="NI"` shell when this is empty. For document types
whose SHALL set excludes it, the section is emitted only when non-empty.

##### title?

> `readonly` `optional` **title?**: `string`

The document title; defaults to the document type's own title ("Summarization of Episode Note" for a CCD).

##### vitalSigns?

> `readonly` `optional` **vitalSigns?**: readonly [`BuildCcdaVitalsPanel`](#buildccdavitalspanel)[]

Vital Signs panels for the Vital Signs section; an empty section when omitted
for a CCD, whose SHALL set includes it. For a Referral Note or a Discharge
Summary the section is emitted only when this is non-empty.

***

### BuildCcdaMedication

A Medication Activity for the Medications section. `drug` is the RxNorm coded
product (RxNorm by default). `dose`, `route`, `frequency`, and `duration` are
all optional and **never guessed**: an omitted `dose`/`route` is emitted as
absent, which the parser then flags (`MISSING_DOSE_QUANTITY` /
`MISSING_ROUTE_CODE`) rather than being defaulted to a confident-wrong value.
`frequency` is the periodic timing (a `PIVL_TS` period, e.g. every 8 hours);
`duration` is the therapy window (an `IVL_TS` low/high), the two are emitted
as distinct `effectiveTime` siblings, never conflated.

#### Example

```ts
import type { BuildCcdaMedication } from "@cosyte/ccda";
const lisinopril: BuildCcdaMedication = {
  drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
  dose: { value: 1, unit: "{tablet}" },
  route: { code: "C38288", displayName: "Oral" },
  frequency: { value: 24, unit: "h" },
};
```

#### Properties

##### dose?

> `readonly` `optional` **dose?**: [`BuildQuantity`](#buildquantity)

The dose per administration (`doseQuantity`); absent → parser flags it.

##### drug

> `readonly` **drug**: [`BuildCode`](#buildcode)

The coded drug product (RxNorm by default, or NDC).

##### duration?

> `readonly` `optional` **duration?**: `object`

The therapy window (`IVL_TS`) as HL7 date strings; either bound optional.

###### high?

> `readonly` `optional` **high?**: `string`

###### low?

> `readonly` `optional` **low?**: `string`

##### frequency?

> `readonly` `optional` **frequency?**: [`BuildQuantity`](#buildquantity)

The periodic dosing frequency, a `PIVL_TS` period (e.g. `{ value: 8, unit: "h" }`).

##### route?

> `readonly` `optional` **route?**: [`BuildCode`](#buildcode)

The administration route (`routeCode`); NCI Thesaurus by default.

##### status?

> `readonly` `optional` **status?**: `"active"` \| `"resolved"` \| `"inactive"`

Active / resolved / inactive; maps to the `statusCode`. Defaults to `"active"`.

***

### BuildCcdaMentalStatus

A Mental Status finding for the Mental Status section, a Mental Status
Observation (`…22.4.74`, the R2.1 `2015-08-01` stamp). The observation's `code`
is **fixed** to SNOMED CT `373930000` "Cognitive function finding" by the R2.1
template; the specific cognition/mood finding is the coded `value` (e.g. memory
impairment `386807006`, no abnormality detected `281900007`, SNOMED CT).

**Mental and functional status are never conflated.** This builds only the
Mental Status templates (section `…22.2.56`, observation `…22.4.74`), so the
parser reads every finding back tagged `domain: "mental"`, a mental finding is
never filed under functional status (or vice versa); the two extractors key off
their distinct observation template roots.

**Unknown is never defaulted to a finding.** When `value` is omitted the
observation's SHALL `value` is emitted as `nullFlavor="UNK"`, an *explicit*
unknown, never invented as a real finding. `effectiveTime` is when the status
was assessed; the template's SHALL effectiveTime is filled with
`nullFlavor="UNK"` when the caller supplies none, never a fabricated date.

#### Example

```ts
import type { BuildCcdaMentalStatus } from "@cosyte/ccda";
const memory: BuildCcdaMentalStatus = {
  value: { code: "386807006", displayName: "Memory impairment" }, // SNOMED CT
  effectiveTime: "20240101",
};
const unrecorded: BuildCcdaMentalStatus = {}; // → value nullFlavor="UNK"
```

#### Properties

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The date the status was assessed (HL7 date string); `nullFlavor="UNK"` when omitted.

##### value?

> `readonly` `optional` **value?**: [`BuildCode`](#buildcode)

The SNOMED CT mental-status finding (the observation `value`). Omit for an
explicit unknown (`value nullFlavor="UNK"`), never defaulted to a real
finding.

***

### BuildCcdaMentalStatusOrganizer

A Mental Status Organizer for the Mental Status section, a Mental Status
Organizer (`…22.4.75`, the R2.1 `2015-08-01` stamp, `@classCode="CLUSTER"`) that
**groups** two or more related Mental Status Observations (`…22.4.74`) under one
categorization. Use it instead of standalone findings when the assessment is a
cluster (e.g. an orientation battery); each grouped observation is otherwise
identical to a standalone [BuildCcdaMentalStatus](#buildccdamentalstatus) and reads back tagged
`domain: "mental"`, **never conflated** with functional status (the two key off
distinct organizer/observation roots).

**`code` is the organizer's categorization, not a finding.** It SHALL be present
[1..1] and SHOULD be drawn from ICF (`2.16.840.1.113883.6.254`) or LOINC. When
omitted the SHALL `code` is emitted as `nullFlavor="UNK"`, an *explicit* unknown
category, never fabricated. `codeSystem` defaults to LOINC when a `code` is
supplied without one.

**`findings` must be non-empty.** The organizer SHALL contain at least one
[1..\*] Mental Status Observation; an empty organizer is a `TypeError`. The
Assessment Scale Observation (`…22.4.69`) is a *direct section entry* in R2.1,
**not** an organizer component.

#### Example

```ts
import type { BuildCcdaMentalStatusOrganizer } from "@cosyte/ccda";
const cognition: BuildCcdaMentalStatusOrganizer = {
  effectiveTime: "20240101",
  findings: [
    { value: { code: "386807006", displayName: "Memory impairment" } }, // SNOMED CT
    { value: { code: "247663003", displayName: "Orientation finding" } },
  ],
};
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`BuildCode`](#buildcode)

The organizer's categorization `code` (SHOULD be ICF or LOINC). Omit for an
explicit unknown (`code nullFlavor="UNK"`), never a fabricated category.
`codeSystem` defaults to LOINC when a `code` is supplied without one.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

When the grouped assessment was performed (HL7 date string); omitted (not fabricated) when absent.

##### findings

> `readonly` **findings**: readonly [`BuildCcdaMentalStatus`](#buildccdamentalstatus)[]

The Mental Status Observations grouped by this organizer. **Must be
non-empty**, the organizer SHALL contain at least one member.

***

### BuildCcdaOptions

Options for [buildCcda](#buildccda). Every field is optional, `buildCcda(init)` is
valid and produces the default behavior.

#### Example

```ts
import type { BuildCcdaOptions, TerminologyAdapter } from "@cosyte/ccda";
const adapter: TerminologyAdapter = { validateCode: (c) => ({ result: myService.has(c.code) }) };
const opts: BuildCcdaOptions = { terminology: adapter };
```

#### Properties

##### terminology?

> `readonly` `optional` **terminology?**: [`TerminologyAdapter`](#terminologyadapter)

An optional consumer-supplied bring-your-own [TerminologyAdapter](#terminologyadapter). Two
paths consume it: (1) its `validateCode` is forwarded to the internal re-parse
so a built document surfaces `SEMANTIC_CODE_INVALID` for any coded value the
adapter rejects; (2) its optional `translate` is consulted at each clinical
coded slot (problem value, allergen, medication drug + route, vaccine + route)
to emit `<translation>` alternate codings **beside** the primary code. The
builder never coerces a code to satisfy the adapter, it emits every primary
value verbatim, a `<translation>` is only ever an *additional* alternate, and
an adapter with no `translate` opinion produces byte-identical output. Omit for
the default behavior.

***

### BuildCcdaPatient

A patient for the document's single `recordTarget`. Every field is optional;
an omitted demographic is emitted as a spec-clean `nullFlavor="UNK"` rather
than invented. Supply `mrn` to set the patient identifier the parser returns
from [CcdaDocument.getMrn](#getmrn).

#### Example

```ts
import type { BuildCcdaPatient } from "@cosyte/ccda";
const patient: BuildCcdaPatient = {
  mrn: "MRN001",
  given: ["Jane"],
  family: "Doe",
  gender: "F",
  birthTime: "19800101",
};
```

#### Properties

##### birthTime?

> `readonly` `optional` **birthTime?**: `string`

Birth time as an HL7 date/datetime string (e.g. `"19800101"`).

##### family?

> `readonly` `optional` **family?**: `string`

##### gender?

> `readonly` `optional` **gender?**: `string`

Administrative gender code (`M` / `F` / `UN`), HL7 AdministrativeGender.

##### given?

> `readonly` `optional` **given?**: readonly `string`[]

##### mrn?

> `readonly` `optional` **mrn?**: `string`

The medical record number (the `patientRole/id/@extension`).

##### mrnAssigningAuthority?

> `readonly` `optional` **mrnAssigningAuthority?**: `string`

The assigning-authority name for the MRN; defaults to a synthetic label.

##### mrnRoot?

> `readonly` `optional` **mrnRoot?**: `string`

The assigning-authority OID for the MRN; defaults to a synthetic root.

##### prefix?

> `readonly` `optional` **prefix?**: readonly `string`[]

##### suffix?

> `readonly` `optional` **suffix?**: readonly `string`[]

***

### BuildCcdaPlannedAct

A planned Act / Encounter / Procedure (`…4.39` / `…4.40` / `…4.41`). `mood`
accepts the full Planned moodCode value set including the appointment moods
(`APT`/`ARQ`), which are valid on these element domains. Default code system:
SNOMED CT for an act/procedure, CPT for an encounter.

#### Example

```ts
import type { BuildCcdaPlannedAct } from "@cosyte/ccda";
const visit: BuildCcdaPlannedAct = {
  kind: "encounter",
  code: { code: "99213", displayName: "Office outpatient visit 15 minutes" },
  mood: "APT",
};
```

#### Extends

- `BuildCcdaPlannedItemBase`

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The planned act/observation/drug code; default code system varies by `kind`.

###### Inherited from

`BuildCcdaPlannedItemBase.code`

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The planned time as an HL7 date string; emitted only when supplied, never
fabricated.

**`[0..1]` is the cardinality on five of the seven templates, not on all of
them.**
Both `substanceAdministration` variants SHALL carry exactly one:
Planned Medication Activity (`…4.42`, CONF:1098-30468) and Planned
Immunization Activity (`…4.120`). [BuildCcdaPlannedImmunization](#buildccdaplannedimmunization)
redeclares this field as required, which is why omitting it there is a type
error; [BuildCcdaPlannedOrder](#buildccdaplannedorder) does not, so `buildCcda` will emit a
Planned Medication Activity short that SHALL element if you leave it out.

**The field stays optional, and the omission is REPORTED rather than silent
BY `buildCcda`.** Making it required would be a breaking change to a
published input type, so the decision taken was to keep the type as it is
and have [buildCcda](#buildccda) raise
`MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` on the returned document. The
document is still emitted, still short that element, and no date is ever
fabricated to fill it.

**`editCcda` reports it too**, so a planned medication grafted in by an edit
is no longer emitted short the SHALL element in silence. Its check is scoped
to the sections **that call grafted** and that **survived** into the emitted
document: an offending edit a later edit in the same call discarded says
nothing (reading the caller's ordered edit list instead reports a violation
against a conformant document), and an offending act the source already
carried is never re-reported. So the absence of this code from
`editCcda(...).warnings` says only that the sections **that call wrote**
carry no planned medication short this element; it says nothing about the
rest of the document, and nothing about any other conformance rule.

###### Inherited from

`BuildCcdaPlannedItemBase.effectiveTime`

##### kind

> `readonly` **kind**: `"procedure"` \| `"act"` \| `"encounter"`

##### mood?

> `readonly` `optional` **mood?**: [`PlannedActMood`](#plannedactmood)

The planned `@moodCode`; defaults to `"INT"`. Appointment moods allowed here.

***

### BuildCcdaPlannedImmunization

A planned Immunization Activity (`…4.120`). `mood` excludes the appointment
moods, the same `substanceAdministration` domain a
[BuildCcdaPlannedOrder](#buildccdaplannedorder) draws on. `code` is the **vaccine**, emitted in
the `consumable` (Immunization Medication Information `…4.54`) and defaulting
to **CVX**, never RxNorm: the two `substanceAdministration` planned variants
have different default systems because their slot bindings differ.

**`effectiveTime` is required here because the template requires it**, and the
builder is conservative on emit, so the type requires what the template
requires rather than emitting a document short a SHALL element or fabricating
a date the caller never supplied. C-CDA makes `effectiveTime` `[1..1]` on this
template, "the time that the immunization activity should occur".

**Do not read that as "this is the only planned template that requires it".**
C-CDA makes
`effectiveTime` `[1..1]` on **both** `substanceAdministration` planned
variants: Planned Medication Activity (`…4.42`) SHALL carry exactly one too
(CONF:1098-30468). It is the other **five** (`…4.39`, `…4.40`, `…4.41`,
`…4.43`, `…4.44`) that make it `[0..1]`. [BuildCcdaPlannedOrder](#buildccdaplannedorder) still
types `effectiveTime` as optional for its `medicationActivity` arm, so
`buildCcda` can emit a Planned Medication Activity short that SHALL element.
Making the field required on `BuildCcdaPlannedOrder` would be a breaking
change to a published type, so the field stands as it is and the omission is
**reported** instead (`MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, raised by
both writers on the document they emit, never by `parseCcda`).
No such diagnostic exists for this template, and adding one would be dead
code: omitting the field here does not compile.

#### Example

```ts
import type { BuildCcdaPlannedImmunization } from "@cosyte/ccda";
const dueFluShot: BuildCcdaPlannedImmunization = {
  kind: "immunizationActivity",
  code: { code: "140", displayName: "Influenza, split virus, trivalent, injectable, preservative free" },
  effectiveTime: "20241001",
};
```

#### Extends

- `BuildCcdaPlannedItemBase`

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The planned act/observation/drug code; default code system varies by `kind`.

###### Inherited from

`BuildCcdaPlannedItemBase.code`

##### effectiveTime

> `readonly` **effectiveTime**: `string`

When the immunization should occur. **Required**: the template makes it `[1..1]`.

###### Overrides

`BuildCcdaPlannedItemBase.effectiveTime`

##### kind

> `readonly` **kind**: `"immunizationActivity"`

##### mood?

> `readonly` `optional` **mood?**: [`PlannedOrderMood`](#plannedordermood)

The planned `@moodCode`; defaults to `"INT"`. Appointment moods not representable.

***

### BuildCcdaPlannedObservation

A planned Observation (`…4.44`). `mood` excludes the appointment moods (not in
`x_ActMoodDocumentObservation`). `value` is the expected coded result (a
goal/target, SNOMED CT by default), emitted only when supplied. Default code
system for the observation `code`: LOINC.

#### Example

```ts
import type { BuildCcdaPlannedObservation } from "@cosyte/ccda";
const cbc: BuildCcdaPlannedObservation = {
  kind: "observation",
  code: { code: "58410-2", displayName: "CBC panel" }, // LOINC
  mood: "RQO",
  effectiveTime: "20240801",
};
```

#### Extends

- `BuildCcdaPlannedItemBase`

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The planned act/observation/drug code; default code system varies by `kind`.

###### Inherited from

`BuildCcdaPlannedItemBase.code`

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The planned time as an HL7 date string; emitted only when supplied, never
fabricated.

**`[0..1]` is the cardinality on five of the seven templates, not on all of
them.**
Both `substanceAdministration` variants SHALL carry exactly one:
Planned Medication Activity (`…4.42`, CONF:1098-30468) and Planned
Immunization Activity (`…4.120`). [BuildCcdaPlannedImmunization](#buildccdaplannedimmunization)
redeclares this field as required, which is why omitting it there is a type
error; [BuildCcdaPlannedOrder](#buildccdaplannedorder) does not, so `buildCcda` will emit a
Planned Medication Activity short that SHALL element if you leave it out.

**The field stays optional, and the omission is REPORTED rather than silent
BY `buildCcda`.** Making it required would be a breaking change to a
published input type, so the decision taken was to keep the type as it is
and have [buildCcda](#buildccda) raise
`MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` on the returned document. The
document is still emitted, still short that element, and no date is ever
fabricated to fill it.

**`editCcda` reports it too**, so a planned medication grafted in by an edit
is no longer emitted short the SHALL element in silence. Its check is scoped
to the sections **that call grafted** and that **survived** into the emitted
document: an offending edit a later edit in the same call discarded says
nothing (reading the caller's ordered edit list instead reports a violation
against a conformant document), and an offending act the source already
carried is never re-reported. So the absence of this code from
`editCcda(...).warnings` says only that the sections **that call wrote**
carry no planned medication short this element; it says nothing about the
rest of the document, and nothing about any other conformance rule.

###### Inherited from

`BuildCcdaPlannedItemBase.effectiveTime`

##### kind

> `readonly` **kind**: `"observation"`

##### mood?

> `readonly` `optional` **mood?**: [`PlannedOrderMood`](#plannedordermood)

The planned `@moodCode`; defaults to `"INT"`. Appointment moods not representable.

##### value?

> `readonly` `optional` **value?**: [`BuildCode`](#buildcode)

The expected coded result `value` (`xsi:type="CD"`, SNOMED CT default), the
plan's goal/target. Emitted only when supplied; never fabricated.

***

### BuildCcdaPlannedOrder

A planned Medication Activity or Supply (`…4.42` / `…4.43`). `mood` excludes
the appointment moods (not in these elements' base mood domain). The drug/supply
code defaults to RxNorm (medication, emitted in the `consumable`) / SNOMED CT
(supply).

#### Example

```ts
import type { BuildCcdaPlannedOrder } from "@cosyte/ccda";
const order: BuildCcdaPlannedOrder = {
  kind: "medicationActivity",
  code: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
  mood: "RQO",
};
```

#### Extends

- `BuildCcdaPlannedItemBase`

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The planned act/observation/drug code; default code system varies by `kind`.

###### Inherited from

`BuildCcdaPlannedItemBase.code`

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The planned time as an HL7 date string; emitted only when supplied, never
fabricated.

**`[0..1]` is the cardinality on five of the seven templates, not on all of
them.**
Both `substanceAdministration` variants SHALL carry exactly one:
Planned Medication Activity (`…4.42`, CONF:1098-30468) and Planned
Immunization Activity (`…4.120`). [BuildCcdaPlannedImmunization](#buildccdaplannedimmunization)
redeclares this field as required, which is why omitting it there is a type
error; [BuildCcdaPlannedOrder](#buildccdaplannedorder) does not, so `buildCcda` will emit a
Planned Medication Activity short that SHALL element if you leave it out.

**The field stays optional, and the omission is REPORTED rather than silent
BY `buildCcda`.** Making it required would be a breaking change to a
published input type, so the decision taken was to keep the type as it is
and have [buildCcda](#buildccda) raise
`MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` on the returned document. The
document is still emitted, still short that element, and no date is ever
fabricated to fill it.

**`editCcda` reports it too**, so a planned medication grafted in by an edit
is no longer emitted short the SHALL element in silence. Its check is scoped
to the sections **that call grafted** and that **survived** into the emitted
document: an offending edit a later edit in the same call discarded says
nothing (reading the caller's ordered edit list instead reports a violation
against a conformant document), and an offending act the source already
carried is never re-reported. So the absence of this code from
`editCcda(...).warnings` says only that the sections **that call wrote**
carry no planned medication short this element; it says nothing about the
rest of the document, and nothing about any other conformance rule.

###### Inherited from

`BuildCcdaPlannedItemBase.effectiveTime`

##### kind

> `readonly` **kind**: `"medicationActivity"` \| `"supply"`

##### mood?

> `readonly` `optional` **mood?**: [`PlannedOrderMood`](#plannedordermood)

The planned `@moodCode`; defaults to `"INT"`. Appointment moods not representable.

***

### BuildCcdaProblem

A Problem Concern for the Problems section. The coded `problem` (SNOMED CT by
default, or ICD-10-CM) is the condition; `status` maps to the concern act's
status (active/resolved/inactive) and is never guessed.

`onset` is the condition's onset date (the concern/observation `effectiveTime`
`low`); `resolution` is its resolution date (the `high`, a.k.a. "resolution
date", when the condition became biologically resolved). Per the C-CDA R2.1
Problem Observation (`…22.4.4`) rule the *presence* of a `high`, whether a
real date or `nullFlavor="UNK"`, itself asserts the problem is resolved, so a
`resolution` is only meaningful on a **resolved** concern: [buildCcda](#buildccda)
throws when `resolution` is supplied without `status: "resolved"` rather than
emit a completion date on a still-active problem. A resolved problem whose
resolution date is unknown still emits a `nullFlavor="UNK"` `high` (the SHALL
form), never a fabricated date.

#### Example

```ts
import type { BuildCcdaProblem } from "@cosyte/ccda";
const p: BuildCcdaProblem = {
  problem: { code: "59621000", displayName: "Essential hypertension" },
  status: "active",
  onset: "20210101",
};
const resolved: BuildCcdaProblem = {
  problem: { code: "195967001", displayName: "Asthma" },
  status: "resolved",
  onset: "20180301",
  resolution: "20220615",
};
```

#### Properties

##### onset?

> `readonly` `optional` **onset?**: `string`

Onset date as an HL7 date string (e.g. `"20210101"`), the `effectiveTime/low`, optional.

##### problem

> `readonly` **problem**: [`BuildCode`](#buildcode)

The coded condition (SNOMED CT default, or ICD-10-CM).

##### resolution?

> `readonly` `optional` **resolution?**: `string`

Resolution date as an HL7 date string (the `effectiveTime/high`, a.k.a.
"resolution date"). Requires `status: "resolved"`, a resolution date on a
non-resolved problem is a contradiction [buildCcda](#buildccda) rejects. Omitting
it on a resolved problem still emits a `nullFlavor="UNK"` `high`.

##### status?

> `readonly` `optional` **status?**: `"active"` \| `"resolved"` \| `"inactive"`

Active / resolved / inactive; defaults to `"active"`.

***

### BuildCcdaProcedure

A Procedure for the Procedures section. `kind` selects the C-CDA Procedure
Activity variant, an altering/operative `"procedure"` (default, `<procedure>`
`…22.4.14`), a non-altering `"act"` service (`<act>` `…22.4.12`), or an
assessment `"observation"` (`<observation>` `…22.4.13`). `code` is the coded
procedure (SNOMED CT by default, or CPT / ICD-10-PCS / LOINC) and is required
(the template SHALL contain a `code`). `disposition` maps to the act's
`moodCode`, **performed** (`EVN`) vs **planned** (`INT`), which the parser
reads back as its performed-vs-planned disposition; the two are never
conflated. `effectiveTime` is emitted only when supplied (the template's
effectiveTime is SHOULD [0..1], CONF:1098-7662, not fabricated when unknown).

#### Example

```ts
import type { BuildCcdaProcedure } from "@cosyte/ccda";
const appendectomy: BuildCcdaProcedure = {
  code: { code: "80146002", displayName: "Appendectomy" },
  disposition: "performed",
  effectiveTime: "20230615",
};
const plannedColonoscopy: BuildCcdaProcedure = {
  code: { code: "73761001", displayName: "Colonoscopy" },
  disposition: "planned",
};
```

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The coded procedure (SNOMED CT by default, or CPT / ICD-10-PCS / LOINC).

##### disposition?

> `readonly` `optional` **disposition?**: `"performed"` \| `"planned"`

Performed (`EVN`) or planned (`INT`); defaults to `"performed"`. Never conflated.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The procedure date as an HL7 date string; emitted only when supplied (SHOULD [0..1]).

##### kind?

> `readonly` `optional` **kind?**: [`ProcedureKind`](#procedurekind-1)

The Procedure Activity variant; defaults to `"procedure"` (operative).

##### status?

> `readonly` `optional` **status?**: `string`

The `statusCode`; defaults per disposition (performed → `"completed"`,
planned → `"active"`). SHALL [1..1] on the template, so always emitted.

##### value?

> `readonly` `optional` **value?**: [`BuildCode`](#buildcode)

The coded result `value` (`xsi:type="CD"`, SNOMED CT default). **Required for
the `"observation"` variant**, Procedure Activity Observation (`…22.4.13`)
SHALL contain a `value` [1..1], and ignored for the other two variants;
[buildCcda](#buildccda) throws if a `"observation"` procedure omits it.

***

### BuildCcdaResult

One member observation of a Results panel, a Result Observation. `test` is the
LOINC test code. **Exactly one** value form is required: a UCUM `quantity`
(`xsi:type="PQ"`), a `codedValue` (`xsi:type="CD"`), or a `stringValue`
(`xsi:type="ST"`), the builder throws if none (or more than one) is set, so a
result value is never silently dropped or invented. `referenceRange` (when
given) is emitted as a structured `IVL_PQ` so it round-trips numerically.

#### Example

```ts
import type { BuildCcdaResult } from "@cosyte/ccda";
const glucose: BuildCcdaResult = {
  test: { code: "2345-7", displayName: "Glucose" },
  quantity: { value: 95, unit: "mg/dL" },
  referenceRange: { low: { value: 70, unit: "mg/dL" }, high: { value: 100, unit: "mg/dL" } },
  interpretation: { code: "N", displayName: "Normal" },
};
```

#### Properties

##### codedValue?

> `readonly` `optional` **codedValue?**: [`BuildCode`](#buildcode)

A `CD` value. Exactly one of `quantity`/`codedValue`/`stringValue`.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The observation time as an HL7 date string, optional.

##### interpretation?

> `readonly` `optional` **interpretation?**: [`BuildCode`](#buildcode)

The H/L/N interpretation (HL7 ObservationInterpretation by default), optional.

##### quantity?

> `readonly` `optional` **quantity?**: [`BuildQuantity`](#buildquantity)

A `PQ` value (UCUM). Exactly one of `quantity`/`codedValue`/`stringValue`.

##### referenceRange?

> `readonly` `optional` **referenceRange?**: `object`

The normal interval, emitted as a structured `IVL_PQ`; either bound optional.

###### high?

> `readonly` `optional` **high?**: [`BuildQuantity`](#buildquantity)

###### low?

> `readonly` `optional` **low?**: [`BuildQuantity`](#buildquantity)

##### stringValue?

> `readonly` `optional` **stringValue?**: `string`

A free-text (`ST`) value. Exactly one of `quantity`/`codedValue`/`stringValue`.

##### test

> `readonly` **test**: [`BuildCode`](#buildcode)

The LOINC test code.

***

### BuildCcdaResultPanel

A Results panel, a Result Organizer (the battery/panel wrapper, e.g. a CBC)
around one or more [BuildCcdaResult](#buildccdaresult) member observations. `code` is the
panel LOINC; `status` maps to the organizer `statusCode` (default
`"completed"`).

#### Example

```ts
import type { BuildCcdaResultPanel } from "@cosyte/ccda";
const cmp: BuildCcdaResultPanel = {
  code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
  results: [{ test: { code: "2345-7", displayName: "Glucose" }, quantity: { value: 95, unit: "mg/dL" } }],
};
```

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The panel/battery LOINC code.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The panel's span/collection time as an HL7 date string. Emitted as the
organizer's `effectiveTime`; when omitted the SHALL slot is filled with
`nullFlavor="UNK"` (the member observations still carry their own times).

##### results

> `readonly` **results**: readonly [`BuildCcdaResult`](#buildccdaresult)[]

The member Result Observations (at least one for a populated panel).

##### status?

> `readonly` `optional` **status?**: `string`

The organizer `statusCode`; defaults to `"completed"`.

***

### BuildCcdaSelfCareActivity

One Self-Care Activities (ADL and IADL) observation (`…22.4.128`), the
activity a Functional Status Organizer SHALL carry at least one of
(CONF:1098-31432). `code` names the activity assessed and SHOULD come from the
ADL Result Type value set (LOINC, `2.16.840.1.113883.11.20.9.47`); `value` is
the ability observed and SHOULD come from the Ability value set (SNOMED CT,
`2.16.840.1.113883.11.20.9.46`).

**Nothing here is defaulted.** An omitted `code` or `value` is emitted
`nullFlavor="UNK"`, an explicit unknown rather than an invented activity or an
invented ability, and an omitted `effectiveTime` is the same: the template's
SHALL is satisfied without fabricating a date.

#### Example

```ts
import type { BuildCcdaSelfCareActivity } from "@cosyte/ccda";
const bathing: BuildCcdaSelfCareActivity = {
  code: { code: "54520-2", displayName: "Bathing" }, // LOINC, ADL Result Type
  value: { code: "371153006", displayName: "Independent" }, // SNOMED CT, Ability
  effectiveTime: "20240101",
};
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`BuildCode`](#buildcode)

The activity assessed (SHOULD be LOINC, ADL Result Type). Omit for an
explicit unknown (`code nullFlavor="UNK"`), never a fabricated activity.
`codeSystem` defaults to LOINC when a `code` is supplied without one.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The date the activity was assessed (HL7 date string); `nullFlavor="UNK"` when omitted.

##### value?

> `readonly` `optional` **value?**: [`BuildCode`](#buildcode)

The ability observed (SHOULD be SNOMED CT, Ability). Omit for an explicit
unknown (`value nullFlavor="UNK"`), never a fabricated ability.

***

### BuildCcdaSmokingStatus

A Smoking Status observation for the Social History section, the Smoking
Status, Meaningful Use observation (`…22.4.78`), the safety-relevant
social-history fact most consumers ask for. `value` is the SNOMED CT concept
from the Current Smoking Status value set (`2.16.840.1.113883.11.20.9.38`,
e.g. former smoker `8517006`, never smoker `266919005`, current every-day
smoker `449868002`).

**Unknown is never defaulted to a status.** When `value` is omitted the
observation's SHALL `value` is emitted as `nullFlavor="UNK"`, an *explicit*
unknown that the parser reads back as `unknown: true` (and flags
`SMOKING_STATUS_UNKNOWN`). The builder will **never** invent a "never smoker"
(or any other) reading the caller did not supply: absent status ≠ non-smoker.
`effectiveTime` is when the status was recorded; `nullFlavor="UNK"` when omitted.

#### Example

```ts
import type { BuildCcdaSmokingStatus } from "@cosyte/ccda";
const former: BuildCcdaSmokingStatus = {
  value: { code: "8517006", displayName: "Former smoker" }, // SNOMED CT
  effectiveTime: "20240101",
};
const unrecorded: BuildCcdaSmokingStatus = {}; // → value nullFlavor="UNK"
```

#### Properties

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The date the status was recorded (HL7 date string); `nullFlavor="UNK"` when omitted.

##### status?

> `readonly` `optional` **status?**: `string`

The observation `statusCode`; defaults to `"completed"`.

##### value?

> `readonly` `optional` **value?**: [`BuildCode`](#buildcode)

The SNOMED CT smoking-status concept (Current Smoking Status value set).
Omit for an explicit unknown (`value nullFlavor="UNK"`), never defaulted to
a real status.

***

### BuildCcdaVital

One member reading of a Vital Signs panel, a Vital Sign Observation. `code` is
the LOINC vital (e.g. `8480-6` systolic BP); `quantity` is the UCUM-checked
`PQ` reading (required, a vital sign without a value is not emitted).

#### Example

```ts
import type { BuildCcdaVital } from "@cosyte/ccda";
const systolic: BuildCcdaVital = {
  code: { code: "8480-6", displayName: "Systolic blood pressure" },
  quantity: { value: 120, unit: "mm[Hg]" },
};
```

#### Properties

##### code

> `readonly` **code**: [`BuildCode`](#buildcode)

The LOINC vital-sign code.

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The reading time as an HL7 date string, optional.

##### interpretation?

> `readonly` `optional` **interpretation?**: [`BuildCode`](#buildcode)

The H/L/N interpretation (HL7 ObservationInterpretation by default), optional.

##### quantity

> `readonly` **quantity**: [`BuildQuantity`](#buildquantity)

The reading as a UCUM `PQ` (required).

***

### BuildCcdaVitalsPanel

A Vital Signs panel, a Vital Signs Organizer clustering the readings taken in
one event (e.g. a set of vitals at a single visit). `status` maps to the
organizer `statusCode` (default `"completed"`); `vitals` are the member
readings.

#### Example

```ts
import type { BuildCcdaVitalsPanel } from "@cosyte/ccda";
const panel: BuildCcdaVitalsPanel = {
  vitals: [
    { code: { code: "8480-6", displayName: "Systolic blood pressure" }, quantity: { value: 120, unit: "mm[Hg]" } },
    { code: { code: "8462-4", displayName: "Diastolic blood pressure" }, quantity: { value: 80, unit: "mm[Hg]" } },
  ],
};
```

#### Properties

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: `string`

The cluster's reading time as an HL7 date string. Emitted as the organizer's
SHALL `effectiveTime`; when omitted the slot is filled with `nullFlavor="UNK"`.

##### status?

> `readonly` `optional` **status?**: `string`

The organizer `statusCode`; defaults to `"completed"`.

##### vitals

> `readonly` **vitals**: readonly [`BuildCcdaVital`](#buildccdavital)[]

The member Vital Sign Observations (at least one for a populated panel).

***

### BuildCode

A coded value for the builder, the tuple the parser reads back as a `CD`.
`codeSystem` defaults per slot (SNOMED CT for a problem, RxNorm for an
allergen), so most callers pass only `code` + `displayName`.

#### Example

```ts
import type { BuildCode } from "@cosyte/ccda";
const hypertension: BuildCode = { code: "59621000", displayName: "Essential hypertension" };
```

#### Properties

##### code

> `readonly` **code**: `string`

The code within its system (e.g. a SNOMED CT concept id).

##### codeSystem?

> `readonly` `optional` **codeSystem?**: `string`

The code system OID; defaults per slot when omitted.

##### codeSystemName?

> `readonly` `optional` **codeSystemName?**: `string`

The code system's human name (e.g. `"SNOMED CT"`), optional.

##### displayName

> `readonly` **displayName**: `string`

The human-readable label, regenerated into the narrative so the two agree.

***

### BuildQuantity

A dimensioned quantity for the builder, a numeric `value` and a **UCUM** unit
(the parser round-trips it as a `PQ`). The unit is emitted verbatim: it is the
caller's responsibility that it be valid, case-correct UCUM (`"mg/dL"`,
`"mm[Hg]"`, `"10*3/uL"`), because a non-UCUM or case-slipped unit is a real
defect the parser is designed to flag (`NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT`),
the builder never silently "corrects" a unit to a confident-wrong value.

#### Example

```ts
import type { BuildQuantity } from "@cosyte/ccda";
const glucose: BuildQuantity = { value: 95, unit: "mg/dL" };
```

#### Properties

##### unit

> `readonly` **unit**: `string`

The UCUM unit (emitted verbatim, must be valid, case-correct UCUM).

##### value

> `readonly` **value**: `number`

The numeric magnitude.

***

### CcdaAuthor

A parsed `author` participation: who (or what) authored the content, at the
level the participation was written on. `identifiers` are the
`assignedAuthor/id` values; exactly one of `person` and `device` is populated
on a conforming participation (the CDA R2 `assignedAuthor` choice);
`representedOrganization` is the organization the document states the author
acted for; `time` is the author time at the precision the document stated,
never completed and never defaulted (`clinical-safety` C3).

`unidentified` is `true` exactly when the participation carried neither arm of
the choice, which the US Realm Header requires one of (CONF:1198-8456). Such
an author is still surfaced and still conducts to nested levels, beside an
`UNIDENTIFIED_AUTHOR` warning, rather than being dropped: "an author whose
identity the document never states" and "no author" are different facts.

#### Example

```ts
import type { CcdaAuthor } from "@cosyte/ccda";
function who(a: CcdaAuthor): string {
  if (a.unidentified) return "author present, identity not stated";
  return a.person?.family ?? a.device?.softwareName ?? "unnamed author";
}
```

#### Properties

##### device?

> `readonly` `optional` **device?**: [`CcdaAuthoringDevice`](#ccdaauthoringdevice)

##### identifiers

> `readonly` **identifiers**: readonly [`II`](#ii)[]

##### person?

> `readonly` `optional` **person?**: [`HumanName`](#humanname)

##### representedOrganization?

> `readonly` `optional` **representedOrganization?**: [`CcdaOrganization`](#ccdaorganization)

##### time?

> `readonly` `optional` **time?**: [`TS`](#ts)

##### unidentified

> `readonly` **unidentified**: `boolean`

***

### CcdaAuthoringDevice

A parsed `assignedAuthoringDevice`, the machine arm of the CDA R2
`assignedAuthor` choice: the software or instrument that authored the content
rather than a person. Both fields are plain labels the document supplied, and
neither is a person's name.

#### Example

```ts
import type { CcdaAuthoringDevice } from "@cosyte/ccda";
function device(d: CcdaAuthoringDevice): string {
  return d.softwareName ?? d.manufacturerModelName ?? "unnamed device";
}
```

#### Properties

##### manufacturerModelName?

> `readonly` `optional` **manufacturerModelName?**: `string`

##### softwareName?

> `readonly` `optional` **softwareName?**: `string`

***

### CcdaAuthorship

The author reading for one level of a document: the document itself, a
`<section>`, or a top-level entry act within a section.

`inherited` is the whole point of the type. `false` means this level carried
these `author` participations itself. `true` means it carried none and these
are the nearest enclosing level's, reported so a consumer is not left with
nothing, and marked so a consumer is never told this level's content was
authored by that person. Reporting the nearest enclosing author and asserting
that this entry's author is that person are different claims, and only the
first is one the document supports.

The reading is **absent** rather than empty when no level carries an author:
nothing is substituted for it, not the record target, not the custodian, not a
legal authenticator, not an informant.

#### Example

```ts
import type { CcdaAuthorship } from "@cosyte/ccda";
function provenance(a: CcdaAuthorship): string {
  const who = a.authors[0]?.person?.family ?? "an unnamed author";
  return a.inherited ? `inherited from an enclosing level: ${who}` : `stated here: ${who}`;
}
```

#### Properties

##### authors

> `readonly` **authors**: readonly [`CcdaAuthor`](#ccdaauthor)[]

##### inherited

> `readonly` **inherited**: `boolean`

***

### CcdaCustodian

A parsed `custodian` participation: the organization that holds the document
and is responsible for maintaining it. The US Realm Header requires exactly
one (CONF:1198-5519).

`organization` is omitted when the `custodian` carried no
`assignedCustodian/representedCustodianOrganization` to read: the participation
is still surfaced, because the document did carry one, and nothing is invented
to fill it.

#### Example

```ts
import type { CcdaCustodian } from "@cosyte/ccda";
function custodianName(c: CcdaCustodian): string {
  return c.organization?.name ?? "custodian present, organization not stated";
}
```

#### Properties

##### organization?

> `readonly` `optional` **organization?**: [`CcdaOrganization`](#ccdaorganization)

***

### CcdaDocumentInit

Constructor init for [CcdaDocument](#ccdadocument). Produced by [buildDocument](#builddocument)
(the parts) plus the orchestrator's accumulated `warnings`. Optional keys are
omitted (never set to `undefined`) per `exactOptionalPropertyTypes`.

#### Example

```ts
import type { CcdaDocumentInit } from "@cosyte/ccda";
const init: CcdaDocumentInit = {
  templateIds: [],
  header: { recordTargets: [], relatedDocuments: [] },
  sections: [],
  problems: [],
  medications: [],
  allergies: [],
  results: [],
  vitals: [],
  immunizations: [],
  procedures: [],
  encounters: [],
  smokingStatus: [],
  plannedItems: [],
  functionalStatus: [],
  mentalStatus: [],
  familyHistory: [],
  pastMedicalHistory: [],
  warnings: [],
};
```

#### Properties

##### allergies

> `readonly` **allergies**: readonly [`AllergyConcern`](#allergyconcern)[]

##### documentType?

> `readonly` `optional` **documentType?**: [`DocumentType`](#documenttype-4)

##### encounters

> `readonly` **encounters**: readonly [`Encounter`](#encounter)[]

##### familyHistory

> `readonly` **familyHistory**: readonly [`FamilyHistory`](#familyhistory-4)[]

##### functionalStatus

> `readonly` **functionalStatus**: readonly [`StatusObservation`](#statusobservation)[]

##### header

> `readonly` **header**: [`CcdaHeader`](#ccdaheader)

##### immunizations

> `readonly` **immunizations**: readonly [`Immunization`](#immunization)[]

##### medications

> `readonly` **medications**: readonly [`Medication`](#medication)[]

##### mentalStatus

> `readonly` **mentalStatus**: readonly [`StatusObservation`](#statusobservation)[]

##### nonXmlBody?

> `readonly` `optional` **nonXmlBody?**: [`ED`](#ed)

##### pastMedicalHistory

> `readonly` **pastMedicalHistory**: readonly [`Problem`](#problem-1)[]

##### plannedItems

> `readonly` **plannedItems**: readonly [`PlannedItem`](#planneditem)[]

##### problems

> `readonly` **problems**: readonly [`ProblemConcern`](#problemconcern)[]

##### procedures

> `readonly` **procedures**: readonly [`Procedure`](#procedure)[]

##### profile?

> `readonly` `optional` **profile?**: [`ProfileAttribution`](#profileattribution)

The [CcdaProfile](#ccdaprofile) applied at parse time (its `name` + resolved
`lineage`), or absent when no profile was active. Attribution only, the
profile's effect is already reflected in `warnings` (tolerated deviations
re-badged `PROFILE_QUIRK_APPLIED`, flagged `expected`).

##### results

> `readonly` **results**: readonly [`ResultOrganizer`](#resultorganizer)[]

##### sections

> `readonly` **sections**: readonly [`CcdaSection`](#ccdasection)[]

##### serialized?

> `readonly` `optional` **serialized?**: `string`

**`Internal`**

The spec-clean XML snapshot captured from the source DOM at parse time,
returned by [CcdaDocument.toString](#tostring). Populated by `parseCcda`; absent
for a hand-constructed document (which therefore cannot be serialized until
a builder API lands).

##### smokingStatus

> `readonly` **smokingStatus**: readonly [`SmokingStatus`](#smokingstatus-4)[]

##### templateIds

> `readonly` **templateIds**: readonly [`II`](#ii)[]

##### vitals

> `readonly` **vitals**: readonly [`VitalSignsOrganizer`](#vitalsignsorganizer)[]

##### warnings

> `readonly` **warnings**: readonly [`CcdaWarning`](#ccdawarning)[]

***

### CcdaEncompassingEncounter

A parsed `componentOf/encompassingEncounter`: the encounter the document
summarises, which an inpatient Discharge Summary carries (CONF:1198-8471,
-8472).

`effectiveTime` is the encounter period as an [IVL\_TS](#ivl_ts), so each bound
keeps `raw` at exactly the precision the document stated and a bound declaring
a `nullFlavor` carries it rather than resolving to a date. The frame itself is
**absent** when the document carries no `componentOf`: its bounds are never
derived from the document `effectiveTime`, from a `documentationOf` service
event, or from any other date in the document.

#### Example

```ts
import type { CcdaEncompassingEncounter } from "@cosyte/ccda";
function admitted(e: CcdaEncompassingEncounter): string | undefined {
  return e.effectiveTime?.low?.raw;
}
```

#### Properties

##### dischargeDispositionCode?

> `readonly` `optional` **dischargeDispositionCode?**: [`CD`](#cd)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

***

### CcdaEntryAuthorship

The author reading for one top-level entry act within a section, beside the
act's own `<id>`s so a consumer can join it to an extracted clinical entry.

`CcdaSection.entryAuthorship` holds one of these per top-level entry act in
the section, in document order, so the Nth element describes the Nth such act.
Every extracted entry family carries an `ids` array read from the same
`<id>` children, so `ids` is the join key where the act carries one and
document order is the join where it does not.

#### Example

```ts
import type { CcdaEntryAuthorship } from "@cosyte/ccda";
function isInherited(e: CcdaEntryAuthorship): boolean {
  return e.authorship?.inherited === true;
}
```

#### Properties

##### authorship?

> `readonly` `optional` **authorship?**: [`CcdaAuthorship`](#ccdaauthorship)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

***

### CcdaHeader

The parsed US Realm Header. `documentId` + `code` + `title` + `effectiveTime`
answer the document's identity; `recordTargets` are the patient(s) (usually
exactly one, more than one emits `MULTIPLE_RECORD_TARGETS`). `setId` +
`versionNumber` + `relatedDocuments` carry the CDA R2 revision chain, a
replacement document (see [editCcda](#editccda)) shares its predecessor's `setId`,
bumps `versionNumber`, and names the prior version in a `RPLC`
[RelatedDocument](#relateddocument).

The three participation readings answer "who wrote it, who holds it, and what
encounter it summarises". `authorship` is the document-level author reading
(its `inherited` is always `false`: the document is the outermost level, so
there is nothing for it to inherit from), `custodian` the organization
responsible for the document, and `encompassingEncounter` the
`componentOf` encounter frame. Each is absent when the document carries none,
and nothing is substituted for an absent one.

#### Example

```ts
import type { CcdaHeader } from "@cosyte/ccda";
function when(h: CcdaHeader): Date | undefined {
  return h.effectiveTime?.date;
}
```

#### Properties

##### authorship?

> `readonly` `optional` **authorship?**: [`CcdaAuthorship`](#ccdaauthorship)

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### confidentialityCode?

> `readonly` `optional` **confidentialityCode?**: [`CD`](#cd)

##### custodian?

> `readonly` `optional` **custodian?**: [`CcdaCustodian`](#ccdacustodian)

##### documentId?

> `readonly` `optional` **documentId?**: [`II`](#ii)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`TS`](#ts)

##### encompassingEncounter?

> `readonly` `optional` **encompassingEncounter?**: [`CcdaEncompassingEncounter`](#ccdaencompassingencounter)

##### languageCode?

> `readonly` `optional` **languageCode?**: `string`

##### recordTargets

> `readonly` **recordTargets**: readonly [`CcdaPatient`](#ccdapatient)[]

##### relatedDocuments

> `readonly` **relatedDocuments**: readonly [`RelatedDocument`](#relateddocument)[]

##### setId?

> `readonly` `optional` **setId?**: [`II`](#ii)

##### title?

> `readonly` `optional` **title?**: `string`

##### versionNumber?

> `readonly` `optional` **versionNumber?**: `number`

***

### CcdaOrganization

A parsed CDA R2 organization: the `representedOrganization` behind an author,
or the `representedCustodianOrganization` behind the custodian. Carries the
organization's identifiers (its NPI, its assigning-authority OID) and its
name. Every field is omitted when the document does not carry it; nothing here
is derived from anywhere else in the document.

#### Example

```ts
import type { CcdaOrganization } from "@cosyte/ccda";
function label(o: CcdaOrganization): string {
  return o.name ?? o.identifiers[0]?.root ?? "unnamed organization";
}
```

#### Properties

##### identifiers

> `readonly` **identifiers**: readonly [`II`](#ii)[]

##### name?

> `readonly` `optional` **name?**: `string`

***

### CcdaParseLimits

Hard safety limits applied to every parse before the XML is handed to the
DOM. Each cap defends a specific denial-of-service vector for hostile XML
(oversized payloads, billion-laughs entity expansion, pathological element
nesting). All four have library defaults; callers may tighten, or, at
their own risk, loosen, any of them via `ParseCcdaOptions.limits`.

#### Example

```ts
import type { CcdaParseLimits } from "@cosyte/ccda";
const tight: CcdaParseLimits = { maxInputBytes: 1_000_000, maxDepth: 100 };
```

#### Properties

##### maxDepth?

> `readonly` `optional` **maxDepth?**: `number`

Maximum element nesting depth. Exceeding it throws `ELEMENT_DEPTH_LIMIT_EXCEEDED`.

##### maxEntityExpansions?

> `readonly` `optional` **maxEntityExpansions?**: `number`

Maximum count of `&...;` entity references permitted in the raw input.

##### maxInputBytes?

> `readonly` `optional` **maxInputBytes?**: `number`

Maximum decoded input size in bytes. Exceeding it throws `INPUT_SIZE_LIMIT_EXCEEDED`.

##### maxNodeCount?

> `readonly` `optional` **maxNodeCount?**: `number`

Maximum total element-node count. Exceeding it throws `NODE_COUNT_LIMIT_EXCEEDED`.

***

### CcdaPatient

A parsed C-CDA patient (`recordTarget/patientRole`). `identifiers` are the
patient ids (the MRN lives here); demographics carry the coded gender, birth
time, and optional race/ethnicity/marital status.

#### Example

```ts
import type { CcdaPatient } from "@cosyte/ccda";
function label(p: CcdaPatient): string {
  return p.name?.family ?? p.identifiers[0]?.extension ?? "unknown";
}
```

#### Properties

##### birthTime?

> `readonly` `optional` **birthTime?**: [`TS`](#ts)

##### ethnicGroupCode?

> `readonly` `optional` **ethnicGroupCode?**: [`CD`](#cd)

##### genderCode?

> `readonly` `optional` **genderCode?**: [`CD`](#cd)

##### identifiers

> `readonly` **identifiers**: readonly [`II`](#ii)[]

##### maritalStatusCode?

> `readonly` `optional` **maritalStatusCode?**: [`CD`](#cd)

##### name?

> `readonly` `optional` **name?**: [`HumanName`](#humanname)

##### raceCode?

> `readonly` `optional` **raceCode?**: [`CD`](#cd)

***

### CcdaPosition

Structural locator attached to every warning and fatal error. Every field is
optional. Together with `code` it is the whole contract for locating a
deviation: no diagnostic message names anything the document said.

**The three string fields the parser populates are bounded, not copied.**
`path` is an element local name, which a sender can make anything, so it is
echoed only when it is a member of the CDA vocabulary this parser navigates
and is `<withheld>` otherwise. `sectionCode` is echoed only when it has the
shape of a LOINC part number, which matters because `UNKNOWN_SECTION_CODE`
fires exactly when the code is unrecognized. `templateId` is echoed only when
it has the shape of an HL7 v3 UID, for the same reason: it is a
consumer-controlled `II.root`. See `./tokens.ts` for all three, and for why a
shape or membership test is used rather than a length cap. `line` and
`column` are the XML locator and are never derived from content.

**Which codes carry which field is narrow, and worth reading before you key a
profile on one.** `sectionCode` is carried by `UNKNOWN_SECTION_CODE`,
`SECTION_MATCHED_BY_LOINC_FALLBACK` and `SUBJECT_CONTEXT_OVERRIDE`, which
names the enclosing section's own `<code>` on its entry-level instances as
well as its section-level one, because a withheld entry is located by which
section it sat in. It is the bounded token or `<withheld>` like any other, and
a section that carries no `<code>` at all contributes none, so a warning about
an entry in an unrecognized section may carry no `sectionCode`.
`templateId` is carried by the first two (the section's first rooted
`<templateId>`) and by the two stamp codes, `TEMPLATE_EXTENSION_ABSENT` and
`TEMPLATE_EXTENSION_UNMODELED_RELEASE` (the matched document-type root, which
is the one templateId either warning is about). No other code carries either,
so a `QuirkMatch` keyed on one narrows those codes and matches nothing on the
rest: an entry-level warning such as `DEPRECATED_LOINC` carries neither field
today, and neither does `REQUIRED_SECTIONS_NOT_EVALUATED`, whose subject is
the document's whole obligation rather than one template.

Two document-level codes carry no `templateId` **on purpose**, and it is a
decision rather than an omission. `MISSING_TEMPLATE_ID` has no template to
name. `UNKNOWN_DOCUMENT_TEMPLATE` has too many: its subject is the templateId
set naming no type, and the obvious pick, the first root in document order, is
the US Realm Header stamp carried by essentially every real C-CDA, so keying a
tolerance on it would read like narrowing while tolerating the code
everywhere.

The claim that stood here through `0.0.4`, that the fields were PHI-free "by
construction" because a `path` carries element names and a `sectionCode` is a
LOINC code, was an assumption about the sender rather than a property of the
parser. For a top-level fatal like
`INPUT_SIZE_LIMIT_EXCEEDED` no field need be populated.

#### Remarks

With `exactOptionalPropertyTypes: true`, do not pass `line: undefined`
explicitly, omit the key instead.

#### Example

```ts
import type { CcdaPosition } from "@cosyte/ccda";
const pos: CcdaPosition = {
  path: "/ClinicalDocument/component/structuredBody/component[3]/section",
  sectionCode: "11450-4",
  templateId: "2.16.840.1.113883.10.20.22.2.5.1",
};
```

#### Properties

##### column?

> `readonly` `optional` **column?**: `number`

##### line?

> `readonly` `optional` **line?**: `number`

##### path?

> `readonly` `optional` **path?**: `string`

##### sectionCode?

> `readonly` `optional` **sectionCode?**: `string`

##### templateId?

> `readonly` `optional` **templateId?**: `string`

***

### CcdaProfile

A frozen, immutable vendor/conformance profile. Produced by
[defineCcdaProfile](#defineccdaprofile); consumers pass it to `parseCcda(raw, { profile })`
(or register it as the process default). Hand-authoring the object literal is
supported but discouraged, the factory validates the safety rules and
attaches `describe()`.

#### Example

```ts
import { parseCcda, ccdaProfiles } from "@cosyte/ccda";
const doc = parseCcda(xml, { profile: ccdaProfiles.smartScorecard });
console.log(doc.profile?.name); // "smartScorecard"
```

#### Properties

##### describe?

> `readonly` `optional` **describe?**: () => `string`

Multi-line human-readable summary; always present on factory-built profiles.

###### Returns

`string`

##### description?

> `readonly` `optional` **description?**: `string`

Optional human-readable description.

##### lineage

> `readonly` **lineage**: readonly `string`[]

Resolved lineage, `[...parents, name]`, first-occurrence deduped.

##### name

> `readonly` **name**: `string`

The profile's unique name (registry key / attribution label).

##### provenance?

> `readonly` `optional` **provenance?**: [`ProfileProvenance`](#profileprovenance)

The cited public grounding for this profile's quirks (absent for `default`).

##### tolerate

> `readonly` **tolerate**: readonly [`QuirkTolerance`](#quirktolerance)[]

The expected, non-safety-critical deviations this profile tolerates.

***

### CcdaReleaseStamp

One entry of this package's closed release-stamp table: a document-template
`@extension` version stamp and the C-CDA release it names.

#### Example

```ts
import type { CcdaReleaseStamp } from "@cosyte/ccda";
const r21: CcdaReleaseStamp = { stamp: "2015-08-01", release: "R2.1" };
```

#### Properties

##### release

> `readonly` **release**: `"R2.1"` \| `"R3.0 or later"`

The release that stamp names.

##### stamp

> `readonly` **stamp**: `string`

The `templateId/@extension` value, e.g. `2015-08-01`.

***

### CcdaSection

A framed C-CDA section. `key`/`title` carry the recognized identity (when the
section matched the catalog); `code` and `templateIds` are the raw signals;
`narrativeText` is the human-readable `<text>` block and `narrativeById`
indexes its `ID`-bearing nodes; `subsections` holds nested
`<component><section>` children.

`authorship` is the section's author reading and `entryAuthorship` holds one
reading per top-level entry act in the section, in document order. Either is
the level's own participation where it carries one, and otherwise the nearest
enclosing level's marked `inherited`; both are absent when no enclosing level
carries an author either. `entryAuthorship` runs over the entry acts a
record-target read path may read, so an entry an overriding `<subject>`
declaration governs is absent from it entirely, exactly as it is absent from
every extracted entry family.

`entryAuthorship` is optional on the type and always populated by the parser:
[buildSection](#buildsection) sets it on every section it frames, empty where the
section has no entry act to read. It is optional because this interface is an
INPUT surface as well as an output one, reachable through
`CcdaDocumentInit.sections`, so requiring it would stop a consumer's existing
section literal from compiling.

#### Example

```ts
import type { CcdaSection } from "@cosyte/ccda";
function summarize(s: CcdaSection): string {
  return `${s.key ?? "unknown"}: ${s.narrativeText ?? "(no narrative)"}`;
}
```

#### Properties

##### authorship?

> `readonly` `optional` **authorship?**: [`CcdaAuthorship`](#ccdaauthorship)

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### entryAuthorship?

> `readonly` `optional` **entryAuthorship?**: readonly [`CcdaEntryAuthorship`](#ccdaentryauthorship)[]

##### key?

> `readonly` `optional` **key?**: `string`

##### narrativeById

> `readonly` **narrativeById**: `ReadonlyMap`\<`string`, `string`\>

##### narrativeText?

> `readonly` `optional` **narrativeText?**: `string`

##### recognizedBy?

> `readonly` `optional` **recognizedBy?**: `"templateId"` \| `"loinc"`

##### subsections

> `readonly` **subsections**: readonly [`CcdaSection`](#ccdasection)[]

##### templateIds

> `readonly` **templateIds**: readonly [`II`](#ii)[]

##### title?

> `readonly` `optional` **title?**: `string`

***

### CcdaWarning

Data shape for every Tier-2 warning emitted by the parser. Warnings are
plain data (distinct from `CcdaParseError`, which is a thrown `Error`
subclass) so they can be safely accumulated into `CcdaDocument.warnings`
and passed to `onWarning` callbacks.

#### Example

```ts
import type { CcdaWarning } from "@cosyte/ccda";
const w: CcdaWarning = {
  code: "UNKNOWN_SECTION_CODE",
  message: "The section's LOINC code is not a recognized C-CDA section; retained as narrative-only.",
  position: { sectionCode: "99999-9" },
};
```

#### Properties

##### code

> `readonly` **code**: [`WarningCode`](#warningcode)

##### expected?

> `readonly` `optional` **expected?**: `boolean`

`true` when an active [CcdaProfile](#ccdaprofile) *expected* this deviation and
downgraded it, the warning is retained (never dropped) but flagged so a
consumer can filter known, tolerated noise from novel deviations. In strict
mode an `expected` warning does **not** escalate to a thrown error. Absent
(not `false`) when no profile touched the warning.

##### message

> `readonly` **message**: `string`

##### position

> `readonly` **position**: [`CcdaPosition`](#ccdaposition)

##### profile?

> `readonly` `optional` **profile?**: `string`

The name of the [CcdaProfile](#ccdaprofile) that tolerated this warning, when `expected`.

##### toleratedCode?

> `readonly` `optional` **toleratedCode?**: [`WarningCode`](#warningcode)

When `code` is [WARNING\_CODES.PROFILE\_QUIRK\_APPLIED](#profile_quirk_applied), the original
warning code the profile tolerated, so the specific deviation
(`DEPRECATED_LOINC`, `TEMPLATE_EXTENSION_ABSENT`, …) is never lost, only
re-badged as expected.

##### valueSet?

> `readonly` `optional` **valueSet?**: `"2.16.840.1.113883.3.88.12.3221.7.4"` \| `"2.16.840.1.113762.1.4.1010.4"` \| `"2.16.840.1.113762.1.4.1010.1"` \| `"2.16.840.1.113883.3.88.12.3221.8.7"` \| `"2.16.840.1.113762.1.4.1010.6"`

When `code` is [WARNING\_CODES.VALUE\_SET\_BINDING\_VIOLATED](#value_set_binding_violated) or
[WARNING\_CODES.VALUE\_SET\_BINDING\_NOT\_EVALUATED](#value_set_binding_not_evaluated), the OID of the value
set the slot's C-CDA binding names.

It is a member of BOUND\_VALUE\_SETS, a closed list this module owns,
never a value read from the document, which is why it can ride on a
diagnostic at all: the factories take [BoundValueSet](#boundvalueset), so the compiler
holds that bound rather than the next author's memory. It is a field rather
than part of the message for the same reason every other identifier here is:
a message comes whole from the frozen registry and interpolates nothing.

##### valueSetRelease?

> `readonly` `optional` **valueSetRelease?**: `string`

When `code` is [WARNING\_CODES.VALUE\_SET\_BINDING\_VIOLATED](#value_set_binding_violated) or
[WARNING\_CODES.VALUE\_SET\_BINDING\_NOT\_EVALUATED](#value_set_binding_not_evaluated), the release the
supplying [ValueSetSource](#valuesetsource) declared for the package it answered from.

C-CDA states that any valid expansion of a value set is conformant against a
Required binding, so a non-membership finding is only ever a statement about
the expansion that answered. Without this a finding would assert
non-conformance it cannot support. The string is the consumer's own package
label, supplied with the source and never read from a document.

***

### CD

Parsed HL7 v3 coded value. `code` + `codeSystem` form the bound concept;
`displayName` is the human label; `originalText` is the source text the code
was derived from; `translation` holds alternative codings (e.g. a local code
alongside a LOINC/SNOMED standard).

#### Example

```ts
import type { CD } from "@cosyte/ccda";
const sectionCode: CD = {
  code: "48765-2",
  codeSystem: "2.16.840.1.113883.6.1",
  displayName: "Allergies",
};
```

#### Properties

##### code?

> `readonly` `optional` **code?**: `string`

##### codeSystem?

> `readonly` `optional` **codeSystem?**: `string`

##### codeSystemName?

> `readonly` `optional` **codeSystemName?**: `string`

##### displayName?

> `readonly` `optional` **displayName?**: `string`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### originalText?

> `readonly` `optional` **originalText?**: `string`

##### translation?

> `readonly` `optional` **translation?**: readonly [`CD`](#cd)[]

***

### ClinicalEntries

The clinical entries extracted from a document body: the reconciliation triad
(Problems, Medications, Allergies), the discrete-data sections (Results, Vital
Signs, Immunizations), Procedures, Encounters, Social-History smoking
status, and the remaining clinical sections (Plan of Treatment,
Functional/Mental Status, Family/Past Medical History). Empty
arrays when a body carries none.

#### Example

```ts
import type { ClinicalEntries } from "@cosyte/ccda";
function summarize(e: ClinicalEntries): number {
  return e.problems.length + e.medications.length + e.allergies.length;
}
```

#### Properties

##### allergies

> `readonly` **allergies**: readonly [`AllergyConcern`](#allergyconcern)[]

##### encounters

> `readonly` **encounters**: readonly [`Encounter`](#encounter)[]

##### familyHistory

> `readonly` **familyHistory**: readonly [`FamilyHistory`](#familyhistory-4)[]

##### functionalStatus

> `readonly` **functionalStatus**: readonly [`StatusObservation`](#statusobservation)[]

##### immunizations

> `readonly` **immunizations**: readonly [`Immunization`](#immunization)[]

##### medications

> `readonly` **medications**: readonly [`Medication`](#medication)[]

##### mentalStatus

> `readonly` **mentalStatus**: readonly [`StatusObservation`](#statusobservation)[]

##### pastMedicalHistory

> `readonly` **pastMedicalHistory**: readonly [`Problem`](#problem-1)[]

##### plannedItems

> `readonly` **plannedItems**: readonly [`PlannedItem`](#planneditem)[]

##### problems

> `readonly` **problems**: readonly [`ProblemConcern`](#problemconcern)[]

##### procedures

> `readonly` **procedures**: readonly [`Procedure`](#procedure)[]

##### results

> `readonly` **results**: readonly [`ResultOrganizer`](#resultorganizer)[]

##### smokingStatus

> `readonly` **smokingStatus**: readonly [`SmokingStatus`](#smokingstatus-4)[]

##### vitals

> `readonly` **vitals**: readonly [`VitalSignsOrganizer`](#vitalsignsorganizer)[]

***

### CodeTranslationResult

The outcome of [TerminologyAdapter.translate](#translate), modeled on the FHIR
`$translate` operation and `@cosyte/terminology`'s `translate`. `matches` are
the declared target codings, drawn **verbatim** from the consumer's map; an
empty array means the source did not map. Per the never-fabricate invariant an
adapter must return an empty `matches` for an unmapped source, **never a
guessed target**.

**Consumed on build.** `@cosyte/ccda` defines this so a consumer can wire a
ConceptMap-backed engine in behind [TerminologyAdapter.translate](#translate).
`buildCcda` consults it at each clinical coded slot (problem value, allergen,
medication drug + route, vaccine + route) and emits any returned coding as a
spec-clean CDA R2 `<translation>` alternate **beside** the primary code, never
replacing it, and never fabricated (an empty `matches` emits nothing). The
alternates round-trip through `parseCcda` into `CD.translation`. `translate`
stays optional on the interface: a validation-only adapter need not implement it,
and its absence yields byte-identical output.

#### Example

```ts
import type { CodeTranslationResult } from "@cosyte/ccda";
const mapped: CodeTranslationResult = {
  matches: [{ system: "2.16.840.1.113883.6.90", code: "I10", display: "Essential hypertension" }],
};
```

#### Properties

##### matches

> `readonly` **matches**: readonly [`TerminologyCoding`](#terminologycoding)[]

The declared target codings, verbatim from the map. Empty ⇒ unmapped (never a fabricated target).

***

### CodeValidationResult

The outcome of [TerminologyAdapter.validateCode](#validatecode), modeled on the FHIR
`$validate-code` operation's out-parameters. `result` is the verdict: `true`
when the adapter confirms the code is a valid, active member of its system;
`false` when it confirms the code is **not** (unknown / retired / not a
member). `display` and `message` are advisory only, the parser **never**
applies `display` back onto the document (that would be a silent coercion);
both are surfaced to the consumer, never woven into a PHI-free warning message.

#### Example

```ts
import type { CodeValidationResult } from "@cosyte/ccda";
const invalid: CodeValidationResult = { result: false, message: "not in SNOMED CT US Edition" };
```

#### Properties

##### display?

> `readonly` `optional` **display?**: `string`

The authoritative display the adapter knows for the code, when it has one. Advisory, never applied.

##### message?

> `readonly` `optional` **message?**: `string`

A human-readable reason (e.g. why a code is invalid). Advisory, never placed in a warning.

##### result

> `readonly` **result**: `boolean`

`true` when the code is a valid member of its system; `false` when it is not.

***

### DateParts

The calendar components a parsed value actually stated, and nothing else.

A component the value did not state is **absent**: the key is not present at all, rather
than present holding `undefined`, so `Object.keys()` of the result is exactly the set of
stated components and the value's precision is recoverable from it. Nothing is zero-filled,
`month` is the spec-native 1 to 12 rather than the JS `Date` 0 to 11, and the names are
singular.

That shape is chosen so that deleting `offsetMinutes` leaves an object
`Temporal.PlainDateTime.from` and luxon `DateTime.fromObject` both accept with no key rename
and no value adjustment. Neither library is a dependency of this package and neither is
imported: the compatibility is a property of the shape, stated here rather than proved by a
test that would need one of them installed.

#### Example

```ts
import { toObject, type DateParts } from "@cosyte/ccda";
const parts: DateParts | undefined = toObject({ raw: "20260628" });
// => { year: 2026, month: 6, day: 28 }, and no other key
```

#### Properties

##### day?

> `readonly` `optional` **day?**: `number`

##### hour?

> `readonly` `optional` **hour?**: `number`

##### millisecond?

> `readonly` `optional` **millisecond?**: `number`

##### minute?

> `readonly` `optional` **minute?**: `number`

##### month?

> `readonly` `optional` **month?**: `number`

##### offsetMinutes?

> `readonly` `optional` **offsetMinutes?**: `number`

Signed minutes east of UTC, present if and only if the value carried an explicit offset.

##### second?

> `readonly` `optional` **second?**: `number`

##### year?

> `readonly` `optional` **year?**: `number`

***

### DefineCcdaProfileOptions

Options accepted by [defineCcdaProfile](#defineccdaprofile). Mirrors the [CcdaProfile](#ccdaprofile)
shape minus the derived `lineage`/`describe`, plus the `extends` input key.
Every field except `name` is optional.

#### Example

```ts
import { defineCcdaProfile, type DefineCcdaProfileOptions } from "@cosyte/ccda";
const opts: DefineCcdaProfileOptions = {
  name: "my-site",
  extends: ccdaProfiles.smartScorecard,
  tolerate: [{ code: "UNKNOWN_SECTION_CODE", rationale: "site-local sections" }],
};
const p = defineCcdaProfile(opts);
```

#### Properties

##### description?

> `readonly` `optional` **description?**: `string`

##### extends?

> `readonly` `optional` **extends?**: [`CcdaProfile`](#ccdaprofile) \| readonly [`CcdaProfile`](#ccdaprofile)[]

##### name

> `readonly` **name**: `string`

##### provenance?

> `readonly` `optional` **provenance?**: [`ProfileProvenance`](#profileprovenance)

##### tolerate?

> `readonly` `optional` **tolerate?**: readonly [`QuirkTolerance`](#quirktolerance)[]

***

### DocumentIdInit

A CDA R2 instance identifier (`root` OID with an optional `extension`) for a
caller-supplied document `id` or `setId` in a [RevisionInit](#revisioninit).

#### Example

```ts
import type { DocumentIdInit } from "@cosyte/ccda";
const id: DocumentIdInit = { root: "2.16.840.1.113883.19.5", extension: "DOC-2" };
```

#### Properties

##### extension?

> `readonly` `optional` **extension?**: `string`

##### root

> `readonly` **root**: `string`

***

### ED

Parsed HL7 v3 Encapsulated Data. `value` is the inline content (verbatim,
never base64-decoded); `reference` is the `<reference @value>` URI pointing
at out-of-line content (e.g. a narrative `#id` or an external image).

#### Example

```ts
import type { ED } from "@cosyte/ccda";
const ref: ED = { mediaType: "image/png", representation: "B64", reference: "#img1" };
```

#### Properties

##### mediaType?

> `readonly` `optional` **mediaType?**: `string`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### reference?

> `readonly` `optional` **reference?**: `string`

##### representation?

> `readonly` `optional` **representation?**: `string`

##### value?

> `readonly` `optional` **value?**: `string`

***

### EditCcdaOptions

Options for [editCcda](#editccda): the ordered list of section edits to apply, and
the revision behavior. `revision` defaults to an automatic `RPLC` revision;
pass a [RevisionInit](#revisioninit) to override its ids/version, or `false` to edit in
place without stamping a new document version.

#### Example

```ts
import type { EditCcdaOptions } from "@cosyte/ccda";
const opts: EditCcdaOptions = {
  sections: [{ kind: "medications", content: [] }],
  revision: false,
};
```

#### Properties

##### revision?

> `readonly` `optional` **revision?**: `false` \| [`RevisionInit`](#revisioninit)

##### sections?

> `readonly` `optional` **sections?**: readonly [`SectionEdit`](#sectionedit)[]

##### terminology?

> `readonly` `optional` **terminology?**: [`TerminologyAdapter`](#terminologyadapter)

An optional consumer-supplied bring-your-own [TerminologyAdapter](#terminologyadapter),
forwarded to the final re-parse of the edited document so it surfaces
`SEMANTIC_CODE_INVALID` for any coded value the adapter rejects, the same
semantic-validation tier `parseCcda` and `buildCcda` already offer, now
reaching the edited output. `editCcda` never coerces a code to satisfy the
adapter (it emits every value verbatim, byte-faithful on untouched sections
and spec-clean on the one it rebuilds); the adapter can only ever add a flag.
Omit for the default recognize-only behavior. `@cosyte/ccda` never imports a
terminology library; you supply the adapter.

***

### Encounter

A single Encounter Activity. `code` is the encounter type; `statusCode` is the
encounter status; `effectiveTime` is the visit/admission period; `narrative`
is the resolved `<text>` reference.

#### Example

```ts
import type { Encounter } from "@cosyte/ccda";
function encounterType(e: Encounter): string | undefined {
  return e.code?.code;
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### moodCode?

> `readonly` `optional` **moodCode?**: `string`

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

***

### FamilyHistory

A Family History Organizer: one relative plus the conditions recorded for
them. `relative` carries the structured family-member identity; `observations`
are that relative's conditions.

#### Example

```ts
import type { FamilyHistory } from "@cosyte/ccda";
function conditionCount(h: FamilyHistory): number {
  return h.observations.length;
}
```

#### Properties

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### observations

> `readonly` **observations**: readonly [`FamilyHistoryObservation`](#familyhistoryobservation)[]

##### relative

> `readonly` **relative**: [`FamilyMember`](#familymember)

***

### FamilyHistoryObservation

A single condition in a relative's history. `condition` is the coded problem
(SNOMED CT / ICD-10-CM); `ageAtOnset` is the relative's age (a `PQ` in years)
from the nested Age Observation; `causeOfDeath` is `true` when a Family History
Death Observation marks this condition as the cause of death. `negated` and
`nullFlavor` are kept distinct, never collapsed.

#### Example

```ts
import type { FamilyHistoryObservation } from "@cosyte/ccda";
function fatal(o: FamilyHistoryObservation): boolean {
  return o.causeOfDeath === true;
}
```

#### Properties

##### ageAtOnset?

> `readonly` `optional` **ageAtOnset?**: [`PQ`](#pq)

##### causeOfDeath?

> `readonly` `optional` **causeOfDeath?**: `boolean`

##### condition?

> `readonly` `optional` **condition?**: [`CD`](#cd)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### negated?

> `readonly` `optional` **negated?**: `boolean`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

***

### FamilyMember

The family member a [FamilyHistory](#familyhistory-4) group describes. `relationship` is
the coded relation (e.g. SNOMED/HL7 `FTH` father); `gender` the relative's
administrative gender; `birthTime` their birth date; `deceased` the
`sdtc:deceasedInd` flag. All optional, a document may name only the relation.

#### Example

```ts
import type { FamilyMember } from "@cosyte/ccda";
const m: FamilyMember = { relationship: { code: "FTH", displayName: "Father" } };
```

#### Properties

##### birthTime?

> `readonly` `optional` **birthTime?**: [`TS`](#ts)

##### deceased?

> `readonly` `optional` **deceased?**: `boolean`

##### gender?

> `readonly` `optional` **gender?**: [`CD`](#cd)

##### relationship?

> `readonly` `optional` **relationship?**: [`CD`](#cd)

***

### HumanName

A parsed C-CDA person name (`<name>`). Captures the structured parts plus the
`text` fallback (the element's full trimmed text) for senders that put the
whole name in a single node.

`text` is set whether or not the parts are, so on a structured name it is the
parts' text run together with whatever whitespace the document put between
them: `JaneDoe` from compact XML, including every document `buildCcda` emits.
To display a structured name, join `prefix`, `given`, `family` and `suffix`.

#### Example

```ts
import type { HumanName } from "@cosyte/ccda";
const n: HumanName = { given: ["Jane"], family: "Doe", text: "JaneDoe" };
```

#### Properties

##### family?

> `readonly` `optional` **family?**: `string`

##### given?

> `readonly` `optional` **given?**: readonly `string`[]

##### prefix?

> `readonly` `optional` **prefix?**: readonly `string`[]

##### suffix?

> `readonly` `optional` **suffix?**: readonly `string`[]

##### text?

> `readonly` `optional` **text?**: `string`

***

### II

Parsed HL7 v3 Instance Identifier. `root` is the namespace OID/UUID;
`extension` is the local identifier within it. For a `templateId`, `root`
(and optionally `extension`, the R2.1 version stamp) are the meaningful
fields; for a patient id, `root`+`extension` form the full MRN.

#### Example

```ts
import type { II } from "@cosyte/ccda";
const id: II = { root: "2.16.840.1.113883.19.5", extension: "12345" };
```

#### Properties

##### assigningAuthorityName?

> `readonly` `optional` **assigningAuthorityName?**: `string`

##### extension?

> `readonly` `optional` **extension?**: `string`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### root?

> `readonly` `optional` **root?**: `string`

***

### Immunization

An Immunization Activity. `vaccine` is the CVX coded product; `dose` is the
amount administered; `route` is the administration route; `effectiveTime` is
when it was given. `refused` is `true` for a `negationInd` not-administered
record; `nullFlavor` carries an "unknown" marker, the two are kept distinct.
`moodCode` distinguishes an actual administration (`EVN`) from a planned one.

#### Example

```ts
import type { Immunization } from "@cosyte/ccda";
function cvx(i: Immunization): string | undefined {
  return i.vaccine?.code;
}
```

#### Properties

##### dose?

> `readonly` `optional` **dose?**: [`PQ`](#pq)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### moodCode?

> `readonly` `optional` **moodCode?**: `string`

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### refused?

> `readonly` `optional` **refused?**: `boolean`

##### route?

> `readonly` `optional` **route?**: [`CD`](#cd)

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

##### vaccine?

> `readonly` `optional` **vaccine?**: [`CD`](#cd)

***

### IVL\_PQ

Parsed HL7 v3 Interval of Physical Quantity. Any subset of the bound fields
may be present; `nullFlavor` is set when the interval element declared one.

#### Example

```ts
import type { IVL_PQ } from "@cosyte/ccda";
const range: IVL_PQ = { low: { value: 1, unit: "mg" }, high: { value: 2, unit: "mg" } };
```

#### Properties

##### center?

> `readonly` `optional` **center?**: [`PQ`](#pq)

##### high?

> `readonly` `optional` **high?**: [`PQ`](#pq)

##### low?

> `readonly` `optional` **low?**: [`PQ`](#pq)

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### width?

> `readonly` `optional` **width?**: [`PQ`](#pq)

***

### IVL\_TS

Parsed HL7 v3 Interval of Point in Time. `low`/`high` are the bounds;
`value` captures the degenerate case where the interval element itself
carries a `@value` (a point expressed as an interval). `nullFlavor` is set
when the element declared one.

#### Example

```ts
import type { IVL_TS } from "@cosyte/ccda";
const period: IVL_TS = { low: { raw: "20260101" }, high: { raw: "20261231" } };
```

#### Properties

##### high?

> `readonly` `optional` **high?**: [`TS`](#ts)

##### low?

> `readonly` `optional` **low?**: [`TS`](#ts)

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### value?

> `readonly` `optional` **value?**: [`TS`](#ts)

***

### Medication

A Medication Activity. `drug` is the RxNorm coded product; `dose`/`doseRange`
is the amount per administration; `route` is the administration route;
`duration` is the therapy window (`IVL_TS`) and `frequency` the periodic
timing (`PIVL_TS`). `moodCode` distinguishes an actual administration (`EVN`)
from a planned/ordered one (`INT`/`RQO`), never conflated.

#### Example

```ts
import type { Medication } from "@cosyte/ccda";
function rxnorm(m: Medication): string | undefined {
  return m.drug?.code;
}
```

#### Properties

##### dose?

> `readonly` `optional` **dose?**: [`PQ`](#pq)

##### doseRange?

> `readonly` `optional` **doseRange?**: [`IVL_PQ`](#ivl_pq)

##### drug?

> `readonly` `optional` **drug?**: [`CD`](#cd)

##### duration?

> `readonly` `optional` **duration?**: [`IVL_TS`](#ivl_ts)

##### frequency?

> `readonly` `optional` **frequency?**: [`MedicationFrequency`](#medicationfrequency-1)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### moodCode?

> `readonly` `optional` **moodCode?**: `string`

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### negated?

> `readonly` `optional` **negated?**: `boolean`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### route?

> `readonly` `optional` **route?**: [`CD`](#cd)

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

***

### MedicationFrequency

A periodic dosing frequency (HL7 v3 `PIVL_TS`). `period` is the interval
between administrations (e.g. 8 hours); `institutionSpecified` marks an
institution-defined timing (e.g. "with meals" rather than a fixed clock).

#### Example

```ts
import type { MedicationFrequency } from "@cosyte/ccda";
const f: MedicationFrequency = { period: { value: 8, unit: "h" } };
```

#### Properties

##### institutionSpecified?

> `readonly` `optional` **institutionSpecified?**: `boolean`

##### period?

> `readonly` `optional` **period?**: [`PQ`](#pq)

***

### ParentDocument

A CDA R2 `parentDocument`, the earlier document a [RelatedDocument](#relateddocument)
points back at. Carries the parent's `id`(s), optional `code`, and the
`setId`/`versionNumber` revision pair (the version this document supersedes).

#### Example

```ts
import type { ParentDocument } from "@cosyte/ccda";
function priorVersion(p: ParentDocument): number | undefined {
  return p.versionNumber;
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### setId?

> `readonly` `optional` **setId?**: [`II`](#ii)

##### versionNumber?

> `readonly` `optional` **versionNumber?**: `number`

***

### ParseCcdaOptions

Options accepted by `parseCcda` to tune lenient/strict behaviour and the
security limits. Every field is optional; `parseCcda(raw, {})` is valid and
produces the library defaults (lenient parse, default safety caps).

#### Remarks

With `exactOptionalPropertyTypes: true`, callers cannot pass
`{ strict: undefined }`, either omit the key or pass a boolean.

#### Example

```ts
import { parseCcda, type ParseCcdaOptions } from "@cosyte/ccda";
const opts: ParseCcdaOptions = {
  strict: false,
  onWarning: (w) => console.warn(w.code),
};
parseCcda(raw, opts);
```

#### Properties

##### limits?

> `readonly` `optional` **limits?**: [`CcdaParseLimits`](#ccdaparselimits)

Override one or more of the default safety caps applied before DOM construction.

##### onWarning?

> `readonly` `optional` **onWarning?**: [`OnWarningCallback`](#onwarningcallback)

Inline callback fired for each Tier-2 warning, in emission order (see [OnWarningCallback](#onwarningcallback)).

##### profile?

> `readonly` `optional` **profile?**: [`CcdaProfile`](#ccdaprofile) \| `null`

The vendor/conformance [CcdaProfile](#ccdaprofile) to apply. A profile downgrades the
**non-safety-critical** deviations it expects to `PROFILE_QUIRK_APPLIED`
(flagged `expected`), it never changes an extracted value and can never
tolerate a safety-critical warning. Omit to consult the process-scoped
default ([setDefaultCcdaProfile](#setdefaultccdaprofile)); pass `null` to opt out of that
default for this call.

##### strict?

> `readonly` `optional` **strict?**: `boolean`

When `true`, escalate every Tier-2 deviation to a thrown error instead of a warning.

##### terminology?

> `readonly` `optional` **terminology?**: [`TerminologyAdapter`](#terminologyadapter)

An optional consumer-supplied bring-your-own [TerminologyAdapter](#terminologyadapter). When
present, the parser semantically validates each recognized coded value (a
problem, medication, allergen, route, or vaccine code) against it and emits
`SEMANTIC_CODE_INVALID` on a negative verdict, the code preserved verbatim,
never coerced. Omit it for the default recognize-only behavior. `@cosyte/ccda`
never imports a terminology library; you supply the adapter.

##### valueSets?

> `readonly` `optional` **valueSets?**: [`ValueSetSource`](#valuesetsource)

An optional consumer-supplied bring-your-own [ValueSetSource](#valuesetsource). When
present, the parser asks it whether each coded value at a recognized slot is
a member of the value set C-CDA R2.1 binds that slot to, and emits
`VALUE_SET_BINDING_VIOLATED` where a **Required** binding's value set does
not contain the code (a SHALL violation) or
`VALUE_SET_BINDING_NOT_EVALUATED` where the source holds no expansion for
it. Omit it and nothing is asked: a parse with no source is exactly the
parse this library has always produced, and no membership is ever inferred
from the code system alone.

This is a different question from [ParseCcdaOptions.terminology](#terminology-2),
which asks whether a code is a real member of its CODE SYSTEM. A value can
pass that and still sit outside the VALUE SET its template binds.
`@cosyte/ccda` ships no value set content; you supply the package.

***

### ParseCtx

Parse context threaded into every datatype parser so it can surface a Tier-2
warning (e.g. `INVALID_NULL_FLAVOR`, `MALFORMED_DATETIME`) in discovery
order. Datatypes that have nothing to warn about simply never call `emit`.

#### Example

```ts
import { type ParseCtx, parsePq } from "@cosyte/ccda";
const ctx: ParseCtx = { emit: (w) => console.warn(w.code) };
parsePq(el, ctx);
```

#### Properties

##### emit

> `readonly` **emit**: (`warning`) => `void`

###### Parameters

###### warning

[`CcdaWarning`](#ccdawarning)

###### Returns

`void`

##### terminology?

> `readonly` `optional` **terminology?**: [`TerminologyAdapter`](#terminologyadapter)

The optional consumer-supplied [TerminologyAdapter](#terminologyadapter). When present, the
code-system recognition layer ([checkCodeSlot](#checkcodeslot)) calls it to
semantically validate coded values; when absent, recognition falls back to
structural checks only. `@cosyte/ccda` never constructs one, it only calls
the adapter a consumer passed to `parseCcda` / `buildCcda`.

##### valueSets?

> `readonly` `optional` **valueSets?**: [`ValueSetSource`](#valuesetsource)

The optional consumer-supplied [ValueSetSource](#valuesetsource). When present, the
value-set binding layer (`../value-set-bindings.ts`) asks it whether each
coded value at a checked slot is a member of the value set C-CDA binds that
slot to; when absent, nothing is asked and nothing is emitted. Membership in
a VALUE SET is a different question from membership in a CODE SYSTEM, which
is what [TerminologyAdapter](#terminologyadapter) answers, and a consumer may supply either,
both or neither.

***

### PlannedItem

A single planned item from the Plan of Treatment. `kind` is the template
variant; `disposition` is the performed-vs-planned reading of `moodCode`
(normally `"planned"`, never guessed); `value` carries the expected result for
the observation variant. `negated` and `nullFlavor` are kept distinct, never
collapsed.

`code` is the planned act's own `<code>` for five of the seven variants. For
the two `substanceAdministration` variants, `medicationActivity` and
`immunizationActivity`, it is the **product** (the drug, or the vaccine), read
from `consumable/manufacturedProduct`, and never the
`substanceAdministration`'s own `<code>`: that element is an
`ActSubstanceAdministrationCode` (the kind of administration act), not the
substance. That `[0..1]` cardinality and that binding are **base CDA R2's
`SubstanceAdministration` class**, not a C-CDA constraint: R2.1 constrains
`code` on neither template, which is precisely why an act `<code>` is legal on
both. An act `<code>` present on either variant is not read into this field;
it round-trips through `doc.toString()`.

**Absence has three shapes there and only two of them are `undefined`, so do
not test this field for truthiness and stop.** It is `undefined` when no arm
carries a `<code>` at all (beside `MISSING_PRODUCT_CODE`) and when the arms
name different drugs (beside `MEDICATION_PRODUCT_ARM_CONFLICT`). But an arm
whose `<code>` asserts neither a symbol nor a `nullFlavor` yields a **truthy
but empty `CD`**, and a `nullFlavor`-only one yields a `CD` carrying just that
marking. Neither is `MISSING_PRODUCT_CODE`, an arm did carry a `<code>`. Read
`code?.code`, not `code`.

On the two `substanceAdministration` variants that empty shape is **no longer
silent**: the field is slot-checked exactly as its performed twin's product
is, so it draws `MISSING_CODE_VALUE`. `medicationActivity` is checked at the
`medication` binding (RxNorm/NDC, as a performed Medication Activity's `drug`
is) and `immunizationActivity` at the `vaccine` binding (**CVX only**, as an
Immunization Activity's `vaccine` is), so a product code carrying no
`@codeSystem` or one outside its binding draws `MISSING_CODE_SYSTEM` or
`UNEXPECTED_CODE_SYSTEM`. The two bindings differ: **NDC is expected on a drug
and unexpected on a vaccine**, so an NDC-coded planned vaccine draws
`UNEXPECTED_CODE_SYSTEM` where an NDC-coded planned drug does not, matching
each variant's performed twin rather than each other. A `nullFlavor`-only `CD`
is a complete statement and stays silent, as it does everywhere else. The
other five variants are **not** slot-checked: their `code` is the planned act,
which is not one of the five bound `CodeSlot`s.

#### Example

```ts
import type { PlannedItem } from "@cosyte/ccda";
function isPlanned(p: PlannedItem): boolean {
  return p.disposition === "planned";
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### disposition?

> `readonly` `optional` **disposition?**: [`EventDisposition`](#eventdisposition)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### kind

> `readonly` **kind**: [`PlannedItemKind`](#planneditemkind-1)

##### moodCode?

> `readonly` `optional` **moodCode?**: `string`

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### negated?

> `readonly` `optional` **negated?**: `boolean`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

##### value?

> `readonly` `optional` **value?**: [`ObservationValue`](#observationvalue)

***

### PQ

Parsed HL7 v3 Physical Quantity. `value` is the parsed number (omitted when
`@value` was non-numeric), `raw` is the verbatim `@value` string, and `unit`
is the UCUM unit when present.

#### Example

```ts
import type { PQ } from "@cosyte/ccda";
const dose: PQ = { value: 81, raw: "81", unit: "mg" };
```

#### Properties

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### raw?

> `readonly` `optional` **raw?**: `string`

##### unit?

> `readonly` `optional` **unit?**: `string`

##### value?

> `readonly` `optional` **value?**: `number`

***

### Problem

A single Problem Observation. `value` is the coded condition (SNOMED CT /
ICD-10-CM), the field most consumers want; `code` is the observation's
problem-type code. `negated` (from `@negationInd`) and `nullFlavor` are
**distinct**, a negated problem ("no chest pain") is not an unknown one.

#### Example

```ts
import type { Problem } from "@cosyte/ccda";
const p: Problem = { ids: [], value: { code: "59621000", codeSystem: "2.16.840.1.113883.6.96" } };
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### negated?

> `readonly` `optional` **negated?**: `boolean`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### value?

> `readonly` `optional` **value?**: [`CD`](#cd)

***

### ProblemConcern

A Problem Concern Act: the clinical-concern wrapper around one or more
[Problem](#problem-1) observations. `status` is the resolved active/resolved/
inactive state (from the concern `statusCode`); `effectiveTime` is the
concern window (onset → resolution).

#### Example

```ts
import type { ProblemConcern } from "@cosyte/ccda";
function isActive(c: ProblemConcern): boolean {
  return c.status === "active";
}
```

#### Properties

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### problems

> `readonly` **problems**: readonly [`Problem`](#problem-1)[]

##### status

> `readonly` **status**: [`ConcernStatus`](#concernstatus)

***

### Procedure

A single procedure. `kind` is the template variant; `code` is the procedure
code (SNOMED CT / CPT / ICD-10-PCS / LOINC); `disposition` is the
performed-vs-planned reading of `moodCode`; `value` carries the result for the
observation variant. `negated` (a `negationInd` "did not happen") and
`nullFlavor` ("unknown") are kept distinct, never collapsed.

#### Example

```ts
import type { Procedure } from "@cosyte/ccda";
function wasPerformed(p: Procedure): boolean {
  return p.disposition === "performed";
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### disposition?

> `readonly` `optional` **disposition?**: [`EventDisposition`](#eventdisposition)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### kind

> `readonly` **kind**: [`ProcedureKind`](#procedurekind-1)

##### moodCode?

> `readonly` `optional` **moodCode?**: `string`

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### negated?

> `readonly` `optional` **negated?**: `boolean`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

##### value?

> `readonly` `optional` **value?**: [`ObservationValue`](#observationvalue)

***

### ProfileAttribution

PHI-free attribution for the [CcdaProfile](#ccdaprofile) a document was parsed under,
just the profile's `name` and resolved `lineage`, not the whole profile
object. Mirrors the sibling `@cosyte/hl7` `msg.profile` shape.

#### Example

```ts
import { parseCcda, ccdaProfiles } from "@cosyte/ccda";
const doc = parseCcda(xml, { profile: ccdaProfiles.smartScorecard });
console.log(doc.profile?.name); // "smartScorecard"
```

#### Properties

##### lineage

> `readonly` **lineage**: readonly `string`[]

##### name

> `readonly` **name**: `string`

***

### ProfileProvenance

Provenance for a [CcdaProfile](#ccdaprofile), the **real, cited public artifact** a
profile's quirks are grounded in. A quirk is encoded only when a
real document (including a public HL7/ONC/IHE sample or a published
conformance study) grounds it; this record is where that grounding is stated,
so a reviewer can trace every tolerated deviation back to evidence rather than
invention.

#### Example

```ts
import type { ProfileProvenance } from "@cosyte/ccda";
const prov: ProfileProvenance = {
  source: "SMART C-CDA Scorecard",
  reference: "https://ccda-scorecard.smarthealthit.org/",
  retrieved: "2026-07-18",
};
```

#### Properties

##### note?

> `readonly` `optional` **note?**: `string`

Optional clarifying note about what in the source grounds the quirks.

##### reference

> `readonly` **reference**: `string`

A citation the grounding can be traced to, a URL, DOI, or repo+commit.

##### retrieved?

> `readonly` `optional` **retrieved?**: `string`

When the grounding was last verified (ISO date) or the pinned commit SHA.

##### source

> `readonly` **source**: `string`

Short human-readable name of the grounding source (corpus, study, or guide).

***

### QuirkMatch

Optional structural narrowing for a [QuirkTolerance](#quirktolerance). When present, the
tolerance applies only to warnings whose PHI-free [CcdaPosition](#ccdaposition) matches
every provided field. Matching is on **structural identifiers only** (LOINC
section code, template OID); there is no matching on clinical values, by
construction.

**Read which codes carry which field before keying on one.** A position field
a warning does not carry can never equal the value you match on, so the
tolerance is inert rather than broad. `sectionCode` is carried by
`UNKNOWN_SECTION_CODE`, `SECTION_MATCHED_BY_LOINC_FALLBACK` and
`SUBJECT_CONTEXT_OVERRIDE` (the enclosing section's own `<code>`, bounded
on the LOINC shape or replaced by the withheld placeholder, and absent from the
position when that section carries no `<code>` at all, as an unrecognized
section routinely does); `templateId` is carried by the first two plus the two
document-level stamp codes, `TEMPLATE_EXTENSION_ABSENT` and
`TEMPLATE_EXTENSION_UNMODELED_RELEASE`.
Those five are the deviations a structural identifier can locate today, and
`SUBJECT_CONTEXT_OVERRIDE` is in `SAFETY_CRITICAL_CODES`, so narrowing it is
refused at definition time however precise the `match` is.
Entry-level codes (`DEPRECATED_LOINC`, `UNEXPECTED_CODE_SYSTEM`, the
medication-product codes) carry neither, and so do `MISSING_TEMPLATE_ID` and
`UNKNOWN_DOCUMENT_TEMPLATE`, so narrowing any of those to a section or a
template matches nothing at all. Omit `match` to tolerate a code wherever it
fires, which is what every profile shipped in `ccdaProfiles` does.

#### Example

```ts
import type { QuirkMatch } from "@cosyte/ccda";
// Tolerate the missing R2.1 version stamp on the CCD root template only.
const ccdRootOnly: QuirkMatch = { templateId: "2.16.840.1.113883.10.20.22.1.2" };
```

#### Properties

##### sectionCode?

> `readonly` `optional` **sectionCode?**: `string`

Match only warnings carrying this section LOINC code in their position.
Carried by `UNKNOWN_SECTION_CODE`, `SECTION_MATCHED_BY_LOINC_FALLBACK` and
`SUBJECT_CONTEXT_OVERRIDE` (which no profile may tolerate).

##### templateId?

> `readonly` `optional` **templateId?**: `string`

Match only warnings carrying this template OID in their position. Carried
by `UNKNOWN_SECTION_CODE`, `SECTION_MATCHED_BY_LOINC_FALLBACK`,
`TEMPLATE_EXTENSION_ABSENT` and `TEMPLATE_EXTENSION_UNMODELED_RELEASE`.

***

### QuirkTolerance

One expected deviation declared by a profile. `code` names an **existing,
non-safety-critical** [WarningCode](#warningcode) the profile expects; `rationale`
documents why (grounded in the profile's [ProfileProvenance](#profileprovenance)); optional
`match` narrows it to a structural location. `defineCcdaProfile` throws if
`code` is safety-critical or not a real warning code.

#### Example

```ts
import type { QuirkTolerance } from "@cosyte/ccda";
const t: QuirkTolerance = {
  code: "DEPRECATED_LOINC",
  rationale: "Scorecard-documented deprecated BMI LOINC 41909-3 in real docs.",
};
```

#### Properties

##### code

> `readonly` **code**: [`WarningCode`](#warningcode)

The existing, non-safety-critical warning code this profile expects.

##### match?

> `readonly` `optional` **match?**: [`QuirkMatch`](#quirkmatch)

Optional structural narrowing (section code / template OID).

##### rationale

> `readonly` **rationale**: `string`

Why the profile expects this deviation, grounded in its provenance.

***

### ReferenceRange

A result's reference range. `low`/`high` are the structured numeric bounds (an
`IVL_PQ`); `text` is the free-text form (preserved when present). A range with
no structured bounds emits `FREE_TEXT_REFERENCE_RANGE`, it cannot be compared
numerically against the result value.

#### Example

```ts
import type { ReferenceRange } from "@cosyte/ccda";
const r: ReferenceRange = { low: { value: 3.5, unit: "g/dL" }, high: { value: 5, unit: "g/dL" } };
```

#### Properties

##### high?

> `readonly` `optional` **high?**: [`PQ`](#pq)

##### low?

> `readonly` `optional` **low?**: [`PQ`](#pq)

##### text?

> `readonly` `optional` **text?**: `string`

***

### RelatedDocument

A CDA R2 `relatedDocument`, the header link that makes one document a
revision of another. `typeCode` is the ActRelationshipType (`RPLC` replaces,
`APND` appends, `XFRM` transforms); `parentDocument` names the prior version.
A replacement (revision) carries `typeCode="RPLC"`, the **same** `setId` as
its parent, and an incremented `versionNumber`.

#### Example

```ts
import type { RelatedDocument } from "@cosyte/ccda";
function replaces(r: RelatedDocument): boolean {
  return r.typeCode === "RPLC";
}
```

#### Properties

##### parentDocument

> `readonly` **parentDocument**: [`ParentDocument`](#parentdocument)

##### typeCode?

> `readonly` `optional` **typeCode?**: `string`

***

### RequiredSectionOptions

How a required-section lookup should treat version-scoped SHALL constraints.

**Two routes, and the newer one is a superset.** `r21Stamped` is the published
two-state option and its behaviour is a compatibility contract: it is
unchanged, and `requiredSectionKeys("ccd", { r21Stamped: false })` returns
exactly what it always returned. `stamp` is the three-state route, added
because a boolean cannot express the third state at all (see
[TemplateStampReading](#templatestampreading)) and repurposing it would have moved a published
behaviour rather than adding one. When both are supplied, `stamp` wins: it is
strictly more specific.

#### Properties

##### r21Stamped?

> `readonly` `optional` **r21Stamped?**: `boolean`

Whether the document carries the R2.1 `@extension="2015-08-01"` stamp on its
document-level `templateId`. Defaults to `true`, because these tables are
written against C-CDA R2.1. Pass `false` for an R1.1-origin document (the
condition that raises `TEMPLATE_EXTENSION_ABSENT`) to drop the SHALL keys
whose normative constraint is scoped to the R2.1 stamp.

**It cannot describe a document from a later release**, which is what
[RequiredSectionOptions.stamp](#stamp-1) is for: `false` there means "no stamp
at all", and answering `false` for a `2024-05-01` document takes the
R1.1-origin reduction on a document that release never wrote.

##### stamp?

> `readonly` `optional` **stamp?**: [`TemplateStampReading`](#templatestampreading)

The three-state reading of the document-level `templateId`'s version stamp.
Supersedes [RequiredSectionOptions.r21Stamped](#r21stamped) when both are given.

`unmodeled-release` is the state the boolean cannot hold: the obligation is
**not evaluated**, so the key set is empty and
[RequiredSectionStatus.evaluation](#evaluation) says which emptiness that is.

***

### RequiredSectionSource

The normative artifact a document type's obligation was read from, and that
artifact's **own** revision date, so a reviewer holding a later revision can
tell a table has gone stale without re-deriving it.

`revision` is the artifact's self-reported revision, never the date this
package read it: a re-read that changes nothing does not move it, and a
newer artifact does move it even if nobody has looked yet. That is the
property a staleness check needs.

#### Example

```ts
import { requiredSectionStatus } from "@cosyte/ccda";
requiredSectionStatus("ccd").source?.revision; // "2025-09-08"
```

#### Properties

##### artifact

> `readonly` **artifact**: `string`

The normative artifact, named as standards provenance.

##### revision

> `readonly` **revision**: `string`

That artifact's own revision date, `YYYY-MM-DD`.

***

### RequiredSectionStatus

A document type's required-section obligation **and** how much of it was
verified against the normative source: the asserted keys a caller already gets
from [requiredSectionKeys](#requiredsectionkeys), plus the verification state, the provenance
of every key traced here, and every named SHALL section left unasserted.

#### Example

```ts
import { requiredSectionStatus } from "@cosyte/ccda";
const status = requiredSectionStatus("consultationNote");
status.verification; // "traced-partial"
status.keys; // ["historyOfPresentIllness", "allergies", "problems"]
status.unasserted.map((u) => u.reason); // ["not-unconditionally-required", ...]
status.source?.revision; // "2025-09-08"
```

#### Properties

##### documentType

> `readonly` **documentType**: [`DocumentType`](#documenttype-4)

The document type this status is about.

##### evaluation

> `readonly` **evaluation**: [`RequiredSectionEvaluation`](#requiredsectionevaluation)

Whether an obligation was computed for the supplied stamp reading at all.
`not-evaluated` says the empty `keys` below mean "nothing was asked",
never "nothing is required".

##### keys

> `readonly` **keys**: readonly `string`[]

The asserted SHALL keys, identical to [requiredSectionKeys](#requiredsectionkeys).

##### release

> `readonly` **release**: `"R2.1"` \| `"5.0.0"` \| `undefined`

The C-CDA release whose required sections `keys` were read against:
`"R2.1"` for a document stamped `2015-08-01` or carrying no stamp,
`"5.0.0"` for one stamped `2024-05-01`, and `undefined` when
`evaluation` is `not-evaluated`. Added in a patch.

##### source

> `readonly` **source**: [`RequiredSectionSource`](#requiredsectionsource) \| `undefined`

The normative artifact this type's obligation was read from, and that
artifact's own revision date. `undefined` only where `verification` is
`untraced`, which nothing reports today: every recognized type names its
source.

##### traced

> `readonly` **traced**: readonly [`TracedRequiredSection`](#tracedrequiredsection)[]

Provenance for each asserted key that was traced, in `keys` order.

##### unasserted

> `readonly` **unasserted**: readonly [`UnassertedRequiredSection`](#unassertedrequiredsection)[]

Named SHALL sections this package does not assert, with the reason.

##### verification

> `readonly` **verification**: [`RequiredSectionVerification`](#requiredsectionverification)

How much of this type's obligation was read off the normative source.

***

### ResolvedLimits

Fully-resolved safety caps, every field present (defaults merged in), as `resolveLimits` returns them.

#### Properties

##### maxDepth

> `readonly` **maxDepth**: `number`

##### maxEntityExpansions

> `readonly` **maxEntityExpansions**: `number`

##### maxInputBytes

> `readonly` **maxInputBytes**: `number`

##### maxNodeCount

> `readonly` **maxNodeCount**: `number`

***

### Result

A single Result Observation. `code` is the LOINC test; `value` is the typed
result (a UCUM-checked quantity, coded value, string, or range);
`referenceRange` is the normal interval; `interpretation` is the H/L/N flag.

#### Example

```ts
import type { Result } from "@cosyte/ccda";
function highFlag(r: Result): boolean {
  return r.interpretation?.code === "H";
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### interpretation?

> `readonly` `optional` **interpretation?**: [`CD`](#cd)

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### referenceRange?

> `readonly` `optional` **referenceRange?**: [`ReferenceRange`](#referencerange-1)

##### value?

> `readonly` `optional` **value?**: [`ObservationValue`](#observationvalue)

***

### ResultOrganizer

A Result Organizer: the panel/battery wrapper around one or more
[Result](#result-1) observations. `code` is the panel LOINC; `statusCode` is the
organizer status; `results` are the member observations.

#### Example

```ts
import type { ResultOrganizer } from "@cosyte/ccda";
function panelSize(o: ResultOrganizer): number {
  return o.results.length;
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### results

> `readonly` **results**: readonly [`Result`](#result-1)[]

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

***

### RevisionInit

Overrides for the CDA R2 revision an edit stamps. All fields are optional:
omit `documentId` to mint a fresh id, omit `setId` to keep the source's
version-series id (or mint a **labelled synthetic** one when the source has
none, see [SYNTHETIC\_SETID\_PREFIX](#synthetic_setid_prefix); a `setId` supplied here is the
caller's assertion and is never relabelled), and omit
`versionNumber` to increment the prior version by one. Pass `revision: false`
on [EditCcdaOptions](#editccdaoptions) instead of a `RevisionInit` to skip revision
stamping entirely.

#### Example

```ts
import type { RevisionInit } from "@cosyte/ccda";
const rev: RevisionInit = { versionNumber: 5 };
```

#### Properties

##### documentId?

> `readonly` `optional` **documentId?**: [`DocumentIdInit`](#documentidinit)

##### setId?

> `readonly` `optional` **setId?**: [`DocumentIdInit`](#documentidinit)

##### versionNumber?

> `readonly` `optional` **versionNumber?**: `number`

***

### SectionInfo

Recognized-section descriptor. `key` is a stable machine name, `title` a
human label, `loinc` the section's LOINC code, and `templateRoots` the
section `templateId` root OID(s) (entries-optional and entries-required
variants) that identify it.

#### Example

```ts
import type { SectionInfo } from "@cosyte/ccda";
const s: SectionInfo = {
  key: "allergies",
  title: "Allergies",
  loinc: "48765-2",
  templateRoots: ["2.16.840.1.113883.10.20.22.2.6.1"],
};
```

#### Properties

##### key

> `readonly` **key**: `string`

##### loinc

> `readonly` **loinc**: `string`

##### templateRoots

> `readonly` **templateRoots**: readonly `string`[]

##### title

> `readonly` **title**: `string`

***

### SmokingStatus

A Smoking Status observation. `value` is the SNOMED CT smoking-status concept;
`unknown` is `true` when the status is explicitly unknown (a `nullFlavor` or
an "unknown" SNOMED concept), distinct from simply absent. `effectiveTime` is
when the status was recorded.

#### Example

```ts
import type { SmokingStatus } from "@cosyte/ccda";
function isFormerSmoker(s: SmokingStatus): boolean {
  return s.value?.code === "8517006";
}
```

#### Properties

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

##### unknown

> `readonly` **unknown**: `boolean`

##### value?

> `readonly` `optional` **value?**: [`CD`](#cd)

***

### ST

Parsed HL7 v3 Character String. `value` is the trimmed text content (omitted
when empty); `nullFlavor` is set when the element declared one instead of a
value.

#### Example

```ts
import type { ST } from "@cosyte/ccda";
const title: ST = { value: "Allergies, Adverse Reactions, Alerts" };
```

#### Properties

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### value?

> `readonly` `optional` **value?**: `string`

***

### StatusObservation

A single Functional/Mental Status finding. `domain` is the section it came
from; `assessmentScale` is `true` when the finding is an Assessment Scale
Observation (a scored scale) rather than a plain status observation; `code` is
the finding code (usually LOINC), `value` the typed result. `negated` and
`nullFlavor` are kept distinct, never collapsed.

#### Example

```ts
import type { StatusObservation } from "@cosyte/ccda";
function isScale(o: StatusObservation): boolean {
  return o.assessmentScale === true;
}
```

#### Properties

##### assessmentScale?

> `readonly` `optional` **assessmentScale?**: `boolean`

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### domain

> `readonly` **domain**: [`StatusDomain`](#statusdomain)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### negated?

> `readonly` `optional` **negated?**: `boolean`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

##### supporting?

> `readonly` `optional` **supporting?**: readonly [`SupportingObservation`](#supportingobservation)[]

The scored component observations of an Assessment Scale Observation
(`…22.4.86`), present only when `assessmentScale` is `true` and the scale
carries components (e.g. the individual PHQ-9 questions under the total
score). Absent for a plain status observation.

##### value?

> `readonly` `optional` **value?**: [`ObservationValue`](#observationvalue)

***

### SupportingObservation

One scored component of an Assessment Scale Observation, an Assessment Scale
Supporting Observation (`…22.4.86`), such as a single PHQ-9 question or a
Glasgow Coma sub-score. `code` is the item code (LOINC/SNOMED), `value` its
scored answer (usually an `integer`). Modeled so the scale's detail is never
silently dropped on parse.

#### Example

```ts
import type { SupportingObservation } from "@cosyte/ccda";
function itemScore(o: SupportingObservation): number | undefined {
  return o.value?.kind === "integer" ? o.value.value : undefined;
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### value?

> `readonly` `optional` **value?**: [`ObservationValue`](#observationvalue)

***

### TerminologyAdapter

The bring-your-own terminology contract a consumer supplies to `parseCcda`
(via [ParseCcdaOptions.terminology](#terminology-2)) or `buildCcda` (via
[BuildCcdaOptions.terminology](#terminology)). `@cosyte/ccda` never implements or
imports one, it only *calls* the one you supply, and only where a coded value
carries both a `code` and a `system`.

**`validateCode` is the one method the parser consumes.** For each recognized
coded slot (problem, medication, allergen, route, vaccine), the parser calls
`validateCode` and, on a `result: false`, emits `SEMANTIC_CODE_INVALID` with
the code **preserved verbatim**, it never rewrites the value. Returning
`undefined` means the adapter has no opinion (e.g. the system is outside its
coverage); the parser then stays silent and falls back to recognize-only, so an
adapter that only covers some systems adds no noise for the rest.

**`translate` is consumed on build and optional.** `buildCcda` calls it at each
clinical coded slot and emits any returned coding as a `<translation>` alternate
beside the primary code (never a substitution), see [CodeTranslationResult](#codetranslationresult).

#### Example

```ts
import { parseCcda, type TerminologyAdapter } from "@cosyte/ccda";

// A tiny BYO adapter, ccda imports no terminology library; you supply one.
const adapter: TerminologyAdapter = {
  validateCode: (coding) =>
    coding.system === "2.16.840.1.113883.6.96"
      ? { result: mySnomedService.has(coding.code) }
      : undefined, // no opinion on other systems
};

const doc = parseCcda(xml, { terminology: adapter });
// A structurally-valid but non-member SNOMED code now carries SEMANTIC_CODE_INVALID.
```

#### Properties

##### translate?

> `readonly` `optional` **translate?**: (`coding`) => [`CodeTranslationResult`](#codetranslationresult) \| `undefined`

Translate `coding` through the consumer's map, returning declared targets
verbatim (empty ⇒ unmapped, never fabricated). `buildCcda` emits each returned
coding as a `<translation>` alternate beside the primary code, never a
substitution. Optional, a validation-only adapter may omit it, and its absence
yields byte-identical output.

###### Parameters

###### coding

[`TerminologyCoding`](#terminologycoding)

###### Returns

[`CodeTranslationResult`](#codetranslationresult) \| `undefined`

##### validateCode

> `readonly` **validateCode**: (`coding`) => [`CodeValidationResult`](#codevalidationresult) \| `undefined`

Validate that `coding` is a real member of its code system. Return
`{ result: true }` when it is, `{ result: false }` when it is not, or
`undefined` when the adapter cannot judge (the system is out of its scope),
`undefined` produces no warning and no change.

###### Parameters

###### coding

[`TerminologyCoding`](#terminologycoding)

###### Returns

[`CodeValidationResult`](#codevalidationresult) \| `undefined`

***

### TerminologyCoding

A single coded value handed to a [TerminologyAdapter](#terminologyadapter). Mirrors FHIR R4
`Coding` (and `@cosyte/terminology`'s `Coding`), **except** `system` is the
C-CDA `@codeSystem` **OID** exactly as it appears in the document (e.g.
`2.16.840.1.113883.6.96` for SNOMED CT), not a canonical URI, the parser hands
the adapter what the wire actually carries and never invents a URI. A consumer
bridging to a URI-based engine (such as `@cosyte/terminology`'s `resolveSystem`)
performs that OID→URI mapping inside their adapter.

#### Example

```ts
import type { TerminologyCoding } from "@cosyte/ccda";
const snomed: TerminologyCoding = {
  system: "2.16.840.1.113883.6.96",
  code: "38341003",
  display: "Hypertension",
};
```

#### Properties

##### code

> `readonly` **code**: `string`

The symbol within the code system (the C-CDA `@code`). Required, a coding without one is meaningless.

##### display?

> `readonly` `optional` **display?**: `string`

The human-readable label (the C-CDA `@displayName`), when present. Carried verbatim.

##### system?

> `readonly` `optional` **system?**: `string`

The code system's OID, as carried by the C-CDA `@codeSystem` (never a URI). May be absent.

##### version?

> `readonly` `optional` **version?**: `string`

The code-system version the code is drawn from, when known.

***

### ToDateOptions

Options for [toDate](#todate). `assumeOffsetMinutes` is the caller's declaration of the zone an
offset-less value was written in, in signed minutes east of UTC. It is the **only** way to
get an instant out of a value that states no offset, and an explicit `0` means "treat this
naive value as UTC". A value that carries its own offset ignores it.

#### Example

```ts
import { toDate, type ToDateOptions } from "@cosyte/ccda";
const eastern: ToDateOptions = { assumeOffsetMinutes: -300 };
toDate({ raw: "20260628" }, eastern); // => 2026-06-28T05:00:00.000Z
```

#### Properties

##### assumeOffsetMinutes?

> `readonly` `optional` **assumeOffsetMinutes?**: `number`

***

### TracedRequiredSection

One asserted SHALL section key together with the conformance statement it was
read from and the source's own name for the section, so a reviewer holding the
same artifact can re-check the assertion instead of re-deriving it.

#### Example

```ts
import { requiredSectionStatus } from "@cosyte/ccda";
requiredSectionStatus("consultationNote").traced[0];
// { key: "historyOfPresentIllness", conformanceId: "CONF:1198-28907", sourceName: "History of Present Illness Section" }
```

#### Properties

##### conformanceId

> `readonly` **conformanceId**: `string`

The conformance statement the assertion was read from (`CONF:1198-` + digits).

##### key

> `readonly` **key**: `string`

The recognized catalog section key this package asserts.

##### sourceName

> `readonly` **sourceName**: `string`

The source's own name for the required section.

***

### TS

Parsed HL7 v3 Point in Time. `raw` is the verbatim `@value`; `date` is the
resolved JS `Date` (UTC when the value carried no offset), or omitted when
the value was malformed. `nullFlavor` is set when the element declared one.

#### Example

```ts
import type { TS } from "@cosyte/ccda";
const effective: TS = { raw: "20260628", date: new Date("2026-06-28T00:00:00Z") };
```

#### Properties

##### date?

> `readonly` `optional` **date?**: `Date`

##### nullFlavor?

> `readonly` `optional` **nullFlavor?**: `string`

##### raw?

> `readonly` `optional` **raw?**: `string`

***

### UnassertedRequiredSection

A SHALL section the normative source names for a document type that this
package deliberately does not assert, named so a caller can enumerate exactly
what the parser is not checking, and why.

#### Example

```ts
import { requiredSectionStatus } from "@cosyte/ccda";
requiredSectionStatus("diagnosticImagingReport").unasserted[0];
// { sourceName: "Findings Section (DIR)", conformanceId: "CONF:1198-30697", reason: "outside-section-catalog" }
```

#### Properties

##### conformanceId

> `readonly` **conformanceId**: `string`

The conformance statement that requires it.

##### reason

> `readonly` **reason**: [`UnassertedSectionReason`](#unassertedsectionreason)

Which of the two permitted reasons keeps it out of the asserted set.

##### sourceName

> `readonly` **sourceName**: `string`

The source's own name for the section.

***

### ValueSetBinding

One checked slot's value-set binding as this package declares it: the value
set the C-CDA R2.1 template binds the slot to, how strongly it binds it, and
the provenance of that reading.

Every field is a fixed literal this package owns. No part of a row comes from
a parsed document, which is what lets `valueSet` ride on a warning.

#### Example

```ts
import { valueSetBinding } from "@cosyte/ccda";
const binding = valueSetBinding("allergen");
binding.valueSet; // "2.16.840.1.113762.1.4.1010.1"
binding.conformanceId; // "CONF:1098-7419"
```

#### Properties

##### conformanceId

> `readonly` **conformanceId**: `string`

The conformance statement the binding was read from (`CONF:` + digits).

##### slot

> `readonly` **slot**: `"problem"` \| `"medication"` \| `"allergen"` \| `"route"` \| `"vaccine"`

The checked slot this row is about.

##### source

> `readonly` **source**: [`ValueSetBindingSource`](#valuesetbindingsource-1)

The artifact the row was read from, and that artifact's own revision.

##### sourceTemplate

> `readonly` **sourceTemplate**: `string`

The template whose rule carries that statement, in the source's own words.

##### strength

> `readonly` **strength**: [`ValueSetBindingStrength`](#valuesetbindingstrength-1)

Required (a SHALL binding) or preferred (a SHOULD or MAY binding).

##### valueSet

> `readonly` **valueSet**: `"2.16.840.1.113883.3.88.12.3221.7.4"` \| `"2.16.840.1.113762.1.4.1010.4"` \| `"2.16.840.1.113762.1.4.1010.1"` \| `"2.16.840.1.113883.3.88.12.3221.8.7"` \| `"2.16.840.1.113762.1.4.1010.6"`

The bound value set's published OID. An identifier, never its members, and
a member of the closed BOUND\_VALUE\_SETS list so that the compiler,
rather than review, holds the bound on what can reach a diagnostic.

##### valueSetName

> `readonly` **valueSetName**: `string`

The source's own name for that value set.

***

### ValueSetBindingSource

The normative artifact a binding row was read from, and that artifact's **own**
revision, so a reviewer holding a later revision can tell a row has gone stale
without re-deriving it.

`revision` is the artifact's self-reported revision, never the date this
package read it: a re-read that changes nothing does not move it, and a newer
artifact does move it even if nobody has looked yet. That is the property a
staleness check needs, and it is the same rule
[RequiredSectionSource](#requiredsectionsource) follows.

#### Example

```ts
import { valueSetBinding } from "@cosyte/ccda";
valueSetBinding("vaccine").source.revision; // "2025-09-08"
```

#### Properties

##### artifact

> `readonly` **artifact**: `string`

The normative artifact, named as standards provenance.

##### revision

> `readonly` **revision**: `string`

That artifact's own revision date, `YYYY-MM-DD`.

***

### ValueSetMembershipAnswer

What a [ValueSetSource](#valuesetsource) can say about one membership question. Three
states, and the third is the reason this is not a boolean.

- `member`: the code is in the expansion the source holds. Silent.
- `not-a-member`: it is not. Against a Required binding this is a SHALL
  violation and raises `VALUE_SET_BINDING_VIOLATED`.
- `no-expansion`: the source holds no expansion for that value set, so it did
  not evaluate the binding at all. This raises
  `VALUE_SET_BINDING_NOT_EVALUATED` rather than nothing, because a package
  that quietly skips a value set it does not hold reads exactly like one that
  checked and found the code fine.

Returning `undefined` instead of an answer is the fourth state and the only
silent one: the source declares it has no opinion here, the same "out of my
scope" answer [TerminologyAdapter.validateCode](#validatecode) gives. Use it when the
source is not the authority for a value set; use `no-expansion` when it is the
authority and the package it answers from does not carry the expansion.

#### Example

```ts
import type { ValueSetMembershipAnswer } from "@cosyte/ccda";
const answer: ValueSetMembershipAnswer = { membership: "not-a-member" };
```

#### Properties

##### membership

> `readonly` **membership**: `"member"` \| `"not-a-member"` \| `"no-expansion"`

The verdict, or the declaration that no expansion was available to give one.

***

### ValueSetMembershipQuery

One membership question put to a [ValueSetSource](#valuesetsource): is this coded value a
member of this value set?

`valueSet` is the OID of the value set the slot's C-CDA binding names, taken
from this package's own frozen binding table and never from the document.
`coding` is the document's value exactly as the wire carried it, the same
shape [TerminologyAdapter.validateCode](#validatecode) receives.

#### Example

```ts
import type { ValueSetMembershipQuery } from "@cosyte/ccda";
const query: ValueSetMembershipQuery = {
  valueSet: "2.16.840.1.113762.1.4.1010.4",
  coding: { system: "2.16.840.1.113883.6.88", code: "314076" },
};
```

#### Properties

##### coding

> `readonly` **coding**: [`TerminologyCoding`](#terminologycoding)

The coded value to test, carried verbatim from the document.

##### valueSet

> `readonly` **valueSet**: `string`

The bound value set's OID, from this package's declared binding table.

***

### ValueSetSource

The bring-your-own **value-set** contract, the sibling of
[TerminologyAdapter](#terminologyadapter) for the question an adapter cannot answer: is this
code inside the VALUE SET the C-CDA template binds this slot to?

C-CDA binds each checked slot to a value set, and a Required binding makes
membership a SHALL. The member codes of those value sets are licensed data
(SNOMED CT, RxNorm and CVX expansions published through VSAC), so
`@cosyte/ccda` carries the value set OIDs and never their contents: you hold
the package, you answer the question, and the parser reports what you say.

**`release` is not optional, and it is what makes the finding honest.** C-CDA's
own guidance states that for a Required binding any valid expansion of a value
set is conformant, so "not a member" is only ever a statement about the
expansion that answered. A finding therefore carries the release you declare
here beside the value set OID, and asserts non-conformance no wider than that.
The string is your own package label; this library never reads it from a
document and never puts it in a message.

**Fail-safe, exactly like the terminology adapter.** The source can only
report: no value is rewritten, refused, reordered or dropped on a negative
verdict, and an exception `isMember` raises is not swallowed.

#### Example

```ts
import { parseCcda, type ValueSetSource } from "@cosyte/ccda";

// Your own package, in process. `@cosyte/ccda` ships no expansion.
const expansions = new Map([["2.16.840.1.113762.1.4.1010.4", new Set(["314076"])]]);
const valueSets: ValueSetSource = {
  release: "my-vsac-package-2026.1",
  isMember: ({ valueSet, coding }) => {
    const expansion = expansions.get(valueSet);
    if (expansion === undefined) return { membership: "no-expansion" };
    return { membership: expansion.has(coding.code) ? "member" : "not-a-member" };
  },
};

const doc = parseCcda(xml, { valueSets });
```

#### Properties

##### isMember

> `readonly` **isMember**: (`query`) => [`ValueSetMembershipAnswer`](#valuesetmembershipanswer) \| `undefined`

Answer one membership question, or return `undefined` to declare no opinion.
Return `{ membership: "no-expansion" }` when the package holds no expansion
for the value set: that is reported as "not evaluated", never as a pass.

###### Parameters

###### query

[`ValueSetMembershipQuery`](#valuesetmembershipquery)

###### Returns

[`ValueSetMembershipAnswer`](#valuesetmembershipanswer) \| `undefined`

##### release

> `readonly` **release**: `string`

The release of the value-set package these answers come from, in your own
terms (a VSAC package version, a build tag, a date). It rides on every
finding this source produces, so a reader can tell which expansion said so.

***

### VitalSign

A single Vital Sign Observation. `code` is the LOINC vital; `value` is the
typed reading (normally a UCUM-checked quantity); `interpretation` is the
H/L/N flag; `effectiveTime` is when the reading was taken.

#### Example

```ts
import type { VitalSign } from "@cosyte/ccda";
function systolic(v: VitalSign): number | undefined {
  return v.code?.code === "8480-6" && v.value?.kind === "physicalQuantity"
    ? v.value.quantity.value
    : undefined;
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### effectiveTime?

> `readonly` `optional` **effectiveTime?**: [`IVL_TS`](#ivl_ts)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### interpretation?

> `readonly` `optional` **interpretation?**: [`CD`](#cd)

##### narrative?

> `readonly` `optional` **narrative?**: `string`

##### value?

> `readonly` `optional` **value?**: [`ObservationValue`](#observationvalue)

***

### VitalSignsOrganizer

A Vital Signs Organizer: the cluster wrapper around one or more
[VitalSign](#vitalsign) observations taken together. `code` is the cluster code;
`statusCode` is the organizer status; `vitals` are the member readings.

#### Example

```ts
import type { VitalSignsOrganizer } from "@cosyte/ccda";
function clusterSize(o: VitalSignsOrganizer): number {
  return o.vitals.length;
}
```

#### Properties

##### code?

> `readonly` `optional` **code?**: [`CD`](#cd)

##### ids

> `readonly` **ids**: readonly [`II`](#ii)[]

##### statusCode?

> `readonly` `optional` **statusCode?**: `string`

##### vitals

> `readonly` **vitals**: readonly [`VitalSign`](#vitalsign)[]

## Type Aliases

### BoundValueSet

> **BoundValueSet** = *typeof* `BOUND_VALUE_SETS`\[`number`\]

A value set OID this parser is allowed to put on a diagnostic. Closed by
construction, so naming one names a parser constant rather than document
content.

#### Example

```ts
import type { BoundValueSet } from "@cosyte/ccda";
const vs: BoundValueSet = "2.16.840.1.113762.1.4.1010.4";
```

***

### BuildableDocumentType

> **BuildableDocumentType** = `Extract`\<[`DocumentType`](#documenttype-4), `"ccd"` \| `"referralNote"` \| `"dischargeSummary"`\>

The document types [buildCcda](#buildccda) can emit, three of the twelve
[DocumentType](#documenttype-4)s `parseCcda` recognizes.

**Declared as a subset of the recognized enumeration rather than as its own
union of strings.** `Extract` fails to compile if any member stops being a
recognized document type, so the builder's surface cannot drift from the
parser's: renaming a key in `DOCUMENT_TYPES` is already a breaking change and
this makes it a compile error here too. The other nine are refused at run
time by [buildCcda](#buildccda), and the refusal is derived from
DOC\_TYPE\_SPECS rather than from a second list, so a thirteenth
recognized type is refused the moment it is recognized.

***

### BuildCcdaPlannedItem

> **BuildCcdaPlannedItem** = [`BuildCcdaPlannedAct`](#buildccdaplannedact) \| [`BuildCcdaPlannedOrder`](#buildccdaplannedorder) \| [`BuildCcdaPlannedObservation`](#buildccdaplannedobservation) \| [`BuildCcdaPlannedImmunization`](#buildccdaplannedimmunization)

A planned item for the Plan of Treatment section (`…22.2.10`), a discriminated
union over the seven planned-entry templates the parser returns, split by
which `@moodCode` domain each element admits and by which SHALL elements each
template carries: [BuildCcdaPlannedAct](#buildccdaplannedact) (act/encounter/procedure, which
accept the appointment moods `APT`/`ARQ`), [BuildCcdaPlannedOrder](#buildccdaplannedorder)
(medication/supply), [BuildCcdaPlannedObservation](#buildccdaplannedobservation) (observation, which
also carries an expected `value`), and [BuildCcdaPlannedImmunization](#buildccdaplannedimmunization)
(immunization, whose `effectiveTime` is required rather than optional).
**The mood split is correct by
construction:** the base CDA R2 mood domains for `substanceAdministration`,
`supply`, and `observation` exclude `APT`/`ARQ`, so those appointment moods are
simply not representable on those kinds, the type prevents emitting a
schema-invalid `@moodCode`, not merely a discouraged one.

**Everything here is future/ordered, never performed.** No variant admits the
performed `EVN`; each entry's `statusCode` is fixed to `"active"` (the SHALL the
planned templates require), never a performed `"completed"`, and the planned
`@moodCode` reads back through the parser's `disposition` as `"planned"`; the
two dispositions are never conflated.

#### Example

```ts
import type { BuildCcdaPlannedItem } from "@cosyte/ccda";
const plannedColonoscopy: BuildCcdaPlannedItem = {
  kind: "procedure",
  code: { code: "73761001", displayName: "Colonoscopy" }, // SNOMED CT
};
```

***

### CcdaEditErrorCode

> **CcdaEditErrorCode** = `"NO_SOURCE_DOCUMENT"` \| `"NO_STRUCTURED_BODY"` \| `"SECTION_ALREADY_PRESENT"` \| `"SECTION_ABSENT"` \| `"REQUIRED_SECTION_MISSING"` \| `"SOURCE_MISSING_ID"`

Stable string codes for every failure [editCcda](#editccda) raises. Consumers
narrow on `err.code`.

#### Example

```ts
import type { CcdaEditErrorCode } from "@cosyte/ccda";
const code: CcdaEditErrorCode = "REQUIRED_SECTION_MISSING";
```

***

### CcdaRelease

> **CcdaRelease** = *typeof* [`CCDA_RELEASES`](#ccda_releases)\[`number`\]

A C-CDA release this package can name. Closed by construction, so putting one
in a warning message names a parser constant rather than document content.

#### Example

```ts
import type { CcdaRelease } from "@cosyte/ccda";
const release: CcdaRelease = "R2.1";
```

***

### CodeSlot

> **CodeSlot** = *typeof* `CODE_SLOTS`\[`number`\]

Which coded slot a code-system warning is about. Closed by construction, so
naming it in a message names a parser constant rather than document content.

#### Example

```ts
import type { CodeSlot } from "@cosyte/ccda";
const slot: CodeSlot = "problem";
```

***

### ConcernStatus

> **ConcernStatus** = `"active"` \| `"resolved"` \| `"inactive"` \| `"unknown"`

The resolved active-vs-resolved state of a Problem/Allergy Concern Act,
derived from its `statusCode` (with `effectiveTime` available for refinement).

#### Example

```ts
import type { ConcernStatus } from "@cosyte/ccda";
const s: ConcernStatus = "active";
```

***

### DocumentType

> **DocumentType** = `"ccd"` \| `"dischargeSummary"` \| `"referralNote"` \| `"consultationNote"` \| `"historyAndPhysical"` \| `"progressNote"` \| `"procedureNote"` \| `"operativeNote"` \| `"carePlan"` \| `"diagnosticImagingReport"` \| `"unstructuredDocument"` \| `"transferSummary"` \| `"patientGeneratedDocument"`

Machine keys for the thirteen recognized document types: the twelve C-CDA
R2.1 document types and the Patient Generated Document header. Stable
strings, consumers may branch on `doc.documentType === "ccd"`. Renaming a
key is a breaking change.

**`patientGeneratedDocument` is a header, not a document type in the guide.**
The US Realm Header for Patient Generated Document
(`2.16.840.1.113883.10.20.29.1`) says the patient or a related person wrote
the document, and the guide lets its body carry any C-CDA content. It names
the type only of a document that carries no other recognized document-type
`templateId`: a CCD that also carries the header reads `ccd`. It was added in
a patch; a `switch` over this union that names every member needs one more
case.

#### Example

```ts
import type { DocumentType } from "@cosyte/ccda";
const t: DocumentType = "dischargeSummary";
```

***

### EditableSectionKind

> **EditableSectionKind** = `"problems"` \| `"allergies"` \| `"medications"` \| `"results"` \| `"vitalSigns"` \| `"immunizations"` \| `"procedures"` \| `"encounters"` \| `"socialHistory"` \| `"pastMedicalHistory"` \| `"planOfTreatment"` \| `"familyHistory"`

The section kinds `editCcda` can add or replace: the sections `buildCcda`
builds from a single content list, each emitted as a standalone
`<component>`. The compound Functional/Mental Status sections (three content
arrays each) and narrative-only sections are intentionally excluded from
edit support.

***

### EventDisposition

> **EventDisposition** = `"performed"` \| `"planned"`

The performed-vs-planned disposition of a clinical act, derived from its
`@moodCode`: `EVN` → `"performed"`; a planned mood (`INT`/`RQO`/`PRMS`/`PRP`/
`APT`/`ARQ`) → `"planned"`. Shared by Procedures and the Plan of Treatment so
a planned act is **never** read as performed (and vice versa).

#### Example

```ts
import type { EventDisposition } from "@cosyte/ccda";
const d: EventDisposition = "planned";
```

***

### FatalCode

> **FatalCode** = *typeof* [`FATAL_CODES`](#fatal_codes)\[keyof *typeof* [`FATAL_CODES`](#fatal_codes)\]

Discriminant type for `CcdaParseError.code`. Narrowing a caught error by
this code lets consumers write exhaustive `switch` blocks (enabled by the
`switch-exhaustiveness-check` lint rule) and guarantees a typo-free
comparison against the `FATAL_CODES` registry.

#### Example

```ts
import type { FatalCode } from "@cosyte/ccda";
function describe(code: FatalCode): string {
  switch (code) {
    case "XXE_OR_DTD_PRESENT":
      return "document declared a DTD or external entity";
    case "ENTITY_EXPANSION_LIMIT":
      return "too many entity expansions";
    case "INPUT_SIZE_LIMIT_EXCEEDED":
      return "input too large";
    case "ELEMENT_DEPTH_LIMIT_EXCEEDED":
      return "nesting too deep";
    case "NODE_COUNT_LIMIT_EXCEEDED":
      return "too many elements";
    case "NOT_WELL_FORMED_XML":
      return "XML did not parse";
    case "NOT_A_CLINICAL_DOCUMENT":
      return "root element is not ClinicalDocument";
  }
}
```

***

### NullFlavor

> **NullFlavor** = *typeof* [`NULL_FLAVORS`](#null_flavors)\[`number`\]

A valid HL7 v3 NullFlavor token. Datatype `nullFlavor` fields are typed as
`string` (a non-conforming value is preserved verbatim and flagged with
`INVALID_NULL_FLAVOR`); this union documents the conforming set, which is the
whole code system rather than a working subset of it.

#### Example

```ts
import type { NullFlavor } from "@cosyte/ccda";
const nf: NullFlavor = "ASKU";
```

***

### ObservationValue

> **ObservationValue** = \{ `kind`: `"physicalQuantity"`; `quantity`: [`PQ`](#pq); \} \| \{ `code`: [`CD`](#cd); `kind`: `"coded"`; \} \| \{ `kind`: `"string"`; `nullFlavor?`: `string`; `value`: `string`; \} \| \{ `kind`: `"integer"`; `nullFlavor?`: `string`; `raw?`: `string`; `value?`: `number`; \} \| \{ `kind`: `"range"`; `range`: [`IVL_PQ`](#ivl_pq); \} \| \{ `kind`: `"unsupported"`; `raw?`: `string`; `xsiType?`: `string`; \}

A parsed observation `value`, discriminated on `kind`. `physicalQuantity`
carries a UCUM-checked [PQ](#pq); `coded` a [CD](#cd); `string` a free-text
value; `integer` a count/score (`xsi:type="INT"`, the type C-CDA prefers for
an assessment-scale score, units are not allowed on an `INT`); `range` an
[IVL\_PQ](#ivl_pq). `unsupported` preserves an `xsi:type` the model does not
specialize (with any raw text) so nothing is ever discarded. `integer` keeps
`value` and `nullFlavor` distinct, a scored `INT` never collapses into an
unknown one, and vice versa.

`integer` and `string` carry a `nullFlavor` beside their content for the same
reason every v3 datatype does, and `integer` mirrors `PQ` exactly: `raw` is
the verbatim `@value` token and `value` the parsed number, so when a
`nullFlavor` contradicts the score the parser withholds `value` and keeps
`raw` (see [parsePq](#parsepq)). These two arms are parsed inline here rather
than through `src/model/types/`, so they route through the shared
contradiction check explicitly.

#### Example

```ts
import type { ObservationValue } from "@cosyte/ccda";
function numeric(v: ObservationValue): number | undefined {
  if (v.kind === "physicalQuantity") return v.quantity.value;
  return v.kind === "integer" ? v.value : undefined;
}
```

***

### OnWarningCallback

> **OnWarningCallback** = (`warning`) => `void`

Callback invoked inline each time the parser emits a Tier-2 warning.
Always fires BEFORE the warning is appended to `CcdaDocument.warnings` so
consumers observe warnings in the same order the parser emitted them.

That is emission order, and for one code it is deliberately not discovery
order: `UNKNOWN_NAMESPACE_PREFIX` is found during the pre-parse DOM walk and
replayed **last**, after the model is built. It is a statement about the whole
document, and emitting it where it is found would let it take the place of the
`NOT_A_CLINICAL_DOCUMENT` fatal, or of the first safety-critical per-element
warning, under `{ strict: true }`, where the first warning is the one that
throws. Nothing else is reordered.

#### Parameters

##### warning

[`CcdaWarning`](#ccdawarning)

#### Returns

`void`

#### Example

```ts
import { parseCcda, type OnWarningCallback } from "@cosyte/ccda";
const onWarning: OnWarningCallback = (w) => {
  console.warn(w.code, w.message);
};
parseCcda(raw, { onWarning });
```

***

### PlannedActMood

> **PlannedActMood** = `"INT"` \| `"RQO"` \| `"PRMS"` \| `"PRP"` \| `"APT"` \| `"ARQ"`

The planned `@moodCode` for the **act / encounter / procedure** kinds, the
Planned moodCode value set (`2.16.840.1.113883.11.20.9.23`): `INT` intent
(default), `RQO` request/order, `PRMS` promise, `PRP` proposal, `APT`
appointment, `ARQ` appointment request. The appointment moods (`APT`/`ARQ`)
are valid **only** on these three element domains (`x_DocumentActMood` /
`x_DocumentEncounterMood` / `x_DocumentProcedureMood`). `EVN` (a performed
event) is deliberately not a member, the plan carries only future/ordered
items, so a performed act can never be emitted into it.

#### Example

```ts
import type { PlannedActMood } from "@cosyte/ccda";
const appointment: PlannedActMood = "APT";
```

***

### PlannedItemKind

> **PlannedItemKind** = `"act"` \| `"encounter"` \| `"procedure"` \| `"medicationActivity"` \| `"supply"` \| `"observation"` \| `"immunizationActivity"`

Which planned-entry template a [PlannedItem](#planneditem) came from. Preserved so a
consumer can tell a planned medication apart from a planned procedure without
re-reading the DOM.

#### Example

```ts
import type { PlannedItemKind } from "@cosyte/ccda";
const k: PlannedItemKind = "procedure";
```

***

### PlannedOrderMood

> **PlannedOrderMood** = `"INT"` \| `"RQO"` \| `"PRMS"` \| `"PRP"`

The planned `@moodCode` for the **medication / supply / observation** kinds.
The base CDA R2 mood domains for these elements, `x_DocumentSubstanceMood`
(`substanceAdministration`/`supply`) and `x_ActMoodDocumentObservation`
(`observation`), **exclude the appointment moods** (`APT`/`ARQ`), so those are
not representable here (you cannot "appoint" a drug order or a lab). `EVN` is
likewise excluded, the plan is future/ordered, never performed.

#### Example

```ts
import type { PlannedOrderMood } from "@cosyte/ccda";
const order: PlannedOrderMood = "RQO";
```

***

### ProblemStatus

> **ProblemStatus** = [`ConcernStatus`](#concernstatus)

Resolved active-vs-resolved state of a [ProblemConcern](#problemconcern).

***

### ProcedureDisposition

> **ProcedureDisposition** = [`EventDisposition`](#eventdisposition)

The performed-vs-planned disposition of a procedure, derived from its
`@moodCode`: `EVN` → `"performed"`; a planned mood (`INT`/`RQO`/`PRMS`/`PRP`/
`APT`/`ARQ`) → `"planned"`. Absent when the mood is missing or unrecognized,
never guessed, so a planned procedure is never read as performed.

#### Example

```ts
import type { ProcedureDisposition } from "@cosyte/ccda";
const d: ProcedureDisposition = "performed";
```

***

### ProcedureKind

> **ProcedureKind** = `"procedure"` \| `"act"` \| `"observation"`

Which of the three Procedure Activity templates an extracted procedure came
from, `"procedure"` (altering/operative), `"act"` (non-altering service), or
`"observation"` (assessment). Preserved so a consumer can tell an operative
act apart from a diagnostic observation without re-reading the DOM.

#### Example

```ts
import type { ProcedureKind } from "@cosyte/ccda";
const k: ProcedureKind = "procedure";
```

***

### RequiredSectionEvaluation

> **RequiredSectionEvaluation** = `"evaluated"` \| `"not-evaluated"`

Whether a [RequiredSectionStatus](#requiredsectionstatus)'s key set was **computed for this
document at all**, as opposed to computed and found empty.

This is the axis [RequiredSectionVerification](#requiredsectionverification) deliberately does not
carry. `verification` is a claim about the *type*: how much of that document
type's obligation this package has read off the normative source, which no
option moves. `evaluation` is a claim about the *lookup*: whether the version
stamp supplied put the document inside the tables at all.

- `evaluated`: the keys below are this type's obligation under the supplied
  stamp reading. An empty set means the type asserts none, and `verification`
  says which emptiness that is.
- `not-evaluated`: **no obligation was computed.** Two routes reach it:
  `{ stamp: "unmodeled-release" }`, a document naming a C-CDA release this
  package has not read, and `{ stamp: "r30-stamped" }` for a type C-CDA 5.0.0
  does not publish (Diagnostic Imaging Report). `keys` is empty because
  nothing was asked, not because nothing is required. Reducing the set instead
  would be a confident wrong statement about conformance, which is the failure
  this state exists to prevent.

#### Example

```ts
import { requiredSectionStatus, type RequiredSectionEvaluation } from "@cosyte/ccda";
const e: RequiredSectionEvaluation = requiredSectionStatus("ccd", {
  stamp: "unmodeled-release",
}).evaluation;
// "not-evaluated"
```

***

### RequiredSectionVerification

> **RequiredSectionVerification** = `"traced-complete"` \| `"traced-partial"` \| `"untraced"` \| `"not-applicable"`

How much of a [DocumentType](#documenttype-4)'s required-section obligation this package
has actually read off the normative source of the release named in
[RequiredSectionStatus.release](#requiredsectionstatus): for C-CDA R2.1, its `CONF:1198-`
document-level conformance statements and the Schematron HL7 publishes in
that release; for C-CDA 5.0.0, the document profiles HL7 publishes it from.

The four states are exhaustive and mutually exclusive, so an **empty** key set
is never ambiguous: the value says which emptiness it is.

**A state is about the TYPE in one release.** No option moves it within a
release; the `r30-stamped` reading reports the 5.0.0 row, where the type has
one. The orthogonal question,
whether an obligation was computed for the document in front of you at all, is
[RequiredSectionEvaluation](#requiredsectionevaluation), which is where a stamp naming an unmodelled
release shows up. Reading `traced-complete` beside an empty key set is not a
contradiction; it means the type's obligation is fully read and this lookup
did not evaluate it.

- `traced-complete`: traced, and every SHALL section the source names for the
  type is asserted.
- `traced-partial`: traced, and one or more named SHALL sections are not
  asserted. Each is named in [RequiredSectionStatus.unasserted](#unasserted) with the
  reason it is unassertable.
- `untraced`: whatever keys the type asserts predate the trace, and no claim
  is made that they are complete. A citation recorded against a key does not
  promote the type out of this state, because a traced state is a claim about
  the source having been read for **that** type, not about provenance
  existing somewhere. **No recognized document type reports this today**: the
  value stays in the vocabulary because it is the honest state for a type
  whose obligation has not been read, and removing it from the union would be
  a breaking change that buys nothing.
- `not-applicable`: the type structurally carries no sections, so it has no
  section obligation to trace.

#### Example

```ts
import { requiredSectionStatus, type RequiredSectionVerification } from "@cosyte/ccda";
const state: RequiredSectionVerification = requiredSectionStatus("progressNote").verification;
// "traced-partial"
```

***

### SectionEdit

> **SectionEdit** = `SectionInput` & `object`

One section add/replace operation: a SectionInput (the section `kind`
plus its typed builder `content`) with an optional [SectionEditMode](#sectioneditmode)
(default `"upsert"`). The union is discriminated on `kind`, so `content` is
typed to exactly that section's `BuildCcda*` shape.

#### Type Declaration

##### mode?

> `readonly` `optional` **mode?**: [`SectionEditMode`](#sectioneditmode)

#### Example

```ts
import type { SectionEdit } from "@cosyte/ccda";
const addAProblem: SectionEdit = {
  kind: "problems",
  mode: "replace",
  content: [{ problem: { code: "38341003", displayName: "Hypertension" }, status: "active" }],
};
```

***

### SectionEditMode

> **SectionEditMode** = `"add"` \| `"replace"` \| `"upsert"`

How a [SectionEdit](#sectionedit) reconciles with the section already in the document:
`"add"` requires the section be **absent** (else [CcdaEditError](#ccdaediterror)
`SECTION_ALREADY_PRESENT`), `"replace"` requires it be **present** (else
`SECTION_ABSENT`), and `"upsert"` (the default) replaces it when present and
adds it when absent.

#### Example

```ts
import type { SectionEditMode } from "@cosyte/ccda";
const mode: SectionEditMode = "add";
```

***

### StatusDomain

> **StatusDomain** = `"functional"` \| `"mental"`

Which status section a [StatusObservation](#statusobservation) came from, `"functional"`
(ADLs, mobility, self-care) or `"mental"` (cognition, mood). Preserved so a
consumer can tell the two apart without re-reading the DOM; the two are never
conflated.

#### Example

```ts
import type { StatusDomain } from "@cosyte/ccda";
const d: StatusDomain = "functional";
```

***

### TemplateStampReading

> **TemplateStampReading** = `"r21-stamped"` \| `"r30-stamped"` \| `"unstamped"` \| `"unmodeled-release"`

The four readings a document-level `templateId`'s version stamp can take,
and the reason a boolean cannot carry them. A `boolean` says "R2.1-stamped or
not", which reads a document from the future as one from the past: it is the
distinction between *no stamp at all* (an R1.1-origin document, whose SHALL
obligations this package deliberately does not narrow), *the stamp of a
later release this package has read the required sections of* (`2024-05-01`,
read against C-CDA 5.0.0) and *a stamp this package does not model* (a
release whose obligations this package has not read and therefore must not
compute).

- `r21-stamped`: the R2.1 stamp is present, so the R2.1-scoped tables apply.
- `r30-stamped`: the `2024-05-01` stamp ([R30\_EXTENSION](#r30_extension)) that C-CDA
  3.0.0 introduced and 4.0.0 and 5.0.0 kept. The required sections are checked
  against the C-CDA 5.0.0 document profiles, which state the same
  document-level section requirements as 3.0.0 and 4.0.0.
- `unstamped`: no `@extension` at all; the pre-R2.1 reading, unchanged.
- `unmodeled-release`: any other `@extension`, one that is neither the R2.1
  stamp nor `2024-05-01`. This package has not read that release's
  obligations and reports them unevaluated rather than reducing them.

**Added in a patch: `r30-stamped`.** Through the release before it, the
`2024-05-01` stamp read `unmodeled-release`. A `switch` over this union that
names every member needs one more case.

#### Example

```ts
import type { TemplateStampReading } from "@cosyte/ccda";
const reading: TemplateStampReading = "r30-stamped";
```

***

### UnassertedSectionReason

> **UnassertedSectionReason** = `"outside-section-catalog"` \| `"not-unconditionally-required"` \| `"assertion-would-tighten-parse"`

Why a SHALL section the source names is **not** asserted. Three reasons
exist. The first two are facts about the parser or the source, and neither is
a judgement call; the third is a decision, and says so:

- `outside-section-catalog`: this parser does not recognize the section at
  all, so it can neither find it nor honestly report it missing.
- `not-unconditionally-required`: the source does not require it
  unconditionally (a choice such as `SHALL contain A or B`, or a rule context
  conditioned on something other than the R2.1 `@extension` stamp), and
  asserting a conditional requirement as unconditional mis-flags conformant
  documents.
- `assertion-would-tighten-parse`: the parser recognizes the section when a
  document carries it, and the source requires it unconditionally, but
  asserting it would newly report `REQUIRED_SECTION_MISSING` on documents this
  parser reads without that warning today (and, under `strict: true`, refuse
  them). Making the parser stricter is its own change with its own blast
  radius, so it is not taken as a side effect of recognizing a section. One
  section carries this reason today: the Discharge Summary's Hospital Course
  Section.

#### Example

```ts
import { requiredSectionStatus, type UnassertedSectionReason } from "@cosyte/ccda";
const why: UnassertedSectionReason | undefined =
  requiredSectionStatus("operativeNote").unasserted[0]?.reason;
// "outside-section-catalog"
```

***

### ValueSetBindingStrength

> **ValueSetBindingStrength** = `"required"` \| `"preferred"`

How strongly C-CDA binds a value set to a coded slot, in the vocabulary the
standard's own general guidance defines: a SHALL binding is `required`, a
SHOULD or MAY binding is `preferred`.

The distinction is the difference between a conformance failure and a
suggestion, which is why it is declared data here rather than assumed: only a
`required` row can produce `VALUE_SET_BINDING_VIOLATED`.

#### Example

```ts
import { valueSetBinding, type ValueSetBindingStrength } from "@cosyte/ccda";
const strength: ValueSetBindingStrength = valueSetBinding("medication").strength;
// "required"
```

***

### WarningCode

> **WarningCode** = *typeof* [`WARNING_CODES`](#warning_codes)\[keyof *typeof* [`WARNING_CODES`](#warning_codes)\]

Discriminant type for `CcdaWarning.code`. Narrowing a warning by this code
lets consumers write exhaustive `switch` blocks (enabled by the
`switch-exhaustiveness-check` lint rule) and guarantees a typo-free
comparison against the `WARNING_CODES` registry.

#### Example

```ts
import type { CcdaWarning, WarningCode } from "@cosyte/ccda";
function describe(w: CcdaWarning): string {
  const code: WarningCode = w.code;
  switch (code) {
    case "UNKNOWN_DOCUMENT_TEMPLATE":
      return "unrecognized document type";
    default:
      return `warning: ${code}`;
  }
}
```

## Variables

### CCDA\_CONFORMANCE\_RELEASE

> `const` **CCDA\_CONFORMANCE\_RELEASE**: [`CcdaRelease`](#ccdarelease) = `"R2.1"`

The C-CDA release this package's conformance tables target: the
required-section (SHALL) tables, the recognition catalogs and the version
stamp every one of them is written against.

**This is the answer to "which release does `@cosyte/ccda` validate
against", as a value rather than a sentence in a README.** It does not move
when a later release is *recognized*: recognizing a stamp is knowing which
guide a document was written for, which is not the same as reading it
correctly against that guide.

#### Example

```ts
import { CCDA_CONFORMANCE_RELEASE } from "@cosyte/ccda";
CCDA_CONFORMANCE_RELEASE; // "R2.1"
```

***

### CCDA\_RELEASE\_STAMPS

> `const` **CCDA\_RELEASE\_STAMPS**: readonly [`CcdaReleaseStamp`](#ccdareleasestamp)[]

**The closed, package-owned table of C-CDA document-template version stamps.**
Two entries today: R2.1's `2015-08-01` and the `2024-05-01` stamp C-CDA
introduced at Release 3.0.0 and carried through 4.0.0 and 5.0.0.

Every stamp a diagnostic here can report comes from this table. The document's
own `@extension` is compared against it and is never echoed: a value that is
not a member yields a message that names no stamp at all, which is the same
membership discipline `NULL_FLAVORS` and the section catalog use.

#### Example

```ts
import { CCDA_RELEASE_STAMPS } from "@cosyte/ccda";
CCDA_RELEASE_STAMPS.map((e) => e.stamp); // ["2015-08-01", "2024-05-01"]
```

***

### CCDA\_RELEASES

> `const` **CCDA\_RELEASES**: readonly \[`"R2.1"`, `"R3.0 or later"`\]

The C-CDA releases this package can name from a document-template version
stamp. **A closed set of literals this package owns**, exactly like
[DOCUMENT\_TYPES](#document_types): a diagnostic naming a release names a member of this
list, never a value copied out of the document being parsed.

`"R3.0 or later"` is one member rather than three because the stamp cannot
tell those releases apart: 3.0.0 restamped every document template and 4.0.0
and 5.0.0 left that stamp alone, so a document carrying it may have been
written for any of them. Splitting the member would be a claim the stamp does
not support.

#### Example

```ts
import { CCDA_RELEASES } from "@cosyte/ccda";
CCDA_RELEASES.includes("R2.1"); // true
```

***

### ccdaProfiles

> `const` **ccdaProfiles**: `object`

Namespace object exposing the built-in profiles: the conservative `default`
baseline plus the two evidence-backed conformance profiles (`smartScorecard`,
`legacyR11`), each authored via the public `defineCcdaProfile()` API and
carrying its cited public provenance.

#### Type Declaration

##### default

> `readonly` **default**: [`CcdaProfile`](#ccdaprofile)

##### legacyR11

> `readonly` **legacyR11**: [`CcdaProfile`](#ccdaprofile)

##### smartScorecard

> `readonly` **smartScorecard**: [`CcdaProfile`](#ccdaprofile)

#### Example

```ts
import { parseCcda, ccdaProfiles } from "@cosyte/ccda";
const doc = parseCcda(raw, { profile: ccdaProfiles.smartScorecard });
console.log(doc.profile?.name); // "smartScorecard"
```

***

### CDA\_DOCUMENT\_OID

> `const` **CDA\_DOCUMENT\_OID**: `"2.16.840.1.113883.10.20.22.1.1"` = `"2.16.840.1.113883.10.20.22.1.1"`

The US Realm Header `templateId` root, which every C-CDA R2.1 document carries beside its document-type template.

***

### CVX

> `const` **CVX**: `"2.16.840.1.113883.12.292"` = `"2.16.840.1.113883.12.292"`

CVX, CDC vaccine administered code system (immunizations).

***

### DEFAULT\_LIMITS

> `const` **DEFAULT\_LIMITS**: [`ResolvedLimits`](#resolvedlimits)

Library-default safety caps applied before DOM construction. Tuned to admit
real C-CDA documents (which can embed sizeable base64 images) while still
bounding hostile input. Callers tighten or loosen via
`ParseCcdaOptions.limits`.

#### Example

```ts
import { DEFAULT_LIMITS } from "@cosyte/ccda";
console.log(DEFAULT_LIMITS.maxInputBytes); // 30000000
```

***

### DOCUMENT\_TYPES

> `const` **DOCUMENT\_TYPES**: readonly [`DocumentType`](#documenttype-4)[]

Every recognized [DocumentType](#documenttype-4), in the recognition table's own order.
The runtime enumeration behind the type union: a consumer can walk all
thirteen without hand-writing the list (and without it going stale when
another type is recognized).

#### Example

```ts
import { DOCUMENT_TYPES } from "@cosyte/ccda";
DOCUMENT_TYPES.length; // 13
DOCUMENT_TYPES.includes("carePlan"); // true
```

***

### FATAL\_CODES

> `const` **FATAL\_CODES**: `object`

Stable string codes for every Tier-3 fatal the parser may throw. Consumers
narrow on `err.code` to react to specific structural or safety failures.
Each code is its own value (`key === value`) so the set survives
`Object.values(...)` into a snapshot tripwire. Renaming a code is a
**breaking change**.

#### Type Declaration

##### ELEMENT\_DEPTH\_LIMIT\_EXCEEDED

> `readonly` **ELEMENT\_DEPTH\_LIMIT\_EXCEEDED**: `"ELEMENT_DEPTH_LIMIT_EXCEEDED"` = `"ELEMENT_DEPTH_LIMIT_EXCEEDED"`

##### ENTITY\_EXPANSION\_LIMIT

> `readonly` **ENTITY\_EXPANSION\_LIMIT**: `"ENTITY_EXPANSION_LIMIT"` = `"ENTITY_EXPANSION_LIMIT"`

##### INPUT\_SIZE\_LIMIT\_EXCEEDED

> `readonly` **INPUT\_SIZE\_LIMIT\_EXCEEDED**: `"INPUT_SIZE_LIMIT_EXCEEDED"` = `"INPUT_SIZE_LIMIT_EXCEEDED"`

##### NODE\_COUNT\_LIMIT\_EXCEEDED

> `readonly` **NODE\_COUNT\_LIMIT\_EXCEEDED**: `"NODE_COUNT_LIMIT_EXCEEDED"` = `"NODE_COUNT_LIMIT_EXCEEDED"`

##### NOT\_A\_CLINICAL\_DOCUMENT

> `readonly` **NOT\_A\_CLINICAL\_DOCUMENT**: `"NOT_A_CLINICAL_DOCUMENT"` = `"NOT_A_CLINICAL_DOCUMENT"`

##### NOT\_WELL\_FORMED\_XML

> `readonly` **NOT\_WELL\_FORMED\_XML**: `"NOT_WELL_FORMED_XML"` = `"NOT_WELL_FORMED_XML"`

##### XXE\_OR\_DTD\_PRESENT

> `readonly` **XXE\_OR\_DTD\_PRESENT**: `"XXE_OR_DTD_PRESENT"` = `"XXE_OR_DTD_PRESENT"`

#### Example

```ts
import { parseCcda, FATAL_CODES, CcdaParseError } from "@cosyte/ccda";
try {
  parseCcda(hostileXml);
} catch (err) {
  if (err instanceof CcdaParseError && err.code === FATAL_CODES.XXE_OR_DTD_PRESENT) {
    // reject the document, it declared a DTD / external entity
  }
}
```

***

### ICD10\_CM

> `const` **ICD10\_CM**: `"2.16.840.1.113883.6.90"` = `"2.16.840.1.113883.6.90"`

ICD-10-CM, US diagnosis coding.

***

### ICD10\_PCS

> `const` **ICD10\_PCS**: `"2.16.840.1.113883.6.4"` = `"2.16.840.1.113883.6.4"`

ICD-10-PCS, US inpatient procedure coding.

***

### ICD9\_CM\_DX

> `const` **ICD9\_CM\_DX**: `"2.16.840.1.113883.6.103"` = `"2.16.840.1.113883.6.103"`

ICD-9-CM diagnosis, **deprecated** in US contexts (replaced by ICD-10-CM).

***

### ICD9\_CM\_PROC

> `const` **ICD9\_CM\_PROC**: `"2.16.840.1.113883.6.104"` = `"2.16.840.1.113883.6.104"`

ICD-9-CM procedure, **deprecated** (replaced by ICD-10-PCS).

***

### INTERPRETATION

> `const` **INTERPRETATION**: `"2.16.840.1.113883.5.83"` = `"2.16.840.1.113883.5.83"`

HL7 ObservationInterpretation, the `interpretationCode` value set source.

***

### LOINC

> `const` **LOINC**: `"2.16.840.1.113883.6.1"` = `"2.16.840.1.113883.6.1"`

LOINC, observations, lab tests, section/document codes.

***

### NCI\_ROUTE

> `const` **NCI\_ROUTE**: `"2.16.840.1.113883.3.26.1.1"` = `"2.16.840.1.113883.3.26.1.1"`

NCI Thesaurus, the C-CDA `routeCode` value set source.

***

### NDC

> `const` **NDC**: `"2.16.840.1.113883.6.69"` = `"2.16.840.1.113883.6.69"`

NDC, National Drug Code (packaged products).

***

### NULL\_FLAVORS

> `const` **NULL\_FLAVORS**: readonly \[`"NI"`, `"INV"`, `"DER"`, `"OTH"`, `"NINF"`, `"PINF"`, `"UNC"`, `"MSK"`, `"NA"`, `"UNK"`, `"ASKU"`, `"NAV"`, `"NASK"`, `"NAVU"`, `"QS"`, `"TRC"`, `"NP"`\]

The HL7 v3 NullFlavor code system (`2.16.840.1.113883.5.1008`), which CDA R2
binds `@nullFlavor` to. All seventeen concepts, transcribed from the
published HL7 Terminology `CodeSystem/v3-NullFlavor` (`content: complete`,
`caseSensitive: true`, code-system version `4.0.0`, THO release 7.3.0):
`NI`, `INV`, `DER`, `OTH`, `NINF`, `PINF`, `UNC`, `MSK`, `NA`, `UNK`, `ASKU`,
`NAV`, `NASK`, `NAVU`, `QS`, `TRC`, `NP`.

**It is the whole code system, deliberately, and it used to be eight of the
seventeen.** A conforming `nullFlavor="PINF"` on a `PQ`, or the
`nullFlavor="NP"` a real Plan of Treatment carries on a `<code>`, drew a false
`INVALID_NULL_FLAVOR` on the published `0.0.4`, because the list held only the
eight tokens the header and the common datatypes use. Membership here is also
the bound that decides whether a `templateId`'s or an `ED`'s `nullFlavor` is
echoed or `<withheld>` (`./ii.ts`, `./ed.ts`), and widening does not weaken
it: every entry is a fixed literal this package owns, so the bound is still
"a member of a closed set", now the same closed set the standard defines.

`NP` carries `status: retired` in THO. It is admitted anyway, because it **is**
a concept of the code system and `INVALID_NULL_FLAVOR` says a token is not:
saying so about a real code is the false positive, and this package has no
deprecation signal for `nullFlavor` to say anything narrower with.

#### Example

```ts
import { NULL_FLAVORS } from "@cosyte/ccda";
console.log(NULL_FLAVORS.includes("UNK")); // true
```

***

### R21\_EXTENSION

> `const` **R21\_EXTENSION**: `"2015-08-01"` = `"2015-08-01"`

The C-CDA R2.1 version stamp carried in a recognized `templateId/@extension`.

***

### R30\_EXTENSION

> `const` **R30\_EXTENSION**: `"2024-05-01"` = `"2024-05-01"`

The document-template version stamp C-CDA introduced at Release 3.0.0, when
"all document template ids received a new extension", and which Releases
4.0.0 and 5.0.0 kept: the published guide's own US Realm Header and CCD
StructureDefinitions both pattern `@extension` to this value on the roots this
package recognizes.

**Recognized, and read against 5.0.0's required sections.** This package's
conformance tables are C-CDA R2.1 ([CCDA\_CONFORMANCE\_RELEASE](#ccda_conformance_release)) and this
constant does not move them. A document whose document-type `templateId`
carries this stamp, and no R2.1 stamp on the same root, reads `r30-stamped`
([TemplateStampReading](#templatestampreading)), and its required sections are checked against
the C-CDA 5.0.0 document profiles. Its sections and entries are still read
with the R2.1 catalogs.

#### Example

```ts
import { R30_EXTENSION } from "@cosyte/ccda";
R30_EXTENSION; // "2024-05-01"
```

***

### RXNORM

> `const` **RXNORM**: `"2.16.840.1.113883.6.88"` = `"2.16.840.1.113883.6.88"`

RxNorm, clinical drugs and ingredients.

***

### SAFETY\_CRITICAL\_CODES

> `const` **SAFETY\_CRITICAL\_CODES**: `ReadonlySet`\<[`WarningCode`](#warningcode)\>

Warning codes no profile may list in its `tolerate` set. Genuinely immutable:
it exposes only the read half of the `Set` surface and is frozen, so a
safety-critical code cannot be deleted at runtime to smuggle it past the
gate. (`Object.freeze(new Set(...))` would **not** achieve this, `delete`
mutates an internal slot a freeze does not reach.)

#### Example

```ts
import { SAFETY_CRITICAL_CODES } from "@cosyte/ccda";
console.log(SAFETY_CRITICAL_CODES.has("MISSING_DOSE_QUANTITY")); // true
```

***

### SDTC\_NS

> `const` **SDTC\_NS**: `"urn:hl7-org:sdtc"` = `"urn:hl7-org:sdtc"`

The HL7 standards-development-organization extension namespace (`sdtc`),
used for attributes/elements the base CDA schema does not define but C-CDA
permits (e.g. `sdtc:raceCode`, `sdtc:deceasedInd`).

#### Example

```ts
import { SDTC_NS } from "@cosyte/ccda";
console.log(SDTC_NS); // "urn:hl7-org:sdtc"
```

***

### SNOMED\_CT

> `const` **SNOMED\_CT**: `"2.16.840.1.113883.6.96"` = `"2.16.840.1.113883.6.96"`

SNOMED CT, clinical findings, problems, allergen substances.

***

### SYNTHETIC\_SETID\_PREFIX

> `const` **SYNTHETIC\_SETID\_PREFIX**: `"SYNTHETIC-SETID"` = `"SYNTHETIC-SETID"`

The `@extension` prefix every `setId` [editCcda](#editccda) **mints** carries, so a
minted version-series identifier is recognisable as one on sight and in code.

A minted `setId` looks like `SYNTHETIC-SETID-e1` under the synthetic
assigning-authority root `2.16.840.1.113883.19.5.99999` (an OID in HL7's own
example arc, which is not an organisation's real namespace). Together those
two are the whole scheme; [isSyntheticSetId](#issyntheticsetid) is the check.

**A `setId` the source already carried, or one the caller supplied through
`revision.setId`, is never relabelled.** The prefix marks what this library
invented, and only that.

**The residual, stated rather than implied: nothing forces a receiving system
to read the label.** A receiver that ignores both the prefix and the root will
treat a minted `setId` exactly as it treats a real one, and this library
cannot make it do otherwise. Making it obvious is the whole of what a label
can do; it does not make the identifier true. The alternative considered and
rejected was to stop minting, which would emit a replacement whose `setId`
does not match its own `parentDocument`'s, and CDA R2 requires that it does.

#### Example

```ts
import { SYNTHETIC_SETID_PREFIX } from "@cosyte/ccda";
console.log(SYNTHETIC_SETID_PREFIX); // "SYNTHETIC-SETID"
```

***

### UNII

> `const` **UNII**: `"2.16.840.1.113883.4.9"` = `"2.16.840.1.113883.4.9"`

UNII, FDA Unique Ingredient Identifier (substances/allergens).

***

### V3\_NS

> `const` **V3\_NS**: `"urn:hl7-org:v3"` = `"urn:hl7-org:v3"`

The HL7 v3 / CDA R2 default namespace. Every structural C-CDA element
(`ClinicalDocument`, `recordTarget`, `section`, …) lives here.

#### Example

```ts
import { V3_NS } from "@cosyte/ccda";
console.log(V3_NS); // "urn:hl7-org:v3"
```

***

### VERSION

> `const` **VERSION**: `string` = `"0.1.5"`

Library version string, synced with `package.json#version` at build time.

#### Example

```ts
import { VERSION } from "@cosyte/ccda";
console.log(VERSION);
```

***

### WARNING\_CODES

> `const` **WARNING\_CODES**: `object`

Stable string codes for every Tier-2 warning the parser may emit. The
registry is frozen via `as const` so TypeScript infers the exact string
literal union for `WarningCode`, there is zero runtime cost and no
magic-string comparisons for consumers. Each code is its own value
(`key === value`) so the set survives `Object.values(...)` into a snapshot
tripwire. Renaming a code is a **breaking change**.

#### Type Declaration

##### ALLERGEN\_GRANULARITY\_SUSPECT

> `readonly` **ALLERGEN\_GRANULARITY\_SUSPECT**: `"ALLERGEN_GRANULARITY_SUSPECT"` = `"ALLERGEN_GRANULARITY_SUSPECT"`

##### CODE\_NARRATIVE\_MISMATCH

> `readonly` **CODE\_NARRATIVE\_MISMATCH**: `"CODE_NARRATIVE_MISMATCH"` = `"CODE_NARRATIVE_MISMATCH"`

##### CONTRADICTORY\_NULL\_FLAVOR

> `readonly` **CONTRADICTORY\_NULL\_FLAVOR**: `"CONTRADICTORY_NULL_FLAVOR"` = `"CONTRADICTORY_NULL_FLAVOR"`

##### DEPRECATED\_CODE\_SYSTEM

> `readonly` **DEPRECATED\_CODE\_SYSTEM**: `"DEPRECATED_CODE_SYSTEM"` = `"DEPRECATED_CODE_SYSTEM"`

##### DEPRECATED\_LOINC

> `readonly` **DEPRECATED\_LOINC**: `"DEPRECATED_LOINC"` = `"DEPRECATED_LOINC"`

##### ENCODING\_BOM\_STRIPPED

> `readonly` **ENCODING\_BOM\_STRIPPED**: `"ENCODING_BOM_STRIPPED"` = `"ENCODING_BOM_STRIPPED"`

##### FREE\_TEXT\_REFERENCE\_RANGE

> `readonly` **FREE\_TEXT\_REFERENCE\_RANGE**: `"FREE_TEXT_REFERENCE_RANGE"` = `"FREE_TEXT_REFERENCE_RANGE"`

##### IMMUNIZATION\_REFUSED

> `readonly` **IMMUNIZATION\_REFUSED**: `"IMMUNIZATION_REFUSED"` = `"IMMUNIZATION_REFUSED"`

##### INVALID\_NULL\_FLAVOR

> `readonly` **INVALID\_NULL\_FLAVOR**: `"INVALID_NULL_FLAVOR"` = `"INVALID_NULL_FLAVOR"`

##### MALFORMED\_DATETIME

> `readonly` **MALFORMED\_DATETIME**: `"MALFORMED_DATETIME"` = `"MALFORMED_DATETIME"`

##### MEDICATION\_PRODUCT\_ARM\_CONFLICT

> `readonly` **MEDICATION\_PRODUCT\_ARM\_CONFLICT**: `"MEDICATION_PRODUCT_ARM_CONFLICT"` = `"MEDICATION_PRODUCT_ARM_CONFLICT"`

##### MEDICATION\_PRODUCT\_ARM\_REPEATED

> `readonly` **MEDICATION\_PRODUCT\_ARM\_REPEATED**: `"MEDICATION_PRODUCT_ARM_REPEATED"` = `"MEDICATION_PRODUCT_ARM_REPEATED"`

##### MEDICATION\_PRODUCT\_ARM\_UNEXPECTED

> `readonly` **MEDICATION\_PRODUCT\_ARM\_UNEXPECTED**: `"MEDICATION_PRODUCT_ARM_UNEXPECTED"` = `"MEDICATION_PRODUCT_ARM_UNEXPECTED"`

##### MEDICATION\_PRODUCT\_CODE\_REPEATED

> `readonly` **MEDICATION\_PRODUCT\_CODE\_REPEATED**: `"MEDICATION_PRODUCT_CODE_REPEATED"` = `"MEDICATION_PRODUCT_CODE_REPEATED"`

##### MEDICATION\_PRODUCT\_CODE\_TRANSLATION\_ONLY

> `readonly` **MEDICATION\_PRODUCT\_CODE\_TRANSLATION\_ONLY**: `"MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY"` = `"MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY"`

##### MISSING\_ASSIGNING\_AUTHORITY

> `readonly` **MISSING\_ASSIGNING\_AUTHORITY**: `"MISSING_ASSIGNING_AUTHORITY"` = `"MISSING_ASSIGNING_AUTHORITY"`

##### MISSING\_CODE\_SYSTEM

> `readonly` **MISSING\_CODE\_SYSTEM**: `"MISSING_CODE_SYSTEM"` = `"MISSING_CODE_SYSTEM"`

##### MISSING\_CODE\_VALUE

> `readonly` **MISSING\_CODE\_VALUE**: `"MISSING_CODE_VALUE"` = `"MISSING_CODE_VALUE"`

##### MISSING\_DOSE\_QUANTITY

> `readonly` **MISSING\_DOSE\_QUANTITY**: `"MISSING_DOSE_QUANTITY"` = `"MISSING_DOSE_QUANTITY"`

##### MISSING\_PLANNED\_MEDICATION\_EFFECTIVE\_TIME

> `readonly` **MISSING\_PLANNED\_MEDICATION\_EFFECTIVE\_TIME**: `"MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME"` = `"MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME"`

##### MISSING\_PRODUCT\_CODE

> `readonly` **MISSING\_PRODUCT\_CODE**: `"MISSING_PRODUCT_CODE"` = `"MISSING_PRODUCT_CODE"`

##### MISSING\_ROUTE\_CODE

> `readonly` **MISSING\_ROUTE\_CODE**: `"MISSING_ROUTE_CODE"` = `"MISSING_ROUTE_CODE"`

##### MISSING\_SELF\_CARE\_ACTIVITY

> `readonly` **MISSING\_SELF\_CARE\_ACTIVITY**: `"MISSING_SELF_CARE_ACTIVITY"` = `"MISSING_SELF_CARE_ACTIVITY"`

##### MISSING\_TEMPLATE\_ID

> `readonly` **MISSING\_TEMPLATE\_ID**: `"MISSING_TEMPLATE_ID"` = `"MISSING_TEMPLATE_ID"`

##### MISSING\_UNIT\_ON\_PQ

> `readonly` **MISSING\_UNIT\_ON\_PQ**: `"MISSING_UNIT_ON_PQ"` = `"MISSING_UNIT_ON_PQ"`

##### MULTIPLE\_EFFECTIVE\_TIMES\_UNRESOLVED

> `readonly` **MULTIPLE\_EFFECTIVE\_TIMES\_UNRESOLVED**: `"MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED"` = `"MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED"`

##### MULTIPLE\_RECORD\_TARGETS

> `readonly` **MULTIPLE\_RECORD\_TARGETS**: `"MULTIPLE_RECORD_TARGETS"` = `"MULTIPLE_RECORD_TARGETS"`

##### NARRATIVE\_REFERENCE\_BROKEN

> `readonly` **NARRATIVE\_REFERENCE\_BROKEN**: `"NARRATIVE_REFERENCE_BROKEN"` = `"NARRATIVE_REFERENCE_BROKEN"`

##### NEGATION\_VS\_NULLFLAVOR\_AMBIGUOUS

> `readonly` **NEGATION\_VS\_NULLFLAVOR\_AMBIGUOUS**: `"NEGATION_VS_NULLFLAVOR_AMBIGUOUS"` = `"NEGATION_VS_NULLFLAVOR_AMBIGUOUS"`

##### NON\_UCUM\_UNIT

> `readonly` **NON\_UCUM\_UNIT**: `"NON_UCUM_UNIT"` = `"NON_UCUM_UNIT"`

##### PLAN\_ENTRY\_NOT\_MODELED

> `readonly` **PLAN\_ENTRY\_NOT\_MODELED**: `"PLAN_ENTRY_NOT_MODELED"` = `"PLAN_ENTRY_NOT_MODELED"`

##### PLANNED\_VS\_PERFORMED\_AMBIGUOUS

> `readonly` **PLANNED\_VS\_PERFORMED\_AMBIGUOUS**: `"PLANNED_VS_PERFORMED_AMBIGUOUS"` = `"PLANNED_VS_PERFORMED_AMBIGUOUS"`

##### PROBLEM\_STATUS\_INDETERMINATE

> `readonly` **PROBLEM\_STATUS\_INDETERMINATE**: `"PROBLEM_STATUS_INDETERMINATE"` = `"PROBLEM_STATUS_INDETERMINATE"`

##### PROCEDURE\_MOOD\_UNEXPECTED

> `readonly` **PROCEDURE\_MOOD\_UNEXPECTED**: `"PROCEDURE_MOOD_UNEXPECTED"` = `"PROCEDURE_MOOD_UNEXPECTED"`

##### PROFILE\_QUIRK\_APPLIED

> `readonly` **PROFILE\_QUIRK\_APPLIED**: `"PROFILE_QUIRK_APPLIED"` = `"PROFILE_QUIRK_APPLIED"`

##### REQUIRED\_SECTION\_MISSING

> `readonly` **REQUIRED\_SECTION\_MISSING**: `"REQUIRED_SECTION_MISSING"` = `"REQUIRED_SECTION_MISSING"`

##### REQUIRED\_SECTIONS\_NOT\_EVALUATED

> `readonly` **REQUIRED\_SECTIONS\_NOT\_EVALUATED**: `"REQUIRED_SECTIONS_NOT_EVALUATED"` = `"REQUIRED_SECTIONS_NOT_EVALUATED"`

##### RESULT\_VALUE\_TYPE\_UNHANDLED

> `readonly` **RESULT\_VALUE\_TYPE\_UNHANDLED**: `"RESULT_VALUE_TYPE_UNHANDLED"` = `"RESULT_VALUE_TYPE_UNHANDLED"`

##### SECTION\_MATCHED\_BY\_LOINC\_FALLBACK

> `readonly` **SECTION\_MATCHED\_BY\_LOINC\_FALLBACK**: `"SECTION_MATCHED_BY_LOINC_FALLBACK"` = `"SECTION_MATCHED_BY_LOINC_FALLBACK"`

##### SECTION\_PLACEMENT\_SUSPECT

> `readonly` **SECTION\_PLACEMENT\_SUSPECT**: `"SECTION_PLACEMENT_SUSPECT"` = `"SECTION_PLACEMENT_SUSPECT"`

##### SEMANTIC\_CODE\_INVALID

> `readonly` **SEMANTIC\_CODE\_INVALID**: `"SEMANTIC_CODE_INVALID"` = `"SEMANTIC_CODE_INVALID"`

##### SMOKING\_STATUS\_CODE\_UNRECOGNIZED

> `readonly` **SMOKING\_STATUS\_CODE\_UNRECOGNIZED**: `"SMOKING_STATUS_CODE_UNRECOGNIZED"` = `"SMOKING_STATUS_CODE_UNRECOGNIZED"`

##### SMOKING\_STATUS\_UNKNOWN

> `readonly` **SMOKING\_STATUS\_UNKNOWN**: `"SMOKING_STATUS_UNKNOWN"` = `"SMOKING_STATUS_UNKNOWN"`

##### SUBJECT\_CONTEXT\_OVERRIDE

> `readonly` **SUBJECT\_CONTEXT\_OVERRIDE**: `"SUBJECT_CONTEXT_OVERRIDE"` = `"SUBJECT_CONTEXT_OVERRIDE"`

##### TEMPLATE\_EXTENSION\_ABSENT

> `readonly` **TEMPLATE\_EXTENSION\_ABSENT**: `"TEMPLATE_EXTENSION_ABSENT"` = `"TEMPLATE_EXTENSION_ABSENT"`

##### TEMPLATE\_EXTENSION\_UNMODELED\_RELEASE

> `readonly` **TEMPLATE\_EXTENSION\_UNMODELED\_RELEASE**: `"TEMPLATE_EXTENSION_UNMODELED_RELEASE"` = `"TEMPLATE_EXTENSION_UNMODELED_RELEASE"`

##### UCUM\_CASE\_SUSPECT

> `readonly` **UCUM\_CASE\_SUSPECT**: `"UCUM_CASE_SUSPECT"` = `"UCUM_CASE_SUSPECT"`

##### UNEXPECTED\_CODE\_SYSTEM

> `readonly` **UNEXPECTED\_CODE\_SYSTEM**: `"UNEXPECTED_CODE_SYSTEM"` = `"UNEXPECTED_CODE_SYSTEM"`

##### UNIDENTIFIED\_AUTHOR

> `readonly` **UNIDENTIFIED\_AUTHOR**: `"UNIDENTIFIED_AUTHOR"` = `"UNIDENTIFIED_AUTHOR"`

##### UNKNOWN\_DOCUMENT\_TEMPLATE

> `readonly` **UNKNOWN\_DOCUMENT\_TEMPLATE**: `"UNKNOWN_DOCUMENT_TEMPLATE"` = `"UNKNOWN_DOCUMENT_TEMPLATE"`

##### UNKNOWN\_NAMESPACE\_PREFIX

> `readonly` **UNKNOWN\_NAMESPACE\_PREFIX**: `"UNKNOWN_NAMESPACE_PREFIX"` = `"UNKNOWN_NAMESPACE_PREFIX"`

##### UNKNOWN\_SECTION\_CODE

> `readonly` **UNKNOWN\_SECTION\_CODE**: `"UNKNOWN_SECTION_CODE"` = `"UNKNOWN_SECTION_CODE"`

##### VALUE\_SET\_BINDING\_NOT\_EVALUATED

> `readonly` **VALUE\_SET\_BINDING\_NOT\_EVALUATED**: `"VALUE_SET_BINDING_NOT_EVALUATED"` = `"VALUE_SET_BINDING_NOT_EVALUATED"`

##### VALUE\_SET\_BINDING\_VIOLATED

> `readonly` **VALUE\_SET\_BINDING\_VIOLATED**: `"VALUE_SET_BINDING_VIOLATED"` = `"VALUE_SET_BINDING_VIOLATED"`

#### Example

```ts
import { parseCcda, WARNING_CODES } from "@cosyte/ccda";
const doc = parseCcda(raw);
if (doc.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE)) {
  // handle an unrecognized document type
}
```

***

### XSI\_NS

> `const` **XSI\_NS**: `"http://www.w3.org/2001/XMLSchema-instance"` = `"http://www.w3.org/2001/XMLSchema-instance"`

The XML Schema Instance namespace. Carries the `xsi:type` attribute that
selects a concrete HL7 v3 datatype for a polymorphic element (e.g.
`value xsi:type="PQ"`).

#### Example

```ts
import { XSI_NS } from "@cosyte/ccda";
console.log(XSI_NS); // "http://www.w3.org/2001/XMLSchema-instance"
```

## Functions

### applyProfile()

> **applyProfile**(`profile`, `warning`): [`CcdaWarning`](#ccdawarning)

Apply a profile to a single warning. Returns a downgraded
`PROFILE_QUIRK_APPLIED` warning when the profile expects this deviation;
otherwise returns the original warning unchanged (referential identity
preserved, so an un-tolerated warning is never reallocated). A warning that
is already `expected` (e.g. re-processed) is passed through untouched.

#### Parameters

##### profile

[`CcdaProfile`](#ccdaprofile)

##### warning

[`CcdaWarning`](#ccdawarning)

#### Returns

[`CcdaWarning`](#ccdawarning)

#### Example

```ts
import { applyProfile, ccdaProfiles, parseCcda } from "@cosyte/ccda";
const w = parseCcda(raw).warnings[0]!;
const out = applyProfile(ccdaProfiles.smartScorecard, w);
console.log(out.code); // "PROFILE_QUIRK_APPLIED"
console.log(out.toleratedCode); // "DEPRECATED_LOINC"
```

***

### attr()

> **attr**(`el`, `name`): `string` \| `undefined`

Read an unprefixed attribute, returning `undefined` (never `null` or `""`)
when the attribute is absent or empty, matches the
`exactOptionalPropertyTypes` "omit, don't set undefined" discipline used
throughout the model.

#### Parameters

##### el

`Element`

##### name

`string`

#### Returns

`string` \| `undefined`

#### Example

```ts
import { attr } from "@cosyte/ccda";
const root = attr(el, "root"); // string | undefined
```

***

### buildCcda()

> **buildCcda**(`init`, `options?`): [`CcdaDocument`](#ccdadocument)

Build a spec-clean C-CDA R2.1 document from structured input and return the
parsed [CcdaDocument](#ccdadocument). Emits a **CCD** by default, a **Referral Note**
when `documentType: "referralNote"`, or a **Discharge Summary** when
`documentType: "dischargeSummary"`, each with its own US Realm Header
specialization (document `templateId` + LOINC `code`) and SHALL section set.
The emitted document round-trips through [parseCcda](#parseccda) by construction (see
the module doc); a clean build carries zero warnings.

#### Parameters

##### init

[`BuildCcdaInit`](#buildccdainit)

The document content; see [BuildCcdaInit](#buildccdainit). `patient` is required.

##### options?

[`BuildCcdaOptions`](#buildccdaoptions) = `{}`

Optional [BuildCcdaOptions](#buildccdaoptions); pass a bring-your-own
  `terminology` adapter to have the returned document flag adapter-rejected
  codes (`SEMANTIC_CODE_INVALID`) and to emit `<translation>` alternate codings
  from its optional `translate`. The builder never coerces a code to satisfy the
  adapter, every primary value is emitted verbatim and a `<translation>` is only
  ever an additional alternate coding.

#### Returns

[`CcdaDocument`](#ccdadocument)

The parsed document, the parse of the spec-clean XML just emitted,
  carrying the re-parse's warnings plus any build-time diagnostic about the
  input (today: `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` and
  `MISSING_SELF_CARE_ACTIVITY`, appended last).

#### Throws

When `documentType` is anything other than a
  [BuildableDocumentType](#buildabledocumenttype) (the three types this builder supports; only an
  omitted, `undefined` one defaults to a CCD, and `null` or a non-string is
  refused), when a type-specific input is supplied to a type that does not
  carry it (`hospitalCourse`, `dischargeDiagnoses` or `encompassingEncounter`
  on anything but a Discharge Summary; `assessment` or `reasonForReferral` on a
  Discharge Summary), when an allergy
  is neither an `allergen` nor `noKnownAllergy`, when a result does not carry
  exactly one value form (`quantity` / `codedValue` / `stringValue`), when a
  `"observation"`-variant procedure omits its SHALL `value`, when a
  family-history entry carries an empty `observations` list, or when a problem
  or allergy supplies a `resolution` date without `status: "resolved"`.

#### Example

```ts
import { buildCcda, serializeCcda } from "@cosyte/ccda";
const doc = buildCcda({
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
  allergies: [{ allergen: { code: "7980", displayName: "Penicillin G" } }],
});
console.log(doc.getMrn());                 // "MRN001"
console.log(doc.getProblems().length);     // 1
const xml = serializeCcda(doc);            // spec-clean C-CDA R2.1
```

***

### buildDocument()

> **buildDocument**(`root`, `ctx`): `Omit`\<[`CcdaDocumentInit`](#ccdadocumentinit), `"warnings"`\>

Build the [CcdaDocumentInit](#ccdadocumentinit) parts (everything except `warnings`) from a
`ClinicalDocument` root element. Recognizes the document type, parses the
header, and frames the body, a `structuredBody` yields sections; a
`nonXMLBody` yields the quarantined `nonXmlBody` content. Never throws; the
orchestrator supplies `warnings` and constructs the [CcdaDocument](#ccdadocument).

#### Parameters

##### root

`Element`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

`Omit`\<[`CcdaDocumentInit`](#ccdadocumentinit), `"warnings"`\>

#### Example

```ts
import { buildDocument, CcdaDocument } from "@cosyte/ccda";
const parts = buildDocument(root, ctx);
const doc = new CcdaDocument({ ...parts, warnings: [] });
```

***

### buildHeader()

> **buildHeader**(`root`, `ctx`): [`CcdaHeader`](#ccdaheader)

Extract the [CcdaHeader](#ccdaheader) from a `ClinicalDocument` root element. Never
throws; omits any field the document does not carry. Emits
`MULTIPLE_RECORD_TARGETS` when more than one `recordTarget` is present, and
`UNIDENTIFIED_AUTHOR` once per `author` participation carrying neither arm of
the `assignedAuthor` choice.

More than one `author` at the document level is read as more than one author,
in document order, and draws no warning of its own: the US Realm Header
requires **at least** one (CONF:1198-5444), so several is conforming rather
than a deviation. An absent `author` and an absent `custodian` are likewise
left to document-level conformance validation; this function reports what the
document carries and never fabricates the participation it does not.

#### Parameters

##### root

`Element`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`CcdaHeader`](#ccdaheader)

#### Example

```ts
import { buildHeader } from "@cosyte/ccda";
const header = buildHeader(rootEl, { emit: () => {} });
console.log(header.title, header.recordTargets.length);
```

***

### buildNarrativeIndex()

> **buildNarrativeIndex**(`textEl`): `ReadonlyMap`\<`string`, `string`\>

Index a narrative `<text>` block by the `ID` attributes carried on its
descendant elements, mapping each `ID` to that node's trimmed text. C-CDA
entries reference narrative via `<reference value="#id">`; this index lets
the entry layer resolve those references without re-walking the DOM.

#### Parameters

##### textEl

`Element`

#### Returns

`ReadonlyMap`\<`string`, `string`\>

#### Example

```ts
import { buildNarrativeIndex, child } from "@cosyte/ccda";
const index = buildNarrativeIndex(child(sectionEl, "text")!);
console.log(index.get("problem1"));
```

***

### buildSection()

> **buildSection**(`el`, `ctx`, `enclosing?`): [`CcdaSection`](#ccdasection)

Frame a `<section>` element into a [CcdaSection](#ccdasection). Recognizes the section
by `templateId` root (primary) or LOINC `code` (fallback, emitting
`SECTION_MATCHED_BY_LOINC_FALLBACK`); an unrecognized coded section emits
`UNKNOWN_SECTION_CODE` and is retained as narrative-only. Recurses into
nested `<component><section>` subsections. Never throws.

`enclosing` is the author reading of the level this section sits inside (the
document's for a top-level section, the parent section's for a subsection). It
is conducted down to this section and on to its entry acts wherever the level
carries no `author` of its own, and marked `inherited` when it is. Omit it and
the section is read as having no enclosing author, which is what a caller
framing a detached `<section>` element is actually looking at.

#### Parameters

##### el

`Element`

##### ctx

[`ParseCtx`](#parsectx)

##### enclosing?

[`CcdaAuthorship`](#ccdaauthorship)

#### Returns

[`CcdaSection`](#ccdasection)

#### Example

```ts
import { buildSection } from "@cosyte/ccda";
const section = buildSection(sectionEl, { emit: () => {} });
console.log(section.key, section.subsections.length);
```

***

### checkCodeSlot()

> **checkCodeSlot**(`code`, `slot`, `position`, `ctx`): `void`

Validate a coded value's `@codeSystem` against the terminologies expected for
its [CodeSlot](#codeslot). Emits `DEPRECATED_CODE_SYSTEM` for a known-deprecated
system (ICD-9) and `UNEXPECTED_CODE_SYSTEM` for any other unexpected OID.

A `CD` that asserts a `@code` with **no** `@codeSystem` emits
`MISSING_CODE_SYSTEM`: the symbol names no terminology, so it can be neither
read nor checked. No system is ever inferred for it (not from the slot's
expected list, not from a `@codeSystemName` label), and it is therefore never
handed to a [TerminologyAdapter](#terminologyadapter), which validates a `system` + `code`
pair.

The mirror shape emits `MISSING_CODE_VALUE`: a `CD` that is **present** but
asserts no usable `@code` (absent, empty, or whitespace) **and** declares no
`@nullFlavor`, e.g. a system-only `<value codeSystem="…6.96"/>`. A code
system without a symbol identifies a concept no better than a symbol without
a system does. The `nullFlavor` is what separates the two cases: a
`nullFlavor`-only `CD` is a *complete* statement ("this concept is unknown")
and stays silent, while a `CD` that says nothing at all leaves a reader
unable to tell an absent concept from one lost in transformation. An
**absent** value stays silent too, there is no element to judge.

The value is preserved verbatim in every case, and no code, system, or
`nullFlavor` is ever inferred.

#### Parameters

##### code

[`CD`](#cd) \| `undefined`

##### slot

`"problem"` \| `"medication"` \| `"allergen"` \| `"route"` \| `"vaccine"`

##### position

###### column?

`number`

###### line?

`number`

###### path?

`string`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

`void`

#### Example

```ts
import { checkCodeSlot } from "@cosyte/ccda";
checkCodeSlot(problemValue, "problem", { path: "value" }, ctx);
```

***

### checkLoincDeprecation()

> **checkLoincDeprecation**(`code`, `position`, `ctx`): `void`

Flag a result/vital observation `code` that is a known-deprecated LOINC. Emits
`DEPRECATED_LOINC` (code preserved) only when the value is in the LOINC code
system and a recognized-deprecated code; otherwise silent. A value with no
`code` or a non-LOINC system is left unchecked.

#### Parameters

##### code

[`CD`](#cd) \| `undefined`

##### position

[`CcdaPosition`](#ccdaposition)

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

`void`

#### Example

```ts
import { checkLoincDeprecation } from "@cosyte/ccda";
checkLoincDeprecation(observationCode, { path: "code" }, ctx);
```

***

### checkUcumUnit()

> **checkUcumUnit**(`quantity`, `position`, `ctx`): `void`

Validate a [PQ](#pq)'s `@unit` with the computable UCUM grammar, emitting the
appropriate Tier-2 warning: `MISSING_UNIT_ON_PQ` (numeric value, no unit),
`UCUM_CASE_SUSPECT` (a letter-case slip of a canonical unit), or
`NON_UCUM_UNIT` (not well-formed UCUM). The quantity itself is never mutated,
the raw unit is always preserved.

#### Parameters

##### quantity

[`PQ`](#pq)

##### position

[`CcdaPosition`](#ccdaposition)

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

`void`

#### Example

```ts
import { checkUcumUnit } from "@cosyte/ccda";
checkUcumUnit({ value: 5, unit: "cc" }, { path: "value" }, ctx);
```

***

### child()

> **child**(`el`, `localName`): `Element` \| `undefined`

Return the first direct child element in the HL7 v3 namespace with the given
local name, or `undefined`. Only direct children are considered (no
descendant search), so structurally distinct same-named elements at deeper
levels are not accidentally matched.

#### Parameters

##### el

`Element`

##### localName

`string`

#### Returns

`Element` \| `undefined`

#### Example

```ts
import { child } from "@cosyte/ccda";
const code = child(sectionEl, "code"); // Element | undefined
```

***

### childElements()

> **childElements**(`el`): readonly `Element`[]

Return all direct child elements (any namespace), in document order. Used
where the caller wants to enumerate structure without filtering by name.

#### Parameters

##### el

`Element`

#### Returns

readonly `Element`[]

#### Example

```ts
import { childElements } from "@cosyte/ccda";
const kids = childElements(el);
```

***

### children()

> **children**(`el`, `localName`): readonly `Element`[]

Return all direct child elements in the HL7 v3 namespace with the given
local name, in document order. Empty array when none match.

#### Parameters

##### el

`Element`

##### localName

`string`

#### Returns

readonly `Element`[]

#### Example

```ts
import { children } from "@cosyte/ccda";
for (const comp of children(bodyEl, "component")) {
  // ...
}
```

***

### defineCcdaProfile()

> **defineCcdaProfile**(`opts`): [`CcdaProfile`](#ccdaprofile)

Build a frozen [CcdaProfile](#ccdaprofile) from a validated options object. Throws
[CcdaProfileDefinitionError](#ccdaprofiledefinitionerror) on a bad name, an unknown option key, or an
invalid `tolerate` entry, including the **safety rule**: a profile may never
tolerate a safety-critical warning code.

`extends` composes profiles: lineage, `tolerate`, `provenance`, and
`description` merge (parents left-to-right, then self; scalars are child-wins).
The merged `tolerate` set is re-validated so a safety-critical code cannot
sneak in via a hand-crafted parent.

#### Parameters

##### opts

[`DefineCcdaProfileOptions`](#defineccdaprofileoptions)

The profile definition; see [DefineCcdaProfileOptions](#defineccdaprofileoptions).

#### Returns

[`CcdaProfile`](#ccdaprofile)

A frozen, immutable profile with `describe()` attached.

#### Throws

[CcdaProfileDefinitionError](#ccdaprofiledefinitionerror) on any invalid definition.

#### Example

```ts
import { defineCcdaProfile } from "@cosyte/ccda";
const site = defineCcdaProfile({
  name: "acme-hospital",
  description: "Acme's inbound-CCD tolerances",
  tolerate: [
    { code: "TEMPLATE_EXTENSION_ABSENT", rationale: "receives R1.1-origin CCDs" },
  ],
  provenance: { source: "Acme integration corpus", reference: "internal-2026" },
});
console.log(site.lineage); // ["acme-hospital"]
console.log(site.describe?.());
```

***

### documentTypeForOid()

> **documentTypeForOid**(`oid`): [`DocumentType`](#documenttype-4) \| `undefined`

Resolve a document-template OID to its [DocumentType](#documenttype-4), or `undefined`
when the OID is not one of the thirteen recognized types.

#### Parameters

##### oid

`string`

#### Returns

[`DocumentType`](#documenttype-4) \| `undefined`

#### Example

```ts
import { documentTypeForOid } from "@cosyte/ccda";
documentTypeForOid("2.16.840.1.113883.10.20.22.1.2"); // "ccd"
documentTypeForOid("1.2.3");                            // undefined
```

***

### editCcda()

> **editCcda**(`source`, `options?`): [`CcdaDocument`](#ccdadocument)

Re-emit a parsed C-CDA document with sections added or replaced, preserving
every unedited section byte-faithfully and (by default) stamping a CDA R2
revision that supersedes the source. See the module overview for the full
contract.

#### Parameters

##### source

[`CcdaDocument`](#ccdadocument)

A document produced by [parseCcda](#parseccda) or `buildCcda`
  (it must retain its source XML: a hand-constructed document, or a value that
  is not a `CcdaDocument` at all, throws `NO_SOURCE_DOCUMENT`).

##### options?

[`EditCcdaOptions`](#editccdaoptions) = `{}`

The section edits to apply, the revision behavior, and an
  optional bring-your-own `terminology` adapter forwarded to the final re-parse
  so the edited document flags adapter-rejected codes (`SEMANTIC_CODE_INVALID`).

#### Returns

[`CcdaDocument`](#ccdadocument)

A new [CcdaDocument](#ccdadocument), the re-parse of the edited XML, plus any
  emit-time diagnostic about what this call grafted (today only
  `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, appended last). The `source` is
  never mutated.

#### Throws

[CcdaEditError](#ccdaediterror) when the source is not a `CcdaDocument` or has
  no retained XML, has no
  `structuredBody` to edit, violates an add/replace precondition, would drop a
  SHALL required section, or (when stamping a revision) has no usable
  `ClinicalDocument.id` for the RPLC link to name, absent or `nullFlavor`-marked
  (`SOURCE_MISSING_ID`).

#### Throws

when a section's content violates a builder guard (an
  invalid timestamp, a resolved problem without a resolution date, …).

#### Example

```ts
import { parseCcda, editCcda } from "@cosyte/ccda";
const doc = parseCcda(xml);
const revised = editCcda(doc, {
  sections: [
    {
      kind: "problems",
      content: [{ problem: { code: "38341003", displayName: "Hypertension" }, status: "active" }],
    },
  ],
});
console.log(revised.header.versionNumber); // incremented from the source
```

***

### extractAllergies()

> **extractAllergies**(`sectionEl`, `narrativeById`, `ctx`): readonly [`AllergyConcern`](#allergyconcern)[]

Extract every Allergy Concern Act from an Allergies `<section>` element. Each
`<entry>` whose act carries the Allergy Concern Act template becomes an
[AllergyConcern](#allergyconcern); the nested Allergy-Intolerance Observations become
[Allergy](#allergy)s (including the "No Known Allergies" negated form). Never
throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`AllergyConcern`](#allergyconcern)[]

#### Example

```ts
import { extractAllergies } from "@cosyte/ccda";
const concerns = extractAllergies(sectionEl, section.narrativeById, ctx);
```

***

### extractClinical()

> **extractClinical**(`structuredBody`, `ctx`): [`ClinicalEntries`](#clinicalentries)

Extract the reconciliation triad from a `structuredBody` element. Walks every
section, runs each triad extractor, and flags misplaced entries. Never
throws; an unstructured document (no `structuredBody`) is handled by the
caller and never reaches here.

#### Parameters

##### structuredBody

`Element`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`ClinicalEntries`](#clinicalentries)

#### Example

```ts
import { extractClinical } from "@cosyte/ccda";
const entries = extractClinical(structuredBodyEl, ctx);
console.log(entries.problems.length);
```

***

### extractEncounters()

> **extractEncounters**(`sectionEl`, `narrativeById`, `ctx`): readonly [`Encounter`](#encounter)[]

Extract every Encounter Activity from an Encounters `<section>` element. Each
`<entry>` whose `encounter` carries the Encounter Activity template becomes an
[Encounter](#encounter). Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`Encounter`](#encounter)[]

#### Example

```ts
import { extractEncounters } from "@cosyte/ccda";
const encounters = extractEncounters(sectionEl, section.narrativeById, ctx);
```

***

### extractFamilyHistory()

> **extractFamilyHistory**(`sectionEl`, `narrativeById`, `ctx`): readonly [`FamilyHistory`](#familyhistory-4)[]

Extract every Family History Organizer from a Family History `<section>`
element. Each `<entry>` whose `organizer` carries the Family History Organizer
template becomes a [FamilyHistory](#familyhistory-4); its `component/observation` members
become [FamilyHistoryObservation](#familyhistoryobservation)s. Never throws.

**This family's CONTENTS are carved out of the subject-override rule and read
every entry the section carries** (`childEntries`, not `readableEntries`): its
contract is a relative's data, so withholding never removes anything from it,
in any document shape. **The report is not carved out.** A section that
declares a subject still declares it, and a consumer whose only call is this
one would otherwise hear nothing about it, so the section's overrides are
reported on the caller's `ctx` under the same arithmetic every other extractor
uses. Memoized per (context, section), so a whole-document parse counts exactly
what it counted before: the record-target extractors reach the section first.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`FamilyHistory`](#familyhistory-4)[]

#### Example

```ts
import { extractFamilyHistory } from "@cosyte/ccda";
const history = extractFamilyHistory(sectionEl, section.narrativeById, ctx);
```

***

### extractFunctionalStatus()

> **extractFunctionalStatus**(`sectionEl`, `narrativeById`, `ctx`): readonly [`StatusObservation`](#statusobservation)[]

Extract every Functional Status finding from a Functional Status `<section>`
element, standalone Functional Status Observations plus the members
(observations and assessment scales) of any Functional Status Organizer. Never
throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`StatusObservation`](#statusobservation)[]

#### Example

```ts
import { extractFunctionalStatus } from "@cosyte/ccda";
const findings = extractFunctionalStatus(sectionEl, section.narrativeById, ctx);
```

***

### extractImmunizations()

> **extractImmunizations**(`sectionEl`, `narrativeById`, `ctx`): readonly [`Immunization`](#immunization)[]

Extract every Immunization Activity from an Immunizations `<section>` element.
Each `<entry>` whose `substanceAdministration` carries the Immunization
Activity template becomes an [Immunization](#immunization). A `negationInd` record is
flagged `IMMUNIZATION_REFUSED`. Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`Immunization`](#immunization)[]

#### Example

```ts
import { extractImmunizations } from "@cosyte/ccda";
const shots = extractImmunizations(sectionEl, section.narrativeById, ctx);
```

***

### extractMedications()

> **extractMedications**(`sectionEl`, `narrativeById`, `ctx`): readonly [`Medication`](#medication)[]

Extract every Medication Activity from a Medications `<section>` element.
Each `<entry>` whose `substanceAdministration` carries the Medication
Activity template becomes a [Medication](#medication). Flags a missing
`doseQuantity` / `routeCode` and an unclassifiable `effectiveTime`. Never
throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`Medication`](#medication)[]

#### Example

```ts
import { extractMedications } from "@cosyte/ccda";
const meds = extractMedications(sectionEl, section.narrativeById, ctx);
```

***

### extractMentalStatus()

> **extractMentalStatus**(`sectionEl`, `narrativeById`, `ctx`): readonly [`StatusObservation`](#statusobservation)[]

Extract every Mental Status finding from a Mental Status `<section>` element,
standalone Mental Status Observations plus the members (observations and
assessment scales) of any Mental Status Organizer. Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`StatusObservation`](#statusobservation)[]

#### Example

```ts
import { extractMentalStatus } from "@cosyte/ccda";
const findings = extractMentalStatus(sectionEl, section.narrativeById, ctx);
```

***

### extractPastMedicalHistory()

> **extractPastMedicalHistory**(`sectionEl`, `narrativeById`, `ctx`): readonly [`Problem`](#problem-1)[]

Extract every bare Problem Observation from a Past Medical History `<section>`
element. Each `<entry>` whose direct `observation` carries the Problem
Observation template becomes a [Problem](#problem-1). Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`Problem`](#problem-1)[]

#### Example

```ts
import { extractPastMedicalHistory } from "@cosyte/ccda";
const history = extractPastMedicalHistory(sectionEl, section.narrativeById, ctx);
```

***

### extractPlannedItems()

> **extractPlannedItems**(`sectionEl`, `narrativeById`, `ctx`): readonly [`PlannedItem`](#planneditem)[]

Extract every planned item from a `<section>` element: each `<entry>` whose act
carries one of the seven templates in PLANNED\_VARIANTS, **and** each of
the seven nested inside a Planned Intervention Act
(PLANNED\_INTERVENTION\_ACT, `…22.4.146`). Never throws.

**The container is named rather than inferred, and it is the only one.** R2.1
gives the Planned Intervention Act an `entryRelationship` for
every one of the seven, each holding the planned act **inline**, so before this
a planned entry sitting there was returned as nothing with nothing said, for
all seven kinds. A Planned Intervention Act nested in a Planned Intervention
Act is descended into too, because the walk is the same walk; the DOM is a
tree, so it terminates.

**It is the only container descended into, and R2.1 has others, so this does
NOT solve nesting in general.** A Nutrition Recommendation (`…22.4.130`)
inline-holds six of the seven by the identical `entryRelationship` pattern
(every planned template except `…22.4.120`), and an Intervention Act
(`…22.4.131`, the performed sibling and the `SHOULD` entry of an Interventions
Section) inline-holds a Planned Intervention Act. A planned entry in either is
still returned as nothing with nothing said. That is left as it was found: the
scope taken here is the one container, and widening it is a decision with its
own base-measured matrix, not a tidy-up. A test pins both as unreached so the
bound is measured rather than asserted.

**An `entryRelationship` is read for what it CONTAINS, never followed for what
it REFERENCES.** The template's `[1..*]` `typeCode="RSON"` relationship holds an
Entry Reference (`…22.4.122`) whose own SHALL points at a Goal Observation.
That act carries no planned template root, so it is walked past rather than
resolved: its target lives elsewhere in the document and is reached on its own
terms, and resolving a pointer here would return an item the container does not
hold.

**Which acts a Planned Intervention Act holds and this still does not return:**
the performed ones (`MedicationActivity`, `ImmunizationActivity`,
`ProcedureActivityProcedure`, `EncounterActivity`, and the rest, none of which
is planned and none of which carries a planned root), and the same three
non-item templates the section itself admits (Instruction `…22.4.20`, Handoff
Communication Participants `…22.4.141`, Nutrition Recommendation `…22.4.130`).
**Those three are now REPORTED at both levels** (`PLAN_ENTRY_NOT_MODELED`),
still not returned. The performed acts are not, and must not be: they are
modelled elsewhere and reached by their own extractors, so a "not modelled"
report on one would be false.

**The two levels are scoped differently, and the scope is a BOUND this package
chose, not a catalog of which sections C-CDA admits these templates in.** A
direct `<entry>` is reported in the **two** sections named on
PLAN\_ENTRY\_REPORT\_SECTION\_KEYS: `planOfTreatment`, the section this
accessor is named for, and `interventions`, the Interventions Section (V3),
which admits a Handoff as a direct entry in as many words (CONF:1198-32402 /
1198-32403, quoted on that constant) and is where R2.1 puts the container the
nested half already reads. Inside a Planned Intervention Act there is no
section condition at all, because the container is what the report is relative
to there and it is read wherever it sits.

An Instruction sitting in the **Instructions Section** (`…22.2.45`) is
deliberately still silent: it is that section's own required entry, and
reporting a conformant document's required entry as "not modelled" would be
noise rather than a finding.

**The residual, stated rather than implied: these three templates appear in
more places than the report covers, and an occurrence outside them is still
dropped in silence.** Two are measured and pinned by test. A Handoff nested in
an **Intervention Act** (`…22.4.131`) is silent, because that act is not a
container this package descends into. Any of the three as a direct entry of a
section this catalog does not recognize at all is silent, because there is no
key to match. Widening further is its own decision with its own base-measured
matrix, not a tidy-up.

**A returned item does not say whether it was a direct `<entry>` or nested.**
The Planned Intervention Act is not modelled: this package carries no container
type, no goal linkage, and no `nested` flag, so the grouping toward a goal is
available only from `doc.toString()`. What `getPlannedItems()` answers is which
acts are planned for this patient, and a nested one is planned on exactly the
same terms as a direct one. Each item keeps its own `ids`, so a caller that
needs the grouping can correlate.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`PlannedItem`](#planneditem)[]

#### Example

```ts
import { extractPlannedItems } from "@cosyte/ccda";
const planned = extractPlannedItems(sectionEl, section.narrativeById, ctx);
```

***

### extractProblems()

> **extractProblems**(`sectionEl`, `narrativeById`, `ctx`): readonly [`ProblemConcern`](#problemconcern)[]

Extract every Problem Concern Act from a Problems `<section>` element. Each
`<entry>` whose act carries the Problem Concern Act template becomes a
[ProblemConcern](#problemconcern); the nested Problem Observations become
[Problem](#problem-1)s. Reconciles each problem's coded value against its narrative
reference. Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`ProblemConcern`](#problemconcern)[]

#### Example

```ts
import { extractProblems } from "@cosyte/ccda";
const concerns = extractProblems(sectionEl, section.narrativeById, ctx);
```

***

### extractProcedures()

> **extractProcedures**(`sectionEl`, `narrativeById`, `ctx`): readonly [`Procedure`](#procedure)[]

Extract every procedure from a Procedures `<section>` element. Each `<entry>`
whose `procedure`/`act`/`observation` carries one of the three Procedure
Activity templates becomes a [Procedure](#procedure). Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`Procedure`](#procedure)[]

#### Example

```ts
import { extractProcedures } from "@cosyte/ccda";
const procedures = extractProcedures(sectionEl, section.narrativeById, ctx);
```

***

### extractResults()

> **extractResults**(`sectionEl`, `narrativeById`, `ctx`): readonly [`ResultOrganizer`](#resultorganizer)[]

Extract every Result Organizer from a Results `<section>` element. Each
`<entry>` whose `organizer` carries the Result Organizer template becomes a
[ResultOrganizer](#resultorganizer); its `component/observation` members become
[Result](#result-1)s. Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`ResultOrganizer`](#resultorganizer)[]

#### Example

```ts
import { extractResults } from "@cosyte/ccda";
const panels = extractResults(sectionEl, section.narrativeById, ctx);
```

***

### extractSmokingStatus()

> **extractSmokingStatus**(`sectionEl`, `narrativeById`, `ctx`): readonly [`SmokingStatus`](#smokingstatus-4)[]

Extract every Smoking Status observation from a Social History `<section>`
element. Each `<entry>` whose `observation` carries the Smoking Status,
Meaningful Use template becomes a [SmokingStatus](#smokingstatus-4). Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`SmokingStatus`](#smokingstatus-4)[]

#### Example

```ts
import { extractSmokingStatus } from "@cosyte/ccda";
const statuses = extractSmokingStatus(sectionEl, section.narrativeById, ctx);
```

***

### extractVitals()

> **extractVitals**(`sectionEl`, `narrativeById`, `ctx`): readonly [`VitalSignsOrganizer`](#vitalsignsorganizer)[]

Extract every Vital Signs Organizer from a Vital Signs `<section>` element.
Each `<entry>` whose `organizer` carries the Vital Signs Organizer template
becomes a [VitalSignsOrganizer](#vitalsignsorganizer); its `component/observation` members
become [VitalSign](#vitalsign)s. Never throws.

#### Parameters

##### sectionEl

`Element`

##### narrativeById

`ReadonlyMap`\<`string`, `string`\>

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

readonly [`VitalSignsOrganizer`](#vitalsignsorganizer)[]

#### Example

```ts
import { extractVitals } from "@cosyte/ccda";
const clusters = extractVitals(sectionEl, section.narrativeById, ctx);
```

***

### getCcdaProfile()

> **getCcdaProfile**(`name`): [`CcdaProfile`](#ccdaprofile) \| `undefined`

Look up a built-in profile by name. Returns `undefined` when no built-in has
that name (a user-defined profile is not in this registry, pass it directly).

#### Parameters

##### name

`string`

#### Returns

[`CcdaProfile`](#ccdaprofile) \| `undefined`

#### Example

```ts
import { getCcdaProfile } from "@cosyte/ccda";
const p = getCcdaProfile("smartScorecard");
console.log(p?.provenance?.source);
```

***

### getDefaultCcdaProfile()

> **getDefaultCcdaProfile**(): [`CcdaProfile`](#ccdaprofile) \| `undefined`

Return the current process-scoped default profile, or `undefined` if none is
registered.

#### Returns

[`CcdaProfile`](#ccdaprofile) \| `undefined`

#### Example

```ts
import { getDefaultCcdaProfile } from "@cosyte/ccda";
const p = getDefaultCcdaProfile();
if (p !== undefined) console.log("default profile:", p.name);
```

***

### isNullFlavor()

> **isNullFlavor**(`value`): value is "NI" \| "INV" \| "DER" \| "OTH" \| "NINF" \| "PINF" \| "UNC" \| "MSK" \| "NA" \| "UNK" \| "ASKU" \| "NAV" \| "NASK" \| "NAVU" \| "QS" \| "TRC" \| "NP"

Return `true` when a string is a conforming [NullFlavor](#nullflavor-17) token.

#### Parameters

##### value

`string`

#### Returns

value is "NI" \| "INV" \| "DER" \| "OTH" \| "NINF" \| "PINF" \| "UNC" \| "MSK" \| "NA" \| "UNK" \| "ASKU" \| "NAV" \| "NASK" \| "NAVU" \| "QS" \| "TRC" \| "NP"

#### Example

```ts
import { isNullFlavor } from "@cosyte/ccda";
isNullFlavor("UNK");   // true
isNullFlavor("nope");  // false
```

***

### isRecognizedNamespace()

> **isRecognizedNamespace**(`namespaceUri`): `boolean`

Return `true` when a namespace URI is one the parser recognizes
(`urn:hl7-org:v3`, the XSI namespace, or `urn:hl7-org:sdtc`). A `null` URI,
an element with no namespace at all, counts as unrecognized.

#### Parameters

##### namespaceUri

`string` \| `null`

#### Returns

`boolean`

#### Example

```ts
import { isRecognizedNamespace, V3_NS } from "@cosyte/ccda";
isRecognizedNamespace(V3_NS);          // true
isRecognizedNamespace("urn:vendor");   // false
isRecognizedNamespace(null);           // false
```

***

### isSafetyCriticalCode()

> **isSafetyCriticalCode**(`code`): `boolean`

True when `code` is safety-critical and therefore forbidden in a profile's
`tolerate` set.

#### Parameters

##### code

[`WarningCode`](#warningcode)

#### Returns

`boolean`

#### Example

```ts
import { isSafetyCriticalCode } from "@cosyte/ccda";
console.log(isSafetyCriticalCode("DEPRECATED_LOINC")); // false
console.log(isSafetyCriticalCode("CODE_NARRATIVE_MISMATCH")); // true
```

***

### isSyntheticSetId()

> **isSyntheticSetId**(`setId`): `boolean`

Whether a `setId` was **minted by [editCcda](#editccda)** rather than carried by
the source document or supplied by the caller. True only when the identifier
matches the whole documented scheme: the synthetic assigning-authority root
*and* an `@extension` beginning [SYNTHETIC\_SETID\_PREFIX](#synthetic_setid_prefix). Both, because
either alone is something a real document could carry by coincidence.

**A `false` is not a promise that the identifier is real.** It says only that
this library did not mint it under this scheme: a `setId` minted by some other
tool, or by a version of this library before the scheme existed
(`setid-e1`, unprefixed), reads `false` here. Use it to recognise a synthetic
id, never to certify a real one.

#### Parameters

##### setId

[`II`](#ii) \| `undefined`

The `setId` to test, e.g. `doc.header.setId`. `undefined` is
  `false` (a document with no `setId` has nothing to recognise).

#### Returns

`boolean`

`true` when the identifier matches the minted scheme.

#### Example

```ts
import { parseCcda, isSyntheticSetId } from "@cosyte/ccda";
const doc = parseCcda(xml);
if (isSyntheticSetId(doc.header.setId)) {
  // the version series was invented by an editor, not asserted by a source system
}
```

***

### isUcumCaseSuspect()

> **isUcumCaseSuspect**(`unit`): `boolean`

Detect the case-confusion trap: a unit that is **not** a canonical clinical
spelling but whose case-folded form is one, `Mg`/`MG` for `mg`, `ML` for
`mL`, `mEq` for `meq`. These are reported as `UCUM_CASE_SUSPECT` (more
actionable than `NON_UCUM_UNIT`) because the likely fix is a single
letter-case change. A unit already spelled canonically returns `false`.

#### Parameters

##### unit

`string`

#### Returns

`boolean`

#### Example

```ts
import { isUcumCaseSuspect } from "@cosyte/ccda";
isUcumCaseSuspect("ML");  // true  (meant mL; ML is megaliter)
isUcumCaseSuspect("mEq"); // true  (meant meq)
isUcumCaseSuspect("mg");  // false (already canonical)
```

***

### isValidUcumUnit()

> **isValidUcumUnit**(`unit`): `boolean`

Validate a string as a well-formed UCUM unit (case-sensitive). Returns `true`
only when the **entire** string parses, `mg/dL`, `mm[Hg]`, `10*3/uL`, `Cel`,
`%`, `/min`, `kg/m2`, `1` are valid; `mcg`, `cc`, `mg//dL` and partial garbage
are not. This is a grammatical check: a case slip like `Mg/dL` is well-formed
UCUM (megagram/deciliter) so it validates here, [isUcumCaseSuspect](#isucumcasesuspect)
catches the clinical case-confusion separately. Never throws.

#### Parameters

##### unit

`string`

#### Returns

`boolean`

#### Example

```ts
import { isValidUcumUnit } from "@cosyte/ccda";
isValidUcumUnit("mg/dL");   // true
isValidUcumUnit("mm[Hg]");  // true
isValidUcumUnit("cc");      // false
```

***

### listCcdaProfiles()

> **listCcdaProfiles**(): readonly `string`[]

The names of every built-in profile, in registration order.

#### Returns

readonly `string`[]

#### Example

```ts
import { listCcdaProfiles } from "@cosyte/ccda";
console.log(listCcdaProfiles()); // ["default", "smartScorecard", "legacyR11"]
```

***

### looksProductLevel()

> **looksProductLevel**(`displayName`): `boolean`

Heuristic: does an RxNorm `displayName` look like a product/branded concept
(carries a dose form or strength) rather than a bare ingredient? Used only to
flag `ALLERGEN_GRANULARITY_SUSPECT`, a best-effort signal, never a hard
rule. Returns `false` when there is no display text to inspect.

#### Parameters

##### displayName

`string` \| `undefined`

#### Returns

`boolean`

#### Example

```ts
import { looksProductLevel } from "@cosyte/ccda";
looksProductLevel("amoxicillin 500 MG Oral Tablet"); // true
looksProductLevel("amoxicillin");                     // false
```

***

### missingRequiredSections()

> **missingRequiredSections**(`documentType`, `presentKeys`, `options?`): readonly `string`[]

The SHALL section keys a [DocumentType](#documenttype-4) requires that are **absent** from
`presentKeys`, preserving the type's declared order. The parser passes the set
of recognized section keys it framed; each returned key becomes one
`REQUIRED_SECTION_MISSING` warning. Returns an empty array when every required
section is present (or the type asserts none).

#### Parameters

##### documentType

[`DocumentType`](#documenttype-4)

##### presentKeys

`ReadonlySet`\<`string`\>

##### options?

[`RequiredSectionOptions`](#requiredsectionoptions)

#### Returns

readonly `string`[]

#### Example

```ts
import { missingRequiredSections } from "@cosyte/ccda";
missingRequiredSections("ccd", new Set(["allergies", "problems"]));
// ["medications", "results", "socialHistory", "vitalSigns"]

// The same document without the R2.1 stamp:
missingRequiredSections("ccd", new Set(["allergies", "problems"]), { r21Stamped: false });
// ["medications", "results"]

// The same document stamped for an unmodelled release: nothing is reported
// missing, because nothing was evaluated. See requiredSectionStatus().
missingRequiredSections("ccd", new Set(["allergies", "problems"]), {
  stamp: "unmodeled-release",
});
// []
```

***

### parseBl()

> **parseBl**(`el`, `ctx`): [`BL`](#bl) \| `undefined`

Parse a `BL` element (one carrying a `@value`) into a typed [BL](#bl).
Returns `undefined` when the element is absent. Never throws.

A `@nullFlavor` declared beside a `@value` emits
`CONTRADICTORY_NULL_FLAVOR`. The parsed boolean is **kept**: `BL` retains no
verbatim copy of its token, so withholding `value` would delete the
assertion rather than decline to embellish it (see [parsePq](#parsepq)).

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`BL`](#bl) \| `undefined`

#### Example

```ts
import { parseBl } from "@cosyte/ccda";
const bl = parseBl(el, { emit: () => {} });
console.log(bl?.value);
```

***

### parseBlAttr()

> **parseBlAttr**(`el`, `name`): `boolean` \| `undefined`

Read a named BL-valued attribute (e.g. `negationInd`) off an element,
returning the parsed boolean or `undefined` when absent or non-boolean. This
is the distinct path for attributes like `@negationInd` that are booleans on
an element rather than a child `BL` element.

#### Parameters

##### el

`Element`

##### name

`string`

#### Returns

`boolean` \| `undefined`

#### Example

```ts
import { parseBlAttr } from "@cosyte/ccda";
const negated = parseBlAttr(observationEl, "negationInd"); // boolean | undefined
```

***

### parseCcda()

> **parseCcda**(`raw`, `options?`): [`CcdaDocument`](#ccdadocument)

Parse a C-CDA XML payload into an immutable [CcdaDocument](#ccdadocument).

**Lenient by default**, real-world, vendor-quirky documents parse rather
than throw, accruing [CcdaWarning](#ccdawarning)s on `doc.warnings`. Only
unrecoverable structural problems throw a [CcdaParseError](#ccdaparseerror) (a Tier-3
[FatalCode](#fatalcode)): a declared DTD/external entity, a size/entity/depth limit
breach, malformed XML, or a root that is not `ClinicalDocument`. With
`{ strict: true }`, every Tier-2 deviation is escalated to a thrown
`CcdaParseError` instead of a warning.

#### Parameters

##### raw

`string`

The raw C-CDA XML document text.

##### options?

[`ParseCcdaOptions`](#parseccdaoptions) = `{}`

Parse options; see [ParseCcdaOptions](#parseccdaoptions). Lenient unless `strict` is set.

#### Returns

[`CcdaDocument`](#ccdadocument)

The parsed document plus any recovered Tier-2 warnings.

#### Throws

[CcdaParseError](#ccdaparseerror) on any Tier-3 fatal, or, when `options.strict`
  is `true`, on the first Tier-2 deviation.

#### Example

```ts
import { parseCcda } from "@cosyte/ccda";
const doc = parseCcda(xml);
console.log(doc.documentType, doc.getPatient()?.name?.family);
for (const w of doc.warnings) console.warn(w.code, w.position);
```

***

### parseCd()

> **parseCd**(`el`, `ctx`): [`CD`](#cd) \| `undefined`

Parse a `CD`/`CE` element into a typed [CD](#cd). Returns `undefined` when
the element is absent. Resolves a child `<originalText>` to its trimmed text
and parses each `<translation>` recursively (translations of a translation
are ignored, C-CDA does not nest them). Never throws.

A `@nullFlavor` declared beside a populated `@code` emits
`CONTRADICTORY_NULL_FLAVOR`: the element says both "this concept is unknown"
and "this concept is X". Only `@code` counts as the contradicting assertion.
A `nullFlavor` beside `originalText`, a `<translation>`, a `displayName` or a
bare `@codeSystem` is the documented C-CDA idiom for "not codable in the
bound value set, here is the source text or an alternate coding", which is
coherent rather than contradictory and stays silent.

Unlike `PQ`/`TS`, the `code` is **kept**: it is the document's own text
rather than a reading this parser manufactured, and there is no verbatim copy
to fall back on, so withholding it would delete what the document said. See
[parsePq](#parsepq) for the full argument.

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`CD`](#cd) \| `undefined`

#### Example

```ts
import { parseCd } from "@cosyte/ccda";
const code = parseCd(codeEl, { emit: () => {} });
console.log(code?.code, code?.displayName);
```

***

### parseEd()

> **parseEd**(`el`, `ctx`): [`ED`](#ed) \| `undefined`

Parse an `ED` element into a typed [ED](#ed). Returns `undefined` when the
element is absent. Captures inline content verbatim (base64 is not decoded)
and resolves a child `<reference>`'s `@value`. Never throws.

A `@nullFlavor` declared beside inline content or a `<reference>` emits
`CONTRADICTORY_NULL_FLAVOR`; a `@mediaType` or `@representation` alone
describes a null value rather than contradicting it and stays silent. Content
and reference are **kept** verbatim (see [parsePq](#parsepq)).

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`ED`](#ed) \| `undefined`

#### Example

```ts
import { parseEd } from "@cosyte/ccda";
const ed = parseEd(el, { emit: () => {} });
console.log(ed?.reference ?? ed?.value);
```

***

### parseIi()

> **parseIi**(`el`, `ctx`): [`II`](#ii) \| `undefined`

Parse an `II` element into a typed [II](#ii). Returns `undefined` when the
element itself is absent. Never throws; omits any field the element does not
carry.

A `@nullFlavor` declared beside an `@extension` emits
`CONTRADICTORY_NULL_FLAVOR`: the element says both "this identifier is
unknown" and "this identifier is 12345". Only `@extension` counts as the
contradicted assertion; a `@root` alone is a namespace without a local
identifier, so no identifier value is produced and the shape stays silent.

The `@extension` itself is **kept**. It is the document's own text, with no
second copy the way `PQ.raw` sits beside `PQ.value`, so withholding it here
would delete what the document said rather than decline to embellish it (see
[parsePq](#parsepq) for the rule and its limit). Nor is there a derived reading
to withhold: at this layer `extension` *is* the datum, not something the
parser manufactured from it.

**Where the withholding happens instead.** The dangerous act is not reporting
an `II` whole, with its `nullFlavor` attached, it is *selecting* one and
handing back a naked `string` that no longer carries the marking. This model
does that in exactly one place, [pickMrn](#pickmrn) (behind `getMrn()`), and that
is where a null-marked identifier is declined. The identity slots,
`ClinicalDocument.id`, `setId`, `relatedDocument/parentDocument/id` and every
entry-level `<id>`, are only ever reported as the whole datatype beside the
warning, so the `nullFlavor` never goes missing and there is nothing to
withhold. The emit side is guarded separately: `editCcda` refuses to build an
`RPLC` `parentDocument` out of a null-marked source `<id>`, because copying
`root`/`extension` forward would launder a disowned identifier into an
asserted one.

**`templateId` is the stated exception, and it is deliberate.** Document- and
section-type recognition *does* derive a reading from `templateId.@root`, so
`<templateId root="…22.1.2" nullFlavor="NA"/>` still resolves the document
type and its required-section SHALL set. That is left alone on purpose: a
`templateId` is a conformance assertion about the *document's shape*, not an
identifier for a person or a record, so a mis-read costs a spurious or
missing `REQUIRED_SECTION_MISSING` rather than a misattributed clinical fact.
Declining to recognize would also make the parser less informative, not
safer, replacing a working document type with `UNKNOWN_DOCUMENT_TEMPLATE`.
Note too that the shape stays silent here by the rule above: `@root` is not
the contradicted assertion, only `@extension` is.

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`II`](#ii) \| `undefined`

#### Example

```ts
import { parseIi } from "@cosyte/ccda";
const id = parseIi(idEl, { emit: () => {} });
console.log(id?.root);
```

***

### parseIvlPq()

> **parseIvlPq**(`el`, `ctx`): [`IVL_PQ`](#ivl_pq) \| `undefined`

Parse an `IVL_PQ` element into a typed [IVL\_PQ](#ivl_pq). Returns `undefined`
when the element is absent. Never throws; omits any bound the element lacks.

A `@nullFlavor` on the **interval itself** beside bounds that carry values is
the same contradiction [parsePq](#parsepq) resolves one level down, and gets the
same treatment: `CONTRADICTORY_NULL_FLAVOR` is emitted once for the interval,
every bound is preserved verbatim, and the derived `value` number is withheld
from each of them. Without this a dose *range* declared unknown would still
hand `doseRange.low.value` back to a caller, which is the scalar-dose harm by
another route.

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`IVL_PQ`](#ivl_pq) \| `undefined`

#### Example

```ts
import { parseIvlPq } from "@cosyte/ccda";
const range = parseIvlPq(el, { emit: () => {} });
console.log(range?.low?.value, range?.high?.value);
```

***

### parseIvlTs()

> **parseIvlTs**(`el`, `ctx`): [`IVL_TS`](#ivl_ts) \| `undefined`

Parse an `IVL_TS` element into a typed [IVL\_TS](#ivl_ts). Returns `undefined`
when the element is absent. Handles both the `<low>`/`<high>` bound form and
the degenerate `@value` point form. Never throws.

A `@nullFlavor` on the interval beside its own `@value` or a bound that
carries one is a contradiction: `CONTRADICTORY_NULL_FLAVOR` is emitted once,
every `raw` is preserved, and the derived `date` is withheld from the point
value and from each bound. See [parsePq](#parsepq) for the rule and its limits.

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`IVL_TS`](#ivl_ts) \| `undefined`

#### Example

```ts
import { parseIvlTs } from "@cosyte/ccda";
const period = parseIvlTs(effectiveTimeEl, { emit: () => {} });
console.log(period?.low?.date?.toISOString());
```

***

### parsePq()

> **parsePq**(`el`, `ctx`): [`PQ`](#pq) \| `undefined`

Parse a `PQ` element into a typed [PQ](#pq). Returns `undefined` when the
element is absent. A non-numeric `@value` is preserved in `raw` with `value`
omitted. Never throws.

**A `@nullFlavor` beside a populated `@value` is a contradiction, and the
parser resolves it against the number.** `<doseQuantity nullFlavor="UNK"
value="10" unit="mg"/>` asserts both "this quantity is unknown" and "this
quantity is 10 mg". The parser emits `CONTRADICTORY_NULL_FLAVOR`, preserves
`raw` (`"10"`), `unit` (`"mg"`) and `nullFlavor` (`"UNK"`) verbatim, and
**omits `value`**, so `med.dose.value` is `undefined` rather than `10`.

The reasoning, because the choice is not obvious and a warning alone was the
alternative. A warning alone keeps the house rule (never coerce, surface
verbatim, flag) but leaves the dangerous affordance intact: `dose.value`
still hands back `10` to the many consumers who do not read `warnings` on a
first integration, and of the two readings the reassuring one is the one that
can hurt a patient. Withholding costs nothing, because `value` is not the
document's bytes, it is a `number` **this parser manufactured** by
interpreting `raw`, and `raw` is still right there. So nothing the document
said is lost, and the type now forces a caller to look at what it said.

That is also exactly what `MALFORMED_DATETIME` already does one datatype
over, `TS` keeps `raw` and drops the parsed `date`, so this is the existing
rule applied to a second reason for not trusting an interpretation, not a new
one.

**The limit, stated rather than implied.** Withholding applies only where a
verbatim copy survives beside the derived reading, which in this model is
`PQ.value` and `TS.date` and nothing else. On `CD`, `II`, `ST`, `ED` and `BL`
the value-bearing field *is* the document's own text (`@code`, `@extension`,
the element's content), with no second copy, so withholding it would delete
what the document said rather than decline to embellish it. Those datatypes
therefore warn and keep the field: a naive consumer reading
`allergy.allergen.code` still gets the code, with `nullFlavor` on the same
object and `CONTRADICTORY_NULL_FLAVOR` in `warnings`.

One consequence worth naming: a contradictory PQ no longer reaches
`MISSING_UNIT_ON_PQ` (which keys off a defined `value`). That is not a new
silence, the stronger `CONTRADICTORY_NULL_FLAVOR` fires in its place, and a
missing unit on a value the document declared null is moot.

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`PQ`](#pq) \| `undefined`

#### Example

```ts
import { parsePq } from "@cosyte/ccda";
const pq = parsePq(el, { emit: () => {} });
console.log(pq?.value, pq?.unit);
```

***

### parseSecureXml()

> **parseSecureXml**(`raw`, `limits`, `emit`, `reportForeignNamespace?`): `Document`

Strip a leading UTF-8 BOM and run the pre-parse safety gauntlet (size,
DTD/DOCTYPE, entity-reference cap), then build a DOM with a hardened
`@xmldom/xmldom` `DOMParser`, then enforce the depth / node-count caps on
the constructed tree. Returns the root `Document`. Emits
`ENCODING_BOM_STRIPPED` via `emit` when a BOM was removed.

Throws a [CcdaParseError](#ccdaparseerror) carrying a PHI-free [CcdaPosition](#ccdaposition) for
any safety violation or malformed XML, never returns a partially-built
document.

`UNKNOWN_NAMESPACE_PREFIX` goes to `reportForeignNamespace` rather than to
`emit`, and that separation is load-bearing rather than tidy. This function
runs before `parseCcda`'s root gate and before any clinical parsing, and in
strict mode the emitter escalates the **first** warning it is handed. Routing
a whole-document observation through `emit` here would therefore let it
preempt `NOT_A_CLINICAL_DOCUMENT` on a document that is not a C-CDA at all,
and preempt a safety-critical per-element code such as `MISSING_CODE_SYSTEM`
on one that is. `parseCcda` passes a collector and replays it **after** the
model is built, so those keep their precedence. The parameter defaults to
`emit` for a caller using this function on its own, where there is no later
stage to defer to.

#### Parameters

##### raw

`string`

##### limits

[`ResolvedLimits`](#resolvedlimits)

##### emit

(`warning`) => `void`

##### reportForeignNamespace?

(`warning`) => `void`

#### Returns

`Document`

#### Example

```ts
import { parseSecureXml, resolveLimits } from "@cosyte/ccda";
const doc = parseSecureXml("<ClinicalDocument/>", resolveLimits(), () => {});
console.log(doc.documentElement?.localName); // "ClinicalDocument"
```

***

### parseSt()

> **parseSt**(`el`, `ctx`): [`ST`](#st) \| `undefined`

Parse an `ST` element into a typed [ST](#st). Returns `undefined` when the
element is absent. Never throws.

A `@nullFlavor` declared beside non-empty text emits
`CONTRADICTORY_NULL_FLAVOR`. The text is **kept**: it is the document's own
content with no verbatim copy elsewhere, so withholding it would delete what
the document said (see [parsePq](#parsepq)).

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`ST`](#st) \| `undefined`

#### Example

```ts
import { parseSt } from "@cosyte/ccda";
const title = parseSt(titleEl, { emit: () => {} });
console.log(title?.value);
```

***

### parseTs()

> **parseTs**(`el`, `ctx`): [`TS`](#ts) \| `undefined`

Parse a `TS` element into a typed [TS](#ts). Returns `undefined` when the
element is absent. Emits `MALFORMED_DATETIME` (and omits `date`) when a
non-empty `@value` does not parse. Never throws.

A `@nullFlavor` declared beside a populated `@value` is a contradiction:
`CONTRADICTORY_NULL_FLAVOR` is emitted, `raw` and `nullFlavor` are preserved
verbatim, and the derived `date` is withheld. That is the same treatment
`MALFORMED_DATETIME` already gives an unparseable value, and the same rule
[parsePq](#parsepq) applies to `value`: the parser declines to manufacture a
computable reading it has been told is not the document's value, while never
dropping the document's own bytes.

#### Parameters

##### el

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`TS`](#ts) \| `undefined`

#### Example

```ts
import { parseTs } from "@cosyte/ccda";
const ts = parseTs(effectiveTimeEl, { emit: () => {} });
console.log(ts?.date?.toISOString());
```

***

### parseV3DateTime()

> **parseV3DateTime**(`value`): `Date` \| `undefined`

Parse a variable-precision HL7 v3 timestamp string to a JS `Date`. Accepts
year through second precision plus optional fractional seconds and an
optional `±HHMM` (or `±HH`) timezone offset. Per the CDA R2 / HL7 v3 `TS`
literal `YYYYMMDDHHMMSS.UUUU[±ZZzz]`, a fraction or offset is accepted **only
on a value that carries the time-of-day** (at least the hour): a fraction or
offset hung on a bare `YYYY`/`YYYYMM`/`YYYYMMDD` value, e.g. the dropped-dash
`"2026-0721"`, is rejected rather than silently misread. A value with no
offset resolves to UTC for determinism; truncated values resolve to the first
instant of the stated precision (e.g. `2026` → `2026-01-01T00:00:00Z`).
Returns `undefined` when the value does not match the shape or is
calendar-invalid, never throws.

#### Parameters

##### value

`string`

#### Returns

`Date` \| `undefined`

#### Example

```ts
import { parseV3DateTime } from "@cosyte/ccda";
parseV3DateTime("20260628")?.toISOString();        // "2026-06-28T00:00:00.000Z"
parseV3DateTime("20260628153045-0500")?.toISOString();
parseV3DateTime("not-a-date");                      // undefined
```

***

### pickMrn()

> **pickMrn**(`identifiers`): `string` \| `undefined`

Pick the MRN string from a list of `patientRole/id` [II](#ii) identifiers.

Returns the **first** identifier's `extension`, or `undefined` when the list
is empty, when that identifier has no `extension` (a root-only id names an
assigning authority, not a patient), or when it carries a `nullFlavor`.

**Why a `nullFlavor`-marked `<id>` is withheld rather than read.** In HL7 v3,
`nullFlavor` is a property of `ANY`: it marks an *exceptional* value, one
with no proper value. An `<id nullFlavor="UNK" extension="X"/>` therefore
says both "this identifier is unknown" and "this identifier is X", and
`parseIi` already flags that contradiction as `CONTRADICTORY_NULL_FLAVOR`
(safety-critical). Reading `X` out of it anyway is how a record gets filed
against the wrong patient, which is silent, persistent, and contaminates
everything downstream, so it sits alongside a wrong dose and a wrong code
system in this package's harm ordering.

**And why it is not skipped past, either.** Falling through to the next
`<id>` looks like the helpful move and is a worse one. CDA R2 makes
`patientRole/id` `1..*` and neither it nor C-CDA R2.1 says which entry is the
MRN, so nothing in the document ranks them: the second id is not "another
MRN", it is whatever the sending system listed second, commonly a plan
member number, an account number, or the SSN under
`2.16.840.1.113883.4.1`. Substituting it would answer the MRN question
confidently from a different assigning authority, with no signal naming the
substitution, which trades one wrong-identifier failure for a quieter one.
The rule this helper is applying declines a manufactured reading; it does not
manufacture a replacement. Same slot, same position, reading withheld.

**This is the `PQ.value` rule, applied one layer up rather than abandoned.**
`parsePq` withholds `value` on a contradicted quantity because `value` is a
number the parser *manufactured* from `raw`, and `raw` survives, so nothing
the document said is lost. `II.extension` is not like that: it **is** the
document's own text, with no second copy, so `parseIi` keeps it and a caller
reading `patient.identifiers[0].extension` still gets it with the
`nullFlavor` sitting on the same object. What *is* manufactured here is the
**selection**: picking one `<id>` out of a list and handing back a bare
`string` strips away the `nullFlavor` that qualified it. So the derived act
declines, and the verbatim data stays reachable. Both properties, rather than
a trade between them.

A caller whose assigning authority genuinely carries the MRN on a later
`<id>`, or who treats a given `nullFlavor` as tolerable, can walk
`patient.identifiers` and branch on each `root`. That decision needs the
authority OIDs, which this helper does not have and must not guess.

**Provenance:** no normative SHALL is cited. CDA R2 declares `@nullFlavor`
and `@extension` on `II` independently, and neither CDA R2 nor C-CDA R2.1
states which `patientRole/id` is the MRN. The rule rests on v3 datatype
semantics plus the harm ordering above.

#### Parameters

##### identifiers

readonly [`II`](#ii)[]

#### Returns

`string` \| `undefined`

#### Example

```ts
import { pickMrn } from "@cosyte/ccda";
pickMrn([{ root: "2.16.840.1.113883.19.5", extension: "MRN001" }]);
// → "MRN001"

pickMrn([{ nullFlavor: "UNK", extension: "MRN001" }]);
// → undefined  (the document disowned that identifier)

// A second id under a different authority is NOT a fallback MRN:
pickMrn([{ nullFlavor: "UNK", extension: "MRN001" }, { root: "2.16.840.1.113883.4.1", extension: "SYNTH-9" }]);
// → undefined  (still the first id, withheld; never the next authority's number)

pickMrn([]);
// → undefined
```

***

### positionOf()

> **positionOf**(`el`): [`CcdaPosition`](#ccdaposition)

Build a structural position for an element: its local name as a path hint
plus the locator line/column `@xmldom/xmldom` recorded (when present). Never
includes attribute values or text content.

**`path` is bounded on membership, not copied.** A local name is an XML
NCName, so a sender can call an element anything, and `enforceStructureLimits`
in `../parser/secure-xml.ts` positions on arbitrary elements from a hostile
document. Only a name in the CDA vocabulary this parser navigates is echoed;
anything else becomes `<withheld>` (see `../parser/tokens.ts`). Line and
column still locate it exactly.

#### Parameters

##### el

`Element`

#### Returns

[`CcdaPosition`](#ccdaposition)

#### Example

```ts
import { positionOf } from "@cosyte/ccda";
const pos = positionOf(sectionEl); // { path: "section", line: 42, ... }
```

***

### profileQuirkApplied()

> **profileQuirkApplied**(`original`, `profileName`): [`CcdaWarning`](#ccdawarning)

Build a `PROFILE_QUIRK_APPLIED` warning, the downgraded form an active
[CcdaProfile](#ccdaprofile) produces from a deviation it *expects*. The original
warning is **not dropped**: its code moves to `toleratedCode`, the deviation
is re-badged `PROFILE_QUIRK_APPLIED`, `expected` is set, and the tolerating
profile is named, so a consumer can filter known, grounded noise while the
fact of the deviation, and where it was, survive. A profile can only ever
reach this path for a **non-safety-critical** code (enforced at profile-
definition time); safety-critical warnings can never be tolerated.

**The original `message` is not carried forward, and `profileName` is not
interpolated.** Both used to be, which made this the one factory whose output
was assembled rather than looked up. What the deviation was is on
`toleratedCode`, who tolerated it is on `profile`, and where it was is on
`position`, all typed fields.

**Say what that costs rather than "nothing is lost".** Two things do not
survive the re-badge. The tolerated code's own message is not reachable from
the returned warning, because WARNING\_MESSAGES is internal and is not
on the package entry point. And where the original carried a per-closed-key
variant, the key is not recoverable from `toleratedCode` alone: a tolerated
`UNEXPECTED_CODE_SYSTEM` no longer says which [CodeSlot](#codeslot) it was about.
The trade is deliberate, and narrow because a profile may only ever tolerate a
**non**-safety-critical code, but it is a trade.

#### Parameters

##### original

[`CcdaWarning`](#ccdawarning)

##### profileName

`string`

#### Returns

[`CcdaWarning`](#ccdawarning)

#### Example

```ts
import { parseCcda, profileQuirkApplied } from "@cosyte/ccda";
const original = parseCcda(raw).warnings[0]!;
const w = profileQuirkApplied(original, "smartScorecard");
```

***

### readObservationValue()

> **readObservationValue**(`valueEl`, `ctx`): [`ObservationValue`](#observationvalue) \| `undefined`

Read a polymorphic observation `<value>` into an [ObservationValue](#observationvalue),
branching on `xsi:type`. A `PQ` is UCUM-checked; an untyped value with a
`@code`/`@value` is treated leniently as coded/quantity; an unrecognized
`xsi:type` is preserved as `unsupported` and flagged with
`RESULT_VALUE_TYPE_UNHANDLED`. Returns `undefined` when the element is absent.

#### Parameters

##### valueEl

`Element` \| `undefined`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`ObservationValue`](#observationvalue) \| `undefined`

#### Example

```ts
import { readObservationValue } from "@cosyte/ccda";
const v = readObservationValue(child(obs, "value"), ctx);
```

***

### readReferenceRange()

> **readReferenceRange**(`obs`, `ctx`): [`ReferenceRange`](#referencerange-1) \| `undefined`

Read a result's reference range from a Result Observation. Prefers the
structured `observationRange/value xsi:type="IVL_PQ"` bounds; falls back to
the free-text form (emitting `FREE_TEXT_REFERENCE_RANGE`). Returns `undefined`
when the observation carries no `referenceRange`.

#### Parameters

##### obs

`Element`

##### ctx

[`ParseCtx`](#parsectx)

#### Returns

[`ReferenceRange`](#referencerange-1) \| `undefined`

#### Example

```ts
import { readReferenceRange } from "@cosyte/ccda";
const range = readReferenceRange(resultObs, ctx);
```

***

### readTemplateStamp()

> **readTemplateStamp**(`extension`): [`TemplateStampReading`](#templatestampreading)

Read a document-level `templateId/@extension` into a
[TemplateStampReading](#templatestampreading). `undefined` (the attribute absent, which is how
`attr` reports an empty one too) reads `unstamped`; the R2.1 stamp reads
`r21-stamped`; `2024-05-01` reads `r30-stamped`; anything else reads
`unmodeled-release`. Total and deterministic: every input lands in exactly one
of the four.

#### Parameters

##### extension

`string` \| `undefined`

#### Returns

[`TemplateStampReading`](#templatestampreading)

#### Example

```ts
import { readTemplateStamp } from "@cosyte/ccda";
readTemplateStamp(undefined);      // "unstamped"
readTemplateStamp("2015-08-01");   // "r21-stamped"
readTemplateStamp("2024-05-01");   // "r30-stamped"
readTemplateStamp("1999-12-31");   // "unmodeled-release"
```

***

### releaseForTemplateExtension()

> **releaseForTemplateExtension**(`extension`): `"R2.1"` \| `"R3.0 or later"` \| `undefined`

The C-CDA release a document-template `@extension` names, or `undefined` when
the value is not a member of [CCDA\_RELEASE\_STAMPS](#ccda_release_stamps). A **membership
test**, never a shape test: the argument may be any string a sender wrote, and
only a member is ever returned.

#### Parameters

##### extension

`string`

#### Returns

`"R2.1"` \| `"R3.0 or later"` \| `undefined`

#### Example

```ts
import { releaseForTemplateExtension } from "@cosyte/ccda";
releaseForTemplateExtension("2024-05-01"); // "R3.0 or later"
releaseForTemplateExtension("1999-01-01"); // undefined
```

***

### requiredSectionKeys()

> **requiredSectionKeys**(`documentType`, `options?`): readonly `string`[]

The catalog section keys a [DocumentType](#documenttype-4) SHALL contain, in a stable
order. Returns an empty array when no unconditional in-catalog SHALL section
is asserted for that type (see the module note, empty ≠ "no requirements").

#### Parameters

##### documentType

[`DocumentType`](#documenttype-4)

##### options?

[`RequiredSectionOptions`](#requiredsectionoptions)

#### Returns

readonly `string`[]

#### Example

```ts
import { requiredSectionKeys } from "@cosyte/ccda";
requiredSectionKeys("ccd");
// ["allergies", "medications", "problems", "results", "socialHistory", "vitalSigns"]
requiredSectionKeys("progressNote"); // []

// An R1.1-origin CCD (no R2.1 stamp) drops the R2.1-scoped keys:
requiredSectionKeys("ccd", { r21Stamped: false });
// ["allergies", "medications", "problems", "results"]

// A CCD stamped for a release this package does not model asserts NOTHING,
// and it is not the R1.1-origin reduction:
requiredSectionKeys("ccd", { stamp: "unmodeled-release" }); // []
```

***

### requiredSectionStatus()

> **requiredSectionStatus**(`documentType`, `options?`): [`RequiredSectionStatus`](#requiredsectionstatus)

The required-section obligation of `documentType` **with its verification
state attached**: the same asserted keys [requiredSectionKeys](#requiredsectionkeys) returns
under the same options, plus how much of the obligation was read off the
normative source and what is deliberately left unasserted.

`options` narrows `keys` (and the `traced` rows beside them) exactly as
[requiredSectionKeys](#requiredsectionkeys) does, and sets `evaluation`. It does **not** move
`verification`, nor `unasserted`, nor `source`: those record what was read
about the type, not what a particular document is asserted against.

#### Parameters

##### documentType

[`DocumentType`](#documenttype-4)

##### options?

[`RequiredSectionOptions`](#requiredsectionoptions)

#### Returns

[`RequiredSectionStatus`](#requiredsectionstatus)

#### Example

```ts
import { requiredSectionStatus } from "@cosyte/ccda";
requiredSectionStatus("unstructuredDocument").verification; // "not-applicable"
requiredSectionStatus("ccd").verification; // "traced-complete"
requiredSectionStatus("ccd").source?.revision; // "2025-09-08"
requiredSectionStatus("consultationNote", { r21Stamped: false }).keys; // []
requiredSectionStatus("ccd", { stamp: "unmodeled-release" }).evaluation;
// "not-evaluated"
```

***

### requiredSectionStatuses()

> **requiredSectionStatuses**(`options?`): readonly [`RequiredSectionStatus`](#requiredsectionstatus)[]

Every recognized document type's [RequiredSectionStatus](#requiredsectionstatus), in
[DOCUMENT\_TYPES](#document_types) order. The enumeration a consumer uses to see the whole
picture at once: thirteen entries, each carrying exactly one verification state.

#### Parameters

##### options?

[`RequiredSectionOptions`](#requiredsectionoptions)

#### Returns

readonly [`RequiredSectionStatus`](#requiredsectionstatus)[]

#### Example

```ts
import { requiredSectionStatuses } from "@cosyte/ccda";
requiredSectionStatuses().filter((s) => s.verification === "untraced").length; // 0
```

***

### resolveLimits()

> **resolveLimits**(`overrides?`): [`ResolvedLimits`](#resolvedlimits)

Merge caller-supplied limit overrides over [DEFAULT\_LIMITS](#default_limits). Honors
`exactOptionalPropertyTypes`, an omitted override key falls back to the
default rather than producing `undefined`.

#### Parameters

##### overrides?

[`CcdaParseLimits`](#ccdaparselimits)

#### Returns

[`ResolvedLimits`](#resolvedlimits)

#### Example

```ts
import { resolveLimits } from "@cosyte/ccda";
const limits = resolveLimits({ maxDepth: 200 });
console.log(limits.maxDepth); // 200
```

***

### sectionForLoinc()

> **sectionForLoinc**(`loinc`): [`SectionInfo`](#sectioninfo) \| `undefined`

Resolve a section LOINC `code` to its [SectionInfo](#sectioninfo), or `undefined`
when unrecognized. This is the fallback section-recognition path used when no
recognized `templateId` is present.

#### Parameters

##### loinc

`string`

#### Returns

[`SectionInfo`](#sectioninfo) \| `undefined`

#### Example

```ts
import { sectionForLoinc } from "@cosyte/ccda";
sectionForLoinc("11450-4")?.key; // "problems"
```

***

### sectionForTemplateRoot()

> **sectionForTemplateRoot**(`root`): [`SectionInfo`](#sectioninfo) \| `undefined`

Resolve a section `templateId` root OID to its [SectionInfo](#sectioninfo), or
`undefined` when unrecognized. This is the primary section-recognition path.

#### Parameters

##### root

`string`

#### Returns

[`SectionInfo`](#sectioninfo) \| `undefined`

#### Example

```ts
import { sectionForTemplateRoot } from "@cosyte/ccda";
sectionForTemplateRoot("2.16.840.1.113883.10.20.22.2.6.1")?.key; // "allergies"
```

***

### semanticCodeInvalid()

> **semanticCodeInvalid**(`position`, `slot`): [`CcdaWarning`](#ccdawarning)

Build a `SEMANTIC_CODE_INVALID` warning. Emitted only when a consumer-supplied
bring-your-own [TerminologyAdapter](#terminologyadapter) reports (via `validateCode`) that a
coded value is **not** a valid, active member of its code system, the semantic
validation tier structural recognition cannot reach without a licensed
terminology. The code is **preserved verbatim** (never coerced to a
"corrected" value); this surfaces the adapter's negative verdict so a
structurally-valid but wrong code, the highest-severity real-world defect, is
not silently trusted. The message names the [CodeSlot](#codeslot) and nothing
else. It used to carry the observed `@codeSystem` OID as a "structural
identifier"; a sender controls that attribute exactly as it controls the code
beside it, so it is gone. The adapter's own `message` has never been
interpolated and still is not: it is consumer text about a coded value.

#### Parameters

##### position

[`CcdaPosition`](#ccdaposition)

##### slot

`"problem"` \| `"medication"` \| `"allergen"` \| `"route"` \| `"vaccine"`

#### Returns

[`CcdaWarning`](#ccdawarning)

#### Example

```ts
import { semanticCodeInvalid } from "@cosyte/ccda";
const w = semanticCodeInvalid({ path: "value" }, "problem");
```

***

### serializeCcda()

> **serializeCcda**(`doc`): `string`

Serialize a parsed [CcdaDocument](#ccdadocument) back to spec-clean C-CDA XML.

The output is the faithful re-emission of the document the parser read, no
silent loss of unmodeled content, with a guaranteed XML declaration.
Serialization is a fixed point: `parseCcda(serializeCcda(doc))` re-serializes
to the identical string. Equivalent to `doc.toString()`.

#### Parameters

##### doc

[`CcdaDocument`](#ccdadocument)

A document produced by [parseCcda](#parseccda).

#### Returns

`string`

The spec-clean XML text.

#### Throws

If `doc` was hand-constructed (neither produced by
  `parseCcda` nor by `buildCcda`) and therefore retains no source document to
  emit. To construct a document from scratch, use `buildCcda`, whose result is
  the parse of the XML it emitted and so serializes normally.

#### Example

```ts
import { parseCcda, serializeCcda } from "@cosyte/ccda";
const doc = parseCcda(xml);
const xmlOut = serializeCcda(doc); // spec-clean, declaration-prefixed
```

***

### setDefaultCcdaProfile()

> **setDefaultCcdaProfile**(`profile`): `void`

Register a process-scoped default profile that `parseCcda(raw)` applies when
no explicit `profile` option is passed. Pass `null` (or `undefined`) to clear.
An explicit `parseCcda(raw, { profile })` always wins; `{ profile: null }`
opts out of the default for a single call.

**Test hygiene:** the only mutable module-scoped state here, tests that call
this MUST clear it in teardown or default-profile bleed infects later tests.

#### Parameters

##### profile

[`CcdaProfile`](#ccdaprofile) \| `null`

#### Returns

`void`

#### Example

```ts
import { setDefaultCcdaProfile, ccdaProfiles, parseCcda } from "@cosyte/ccda";
setDefaultCcdaProfile(ccdaProfiles.legacyR11);
const doc = parseCcda(xml); // uses legacyR11
setDefaultCcdaProfile(null); // clear
```

***

### text()

> **text**(`el`): `string` \| `undefined`

Concatenated text content of an element with leading/trailing whitespace
trimmed, or `undefined` when there is no non-whitespace text. Does not decode
or interpret embedded base64, base64 stays quarantined as inert text.

#### Parameters

##### el

`Element`

#### Returns

`string` \| `undefined`

#### Example

```ts
import { text } from "@cosyte/ccda";
text(titleEl); // "Allergies" | undefined
```

***

### toDate()

> **toDate**(`value`, `options?`): `Date` \| `undefined`

The absolute instant the value denotes, **only when the zone is determinate**.

- the value carries an explicit offset: the instant from **that** offset, and
  `options.assumeOffsetMinutes` is ignored;
- no offset and `assumeOffsetMinutes` supplied: that offset is applied, an explicit `0`
  meaning "treat this naive value as UTC";
- no offset and no option: `undefined`. The host timezone is never read, UTC is never
  assumed, and no `Date` is returned. This is where the surface parts company with
  `TS.date`, which resolves the same value to UTC.

An `assumeOffsetMinutes` that names no usable zone is refused the same way, with `undefined`:
`NaN` and the two infinities are not a number of minutes, and a finite offset large enough to
push the result outside the range a JS `Date` holds does not denote an instant either. **What
never comes back is an `Invalid Date`**, which satisfies the `Date | undefined` return type
and defeats its point: a caller cannot tell one from a real `Date` without testing
`getTime()` for `NaN`, and `toISOString()` on it throws. Every sibling `@cosyte/*` parser
answers `undefined` on exactly these inputs.

A **stated** offset is bounded too, and more tightly: a value writing an offset wider than 23
hours 59 minutes is refused whole, by all three functions, because the shared `+HH:MM` slot
cannot state it. `TS.date` resolves such a value anyway, so this is a second place the two
deliberately part company.

Components below the stated precision fill to their lowest legal value (month to 1, day to
1, time to 0) **for instant construction only**: the value's own precision is untouched, and
[toObject](#toobject) / [toISO](#toiso) answer exactly as they did before the call. A four-digit
year below 100 stays that year, so `"00500101"` is year 50 and never 1950. Never throws.

#### Parameters

##### value

[`TS`](#ts) \| `null` \| `undefined`

##### options?

[`ToDateOptions`](#todateoptions)

#### Returns

`Date` \| `undefined`

#### Example

```ts
import { toDate, type TS } from "@cosyte/ccda";
const ts: TS = { raw: "20260628" };
toDate(ts); // => undefined, because the document stated no zone
toDate(ts, { assumeOffsetMinutes: 0 }); // => 2026-06-28T00:00:00.000Z
toDate(ts, { assumeOffsetMinutes: -300 }); // => 2026-06-28T05:00:00.000Z
```

***

### toISO()

> **toISO**(`value`): `string` \| `undefined`

The value rendered as ISO-8601, truncated to the precision it stated and never padded out.

A stated offset is appended, `Z` when it is exactly zero and `+HH:MM` / `-HH:MM` otherwise.
When the value carried no offset **nothing** is appended: the string is deliberately
zone-less and no `Z` is fabricated. Because a zero offset renders `Z`, this is not a byte
round-trip of the wire value and is not meant to be; `serializeCcda` remains the
round-tripping route.

Returns `undefined` on exactly the inputs [toObject](#toobject) does, and never throws. That
includes a value stating an offset wider than 23 hours 59 minutes: the string this function
hands back is always one an ISO-8601 reader accepts, so a value whose offset would render
`+24:00` or `+100:39` gets no string at all rather than one that denotes nothing.

#### Parameters

##### value

[`TS`](#ts) \| `null` \| `undefined`

#### Returns

`string` \| `undefined`

#### Example

```ts
import { toISO } from "@cosyte/ccda";
toISO({ raw: "202606" }); // => "2026-06"
toISO({ raw: "20260628" }); // => "2026-06-28", with no trailing Z
toISO({ raw: "20260628153045.5-0500" }); // => "2026-06-28T15:30:45.5-05:00"
```

***

### toObject()

> **toObject**(`value`): [`DateParts`](#dateparts) \| `undefined`

The calendar components a `TS` stated, as a frozen [DateParts](#dateparts), with nothing filled in
and nothing invented.

Returns `undefined` for an absent value, a `TS` carrying no `@value`, a `TS` whose
`@nullFlavor` contradicts a populated `@value`, and a `@value` this package parses as
malformed. It also returns `undefined` for a value stating an offset wider than 23 hours 59
minutes, the widest the `+HH:MM` slot can state: `offsetMinutes` is signed minutes east of
UTC, and a count of minutes a whole day or more from UTC names no zone. Never throws, for
any input.

#### Parameters

##### value

[`TS`](#ts) \| `null` \| `undefined`

#### Returns

[`DateParts`](#dateparts) \| `undefined`

#### Example

```ts
import { toObject } from "@cosyte/ccda";
toObject({ raw: "20260628" });
// => { year: 2026, month: 6, day: 28 }
toObject({ raw: "20260628153045.5-0500" });
// => { year: 2026, month: 6, day: 28, hour: 15, minute: 30,
//      second: 45, millisecond: 500, offsetMinutes: -300 }
```

***

### valueSetBinding()

> **valueSetBinding**(`slot`): [`ValueSetBinding`](#valuesetbinding)

The value-set binding this package declares for one checked slot: the bound
value set, how strongly C-CDA R2.1 binds it, and the artifact and artifact
revision the row was read from.

#### Parameters

##### slot

`"problem"` \| `"medication"` \| `"allergen"` \| `"route"` \| `"vaccine"`

#### Returns

[`ValueSetBinding`](#valuesetbinding)

#### Example

```ts
import { valueSetBinding } from "@cosyte/ccda";
valueSetBinding("route").strength; // "required"
valueSetBinding("problem").strength; // "preferred"
```

***

### valueSetBindingNotEvaluated()

> **valueSetBindingNotEvaluated**(`position`, `slot`, `valueSet`, `release`): [`CcdaWarning`](#ccdawarning)

Build a `VALUE_SET_BINDING_NOT_EVALUATED` warning. Emitted when a
consumer-supplied `ValueSetSource` answers that it holds **no expansion** for
the value set a slot's Required binding names: the binding was not evaluated,
so no non-membership is reported and the absence of a violation says nothing.

This is the guard against the confident-wrong failure mode in its purest form.
A source that skipped a value set it does not hold, in silence, is
indistinguishable from one that checked and found the code conformant.

Both string parameters are library- or consumer-owned constants, exactly as in
[valueSetBindingViolated](#valuesetbindingviolated); no part of the document reaches the warning.

#### Parameters

##### position

[`CcdaPosition`](#ccdaposition)

##### slot

`"problem"` \| `"medication"` \| `"allergen"` \| `"route"` \| `"vaccine"`

##### valueSet

`"2.16.840.1.113883.3.88.12.3221.7.4"` \| `"2.16.840.1.113762.1.4.1010.4"` \| `"2.16.840.1.113762.1.4.1010.1"` \| `"2.16.840.1.113883.3.88.12.3221.8.7"` \| `"2.16.840.1.113762.1.4.1010.6"`

##### release

`string`

#### Returns

[`CcdaWarning`](#ccdawarning)

#### Example

```ts
import { valueSetBindingNotEvaluated } from "@cosyte/ccda";
const w = valueSetBindingNotEvaluated(
  { path: "routeCode" },
  "route",
  "2.16.840.1.113883.3.88.12.3221.8.7",
  "my-vsac-package-2026.1",
);
```

***

### valueSetBindings()

> **valueSetBindings**(): readonly [`ValueSetBinding`](#valuesetbinding)[]

Every declared binding, in CODE\_SLOTS order: the whole table a
consumer needs to see which slots this package will report against and which
value sets their own package has to hold to answer for them.

#### Returns

readonly [`ValueSetBinding`](#valuesetbinding)[]

#### Example

```ts
import { valueSetBindings } from "@cosyte/ccda";
valueSetBindings().filter((b) => b.strength === "required").length; // 4
```

***

### valueSetBindingViolated()

> **valueSetBindingViolated**(`position`, `slot`, `valueSet`, `release`): [`CcdaWarning`](#ccdawarning)

Build a `VALUE_SET_BINDING_VIOLATED` warning. Emitted only when a
consumer-supplied `ValueSetSource` reports that a coded value is **not** a
member of the value set C-CDA R2.1 binds its slot to with a **Required**
binding, which the standard states as a SHALL. The code is preserved verbatim
and never coerced.

**Neither string parameter can carry a document value, and that is the whole
reason the factory takes any at all.** `valueSet` is a fixed OID literal from
this package's own frozen binding table, and `release` is the label the
consumer declared on the source they supplied. Neither is read from the
document, neither reaches the message (which comes whole from the frozen
registry), and the offending code appears nowhere in the warning.

#### Parameters

##### position

[`CcdaPosition`](#ccdaposition)

##### slot

`"problem"` \| `"medication"` \| `"allergen"` \| `"route"` \| `"vaccine"`

##### valueSet

`"2.16.840.1.113883.3.88.12.3221.7.4"` \| `"2.16.840.1.113762.1.4.1010.4"` \| `"2.16.840.1.113762.1.4.1010.1"` \| `"2.16.840.1.113883.3.88.12.3221.8.7"` \| `"2.16.840.1.113762.1.4.1010.6"`

##### release

`string`

#### Returns

[`CcdaWarning`](#ccdawarning)

#### Example

```ts
import { valueSetBindingViolated } from "@cosyte/ccda";
const w = valueSetBindingViolated(
  { path: "manufacturedMaterial" },
  "medication",
  "2.16.840.1.113762.1.4.1010.4",
  "my-vsac-package-2026.1",
);
```

***

### wrapEmitterWithProfile()

> **wrapEmitterWithProfile**(`next`, `profile`): (`warning`) => `void`

Wrap a downstream warning sink so every warning first passes through
`profile`'s tolerance transform. Returned unchanged (`next`) when `profile`
is `undefined`, so the no-profile path pays nothing.

#### Parameters

##### next

(`warning`) => `void`

##### profile

[`CcdaProfile`](#ccdaprofile) \| `undefined`

#### Returns

(`warning`) => `void`

#### Example

```ts
import { wrapEmitterWithProfile } from "@cosyte/ccda";
const emit = wrapEmitterWithProfile(baseEmit, activeProfile);
```

***

### xsiType()

> **xsiType**(`el`): `string` \| `undefined`

Read the `xsi:type` attribute (namespace-qualified) that selects a concrete
HL7 v3 datatype for a polymorphic element. Returns `undefined` when absent.
A leading namespace prefix (e.g. `hl7:PQ`) is stripped to the local type
name.

#### Parameters

##### el

`Element`

#### Returns

`string` \| `undefined`

#### Example

```ts
import { xsiType } from "@cosyte/ccda";
xsiType(valueEl); // "PQ" | "CD" | ... | undefined
```
