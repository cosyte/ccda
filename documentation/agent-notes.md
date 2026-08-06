# C-CDA agent notes

The long-form record behind `CLAUDE.md`. Every section here is the **verbatim** narrative that used
to sit in `CLAUDE.md` itself, relocated 2026-08-04 under `CLAUDE-MD-AUDIT` because that file is
always-read for every worker that `cd`s into this repo, and is bounded by its entry in `REPO_CLAUDE`
in the meta-repo's `.claude/hooks/doc-budget.mjs`, which is lowered as relocations land (ADR 0023 and
its 2026-08-04 amendment). **The bound is deliberately not quoted here**: this line first carried the
number, a uniform 90,000, and it was retracted for a per-repo ratchet within a day. A numeral that
went stale that fast is the failure class this audit exists to fix, so what stands here is a pointer.
**Nothing was deleted, weakened or summarised on the way here.**

Every trap still has a one-line imperative in `CLAUDE.md` pointing at the section below that carries
its reasoning. **Read that section before you change the code it describes.** These are
clinical-safety lessons in a parser: nearly every paragraph is here because a claim was refuted, a
defect shipped, or a measurement contradicted an argument. A summary of one of them is not a
substitute for it, which is why relocation was verbatim.

When you learn a new one, write it here in full and add its one-line imperative to `CLAUDE.md`. Do
not grow `CLAUDE.md` with the prose, and do not delete a paragraph here to make room.

## What buildCcda emits, and what it does not

  - `buildCcda` emits **two of the twelve** document types (CCD, Referral Note). The other ten are
    not implemented. Parsing **recognizes** all twelve; only building is limited.

## The 64 unresolvable example imports

  - **OPEN DEFECT, filed rather than fixed: 64 `@example` blocks cite an import that does not
    resolve**, across four modules (44 `parser/warnings.ts`, 17 `model/entries/shared.ts`, 2
    `builder/build-ccda.ts`, 1 `profiles/apply.ts`). They write `import { X } from "@cosyte/ccda"` for
    internal helpers and builder types the entry point does not export. **Four of the 64 reach
    consumers** in the published `.d.ts` (`profileQuirkApplied`, `applyProfile`, and the two
    assessment-scale builder types), verified against the published `0.0.2` tarball; the other 60
    document declarations `tsup` drops from the rollup, so they are wrong in the repo rather than
    wrong on npm. **The predicate is "reaches `dist`", NOT "is on the entry point"** -- both
    `BuildCcdaAssessmentScale` types shipped while unexported, because `BuildCcdaInit` references
    them. A fix plus a TSDoc gate was written, refused twice, and dropped by founder call rather than
    shipped ungraded: the gate was a specifier regex over single-line named imports, blind to
    multi-line, `import X from`, and `import * as X from`. **If you pick this back up, parse the TSDoc
    properly; do not grow that regex.** The per-symbol fix is the easy half (internal symbol gets a
    module-relative import, genuinely public symbol gets exported) and does not need the gate to land.

## Section recognition resolves a disagreement silently

  - **Recognition resolves a disagreeing section silently, in BOTH of its two shapes, with no warning
    for the disagreement.** `recognize()` returns on the first matching `templateId` and never
    consults `<code>`, and there is no code for "these signals disagree". The gap has two halves and
    an eventual warning code should be scoped to both: (a) **`templateId` vs LOINC** -- a recognized
    root and a recognized section code naming DIFFERENT catalog sections resolves on the root; (b)
    **root vs root** -- a section double-stamped with two recognized roots resolves on whichever
    appears FIRST in document order, so the document's element order silently decides the `key`.
    Pre-existing in both halves and not introduced by any one section, but the Interventions entry
    moves one more real-world shape into each, so both are pinned in `test/parse.test.ts` (rows 5, 8,
    9). No clinical fact is lost meanwhile: `extractClinical` runs every extractor on every section
    regardless of `key`.

## The TerminologyAdapter is consulted at five CodeSlots only

  - A `TerminologyAdapter` is consulted at the **five `CodeSlot`s only** (`problem`, `medication`,
    `allergen`, `route`, `vaccine`). Every other coded value is never handed to the adapter, so a
    clean run means those five slots passed, **not** that the document was terminology-verified.
    Within the five, the checks cover the slot's primary coding; `<translation>` alternates are
    preserved but not slot-checked. A `@code` with no `@codeSystem` reaches no adapter (there is no
    system to validate against) and is flagged `MISSING_CODE_SYSTEM` rather than passing silently,
    a safety-critical code no profile may tolerate. The mirror shape, a slot present but asserting no
    usable `@code` and no `@nullFlavor`, is `MISSING_CODE_VALUE`, also safety-critical.

## A nullFlavor asserted beside a value is a contradiction

  - **A `nullFlavor` asserted beside a value is a contradiction, not a refinement.** Every v3 datatype
    flags it `CONTRADICTORY_NULL_FLAVOR` (safety-critical), including the `INT`/`ST` arms of
    `readObservationValue`, which are parsed inline rather than through `src/model/types/` and must be
    wired by hand. Where a verbatim copy survives beside a derived reading the derived one is
    **withheld**: `PQ.value`, `TS.date`, and the `integer` observation value's `value` (which now
    carries `raw`, mirroring `PQ`). On `CD`/`II`/`ST`/`ED`/`BL` the field is the document's own text
    with no second copy, so it is kept and the warning is the signal. Metadata beside a `nullFlavor`
    (a `@unit` with no `@value`, an `@root` with no `@extension`, a `CD`'s `originalText` or
    `<translation>`) is coherent and stays silent. **If you add a datatype or an inline value arm,
    route it through `contradictsAssertedValue` or this claim stops being true.**

## The withholding rule, pickMrn, and the templateId exception

  - **The withholding rule is "was this reading manufactured beside a surviving verbatim copy",
    not "does this field look dangerous", and it applies at whatever layer manufactures.** Above
    the datatypes it fires once for an identifier: `pickMrn` (behind `getMrn()`) _selects_ one
    `<id>` from a list and flattens it to a bare `string` with the `nullFlavor` gone, so it returns
    `undefined` when the **first** `patientRole/id` is null-marked. **It withholds, it does not
    substitute** the next `<id>`: nothing in a C-CDA ranks `patientRole/id` entries, so the second
    is as likely to be an account or member number or the SSN, and answering from a different
    assigning authority is a quieter version of the same failure. `parseIi` still keeps
    `@extension`, so `getPatient()?.identifiers` reports every id in full. The other identity slots
    (`ClinicalDocument.id`, `setId`, `parentDocument/id`, entry-level `<id>`s) are only ever
    reported whole beside the warning, have no naked-string accessor, and are deliberately left
    alone. **`templateId` is the stated exception, not a member of that list:** recognition derives
    `documentType` (and the required-section SHALL set) from `templateId.@root`, so a null-marked
    `templateId` still resolves a type. Left as-is deliberately, it asserts a document _shape_ not
    a person, so a mis-read costs a spurious `REQUIRED_SECTION_MISSING` rather than a misattributed
    clinical fact. On the emit side `editCcda` refuses an `RPLC` revision from a null-marked
    `ClinicalDocument.id` (`CcdaEditError` `SOURCE_MISSING_ID`) and treats a null-marked `setId` as
    absent, rather than copying `root`/`extension` forward and laundering the marking away.

## The ManufacturedProduct choice and its two arms

  - A medication/vaccine product is read from **either** arm of the CDA R2 `ManufacturedProduct`
    choice, at every consumable call site (Medication Activity, Immunization Activity, Planned
    Medication Activity, Planned Immunization Activity). The **presence** of a `manufacturedLabeledDrug` arm is flagged
    `MEDICATION_PRODUCT_ARM_UNEXPECTED` (deliberately tolerable; keyed to the arm, not its `<code>`,
    so a name-only `LabeledDrug` is reported too). **Its tolerability is argued conditionally, and
    must stay that way:** wherever it fires _alone_ a `<code>` element was selected and read exactly
    as a single-arm document's would have been, and wherever **none** was selected it is not alone,
    because either `MEDICATION_PRODUCT_ARM_CONFLICT` (the arms disagreed) or `MISSING_PRODUCT_CODE`
    (no arm carried a `<code>` at all, the shape a name-only `LabeledDrug` produces) fires beside it,
    and **both** are safety-critical and unquietable. Naming only the conflict code is the same
    mistake one size smaller: it leaves the name-only `LabeledDrug` state unaccounted for. Do not
    restore the older, simpler claim that the alternate arm's code "is read, not refused" and that
    every check "applies to it unchanged" full stop; that was true before the conflict state existed
    and is false in it. No arm yielding a code is `MISSING_PRODUCT_CODE`, safety-critical,
    never a silent `undefined`. With **more than one arm** present the treatment is decided by what
    they say: only one naming a product means that one is read whichever arm it is (a null value is
    an _exceptional_ value, not a competing one, so there is nothing to refuse, and this is the
    direction the old behaviour silently lost a real RxNorm code in); naming the **same** product
    means the material arm is read as before; naming **different** products is
    `MEDICATION_PRODUCT_ARM_CONFLICT` (safety-critical) and **no code is selected**, because nothing
    in the document ranks the arms so any pick would be manufactured. `MISSING_PRODUCT_CODE` is
    suppressed behind it (it would assert the false "no arm yielded a code") and `checkCodeSlot` has
    nothing to check, which makes the conflict code the lone signal by construction and is why it is
    safety-critical and scoped this narrowly. Nothing is lost, `serializeCcda` re-emits the parsed
    DOM so every arm round-trips byte-for-byte.

