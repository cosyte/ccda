---
id: what-it-extracts
title: What it extracts
sidebar_label: What it extracts
description: "Everything the parser reads out of a document, from the header and sections to clinical entries, and whose data each entry is about."
---

# What it extracts

## Document type, header, and section framing

- **Document type**: all 12 US Realm document types resolved from the root `templateId` (CCD,
  Discharge Summary, Referral Note, Consultation Note, History & Physical, Progress Note, Procedure
  Note, Operative Note, Care Plan, Diagnostic Imaging Report, Unstructured Document, Transfer Summary).
  Diagnostic Imaging Report is R2.1-only: C-CDA 3.0.0 removed it
  ([versions we read and build](./spec-notes-versions.md)). A document carrying only the Patient
  Generated Document header reads as `patientGeneratedDocument`.
- **US Realm header**: document identity (`code`, `title`, `effectiveTime`, `confidentialityCode`,
  `languageCode`) and the `recordTarget` patient (name parts, gender, birth time, marital status, race,
  ethnic group) + identifiers, via `getPatient()` / `getMrn()`.
- **Sections**: framed by `templateId` with a LOINC-code fallback, including nested subsections,
  narrative text, and a narrative `ID`→text index for later reference resolution, via `findSection()` /
  `allSections()`. An Unstructured Document exposes its `nonXMLBody` content on `doc.nonXmlBody`
  (base64 left inert).
- **HL7 v3 datatypes**: `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`, with
  variable-precision v3 datetime parsing and null-flavor handling.

## The reconciliation triad

- **Problems**: Problem Concern Acts via `getProblems()`: the coded condition (`value`, SNOMED CT /
  ICD-10-CM), the concern `status` (active / resolved / inactive / unknown), and `effectiveTime`.
- **Medications**: Medication Activities via `getMedications()`: the RxNorm `drug`, the
  `dose` / `doseRange`, the `route`, and the therapy-window `duration` (`IVL_TS`) split from the
  periodic `frequency` (`PIVL_TS`); `moodCode` distinguishes an administration from a plan/order.
- **Allergies**: Allergy Concern Acts via `getAllergies()`: the `allergen` substance, each reaction's
  `manifestation` + `severity`, and the propensity `criticality` (severity and criticality never
  merged). "No Known Allergies" is a distinct `noKnownAllergy` flag, never confused with a `nullFlavor`.

Two safety-critical reconciliations stay conservative: a coded value that disagrees with its narrative
surfaces **both** (`CODE_NARRATIVE_MISMATCH`) and picks no winner, and a missing `doseQuantity` /
`routeCode` is preserved-as-absent and flagged, never silently defaulted.

The drug (and a vaccine) is read from **either arm** of the CDA R2 `ManufacturedProduct` choice:
`manufacturedMaterial`, which C-CDA's medication templates are written around, or
`manufacturedLabeledDrug`, which is read too and flagged `MEDICATION_PRODUCT_ARM_UNEXPECTED`. The
alternate arm carries the same `CE`, and whenever a code is selected it goes through the same
code-system checks, so reading it is strictly safer than the alternative of returning
`drug: undefined` while dose and route survive. If no arm yields a code, that is
`MISSING_PRODUCT_CODE` (safety-critical), never a silent `undefined`.

**Which arm is read, and every `MEDICATION_PRODUCT_*` / `MISSING_PRODUCT_CODE` warning below, applies
at the four `consumable` call sites equally**: a performed Medication Activity, a performed
Immunization Activity, a **Planned Medication Activity**, and a **Planned Immunization Activity**.
On a planned medication, `code` on a `getPlannedItems()`
entry of kind `medicationActivity` is the **drug**, read from the consumable, and never the
`substanceAdministration`'s own `<code>`: CDA R2 makes that element an
`ActSubstanceAdministrationCode`, the kind of administration act ("drug therapy"), while the
substance participates through `consumable/manufacturedProduct`. A planned medication that carries
one is therefore not a lesser reading to fall back on, and the act code is not on the model for that
variant (it round-trips through `doc.toString()`, as every unmodelled element does). Until `0.0.3`
the act `<code>` was preferred when present, so on those documents the planned item's `code` was an
act type rather than a drug, and none of the product warnings on this page could fire there at all.
A **Planned Immunization Activity** is the same shape one substance over: its `code` is the
**vaccine** from the `consumable`, never the act's own `<code>` (see "Plan of Treatment" below).

