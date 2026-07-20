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

- **PHI commit-scanner (`scripts/phi-scan.ts`, `pnpm phi-scan`).** A zero-dependency, C-CDA-shape-aware
  scanner refuses any committed/staged file carrying real-looking PHI in a C-CDA document — recognized
  by a native extension (`.cda`/`.ccda`/`.xml`) or a C-CDA marker — so a real clinical document can
  never be committed by accident. Hand-written `src/` / `scripts/` code gets a conservative
  dashed-SSN + email shape pass only (structurally scanning source would flag illustrative `@example`
  snippets); it is not a fixture location. It does NOT
  import the package's `@xmldom/xmldom` runtime dep — a commit gate must run without a build and must
  tolerate the malformed / fragmentary XML a real leaked document arrives as. Detection is
  element-scoped, not a blind text regex, so a coded value (`<code code="55607006"/>`) or a template
  OID (`<templateId root="2.16.840…"/>`) never trips it: it reads person-name parts (`given` / `family`
  wherever they appear — patient, `guardian`, `assignedPerson`, `informant`, `relatedSubject`,
  providers — plus a bare `name`), the `birthTime@value` DOB, `id@root` / `@extension` identifiers
  (SSN under the US SSN OID `2.16.840.1.113883.4.1`, bare-numeric MRN / account, dashed SSN anywhere),
  addresses (`streetAddressLine` / `city` / `postalCode`), `telecom@value` phones (the `555`
  fake-exchange convention passes), and non-test-domain emails. The detectors are namespace-prefix
  tolerant (`<given>` == `<v3:given>`), case tolerant, and decode XML character references +
  `<![CDATA[…]]>` before matching, so a `<family>&#x53;mith</family>` or CDATA-wrapped name is still
  caught. Synthetic fixtures are positively declared in `scripts/phi-allow-list.txt` (the same
  allow-list model the byte-strict siblings use); a whole-file bypass requires `--allow-fixture` plus
  an audit entry in `phi-scan-overrides.md`. Runs at pre-commit (`simple-git-hooks --staged`) and in
  CI (`run-phi-scan: true`). Dev-tooling only — no change to the published package surface or warning
  codes.

### Documentation

- **`docs-content/` now ships the full canonical Diátaxis spine (DOCS-CONTENT-P5), gated hard to the
  shipped Phase-5b parse surface.** The sidebar was Overview-only. This authors the rest of the spine
  every `@cosyte/*` package shares: four **Core Concepts** pages (the document model — recognition,
  header, section framing; the tolerance tiers + warning-code model with the seven Tier-3 fatals; the
  clinical entry layer — the 14 extracted families and their safety-critical distinctions; and
  datatypes / code systems / computable UCUM / the round-trip serializer), **Installation** and
  **Quickstart** tutorials (parse a CCD, read demographics + the Problem/Medication/Allergy triad, a
  Result, and an Immunization), a task-oriented **Guides** cookbook, and a **Troubleshooting & known
  limitations** page with an explicit **"what's not yet parsed"** list (no builder API; entry families
  beyond the 14; recognition-not-membership code checks; curated-UCUM; inert `nonXMLBody`). The stale
  `intro.md` status banner (it read "Phase 3 / six families") is refreshed to the current shipped
  reality (Phase 5b + serializer) with an honest status banner; **no unshipped API is documented**.
- **A doc/code-agreement gate — every runnable docs snippet is executed against the built package.**
  `test/docs-content.test.ts` runs `docSnippetSuite()` (from `@cosyte/vitest-config/snippets`) over
  `docs-content/`, extracting each ` ```ts runnable ` block, compiling it, executing it against the
  **built** ESM artifact, and asserting its inline `// =>` results — so a documented example can never
  silently drift from the shipped code. Bumps the `@cosyte/vitest-config` devDependency to `^0.0.2`
  for its `/snippets` export. Synthetic-only fixtures throughout (an invented patient, fake OIDs).
  Docs and tests only — no runtime or public-API change.

### Security

- **Dev-dependency advisory remediation (no runtime impact — both overridden
  packages are dev/build-time only and never enter the published artifact; the
  sole runtime dep, `@xmldom/xmldom`, is untouched).** Added scoped
  `pnpm.overrides` pinning two transitive packages to their patched releases:
  `esbuild` (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal —
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

- **Phase 7 (fifteenth slice) — the Referral Note SHALL set now asserts Reason for Referral.**
  Reconciles the parser's per-document-type required-section (SHALL) table with the section catalog the
  fourteenth slice expanded. That slice made the **Reason for Referral** Section a recognized catalog key
  but explicitly left the required-section table untouched; the Referral Note document
  (`2.16.840.1.113883.10.20.22.1.14`) SHALL contain a Reason for Referral Section, so a Referral Note that
  omits it is non-conformant. The `referralNote` SHALL set becomes
  `["allergies", "medications", "problems", "reasonForReferral"]` — a Referral Note missing that section now
  raises a `REQUIRED_SECTION_MISSING` **warning** (never a fatal; a missing section still never blocks
  reading the data that is present), while the builder's own Referral Note (which always emits the section)
  stays warning-free. Traced firsthand to the **normative C-CDA R2.1 Schematron** (the 1,010,531-byte
  `HL7/CDA-ccda-2.1` validation `.sch`): the Referral Note document pattern asserts Problem
  (CONF:1198-29087), Allergies (-30912), Medications (-30923), and Reason for Referral (-30925) as SHALL.
  Deliberately still omitted, per the table's conservative design: the **Assessment/Plan choice**
  (CONF:1198-29102 — a choice constraint) and **Results** / **Plan of Treatment** (CONF:1198-29090 / -29066
  — SHOULD, not SHALL; the build.fhir.org StructureDefinition's `payers`/`plan` `min=1` was confirmed to be
  drift from the normative Schematron and is not encoded). No public-API or warning-code change; the
  `requiredSectionKeys("referralNote")` / `missingRequiredSections(...)` accessors reflect the new entry.
- **Phase 7 (fourteenth slice) — builder emits a second C-CDA document type, the Referral Note.**
  Establishes the **multi-document-type pattern** in `buildCcda`: it now emits either a **CCD** (default) or
  a **Referral Note** (`documentType: "referralNote"`), each with its own US Realm Header specialization and
  document-type-specific SHALL section set. Previously the builder emitted only a CCD and threw for the
  other eleven types while `parseCcda` already read all twelve — this closes the first of that asymmetry.
  Confirmed firsthand against the C-CDA R2.1 IG document-level StructureDefinition
  (`2.16.840.1.113883.10.20.22.1.14`) and the **CC0** `onc-healthit/2015-certification-ccda-testdata` ToC
  Referral Note certification sample (`170.315_b1_toc_amb_rn_r21_sample1`). A clean Referral Note build
  carries **zero warnings** and round-trips through `parseCcda` fixed-point, exactly like a CCD.
  - **Header specialization.** The Referral Note carries the document `templateId` root
    `2.16.840.1.113883.10.20.22.1.14` (R2.1 `2015-08-01` stamp) and LOINC document `code` `57133-1`
    "Referral Note". A `DOC_TYPE_SPECS` table drives the header + SHALL section set per type, so the two
    document types share one emit path.
  - **Referral Note SHALL section set (always emitted).** The entries-required **Problems**, **Allergies**,
    and **Medications** (each an empty `nullFlavor="NI"` section when unpopulated — the entries-required
    `.X.1` templateId correctly dropped); the narrative **Reason for Referral** (V2,
    `1.3.6.1.4.1.19376.1.5.3.1.3.1`, `@extension 2014-06-09`, LOINC `42349-1`); the narrative **Assessment**
    (`…22.2.8`, LOINC `51848-0`) — **unversioned** in R2.1, so emitted **root-only with no `@extension`**;
    and **Plan of Treatment** (`…22.2.10`, `@extension 2014-06-09`, LOINC `18776-5`). Assessment + Plan of
    Treatment satisfy the document's "Assessment and Plan (V2) OR (Assessment + Plan of Treatment)" SHALL
    choice via the two-section branch.
  - **Results and Vital Signs are not Referral Note SHALL sections** (`0..1` in the IG) — unlike in a CCD,
    where the builder always emits them, a Referral Note emits them only when populated, never a fabricated
    empty one. Nothing clinical is fabricated: unpopulated SHALL sections are explicit empties, and the
    narrative sections carry only caller-supplied text.
  - **Parser (recognition).** The section catalog gains a `reasonForReferral` entry (LOINC `42349-1`,
    template root `1.3.6.1.4.1.19376.1.5.3.1.3.1`) so the emitted section is recognized (no
    `UNKNOWN_SECTION_CODE`) and the Referral Note round-trips warning-free. Purely additive — no change to
    any document type's required-section table; **CCD emit is byte-unchanged** (same SHALL sections, order,
    templateIds, codes).
  - **Public surface.** `BuildCcdaInit.documentType` widens to `"ccd" | "referralNote"`, and `BuildCcdaInit`
    gains optional `assessment` and `reasonForReferral` narrative strings (ignored for a CCD). No
    warning-code change. **Deferred:** the remaining ten document types; C-CDA document editing; the
    bring-your-own-credentials terminology adapter; the external-validator/Schematron differential gate.