## Disagreement is read across every arm and coding; selection is not

  - **Disagreement is read across every arm and every coding; selection is not.** The conflict check
    covers both arms of the choice, **repeated arms of one kind** (two sibling
    `manufacturedMaterial`s naming different drugs is the same silent pick), **and every `<code>` an
    arm carries rather than just its first** (two sibling `<code>`s under one arm is that same pick
    again, one markup layer further in, and it was invisible until `CCDA-ARM-MULTI-CODE`). An arm names its
    `<code>`'s own `@code`, or, when it asserts none, the codings its `<translation>` alternates
    assert: `nullFlavor="OTH"` beside a `<translation>` is the documented C-CDA idiom, so on that
    shape the arm's product identity is in the translation. **The translations are a fallback, never
    an addition, and that asymmetry is load-bearing.** Two arms that both assert a `@code` are
    compared on those alone, so reading translations can only make the conflict fire _more_, never
    less. Do not "improve" this into a set-intersection rule where a shared translation withdraws a
    conflict: a shared translation is routinely coarser than either primary (an RxNorm ingredient, a
    local formulary id, an NDC spanning presentations), `A = Z` and `B = Z` does not give `A = B`,
    and the failure mode is handing back one strength of a document that names two. **Which element
    is handed to `checkCodeSlot` is decided by primary `@code` alone**, deliberately: this package's
    stated boundary is that slot checks apply to a slot's primary coding and translations are
    preserved but never slot-checked, so selecting on a translation would validate a `nullFlavor`
    primary against nothing or synthesize a coding the document never wrote there. Among repeated
    arms of one kind, the first that names a product is the one selected. **Where BOTH arms fall
    back to translations, sharing one coding is not always enough to agree**: that is the one pairing
    where the shared-coarser-coding hazard survives (neither arm asserts a primary to compare), so
    they also conflict when each names a coding the other does not **and** two of those unshared
    codings are in the **same code system under different symbols**. An arm that merely offers an
    extra alternate the other stayed quiet about is elaborating its own concept, which is what v3
    says a `<translation>` does, and is deliberately **not** a conflict: a shorter list is not a
    denial, and requiring the sets to cover each other drew an unquietable safety-critical code on a
    coherent document. Codings in different code systems are never compared: that is terminology
    work. Two arms that both assert a primary are still compared on those primaries alone. **The
    same-terminology test is a parser's reading, not something the document asserts, and it
    deliberately over-fires**: two NDC package codes can describe one drug and an RxNorm branded drug
    and its clinical equivalent are one product at two granularities, but telling those apart is the
    terminology work just refused, so the only choice is which way to be wrong.
    **Every branch of this rule may only ever make the conflict fire more than the base rule would,
    never less. That monotonicity is the safety property of this whole area; a matrix snapshot and a
    table of disagreeing-primary shapes in `test/entries.test.ts` pin it. Any change here must
    preserve it.** Note what monotone does **not** mean: firing more means **withholding** more, so a
    document that yielded a product code can stop yielding one. The three-arm shape (a primary-
    asserting arm behind which two fallback arms disagree) is exactly that, and the matrix pins it.
    "No product code stops being reported" is a **false** way to state the invariant; do not restore
    it.

## The translation-only and repeated-arm states

  - **Two states that used to be silent are now reported, without changing what is read.** A product
    named only in a `<translation>` (no arm asserts a primary `@code`) is
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`, **safety-critical**. The `CD` still comes back as the
    selection rule always picked it and `drug.code` is still `undefined`, because selection reads
    primaries only, but the gap is no longer unannounced. **Where the coding is reachable depends on
    which arm holds it, and the warning says which**: only one arm ever becomes the returned `CD`, so
    when the translation sits on the arm that was _not_ selected the coding is not on the model at
    all and only `doc.toString()` has it. On the selected arm it is _somewhere_ on
    `drug.translation`, which must be **searched** rather than read at `[0]` (a `<code>` may carry
    several, and the first can be `nullFlavor`-marked or in an unwanted code system). The `position`
    points at the `<code>` carrying the translation, not at the selected element. `MISSING_PRODUCT_CODE` cannot fire there (an arm did carry a `<code>`)
    and `checkCodeSlot` is quiet by design on a `nullFlavor`-only slot, so on that idiom it is the
    lone signal; on the variant asserting neither a symbol nor a `nullFlavor`, `MISSING_CODE_VALUE`
    fires beside it. It stands down behind `MEDICATION_PRODUCT_ARM_CONFLICT`. More than one arm of
    the **same kind** is `MEDICATION_PRODUCT_ARM_REPEATED`, **not** safety-critical, keyed to the
    arms rather than to their codings exactly as the presence warning is; where it fires alone a
    `<code>` was selected and read exactly as a single-arm document's would have been, and each state
    where that would not be enough carries an unquietable companion, and there are **four** of them
    rather than the three this list named until `CCDA-PLANNED-IMMUNIZATION-DROPPED`
    (`MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE`,
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`, and `MISSING_CODE_VALUE` where the selected `<code>`
    asserts neither a symbol nor a `nullFlavor`, which is what two empty-`<code/>` material arms
    produce). A selected `<code>` asserting only a `nullFlavor`
    and no `<translation>` is **not** one of those states: that is the document completely stating
    the product is unknown, and it reads exactly as it would on a single arm. **`MEDICATION_PRODUCT_ARM_UNEXPECTED`'s
    own argument names three, not two**: it used to enumerate only the states in
    which **nothing is selected** (`MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE`), which
    made it read as exhaustive when it was not. The third is `MISSING_CODE_VALUE`, where an element
    **is** selected and still names nothing. The translation-only state also selects an element, but
    it is not one of that code's companions, because a translation-only slot did yield a coding.
    All of them are safety-critical, so no classification moved; the argument was incomplete.

## A repeated code element on one arm

  - **A repeated `<code>` on ONE arm is the same cardinality fact one markup layer in**
    (`MEDICATION_PRODUCT_CODE_REPEATED`, **safety-critical**). It is emitted **per arm** and
    positioned on the arm that carries the repeat, because it states a fact about that arm rather
    than about the `manufacturedProduct`.
    **The comparison was widened to every `<code>`; SELECTION WAS NOT, and that asymmetry is
    load-bearing. Do not "finish the job" by widening it.** Selection reads each arm's **lead**
    `<code>` (`armLeadCodes`), the one element CDA R2's `0..1` admits. A second `<code>` is a new
    _candidate_, not a new arm, and every candidate it adds sits **earlier in document order** than a
    later arm's lead, while `selectableCode` ranks on "names a product" alone and is
    completeness-blind on purpose. So admitting them re-decides picks the document never re-decided:
    a bare `<code code="X"/>` displaces a sibling arm's `<code code="X" displayName="..."/>` and
    takes `CODE_NARRATIVE_MISMATCH` with it (the only guard on the structured code contradicting the
    narrative), or displaces the `<code>` carrying the `<translation>`s, or displaces an empty
    `<code/>` that `MISSING_CODE_VALUE` fires on. All three are safety-critical, and all three would
    be traded for a symbol that was **already identical**, since only agreeing codings survive the
    conflict check. Ranking candidates on completeness instead is the manufactured reading this area
    refuses. Two matrix rows exist solely to fail loudly if anyone widens it.
    **Its safety-critical classification follows directly from that**, and is where it parts company
    with `MEDICATION_PRODUCT_ARM_REPEATED`: with two arms the naming one is read, so that code never
    fires alone over a lost drug; with two `<code>`s on one arm only the lead is read, so a lead
    asserting a `nullFlavor` beside a sibling naming an RxNorm product leaves the slot empty over a
    document that names the drug, with this code as the **lone** signal (`MISSING_PRODUCT_CODE`
    cannot fire, a `<code>` exists; the conflict rule cannot, an exceptional value is not a rival
    drug; `checkCodeSlot` is quiet on a `nullFlavor`-only slot). That is
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s harm with a sibling `<code>` in place of a
    `<translation>`. It **over-fires on the benign identical repeat deliberately**: splitting that
    shape off would let what the codings _say_ decide whether a structural deviation is named, the
    inversion the repeated-arm code refuses one layer out.

