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

- **Published on npm, public, MIT. This line names no version and asserts no version ladder
  on purpose**: `npm view @cosyte/ccda version` is the only source of truth, and a published version never moves backwards.
  Why: `documentation/agent-notes.md#the-published-version-line-names-no-version`
- **There are no stubs left.** `src/index.ts` exports a working parser, serializer, builder and
  editor, the model, the datatype layer, fourteen entry-extractor families and the profile system.
  Why: `documentation/agent-notes.md#there-are-no-stubs-left`
- **Boundaries that are real, and stated under-warning. They are FILED, NOT FIXED.** Relocating the
  reasoning closed none of them, and the 64 unresolvable `@example` imports below are still an open
  defect. Do not describe the package as more complete than these:
  - `buildCcda` emits **two of the twelve** document types (CCD, Referral Note); parsing
    **recognizes** all twelve, only building is limited.
    Why: `documentation/agent-notes.md#what-buildccda-emits-and-what-it-does-not`
  - **A narrative label is REFUSED, never fabricated: `narrativeLabel()` THROWS when a PRESENT coded
    object carries no `displayName`. Never render a confident sentence the entry does not support.**
    Why: `documentation/agent-notes.md#a-narrative-label-is-refused-never-fabricated`
  - **OPEN DEFECT, filed rather than fixed: 64 `@example` blocks cite an import that does not
    resolve**, across four modules; **four reach consumers** in the published `.d.ts`.
    Why: `documentation/agent-notes.md#the-64-unresolvable-example-imports`
  - **Recognition resolves a disagreeing section silently, in BOTH of its two shapes, with no
    warning.** Scope any eventual warning code to **both** halves.
    Why: `documentation/agent-notes.md#section-recognition-resolves-a-disagreement-silently`
  - A `TerminologyAdapter` is consulted at the **five `CodeSlot`s only**. **A clean run means those
    five slots passed, NOT that the document was terminology-verified.**
    Why: `documentation/agent-notes.md#the-terminologyadapter-is-consulted-at-five-codeslots-only`
  - **A `nullFlavor` asserted beside a value is a contradiction, not a refinement**
    (`CONTRADICTORY_NULL_FLAVOR`, safety-critical), and the derived reading is **withheld**.
    Why: `documentation/agent-notes.md#a-nullflavor-asserted-beside-a-value-is-a-contradiction`
  - **A `<subject>` declaration decides WHOSE data an entry is, and the whole top-level `<entry>` is
    withheld from every record-target read path (`SUBJECT_CONTEXT_OVERRIDE`, safety-critical).**
    Why: `documentation/agent-notes.md#a-subject-declaration-withholds-the-whole-entry-and-presence-is-the-trigger`
  - **The withholding rule is "was this reading manufactured beside a surviving verbatim copy", not
    "does this field look dangerous", and it applies at whatever layer manufactures.**
    Why: `documentation/agent-notes.md#the-withholding-rule-pickmrn-and-the-templateid-exception`
  - A medication/vaccine product is read from **either** arm of the CDA R2 `ManufacturedProduct`
    choice, at every consumable call site; arms naming **different** products select **no code**.
    Why: `documentation/agent-notes.md#the-manufacturedproduct-choice-and-its-two-arms`
  - **Disagreement is read across every arm and every coding; SELECTION IS NOT, and that asymmetry
    is load-bearing.** Translations are a **fallback, never an addition**.
    Why: `documentation/agent-notes.md#disagreement-is-read-across-every-arm-and-coding-selection-is-not`
  - `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` (**safety-critical**) and
    `MEDICATION_PRODUCT_ARM_REPEATED` (not) report two formerly silent states without changing what is read.
    Why: `documentation/agent-notes.md#the-translation-only-and-repeated-arm-states`
  - **A repeated `<code>` on ONE arm is `MEDICATION_PRODUCT_CODE_REPEATED` (safety-critical),
    emitted per arm.** **The comparison was widened to every `<code>`; SELECTION WAS NOT.**
    Why: `documentation/agent-notes.md#a-repeated-code-element-on-one-arm`
  - **State the monotonicity invariant precisely: "no row goes from warned to silent, and no row
    trades a safety-critical code for a weaker one" - NOT "no row loses a warning", which is false.**
    Why: `documentation/agent-notes.md#the-precise-form-of-the-monotonicity-claim`
  - **A Planned Medication Activity's `code` is the DRUG, and the consumable is read whether or not
    the act carries its own `<code>`.**
    Why: `documentation/agent-notes.md#a-planned-medication-activity-code-is-the-drug`
  - **A planned medication's drug is slot-checked at the `medication` binding; the other five
    planned kinds are not slot-checked at all. Do not "finish the job" by wiring them.**
    Why: `documentation/agent-notes.md#slot-checking-a-planned-medication-drug`
  - **`getPlannedItems()` returns SEVEN templates and the Plan of Treatment section admits ELEVEN.
    Keep those two numbers apart.**
    Why: `documentation/agent-notes.md#seven-planned-templates-returned-eleven-admitted-by-the-section`
  - **A planned entry NESTED in a Planned Intervention Act is returned, for all seven kinds;
    nothing else nested is. Nesting is NOT solved in general.**
    Why: `documentation/agent-notes.md#planned-entries-nested-in-a-planned-intervention-act`
  - **Three plan-surface decisions were settled 2026-08-06, all toward REPORTING rather than toward
    changing what is returned or accepted, and each has a "do not finish the job" edge.**
    Why: `documentation/agent-notes.md#the-three-plan-surface-decisions-of-2026-08-06`
  - **The Interventions Section (`…21.2.3`, LOINC `62387-6`) lives in the `…10.20.21.2.*` arc, not
    the `…10.20.22.2.*` arc every other catalog section uses. Do not "normalize" the arc.**
    Why: `documentation/agent-notes.md#the-interventions-section-and-its-oid-arc`
  - **`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s precondition is each arm's LEAD `<code>`, and the
    message must keep saying so.**
    Why: `documentation/agent-notes.md#the-translation-only-precondition-is-each-arms-lead-code`
  - **No warning or fatal factory takes a value parameter, and no message interpolates one**
    (`PHI-WARNING-MESSAGE-LEAK`). **The bound is the absence of the parameter.**
    Why: `documentation/agent-notes.md#no-warning-or-fatal-factory-takes-a-value-parameter`
  - **The bound is applied at the MODEL as well, and that is the load-bearing half.** **Bound EVERY
    field of a `templateId`, and extend `modelIdentifiers`' sweep in the same edit.**
    Why: `documentation/agent-notes.md#the-phi-bound-is-applied-at-the-model-as-well`
  - **`UNKNOWN_NAMESPACE_PREFIX` is raised from `enforceStructureLimits`, the package's only
    exhaustive traversal, and REPLAYED after the model is built, never emitted where it is found.**
    Why: `documentation/agent-notes.md#where-the-unknown-namespace-prefix-warning-is-raised`
  - **`CcdaPosition.templateId` is populated by FOUR codes, and by nothing else.** **Enumerate the
    set, never carry this numeral forward.**
    Why: `documentation/agent-notes.md#what-populates-ccdaposition-templateid`
  - **The version stamp on the resolving `templateId` has THREE readings and the two stamp codes are
    NOT interchangeable.** An unmodelled stamp reports the obligation unevaluated, never reduced.
    Why: `documentation/agent-notes.md#the-three-readings-of-a-document-level-version-stamp`
  - **`NULL_FLAVORS` is the WHOLE v3 NullFlavor code system, seventeen concepts** (it was eight).
    **Transcribe from the published code system, never from memory.**
    Why: `documentation/agent-notes.md#the-v3-nullflavor-code-system-has-seventeen-concepts`
  - `SAFETY_CRITICAL_CODES` is a frozen read-only view, not a `Set` instance: every read operation
    works (including spread), but `instanceof Set` is `false`.
    Why: `documentation/agent-notes.md#the-safety-critical-codes-export-is-a-frozen-view`
  - **Every one of the twelve required-section (SHALL) tables in `src/parser/required-sections.ts`
    carries a `verification` state and names the artifact + artifact revision it was read from.**
    Why: `documentation/agent-notes.md#the-required-section-shall-tables-and-their-provenance`
  - **The six CCD SHALL sections do NOT share one stamp: Medications is `2014-06-09`, the rest
    `2015-08-01`.** Read the `@root`+`@extension` PAIR, not the root alone.
    Why: `documentation/agent-notes.md#the-medications-section-stamp-is-2014-06-09`
  - `editCcda` covers **twelve single-list section kinds**; Functional Status, Mental Status and the
    Referral Note's two narrative-only sections are **buildable but not editable**.
    Why: `documentation/agent-notes.md#what-editccda-covers`
  - A built document round-trips through `parseCcda` with zero warnings, but its conformance is
    **expected, not proven**: grounded against the raw C-CDA R2.1 IG text, not a validator run.
    Why: `documentation/agent-notes.md#a-built-documents-conformance-is-expected-not-proven`
