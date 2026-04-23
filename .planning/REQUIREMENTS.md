# @cosyte/ccda — v1 Requirements

All requirements are user-facing behaviors a developer consuming `@cosyte/ccda` can verify. REQ-IDs are stable across phases and referenced from `ROADMAP.md` for traceability.

> **Note on REQ-ID prefixes.** Two distinct categories share the `DOC-` prefix in this file: the *Document Type & Header* group (`DOC-01..06`, listed below as the "Document Type & Header (DOC)" section) and the *Documentation* group (`DOC-01..16`, listed below as the "Documentation (DOC)" section). The Traceability table at the bottom disambiguates them as `DOC-NNh` (header) and `DOC-NNd` (documentation). ROADMAP.md uses the same disambiguation.

---

## v1 Requirements

### Project Setup & Build (SETUP)

- [ ] **SETUP-01** — Developer can run `pnpm install && pnpm build && pnpm test` from a clean clone and all three succeed.
- [ ] **SETUP-02** — Package publishes as dual ESM + CJS with a correct `exports` map; consumers on either module system resolve the right entry point.
- [ ] **SETUP-03** — Every runtime dependency declared in `package.json` is backed by an ADR in `.planning/adr/` justifying its inclusion (maintained, trusted, MIT/Apache-licensed). Total runtime deps ≤ 3.
- [ ] **SETUP-04** — TypeScript consumers get full IntelliSense (types, JSDoc, `@example` tags) on every public API surface.
- [ ] **SETUP-05** — Repo targets Node 18+ and compiles to ES2022 with `"strict": true` and `"noUncheckedIndexedAccess": true`.
- [ ] **SETUP-06** — `pnpm lint` and `pnpm typecheck` pass with zero warnings.

### Core Parsing (PARSE)

- [ ] **PARSE-01** — `parseCCDA(raw)` parses any well-formed C-CDA R2.1 XML document (string or Buffer) and returns a `CCDADocument` object.
- [ ] **PARSE-02** — Parser correctly handles XML namespaces (default `urn:hl7-org:v3`, `voc`, `sdtc`, `xsi`) regardless of prefix variation across vendors.
- [ ] **PARSE-03** — Parser preserves `<?xml-stylesheet ...?>` processing instructions and DOCTYPE (if present) for round-trip serialization.
- [ ] **PARSE-04** — Parser reads mixed-content narrative (`<text>` with interleaved text nodes and inline elements) without losing any child content.
- [ ] **PARSE-05** — Parser resolves `ID` / `IDREF` references within a document (entry → narrative `content[@ID]`) and exposes the resolution.
- [ ] **PARSE-06** — Parser decodes base64-encoded `<observationMedia>` / `<reference>` attachments on demand (raw bytes exposed; decoding is lazy to avoid memory blowup).
- [ ] **PARSE-07** — Parser handles UTF-8 with or without BOM silently (Tier 1: no warning); other declared charsets honored via the XML declaration.
- [ ] **PARSE-08** — `parseCCDA(raw, { strict: true })` runs IG-level structural validation (required templateIds, cardinality, required code bindings) and throws a typed `CCDAValidationError` aggregating all violations.

### Document Type & Header (DOC)

- [ ] **DOC-01** — `doc.type` exposes the detected document type (`ccd`, `discharge-summary`, `progress-note`, `hp`, `consultation-note`, `referral-note`, `operative-note`, `procedure-note`, `care-plan`, `diagnostic-imaging`, `unstructured-document`, `transfer-summary`, or `unknown`) derived from the document-level `templateId`.
- [ ] **DOC-02** — `doc.templateIds` exposes the raw document-level `templateId` array (root + extension), preserved in original order.
- [ ] **DOC-03** — `doc.effectiveTime`, `doc.languageCode`, `doc.title`, `doc.confidentialityCode`, `doc.setId`, `doc.versionNumber` expose the corresponding ClinicalDocument header fields as parsed, safe-access values (`undefined` when absent — never throw).
- [ ] **DOC-04** — `doc.patient` exposes: `mrn`, `identifiers[]`, `name` (parsed PN), `familyName`, `givenName`, `fullName`, `dateOfBirth` (Date), `sex`, `address` (parsed AD), `phoneNumbers[]`, `race`, `ethnicity`, `languageCommunication`. All return `undefined` / `[]` when absent.
- [ ] **DOC-05** — `doc.author[]`, `doc.custodian`, `doc.informant[]`, `doc.legalAuthenticator`, `doc.authenticator[]`, `doc.dataEnterer`, `doc.informationRecipient[]` expose header participants with names and organization; absent participants return `undefined` or `[]`.
- [ ] **DOC-06** — `doc.encounter` (nullable) exposes the document-level encompassingEncounter: `id`, `code`, `effectiveTime` (start/end), `location`, `responsibleParty`.