## The precise form of the monotonicity claim

  - **The monotonicity claim has a precise form, and the loose one is false.** Measured by running
    the matrix in `test/entries.test.ts` against the previous release's `src/`, not argued.
    `CCDA-ARM-MULTI-CODE` left all nineteen of `#62`'s rows byte-identical and moved only its own
    eight, each of which gains warnings and reads what the previous release read except the three the
    conflict rule now withholds outright. **Exactly one row's warning set is not a superset of its
    old one**, and that is the documented suppression rather than a lost signal:
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` stands down behind `MEDICATION_PRODUCT_ARM_CONFLICT`
    exactly as `MISSING_PRODUCT_CODE` does. So state it as **no row goes from warned to silent, and
    no row trades a safety-critical code for a weaker one** rather than as "no row loses a warning",
    which this slice made false.
    **`CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE` broke even that form, in one place, deliberately,
    and the exception is measured rather than argued.** Its own 27-row matrix (three variants of
    nine arm shapes on a Planned Medication Activity) leaves the nine "no act `<code>`" rows
    byte-identical and the performed-medication matrix untouched. The nine "act `<code>` present"
    rows are pure gain: base reads an act type into the drug slot and is silent on all nine; each
    now matches its twin. The nine "act `<code>` + narrative" rows move on `CODE_NARRATIVE_MISMATCH`
    alone, **eight of them losing it, two of those going warned to silent and two trading it for a
    tolerable code**. That is a false positive being removed, not a signal: base fired it on **nine
    of nine**, the clean document included, because it was comparing an `ActSubstanceAdministrationCode`'s
    `displayName` against a narrative naming a drug, which no conformant document matches. It was a
    constant, not a predicate. After, it fires on **one of nine**, exactly the row whose structured
    drug contradicts the narrative, which is the failure it exists to catch and the one base reported
    identically to the clean document. **No row loses a product warning.** Do not generalize this
    exception: it is the one code whose _subject_ moved, from the act code to the drug.

## A Planned Medication Activity code is the drug

  - **A Planned Medication Activity's `code` is the DRUG, and the consumable is read whether or not
    the act carries its own `<code>`.** CDA R2 makes `SubstanceAdministration.code` an
    `ActSubstanceAdministrationCode` (the kind of administration act); the substance participates
    through `consumable/manufacturedProduct`. So an act `<code>` is not a weaker drug code to fall
    back on, and `plannedCodeElement` must never return before calling `consumableProductCode` for
    this variant. It did until `CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE`, returning the direct
    `<code>` first, which made the act type the planned item's `code` and skipped the product path
    entirely: **every** warning `consumableProductCode` raises was unreachable at this call site,
    `MEDICATION_PRODUCT_ARM_CONFLICT` above all, so two arms naming two different drugs on the Plan
    of Treatment (what a patient is _about to be given_) drew nothing at all. `CODE_NARRATIVE_MISMATCH`
    was reachable but blind to its subject there, reconciling an act type's label against a narrative
    that names a drug. The builder is what hid it for so long: it emits the drug in the `consumable`
    and **no** direct `<code>` for this variant, so no round-trip fixture could produce the shape.
    The act `<code>` is deliberately **not** on the model for this variant, exactly as it is not for a
    performed Medication Activity or an Immunization Activity, the other two `consumable` call sites,
    both of which have always ignored it; it round-trips through `serializeCcda`. The other five
    planned kinds are untouched, their `<code>` _is_ the planned act and they have no consumable.
    **What did not generalize with it was `checkCodeSlot`, and `CCDA-PLANNED-CODE-SLOT` closed that
    separately.** A `PlannedItem.code` was not one of the five wired `CodeSlot`s, so
    `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM` and `SEMANTIC_CODE_INVALID`
    could not fire on a planned medication's drug where they all fire on a performed one's, and a
    `<manufacturedMaterial><code/></manufacturedMaterial>` came back as a truthy empty `CD` in total
    silence. It was `PRE-EXISTING` and unchanged by that slice, correctly kept out of it, and shipped
    as its own item with its own base-measured matrix. See the entry below.

## Slot-checking a planned medication drug

  - **A planned medication's drug is slot-checked at the `medication` binding, and the other five
    planned kinds are not slot-checked at all.** The `medicationActivity` variant's `code` **is** the
    drug, read from the same `consumable/manufacturedProduct` a performed Medication Activity reads,
    so it is the same coded value in the same terminology at the same slot and gets the same check.
    The other five carry the planned act itself (LOINC observation, CPT encounter, SNOMED
    act/procedure/supply); none is one of the five bound `CodeSlot`s, so an empty or
    unexpectedly-coded `<code>` on those five is still read and unremarked. **Do not "finish the job"
    by wiring them.** **But state WHY correctly, because this bullet overstated it until
    `CCDA-PLANNED-IMMUNIZATION-DROPPED`.** "Binding them would mean inventing a value set this repo
    cannot cite" is true of the **system** checks only. `checkCodeSlot` emits `MISSING_CODE_VALUE` and
    `MISSING_CODE_SYSTEM` **before** it reads `SLOT_BINDINGS[slot]`, so both could be raised on an
    act-coded planned `<code>` today without citing any value set. Leaving those five unchecked is a
    **choice, not a necessity**; widening it is a separate argued decision with its own matrix, not a
    tidy-up.
    **Four codes became newly reachable, not five, and the difference is worth keeping straight:**
    `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM` and (with an adapter)
    `SEMANTIC_CODE_INVALID`. `DEPRECATED_CODE_SYSTEM` is **not** among them, because the `medication`
    binding's `deprecated` list is empty, so it cannot fire at that slot on a _performed_ medication
    either. An ICD-9-CM OID on a drug is `UNEXPECTED_CODE_SYSTEM` in both places, and a matrix row
    pins that rather than leaving it to be re-derived.
    **What it bought:** the conditional tolerability argument for `MEDICATION_PRODUCT_ARM_UNEXPECTED`
    and `MEDICATION_PRODUCT_ARM_REPEATED` ("each state where that would not be enough carries an
    unquietable companion") was **false at this call site and only at this call site**, because the
    companion it names on the empty-`<code>` shape is `MISSING_CODE_VALUE`. A planned medication whose
    only arm was `<manufacturedLabeledDrug><code/></manufacturedLabeledDrug>` had **no drug identity
    at all** and drew `MEDICATION_PRODUCT_ARM_UNEXPECTED` alone; two empty-`<code/>` material arms drew
    `MEDICATION_PRODUCT_ARM_REPEATED` alone. Neither is in `SAFETY_CRITICAL_CODES`, so a profile plus
    the documented filter-the-expected-noise pattern reduced both to silence. Both now carry
    `MISSING_CODE_VALUE`. The argument holds at every consumable call site.
    **This is the one slice in the series that satisfies the monotonicity invariant WHOLE, and that
    is a property of the change rather than a claim about it:** `checkCodeSlot` only emits. It selects
    nothing, withholds nothing and never touches the `CD`, so no row can go warned to silent, trade a
    safety-critical code for a weaker one, or stop handing back a drug. Measured anyway, in a 26-row
    matrix (thirteen arm shapes, each parsed as a planned medication **and** as its performed twin)
    run against base `src/`: thirteen performed rows byte-identical, ten of thirteen planned rows
    moving, every one of them by gaining the code its twin already drew, and after the change the two
    columns of all thirteen shapes agree exactly. The pre-existing 27-row planned-arm matrix moved
    three rows, each purely gaining `MISSING_CODE_VALUE`.

## Seven planned templates returned, eleven admitted by the section

  - **`getPlannedItems()` returns SEVEN templates, and the Plan of Treatment section admits ELEVEN.
    Keep those two numbers apart.** The module docblock said "the six planned-entry templates a Plan
    of Treatment section can carry" and was wrong twice: it named six of the seven modelled, and it
    called that list the section's catalog. The seventh is **Planned Immunization Activity
    (`…22.4.120`)**, which matched no root at all until `CCDA-PLANNED-IMMUNIZATION-DROPPED`: a
    scheduled vaccination came back as **no item and no warning**, so a consumer asking
    `getPlannedItems()` what a patient was scheduled to receive got a clean, warning-free answer with
    the vaccination missing. It round-tripped byte-for-byte, which is exactly why nothing caught it.
    Its `code` is the **vaccine from the `consumable`**, never the act's own `<code>` (identical in
    shape to a Planned Medication Activity: base CDA R2's `code` `[0..1]`
    `ActSubstanceAdministrationCode`, which R2.1 constrains on **neither** template, and C-CDA's
    `consumable` `[1..1]` carrying Immunization Medication Information `…22.4.54`), and it is
    slot-checked at the **`vaccine`** binding, **CVX only**. So an
    NDC-coded planned vaccine draws `UNEXPECTED_CODE_SYSTEM` where an NDC-coded planned drug does not:
    **parity is with each variant's own performed twin, never between the two planned variants.**
    The four the section admits and this does **not** return are Instruction (`…22.4.20`), Handoff
    Communication Participants (`…22.4.141`), Nutrition Recommendation (`…22.4.130`) and Goal
    Observation (`…22.4.121`). Goal Observation is the load-bearing one: it is `moodCode="GOL"`, which
    `classifyDisposition` calls **neither** performed nor planned, so returning it would contradict
    this repo's own mood model. **Whether the other three should be REPORTED as dropped is open, not
    settled** and deliberately not decided in that slice.
    **`PLANNED_VARIANTS` is ORDERED and the immunization row is deliberately LAST.** Extraction takes
    the first matching root and stops, so an act stacking `…22.4.42` and `…22.4.120` still reads as a
    `medicationActivity`, exactly as it did before `…22.4.120` was recognized at all. Both variants
    read the same consumable so the `CD` is identical either way; the ranking decides the `kind` and
    with it the binding, and inserting the row earlier would take a CVX-coded stacked act from
    `UNEXPECTED_CODE_SYSTEM` to silent. A test pins it, and it **passes against base**, which is what
    makes it a measured no-op rather than an argument.
    **Monotonicity, measured, and this slice does NOT get `CCDA-PLANNED-CODE-SLOT`'s free pass.** That
    one was monotone by construction because `checkCodeSlot` only emits. This one changes what is
    **extracted**, so it could move rows in both directions. A 26-row matrix (thirteen arm shapes,
    each as a Planned Immunization Activity **and** as its performed Immunization Activity twin) run
    against base `src/`: all thirteen performed rows byte-identical, and all thirteen planned rows
    moving from the **same** base reading, `DROPPED (no PlannedItem) | silent`. No row loses a warning
    because no row had one; no row stops handing back a product because none handed one back. Every
    pre-existing inline-snapshot matrix in `test/entries.test.ts` still passes unchanged.
    **`ENTRY_ROOT_TO_SECTION` gained the root too**, so a Planned Immunization Activity as a direct
    entry of some other recognized section draws `SECTION_PLACEMENT_SUSPECT` (tolerable). That map can
    only ever make it fire more: the loop reports the first root whose home disagrees and merely
    continues past one that agrees. The catalog's one other container of `…22.4.120`, Planned
    Intervention Act, holds it as a **nested** act, which that check never inspects. **A Goal
    Observation is not a second container** and do not write that it is: its `plannedComponent`
    entryRelationship targets **Entry Reference**, so it _references_ a planned entry rather than
    nesting one. (That error was proposed by a refuter, adopted without re-checking, and shipped to
    five sites before the next pass caught it. Re-check a refuter's spec claim exactly as hard as your
    own.) Nested planned entries were not returned by `getPlannedItems()` either, for any of the seven
    kinds, and `CCDA-NESTED-PLANNED-ENTRIES` closed that separately. See the entry below.
    **The builder gained the variant in the same slice, deliberately**, because until it could emit
    the shape no round-trip fixture could exercise it, and an un-emittable shape is precisely what hid
    `CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE` for so long. Two things there are the template's, not
    house style: the `templateId` is **root-only** (`…22.4.120` is unversioned, unlike the six
    `…22.4.39`-`…22.4.44` templates that carry `2014-06-09`), and `effectiveTime` is **required** on
    `BuildCcdaPlannedImmunization`, because the template makes it `[1..1]`.
    **That last point was published wrong first and the correction is worth keeping:** `[1..1]` is not
    unique to `…22.4.120`. Planned Medication Activity (`…22.4.42`) SHALL carry exactly one too
    (CONF:1098-30468); it is the other **five** that are `[0..1]`. `BuildCcdaPlannedOrder` still types
    the field optional, so `buildCcda` emits a Planned Medication Activity short a SHALL element.
    **PRE-EXISTING, filed, deliberately not closed here** (requiring it is a breaking change to a
    published input type). Do not re-derive "the other six are `[0..1]`" from anything.
    **Still open after `CCDA-NESTED-PLANNED-ENTRIES`**, which corrected the `BuildCcdaPlannedItemBase`
    JSDoc that stated `SHOULD [0..1]` flatly (false on two of the seven) but did **not** make the field
    required. The false claim and the breaking change are separate acts and only the first was cheap.

## Planned entries nested in a Planned Intervention Act

  - **A planned entry NESTED in a Planned Intervention Act (`…22.4.146`) is returned, for all seven
    kinds; nothing else nested is.** `extractPlannedItems` read an `<entry>`'s own act and no deeper,
    so all seven vanished from that shape with nothing raised, the `…22.4.120` silence one markup layer
    in and seven times the surface. R2.1 gives the container an `entryRelationship` for each of the
    seven and each holds the planned act **inline**, which is what makes them reachable; the container
    lives in an Interventions Section (`…21.2.3`), **not** the Plan of Treatment Section, whose eleven
    entry templates do not include it, and it is reached anyway because `extractPlannedItems` runs on
    every `<section>` rather than on a recognized Plan of Treatment alone.
    **Three bounds, each a decision rather than an oversight.** (1) **Only that container is descended
    into**, recursively for itself, and **R2.1 has other containers, so nesting is NOT solved in
    general.** A Nutrition Recommendation (`…22.4.130`) inline-holds six of the seven by the identical
    pattern (all but `…22.4.120`), and an Intervention Act (`…22.4.131`, the performed sibling and the
    `SHOULD` entry of an Interventions Section) inline-holds a Planned Intervention Act. A planned
    entry in either is still returned as nothing with nothing said, unchanged from base, and a test
    pins both as unreached so the bound is measured rather than asserted. Widening to them is a
    decision with its own base-measured matrix, not a tidy-up.
    (2) **An `entryRelationship` is read for what it CONTAINS and never followed for what it
    REFERENCES.** The template's `[1..*]` `typeCode="RSON"` relationship holds an **Entry Reference**
    (`…22.4.122`) whose own SHALL names a Goal Observation; it carries no planned root, so root-matching
    steps over it. Resolving it would hand back an item the container does not hold. (3) **Matching is
    on the `templateId` root alone**, which is what keeps the performed acts the same container admits
    (Medication Activity `…22.4.16`, Immunization Activity `…22.4.52`, and the rest) out of the result:
    a performed and a planned medication are both `substanceAdministration`s, so an element-name or
    `@moodCode` test would either admit the performed one or start guessing at a mood the template
    already settles. `@moodCode` is still read onto `disposition`, so a planned template carrying a
    performed mood reports what it says.
    **A returned item does not say whether it was direct or nested, deliberately.** The Planned
    Intervention Act is not modelled at all: no container type, no goal linkage, no `nested` flag, so
    the grouping toward the goal is available only from `doc.toString()`. What `getPlannedItems()`
    answers is which acts are planned, and a nested one is planned on the same terms as a direct one.
    **The three open non-item templates stay open at both levels**: Instruction (`…22.4.20`), Handoff
    Communication Participants (`…22.4.141`) and Nutrition Recommendation (`…22.4.130`) are admitted by
    the container exactly as by the section, still not returned and still silent, and a test pins that
    rather than settling it.
    **Monotone, measured rather than argued.** A 14-row matrix (each of the seven acts placed as a
    direct `<entry>` and as the same element nested in an intervention) run against base `src/`: all
    seven direct rows byte-identical, all seven nested rows moving from the **same** base reading,
    `DROPPED (no PlannedItem) | silent`. No row loses a warning because no row had one; no row stops
    handing back a code because none handed one back. After the change the two columns agree exactly,
    which is the bar: nesting is a statement about grouping, never about the act. Every pre-existing
    inline-snapshot matrix in `test/entries.test.ts` still passes unchanged.
    **The builder did NOT gain the container, and that is a departure from the `…22.4.120` precedent
    with a reason.** There the builder had to learn the variant because no round-trip fixture could
    otherwise produce the shape; here the shape is reachable from the test fixture builder's raw-section
    escape hatch, and emitting a _conformant_ Planned Intervention Act means satisfying its `[1..*]`
    `RSON` Entry Reference to a Goal Observation, which means modelling goals. That is a feature, not a
    fixture, and it is filed rather than smuggled in.

## The Interventions Section and its OID arc

  - **The Interventions Section (`…21.2.3`, LOINC `62387-6`) is in the catalog, and its OID is the
    trap.** It lives in the `…10.20.21.2.*` arc, not the `…10.20.22.2.*` arc every other C-CDA section
    in `SECTION_CATALOG` uses, and `…10.20.22.2.3` (`22`, not `21`) is **Results**, already in the
    table. A matrix row exists solely to fail if those two are ever confused; do not "normalize" the
    arc. Matching is on root alone, so all three stamps in circulation are accepted (unversioned,
    `2014-06-09`, `2015-08-01`); that is the catalog's uniform root-primary contract, not a tolerance
    special to this entry. **There is no entries-REQUIRED sibling root** here, unlike Allergies
    (`…22.2.6` / `…22.2.6.1`) or Results (`…22.2.3` / `…22.2.3.1`): exactly one root. **Mind the
    direction, an earlier draft had it backwards:** in C-CDA the base root is the entries-optional
    variant and the `.1` sibling is entries-required. `62387-6` is "Interventions Narrative" in LOINC's
    long name and the IG labels the section "Interventions Provided"; `SectionInfo.title` is read
    **nowhere** in `src/` (a framed `CcdaSection.title` is the document's own `<title>`), so nothing
    matches on either string and neither was corrected into the other. **Do not re-add a CONF id or a
    LOINC release number here:** the first draft cited `CONF:1198-15378` for a `displayName`
    requirement and stamped the name "LOINC 2.82", an unverified release number that could not be
    checked from this repo (LOINC ships each February and August). Both were invented precision,
    nothing depends on them, and they were removed rather than re-guessed. **Every spec claim on this
    entry is stated, not traced**, which scopes to this entry only -- `required-sections.ts` cites
    CONF ids genuinely traced to the normative R2.1 Schematron, and nothing here licenses distrusting
    those. **The OID is this entry's only real behavioural risk and wants a second source before the
    next publish.**
    **Monotonicity, measured over thirteen section shapes by running the same matrix against base
    `src/` and against the change and diffing.** There are **FOUR** classes of move, and the first cut
    of this work claimed two, for two reasons worth remembering. The matrix filtered `said` to
    `SECTION_*` + `UNKNOWN_SECTION_CODE`, which structurally could not see `REQUIRED_SECTION_MISSING`;
    and the shape set had no double-stamped section. **A filtered projection cannot support a
    monotonicity claim** -- it only confirms the codes someone already thought of. The matrix now
    filters nothing. The four:
    (1) `UNKNOWN_SECTION_CODE` withdrawn where the section resolved to nothing else. **NOT "every
    document carrying `62387-6`"** -- one stamped with a second recognized root was already silent,
    because `recognize()` returns on the first matching `templateId` and never reaches the code
    branch. That universal was published once and is false.
    (2) `SECTION_MATCHED_BY_LOINC_FALLBACK` **stands down** on a section carrying this `templateId`
    under another section's `<code>`, because the sentence it asserts ("no recognized templateId,
    matched on the code") became false about that document; a subject correction rather than a lost
    signal, and the reading it replaces framed an Interventions Section as the patient's Problems list.
    (3) **The same document gains `REQUIRED_SECTION_MISSING(problems)`**, because
    `validateRequiredSections` builds `presentKeys` from the catalog `key`. Safety-critical and
    unquietable, so the document gets louder, and this is the compensating signal that makes (2) sound
    rather than a trade.
    (4) **Recognition flips on a double-stamped section, and document order decides.** Row 8 moves
    `planOfTreatment` -> `interventions`; the same two roots in the other order do not move. Inherent
    to first-match recognition, not silent, and no clinical fact is lost because `extractClinical` runs
    every extractor regardless of `key`. Both orders are pinned so reordering `SECTION_CATALOG` cannot
    change it unnoticed.
    Recognizing the section did **not** change what `getPlannedItems()` returns or reach `…22.4.130` /
    `…22.4.131`; those stay pinned as unreached.

## The translation-only precondition is each arm's lead code

  - **`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s precondition is each arm's LEAD `<code>`, and the
    message now says so.** It used to open "No manufacturedProduct arm asserts a primary `@code`" and
    call the translation the _only_ place the product was named. Both are false on an arm whose
    **second** `<code>` asserts a primary, which selection never reads (`armLeadCodes`) and which
    `MEDICATION_PRODUCT_CODE_REPEATED` reports beside it. `CCDA-ARM-MULTI-CODE` improved the
    disclosure and deliberately left the clause; it is narrowed now. A safety-critical warning that
    misdescribes the document it is about is the same defect as one that points at a coding that is
    not there.

