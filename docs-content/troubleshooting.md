---
id: troubleshooting
title: Troubleshooting & known limitations
sidebar_label: Troubleshooting
sidebar_position: 1
---

# Troubleshooting & known limitations

`@cosyte/ccda` is built to be **correct and honest about its edges** rather than to claim more than it
delivers. Mis-reading a dose, an allergy, a code system, or a patient identifier can cause real
clinical harm, so this page is the deliberate "do not over-trust" list: the error model, common
symptoms, and, critically, the explicit statement of **what the parser, the builder, and the editor
do and do not do today**. Everything here is a documented boundary, not a bug: the lenient parser
never silently drops or garbles data; where a limitation applies, the raw value is preserved (often
with a warning), it is simply not further decoded.

## When does it throw vs warn?

Only the **seven** Tier-3 structural/security conditions throw a `CcdaParseError`; everything else is a
Tier-2 warning on `doc.warnings`.

```ts runnable throws
import { parseCcda } from "@cosyte/ccda";

// Well-formed XML whose root is not a ClinicalDocument: a structural fatal.
parseCcda("<Foo>hello</Foo>"); // throws CcdaParseError (NOT_A_CLINICAL_DOCUMENT)
```

| Fatal code (throws)            | Meaning                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `XXE_OR_DTD_PRESENT`           | The document declared a DTD or an external entity.           |
| `ENTITY_EXPANSION_LIMIT`       | Too many `&…;` entity references (billion-laughs).           |
| `INPUT_SIZE_LIMIT_EXCEEDED`    | Decoded input exceeds the byte cap.                          |
| `ELEMENT_DEPTH_LIMIT_EXCEEDED` | Element nesting too deep.                                    |
| `NODE_COUNT_LIMIT_EXCEEDED`    | Too many element nodes.                                      |
| `NOT_WELL_FORMED_XML`          | The bytes did not parse as XML.                              |
| `NOT_A_CLINICAL_DOCUMENT`      | Well-formed, but the root element is not `ClinicalDocument`. |

Narrow on the caught error via `err instanceof CcdaParseError` and `err.code === FATAL_CODES.*` (see
[Tolerance & the warning model](./spec-notes-tolerance)). Everything a real-world EHR does short of
that (an unknown section code, a missing dose, a code/narrative mismatch, an unexpected code system, a
non-UCUM unit) is a warning you triage, not an exception you catch.

## Common symptoms

| Symptom                                         | Likely cause                                                                        | What to do                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `documentType` is `undefined`                   | The root `templateId` set contains no recognized document-type OID (or none at all) | Check for `UNKNOWN_DOCUMENT_TEMPLATE` / `MISSING_TEMPLATE_ID`; the document still parsed as a generic `ClinicalDocument`. |
| A section has `key: undefined`                  | Its `templateId` and LOINC `code` matched nothing in the catalog                    | `UNKNOWN_SECTION_CODE` was raised; the section is retained as narrative-only: read `section.narrativeText`.               |
| `getMedications()[0].dose` is `undefined`       | The Medication Activity carried no `doseQuantity`                                   | `MISSING_DOSE_QUANTITY` was raised; the value is preserved-as-absent, never defaulted.                                    |
| A procedure's `disposition` is `undefined`      | The entry had no `moodCode`, or an unrecognized one                                 | `PLANNED_VS_PERFORMED_AMBIGUOUS` / `PROCEDURE_MOOD_UNEXPECTED` was raised; performed and planned are never conflated.     |
| A `CODE_NARRATIVE_MISMATCH` warning             | A coded value and its referenced narrative disagree                                 | Both are preserved and no winner is chosen; route the record to human review.                                             |
| A `NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT` warning | The `PQ` `@unit` is not well-formed UCUM (or a case slip)                           | The raw unit is preserved, never normalized; a case slip is usually a single-character fix.                               |
| `doc.toString()` throws                         | The document was hand-constructed, not produced by `parseCcda` or `buildCcda`       | Only parsed/built documents retain source XML to serialize; construct from scratch with `buildCcda`.                      |
| An entry you can see in the XML is not returned | A `<subject>` on that entry, on a statement inside it, or on its section            | `SUBJECT_CONTEXT_OVERRIDE` was raised, one per withheld entry: it is somebody else's clinical statement and is withheld from every record-target read path. It still round-trips through `toString()`. |

## Keeping PHI out of logs

Every warning `message` and every `CcdaParseError` message comes **whole from a frozen registry**. No
factory takes a value parameter, so nothing the document said, and nothing a sender chose, can reach a
message: not a template OID, not a `nullFlavor` token, not a unit, not an element name. A diagnostic
tells you `code` plus `position`, and that is the entire contract.

The `position` is bounded too, rather than copied. Its `path` is an element local name echoed only when
it is one this parser navigates (`<withheld>` otherwise), its `sectionCode` is echoed only when it
has the shape of a LOINC part number, and its `templateId` only when it has the shape of an HL7 v3
UID. `line` and `column` still locate the element exactly.

So you can log the full `.warnings` array, and a thrown `CcdaParseError`'s `message`, `stack` and
`position`, without leaking. Keep the same discipline in your own code: log the code and the position,
not the field content. A `CcdaParseError` deliberately retains **no raw input snippet**, precisely
because a C-CDA payload is a clinical document and any snippet would risk leaking PHI.

