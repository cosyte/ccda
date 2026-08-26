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

## A narrative label is refused, never fabricated

  - **The Allergies section rendered a positively-asserted allergy as the narrative "No known
    allergies", and it shipped in `0.0.11`.** `allergiesSection` computed its narrative as
    `label ?? "No known allergies"`, where `label` was
    `a.noKnownAllergy === true ? "No known allergies" : a.allergen?.displayName`. With an allergen
    carrying no `displayName` the `??` fired, so the emitted `<content>` was **byte-identical to the
    negated no-known-allergies form** while the entry beside it carried `<value code="419199007">`
    with **no `negationInd`**, the allergen on the `<participant>`, and the manifestation
    observation. The `<reference>` linkage was intact and `doc.warnings` was `[]`, so the attested
    narrative, the half a clinician reads, asserted the clinical opposite of its own entry with
    nothing anywhere saying so. Reproduced independently by both of `#99`'s refuter passes, then
    again on `0c4d67f` as the first act of the fix. `PRE-EXISTING`; a published version never moves
    backwards (ADR 0001), so `0.0.11` carries it permanently and this was fix-forward.
  - **The same root cause emitted the literal string `undefined` as narrative in the other seven
    bare-`displayName` slots** (problems, medications, immunizations, procedures, encounters, past
    medical history, plan of treatment), and, once the sweep was widened past the eight, as
    `"undefined: 1 kg"` in vital signs, `"undefined: x"` / `"Ok: undefined"` in results, and
    `"undefined: unknown"` in both assessment-scale slots. **SEVEN more slots fabricated a confident
    NEGATIVE instead of `undefined`**: smoking status read "Smoking status unknown", functional and
    mental status read "...: unknown" from BOTH their input paths (standalone and organizer-nested),
    and family history read "Relative" / "unknown condition", each beside an entry that did carry the
    code. Those seven are the same defect as the allergy one in a quieter register, and they were
    reachable because their `??` fallback keyed on the enclosing OPTIONAL field rather than on the
    label. **Twenty slots** (one inversion, seven bare `undefined`, five interpolated `undefined`,
    seven fabricated negatives), one root cause, measured as a matrix on `0c4d67f` and again after.
  - **THE REMEDY IS TO REFUSE, AND SUBSTITUTING A DIFFERENT CONFIDENT STRING WOULD HAVE REPRODUCED
    THE WHOLE DEFECT CLASS.** An empty string, a placeholder, the code rendered as English, all of
    them are a sentence the entry does not support; the shipped `?? "No known allergies"` was
    exactly such a substitution, one word smaller. A build-time **warning** was weighed against a
    refusal and rejected: a warning is fail-open, the document still exists and can be transmitted,
    and this repo has already written down (for `SYNTHETIC_SETID_PREFIX`) that **nothing forces a
    receiver to read a label**. `buildCcda` is the conservative-on-emit half of Postel's Law and
    already refuses seven other unsatisfiable inputs with a `TypeError`, one of which
    (`documentType`) exists solely as a runtime guard for untyped callers. So `narrativeLabel()`
    throws, and the `??` fallback was **deleted rather than repointed**: `NO_KNOWN_ALLERGY_NARRATIVE`
    is now reachable from the `noKnownAllergy === true` branch and no other, structurally, not only
    by guard.
  - **THE TYPE IS NOT THE GUARD.** `BuildCode.displayName` is a required `string`, so none of this is
    reachable from a typed caller, but the package ships JavaScript and does runtime validation
    elsewhere; closing this by tightening the type would have closed nothing. `narrativeLabel` widens
    the field to `unknown` before testing it, for the same reason `buildCcda`'s `documentType` guard
    widens to `string`.
  - **THE FIELD PATH IN THE MESSAGE IS A PARAMETER, NOT A CONSTANT, AND THAT COST A REFUTER
    FINDING.** One narrative shape can be reached from more than one input path: a functional or
    mental status finding arrives either standalone (`functionalStatus[]`) or nested in an organizer
    (`functionalStatusOrganizers[].findings[]`), and an assessment scale arrives under either the
    functional or the mental key. The first cut hard-coded the standalone path in the label helper,
    so a caller who used the organizer form got a refusal **naming a field they never set**. **If you
    add another way in to an existing narrative shape, thread the path from the new call site**; a
    diagnostic that misdescribes the input it refused is the same class of defect as a narrative that
    misdescribes its entry. The path always names a `BuildCcdaInit` field; an `editCcda` caller reads
    it as the content element of the section kind being edited, because an edit's `content` list is
    the same type as the builder key the path names.
  - **THE BOUND, STATED RATHER THAN OVERCLAIMED. Only NARRATIVE labels are guarded.** A `BuildCode`
    that reaches the entry alone (an allergy `type`, a result `interpretation`, a medication or
    vaccine `route`, a reaction, a severity, a criticality) is deliberately not routed through it:
    `@displayName` is optional on a v3 `CD`, so omitting the attribute states nothing false, and
    guarding it would refuse conformant input. **An ABSENT optional object keeps its fallback** ("no
    smoking status recorded" really is unknown); only an object that is PRESENT without a label is
    refused. Empty and whitespace-only labels are refused too, which is the one part of this
    reachable from TypeScript, on the argument that an empty attested narrative beside a coded entry
    loses the fact rather than states it.
  - **`editCcda` inherits the guard for free and that is not an accident to rely on silently.** It
    grafts sections with `buildSectionComponent`, the same emitter, so the second writer refuses on
    the same input; `#99` paid for the lesson that a check on one emitter is not a check on the
    document, so there is a test pinning the edit path rather than an assumption.
  - **HOW IT IS PINNED, because a probe that cannot fail proves nothing.** The invariant is read off
    the **emitted bytes** through the document's own `<reference>` linkage (`allergyNarrativePairs`
    resolves each Allergy-Intolerance Observation's `text/reference` to its `<content>` and pairs it
    with that observation's `negationInd`), so the narrative and the entry are graded together rather
    than separately, and an unresolvable reference throws rather than reading as agreement. It
    carries a **negative control**: a document this builder still accepts, with only the narrative
    sentence moved, must red the invariant. Twenty-two assertions were RED on `0c4d67f` and GREEN
    after (`22 failed | 3 passed` on base, `25 passed` at head, the three being the controls), and
    every refusal row has a labelled twin proving the fixture reaches the narrative branch rather
    than failing somewhere earlier.
  - **Two things deliberately left.** The `TypeError` in `observationValue` still interpolates
    `testCode.displayName`, so an unlabelled result code reads `result "undefined"` there;
    `resultObservation` computes the value BEFORE appending the narrative, so that message is the one
    a caller sees. It is a diagnostic rather than attested narrative, and reordering the two calls
    would change which error is raised. **`procedureEntry` is NOT a second instance and an earlier
    draft wrongly said it was**: `proceduresSection` calls `narrativeLabel` before `procedureEntry`
    in the same iteration, so its `procedure "undefined"` is unreachable. And the CCD SHALL-set
    disagreement
    between `build-ccda.ts` and `required-sections.ts` is untouched and still blocked on the
    normative R2.1 Schematron. **SETTLED 2026-08-10, the Schematron was obtained and the answer is
    six: `#the-ccd-shall-set-settled-against-the-normative-schematron`.**
  - **PAID 2026-08-07: this trap now HAS its one-line imperative in `CLAUDE.md`.** It was owed and
    blocked when the fix landed, because that file measured **34,482 bytes against its 32,000-byte
    budget** in the meta-repo's `.claude/hooks/doc-budget.mjs` and the hook refuses any write that
    grows an over-budget file, including a pointer at this section. `CCDA-CLAUDE-MD-OVER-BUDGET`
    closed it the way the debt said it had to be closed: **a measured relocation slice, not a budget
    raise** (ADR 0023 requires a raise to name a feature, and "fitting one more trap" is not one, so
    raising would have ratified the bypass that created the overage). **Nothing was deleted to pay
    for it**; eight blocks were shortened in `CLAUDE.md` and each is reproduced verbatim in the
    section of this file its pointer already named. **How the file got 2,482 bytes over a hook that
    exists to refuse exactly that: `doc-budget.mjs` only sees `Write`/`Edit` tool calls, so a write
    through `python`, `sed` or a shell redirect bypasses it silently. Edit these two files with the
    editing tools and re-measure after every change.**

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

## A subject declaration withholds the whole entry, and presence is the trigger

  - **`<subject>` decides whose data an entry is, and before `SUBJECT_CONTEXT_OVERRIDE` this parser
    read it in exactly one place** (`model/entries/family-history.ts`, for a Family History
    Organizer's `relatedSubject`), so every other extractor handed a relative's, a donor's or a
    contact's clinical statement back as the patient's, silently. CDA R2 gives `Section.subject`
    cardinality `0..1` as the "primary target of the entries recorded in a section" and C-CDA admits
    the same override on a clinical statement, so that document is conformant and the defect was
    ours. `src/model/entries/subject.ts` now answers it, and four decisions are load-bearing.
  - **Presence is the trigger, and it must stay that way.** A declaration is an override whatever it
    names: empty, `nullFlavor`-only, repeated, or restating the patient's own name and MRN. **Do not
    "improve" this by comparing the declared subject against the record target and staying quiet on a
    match**: that makes a clinical answer depend on vendor identifier hygiene, and it is the guess
    this repo's fail-safe rule forbids. The cost is real and accepted: a vendor that repeats the
    patient as an entry subject loses those entries from the record-target read paths and gains a
    warning each. Say that as the accepted cost, never as a bug to be tuned away.
  - **The unit is the TOP-LEVEL `<entry>`, for withholding and for counting, and nothing smaller.** A
    declaration on the second Problem Observation of a Problem Concern Act withholds the WHOLE concern
    act and emits ONE warning at the act's locus. **Do not "finish the job" by surgically removing the
    governed statement and returning the rest**: a concern act handed back one observation short, in
    silence, is the confidently wrong clinical answer the whole feature exists to prevent.
  - **The choke point is `readableEntries(sectionEl, ctx)`, and it is what keeps the read paths in
    step.** Thirteen extractors read their entries through it instead of `childEntries`; the parsed
    document's fields and accessors, the aggregate's slots, `buildDocument` and a directly invoked
    per-family extraction therefore all withhold identically, so no public path is a bypass around
    another. **The family-history extractor deliberately does NOT go through it**, and
    `flagMisplacedEntries` deliberately still sees every entry (a withheld entry's placement is still
    worth reporting, and that warning returns nothing). Governance is resolved from the section
    element's DOM **ancestors**, which is what makes a nested subsection handed straight to an
    extractor withhold under its parent's declaration.
  - **A Family History Organizer's own subject slot is never an override, whatever it contains**, and
    it re-overrides an enclosing section declaration. All four faces of the family-history family (the
    field, `getFamilyHistory()`, `extractFamilyHistory` and the aggregate's slot) return the same
    contents they returned before this existed, in every document shape. A declaring Family History
    section still warns and still withholds that section's other entries, which is observable because
    the aggregate walk runs every family's extractor over every section.
  - **The carve-out is READ-SIDE, and the first cut put it in the wrong layer.** `isOverridingDeclaration`
    shipped as `!hasTemplateRoot(el, FAMILY_HISTORY_ORGANIZER)`, so ANY element carrying
    `2.16.840.1.113883.10.20.22.4.45` was exempt, whatever element it was and whichever read path
    returned it. One extra `<templateId>` on a Result Organizer that carried its own `<subject>` left
    the entry readable: `results`, `getResults()`, the aggregate slot and a direct `extractResults`
    all handed a relative's lab panel back as the patient's with **no warning at all**, and the same
    one-line edit worked on a Problem Concern Act and on every other family, because the guard sat
    ABOVE the choke point. Multi-`templateId` entries are ordinary C-CDA, not spoofing to shrug at.
    **The carve-out is now the element the family-history read path itself reads**,
    `entryAct(entry, FAMILY_HISTORY_ORGANIZER)`, compared by IDENTITY (so a declaration nested deeper
    inside the entry can never claim it, and neither can the `<entry>` wrapper), **and only while that
    element carries no `RECORD_TARGET_ENTRY_ROOTS` root** (`model/entries/shared.ts`), which is the
    spec's own premise for the exemption: "nothing is attributed to the record target either way
    because no record-target read path returns that organizer". Where that premise is false the
    entry is governed, withheld and reported like any other. **Do not re-widen the test to the
    templateId alone, and do not narrow it to "carries no OTHER templateId"** either: a real organizer
    with a vendor stamp is still a Family History Organizer and must keep its slot. The root list is
    **traced, not stated**: `test/subject-override.test.ts` scans every extractor that reads through
    the choke point and asserts the set equals the roots those files match on, so adding a family
    without adding its root reds a test instead of re-opening the hole.
  - **`extractFamilyHistory` reports what it does not withhold.** Its CONTENTS are carved out (it
    reads `childEntries`), but a per-family extraction invoked directly on a declaring section owes
    the caller the warning, and it was the one public read path that said nothing at all. It now
    calls `reportSubjectOverrides(sectionEl, ctx)`, the warning half of the choke point with no
    filtering. Memoized per (context, section) like every other emission, so a whole-document parse
    counts exactly what it counted before: the record-target extractors reach the section first.
  - **"It is the LONE signal, no other warning about it can fire" was published in `profiles/safety.ts`
    and was false the day it shipped.** `flagMisplacedEntries` reads every entry, so
    `SECTION_PLACEMENT_SUSPECT` fires about a withheld one, and the family-history extractor can raise
    its own warnings about an entry withheld from the record-target families. What is true, and what
    that file now says, is narrower: it is the only code that says WHOSE data an entry is, and the
    warnings that ride the withheld reading (its codes, units, narrative, `PLAN_ENTRY_NOT_MODELED`) do
    go quiet with it because the entry is never built. Both halves have tests.
  - **The count is per section and sums: N governed entries produce exactly N instances, and a
    declaring section that governs no entry ANYWHERE beneath it produces exactly one at its own
    locus.** A declaring section whose entries all sit one subsection down is therefore N, not N plus
    one: the section-level instance is owed only where nothing is withheld. **The emission is memoized
    per (parse context, section)**, and that is not an optimization: the aggregate walk runs fourteen
    extractors over every section, so an emit that rode the extractor would produce fourteen instances
    per governed entry. De-duplicate on the element, never on the message or the locus text.

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
    this repo's own mood model. **Whether the other three should be REPORTED as dropped was open, not
    settled** and deliberately not decided in that slice. **SETTLED 2026-08-06: they are reported**
    (`PLAN_ENTRY_NOT_MODELED`), and Goal Observation deliberately is not. The full reasoning, including
    why the two levels are scoped differently, is in "The three plan-surface decisions of 2026-08-06"
    below.
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
    **Was still open after `CCDA-NESTED-PLANNED-ENTRIES`**, which corrected the `BuildCcdaPlannedItemBase`
    JSDoc that stated `SHOULD [0..1]` flatly (false on two of the seven) but did **not** make the field
    required. The false claim and the breaking change are separate acts and only the first was cheap.
    **SETTLED 2026-08-06, and settled toward REPORTING rather than toward the breaking change**: the
    field is still optional, the emitted XML is unchanged, and `buildCcda` now raises
    `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` on the returned document. See "The three plan-surface
    decisions of 2026-08-06" below.

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
    **The three non-item templates were open at both levels**: Instruction (`…22.4.20`), Handoff
    Communication Participants (`…22.4.141`) and Nutrition Recommendation (`…22.4.130`) are admitted by
    the container exactly as by the section, and that slice left them not returned and silent, pinned
    by test rather than settled. **SETTLED 2026-08-06: they are REPORTED at both levels**
    (`PLAN_ENTRY_NOT_MODELED`) and **still not returned**, so the nesting bound above is unchanged. The
    Nutrition Recommendation container is now reported as an act while what it holds is still not
    reached, which is the one row of the bound test that moved; the Intervention Act (`…22.4.131`) half
    is silent end to end exactly as before. See "The three plan-surface decisions of 2026-08-06".
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

## The three plan-surface decisions of 2026-08-06

  - **Three founder decisions, taken together as one slice because each is a public-surface change to
    the same area.** They settle three things that stood open as "filed, not fixed", and each was
    settled toward *reporting* rather than toward changing what the library returns or accepts. Read
    them as three separate acts that happen to ship together, not as one feature.
  - **1. A Planned Medication Activity built with no `effectiveTime` is REPORTED, and the field stays
    OPTIONAL.** `…22.4.42` SHALL carry exactly one (CONF:1098-30468) and
    `BuildCcdaPlannedOrder` types it optional, so `buildCcda` could emit a planned drug order with no
    timing and say nothing. Requiring the field would be a breaking change to a **published** input
    type, so the decision was to keep the type and raise
    `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` on the returned document.
    **The emitted XML is byte-identical to what it was.** No date is fabricated, no `nullFlavor` is
    invented, nothing is refused; the diagnostic is a statement *about* the document, never a change
    *to* it. **Do not "finish the job" by making the field required, and do not fill the element.**
    **It is a BUILD-time diagnostic and must stay one.** `buildCcda` appends it through
    `CcdaDocument.withWarnings` after the re-parse, so it lands **last**, after every parse warning.
    Re-parsing the very same XML raises nothing, and that asymmetry is deliberate: teaching
    `parseCcda` the same check would move rows on every third-party document in the world, which is
    its own decision with its own base-measured matrix. A test pins the parse path staying silent.
    **SUPERSEDED 2026-08-07 ON THE `editCcda` HALF ONLY, BY
    `#closing-the-two-silent-plan-drops-2026-08-07`. The rest of this bullet still holds, and the
    history below is why the closing shape is what it is: read it before touching that check.**
    **IT WAS `buildCcda`-ONLY, `editCcda` WAS A STATED RESIDUAL, AND THE ROUTE FROM ONE TO THE OTHER
    IS THE MOST INSTRUCTIVE THING IN THIS SECTION.** `editCcda` writes a Plan of Treatment section
    through the **same** emitter (`buildSectionComponent` into `planOfTreatmentSection`) from the
    **same** `BuildCcdaPlannedItem` input and raises nothing, so a planned medication grafted in by an
    edit is emitted short the SHALL element in silence.
    **Refuter pass 1 was right that the FIRST cut overclaimed**: the TSDoc on
    `BuildCcdaPlannedItemBase.effectiveTime` said "the omission is now reported" on a field
    `editCcda` also consumes. **The remedy chose to grow the guard as well as fix the claim, and
    growing the guard is what broke.** `editCcda`'s input is an **ordered list of edits where a later
    one discards an earlier one's content**, so a check reading that list reported a SHALL violation
    against a document whose emitted DOM **carried** the element, on a conformant edit; the library's
    own re-parse of the same bytes said `[]`. The frozen message also names `buildCcda`, and it is a
    member of the public `ALL_WARNING_MESSAGES` registry, so an `editCcda`-raised warning
    misdescribed its own document, which this repo already names as the same defect as a warning
    pointing at a coding that is not there. **Refuter pass 2 caught both and recommended cutting back
    rather than hardening; the `editCcda` wiring was reverted.**
    **The lesson worth carrying: "read the input, not the emitted DOM" is `buildCcda`'s argument and
    it does not travel.** It holds there because `init.planOfTreatment` is one list that is always
    emitted. It is false wherever the input can be discarded before it reaches the DOM. **Never wire
    an emitter to an INPUT-reading version of this check.** Reporting on the edit path needs to read
    what survived into the emitted DOM **and** a message that names neither emitter; that was done
    2026-08-07 and both requirements are now met, so the shape to preserve is
    `plannedMedicationDiagnostics(surviving grafted components)`, not `plannedItemDiagnostics(items)`,
    which no longer exists. The conformant two-edit document the reverted version warned about is
    still pinned by test, and now pins the check staying silent on it rather than the check being
    absent.
    **The check used to read `init` rather than the emitted DOM**, on the argument that the builder
    emits the element if and only if the input carried it and that re-walking the DOM would be a
    second implementation of the emit rule. **That argument is retired**: making the DOM read the
    *only* read means there is no second implementation to drift from, which is strictly better than
    the property it was defending. See `#closing-the-two-silent-plan-drops-2026-08-07`.
    **`BuildCcdaPlannedImmunization` is deliberately NOT checked.** Its `effectiveTime` is `[1..1]`
    too, but the type makes the field **required**, so a runtime warning there would be unreachable.
    Adding one would be a dead diagnostic, which this repo has a whole matrix about.
  - **2. Instruction (`…22.4.20`), Handoff Communication Participants (`…22.4.141`) and Nutrition
    Recommendation (`…22.4.130`) are REPORTED as `PLAN_ENTRY_NOT_MODELED`, not excluded in silence.**
    They are three of the four templates the Plan of Treatment Section admits and `getPlannedItems()`
    does not return. **Reporting is NOT modelling and nothing about the returned list changed**: no
    `PlannedItemKind` was added, `PLANNED_VARIANTS` is untouched, and each act still reaches no model
    field and survives only in `doc.toString()`. The reason they are not planned items is unchanged
    and is a reading of what they *are*, not a gap: an instruction is something to be told, a handoff
    names who took over care, a nutrition recommendation is dietary advice.
    **THE FOURTH, GOAL OBSERVATION (`…22.4.121`), IS DELIBERATELY NOT REPORTED.** The decision taken
    on it was to **model** it, with its own IG grounding and its own conformance surface, because a
    conformant Planned Intervention Act must satisfy its `[1..*]` reference to one. A warning would
    pre-empt that with a weaker answer, and a warning code is stable under ADR 0001 the moment it
    ships, so it would then have to be carried forever. **Do not add it to the reported set.**
    **THE TWO LEVELS ARE SCOPED DIFFERENTLY, AND THE SCOPE IS A CHOSEN BOUND, NOT A CONTAINMENT
    CATALOG.** **The direct-entry half was WIDENED to a second section 2026-08-07** (see
    `#closing-the-two-silent-plan-drops-2026-08-07` for the traced grounding and the base-measured
    matrix); the paragraph below describes the original single-section bound and the reasoning that
    still governs it. A direct `<entry>` was reported only when the section resolves to
    `planOfTreatment`, the
    section this accessor is named for; without that scope an Instruction sitting in the Instructions
    Section (`…22.2.45`), where it is that section's own **required** entry, would draw a "not
    modelled" warning on a fully conformant document. Inside a Planned Intervention Act there is no
    section condition at all, because the report is relative to the **container** there and the
    container is read wherever it sits (this package already reaches it in the Interventions Section,
    `…21.2.3`, which is where R2.1 puts it): gating that half on the section key would have made it
    silent on exactly the documents that place it conformantly. Both halves are pinned by test,
    including the Instructions-Section negative control.
    **THE FIRST CUT JUSTIFIED THAT SCOPE WITH AN UNTRACED SPEC CLAIM, AND IT SHIPPED TO THREE SITES
    BEFORE THE REFUTER CAUGHT IT.** It said Handoff and Nutrition Recommendation are "admitted in the
    same two places as Instruction", and that the Plan of Treatment Section "is the section whose
    catalog admits the three". Neither was traced, and the refuter produced a counter-citation
    (Interventions Section CONF:1198-32402/32403, admitting Handoff as a direct entry). **The remedy
    retracted the claim rather than swapping in a counter-claim it had not itself traced**, which was
    the right call at the time: an unsourced true claim and an unsourced false one are
    indistinguishable at the time of writing.
    **THE COUNTER-CITATION IS REAL AND IS NOW TRACED, AND HOW IT WAS MISSED IS THE REUSABLE PART.**
    `hl7.org/ccdasearch` returns **HTTP 202 with a zero-byte body** through this container's egress,
    which reads exactly like an empty page rather than a failure, so a fetch there is not evidence of
    absence. `raw.githubusercontent.com` works: C-CDA Online's generated page for the Interventions
    Section (V3) says verbatim *"MAY contain zero or more [0..*] entry (CONF:1198-32402) such that it
    SHALL contain exactly one [1..1] Handoff Communication Participants (identifier:
    2.16.840.1.113883.10.20.22.4.141) (CONF:1198-32403)."* Verified here, 2026-08-07, at
    `raw.githubusercontent.com/jddamore/ccda-search/master/templates/2.16.840.1.113883.10.20.21.2.3.html`.
    **The retraction still stands**: what was wrong was the *original* claim, and the fix was never to
    replace it with a differently-shaped catalog assertion. What the citation does is make the
    residual below **measured** rather than merely suspected.
    **What is stated instead is the RESIDUAL, which is this package's own behaviour: these three
    templates appear in more places than the report covers, and an occurrence outside it is
    still dropped in silence.** A Handoff as a direct entry of an Interventions Section was the traced
    example (CONF:1198-32402/32403, above); **that one was closed 2026-08-07, on its own grounding and
    its own base-measured matrix, exactly as this bullet demanded** (see
    `#closing-the-two-silent-plan-drops-2026-08-07`). The residual itself is unchanged in kind and
    still has measured members, now the Intervention Act container and any unrecognized section. Say
    it that way everywhere. **Do not widen
    the report further as a side effect** - that is a new behavioural surface with its own
    grounding and its own base-measured matrix. And do not restore a containment count anywhere in
    this repo without a normative source in hand.
    **`sectionKeyOf` moved from `model/entries/extract.ts` to `model/entries/shared.ts`** so the
    misplaced-entry check and this scoping read one definition rather than two copies of the same
    claim. It is silent by construction (`buildSection` already emitted the recognition warnings), and
    it inherits the filed limitation that a disagreeing section resolves on `templateId` with no word
    said, so a mis-recognized Plan of Treatment loses the direct-entry half of this report. That is a
    stated bound, not a rule of the function.
    **Reporting never changes what is extracted.** An act stacking a planned root and one of the three
    still yields its `PlannedItem` **and** the report; an act stacking two of the three is reported
    **twice**, because nothing in a document ranks them and picking one would hide the other.
    Performed acts a Planned Intervention Act also holds are **not** reported: they are modelled
    elsewhere and reached by their own extractors, so calling one "not modelled" would be false.
  - **3. A minted `setId` is LABELLED SYNTHETIC, and `editCcda` KEEPS MINTING.** Not minting is not an
    option: CDA R2 requires a replacement and its `parentDocument` to share a version-series `setId`,
    so a source with none forces the editor to invent one or emit a document that contradicts itself.
    The decision was to keep inventing it and make the invention obvious. The scheme is the
    **conjunction** of two things, exported as `SYNTHETIC_SETID_PREFIX` and checked by
    `isSyntheticSetId`: an `@extension` beginning `SYNTHETIC-SETID-`, **and** the synthetic
    assigning-authority root `2.16.840.1.113883.19.5.99999`. Either half alone is something a real
    document could carry, so the predicate is an AND and a test pins both single-half cases as
    `false`.
    **The label goes on the MINTED branch only.** A `setId` the source asserted, or one the caller
    passed as `revision.setId`, is somebody else's assertion and is never relabelled; relabelling it
    would be the laundering this area refuses everywhere else.
    **THE RESIDUAL IS STATED ON THE PUBLIC SURFACE AND CANNOT BE TESTED AWAY: NOTHING FORCES A
    RECEIVER TO READ THE LABEL.** A receiving system that ignores the prefix and the root treats a
    minted `setId` exactly as it treats a real one. A label makes a fabrication visible; it does not
    make the identifier true. **And a `false` from `isSyntheticSetId` is not a promise the id is
    real** - a `setId` minted by another tool, or by this library before the scheme existed
    (`setid-e1`, unprefixed), reads `false`. Say it that way; the inverse reading is the overclaim.
    **`ClinicalDocument.id` is deliberately NOT labelled.** `deriveNewDocId` mints a fresh document id
    from the source's own root, which is a different act with a different argument, and widening the
    scheme to it was not the decision taken.
  - **Filed by this slice, not fixed.** Every `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` carries the
    same `{ path: "substanceAdministration", sectionCode: "18776-5" }`, so two offending orders in one
    build produce two byte-identical warnings a consumer cannot tell apart. That is defensible rather
    than accidental (no factory may take a value parameter, `PHI-WARNING-MESSAGE-LEAK`, and `path` is
    a bounded element local name), but it is a real limit and it is stated rather than left to be
    discovered, and **it survives the 2026-08-07 slice unchanged**: the same position is now produced
    by two writers rather than one. The other residual is the report scope above: an Instruction,
    Handoff or Nutrition Recommendation outside the covered places is still dropped in silence.
  - **What this slice deliberately did NOT touch.** The CCD SHALL-set disagreement is untouched and
    still open: `build-ccda.ts` names five `shallSections` **including** `vitalSigns` while
    `required-sections.ts` names four **excluding** it, so `buildCcda` always emits Vital Signs while
    `parseCcda` will not warn when a third-party CCD lacks one. **It is blocked on a normative source
    (the R2.1 Schematron), not on a decision, and this slice did not let either half quietly pick a
    set.** **SETTLED 2026-08-10: the Schematron was obtained and the set is SIX (both halves were
    wrong, the roadmap was right), see
    `#the-ccd-shall-set-settled-against-the-normative-schematron`.** Modelling Goal Observation and emitting the Planned Intervention Act are a roadmap phase,
    not a drain unit. Neither new code was added to `SAFETY_CRITICAL_CODES`: `PLAN_ENTRY_NOT_MODELED`
    reports a **modelling gap**, not a misread value, which is the same class as
    `UNKNOWN_SECTION_CODE` (a section retained as narrative-only, also not in that set), and
    `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME` can only ever be raised by an emitter, and neither
    emitter consults a profile, so listing it would be inert. (Still true after 2026-08-07: `editCcda`
    forwards a `terminology` adapter to its re-parse and takes no profile.) Adding either later can
    only forbid more and is a reviewable act of its own.

### The CLAUDE.md imperative for the plan-surface decisions, as it stood before the 2026-08-07 relocation

`CCDA-CLAUDE-MD-OVER-BUDGET` shortened this trap's one-line imperative in `CLAUDE.md` to fit that
file under its 32,000-byte budget. Nothing was deleted: the imperative as it stood is reproduced
here verbatim, and what is LEFT there is the rule plus this pointer.

  - **Three plan-surface decisions were settled 2026-08-06, all toward REPORTING rather than toward
    changing what is returned or accepted, and each has a "do not finish the job" edge.**
    (1) `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`: the field stays optional, the **emitted XML is
    byte-identical** (no date, no `nullFlavor`), **`parseCcda` raises nothing**, and the immunization
    variant is **not** checked (its field is required, so the diagnostic would be dead). The
    `editCcda` half was a stated residual and is **CLOSED (2026-08-07)**; read
    `#closing-the-two-silent-plan-drops-2026-08-07` before touching it, because an **INPUT-reading
    check was tried and REVERTED** (an ordered edit list where a later edit discards an earlier one's
    content warned of a SHALL violation on a conformant document). The shipped shape is one shared
    check over the **emitted DOM**, message naming **neither** emitter.
    (2) `PLAN_ENTRY_NOT_MODELED` reports Instruction / Handoff / Nutrition Recommendation, **not**
    Goal Observation (that one is to be MODELLED, and a code is stable forever once shipped).
    **Where it fires is a CHOSEN BOUND, not a containment catalog**: a direct entry in **two**
    sections, `planOfTreatment` and `interventions` (widened 2026-08-07 on a verbatim
    CONF:1198-32402 / 1198-32403 citation plus a base-measured matrix; a conformant Instructions
    Section still stays quiet), the nested half wherever the container sits. **They appear in more
    places than the report covers and an occurrence outside it is still dropped in silence** (a
    Handoff nested in an Intervention Act `…22.4.131` is one) **- say that, and never justify the
    scope with an untraced containment claim** (one shipped, retracted).
    **Reporting is not modelling: nothing about
    `getPlannedItems()` changed.** (3) `editCcda` **keeps minting** a `setId` (CDA R2 requires the
    replacement and its `parentDocument` to share one) and labels the minted one only:
    `SYNTHETIC_SETID_PREFIX` + the synthetic root, both required by `isSyntheticSetId`. **State the
    residual: nothing forces a receiver to read the label, and a `false` never certifies an id is
    real.** **The CCD SHALL-set disagreement was NOT touched and is still blocked on the Schematron.**
    **SETTLED 2026-08-10: `#the-ccd-shall-set-settled-against-the-normative-schematron`.**
    Why: `documentation/agent-notes.md#the-three-plan-surface-decisions-of-2026-08-06`

## Closing the two silent plan drops (2026-08-07)

  - **The two residuals `#98` stated and test-pinned rather than fixed, closed together as one slice
    because they are the same defect twice: an emit-side drop and a read-side drop, both silent, both
    on the plan surface.** Neither was a bug `#98` could have fixed in passing; each needed its own
    grounding, and one needed a different SHAPE, not a wider guard.
  - **1. `editCcda` NOW RAISES `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, AND WHAT MADE IT POSSIBLE
    IS READING THE EMITTED DOM, NOT WIRING IN THE OLD CHECK.** The reverted attempt read
    `options.sections`, the caller's **ordered** edit list, and a later edit discards an earlier one's
    content, so it reported a SHALL violation against a document whose emitted DOM carried the
    element. **The check now reads DOM subtrees**, and both emitters share one implementation:
    `plannedMedicationDiagnostics(emitted: readonly Element[])` in `src/builder/build-ccda.ts`, which
    walks for `…22.4.42` `<substanceAdministration>` elements with no `<effectiveTime>` child.
    `plannedItemDiagnostics` is gone; do not reintroduce an input-reading variant under any name.
  - **THE CALLER CHOOSES THE SUBTREES, AND THAT SCOPE IS HALF THE DESIGN.** `buildCcda` hands it the
    whole `structuredBody` (every section in a built document is the caller's own content).
    `editCcda` hands it **only the grafted components that SURVIVED into the final body**, computed
    by `applySectionEdits` returning the grafted nodes and filtering them against
    `children(structuredBody, "component")`. **Survival is decided by asking the DOCUMENT, not by
    inspecting a removed node's `parentNode`**: the question is "is this in the document", and the
    document is the thing that cannot be wrong about it.
  - **Both halves of that scope are load-bearing and each has its own test.** Reading the SURVIVING
    graft is what keeps the conformant two-edit document silent (the trap `#98` left behind, which
    still passes and now pins the check rather than its absence). Reading only what THIS CALL grafted
    is what keeps an edit from becoming a validator: an offending act the source brought with it is
    never re-reported, and would otherwise fire again on every later edit of an unrelated section.
  - **THE FROZEN MESSAGE WAS REWORDED TO NAME NEITHER EMITTER, AND A SECOND CODE WAS CONSIDERED AND
    REJECTED.** The old message opened "buildCcda emitted a Planned Medication Activity…", which was
    false the moment a second writer raised it. The alternative, a new code, was rejected on this
    repo's own rules: it is one defect with one remedy, a warning code is stable forever once shipped
    (ADR 0001) so adding one is the more permanent commitment, and there is direct precedent here for
    correcting a frozen message instead, `UNKNOWN_NAMESPACE_PREFIX`. **State the cost honestly rather
    than eliding it: the message string is what consumers see on `warning.message`, so the wording
    moved on a published code.** The `code` did not, which is the documented thing to key on, and
    `ALL_WARNING_MESSAGES` is not re-exported from `src/index.ts`.
    **The reword's FIRST draft then overclaimed in the other direction, and the correction is worth
    keeping.** It opened "The emitted document carries a Planned Medication Activity with no
    effectiveTime", a universal about the document, while `editCcda`'s check is graft-scoped: an
    offending act the source carried is not reported, so the warning's ABSENCE would have read as a
    guarantee the check never makes. The shipped wording is act-scoped and says the bound in as many
    words ("Only content the emitting call itself wrote is checked"). **Any future wording here must
    keep that clause or an equivalent**; it is the same shape as "a clean run means those five slots
    passed, NOT that the document was terminology-verified".
  - **2. `PLAN_ENTRY_NOT_MODELED`'s DIRECT-ENTRY HALF WAS WIDENED FROM ONE SECTION TO TWO:
    `planOfTreatment` and `interventions`** (`PLAN_ENTRY_REPORT_SECTION_KEYS`). **The citation is
    verbatim and was re-fetched for this slice**, 2026-08-07, from
    `raw.githubusercontent.com/jddamore/ccda-search/master/templates/2.16.840.1.113883.10.20.21.2.3.html`:
    Interventions Section (V3) *"MAY contain zero or more [0..\*] entry (CONF:1198-32402) such that it
    SHALL contain exactly one [1..1] Handoff Communication Participants (identifier:
    2.16.840.1.113883.10.20.22.4.141) (CONF:1198-32403)."* **`hl7.org/ccdasearch` still returns HTTP
    202 with a zero-byte body through this container's egress, so a fetch there is never evidence of
    absence.** Search the page for the sentence and require exactly one hit; a label proves the label
    exists, not that the body carries the claim.
  - **THE INTERNAL ARGUMENT IS THE STRONGER ONE AND IS WORTH KEEPING.** This module already reports
    all three templates nested in a Planned Intervention Act **with no section condition**, and that
    act's conformant home is the Interventions Section. So before this, moving a Handoff one level up,
    out of the container and into a direct entry of the same section, took it from reported to silent.
    A report a document's own nesting depth switches off is an accident, not a bound.
  - **ALL THREE TEMPLATES ARE IN SCOPE IN THE NEW SECTION, AND THE REASON IS DELIBERATELY NOT A
    CONTAINMENT CLAIM.** The warning has always been about a **modelling gap, not conformance**:
    wherever one of the three sits, this package recognizes it and drops it, so silence says less than
    the report does. Scoping per template would need a catalog of which sections admit what, and an
    untraced catalog is the move this area already retracted once. **NO CONTAINMENT COUNT IS
    ASSERTED**, here or in the code. A first draft of this slice did assert one ("exactly three")
    from the cited page; the refuter was right that a generated navigation site which says of itself
    that HL7's own C-CDA page remains definitive is not a normative source for a catalog, whatever it
    is for the quoted conformance statement. **The rule stands: do not restore a containment count
    anywhere in this repo without a normative source in hand, and note that the same page is good
    enough to quote a CONF statement from and not good enough to enumerate from.**
  - **THE SECTION IS MATCHED WIDER THAN THE CITATION, AND THAT IS STATED RATHER THAN NARROWED.**
    `sectionKeyOf` resolves `interventions` from the `…21.2.3` `templateId` root with LOINC `62387-6`
    as the fallback, and checks **no `@extension`**. So a **V2**-stamped Interventions Section, one
    carrying only the LOINC and no `templateId`, and one whose root and `<code>` disagree are all in
    scope, while CONF:1198-32402 / 1198-32403 is **V3**'s. Measured base to head: all three of those
    shapes went from silent to reported, exactly like the V3 shape. That is this package's recognition
    behaving as it does everywhere else, not a decision taken here, and the report stays true in every
    one of them because it is a statement about this package rather than about the document's
    conformance. **Do not narrow recognition to fix this**; that would give the Interventions Section
    a matching rule no other section has.
  - **THE BASE-MEASURED MATRIX, taken on `a29202d` and again after, four templates x seven
    positions.** Only three cells moved, all in the same row, and `getPlannedItems()` returned `[]` on
    every cell before and after (reporting is not modelling):

    | position | handoff `…22.4.141` | instruction `…22.4.20` | nutrition `…22.4.130` | goal `…22.4.121` |
    | --- | --- | --- | --- | --- |
    | direct entry, Plan of Treatment Section | 1 -> 1 | 1 -> 1 | 1 -> 1 | 0 -> 0 |
    | **direct entry, Interventions Section (V3)** | **0 -> 1** | **0 -> 1** | **0 -> 1** | 0 -> 0 |
    | direct entry, Instructions Section | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 |
    | direct entry, unrecognized section | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 |
    | nested in Planned Intervention Act, Interventions Section | 1 -> 1 | 1 -> 1 | 1 -> 1 | 0 -> 0 |
    | nested in Planned Intervention Act, Plan of Treatment Section | 1 -> 1 | 1 -> 1 | 1 -> 1 | 0 -> 0 |
    | nested in Intervention Act (`…22.4.131`), Interventions Section | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 |

    Every cell was taken differentially, against the same section envelope carrying no act at all, so
    a fixture's own warnings can never be read as the claim. **Goal Observation is 0 in every cell,
    before and after, and must stay that way**: the decision on it is to model it.
  - **The edit-side matrix, same method.** Six cases, two moved: a single edit grafting a planned
    medication short the element (`[]` -> the warning) and a two-edit call whose **surviving** edit is
    the offending one (`[]` -> the warning). The conformant two-edit call, an offending act left in
    the untouched source, a conformant single edit, and the `buildCcda` control were all unchanged.
    In every moved case the emitted DOM was independently confirmed short the element, so the report
    is measured against the bytes rather than against the input.
  - **WHAT IS STILL DROPPED IN SILENCE, MEASURED AND PINNED.** Handoff's contained-by set is four:
    Plan of Treatment Section, Planned Intervention Act, Intervention Act, Interventions Section.
    Three report; the **Intervention Act (`…22.4.131`) does not**, because this package does not
    descend into that container at all (unchanged, and the same test that pins it names why). A direct
    entry of a section this catalog recognizes as nothing is also silent, because there is no key to
    match. **Widening either is its own decision with its own base-measured matrix.**
  - **WHAT THIS SLICE DELIBERATELY DID NOT TOUCH.** The CCD SHALL-set disagreement between
    `build-ccda.ts` (five `shallSections`, including `vitalSigns`), `required-sections.ts` (four,
    excluding it) and the roadmap (a third set) is **untouched and still blocked on the normative R2.1
    Schematron, not on a decision**. Neither half of this slice was allowed to quietly pick a set.
    **SETTLED 2026-08-10, see `#the-ccd-shall-set-settled-against-the-normative-schematron`; the
    three-way reading above is preserved as the state at the time of that slice. The roadmap's set
    was the correct one.**
    Modelling Goal Observation and emitting the Planned Intervention Act remain a roadmap phase.
    `getPlannedItems()` returns the same seven templates it always did.
  - **The chore folded in, and why it is a per-test budget rather than a global one.**
    `test/scripts/changelog-generation.test.ts` "keeps the committed changelog Prettier-canonical" ran
    on Vitest's 5 s default and timed out on 2 of roughly 10 local runs under four-worker fleet load,
    green in CI every time. It is the file's **first** `formatCheckAccepts` call, so it pays for
    `prettier.resolveConfig` plus the lazy markdown-parser load that the two later callers then get
    free; the assertion itself is a string comparison. It now carries `{ timeout: 30_000 }` beside the
    work, per `vitest.config.ts`, which sets no global and says why. **Do not answer this by putting a
    global back.**

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
    those. **The OID was this entry's only real behavioural risk and it now has its FIRST source,
    2026-08-07. Call it a first, not a second**: the prior state was "stated, not traced", so there was
    no source at all to be second to, and the one there is now is NON-NORMATIVE. Fetched for the plan-drops slice from
    `raw.githubusercontent.com/jddamore/ccda-search/master/templates/2.16.840.1.113883.10.20.21.2.3.html`,
    C-CDA Online's generated Interventions Section (V3) page states `@root =
    "2.16.840.1.113883.10.20.21.2.3"` (CONF:1198-10461), `@extension = "2015-08-01"`
    (CONF:1198-32559) and `@code = "62387-6"` (CONF:1198-15378). **The arc, the root, the version stamp
    and the LOINC are confirmed; nothing else on this entry is, and the "stated, not traced" bound on
    the rest still holds and still licenses nothing about `required-sections.ts`.** The same page
    carries the conformance statement that grounds the widened `PLAN_ENTRY_NOT_MODELED` scope
    (CONF:1198-32402 / 1198-32403); see `#closing-the-two-silent-plan-drops-2026-08-07`, **and note
    there that the page is good enough to quote a CONF statement from and NOT good enough to
    enumerate a contained set from.** A draft of this slice did enumerate one here and it is
    retracted; nothing in this repo's behaviour rests on it.
    **`hl7.org/ccdasearch` is NOT a usable source from this container** (HTTP 202, zero-byte body,
    reads like an empty page), and **a label proves the label exists, not that the body carries the
    sentence**: search for the sentence and require exactly one hit, which is how this was verified.
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

### The CLAUDE.md imperative for the Interventions Section, as it stood before the 2026-08-07 relocation

`CCDA-CLAUDE-MD-OVER-BUDGET` shortened this trap's one-line imperative in `CLAUDE.md`. Nothing was
deleted; the imperative as it stood is reproduced here verbatim.

  - **The Interventions Section (`…21.2.3`, LOINC `62387-6`) lives in the `…10.20.21.2.*` arc, not
    the `…10.20.22.2.*` arc every other catalog section uses, and `…10.20.22.2.3` is RESULTS. Do not
    "normalize" the arc** (a matrix row exists solely to fail if the two are confused). Exactly one
    root, no entries-required sibling; **in C-CDA the base root is entries-optional and the `.1`
    sibling is entries-required** (an earlier draft had it backwards). **Do not re-add a CONF id or
    a LOINC release number here**: both were invented precision, removed rather than re-guessed.
    Every other spec claim on this entry is **stated, not traced**, which licenses nothing
    about `required-sections.ts`. **A filtered projection cannot support a monotonicity claim**; the
    matrix filters nothing, and there are FOUR classes of move, not the two the first cut claimed.
    **`UNKNOWN_SECTION_CODE` is NOT withdrawn on "every document carrying `62387-6`"** - that
    universal was published once and is false.
    **The OID got a FIRST source 2026-08-07**, non-normative: root + LOINC only.
    Why: `documentation/agent-notes.md#the-interventions-section-and-its-oid-arc`

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

### The CLAUDE.md imperative for the namespace sweep, as it stood before the 2026-08-07 relocation

`CCDA-CLAUDE-MD-OVER-BUDGET` shortened this trap's one-line imperative in `CLAUDE.md`. Nothing was
deleted; the imperative as it stood is reproduced here verbatim.

  - **`UNKNOWN_NAMESPACE_PREFIX` is raised from `enforceStructureLimits`, the package's only
    exhaustive traversal, and REPLAYED after the model is built, never emitted where it is found.**
    **A namespace deviation must never take a fatal's or a safety-critical code's place**; in
    lenient mode this means `OnWarningCallback` documents emission order, not discovery order. **The
    skip-the-root guard does not work and was removed**, and the test pinning it used a childless
    root: **a probe that cannot fail proves nothing.** Once per distinct namespace bounds only the
    **benign** case; **do not write it up as a hostile-input bound.** The position is the
    **shallowest** use, not the first in document order. **Attributes are deliberately NOT swept;
    do not "finish the job" by adding them.** The code NAME is historical, so the frozen message was
    corrected instead of renaming a stable code. **If you add a diagnostic about a node this parser
    does not navigate, that walk is where it goes.**
    Why: `documentation/agent-notes.md#where-the-unknown-namespace-prefix-warning-is-raised`

## What populates CcdaPosition templateId

  - **`CcdaPosition.templateId` is populated by FOUR codes, and by nothing else**
    (`CCDA-DEAD-DIAGNOSTICS`, widened by one at `CCDA-5`). It was declared and set by nothing, so
    `toleranceApplies` could never satisfy a `QuirkTolerance` keyed on `templateId` and such a profile
    entry silently tolerated nothing. The four are the two document-level stamp codes,
    `TEMPLATE_EXTENSION_ABSENT` and `TEMPLATE_EXTENSION_UNMODELED_RELEASE` (both naming the matched
    document-type root, which is the single templateId either warning is about), and
    `UNKNOWN_SECTION_CODE` / `SECTION_MATCHED_BY_LOINC_FALLBACK` (the section's first rooted
    `templateId`). **The count moved once already, so enumerate the set rather than trusting the
    numeral**; the entry that added the fourth is one section below.
    **`REQUIRED_SECTIONS_NOT_EVALUATED`, added in the same change, carries none**, for exactly the
    reason `UNKNOWN_DOCUMENT_TEMPLATE` does not: its subject is the document's whole required-section
    obligation, not any one template, and the obvious pick would again be a near-constant.
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
    two document-level stamp codes. No profile in `ccdaProfiles` uses `match` at all, so nothing
    shipped moved.
    **Still open, filed rather than smuggled in:** `defineCcdaProfile` accepts a `match` on a code
    that cannot carry the field, so an inert tolerance is documented rather than refused. Refusing it
    needs a code-to-position-field registry, which is exactly the kind of stated claim that outlives
    the code it describes.

## The three readings of a document level version stamp

  - **A document-level `templateId/@extension` has THREE readings, not two, and the third is the one
    that was getting a confident wrong answer** (`CCDA-5`). At `0.0.15` `recognizeDocumentType` emitted
    `TEMPLATE_EXTENSION_ABSENT` whenever the resolving tid's extension was not `2015-08-01`, and that
    code's frozen message reads "carries no @extension version stamp ... (may pre-date R2.1)".
    For a document stamped `2024-05-01` **both halves are false**: it carries a stamp, and it
    post-dates R2.1 rather than pre-dating it. That is the same defect class as a safety-critical
    warning that misdescribes the document it is about, one tier down.
    **The silent half was worse.** The same path returned `r21Stamped=false`, and `assertedKeys` reads
    that as the R1.1-origin reduction, which drops every `R21_SCOPED_SECTIONS` key. A post-R2.1 CCD
    missing Social History and Vital Signs therefore drew **no `REQUIRED_SECTION_MISSING` at all**,
    because the library had classified a document from the future as one from the past. The trigger
    stopped being hypothetical on 2026-08-29, when a certified sender may lawfully put a C-CDA 5.0.0
    document on the wire under the criteria that carry R2.1 documents today.
    **The two stamp codes are NOT interchangeable and `TEMPLATE_EXTENSION_ABSENT` was not widened.**
    It means "no `@extension` at all", its registry message is byte-identical to the one that shipped,
    and it is what an R1.1-origin document draws. `TEMPLATE_EXTENSION_UNMODELED_RELEASE` means "an
    `@extension` that is present and is not the R2.1 one", whether or not this package owns that stamp:
    not modelling a release and not recognizing a stamp at all are the same fact from here. **Renaming
    or repurposing a published code is a breaking change; adding one is the sanctioned move.**
    **The empty and the whitespace-only cases are decided, not discovered.** `attr` returns `undefined`
    for `""`, so an empty `@extension` is the ABSENT reading; a whitespace-only one is present and is
    not R2.1, so it is the UNMODELED reading. Exactly one of the two fires, deterministically, and
    neither throws with default options. `test/edge-cases.test.ts` pins the split by name.
    **A stamp a message NAMES comes from `CCDA_RELEASE_STAMPS`, this package's own closed table**
    (`2015-08-01` → R2.1, `2024-05-01` → R3.0 or later, read off the published guide's US Realm Header
    and CCD StructureDefinitions and its change log's "all document template ids received a new
    extension" at 3.0.0). The factory's `stamp` parameter is a **lookup key, not a value any message
    interpolates**: a member selects a wording this package owns, and anything else falls back to the
    generic entry, which names no stamp. That keeps the module rule intact in substance as well as in
    form. **Do not "improve" this into interpolation to get a better message**, and note the layering:
    `boundTemplateId` already withholds an extension that is not `YYYY-MM-DD`-shaped, so the closed
    table is the SECOND line and `test/phi-diagnostic-surface.test.ts` probes it with a stamp-shaped
    non-member the model bound lets through, because the shared marker cannot reach it.
    **The R2.1 test stays EXISTENTIAL and it beats a later stamp.** A document carrying the resolving
    root twice, once `2015-08-01` and once for a later release, is inside the Schematron rule's context
    and is evaluated under the full R2.1 obligation, in either sibling order. Only the per-templateId
    diagnostic reads this tid's own extension.
    **An unmodelled stamp REPORTS rather than reduces.** `REQUIRED_SECTIONS_NOT_EVALUATED` fires once,
    no `REQUIRED_SECTION_MISSING` fires at all, and `requiredSectionStatus` reports
    `evaluation: "not-evaluated"`. **The R1.1-origin reduction must never be the fallback for a
    document from the future.** It is emitted for **every** recognized type, including the ones whose
    SHALL table is empty: "not evaluated" is a statement about the parse, and making it conditional on
    the table's size would go quiet exactly where a reader cannot tell the two emptinesses apart.
    **`evaluation` is a separate axis from `verification`, deliberately.** `verification` is a claim
    about the TYPE (how much of its obligation was read off the source) and **no option moves it**;
    that invariant is load-bearing and was not repurposed to carry a document-scoped fact.
    **`{ r21Stamped }` is a compatibility contract and was not repurposed either.** A boolean cannot
    hold three states, so `{ stamp }` was added beside it; `requiredSectionKeys("ccd", {
    r21Stamped: false })` returns the same four keys in the same order as at the pin, and `stamp` wins
    when both are supplied.
    **`legacyR11` deliberately does NOT tolerate the unmodelled-release code.** Its grounding is the
    §170.315(b)(1) receive-both requirement, which is about documents from the past; an R1.1
    receive-tolerance profile that silenced a future-release stamp would restore the exact silence this
    change removed. Neither new code is safety-critical, so a consumer who has read the later guide can
    still write their own profile: **no new refusal was added anywhere**, and `{ strict: true }`
    escalates both exactly as it escalates every Tier-2 warning, which is pre-existing opted-in
    behaviour rather than new strictness.
    **Recognizing a release is not targeting one.** `CCDA_CONFORMANCE_RELEASE` is `"R2.1"` and is the
    exported answer to "which release does this validate against". Regulation still adopts R2.1 and
    SVAP is voluntary, so **recognizing `2024-05-01` retargeted nothing**; only a change that moves
    that value does. 4.0.0 also relaxed the US Realm Header and 5.0.0 added a Pregnancy Section, and
    **neither is modelled**: knowing which guide a document was written for is the whole of the claim.

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

### The CLAUDE.md imperative for NULL_FLAVORS, as it stood before the 2026-08-07 relocation

`CCDA-CLAUDE-MD-OVER-BUDGET` shortened this trap's one-line imperative in `CLAUDE.md`. Nothing was
deleted; the imperative as it stood is reproduced here verbatim.

  - **`NULL_FLAVORS` is the WHOLE v3 NullFlavor code system, seventeen concepts** (it was eight).
    **Transcribe from the published code system, never from memory** (the missing set was first
    written down as seven and is nine). Retired `NP` is admitted deliberately. Widening did not
    weaken the PHI bound it carries: membership in a closed set of literals this package owns, never
    a shape test. **The strict column moves on 22 of the 51 rows and that is the intended effect;
    do not "fix" it back.** **The first measurement had no strict column, and that is why it passed
    a broken slice.** Expect the 32-row numbers from `test/dead-diagnostics-matrix.test.ts` and the
    51-row numbers only from the wider hand-run. **If you touch `NULL_FLAVORS`, the namespace sweep
    or `position.templateId`, re-run that file against the previous tree and diff before you update
    its snapshot; the list is public surface and a published version never moves backwards.**
    Why: `documentation/agent-notes.md#the-v3-nullflavor-code-system-has-seventeen-concepts`

## The safety-critical codes export is a frozen view

  - `SAFETY_CRITICAL_CODES` is a frozen read-only view, not a `Set` instance: every read operation
    works (including spread), but `instanceof Set` is `false`.

## The required-section SHALL tables and their provenance

  - **An empty asserted set is no longer ambiguous, and that is the whole point of the state.**
    Every one of the twelve types carries a `verification` in `REQUIRED_SECTION_TRACE`
    (`src/parser/required-sections.ts`), surfaced by `requiredSectionStatus` /
    `requiredSectionStatuses`: `traced-complete`, `traced-partial`, `untraced`, `not-applicable`.
    Empty still never means "this type has no requirements"; the state says which emptiness it is.
    **Do not broaden or narrow an untraced set without the Schematron in hand**, and do not read a
    recorded conformance id as a traced state.
  - **A state is a claim about what was READ for that type, never about what the repository has ever
    cited, and that reading was chosen deliberately.** `traced-complete` asserts that every SHALL
    section the source names for the type is asserted, which is a completeness claim about the
    source. That is why the six rows which already asserted keys (CCD, Discharge Summary, Referral
    Note, History and Physical, Care Plan, Transfer Summary) reported **`untraced`** for a while even
    though the CCD and Referral Note rows carried genuinely traced CONF ids from 2026-08-10:
    inheriting a traced state from an older commit's citation would have published an unchecked
    completeness claim on the most widely exchanged C-CDA type. **Promoting a row out of `untraced`
    means re-reading the source for that row, in its own change; it is never a table edit.** Those
    six were re-read on 2026-08-25 and the section below records what that cost.
  - **THE SIX RE-READ ROWS, AND THE TWO DEFECTS THE RE-READ CLOSED.** Read off the document-level
    `errors` and `warnings` rules of the normative C-CDA R2.1 Schematron, revision 2025-09-08 (the
    artifact's own last manual-update entry, not the date it was fetched). **`untraced` is now
    reported by NOTHING**, and the state is kept in the union only because it is the honest value
    for a type nobody has read.
    - **Discharge Summary was wrong in BOTH directions, and one of them mis-flagged a conformant
      document.** It asserted `dischargeMedications`, which the source states as a **SHOULD** in
      that document's **warnings** rule (CONF:1198-30525), so a conformant Discharge Summary with no
      Discharge Medications section drew a false `REQUIRED_SECTION_MISSING`. And it omitted Plan of
      Treatment (-30528), which the **errors** rule requires unconditionally and this catalog
      recognizes. **Withdrawing the SHOULD and adding the SHALL are the same fix with the sign
      flipped, and neither half is optional.** Hospital Course (-30522) is a third unconditional
      SHALL, outside this catalog, so it is enumerated in `unasserted` rather than asserted or
      dropped. **Do not re-add `dischargeMedications` as a key.**
    - **History and Physical asserted ONE of the ten SHALL sections its errors rule names.** Six more
      are catalog keys and are asserted now (Family History -30584, Past Medical History -30588,
      Medications -30596, Results -30606, Social History -30610, Vital Signs -30612, beside the
      pre-existing Allergies -30572). Three are outside the catalog (General Status -30586, Physical
      Exam -30598, Review of Systems -30608). **Transfer Summary asserted three of six**; Results
      -28288, Vital Signs -28292 and Reason for Referral -31343 joined them, all six in catalog.
    - **CCD, Referral Note and Care Plan were confirmed unchanged**, which is a result rather than a
      non-event: CCD (six of six) and Care Plan (two of two) are `traced-complete`, Referral Note is
      `traced-partial` on its Assessment/Plan choice (-29102) alone. **Nothing on the published
      surface moved for those three, in either the stamped or the unstamped reading.**
    - **THE STAMP RULE IS THE SAME ASYMMETRY THE CCD ROW ESTABLISHED, applied uniformly.** Every one
      of those six document-level rules carries `@extension='2015-08-01'` in its context predicate.
      A key **first asserted** from such a rule is added to `R21_SCOPED_SECTIONS` (Plan of Treatment
      for Discharge Summary, six of the seven for History and Physical, three of the six for
      Transfer Summary); a key that predates the trace keeps its unstamped reading, because
      narrowing it would be as unsourced as broadening it and there is still no R1.1 Schematron in
      hand. **A WITHDRAWAL is not scoped**: `dischargeMedications` leaves the unstamped reading too,
      because "no sentence made this unconditional" does not depend on a stamp. So an unstamped
      document is asserted exactly as it was at `0.0.15` **except** where a key was withdrawn, which
      is the one deliberate exception and is in the safe direction.
    - **A CHOICE IS ONE ROW, NOT A ROW PER ALTERNATIVE.** `unasserted` records one entry per
      conformance statement, whose `sourceName` enumerates the alternatives the source names
      ("Chief Complaint and Reason for Visit Section, or a Chief Complaint Section, or a Reason for
      Visit Section"). Splitting a choice into a row per alternative would record ONE id against
      SEVERAL sections, which `test/required-sections.test.ts` forbids by invariant. **A SHOULD is
      not recorded in `unasserted` at all**: that list is SHALL sections left unasserted, and
      listing a SHOULD there would restate the exact error the Discharge Summary row was carrying.
    - **`status.source` is the artifact and the ARTIFACT'S revision, never the read date.** The
      C-CDA R2.1 Schematron's head comment records a base generation date (9/2/2022) followed by a
      dated manual-update log; the revision is the last entry in that log. **A re-read that changes
      nothing must not move it, and a newer publication must move it even if nobody has looked
      yet**: that is the only shape in which a consumer can detect staleness without re-deriving
      the tables.
  - **An earlier pass read five types off the normative R2.1 Schematron (2026-08-18) and the result
    was mostly NOT keys.** Consultation Note gained three (History of Present Illness CONF:1198-28907,
    Allergies -28911, Problems -28929, **all three stamp-scoped**, because the rule context carries
    `@extension='2015-08-01'`). Progress Note, Procedure Note, Operative Note and Diagnostic Imaging
    Report gained **nothing**, and that is the correct traced outcome, not a failed trace: every
    SHALL section their templates name is either outside this parser's recognized catalog
    (Complications, Procedure Description, Anesthesia, Findings (DIR), and the rest) or a choice
    (the Assessment/Plan pair). **Each one is named with its id and its reason in
    `REQUIRED_SECTION_TRACE`, so "we assert nothing here" is auditable rather than silent.**
    **A key with no source is never asserted, whatever that costs a milestone.**
  - **Unstructured Document is `not-applicable`, decided structurally and confirmed both ways.** Its
    R2.1 template's component SHALL contain exactly one `nonXMLBody` (CONF:1198-31086) and the rule
    names no section at all, so there is no obligation to trace; `buildDocument` only reaches
    `validateRequiredSections` through a `structuredBody`, so the parser already agreed. **If a later
    reader finds a section SHALL for this type, the state is wrong and the fix is a re-trace, not a
    key.**
  - **The CCD row's own trace (2026-08-10)** is at
    `#the-ccd-shall-set-settled-against-the-normative-schematron` below, unchanged by any of this.

## The published version line names no version

  - **Relocated out of `CLAUDE.md` 2026-08-10** to buy budget for the CCD SHALL-set trap below, per
    ADR 0023's relocate-never-delete remedy. The narrative, kept verbatim: that Status bullet named
    `0.0.10` (re-derived from the registry 2026-08-04), where the line had said `0.0.4`, and `0.0.2`
    before that. **It has been stale every single time anyone checked it**, which is the whole reason
    the line now names no version and defers to `npm view @cosyte/ccda version`. The imperative
    itself stayed in `CLAUDE.md`; only the history moved here.

## The CCD SHALL set, settled against the normative Schematron

  - **THE DISAGREEMENT, AND WHAT IT COST.** Three places in this tree named three different CCD
    SHALL sets. `build-ccda.ts` named **five** `shallSections` **including** `vitalSigns`;
    `required-sections.ts` named **four**, **excluding** it; and this project's roadmap, which lives
    outside this repo, named **six**, adding Social History. The live consequence
    was an asymmetry between the two halves of this package: **`buildCcda` always emitted Vital
    Signs while `parseCcda` would not warn when a third-party CCD lacked it.** `#98` was held to the
    no-guessing rule and neither half was allowed to pick a set, correctly: a clinical conformance
    set without normative grounding is exactly what that rule refuses.
  - **THE SOURCE, AND THE EXACT ROUTE.** The artifact is **public, unauthenticated, and needed no
    licence click-through, no HL7 account and no
    payment**: HL7 publishes it in its own GitHub org at
    `github.com/HL7/CDA-ccda-2.1`, path
    `validation/Consolidated CDA Templates for Clinical Notes (US Realm) DSTU R2.1.sch`, fetched
    over `raw.githubusercontent.com` (HTTP 200, **1,010,531 bytes**, sha256
    `04be58046a675735616e46cf52053688a2fc9d0c88010f14fd1c5a2f4ca5bd54`). Its header carries the
    Lantana Consulting Group "AS IS" warranty disclaimer. That repo's README states its contents
    were copied from the HL7 SDWG SVN repository, which is no longer updated, and that errata now
    land in the GitHub copy. **The file is NOT vendored into this repo** (it is a 1 MB third-party
    artifact on a public package); re-fetch it from that path when you need it again.
  - **THE ANSWER: SIX.** The CCD document-level template (`2.16.840.1.113883.10.20.22.1.2`,
    `@extension` `2015-08-01`) has exactly **one** rule context in the file, and its `-errors`
    abstract rule asserts six sections:
    Allergies and Intolerances (entries required) (V3) **CONF:1198-30662**;
    Medications (entries required) (V2) **-30664**;
    Problem (entries required) (V3) **-30666**;
    Results (entries required) (V3) **-30670**;
    Social History (V3) **-30688**;
    Vital Signs (entries required) (V3) **-30690**.
    Procedures (**-30668**) and Plan of Treatment (**-30686**) are in the **`-warnings`** rule as
    SHOULD, so neither is SHALL and neither is asserted.
  - **HOW IT WAS VERIFIED, AND WHY THAT MATTERS.** A label proves a label exists, not that its body
    carries the sentence. Each of those eight CONF ids was grepped for as a **sentence** and each
    returned **exactly one** hit. The rule contexts naming the CCD root were enumerated to confirm
    there is no second, competing CCD context (e.g. an unversioned one) carrying a different set.
    **So the roadmap's six was right all along and both call sites in this repo were wrong** -- the
    parser by two sections, the builder by one. **Do not "restore" four or five.**
  - **WHAT LANDED.** Both call sites now name the same six. `required-sections.ts` gained
    `socialHistory` + `vitalSigns`; `build-ccda.ts` gained `socialHistory` to its
    `ShallSectionKey` union, its `DOC_TYPE_SPECS.ccd.shallSections`, and the `shallSection`
    dispatch. The roadmap needed no change and **was not touched** (it lives outside this repo).
  - **THE DUPLICATE-EMIT TRAP.** Social History was previously emitted by a populated-only
    conditional. That conditional still exists, because document types whose SHALL set excludes
    Social History (the Referral Note) still need it. It is now guarded by
    `!shall.has("socialHistory")`. **Without that guard a CCD carrying a smoking status emits the
    Social History section TWICE**, silently. A test pins the single-emit.
  - **WHY AN EMPTY SOCIAL HISTORY IS CONFORMANT, AND WHY THAT IS NOT LUCK.** An unpopulated SHALL
    section is emitted as a `nullFlavor="NI"` shell. For Social History that shell is **fully**
    conformant: the section's own errors rule requires only `code` (CONF:1198-14819), `title`
    (-7938) and `text` (-7939), and its Smoking Status entry is **SHOULD** (CONF:1198-14823), so no
    clinical fact is invented. Social History (V3) also has **no entries-required variant**, so the
    shell still carries the exact `@root`/`@extension` pair CONF:1198-30688 names.
  - **THE REFUTER CAUGHT A REAL DEFECT, AND IT IS THE LESSON OF THIS WHOLE ENTRY: A CONF ID IS
    SCOPED BY ITS RULE CONTEXT, NOT JUST BY ITS ASSERT.** The first cut of this slice read the six
    asserts and **not** the predicate they hang under. That rule's context is
    `cda:ClinicalDocument[cda:templateId[@root='…22.1.2' and @extension='2015-08-01']]`, so all six
    CONFs bind an **R2.1-stamped** CCD and say nothing about a CCD carrying the same root with no
    `@extension` (an R1.1-origin document). Because `documentTypeForOid` resolves the type from the
    **root alone**, that first cut asserted `socialHistory` + `vitalSigns` against R1.1-origin CCDs
    and produced false SHALL violations. It was worse than a stray warning:
    `REQUIRED_SECTION_MISSING` is in `SAFETY_CRITICAL_CODES`, so **no profile could tolerate it**,
    including `legacyR11`, whose entire reason for existing is that document class. It also broke
    this very file's own standing rule that the tables assert only **unconditional** constraints.
  - **THE FIX, AND WHY IT SCOPES ONLY TWO OF THE SIX.** `R21_SCOPED_SECTIONS` names the keys whose
    SHALL is version-scoped (`ccd`: `socialHistory`, `vitalSigns`), and they are dropped when the
    document is not R2.1-stamped. The **discriminator was already computed** and merely thrown away:
    it is the same test that raises `TEMPLATE_EXTENSION_ABSENT`, so `recognizeDocumentType` now
    reports it instead of recomputing it. **The pre-existing four are deliberately NOT scoped.**
    They were asserted for every CCD before the Schematron was in hand, and narrowing them would be
    exactly as unsourced as broadening them: **there is no R1.1 Schematron in hand.** So an unstamped
    CCD is asserted precisely as it was before this slice. **This is NOT a claim that R1.1 omitted
    Social History or Vital Signs** - it is the absence of a source, recorded as silence instead of
    guessed in either direction. If the R1.1 Schematron is ever obtained, give R1.1 its **own traced
    row**; never assume this one covers it.
  - **THE RESIDUAL THIS SLICE DID NOT FIX, STATED.** That last point does **not** generalize. The
    other five CCD SHALL sections are **entries-required** templates, and `emptySection` emits the
    base root only, dropping the `.1` template. So a CCD built with, say, no vital signs carries
    `…22.2.4` but not `…22.2.4.1`, and therefore does **not** satisfy CONF:1198-30690 as written.
    That is a deliberate, pre-existing trade (an entries-required section with zero entries violates
    its own SHALL entry constraint) and it predates this slice, applying equally to Allergies,
    Medications, Problems, Results and Vital Signs. **It is filed, not fixed, and "a built document
    round-trips with zero warnings" still does not mean "a validator would pass it".**
  - **A SECOND, SEPARATE PRE-EXISTING DEFECT, FOUND BY THE REFUTER AND DELIBERATELY NOT FOLDED IN:
    every CCD `buildCcda` emits fails CONF:1198-30664.** That assert tests the Medications Section
    (entries required) at `@root='…22.2.1.1'` **`and @extension='2014-06-09'`** (the V2 stamp).
    `medicationsSection` calls `sectionElement` without an extension argument, so the parameter
    defaults to `R21` and the emit carries `extension="2015-08-01"` on `…22.2.1.1`, **a stamp no
    C-CDA template carries**. It is on `main` too, so it is pre-existing, and it is a section-level
    slip rather than a knowledge gap: the repo already holds `MED_EXT = "2014-06-09"` and applies it
    correctly to the medication **entry** templates (`…22.4.16`, `…22.4.23`). It mis-reads no dose,
    allergy, code system or identifier, so it is not stop-the-line, but **it should be its own item
    ahead of further CCD conformance work.** It is also why `docs-content/quickstart.md` calling its
    sample "spec-conformant" is strictly still overclaiming: the sentence *this* slice added is
    correctly scoped to `REQUIRED_SECTION_MISSING` and is true, but the older adjective is not.
    **Do not fix it by widening the SHALL tables; it is an emit bug, not a validation bug.**
    **It is the largest open conformance gap in this package, and this slice deliberately did not
    widen any sentence to cover it**: everything the slice added is scoped to
    `REQUIRED_SECTION_MISSING`, never to "conformant" in general.
  - **THE SCOPING PREDICATE IS EXISTENTIAL, AND FIRST-MATCH-WINS IS A DIFFERENT PREDICATE.** The
    refuter's second pass caught that `r21Stamped` originally read only the extension of the tid
    that happened to resolve the document type. The Schematron context is
    `cda:ClinicalDocument[cda:templateId[@root='…' and @extension='2015-08-01']]`, which matches when
    **ANY** templateId carries both, in any order. A document carrying the bare root **first** and
    the stamped root second is inside the rule's context, yet first-match-wins read it as unstamped
    and **silently dropped two safety-critical warnings on sibling ordering alone**. That dual-stamp
    shape is the ordinary backward-compat form (our own section-author guidance emits it), not an
    exotic one. Fixed by scanning all `templateIds` for the root+extension pair, so **the code
    matches the XPath its own docblock quotes**; all four orderings are pinned by test. **The
    remedy chosen was to fix the code, not to downgrade the docblock**, because a dropped
    safety-critical warning is worse than a false one.
    **`TEMPLATE_EXTENSION_ABSENT` was deliberately NOT re-pointed at the existential test** and
    keeps its narrower meaning ("the tid that resolved the type carried no stamp"), so a
    dual-stamped document can raise it while still being R2.1-scoped. Widening that warning is a
    separate, reviewable change to established behaviour.
  - **FILED, NOT FIXED (three, all from the refuter, none absorbed into this slice).**
    (1) **`editCcda` is not threaded**: `edit-ccda.ts` takes the default six-key reading, so an
    R1.1 document is *edited* under a stricter set than it is *parsed* under. Verified fail-closed
    and exotic: the delta shape (`newlyMissing = missingAfter.filter(k => !requiredBefore.has(k))`)
    puts the scoped keys in `requiredBefore`, so they can never be newly missing; the one exposed
    path is replacing a section that carried a nested `vitalSigns`/`socialHistory` subsection, which
    would raise `CcdaEditError` citing an R2.1-scoped clause on an R1.1 document. **`CcdaDocument`
    does not expose the stamp, so threading it is a public-surface change, not a one-liner.**
    (2) The Medications `@extension` defect above.
    (3) **Nothing in CI validates an emit against the Schematron**, so every CONF id this code now
    cites is unenforced. A harness running even one golden document through the `.sch` would have
    caught (2) and the entries-required residual mechanically. **File it; it is a real gate, not
    worker coordination, but it is its own slice.**

## The Medications section stamp is 2014-06-09

  Closes item (2) of the three the SHALL-set slice filed. Landed 2026-08-10.

  **Provenance: PRIMARY, single artifact, hash-pinned.** No `deep-research` fan-out and no secondary
  source was used or needed: every conformance claim below is read directly off the **normative**
  Schematron HL7 publishes, 1,010,531 bytes, sha256
  `04be58046a675735616e46cf52053688a2fc9d0c88010f14fd1c5a2f4ca5bd54`, fetched fresh and hash-checked
  before it was read. The `conformance-refuter` **independently re-fetched and re-hashed it** and
  re-walked the abstract-rule chain, the sentence-uniqueness check and the both-roots sweep from the
  bytes rather than from this write-up. **⚠ THAT VOUCH WAS ITSELF ONE SENTENCE TOO BROAD WHEN IT WAS
  WRITTEN, AND PASS 2 CAUGHT IT:** the Referral Note's CONF id below was **not** read off the
  artifact, it was assumed from the CCD's (see the correction bullet). It is now, and the vouch holds
  as written - but **an umbrella "everything below is sourced" is only ever as true as its weakest
  claim, and it hides that claim rather than flagging it.** Prefer citing per claim.
  **The residual risk is drift, not sourcing:** the six-row
  table in `test/builder.test.ts` is a **hand transcription** that names that sha256 in a comment,
  and **nothing in CI re-verifies the hash**, so the table can silently diverge from the artifact it
  cites. That is the same gap as open item (3) and is closed by the same harness.

  - **THE SIX CCD SHALL SECTIONS DO NOT SHARE ONE STAMP, AND THAT IS THE WHOLE LESSON.** Each of the
    six asserts tests a `@root` **and** an `@extension`, as a pair. Five are `2015-08-01`: Allergies
    `…22.2.6.1`, Problem `…22.2.5.1`, Results `…22.2.3.1`, Social History `…22.2.17`, Vital Signs
    `…22.2.4.1`. **Medications `…22.2.1.1` is `2014-06-09`.** `medicationsSection` called
    `sectionElement`/`emptySection` without an extension argument, so both took the `R21` default and
    emitted `…22.2.1.1` under `2015-08-01`, failing every CCD and every Referral Note this builder
    produced, each against **its own document type's** Medications assert: a CCD **CONF:1198-30664**,
    a Referral Note **CONF:1198-30923**. Fixed by adding `MED_SECTION_EXT` and passing it at both
    sites. **Read the pair, never the root alone: the right root under the wrong stamp fails the CONF
    exactly as completely as omitting the section.**
  - **🛑 AND THE CONF ID THAT WENT WITH IT WAS WRONG FOR ONE OF THE TWO DOCUMENT TYPES, IN THREE
    COPIES, CAUGHT BY `#107`'s PASS 2 (2026-08-10, fixed in [`#108`](https://github.com/cosyte/ccda/pull/108)).** The original write-up attributed the Referral
    Note's failure to `1198-30664` as well. **It cannot fail that CONF**: `1198-30664` sits in the
    `…22.1.2` (CCD) pattern, whose concrete rule context selects only a `…22.1.2`-stamped
    `ClinicalDocument`, and `buildCcda({documentType:"referralNote"})` emits `…22.1.1` + `…22.1.14`
    and never `…22.1.2`. The Referral Note's equivalent is **`1198-30923`** (sentence-unique,
    pattern `…22.1.14`).
    **🛑 AND THE FIRST CORRECTION CITED THE WRONG ONE OF THE TWO, WHICH IS THE REAL LESSON HERE.**
    Pass 2 named `1198-30922` and the fix adopted it; reading the assert's **full sentence** rather
    than its label showed `30922` is the **COMPONENT** requirement, the analogue of the CCD's
    `1198-30663`, while the **SECTION** requirement naming this template is the id nested after
    *"such that"*: CCD `1198-30664`, Referral Note `1198-30923`. **Every one of these asserts carries
    two CONF ids and the `<sch:assert id>` is the component one**, so citing the `@id` for a section
    requirement is wrong by exactly one and looks entirely plausible. Caught before merge by the
    author, on `f907c64`, and fixed in `136d8c7` rather than by amending a sha under grading.
    **▶ THIS IS THE `CLAUDE.md` TRAP "re-check a refuter's spec claim exactly as hard as your own"
    firing a second time, and it very nearly shipped to four sites again.** A refuter's CONF id is
    evidence, not an answer. **The general rule, now paid for twice: the assert LABEL is not the
    sentence. Search for the sentence, require exactly one hit, and read which of its ids names the
    thing you are actually citing.**
    **▶ TWO MORE DOCUMENT TYPES ASSERT THE SAME STAMP, neither of which this builder emits**, so
    they bound the claim rather than widening it: Transfer Summary (`…22.1.13`, SHALL, section CONF
    `1198-28278`) and Consultation Note (`…22.1.4`, **SHOULD**, in the `-warnings` pattern, section
    CONF `1198-28926`). Four asserts in total require `…22.2.1.1` at `2014-06-09`; **only the CCD's
    and the Referral Note's are reachable from `buildCcda`.**

    **The SUBSTANCE was right and only the citation was wrong** - both asserts
    are byte-identical in their `test` XPath, both requiring `…22.2.1.1` at `2014-06-09`, so one fix
    genuinely does correct both document types. **The error is the SAME rule-context misreading that
    refuted `#106` pass 1: an assert was read without following the rule that selects it.** That is
    now three times in this repo. **Reading the assert body is never enough; walk to the concrete
    rule's `context` and check the document actually falls inside it.** Corrected in all three
    copies at once (`build-ccda.ts` docblock, the pending changeset, this note) per `#82` pass 3's
    "fewer copies, not more careful copies". **It never published:** the changeset was still pending
    and `CHANGELOG.md` carried no copy, so no wrong CONF id ever reached the registry.
  - **RE-MEASURED, NOT INHERITED, AND THE RULE CONTEXT IS THE PART THAT BITES.** `1198-30664` is
    **sentence-unique** (exactly one hit in the 1,010,531-byte `.sch`, sha256
    `04be58046a675735616e46cf52053688a2fc9d0c88010f14fd1c5a2f4ca5bd54`). Its enclosing
    `<sch:rule>` is `…22.1.2-2015-08-01-errors-abstract`, which is **`abstract="true"` and carries no
    `context` at all**. The selecting context comes from the concrete rule that `sch:extends` it:
    `cda:ClinicalDocument[cda:templateId[@root='…22.1.2' and @extension='2015-08-01']]`, an
    **existential** predicate over the document's `templateId` children, i.e. an R2.1-stamped CCD.
    **Reading the assert's nearest enclosing rule and stopping there gives you an abstract rule and
    no context** -- the same shape that got `#106`'s pass 1 refuted.
  - **CORROBORATED TWO WAYS.** The `.sch` carries `cda:section` rule contexts for **both** Medications
    roots (`…22.2.1` and `…22.2.1.1`) at `2014-06-09`, and **zero** rule contexts for either root at
    `2015-08-01` -- R2.1 revised this section at `2014-06-09` and never re-issued it. The Referral
    Note's own errors rule (`…22.1.14`) requires the same `…22.2.1.1:2014-06-09`, confirming the
    section template's identity is **document-type independent**, so one fix corrects both emitters.
  - **WHY A ROOT-ONLY TEST NEVER CAUGHT IT.** The pre-existing test asserted
    `xml).toContain("2.16.840.1.113883.10.20.22.2.1.1")` -- the root, with no stamp -- and passed
    throughout. The new tests assert the **pair**, and additionally assert the `2015-08-01` pair is
    **absent**, so a reverted default reds rather than passing vacuously.
  - **NOT A WIDENING OF THE CONFORMANCE CLAIM.** *That CONF* now passes for a populated document.
    Nothing here upgrades the package's general conformance claim, because item (3) is still open and
    **nothing mechanically enforces the rest**. "A built document round-trips with zero warnings"
    still does not mean "a validator would pass it".
  - **THE EMPTY-DOCUMENT CASE IS NOT CLOSED AND IS NOT CLOSEABLE HERE.** A CCD with no medications
    emits the entries-**optional** root only, because declaring entries-required with zero entries
    violates its own "SHALL contain at least one entry". Such a document still fails `1198-30664`.
    That is inherent to having no medications, not a residue of this fix, and it applies equally to
    Allergies, Problems, Results and Vital Signs. **Do not "fix" it by emitting `…22.2.1.1` on an
    empty section**; that trades one violation for a worse one.
  - **WIRE FORMAT.** The emitted bytes change on every document carrying a Medications section, so
    a consumer keyed on the exact old pair stops matching. It is not a breaking API change: this
    package's own parser, `sectionForTemplateRoot` and `EDITABLE_SECTIONS` all match on **root
    alone**, so parse, edit and section lookup are unaffected, and the old pair was **unsatisfiable
    by any rule in the IG** -- no conformant consumer could have been keyed on it. `patch` on the
    `0.0.x` ladder (ADR 0001).
  - **ITEM (3) WAS WEIGHED AND DECLINED, DELIBERATELY.** A real Schematron harness needs an XPath
    engine (`@xmldom/xmldom` has none) plus correct `sch:extends` expansion, phase handling and
    first-rule-wins semantics. Getting rule-context semantics *wrong* in a harness would be worse
    than having none -- that is precisely this defect's family. And the `.sch` is deliberately not
    vendored, so a CI harness first needs a fetch-or-vendor decision. **It stays its own slice.**
    What landed instead is a **transcription of the six asserts** with the source sha256 recorded:
    it pins this defect class for the six SHALL sections and **nothing wider**, and it is not a
    validator. Do not describe it as one.

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

### The CLAUDE.md imperative for the public-surface gate, as it stood before the 2026-08-07 relocation

`CCDA-CLAUDE-MD-OVER-BUDGET` shortened this trap's one-line imperative in `CLAUDE.md`. Nothing was
deleted; the imperative as it stood is reproduced here verbatim.

- **Public-surface gate present and reporting, but NOT yet blocking** (`PUBLIC-SURFACE-HYGIENE`).
  `pnpm check:no-internal-refs` is on the meta-repo's `verify.sh` ladder, but its context is not in
  `parser-ci-required-checks`, so it is visible on every PR and blocks nothing; **closing that is a
  ruleset change, not a file change.** **Ported from `ncpdp`'s copy, NOT `hl7`'s** - a "resync with
  hl7" that restores `RULE_COUNT=6` deletes rule 7, and the script refuses to run if it does.
  **Measure the doc comments first, and quote a count with the tree it was taken on**: the markdown
  surface alone under-counts by roughly 30:1 here. **The prefix list, designation exclusions, phase
  guards and self-test samples are re-derived for C-CDA and must not be inherited wholesale.**
  `CHANGELOG.md` is exempt org-wide (founder, 2026-07-29): do not re-litigate it, do not sweep it.
  Known residual: five `//` line comments are out of scope by convention.
  Why: `documentation/agent-notes.md#the-public-surface-gate`

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

### The CLAUDE.md imperative for the em-dash gate, as it stood before the 2026-08-07 relocation

`CCDA-CLAUDE-MD-OVER-BUDGET` shortened this trap's one-line imperative in `CLAUDE.md`. Nothing was
deleted; the imperative as it stood is reproduced here verbatim.

- **Em-dash gate present AND BLOCKING.** `U+2014` is banned outright by
  founder directive, and **when it goes red the fix is never to re-encode the character**: rewrite
  with a period, colon, comma or parentheses. **This line said "NOT yet blocking" and was stale**:
  the settings change it called for has landed, and `no-emdash` is a required status check via the
  repository-level `emdash-required-check` ruleset, active on the default branch (re-read from the
  API 2026-08-06). **Re-read the rulesets rather than this line.**
  It scans every tracked file **except the script itself**, **and** the
  PR title, body and commit messages, so **keep the script free of the literal character.** **It is
  the text-only variant, and dropping `grep -I` is the load-bearing part**: `src/profiles/merge.ts`
  carries raw NULs and would otherwise be **silently exempt** from a ban with no exceptions, which
  is not theoretical (PR #52's sweep skipped that exact file and left a live character behind).
  **Do not swap in `website`'s variant**, and do not reach for `pathways`' `git check-attr binary`
  without first adding a `.gitattributes`. **Do not trust a copy count written down anywhere,
  including here** - enumerate at carry-back time. Scope, stated honestly: **the gate covers new
  text only, does not rewrite history, and 113 em dashes are already in commit messages on `main`.**
  Why: `documentation/agent-notes.md#the-em-dash-gate`

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

### The CLAUDE.md imperative for the attw wrapper, as it stood before the 2026-08-07 relocation

`CCDA-CLAUDE-MD-OVER-BUDGET` shortened this trap's one-line imperative in `CLAUDE.md`. Nothing was
deleted; the imperative as it stood is reproduced here verbatim.

- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI** (`ATTW-FALSE-GREEN-PORT`). **A false red costs an hour; a false green merges.** The
  race only supplies the condition; it is not the defect, so **the answer is not a lock, a lease or
  a build queue** - the gate must be able to say its own inputs were missing, whatever removed them.
  `scripts/attw.mjs` carries **THREE guards, not two**: a preflight that every relative path
  `package.json` promises exists **and is non-empty** (a zero-byte `index.d.ts` is a second, quieter
  false green), a post-check on `attw`'s untyped sentence, and a backstop that fails when `attw`
  exits 0 having printed nothing at all (**pinned by no test, a stated gap rather than an
  oversight**). **Blinding options are refused BY OPTION NAME, wholesale,
  not by value, and short options BY LETTER ANYWHERE IN THE CLUSTER, not by whole token** - `-fjson`
  is the one a `split("=")[0]` token test lets straight through, measured back to **exit 0** on this
  repo's real manifest. **`.npmignore` versus `files` is about the file's DEPTH, not its existence.**
  `test/scripts/attw-gate.test.ts` pins both nets, the upstream exit-0 itself, a real failure and a
  negative control; **do not carry its "16 of 21" figure forward, re-measure it.** **This is a
  per-repo script** and a sibling still invoking the CLI directly still has the defect; do not write
  a repo count down here, derive it. `scripts/verify.sh` in the meta-repo **must not be touched** for
  this. **The guard is described in four committed files and three corrections have landed in some
  copies and not others: prefer CUTTING a copy to adding a more careful one.**
  Why: `documentation/agent-notes.md#the-attw-wrapper-script`

## The corpus every phi-scan route read past

`PHI-SCAN-WALK-ROOT-SCOPE`, closed here 2026-08-08. **The class is: a PHI gate prints `OK - no hits`
and exits 0 over tracked files no route ever opened.** In the siblings it shows up as a walk rooted
at `src/` + `test/fixtures/`, which leaves everything else under `test/` scanned by neither route.

**THAT FORM DID NOT EXIST HERE, AND SAYING SO IS THE POINT OF THE ITEM'S OWN RULE. Re-derive per
repo; never port a residual.** This repo's walk is rooted at the **repo root**, so enumeration was
already maximal and the sibling defect was structurally absent. What was open was a different shape
with the same effect, and it was found only by measuring `ccda`'s own tree.

**THE CENSUS, DERIVED FROM `git ls-files` RATHER THAN WRITTEN DOWN.** Base `941afff`: **140 tracked,
96 reached by some detector on the sweeping routes, 44 by neither, 4 of those under `test/`.** Head,
same 140-file corpus: **139 reached, 1 by neither** (`test/scripts/phi-scan.test.ts`), which is also
the only remaining file under `test/` in neither. **43 files newly opened.** Both counts are of the
tree each was measured on, and neither is a claim about now: the `.changeset/` entry shipping this
raises the tracked and the reached figure by one each until a release consumes it, and `git ls-files`
re-derives the real answer in a second. Three separate causes, closed on their own terms:

1. **16 `.md` were dropped BY THE WALK before a byte was read**, and dropped again by `--staged`.
   They are enumerated now and scanned like any other target, structured scan included.
2. **24 were READ and then scanned by nothing**, because the conservative shape pass was bounded to
   `src/` + `scripts/` JS/TS by `isSourceCode`. Among them the three `scripts/*.sh` gates, which the
   scanner's own docblock already described as covered, plus `tsup.config.ts`, `vitest.config.ts`,
   `eslint.config.js`, every workflow, `LICENSE` and the JSON manifests. The shape pass now runs on
   **every** observed target with no path exemption at all.
3. **4 were the `test/scripts/` PREFIX exclusion**, whose stated reason (the gate's own
   negative-control literals) covers **exactly one file**. Narrowed to that literal path. **Say "the
   two sweeping routes", never "every route": `EXCLUDED_PATHS` is consulted in `buildTargetsForAll`
   and `buildTargetsForStaged` and nowhere else**, so naming that file on the command line still
   scans it, and always did. A draft of this note said "every route", which is the same
   two-versus-three miscount as the `INTRODUCED` below, restated in the text written to fix it, and a
   sentence 12 lines further on in the scanner still carried it after the first correction. The
   direction is safe, but **do
   not "finish the job" by wiring the set into `buildTargetsForPaths`**: that turns a two-route
   exclusion into a total one.

**🛑 COUNT THE ROUTES. THERE ARE THREE, AND THE FIRST DRAFT WAS REFUTED `INTRODUCED` FOR REASONING
ABOUT TWO.** `all` and `--staged` are the sweeping ones. **`paths` (`pnpm phi-scan <file>`, wired in
`package.json`) is the third, and `looksLikeCda` governs it too.** That draft added a
`!isMarkdown(path)` term to `looksLikeCda`, on the argument that it could subtract nothing because no
route read a `.md` at all. **The argument was false, and it was false only on the route it forgot.**
Measured by the refuter: a real C-CDA saved as `notes.md`, carrying a name, a DOB, an SSN by OID, an
MRN, an address and a telecom, went from **nine hits and exit 1 to `OK, no hits` and exit 0** on
`paths`. Two tracked files regressed the same way. **And the mitigation the draft offered was
vacuous: the "shape floor" is EMPTY for a C-CDA**, which carries its SSN as an undashed
`id@extension` and carries no email, so the floor found nothing at all. The term is gone; markdown is
scanned like anything else. **Never write a scope claim about "both routes" in a scanner that has
three, and enumerate the call sites of a dispatch predicate before calling a change to it additive.**

**🛑 `isSourceCode` IS READ IN TWO PLACES WITH OPPOSITE POLARITY, AND WIDENING IT IS A SUBTRACTION
DISGUISED AS A WIDENING.** It ADDS the shape pass in `scanTarget` and SUBTRACTS the structured scan
in `looksLikeCda` (`hasCdaMarker(text) && !isSourceCode(path)`). Adding `.sh` to it, the obvious fix
for cause 2, would have DOWNGRADED any `scripts/*.sh` carrying a C-CDA marker from the full document
scan to shape-only, losing name / DOB / MRN / address / telecom on it. Measured, not reasoned about.
The remedy is to extend the ADDITIVE branch and leave that predicate alone; the guard is written into
its docblock so the next person does not rediscover it. **It is the same defect the `isMarkdown`
draft shipped, one function along, which is why both guards are written down.**

**🛑 THE GRID, ON ALL THREE ROUTES.** Every tracked file was planted with a dashed-SSN payload and
then with a `<family>` name payload, base tree and head tree, `all` / `--staged` / `paths`. Shape
payload: `all` **96 -> 140**, `--staged` **96 -> 140**, `paths` **140 -> 141**, no regression in any
cell. Name payload: `all` **26 -> 39**, `--staged` **26 -> 39**, `paths` **42 -> 40**.
**Non-vacuity: exactly one file is still undetected at head**, the one literal exclusion, so the
clean cells are decisions about a named file rather than a sweep that stopped running.

**🔴 TWO CELLS GO `1 -> 0`, BOTH ON `paths`, AND THEY ARE NAMED RATHER THAN CLAIMED AWAY.** An
earlier draft of this note asserted "nothing `1 -> 0`" and that was measured wrong; do not restore
it. Neither cell is a route that stopped looking:

- **`CHANGELOG.md` loses the structured detectors** (`STRUCTURED_EXEMPT_PATHS`). It is generated
  output that must not be hand-edited, and it quotes this scanner's own negative-control literals
  verbatim, including the entity-encoded `<family>` element that exists to prove the decoder works
  (written out rather than reproduced here, because reproducing it reds this gate: that is how this
  paragraph was first drafted, and the run that caught it is the evidence the widening works). So the
  gate was flagging its own documentation of itself, on a file whose content cannot be edited to fix
  it. **It costs the whole of `scanCda` on that file, all five structured detectors, not just the
  name one** - a draft of this note said "the only name detection", which was measured wrong and must
  not be restored. **NO LOCUS COUNT STANDS HERE, DELIBERATELY, AND THAT IS THE THIRD STATE OF THIS
  SENTENCE: understated once, then corrected with a number transplanted from a different measurement
  that was wrong by an order of magnitude.** A count corrected twice is deleted, not incremented.
  Empty the set and run `phi-scan CHANGELOG.md` when you need the answer; the file is regenerated on
  every release, so anything written down here is stale by the next one. **The upstream bound is real but narrower than that draft
  claimed, and the refuter falsified the draft by measurement:** `.changeset/*.md` gets the
  structured detectors **when it carries a C-CDA marker** (`looksLikeCda` keys on `hasCdaMarker` for
  a `.md`), and gets the dashed-SSN + non-test-email shape pass whatever it carries; but a
  **marker-free** changeset carrying a bare `<given>` / `<family>`, a `<birthTime>`, a bare-numeric
  `<id>` or an address exits **0**. **Be exact about the SSN case rather than folding it in: an
  SSN-rooted `<id>` whose extension is DASHED still exits 1**, because the shape pass catches the
  dashed form in any text. That case is **PRE-EXISTING and identical at base on all three
  routes**, and **it is NOT the "Free-text names" limitation** in `phi-scan-overrides.md`: citing
  that one here is a misattribution, because the predicate that actually gates it is `hasCdaMarker`,
  not prose-versus-markup, and the structured loci are exactly what leaks. The shape pass still runs
  over the changelog, so it is never an unread file. **A predicate ("any generated file") was
  refused; the exemption is one path because one file has the argument.** **The comparison is
  case-SENSITIVE**, so on a case-insensitive filesystem `phi-scan changelog.md` misses the set and
  reds on the changelog's own literals: a false RED, the safe direction. Matching case-insensitively
  was refused because it would exempt a genuinely distinct `changelog.md` elsewhere, a false GREEN,
  and widening an exemption is the one direction this class must never take.
- **`package.json` stops hitting on its own `author` mailbox**, because that one address is now
  DECLARED in the allow-list. Every allow-list entry ever added has this shape: that is what a
  positive synthetic declaration IS. The refused alternatives were `EMAILDOMAIN cosyte.com`, which
  excuses every mailbox at that domain including one carrying a patient name, and a path exemption,
  which would have left the whole manifest unscanned by the sweeping routes.

**A THIRD FILE STOPS HITTING AND IT IS NOT THE SCANNER THAT CHANGED.**
`docs-content/quickstart.md`'s second worked example used a placeholder person name that is not in
the allow-list. The example now reuses the corpus's declared synthetic patient, keeping the distinct
MRN that was the example's actual point. **Measured: the HEAD scanner over the BASE bytes still
reports both tokens**, so the detector lost nothing and the corpus stopped carrying them. Fixing the
corpus was preferred to exempting the page, which is this repo's most example-dense documentation
and must stay fully scanned.

**THE FIRST DRAFT ALSO SHIPPED A PATH EXEMPTION AND IT WAS REPLACED, NOT DEFENDED.** It carried a
`SHAPE_EXEMPT_PATHS` literal holding `package.json`. That is a whole-file bypass of exactly the kind
`phi-scan-overrides.md` already says to prefer a token-level declaration over. Replaced with a new
**`EMAIL <address>`** allow-list tag naming that one mailbox, which is narrower than `EMAILDOMAIN` by
construction and has a test pinning the difference.

**THE UNMERGED-`.md` CARVE-OUT WENT TOO, ON ITS OWN ARGUMENT.** `--staged` refused to refuse an
unmerged `.md` because that was "a class this route never reads AT ALL". Once markdown is a target
the premise is gone, and leaving it would have sent an unmerged `.md` on to `git show :<path>`, which
fatals anyway, under the generic could-not-read message instead of the one that names the conflict.
**The cost is real and stated: a conflict in `CHANGELOG.md` now refuses this route.** The refuter
confirmed the premise that bounds it: `git commit` rejects an unmerged path **before** the pre-commit
hook runs, verified with an instrumented hook that never fired, so no commit path reaches it.

**43 FILES HAND-READ BEFORE THIS SHIPPED**, mechanically for every PHI-shaped token class and then in
**three fresh contexts** for the qualitative read. **Nothing patient-identifying, in any of the 43.**
The full inventory of realistic-shaped tokens in the newly-opened set: person-name tokens `Jane` /
`Doe` / `Q` (allow-listed synthetic), `John` / `Public` (the stock placeholder, in the one docs
example now corrected), and the entity-encoded `&#x53;mith` that is this scanner's own negative
control quoted in two files; identifiers all prefixed-synthetic (`MRN-00042`, `DOC-0001`, and their
neighbours), never bare-numeric; one allow-listed DOB `19800101`; and two addresses,
`changelog@example.com` at a reserved domain and `hello@cosyte.com`. **No street address, no postal
code, no telecom, no dashed SSN anywhere in the 43.** The only assigning-authority OIDs are in HL7's
own `…113883.19` example arc, and the two composite strings that look like a record
(`Doe-Jane-1980.01.01-MRN0012345`, in `CHANGELOG.md` and here) are an authored regex-defeat
demonstration, not a transcription.

**THE ORG-TRACEABLE STRINGS ARE NAMED HERE RATHER THAN SCRUBBED**, because they are public,
non-patient and deliberate, and deleting them would destroy the evidence that the widened scan opened
the files: `hello@cosyte.com` (`package.json` author, now declared by value in the allow-list),
`@NSchatz` (`.github/CODEOWNERS`), the founder's name as ADR decider in
`docs/adr/0001-xml-parser.md`, and the public researcher attributions (`jddamore`, D'Amore et al.,
JAMIA 2014). **Anything patient-identifying would have been different and would have been removed.**

**WRITING DOCUMENTATION IS NOW INSIDE THE GATE, AND NOTHING SAID SO UNTIL THE REFUTER ASKED WHAT THE
CHANGE MAKES NEWLY POSSIBLE.** Markdown, the ADR, this file and the changesets became structurally
scanned. **THE PREDICATE IS `hasCdaMarker`, NOT THE EXTENSION, AND NO FILE LIST OR COUNT STANDS HERE:
two drafts wrote one and both were wrong, the second in the UNSAFE direction because it counted a
page that is outside the gate.** Derive it. One instance is named because that error was safety
relevant: **`docs-content/troubleshooting.md` carries no C-CDA marker** (it mentions
`ClinicalDocument` only in prose, never as an element) and is therefore shape-pass only, so **a
worked example added there is NOT gated by the structured detectors**. Adding a marker to that page
is what would gate it. A worked example or an incident write-up carrying a non-allow-listed `<given>` / `<family>` / `<name>`, a
`birthTime@value`, a bare-numeric 6+ digit `id@extension`, a `streetAddressLine` / `city` /
`postalCode`, or a telecom without the `555` convention now reds a **blocking** gate at pre-commit.
That is the gate working, and it collides head-on with the `agent-notes` contract, which REQUIRES
write-ups. **The two remedies, in order: reuse the declared synthetic tokens, or describe the locus
without reproducing it. Never delete a write-up to get green.** Not hypothetical: this very section
was drafted quoting an entity-encoded name literal and the gate caught it, which is the run that
proves the widening works.

**TWO FINDINGS OUT OF THIS SLICE'S SCOPE, FILED RATHER THAN FIXED**, both surfaced by the hand-read
and neither a PHI question: `docs-content/intro.md`, `installation.md` and `troubleshooting.md` each
state a published version that is stale (the standing rule is that the registry is the only source of
truth); and the `no-emdash` / `no-internal-refs` workflow headers publish quoted founder directives,
org ruleset names, token-permission limits and which sibling repos are currently non-compliant, in a
public MIT repo, on a surface `check-no-internal-refs.sh` deliberately excludes from its own scan.

**🔴 THE EXIT CODE, DERIVED FROM THIS REPO'S CONTRACT AND NOT PORTED, WITH THE HALF THAT DIFFERS FROM
EVERY SIBLING.** `ccda` declares **no scan-root list**: `walk()` has exactly one call site and its
root is `process.cwd()`, which the OS guarantees is a directory, so **the regular-file-root state is
structurally UNREACHABLE here** and the sibling figure describes a configuration this repo does not
have. What the contract says about the class it does reach: any error that is not an
`InvocationError` falls to the process-level net and exits **2**, never 1. Measured rather than
argued, and independently reproduced by the refuter: `EACCES` off `readdirSync` inside the walk exits
**2**; a directory named on the `paths` route exits **2**; a missing allow-list exits **2**;
`ENOTDIR` from the same `readdirSync` call site is a plain system `Error` and takes the identical
route. So **2**, as `hl7` / `fhir` / `cli` / `dicom` and not `terminology`'s 1, but arrived at from
this repo's own net.

**🟢 THE ESCAPE THIS DID NOT CLOSE IS NOW CLOSED, AND THE LINE THAT NAMED IT IS SUPERSEDED RATHER
THAN DELETED.** It read: the gate has no reconciliation against `git ls-files` at all, so it does not
even reach the sibling residual where a reconciliation compares path SETS rather than the bytes git
carries at those paths; what widening buys here is narrowness, the corpus a decoy would have to
mirror going from 96 files to 139. **That was true and it is no longer the state.** The sweep now
reads the bytes git carries as a union with the walk. See
`#the-all-mode-sweep-reads-the-bytes-git-carries`.

## The all-mode sweep reads the bytes git carries

`PHI-SCAN`, the union half, closed here 2026-08-11. **The rule, what it costs, and why the
deduplication is by content are stated ONCE, in `scripts/phi-scan.ts`'s docblock.** This section
carries what a docblock cannot: what was measured, what the premise got right and wrong, and which
sibling lessons did not port.

**THE PREMISE HELD ON SHAPE AND FAILED ON OUTCOME, AND BOTH HALVES MATTER.** The dispatch premise was
"2 `ls-files`, 0 `reconcile`, 0 `WALK_ROOT`, 11 `execFileSync`, so close to the ABSENCE shape". Every
one of those numbers re-measured correct here, with two tools (`rg` and a Node read, because `grep -c`
has now mis-reported a zero three times on this class). The single `ls-files` call fed
`Target.tolerateVanish` and nothing else; there was no reconciliation of any kind.

**BUT THE OUTCOME DID NOT MATCH THE SIBLINGS AND THE HONEST ANSWER IS THE NULL RESULT.** `hl7`,
`mllp`, `astm` and `deid` each found real unscanned corpus sitting in the tree. **`ccda` had none.**
Measured on `dbdf84d`: 140 tracked paths, 140 enumerated by the walk, the only tracked path no
sweeping route opens is `test/scripts/phi-scan.test.ts` (the one declared literal exclusion), and all
140 index blobs are byte-identical to the working tree. **Nothing was hiding. The walk here has been
rooted at the repo root since before this class was filed, and the corpus is ordinary.** Reporting
that is the finding; manufacturing a gap to match a sibling's would not have been.

**WHAT THE UNION CLOSES HERE IS THE STATE SPACE, NOT A LIVE GAP, AND FOUR STATES WERE REPRODUCED ON
BASE AT `exit 0` WITH `OK, no hits`**, each over a TRACKED file holding a whole synthetic patient
identity (name, DOB, SSN by OID, bare-numeric MRN, street, city, postal code, non-555 telecom):

1. **THE PATH IS OCCUPIED BY A DIRECTORY.** `git ls-files` still names the path, `Dirent.isFile()` is
   false, `walk` descends into the directory and scans what is inside, and the tracked blob is never
   read. **This is the decoy-contents shape the class says no repo has closed, and it is the reason
   the remedy had to read OBJECTS rather than re-read paths: a path-set reconciliation cannot see it,
   because the path IS present.**
2. **THE PATH IS UNDER A `WALK_SKIP_DIRS` NAME.** That set is matched by NAME at any depth, so a
   tracked file at `dist/...`, `coverage/...`, `.cache/...` is dropped before a byte is read. Nothing
   tracks such a path today; nothing stops one being added, and the drop is silent.
3. **THE WORKING TREE IS SHORT.** Removing 137 of the 140 tracked files still printed `OK, no hits`
   at exit 0. **The floor-of-one only asks that SOMETHING was observed, and a count counts the files
   that DID exist.** This repo was NOT the `deid` absence shape on this axis: it already had the
   floor, and the floor is exactly what failed to notice.
4. **A GITLINK'S WORKING TREE IS ABSENT.** `git ls-files` names the path, the walk finds nothing
   there, and no route said so. It now refuses, under the same rule and the same closed-set token the
   `--staged` route already used for mode `160000`.

**🛑 THE STATES A ROUTE CLOSES ARE PER-REPO AND A SIBLING'S NOTE DOES NOT NAME THEM.** None of the
above is the "tracked files outside every walk root" shape `astm` and `deid` closed, because that
shape cannot exist in a repo-rooted walk. `deid`'s corpus-partition lesson (a NUL-bearing-file skip
dropping hand-written sources) has no analogue either: this scanner has no binary skip to get wrong,
and the two exemptions it does have are LITERAL PATHS. **Nothing was credited to this route that was
already closed here.**

**🛑 THE SHAPE OF THE REMEDY WAS TAKEN FROM THIS REPO, NOT FROM A SIBLING.**
`scripts/check-agent-notes-contract.mjs` already enumerates from `git ls-files` and RECONCILES,
refusing on an unreadable tracked file and on an empty index. The union follows that shape
deliberately, including refusing the empty-index state, so the two corpus gates in this repo answer
"what does this repository carry" the same way. **It goes one step further than that precedent,
which reads the WORKING TREE at each tracked path: reading `git cat-file blob <oid>` names the
object, so state 1 above cannot redirect it.**

**DEDUPLICATION IS BY CONTENT AND THAT IS THE EOL AXIS, RE-DERIVED RATHER THAN INHERITED.** A walk
target is skipped by the union only when the bytes it read hash to the index entry's own object id
under git's `blob <len>\0` framing, so **on a clean checkout the union adds zero reads and never
invokes `git cat-file`** (measured with a logging `git` shim, and a test pins it). **BE EXACT ABOUT
THE FIXED COST RATHER THAN SAYING "no subprocess", WHICH THREE DRAFTS OF THIS SLICE SAID AND THE
REFUTER MEASURED FALSE:** the union adds ONE `git rev-parse --show-object-format` per run, always,
because the dedup needs the algorithm before it can compare anything. On this repo's clean checkout:
**two `git` calls before this change, three after.**
Where the two copies differ, BOTH are scanned. That is what makes it correct under EOL normalization
rather than merely untested by it. **This repo has NO `.gitattributes` and no `core.autocrlf`
setting, and all 140 blobs measured byte-identical, so today the union is free. That is a
measurement, not a guarantee, and it is why the dedup is on content and not on path.**

**THE OBJECT FORMAT IS ASKED FOR, NOT ASSUMED.** `git rev-parse --show-object-format` arrived
together with sha256 support, so a git too old to answer it cannot be a sha256 repository and the
sha1 fallback is a derivation. **An answer we do not recognise disables deduplication rather than
guessing, which scans MORE, never less.**

**A REPORTED LOCUS SAYS WHICH COPY LEAKED.** A union target's hits are reported at
`<path> (as git carries it)`. The `path` itself is deliberately left undecorated, because it is what
`EXCLUDED_PATHS`, `STRUCTURED_EXEMPT_PATHS` and `looksLikeCda` key on, so decorating it would
silently re-scope a target rather than re-label it. **A diagnostic naming a file the reader then
opens and finds clean is the same defect as one pointing at a symbolic link that is not there**,
which is the reason `refuseUnscannable` already takes an overridable noun.

**THREE PINNED CASES CHANGED THEIR MESSAGE AND ONE HAD TO BE REBUILT. SAY WHICH AND WHY.** `all` mode
now needs the index for the union, so a missing or empty index refuses the SWEEP before any byte is
read instead of refusing the vanish TOLERANCE at the first bad read: same exit 2, earlier, with a
message that names the real cause. The two tolerance cases assert the new message rather than being
widened to accept either. **The observed-nothing floor had to be rebuilt to stay reachable**: it used
to be driven by an empty index, which is now refused one step sooner, so it is now driven by an index
holding nothing but the one literally EXCLUDED path. **The branch was kept and re-pinned rather than
deleted as unreachable** - it is a cheap standing guard, and deleting a trap to get green is the one
move this repo does not make.

**🛑 THE ORDER OF THE `git` CALLS IN `buildTargetsForAll` IS LOAD-BEARING AND IS PINNED BY TEST.**
Every one of them happens AFTER the walk lists the tree and BEFORE the first byte is read, which is
what makes the enumerate-then-read window a deterministic hook for the TOCTOU cases (a `git` shim on
`PATH`). **A first draft read the index in `main`, before the walk, and silently closed that window:
three TOCTOU cases went green by never reaching the state they exist to pin.** They failed loudly
here only because they assert the message and not just the code.

**THE POSITIVE CONTROL, BECAUSE A DETECTOR ZERO CAN BE A GAP RATHER THAN A CLEARANCE.** The suite
copies every file this repo tracks into a throwaway git repo, runs the REAL sweep over it and
reproduces the clean result, then plants ONE synthetic marker and proves the same sweep exits 1 -
**once with the marker on disk (the walk half) and once with it committed and then removed from disk,
so only the index can reach it (the union half).** The copy is used rather than the repo itself so a
marker is never written where a commit or a parallel worker could see it. **Without this pair, the
`OK, no hits` line above is indistinguishable from a scanner that stopped reading.**

**🛑 THE AXIS THAT DID NOT PORT, AND IT WAS CAUGHT BY THE REFUTER RATHER THAN BY THE BUILD.** The
non-blob refusal was taken from the `--staged` route, and the state that route detects is NOT
detectable the same way here. **`--staged` spots an unmerged path from `--raw`'s status `U` and a
destination mode of `000000`. `git ls-files -s` reports the same path only at stages 1, 2 and/or 3 and
NEVER at stage 0, and its records normally carry ORDINARY BLOB MODES**, so the mode rule cannot see it
at all. The first
draft took the first record per path and never read the stage digit it was already capturing. It cost
two measured things: **stage 1, THE MERGE BASE, was scanned and reported as `(as git carries it)`**,
which is a claim about content no side of the conflict holds; and **a marker living only in stage 3
printed `OK, no hits` at exit 0.** The union now keys on stage 0 and refuses a path that has none,
under the same NOUN `--staged` already uses (the sentences differ deliberately, because the two
routes learn the state from different commands).

**🛑 THE RULE IS THE ABSENCE OF STAGE 0, WHICH IS SHAPE-INDEPENDENT. DO NOT RE-DERIVE IT FROM A
RECORD COUNT OR FROM A MODE.** The paragraph above first asserted the unhedged form of both, and a
refuter falsified each in one run: **add/add and modify/delete conflicts carry TWO records, not
three, and a symlink-versus-file conflict carries a `120000` record.** The code was right in every
one of those shapes precisely because it keys on the absence, so this was a diagnostic-accuracy
defect and not a safety one. **THIS SLICE WROTE A COUNT INTO PROSE AND HAD IT FALSIFIED THREE TIMES**
(routes, call sites, conflict records). **The file's own WRITE NO COUNT rule is the whole remedy; do
not grow a guard for it.** The `refuseUnscannable` docblock lost its "two groups is the ceiling" line
to the same defect, one function over, when the union added a third group under it.

**The stage-3 silence was
`PRE-EXISTING` (base is identically quiet) and closing it fell out of making the docblock's own
authoritative sentence true; it is not credited as this route's find.** **This is the item's
"THE PORT IS NOT A COPY" rule paying out inside the one axis the acceptance criterion names.**

**🛑 BUILD AN INDEX STATE WITH `git update-index --index-info`, NEVER BY BRANCHING AND MERGING, AND
THIS COST A RED CI RUN.** The first version of the unmerged case produced its stages by making two
branches conflict. It passed locally and **went RED on both CI runners** - so the case was grading
the fixture's environment rather than the scanner, and it would have gone on doing that in whichever
direction the runner happened to fall. **The cause is a committer identity**: the draft handed its
`git merge` none, unlike `repoWithConflict`, which hands its merge one for exactly this reason, and a
merge with no resolvable identity dies **before it touches the index** - reproduced at exit 128,
`Committer identity unknown`, the index left holding the ordinary stage-0 record the last commit
wrote. **A PREMISE ASSERTION THAT ACCEPTS ANY NON-ZERO EXIT ACCEPTS A CRASH** - the draft's
`.not.toBe(0)`, written to mean "the merge really conflicts", passed on that 128. **The reading that
`git ls-files -s` came back with no records for the path at all stood here and is FALSE; the red
run's own output says `expected [ Array(1) ] to have a length of 3 but got 1`. DO NOT RESTORE IT.**
**The state the scanner is about is "an index holding no stage-0 record for a path", so write exactly
that**: `git hash-object -w --stdin` for each side, then `update-index --index-info`. It is
identical everywhere, needs no committer identity, no default-branch name and no merge driver, and it
is the same index a real `git merge` produces (verified by hand against one). **The premise assertion
now prints what `ls-files -s` actually said.** It captures `listed.stdout` only; its status and
stderr are never read, unlike every other call in the same case, so a failing `ls-files` leaves its
own cause invisible: disclosed, not closed.

**RESIDUALS, DISCLOSED RATHER THAN CLOSED.** `git cat-file blob` inherits `execFileSync`'s 1 MiB
`maxBuffer`, so a tracked blob larger than that REFUSES (exit 2) rather than reporting a truncated
scan clean - the identical bound, and the identical trade, as the `git show` call `--staged` makes,
and reached only for a path the walk did not already cover. **The mitigation "reached only for a path
the walk did not already cover" is WEAKEST in exactly the EOL scenario this section argues for**,
where every text path diverges and therefore qualifies; no live exposure today, the largest tracked
blob being 263,368 bytes. **`ls-files` was given 64 MiB instead, and the asymmetry is deliberate: a
truncated LIST is a SHORT list, and a short list is the unscanned corpus this whole rule is about.**
**And `--staged` and `paths` were re-derived and
deliberately left alone**: `--staged` already reads stage-0 blobs for exactly the records a commit
carries, so widening its SCOPE is the hook decision this class has declined three times, and `paths`
is bounded by an argv a human typed. **`mllp`'s characterization case, which asserts `exit 0` over
PID bytes under its own tier rule, was NOT copied: this repo's tier rule differs and those bytes exit
1 here.**

**PRE-EXISTING, FILED NOT FIXED: in a SUBMODULE checkout `.git` is a FILE, not a directory**, so the
walk enumerates and scans it (`WALK_SKIP_DIRS` is consulted on the `isDirectory()` branch and on the
non-regular branch, not on `isFile()`). It is harmless - the file holds a `gitdir:` pointer - and the
direction is more scanning than claimed, never less. Reproduced on this repo's checkout under the
meta-repo; a standalone clone has a real `.git` directory and never reaches it.

## The completeness rule

`PHI-SCAN`'s second half, closed here 2026-08-11. It is independent of the union half above and was
still live after it: **CI could print a clean verdict over a corpus it never opened.** **The rule
itself, the four argv shapes it closes, what it costs and why the comparison is a set difference are
stated ONCE, in `scripts/phi-scan.ts`'s docblock.** This section carries what a docblock cannot: what
was measured here, and which claims were checked rather than inherited.

**THE DEFECT WAS REPRODUCED IN THIS FILE, NOT PORTED AS A STORY.** `--allow-fixture` withdrew a path
from the target list and the run reported on whatever remained, so the withdrawal was invisible in
the verdict. Four argv shapes reached `OK, no hits` at exit 0 over a corpus holding a live, detectable
violator, and the subtlest of them is the one a reader will miss: the seed read
`paths.length > 0 ? paths : [...allowFixtures]`, so with any positional path present the flag was a
silent no-op and the named file was never ADMITTED to the run rather than withdrawn from it. All four
are enumerated in the docblock and all four are pinned by test.

**AND AGAIN, THE HONEST ANSWER IS A NULL RESULT: THERE WAS NO REAL UNREAD CORPUS HERE.** Measured at
`1978bf7` with the rule in place: `all` mode enumerates 141 paths and reads all 141, nothing
tolerated and nothing unread, so the sweep exits 0 on its own corpus. **The figures are DATED TO THAT
COMMIT rather than asserted as current**, for the reason the section above gives: the `.changeset/`
entry that ships this raises the tracked figure by one until a release consumes it. The arithmetic is
written out because 141 looks like the tracked count wearing a different hat and is not: 141 tracked,
minus the one declared literal exclusion, is 140 in-scope tracked paths reached by both the walk and
the union, plus the `.git` **gitfile** this submodule checkout carries in place of a directory (the
pre-existing, filed observation in the section above). The tracked figure was taken with three tools
(`wc -l`, `rg -c` and a stage-0 filter over `ls-files -s`), because `grep -c` has mis-reported a zero
on this class three times. **`ncpdp` reproduced the same null result on the union half, so the fleet
premise that "every repo is hiding something" is now broken twice. Do not manufacture a gap to match
a sibling.**

**WHAT IT COSTS THIS REPO, STATED RATHER THAN LEFT TO BE DISCOVERED. `--allow-fixture` CAN NO LONGER
REACH EXIT 0 IN ANY MODE.** The flag, `phi-scan-overrides.md` and the log gate all stay, so an attempt
is RECORDED AND REFUSED rather than silently honored, and `scripts/phi-allow-list.txt` is now the only
mechanism that reaches a clean run. The hit footer stopped advertising the flag as a remedy for the
same reason: a printed remedy that walks a developer from exit 1 into exit 2 is the same defect as one
that reaches a false green, with the sign flipped. **The log gate did not become decorative and the
test that used to assert "honors a logged bypass, exit 0" now asserts it reaches a DIFFERENT refusal**,
which is the boundary between the two tiers.

**THE VANISH TOLERANCE IS THE ONE ACCOUNTED-FOR NON-READ, AND SUBTRACTING IT IS A DECISION.** A target
skipped under `Target.tolerateVanish` is excluded from the unread difference, or the `ccda@0.0.5`
publish-time refusal would come straight back. It cannot launder a bypass: an `--allow-fixture` path is
skipped BEFORE `scanTarget` is ever called, so it can never enter the vanished set, and the tolerance
is bounded to an untracked file the walk enumerated itself that failed with `ENOENT`. **If you widen
that tolerance, you widen this hole in the same edit.**

**⚖️ THE POSITIVE CONTROL IS THE POINT, AND IT IS BUILT AGAINST THIS REPO'S OWN CAUTIONARY LINEAGE.**
`#110`'s final fix shipped ungraded and `#111` found that its branch-and-merge fixture had gone red on
a **committer identity** (`git merge` dying at exit 128 before it touched the index) while an
`expect(...).not.toBe(0)` waved it through. **A premise assertion that accepts any non-zero exit
accepts a crash**, and this scanner has three distinct exit-2 tiers, so every assertion in the new
block pins an exact code AND the message that names the tier. The control itself runs the same argv
against a copy of the scanner with the rule's one line mutated out, asserts the mutation landed (so it
cannot go vacuous when the rule is reworded), and asserts the mutant reproduces both pre-fix results
exactly: the HITS code where the corpus still holds a readable violator, and `OK, no hits` at exit 0
where it does not. Re-run against the pre-change scanner, seven of the nine new cases red and the two
that pass are the anti-vacuity premise and the no-false-refusal case, which must hold on both trees.

**🛑 THE GRADE FOUND THREE PROSE DEFECTS AND NO CODE DEFECT, WHICH IS THIS LINEAGE'S SIGNATURE, SO
THEY ARE RECORDED RATHER THAN QUIETLY FIXED.** All three were `INTRODUCED` by this slice and all three
are corrected on it:

1. **A draft docblock listed the WALK's filters as if they bounded the whole sweep.** Only
   `EXCLUDED_PATHS` binds both halves of `all` mode. A **tracked** path under a `WALK_SKIP_DIRS` name
   IS enumerated, by the union half, and read from the index: a committed `dist/leaked.txt` with a
   clean working copy reports `HIT: dist/leaked.txt (as git carries it)` at exit 1. Measured twice,
   independently. The direction is more scanning than the sentence claimed, never less, and it cannot
   produce a false refusal because the union both enumerates AND reads it. **Do not read the walk's
   filter list as the sweep's.** The gitignore half of that sentence is only VACUOUSLY true of the
   union, and `unionCandidatePaths` says so where it declines to apply it.
2. **The `CLAUDE.md` byte budget forced five compressions and one of them widened a scoped sentence
   into a false universal:** "a `@cosyte/ccda` version quoted elsewhere is historical" became "any
   version", which declares the live enforced toolchain baseline historical. **Compressing to fit a
   budget is an edit like any other and can introduce a claim defect.** No imperative was deleted by
   any of the five; that was checked one by one.
3. **The positive control's first mutant assertion accepted a crash.** It pinned exit 1, and node
   exits 1 on an uncaught throw, so a mutant that failed to RUN satisfied it; only the second mutant
   run (exit 0 plus `OK, no hits`) was crash-proof. It now asserts the payload marker too. **This is
   the `#111` shape again, in the very block written to avoid it.**

**A BOUND WORTH KNOWING: the rule is PATH-LEVEL.** "Read" means the bytes went through `scanTarget`,
not that every detector ran over them, so `CHANGELOG.md` counts as read while
`STRUCTURED_EXEMPT_PATHS` keeps the five structured detectors off it. That exemption is pre-existing
and argued where it is declared; this rule does not re-litigate it, and what it adds is that a file
nothing opened at all can no longer pass.

**THE EXTERNAL DEFINITION OF DONE.** `config`'s `pnpm drift` runs a capability PROBE, not a regex over
this file's prose, and it named this repo's drift as "reported only its HITS code (1) over a run that
withdrew `test/fixtures/phi-scan-probe-decoy.txt` after enumerating it". It is `ok` here now. **The
probe grades behaviour on purpose: this class has produced defects that lived entirely in a prose
carrier while the code was right, so matching prose would grade the comment.**

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

**Unlike the public-surface gate, this one BLOCKS, and that was the point of where it was put.**
Read from the GitHub API on 2026-08-06, `parser-ci-required-checks` requires `ci / verify (22,
ubuntu-latest)`, `ci / verify (24, ubuntu-latest)` and `ci / actionlint`, so a check that runs
inside the test suite is inside a required context; `no-internal-refs` is in none of the rulesets
and therefore reports and stops nothing. **Do NOT extend that to the em-dash gate, and do not
trust `CLAUDE.md`'s old line about it**: `no-emdash` IS required, via a separate
repository-level `emdash-required-check` ruleset, active and scoped to the default branch. The
settings change `CLAUDE.md` said was outstanding had already landed, so that trap was stale in the
blocking direction and was corrected in the same commit as this section. **Re-read the rulesets;
do not infer a gate's teeth from a prose line about it, including this one.** `pnpm check:agent-notes` runs it standalone; the meta-repo's `verify.sh` has a fixed
`LADDER` that does not name it, so it prints "gate-shaped script(s) this ladder does not know ... a
green verify.sh therefore means LESS than a green CI". **That warning is correct in general and
misleading here, and `verify.sh` must not be touched over it**: the ladder does not invoke the
script by name, but it runs `test:coverage`, which runs the test that runs the script. The gate is
in both, and a LADDER entry would spend a meta-repo edit to run it a second time.

**Two pointer forms are live, measured rather than assumed, and the shape-based one is held
narrow.** The path form, `agent-notes.md` plus `#anchor`, is the common one and every live
occurrence is in `CLAUDE.md` today. **No count is written here**: this sentence carried "occurs 30
times", the same commit added a 31st, and the gate prints the number on every run. It is scanned in
**every** tracked file so no root has to be declared. A bare backticked
`` `#anchor` `` occurs once, in `CLAUDE.md`, on the line cross-referencing the planned-templates
section. **A guard matching only the path form is GREEN while that bare pointer is broken**, and
that bypass is reproduced end to end in the test rather than argued: the same fixture reds with the
bare pointer and greens with it deleted and nothing else changed. This is the `ncpdp#64` shape,
where a guard failing to catch something is an overclaim and not merely a gap.

**Do not widen the bare form.** Measured over every tracked file here, a bare `` `#...` `` also
matches `` `#id` `` in TypeScript sources and `` `#62` `` in tests and in this file: those are XML
id references and C-CDA narrative `<reference value="#62"/>` targets, which is exactly the reference
material this parser exists to talk about, and is the same class as the `PID-3` / `SCH-11` false
positives that a shape rule destroys in a release body. Requiring three hyphen-joined lowercase runs
excludes them by shape; confining the form to `CLAUDE.md` excludes them by scope. **A bare anchor in
any other file is deliberately not a pointer**, and that is a stated limit rather than a claim.

**The corpus is `git ls-files`, reconciled, because a check can print green over a corpus it never
opened and no denominator detects it** (a count counts the roots that DID exist). Every tracked path
is opened, or the run refuses. There is no skip of any kind, so the property is that `read` EQUALS
`tracked`, not that a set of numbers reconciles.
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

**There is no exclusion list, and it took a refuter to make that true.** The first cut skipped any
file containing a NUL byte as "binary", counted only as an anonymous `1 binary (skipped)`. On this
repo that was exactly one file: **`src/profiles/merge.ts`**, a linted, type-checked,
Prettier-formatted TypeScript source that embeds NULs in a join separator. `CLAUDE.md` already
records that same file as this repo's MEASURED silent exemption, because PR #52's em-dash sweep
skipped it and left a live banned character behind, which is why the em-dash gate's text-only
variant drops `grep -I`. **The new gate had re-introduced the identical skip in the identical
file**, and a broken pointer planted there was reproduced passing green, byte-identically to a clean
run, while the same pointer in the NUL-free sibling `apply.ts` red. Three shipped copies claimed
"every tracked text file" and "no exclusion list" while it was false, and one of them was a
changeset summary about to freeze into `CHANGELOG.md`. **The skip was DELETED rather than
documented**: every tracked file is now decoded and scanned, so `read` equals `tracked` on a clean
run and there is no residue to interpret. Decoding is safe and was measured: the pointer patterns
are pure ASCII, and UTF-8 decoding replaces only invalid sequences and resyncs, so a pointer planted
directly against a real NUL matches. A genuinely binary file can now only cost a **false red**,
which is cheap. **Do not re-add a binary heuristic here**, and treat "the counts are equal" as the
property, not "the counts reconcile".

**The one real limit of scanning everything is the ENCODING, and the limit is NON-ASCII-COMPATIBLE
encodings specifically, not "non-UTF-8".** This paragraph said "non-UTF-8" for one commit and a
refuter measured it false, which is the second prose-versus-code mismatch this area produced in
three passes: **the pattern, not the instance, is the thing to watch here.** Files are decoded as
UTF-8 and the pointer patterns are ASCII, so what matters is only whether the encoding represents
ASCII as single ASCII bytes. It does in Windows-1252, Latin-1 and every other ASCII superset, and a
Windows-1252 file carrying a broken pointer **reds and is named** - verified, and exactly what the
resync paragraph above predicts. It does not in **UTF-16, UTF-32, EBCDIC or UTF-7**, where a
tracked file is read but its pointers can never match: a UTF-16LE file carrying a broken pointer
reads green, verified. That is not a regression - the earlier binary-skip cut missed it too, by
skipping the file outright - and no such file is tracked here. **If one is ever added, this gate
does not cover it**, and the honest fix is to decode by encoding, not to re-add a skip.

**One hazard follows from having no exclusion list: do not write a pointer into a
changeset summary.** The summary becomes the `CHANGELOG.md` entry, `CHANGELOG.md` is tracked, and
the scan covers every tracked file, so a pointer archived there freezes the heading it names
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

**No corpus figure is written down here, deliberately.** The gate prints tracked / read /
unreadable,
heading and pointer counts on every run, all of them move with the repo, and this file already
carries the lesson that a numeral which goes stale fast is the failure class the audit exists to
fix. **Re-run it; do not quote it.** The contract was already intact when the gate was written, so
**this closed no live break** - nineteen cases carry it, and the red-before evidence is each defect
class reproduced against a real fixture, not a count of existing failures.

**The corpus is `git ls-files`, so an UNSTAGED new file is not in it.** A green run in a dirty
working tree therefore says less than the same run in CI, which always sees a committed tree. This
is not hypothetical: the gate's own script sat untracked while its cases passed, and the
first run after `git add` immediately red on a literal pointer inside the script's own header
comment. **The script needs no self-exemption** and builds its own pointer pattern from the path
constant at run time, so it never writes the path and a `#` adjacently; that comment was the one
place it did, and the gate caught it rather than a reviewer. The em-dash gate next door does need a
self-exemption, and that exemption has already cost this repo an escape.

**`documentation/agent-notes.md` is NOT under this repo's Prettier globs and must not be run through
it.** `format` and `format:check` cover `src/**/*.{ts,md}`, `test/**/*.ts`, `scripts/**/*.ts` and root
`*.{json,md,yml}`, and `documentation/` is in none of them. Running
Prettier over this file by hand reflows all of it: measured here, 1,385 lines changed for a
three-paragraph append, which buries the real edit and churns a file whose whole premise is that the
relocation was verbatim. Append by hand at the existing wrap.

## The pre-scaffold planning notes

`CCDA-CLAUDE-MD-OVER-BUDGET` relocated the tail of `CLAUDE.md` here on 2026-08-07: the block
preserved from the pre-scaffold planning `CLAUDE.md`, which the sections above the fence in that
file already superseded wherever the two overlapped. **It is reproduced verbatim, its own heading
levels included**, which is why an `H1` and three `H2`s appear below inside this record rather than
being demoted; demoting them would have been an edit, and the premise of this file is that nothing
is edited on the way in. **Two** imperatives in it are stated nowhere else and both were kept in
`CLAUDE.md` rather than relocated: the `coverageDirs` rule, in the coverage guardrail, and the
commit style, in its own guardrail bullet. Everything else here is either superseded by the standard
sections of `CLAUDE.md` or is design intent read on demand.

**The trailing note that announced this relocation was itself relocated here on 2026-08-10**, to pay
for the Medications-stamp trap under a 32,000-byte ratchet with three bytes of headroom. It read,
verbatim:

> **The pre-scaffold C-CDA planning notes were relocated verbatim 2026-08-07.** Where they overlapped
> the standard above, the standard above wins. The **two** imperatives stated nowhere else are kept
> above: the `coverageDirs` rule and the commit style.

**The precedence rule it states still binds**, and is restated here because it is the only place it
now lives: where the pre-scaffold notes below overlap the standard sections of `CLAUDE.md`, **the
standard sections win.** No imperative was deleted to make room; the two it names are still in
`CLAUDE.md`.

---

# C-CDA planning notes

_Preserved from the pre-scaffold planning `CLAUDE.md`. The sections above are the shared `@cosyte/*`
standard (authoritative for tooling/stack/disciplines); the notes below are the C-CDA-specific design
intent. Where they overlap, the standard above wins, e.g. runtime deps are now **one** (`@xmldom/xmldom`, ratified by
`docs/adr/0001-xml-parser.md`), and the sibling `@cosyte/hl7` now lives at `../hl7` (the old
`../hl7-parser` path is stale)._

A TypeScript library for the HL7 Consolidated CDA R2.1 standard.

## Ground truth

- **North star:** A developer can parse a real-world, vendor-quirky C-CDA document and pull useful sections out of it in one line, without having read the C-CDA IG.
- **Sibling package:** `@cosyte/hl7` (lives at `../hl7`). This project mirrors its style, tooling, and guardrails. When in doubt, do what `@cosyte/hl7` did.
- **Deliberate divergence from the sibling:** runtime dependencies are allowed here (for XML parsing). Target ≤ 3 runtime deps, each justified. (Ratified: `@xmldom/xmldom` via `docs/adr/0001-xml-parser.md`, **1 of 3**.)

## Hard gates

- **≥ 90% per-directory coverage**, enforced today by `pnpm test:coverage` (not deferred to v1). The
  gated directories are declared in `vitest.config.ts` (`coverageDirs`): `parser`, `model`,
  `model/types`, `helpers`, `serialize`, `profiles`, `builder`, `edit`. Add a directory there when
  you add one under `src/`.
- **No `console.*` in library code.** Throw typed errors or return results.
- **TypeScript strict + `noUncheckedIndexedAccess`.** No `any`, no unjustified `as` casts.

## Commit style

Atomic and reviewable. Mirror the commit-message style from `@cosyte/hl7`'s `git log`.