## No warning or fatal factory takes a value parameter

  - **No warning or fatal factory takes a value parameter, and no message interpolates one**
    (`PHI-WARNING-MESSAGE-LEAK`). Every string comes whole from `WARNING_MESSAGES` /
    `FATAL_MESSAGES`; the handful of codes that name a token take a **closed-set key** the parser
    owns (a `CodeSlot`, a `NarrativeSlot`, a catalog section key, a v3 datatype, a boolean) which
    selects a frozen variant generated at module load. **Do not add a parameter carrying document
    text back to any factory, and do not add a `snippet`-style raw field, not even opt-in.** The
    claim this replaced ("every message string is PHI-free by construction, factories interpolate
    only structural values") was false in thirteen factories plus the `NOT_A_CLINICAL_DOCUMENT`
    fatal: a 500,000-byte `templateId` root produced a 500,106-byte `.message` on the published
    `0.0.4`. A sender controls a "structural" attribute exactly as it controls a clinical one, so
    **the bound is the absence of the parameter, not the good behaviour of the caller.**
    `test/phi-diagnostic-surface.test.ts` pins both halves: a 26-slot table driven by
    `assertNoDiagnosticPhiLeak` (`@cosyte/test-utils`, **pinned `^0.0.2`; a caret on a `0.0.x`
    resolves EXACTLY, so `^0.0.1` silently tests against a kit that has no such runner**), and a
    tripwire asserting every emitted `message` is a member of the frozen registry. It was run
    against base first and **20 of the 29 slots were red**.

## The PHI bound is applied at the model as well

  - **The bound is applied at the MODEL as well, and that is the load-bearing half.** `hl7` bounded
    its messages, verified green, and `deid` still leaked because `Segment.type` stayed unbounded on
    the model. So `src/parser/tokens.ts` (shape tests for a UID / version stamp / LOINC / media
    type, membership tests for an element name / v3 datatype name / media type / `ED.representation`)
    is applied to `position.path`, `position.sectionCode`, `position.templateId`,
    `CcdaDocument.templateIds`, `CcdaSection.templateIds`, `unsupported.xsiType` and
    `ED.mediaType`/`representation`/`nullFlavor`.
    Recognition cannot move: every catalog OID and version stamp passes its shape.
    **Bound EVERY field of a `templateId`, not the two that look like locators.** The first cut
    bounded `root` and `extension` and spread the rest through, leaving `assigningAuthorityName`
    (free text, no shape at all) and `nullFlavor` verbatim on the element the model presents as a
    structural identifier, and the guard could not see it because `modelIdentifiers` swept only the
    same two. **The swept set and the leaking set were disjoint, which is the exact defect the
    deleted `phi-guard.test.ts` had.** When you add a bound, extend the sweep in the same edit.
    **The membership lists are STATED, not traced.** This repo holds no
    `datatypes-base.xsd`, so `V3_DATATYPE_NAMES` is written from the v3 ITS naming convention and
    is incomplete on purpose; `THUMBNAIL` and `EIVL_event` were dropped rather than guessed at.
    Adding a name is cheap and safe. Inventing one is the invented-precision failure this repo has
    been burned by, and a missing name only ever costs a `<withheld>`.
    **A shape test is not automatically a bound, either.** `ED.mediaType` was bounded by
    `/^[a-zA-Z]{1,20}\/[a-zA-Z0-9.+-]{1,40}$/`, which admits
    `text/Doe-Jane-1980.01.01-MRN0012345`; the marker carries no `/`, so the slot probing it only
    ever exercised the reject branch. It is membership now. **Probe the ACCEPT branch of every
    shape test, or the slot proves nothing.**
    **"A conforming document is untouched" is FALSE as an absolute** and must not be restored: the
    membership lists are hand-assembled, so a legitimate but unlisted `xsi:type` or media type reads
    `<withheld>` where `0.0.4` read the token. Membership over-withholds by design, which costs
    diagnostic detail rather than data.
    **Two things are deliberately NOT bounded and must stay that way.** An `II.extension` outside a
    `templateId` is an MRN or accession number, the identifier the model exists to report, so
    withholding it deletes clinical data rather than declining to echo a locator. And
    `CcdaSection.narrativeById`'s keys are what `<reference value="#id">` resolves against, so
    collapsing two unrecognized anchors onto one `<withheld>` key would resolve a broken reference
    onto **unrelated narrative**, a clinical-safety regression worse than the leak. The
    broken-reference warning stopped naming the id instead.

## Where the unknown-namespace-prefix warning is raised

  - **`UNKNOWN_NAMESPACE_PREFIX` is wired up (`CCDA-DEAD-DIAGNOSTICS`), and WHERE is the whole
    lesson.** It was declared, exported and constructed by nothing through `0.0.4`. It stayed
    invisible for a structural reason rather than by oversight: every child lookup in
    `src/model/dom.ts` is scoped to `urn:hl7-org:v3`, so **no navigation step in the model layer can
    ever meet a foreign element**, and no amount of care in the model layer would have found one. It
    is raised from `enforceStructureLimits` in `src/parser/secure-xml.ts` because the depth /
    node-count walk is the package's **only exhaustive traversal**; the sweep rides on it and costs
    no second pass. If you ever add a diagnostic about a node this parser does not navigate, that
    walk is where it goes.
    **It is REPLAYED after the model is built, never emitted where it is found, and this is the part
    that was got wrong first and must not be undone.** The walk runs before the root gate and before
    any clinical parsing, and under `{ strict: true }` the emitter escalates the FIRST warning it is
    handed. The first cut emitted in place, and the conformance gate measured two consequences
    against base: a non-C-CDA payload threw `UNKNOWN_NAMESPACE_PREFIX` instead of
    `NOT_A_CLINICAL_DOCUMENT`, and a C-CDA carrying a foreign vendor block plus a real defect threw
    it instead of the **safety-critical** `MISSING_CODE_SYSTEM`. A namespace deviation is a statement
    about the whole document and must never take a fatal's or a safety-critical code's place.
    `test/dead-diagnostics-matrix.test.ts` pins both. The cost is stated rather than hidden: in
    lenient mode these land LAST on `doc.warnings`, so `OnWarningCallback` documents **emission**
    order, not discovery order.
    **The skip-the-root guard that the first cut used does NOT work and was removed.** A foreign
    root's children are in the same foreign namespace, so skipping depth 1 changed nothing for any
    document with a body, and the test pinning it used a CHILDLESS `<Bundle/>`, which passes whatever
    the code does. That is the "a probe that cannot fail proves nothing" rule, broken inside the
    slice that quotes it. Both replacement fixtures carry children on purpose.
    **Once per distinct foreign namespace, not once per node. That bounds the BENIGN case and is not
    a defence.** A vendor extension block is one deviation however many elements it spans, but a
    document declaring a distinct namespace on every element still yields one warning per element,
    bounded only by `maxNodeCount`, exactly like every other per-element warning here. Do not write
    it up as a hostile-input bound. An element with no namespace at all counts as foreign
    (`isRecognizedNamespace` reads a `null` URI that way) and is tracked by its own flag rather than
    a sentinel string key, so nothing a document can carry collides with it.
    **The position is the SHALLOWEST use of the namespace, not the first in document order**, because
    the walk is level-order (it enforces a depth cap; a depth-first version would be the recursion it
    exists to avoid). `line`/`column` locate the element the warning names exactly; they do not name
    the earliest such element.
    **The message text says what the code does, because the code NAME is historical.** It says
    `PREFIX`, but what is tested is the element's namespace, and an element in no namespace raises it
    with no prefix in sight. Renaming a stable code is a breaking change, so the frozen message was
    corrected instead.
    **Attributes are deliberately NOT swept either, and do not "finish the job" by adding them.** An
    unprefixed C-CDA attribute (`root`, `code`, `nullFlavor`) carries no namespace at all, and an
    `xmlns:` declaration lives in the namespace reserved for declarations, so an attribute sweep
    against the recognized set would flag **every attribute in a conforming document**.
    **The PHI slot it un-blocked is now a live probe.** `ClinicalDocument (foreign namespace prefix)`
    carried `expectCode: null` because no branch existed to reach; it names the code now. The marker
    is planted as the _prefix_, and neither the prefix nor the namespace URI reaches the warning (the
    message is registry-whole, the position carries the bounded element **local name**, so a foreign
    `<vnd:note>` positions as `<withheld>`). It was confirmed able to go **red** by injecting the
    prefix into the position and watching the runner fail, before reverting. Re-confirm that way if
    you touch the sweep: a probe that cannot fail proves nothing.

## What populates CcdaPosition templateId

  - **`CcdaPosition.templateId` is populated by THREE codes, and by nothing else**
    (`CCDA-DEAD-DIAGNOSTICS`). It was declared and set by nothing, so `toleranceApplies` could never
    satisfy a `QuirkTolerance` keyed on `templateId` and such a profile entry silently tolerated
    nothing. The three are `TEMPLATE_EXTENSION_ABSENT` (the matched document-type root) and
    `UNKNOWN_SECTION_CODE` / `SECTION_MATCHED_BY_LOINC_FALLBACK` (the section's first rooted
    `templateId`).
    **Two document-level codes carry none ON PURPOSE, and the second is the one to understand.**
    `MISSING_TEMPLATE_ID` has no template to name. `UNKNOWN_DOCUMENT_TEMPLATE` has too many: its
    subject is the templateId **set** naming no type, and the obvious pick, the first root in
    document order, is the **US Realm Header** stamp on essentially every real C-CDA. A first cut
    populated it that way; it was measured, seen to be a near-constant, and taken back out, because a
    `match` keyed on it would read like narrowing and tolerate the code on every document. **Filling
    a field because it can be filled is not the same as populating it, and do not "finish the job"
    by restoring it.** Naming the last root instead would be an invented ordering rule: C-CDA does
    not require the document-type stamp to follow the header.
    It is bounded **at the site that sets it**, on the v3 UID shape, exactly as
    `sectionCode` is bounded on the LOINC shape; the roots reaching those sites have already been
    through `boundTemplateId`, and re-bounding is idempotent and keeps the bound visible where the
    field is written.
    **`QuirkMatch` was overstating itself and now says which codes carry which field.** Its example
    was "deprecated LOINC only within Vital Signs", which has never worked and still does not:
    `DEPRECATED_LOINC` carries no `sectionCode` either, so that narrowing matched **nothing** rather
    than narrowing anything. A `match` on a field the warning does not carry is **inert, not broad**.
    `sectionCode` comes with the two section-recognition codes; `templateId` with those two plus the
    two document-type codes. No profile in `ccdaProfiles` uses `match` at all, so nothing shipped
    moved.
    **Still open, filed rather than smuggled in:** `defineCcdaProfile` accepts a `match` on a code
    that cannot carry the field, so an inert tolerance is documented rather than refused. Refusing it
    needs a code-to-position-field registry, which is exactly the kind of stated claim that outlives
    the code it describes.

## The v3 NullFlavor code system has seventeen concepts

  - **`NULL_FLAVORS` is the WHOLE v3 NullFlavor code system, seventeen concepts, and it was eight**
    (`CCDA-DEAD-DIAGNOSTICS`). Transcribed from the published HL7 Terminology `v3-NullFlavor` code
    system for `2.16.840.1.113883.5.1008` (`content: complete`, `caseSensitive: true`), not from
    memory, and that matters: the missing set was first written down as **seven** tokens and is
    **nine** (`INV`, `DER`, `NINF`, `PINF`, `UNC`, `NAVU`, `QS`, `TRC`, `NP`). A conforming
    `nullFlavor="PINF"` on a `PQ`, and the `nullFlavor="NP"` a real Plan of Treatment carries on a
    `<code>`, both drew a false `INVALID_NULL_FLAVOR`.
    **Widening did not weaken the PHI bound it carries, and that is the part to check if you touch
    it.** `boundTemplateId` and `parseEd` decide echo-vs-`<withheld>` by membership in this list. The
    bound is "a member of a closed set of literals this package owns", never a shape test, and it
    still is: the set is larger, is the same closed set the standard defines, and every entry is a
    fixed token, so nothing sender-controlled gained a path through. What changed is that a
    conforming token is echoed where it used to be withheld.
    **`NP` carries `status: retired` in the published code system and is admitted anyway**, because
    it **is** a concept of the system and `INVALID_NULL_FLAVOR` asserts that a token is not one.
    There is no deprecation signal for `nullFlavor` to say anything narrower with, and inventing one
    was out of scope. **`smartScorecard` stopped citing `"UNC" for "UNK"` as a malformed token**:
    `UNC` ("un-encoded") is a real concept and no longer draws the warning at all. The tolerance
    itself is unchanged.
    **Monotonicity for all three parts, MEASURED against base `src/` in BOTH MODES and not argued.**
    A 51-row matrix (recognition shapes, namespace shapes including a foreign root and a foreign
    block beside a safety-critical defect, and all seventeen NullFlavor concepts plus the controls
    `NOPE` and lower-case `unk`, each planted on a header `<administrativeGenderCode>` and on a
    medication `<doseQuantity>`) run against the previous tree and against the change, diffed:
    **25 identical**, **8 pure gain** (five gaining `UNKNOWN_NAMESPACE_PREFIX`, three gaining a
    `position.templateId` on an unchanged code), and **18 going from `INVALID_NULL_FLAVOR` to silent
    on that code**. That last class is
    warned-to-quieter and is the one to justify rather than wave at: each of those documents names a
    real concept of the code system, so the withdrawn warning was a false positive,
    `INVALID_NULL_FLAVOR` is **not** in `SAFETY_CRITICAL_CODES`, and no row loses any other code.
    Both controls hold: `NOPE` still draws it and so does lower-case `unk`, because the code system
    is `caseSensitive`.
    **THE STRICT COLUMN MOVES ON 22 OF THE 51 ROWS, AND THAT IS THE INTENDED EFFECT. Do not "fix" it
    back.** Four rows begin throwing `UNKNOWN_NAMESPACE_PREFIX` where base threw nothing, and
    eighteen stop throwing a false `INVALID_NULL_FLAVOR`; both classes are the same rows already
    counted in the 8-gain and 18-withdrawn buckets, not movement beyond them. An earlier draft of
    this entry claimed the strict column was identical on every row, which is false and would have
    read as a regression to anyone who measured it. The invariants that **do** hold on every row,
    and that the test asserts rather than leaving to a snapshot, are that **no row's strict outcome
    moved independently of its lenient one** and **no row's strict outcome is a namespace code where
    base threw a fatal or a safety-critical one**.
    **THE FIRST MEASUREMENT HAD NO STRICT COLUMN, AND THAT IS WHY IT PASSED A BROKEN SLICE.** It was
    a lenient-mode projection, and both real defects lived only in strict mode. `documentation`
    already records that a filtered projection cannot support a monotonicity claim; this repo learned
    it again, in the slice that cites the rule.
    **What is COMMITTED is the 32-row subset of that planting, not all 51 rows.**
    `test/dead-diagnostics-matrix.test.ts` runs both modes and filters nothing, but it holds the
    thirteen recognition and namespace shapes plus the nineteen NullFlavor tokens planted on
    `<administrativeGenderCode>` only; the `<doseQuantity>` half is still a hand-run and is not in
    the file. So **re-running that file against the previous tree gives 32 rows, 15 identical, 8
    pure gain and 9 withdrawn**, with the strict column moving on 13 -- the 51-row totals less the
    `<doseQuantity>` twins, each of which moved identically to its `<administrativeGenderCode>`
    counterpart. Expect the 32-row numbers from the file and the 51-row numbers only from the wider
    hand-run; do not read either set as evidence that the other was wrong. **If you touch
    `NULL_FLAVORS`, the sweep, or `position.templateId` again, re-run that file against the previous
    tree and diff before you update its snapshot; the list is public surface and a published version
    never moves backwards.**

## The safety-critical codes export is a frozen view

  - `SAFETY_CRITICAL_CODES` is a frozen read-only view, not a `Set` instance: every read operation
    works (including spread), but `instanceof Set` is `false`.

## The required-section SHALL tables and their provenance

  - **Six of the twelve** required-section (SHALL) tables in `src/parser/required-sections.ts`
    assert nothing (Consultation Note, Progress Note, Procedure Note, Operative Note, Diagnostic
    Imaging Report, Unstructured Document). Empty means "no unconditional in-catalog SHALL section
    is asserted yet", never "this type has no requirements". Per-type provenance varies: the
    Referral Note's set is traced to the normative R2.1 Schematron (CONF:1198-30925 and the
    SHOULD-not-SHALL exclusions beside it, see the comment at `required-sections.ts:44`), while the
    others are asserted conservatively without that end-to-end tracing. Do not broaden or narrow an
    untraced set without the Schematron in hand.