**This page said the opposite through `0.0.4`**, claiming messages were PHI-free "by
construction" while thirteen warning factories and one fatal interpolated a value straight from the
document. A 500,000-byte `templateId` root produced a 500,106-byte `.message`, and under
`{ strict: true }` it reached `err.stack`. If you shipped `.warnings` to a log aggregator on any
version at or before `0.0.4`, treat those log lines as potentially carrying document content.

## What it does, and does not do, today

Depth tracks the code, and never leads it. Everything below is a deliberate boundary rather than a
bug. Where a boundary is genuinely open, this page says so instead of resolving it in your favor.

### Reading a document

- **All twelve document types are recognized; fourteen entry families are decoded.** `parseCcda`
  resolves every C-CDA R2.1 US Realm document type from the root `templateId`. Problems,
  Medications, Allergies, Results, Vital Signs, Immunizations, Procedures, Encounters,
  Social-History smoking status, Plan of Treatment, Functional Status, Mental Status, Family
  History, and Past Medical History decode to structured entries. Every other section is framed and
  its narrative retained, but its entries are not modeled, and recognition of those sections has
  three outcomes. A catalog section matched on its `templateId` (Advance Directives, Medical
  Equipment, Payers, Instructions, Nutrition, Goals, Interventions, and the rest) gets a stable `key` and no
  warning. A catalog section matched only by its LOINC code also gets its `key`, but raises
  `SECTION_MATCHED_BY_LOINC_FALLBACK`; Reason for Visit and Chief Complaint carry no recognized
  `templateId` at all, so they always take this path. A section the catalog does not recognize
  (Hospital Course and Physical Exam among them) reads back with `key: undefined` and raises
  `UNKNOWN_SECTION_CODE`, or, if it carries no section `code` to match on, silently. None of the
  three drops anything: the narrative and the raw structure are preserved, and the document still
  re-serializes faithfully.
- **An entry another subject governs is withheld, not attributed.** CDA R2 makes `Section.subject` the
  "primary target of the entries recorded in a section" and C-CDA admits the same override on a
  clinical statement, so a document can carry a relative's or a donor's statement inside the patient's
  document. Wherever a `<subject>` governs a top-level `<entry>` (its own, one on a statement nested
  inside it, or one on an enclosing section) that WHOLE entry is withheld from every read path
  documented as the record target's own data, and `SUBJECT_CONTEXT_OVERRIDE` is raised once for it,
  naming the entry's bounded locus. The warning is safety-critical, so no profile can quiet it, and in
  strict mode it throws like any other. **Presence is the trigger**: nothing the declaration names is
  compared with the patient, so a document that redundantly restates the patient as an entry subject
  loses those entries too, which is the safe direction of that error. Two things are deliberately
  unaffected: the entry re-serializes byte for byte through `toString()` (the only way to reach it),
  and `getFamilyHistory()` returns what it always did, because a Family History Organizer's own
  `<subject>` slot is that template's mechanism for naming the relative rather than a context override.
- **Code checks are recognition, not membership, unless you supply an adapter.** `checkCodeSlot` /
  `checkLoincDeprecation` verify that a code's _system_ is the one expected for its slot (and flag
  deprecated or unexpected systems); on their own they do **not** verify that a code is a real,
  active member of SNOMED CT / RxNorm / LOINC. That tier needs a licensed terminology service, so it
  is bring-your-own: pass a `TerminologyAdapter` to `parseCcda` or `buildCcda` and it is consulted
  at the five recognized coded slots (`problem`, `medication`, `allergen`, `route`, `vaccine`). A
  code the adapter rejects is surfaced **verbatim** and flagged `SEMANTIC_CODE_INVALID`, never
  rewritten to a "corrected" value; an adapter returning `undefined` has no opinion and produces no
  warning. With no adapter, behavior is recognition-only. A value at one of those slots that asserts
  a `@code` with **no** `@codeSystem` is flagged `MISSING_CODE_SYSTEM` and is never handed to your
  adapter (which validates a system + code pair): the parser flags it rather than inferring a system,
  because a code without its system is not a code. The mirror shape, a slot that is present but asserts
  no usable `@code` **and** declares no `@nullFlavor`, is flagged `MISSING_CODE_VALUE`. A
  `nullFlavor`-only value stays silent (a complete statement of "unknown"), and so does an absent
  element, there is nothing to judge.
  **Those five slots are the whole of it, so read a silent document carefully.** Every other coded
  value is never handed to your adapter and therefore can never raise `SEMANTIC_CODE_INVALID`: the
  Results and Vital Signs LOINC codes, the procedure, encounter, and family-history codes, the
  planned-item codes for the five variants whose `code` is the planned act (the other two are
  exceptions: a planned **medication**'s `code` is the drug and a planned **immunization**'s is the
  vaccine, so those are checked at the `medication` and `vaccine` slots like any other),
  the smoking-status, functional-status, and mental-status observation values, the allergy
  propensity type, and the reaction, severity, and criticality observations. Within the five, the
  checks apply to the slot's **primary** coding; alternate codings carried in `<translation>` are
  preserved and re-serialized but are not themselves slot-checked. A clean run means the five checked
  slots passed, not that the document's terminology was verified.