### Typed Model & Access (MODEL)

- [ ] **MODEL-01** — `doc.sections` returns every top-level section in document order, each typed as a `Section` wrapper.
- [ ] **MODEL-02** — `doc.section(templateId)` returns the first matching section by `templateId` (root or root+extension); `doc.section(loincCode)` returns the first matching section by LOINC code when no templateId match is found. Template match wins over code match.
- [ ] **MODEL-03** — `Section` exposes `.templateIds`, `.code` (LOINC code object), `.title`, `.text` (narrative as structured content tree), `.entries` (typed entries), `.isNullFlavor`, and `.rawXml`.
- [ ] **MODEL-04** — Entry wrappers expose the C-CDA R2.1 entry-template shapes (Problem Concern Act, Problem Observation, Medication Activity, Allergy Concern Act, Allergy–Intolerance Observation, Result Organizer, Result Observation, Vital Signs Organizer, Vital Sign Observation, Immunization Activity, Encounter Activity, Procedure Activity Act/Observation/Procedure, Social History Observation, etc.) with typed fields.
- [ ] **MODEL-05** — `doc.get('xpath-ish-path')` resolves a simplified XPath-ish path (no XPath engine) to a string or undefined for escape-hatch access to values the helpers don't cover.
- [ ] **MODEL-06** — Parsed `CCDADocument` is immutable by default; mutation is possible only via explicit methods (`setHeaderField`, `addSection`, `removeSection`, `addEntry`, `removeEntry`, `setEntryField`).
- [ ] **MODEL-07** — Mutation methods return a new `CCDADocument` (structural sharing) OR mutate in place with a `markDirty` semantic (contract decided during Phase-3 discuss); either way, mutation is reflected in subsequent reads and serialization.

### Data Types (TYPES)

- [ ] **TYPES-01** — TypeScript interfaces exist and are exported for the C-CDA / RIM composite data types actually used by the library: `CD` (coded data), `CE` / `CWE` (coded with equivalents), `II` (instance identifier, OID + extension), `AD` (address), `PN` (person name), `TEL` (telecom), `TS` / `IVL_TS` (timestamp / interval), `PQ` (physical quantity), `ED` (encapsulated data), `ST` (string), `BL` (boolean), `INT`, `REAL`, `EIVL_TS` (event-related interval).
- [ ] **TYPES-02** — `CodedValue` (our flat shape for CD/CE/CWE) exposes `code`, `codeSystem` (OID), `codeSystemName` (resolved via registry when known), `displayName`, `originalText`, and `translations[]`.
- [ ] **TYPES-03** — HL7 TS/DTM strings (`YYYYMMDDHHMMSS[.SSSS][+/-ZZZZ]`) parse to JS `Date` with valid truncations; raw string remains accessible.
- [ ] **TYPES-04** — Unparseable timestamps return `undefined` for the `Date` getter (no throw); raw remains accessible.
- [ ] **TYPES-05** — `PQ` exposes `value` (number) + `unit` (UCUM string); unparseable `value` returns `undefined` with raw preserved.
- [ ] **TYPES-06** — `II` distinguishes OID (`root` is dotted numeric), UUID (`root` is UUID), and "root + extension" forms; `mrn`-pickers prefer a recognized MRN OID registry.

### Named Helpers (HELPERS)