## What editCcda covers

  - `editCcda` covers **twelve single-list section kinds**. Functional Status and Mental Status are
    **buildable but not editable** (each is assembled from three separate content lists), as are the
    Referral Note's narrative-only Assessment and Reason for Referral sections. There is no
    entry-level append and no section removal.

## A built document's conformance is expected, not proven

  - A built document round-trips through `parseCcda` with zero warnings, but its conformance was
    grounded against the raw C-CDA R2.1 IG text, not a validator run: it is **expected but not
    proven** to pass an external IG validator.

## The XML-parser dependency, ratified

- **XML-parser dependency: ratified (one-way door).** C-CDA is XML, and the shared standard permits an
  XML-parser runtime dep for `ccda`/`ncpdp` **per an ADR**. `docs/adr/0001-xml-parser.md` is
  **Accepted**: `@xmldom/xmldom` (exact-pinned, **1 of the ≤ 3** runtime-dep cap), chosen for faithful
  DOM round-trip + a hardenable (XXE-safe) posture. The parse layer configures and consumes
  it; do **not** add a _second_ XML library. Reuse this one (and coordinate `@cosyte/ncpdp` onto the
  same substrate).

## The public-surface gate

- **Public-surface gate present and reporting, but NOT yet blocking** (`PUBLIC-SURFACE-HYGIENE`).
  `scripts/check-no-internal-refs.sh` (`pnpm check:no-internal-refs`) plus
  `.github/workflows/no-internal-refs.yml` enforce the founder directive of 2026-07-27: no internal
  project bookkeeping on a surface a consumer reads. It is **on the meta-repo's `verify.sh` ladder**,
  so it runs locally before a push. Same not-a-required-check gap as the em-dash gate below: the
  context `Public-surface gate / no-internal-refs` is not in `parser-ci-required-checks`, so it is
  visible on every PR and blocks nothing. Closing it is a ruleset change, not a file change.
  - **Ported from `ncpdp`'s copy, NOT `hl7`'s**, and re-port from `ncpdp` or later if you ever
    resync. `hl7`'s lacks the `src/` string-literal fourth pass, the plural `phases?` stem and `/`
    in the ADR separator class; this repo needed all three. **Rule 7 (prose roadmap citation) comes
    from `cli`** and is the highest-yield rule here, because this repo cites the roadmap in prose and
    never by path, which the path-keyed rule 5 cannot see. A "resync with hl7" that restores
    `RULE_COUNT=6` deletes it; the script refuses to run if that happens.
  - **The recorded backlog for this item was `1`. Running the gate against base `2a32309` reported
    67 hits**: 2 on the public markdown surface and **65 in `src/` doc comments** (over 61 distinct
    locations), which compile into both declaration files. The string-literal pass found 0 by rule;
    the one real string defect was a by-hand catch. A count taken from the markdown alone
    under-counts by roughly 30:1 here. **Measure the doc comments first, and quote a count with the
    tree it was taken on.**
  - **Two of those doc comments were factually FALSE**, not merely internal (`CcdaDocument` and
    `model/types/bl.ts` both claimed clinical entry extraction had not shipped), and a runtime error
    message told a caller to wait for a builder that already existed. Stale bookkeeping misdescribes
    the software; that is the argument for the gate, not tidiness.
  - **The prefix list, designation exclusions, phase guards and self-test samples are re-derived for
    C-CDA and must not be inherited wholesale.** A naive `WORD-N` rule matches 21 distinct tokens on
    the scanned markdown surface. Across markdown plus `src/` it matches 30, of which 27 are the
    reader's reference material (`ICD-10-CM`, `CPT-4`, `PHQ-9`, `UTF-8`, `TOP-LEVEL`, the synthetic
    `MRN-*`/`DOC-*`/`SYNTH-9` example ids) and only 3 are ours, all `CCDA-` prefixed. That ratio is
    the whole argument for keying on prefixes. The reasoning for every divergence is in the script
    header; read it before editing a pattern.
  - **`CHANGELOG.md` is exempt org-wide** (founder, 2026-07-29). Do not re-litigate it, do not sweep
    it. The exemption is that file and nothing else.
  - **Known residual:** `//` line comments are out of scope by convention and five are live. They
    reach `dist/index.mjs` but are not what a consumer is shown.