- **XML-parser dependency: ratified (one-way door).** `@xmldom/xmldom`, exact-pinned, **1 of the
  ≤ 3** runtime-dep cap, per `docs/adr/0001-xml-parser.md` (**Accepted**).
  Why: `documentation/agent-notes.md#the-xml-parser-dependency-ratified`
- **Public-surface gate present and reporting, but NOT yet blocking** (`PUBLIC-SURFACE-HYGIENE`);
  **closing that is a ruleset change, not a file change.**
  Why: `documentation/agent-notes.md#the-public-surface-gate`
- **Em-dash gate present AND BLOCKING.** `U+2014` is banned outright by founder directive, and
  **when it goes red the fix is never to re-encode the character**: rewrite with punctuation.
  Why: `documentation/agent-notes.md#the-em-dash-gate`
- **`phi-scan` scans EVERY tracked file now, markdown included; the two exemptions are literal
  paths, and writing docs is inside the gate.** **THERE ARE THREE ROUTES, not two.**
  Why: `documentation/agent-notes.md#the-corpus-every-phi-scan-route-read-past`
- **`all` mode UNIONS the bytes git carries with the walk, deduped by CONTENT not path (the EOL
  axis).** A non-blob index mode or an EMPTY index refuses.
  Why: `documentation/agent-notes.md#the-all-mode-sweep-reads-the-bytes-git-carries`