- [ ] **HELPERS-01** — `doc.problems.active`, `doc.problems.all`, `doc.problems.resolved` return typed arrays of problem entries with `code` (CodedValue), `name`, `status`, `onsetDate`, `resolvedDate`, `author`.
- [ ] **HELPERS-02** — `doc.medications.current`, `doc.medications.all`, `doc.medications.discontinued` return typed arrays with `medication` (CodedValue), `name`, `dose`, `route`, `frequency`, `effectiveTime` (start/end), `status`, `prescriber`.
- [ ] **HELPERS-03** — `doc.allergies` returns a typed array with `substance` (CodedValue), `reaction`, `severity`, `status`, `onsetDate`.
- [ ] **HELPERS-04** — `doc.immunizations` returns a typed array with `vaccine` (CodedValue, CVX-resolved when OID matches), `administeredDate`, `dose`, `route`, `lotNumber`, `manufacturer`, `status`.
- [ ] **HELPERS-05** — `doc.results.recent`, `doc.results.all` return typed arrays of result observations grouped by organizer, with `code`, `value` (typed by valueType), `units`, `referenceRange`, `interpretationCode`, `effectiveTime`, `status`.
- [ ] **HELPERS-06** — `doc.vitals.latest`, `doc.vitals.all` return typed vital-sign observations (typical panel: systolic BP, diastolic BP, heart rate, respiratory rate, temperature, SpO2, weight, height, BMI) with `code`, `value` (PQ), `effectiveTime`.
- [ ] **HELPERS-07** — `doc.encounters` returns a typed array with `code`, `diagnoses[]`, `location`, `provider`, `effectiveTime` (start/end), `dischargeDisposition`.
- [ ] **HELPERS-08** — `doc.procedures` returns a typed array with `code` (CodedValue), `name`, `performedDate`, `performer`, `targetSite`, `status`.
- [ ] **HELPERS-09** — `doc.socialHistory.smoking` (nullable) + `doc.socialHistory.observations[]` expose social-history observations, including the Smoking Status Meaningful-Use entry when present.
- [ ] **HELPERS-10** — All helpers return `undefined` / empty arrays for missing optional data; never throw.

### Narrative ↔ Entry Reconciliation (NARR)

- [ ] **NARR-01** — `section.text` exposes the narrative as a structured content tree (paragraphs, tables, lists, `<content ID="...">` spans, inline HTML-like elements) — not a flat string.
- [ ] **NARR-02** — `section.reconcile()` (or equivalent) walks entries and matches their `text/reference[@value]` IDREFs to narrative `content[@ID]` elements; result exposes `matchedEntries`, `unmatchedEntries`, `orphanNarrative`.
- [ ] **NARR-03** — When an entry's reconciled narrative text conflicts with its structured value (e.g. medication dose in narrative differs from `<doseQuantity>`), `CCDA_NARRATIVE_ENTRY_MISMATCH` fires with both values and positional context.
- [ ] **NARR-04** — Narrative is preserved verbatim on parse and emitted verbatim on serialize; the library never rewrites narrative content from structured entries.

### Real-World Tolerance & Warnings (TOL)