## The em-dash gate

- **Em-dash gate present and reporting, but NOT yet blocking.** `scripts/check-no-emdash.sh`
  (`pnpm check:no-emdash`) plus `.github/workflows/no-emdash.yml` check the founder directive banning
  `U+2014` outright (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever."). Read the
  limit first, because "armed" would be the wrong word: **the job is not a required status check**,
  so it does not stop a merge today. Verified against the API: `cosyte/ccda` is governed by two
  org-level rulesets, and `parser-ci-required-checks` requires exactly
  `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)` and `ci / actionlint`. This
  job's context, `Em-dash gate / no-emdash`, is not among them, and `allow_auto_merge` is on with
  zero required approvals, so a PR carrying a live character can auto-merge while this job is red.
  **Closing it is a GitHub settings change, not a file change** (there is nothing to edit in any
  repo, and in particular not in `cosyte/.github`, which defines no ruleset). Rulesets stack, so
  either route works: add the context to the org ruleset `parser-ci-required-checks`, which covers
  `hl7`/`x12`/`ncpdp`/`dicom`/`mllp`/`ccda` at once but needs `admin:org`; or add a
  repository-level ruleset here, which is what `pathways`, `docs`, `website` and `iac` already do.
  Deliberately not attempted from a slice that ships files. `hl7`, `x12`, `ncpdp`, `dicom` and
  `mllp` sit behind the same gap. (`fhir` had no ruleset or branch protection at all when this
  was written; a repository-level one was added 2026-07-27.) So the
  true claim is that a violation is **visible on every PR**, not that it is impossible. It scans
  **both** halves the
  rule covers: every tracked file **except the script itself**, **and** the PR title, body, and
  commit messages. The script is self-excluded because it has to name the encodings it bans, so it
  is the one file nothing checks; keep it free of the literal character. The workflow uses the
  non-default `edited` trigger so retitling a PR re-checks it. What lands here was read, not
  assumed: only squash merge is allowed, with `squash_merge_commit_title: COMMIT_OR_PR_TITLE` and
  `squash_merge_commit_message: COMMIT_MESSAGES`, so the subject comes from the PR title and the
  body comes from the branch commit messages. **The PR body does not land**; it is scanned anyway,
  because it is a cosyte surface in its own right. When the gate goes red the fix is never to
  re-encode the character: rewrite with a period, colon, comma, or parentheses.
  - **It is the text-only script variant, and dropping `grep -I` is the load-bearing part here.**
    `src/profiles/merge.ts` uses two raw NULs as the separator in `toleranceKey`'s composite key.
    The byte is the feature and cannot be removed, so grep classifies that file as binary. Under
    `-I`, or under `website`'s NUL-partition variant, it would be **silently exempt** from a ban
    that has no exceptions. Without `-I` it is a loud red instead: a match in it lands on stderr and
    trips `refuse_if_incomplete`. That is not theoretical. PR #52's "remove em dashes from source +
    config" sweep skipped this exact file for this exact reason and left a live character behind,
    which this gate caught on its first run.
  - **Do not swap in `website`'s variant** (it would re-make that exemption on purpose), and do not
    reach for `pathways`' preferred `git check-attr binary` partition without first adding a
    `.gitattributes`, which is deferred to the cross-repo "what is a text file" rule.
  - Known limits are written down in the script header, and the fix for each is cross-repo rather
    than local, so do not patch one here. **Which copies share which limit is not uniform**, and the
    header is the precise statement. **Do not trust a copy count written down anywhere, including
    here.** The fleet grows every time a repo is ported, and a count in a comment is stale the day
    after it is written, which is the same failure this gate exists to refuse. Enumerate at
    carry-back time: `ls */scripts/check-no-emdash.sh` from the meta-repo, and remember `crew`
    vendors `knowledgebase`'s copy under `knowledgebase/scripts/`, so it goes stale silently. What
    is durable is which shapes differ, and that is worth knowing before carrying anything: `docs`
    is the weakest (one line, no `-z`/`-0`/`-r`/`--`/`-e`, and both `-I` and `-d skip`);
    `pathways` partitions on `git check-attr binary`; `website` and `mllp` partition on the NUL
    byte; the rest are the text-only shape, of which only `ncpdp`, `dicom` and this one carry the
    `sed -z` stage. That last point matters for the residuals: the encoded-form and
    contents-not-names gaps are in every copy, the `sed` half of the stderr residual is only in
    those three, and the NUL-classification residual does not apply to `pathways` at all. The
    pipeline code in this copy is byte-identical to `ncpdp`'s on purpose: a divergent variant is
    worse than a known shared limit.
  - Scope, stated honestly: the gate covers new text only. It does not rewrite history, and 113 em
    dashes are already in commit messages on `main`, PR #52's subject line among them.

## The attw wrapper script

- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI** (`ATTW-FALSE-GREEN-PORT`). `getExitCode.js` in this repo's pinned
  `@arethetypeswrong/cli@0.18.4` opens with `if (!analysis.types) return 0`. An untyped package is a
  legitimate npm package, so "no types at all" is a description, not a problem, and the problem list
  is never consulted. No `--profile`, `--ignore-rules` or config setting reaches that early return.
  For a package that ships types it means the declarations were **not in the tarball**, which is a
  broken publish reported as a pass. A false red costs an hour; **a false green merges.**
  **The race only supplies the condition; it is not the defect.** Reproduced here deterministically,
  with zero concurrency, against this package's own `dist/`: `rm -rf dist && attw --pack .`, and
  `rm -f dist/index.d.ts dist/index.d.cts && attw --pack .`, both print the sentence and exit 0. The
  second is the realistic window. `tsup` emits JS in one pass and declarations in a later one, so
  **every** build here has an interval where `dist/` holds `.mjs`/`.cjs` and no `.d.ts`; measured on
  three consecutive `pnpm build` runs at 1.7 s, 2.4 s and 3.1 s. **Do not quote one of those as the
  figure**: they differ by 80% and move with box load. A concurrent build or `clean` in the same
  working tree lands `attw` in it. So the answer is **not** a lock, a lease or a build queue: the
  gate must be able to say its own inputs were missing, whatever removed them.
  `scripts/attw.mjs` carries **two nets, and they catch different things**: a preflight that every
  relative path `package.json` promises (`main`, `module`, `types`, `typings`, every string leaf of
  `exports`, which here is four files) exists and is non-empty, which catches the window and _names
  the missing file_; and a post-check on `attw`'s untyped sentence, which catches what the preflight
  structurally cannot, declarations present on disk but excluded from the tarball.
  **No instance of that second case is on record in this repo**, and it is still the case
  `attw --pack` exists to catch. Demonstrated rather than assumed: with the declarations on disk and
  `files` narrowed to the two JS entry points, bare `attw --pack .` prints the sentence and exits 0
  and the wrapper exits 1.
  **The preflight's non-emptiness half earns its keep separately.** A zero-byte `index.d.ts` is a
  SECOND and quieter false green: `attw` finds a types entry point, reports "No problems found" and
  exits 0 over a package that declares nothing. The post-check cannot see it, because the untyped
  sentence never appears. Pinned.
  **`.npmignore` VERSUS `files` IS ABOUT THE FILE'S DEPTH, NOT ITS EXISTENCE, and a draft of this
  entry got it wrong in the confident direction.** Both measured with `npm pack` on this manifest: a
  **root** `.npmignore` naming the declarations changes nothing, because `files` is present and npm
  gives it precedence; a **`dist/.npmignore`** naming them DOES strip them, because a `.npmignore`
  inside a directory `files` selected still filters that directory. The draft said `files` was the
  only route and told the next reader not to restore the parenthetical, which would have made the
  error durable. Net 2 catches both either way: it reads what `attw` says about the packed tarball
  rather than reasoning about how the tarball was assembled.
  **The post-check reads a string, so what would hide that string is refused**, not tolerated.
  **Nine routes were measured** against this repo's pinned `attw`, each handing back exit 0 over an
  untyped pack with the sentence absent: `--quiet`, `-q`, `--format json`, `--format=json`,
  `-f json`, **`-fjson`**, **`-Pq`**, and a `.attw.json` setting `quiet` or `format` (`readConfig()`
  applies it after argv). Two more are refused **without** being blinding routes, because the rule is
  by option name and not by value: `--config-path` (by inference, not measurement, it would move the
  config file out of view) and `-f=json` (measured: bare `attw` exits 1 with
  `argument '=json' is invalid`). The refusal is **by option name, wholesale, not by value**, which
  is the deliberate trade against value-parsing them.
  **`-fjson` IS THE ONE THE SIBLING'S GUARD MISSES, and it is why the refusal reads a short
  cluster's LETTERS rather than comparing whole tokens.** commander parses `-fjson` as `-f json`, so
  a `split("=")[0]` token test lets it straight through. The first cut of this port carried that test
  over unchanged while claiming refusal "by option name, wholesale"; the conformance gate measured
  `-fjson` back to **exit 0 on this repo's real manifest**. The claim was true of the sentence and
  false of the code, and the fix was to close the hole rather than soften the claim to match it.
  Over-strictness is bounded rather than hand-waved: of attw 0.18.4's six short options (`-V`, `-P`,
  `-p`, `-f`, `-q`, `-h`) **only `-f` takes a value**, so a `q` or an `f` inside a single-dash token
  is either one of these options or part of `-f`'s own value, and there is no third thing for it to
  be. A test pins that `-P` is still let through.
  **THERE IS A THIRD GUARD BEHIND THE TWO NETS, so do not describe the file as "two nets" full
  stop.** If `attw` exits 0 having printed nothing at all, the script fails rather than passes: the
  post-check read nothing and cannot vouch for what it did not see. It is the backstop for an
  unenumerated blinding route, and it is what would catch `-Pq` if the argument refusal did not.
  **It is pinned by no test**, which is a stated gap rather than an oversight: reaching it needs an
  `attw` that exits 0 in silence, and no measured route does that with the refusals in place. One
  smaller gap is stated the same way: the pass-through test cannot tell `attw`'s own status from a
  hardcoded `1`, because `getExitCode()` returns literally `1` on problems and every `die()` here
  also exits 1, so pass-through is true by inspection rather than by that assertion.
  **This guard is described in four committed files, and that is the standing hazard in this entry.**
  Three separate corrections here have been a claim edited in some copies and not others. If you
  touch this area, prefer **cutting a copy** to adding a more careful one.
  `test/scripts/attw-gate.test.ts` pins both nets against the real binary, including the upstream
  exit-0 itself, so an `attw` upgrade that reworks the wording or fixes the exit code reds the suite
  instead of letting the net go quietly slack. It also pins a **negative control** on a well-formed
  package and that a real `attw` failure still fails: a gate that only ever fails is not a gate, and
  one that swallows the status is not one either. **The suite is load-bearing, measured rather than
  asserted**: reverting `scripts/attw.mjs` to the bare invocation reds **16 of its 21** cases, and
  the 5 that stay green are exactly the pass-through ones (three pins on `attw`'s OWN behaviour, the
  real failure, and the negative control). Re-measure that figure if you add a case; do not carry it
  forward. **`scripts/verify.sh` in the meta-repo needed no change and
  must not be touched** for this: its propagation was never at fault, the step lied to it.
  **This is a per-repo script.** Porting it here fixed this repo only; a sibling that still invokes
  the CLI directly still has the defect. Do not write a repo count down here, derive it.