- **A target ENUMERATED and never READ refuses (exit 2), any mode; `--allow-fixture` cannot reach
  exit 0 anywhere. Assert an exact code AND the tier's message: `not.toBe(0)` accepts a crash.**
  Why: `documentation/agent-notes.md#the-completeness-rule`
- **`docs-content/` is a RELEASE ARTIFACT and is gated by TWO test files that ask different
  questions.** **Writing a docs page is inside the PHI gate**: reuse the declared synthetic tokens.
  Why: `documentation/agent-notes.md#the-docs-content-bundle-is-gated-for-coverage-and-shape`
- **The `CLAUDE.md` / `agent-notes.md` contract is gated, and unlike the public-surface gate above
  it BLOCKS.** **Never delete an imperative or a section to get green.**
  Why: `documentation/agent-notes.md#the-agent-notes-contract-gate`

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`. This is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`node scripts/attw.mjs`, not the bare CLI**: see the guardrail below.
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
- **Commit style:** atomic and reviewable. Mirror the commit-message style from `@cosyte/hl7`'s
  `git log`.
- Postel's Law: parser is liberal (lenient default + warnings), serializer is conservative (always
  emits spec-clean output).
- Fatal errors only for unrecoverable structural corruption (Tier-3 codes). Everything else is a
  warning with a stable code + positional context.
- Coverage: per-directory >= 90% (lines/branches/functions/statements), enforced by
  `pnpm test:coverage`; the gated directories are declared in `vitest.config.ts` (`coverageDirs`)
  and you **add one there when you add one under `src/`**.
- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI** (`ATTW-FALSE-GREEN-PORT`). **A false red costs an hour; a false green merges.**
  `scripts/attw.mjs` carries **THREE guards, not two**. **Blinding options are refused BY OPTION
  NAME, wholesale, not by value, and short options BY LETTER ANYWHERE IN THE CLUSTER, not by whole
  token.** **`.npmignore` versus `files` is about the file's DEPTH, not its existence.**
  `test/scripts/attw-gate.test.ts` pins two of the three, the upstream exit-0 itself, a real failure
  and a negative control; **the printed-nothing backstop is pinned by NO test, a stated gap rather
  than an oversight. Do not carry the test file's "16 of 21" figure forward, re-measure it.**
  **Per-repo script**; a sibling still on the bare CLI still has the defect. Write no repo count,
  derive it. The meta-repo's `scripts/verify.sh` **must not be touched** for this. **The guard is
  described in four committed files and three corrections have landed in some copies and not
  others: prefer CUTTING a copy to adding a more careful one.**
  Why: `documentation/agent-notes.md#the-attw-wrapper-script`

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**: a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/ccda.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset per meaningful change, and **the bump is classified from
   what the change does, never defaulted**: `minor` when it adds a symbol to the package entry
   point or adds a warning or fatal code, `patch` when it moves no published surface. Writing
   `patch` on a changeset that names a new export is how a release computes a number its own
   release notes contradict.
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