- **Phase 7 (thirteenth slice) — parser reads + builder emits direct-entry Assessment Scale Observations.**
  A **coordinated parser + builder increment** for the **Assessment Scale Observation** (`…22.4.69`) and its
  **Assessment Scale Supporting Observation** (`…22.4.86`) — formal scored instruments (a PHQ-9 depression
  screen, a Glasgow Coma scale, a Barthel index) in the Functional Status and Mental Status sections.
  Verified firsthand against the C-CDA R2.1 Schematron (`HL7/cda-ccda-2.1`, CONF:81-14434…19088) and the two
  HL7 CC0 R2.1 examples (PHQ-9, Glasgow Coma): C-CDA R2.1 carries the Assessment Scale Observation as a
  **direct section entry**, **not** as a Functional/Mental Status Organizer member — the placement the
  twelfth slice deferred here. A clean build carries **zero warnings** and the serializer fixed point holds.
  - **Parser (read).** `extractFunctionalStatus` / `extractMentalStatus` now read a **direct-entry**
    Assessment Scale Observation (`…22.4.69`) as a `StatusObservation` flagged `assessmentScale: true`. Its
    **domain is the carrying section's** — gated on the section's own templateId root or LOINC section code,
    since the same OID appears in both sections, so a scale in one section is never pulled into the other
    domain; a scale in a section that is neither is not read (its domain is unknowable — never guessed). The
    lenient organizer-member reading is retained (Postel's Law). The scale's scored components
    (`…22.4.86`) are read into a new `SupportingObservation[]` on `StatusObservation.supporting`, so scale
    detail is never dropped.
  - **New `integer` observation-value kind.** `ObservationValue` gains
    `{ kind: "integer"; value?: number; nullFlavor?: string }` for `<value xsi:type="INT">` — the type
    C-CDA prefers for a questionnaire score (units are not allowed on an `INT`). `value` and `nullFlavor`
    are kept distinct — an explicit-unknown score is never collapsed into a real one.
  - **Builder (emit).** Two new optional `BuildCcdaInit` inputs — `functionalStatusScales` and
    `mentalStatusScales` (`BuildCcdaAssessmentScale[]`) — emit direct-entry Assessment Scale Observations.
    Each carries the **bare-root** templateId `…22.4.69` (R2.1 SHALL: `@root` with **no** `@extension`,
    CONF:81-14436/14437), a SHALL `id`, the scale `code` (LOINC default), a SHALL `statusCode` (`completed`),
    the SHALL `effectiveTime` [1..1], and the SHALL `value` [1..1] as the total score `xsi:type="INT"`.
    Supporting components are optional Assessment Scale Supporting Observations (`…22.4.86`, bare root)
    grouped by `entryRelationship typeCode="COMP"`, each with its own SHALL `value` [1..*] INT score.
  - **The score is never fabricated (the safety rule).** An omitted total or item score is
    `value nullFlavor="UNK"` — an explicit unknown read back as an `integer` value with no number, never a
    guessed 0; an omitted `effectiveTime` is `nullFlavor="UNK"`; `interpretation` and `supporting` items are
    emitted only when supplied.
  - **The two domains are never conflated (the safety rule).** Only the carrying section's templates are
    emitted, so each scale reads back tagged `domain: "functional"` or `"mental"` from its section — proven
    by a both-sections round-trip. Emitted only when populated (the status sections are CCD `SHOULD`).
  - New public types: `BuildCcdaAssessmentScale`, `BuildCcdaAssessmentScaleItem`, `SupportingObservation`.
    No warning-code change; the round-trip-by-construction invariant and the serializer fixed point hold.
  - **Deferred:** the supporting observation's optional second `CO`/`CD` coded answer and `IVL_INT`
    reference range (both tolerated on parse — read without warning — but not yet modeled); the organizer's
    own `code`/`effectiveTime` on parse; the other eleven document types; C-CDA document editing; the
    bring-your-own-credentials terminology adapter; and the external-validator/Schematron differential gate.
- **Phase 7 (twelfth slice) — builder emits Functional/Mental Status Organizers.** Extends `buildCcda`
  with two new optional inputs — `BuildCcdaInit.functionalStatusOrganizers`
  (`BuildCcdaFunctionalStatusOrganizer[]`) and `BuildCcdaInit.mentalStatusOrganizers`
  (`BuildCcdaMentalStatusOrganizer[]`) — that **group** related status findings under one organizer, the
  complement to the standalone Functional/Mental Status Observations shipped in the seventh/eighth slices.
  Grouped members round-trip through `getFunctionalStatus()` / `getMentalStatus()` to the same structured,
  domain-tagged findings by construction; a clean build still carries **zero warnings**.
  - **Functional Status Organizer + Mental Status Organizer.** A Functional Status Organizer **`…22.4.66`**
    (the **`2014-06-09`** stamp) or Mental Status Organizer **`…22.4.75`** (the **`2015-08-01`** stamp) is
    emitted as `<organizer classCode="CLUSTER" moodCode="EVN">` in its status section, carrying a SHALL `id`,
    a `code` (SHOULD ICF `2.16.840.1.113883.6.254` or LOINC — SHALL [1..1] for the Functional Status
    Organizer, [0..1] for the Mental Status Organizer with its "at least one of code or effectiveTime" floor;
    caller-supplied, else an explicit `nullFlavor="UNK"` category), a SHALL `statusCode` (`completed`), an
    optional `effectiveTime` [0..1], and
    one or more `component` members. Each member is a Functional Status Observation **`…22.4.67`** or Mental
    Status Observation **`…22.4.74`** — byte-identical to the standalone builders (shared code path) — so a
    grouped finding reads back with its fixed observation `code` (LOINC `54522-8` / SNOMED CT `373930000`)
    and coded finding `value` intact. Element order follows the CDA organizer schema (`templateId, id, code,
statusCode, effectiveTime, component+`).
  - **No clinical value, category, or date is ever fabricated (the safety rule).** An omitted organizer
    `code` is an explicit `nullFlavor="UNK"` (never a guessed categorization); an omitted organizer
    `effectiveTime` is simply not emitted (an optional element, never a fabricated date); an omitted finding
    `value` stays `nullFlavor="UNK"`. An organizer with zero findings is a `TypeError` — the template SHALL
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
    Observation (`…22.4.86`) — in C-CDA R2.1 the Assessment Scale Observation is a _direct section entry_ of
    the Functional/Mental Status Section, **not** a component of the organizer, and the current parser reads
    assessment scales only as organizer members; shipping it conformantly needs a coordinated parser
    increment (read a direct-entry assessment scale by its section's domain), so it is deferred. Also
    deferred: capturing the organizer's own `code`/`effectiveTime` on parse (members round-trip; the wrapper
    metadata does not yet), the Self-Care Activities organizer member (`…22.4.128`), the other eleven
    document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.

- **Phase 7 (eleventh slice) — builder emits a Family History section.** Extends `buildCcda` with one new
  optional input — `BuildCcdaInit.familyHistory` (`BuildCcdaFamilyHistory[]`) — that round-trips through
  `getFamilyHistory()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Family History section + organizer + observation.** A Family History Section (V3) **`…22.2.15`**
    (LOINC `10157-6`, the **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so only
    the base `templateId` is emitted) carries one or more Family History Organizers **`…22.4.45`** — one
    per relative (`<organizer classCode="CLUSTER">`), each with a SHALL `id`, SHALL `statusCode`
    (`completed`), and a SHALL `subject/relatedSubject` (`@classCode="PRS"`) naming the family member:
    a coded `relationship` (SNOMED CT by default, e.g. `72705000` mother / `9947008` father — overridable
    to HL7 RoleCode), plus the MAY `administrativeGenderCode`, `birthTime`, and `sdtc:deceasedInd` flag.
    Under it, each condition is a Family History Observation **`…22.4.46`** with the SHALL fixed `code`
    (SNOMED CT `64572001` "Condition"), a SHALL `statusCode`, the SHOULD [0..1] `effectiveTime`, and the
    SHALL coded `value` (the illness); a condition MAY nest an Age Observation **`…22.4.31`** (age at onset,
    a `PQ` in UCUM years) and a Family History Death Observation **`…22.4.47`** (cause of death).
  - **No clinical value, date, or relation is ever fabricated (the safety rule).** An unknown relationship
    is `relatedSubject/code nullFlavor="UNK"` and an unknown condition is `value nullFlavor="UNK"` — an
    explicit unknown, never guessed. The MAY demographics, the Age/Death sub-observations, and the SHOULD
    `effectiveTime` are each emitted only when supplied.
  - **Conditions are grouped by relative, never flattened.** Each relative's identity rides once on its
    organizer, so every condition reads back under its relative via `getFamilyHistory()`. The section
    narrative reads each condition's `relative: illness` label (`#id`-referenced), agreeing with the
    reconciled `value`, so no `CODE_NARRATIVE_MISMATCH` fires.
  - **Emitted only when populated.** Family History is a CCD `SHOULD` (not `SHALL`) section, so — like the
    other optional sections — an unpopulated section is **not** fabricated. The empty-build output is
    unchanged.
  - New public types: `BuildCcdaFamilyHistory` and its members `BuildCcdaFamilyMember` /
    `BuildCcdaFamilyHistoryObservation`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms in the builder, the other
    eleven document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and
    the external-validator/Schematron differential-testing gate.

- **Phase 7 (tenth slice) — builder emits a Plan of Treatment section.** Extends `buildCcda` with one new
  optional input — `BuildCcdaInit.planOfTreatment` (`BuildCcdaPlannedItem[]`) — that round-trips through
  `getPlannedItems()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Plan of Treatment section + the six planned-entry templates.** A Plan of Treatment Section (V2)
    **`…22.2.10`** (LOINC `18776-5`, the **`2014-06-09`** stamp, which has **no** entries-required `.1`
    variant, so only the base `templateId` is emitted) carries one or more of the six planned templates,
    each the **`2014-06-09`** stamp: Planned Act **`…22.4.39`** (`<act>`), Planned Encounter **`…22.4.40`**
    (`<encounter>`), Planned Procedure **`…22.4.41`** (`<procedure>`), Planned Medication Activity
    **`…22.4.42`** (`<substanceAdministration>`, drug in the `consumable`, no direct `<code>`), Planned
    Supply **`…22.4.43`** (`<supply>`), and Planned Observation **`…22.4.44`** (`<observation>`, carrying an
    optional expected `value`). Each emits a SHALL `id`, its coded order (default code system by kind —
    SNOMED CT for act/procedure/supply, CPT for encounter, LOINC for observation, RxNorm for medication), a
    planned `@moodCode`, and the SHALL `statusCode` fixed to `active`.
  - **Planned is never conflated with performed (the safety rule).** No variant admits the performed `EVN`
    mood, and `statusCode` is fixed to `active` (never a performed `completed`), so every entry reads back
    as `disposition: "planned"` — never mistaken for a performed Procedure/Encounter; a build carrying both
    a performed and a planned procedure keeps them in `getProcedures()` vs `getPlannedItems()`.
  - **The planned `@moodCode` domain is correct by construction.** `BuildCcdaPlannedItem` is a per-kind
    discriminated union: act/encounter/procedure accept the appointment moods `APT`/`ARQ`
    (`PlannedActMood`), while medication/supply/observation accept only `INT`/`RQO`/`PRMS`/`PRP`
    (`PlannedOrderMood`) — because the base CDA R2 domains `x_DocumentSubstanceMood` /
    `x_ActMoodDocumentObservation` exclude `APT`/`ARQ`. A schema-invalid appointment mood on a drug order or
    a lab is not representable — the type prevents it, not merely discourages it.
  - **Optional data is never fabricated.** The planned `effectiveTime` (SHOULD [0..1]) and the Planned
    Observation's expected `value` [0..1] are emitted only when supplied — an undated plan carries no
    fabricated date and no invented result. The section narrative agrees with each item's reconciled `code`
    (`#id`-referenced), so no `CODE_NARRATIVE_MISMATCH` fires.
  - **Emitted only when populated.** Plan of Treatment is a CCD `SHOULD` (not `SHALL`) section, so — like
    the other optional sections — an unpopulated section is **not** fabricated. The empty-build output is
    unchanged.
  - New public types: `BuildCcdaPlannedItem` and its members `BuildCcdaPlannedAct` / `BuildCcdaPlannedOrder`
    / `BuildCcdaPlannedObservation`, plus `PlannedActMood` / `PlannedOrderMood`. No parser change and no
    warning-code change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms and the Family History
    section in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own-credentials terminology adapter, and the external-validator/Schematron
    differential-testing gate.

- **Phase 7 (ninth slice) — builder emits a Past Medical History section.** Extends `buildCcda` with one
  new optional input — `BuildCcdaInit.pastMedicalHistory` (`BuildCcdaProblem[]`, reusing the Problems
  input shape) — that round-trips through `getPastMedicalHistory()` to the same structured content by
  construction; a clean build still carries **zero warnings**.
  - **Past Medical History section + bare Problem Observation.** A Past Medical History section
    **`…22.2.20`** (LOINC `11348-0`, the V3 **`2015-08-01`** stamp, which has **no** entries-required `.1`
    variant, so only the base `templateId` is emitted) carries one or more historical problems as **bare**
    Problem Observations **`…22.4.4`** (the **`2015-08-01`** stamp) directly under each `<entry>` — **not**
    wrapped in a Problem Concern Act (`…22.4.3`) the way the Problems section nests them. The bare
    observation build is now shared verbatim with the Problems section, mirroring the parser's own reuse
    (`buildProblem` serves both `getProblems` and `getPastMedicalHistory`). Each observation emits the
    fixed SNOMED CT `code` (`55607006` "Problem"), a SHALL `statusCode` (fixed `completed`), a SHALL
    `effectiveTime` [1..1] (onset as `low`; a `nullFlavor="UNK"` `high` for a resolved problem), and the
    SHALL `value` [1..1] carrying the coded condition (SNOMED CT / ICD-10-CM).
  - **A past illness is never double-counted as an active problem concern (the safety rule).** The
    extractors route on structure — a bare observation to `getPastMedicalHistory`, a concern-act-wrapped
    one to `getProblems` — so a resolved past problem never reads back as an active concern (or vice
    versa); a build carrying both keeps them in their respective accessors.
  - **Onset/resolution are never fabricated.** A supplied onset is the `effectiveTime/low`; an absent
    onset is an explicit `nullFlavor="UNK"` `low`; a resolved-but-date-unknown problem adds a
    `nullFlavor="UNK"` `high` — never a guessed date.
  - **Emitted only when populated.** Past Medical History is not a CCD `SHALL` section, so — like the other
    optional sections — an unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - No new public type (reuses `BuildCcdaProblem`). No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms, and the remaining
    sections (Plan of Treatment / Family History) in the builder, the other eleven document types, C-CDA
    document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.

- **Phase 7 (eighth slice) — builder emits a Mental Status section.** Extends `buildCcda` with one new
  optional input — `BuildCcdaInit.mentalStatus` (`BuildCcdaMentalStatus[]`) — that round-trips through
  `getMentalStatus()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Mental Status section + Mental Status Observation.** A Mental Status section **`…22.2.56`** (LOINC
    `10190-7`, the V2 **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so only the
    base `templateId` is emitted) carries one or more standalone Mental Status Observations **`…22.4.74`**
    (the **`2015-08-01`** stamp). Unlike Functional Status (`2014-06-09`), the Mental Status templates were
    **new in the R2.1 August 2015 errata** — split out of Functional Status — hence the later stamp. Each
    observation emits the R2.1 template-**fixed** SNOMED CT `code` (`373930000` "Cognitive function
    finding"), a SHALL `statusCode` (fixed `completed`), a SHALL `effectiveTime` [1..1] (the assessed time;
    `nullFlavor="UNK"` when unknown), and the SHALL **SNOMED CT** `value` [1..1] carrying the specific
    cognition/mood finding.
  - **Mental and functional status are never conflated (the safety rule).** Only Mental Status templates
    are emitted here, and the two extractors key off their distinct observation roots (`…22.4.67` vs
    `…22.4.74`), so the parser reads every finding back tagged **`domain: "mental"`** — a mental finding is
    never filed under Functional Status (or vice versa).
  - **Unknown is never defaulted to a finding.** When the caller supplies no `value`, the SHALL `value` is
    emitted as an **explicit `nullFlavor="UNK"`** — never invented as a real finding; the SHALL
    `effectiveTime` is likewise `nullFlavor="UNK"` when no assessed time is given, never a fabricated date.
  - **Emitted only when populated.** Mental Status is not a CCD `SHALL` section, so — like Functional Status
    / Immunizations / Procedures / Encounters / Social History — an unpopulated section is **not**
    fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaMentalStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms, and the remaining
    sections (Plan of Treatment / Family History / Past Medical History) in the builder, the other eleven
    document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.
- **Phase 7 (seventh slice) — builder emits a Functional Status section.** Extends `buildCcda` with
  one new optional input — `BuildCcdaInit.functionalStatus` (`BuildCcdaFunctionalStatus[]`) — that
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
    templates are emitted, so the parser reads every finding back tagged **`domain: "functional"`** — a
    functional finding is never filed under Mental Status (`getMentalStatus()` stays empty).
  - **Unknown is never defaulted to a finding.** When the caller supplies no `value`, the SHALL `value`
    is emitted as an **explicit `nullFlavor="UNK"`** — never invented as a real finding; the SHALL
    effectiveTime is likewise `nullFlavor="UNK"` when no assessed time is given, never a fabricated date.
  - **Emitted only when populated.** Functional Status is not a CCD `SHALL` section (the CCD required set
    is Allergies / Medications / Problems / Results), so — like Immunizations / Procedures / Encounters /
    Social History — an unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaFunctionalStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** Mental Status, the Functional/Mental Status Organizer + Assessment Scale forms, and the
    remaining sections (Plan of Treatment / Family History / Past Medical History / …) in the builder,
    the other eleven document types, C-CDA document _editing_, the bring-your-own-credentials
    terminology adapter, and the external-validator/Schematron differential-testing gate.

- **Phase 7 (sixth slice) — builder emits a Social History (Smoking Status) section.** Extends
  `buildCcda` with one new optional input — `BuildCcdaInit.smokingStatus` (`BuildCcdaSmokingStatus[]`)
  — that round-trips through `getSmokingStatus()` to the same structured content by construction; a
  clean build still carries **zero warnings**.
  - **Social History section + Smoking Status observation.** A Social History section **`…22.2.17`**
    (LOINC `29762-2`, the V3 **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so
    only the base `templateId` is emitted) carries one or more Smoking Status — Meaningful Use
    observations **`…22.4.78`** (the **`2014-06-09`** stamp). Each observation emits the fixed LOINC
    `code` (`72166-2` "Tobacco smoking status"), a SHALL `statusCode`, a SHALL `effectiveTime` (the
    recorded time; `nullFlavor="UNK"` when unknown), and the SHALL **SNOMED CT** `value` from the
    Current Smoking Status value set.
  - **Unknown is never defaulted to a status (the safety rule).** When the caller supplies no `value`,
    the SHALL `value` is emitted as an **explicit `nullFlavor="UNK"`** — read back by the parser as
    `unknown: true` and flagged `SMOKING_STATUS_UNKNOWN` — **never** invented as a "never smoker" (or any
    other) reading. Absent status ≠ non-smoker; `nullFlavor` and a real coded value are never conflated.
  - **Emitted only when populated.** Social History is not a CCD `SHALL` section (the CCD required set is
    Allergies / Medications / Problems / Results), so — like Immunizations / Procedures / Encounters — an
    unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaSmokingStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Plan of Treatment / Functional Status / Family History / Past
    Medical History / …) in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own terminology adapter, and the external Schematron/XSD differential-validation gate.

- **Phase 7 (fifth slice) — builder emits Procedures and Encounters sections.** Extends `buildCcda`
  beyond the header + reconciliation triad + Results/Vital Signs/Immunizations to emit the next two
  roadmap sections, added together because they share plumbing (a coded act with `statusCode` +
  `effectiveTime` + structured/narrative agreement). Two new optional inputs — `BuildCcdaInit.procedures`
  (`BuildCcdaProcedure[]`) and `BuildCcdaInit.encounters` (`BuildCcdaEncounter[]`) — each round-trip
  through `getProcedures()` / `getEncounters()` to the same structured content by construction, and a
  clean build still carries **zero warnings**.
  - **Procedures.** One of the three Procedure Activity variants per entry — operative `<procedure>`
    **`…22.4.14`**, non-altering `<act>` **`…22.4.12`**, or assessment `<observation>` **`…22.4.13`**
    (`kind`, default `"procedure"`) — inside a Procedures section **`…22.2.7.1`** (LOINC `47519-4`). The
    section and all three entry templates carry the R2.1 **`2014-06-09`** stamp (not the `2015-08-01`
    stamp the other sections use); a new per-section `extension` is threaded through the section-template
    helper for this. The coded procedure (**SNOMED CT** by default) is the SHALL `code`; the SHALL
    `statusCode` is always emitted.
  - **`moodCode` is the safety-critical axis.** `disposition: "performed"` → `moodCode="EVN"`,
    `"planned"` → `"INT"`; the parser reads it back as its performed-vs-planned disposition and the two
    are **never conflated**. `statusCode` defaults per disposition (performed → `completed`, planned →
    `active`). The Procedure `effectiveTime` is **SHOULD [0..1]** (CONF:1098-7662), so it is emitted
    **only when supplied** — never fabricated with a `nullFlavor` when unknown. An
    `"observation"`-variant procedure that omits its **SHALL `value` [1..1]** (`…22.4.13`) **throws** a
    `TypeError` rather than emit a non-conformant, value-less observation.
  - **Encounters.** An Encounter Activity **`…22.4.49`** (`@2015-08-01`) inside an Encounters section
    **`…22.2.22.1`** (LOINC `46240-8`). The encounter type is the **SHALL `code` [1..1]** (**CPT** by
    default) and is required on the input; the **SHALL `effectiveTime` [1..1]** visit period is always
    emitted as an `IVL_TS` — real `low`/`high` bounds when a `period` is supplied, else a
    `nullFlavor="UNK"` `low` that satisfies the cardinality without inventing a date (read back as
    absent). `statusCode` defaults to `completed`.
  - **Emitted only when populated.** Neither Procedures nor Encounters is a CCD `SHALL` section (the CCD
    required set is Allergies / Medications / Problems / Results), so — like Immunizations — an
    unpopulated section is **not** fabricated as an empty `nullFlavor="NI"` shell. The empty-build output
    is unchanged.
  - New public types `BuildCcdaProcedure` and `BuildCcdaEncounter`. No parser change and no warning-code
    change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Plan of Treatment / Social History / Functional Status / Family
    History / …) in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own terminology adapter, and the external Schematron/XSD differential-validation gate (the
    roadmap's still-unproven pure-JS-engine-capacity question, §10 Q10) — a `buildCcda` document remains
    expected-but-not-proven against an external IG validator.

- **Phase 7 (fourth slice) — builder emits an Immunizations section.** Extends `buildCcda` beyond the
  header + the reconciliation triad + Results/Vital Signs to emit **Immunizations** — the natural
  continuation that completes the Phase-3 discrete-data trio (Results / Vital Signs / Immunizations) in
  the emit path. A new optional `BuildCcdaInit.immunizations` (`BuildCcdaImmunization[]`) drives one
  **Immunization Activity `…22.4.52`** `substanceAdministration` per shot → **Immunization Medication
  Information `…22.4.54`**, the vaccine at `consumable/manufacturedProduct/manufacturedMaterial/code`
  (**CVX** by default). Each entry round-trips through `getImmunizations()` to the same structured
  content by construction, and a clean administered build still carries **zero warnings**.
  - **Safety-critical fail-safes, mirroring the existing sections.** `dose` (`doseQuantity`) and `route`
    (`routeCode`, **NCI Thesaurus** by default) are **never guessed** — an omitted one is simply left
    absent. A **refused / not-administered** shot (`refused: true`) is emitted as `negationInd="true"`,
    which the parser reads back as `refused` and flags `IMMUNIZATION_REFUSED` — the clinically
    load-bearing refusal is surfaced, **never conflated** with a `nullFlavor` "unknown" (opposite
    clinical meaning).
  - **SHALL `effectiveTime` [1..1]** on the Immunization Activity (the substantive cardinality grounded
    against the C-CDA R2.1 IG; the exact `CONF:` id is not re-verified and is intentionally not asserted):
    the administration date is emitted as an `@value` when supplied, else `nullFlavor="UNK"` — satisfying
    the cardinality without fabricating a clinical timestamp, read back as absent (never a real `Date`),
    consistent with the third slice's every-entry `effectiveTime` rule.
  - **Emitted only when populated.** Immunizations is **not** a CCD `SHALL` section (the CCD required set
    is Allergies / Medications / Problems / Results), so an unpopulated Immunizations section is **not**
    fabricated as an empty `nullFlavor="NI"` shell — unlike the five CCD sections the builder always
    emits. The empty-build output is therefore unchanged.
  - New public type `BuildCcdaImmunization`. No new required fields, no parser change, no warning-code
    change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Procedures / Encounters / Plan of Treatment / Social History /
    …) in the builder, the other eleven document types, C-CDA document _editing_, the bring-your-own
    terminology adapter, and the external Schematron/XSD differential-validation gate (the roadmap's
    still-unproven pure-JS-engine-capacity question, §10 Q10) — a `buildCcda` document remains
    expected-but-not-proven against an external IG validator.

- **Phase 7 (third slice) — builder emits the `SHALL` `effectiveTime` on every entry.** Closes the
  conformance gap the previous slice flagged in the README known-limitations: `buildCcda` emitted each
  act/observation's `effectiveTime` **only when the caller supplied a time**, so a built document
  round-tripped but was not Schematron-complete (several R2.1 `SHALL`-cardinality `effectiveTime` slots
  could be absent). Every affected template now emits the element its IG constraint requires, across
  **all** sections — the Problems/Allergies concern acts + observations, the Medication Activity `IVL_TS`
  duration, and the Results/Vital Signs organizers + observations.
  - Where the caller supplied a time it is used; where a `SHALL` requires the element but no time is known
    the slot is `nullFlavor="UNK"` — satisfying the cardinality **without fabricating** a clinical
    timestamp, and read back as absent (`date === undefined`), never a real time. Mirrors the header's
    `SHALL` `addr`/`telecom` and the never-guessed `dose`/`route`.
  - Per-template cardinality, confirmed against the C-CDA R2.1 IG before emitting: Problem/Allergy
    **Concern Act** `effectiveTime` `SHALL` [1..1] under the shared Concern Act rule (active→`low`,
    completed→`high` — on the Problem Concern Act `…22.4.3` these are CONF:1198-7504 / CONF:1198-10085;
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
    optional `effectiveTime` (0..1, no `SHALL` gap); full XSD element-order + Schematron completeness — no
    external validator was reachable, so cardinality was grounded against the raw IG text, not asserted by
    a validator run.

- **Phase 7 (second slice) — richer builder section emitters (Medications, Results, Vital Signs).**
  Extends `buildCcda` from the header + Problems + Allergies of the first slice to emit **populated,
  discrete-data** clinical sections that were previously empty `nullFlavor="NI"` placeholders. Each new
  section round-trips through `parseCcda` to the same structured content by construction, and a clean
  build still carries **zero warnings**.
  - **Medications** — Medication Activity `…22.4.16` `substanceAdministration` → Medication Information
    `…22.4.23`, the drug at `consumable/manufacturedProduct/manufacturedMaterial/code` (**RxNorm** by
    default), the periodic frequency (`PIVL_TS` period) and therapy window (`IVL_TS` low/high) emitted
    as **two distinct `effectiveTime` siblings** (never conflated). `dose` (`doseQuantity`) and `route`
    (`routeCode`, **NCI Thesaurus** by default) are **never defaulted** — an omitted one is left absent
    so the parser flags it (`MISSING_DOSE_QUANTITY` / `MISSING_ROUTE_CODE`), exactly the fail-safe the
    allergy `type` default established.
  - **Results** — Result Organizer `…22.4.1` → Result Observation `…22.4.2`, the LOINC test code, a
    typed `value` in **exactly one** form (a UCUM-checked `PQ` quantity, a `CD` coded value, or a `ST`
    string — the builder throws if none or more than one is set, so a result value is never dropped or
    invented), an optional structured `IVL_PQ` reference range, and an `interpretationCode`.
  - **Vital Signs** — Vital Signs Organizer `…22.4.26` → Vital Sign Observation `…22.4.27`, the LOINC
    vital code and a **UCUM** `PQ` reading; the organizer carries the SNOMED `46680005` "Vital signs"
    cluster code.
  - **Units are safety-critical.** Result/Vital `PQ` units are emitted verbatim and checked by the
    computable UCUM grammar on re-parse — a non-UCUM or case-slipped unit (`Kg` for `kg`) surfaces
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

- **Phase 7 (first slice) — document builder `buildCcda`.** The conservative _emit_ factory, symmetric
  with `parseCcda` and mirroring the sibling `@cosyte/hl7`'s `buildMessage`: from a semantic
  `BuildCcdaInit` it assembles a **spec-clean C-CDA R2.1 CCD** and returns a real `CcdaDocument`.
  - **Round-trip by construction.** The builder emits through the _same DOM the parser reads_ — it
    builds an `@xmldom/xmldom` document with `createElementNS` (the serializer does all XML escaping),
    serializes it with the shared `serializeDocument`, then parses that text with `parseCcda`. The
    returned document is the parse of the emitted XML, so a document `buildCcda` emits always parses
    back to the same structured content and `parseCcda(doc.toString()).toString() === doc.toString()`
    holds automatically. A clean build carries **zero warnings**.
  - **Emits** the full US Realm Header (US Realm Header `…22.1.1@2015-08-01` + CCD `…22.1.2@2015-08-01`
    templateIds, LOINC document code `34133-9`, `recordTarget` with the SHALL `addr`/`telecom`, a device
    `author`, and a `custodian` — no invented person, no PHI) plus the two safety-critical
    reconciliation sections: **Problems** (Problem Concern Act `…22.4.3` → Problem Observation `…22.4.4`,
    active/resolved/inactive → concern `statusCode`, code↔narrative agreement) and **Allergies** (Allergy
    Concern Act `…22.4.30` → Allergy-Intolerance Observation `…22.4.7`, allergen at
    `participant/…/playingEntity/code`, optional Reaction/Severity/Criticality kept as distinct axes, the
    propensity `type` defaulting to the neutral SNOMED `419199007` "Allergy to substance" — never a
    guessed "Drug allergy" — and the **`negationInd` "No Known Allergies"** form emitted as a negation
    with no `nullFlavor`). The other CCD SHALL sections (Medications, Results) are emitted as spec-clean
    **empty, entries-optional** `nullFlavor="NI"` sections (never the entries-required `.1` with zero
    entries), so the document is conformant with no `REQUIRED_SECTION_MISSING`.
  - New public surface: `buildCcda` and the input types `BuildCcdaInit`, `BuildCcdaPatient`,
    `BuildCcdaProblem`, `BuildCcdaAllergy`, `BuildCode`. No parser change, no warning-code change.
    Synthetic-only fixtures; omitted demographics emit `nullFlavor="UNK"` rather than invented values.
  - **Deferred to a later CCDA-P7 increment:** richer section builders (Medications, Results, Vital
    Signs, Immunizations, Procedures, …), the other eleven document types, and the
    bring-your-own-credentials semantic-terminology adapter + optional bundled redistributable data.

- **Phase 6 — vendor / conformance profile system (registry with provenance).** A `defineCcdaProfile()`
  engine mirroring the sibling `@cosyte/hl7` profile shape (`name` / `lineage` / `describe()` /
  `extends`-merge), a provenance-backed built-in registry (`ccdaProfiles`, `getCcdaProfile`,
  `listCcdaProfiles`), and a process-scoped default (`set/getDefaultCcdaProfile`). `parseCcda(xml,
{ profile })` applies it — a profile downgrades the **non-safety-critical** deviations it _expects_
  to a `PROFILE_QUIRK_APPLIED` warning (flagged `expected: true`, carrying the original `toleratedCode`
  in a preserved `doc.warnings` entry — a tolerated deviation is **never dropped**), and never changes
  an extracted clinical value (it operates purely at the warning-emitter layer). `doc.profile` records
  the applied profile's name + lineage.
  - **Safety gate (the load-bearing rule).** A profile can **never** tolerate a safety-critical warning
    code — patient identity (`MISSING_ASSIGNING_AUTHORITY`, `MULTIPLE_RECORD_TARGETS`), allergy
    negation/granularity, dose/route/timing, UCUM units, code↔narrative mismatch, unhandled value
    types, active-vs-resolved / planned-vs-performed status, a wrong/unknown code system
    (`UNEXPECTED_CODE_SYSTEM`), a malformed datetime (`MALFORMED_DATETIME`), or a missing SHALL section.
    Attempting to tolerate one throws `CcdaProfileDefinitionError` at definition time (`SAFETY_CRITICAL_CODES`).
  - **Evidence-backed built-ins (no invented vendor quirks, per ADR 0018).** `ccdaProfiles.smartScorecard`
    — deprecated-terminology tolerance grounded in the public SMART C-CDA Scorecard rubric + D'Amore
    et al., _JAMIA_ 2014 (deprecated BMI LOINC 41909-3, ICD-9 in newer docs, malformed `nullFlavor`
    tokens). `ccdaProfiles.legacyR11` — R1.1-origin receive-tolerance (absent 2015-08-01 version stamp,
    LOINC-fallback section matching) grounded in ONC §170.315(b)(1)'s receive-both-R2.1-and-R1.1
    requirement + the CC0 HL7/C-CDA-Examples corpus. Plus the conservative `default` baseline
    (tolerates nothing). Named per-vendor (Epic/Cerner/…) profiles deliberately await a real
    vendor-attributed grounding document — the anti-invention rule stands.
  - New public surface: `defineCcdaProfile`, `ccdaProfiles`, `getCcdaProfile`, `listCcdaProfiles`,
    `setDefaultCcdaProfile`, `getDefaultCcdaProfile`, `applyProfile`, `wrapEmitterWithProfile`,
    `SAFETY_CRITICAL_CODES`, `isSafetyCriticalCode`, `profileQuirkApplied`, `CcdaProfileDefinitionError`,
    the `PROFILE_QUIRK_APPLIED` warning code, and the `CcdaProfile` / `DefineCcdaProfileOptions` /
    `QuirkTolerance` / `QuirkMatch` / `ProfileProvenance` / `ProfileAttribution` types. Synthetic-only
    test fixtures (reuse the existing `buildCcda` builder); no realistic PHI.

- **Phase 5b — deferred clinical sections (Plan of Treatment, Functional / Mental Status, Family /
  Past Medical History).** `parseCcda(xml)` now extracts five more entry families, surfaced on
  `CcdaDocument` via `getPlannedItems()`, `getFunctionalStatus()`, `getMentalStatus()`,
  `getFamilyHistory()`, `getPastMedicalHistory()` (and the matching `doc.plannedItems` /
  `doc.functionalStatus` / `doc.mentalStatus` / `doc.familyHistory` / `doc.pastMedicalHistory` arrays):
  - **Plan of Treatment** — the six planned-entry templates (`…22.4.39`–`…22.4.44`: Act, Encounter,
    Procedure, Medication Activity, Supply, Observation), kept apart by a `kind` discriminant.
    **Everything here is future/ordered, never performed:** each item's `moodCode` is read into the same
    performed-vs-planned `disposition` as Procedures (a planned mood → `"planned"`), **never conflated**;
    a missing/unrecognized mood leaves `disposition` undefined rather than guessing. A Planned Medication
    Activity's drug is read from its `consumable`.
  - **Functional Status** / **Mental Status** — the Functional/Mental Status Observations (`…22.4.67` /
    `…22.4.74`), read standalone or as members of a status Organizer (`…22.4.66` / `…22.4.75`), plus any
    Assessment Scale Observation (`…22.4.69`, flagged `assessmentScale`) inside such an organizer. Each
    finding is `domain`-tagged so the two are **never conflated**; a standalone assessment scale (domain
    indeterminable from its template) is deliberately not captured.
  - **Family History** — the Family History Organizer (`…22.4.45`) → Observation (`…22.4.46`) tree. The
    relative's identity (relationship, gender, birth time, `sdtc:deceasedInd`) is a structured `relative`
    (not flattened); each condition carries its coded `value`, an optional Age Observation (`…22.4.31`,
    age at onset), and a `causeOfDeath` flag from a Family History Death Observation (`…22.4.47`).
  - **Past Medical History** — the **bare** Problem Observations (`…22.4.4`) a Past Medical History
    section (`…22.2.20`) carries directly under each `<entry>` (not in a Problem Concern Act), reusing
    the Problems model — so a past problem never double-counts as an active one.
  - **No new warning codes** — the deferred sections reuse the existing Tier-2 registry (e.g.
    `CODE_NARRATIVE_MISMATCH`, `NEGATION_VS_NULLFLAVOR_AMBIGUOUS`), and the required-section table is
    unchanged. (The Care Plan document's SHALL sections — `healthConcerns` + `goals` — already landed in
    Phase 5; a Plan of Treatment Section stays **excluded** because a Care Plan SHALL NOT contain one.)
- **Phase 5 — Procedures, Encounters, Social-History smoking status + required-section validation.**
  `parseCcda(xml)` now extracts three more entry families and validates a document's SHALL sections,
  surfaced on `CcdaDocument` via `getProcedures()`, `getEncounters()`, `getSmokingStatus()` (and the
  `doc.procedures` / `doc.encounters` / `doc.smokingStatus` arrays):
  - **Procedures** — the three Procedure Activity templates: an altering/operative `<procedure>`
    (`…22.4.14`), a non-altering `<act>` service (`…22.4.12`), and an assessment `<observation>`
    (`…22.4.13`), kept apart by a `kind` discriminant. **`moodCode` is safety-critical:** a performed
    procedure (`EVN`) and a planned/ordered one (`INT`/`RQO`/`PRMS`/`PRP`/`APT`/`ARQ`) become a
    `disposition` of `"performed"` vs `"planned"` and are **never conflated** — a missing mood is
    `PLANNED_VS_PERFORMED_AMBIGUOUS`, an unrecognized mood is `PROCEDURE_MOOD_UNEXPECTED`, both leaving
    `disposition` undefined rather than guessing. A `negationInd` stays distinct from a `nullFlavor`.
  - **Encounters** — the Encounter Activity (`…22.4.49`): the visit type `code`, `statusCode`, and
    visit-period `effectiveTime`.
  - **Social History — Smoking Status** — the Smoking Status — Meaningful Use observation (`…22.4.78`):
    the SNOMED CT `value` from the Current Smoking Status value set (`…11.20.9.38`). An
    explicitly-unknown status (a `nullFlavor` or an "unknown" SNOMED concept) sets `unknown: true` and
    emits `SMOKING_STATUS_UNKNOWN` — never silently read as "never smoked"; a value outside the value
    set is preserved and flagged `SMOKING_STATUS_CODE_UNRECOGNIZED`.
  - **Required-section (SHALL) validation** — for a recognized `DocumentType`, an absent required
    catalog section emits `REQUIRED_SECTION_MISSING` (a **warning**, never a fatal). The table is
    **conservative** — only unconditional, in-catalog, high-confidence SHALL constraints; it omits
    choice constraints (`A OR B`), SHOULD/MAY sections, and SHALL sections outside the recognized
    catalog. New `requiredSectionKeys` / `missingRequiredSections` expose the table.
  - Five new Tier-2 warning codes: `REQUIRED_SECTION_MISSING`, `PROCEDURE_MOOD_UNEXPECTED`,
    `PLANNED_VS_PERFORMED_AMBIGUOUS`, `SMOKING_STATUS_UNKNOWN`, `SMOKING_STATUS_CODE_UNRECOGNIZED`.
- **Phase 4 — spec-clean serializer + immutable copy-with.** The conservative _emit_ half of the
  Postel's-Law contract, symmetric with `parseCcda`:
  - **`serializeCcda(doc)` and `doc.toString()`** re-emit a parsed document as spec-clean C-CDA XML
    with a guaranteed UTF-8 declaration. Both return the same string. Serialization is a **fixed
    point**: `parseCcda(serializeCcda(doc))` re-serializes to the identical text, and
    `parse(serialize(x))` is canonically equal to `x` — backed by the `@cosyte/test-utils` round-trip
    property invariant.
  - **No silent loss.** The output is snapshotted from the parsed XML DOM at parse time rather than
    reconstructed from the lossy read-model, so every element, attribute, namespace declaration
    (`xmlns` / `xmlns:xsi` / `xmlns:sdtc`), `templateId`, and even content the read-model never models
    survives the round-trip. A `nonXMLBody` base64 payload stays inert. A hand-constructed document
    (one not produced by `parseCcda`) retains no source and so throws from `toString()` until a
    document builder API lands in a later phase.
  - **`doc.withWarnings(extra)`** — the sanctioned structural-sharing copy-with: returns a **new**
    `CcdaDocument` with `extra` warnings appended, sharing every parsed field (header, sections,
    entries, serialized snapshot) by reference; the original is never mutated. The immutability
    invariant is enforced by the `@cosyte/test-utils` immutability property.
- **Phase 3 — discrete clinical data: Results, Vital Signs, Immunizations.** `parseCcda(xml)` now
  extracts the three discrete-data entry families, surfaced on `CcdaDocument` via `getResults()`,
  `getVitals()`, and `getImmunizations()` (and the `doc.results` / `doc.vitals` /
  `doc.immunizations` arrays):
  - **Results** — Result Organizer (`…22.4.1`) → Result Observation (`…22.4.2`); the LOINC-coded
    analyte, the polymorphic observation `value` read into a discriminated `ObservationValue` union
    (`physicalQuantity` / `coded` / `string` / `range` / `unsupported`, selected by `xsi:type`), the
    `referenceRange` (structured `IVL_PQ` bounds, else free-text), and the `interpretationCode`.
  - **Vital Signs** — Vital Signs Organizer (`…22.4.26`) → Vital Sign Observation (`…22.4.27`); same
    UCUM-checked `ObservationValue` machinery, no reference range.
  - **Immunizations** — Immunization Activity (`…22.4.52`); the CVX vaccine reached via
    `consumable/manufacturedProduct/manufacturedMaterial/code`, `dose`, `route`, `effectiveTime`, and
    `statusCode`. A `negationInd="true"` refusal is modeled as a distinct `refused` flag (emitting
    `IMMUNIZATION_REFUSED`), never conflated with a `nullFlavor`.
  - **Computable, zero-dep UCUM grammar** — a recursive-descent validator (`isValidUcumUnit`,
    `isUcumCaseSuspect`) runs on every physical quantity. A non-UCUM unit is flagged
    (`NON_UCUM_UNIT`) and a letter-case slip of a canonical unit (`UCUM_CASE_SUSPECT`) is caught, but
    the **raw unit string is always preserved — units are never normalized away**. Property-based
    invariants back the grammar (well-formed-by-construction always validates; a canonical unit is
    never reported case-suspect; an annotation suffix never changes validity).
  - **Code-system recognition** — CVX (`CVX`) for vaccines and the HL7 `INTERPRETATION` system, plus
    LOINC deprecation checking (`checkLoincDeprecation`) on result/vital analyte codes.
  - **Seven new Tier-2 warning codes** for the discrete-data layer: `NON_UCUM_UNIT`,
    `UCUM_CASE_SUSPECT`, `MISSING_UNIT_ON_PQ`, `FREE_TEXT_REFERENCE_RANGE`,
    `RESULT_VALUE_TYPE_UNHANDLED`, `IMMUNIZATION_REFUSED`, and `DEPRECATED_LOINC`. The lenient
    invariant holds throughout: an unrecognized `value xsi:type` is preserved as `unsupported`
    (nothing dropped), and a `PQ` with a non-UCUM unit keeps its raw unit.
- **Phase 2 — the clinical reconciliation triad.** `parseCcda(xml)` now extracts the three
  reconciliation entries from a structured body, surfaced on `CcdaDocument` via `getProblems()`,
  `getMedications()`, and `getAllergies()` (and the `doc.problems` / `doc.medications` /
  `doc.allergies` arrays):
  - **Problems** — Problem Concern Act (`…22.4.3`) → Problem Observation (`…22.4.4`); the coded
    condition (`value xsi:type="CD"`, SNOMED CT / ICD-10-CM), the concern `status`
    (active / resolved / inactive / unknown), and `effectiveTime`.
  - **Medications** — Medication Activity (`…22.4.16`); the RxNorm drug reached via
    `consumable/manufacturedProduct/manufacturedMaterial/code`, `dose`/`doseRange`, `route`, and the
    two `effectiveTime` siblings split by `xsi:type` into an `IVL_TS` therapy window (`duration`) and
    a `PIVL_TS` periodic `frequency` — `moodCode` (administered vs planned) kept distinct.
  - **Allergies** — Allergy Concern Act (`…22.4.30`) → Allergy-Intolerance Observation (`…22.4.7`);
    the allergen at `participant/participantRole/playingEntity/code`, each Reaction (`…22.4.9`) with
    its nested Severity (`…22.4.8`), and the propensity-level Criticality (`…22.4.145`) — severity and
    criticality never merged. The `negationInd="true"` "No Known Allergies" assertion is modeled as a
    distinct `noKnownAllergy` flag, never conflated with a `nullFlavor` (value unknown).
  - **Code-system recognition** — structural `@codeSystem` OID validation per coded slot
    (`checkCodeSlot`, exported OIDs `SNOMED_CT` / `RXNORM` / `ICD10_CM` / `NDC` / `UNII` /
    `NCI_ROUTE` / …), flagging a deprecated (ICD-9) or unexpected terminology. Recognition only — it
    never bundles licensed terminology content; see the README "Code systems & provenance" note.
  - **Eleven new Tier-2 warning codes** for the entry layer: `NEGATION_VS_NULLFLAVOR_AMBIGUOUS`,
    `CODE_NARRATIVE_MISMATCH`, `NARRATIVE_REFERENCE_BROKEN`, `UNEXPECTED_CODE_SYSTEM`,
    `DEPRECATED_CODE_SYSTEM`, `MISSING_DOSE_QUANTITY`, `MISSING_ROUTE_CODE`,
    `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED`, `PROBLEM_STATUS_INDETERMINATE`,
    `ALLERGEN_GRANULARITY_SUSPECT`, and `SECTION_PLACEMENT_SUSPECT`. The two safety-critical
    reconciliations are conservative: a code↔narrative disagreement surfaces **both** and picks no
    winner; a missing `doseQuantity`/`routeCode` is preserved-as-absent and flagged, never defaulted.
- **Phase 1 — the working parser.** `parseCcda(xml)` turns a real C-CDA R2.1 document into an
  immutable `CcdaDocument`:
  - **Document recognition** — all 12 US Realm document types (CCD, Discharge Summary, Referral Note,
    Consultation Note, History & Physical, Progress Note, Procedure Note, Operative Note, Care Plan,
    Diagnostic Imaging Report, Unstructured Document, Transfer Summary) resolved from the root
    `templateId`; `MISSING_TEMPLATE_ID` / `UNKNOWN_DOCUMENT_TEMPLATE` / `TEMPLATE_EXTENSION_ABSENT`
    warnings cover the deviations.
  - **US Realm header** — document identity, `code`, `title`, `effectiveTime`, `confidentialityCode`,
    `languageCode`, and the `recordTarget`/patient demographics (name parts, gender, birth time,
    marital status, race, ethnic group) + identifiers. Convenience accessors `getPatient()` and
    `getMrn()` (MRN selection isolated in `pickMrn` for a future profile override).
  - **Section framing** — sections recognized by `templateId` with a LOINC-code fallback
    (`SECTION_MATCHED_BY_LOINC_FALLBACK`), nested subsections, narrative text, and a narrative
    `ID`→text index for Phase-2 reference resolution; `findSection()` / `allSections()`. Unstructured
    documents expose their `nonXMLBody` (base64 left inert).
  - **HL7 v3 datatype layer** — `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`,
    variable-precision v3 datetime parsing, and null-flavor handling, plus namespace-aware DOM read
    helpers (`attr`, `child`, `children`, `childElements`, `text`, `xsiType`, `positionOf`).
- **Tier-2 warning registry** (stable string codes; renaming one is a breaking change) surfaced on
  `doc.warnings` (frozen), forwarded to `options.onWarning` (a throwing handler is contained), or —
  with `{ strict: true }` — escalated to a thrown `CcdaParseError`.
- **Hardened XML substrate + Tier-3 fatals** — DTD/DOCTYPE & external-entity rejection
  (`XXE_OR_DTD_PRESENT`), billion-laughs entity-expansion cap (`ENTITY_EXPANSION_LIMIT`), input-size
  (`INPUT_SIZE_LIMIT_EXCEEDED`), nesting-depth (`ELEMENT_DEPTH_LIMIT_EXCEEDED`), node-count
  (`NODE_COUNT_LIMIT_EXCEEDED`), malformed-XML (`NOT_WELL_FORMED_XML`), and non-`ClinicalDocument`
  root (`NOT_A_CLINICAL_DOCUMENT`) guards, with BOM stripping and base64 quarantine. Tunable via
  `DEFAULT_LIMITS` / `resolveLimits`; the substrate is exported as `parseSecureXml`.
- **PHI discipline** — every warning/fatal message and `position` carries only structural locators
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
  (namespaces, attributes, mixed narrative content, `xsi:type`) and an XXE-safe, hardenable posture —
  **1 of the ≤ 3** runtime-dep cap, intended as the shared XML substrate with `@cosyte/ncpdp`. No
  parse-layer code yet; Phase 1 configures and consumes it.

### Changed

### Deprecated

### Removed

### Fixed

- **The release can actually bump the version.** `package.json` had no `version` script, so the
  shared pipeline's `pnpm run version` failed with `Command "version" not found` and the release
  aborted before opening a "Version Packages" PR. Adds `scripts/sync-version.mjs` (the `hl7`
  reference, retargeted at `src/index.ts`) and the `version` script that runs it after
  `changeset version`, so the bump and the `VERSION` constant land in the same commit.
- **`VERSION` is no longer typed as a string literal.** It was declared `export const VERSION =
"0.0.0"`, giving it the literal type `"0.0.0"` — so the exported type would change on every
  release, making each version bump a breaking type change. Now annotated `: string`, matching the
  `hl7` reference. Type-only; the runtime value is unchanged. Done now because the package is
  unpublished — after the first publish this would itself be a breaking change.

- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own — so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only — no runtime or API change.

### Security

[Unreleased]: https://github.com/cosyte/ccda/commits/main