**The code-system and terminology checks apply to a planned drug too.** Because that `code` is the
drug rather than an act, it is checked against the `medication` binding exactly as a performed
Medication Activity's `drug` is: `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`,
`UNEXPECTED_CODE_SYSTEM` and, when you supply a `TerminologyAdapter`, `SEMANTIC_CODE_INVALID` all
fire on a planned drug, code for code with its performed twin. Until `0.0.3` none of them could, so a
planned drug asserting a `@code` with no `@codeSystem`, or an empty `<code/>`, was read and left
unremarked. `DEPRECATED_CODE_SYSTEM` is the one that does not apply, in both places alike: the
`medication` binding declares no deprecated systems, so an ICD-9-CM OID on a drug is
`UNEXPECTED_CODE_SYSTEM`.

**The other five planned kinds are not code-system checked**, and that is deliberate. Their `code` is
the planned act itself (a LOINC observation, a CPT encounter, a SNOMED act, procedure, or supply), and
none of those is one of the five wired `CodeSlot`s, so an empty or unexpectedly-coded `<code>` on
them is read and left unremarked. Test `item.code?.code`, not `item.code`.

A document carrying **more than one arm** is handled on what the arms say. That means both arms of
the choice, and a **repeated** arm of one kind: two sibling `manufacturedMaterial`s naming different
drugs is the same silent pick, one arm kind in. `MEDICATION_PRODUCT_ARM_UNEXPECTED` fires on the
presence of the `manufacturedLabeledDrug` arm either way. If only one arm names a product (the
others asserting a `nullFlavor`-only `<code>`, or no `<code>` at all) the one that names it is read,
whichever arm that is, because a null value is an exceptional value and not a competing one. If they
name the **same** product it is redundant, and the material arm is read as before. Only when they
name **different** products does the parser refuse to choose: `MEDICATION_PRODUCT_ARM_CONFLICT`
(safety-critical) fires, `drug` / `vaccine` is `undefined`, and `MISSING_PRODUCT_CODE` is suppressed
behind it because "no arm yielded a code" would be false. Nothing is lost, `serializeCcda` re-emits
the parsed DOM, so every arm round-trips byte-for-byte. The cost is stated rather than hidden: with
no code selected, the code-system and terminology checks have nothing to run on for that slot, which
is why the conflict warning is safety-critical and why it is scoped this narrowly. It is also why
`MEDICATION_PRODUCT_ARM_UNEXPECTED` can stay tolerable: wherever no product identity comes back it is
not alone, because `MEDICATION_PRODUCT_ARM_CONFLICT` (the arms disagreed), `MISSING_PRODUCT_CODE` (no
arm carried a `<code>` at all, which is what a name-only `LabeledDrug` produces) or
`MISSING_CODE_VALUE` (an element was selected and asserts neither a symbol nor a `nullFlavor`) is
beside it, and all three are safety-critical and unquietable by a profile. That third one belongs in
the list and was missing from it until `0.0.3`: the enumeration covered the shapes where _selection_
failed, not every shape where _identity_ is absent.

**What an arm names is its `<code>`'s own `@code`, or, when it asserts none, its `<translation>`
alternates.** `nullFlavor="OTH"` beside a `<translation>` is the documented C-CDA idiom for "not
codable in the bound value set, here is an alternate coding", so on that shape the arm's product
identity lives in the translation, and a primary-only comparison read the arm as naming nothing and
picked the other one in silence. **The translations are a fallback, never an addition**: two arms
that both assert a `@code` are compared on those and nothing else. Adding translations in would let
a coding two arms happen to share withdraw a conflict their primaries assert, and a shared
translation is routinely coarser than either primary (an RxNorm ingredient, a local formulary id, an
NDC spanning presentations), so two arms naming two strengths of one drug would agree and one
strength would be handed back. Reading translations can therefore only make the conflict warning
fire more, never less. **Selection is a narrower question again and stays keyed on the primary
`@code`**: a coding is only ever handed to the slot checks from the position the document wrote it
in, never lifted out of a `<translation>` (which this package preserves but never slot-checks).
Among repeated arms of one kind, the first that names a product is the one read.

