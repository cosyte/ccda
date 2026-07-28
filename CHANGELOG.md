# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the initial public API surface. The package begins
its public history at `0.0.x`, per the cosyte version ladder (`0.0.x` until first alpha).

### Tooling

- **Em-dash brand gate (`scripts/check-no-emdash.sh`, `pnpm check:no-emdash`, plus
  `.github/workflows/no-emdash.yml`).** Checks the founder directive banning `U+2014` outright
  (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever.") over both halves the rule
  names: every tracked file except the self-excluded script itself (which has to name the encodings
  it bans, so nothing checks the checker), and the PR title, body, and commit messages. The workflow
  carries the non-default `edited` pull-request activity type, so retitling a PR re-checks it, which
  matters because this repo allows only squash merge and takes its subject from the PR title
  (`squash_merge_commit_title: COMMIT_OR_PR_TITLE`). The body that lands is the branch commit
  messages (`COMMIT_MESSAGES`), not the PR body; the PR body is scanned anyway, as a cosyte surface
  in its own right. Its own workflow rather than a job in `ci.yml`, so a PR-description typo does
  not re-run the Node 22 + 24 matrix. **It reports; it does not yet block.** The job is not a
  required status check: `cosyte/ccda` is governed by org-level rulesets whose required contexts are
  `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)` and `ci / actionlint`, and
  `Em-dash gate / no-emdash` is not among them, so a PR carrying a live character can still
  auto-merge. Making it blocking is a GitHub **settings** change rather than a file change (no repo
  defines these rulesets): either add the context to the org ruleset `parser-ci-required-checks`,
  or add a repository-level ruleset here as `pathways`, `docs`, `website` and `iac` already do.
  Ported from `ncpdp` (PR #34, `39212bb`), the text-only variant, with the pipeline
  code kept byte-identical: the known limits are one cross-repo fix across the whole fleet of
  copies, not one fix per repo. Enumerate them at carry-back time rather than trusting a count.
  **One character of content changed**, in a JSDoc comment in `src/profiles/merge.ts`, where an em
  dash became a colon. That file had survived PR #52's remediation sweep because two functional NUL
  bytes (the separator in `toleranceKey`'s composite key, which cannot be removed) make grep
  classify first-party TypeScript as binary and skip it. Dropping `grep -I` is what makes the file a
  loud red instead of a silent exemption, and is why `website`'s NUL-partition variant would be
  wrong here. No runtime, public-API, warning-code, or parse-behavior change; the two NUL bytes are
  untouched.
- **PHI commit-scanner (`scripts/phi-scan.ts`, `pnpm phi-scan`).** A zero-dependency, C-CDA-shape-aware
  scanner refuses any committed/staged file carrying real-looking PHI in a C-CDA document, recognized
  by a native extension (`.cda`/`.ccda`/`.xml`) or a C-CDA marker, so a real clinical document can
  never be committed by accident. Hand-written `src/` / `scripts/` code gets a conservative
  dashed-SSN + email shape pass only (structurally scanning source would flag illustrative `@example`
  snippets); it is not a fixture location. It does NOT
  import the package's `@xmldom/xmldom` runtime dep: a commit gate must run without a build and must
  tolerate the malformed / fragmentary XML a real leaked document arrives as. Detection is
  element-scoped, not a blind text regex, so a coded value (`<code code="55607006"/>`) or a template
  OID (`<templateId root="2.16.840…"/>`) never trips it: it reads person-name parts (`given` / `family`
  wherever they appear: patient, `guardian`, `assignedPerson`, `informant`, `relatedSubject`,
  providers, plus a bare `name`), the `birthTime@value` DOB, `id@root` / `@extension` identifiers
  (SSN under the US SSN OID `2.16.840.1.113883.4.1`, bare-numeric MRN / account, dashed SSN anywhere),
  addresses (`streetAddressLine` / `city` / `postalCode`), `telecom@value` phones (the `555`
  fake-exchange convention passes), and non-test-domain emails. The detectors are namespace-prefix
  tolerant (`<given>` == `<v3:given>`), case tolerant, and decode XML character references +
  `<![CDATA[…]]>` before matching, so a `<family>&#x53;mith</family>` or CDATA-wrapped name is still
  caught. Synthetic fixtures are positively declared in `scripts/phi-allow-list.txt` (the same
  allow-list model the byte-strict siblings use); a whole-file bypass requires `--allow-fixture` plus
  an audit entry in `phi-scan-overrides.md`. Runs at pre-commit (`simple-git-hooks --staged`) and in
  CI (`run-phi-scan: true`). Dev-tooling only: no change to the published package surface or warning
  codes.

### Documentation

- **Two published bounds that were misstated, corrected without a behaviour change.**
  `BuildCcdaPlannedItemBase.effectiveTime` documented itself as `SHOULD [0..1]` flatly. That is the
  cardinality on five of the seven planned templates: **both** `substanceAdministration` variants
  SHALL carry exactly one (Planned Medication Activity `…22.4.42`, CONF:1098-30468, and Planned
  Immunization Activity `…22.4.120`). `BuildCcdaPlannedImmunization` already redeclares the field as
  required; `BuildCcdaPlannedOrder` does not, so `buildCcda` can still emit a Planned Medication
  Activity short that SHALL element. The field's own docblock now says so instead of leaving the
  correction to sit only on the sibling type. **Closing the gap is a breaking change to a published
  input type and is deliberately not taken here.** And `CcdaDocument.getPlannedItems()` carried
  **neither** of the accessor's two bounds: that it returns seven of the section's eleven admissible
  entry templates, and how deep it reads. Both are on it now, at the surface a consumer actually
  reads, rather than only in the extractor that implements them.

- **`CLAUDE.md` Status section and `README.md` headings corrected (CCDA-P7 stale-status residual).**
  These were the last two files still misdescribing the package. `CLAUDE.md` governs every agent
  session in this repo, so a wrong claim there propagates into work rather than just into a reader's
  head, and its Status section was false twice over: it said the package was "not yet published to
  npm" (it is published at `0.0.1`, and `package.json` agreed all along) and that `src/index.ts`
  carried archetype **stubs** with "the real parser lands in subsequent phases". `src/index.ts`
  exports a working `parseCcda` / `serializeCcda` / `buildCcda` / `editCcda`, the `CcdaDocument`
  model, the HL7 v3 datatype layer, fourteen entry-family extractors, the recognition and
  required-section tables, the code-system OIDs, the computable UCUM grammar, the
  `TerminologyAdapter` contract, and the vendor-profile system. The section now says so and states
  five boundaries **under-warning**: `buildCcda` covers two of twelve document types (parsing
  recognizes all twelve); a `TerminologyAdapter` is consulted at the five `CodeSlot`s only, so a
  clean run is not a verified document; six of twelve required-section SHALL tables assert nothing;
  Functional and Mental Status are buildable but not editable; and a built document is
  expected-but-not-proven to pass an external IG validator. The repo's stale hard gate ("≥ 90% line
  coverage … before v1 ships", over a directory list including a `src/templates/` that does not
  exist) is replaced by the gate that actually runs today, pointing at `vitest.config.ts` as its
  source of truth. `README.md` is the npm front page, and its five `## What it extracts (Phase N)`
  headings are restated as the capability each one describes: an installer of `0.0.1` cannot resolve
  "Phase 5b" to anything. The accuracy defects around those headings are fixed in the same pass: the
  status banner's closing "the other document types land in a later increment" read as a parser
  limitation when only building is limited; the terminology section claimed `buildCcda` consults the
  adapter "at each clinical coded slot" when five are wired, so the unwired ones (Results/Vital
  Signs LOINC, procedure, encounter, planned-item, family-history, the status observation values,
  the propensity type, and the reaction/severity/criticality observations) are now named; the Edit
  section gained a "what editing does not cover" paragraph carrying the buildable-but-not-editable
  boundary; and required-section validation now states that six of twelve tables assert nothing and
  that a quiet parse is not a conformance result. The open question of which sections the CCD SHALL
  set contains is left open on purpose: settling it needs the normative R2.1 Schematron, so the docs
  describe what the code asserts and say the set is deliberately conservative, rather than implying
  either candidate set is the correct one.
- **`docs-content/` capability claims rewritten as a capability doc, not a phase log (CCDA-P7
  documentation residual).** `troubleshooting.md` opened its boundary list with "As of **Phase 5b**",
  a stamp no installer of `0.0.1` can resolve, and the list under it had drifted three slices behind
  the code: it described the builder as emitting "a CCD with five discrete-data sections", and named
  "editing an existing document" and "a bring-your-own-credentials terminology adapter" as future
  work when `editCcda` and `TerminologyAdapter` both ship. That section is now **"What it does, and
  does not do, today"**, split into Reading / Building / Editing, with every claim checked against
  the shipped source: all twelve document types recognized and fourteen entry families decoded;
  `buildCcda` emitting a CCD **or** a Referral Note (two of twelve) with its exact always-emitted and
  populated-only section sets; `<translation>` alternates wired at the problem, allergen, medication
  drug + route, and vaccine + route slots and nowhere else; `editCcda` limited to whole-section
  add/replace across twelve kinds, with no entry-level append, no section removal, `RPLC` only, and
  validation-but-not-translation on that path (Functional/Mental Status are buildable but **not**
  editable, a boundary the docs had never stated). The boundaries that are genuinely open are stated
  as open rather than resolved in the reader's favor: a built document is expected-but-not-proven to
  pass an external IG validator, six of twelve required-section (SHALL) tables assert nothing pending
  per-type verification, and the UCUM atom set is curated rather than complete. The same drift is
  corrected across the rest of `docs-content/`:
  `cookbook.md` claimed editing was future work 130 lines above its own `editCcda` recipe and
  undercounted the remaining document types as eleven; `spec-notes-datatypes.md` still described the
  builder's "first slice" as header + Problems + Allergies and omitted the shipped adapter hook;
  `spec-notes-model.md` called content editing a later increment; `intro.md` labeled five shipped
  extractors "deferred"; and `README.md`, the npm front page, still said "the remaining ten document
  types **and editing an existing document** are a later increment" roughly 200 lines below its own
  "Edit a document" section, while listing only eight of the builder's fourteen CCD sections. The
  rewrite also states three boundaries the page had never stated: the terminology adapter is
  consulted at five coded slots **only**, so a clean run is not a verified document; six of the
  twelve required-section (SHALL) tables assert nothing, so those types under-warn; and
  Functional/Mental Status are buildable but not editable. Two public JSDoc comments carrying the
  same stale claim are fixed with them (`serializeCcda`'s "a builder API lands in a later phase",
  `BuildCcdaInit`'s "`documentType` is `"ccd"` in this slice"), since the generated API reference is
  user-facing too. Also strips leaked
  tool-call markup (`</content></invoke>`) from the tail of a prior changeset, which would otherwise
  have landed in a published changelog. No code, public-API, or warning-code change.
- **`docs-content/` publish-status + capability drift corrected (README-ORG-SWEEP, wave 2).** The
  user-facing docs pages (rendered on docs.cosyte.com) still claimed `@cosyte/ccda` was "not yet
  published to npm" / "gated on the coordinated public launch", and `intro.md` still described the
  builder as through **Phase 5b** ("`buildCcda` ships its first slice: a CCD with the US Realm header +
  Problems + Allergies"). Both are stale: the package is **published on npm at `0.0.1`** and **public**,
  and the builder is through Phase 7 (`buildCcda` emits a CCD **or** Referral Note, `editCcda` edits a
  parsed document, and a bring-your-own terminology adapter validates coded values). The status banners
  in `intro.md` / `installation.md` and the "Scope (non-goals)" note in `troubleshooting.md` now state
  published on npm at `0.0.1`, public, still pre-alpha on the cosyte `0.0.x` ladder; the install command
  is live; and `intro.md`'s builder capability now mirrors the corrected README. No code, public-API, or
  warning-code change.
- **README status banner refreshed to current reality (README-ORG-SWEEP).** The banner still read
  "pre-alpha (`0.0.x`), not yet published to npm. Through **Phase 5b** the parser ships …". Both halves
  stale: `@cosyte/ccda` is **published on npm at `0.0.1`** and **public**, and the package is well past
  Phase 5b (the Phase 7 builder / editor / terminology-adapter surface the same paragraph already
  describes). The banner now states published on npm at `0.0.1`, public, still pre-alpha on the cosyte
  `0.0.x` ladder, with the parse → serialize → build → edit → BYO-terminology capability intact. No code,
  public-API, or warning-code change.
- **`docs-content/` now ships the full canonical Diátaxis spine (DOCS-CONTENT-P5), gated hard to the
  shipped Phase-5b parse surface.** The sidebar was Overview-only. This authors the rest of the spine
  every `@cosyte/*` package shares: four **Core Concepts** pages (the document model: recognition,
  header, section framing; the tolerance tiers + warning-code model with the seven Tier-3 fatals; the
  clinical entry layer: the 14 extracted families and their safety-critical distinctions; and
  datatypes / code systems / computable UCUM / the round-trip serializer), **Installation** and
  **Quickstart** tutorials (parse a CCD, read demographics + the Problem/Medication/Allergy triad, a
  Result, and an Immunization), a task-oriented **Guides** cookbook, and a **Troubleshooting & known
  limitations** page with an explicit **"what's not yet parsed"** list (no builder API; entry families
  beyond the 14; recognition-not-membership code checks; curated-UCUM; inert `nonXMLBody`). The stale
  `intro.md` status banner (it read "Phase 3 / six families") is refreshed to the current shipped
  reality (Phase 5b + serializer) with an honest status banner; **no unshipped API is documented**.
- **A doc/code-agreement gate: every runnable docs snippet is executed against the built package.**
  `test/docs-content.test.ts` runs `docSnippetSuite()` (from `@cosyte/vitest-config/snippets`) over
  `docs-content/`, extracting each ` ```ts runnable ` block, compiling it, executing it against the
  **built** ESM artifact, and asserting its inline `// =>` results, so a documented example can never
  silently drift from the shipped code. Bumps the `@cosyte/vitest-config` devDependency to `^0.0.2`
  for its `/snippets` export. Synthetic-only fixtures throughout (an invented patient, fake OIDs).
  Docs and tests only: no runtime or public-API change.

### Security

- **Dev-dependency advisory remediation (no runtime impact: both overridden
  packages are dev/build-time only and never enter the published artifact; the
  sole runtime dep, `@xmldom/xmldom`, is untouched).** Added scoped
  `pnpm.overrides` pinning two transitive packages to their patched releases:
  `esbuild` (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal,
  not reachable here: the library builds via `tsup`/`vitest` and never runs
  `esbuild serve`) and the `@changesets/parse` copy of `js-yaml`
  (`>=4.0.0 <4.2.0` → `4.2.0`; GHSA-h67p-54hq-rp68 merge-key DoS). The
  `js-yaml@3.14.2` pulled by `read-yaml-file@1.1.0` (via
  `@manypkg/get-packages` → `@changesets/cli`) is **intentionally left**: it
  calls `yaml.safeLoad`, removed/throwing in js-yaml 4, so it cannot be
  force-upgraded without breaking the release tooling, and it only parses
  trusted local repo YAML at release time. This is the shared canonical
  override block, enforced suite-wide by the `@cosyte/config` drift check.

### Added

- **Phase 7 (twenty-fourth slice): `buildCcda` consumes the terminology adapter's `translate`
  (`$translate`) to emit `<translation>` alternate codings.** Closes the "translate-emit" boundary the
  twenty-first (terminology-adapter) slice deferred ("emitting `<translation>` alternates from an adapter is
  a later increment"). When a caller supplies an adapter whose optional `translate` returns an alternate
  coding for a clinical coded slot, `buildCcda` emits a spec-clean CDA R2 `<translation>` child on the
  relevant CD/CE element (`<value xsi:type="CD">`, `<code>`, `<routeCode>`) **beside** the primary code.
  `@cosyte/ccda` still imports no terminology library and only calls the adapter you supply.
  - **Additive, never a coercion.** A `<translation>` is only ever an _additional_ alternate coding
    alongside the original `@code`/`@codeSystem`; the primary code is emitted verbatim and never replaced:
    the same discipline the validation path follows (the adapter can add to a coded slot, never change it).
  - **Never fabricated.** `translate` returning `undefined` (no opinion) or an empty `matches` (unmapped)
    emits **no** `<translation>` and leaves output byte-identical; only a concrete adapter-supplied coding
    produces one, and a match missing a `system` (not an unambiguous CD) is dropped, conservative on emit.
  - **Opt-in, non-breaking.** No adapter, a validation-only adapter, or a `translate` with no opinions all
    yield byte-identical output to the pre-adapter build. `translate` stays optional on the interface.
  - **Scoped to the recognized clinical slots.** Emitted for the coded slots the parser recognizes via
    `checkCodeSlot`: problem value, allergen, medication drug + route, vaccine + route. Structural
    act/section codes (`ASSERTION`, section LOINC) are never handed to `translate`, mirroring the validation
    path's slot discipline. Results/vitals LOINC, reaction/severity/criticality values, and the
    `buildSectionComponent` edit/append path are out of this slice's scope.
  - **Round-trips.** Emitted at the correct CD/CE `xs:sequence` position (`translation` follows
    `originalText`/`qualifier`, neither of which these emitters produce); the parser reads the primary code
    unchanged and surfaces each alternate in `CD.translation` (`parseCd` already reads `<translation>`), so a
    translated build round-trips through `parseCcda` with zero new warnings. A match's `version` is emitted
    as the spec `@codeSystemVersion` (the parser's shallow translation read does not currently surface it, a
    pre-existing read scope, not a regression).
  - **Public surface:** no change: the existing optional `TerminologyAdapter.translate` is now consumed on
    the `buildCcda` / `BuildCcdaOptions.terminology` path; no new export, no warning-code change. Slice
    verified NOT REFUTED by the conformance-refuter gate.

- **Phase 7 (twenty-third slice): `editCcda` threads a bring-your-own terminology adapter into its
  final re-parse.** Closes the "editCcda-adapter-threading" boundary the twenty-first (terminology-adapter)
  slice deferred ("wiring the adapter into `editCcda`'s final re-parse is likewise deferred"). `parseCcda`
  and `buildCcda` already reach the semantic-validation tier: calling a consumer's
  `TerminologyAdapter.validateCode` on each recognized coded slot (problem, medication, allergen, route,
  vaccine) and raising `SEMANTIC_CODE_INVALID` on a negative verdict. But `editCcda` re-parsed its edited
  output with **no options**, so an edited document never reached that tier even when the caller held an
  adapter. This threads it through, mirroring the `buildCcda` pattern exactly.
  - **Opt-in, non-breaking.** `EditCcdaOptions` gains an optional `terminology?: TerminologyAdapter`;
    `editCcda`'s closing `parseCcda(serializeDocument(dom))` forwards it (`{ terminology }`) only when
    supplied. With no adapter the behavior is unchanged. The adapter is honored on both a stamped revision
    and an in-place (`revision: false`) edit.
  - **Surfaced, never coerced.** As on the parse and build paths, the adapter can only ever add a flag:
    `editCcda` emits every code **verbatim** (byte-faithful on untouched sections, spec-clean on the one it
    rebuilds), and a `{ result: false }` verdict raises `SEMANTIC_CODE_INVALID` with the code preserved and
    never rewritten. Validation runs over the **whole** edited document: a rejected code in an untouched
    section is flagged too, not only one in a grafted section. The flag stays PHI-free (slot name + code
    system OID, never the clinical code).
  - **Scope note.** The intermediate `parseSecureXml(...)` that recovers the DOM for surgery is
    deliberately left adapter-free: it re-reads the library's own already-clean source XML only to mutate
    it; semantic validation belongs on the **final** re-parse of the edited output, where `buildCcda` runs
    it too.
  - **Public surface:** additive optional `terminology` field on `EditCcdaOptions`. No warning-code change
    (`SEMANTIC_CODE_INVALID` already exists), no new type.
  - **Deferred (unchanged):** the adapter's optional `translate` (`$translate`) method remains defined but
    not consumed (emitting `<translation>` alternates is a later increment); entry-level append into a
    populated section, section removal, and subsection edits stay out of `editCcda`'s scope.

- **Phase 7 (twenty-first slice): bring-your-own terminology adapter (semantic-validation path).** A
  small, dependency-free `TerminologyAdapter` interface a consumer implements over their own **licensed**
  terminology service, wired into the parser's code-system recognition so `parseCcda(xml, { terminology })`
  and `buildCcda(init, { terminology })` reach the semantic-validation tier that structural recognition
  (`checkCodeSlot`) deliberately cannot: confirming a code is a real member of its system. `@cosyte/ccda`
  **imports no terminology library** (it stays a zero-dep-beyond-`@xmldom/xmldom` sibling); it only calls
  the adapter you supply, and only when supplied. The shape mirrors the FHIR Terminology Module
  (`$validate-code`, `$translate`) and the sibling `@cosyte/terminology` engine, so that engine (or a
  UMLS / VSAC service) can be wired in behind it.
  - **Opt-in, non-breaking.** With no adapter the behavior is unchanged (structural recognize-only, no new
    warning). `validateCode` runs for each recognized coded slot (problem, medication, allergen, route,
    vaccine) that carries both a `@code` and a `@codeSystem`.
  - **Fail-safe: surfaced, never coerced.** A verdict of `{ result: false }` raises the new stable
    warning `SEMANTIC_CODE_INVALID` with the code **preserved verbatim**: the value is never rewritten to
    a "corrected" code, and the adapter's advisory `display` is never applied back onto the document. An
    adapter can therefore never silently change a safety-critical code; it can only add a flag. A verdict
    of `undefined` ("no opinion", e.g. the system is outside the adapter's coverage) is silent, so a
    partial-coverage adapter adds no noise. The builder still emits every code verbatim and surfaces the
    flag on the re-parsed document: validation _on build_, never mutation.
  - **PHI-free.** The `SEMANTIC_CODE_INVALID` message carries only the slot name and the code-system OID
    (structural identifiers, as the existing `UNEXPECTED_CODE_SYSTEM` / `DEPRECATED_CODE_SYSTEM` factories
    do), never the specific clinical code, nor the adapter's free-text `message` / `display`.
  - **Public surface:** `TerminologyAdapter`, `TerminologyCoding`, `CodeValidationResult`,
    `CodeTranslationResult`, `BuildCcdaOptions`, the `SEMANTIC_CODE_INVALID` warning code + its
    `semanticCodeInvalid` factory, and the new optional `terminology` field on `ParseCcdaOptions` /
    `BuildCcdaOptions`.
  - **Deferred (stated):** the interface's optional `translate` (`$translate`) method is **defined but not
    yet consumed**: emitting `<translation>` alternates from an adapter is a later increment; wiring the
    adapter into `editCcda`'s final re-parse is likewise deferred. `TerminologyCoding.system` is the C-CDA
    `@codeSystem` OID (not a canonical URI); a consumer bridges OID→URI inside their adapter (e.g. via
    `@cosyte/terminology`'s `resolveSystem`). Slice verified NOT REFUTED by the conformance-refuter gate.

- **Phase 7 (twentieth slice): `editCcda`: the read→edit→write loop (C-CDA document editing).** A
  third emit-side primitive alongside `parseCcda` (read) and `buildCcda` (construct): it takes a
  document already produced by `parseCcda` and re-emits it with a section **added** or **replaced**,
  returning the re-parsed `CcdaDocument`, so `parseCcda(editCcda(parseCcda(xml), …).toString())`
  round-trips. Grounded firsthand against CDA R2 (the `ClinicalDocument` XSD sequence in
  `HL7/CDA-core-2.0 POCD_MT000040.xsd`) and the HL7 C-CDA-Examples "Parent Document Replace
  Relationship" sample.
  - **Byte-faithful on untouched sections.** The edit is DOM surgery on the document the parser
    actually read (recovered from the serialized snapshot every parsed document retains), not a
    reconstruction from the lossy read-model, so every section, entry, attribute, namespace
    declaration, and even content this library never models survives an edit verbatim; only the one
    targeted section is rebuilt. The replacement section is emitted through the **same per-section
    emitters `buildCcda` uses** (a new internal `buildSectionComponent` dispatcher over the twelve
    single-list section kinds), so it carries identical templateIds, LOINC code, SHALL
    `effectiveTime`, and narrative/entry agreement, and re-parses with zero new warnings. Narrative
    `ID`s in a grafted section are renumbered to never collide with an existing `ID` (which would make
    a `<reference value="#id">` ambiguous).
  - **Fail-safe.** An edit never silently drops or corrupts an unedited section; an empty content
    list yields that section's spec-clean `nullFlavor="NI"` shell, never fabricated entries; and an
    edit that would drop a per-document-type SHALL required section throws a typed `CcdaEditError`
    (`REQUIRED_SECTION_MISSING`) instead of emitting an invalid document. `add`/`replace`/`upsert`
    modes throw `SECTION_ALREADY_PRESENT` / `SECTION_ABSENT` on a precondition violation rather than a
    silent no-op or duplicate section; every builder guard (an invalid HL7 timestamp, a resolved
    problem without a resolution date) still throws.
  - **CDA R2 revision provenance.** By default an edit produces a _revision_: a new
    `ClinicalDocument.id`, the **same** `setId` that identifies the version series (minted when the
    source has none), an incremented `versionNumber`, and a `relatedDocument typeCode="RPLC"` whose
    `parentDocument` names the prior version (with the same `setId` and the prior `versionNumber`),
    the replacement relationship shown in the HL7 sample. New header elements are inserted at their
    CDA R2 XSD sequence positions (`setId`/`versionNumber` after `languageCode`, before
    `recordTarget`; `relatedDocument` after `documentationOf`, before `componentOf`/`component`).
    Chained edits keep the series `setId`, bump the version, and point at the immediate parent (the
    source's own parent link is superseded, not accumulated). Pass `revision: false` to edit in place.
  - **Parser surfaces the revision chain.** The header model now reads `setId`, `versionNumber`, and
    `relatedDocuments` (`RelatedDocument` → `ParentDocument`), so a revision is observable through the
    public parse API, not just written.
  - **Public surface:** `editCcda`, `CcdaEditError`, and the types `EditCcdaOptions`, `SectionEdit`,
    `SectionEditMode`, `RevisionInit`, `DocumentIdInit`, `CcdaEditErrorCode`, `EditableSectionKind`,
    plus `RelatedDocument` / `ParentDocument` on `CcdaHeader`.
  - **Deferred (stated boundaries):** entry-level append into an existing populated section while
    byte-preserving its other entries (needs DOM entry splicing the lossy read-model can't drive:
    supply the full new entry set via a section `replace` instead); the compound Functional/Mental
    Status sections (three content arrays each) and narrative-only sections as edit targets; section
    _removal_; subsection-level edits; and the addendum (`APND`) / transform (`XFRM`) relationships.
- **Phase 7 (nineteenth slice): the v3 `TS` datetime grammar now requires a time-of-day before a
  fractional-second or timezone offset, closing a dropped-dash misparse.** `parseV3DateTime` /
  `TS_RE` (`src/model/types/_shared.ts`) previously let a `.fraction` or a `±ZZZZ` offset hang on a
  bare year/month/day value with no intervening time components. The effect was a **silent
  misparse**: a dropped-dash ISO date like `"2026-0721"` (one dash removed from `"2026-07-21"`) was
  read as year `2026` carrying a `-07:21` offset (i.e. `2026-01-01T07:21Z`) instead of being
  rejected; likewise `"2026+0500"`, `"202607.5"`, `"20260721.5"`, and `"20260721-0500"`. The grammar
  is tightened to the canonical CDA R2 / HL7 v3 `TS` literal `YYYYMMDDHHMMSS.UUUU[±ZZzz]` (and the
  ISO 8601 it derives from, where a decimal fraction and a zone designator attach to a **time**
  component, never to a bare date): a fraction/offset is accepted only once the **hour** is present.
  Such inputs now surface `MALFORMED_DATETIME` on parse (raw preserved, `date` left `undefined`) and
  **throw a `TypeError` at build time**: because the builder's `assertHl7Ts` (eighteenth slice)
  delegates to this one grammar, the fix tightens both the parser and the builder from a single edit.
  - **Every legitimate value is preserved byte-for-byte**: valid partial-precision dates (`YYYY`,
    `YYYYMM`, `YYYYMMDD`), full timestamps, real `±ZZZZ` offsets on a time-of-day, and fractional
    seconds on a full timestamp all parse exactly as before; only the "offset/fraction on a value
    missing its time components" case changes, from silent-misparse to a surfaced rejection.
  - No warning-code change and no public-surface change; the capture-group layout is unchanged, so no
    call site is affected. Regression tests cover the `"2026-0721"`-class input on both the parse
    (`parseV3DateTime`, `parseTs` → `MALFORMED_DATETIME`) and build (`assertHl7Ts` → `TypeError`) paths.
- **Phase 7 (eighteenth slice): a shared HL7 v3 TS date-format validator guards every builder date
  input.** Until now the builder emitted every caller-supplied date string _verbatim_ into
  `<effectiveTime>`/`low`/`high`/`value`/`birthTime`, so a malformed input (`"2026-07-21"` with dashes,
  `"July 2026"`, or a calendar-invalid `"20260230"`) would silently serialize a schema-invalid,
  potentially clinically-misread timestamp. A new single-source guard (`src/builder/hl7-ts.ts`,
  `assertHl7Ts`) now validates every date the builder emits: it accepts the HL7 v3 TS literal
  `YYYY[MM[DD[HHMMSS[.S][±ZZZZ]]]]`, including legitimate **partial precision** (`YYYY`, `YYYYMM`,
  `YYYYMMDD`) and an optional fractional-second and `±ZZZZ` offset, and on a malformed input **throws
  a `TypeError` at build time** rather than emit, guess, or coerce an invalid date (fail loud).
  - **Single source of truth = the parser's grammar.** Acceptance is delegated to the parser's existing
    `parseV3DateTime` (`src/model/types/_shared.ts`, the sole v3 TS grammar in the library), so the
    builder emits _exactly_ the set of timestamps `parseCcda` reads back cleanly: every date it accepts
    round-trips without a `MALFORMED_DATETIME` warning, and no second, drift-prone grammar is introduced.
  - **Wired through every date-emission site**, enumerated so none is missed: patient + family-member
    `birthTime`; the document `effectiveTime`; problem/allergy concern `low` (onset) + `high` (resolution);
    the Medication Activity `IVL_TS` duration `low`/`high`; result & vitals organizers + observations;
    immunization; procedure; encounter period `low`/`high`; smoking/social history; functional & mental
    status observations + organizers; assessment scale; past medical history; plan of treatment; and the
    family-history observation `effectiveTime`. Physical-quantity fields (age, dosing-frequency `PIVL_TS`
    period, reference ranges) are deliberately untouched: they are `PQ`, not `TS`.
  - No warning-code change and no public-surface change; the guard is internal and rejects only inputs
    that were already schema-invalid to emit.
- **Phase 7 (seventeenth slice): the builder accepts caller-supplied problem/allergy resolution +
  onset dates.** A resolved Problem or Allergy concern can now carry a _real_ resolution date on its
  `effectiveTime/high` instead of only `nullFlavor="UNK"`. `BuildCcdaProblem` gains a `resolution`
  field (it already had `onset`); `BuildCcdaAllergy` gains **both** `onset` and `resolution` (it
  previously had neither, so every emitted allergy concern was forced to a `nullFlavor="UNK"` `low`).
  When supplied, `onset` fills the SHALL `effectiveTime/low` and `resolution` fills the `effectiveTime/high`
  on both the Concern Act and its nested observation; both round-trip through `parseCcda` as the concern's
  (and the Problem Observation's) `effectiveTime` `low`/`high`.
  - **The `high` is emitted only for a `status: "resolved"` concern**, because its mere presence asserts
    resolution. Traced firsthand to the C-CDA R2.1 Problem Observation (`2.16.840.1.113883.10.20.22.4.4`)
    rule: _"the existence of a high element within a problem does indicate that the problem has been
    resolved"_ (`effectiveTime/high` [0..1], the "resolution date"; `effectiveTime/low` [1..1], the
    Concern Act `low` under CONF:1198-7504). Emitting a resolution date on a still-active problem would
    falsely signal resolution, so `buildCcda` **throws a `TypeError`** when a `resolution` is supplied
    without `status: "resolved"` rather than emit a self-inconsistent document.
  - **Never a fabricated date.** A resolved concern whose resolution date is unknown still emits the
    `nullFlavor="UNK"` `high` (the SHALL form, unchanged); an absent onset stays `nullFlavor="UNK"` `low`.
    An active concern emits no `high` at all. The Past Medical History section (bare Problem Observations)
    benefits automatically: a resolved historical problem now carries its resolution date.
  - No warning-code change; additive to `BuildCcdaProblem` / `BuildCcdaAllergy` only.
- **Phase 7 (fifteenth slice): the Referral Note SHALL set now asserts Reason for Referral.**
  Reconciles the parser's per-document-type required-section (SHALL) table with the section catalog the
  fourteenth slice expanded. That slice made the **Reason for Referral** Section a recognized catalog key
  but explicitly left the required-section table untouched; the Referral Note document
  (`2.16.840.1.113883.10.20.22.1.14`) SHALL contain a Reason for Referral Section, so a Referral Note that
  omits it is non-conformant. The `referralNote` SHALL set becomes
  `["allergies", "medications", "problems", "reasonForReferral"]`: a Referral Note missing that section now
  raises a `REQUIRED_SECTION_MISSING` **warning** (never a fatal; a missing section still never blocks
  reading the data that is present), while the builder's own Referral Note (which always emits the section)
  stays warning-free. Traced firsthand to the **normative C-CDA R2.1 Schematron** (the 1,010,531-byte
  `HL7/CDA-ccda-2.1` validation `.sch`): the Referral Note document pattern asserts Problem
  (CONF:1198-29087), Allergies (-30912), Medications (-30923), and Reason for Referral (-30925) as SHALL.
  Deliberately still omitted, per the table's conservative design: the **Assessment/Plan choice**
  (CONF:1198-29102, a choice constraint) and **Results** / **Plan of Treatment** (CONF:1198-29090 / -29066,
  SHOULD, not SHALL; the build.fhir.org StructureDefinition's `payers`/`plan` `min=1` was confirmed to be
  drift from the normative Schematron and is not encoded). No public-API or warning-code change; the
  `requiredSectionKeys("referralNote")` / `missingRequiredSections(...)` accessors reflect the new entry.
- **Phase 7 (fourteenth slice): builder emits a second C-CDA document type, the Referral Note.**
  Establishes the **multi-document-type pattern** in `buildCcda`: it now emits either a **CCD** (default) or
  a **Referral Note** (`documentType: "referralNote"`), each with its own US Realm Header specialization and
  document-type-specific SHALL section set. Previously the builder emitted only a CCD and threw for the
  other eleven types while `parseCcda` already read all twelve. This closes the first of that asymmetry.
  Confirmed firsthand against the C-CDA R2.1 IG document-level StructureDefinition
  (`2.16.840.1.113883.10.20.22.1.14`) and the **CC0** `onc-healthit/2015-certification-ccda-testdata` ToC
  Referral Note certification sample (`170.315_b1_toc_amb_rn_r21_sample1`). A clean Referral Note build
  carries **zero warnings** and round-trips through `parseCcda` fixed-point, exactly like a CCD.
  - **Header specialization.** The Referral Note carries the document `templateId` root
    `2.16.840.1.113883.10.20.22.1.14` (R2.1 `2015-08-01` stamp) and LOINC document `code` `57133-1`
    "Referral Note". A `DOC_TYPE_SPECS` table drives the header + SHALL section set per type, so the two
    document types share one emit path.
  - **Referral Note SHALL section set (always emitted).** The entries-required **Problems**, **Allergies**,
    and **Medications** (each an empty `nullFlavor="NI"` section when unpopulated, the entries-required
    `.X.1` templateId correctly dropped); the narrative **Reason for Referral** (V2,
    `1.3.6.1.4.1.19376.1.5.3.1.3.1`, `@extension 2014-06-09`, LOINC `42349-1`); the narrative **Assessment**
    (`…22.2.8`, LOINC `51848-0`), **unversioned** in R2.1, so emitted **root-only with no `@extension`**;
    and **Plan of Treatment** (`…22.2.10`, `@extension 2014-06-09`, LOINC `18776-5`). Assessment + Plan of
    Treatment satisfy the document's "Assessment and Plan (V2) OR (Assessment + Plan of Treatment)" SHALL
    choice via the two-section branch.
  - **Results and Vital Signs are not Referral Note SHALL sections** (`0..1` in the IG), unlike in a CCD,
    where the builder always emits them, a Referral Note emits them only when populated, never a fabricated
    empty one. Nothing clinical is fabricated: unpopulated SHALL sections are explicit empties, and the
    narrative sections carry only caller-supplied text.
  - **Parser (recognition).** The section catalog gains a `reasonForReferral` entry (LOINC `42349-1`,
    template root `1.3.6.1.4.1.19376.1.5.3.1.3.1`) so the emitted section is recognized (no
    `UNKNOWN_SECTION_CODE`) and the Referral Note round-trips warning-free. Purely additive: no change to
    any document type's required-section table; **CCD emit is byte-unchanged** (same SHALL sections, order,
    templateIds, codes).
  - **Public surface.** `BuildCcdaInit.documentType` widens to `"ccd" | "referralNote"`, and `BuildCcdaInit`
    gains optional `assessment` and `reasonForReferral` narrative strings (ignored for a CCD). No
    warning-code change. **Deferred:** the remaining ten document types; C-CDA document editing; the
    bring-your-own-credentials terminology adapter; the external-validator/Schematron differential gate.
- **Phase 7 (thirteenth slice): parser reads + builder emits direct-entry Assessment Scale Observations.**
  A **coordinated parser + builder increment** for the **Assessment Scale Observation** (`…22.4.69`) and its
  **Assessment Scale Supporting Observation** (`…22.4.86`), formal scored instruments (a PHQ-9 depression
  screen, a Glasgow Coma scale, a Barthel index) in the Functional Status and Mental Status sections.
  Verified firsthand against the C-CDA R2.1 Schematron (`HL7/cda-ccda-2.1`, CONF:81-14434…19088) and the two
  HL7 CC0 R2.1 examples (PHQ-9, Glasgow Coma): C-CDA R2.1 carries the Assessment Scale Observation as a
  **direct section entry**, **not** as a Functional/Mental Status Organizer member, the placement the
  twelfth slice deferred here. A clean build carries **zero warnings** and the serializer fixed point holds.
  - **Parser (read).** `extractFunctionalStatus` / `extractMentalStatus` now read a **direct-entry**
    Assessment Scale Observation (`…22.4.69`) as a `StatusObservation` flagged `assessmentScale: true`. Its
    **domain is the carrying section's**: gated on the section's own templateId root or LOINC section code,
    since the same OID appears in both sections, so a scale in one section is never pulled into the other
    domain; a scale in a section that is neither is not read (its domain is unknowable, never guessed). The
    lenient organizer-member reading is retained (Postel's Law). The scale's scored components
    (`…22.4.86`) are read into a new `SupportingObservation[]` on `StatusObservation.supporting`, so scale
    detail is never dropped.
  - **New `integer` observation-value kind.** `ObservationValue` gains
    `{ kind: "integer"; value?: number; nullFlavor?: string }` for `<value xsi:type="INT">`: the type
    C-CDA prefers for a questionnaire score (units are not allowed on an `INT`). `value` and `nullFlavor`
    are kept distinct: an explicit-unknown score is never collapsed into a real one.
  - **Builder (emit).** Two new optional `BuildCcdaInit` inputs, `functionalStatusScales` and
    `mentalStatusScales` (`BuildCcdaAssessmentScale[]`), emit direct-entry Assessment Scale Observations.
    Each carries the **bare-root** templateId `…22.4.69` (R2.1 SHALL: `@root` with **no** `@extension`,
    CONF:81-14436/14437), a SHALL `id`, the scale `code` (LOINC default), a SHALL `statusCode` (`completed`),
    the SHALL `effectiveTime` [1..1], and the SHALL `value` [1..1] as the total score `xsi:type="INT"`.
    Supporting components are optional Assessment Scale Supporting Observations (`…22.4.86`, bare root)
    grouped by `entryRelationship typeCode="COMP"`, each with its own SHALL `value` [1..*] INT score.
  - **The score is never fabricated (the safety rule).** An omitted total or item score is
    `value nullFlavor="UNK"`: an explicit unknown read back as an `integer` value with no number, never a
    guessed 0; an omitted `effectiveTime` is `nullFlavor="UNK"`; `interpretation` and `supporting` items are
    emitted only when supplied.
  - **The two domains are never conflated (the safety rule).** Only the carrying section's templates are
    emitted, so each scale reads back tagged `domain: "functional"` or `"mental"` from its section, proven
    by a both-sections round-trip. Emitted only when populated (the status sections are CCD `SHOULD`).
  - New public types: `BuildCcdaAssessmentScale`, `BuildCcdaAssessmentScaleItem`, `SupportingObservation`.
    No warning-code change; the round-trip-by-construction invariant and the serializer fixed point hold.
  - **Deferred:** the supporting observation's optional second `CO`/`CD` coded answer and `IVL_INT`
    reference range (both tolerated on parse, read without warning, but not yet modeled); the organizer's
    own `code`/`effectiveTime` on parse; the other eleven document types; C-CDA document editing; the
    bring-your-own-credentials terminology adapter; and the external-validator/Schematron differential gate.
- **Phase 7 (twelfth slice): builder emits Functional/Mental Status Organizers.** Extends `buildCcda`
  with two new optional inputs, `BuildCcdaInit.functionalStatusOrganizers`
  (`BuildCcdaFunctionalStatusOrganizer[]`) and `BuildCcdaInit.mentalStatusOrganizers`
  (`BuildCcdaMentalStatusOrganizer[]`), that **group** related status findings under one organizer, the
  complement to the standalone Functional/Mental Status Observations shipped in the seventh/eighth slices.
  Grouped members round-trip through `getFunctionalStatus()` / `getMentalStatus()` to the same structured,
  domain-tagged findings by construction; a clean build still carries **zero warnings**.
  - **Functional Status Organizer + Mental Status Organizer.** A Functional Status Organizer **`…22.4.66`**
    (the **`2014-06-09`** stamp) or Mental Status Organizer **`…22.4.75`** (the **`2015-08-01`** stamp) is
    emitted as `<organizer classCode="CLUSTER" moodCode="EVN">` in its status section, carrying a SHALL `id`,
    a `code` (SHOULD ICF `2.16.840.1.113883.6.254` or LOINC: SHALL [1..1] for the Functional Status
    Organizer, [0..1] for the Mental Status Organizer with its "at least one of code or effectiveTime" floor;
    caller-supplied, else an explicit `nullFlavor="UNK"` category), a SHALL `statusCode` (`completed`), an
    optional `effectiveTime` [0..1], and
    one or more `component` members. Each member is a Functional Status Observation **`…22.4.67`** or Mental
    Status Observation **`…22.4.74`**, byte-identical to the standalone builders (shared code path), so a
    grouped finding reads back with its fixed observation `code` (LOINC `54522-8` / SNOMED CT `373930000`)
    and coded finding `value` intact. Element order follows the CDA organizer schema (`templateId, id, code,
statusCode, effectiveTime, component+`).
  - **No clinical value, category, or date is ever fabricated (the safety rule).** An omitted organizer
    `code` is an explicit `nullFlavor="UNK"` (never a guessed categorization); an omitted organizer
    `effectiveTime` is simply not emitted (an optional element, never a fabricated date); an omitted finding
    `value` stays `nullFlavor="UNK"`. An organizer with zero findings is a `TypeError`: the template SHALL
    contain at least one member, so a zero-member organizer is never emitted.
  - **Functional and mental status are never conflated (the safety rule).** Only each domain's own organizer
    and observation templates are emitted, so a functional finding is never filed under mental status (or
    vice versa); grouped and standalone findings coexist in one section and all read back correctly
    domain-tagged.
  - **Emitted only when populated.** The status sections are CCD `SHOULD` (not `SHALL`) sections, emitted
    when either the standalone findings or the organizers are non-empty; an unpopulated section is not
    fabricated. The empty-build output is unchanged.
  - New public types: `BuildCcdaFunctionalStatusOrganizer` and `BuildCcdaMentalStatusOrganizer`. No parser
    change and no warning-code change; the round-trip-by-construction invariant and the serializer fixed
    point still hold.
  - **Deferred:** the **Assessment Scale Observation** (`…22.4.69`) and Assessment Scale Supporting
    Observation (`…22.4.86`): in C-CDA R2.1 the Assessment Scale Observation is a _direct section entry_ of
    the Functional/Mental Status Section, **not** a component of the organizer, and the current parser reads
    assessment scales only as organizer members; shipping it conformantly needs a coordinated parser
    increment (read a direct-entry assessment scale by its section's domain), so it is deferred. Also
    deferred: capturing the organizer's own `code`/`effectiveTime` on parse (members round-trip; the wrapper
    metadata does not yet), the Self-Care Activities organizer member (`…22.4.128`), the other eleven
    document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.

- **Phase 7 (eleventh slice): builder emits a Family History section.** Extends `buildCcda` with one new
  optional input, `BuildCcdaInit.familyHistory` (`BuildCcdaFamilyHistory[]`), that round-trips through
  `getFamilyHistory()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Family History section + organizer + observation.** A Family History Section (V3) **`…22.2.15`**
    (LOINC `10157-6`, the **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so only
    the base `templateId` is emitted) carries one or more Family History Organizers **`…22.4.45`**: one
    per relative (`<organizer classCode="CLUSTER">`), each with a SHALL `id`, SHALL `statusCode`
    (`completed`), and a SHALL `subject/relatedSubject` (`@classCode="PRS"`) naming the family member:
    a coded `relationship` (SNOMED CT by default, e.g. `72705000` mother / `9947008` father, overridable
    to HL7 RoleCode), plus the MAY `administrativeGenderCode`, `birthTime`, and `sdtc:deceasedInd` flag.
    Under it, each condition is a Family History Observation **`…22.4.46`** with the SHALL fixed `code`
    (SNOMED CT `64572001` "Condition"), a SHALL `statusCode`, the SHOULD [0..1] `effectiveTime`, and the
    SHALL coded `value` (the illness); a condition MAY nest an Age Observation **`…22.4.31`** (age at onset,
    a `PQ` in UCUM years) and a Family History Death Observation **`…22.4.47`** (cause of death).
  - **No clinical value, date, or relation is ever fabricated (the safety rule).** An unknown relationship
    is `relatedSubject/code nullFlavor="UNK"` and an unknown condition is `value nullFlavor="UNK"`: an
    explicit unknown, never guessed. The MAY demographics, the Age/Death sub-observations, and the SHOULD
    `effectiveTime` are each emitted only when supplied.
  - **Conditions are grouped by relative, never flattened.** Each relative's identity rides once on its
    organizer, so every condition reads back under its relative via `getFamilyHistory()`. The section
    narrative reads each condition's `relative: illness` label (`#id`-referenced), agreeing with the
    reconciled `value`, so no `CODE_NARRATIVE_MISMATCH` fires.
  - **Emitted only when populated.** Family History is a CCD `SHOULD` (not `SHALL`) section, so (like the
    other optional sections) an unpopulated section is **not** fabricated. The empty-build output is
    unchanged.
  - New public types: `BuildCcdaFamilyHistory` and its members `BuildCcdaFamilyMember` /
    `BuildCcdaFamilyHistoryObservation`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms in the builder, the other
    eleven document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and
    the external-validator/Schematron differential-testing gate.

- **Phase 7 (tenth slice): builder emits a Plan of Treatment section.** Extends `buildCcda` with one new
  optional input, `BuildCcdaInit.planOfTreatment` (`BuildCcdaPlannedItem[]`), that round-trips through
  `getPlannedItems()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Plan of Treatment section + the six planned-entry templates.** A Plan of Treatment Section (V2)
    **`…22.2.10`** (LOINC `18776-5`, the **`2014-06-09`** stamp, which has **no** entries-required `.1`
    variant, so only the base `templateId` is emitted) carries one or more of the six planned templates,
    each the **`2014-06-09`** stamp: Planned Act **`…22.4.39`** (`<act>`), Planned Encounter **`…22.4.40`**
    (`<encounter>`), Planned Procedure **`…22.4.41`** (`<procedure>`), Planned Medication Activity
    **`…22.4.42`** (`<substanceAdministration>`, drug in the `consumable`, no direct `<code>`), Planned
    Supply **`…22.4.43`** (`<supply>`), and Planned Observation **`…22.4.44`** (`<observation>`, carrying an
    optional expected `value`). Each emits a SHALL `id`, its coded order (default code system by kind:
    SNOMED CT for act/procedure/supply, CPT for encounter, LOINC for observation, RxNorm for medication), a
    planned `@moodCode`, and the SHALL `statusCode` fixed to `active`.
  - **Planned is never conflated with performed (the safety rule).** No variant admits the performed `EVN`
    mood, and `statusCode` is fixed to `active` (never a performed `completed`), so every entry reads back
    as `disposition: "planned"`, never mistaken for a performed Procedure/Encounter; a build carrying both
    a performed and a planned procedure keeps them in `getProcedures()` vs `getPlannedItems()`.
  - **The planned `@moodCode` domain is correct by construction.** `BuildCcdaPlannedItem` is a per-kind
    discriminated union: act/encounter/procedure accept the appointment moods `APT`/`ARQ`
    (`PlannedActMood`), while medication/supply/observation accept only `INT`/`RQO`/`PRMS`/`PRP`
    (`PlannedOrderMood`), because the base CDA R2 domains `x_DocumentSubstanceMood` /
    `x_ActMoodDocumentObservation` exclude `APT`/`ARQ`. A schema-invalid appointment mood on a drug order or
    a lab is not representable: the type prevents it, not merely discourages it.
  - **Optional data is never fabricated.** The planned `effectiveTime` (SHOULD [0..1]) and the Planned
    Observation's expected `value` [0..1] are emitted only when supplied: an undated plan carries no
    fabricated date and no invented result. The section narrative agrees with each item's reconciled `code`
    (`#id`-referenced), so no `CODE_NARRATIVE_MISMATCH` fires.
  - **Emitted only when populated.** Plan of Treatment is a CCD `SHOULD` (not `SHALL`) section, so (like
    the other optional sections) an unpopulated section is **not** fabricated. The empty-build output is
    unchanged.
  - New public types: `BuildCcdaPlannedItem` and its members `BuildCcdaPlannedAct` / `BuildCcdaPlannedOrder`
    / `BuildCcdaPlannedObservation`, plus `PlannedActMood` / `PlannedOrderMood`. No parser change and no
    warning-code change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms and the Family History
    section in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own-credentials terminology adapter, and the external-validator/Schematron
    differential-testing gate.

- **Phase 7 (ninth slice): builder emits a Past Medical History section.** Extends `buildCcda` with one
  new optional input, `BuildCcdaInit.pastMedicalHistory` (`BuildCcdaProblem[]`, reusing the Problems
  input shape), that round-trips through `getPastMedicalHistory()` to the same structured content by
  construction; a clean build still carries **zero warnings**.
  - **Past Medical History section + bare Problem Observation.** A Past Medical History section
    **`…22.2.20`** (LOINC `11348-0`, the V3 **`2015-08-01`** stamp, which has **no** entries-required `.1`
    variant, so only the base `templateId` is emitted) carries one or more historical problems as **bare**
    Problem Observations **`…22.4.4`** (the **`2015-08-01`** stamp) directly under each `<entry>`, **not**
    wrapped in a Problem Concern Act (`…22.4.3`) the way the Problems section nests them. The bare
    observation build is now shared verbatim with the Problems section, mirroring the parser's own reuse
    (`buildProblem` serves both `getProblems` and `getPastMedicalHistory`). Each observation emits the
    fixed SNOMED CT `code` (`55607006` "Problem"), a SHALL `statusCode` (fixed `completed`), a SHALL
    `effectiveTime` [1..1] (onset as `low`; a `nullFlavor="UNK"` `high` for a resolved problem), and the
    SHALL `value` [1..1] carrying the coded condition (SNOMED CT / ICD-10-CM).
  - **A past illness is never double-counted as an active problem concern (the safety rule).** The
    extractors route on structure: a bare observation to `getPastMedicalHistory`, a concern-act-wrapped
    one to `getProblems`, so a resolved past problem never reads back as an active concern (or vice
    versa); a build carrying both keeps them in their respective accessors.
  - **Onset/resolution are never fabricated.** A supplied onset is the `effectiveTime/low`; an absent
    onset is an explicit `nullFlavor="UNK"` `low`; a resolved-but-date-unknown problem adds a
    `nullFlavor="UNK"` `high`, never a guessed date.
  - **Emitted only when populated.** Past Medical History is not a CCD `SHALL` section, so (like the other
    optional sections) an unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - No new public type (reuses `BuildCcdaProblem`). No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms, and the remaining
    sections (Plan of Treatment / Family History) in the builder, the other eleven document types, C-CDA
    document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.

- **Phase 7 (eighth slice): builder emits a Mental Status section.** Extends `buildCcda` with one new
  optional input, `BuildCcdaInit.mentalStatus` (`BuildCcdaMentalStatus[]`), that round-trips through
  `getMentalStatus()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Mental Status section + Mental Status Observation.** A Mental Status section **`…22.2.56`** (LOINC
    `10190-7`, the V2 **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so only the
    base `templateId` is emitted) carries one or more standalone Mental Status Observations **`…22.4.74`**
    (the **`2015-08-01`** stamp). Unlike Functional Status (`2014-06-09`), the Mental Status templates were
    **new in the R2.1 August 2015 errata**, split out of Functional Status, hence the later stamp. Each
    observation emits the R2.1 template-**fixed** SNOMED CT `code` (`373930000` "Cognitive function
    finding"), a SHALL `statusCode` (fixed `completed`), a SHALL `effectiveTime` [1..1] (the assessed time;
    `nullFlavor="UNK"` when unknown), and the SHALL **SNOMED CT** `value` [1..1] carrying the specific
    cognition/mood finding.
  - **Mental and functional status are never conflated (the safety rule).** Only Mental Status templates
    are emitted here, and the two extractors key off their distinct observation roots (`…22.4.67` vs
    `…22.4.74`), so the parser reads every finding back tagged **`domain: "mental"`**, a mental finding is
    never filed under Functional Status (or vice versa).
  - **Unknown is never defaulted to a finding.** When the caller supplies no `value`, the SHALL `value` is
    emitted as an **explicit `nullFlavor="UNK"`**: never invented as a real finding; the SHALL
    `effectiveTime` is likewise `nullFlavor="UNK"` when no assessed time is given, never a fabricated date.
  - **Emitted only when populated.** Mental Status is not a CCD `SHALL` section, so (like Functional Status
    / Immunizations / Procedures / Encounters / Social History) an unpopulated section is **not**
    fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaMentalStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms, and the remaining
    sections (Plan of Treatment / Family History / Past Medical History) in the builder, the other eleven
    document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.
- **Phase 7 (seventh slice): builder emits a Functional Status section.** Extends `buildCcda` with
  one new optional input, `BuildCcdaInit.functionalStatus` (`BuildCcdaFunctionalStatus[]`), that
  round-trips through `getFunctionalStatus()` to the same structured content by construction; a clean
  build still carries **zero warnings**.
  - **Functional Status section + Functional Status Observation.** A Functional Status section
    **`…22.2.14`** (LOINC `47420-5`, the V2 **`2014-06-09`** stamp, which has **no** entries-required
    `.1` variant, so only the base `templateId` is emitted) carries one or more standalone Functional
    Status Observations **`…22.4.67`** (the **`2014-06-09`** stamp). Each observation emits the
    template-**fixed** LOINC `code` (`54522-8` "Functional status"), a SHALL `statusCode` (fixed
    `completed`), a SHALL `effectiveTime` [1..1] (the assessed time; `nullFlavor="UNK"` when unknown),
    and the SHALL **SNOMED CT** `value` [1..1] carrying the specific finding.
  - **Functional and mental status are never conflated (the safety rule).** Only Functional Status
    templates are emitted, so the parser reads every finding back tagged **`domain: "functional"`**, a
    functional finding is never filed under Mental Status (`getMentalStatus()` stays empty).
  - **Unknown is never defaulted to a finding.** When the caller supplies no `value`, the SHALL `value`
    is emitted as an **explicit `nullFlavor="UNK"`**: never invented as a real finding; the SHALL
    effectiveTime is likewise `nullFlavor="UNK"` when no assessed time is given, never a fabricated date.
  - **Emitted only when populated.** Functional Status is not a CCD `SHALL` section (the CCD required set
    is Allergies / Medications / Problems / Results), so (like Immunizations / Procedures / Encounters /
    Social History) an unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaFunctionalStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** Mental Status, the Functional/Mental Status Organizer + Assessment Scale forms, and the
    remaining sections (Plan of Treatment / Family History / Past Medical History / …) in the builder,
    the other eleven document types, C-CDA document _editing_, the bring-your-own-credentials
    terminology adapter, and the external-validator/Schematron differential-testing gate.

- **Phase 7 (sixth slice): builder emits a Social History (Smoking Status) section.** Extends
  `buildCcda` with one new optional input, `BuildCcdaInit.smokingStatus` (`BuildCcdaSmokingStatus[]`),
  that round-trips through `getSmokingStatus()` to the same structured content by construction; a
  clean build still carries **zero warnings**.
  - **Social History section + Smoking Status observation.** A Social History section **`…22.2.17`**
    (LOINC `29762-2`, the V3 **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so
    only the base `templateId` is emitted) carries one or more Smoking Status (Meaningful Use)
    observations **`…22.4.78`** (the **`2014-06-09`** stamp). Each observation emits the fixed LOINC
    `code` (`72166-2` "Tobacco smoking status"), a SHALL `statusCode`, a SHALL `effectiveTime` (the
    recorded time; `nullFlavor="UNK"` when unknown), and the SHALL **SNOMED CT** `value` from the
    Current Smoking Status value set.
  - **Unknown is never defaulted to a status (the safety rule).** When the caller supplies no `value`,
    the SHALL `value` is emitted as an **explicit `nullFlavor="UNK"`**, read back by the parser as
    `unknown: true` and flagged `SMOKING_STATUS_UNKNOWN`, **never** invented as a "never smoker" (or any
    other) reading. Absent status ≠ non-smoker; `nullFlavor` and a real coded value are never conflated.
  - **Emitted only when populated.** Social History is not a CCD `SHALL` section (the CCD required set is
    Allergies / Medications / Problems / Results), so (like Immunizations / Procedures / Encounters) an
    unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaSmokingStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Plan of Treatment / Functional Status / Family History / Past
    Medical History / …) in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own terminology adapter, and the external Schematron/XSD differential-validation gate.

- **Phase 7 (fifth slice): builder emits Procedures and Encounters sections.** Extends `buildCcda`
  beyond the header + reconciliation triad + Results/Vital Signs/Immunizations to emit the next two
  roadmap sections, added together because they share plumbing (a coded act with `statusCode` +
  `effectiveTime` + structured/narrative agreement). Two new optional inputs, `BuildCcdaInit.procedures`
  (`BuildCcdaProcedure[]`) and `BuildCcdaInit.encounters` (`BuildCcdaEncounter[]`), each round-trip
  through `getProcedures()` / `getEncounters()` to the same structured content by construction, and a
  clean build still carries **zero warnings**.
  - **Procedures.** One of the three Procedure Activity variants per entry: operative `<procedure>`
    **`…22.4.14`**, non-altering `<act>` **`…22.4.12`**, or assessment `<observation>` **`…22.4.13`**
    (`kind`, default `"procedure"`), inside a Procedures section **`…22.2.7.1`** (LOINC `47519-4`). The
    section and all three entry templates carry the R2.1 **`2014-06-09`** stamp (not the `2015-08-01`
    stamp the other sections use); a new per-section `extension` is threaded through the section-template
    helper for this. The coded procedure (**SNOMED CT** by default) is the SHALL `code`; the SHALL
    `statusCode` is always emitted.
  - **`moodCode` is the safety-critical axis.** `disposition: "performed"` → `moodCode="EVN"`,
    `"planned"` → `"INT"`; the parser reads it back as its performed-vs-planned disposition and the two
    are **never conflated**. `statusCode` defaults per disposition (performed → `completed`, planned →
    `active`). The Procedure `effectiveTime` is **SHOULD [0..1]** (CONF:1098-7662), so it is emitted
    **only when supplied**, never fabricated with a `nullFlavor` when unknown. An
    `"observation"`-variant procedure that omits its **SHALL `value` [1..1]** (`…22.4.13`) **throws** a
    `TypeError` rather than emit a non-conformant, value-less observation.
  - **Encounters.** An Encounter Activity **`…22.4.49`** (`@2015-08-01`) inside an Encounters section
    **`…22.2.22.1`** (LOINC `46240-8`). The encounter type is the **SHALL `code` [1..1]** (**CPT** by
    default) and is required on the input; the **SHALL `effectiveTime` [1..1]** visit period is always
    emitted as an `IVL_TS`: real `low`/`high` bounds when a `period` is supplied, else a
    `nullFlavor="UNK"` `low` that satisfies the cardinality without inventing a date (read back as
    absent). `statusCode` defaults to `completed`.
  - **Emitted only when populated.** Neither Procedures nor Encounters is a CCD `SHALL` section (the CCD
    required set is Allergies / Medications / Problems / Results), so (like Immunizations) an
    unpopulated section is **not** fabricated as an empty `nullFlavor="NI"` shell. The empty-build output
    is unchanged.
  - New public types `BuildCcdaProcedure` and `BuildCcdaEncounter`. No parser change and no warning-code
    change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Plan of Treatment / Social History / Functional Status / Family
    History / …) in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own terminology adapter, and the external Schematron/XSD differential-validation gate (the
    roadmap's still-unproven pure-JS-engine-capacity question, §10 Q10). A `buildCcda` document remains
    expected-but-not-proven against an external IG validator.

- **Phase 7 (fourth slice): builder emits an Immunizations section.** Extends `buildCcda` beyond the
  header + the reconciliation triad + Results/Vital Signs to emit **Immunizations**: the natural
  continuation that completes the Phase-3 discrete-data trio (Results / Vital Signs / Immunizations) in
  the emit path. A new optional `BuildCcdaInit.immunizations` (`BuildCcdaImmunization[]`) drives one
  **Immunization Activity `…22.4.52`** `substanceAdministration` per shot → **Immunization Medication
  Information `…22.4.54`**, the vaccine at `consumable/manufacturedProduct/manufacturedMaterial/code`
  (**CVX** by default). Each entry round-trips through `getImmunizations()` to the same structured
  content by construction, and a clean administered build still carries **zero warnings**.
  - **Safety-critical fail-safes, mirroring the existing sections.** `dose` (`doseQuantity`) and `route`
    (`routeCode`, **NCI Thesaurus** by default) are **never guessed**: an omitted one is simply left
    absent. A **refused / not-administered** shot (`refused: true`) is emitted as `negationInd="true"`,
    which the parser reads back as `refused` and flags `IMMUNIZATION_REFUSED`: the clinically
    load-bearing refusal is surfaced, **never conflated** with a `nullFlavor` "unknown" (opposite
    clinical meaning).
  - **SHALL `effectiveTime` [1..1]** on the Immunization Activity (the substantive cardinality grounded
    against the C-CDA R2.1 IG; the exact `CONF:` id is not re-verified and is intentionally not asserted):
    the administration date is emitted as an `@value` when supplied, else `nullFlavor="UNK"`, satisfying
    the cardinality without fabricating a clinical timestamp, read back as absent (never a real `Date`),
    consistent with the third slice's every-entry `effectiveTime` rule.
  - **Emitted only when populated.** Immunizations is **not** a CCD `SHALL` section (the CCD required set
    is Allergies / Medications / Problems / Results), so an unpopulated Immunizations section is **not**
    fabricated as an empty `nullFlavor="NI"` shell, unlike the five CCD sections the builder always
    emits. The empty-build output is therefore unchanged.
  - New public type `BuildCcdaImmunization`. No new required fields, no parser change, no warning-code
    change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Procedures / Encounters / Plan of Treatment / Social History /
    …) in the builder, the other eleven document types, C-CDA document _editing_, the bring-your-own
    terminology adapter, and the external Schematron/XSD differential-validation gate (the roadmap's
    still-unproven pure-JS-engine-capacity question, §10 Q10). A `buildCcda` document remains
    expected-but-not-proven against an external IG validator.

- **Phase 7 (third slice): builder emits the `SHALL` `effectiveTime` on every entry.** Closes the
  conformance gap the previous slice flagged in the README known-limitations: `buildCcda` emitted each
  act/observation's `effectiveTime` **only when the caller supplied a time**, so a built document
  round-tripped but was not Schematron-complete (several R2.1 `SHALL`-cardinality `effectiveTime` slots
  could be absent). Every affected template now emits the element its IG constraint requires, across
  **all** sections: the Problems/Allergies concern acts + observations, the Medication Activity `IVL_TS`
  duration, and the Results/Vital Signs organizers + observations.
  - Where the caller supplied a time it is used; where a `SHALL` requires the element but no time is known
    the slot is `nullFlavor="UNK"`, satisfying the cardinality **without fabricating** a clinical
    timestamp, and read back as absent (`date === undefined`), never a real time. Mirrors the header's
    `SHALL` `addr`/`telecom` and the never-guessed `dose`/`route`.
  - Per-template cardinality, confirmed against the C-CDA R2.1 IG before emitting: Problem/Allergy
    **Concern Act** `effectiveTime` `SHALL` [1..1] under the shared Concern Act rule (active→`low`,
    completed→`high`: on the Problem Concern Act `…22.4.3` these are CONF:1198-7504 / CONF:1198-10085;
    the Allergy Concern Act `…22.4.30` carries the same rule under its own ids); Problem `…22.4.4` and
    Allergy-Intolerance `…22.4.7` **Observations** carry `low`
    (onset); **Medication Activity `…22.4.16`** `IVL_TS` duration `SHALL` [1..1] (CONF:1098-7495/-7496,
    -32890); Result `…22.4.2` and Vital Sign `…22.4.27` **Observations** `SHALL` [1..1]; Result `…22.4.1`
    and Vital Signs `…22.4.26` **Organizers** span the members.
  - New optional inputs `BuildCcdaResultPanel.effectiveTime` / `BuildCcdaVitalsPanel.effectiveTime` (the
    organizer span time). No new required fields, no parser change, no warning-code change. The
    round-trip-by-construction invariant and the zero-warning clean build still hold; a `nullFlavor="UNK"`
    time is explicitly tested not to re-parse into a fabricated `Date`.
  - **Deferred:** a caller-supplied allergy/problem resolution date; the reaction/severity/criticality
    optional `effectiveTime` (0..1, no `SHALL` gap); full XSD element-order + Schematron completeness: no
    external validator was reachable, so cardinality was grounded against the raw IG text, not asserted by
    a validator run.

- **Phase 7 (second slice): richer builder section emitters (Medications, Results, Vital Signs).**
  Extends `buildCcda` from the header + Problems + Allergies of the first slice to emit **populated,
  discrete-data** clinical sections that were previously empty `nullFlavor="NI"` placeholders. Each new
  section round-trips through `parseCcda` to the same structured content by construction, and a clean
  build still carries **zero warnings**.
  - **Medications**: Medication Activity `…22.4.16` `substanceAdministration` → Medication Information
    `…22.4.23`, the drug at `consumable/manufacturedProduct/manufacturedMaterial/code` (**RxNorm** by
    default), the periodic frequency (`PIVL_TS` period) and therapy window (`IVL_TS` low/high) emitted
    as **two distinct `effectiveTime` siblings** (never conflated). `dose` (`doseQuantity`) and `route`
    (`routeCode`, **NCI Thesaurus** by default) are **never defaulted**: an omitted one is left absent
    so the parser flags it (`MISSING_DOSE_QUANTITY` / `MISSING_ROUTE_CODE`), exactly the fail-safe the
    allergy `type` default established.
  - **Results**: Result Organizer `…22.4.1` → Result Observation `…22.4.2`, the LOINC test code, a
    typed `value` in **exactly one** form (a UCUM-checked `PQ` quantity, a `CD` coded value, or a `ST`
    string: the builder throws if none or more than one is set, so a result value is never dropped or
    invented), an optional structured `IVL_PQ` reference range, and an `interpretationCode`.
  - **Vital Signs**: Vital Signs Organizer `…22.4.26` → Vital Sign Observation `…22.4.27`, the LOINC
    vital code and a **UCUM** `PQ` reading; the organizer carries the SNOMED `46680005` "Vital signs"
    cluster code.
  - **Units are safety-critical.** Result/Vital `PQ` units are emitted verbatim and checked by the
    computable UCUM grammar on re-parse: a non-UCUM or case-slipped unit (`Kg` for `kg`) surfaces
    `NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT` rather than being silently "corrected" to a confident-wrong
    value. Each populated section declares the entries-required `.1` templateId; a section with no
    supplied content stays a spec-clean empty `nullFlavor="NI"` section (entries-optional templateId
    only).
  - New public surface: the input types `BuildCcdaMedication`, `BuildCcdaResultPanel`, `BuildCcdaResult`,
    `BuildCcdaVitalsPanel`, `BuildCcdaVital`, and `BuildQuantity`. No parser change, no warning-code
    change. Synthetic-only fixtures throughout.
  - **Deferred to a later CCDA-P7 increment:** the remaining sections (Immunizations, Procedures,
    Encounters, Plan of Treatment, Social History, …), the other eleven document types, C-CDA document
    _editing_, and the bring-your-own-credentials semantic-terminology adapter.

- **Phase 7 (first slice): document builder `buildCcda`.** The conservative _emit_ factory, symmetric
  with `parseCcda` and mirroring the sibling `@cosyte/hl7`'s `buildMessage`: from a semantic
  `BuildCcdaInit` it assembles a **spec-clean C-CDA R2.1 CCD** and returns a real `CcdaDocument`.
  - **Round-trip by construction.** The builder emits through the _same DOM the parser reads_: it
    builds an `@xmldom/xmldom` document with `createElementNS` (the serializer does all XML escaping),
    serializes it with the shared `serializeDocument`, then parses that text with `parseCcda`. The
    returned document is the parse of the emitted XML, so a document `buildCcda` emits always parses
    back to the same structured content and `parseCcda(doc.toString()).toString() === doc.toString()`
    holds automatically. A clean build carries **zero warnings**.
  - **Emits** the full US Realm Header (US Realm Header `…22.1.1@2015-08-01` + CCD `…22.1.2@2015-08-01`
    templateIds, LOINC document code `34133-9`, `recordTarget` with the SHALL `addr`/`telecom`, a device
    `author`, and a `custodian`, no invented person, no PHI) plus the two safety-critical
    reconciliation sections: **Problems** (Problem Concern Act `…22.4.3` → Problem Observation `…22.4.4`,
    active/resolved/inactive → concern `statusCode`, code↔narrative agreement) and **Allergies** (Allergy
    Concern Act `…22.4.30` → Allergy-Intolerance Observation `…22.4.7`, allergen at
    `participant/…/playingEntity/code`, optional Reaction/Severity/Criticality kept as distinct axes, the
    propensity `type` defaulting to the neutral SNOMED `419199007` "Allergy to substance", never a
    guessed "Drug allergy", and the **`negationInd` "No Known Allergies"** form emitted as a negation
    with no `nullFlavor`). The other CCD SHALL sections (Medications, Results) are emitted as spec-clean
    **empty, entries-optional** `nullFlavor="NI"` sections (never the entries-required `.1` with zero
    entries), so the document is conformant with no `REQUIRED_SECTION_MISSING`.
  - New public surface: `buildCcda` and the input types `BuildCcdaInit`, `BuildCcdaPatient`,
    `BuildCcdaProblem`, `BuildCcdaAllergy`, `BuildCode`. No parser change, no warning-code change.
    Synthetic-only fixtures; omitted demographics emit `nullFlavor="UNK"` rather than invented values.
  - **Deferred to a later CCDA-P7 increment:** richer section builders (Medications, Results, Vital
    Signs, Immunizations, Procedures, …), the other eleven document types, and the
    bring-your-own-credentials semantic-terminology adapter + optional bundled redistributable data.

- **Phase 6: vendor / conformance profile system (registry with provenance).** A `defineCcdaProfile()`
  engine mirroring the sibling `@cosyte/hl7` profile shape (`name` / `lineage` / `describe()` /
  `extends`-merge), a provenance-backed built-in registry (`ccdaProfiles`, `getCcdaProfile`,
  `listCcdaProfiles`), and a process-scoped default (`set/getDefaultCcdaProfile`). `parseCcda(xml,
{ profile })` applies it: a profile downgrades the **non-safety-critical** deviations it _expects_
  to a `PROFILE_QUIRK_APPLIED` warning (flagged `expected: true`, carrying the original `toleratedCode`
  in a preserved `doc.warnings` entry, a tolerated deviation is **never dropped**), and never changes
  an extracted clinical value (it operates purely at the warning-emitter layer). `doc.profile` records
  the applied profile's name + lineage.
  - **Safety gate (the load-bearing rule).** A profile can **never** tolerate a safety-critical warning
    code: patient identity (`MISSING_ASSIGNING_AUTHORITY`, `MULTIPLE_RECORD_TARGETS`), allergy
    negation/granularity, dose/route/timing, UCUM units, code↔narrative mismatch, unhandled value
    types, active-vs-resolved / planned-vs-performed status, a wrong/unknown code system
    (`UNEXPECTED_CODE_SYSTEM`), a malformed datetime (`MALFORMED_DATETIME`), or a missing SHALL section.
    Attempting to tolerate one throws `CcdaProfileDefinitionError` at definition time (`SAFETY_CRITICAL_CODES`).
  - **Evidence-backed built-ins (no invented vendor quirks, per ADR 0018).** `ccdaProfiles.smartScorecard`:
    deprecated-terminology tolerance grounded in the public SMART C-CDA Scorecard rubric + D'Amore
    et al., _JAMIA_ 2014 (deprecated BMI LOINC 41909-3, ICD-9 in newer docs, malformed `nullFlavor`
    tokens). `ccdaProfiles.legacyR11`: R1.1-origin receive-tolerance (absent 2015-08-01 version stamp,
    LOINC-fallback section matching) grounded in ONC §170.315(b)(1)'s receive-both-R2.1-and-R1.1
    requirement + the CC0 HL7/C-CDA-Examples corpus. Plus the conservative `default` baseline
    (tolerates nothing). Named per-vendor (Epic/Cerner/…) profiles deliberately await a real
    vendor-attributed grounding document: the anti-invention rule stands.
  - New public surface: `defineCcdaProfile`, `ccdaProfiles`, `getCcdaProfile`, `listCcdaProfiles`,
    `setDefaultCcdaProfile`, `getDefaultCcdaProfile`, `applyProfile`, `wrapEmitterWithProfile`,
    `SAFETY_CRITICAL_CODES`, `isSafetyCriticalCode`, `profileQuirkApplied`, `CcdaProfileDefinitionError`,
    the `PROFILE_QUIRK_APPLIED` warning code, and the `CcdaProfile` / `DefineCcdaProfileOptions` /
    `QuirkTolerance` / `QuirkMatch` / `ProfileProvenance` / `ProfileAttribution` types. Synthetic-only
    test fixtures (reuse the existing `buildCcda` builder); no realistic PHI.

- **Phase 5b: deferred clinical sections (Plan of Treatment, Functional / Mental Status, Family /
  Past Medical History).** `parseCcda(xml)` now extracts five more entry families, surfaced on
  `CcdaDocument` via `getPlannedItems()`, `getFunctionalStatus()`, `getMentalStatus()`,
  `getFamilyHistory()`, `getPastMedicalHistory()` (and the matching `doc.plannedItems` /
  `doc.functionalStatus` / `doc.mentalStatus` / `doc.familyHistory` / `doc.pastMedicalHistory` arrays):
  - **Plan of Treatment**: the six planned-entry templates (`…22.4.39`–`…22.4.44`: Act, Encounter,
    Procedure, Medication Activity, Supply, Observation), kept apart by a `kind` discriminant.
    **Everything here is future/ordered, never performed:** each item's `moodCode` is read into the same
    performed-vs-planned `disposition` as Procedures (a planned mood → `"planned"`), **never conflated**;
    a missing/unrecognized mood leaves `disposition` undefined rather than guessing. A Planned Medication
    Activity's drug is read from its `consumable`.
  - **Functional Status** / **Mental Status**: the Functional/Mental Status Observations (`…22.4.67` /
    `…22.4.74`), read standalone or as members of a status Organizer (`…22.4.66` / `…22.4.75`), plus any
    Assessment Scale Observation (`…22.4.69`, flagged `assessmentScale`) inside such an organizer. Each
    finding is `domain`-tagged so the two are **never conflated**; a standalone assessment scale (domain
    indeterminable from its template) is deliberately not captured.
  - **Family History**: the Family History Organizer (`…22.4.45`) → Observation (`…22.4.46`) tree. The
    relative's identity (relationship, gender, birth time, `sdtc:deceasedInd`) is a structured `relative`
    (not flattened); each condition carries its coded `value`, an optional Age Observation (`…22.4.31`,
    age at onset), and a `causeOfDeath` flag from a Family History Death Observation (`…22.4.47`).
  - **Past Medical History**: the **bare** Problem Observations (`…22.4.4`) a Past Medical History
    section (`…22.2.20`) carries directly under each `<entry>` (not in a Problem Concern Act), reusing
    the Problems model, so a past problem never double-counts as an active one.
  - **No new warning codes**: the deferred sections reuse the existing Tier-2 registry (e.g.
    `CODE_NARRATIVE_MISMATCH`, `NEGATION_VS_NULLFLAVOR_AMBIGUOUS`), and the required-section table is
    unchanged. (The Care Plan document's SHALL sections, `healthConcerns` + `goals`, already landed in
    Phase 5; a Plan of Treatment Section stays **excluded** because a Care Plan SHALL NOT contain one.)
- **Phase 5: Procedures, Encounters, Social-History smoking status + required-section validation.**
  `parseCcda(xml)` now extracts three more entry families and validates a document's SHALL sections,
  surfaced on `CcdaDocument` via `getProcedures()`, `getEncounters()`, `getSmokingStatus()` (and the
  `doc.procedures` / `doc.encounters` / `doc.smokingStatus` arrays):
  - **Procedures**: the three Procedure Activity templates: an altering/operative `<procedure>`
    (`…22.4.14`), a non-altering `<act>` service (`…22.4.12`), and an assessment `<observation>`
    (`…22.4.13`), kept apart by a `kind` discriminant. **`moodCode` is safety-critical:** a performed
    procedure (`EVN`) and a planned/ordered one (`INT`/`RQO`/`PRMS`/`PRP`/`APT`/`ARQ`) become a
    `disposition` of `"performed"` vs `"planned"` and are **never conflated**: a missing mood is
    `PLANNED_VS_PERFORMED_AMBIGUOUS`, an unrecognized mood is `PROCEDURE_MOOD_UNEXPECTED`, both leaving
    `disposition` undefined rather than guessing. A `negationInd` stays distinct from a `nullFlavor`.
  - **Encounters**: the Encounter Activity (`…22.4.49`): the visit type `code`, `statusCode`, and
    visit-period `effectiveTime`.
  - **Social History: Smoking Status**. The Smoking Status (Meaningful Use) observation (`…22.4.78`):
    the SNOMED CT `value` from the Current Smoking Status value set (`…11.20.9.38`). An
    explicitly-unknown status (a `nullFlavor` or an "unknown" SNOMED concept) sets `unknown: true` and
    emits `SMOKING_STATUS_UNKNOWN`: never silently read as "never smoked"; a value outside the value
    set is preserved and flagged `SMOKING_STATUS_CODE_UNRECOGNIZED`.
  - **Required-section (SHALL) validation**: for a recognized `DocumentType`, an absent required
    catalog section emits `REQUIRED_SECTION_MISSING` (a **warning**, never a fatal). The table is
    **conservative**: only unconditional, in-catalog, high-confidence SHALL constraints; it omits
    choice constraints (`A OR B`), SHOULD/MAY sections, and SHALL sections outside the recognized
    catalog. New `requiredSectionKeys` / `missingRequiredSections` expose the table.
  - Five new Tier-2 warning codes: `REQUIRED_SECTION_MISSING`, `PROCEDURE_MOOD_UNEXPECTED`,
    `PLANNED_VS_PERFORMED_AMBIGUOUS`, `SMOKING_STATUS_UNKNOWN`, `SMOKING_STATUS_CODE_UNRECOGNIZED`.
- **Phase 4: spec-clean serializer + immutable copy-with.** The conservative _emit_ half of the
  Postel's-Law contract, symmetric with `parseCcda`:
  - **`serializeCcda(doc)` and `doc.toString()`** re-emit a parsed document as spec-clean C-CDA XML
    with a guaranteed UTF-8 declaration. Both return the same string. Serialization is a **fixed
    point**: `parseCcda(serializeCcda(doc))` re-serializes to the identical text, and
    `parse(serialize(x))` is canonically equal to `x`, backed by the `@cosyte/test-utils` round-trip
    property invariant.
  - **No silent loss.** The output is snapshotted from the parsed XML DOM at parse time rather than
    reconstructed from the lossy read-model, so every element, attribute, namespace declaration
    (`xmlns` / `xmlns:xsi` / `xmlns:sdtc`), `templateId`, and even content the read-model never models
    survives the round-trip. A `nonXMLBody` base64 payload stays inert. A hand-constructed document
    (one not produced by `parseCcda`) retains no source and so throws from `toString()` until a
    document builder API lands in a later phase.
  - **`doc.withWarnings(extra)`**: the sanctioned structural-sharing copy-with: returns a **new**
    `CcdaDocument` with `extra` warnings appended, sharing every parsed field (header, sections,
    entries, serialized snapshot) by reference; the original is never mutated. The immutability
    invariant is enforced by the `@cosyte/test-utils` immutability property.
- **Phase 3: discrete clinical data: Results, Vital Signs, Immunizations.** `parseCcda(xml)` now
  extracts the three discrete-data entry families, surfaced on `CcdaDocument` via `getResults()`,
  `getVitals()`, and `getImmunizations()` (and the `doc.results` / `doc.vitals` /
  `doc.immunizations` arrays):
  - **Results**: Result Organizer (`…22.4.1`) → Result Observation (`…22.4.2`); the LOINC-coded
    analyte, the polymorphic observation `value` read into a discriminated `ObservationValue` union
    (`physicalQuantity` / `coded` / `string` / `range` / `unsupported`, selected by `xsi:type`), the
    `referenceRange` (structured `IVL_PQ` bounds, else free-text), and the `interpretationCode`.
  - **Vital Signs**: Vital Signs Organizer (`…22.4.26`) → Vital Sign Observation (`…22.4.27`); same
    UCUM-checked `ObservationValue` machinery, no reference range.
  - **Immunizations**: Immunization Activity (`…22.4.52`); the CVX vaccine reached via
    `consumable/manufacturedProduct/manufacturedMaterial/code`, `dose`, `route`, `effectiveTime`, and
    `statusCode`. A `negationInd="true"` refusal is modeled as a distinct `refused` flag (emitting
    `IMMUNIZATION_REFUSED`), never conflated with a `nullFlavor`.
  - **Computable, zero-dep UCUM grammar**: a recursive-descent validator (`isValidUcumUnit`,
    `isUcumCaseSuspect`) runs on every physical quantity. A non-UCUM unit is flagged
    (`NON_UCUM_UNIT`) and a letter-case slip of a canonical unit (`UCUM_CASE_SUSPECT`) is caught, but
    the **raw unit string is always preserved: units are never normalized away**. Property-based
    invariants back the grammar (well-formed-by-construction always validates; a canonical unit is
    never reported case-suspect; an annotation suffix never changes validity).
  - **Code-system recognition**: CVX (`CVX`) for vaccines and the HL7 `INTERPRETATION` system, plus
    LOINC deprecation checking (`checkLoincDeprecation`) on result/vital analyte codes.
  - **Seven new Tier-2 warning codes** for the discrete-data layer: `NON_UCUM_UNIT`,
    `UCUM_CASE_SUSPECT`, `MISSING_UNIT_ON_PQ`, `FREE_TEXT_REFERENCE_RANGE`,
    `RESULT_VALUE_TYPE_UNHANDLED`, `IMMUNIZATION_REFUSED`, and `DEPRECATED_LOINC`. The lenient
    invariant holds throughout: an unrecognized `value xsi:type` is preserved as `unsupported`
    (nothing dropped), and a `PQ` with a non-UCUM unit keeps its raw unit.
- **Phase 2: the clinical reconciliation triad.** `parseCcda(xml)` now extracts the three
  reconciliation entries from a structured body, surfaced on `CcdaDocument` via `getProblems()`,
  `getMedications()`, and `getAllergies()` (and the `doc.problems` / `doc.medications` /
  `doc.allergies` arrays):
  - **Problems**: Problem Concern Act (`…22.4.3`) → Problem Observation (`…22.4.4`); the coded
    condition (`value xsi:type="CD"`, SNOMED CT / ICD-10-CM), the concern `status`
    (active / resolved / inactive / unknown), and `effectiveTime`.
  - **Medications**: Medication Activity (`…22.4.16`); the RxNorm drug reached via
    `consumable/manufacturedProduct/manufacturedMaterial/code`, `dose`/`doseRange`, `route`, and the
    two `effectiveTime` siblings split by `xsi:type` into an `IVL_TS` therapy window (`duration`) and
    a `PIVL_TS` periodic `frequency`. `moodCode` (administered vs planned) kept distinct.
  - **Allergies**: Allergy Concern Act (`…22.4.30`) → Allergy-Intolerance Observation (`…22.4.7`);
    the allergen at `participant/participantRole/playingEntity/code`, each Reaction (`…22.4.9`) with
    its nested Severity (`…22.4.8`), and the propensity-level Criticality (`…22.4.145`): severity and
    criticality never merged. The `negationInd="true"` "No Known Allergies" assertion is modeled as a
    distinct `noKnownAllergy` flag, never conflated with a `nullFlavor` (value unknown).
  - **Code-system recognition**: structural `@codeSystem` OID validation per coded slot
    (`checkCodeSlot`, exported OIDs `SNOMED_CT` / `RXNORM` / `ICD10_CM` / `NDC` / `UNII` /
    `NCI_ROUTE` / …), flagging a deprecated (ICD-9) or unexpected terminology. Recognition only: it
    never bundles licensed terminology content; see the README "Code systems & provenance" note.
  - **Eleven new Tier-2 warning codes** for the entry layer: `NEGATION_VS_NULLFLAVOR_AMBIGUOUS`,
    `CODE_NARRATIVE_MISMATCH`, `NARRATIVE_REFERENCE_BROKEN`, `UNEXPECTED_CODE_SYSTEM`,
    `DEPRECATED_CODE_SYSTEM`, `MISSING_DOSE_QUANTITY`, `MISSING_ROUTE_CODE`,
    `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED`, `PROBLEM_STATUS_INDETERMINATE`,
    `ALLERGEN_GRANULARITY_SUSPECT`, and `SECTION_PLACEMENT_SUSPECT`. The two safety-critical
    reconciliations are conservative: a code↔narrative disagreement surfaces **both** and picks no
    winner; a missing `doseQuantity`/`routeCode` is preserved-as-absent and flagged, never defaulted.
- **Phase 1: the working parser.** `parseCcda(xml)` turns a real C-CDA R2.1 document into an
  immutable `CcdaDocument`:
  - **Document recognition**: all 12 US Realm document types (CCD, Discharge Summary, Referral Note,
    Consultation Note, History & Physical, Progress Note, Procedure Note, Operative Note, Care Plan,
    Diagnostic Imaging Report, Unstructured Document, Transfer Summary) resolved from the root
    `templateId`; `MISSING_TEMPLATE_ID` / `UNKNOWN_DOCUMENT_TEMPLATE` / `TEMPLATE_EXTENSION_ABSENT`
    warnings cover the deviations.
  - **US Realm header**: document identity, `code`, `title`, `effectiveTime`, `confidentialityCode`,
    `languageCode`, and the `recordTarget`/patient demographics (name parts, gender, birth time,
    marital status, race, ethnic group) + identifiers. Convenience accessors `getPatient()` and
    `getMrn()` (MRN selection isolated in `pickMrn` for a future profile override).
  - **Section framing**: sections recognized by `templateId` with a LOINC-code fallback
    (`SECTION_MATCHED_BY_LOINC_FALLBACK`), nested subsections, narrative text, and a narrative
    `ID`→text index for Phase-2 reference resolution; `findSection()` / `allSections()`. Unstructured
    documents expose their `nonXMLBody` (base64 left inert).
  - **HL7 v3 datatype layer**: `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`,
    variable-precision v3 datetime parsing, and null-flavor handling, plus namespace-aware DOM read
    helpers (`attr`, `child`, `children`, `childElements`, `text`, `xsiType`, `positionOf`).
- **Tier-2 warning registry** (stable string codes; renaming one is a breaking change) surfaced on
  `doc.warnings` (frozen), forwarded to `options.onWarning` (a throwing handler is contained), or (with `{ strict: true }`) escalated to a thrown `CcdaParseError`.
- **Hardened XML substrate + Tier-3 fatals**: DTD/DOCTYPE & external-entity rejection
  (`XXE_OR_DTD_PRESENT`), billion-laughs entity-expansion cap (`ENTITY_EXPANSION_LIMIT`), input-size
  (`INPUT_SIZE_LIMIT_EXCEEDED`), nesting-depth (`ELEMENT_DEPTH_LIMIT_EXCEEDED`), node-count
  (`NODE_COUNT_LIMIT_EXCEEDED`), malformed-XML (`NOT_WELL_FORMED_XML`), and non-`ClinicalDocument`
  root (`NOT_A_CLINICAL_DOCUMENT`) guards, with BOM stripping and base64 quarantine. Tunable via
  `DEFAULT_LIMITS` / `resolveLimits`; the substrate is exported as `parseSecureXml`.
- **PHI discipline**: every warning/fatal message and `position` carries only structural locators
  (element names, OIDs, coded tokens, line/column); clinical values never reach a diagnostic. Guarded
  by a sentinel-leak test suite.
- Project scaffold from the shared `@cosyte/*` parser template: the canonical toolchain (TypeScript
  ES2023 + strict rigor via `@cosyte/tsconfig`, ESLint 10 + type-checked `typescript-eslint` via
  `@cosyte/eslint-config`, Prettier via `@cosyte/prettier-config`, Vitest 4 + v8 coverage via
  `@cosyte/vitest-config`, dual ESM + CJS build via `tsup` + `@cosyte/tsup-config`, `attw` publish
  gate), thin callers of the reusable `cosyte/.github` CI/release workflows, Changesets on the
  `0.0.x` ladder, and the property-based conformance harness from `@cosyte/test-utils`.
- `VERSION` export.
- Ratified the XML-parser ADR (`docs/adr/0001-xml-parser.md` → **Accepted**) and added the first
  runtime dependency: **`@xmldom/xmldom`** (exact-pinned), chosen for a faithful W3C-DOM round-trip
  (namespaces, attributes, mixed narrative content, `xsi:type`) and an XXE-safe, hardenable posture:
  **1 of the ≤ 3** runtime-dep cap, intended as the shared XML substrate with `@cosyte/ncpdp`. No
  parse-layer code yet; Phase 1 configures and consumes it.

### Changed

### Deprecated

### Removed

### Fixed

- **Clinical safety: a planned entry nested in a Planned Intervention Act is no longer dropped from
  the model in silence, for any of the seven planned templates.** `getPlannedItems()` read an
  `<entry>`'s own act and went **no deeper**. C-CDA groups the interventions planned toward a goal in
  a **Planned Intervention Act** (`…22.4.146`), which carries an `entryRelationship` for each of the
  seven planned templates and holds the planned act **inline** in every one of them. So a planned
  drug order or a scheduled vaccination hanging off an intervention came back as **no item and no
  warning**: no `undefined` to test for, no code to filter on, and a document that round-tripped
  byte-for-byte through `serializeCcda`, which is exactly why nothing caught it. That is the same
  silence as the missing Planned Immunization Activity, one markup layer in and across all seven
  templates instead of one. A nested act now reads exactly as the same act reads as a direct
  `<entry>`: same `kind`, same `code`, same slot check, same product warnings.
  `MEDICATION_PRODUCT_ARM_CONFLICT` on a planned medication whose two `manufacturedProduct` arms name
  two different drugs is reachable there for the first time, as is the `vaccine` binding's
  `UNEXPECTED_CODE_SYSTEM` on a planned vaccination.
  - **It is the only container descended into, and R2.1 has others, so this does NOT solve nesting in
    general.** A Nutrition Recommendation (`…22.4.130`) inline-holds **six** of the seven (every
    planned template except `…22.4.120`) by the identical `entryRelationship` pattern, and an
    Intervention Act (`…22.4.131`), the performed sibling and the `SHOULD` entry of an Interventions
    Section, inline-holds a Planned Intervention Act. A planned entry in either still comes back as
    nothing with nothing said, unchanged from base, and a test pins **both** as unreached so the bound
    is measured rather than asserted. Widening to them is a decision with its own base-measured matrix.
    The container that **is** read is reached at all because `extractPlannedItems` runs on **every**
    `<section>` rather than on a recognized Plan of Treatment alone: the Plan of Treatment Section's
    eleven entry templates do not include it, and the Interventions Section (`…21.2.3`, LOINC
    `62387-6`) admits it as a direct entry.
  - **An `entryRelationship` is read for what it CONTAINS and never followed for what it REFERENCES.**
    The template's `[1..*]` `typeCode="RSON"` relationship holds an **Entry Reference** (`…22.4.122`)
    whose own SHALL names a Goal Observation recorded elsewhere. It carries an `<id>` and a
    `nullFlavor="NP"` `<code>` and no planned template, so it is stepped over rather than resolved:
    resolving it would hand back an item the container does not hold.
  - **Matching is on the `templateId` root alone**, which is what keeps the performed acts the same
    container also admits out of the result. A Medication Activity (`…22.4.16`) and a Planned
    Medication Activity (`…22.4.42`) are both `substanceAdministration`s, so an element-name or
    `@moodCode` test would either admit the performed one or start guessing at a mood the template
    already settles. `@moodCode` is still read onto `disposition`, so a planned template carrying a
    performed mood reports what it says rather than what its template promised.
  - **A returned item does not say whether it was direct or nested, deliberately.** The Planned
    Intervention Act is not modelled: no container type, no goal linkage, no flag, so the grouping
    toward the goal is available only from `doc.toString()`. What the accessor answers is which acts
    are planned, and a nested one is planned on the same terms as a direct one. Each item keeps its
    own `ids`, so a caller that needs the grouping can correlate.
  - **Still not returned, and still open.** Instruction (`…22.4.20`), Handoff Communication
    Participants (`…22.4.141`) and Nutrition Recommendation (`…22.4.130`) are admitted by the
    container exactly as by the section, and are still excluded without a warning at **both** levels.
    Whether they should be reported as dropped is left open rather than quietly decided, and a test
    pins the current answer instead of settling it. Goal Observation (`…22.4.121`) stays excluded on
    its own grounds: `moodCode="GOL"` is neither performed nor planned in this parser's mood model.
  - **Nothing a direct entry already returned changed.** The same act read as an `<entry>` reads
    identically before and after, across all seven templates.
  - **`buildCcda` cannot emit the container.** Emitting a conformant Planned Intervention Act means
    satisfying its `[1..*]` reference to a Goal Observation, which means modelling goals; that is not
    part of this change.
  - No warning code was added, renamed or reclassified, and no published type changed.

- **Clinical safety: a planned immunization is no longer dropped from the model in silence.** A Plan
  of Treatment entry carrying the Planned Immunization Activity template (`…22.4.120`) matched no
  template this parser recognized, so `getPlannedItems()` returned **no item for it at all** and
  raised **no warning**. A consumer reading that list to answer "what is this patient scheduled to
  receive" got a clean, warning-free answer with a scheduled vaccination missing from it: no
  `undefined` to test for, no code to filter on, and a document that round-tripped byte-for-byte
  through `serializeCcda`, which is exactly why nothing caught it. It comes back as
  `kind: "immunizationActivity"` now, one of seven planned-entry templates rather than six.
  - **Its `code` is the vaccine from the `consumable`, never the act's own `<code>`.** The template
    has the same shape as a Planned Medication Activity. `code` is base CDA R2's `[0..1]`
    `ActSubstanceAdministrationCode` (the _kind of administration act_) rather than a C-CDA
    constraint, since R2.1 constrains `code` on neither template; the substance participates through
    C-CDA's `consumable/manufacturedProduct` `[1..1]`, carrying Immunization Medication Information
    (`…22.4.54`). So every product warning applies to it, `MEDICATION_PRODUCT_ARM_CONFLICT`
    included, and the act `<code>` is not on the model (it round-trips through `doc.toString()`).
  - **Slot-checked at the `vaccine` binding, which is CVX only, not at the `medication` binding.**
    `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM` and (with a
    `TerminologyAdapter`) `SEMANTIC_CODE_INVALID` fire on a planned vaccine code for code with its
    performed twin. **The two planned `substanceAdministration` variants do not match each other**:
    NDC is expected on a drug and unexpected on a vaccine, so an NDC-coded planned vaccine draws
    `UNEXPECTED_CODE_SYSTEM` and an NDC-coded planned drug does not. Parity is with each variant's own
    performed twin, which is the only binding either can cite.
  - **Seven is what `getPlannedItems()` returns; eleven is what the section admits.** The four
    templates a Plan of Treatment section may carry that are **not** returned are Instruction
    (`…22.4.20`), Handoff Communication Participants (`…22.4.141`), Nutrition Recommendation
    (`…22.4.130`) and Goal Observation (`…22.4.121`). A Goal Observation is `moodCode="GOL"`, which
    this parser classifies as neither performed nor planned, so returning it would contradict the
    package's own mood model. Their narrative and structure are preserved and they re-serialize
    faithfully; nothing is raised about them, and whether anything should be is left open rather than
    decided here.
  - **An act stacking `…22.4.42` and `…22.4.120` still reads as a `medicationActivity`.** Extraction
    takes the first matching template and stops, and the new one is appended rather than inserted, so
    such an act reads exactly as it did before this template was recognized at all. Both variants read
    the same `consumable`, so the returned `CD` is identical either way; what the order decides is the
    reported `kind` and with it the binding. Nothing in a document that stacks two templates ranks
    them, so the tie is broken by not moving.
  - **A Planned Immunization Activity as a direct entry of another recognized section now draws
    `SECTION_PLACEMENT_SUSPECT`** (tolerable by a profile), joining the six planned roots already
    mapped to the Plan of Treatment.
  - **Measured against the previous behaviour rather than argued.** A 26-row matrix, thirteen product
    shapes each parsed as a Planned Immunization Activity **and** as its performed Immunization
    Activity twin: all thirteen performed rows are byte-identical to before, and all thirteen planned
    rows move from the same prior reading, _no item and no warning_. No row loses a warning, because
    no row had one; no row stops handing back a product, because none handed one back. After the
    change the two columns of all thirteen shapes agree exactly, which is the acceptance bar.
  - **`buildCcda` emits the variant too**, so the shape has round-trip coverage rather than
    parse-only coverage. Two details are the template's rather than house style: its `templateId` is
    **root-only** (`…22.4.120` is unversioned, where the six `…22.4.39`-`…22.4.44` templates carry the
    R2.1 `2014-06-09` stamp), and `effectiveTime` is **required** on `BuildCcdaPlannedImmunization`,
    because the template makes it `[1..1]`. **That is not unique to it:** Planned Medication Activity
    (`…22.4.42`) SHALL carry exactly one too (CONF:1098-30468), and it is the other **five** that are
    `[0..1]`. `BuildCcdaPlannedOrder` still types the field optional, so `buildCcda` can emit a Planned
    Medication Activity short that element; that gap predates this entry and is not closed here,
    because requiring the field is a breaking change to a published input type. New exported type:
    `BuildCcdaPlannedImmunization`. `PlannedItemKind` gains `"immunizationActivity"`.
  - **What this does not reach:** a planned entry that is **nested** rather than a direct `<entry>`
    act, for any of the seven kinds. That is a standing limitation of the accessor rather than
    something this entry changed. **The Planned Intervention Act case is closed by the entry above,
    which ships in the same release; the rest of the nested surface is not.**
- **Documentation: the enumeration of unquietable companions behind the tolerable product-arm codes
  listed three and there are four.** `MEDICATION_PRODUCT_ARM_UNEXPECTED` and
  `MEDICATION_PRODUCT_ARM_REPEATED` are tolerable by a profile only because every state in which no
  product identity comes back carries a companion no profile can quiet. The published list named
  `MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE` and
  `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` and omitted `MISSING_CODE_VALUE`, the companion on the
  shape where an element **is** selected and asserts neither a symbol nor a `nullFlavor` (two
  empty-`<code/>` material arms is exactly that shape). It covered the states where _selection_
  failed rather than every state where _identity_ is absent. All four are safety-critical, so no
  classification changes; the argument was incomplete, and it was incomplete in the README, the
  troubleshooting guide, and both warning docblocks. `MEDICATION_PRODUCT_ARM_UNEXPECTED`'s warning
  **message** now names the third companion too.
- **Documentation: the five unchecked planned kinds were justified more strongly than the facts
  support.** The stated reason for not slot-checking a planned act/encounter/procedure/supply/
  observation `code` was that binding them would mean inventing a value set this package cannot cite.
  That is true of the **system** checks only: `MISSING_CODE_VALUE` and `MISSING_CODE_SYSTEM` are
  raised before any binding is read, so both could be raised there without citing a value set. Leaving
  those five unchecked is a **choice**, and the documentation now says so. The behaviour is unchanged:
  they are still not checked, and widening that is a separate decision.

- **Clinical safety: a planned medication's drug is now code-system checked, exactly as a performed
  one's is. Until now a planned medication with NO drug identity at all could reach a consumer
  carrying only a profile-quietable warning.** `checkCodeSlot` runs at the five wired `CodeSlot`s,
  and a `PlannedItem.code` was not one of them, so `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`,
  `UNEXPECTED_CODE_SYSTEM` and (with a caller-supplied `TerminologyAdapter`) `SEMANTIC_CODE_INVALID`
  could not fire on a planned drug where they all fire on a performed one. A planned drug asserting
  a `@code` with no `@codeSystem`, an empty `<code/>`, or an OID outside RxNorm/NDC was read and left
  unremarked. The `medicationActivity` variant's `code` **is** the drug, read from the same
  `consumable/manufacturedProduct` a performed Medication Activity reads, so it is the same coded
  value in the same terminology at the same slot; it now gets the same check. Entered as
  `PRE-EXISTING` and queued by the slice above rather than folded into it, because making four codes
  newly reachable at a call site needs its own base-measured matrix.
  - **The sharpest consequence, and the reason this is a fix rather than a tidy.**
    `MEDICATION_PRODUCT_ARM_UNEXPECTED` and `MEDICATION_PRODUCT_ARM_REPEATED` are deliberately
    tolerable, and that rests on a conditional argument: wherever they fire without a `<code>` having
    been selected and read normally, an **unquietable** companion fires beside them. On the shape
    where an arm's `<code>` asserts neither a symbol nor a `nullFlavor`, the companion that argument
    names is `MISSING_CODE_VALUE`, which could not fire here. So the argument was false at this call
    site and only at this call site: a planned medication whose single arm was
    `<manufacturedLabeledDrug><code/></manufacturedLabeledDrug>` had no drug identity at all and drew
    `MEDICATION_PRODUCT_ARM_UNEXPECTED` alone, and two empty-`<code/>` material arms drew
    `MEDICATION_PRODUCT_ARM_REPEATED` alone. Neither is in `SAFETY_CRITICAL_CODES`, so a vendor
    profile plus the documented filter-the-expected-noise pattern reduced both to silence, on the
    section that says what a patient is **about to be given**. Both shapes now carry
    `MISSING_CODE_VALUE`, which no profile can quiet.
  - **Four codes, not five, and the fifth is named rather than glossed.**
    `DEPRECATED_CODE_SYSTEM` is **not** newly reachable: the `medication` slot's binding declares no
    deprecated systems, so it cannot fire at that slot on a performed medication either. An ICD-9-CM
    OID on a drug draws `UNEXPECTED_CODE_SYSTEM` in both places, and the matrix has a row that says so.
  - **Scoped to the one variant whose `code` is a drug.** The other five planned kinds carry the
    planned act itself (a LOINC observation, a CPT encounter, SNOMED act/procedure/supply). None is
    one of the five bound `CodeSlot`s, and binding them would mean inventing a value set this
    package cannot cite, so they are deliberately left unchecked.
  - **Monotone whole, for the first time in this series, and measured rather than argued.** A new
    26-row matrix (thirteen arm shapes, each parsed as a planned medication **and** as its performed
    twin) run against base `src/`: all thirteen performed rows come back byte-identical, ten of the
    thirteen planned rows move, and every one of them moves by **gaining** the code its performed twin
    was already drawing. No row goes from warned to silent, no row trades a safety-critical code for
    a weaker one, and no row stops handing back a drug, because `checkCodeSlot` only emits: it
    selects nothing, withholds nothing, and never touches the `CD`. After, the two columns of all
    thirteen shapes agree exactly, which is the bar. The pre-existing 27-row planned-arm matrix moved
    three rows, each purely gaining `MISSING_CODE_VALUE`, and the performed-medication matrix is
    untouched.

- **Clinical safety: `MEDICATION_PRODUCT_ARM_CONFLICT` had NEVER been reachable on a Planned
  Medication Activity, so two `manufacturedProduct` arms naming two different drugs went completely
  unmentioned on the Plan of Treatment.** `plannedCodeElement` returned the planned act's direct
  `<code>` **before** it ever called `consumableProductCode`, so a planned medication carrying one
  (legal, `SubstanceAdministration.code` being `[0..1]` in CDA R2) never had its consumable looked
  at. **Every** warning that function raises
  was unreachable there, not merely the headline one: `MEDICATION_PRODUCT_ARM_CONFLICT`,
  `MISSING_PRODUCT_CODE`, `MEDICATION_PRODUCT_ARM_UNEXPECTED`, `MEDICATION_PRODUCT_ARM_REPEATED`,
  `MEDICATION_PRODUCT_CODE_REPEATED` and `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`. Same harm class
  as the rest of this area, a silent pick between two named drugs, on the section describing what a
  patient is **about to be given**. Reproduced on base before it was touched.
  - **The root cause is a semantic one: `SubstanceAdministration.code` is not the drug.** CDA R2
    types it as an `ActSubstanceAdministrationCode`, the _kind of administration act_ ("drug
    therapy"), while the substance participates through `consumable/manufacturedProduct`. So the
    direct `<code>` was never a weaker drug code to fall back on, and preferring it read an act type
    into the drug slot. The model was incoherent in the same way: `code` on a planned
    `medicationActivity` was the drug on a document with no act `<code>` and the act type on one with
    it, so a consumer could not rely on it being either. It is now always the drug, exactly as `drug`
    is on a performed Medication Activity and `vaccine` is on an Immunization Activity, the other two
    `consumable` call sites, both of which have always ignored the act's own `<code>`.
  - **The builder is what hid it.** `buildCcda` emits the drug in the `consumable` and **no** direct
    `<code>` for this variant, so no round-trip fixture could ever produce the shape, and every
    existing planned-medication test exercised the fall-through path.
  - **`CODE_NARRATIVE_MISMATCH` was reachable there and blind to its subject.** It reconciled the act
    code's `displayName` against a narrative that names the drug, so it fired on well-formed
    documents and could not see a structured drug contradicting the narrative. It now reads the drug.
  - **What is given up is stated rather than hidden**: the act `<code>`'s coding is not on the model
    for this variant, as it is not for the other two call sites. `serializeCcda` re-emits the parsed
    DOM, so it survives `doc.toString()` byte-for-byte. Promoting it into the drug slot is the
    manufactured reading this area refuses everywhere else. The other five planned kinds are
    untouched: their `<code>` _is_ the planned act, and they have no consumable to read.
  - **Monotonicity is measured, and this slice has one exception to it.** A 27-row matrix (three
    variants of nine arm shapes) run against the previous release's `src/`: the nine "no act
    `<code>`" rows come back byte-identical and the performed-medication matrix is untouched, so one
    call site moved and no other. The nine "act `<code>` present" rows are pure gain, base being
    silent on all nine while reading an act type as the drug. The nine "act `<code>` + narrative"
    rows move on `CODE_NARRATIVE_MISMATCH` alone, **eight losing it, two of those going warned to
    silent and two trading it for a tolerable code**. That is a false positive removed rather than a
    signal lost, and the matrix is what shows it: base fires that code on **nine of nine** rows,
    the clean document included, because an act type's label can never match a narrative naming a
    drug. It was a constant, not a predicate. After, it fires on **one of nine**, exactly the row
    whose structured drug contradicts the narrative. No row loses a product warning.

- **`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s message no longer asserts two things that are false
  on a repeated `<code>`.** It opened "No manufacturedProduct arm asserts a primary `@code`" and
  called the `<translation>` the _only_ place the product was named. Both are false on an arm whose
  **second** `<code>` asserts a primary: selection reads each arm's lead `<code>` and no other, so
  that document still has no selected product and still draws this code, with
  `MEDICATION_PRODUCT_CODE_REPEATED` beside it saying why. The message is narrowed to the lead
  `<code>`. Message text only, no code change and no behaviour change: a safety-critical warning that
  misdescribes the document it is about is the same defect as one that points at a coding that is not
  there.

- **Clinical safety: an arm carrying two `<code>` children no longer has the second silently
  dropped.** Arm selection read only the **first** `<code>` child of each `manufacturedMaterial` and
  `manufacturedLabeledDrug`. `Material.code` and `LabeledDrug.code` are each at most one in CDA R2,
  so a second `<code>` is already outside the model, but it was discarded before anything compared
  it: it never reached the conflict rule and drew no warning of any kind. A `manufacturedMaterial`
  writing an RxNorm code for Lisinopril and a second one for Aspirin returned Lisinopril as _the_
  product and dropped the other, in complete silence. That is the failure
  `MEDICATION_PRODUCT_ARM_CONFLICT` exists to refuse, a silent pick between two named drugs, on a
  shape that rule could not see: the same failure as the repeated **arm**, one markup layer further
  in. Every `<code>` on every arm now reaches the **comparison**, so that shape conflicts and no
  product is returned. `MEDICATION_PRODUCT_ARM_CONFLICT` therefore fires on strictly more documents
  than before, never fewer. Applies at every consumable call site, with one pre-existing limit
  this slice did not change: Medication Activity and Immunization Activity always, and Planned
  Medication Activity only when the planned act carried no `<code>` of its own, because a direct
  `<code>` short-circuited the consumable read before any arm was looked at. **That limit is closed
  by `CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE`, entered above; it now applies at every call
  site unconditionally.**
  - **Selection was deliberately not widened with it, and nothing about what is read changes**,
    except where the conflict rule now withholds a product it previously picked. "Disagreement is
    read across every arm, selection is not" is the split this area is built on, and a second
    `<code>` is a new _candidate_ rather than a new arm: every candidate it adds sits earlier in
    document order than a later arm's `<code>`, and selection ranks on "names a product" alone, which
    is completeness-blind on purpose. Admitting them would re-decide picks the document never
    re-decided, displacing an equally-symboled but richer sibling coding: a bare `<code code="X"/>`
    over a `<code code="X" displayName="..."/>`, taking `CODE_NARRATIVE_MISMATCH` (the only guard on
    the structured code contradicting the narrative) with it; over a `<code>` carrying the
    `<translation>` alternates; or over an empty `<code/>` that `MISSING_CODE_VALUE` fires on. All
    three are safety-critical signals, and all three would be traded for a symbol that was already
    identical, since only codings that **agree** survive the conflict check. Ranking the candidates by
    completeness instead would be the parser choosing between codings the document wrote as equals.
  - **`MEDICATION_PRODUCT_CODE_REPEATED` (new, safety-critical).** Reports the cardinality itself,
    whether or not the repeated `<code>`s agree, on the same split `MEDICATION_PRODUCT_ARM_REPEATED`
    already makes: cardinality and agreement are separate facts with separate codes. Reported **per
    arm** rather than per `manufacturedProduct`, because it states a fact about a particular arm and
    its `position` names which one, so a product with two offending arms draws two warnings at two
    positions rather than one pointing at only one of them. **It is safety-critical where the
    repeated-arm code is tolerable, and the difference is selection.** With two arms the one naming a
    product is the one read, so the repeated-arm code never fires alone over a lost drug; with two
    `<code>`s on one arm only the lead is selected, so there is a state where this code fires
    **alone** and a named drug is lost: the lead asserts a `nullFlavor` and the sibling names an
    RxNorm product, so `med.drug?.code` is `undefined` over a document that names the drug one
    element along. Nothing else can fire there, `MISSING_PRODUCT_CODE` cannot (a `<code>` exists), the
    conflict rule cannot (an exceptional value is not a rival drug, which is what lets a null-marked
    arm lose to a naming one everywhere else), and the code-system checks are quiet by design on a
    `nullFlavor`-only slot. That is `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s harm with a sibling
    `<code>` in place of a `<translation>`, classified the same way for the same reason. It therefore
    over-fires on the benign identical repeat, deliberately: splitting that shape off would let what
    the codings happen to _say_ decide whether a structural deviation is named, the exact inversion
    the repeated-arm code refuses one layer out, and over-firing costs a warning while under-firing
    costs a drug.
  - **Monotonicity is measured, not argued**, by running the arm-shape matrix in
    `test/entries.test.ts` against the previous release's `src/`. All nineteen pre-existing rows come
    back **byte-identical**; only the eight new rows move. Every one of the eight gains warnings, and
    every one reads exactly what the previous release read except the three the conflict rule now
    withholds outright. **Exactly one row's warning set is not a superset of its old one**, and it
    is the documented suppression rather than a lost signal:
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` stands down behind
    `MEDICATION_PRODUCT_ARM_CONFLICT`, as `MISSING_PRODUCT_CODE` already does, because the conflict
    is the stronger statement about the same slot; both are safety-critical, so no profile can quiet
    either. The invariant holds in the form that is actually true: **no row goes from warned to
    silent, and no row trades a safety-critical code for a weaker one.** "No product code stops being
    reported" remains a **false** way to state it. Nothing is lost in any of these states:
    `serializeCcda` re-emits the parsed DOM, so every arm and every `<code>` round-trips
    byte-for-byte.

- **Clinical safety: a product named only in a `<translation>` is no longer reported as no product
  at all, a repeated arm is no longer absorbed in silence, and two arms that both fall back to
  translations are compared under a rule that can see a disagreement inside one terminology.** Two
  new stable warning codes. `MEDICATION_PRODUCT_ARM_CONFLICT`'s predicate widens in exactly one
  shape, described below, and it moves in **one direction only**: it fires on strictly more
  documents than before, never fewer, and no document that was refused before is accepted now. The
  cost of that direction is stated rather than buried: **a document that used to yield a product
  code can now yield none.** Where a third arm asserts a primary and two other arms disagree only
  through their translations, the whole product is now withheld behind the conflict code, and
  `med.drug` goes from a coded `CD` to `undefined`. That is the deliberate trade, the same one the
  conflict code has always made: the parser refuses to pick when the document contradicts itself,
  and it says so loudly rather than answering from one arm.
  - **`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` (new, safety-critical).** When no
    `manufacturedProduct` arm asserts a primary `@code` and the product is named in a
    `<translation>` instead (the `nullFlavor="OTH"` plus `<translation>` idiom), the parser now says
    so. Nothing about the reading changes: `med.drug` still comes back as the selection rule always
    picked it, and `drug.code` is still `undefined`, because slot checks apply to a slot's
    **primary** coding and lifting a translation into the product position would hand
    `checkCodeSlot` a coding the document never wrote there. What changes is that the shape used to
    be **entirely silent**: `MISSING_PRODUCT_CODE` cannot fire (an arm did carry a `<code>`), and
    `checkCodeSlot` is quiet by design on a `nullFlavor`-only slot because a declared `nullFlavor`
    is a complete statement that the concept is unknown, which here it is not. So a consumer reading
    the drug off `med.drug?.code` saw a medication with a dose, a route and a timing and no drug,
    with no warning of any kind, over a document that names the drug one element down.
    **Where the coding is reachable depends on which arm holds it, and the warning's message and
    `position` say which.** Only one arm ever becomes `med.drug`: when that is the arm carrying the
    translation, the coding is somewhere on `drug.translation`, and you have to **search that list**
    rather than read `[0]`, since a `<code>` may carry several `<translation>`s and the first can be
    `nullFlavor`-marked or in a code system you did not want. When it is not (two arms, neither
    asserting a primary, the translation sitting on the one that was not selected), the returned
    `CD` is the other arm's and no product-naming coding is on it, so the coding is reachable only
    through `doc.toString()`. On the `nullFlavor`-marked idiom this is the lone signal, which is why no
    profile may quiet it; on the variant that asserts neither a symbol nor a `nullFlavor`,
    `MISSING_CODE_VALUE` fires beside it and is itself safety-critical. It stands down behind
    `MEDICATION_PRODUCT_ARM_CONFLICT`, which is the stronger statement about the same slot, exactly
    as `MISSING_PRODUCT_CODE` already does. Applies at every consumable call site (Medication
    Activity, Immunization Activity, Planned Medication Activity, and, from
    `CCDA-PLANNED-IMMUNIZATION-DROPPED`, Planned Immunization Activity).
  - **`MEDICATION_PRODUCT_ARM_REPEATED` (new, tolerable by a profile).** One
    `manufacturedProduct` carrying more than one arm of the **same kind** is now reported. Repeated
    arms that _disagreed_ were already refused; repeated arms that **agreed** were reduced to one
    with nothing said, so a document asserting the same product three times reported identically to
    one asserting it once, and cardinality was observable only when the codings happened to differ.
    It is keyed to the **arms**, not to their codings (an arm carrying no `<code>` counts), for the
    same reason `MEDICATION_PRODUCT_ARM_UNEXPECTED` is: whether the repeats agree is a separate
    question with a separate code, and letting agreement decide whether the repeat is reported would
    make markup content rather than markup shape decide whether a structural deviation is named. Its
    exclusion from `SAFETY_CRITICAL_CODES` carries the same conditional argument as the presence
    warning's: where it fires alone a `<code>` was selected and read exactly as a single-arm
    document's would have been, and each state where that would not be enough carries an unquietable
    companion (`MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE`, or
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`).
  - **Where BOTH arms fall back to `<translation>`s, sharing one coding is no longer always enough
    to agree.** That is the one pairing where the shared-coarser-coding hazard survives, because
    neither arm asserts a primary to compare: two arms translating to a shared coarser concept plus
    two different strengths agree on the coarse coding while naming two products, and the "some
    coding agrees" test could not see it. Such arms now also conflict when each names a coding the
    other does not **and** two of those unshared codings are in the **same code system under
    different symbols**. An arm
    that merely offers an _extra_ alternate the other stayed quiet about (an NDC beside the RxNorm
    concept both share) is elaborating its own concept, which is what HL7 v3 says a `<translation>`
    does, and is deliberately **not** a conflict: a shorter list is not a denial. Codings in
    different code systems are never compared, because deciding whether an NDC and an RxNorm concept
    denote one product is terminology work rather than parsing. Two arms that both assert a primary
    `@code` are compared on those primaries alone, byte for byte as before, and an arm that falls
    back against one that asserts a primary still agrees on naming that primary's symbol. The new
    clause can only turn a non-conflict into a conflict, never the reverse; that direction is the
    safety property of the whole area and is pinned by a matrix snapshot and a table of
    disagreeing-primary shapes in the tests. **What a consumer sees on the newly-refused shapes:**
    `med.drug` is now `undefined` with the conflict code beside it. Where the two fallback arms are
    the only ones, it was previously the first arm's `nullFlavor` `CD` carrying that arm's
    translations, which showed one arm's codings as if they were the product's, and
    `med.drug?.code` was `undefined` before and after. Where a **third** arm asserts a primary the
    two fallback arms disagree behind, it was previously that arm's fully coded `CD`, so a product
    code that was reported does stop being reported: the document names one product in a primary and
    two others in translations, and the parser now declines to pick rather than answering from the
    arm that happens to assert a symbol.
    **That last test is a parser's reading rather than something the document asserts, and it
    deliberately over-fires.** Two different symbols in one code system usually are two products, but
    two NDC package codes can describe one drug, and an RxNorm branded drug and its clinical
    equivalent are one product at two granularities. Telling those apart is the terminology work this
    library refuses to guess at, so the only choice is which way to be wrong: over-firing costs a
    withheld product beside a loud safety-critical code, under-firing costs one of two strengths
    handed back in silence.
  - Nothing is lost in any of these states: `serializeCcda` re-emits the parsed DOM, so every arm and
    every `<translation>` round-trips byte-for-byte and a caller that needs them can read them off
    `doc.toString()`.

- **Clinical safety: arm selection now sees a `<translation>` and a repeated arm, and the docstring
  that justifies `MEDICATION_PRODUCT_ARM_UNEXPECTED`'s classification is no longer arguing from a
  premise the previous slice falsified.** No new warning code; `med.drug` / `immunization.vaccine`
  now withholds on documents whose arms disagree only through a `<translation>` or only through a
  repeated arm, and recovers a drug on a repeated arm whose first sibling names none.
  - **A `nullFlavor`-marked arm whose `<translation>` names a different drug is now a conflict.**
    `namesAProduct` / `namesConflictingProducts` keyed on the primary `@code` alone, so a
    `manufacturedLabeledDrug` carrying `<code nullFlavor="OTH"><translation code="…"/></code>` named
    no product as far as arm selection was concerned, and the `manufacturedMaterial` arm's drug was
    selected in silence. `nullFlavor="OTH"` beside a `<translation>` is the documented C-CDA idiom
    for "not codable in the bound value set, here is an alternate coding", which this package
    already treats as coherent rather than contradictory, so on that shape the arm's whole product
    identity is in the translation. It is the same "quietly picks between two drugs" failure the
    previous slice closed, one level down. An arm is now read as naming its `@code` when it asserts
    one, and **otherwise** the codings its `<translation>` alternates assert.
  - **The translations are a fallback, never an addition, and that asymmetry is the safety
    property.** Two arms that both assert a `@code` are compared on those and nothing else, exactly
    as before, so reading translations can only make the conflict fire **more**, never less. Adding
    them in would let a coding the two arms happen to share _withdraw_ a conflict their primaries
    assert, and a shared translation is routinely coarser than either primary (an RxNorm ingredient,
    a local formulary id, an NDC spanning presentations): two arms naming Lisinopril 10 MG and
    Lisinopril 20 MG that both translate to the lisinopril ingredient would agree, and one strength
    of a document naming two would be handed back. Reading `A = B` out of `A = Z` and `B = Z` is a
    transitive closure the document never wrote, and it is false exactly when `Z` is coarser. No
    terminology equivalence is inferred at all, deciding that two codings denote one concept is a
    `TerminologyAdapter`'s job.
  - **Selection is deliberately _not_ translation-aware.** Which `<code>` element is handed to
    `checkCodeSlot` is still decided by primary `@code` alone. The stated boundary of this package
    is that slot checks apply to a slot's primary coding and `<translation>` alternates are
    preserved but never slot-checked, so selecting an arm on the strength of a translation would
    hand `checkCodeSlot` a `nullFlavor` primary and validate nothing, or require synthesizing a
    coding the document never wrote in that position. Translations settle whether the arms
    _disagree_; they never manufacture a reading.
  - **Two sibling `manufacturedMaterial` arms with different codes no longer read the first
    silently.** The previous slice compared `manufacturedMaterial` against `manufacturedLabeledDrug`
    only, so one arm kind repeated slipped past it, and `ManufacturedProduct` models one participant
    so a repeat is already outside the model. The conflict check now runs over every
    `manufacturedMaterial/code` and every `manufacturedLabeledDrug/code` the product carries.
  - **Among repeated arms of one kind, the first that _names_ a product is the one read.** The first
    arm used to win unconditionally, so a null-marked first sibling beside one carrying a real
    RxNorm code dropped that drug with no warning of any kind: not a conflict (a `nullFlavor` names
    no competing product), not `MISSING_PRODUCT_CODE` (an element was selected), not
    `MISSING_CODE_VALUE` (the `nullFlavor` makes it a complete statement). This is the same rule
    already applied _across_ arm kinds, applied within one. When no sibling names a product the
    first is still read, so the empty-slot machinery sees exactly the element it always saw.
  - **`MEDICATION_PRODUCT_ARM_UNEXPECTED`'s exclusion from `SAFETY_CRITICAL_CODES` is unchanged; its
    justification is corrected.** The docstring asserted unconditionally that the alternate arm's
    code "is read, not refused" and that "every code-system and terminology check applies to it
    unchanged", and argued the classification from exactly that. That was true until
    `MEDICATION_PRODUCT_ARM_CONFLICT` existed: in the conflict state no code is selected at all, so
    nothing reaches `checkCodeSlot`. The claim is now stated conditionally everywhere it is made
    (`src/parser/warnings.ts` and its runtime message, `docs-content/troubleshooting.md`,
    `README.md`, `CLAUDE.md`), and the classification rests on the argument that actually holds:
    wherever this code fires alone an element was selected and read exactly as the same document
    would have been read with one arm, and wherever none was selected it is by construction not
    alone, because either `MEDICATION_PRODUCT_ARM_CONFLICT` (the arms disagreed) or
    `MISSING_PRODUCT_CODE` (no arm carried a `<code>` at all, the shape a name-only `LabeledDrug`
    produces) fires beside it, both safety-critical and neither quietable by a profile. Tolerating
    the presence warning can therefore never buy silence about an absent or withheld drug. The
    runtime message string, which carried the same too-narrow claim, is corrected with it.

- **Clinical safety: the two residuals the `nullFlavor` slice named and did not close, a patient
  identifier read out of a null-marked `<id>`, and a medication naming two different drugs.** One
  new stable warning code, safety-critical, and one behavioural change to `getMrn()` / `pickMrn`.
  - **`getMrn()` no longer hands back an MRN the document disowned.** The previous slice made
    `<id nullFlavor="UNK" extension="MRN001"/>` warn (`CONTRADICTORY_NULL_FLAVOR`), but `pickMrn`
    still returned `"MRN001"`, so `doc.getMrn()` produced a patient identifier out of a field the
    document had marked unknown. A misfiled patient record is the third harm this package's harm
    ordering names, alongside a wrong dose and a wrong code system, and it is the worst of the three
    to detect: silent, persistent, and it contaminates everything downstream. `pickMrn` now returns
    `undefined` when the **first** `patientRole/id` carries a `nullFlavor`.
  - **It withholds, it does not substitute.** Falling through to the next `<id>` is the tempting
    move and the worse one: CDA R2 makes `patientRole/id` `1..*` and nothing in the document ranks
    the entries, so the second id is whatever the sending system listed second, commonly a plan
    member number, an account number, or the SSN under `2.16.840.1.113883.4.1`. Answering the MRN
    question confidently from a different assigning authority, with no signal naming the
    substitution, trades one wrong-identifier failure for a quieter one. The rule declines a
    manufactured reading; it does not manufacture a replacement. Same slot, same position, reading
    withheld. A caller who knows their own authority OIDs can resolve it from
    `getPatient()?.identifiers`, which still reports every id in full.
  - **The datatype is unchanged, and that is the point.** `parseIi` still keeps `@extension` on a
    contradicted `<id>`: it **is** the document's own text, with no second copy the way `PQ.raw`
    sits beside `PQ.value`, so withholding it there would delete what the document said. The
    withholding moved to the layer that manufactures a reading instead. What `pickMrn` produces is a
    **selection**, one `<id>` chosen out of a list and flattened to a bare `string` that no longer
    carries the marking that qualified it, and that is exactly the shape `PQ.value` has relative to
    `PQ.raw`. So the same rule now buys both properties rather than trading one against the other:
    `doc.getMrn()` is `undefined`, and `doc.getPatient()?.identifiers[0]` still reports
    `{root, extension: "MRN001", nullFlavor: "UNK"}` verbatim.
  - **The other identity slots are left reporting the document verbatim, deliberately.**
    `ClinicalDocument.id`, `setId`, `relatedDocument/parentDocument/id` and every entry-level `<id>`
    (the practice-, lab- and act-assigned identifiers) are only ever handed back as the whole
    datatype with the `nullFlavor` attached and the warning in `doc.warnings`. There is no
    naked-string accessor over any of them, so there is no affordance to close and nothing that
    could be withheld without losing data.
  - **`templateId` is the stated exception rather than a member of that list.** Document- and
    section-type recognition _does_ derive a reading from `templateId.@root`, so a null-marked
    `templateId` still resolves the document type and its required-section SHALL set. Left unchanged
    on purpose: a `templateId` asserts a document _shape_, not an identity for a person or a record,
    so a mis-read costs a spurious or missing `REQUIRED_SECTION_MISSING` rather than a misattributed
    clinical fact, and declining would swap a working type for `UNKNOWN_DOCUMENT_TEMPLATE`.
  - **The one exception is the emit side: `editCcda` no longer launders a null-marked identifier
    into an asserted one.** Stamping a CDA R2 `RPLC` revision copies the source's `<id>` into the new
    `relatedDocument/parentDocument`, and it copied `root`/`extension` only, silently dropping a
    `@nullFlavor`. A revision of a source whose `ClinicalDocument.id` is null-marked now throws
    `CcdaEditError` `SOURCE_MISSING_ID`, the same refusal an id-less source already got and for the
    same reason: an `<id>` marked null names no prior version for the RPLC link to replace. A
    null-marked `setId` gets the milder remedy its optionality allows, it identifies no version
    series, so it is treated as absent and a fresh series id is minted.
  - **A `manufacturedProduct` carrying BOTH arms of the CDA R2 choice no longer silently drops one
    (`MEDICATION_PRODUCT_ARM_CONFLICT`, safety-critical).** The previous slice fixed the single-arm
    case but left `manufacturedMaterial` unconditionally preferred, so a document carrying
    `manufacturedMaterial` **and** `manufacturedLabeledDrug` with different codes had one of its two
    named drugs dropped without a word. Two drugs on one medication is a contradictory document and
    nothing in it ranks the arms, so preferring one is not reporting what the document said, it is
    manufacturing a choice the document declined to make. The parser now refuses when **both** arms
    name a product and they are different (a different `@code`, or one `@code` under two different
    `@codeSystem`s): no product code is selected, `drug` / `vaccine` is `undefined`, and the new
    warning is the signal. `MISSING_PRODUCT_CODE` is deliberately suppressed behind it, because "no
    arm yielded a code" would be false, and with no code selected the code-system and terminology
    checks have nothing to run on either, which is why the new code is safety-critical and why it is
    scoped this narrowly.
  - **An arm that asserts no symbol names no product, so it never conflicts with one that does.** A
    `nullFlavor`-only `<code>`, or an arm with no `<code>` at all, is an _exceptional value_ under
    HL7 v3 rather than a competing one, the same rule `contradictsAssertedValue` applies one layer
    down. Whichever arm names the drug is read, and when neither names one the
    `manufacturedMaterial` arm is read exactly as before, so the empty-slot and code-system checks
    keep seeing the element they always saw. This is also the direction the previous
    behaviour lost data in: a `nullFlavor`-only `manufacturedMaterial` used to win over a
    `manufacturedLabeledDrug` naming a real RxNorm concept, in silence. Arms naming the **same**
    product are redundant rather than contradictory, so the material arm is read as before.
  - **`MEDICATION_PRODUCT_ARM_UNEXPECTED` now keys off the arm rather than its `<code>`**, so a
    name-only `manufacturedLabeledDrug` is reported too, and markup shape no longer decides whether
    the deviation gets flagged. Every consumable call site is covered (Medication Activity,
    Immunization Activity, Planned Medication Activity, and, from
    `CCDA-PLANNED-IMMUNIZATION-DROPPED`, Planned Immunization Activity), and nothing is lost: `serializeCcda`
    re-emits the parsed DOM, so both arms round-trip byte-for-byte.
  - **Provenance, stated rather than invented.** No normative SHALL is cited for either change and
    none is fabricated. CDA R2 declares `@nullFlavor` and `@extension` on `II` independently, and
    neither CDA R2 nor C-CDA R2.1 states which `patientRole/id` is the MRN; that
    `ManufacturedProduct` models one participant rather than two is base CDA R2 structure, but
    whether the C-CDA template forbids both arms together needs the normative R2.1 Schematron this
    repo does not hold. Both rest on HL7 v3 datatype semantics (`nullFlavor` marks an _exceptional
    value_, one with no proper value) plus the harm ordering `SAFETY_CRITICAL_CODES` encodes.

- **Clinical safety: four instances of one defect class, the parser getting quieter the more broken
  the document was.** Four new stable warning codes, three of them safety-critical.
  - **A `nullFlavor` asserted beside a populated value no longer passes silently
    (`CONTRADICTORY_NULL_FLAVOR`), and on a dose the number is withheld.** `parsePq` read `value`,
    `unit` and `nullFlavor` independently, so `<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>`
    parsed to `{value: 10, unit: "mg", nullFlavor: "UNK"}` with **no warning of any kind**, and a
    consumer reading `med.dose.value` got `10 mg` for a dose the document explicitly declared unknown.
    `MISSING_DOSE_QUANTITY` could not fire, because the element _is_ present. The warning is
    class-wide: every v3 datatype (`PQ`, `TS`, `IVL_PQ`, `IVL_TS`, `CD`, `II`, `ST`, `ED`, `BL`) routes
    its `nullFlavor` through one check, **including the `INT` and `ST` arms of `readObservationValue`,
    which are parsed inline rather than through the datatype layer**. That slot carries lab values and
    assessment-scale scores, so it had the same defect: `<value xsi:type="INT" nullFlavor="UNK"
value="12"/>` returned a score of 12 with no warning. The `integer` observation value now carries
    `raw` (the verbatim `@value` token) beside `value`, mirroring `PQ` exactly, so the contradiction is
    resolved the same way: `value` withheld, `raw` kept. The `string` observation value now carries
    `nullFlavor`, which it previously dropped from the model outright. - **The design tension, resolved rather than skipped.** A warning alone would keep the house rule
    (never coerce, surface verbatim, flag) but leave the dangerous _affordance_ intact: `dose.value`
    would still hand back `10` to the many consumers who do not read `warnings` on a first
    integration, and of the two readings the reassuring one is the one that can hurt a patient. So
    the parser also **withholds the derived reading**: `PQ.value`, `TS.date` and an `integer`
    observation value's `value` are omitted, while `raw`, `unit` and the `nullFlavor` are preserved. Nothing the document said is lost, `value` is
    not the document's bytes but a `number` the parser manufactured by interpreting `raw`, and `raw`
    survives. This is exactly what `MALFORMED_DATETIME` already does to `TS.date`, so it is the
    existing rule applied to a second reason for distrusting an interpretation, not a new one. It
    reaches interval bounds too: a `doseQuantity nullFlavor="UNK"` wrapping `<low>`/`<high>`
    withholds each bound's number, the range harm being the scalar harm by another route. - **What a naive consumer sees afterwards.** `med.dose.value === undefined` (was `10`), with
    `med.dose.raw === "10"`, `med.dose.unit === "mg"`, `med.dose.nullFlavor === "UNK"`, and
    `CONTRADICTORY_NULL_FLAVOR` in `doc.warnings`. A caller reading only `.value` now reads "no
    dose", which is what the document asserted. - **The limit, stated rather than implied.** Withholding applies only where a verbatim copy
    survives beside a derived reading, which in this model is `PQ.value`, `TS.date` and the
    `integer` observation value's `value`, and nothing else. On `CD`, `II`, `ST`, `ED` and `BL` the
    value-bearing field **is** the document's own text
    (`@code`, `@extension`, the element's content) with no second copy, so withholding it would
    delete what the document said rather than decline to embellish it. Those warn and keep the
    field: a contradicted `allergy.allergen.code` still returns the code, with `nullFlavor` on the
    same object and the warning in `doc.warnings`. That residual affordance is deliberate and
    argued, not overlooked. - **Only a value-bearing assertion contradicts**, which is what keeps the check quiet on
    conforming documents. A `PQ` `@unit` with no `@value` (a dimension without a magnitude), an `II`
    `@root` with no `@extension` (a namespace without a local identifier), and a `CD`'s
    `originalText` / `<translation>` / `displayName` / bare `@codeSystem` (the documented C-CDA
    idiom for "not codable in the bound value set, here is the source text or an alternate coding")
    all describe a null value rather than contradicting it, and stay silent. - Two consequences, named rather than left to be discovered. A contradicted `PQ` no longer reaches
    `MISSING_UNIT_ON_PQ` and a contradicted `TS` no longer reaches `MALFORMED_DATETIME`, both of
    which key off the withheld field; that is not a new silence, the stronger
    `CONTRADICTORY_NULL_FLAVOR` fires in their place. And the structural code-system tier is
    **deliberately still run on a slot that asserts no symbol**: a `nullFlavor`-only `CD` still names
    a terminology, so naming a wrong or deprecated one still draws `UNEXPECTED_CODE_SYSTEM` /
    `DEPRECATED_CODE_SYSTEM` exactly as before. Short-circuiting there would have made the parser
    quieter than it was, which is the direction this whole entry exists to reverse. That is also why
    `CONTRADICTORY_NULL_FLAVOR` is **safety-critical**
    and no profile may tolerate it. **Provenance:** no normative SHALL is cited and none is
    invented, the CDA R2 schema declares `nullFlavor` and the value attributes independently, so the
    shape is schema-valid. The rule rests on v3 datatype semantics (`nullFlavor` is a property of
    `ANY` marking an _exceptional value_, one with no proper value) and on the harm ordering
    `SAFETY_CRITICAL_CODES` has always encoded.

  - **A medication under `manufacturedLabeledDrug` no longer loses its drug
    (`MEDICATION_PRODUCT_ARM_UNEXPECTED`, `MISSING_PRODUCT_CODE`).** The drug element was hard-coded
    to `consumable/manufacturedProduct/manufacturedMaterial/code`, but CDA R2's `ManufacturedProduct`
    is a **choice** and `manufacturedLabeledDrug` is equally valid. That shape yielded
    `drug: undefined` with zero warnings while dose and route survived, so the record read as a
    well-formed medication that simply had no drug, and `checkCodeSlot` could not catch it because
    there was no code to check. Both arms are now read, at every consumable call site (Medication
    Activity, Immunization Activity, Planned Medication Activity, and, from
    `CCDA-PLANNED-IMMUNIZATION-DROPPED`, Planned Immunization Activity), and the alternate arm is flagged;
    the code then flows through the ordinary `checkCodeSlot` path unchanged. Reading it beats
    warning-and-ignoring it, the arm carries the same `CE` and silence was strictly worse.
    `MEDICATION_PRODUCT_ARM_UNEXPECTED` is deliberately **not** safety-critical, and the reason is
    conditional rather than absolute: wherever it fires **alone** a `<code>` element was selected and
    read exactly as a single-arm document's would have been, so it flags known vendor shape rather
    than lost clinical data and a profile may defensibly tolerate it; and wherever **no** element was
    selected it is not alone, because a safety-critical companion (`MISSING_PRODUCT_CODE`, or one of
    the withheld-product codes below) fires beside it and no profile may quiet those. Do not read
    the unconditional form, "the drug is present and fully checked": there are states in which no
    product code is selected at all, and each of them carries its own untolerable code. Whether the C-CDA template _forbids_ the alternate arm is a normative
    question this repo cannot settle without the R2.1 Schematron, so no conformance verb is claimed.
    The new backstop **is** safety-critical: a `substanceAdministration` whose consumable yields no
    product code on any arm raises `MISSING_PRODUCT_CODE`, never a silent `undefined`
    (`MISSING_DOSE_QUANTITY` loses how much of a known drug; this loses _which drug_). It fires at all
    three sites, the planned one included, and a planned medication reaches it only after its direct
    `<code>` is absent too. The other planned kinds are left alone: their `code` is optional and an
    absence there is not a lost drug.
    `serializeCcda` re-emits the parsed DOM verbatim, so either arm round-trips byte-for-byte;
    `buildCcda` continues to emit `manufacturedMaterial`.

  - **A coded slot present but asserting no code is no longer silent (`MISSING_CODE_VALUE`).** The
    mirror of `MISSING_CODE_SYSTEM`, which the previous slice scoped out: a `CD` at a wired `CodeSlot`
    carrying no usable `@code` (absent, empty, or whitespace) **and** no `@nullFlavor`, e.g. a
    system-only `<value codeSystem="…6.96"/>`. A system without a symbol identifies a concept no
    better than a symbol without a system. The `nullFlavor` is what separates the shapes: a
    `nullFlavor`-only `CD` is a _complete_ statement ("this concept is unknown") and stays silent,
    while one that says nothing at all leaves a reader unable to tell an absent concept from one lost
    in transformation; an absent element stays silent too. Safety-critical for the same reason
    `MISSING_DOSE_QUANTITY` is, an undeclared absence at a safety-critical slot, and effectively the lone
    signal, since with no symbol there is nothing for a `TerminologyAdapter` to recognise and
    `SEMANTIC_CODE_INVALID` is not a signal that can be relied on behind it.

  - **`SAFETY_CRITICAL_CODES` is now genuinely immutable.** `Object.freeze(new Set(...))` seals own
    properties but leaves `Set.prototype.delete` free to mutate the internal slot, so
    `SAFETY_CRITICAL_CODES.delete(code)` succeeded and the `Object.isFrozen` assertion covering it
    proved nothing about the contents of the set that guards every safety-critical code. It is now a
    frozen read-only view over a `Set` reachable from nowhere else: `add` / `delete` / `clear` are not
    properties of it at all, so calling one throws `TypeError`, and the freeze stops anyone bolting
    one on. The full read surface (`has`, `size`, `keys`, `values`, `entries`, `forEach`, iteration)
    is unchanged, and the test now asserts the mutations are refused and the guarded codes survive.
    **The one behavioural difference, disclosed rather than glossed:** the exported value is no longer
    a `Set` _instance_, so `SAFETY_CRITICAL_CODES instanceof Set` is now `false`,
    `JSON.stringify(SAFETY_CRITICAL_CODES)` is `{"size":N}` rather than `{}`, and `Object.keys(...)`
    lists the view's read methods rather than being empty. Every read _operation_ behaves identically,
    including spread and set-like consumption.

  - Adding warning codes is a public-surface change on the `0.0.x` ladder: a consumer switching
    exhaustively on `WarningCode` will see four new members, and `PQ.value` / `TS.date` are now absent
    on a contradicted value where they were previously populated. Every positive regression test was
    proven to fail without the fix; the negatives pin the shapes that must stay silent.

- **Clinical safety: a `@code` asserted with no `@codeSystem` no longer passes silently
  (`MISSING_CODE_SYSTEM`).** `checkCodeSlot` opened with `if (code?.codeSystem === undefined) return;`,
  so a `CD` carrying a `@code` but no `@codeSystem` reached **neither** the structural tier
  (`SLOT_BINDINGS` deprecated / expected checks) **nor** the bring-your-own `TerminologyAdapter`, and
  emitted no warning of any kind. A document built with an adapter configured to reject everything
  produced zero warnings and never consulted the adapter. That is the dangerous direction: a code
  without its system is not a code (`250.00` is diabetes in ICD-9-CM and an unrelated concept
  elsewhere), and the parser got quieter the more broken the input was.
  - The new stable warning code **`MISSING_CODE_SYSTEM`** fires at all five wired `CodeSlot`s
    (`problem`, `medication`, `allergen`, `route`, `vaccine`, so at all **seven** call sites:
    medication and immunization each contribute a route, and the `medication` slot is reached from a
    performed Medication Activity's drug and from a planned one's alike).
  - **Nothing is inferred.** No system is guessed from the slot's expected list or from a
    `@codeSystemName` label (display text, not an identifier), and the value is preserved verbatim. The
    adapter is still not consulted, correctly: it validates a system + code pair, and there is no
    system, which is precisely why the structural warning is the only signal such a value can get.
  - **Absence stays silent.** An absent value, and a `CD` that asserts no `@code` at all (the
    `nullFlavor`-only shape), warn nothing, there is no concept being asserted. Within this check a
    `nullFlavor` alongside an asserted `@code` does **not** buy silence: the symbol is still
    unreadable, and an exceptional-value marker must not become the escape hatch that re-hides the
    deviation. (A `nullFlavor` beside a fully coded value is a separate shape, unchanged here and
    still unflagged.)
  - **`MISSING_CODE_SYSTEM` is safety-critical** (`SAFETY_CRITICAL_CODES`), so no vendor profile may
    tolerate it. It is strictly worse than `UNEXPECTED_CODE_SYSTEM` (already in the set): there the
    system is wrong but known, so a reader can still tell what was meant; here the symbol names no
    terminology at all. It is also the _lone_ signal, the `MALFORMED_DATETIME` argument, since
    `SEMANTIC_CODE_INVALID` can never fire behind it. Tolerating it would restore the exact silent
    pass this fixes. **Provenance:** no normative SHALL is cited and none is invented, the CD datatype
    leaves `@codeSystem` optional. Both the warning and its safety classification rest on the
    datatype's own semantics (a `@code` is a symbol defined _by_ a code system) and on the harm
    ordering `SAFETY_CRITICAL_CODES` has always encoded.
  - The shipped sentence "a clean run means those five slots passed" was **false** for this shape and
    is no longer, which is why the fix is upstream rather than a doc hedge. The docs are updated with
    it, and now also state the two remaining precisions rather than leaving them implied: within the
    five slots the checks cover the **primary** coding (alternate codings in `<translation>` are
    preserved and re-serialized but not themselves slot-checked), and a slot asserting no code at all
    is not judged, there is nothing there to check.
  - Adding a warning code is a public-surface change on the `0.0.x` ladder: a consumer switching
    exhaustively on `WarningCode` will see the new member.

- **Phase 7 (twenty-second slice): `editCcda` no longer emits an id-less RPLC `parentDocument` (CDA R2
  SHALL fix).** `stampRevision` appended the parent `<id>` only when the source `ClinicalDocument`
  carried one, while `deriveNewDocId` always minted the new document's id, so revising a source with no
  `<id>` produced a `<relatedDocument typeCode="RPLC"><parentDocument>` with `code`/`setId`/`versionNumber`
  but **no `<id>`**. That violates `POCD_MT000040.ParentDocument.id`, which is `1..*` SHALL: grounded
  firsthand against `HL7/CDA-core-2.0` `schema/normative/infrastructure/cda/POCD_MT000040.xsd`
  (`<xs:element name="id" type="II" maxOccurs="unbounded"/>`, no `minOccurs` ⇒ default `1`). The source
  itself was also invalid: `ClinicalDocument.id` is `1..1` SHALL there. `editCcda` now **refuses** to
  stamp a revision of an id-less source, throwing the new stable `CcdaEditError` code `SOURCE_MISSING_ID`
  rather than mint a fabricated parent identifier for a document that provably has none: the RPLC link
  exists to name the replaced version by its id, and a random id would make that clinical link look valid
  while pointing at nothing real (conservative-emit + never-fabricate). Refusal is scoped to the revision
  path: `revision: false` still edits an id-less source in place (no `parentDocument`, no id requirement).
  A source **with** an id is byte-unchanged. New `SOURCE_MISSING_ID` value on the `CcdaEditErrorCode`
  union (additive); regression tests cover the id-less parse path (throws), the in-place `revision: false`
  escape, and the build path (`buildCcda` always mints an id, so its RPLC parent always carries one).
- **Phase 7 (sixteenth slice): the builder emits `<text>` in CDA R2 element-sequence order for
  Problem, Allergy, and Smoking Status observations.** The base CDA R2 schema
  (`POCD_MT000040.Observation`) is an `xs:sequence` (`code`, `text`, `statusCode`, `effectiveTime`, …,
  `value`, …) so the narrative `<text><reference>` slot MUST precede `statusCode`/`effectiveTime`/`value`.
  Three builders emitted it out of order: `problemObservation` (`…22.4.4`) and `smokingStatusEntry`
  (`…22.4.78`) appended `<text>` **after** the `value`, and `allergyEntry` (`…22.4.7`) appended it **after
  every `entryRelationship`**: each an XSD-invalid document that would fail the core-CDA-R2 XSD stage
  before the R2.1 Schematron even runs. All three now emit `<text>` immediately after `<code>`, matching
  the position every other observation/act builder in the file already used (e.g. `resultObservation`,
  `plannedItemEntry`). Grounded firsthand against `POCD_MT000040.xsd` (`HL7/CDA-core-2.0`): `text` sits
  after `code`, before `statusCode`, in `Observation`/`Act`/`Procedure`/`SubstanceAdministration`/
  `Encounter`/`Supply` alike. Byte-order-only within each element's children: the lenient parser reads
  `<text>` regardless of position, so the round-trip model is unchanged and no warning code or public API
  moves. A new `test/builder.test.ts` block asserts the `text < statusCode`/`value` ordering per emitted
  observation (a genuine regression guard: it fails against the pre-fix emit).
- **The release can actually bump the version.** `package.json` had no `version` script, so the
  shared pipeline's `pnpm run version` failed with `Command "version" not found` and the release
  aborted before opening a "Version Packages" PR. Adds `scripts/sync-version.mjs` (the `hl7`
  reference, retargeted at `src/index.ts`) and the `version` script that runs it after
  `changeset version`, so the bump and the `VERSION` constant land in the same commit.
- **`VERSION` is no longer typed as a string literal.** It was declared `export const VERSION =
"0.0.0"`, giving it the literal type `"0.0.0"`, so the exported type would change on every
  release, making each version bump a breaking type change. Now annotated `: string`, matching the
  `hl7` reference. Type-only; the runtime value is unchanged. Done now because the package is
  unpublished: after the first publish this would itself be a breaking change.

- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own, so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only: no runtime or API change.

### Security

[Unreleased]: https://github.com/cosyte/ccda/commits/main
