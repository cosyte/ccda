# @cosyte/ccda: Project Guide for Claude

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

- **Published on npm at `0.0.1`**, public, MIT. Pre-alpha on the shared cosyte `0.0.x` ladder
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
- **Boundaries that are real, and stated under-warning.** Do not describe the package as more
  complete than these:
  - `buildCcda` emits **two of the twelve** document types (CCD, Referral Note). The other ten are
    not implemented. Parsing **recognizes** all twelve; only building is limited.
  - A `TerminologyAdapter` is consulted at the **five `CodeSlot`s only** (`problem`, `medication`,
    `allergen`, `route`, `vaccine`). Every other coded value is never handed to the adapter, so a
    clean run means those five slots passed, **not** that the document was terminology-verified.
    Within the five, the checks cover the slot's primary coding; `<translation>` alternates are
    preserved but not slot-checked. A `@code` with no `@codeSystem` reaches no adapter (there is no
    system to validate against) and is flagged `MISSING_CODE_SYSTEM` rather than passing silently,
    a safety-critical code no profile may tolerate. The mirror shape, a slot present but asserting no
    usable `@code` and no `@nullFlavor`, is `MISSING_CODE_VALUE`, also safety-critical.
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
  - A medication/vaccine product is read from **either** arm of the CDA R2 `ManufacturedProduct`
    choice, at all three consumable call sites (Medication Activity, Immunization Activity, Planned
    Medication Activity). The **presence** of a `manufacturedLabeledDrug` arm is flagged
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
    where that would not be enough carries an unquietable companion
    (`MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE`,
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`). A selected `<code>` asserting only a `nullFlavor`
    and no `<translation>` is **not** one of those states: that is the document completely stating
    the product is unknown, and it reads exactly as it would on a single arm. **`MEDICATION_PRODUCT_ARM_UNEXPECTED`'s
    own argument is unchanged and still names two companions**, because it enumerates the states in
    which **nothing is selected**, and the translation-only state does select an element.
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
  - `SAFETY_CRITICAL_CODES` is a frozen read-only view, not a `Set` instance: every read operation
    works (including spread), but `instanceof Set` is `false`.
  - **Six of the twelve** required-section (SHALL) tables in `src/parser/required-sections.ts`
    assert nothing (Consultation Note, Progress Note, Procedure Note, Operative Note, Diagnostic
    Imaging Report, Unstructured Document). Empty means "no unconditional in-catalog SHALL section
    is asserted yet", never "this type has no requirements". Per-type provenance varies: the
    Referral Note's set is traced to the normative R2.1 Schematron (CONF:1198-30925 and the
    SHOULD-not-SHALL exclusions beside it, see the comment at `required-sections.ts:44`), while the
    others are asserted conservatively without that end-to-end tracing. Do not broaden or narrow an
    untraced set without the Schematron in hand.
  - `editCcda` covers **twelve single-list section kinds**. Functional Status and Mental Status are
    **buildable but not editable** (each is assembled from three separate content lists), as are the
    Referral Note's narrative-only Assessment and Reason for Referral sections. There is no
    entry-level append and no section removal.
  - A built document round-trips through `parseCcda` with zero warnings, but its conformance was
    grounded against the raw C-CDA R2.1 IG text, not a validator run: it is **expected but not
    proven** to pass an external IG validator.
- **XML-parser dependency: ratified (one-way door).** C-CDA is XML, and the shared standard permits an
  XML-parser runtime dep for `ccda`/`ncpdp` **per an ADR**. `docs/adr/0001-xml-parser.md` is
  **Accepted**: `@xmldom/xmldom` (exact-pinned, **1 of the ≤ 3** runtime-dep cap), chosen for faithful
  DOM round-trip + a hardenable (XXE-safe) posture. The parse layer configures and consumes
  it; do **not** add a _second_ XML library. Reuse this one (and coordinate `@cosyte/ncpdp` onto the
  same substrate).
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

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`. This is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`).
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
  `pnpm test:coverage`.

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**: a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/ccda.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset (`patch` on the `0.0.x` ladder) + a `CHANGELOG.md`
   `[Unreleased]` entry per meaningful change. Renaming a stable warning code is a **breaking change**.
3. **Crew + knowledgebase loop**: if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill + the KB product doc.

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