- **A `nullFlavor` beside a value is a contradiction, and the parser resolves it against the number.**
  `<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>` asserts both "unknown" and "10 mg". Every v3
  datatype flags this `CONTRADICTORY_NULL_FLAVOR` (safety-critical, so no profile can quiet it),
  including the `INT` and `ST` arms of an observation `<value>`, and on `PQ`, `TS` and an `integer`
  observation value the derived reading is **withheld**: `dose.value` is `undefined`, while `dose.raw`
  (`"10"`), `dose.unit` and `dose.nullFlavor` are all preserved. If you were reading `.value` and now
  see `undefined`, that is the fix, and the document is telling you the value is unknown. On `CD`,
  `II`, `ST`, `ED` and `BL` the field is the document's own text with no verbatim copy behind it, so it
  is **kept** and the warning is the signal, read `doc.warnings`. Metadata beside a `nullFlavor` (a
  `@unit` with no `@value`, an `@root` with no `@extension`, a `CD`'s `originalText` / `<translation>`)
  is coherent, not contradictory, and stays silent, and a `nullFlavor`-only coded slot is still checked
  for a wrong or deprecated `@codeSystem`.
- **`getMrn()` withholds on a `nullFlavor`-marked `<id>`.** If you were getting an MRN and now get
  `undefined`, the first `patientRole/id` declared itself unknown. That is the one place this model
  manufactures an identifier out of an `II`: `pickMrn` _selects_ one id from a list and flattens it
  to a bare string with the marking gone, so the selection declines while the datatype keeps
  everything. It does **not** fall through to the next `<id>`: nothing in a C-CDA ranks
  `patientRole/id` entries, so the second one is whatever the sender listed second, often a member
  number, an account number, or the SSN. Read `doc.getPatient()?.identifiers` for the verbatim
  `extension` with its `nullFlavor` beside it, and branch on `root` yourself if you know your
  assigning authority's OIDs. The other identity slots (document `id`, `setId`, `parentDocument/id`,
  entry-level ids) are unchanged and still report the document verbatim; `templateId` is the stated
  exception, a null-marked one still resolves the document type, deliberately, since it asserts a
  document shape rather than a person. On the emit side, `editCcda` refuses to stamp an `RPLC`
  revision from a null-marked `ClinicalDocument.id` (`CcdaEditError` `SOURCE_MISSING_ID`), because
  copying `root`/`extension` into the `parentDocument` would drop the marking.
- **A medication or vaccine product is read from either `ManufacturedProduct` arm.**
  `manufacturedMaterial` is silent; `manufacturedLabeledDrug` is read too and flagged
  `MEDICATION_PRODUCT_ARM_UNEXPECTED`. That one is tolerable by a profile, and the reason is
  conditional rather than absolute: wherever it fires **alone** a `<code>` element was selected and
  read exactly as a single-arm document's would have been, and wherever **no product identity comes
  back** it is **not** alone, because `MEDICATION_PRODUCT_ARM_CONFLICT` (the arms disagreed),
  `MISSING_PRODUCT_CODE` (no arm carried a `<code>` at all, which is what a name-only `LabeledDrug`
  produces) or `MISSING_CODE_VALUE` (an element was selected and asserts neither a symbol nor a
  `nullFlavor`) fires beside it, and all three are safety-critical and unquietable by a profile. The
  third was missing from this list until `0.0.3`: it covered the shapes where _selection_ failed, not
  every shape where _identity_ is absent. So tolerating the presence warning can never buy silence
  about an absent or withheld drug. No arm yielding a code is
  `MISSING_PRODUCT_CODE` and is safety-critical, because dose, route and timing all survive a
  missing consumable and would otherwise make the record read as a complete medication with no drug.
  Both apply at every consumable call site: a performed Medication Activity, an Immunization
  Activity, a Planned Medication Activity, and a Planned Immunization Activity. A document whose arms name **different** products
  draws `MEDICATION_PRODUCT_ARM_CONFLICT` (safety-critical) and no product code is selected at all:
  two drugs on one medication is a contradictory document, nothing in it ranks the arms, and picking
  one would be the parser inventing an answer. That covers both arms of the choice **and a repeated
  arm of one kind** (two sibling `manufacturedMaterial`s naming different drugs is the same silent
  pick). If `med.drug` is `undefined` and you see this code, read `doc.toString()`, every arm
  survives serialization byte-for-byte. `MISSING_PRODUCT_CODE` is suppressed behind it because "no
  arm yielded a code" would be false, and so are the code-system checks, since there is no code to
  check, which is why the conflict warning is safety-critical. Arms naming the **same** product are
  redundant rather than contradictory, so the material arm is read as before. An arm asserting no
  symbol at all (a `nullFlavor`-only `<code>` with no `<translation>`, or no `<code>`) names no
  product and never conflicts with one that does, so whichever arm names the drug is read.