**When no arm's lead `<code>` asserts a primary `@code` and the product is named in a
`<translation>`, that is `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` (safety-critical).** Read that as
written: selection looks at each arm's **first** `<code>` and no other, so an arm carrying a _second_
`<code>` that does assert a primary is still a slot with no selected product and still draws this
code (with `MEDICATION_PRODUCT_CODE_REPEATED` beside it). The message said "no arm asserts a primary
`@code`" and called the translation the _only_ place the product was named until `0.0.3`, both of
which were false on exactly that shape. The reading is unchanged: `med.drug`
comes back as the selection rule always picked it, and `drug.code` is `undefined`. Only the silence
changes. `MISSING_PRODUCT_CODE` cannot fire, an arm did carry a `<code>`, and the code-system checks
are quiet by design on a `nullFlavor`-only slot, so a consumer reading `med.drug?.code` used to get a
medication with a dose, a route and a timing and no drug, with no warning at all, over a document
that names the drug one element down. **Where the coding is reachable depends on which arm holds it,
and the warning's message and `position` say which.** Only one arm ever becomes `med.drug`: when
that is the arm carrying the translation, the coding is somewhere on `drug.translation`, and you
have to **search that list** rather than read `[0]`, because a `<code>` may carry several
`<translation>`s and the first can be `nullFlavor`-marked or in a code system you did not want. When
it is not (two arms, neither asserting a primary, the translation on the one that was not selected),
no product-naming coding is on the returned `CD` at all and the coding is reachable only through
`doc.toString()`, which re-emits every arm verbatim. On the `nullFlavor`-marked idiom it is the lone
signal; on the variant that asserts neither a symbol nor a `nullFlavor`, `MISSING_CODE_VALUE` fires
beside it, at every consumable call site alike, a planned medication's drug and a planned
vaccination's vaccine included (see above). It stands
down behind `MEDICATION_PRODUCT_ARM_CONFLICT`, the stronger statement about the same slot.

**A repeated arm is reported whether or not it agrees** (`MEDICATION_PRODUCT_ARM_REPEATED`, tolerable
by a profile). Repeated arms that disagree are refused as above; repeated arms that agree used to be
reduced to one with nothing said, so a document asserting the same product three times reported
identically to one asserting it once. Like the presence warning, it is keyed to the arms rather than
to their codings, so an arm carrying no `<code>` counts too. Cardinality and agreement are separate
facts with separate codes.

**Every `<code>` an arm carries is compared, not just the first**, and a repeated one is reported
(`MEDICATION_PRODUCT_CODE_REPEATED`, safety-critical). `Material.code` and `LabeledDrug.code` are each
at most one in CDA R2, so a second `<code>` on one arm is outside the model exactly as a second arm
is; reading only the first dropped it before anything compared it, so an arm writing Lisinopril and
Aspirin as sibling `<code>`s handed back Lisinopril and said nothing. That is the conflict rule's own
failure on a shape it could not see. This code is reported **per arm** (its `position` names which
one), unlike the repeated-arm code, which states a fact about the `manufacturedProduct` and is
positioned on it.