## The agent-notes contract gate

`CLAUDE-MD-AUDIT` (2026-08-04) split this file out of `CLAUDE.md` and nothing checked the result.
Both halves state the same promise in their own words: `CLAUDE.md` says every trap is "a one-line
imperative with a pointer into it", and this file's preamble says every trap "still has a one-line
imperative in `CLAUDE.md` pointing at the section below that carries its reasoning". A heading
reworded here silently strands every pointer at it. Neither file gets a compile error, and a worker
who follows a dead pointer gets the imperative with none of the reasoning, which is the exact
failure the split was supposed to be safe against: the preamble above says a summary of one of these
lessons is not a substitute for it. `scripts/check-agent-notes-contract.mjs` and
`test/scripts/agent-notes-contract.test.ts` close it.

**The gate is scoped to this repo on purpose, and calling it universal would have been an
overclaim.** The split landed across the fleet, but the contract did not: measured over the
meta-repo's submodules on 2026-08-06, **`config`, `hl7` and `workflow` have no
`documentation/agent-notes.md` at all** (nor do the non-package repos `crew` and `knowledgebase`).
A gate asserting "every cosyte repo carries one" is a universal that three package repos already
break. What this one asserts is what `ccda` itself promises, which is also why it lives in this
repo's CI and costs the meta-repo's capped automation plane nothing. **Do not promote it to an
umbrella script**, and do not restate it as a fleet rule.