- [ ] **TOL-01** — Default parse mode is lenient; `{ strict: true }` escalates every Tier 2 warning to a thrown `CCDAValidationError` aggregating all violations with their codes and positional context.
- [ ] **TOL-02** — Tier 3 fatal errors throw `CCDAParseError` with stable codes even in lenient mode: `NOT_XML`, `NO_CLINICAL_DOCUMENT_ROOT`, `INVALID_NAMESPACE`, `EMPTY_INPUT`. Each error includes `message`, `position` (line/column), `snippet`.
- [ ] **TOL-03** — Parser emits Tier 2 warnings with stable codes and XPath-ish positional context for defined scenarios: `CCDA_MISSING_TEMPLATE_ID`, `CCDA_UNKNOWN_TEMPLATE_ID`, `CCDA_NARRATIVE_ONLY_SECTION`, `CCDA_NARRATIVE_ENTRY_MISMATCH`, `CCDA_UNRESOLVED_IDREF`, `CCDA_OID_NOT_RECOGNIZED`, `CCDA_CODE_SYSTEM_MISMATCH`, `CCDA_NULLFLAVOR_IN_REQUIRED_FIELD`, `CCDA_MIXED_CONTENT_DEVIATION`, `CCDA_NAMESPACE_PREFIX_VARIATION`, `CCDA_EMBEDDED_HTML_IN_NARRATIVE`, `CCDA_BASE64_ATTACHMENT_PRESENT`, `CCDA_CARDINALITY_VIOLATION`, `CCDA_REQUIRED_BINDING_MISSING`, `CCDA_TIMESTAMP_FALLBACK_FORMAT`.
- [ ] **TOL-04** — `doc.warnings` is always an array of `CCDAParseWarning` objects (possibly empty) on a parsed document.
- [ ] **TOL-05** — `onWarning` callback option is invoked for every warning as it is emitted.
- [ ] **TOL-06** — `doc.issues` (IG-validation issues under strict mode, or when `{ validate: true }` is passed without `strict`) separates IG-cardinality / required-binding issues from parser-level warnings.

### Serialization & Round-Trip (SER)