**Selection was deliberately not widened with the comparison, so what you read does not change.** A
second `<code>` is a new candidate rather than a new arm, and it sits earlier in document order than a
later arm's; selection ranks on "names a product" alone, so admitting it would displace an
equally-symboled but richer sibling coding, taking `CODE_NARRATIVE_MISMATCH`, `MISSING_CODE_VALUE`, or
a `<translation>` list down with it, in exchange for a symbol that was already identical. Only the
arm's lead `<code>` is selected, which is why the new code is **safety-critical** rather than
tolerable: on the shape where the lead asserts a `nullFlavor` and the sibling names the drug, it is
the only signal, `med.drug?.code` is `undefined` over a document that names the drug one element
along, and that is `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s harm with a sibling `<code>` in place
of a `<translation>`. It over-fires on the benign identical repeat as the price of that: deciding from
what the codings say whether the cardinality gets named is the inversion the repeated-arm code
already refuses.

**When BOTH arms fall back to translations, sharing one coding is not always enough to agree.** That
is the one pairing where the shared-coarser-coding hazard above survives, because neither arm asserts
a primary to compare: two arms translating to a shared coarser concept plus two different strengths
share a coding while naming two products. So they also conflict when each names a coding the other
does not **and** two of those unshared codings are in the same code system under different symbols.
An arm that merely offers an extra alternate the other stayed quiet about (an NDC beside the RxNorm
concept both share) is elaborating its own concept, which is what a `<translation>` does, and is not
a conflict: a shorter list is not a denial. Codings in different code systems are never compared,
because deciding whether an NDC and an RxNorm concept denote one product is terminology work. Two
arms that both assert a primary are compared on those primaries alone, unchanged.

That last test is a parser's reading rather than something the document asserts, and it deliberately
**over-fires**: two different symbols in one code system usually are two products, but two NDC
package codes can describe one drug, and an RxNorm branded drug and its clinical equivalent are one
product at two granularities. Telling those apart is the terminology work this library refuses to
guess at, so the choice is only which way to be wrong: over-firing costs a withheld product beside a
loud safety-critical code, under-firing costs one of two strengths handed back in silence.

## Discrete clinical data

- **Results**: Result Organizers via `getResults()`: the LOINC-coded analyte, the polymorphic
  observation `value` as a discriminated `ObservationValue` (`physicalQuantity` / `coded` / `string` /
  `integer` / `real` / `range` / `unsupported`, selected by `xsi:type`; those are **all seven** arms,
  so an exhaustive `switch` on `kind` is complete), the `referenceRange` (structured `IVL_PQ` bounds,
  else free-text), and the `interpretation`.
- **Vital Signs**: Vital Signs Organizers via `getVitals()`: the same UCUM-checked `ObservationValue`
  machinery, no reference range.
- **Immunizations**: Immunization Activities via `getImmunizations()`: the CVX `vaccine`, `dose`,
  `route`, `effectiveTime`, and `statusCode`. A refusal (`negationInd="true"`) is a distinct `refused`
  flag (`IMMUNIZATION_REFUSED`), never confused with a `nullFlavor`.

Every physical quantity is checked against a **computable, zero-dependency UCUM grammar**
(`isValidUcumUnit`, `isUcumCaseSuspect`): a non-UCUM unit is flagged (`NON_UCUM_UNIT`) and a
letter-case slip caught (`UCUM_CASE_SUSPECT`), but the **raw unit is always preserved, never
normalized away**. A `REAL` value (`<value xsi:type="REAL" value="7.25"/>`) is the `real` arm: the
number in `value` and the verbatim token in `raw`, like `integer`. An unrecognized `value xsi:type`
is typed `unsupported` and reported with `RESULT_VALUE_TYPE_UNHANDLED`. The element's text, if it has
any, is kept in `raw`; content held in its attributes or child elements (an `MO` amount, an `RTO`
ratio) is not kept in the typed model, though `doc.toString()` still carries it. See the
[cases reported against other parsers](./limitations.md#cases-reported-against-other-parsers).

## Procedures, encounters, and social history

- **Procedures** via `getProcedures()`: the three Procedure Activity templates: an
  altering/operative `<procedure>` (`…22.4.14`), a non-altering `<act>` service (`…22.4.12`), and an
  assessment `<observation>` (`…22.4.13`), kept apart by a `kind` discriminant. **`moodCode` is
  safety-critical:** a performed procedure (`EVN`) and a planned/ordered one
  (`INT`/`RQO`/`PRMS`/`PRP`/`APT`/`ARQ`) become a `disposition` of `"performed"` vs `"planned"` and are
  **never conflated**: a missing mood is `PLANNED_VS_PERFORMED_AMBIGUOUS`, an unrecognized mood is
  `PROCEDURE_MOOD_UNEXPECTED`, both leaving `disposition` undefined rather than guessing. A device
  the procedure used or placed (`participant typeCode="DEV"`, a Product Instance on an implant) is
  kept on `devices`: its `ids` (the UDI) and its device `code`. A Procedure Activity Procedure in a
  Medical Equipment section, which is how C-CDA R2.1 records an implant (CONF:1098-31885), is read
  there and is not flagged `SECTION_PLACEMENT_SUSPECT`.
- **Encounters** via `getEncounters()`: the Encounter Activity (`…22.4.49`): the visit type `code`,
  `statusCode`, and visit-period `effectiveTime`.
- **Social History: Smoking Status** via `getSmokingStatus()`: the Smoking Status (Meaningful Use)
  observation (`…22.4.78`). An explicitly-unknown status (a `nullFlavor` or an "unknown" SNOMED concept)
  sets `unknown: true` and emits `SMOKING_STATUS_UNKNOWN`, never silently read as "never smoked"; a
  value outside the Current Smoking Status value set is preserved and flagged
  `SMOKING_STATUS_CODE_UNRECOGNIZED`.

## Plan of treatment, status, and history sections

- **Plan of Treatment** via `getPlannedItems()`: seven planned-entry templates, kept apart by a `kind`
  discriminant: Planned Act (`…22.4.39`), Encounter (`…22.4.40`), Procedure (`…22.4.41`), Medication
  Activity (`…22.4.42`), Supply (`…22.4.43`), Observation (`…22.4.44`), and Immunization Activity
  (`…22.4.120`). **Seven is what this returns, not what the section can hold.** A Plan of Treatment
  section (`…22.2.10`) admits eleven entry templates; the four it does not return are Instruction
  (`…22.4.20`), Handoff Communication Participants (`…22.4.141`), Nutrition Recommendation
  (`…22.4.130`) and Goal Observation (`…22.4.121`), none of which is an act to be performed on the
  patient at a future time. A Goal Observation is the clearest: it is `moodCode="GOL"`, which this
  parser classifies as neither performed nor planned. **The first three are no longer excluded in
  silence: each is reported as `PLAN_ENTRY_NOT_MODELED`, once per matching root, as a direct
  `<entry>` and nested in a Planned Intervention Act.** Reporting is not modeling:
  they are still not returned, still on no model field, and still reachable only through
  `doc.toString()`. **Where the report fires is a bound this library chose, not a statement about
  every place C-CDA admits these templates.** A direct entry is reported in **two** sections: Plan of
  Treatment, and the **Interventions Section (V3)** (`…21.2.3`), which admits a Handoff as a direct
  entry in as many words (CONF:1198-32402 / 1198-32403) and is where R2.1 puts the container the
  nested half already reads. **The citation is V3's; the matching is this library's usual section
  recognition, which is wider**: templateId root `…21.2.3` first, LOINC `62387-6` as the fallback, no
  `@extension` check, so a V2-stamped or LOINC-only Interventions Section is in scope too. An
  Instruction in the Instructions Section (`…22.2.45`), where
  it is that section's own required entry, still draws nothing; nested in a Planned Intervention Act
  there is no section condition, because the container is what the report is relative to and it is
  read wherever it sits. **These three templates appear in more places than the report covers, and an
  occurrence outside it is still dropped in silence**: a Handoff nested in an **Intervention Act**
  (`…22.4.131`) is silent, because that act is not a container this library descends into, and a
  direct entry of a section this catalog recognizes as nothing is silent because there is no key to
  match. **A Goal Observation is reported too**, with the same code and its own wording, wherever it
  is a section's direct entry, and it is still not modeled. A planned entry is read as an `<entry>`'s own
  act **or** nested inside a **Planned Intervention Act** (`…22.4.146`), the act that groups the
  interventions planned toward a goal and the one container C-CDA lets hold all seven inline; until
  `0.0.3` only the first was read, so all seven vanished from the nested shape with nothing raised
  about it. **That does not solve nesting in general.** C-CDA also puts planned acts inside a Nutrition
  Recommendation (`…22.4.130`, six of the seven) and a Planned Intervention Act inside an Intervention
  Act (`…22.4.131`); a planned entry in either is still not reached, and nothing is raised about it.
  **The Planned Immunization Activity was missing
  until `0.0.3`**, matching no template at all, so a scheduled vaccination was absent from
  `getPlannedItems()` with no warning to find it by. Its `code` is the **vaccine** from the
  `consumable`, checked against CVX, exactly as a performed Immunization Activity's `vaccine` is.
  **Everything here is future/ordered, never performed:** each item's `moodCode` is read into the same
  performed-vs-planned `disposition` as Procedures (a planned mood → `"planned"`), and the two are
  **never conflated**; a missing/unrecognized mood leaves `disposition` undefined rather than guessing.
- **Functional Status** / **Mental Status** via `getFunctionalStatus()` / `getMentalStatus()`: the
  Functional/Mental Status Observations (`…22.4.67` / `…22.4.74`), read whether standalone or clustered
  in a status Organizer (`…22.4.66` / `…22.4.75`), plus **direct-entry Assessment Scale Observations**
  (`…22.4.69`, flagged `assessmentScale`), the conformant C-CDA R2.1 placement, with their scored
  Assessment Scale Supporting Observations (`…22.4.86`) on `supporting` and the total score read as an
  `integer` (`xsi:type="INT"`) value. Each finding is `domain`-tagged **from its carrying section**, so
  the two are **never conflated** (the same scale OID appears in both sections; the section, not the
  template, fixes the domain); a scale in a section that is neither functional nor mental is not captured
  (its domain is unknowable, never guessed). A scale mis-nested inside an organizer is still read
  leniently.
- **Family History** via `getFamilyHistory()`: the Family History Organizer (`…22.4.45`) → Observation
  (`…22.4.46`) tree. The relative's identity (relationship, gender, birth time, `sdtc:deceasedInd`) is a
  structured `relative` (not flattened into each condition); each entry in `observations` carries the
  coded `condition` (the observation's `<value>`), an optional `ageAtOnset` from an Age Observation
  (`…22.4.31`), and a `causeOfDeath` flag from a Family History Death Observation (`…22.4.47`).
- **Past Medical History** via `getPastMedicalHistory()`: the **bare** Problem Observations (`…22.4.4`)
  a Past Medical History section (`…22.2.20`) carries directly under each `<entry>` (not wrapped in a
  Problem Concern Act), reusing the Problems model, so a past problem never double-counts as an active
  one.

## Whose data an entry is about: the subject override

CDA R2 gives `Section.subject` cardinality `0..1` and defines it as the "Primary target of the entries
recorded in a section"; C-CDA admits the same override on a clinical statement. So a conformant
document can carry a relative's, a donor's, or a contact's clinical statement inside the patient's
document, and every read path documented above as the patient's own data must not hand one back.

**An entry under a subject declaration is withheld from every record-target read path and flagged
`SUBJECT_CONTEXT_OVERRIDE` (safety-critical, no profile may tolerate it).** Four rules decide it, and
each is a decision rather than an implementation detail:

- **Presence is the trigger.** A `<subject>` is an override whatever it names. Nothing is compared with
  the record target and nothing is resolved to the patient: that would make the answer depend on vendor
  identifier hygiene, which is the guess this library's fail-safe rule forbids. An empty declaration, a
  `nullFlavor`-only one, a repeated one, and one that restates the patient's own name and MRN are all
  overrides. **The cost is stated rather than hidden**: a vendor that redundantly repeats the patient as
  an entry subject loses those entries from `getProblems()` and friends and gains a warning per entry.
  That is the safe direction of the error.
- **The nearest enclosing declaration wins**, the standard's own conduction rule. A section nested
  inside a declaring section inherits that declaration unless it declares its own, and governance is
  resolved from the element's ancestors, so handing a subsection straight to `extractProblems(...)`
  withholds exactly as parsing the whole document does. No public read path is a bypass around another.
- **The whole top-level `<entry>` is withheld**, its own statement and every statement nested inside it,
  and it is the unit of the warning count too. A declaration on the second Problem Observation of a
  Problem Concern Act withholds the WHOLE concern act and emits ONE warning at the act's locus: a
  concern act returned one observation short, silently, is exactly the confidently wrong clinical answer
  this exists to prevent.
- **A Family History Organizer's own `<subject>` slot is never an override.** It is that template's
  mechanism for naming the relative, whatever the slot contains, so it draws no warning and it
  re-overrides an enclosing section declaration. `getFamilyHistory()` returns what it always returned,
  in every document shape; withholding never removes anything from it. **The carve-out is read-side
  and reaches only the organizer that read path reads**: an entry carrying the Family History
  Organizer template beside one a record-target read path returns (a Result Organizer, say) is
  withheld and flagged like any other, and so is an entry whose declaration sits deeper inside it. A
  `templateId` is one element and C-CDA entries carry several, so a stray one cannot switch the rule
  off.

The count is **per section and sums over the document**: N governed top-level entries in a section
produce exactly N instances in document order, each naming that entry's own bounded locus (element
path, the section's LOINC code, line, and column), and a section that declares an override but governs
no entry anywhere beneath it produces exactly one instance at its own locus instead. A document whose
Problems section declares an override over three entries and whose Allergies section declares one over
none produces four, never three.

**Withholding is read-side only.** The withheld entry is not dropped from the document: `toString()` /
`serializeCcda()` reproduce it byte for byte (the round trip is unchanged), and the section's narrative
is returned unredacted, unreordered, and unannotated. Nothing new is modeled for third-party subjects:
a withheld entry is reachable only through the re-serialized document. Under `{ strict: true }` the
warning escalates like every other safety-critical Tier-2 code, so a document carrying an override now
throws where it previously parsed.