- **An arm that asserts no `@code` names what its `<translation>` alternates name.** If you have a
  `nullFlavor="OTH"` arm whose `<translation>` carries the real RxNorm code, that arm now names a
  drug: where it disagrees with the other arm you will get `MEDICATION_PRODUCT_ARM_CONFLICT` and
  `med.drug === undefined` where you previously got the other arm's code in silence. **The
  translations are a fallback, never an addition**, so two arms that both assert a `@code` are
  compared on those and nothing else, exactly as before. That direction is deliberate: a translation
  the two arms happen to share is routinely coarser than either primary (an RxNorm ingredient, a
  local formulary id, an NDC spanning presentations), so counting it would let two arms naming two
  strengths of one drug agree, and one strength would be handed back. Reading translations can only
  make the warning fire more, never less. **Selection is separate and unchanged**: the element handed
  to the code-system and terminology checks is still chosen on the primary `@code`, and a coding is
  never lifted out of a `<translation>` to stand in as the product, because translations are
  preserved but not slot-checked. **Where BOTH arms fall back to translations, sharing one coding is
  not always enough to agree**: that is the one pairing where a shared coarser coding can still hold
  together two arms naming two products, so they also conflict when each names a coding the other
  does not and two of those unshared codings are in the same code system under different symbols. An
  arm that merely offers an extra alternate the other stayed quiet about (an NDC beside the RxNorm
  concept both share) is elaborating its own concept, not denying the other's, and is not a conflict;
  codings in different code systems are never compared, because that is terminology work. That last
  test is a parser's reading rather than something the document asserts, and it deliberately
  over-fires: two NDC package codes can describe one drug, and an RxNorm branded drug and its
  clinical equivalent are one product at two granularities, but telling those apart is the
  terminology work above. Over-firing costs a withheld product beside a loud code; under-firing
  costs one of two strengths handed back in silence. **On the newly-refused shapes `med.drug` is
  `undefined` with the conflict code beside it.** If the two fallback arms were the only ones you
  previously got the first arm's `nullFlavor` `CD` and that arm's translations, and `med.drug?.code`
  was `undefined` either way. If a **third** arm asserts a primary the two fallback arms disagree
  behind, you previously got that arm's fully coded `CD`, so a code you were reading does go away:
  the document names one product in a primary and two others in translations, and the parser now
  declines to pick. Read `doc.toString()` for every arm verbatim.
- **A product named only in a `<translation>` now says so
  (`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`, safety-critical).** If no arm asserts a primary
  `@code` and one of them carries the real coding in a `<translation>`, you get this code and
  `med.drug?.code === undefined`. That is not a change of reading, it is the same reading with the
  silence removed. **Where to find the coding depends on which arm holds it, and the warning's
  message and `position` tell you.** Only one arm ever becomes `med.drug`: when that is the arm
  carrying the translation, search `med.drug?.translation` for it, beside the `nullFlavor` the
  document wrote; do not just read `[0]`, since a `<code>` may carry several `<translation>`s and the
  first can be `nullFlavor`-marked or in a code system you did not want. When it is not (two arms,
  neither asserting a primary, the translation on the one that was not selected), `med.drug` is the
  other arm's `CD` and no product-naming coding is on it, so read `doc.toString()`, which re-emits
  every arm byte-for-byte. No profile may quiet it: on the
  `nullFlavor`-marked idiom nothing else fires at all (`MISSING_PRODUCT_CODE` would be false, an arm
  did carry a `<code>`, and the code-system checks are silent by design on a slot whose only
  assertion is a `nullFlavor`), and on the variant that asserts neither a symbol nor a `nullFlavor`
  the companion is `MISSING_CODE_VALUE`, which is itself safety-critical, at every consumable call
  site alike: a performed medication, an immunization, a planned medication's drug, and a planned
  vaccination's vaccine (see the Plan of Treatment bullet below). Behind
  `MEDICATION_PRODUCT_ARM_CONFLICT` it stands down, the same way `MISSING_PRODUCT_CODE` does. **Its
  precondition is about each arm's LEAD `<code>`, not the arm**: selection reads the first `<code>`
  on an arm and no other, so an arm whose _second_ `<code>` asserts a primary is still a slot with no
  selected product and still draws this code, with `MEDICATION_PRODUCT_CODE_REPEATED` beside it. The
  message said "no arm asserts a primary `@code`" and called the translation the _only_ place the
  product was named until `0.0.3`; both were false on precisely that shape.
- **A repeated arm is reported even when the repeats agree
  (`MEDICATION_PRODUCT_ARM_REPEATED`).** `ManufacturedProduct` models a choice of one participant, so
  two `manufacturedMaterial`s (or two `manufacturedLabeledDrug`s) is outside the model whatever they
  say. Disagreeing repeats are still refused; agreeing repeats used to be reduced to one silently, so
  a document asserting the same product three times looked exactly like one asserting it once. It is
  keyed to the arms rather than to their codings, so an arm with no `<code>` counts, and it is
  tolerable by a profile: where it fires alone a `<code>` was selected and read exactly as any
  single-arm document's would be, and each state where that would not be enough carries an
  unquietable companion (`MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE`,
  `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`, or `MISSING_CODE_VALUE` where the selected `<code>`
  asserts neither a symbol nor a `nullFlavor`, which is exactly what two empty-`<code/>` material arms
  produce). That fourth one was missing from this list until `0.0.3`.
