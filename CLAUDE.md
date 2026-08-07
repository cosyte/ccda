# @cosyte/ccda: Project Guide for Claude

> **The long-form record is `documentation/agent-notes.md`.** Every trap below is a one-line
> imperative with a pointer into it. The reasoning, the measurements, the refuted drafts and the
> per-incident histories live there **verbatim**, relocated 2026-08-04 so this file stays cheap to
> read. **A pointer is not a closure**: nothing below was fixed by being shortened. When you learn a
> lesson, write it up in `agent-notes.md` and add its one-liner here.

## Project

**`@cosyte/ccda`**: a developer-focused C-CDA parser + utility library for Node.js/TypeScript,
published under the Cosyte brand. Open-source (MIT). One of the sibling `@cosyte/*` healthcare-standard
parsers that **mirror each other's API**: `@cosyte/hl7` is the reference; this repo deliberately
copies its shape.

**North star (the archetype):** a developer can parse a real-world, vendor-quirky C-CDA message
and pull useful fields out in one line, without reading the spec. Liberal on parse (quirks become
warnings), conservative on emit (always spec-clean). See `documentation/conventions.md` →
"The standard parser archetype" in the meta-repo for the full contract this repo must satisfy:
Postel's Law, the tiered tolerance model, stable warning codes, zero runtime deps, dual ESM + CJS,
immutability + explicit mutation, and the profile system.

## Status

- **Published on npm at `0.0.10`**, public, MIT (re-derived from the registry 2026-08-04, where this
  line said `0.0.4`, and `0.0.2` before that; it has been stale every time anyone checked, so
  **`npm view @cosyte/ccda version` is the only source of truth** and a **`@cosyte/ccda`** version
  quoted elsewhere in this file is a historical statement about that release, not the current one;
  the `@cosyte/test-utils`, TypeScript and `pnpm` pins below are live and mean what they say).
  Pre-alpha on the shared cosyte `0.0.x` ladder
  (`0.0.x` until first alpha, ADR 0001). A published version never moves backwards.
- **There are no stubs left.** `src/index.ts` exports a working parser (`parseCcda`), serializer
  (`serializeCcda`), document builder (`buildCcda`), and document editor (`editCcda`), plus the
  `CcdaDocument` model, the HL7 v3 datatype layer, the entry extractors for fourteen families
  (Problems / Medications / Allergies / Results / Vital Signs / Immunizations / Procedures /
  Encounters / Social-History smoking status / Plan of Treatment / Functional Status / Mental Status
  / Family History / Past Medical History), the recognition tables (`documentTypeForOid`,
  `sectionForTemplateRoot`, `sectionForLoinc`), the required-section SHALL tables
  (`requiredSectionKeys`, `missingRequiredSections`), the code-system OIDs + `checkCodeSlot`, the
  computable UCUM grammar, the bring-your-own `TerminologyAdapter` contract, the vendor-profile
  system (`defineCcdaProfile`, `ccdaProfiles`, `SAFETY_CRITICAL_CODES`), and
  `WARNING_CODES` / `FATAL_CODES`.