**Unlike the public-surface gate and the em-dash gate, this one BLOCKS, and that was the point of
where it was put.** Both of those live in their own workflow whose context is not in
`parser-ci-required-checks`, so they report and stop nothing. Read from the GitHub API on
2026-08-06, that ruleset requires `ci / verify (22, ubuntu-latest)`, `ci / verify (24,
ubuntu-latest)` and `ci / actionlint`, and the `no-emdash` context comes from a separate
repository-level ruleset. A check that runs inside the test suite is therefore inside a required
context. Putting this one in a fourth workflow would have added a third thing that reports and
blocks nothing. `pnpm check:agent-notes` runs it standalone; the meta-repo's `verify.sh` has a fixed
`LADDER` that does not name it, so it prints "gate-shaped script(s) this ladder does not know ... a
green verify.sh therefore means LESS than a green CI". **That warning is correct in general and
misleading here, and `verify.sh` must not be touched over it**: the ladder does not invoke the
script by name, but it runs `test:coverage`, which runs the test that runs the script. The gate is
in both, and a LADDER entry would spend a meta-repo edit to run it a second time.

**Two pointer forms are live, measured rather than assumed, and the shape-based one is held
narrow.** The path form, `agent-notes.md` plus `#anchor`, occurs 30 times, all in `CLAUDE.md`, and
is scanned in **every** tracked text file so no root has to be declared. A bare backticked
`` `#anchor` `` occurs once, in `CLAUDE.md`, on the line cross-referencing the planned-templates
section. **A guard matching only the path form is GREEN while that bare pointer is broken**, and
that bypass is reproduced end to end in the test rather than argued: the same fixture reds with the
bare pointer and greens with it deleted and nothing else changed. This is the `ncpdp#64` shape,
where a guard failing to catch something is an overclaim and not merely a gap.

**Do not widen the bare form.** Measured over every tracked text file here, a bare `` `#...` `` also
matches `` `#id` `` in TypeScript sources and `` `#62` `` in tests and in this file: those are XML
id references and C-CDA narrative `<reference value="#62"/>` targets, which is exactly the reference
material this parser exists to talk about, and is the same class as the `PID-3` / `SCH-11` false
positives that a shape rule destroys in a release body. Requiring three hyphen-joined lowercase runs
excludes them by shape; confining the form to `CLAUDE.md` excludes them by scope. **A bare anchor in
any other file is deliberately not a pointer**, and that is a stated limit rather than a claim.

**The corpus is `git ls-files`, reconciled, because a check can print green over a corpus it never
opened and no denominator detects it** (a count counts the roots that DID exist). Every tracked path
is opened, skipped as binary, or the run refuses; the three numbers must sum to what git reported.
**A tracked file missing from the worktree is a refusal, not a silent skip** - existence is not
observation, and a gate cannot claim to cover a file it could not read. Both files the contract is
about must be among what was actually opened, so a phantom path cannot yield green. **Finding zero
pointers is also a refusal**, on the same logic as `scripts/attw.mjs`'s backstop for a tool that
exits 0 having printed nothing: an empty result set is indistinguishable from a clean run by any
count. Refusals exit **2**, distinct from a contract violation's **1**.

**The heading recogniser fails in both directions and both are pinned.** Three leading spaces and a
setext underline are real headings that `/^#{1,6} /` misses, which is a **false red** on a pointer
that is fine; a `#` inside a fenced code block is **not** a heading, and counting it is a **false
green** on a pointer that resolves to nothing. GitHub's `-1` / `-2` duplicate suffixing is
reproduced, because a duplicate slug otherwise resolves a pointer to the wrong section rather than
to none. **A heading carrying a non-ASCII character is refused rather than guessed at**: the
slugifier reproduces GitHub's ASCII behaviour only.

**Emptiness is checked with its negative control.** A heading with no body of its own is legitimate
when the next heading is deeper, i.e. it is a container for its subsections; anything else is a
pointer that resolves to nothing. A gate that only ever fails is not a gate, so the container case
is pinned green.

**There is no exclusion list, and one hazard follows from that: do not write a pointer into a
changeset summary.** The summary becomes the `CHANGELOG.md` entry, `CHANGELOG.md` is tracked, and
the scan covers every tracked text file, so a pointer archived there freezes the heading it names
forever: renaming that section later reds the gate on a published record nobody may hand-edit.
Today `CHANGELOG.md` carries none, so excluding it would buy nothing and would cost the property
that makes the corpus trustworthy, which is that every tracked path is accounted for and no skip can
quietly go phantom. Reference the section by title in a changeset, never by anchor.

**What a green run does NOT say**, because more will be read into it otherwise: nothing about any
other repo; nothing about whether every trap in `CLAUDE.md` has a pointer, since recognising "a
trap" is a judgement about prose and a guard that tried would be the universal-shaped overclaim this
file avoids; nothing about whether a section's prose is accurate, current, or whether the trap it
describes is closed (**a pointer is not a closure**); nothing about unreferenced sections, which are
legitimate; and nothing about any other link in the repo, because this is not a link checker.

**No corpus figure is written down here, deliberately.** The gate prints tracked / read / binary,
heading and pointer counts on every run, all of them move with the repo, and this file already
carries the lesson that a numeral which goes stale fast is the failure class the audit exists to
fix. **Re-run it; do not quote it.** The contract was already intact when the gate was written, so
**this closed no live break** - eighteen cases carry it, and the red-before evidence is each defect
class reproduced against a real fixture, not a count of existing failures.

**The corpus is `git ls-files`, so an UNSTAGED new file is not in it.** A green run in a dirty
working tree therefore says less than the same run in CI, which always sees a committed tree. This
is not hypothetical: the gate's own script sat untracked while its eighteen cases passed, and the
first run after `git add` immediately red on a literal pointer inside the script's own header
comment. **The script needs no self-exemption** and builds its own pointer pattern from the path
constant at run time, so it never writes the path and a `#` adjacently; that comment was the one
place it did, and the gate caught it rather than a reviewer. The em-dash gate next door does need a
self-exemption, and that exemption has already cost this repo an escape.

**`documentation/agent-notes.md` is NOT under this repo's Prettier globs and must not be run through
it.** `format` and `format:check` cover `src/**/*.{ts,md}` and root `*.{json,md,yml}` only. Running
Prettier over this file by hand reflows all of it: measured here, 1,385 lines changed for a
three-paragraph append, which buries the real edit and churns a file whose whole premise is that the
relocation was verbatim. Append by hand at the existing wrap.