- **A repeated `<code>` on ONE arm is reported too, and its second `<code>` is no longer dropped from
  the comparison (`MEDICATION_PRODUCT_CODE_REPEATED`, safety-critical).** `Material.code` and
  `LabeledDrug.code` are each at most one in CDA R2, and only the first was ever read, so an arm
  writing an RxNorm code for Lisinopril and a second one for Aspirin handed back Lisinopril and said
  nothing at all. Every `<code>` on every arm now reaches the comparison, so that document raises
  `MEDICATION_PRODUCT_ARM_CONFLICT` and `med.drug` is `undefined`. This code is reported **per arm**,
  and its `position` names which arm carries the repeat, so two offending arms give you two warnings
  at two places rather than one that points at only one of them. **What you read does not change**:
  selection still takes each arm's first `<code>` and nothing else, deliberately, because a
  newly-visible sibling sits earlier in document order and would displace an equally-symboled but
  richer coding, taking `CODE_NARRATIVE_MISMATCH`, `MISSING_CODE_VALUE`, or a `<translation>` list
  with it in exchange for a symbol that was already identical. **No profile can quiet this one**, and
  that is why: on the shape where the arm's first `<code>` asserts a `nullFlavor` and its sibling
  names the drug, `med.drug?.code` is `undefined` over a document that names the drug one element
  along, nothing else fires, and this is the only signal. Read `doc.toString()` for the sibling
  verbatim. On a benign identical repeat it costs you a warning over a document that lost nothing;
  that over-fire is the price of not letting what the codings say decide whether the cardinality gets
  named at all.