- [ ] **SER-01** — `doc.toString()` produces namespace-clean, canonical C-CDA R2.1 XML regardless of quirks in the input (Postel's Law: conservative emitter). Stylesheet processing instructions preserved.
- [ ] **SER-02** — Round-trip `parse → toString → parse` yields a structurally equivalent `CCDADocument` for every canonical fixture.
- [ ] **SER-03** — `doc.toJSON()` returns a structured JSON representation of the full document (header + sections + entries).
- [ ] **SER-04** — `doc.prettyPrint()` returns a human-readable multi-line summary for logging/debugging (header + per-section entry counts + top helper rollups).
- [ ] **SER-05** — `buildDocument({type, patient, ...}).addSection(...).addEntry(...).toString()` constructs a valid outbound C-CDA document for tests and small tools.

### Templates (TPL)

- [ ] **TPL-01** — Built-in C-CDA R2.1 section templates (Problem Section, Medications Section, Allergies Section, Immunizations Section, Results Section, Vital Signs Section, Encounters Section, Procedures Section, Social History Section, Plan of Treatment Section, Assessment Section, plus the rest of the R2.1 core set) ship and are authored via the public `defineTemplate()` API.
- [ ] **TPL-02** — Built-in C-CDA R2.1 entry templates (Problem Concern Act + Problem Observation, Medication Activity + Medication Information, Allergy Concern Act + Allergy–Intolerance Observation, Result Organizer + Result Observation, Vital Signs Organizer + Vital Sign Observation, Immunization Activity, Encounter Activity, Procedure Activity variants, Social History Observation + Smoking Status, Care Plan Goal/Intervention) ship and are authored via the public `defineTemplate()` API.
- [ ] **TPL-03** — `defineTemplate({ name, templateId, extension?, parse, entryShape? })` registers a template; duplicate registration throws `TemplateDefinitionError` unless `{ override: true }` is set.
- [ ] **TPL-04** — The built-in template registry composes with developer-registered templates; developer-registered takes precedence on override.
- [ ] **TPL-05** — Recognizing a template is a pure lookup against `templateId` (root + optional `@extension`); LOINC code is a fallback only.

### Profiles (PROF)

- [ ] **PROF-01** — `defineProfile({ name, ...options })` returns a valid `Profile` object; name is required.
- [ ] **PROF-02** — `defineProfile()` throws `ProfileDefinitionError` with a clear message for invalid input: bad option shapes, duplicate custom OIDs, unknown option keys.
- [ ] **PROF-03** — `extends: parentProfile` and `extends: [p1, p2]` inherit and compose options; merge semantics documented (scalars overwrite, arrays concat+dedupe, `oidRegistry` / `customTemplates` deep-merge per key, `onWarning` handlers chain).
- [ ] **PROF-04** — `profile.name`, `profile.description`, `profile.oidRegistry`, `profile.customTemplates`, `profile.lineage` are readonly and reflect applied options.
- [ ] **PROF-05** — `profile.describe()` returns a non-empty human-readable summary containing the profile name.
- [ ] **PROF-06** — `parseCCDA(raw, profile)` applies profile behavior to the parse; `doc.profile?.name` and `doc.profile?.lineage` are set on the parsed document.
- [ ] **PROF-07** — Profile-registered OIDs extend the code-system resolver (so `codeSystemName` resolves for HIE-local OIDs); profile-registered custom templates extend the template registry for that parse.
- [ ] **PROF-08** — `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` manage a process-scoped default; explicit argument overrides; `parseCCDA(raw, { profile: null })` opts out for one call.
- [ ] **PROF-09** — Round-trip: a document parsed with a custom profile and re-serialized produces namespace-clean C-CDA (profile quirks affect parsing, not serialization).

### Built-in Profiles (BIP)

- [ ] **BIP-01** — `profiles.epic` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-02** — `profiles.cerner` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-03** — `profiles.meditech` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-04** — `profiles.athena` ships and is authored via the public `defineProfile()` API.
- [ ] **BIP-05** — `profiles.generic` ships and is authored via the public `defineProfile()` API as the broad-vendor fallback.
- [ ] **BIP-06** — Each built-in profile reduces warnings on a realistic vendor-shape fixture versus lenient mode without a profile.

### Coded Values & OID Registry (CODE)

- [ ] **CODE-01** — Built-in OID registry recognizes at least: SNOMED CT (`2.16.840.1.113883.6.96`), LOINC (`2.16.840.1.113883.6.1`), RxNorm (`2.16.840.1.113883.6.88`), ICD-10-CM (`2.16.840.1.113883.6.90`), ICD-10-PCS (`2.16.840.1.113883.6.4`), CPT-4 (`2.16.840.1.113883.6.12`), CVX (`2.16.840.1.113883.12.292`), UCUM (`2.16.840.1.113883.6.8`), NDC (`2.16.840.1.113883.6.69`), HL7 Administrative Gender, Marital Status, Race Category, Ethnicity (HL7-maintained).
- [ ] **CODE-02** — `CodedValue.codeSystemName` resolves via the OID registry when the OID is recognized; unresolved OIDs emit `CCDA_OID_NOT_RECOGNIZED` and leave `codeSystemName` undefined.
- [ ] **CODE-03** — `defineProfile({ oidRegistry: { ... } })` extends the registry for the scope of parses using that profile.

### Testing & Fixtures (TEST)

- [ ] **TEST-01** — `pnpm test --coverage` reports ≥ 90% line coverage on `src/parser/`, `src/model/`, `src/templates/`, and `src/helpers/`.
- [ ] **TEST-02** — Canonical fixtures exist and round-trip losslessly for: CCD, Discharge Summary, Progress Note, H&P, Consultation Note, Referral Note, Operative Note, Procedure Note, Care Plan, Diagnostic Imaging, Unstructured Document, Transfer Summary. Each fixture is minimal but IG-valid.
- [ ] **TEST-03** — Edge-case fixtures cover: BOM / no-BOM, Windows vs Unix line endings, `<?xml-stylesheet?>`-present vs absent, namespace-prefix variation (`cda:` vs default), mixed-content narrative (text + inline elements + tables), embedded HTML in narrative, base64 `<observationMedia>` attachment, null-flavor in required fields, unknown templateId, narrative-only section (no entries), unresolved IDREF, OID with unknown code system, cardinality violation in strict mode.
- [ ] **TEST-04** — Malformed documents throw `CCDAParseError` with descriptive position/snippet (not XML, no `<ClinicalDocument>` root, wrong namespace, empty input).
- [ ] **TEST-05** — `test/fixtures/vendor-quirks/` contains at least one fixture per Tier 2 scenario listed in TOL-03, each verified to emit the expected warning and still parse in lenient mode.
- [ ] **TEST-06** — Strict-mode escalation test: every Tier 2 vendor-quirks fixture throws `CCDAValidationError` under `{ strict: true }`.
- [ ] **TEST-07** — At least one fixture per built-in profile (`epic`, `cerner`, `meditech`, `athena`, `generic`) demonstrates fewer warnings with the profile than without.
- [ ] **TEST-08** — Profile-authoring test suite covers: valid `defineProfile` output; `ProfileDefinitionError` cases; `extends` single + array; merge semantics per option category; default-profile set/get/opt-out; `profile.describe()`; `doc.profile` attribution; round-trip with custom profile.
- [ ] **TEST-09** — Template-authoring test suite covers: valid `defineTemplate` output; duplicate-registration throw + override; developer override of a built-in template; template lookup by templateId vs LOINC fallback.

### Examples (EX)

- [ ] **EX-01** — `examples/extract-problem-list.ts` runs end-to-end and demonstrates the named-helper access path (`doc.problems.active`).
- [ ] **EX-02** — `examples/build-allergy-summary.ts` runs end-to-end and demonstrates iterating `doc.allergies` and formatting a human-readable summary.
- [ ] **EX-03** — `examples/validate-against-ig.ts` runs end-to-end and demonstrates `{ strict: true }` / `{ validate: true }` + iterating `doc.issues`.

### Profile Starter Kit (KIT)

- [ ] **KIT-01** — `examples/profile-starter-kit/` exists and contains every file listed in the spec's deliverable list (package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, eslint.config.js, .prettierrc.json, src/index.ts, test/profile.test.ts, test/fixtures/sample.xml, README.md, CUSTOMIZING.md, LICENSE, .github/workflows/ci.yml, .github/workflows/publish.yml, .gitignore).
- [ ] **KIT-02** — Running `pnpm install && pnpm test` inside the starter kit succeeds against its sample fixture.
- [ ] **KIT-03** — `pnpm build` inside the starter kit produces a `dist/` with correct entry points matching `package.json` exports.
- [ ] **KIT-04** — `.github/workflows/ci.yml` and `publish.yml` are syntactically valid (verified by `actionlint` or equivalent).
- [ ] **KIT-05** — Starter-kit `package.json` has correct `peerDependencies` on `@cosyte/ccda`, `publishConfig: { access: public }`, `files: [dist, ...]`, and working `build`/`test`/`lint` scripts.
- [ ] **KIT-06** — `CUSTOMIZING.md` walks through rename → swap base profile → register OIDs / custom templates → write fixtures → publish.
- [ ] **KIT-07** — Starter-kit README uses `{{YOUR_ORG}}` / `{{PROFILE_NAME}}` placeholders consistently.

### Documentation (DOC)

- [ ] **DOC-01** — README renders cleanly on GitHub and npm with the one-sentence value prop as the first line, followed by badges.
- [ ] **DOC-02** — README contains a 30-second quickstart (install + parse + extract the patient's active problems) in one copy-pasteable block.
- [ ] **DOC-03** — README has a feature list (6–8 bullets) highlighting developer-centric wins.
- [ ] **DOC-04** — README has a "C-CDA in 90 seconds" core-concepts section (ClinicalDocument → header + body; body = sections; sections have narrative + entries; templateId identifies structure; LOINC code identifies purpose).
- [ ] **DOC-05** — README covers the three access patterns (named helpers / template-aware section access / raw document model) with runnable examples.
- [ ] **DOC-06** — README Cookbook section contains recipes: extract problem list, build allergy summary, list current medications, pull the latest vitals panel, iterate immunizations, resolve a CodedValue through the OID registry, handle narrative ↔ entry mismatch, validate against the IG, register a custom Z-template via `defineTemplate`, author your first profile, extend a profile, publish a profile package, round-trip a document after modification.
- [ ] **DOC-07** — README has a top-level "Templates & Profiles" section covering template authoring, profile authoring, merge semantics, inspection, publishing — not buried in API reference.
- [ ] **DOC-08** — README "Real-World Tolerance" section explains the 3-tier deviation model (silent / warn / fatal) with a compact table and a runnable warnings-iteration example.
- [ ] **DOC-09** — README "Error Handling" section covers `CCDAParseError`, `CCDAParseWarning`, `CCDAValidationError`, `ProfileDefinitionError`, `TemplateDefinitionError` with examples.
- [ ] **DOC-10** — README "Contributing" section points to `CONTRIBUTING.md` and invites vendor-quirk fixtures, template improvements, and standalone profile packages.
- [ ] **DOC-11** — README ends with "Built by [Cosyte](https://cosyte.com)" and a license link; cross-links to sibling package `@cosyte/hl7`.
- [ ] **DOC-12** — Roadmap / stretch-goals section documents the v2 deferrals (R1.1 support, Schematron validation, XMLDSig verification, PDF stylesheet rendering, FHIR conversion, DICOM SR ingestion, streaming parser).
- [ ] **DOC-13** — "Publishing Your Profile" recipe links directly to `examples/profile-starter-kit/` and references `CUSTOMIZING.md`.
- [ ] **DOC-14** — `CHANGELOG.md` exists in Keep-a-Changelog format with an `[Unreleased]` section.
- [ ] **DOC-15** — `LICENSE` (MIT) exists at repo root.
- [ ] **DOC-16** — One ADR per runtime dependency exists under `.planning/adr/` (at minimum: the chosen XML parser); each ADR states the decision, alternatives considered, licensing, maintenance signals, and the bar it cleared.

---

## v2 Requirements (Deferred)

- C-CDA R1.1 support
- Schematron validation against official Schematron artifacts
- XMLDSig digital-signature verification
- PDF rendering of stylesheet output
- FHIR conversion bridge (`@cosyte/ccda-to-fhir`)
- DICOM SR ingestion
- Streaming parser for very large documents
- JSON Schema / Zod emission for `toJSON()` output
- Typed document-type overlays (`doc.is('ccd')` narrows to `CCDDocument`)

## Out of Scope

- Plain CDA R2 documents that are not C-CDA-conformant — we're a C-CDA library, not a general CDA library
- HL7 v3 messaging — different spec family
- FHIR conversion — future companion package
- Exhaustive coded-value validation against full terminologies — we validate structure and known OIDs, not every SNOMED/LOINC table

---

## Traceability

Every v1 REQ-ID maps to exactly one phase in `ROADMAP.md`. **116 / 116 mapped** (no orphans, no duplicates).

The `DOC-` prefix is reused for two distinct categories. To disambiguate, header rows below carry the `h` suffix (`DOC-NNh`) and documentation rows the `d` suffix (`DOC-NNd`). The unsuffixed form remains in the requirement bodies above; ROADMAP.md uses the same suffixed form.

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SETUP-01 | Phase 1 — Project Foundation & XML Parser ADR | Pending |
| SETUP-02 | Phase 1 — Project Foundation & XML Parser ADR | Pending |
| SETUP-03 | Phase 1 — Project Foundation & XML Parser ADR | Pending |
| SETUP-04 | Phase 1 — Project Foundation & XML Parser ADR | Pending |
| SETUP-05 | Phase 1 — Project Foundation & XML Parser ADR | Pending |
| SETUP-06 | Phase 1 — Project Foundation & XML Parser ADR | Pending |
| DOC-15d | Phase 1 — Project Foundation & XML Parser ADR | Pending |
| DOC-16d | Phase 1 — Project Foundation & XML Parser ADR | Pending |
| PARSE-01 | Phase 2 — Core XML Parser & Tolerance | Pending |
| PARSE-02 | Phase 2 — Core XML Parser & Tolerance | Pending |
| PARSE-03 | Phase 2 — Core XML Parser & Tolerance | Pending |
| PARSE-04 | Phase 2 — Core XML Parser & Tolerance | Pending |
| PARSE-05 | Phase 2 — Core XML Parser & Tolerance | Pending |
| PARSE-06 | Phase 2 — Core XML Parser & Tolerance | Pending |
| PARSE-07 | Phase 2 — Core XML Parser & Tolerance | Pending |
| PARSE-08 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-01 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-02 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-03 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-04 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-05 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-06 | Phase 2 — Core XML Parser & Tolerance | Pending |
| DOC-01h | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| DOC-02h | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| DOC-03h | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| DOC-04h | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| DOC-05h | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| DOC-06h | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| MODEL-01 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| MODEL-02 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| MODEL-03 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| MODEL-04 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| MODEL-05 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| MODEL-06 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| MODEL-07 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| TYPES-01 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| TYPES-02 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| TYPES-03 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| TYPES-04 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| TYPES-05 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| TYPES-06 | Phase 3 — Document Header, Typed Model & Data Types | Pending |
| TPL-01 | Phase 4 — Templates, Sections & Coded Values | Pending |
| TPL-02 | Phase 4 — Templates, Sections & Coded Values | Pending |
| TPL-03 | Phase 4 — Templates, Sections & Coded Values | Pending |
| TPL-04 | Phase 4 — Templates, Sections & Coded Values | Pending |
| TPL-05 | Phase 4 — Templates, Sections & Coded Values | Pending |
| CODE-01 | Phase 4 — Templates, Sections & Coded Values | Pending |
| CODE-02 | Phase 4 — Templates, Sections & Coded Values | Pending |
| CODE-03 | Phase 4 — Templates, Sections & Coded Values | Pending |
| HELPERS-01 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-02 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-03 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-04 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-05 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-06 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-07 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-08 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-09 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-10 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| NARR-01 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| NARR-02 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| NARR-03 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| NARR-04 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| SER-01 | Phase 6 — Serialization & Round-Trip | Pending |
| SER-02 | Phase 6 — Serialization & Round-Trip | Pending |
| SER-03 | Phase 6 — Serialization & Round-Trip | Pending |
| SER-04 | Phase 6 — Serialization & Round-Trip | Pending |
| SER-05 | Phase 6 — Serialization & Round-Trip | Pending |
| PROF-01 | Phase 7 — Profile System & Built-ins | Pending |
| PROF-02 | Phase 7 — Profile System & Built-ins | Pending |
| PROF-03 | Phase 7 — Profile System & Built-ins | Pending |
| PROF-04 | Phase 7 — Profile System & Built-ins | Pending |
| PROF-05 | Phase 7 — Profile System & Built-ins | Pending |
| PROF-06 | Phase 7 — Profile System & Built-ins | Pending |
| PROF-07 | Phase 7 — Profile System & Built-ins | Pending |
| PROF-08 | Phase 7 — Profile System & Built-ins | Pending |
| PROF-09 | Phase 7 — Profile System & Built-ins | Pending |
| BIP-01 | Phase 7 — Profile System & Built-ins | Pending |
| BIP-02 | Phase 7 — Profile System & Built-ins | Pending |
| BIP-03 | Phase 7 — Profile System & Built-ins | Pending |
| BIP-04 | Phase 7 — Profile System & Built-ins | Pending |
| BIP-05 | Phase 7 — Profile System & Built-ins | Pending |
| BIP-06 | Phase 7 — Profile System & Built-ins | Pending |
| TEST-01 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-02 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-03 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-04 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-05 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-06 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-07 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-08 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-09 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| EX-01 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| EX-02 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| EX-03 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| KIT-01 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| KIT-02 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| KIT-03 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| KIT-04 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| KIT-05 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| KIT-06 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| KIT-07 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-01d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-02d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-03d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-04d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-05d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-06d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-07d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-08d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-09d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-10d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-11d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-12d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-13d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-14d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |

**Coverage:** 116 / 116 v1 REQ-IDs mapped.

Per-phase totals:
- Phase 1: 8 (SETUP × 6 + DOC-15d + DOC-16d)
- Phase 2: 14 (PARSE × 8 + TOL × 6)
- Phase 3: 19 (DOC-h × 6 + MODEL × 7 + TYPES × 6)
- Phase 4: 8 (TPL × 5 + CODE × 3)
- Phase 5: 14 (HELPERS × 10 + NARR × 4)
- Phase 6: 5 (SER × 5)
- Phase 7: 15 (PROF × 9 + BIP × 6)
- Phase 8: 33 (TEST × 9 + EX × 3 + KIT × 7 + DOC-d × 14)
- **Total:** 116

---

*Last updated: 2026-04-22 (initial mapping by roadmapper).*