- **Boundaries that are real, and stated under-warning. They are FILED, NOT FIXED.** Relocating the
  reasoning closed none of them, and the 64 unresolvable `@example` imports below are still an open
  defect. Do not describe the package as more complete than these:
  - `buildCcda` emits **two of the twelve** document types (CCD, Referral Note); parsing
    **recognizes** all twelve, only building is limited.
    Why: `documentation/agent-notes.md#what-buildccda-emits-and-what-it-does-not`
  - **A narrative label is REFUSED, never fabricated: `narrativeLabel()` THROWS when a PRESENT coded
    object carries no `displayName`. Never render a confident sentence the entry does not support,
    and never substitute a different one** - `?? "No known allergies"` emitted a positively-asserted
    allergy as its own negation, byte-identical to the negated form, warnings `[]`, in `0.0.11`.
    **An ABSENT optional object keeps its fallback**; only a present-but-unlabelled one is refused,
    and **only NARRATIVE labels are guarded**. `editCcda` inherits it via `buildSectionComponent`.
    Why: `documentation/agent-notes.md#a-narrative-label-is-refused-never-fabricated`
  - **OPEN DEFECT, filed rather than fixed: 64 `@example` blocks cite an import that does not
    resolve**, across four modules; **four reach consumers** in the published `.d.ts`. **The
    predicate is "reaches `dist`", NOT "is on the entry point".** If you pick it up, parse the TSDoc
    properly; do not grow the refused specifier regex. The per-symbol fix does not need the gate.
    Why: `documentation/agent-notes.md#the-64-unresolvable-example-imports`
  - **Recognition resolves a disagreeing section silently, in BOTH of its two shapes, with no
    warning**: `templateId` vs LOINC resolves on the root, and root vs root resolves on document
    order. Scope any eventual warning code to **both** halves. No clinical fact is lost meanwhile:
    `extractClinical` runs every extractor on every section regardless of `key`.
    Why: `documentation/agent-notes.md#section-recognition-resolves-a-disagreement-silently`
  - A `TerminologyAdapter` is consulted at the **five `CodeSlot`s only** (`problem`, `medication`,
    `allergen`, `route`, `vaccine`), on the slot's primary coding; `<translation>` alternates are
    preserved but never slot-checked. **A clean run means those five slots passed, NOT that the
    document was terminology-verified.** `MISSING_CODE_SYSTEM` and `MISSING_CODE_VALUE` are
    safety-critical and no profile may tolerate them.
    Why: `documentation/agent-notes.md#the-terminologyadapter-is-consulted-at-five-codeslots-only`
  - **A `nullFlavor` asserted beside a value is a contradiction, not a refinement**
    (`CONTRADICTORY_NULL_FLAVOR`, safety-critical), and the derived reading is **withheld** wherever
    a verbatim copy survives. **Route every new datatype and every inline value arm through
    `contradictsAssertedValue` (the `INT`/`ST` arms of `readObservationValue` are wired by hand) or
    this claim stops being true.** Metadata beside a `nullFlavor` is coherent and stays silent.
    Why: `documentation/agent-notes.md#a-nullflavor-asserted-beside-a-value-is-a-contradiction`
  - **The withholding rule is "was this reading manufactured beside a surviving verbatim copy", not
    "does this field look dangerous", and it applies at whatever layer manufactures.** `pickMrn`
    returns `undefined` when the **first** `patientRole/id` is null-marked and **must never
    substitute the next `<id>`**. `templateId` is the stated exception, not a member of that list.
    The other identity slots (`ClinicalDocument.id`, `setId`, `parentDocument/id`, entry-level
    `<id>`s) are only ever reported whole beside the warning, have no naked-string accessor, and are
    **deliberately left alone**; adding an accessor or extending read-side withholding to them
    undoes a decision. `editCcda` refuses an `RPLC` from a null-marked `ClinicalDocument.id` rather than
    laundering the marking away.
    Why: `documentation/agent-notes.md#the-withholding-rule-pickmrn-and-the-templateid-exception`
  - A medication/vaccine product is read from **either** arm of the CDA R2 `ManufacturedProduct`
    choice, at every consumable call site. `MEDICATION_PRODUCT_ARM_UNEXPECTED` is tolerable only
    **conditionally**, and that argument names **three** unquietable companions, not two. **Do not
    restore the older claim that the alternate arm's code "is read, not refused" and that every
    check "applies to it unchanged" full stop**; it is false once the conflict state exists. Arms
    naming **different** products is `MEDICATION_PRODUCT_ARM_CONFLICT` (safety-critical) and **no
    code is selected**. No arm yielding a code is `MISSING_PRODUCT_CODE`, **safety-critical**, never
    a silent `undefined`.
    Why: `documentation/agent-notes.md#the-manufacturedproduct-choice-and-its-two-arms`
  - **Disagreement is read across every arm and every coding; SELECTION IS NOT, and that asymmetry
    is load-bearing.** Translations are a **fallback, never an addition**. **Never "improve" this
    into a set-intersection rule where a shared translation withdraws a conflict.** **Where BOTH
    arms fall back to translations, an arm merely offering an extra alternate the other stayed quiet
    about is elaborating its own concept, which is what v3 says a `<translation>` does, and is
    deliberately NOT a conflict: a shorter list is not a denial.** Requiring the sets to cover each
    other drew an unquietable safety-critical code on a coherent document. Every branch may
    only ever make the conflict fire **more than the base rule would, never less**, and firing more
    means **withholding**
    more, so **"no product code stops being reported" is a FALSE way to state the invariant; do not
    restore it.** **That monotonicity is the safety property of this whole area and any change here
    must preserve it**; a matrix in `test/entries.test.ts` pins it.
    Why: `documentation/agent-notes.md#disagreement-is-read-across-every-arm-and-coding-selection-is-not`
  - `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` (**safety-critical**) and
    `MEDICATION_PRODUCT_ARM_REPEATED` (not) report two formerly silent states without changing what
    is read. **Where the coding is reachable depends on which arm holds it: on the arm that was NOT
    selected it is not on the model at all and only `doc.toString()` has it**; on the selected arm
    it is somewhere on `drug.translation`, which must be **searched**, never read at `[0]`. The
    unquietable companions number **four**, not three.
    Why: `documentation/agent-notes.md#the-translation-only-and-repeated-arm-states`
  - **A repeated `<code>` on ONE arm is `MEDICATION_PRODUCT_CODE_REPEATED` (safety-critical),
    emitted per arm** and positioned on the arm that carries the repeat. **The comparison was
    widened to every `<code>`; SELECTION WAS NOT. Do not "finish the job" by widening it**, and do
    not rank candidates on completeness. Two matrix rows exist solely to fail loudly if anyone does.
    Why: `documentation/agent-notes.md#a-repeated-code-element-on-one-arm`
  - **State the monotonicity invariant precisely: "no row goes from warned to silent, and no row
    trades a safety-critical code for a weaker one" - NOT "no row loses a warning", which is
    false.** One slice broke even that form, once, measured and deliberately; **do not generalize
    that exception.**
    Why: `documentation/agent-notes.md#the-precise-form-of-the-monotonicity-claim`
  - **A Planned Medication Activity's `code` is the DRUG, and the consumable is read whether or not
    the act carries its own `<code>`.** `plannedCodeElement` must **never** return before calling
    `consumableProductCode` for this variant; it did, and made every product warning unreachable
    there. The act `<code>` is deliberately not on the model and round-trips through `serializeCcda`.
    Why: `documentation/agent-notes.md#a-planned-medication-activity-code-is-the-drug`
  - **A planned medication's drug is slot-checked at the `medication` binding; the other five
    planned kinds are not slot-checked at all. Do not "finish the job" by wiring them.** Leaving
    them unchecked is a **choice, not a necessity** (`checkCodeSlot` raises `MISSING_CODE_VALUE` and
    `MISSING_CODE_SYSTEM` before it reads `SLOT_BINDINGS`). **Four** codes became newly reachable,
    not five: `DEPRECATED_CODE_SYSTEM` cannot fire at the `medication` slot in either place.
    Why: `documentation/agent-notes.md#slot-checking-a-planned-medication-drug`
  - **`getPlannedItems()` returns SEVEN templates and the Plan of Treatment section admits ELEVEN.
    Keep those two numbers apart.** A Planned Immunization Activity (`…22.4.120`) takes its `code`
    from the `consumable`, never the act's own `<code>`, and is slot-checked at **`vaccine`, CVX
    only**: **parity is with each variant's own performed twin, never between the two planned
    variants.** **`PLANNED_VARIANTS` is ORDERED and the immunization row is deliberately LAST.**
    Goal Observation is `moodCode="GOL"`, which `classifyDisposition` calls neither performed nor
    planned, so returning it would contradict this repo's mood model. Whether the other three
    admitted-but-dropped templates are now **REPORTED** (`PLAN_ENTRY_NOT_MODELED`, 2026-08-06)
    and still not returned; **Goal Observation deliberately is NOT reported** (it is to be modelled).
    `BuildCcdaPlannedOrder` still lets `buildCcda` emit a Planned Medication Activity short its SHALL
    `effectiveTime` and the field **stays optional**, but the omission is now **REPORTED**
    (`MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, build-time only) rather than silent; requiring the
    field breaks a published input type. `[1..1]` is
    **not** unique to `…22.4.120`: `…22.4.42` SHALL carry one too (CONF:1098-30468), so it is the
    other **five** that are `[0..1]`. **Do not re-derive "the other six are `[0..1]`" from anything.**
    Why: `documentation/agent-notes.md#seven-planned-templates-returned-eleven-admitted-by-the-section`
  - **A planned entry NESTED in a Planned Intervention Act (`…22.4.146`) is returned, for all seven
    kinds; nothing else nested is. Nesting is NOT solved in general** (`…22.4.130` and `…22.4.131`
    stay unreached, pinned by test). **An `entryRelationship` is read for what it CONTAINS and never
    followed for what it REFERENCES.** Matching is on the `templateId` root alone, which is what
    keeps the performed acts out. **A Goal Observation is not a second container, and do not write
    that it is** (its `plannedComponent` targets an Entry Reference, so it _references_ a planned
    entry rather than nesting one; written up one section earlier, under
    `#seven-planned-templates-returned-eleven-admitted-by-the-section`) - that error came from a
    refuter, was adopted without re-checking, and shipped to five sites. **Re-check a refuter's spec
    claim exactly as hard as your own.**
    Why: `documentation/agent-notes.md#planned-entries-nested-in-a-planned-intervention-act`
  - **Three plan-surface decisions were settled 2026-08-06, all toward REPORTING rather than toward
    changing what is returned or accepted, and each has a "do not finish the job" edge.**
    (1) `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`: the field stays optional, the **emitted XML is
    byte-identical**, **`parseCcda` raises nothing**, and the immunization variant is **not**
    checked. The `editCcda` half is **CLOSED (2026-08-07)**; read
    `#closing-the-two-silent-plan-drops-2026-08-07` before touching it, because an **INPUT-reading
    check was tried and REVERTED**.
    (2) `PLAN_ENTRY_NOT_MODELED` reports Instruction / Handoff / Nutrition Recommendation, **not**
    Goal Observation (that one is to be MODELLED, and a code is stable forever once shipped).
    **Where it fires is a CHOSEN BOUND, not a containment catalog**: a direct entry in **two**
    sections, `planOfTreatment` and `interventions`, the nested half wherever the container sits.
    **They appear in more places than the report covers and an occurrence outside it is still
    dropped in silence - say that, and never justify the scope with an untraced containment claim**
    (one shipped, retracted). **Reporting is not modelling: nothing about
    `getPlannedItems()` changed.** (3) `editCcda` **keeps minting** a `setId` and labels the minted
    one only. **State the residual: nothing forces a receiver to read the label, and a `false` never
    certifies an id is real.**
    **The CCD SHALL-set disagreement was NOT touched and is still blocked on the Schematron.**
    Why: `documentation/agent-notes.md#the-three-plan-surface-decisions-of-2026-08-06`
  - **The Interventions Section (`…21.2.3`, LOINC `62387-6`) lives in the `…10.20.21.2.*` arc, not
    the `…10.20.22.2.*` arc every other catalog section uses, and `…10.20.22.2.3` is RESULTS. Do not
    "normalize" the arc.** **Do not re-add a CONF id or a LOINC release number here**: both were
    invented precision, removed rather than re-guessed. Every other spec claim on this entry is
    **stated, not traced**, which licenses nothing about `required-sections.ts`.
    **`UNKNOWN_SECTION_CODE` is NOT withdrawn on "every document carrying `62387-6`"** - that
    universal was published once and is false.
    Why: `documentation/agent-notes.md#the-interventions-section-and-its-oid-arc`
  - **`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s precondition is each arm's LEAD `<code>`, and the
    message must keep saying so.** A safety-critical warning that misdescribes the document it is
    about is the same defect as one that points at a coding that is not there.
    Why: `documentation/agent-notes.md#the-translation-only-precondition-is-each-arms-lead-code`
  - **No warning or fatal factory takes a value parameter, and no message interpolates one**
    (`PHI-WARNING-MESSAGE-LEAK`). **Do not add a parameter carrying document text back to any
    factory, and do not add a `snippet`-style raw field, not even opt-in.** A sender controls a
    "structural" attribute exactly as it controls a clinical one, so **the bound is the absence of
    the parameter, not the good behaviour of the caller.** `@cosyte/test-utils` is pinned `^0.0.2`:
    **a caret on a `0.0.x` resolves EXACTLY**, so `^0.0.1` silently tests against a kit with no
    runner.
    Why: `documentation/agent-notes.md#no-warning-or-fatal-factory-takes-a-value-parameter`
  - **The bound is applied at the MODEL as well, and that is the load-bearing half** (`hl7` bounded
    its messages, verified green, and `deid` still leaked through an unbounded model field). **Bound
    EVERY field of a `templateId`, not the two that look like locators, and extend `modelIdentifiers`'
    sweep in the same edit** - a swept set disjoint from the leaking set is the exact defect the
    deleted `phi-guard.test.ts` had. **A shape test is not automatically a bound, and you must probe
    the ACCEPT branch of every shape test or the slot proves nothing.** The membership lists are
    **stated, not traced**: adding a name is cheap and safe, inventing one is the failure this repo
    has been burned by. **"A conforming document is untouched" is FALSE as an absolute and must not
    be restored.** `II.extension` outside a `templateId` and `CcdaSection.narrativeById`'s keys are
    deliberately **NOT** bounded and must stay that way.
    Why: `documentation/agent-notes.md#the-phi-bound-is-applied-at-the-model-as-well`
  - **`UNKNOWN_NAMESPACE_PREFIX` is raised from `enforceStructureLimits`, the package's only
    exhaustive traversal, and REPLAYED after the model is built, never emitted where it is found.**
    **A namespace deviation must never take a fatal's or a safety-critical code's place.** **A probe
    that cannot fail proves nothing.** Once per distinct namespace bounds only the **benign** case;
    **do not write it up as a hostile-input bound.** **Attributes are deliberately NOT swept; do not
    "finish the job" by adding them.** **If you add a diagnostic about a node this parser does not
    navigate, that walk is where it goes.**
    Why: `documentation/agent-notes.md#where-the-unknown-namespace-prefix-warning-is-raised`
  - **`CcdaPosition.templateId` is populated by THREE codes, and by nothing else.**
    `MISSING_TEMPLATE_ID` and `UNKNOWN_DOCUMENT_TEMPLATE` carry none **on purpose**; **filling a
    field because it can be filled is not the same as populating it, and do not "finish the job" by
    restoring it.** **A `match` on a field the warning does not carry is inert, not broad.** Still
    open, filed: `defineCcdaProfile` accepts such an inert tolerance rather than refusing it.
    Why: `documentation/agent-notes.md#what-populates-ccdaposition-templateid`
  - **`NULL_FLAVORS` is the WHOLE v3 NullFlavor code system, seventeen concepts** (it was eight).
    **Transcribe from the published code system, never from memory.** Widening did not weaken the
    PHI bound it carries: membership in a closed set of literals this package owns, never a shape
    test. **If you touch `NULL_FLAVORS`, the namespace sweep or `position.templateId`, re-run
    `test/dead-diagnostics-matrix.test.ts` against the previous tree and diff before you update its
    snapshot; the list is public surface and a published version never moves backwards.**
    Why: `documentation/agent-notes.md#the-v3-nullflavor-code-system-has-seventeen-concepts`
  - `SAFETY_CRITICAL_CODES` is a frozen read-only view, not a `Set` instance: every read operation
    works (including spread), but `instanceof Set` is `false`.
    Why: `documentation/agent-notes.md#the-safety-critical-codes-export-is-a-frozen-view`
  - **Six of the twelve** required-section (SHALL) tables in `src/parser/required-sections.ts`
    assert nothing. **Empty means "no unconditional in-catalog SHALL section is asserted yet", never
    "this type has no requirements".** Provenance varies per type. **Do not broaden or narrow an
    untraced set without the Schematron in hand.**
    Why: `documentation/agent-notes.md#the-required-section-shall-tables-and-their-provenance`
  - `editCcda` covers **twelve single-list section kinds**; Functional Status, Mental Status and the
    Referral Note's two narrative-only sections are **buildable but not editable**. There is no
    entry-level append and no section removal.
    Why: `documentation/agent-notes.md#what-editccda-covers`
  - A built document round-trips through `parseCcda` with zero warnings, but its conformance is
    **expected, not proven**: grounded against the raw C-CDA R2.1 IG text, not a validator run.
    Why: `documentation/agent-notes.md#a-built-documents-conformance-is-expected-not-proven`
- **XML-parser dependency: ratified (one-way door).** `@xmldom/xmldom`, exact-pinned, **1 of the
  ≤ 3** runtime-dep cap, per `docs/adr/0001-xml-parser.md` (**Accepted**). Do **not** add a _second_
  XML library; reuse this one, and coordinate `@cosyte/ncpdp` onto the same substrate.
  Why: `documentation/agent-notes.md#the-xml-parser-dependency-ratified`
- **Public-surface gate present and reporting, but NOT yet blocking** (`PUBLIC-SURFACE-HYGIENE`).
  `pnpm check:no-internal-refs` is on the meta-repo's `verify.sh` ladder, but its context is not in
  `parser-ci-required-checks`, so it blocks nothing; **closing that is a ruleset change, not a file
  change.** **Ported from `ncpdp`'s copy, NOT `hl7`'s** - a "resync with hl7" that restores
  `RULE_COUNT=6` deletes rule 7, and the script refuses to run if it does. **Measure the doc
  comments first, and quote a count with the tree it was taken on. The prefix list, designation
  exclusions, phase guards and self-test samples are re-derived for C-CDA and must not be inherited
  wholesale.** `CHANGELOG.md` is exempt org-wide (founder, 2026-07-29): do not re-litigate it.
  Why: `documentation/agent-notes.md#the-public-surface-gate`
- **Em-dash gate present AND BLOCKING.** `U+2014` is banned outright by
  founder directive, and **when it goes red the fix is never to re-encode the character**: rewrite
  with a period, colon, comma or parentheses. `no-emdash` is a required status check via the
  repository-level `emdash-required-check` ruleset; **re-read the rulesets rather than this line.**
  It scans every tracked file **except the script itself**, **and** the
  PR title, body and commit messages, so **keep the script free of the literal character.** **It is
  the text-only variant, and dropping `grep -I` is the load-bearing part**: `src/profiles/merge.ts`
  carries raw NULs and would otherwise be **silently exempt** from a ban with no exceptions, which
  is not theoretical. **Do not swap in `website`'s variant**, and do not reach for `pathways`'
  `git check-attr binary` without first adding a `.gitattributes`. **Do not trust a copy count
  written down anywhere, including here** - enumerate at carry-back time. **The gate covers new
  text only and does not rewrite history.**
  Why: `documentation/agent-notes.md#the-em-dash-gate`
- **The `CLAUDE.md` / `agent-notes.md` contract is gated, and unlike the public-surface gate above
  it BLOCKS** (it runs in the test suite, inside `parser-ci-required-checks`). **It asserts what
  THIS repo promises, never a fleet universal**: `config`, `hl7` and `workflow` carry no
  `agent-notes.md` at all. **Do not promote it to an umbrella script.** It scans **EVERY tracked
  file, no exclusion list: do not re-add a binary/NUL skip** - the first cut had one and silently
  exempted `src/profiles/merge.ts`, the file the em-dash trap above names. The bare `` `#anchor` ``
  form is confined to `CLAUDE.md` by shape and scope and **must not be widened** (`#id`/`#62` are
  XML and C-CDA narrative references). **Never delete an imperative or a section to get green.**
  Why: `documentation/agent-notes.md#the-agent-notes-contract-gate`

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`. This is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`node scripts/attw.mjs`, not the bare CLI**: see the guardrail below. The CLI reports a missing
  `dist/` as "does not contain types" and **exits 0**.
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates; the
  property-based conformance invariants come from `@cosyte/test-utils` (round-trip, lenient-mode,
  immutability, warning-code stability); the format-specific arbitraries stay in this repo.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
- **Runtime deps:** **One**: `@xmldom/xmldom` (exact-pinned), ratified by
  `docs/adr/0001-xml-parser.md` for C-CDA's XML parse + spec-clean serialize. The standard caps `ccda`
  at **≤ 3** justified runtime deps; this is **1 of 3**. No other runtime dep without an ADR.
- **License:** MIT.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export: the JSDoc lint rule is an **error** on public
  exports, so this is enforced, not optional.
- Immutable by default. Mutation only via explicit methods.
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- Postel's Law: parser is liberal (lenient default + warnings), serializer is conservative (always
  emits spec-clean output).
- Fatal errors only for unrecoverable structural corruption (Tier-3 codes). Everything else is a
  warning with a stable code + positional context.
- Coverage: per-directory >= 90% (lines/branches/functions/statements), enforced by
  `pnpm test:coverage`; the gated directories are declared in `vitest.config.ts` (`coverageDirs`)
  and you **add one there when you add one under `src/`**.
- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI** (`ATTW-FALSE-GREEN-PORT`). **A false red costs an hour; a false green merges.** The
  race only supplies the condition; it is not the defect, so **the answer is not a lock, a lease or
  a build queue** - the gate must be able to say its own inputs were missing, whatever removed them.
  `scripts/attw.mjs` carries **THREE guards, not two**. **Blinding options are refused BY OPTION
  NAME, wholesale, not by value, and short options BY LETTER ANYWHERE IN THE CLUSTER, not by whole
  token.** **`.npmignore` versus `files` is about the file's DEPTH, not its existence.**
  `test/scripts/attw-gate.test.ts` pins both nets, the upstream exit-0 itself, a real failure and a
  negative control; **do not carry its "16 of 21" figure forward, re-measure it.** **This is a
  per-repo script** and a sibling still invoking the CLI directly still has the defect; do not write
  a repo count down here, derive it. `scripts/verify.sh` in the meta-repo **must not be touched** for
  this. **The guard is described in four committed files and three corrections have landed in some
  copies and not others: prefer CUTTING a copy to adding a more careful one.**
  Why: `documentation/agent-notes.md#the-attw-wrapper-script`

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**: a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/ccda.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) per meaningful change.
   **The changeset summary IS the changelog entry** and `CHANGELOG.md` is generated output above
   `## Released before this file was generated`: `.changeset/config.json` sets a `changelog`
   generator, so the release writes the version heading and the entry itself. **Do not hand-edit
   `CHANGELOG.md`**, and do not reintroduce a hand-maintained `[Unreleased]` heading: one stood
   there unrolled for the whole published history of this package, which is how a shipped tarball
   came to describe its own contents as unreleased. **The Prettier pass stays ON here** (no
   `"prettier"` key), which is derived from this repo having no `.prettierignore` and a
   `format:check` that globs root markdown, **not copied from a sibling**: with it off the
   generator's raw output reds this repo's own `format:check` on every Version PR.
   `test/scripts/changelog-generation.test.ts` pins all of it. Renaming a stable warning code is a
   **breaking change**.
3. **Crew + knowledgebase loop**: if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill + the KB product doc.

---

**The pre-scaffold C-CDA planning notes were relocated verbatim 2026-08-07** (north star, the
sibling-package pointer, the hard gates and the commit style). Where they overlapped the standard
above, the standard above wins, and the one imperative in them that is not stated above is kept in
the coverage guardrail.
Why: `documentation/agent-notes.md#the-pre-scaffold-planning-notes`