- **A Planned Medication Activity's `code` is the drug, not the `substanceAdministration`'s own
  `<code>`.** If you read `getPlannedItems()` and a `medicationActivity` entry came back with a code
  that is not a drug (a SNOMED CT "Administration of drug or medicament", say) you were on `0.0.2` or
  earlier: the direct `<code>` was preferred whenever it was present, and only a planned medication
  without one ever read its `consumable`. CDA R2 makes `SubstanceAdministration.code` an
  `ActSubstanceAdministrationCode`, the **kind of administration act**, while the substance
  participates through `consumable/manufacturedProduct`, so that code was never a drug and reading it
  into the drug slot short-circuited the entire product path. **Every product warning on this page
  was unreachable on that variant**, `MEDICATION_PRODUCT_ARM_CONFLICT` above all, so a planned
  medication whose two `manufacturedProduct` arms named two different drugs was reported with no
  warning of any kind, on the section that says what a patient is about to be given.
  `CODE_NARRATIVE_MISMATCH` was reachable but useless there, comparing an act type's label against a
  narrative that names a drug, so it fired on well-formed documents and stayed quiet about the
  structured drug contradicting the narrative. All of that is fixed in `0.0.3`. The act `<code>` is
  not on the model for this variant, as it is not for a performed Medication Activity or an
  Immunization Activity; read `doc.toString()` if you need it.
  **The code-system and terminology checks reach it too, as of `0.0.3`.** Because that `code` is the
  drug, it is checked against the `medication` binding exactly as a performed Medication Activity's
  `drug` is, so `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM` and (with a
  `TerminologyAdapter`) `SEMANTIC_CODE_INVALID` fire on a planned drug, code for code with its
  performed twin. On `0.0.2` and earlier none of them could: a planned drug asserting a `@code` with
  no `@codeSystem`, an empty `<code/>`, or an OID outside RxNorm/NDC came back read and unremarked.
  `DEPRECATED_CODE_SYSTEM` is the one that does not apply, and it does not apply to a performed drug
  either: the `medication` binding declares no deprecated systems, so an ICD-9-CM OID on a drug is
  `UNEXPECTED_CODE_SYSTEM` in both places.
  **What that changed for the tolerable product codes.** `MEDICATION_PRODUCT_ARM_UNEXPECTED` and
  `MEDICATION_PRODUCT_ARM_REPEATED` are profile-tolerable, and their tolerability rests on an
  unquietable companion firing wherever no `<code>` was selected and read normally. On the
  empty-`<code>` shape that companion is `MISSING_CODE_VALUE`, which could not fire here, so on
  `0.0.2` a planned medication whose single arm was
  `<manufacturedLabeledDrug><code/></manufacturedLabeledDrug>` had no drug identity at all and drew
  `MEDICATION_PRODUCT_ARM_UNEXPECTED` alone, and two empty-`<code/>` material arms drew
  `MEDICATION_PRODUCT_ARM_REPEATED` alone. Apply a vendor profile, filter the expected noise as this
  documentation elsewhere suggests, and that document reached you silent. Both shapes now carry
  `MISSING_CODE_VALUE`, which no profile can quiet. **The other five planned kinds are still not
  slot-checked.** That is a **choice**, and it used to be stated as a necessity ("binding them would
  mean inventing a value set"), which is true only of the system checks: `MISSING_CODE_VALUE` and
  `MISSING_CODE_SYSTEM` are raised before any binding is read, so they could be raised on an act-coded
  planned `<code>` without citing a value set. They are not, deliberately, and changing that would be
  its own decision. **So do not treat a quiet `getPlannedItems()` as a checked one**: test
  `item.code?.code`, not `item.code`.
- **A Planned Immunization Activity used to vanish entirely, and that was the sharpest form of this
  family.** On `0.0.2` and earlier a Plan of Treatment entry carrying the Planned Immunization
  Activity template (`…22.4.120`) matched nothing: `getPlannedItems()` returned **no item for it at
  all** and raised **no warning**, so reading that list to answer "what is this patient scheduled to
  receive" gave you a clean, warning-free answer with a scheduled vaccination missing from it. There
  was no `undefined` to test for and no code to filter on, and the document round-tripped
  byte-for-byte through `serializeCcda`, so nothing looked wrong. As of `0.0.3` it comes back as
  `kind: "immunizationActivity"`, and, exactly like a planned medication, its `code` is the **product
  from the `consumable`** rather than the `substanceAdministration`'s own `<code>`, so every product
  warning on this page applies to it. It is slot-checked against the **`vaccine`** binding, which is
  **CVX only**: an NDC-coded planned vaccine draws `UNEXPECTED_CODE_SYSTEM` where an NDC-coded planned
  drug does not, because each variant matches its own performed twin rather than the other variant.
  If you kept a workaround that read these entries out of `doc.toString()`, you can drop it. **What
  `getPlannedItems()` returns is still not everything a Plan of Treatment section can hold**: the
  section admits eleven entry templates and this returns seven. The four it does not return are
  Instruction (`…22.4.20`), Handoff Communication Participants (`…22.4.141`), Nutrition Recommendation
  (`…22.4.130`) and Goal Observation (`…22.4.121`); a Goal Observation is `moodCode="GOL"`, which this
  parser calls neither performed nor planned. Their narrative and structure are preserved and they
  re-serialize faithfully, and they are still not planned items. **Three of the four are no longer
  silent**: Instruction, Handoff Communication Participants and Nutrition Recommendation each draw
  `PLAN_ENTRY_NOT_MODELED` where planned items are read, once per matching root, so a consumer has a
  code to filter on instead of an entry that vanishes **in the places the report covers**.
  Reporting is not modelling: nothing about the returned list changed. A direct entry is reported in
  **two** sections, Plan of Treatment and the **Interventions Section (V3)** (`…21.2.3`, which admits
  a Handoff as a direct entry in as many words, CONF:1198-32402 / 1198-32403). That citation is V3's,
  while the matching is this library's usual section recognition and so is wider: templateId root
  first, LOINC `62387-6` as the fallback, no `@extension` check. An Instruction in the
  Instructions Section (`…22.2.45`), where it is that section's own required entry, still draws
  nothing. The nested half is reported wherever the Planned Intervention Act sits. **That scope is a
  bound this library chose, not a catalog of which sections C-CDA admits these templates in: they
  appear in more places than it covers, and an occurrence outside it is still dropped in silence.**
  Two such places are measured and pinned: a Handoff nested in an **Intervention Act** (`…22.4.131`)
  is silent because that act is not a container this library descends into, and a direct entry of a
  section this catalog recognizes as nothing is silent because there is no key to match. **Goal
  Observation is deliberately not reported**, because the decision taken on it was to model it rather
  than warn about it.
- **A planned entry nested in a Planned Intervention Act was dropped in silence, for all seven kinds
  (fixed in `0.0.3`).** `getPlannedItems()` used to read an `<entry>`'s own act and go no deeper, so a
  planned flu shot or drug order hanging off a **Planned Intervention Act** (`…22.4.146`, the act that
  groups the interventions planned toward a goal) came back as no item and no warning, round-tripping
  byte-for-byte. That was the same silence as the missing Planned Immunization Activity, one markup
  layer in and across all seven templates. Those entries are now returned, and they read exactly as the
  same act reads as a direct `<entry>`: same `kind`, same `code`, same slot check, same product
  warnings. If you kept a workaround that read intervention components out of `doc.toString()`, you can
  drop it. **Three bounds still apply.** A pointer is never followed: the container's
  `typeCode="RSON"` relationship holds an Entry Reference (`…22.4.122`) naming a goal recorded
  elsewhere, and that is stepped over rather than resolved. **It is the only container descended into,
  and C-CDA has others, so nesting is not solved in general.** A Nutrition Recommendation
  (`…22.4.130`) inline-holds six of the seven planned templates, and an Intervention Act (`…22.4.131`)
  inline-holds a Planned Intervention Act; a planned entry in either still comes back as nothing,
  exactly as it did before. What changed is only that the Nutrition Recommendation **container** now
  draws `PLAN_ENTRY_NOT_MODELED` (it is one of the three named above); what it holds is still not
  reached, and the Intervention Act is still silent end to end. Read `doc.toString()` if your senders
  nest that way. A
  returned item does not say whether it was direct or nested, either: the intervention itself is not
  modelled, so the grouping toward the goal is available only from `doc.toString()`.
- **UCUM validation is grammatical, on a curated atom subset.** The validator checks well-formed UCUM
  against the prefixes/atoms that appear in lab Results and Vital Signs, not the full UCUM registry. A
  valid-but-uncurated atom may read as `NON_UCUM_UNIT`; the raw unit is always preserved. It does not
  convert or dimension-check units.
- **`nonXMLBody` base64 is left inert.** An Unstructured Document's wrapped payload is exposed but never
  decoded: decoding an arbitrary embedded blob is a needless attack surface and a PHI decision the
  caller owns.
- **Vendor profiles only quiet benign noise.** `parseCcda(xml, { profile })` (or a process default via
  `setDefaultCcdaProfile`) applies a `CcdaProfile` that downgrades the non-safety-critical deviations it
  expects to `PROFILE_QUIRK_APPLIED` (flagged `expected`, carrying the original `toleratedCode`). It
  never drops a warning and never touches an extracted value. A profile **cannot** tolerate a
  safety-critical warning (dose, unit, allergen, identity, wrong or missing code system, malformed
  datetime, …);
  `defineCcdaProfile()` throws if you try. Built-ins: `ccdaProfiles.smartScorecard` (deprecated
  terminology) and `ccdaProfiles.legacyR11` (R1.1-origin structural tolerance), each with cited
  provenance, plus `ccdaProfiles.default`, which tolerates nothing and is identical to passing no
  profile at all. There is no named per-vendor profile: one is added only when a real, de-identified
  document from that vendor grounds the quirk, never from an invented one.
- **The required-section (SHALL) table is conservative, and every type reports how far it was
  verified.** It asserts only unconditional, in-catalog, high-confidence SHALL constraints; it omits
  choice constraints (`SHALL contain A OR B`), SHOULD/MAY sections, and SHALL sections outside the
  recognized catalog. `requiredSectionStatus(documentType)` returns the asserted keys with a
  `verification` state, so an empty set is never ambiguous:

  - **`traced-complete`** for CCD and Care Plan: every SHALL section the source names for those two
    is in this parser's catalog and is asserted, so `status.unasserted` is empty because there is
    nothing left over.
  - **`traced-partial`** for the other nine structured types. Their SHALL sections were read off the
    normative C-CDA R2.1 source, and one or more of them cannot be asserted. Consultation Note
    asserts History of Present Illness (CONF:1198-28907), Allergies (-28911) and Problems (-28929),
    each scoped to the R2.1 stamp its constraint carries. Progress Note, Procedure Note, Operative
    Note and Diagnostic Imaging Report assert **nothing**, and that is a traced result rather than
    an unread table: every SHALL section their templates name is either outside this parser's
    recognized catalog (Complications, Procedure Description, Anesthesia, Findings (DIR) and the
    rest) or a choice. Each one is listed by name in `status.unasserted` with the reason.
  - **`not-applicable`** for Unstructured Document: its component SHALL be a `nonXMLBody`
    (CONF:1198-31086), so it carries no section to require and none can be missing.
  - **`untraced`** is reported by no recognized type. It stays in the vocabulary as the honest state
    for a type whose obligation has not been read.

  Every status also names the artifact its obligation was read from and that artifact's own revision
  date (`status.source`), so a reader holding a later revision can tell the table is stale without
  re-deriving it.

  This under-warns rather than over-warns: a document of a `traced-partial` type that is missing a
  section its type requires can still parse clean, with no `REQUIRED_SECTION_MISSING`. Read an empty
  asserted set through its state, never as "this type has no requirements," and do not treat a quiet
  parse as a conformance result.

  ```ts runnable
  import {
    requiredSectionKeys,
    requiredSectionStatus,
    requiredSectionStatuses,
    DOCUMENT_TYPES,
  } from "@cosyte/ccda";

  DOCUMENT_TYPES.length; // => 12
  requiredSectionStatuses().length; // => 12
  requiredSectionStatuses().filter((s) => s.verification === "untraced").length; // => 0

  const consult = requiredSectionStatus("consultationNote");
  consult.verification; // => "traced-partial"
  consult.keys.join(","); // => "historyOfPresentIllness,allergies,problems"
  consult.traced[0]?.conformanceId; // => "CONF:1198-28907"
  consult.unasserted[0]?.reason; // => "not-unconditionally-required"

  // An empty asserted set, two different readings, two different values.
  requiredSectionStatus("operativeNote").keys.length; // => 0
  requiredSectionStatus("operativeNote").verification; // => "traced-partial"
  requiredSectionStatus("operativeNote").unasserted[0]?.reason; // => "outside-section-catalog"
  requiredSectionStatus("unstructuredDocument").verification; // => "not-applicable"
  requiredSectionStatus("ccd").verification; // => "traced-complete"

  // A Discharge Summary requires a Plan of Treatment section and does NOT require
  // a Discharge Medications section: the source states that one as a SHOULD.
  requiredSectionKeys("dischargeSummary").includes("planOfTreatment"); // => true
  requiredSectionKeys("dischargeSummary").includes("dischargeMedications"); // => false
  requiredSectionStatus("dischargeSummary").source?.revision; // => "2025-09-08"
  ```

### Building a document

- **`buildCcda` emits two of the twelve document types.** A **CCD** (the default) and a **Referral
  Note** (`documentType: "referralNote"`). Any other value throws a `TypeError` rather than emitting
  something that merely resembles the type you asked for. The other ten types are not implemented.
- **Which sections a build can carry.** For a CCD, its six SHALL sections are always emitted, as
  spec-clean empty `nullFlavor="NI"` sections when you supply no content: Problems, Allergies,
  Medications, Results, Vital Signs, and Social History (smoking status). Immunizations, Procedures,
  Encounters, Functional Status, Mental Status, Past Medical History, Plan of Treatment, and Family
  History are emitted only when populated, so an empty one is never fabricated. A Referral Note
  instead always emits Problems, Allergies, Medications, Reason for Referral, Assessment, and Plan of
  Treatment, and demotes Results, Vital Signs and Social History to populated-only. Any C-CDA section
  outside that set cannot be built.
- **Every coded value that reaches the narrative needs a `displayName`, and a missing one is
  refused.** Each populated section regenerates its `<text>` narrative from the same
  `BuildCode.displayName` the coded entry carries, and links the two with a `<reference>`, so the
  narrative is the attested restatement a clinician reads. `displayName` is a required field, but the
  package ships JavaScript and validates at runtime, so `buildCcda` (and `editCcda`, which writes
  through the same emitter) throws a `TypeError` naming the field path when the label is absent,
  empty, or not a string. It does **not** substitute a placeholder: any confident stand-in is a
  sentence the entry does not support. Until `0.0.11` inclusive the allergy slot substituted **"No
  known allergies"**, so an allergy asserted **positively** could carry a narrative byte-identical to
  the negated no-known-allergies form, and seven other slots wrote the literal string `undefined`. A
  `BuildCode` that reaches only the entry (an allergy `type`, a result `interpretation`, a medication
  `route`) is not covered: `@displayName` is optional on a v3 `CD`, so omitting the attribute states
  nothing false.
- **Every entry carries the `effectiveTime` its template requires.** The caller's time when supplied,
  else `nullFlavor="UNK"`: the SHALL cardinality is satisfied without a fabricated clinical
  timestamp, and the parser reads that back as absent, never as a real `Date`.
- **`<translation>` alternates are emitted only at the recognized coded slots.** If your adapter
  implements the optional `translate`, `buildCcda` emits each returned coding as a spec-clean CDA R2
  `<translation>` **beside** the primary code, never replacing it. The wired slots are the problem
  value, the allergen, the medication drug and route, and the vaccine and route. The Results and
  Vital Signs LOINC codes, the reaction/severity/criticality observations, and the procedure,
  encounter, planned-item, and family-history codes are **not** wired. An adapter without
  `translate`, or one returning no matches, leaves the output byte-identical: an unmapped code never
  produces a guessed alternate.
- **A built document is expected, but not proven, to pass an external IG validator.** The builder does
  not assert full
  XSD element order or the complete Schematron rule set, and its conformance was grounded against the
  raw C-CDA R2.1 IG text rather than a validator run. A clean build does round-trip through
  `parseCcda` with zero warnings, but that is a strictly weaker guarantee than external validation.
  If your pipeline requires IG conformance, validate the output yourself.
- **`serializeCcda` / `toString()` need a parsed or built document.** `buildCcda` returns the parse of
  the XML it just emitted, so a built document serializes. A hand-constructed `CcdaDocument` retains
  no source XML and throws.

### Editing a document

- **`editCcda` adds or replaces a whole section, across twelve section kinds.** `problems`,
  `allergies`, `medications`, `results`, `vitalSigns`, `immunizations`, `procedures`, `encounters`,
  `socialHistory`, `pastMedicalHistory`, `planOfTreatment`, and `familyHistory`. Functional Status
  and Mental Status are **buildable but not editable**: each is assembled from three separate content
  lists, which the single-list edit shape does not fit. The Referral Note's narrative-only Assessment
  and Reason for Referral sections are likewise not editable.
- **No entry-level append, and no section removal.** Adding one problem to an existing Problems
  section means a `replace` carrying the full entry set, which rebuilds that section from your typed
  input: anything in the original section you do not carry over, including detail this library does
  not model, is absent from the result. Every section you did **not** target is still carried through
  byte-for-byte. A true append that byte-preserves a section's other entries needs a lossless
  read-model that does not exist yet, and there is no way to remove a section at all.
- **`RPLC` only.** An edit stamps a CDA R2 replacement revision (`relatedDocument typeCode="RPLC"`
  plus `setId` / `versionNumber`), or no revision at all with `revision: false`. The `APND` (append)
  and `XFRM` (transform) document relationships are not emitted.
- **An edit needs a parsed source, and a section edit needs a `structuredBody`.** A hand-constructed
  document throws `CcdaEditError` (`NO_SOURCE_DOCUMENT`). A document with no `structuredBody`, such
  as an Unstructured Document, throws `NO_STRUCTURED_BODY` **only when you actually pass a section
  edit**: with no `sections`, `editCcda` just stamps the revision and returns, so a revision-only
  edit of an Unstructured Document succeeds. A revision of a source carrying no `ClinicalDocument.id`
  throws `SOURCE_MISSING_ID` rather than inventing the id the `RPLC` link has to name, and an edit
  that would drop a SHALL required section throws `REQUIRED_SECTION_MISSING` instead of emitting a
  non-conformant document.
- **On this path the terminology adapter validates but does not translate.** `editCcda` forwards a
  supplied adapter to its final re-parse, so a rejected code in the edited document is still flagged
  `SEMANTIC_CODE_INVALID`. It does not emit `<translation>` alternates into the section it rebuilds;
  only `buildCcda` does that.

## Scope (non-goals)

- **C-CDA R2.1, US Realm.** Other CDA templates and realms are out of the current scope.
- **A parser + serializer, not a transport or a validator suite.** No MLLP/XDS delivery, no Schematron
  conformance report: this reads and re-emits documents.
- **Pre-alpha on the `0.0.x` ladder.** `@cosyte/ccda` is **published on npm at `0.0.3`** and **public**,
  but still pre-alpha: on the `0.0.x`-until-first-alpha ladder, the API can still change.

For the exact fields each accessor decodes, see [Core Concepts](./spec-notes-clinical); for every
export and its signature, see the API reference, which is generated from the source rather than
hand-written, so it cannot drift from the shipped code.
