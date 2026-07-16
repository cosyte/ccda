# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Versions and publishing are managed with [Changesets](https://github.com/changesets/changesets);
this file is maintained by hand (Changesets handles the version bump and publish only).

## [Unreleased]

The first pre-alpha release (`0.0.1`) will ship the initial public API surface. The package begins
its public history at `0.0.x`, per the cosyte version ladder (`0.0.x` until first alpha).

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
