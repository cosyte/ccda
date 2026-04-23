# @cosyte/ccda — Roadmap (v1)

North star: **A developer can parse a real-world, vendor-quirky C-CDA document and pull useful sections out of it in one line — without having read the C-CDA Implementation Guide.**

- **Granularity:** standard (8 phases, 3–5 plans each anticipated)
- **Mode:** yolo (auto-advance enabled)
- **Parallelization:** enabled — plans within a phase may run in parallel where they touch disjoint modules
- **Coverage:** 116/116 v1 REQ-IDs mapped to exactly one phase

> **Note on REQ-ID prefixes.** REQUIREMENTS.md uses the `DOC-` prefix for two distinct categories: the *Document Type & Header* group (`DOC-01..06` in the "Document Type & Header (DOC)" section) and the *Documentation* group (`DOC-01..16` in the "Documentation (DOC)" section). Throughout this roadmap, header IDs are referenced as `DOC-01h..DOC-06h` and documentation IDs as `DOC-01d..DOC-16d` to avoid collision. The Traceability table in REQUIREMENTS.md uses the same disambiguation.

---

## Phases

- [ ] **Phase 1: Project Foundation & XML Parser ADR** — Scaffold the repo (build, lint, test, dual ESM+CJS, strict TS) AND lock the XML-parser runtime-dep choice via ADR before any parser code is written.
- [ ] **Phase 2: Core XML Parser & Tolerance** — `parseCCDA(raw)` decodes well-formed C-CDA R2.1 XML (namespaces, mixed content, IDREF, base64, BOM, processing instructions) with lenient default + strict mode + warnings/errors registry.
- [ ] **Phase 3: Document Header, Typed Model & Data Types** — `doc.type` / `doc.patient` / header participants + immutable typed `CCDADocument` model + RIM-derived composite data types (CD, II, AD, PN, TS, PQ, ED, etc.).
- [ ] **Phase 4: Templates, Sections & Coded Values** — Built-in template registry (`defineTemplate()`), template-first / LOINC-fallback section access, OID registry, `CodedValue` resolution.
- [ ] **Phase 5: Named Helpers & Narrative Reconciliation** — One-line DX (`doc.problems.active`, `doc.medications.current`, `doc.allergies`, etc.) + narrative-content tree + entry↔narrative IDREF reconciliation with mismatch warnings.
- [ ] **Phase 6: Serialization & Round-Trip** — `doc.toString()`, `doc.toJSON()`, `doc.prettyPrint()`, `buildDocument(...)` produce namespace-clean canonical C-CDA R2.1 XML and preserve semantics across parse → mutate → serialize → parse.
- [ ] **Phase 7: Profile System & Built-ins** — `defineProfile()` API with merge/extend semantics + 5 built-in vendor profiles (epic, cerner, meditech, athena, generic).
- [ ] **Phase 8: Testing Hardening, Examples, Starter Kit & Documentation** — Canonical/edge-case/vendor-quirk/profile-authoring tests at ≥ 90% line coverage, 3 runnable examples, publishable profile starter kit, and the complete README + ancillary docs.

---

## Phase Details

### Phase 1: Project Foundation & XML Parser ADR
**Goal**: A developer cloning the repo can install, build, typecheck, lint, and test with a single command sequence; downstream phases never have to revisit tooling AND never have to re-litigate the XML-parser choice — the ADR is on disk before any parser code is written.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, DOC-15d, DOC-16d
**Success Criteria** (what must be TRUE):
  1. A developer can run `pnpm install && pnpm build && pnpm typecheck && pnpm lint && pnpm test` from a clean clone and every command exits 0 with zero warnings.
  2. A developer importing the package from an ESM project and another from a CJS project both resolve the correct entry through the `exports` map and receive typed IntelliSense.
  3. A developer inspecting `package.json` sees `"type": "module"`, dual-build artifacts declared, Node 18+ engines field, and every entry under `dependencies` justified by an ADR under `.planning/adr/` (total runtime deps ≤ 3).
  4. A developer opens `.planning/adr/0001-xml-parser.md` and sees a committed Architecture Decision Record naming the chosen XML parser (one of `fast-xml-parser`, `sax`, `@xmldom/xmldom`, `libxmljs2`), the alternatives considered, the licensing/maintenance signals each cleared, and the bar (namespace + mixed-content + IDREF support, MIT/Apache-licensed, actively maintained, broadly trusted) — and zero parser source files exist outside of stubs.
  5. A developer editing any `.ts` file gets strict-mode errors for `any`, unchecked index access, and missing types from their editor immediately; LICENSE (MIT) is at repo root.
**Plans**: 4 plans
**UI hint**: no

### Phase 2: Core XML Parser & Tolerance
**Goal**: A developer calling `parseCCDA(raw)` on any well-formed C-CDA R2.1 XML document — including vendor-quirky input — receives a structurally correct parse result with stable, positional warnings surfaced for every known deviation, and structurally corrupt input throws typed fatal errors with line/column/snippet context.
**Depends on**: Phase 1
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04, PARSE-05, PARSE-06, PARSE-07, PARSE-08, TOL-01, TOL-02, TOL-03, TOL-04, TOL-05, TOL-06
**Success Criteria** (what must be TRUE):
  1. A developer can parse a well-formed C-CDA R2.1 document supplied as a string or Buffer (UTF-8, with or without BOM) and receive a `CCDADocument` whose XML namespaces (default `urn:hl7-org:v3`, `voc`, `sdtc`, `xsi`) are correctly resolved regardless of vendor prefix variation.
  2. A developer parsing a document with mixed-content narrative, `<?xml-stylesheet?>` processing instructions, intra-document `ID`/`IDREF` references, or base64-encoded `<observationMedia>` attachments sees every child node preserved, processing instructions retained for round-trip, IDREF resolutions exposed, and base64 payloads exposed lazily as raw bytes (not eagerly decoded).
  3. A developer parsing a document with a known Tier 2 deviation (missing templateId, unknown templateId, narrative-only section, unresolved IDREF, OID not in registry, mixed-content deviation, namespace prefix variation, embedded HTML in narrative, base64 attachment, etc.) gets a parsed document in lenient mode plus `doc.warnings` entries with stable codes and XPath-ish positional context — and receives `onWarning` callbacks as they are emitted.
  4. A developer parsing a structurally corrupt document (not XML, no `<ClinicalDocument>` root, invalid namespace, empty input) receives a thrown `CCDAParseError` with a stable code (`NOT_XML`, `NO_CLINICAL_DOCUMENT_ROOT`, `INVALID_NAMESPACE`, `EMPTY_INPUT`), `position` (line/column), and `snippet` — even in lenient mode.
  5. A developer opting into `parseCCDA(raw, { strict: true })` gets every Tier 2 deviation aggregated and thrown as a typed `CCDAValidationError` carrying all violation codes and positional contexts.
**Plans**: 5 plans
**UI hint**: no

### Phase 3: Document Header, Typed Model & Data Types
**Goal**: A developer accessing a parsed `CCDADocument` can navigate the header (`doc.type`, `doc.patient`, `doc.author[]`, `doc.encounter`, etc.) and the body (`doc.sections`, `doc.section(templateId|loinc)`, entries) by typed accessors, receive parsed RIM composite data types (CD, II, AD, PN, TS, PQ, ED, etc.) on every field, and mutate the document only via explicit methods.
**Depends on**: Phase 2
**Requirements**: DOC-01h, DOC-02h, DOC-03h, DOC-04h, DOC-05h, DOC-06h, MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-07, TYPES-01, TYPES-02, TYPES-03, TYPES-04, TYPES-05, TYPES-06
**Success Criteria** (what must be TRUE):
  1. A developer can read `doc.type` (one of the 12 C-CDA document types or `'unknown'`), `doc.templateIds`, `doc.effectiveTime`, `doc.languageCode`, `doc.title`, `doc.confidentialityCode`, `doc.setId`, and `doc.versionNumber` on any parsed document; absent fields return `undefined` and never throw.
  2. A developer can read `doc.patient.mrn`, `doc.patient.fullName`, `doc.patient.dateOfBirth` (parsed `Date`), `doc.patient.address`, and the rest of the patient contract — plus `doc.author[]`, `doc.custodian`, `doc.informant[]`, `doc.legalAuthenticator`, `doc.authenticator[]`, `doc.dataEnterer`, `doc.informationRecipient[]`, and `doc.encounter` (nullable) — on any document with the corresponding header participants; absent participants return `undefined` or `[]`.
  3. A developer can call `doc.sections` to iterate every top-level section in document order, `doc.section(templateId)` for primary template lookup (root or root+extension), `doc.section(loincCode)` for LOINC-fallback lookup, and `doc.get('xpath-ish-path')` as an escape hatch for values the helpers don't cover. Template match always wins over code match.
  4. A developer importing the library receives typed interfaces for every C-CDA / RIM composite type used by the library: `CD`, `CE`, `CWE`, `II`, `AD`, `PN`, `TEL`, `TS`, `IVL_TS`, `EIVL_TS`, `PQ`, `ED`, `ST`, `BL`, `INT`, `REAL`. `CodedValue` exposes `code`, `codeSystem`, `codeSystemName`, `displayName`, `originalText`, `translations[]`. Unparseable timestamps and quantities return `undefined` for the typed getter (no throw); raw string remains accessible.
  5. A developer mutating a document via `setHeaderField`, `addSection`, `removeSection`, `addEntry`, `removeEntry`, or `setEntryField` sees changes reflected on subsequent reads and serialization; direct property mutation on an unwrapped node has no effect (immutability by default — the mutation contract, structural-sharing vs `markDirty`, is decided in this phase's discuss step).
**Plans**: 5 plans
**UI hint**: no

### Phase 4: Templates, Sections & Coded Values
**Goal**: A developer can rely on a built-in template registry (covering the C-CDA R2.1 core section + entry templates) authored through the public `defineTemplate()` API, with lookup by `templateId` (root + optional `@extension`) primary and LOINC code fallback, and on a built-in OID registry (SNOMED, LOINC, RxNorm, ICD-10, CPT, CVX, UCUM, NDC, HL7-maintained) that resolves `codeSystemName` on every `CodedValue`.
**Depends on**: Phase 3
**Requirements**: TPL-01, TPL-02, TPL-03, TPL-04, TPL-05, CODE-01, CODE-02, CODE-03
**Success Criteria** (what must be TRUE):
  1. A developer importing the library receives the C-CDA R2.1 built-in section templates (Problem Section, Medications Section, Allergies Section, Immunizations Section, Results Section, Vital Signs Section, Encounters Section, Procedures Section, Social History Section, Plan of Treatment Section, Assessment Section, plus the rest of the R2.1 core set) and entry templates (Problem Concern Act + Problem Observation, Medication Activity + Medication Information, Allergy Concern Act + Allergy–Intolerance Observation, Result Organizer + Result Observation, Vital Signs Organizer + Vital Sign Observation, Immunization Activity, Encounter Activity, Procedure Activity variants, Social History Observation + Smoking Status, Care Plan Goal/Intervention) — all authored via the public `defineTemplate()` API.
  2. A developer calling `defineTemplate({ name, templateId, extension?, parse, entryShape? })` registers a new template; duplicate registration throws `TemplateDefinitionError` unless `{ override: true }` is set, and developer-registered templates take precedence over built-ins on override.
  3. A developer accessing a section sees template lookup performed against `templateId` (root + optional `@extension`) as a pure registry lookup; LOINC code is a fallback only and never wins over a template match.
  4. A developer reading any `CodedValue` whose OID is in the built-in registry (SNOMED CT, LOINC, RxNorm, ICD-10-CM, ICD-10-PCS, CPT-4, CVX, UCUM, NDC, HL7 Administrative Gender / Marital Status / Race Category / Ethnicity) sees `codeSystemName` resolved automatically; OIDs not in the registry leave `codeSystemName` undefined and emit `CCDA_OID_NOT_RECOGNIZED`.
  5. A developer registering custom OIDs via `defineProfile({ oidRegistry: { ... } })` sees those OIDs resolve through the registry for the scope of parses using that profile (full profile system lands in Phase 7 — this phase delivers the registry plumbing the profile system extends).
**Plans**: 4 plans
**UI hint**: no

### Phase 5: Named Helpers & Narrative Reconciliation
**Goal**: A developer can fulfill the north star — one-line extraction of common C-CDA fields — through `doc.problems.active`, `doc.medications.current`, `doc.allergies`, `doc.immunizations`, `doc.results.recent`, `doc.vitals.latest`, `doc.encounters`, `doc.procedures`, `doc.socialHistory.smoking`, etc. — and can walk the narrative content tree, reconcile entry IDREFs against narrative `content[@ID]` spans, and surface mismatches as `CCDA_NARRATIVE_ENTRY_MISMATCH` warnings without ever silently rewriting narrative.
**Depends on**: Phase 4
**Requirements**: HELPERS-01, HELPERS-02, HELPERS-03, HELPERS-04, HELPERS-05, HELPERS-06, HELPERS-07, HELPERS-08, HELPERS-09, HELPERS-10, NARR-01, NARR-02, NARR-03, NARR-04
**Success Criteria** (what must be TRUE):
  1. A developer can read `doc.problems.active`, `doc.medications.current`, `doc.allergies`, `doc.immunizations`, `doc.results.recent`, `doc.vitals.latest`, `doc.encounters`, `doc.procedures`, and `doc.socialHistory.smoking` in one line each and receive typed arrays / objects with the documented field shapes (CodedValue, parsed dates, units, status, performer/prescriber, etc.).
  2. A developer accessing any helper on a document missing the corresponding section receives `undefined` (nullable helpers) or `[]` (collection helpers) and never sees a thrown exception.
  3. A developer accessing `section.text` sees the narrative as a structured content tree (paragraphs, tables, lists, `<content ID="...">` spans, inline HTML-like elements) — not a flat string — and that narrative is byte-for-byte preserved on serialize (the library never rewrites narrative content from structured entries).
  4. A developer calling `section.reconcile()` on any section with entries receives `matchedEntries`, `unmatchedEntries`, and `orphanNarrative` keyed off `text/reference[@value]` IDREFs against narrative `content[@ID]` elements; entries whose reconciled narrative text disagrees with their structured value emit `CCDA_NARRATIVE_ENTRY_MISMATCH` with both values and positional context.
  5. A developer iterating `doc.warnings` after a parse-with-reconciliation sees `CCDA_UNRESOLVED_IDREF` for entries whose `text/reference[@value]` does not match any narrative `content[@ID]`, and the corresponding entry is still surfaced via the helpers (lenient default).
**Plans**: 5 plans
**UI hint**: no

### Phase 6: Serialization & Round-Trip
**Goal**: A developer can take a parsed, mutated, or constructed `CCDADocument` and emit namespace-clean canonical C-CDA R2.1 XML — or a JSON / pretty-printed view — such that parse → modify → serialize → parse yields a structurally equivalent document. Postel's Law: parser is liberal, serializer is conservative.
**Depends on**: Phase 3, Phase 5
**Requirements**: SER-01, SER-02, SER-03, SER-04, SER-05
**Success Criteria** (what must be TRUE):
  1. A developer calling `doc.toString()` on any parsed document (including vendor-quirky input) receives namespace-clean, canonical C-CDA R2.1 XML with stylesheet processing instructions preserved and no leaked namespace-prefix or mixed-content quirks.
  2. A developer running `parseCCDA(doc.toString())` on every canonical fixture receives a `CCDADocument` structurally equivalent to the original (same header, sections, entries, narrative).
  3. A developer calling `doc.toJSON()` receives a structured JSON representation of the full document (header + sections + entries) suitable for snapshotting or cross-process transport, and `doc.prettyPrint()` returns a human-readable multi-line summary (header + per-section entry counts + top helper rollups).
  4. A developer using `buildDocument({ type, patient, ... }).addSection(...).addEntry(...).toString()` constructs a valid outbound C-CDA document for tests and small tools.
  5. A developer round-tripping a document parsed under any vendor profile and re-serializing receives namespace-clean C-CDA R2.1 — profile quirks affect parsing, never serialization.
**Plans**: 4 plans
**UI hint**: no

### Phase 7: Profile System & Built-ins
**Goal**: A developer can define, extend, and compose vendor/integration profiles via a first-class public API, apply them to parses, and rely on 5 ready-made profiles (epic, cerner, meditech, athena, generic) that reduce warnings against realistic vendor shapes — and the OID-registry / template-registry extensions registered through profiles compose with the built-ins from Phase 4.
**Depends on**: Phase 4, Phase 6
**Requirements**: PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, BIP-01, BIP-02, BIP-03, BIP-04, BIP-05, BIP-06
**Success Criteria** (what must be TRUE):
  1. A developer calling `defineProfile({ name, ... })` with valid input receives a readonly `Profile` exposing `name`, `description`, `oidRegistry`, `customTemplates`, `lineage`, and `describe()`; invalid input (bad option shapes, duplicate custom OIDs, unknown option keys) throws `ProfileDefinitionError` with an actionable message.
  2. A developer using `extends: parentProfile` or `extends: [p1, p2]` receives a profile whose merged options follow documented semantics (scalars overwrite, arrays concat+dedupe, `oidRegistry` and `customTemplates` deep-merge per key, `onWarning` handlers chain).
  3. A developer calling `parseCCDA(raw, profile)` sees `doc.profile?.name` and `doc.profile?.lineage` populated, profile-registered OIDs resolved through `CodedValue.codeSystemName`, and profile-registered custom templates extending the template registry for that parse only.
  4. A developer calling `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` can manage a process-scoped default; explicit arguments override and `parseCCDA(raw, { profile: null })` opts out for a single call.
  5. A developer importing `profiles.epic`, `profiles.cerner`, `profiles.meditech`, `profiles.athena`, or `profiles.generic` and parsing a realistic vendor-shape fixture with the profile receives fewer warnings than parsing the same fixture without a profile; each built-in is authored through the public `defineProfile()` API.
**Plans**: 5 plans
**UI hint**: no

### Phase 8: Testing Hardening, Examples, Starter Kit & Documentation
**Goal**: A developer running the test suite sees ≥ 90% line coverage on `src/parser/`, `src/model/`, `src/templates/`, and `src/helpers/` plus concrete evidence — canonical fixtures for all 12 document types, edge cases, vendor-quirk fixtures, strict-mode escalation, profile-authoring, template-authoring — that the library behaves as specified end to end. A developer landing on the README can go from zero to parsing a real CCD in under a minute, find a recipe for every common task, and copy the profile starter kit into a new directory to publish their own profile package in minutes.
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08, TEST-09, EX-01, EX-02, EX-03, KIT-01, KIT-02, KIT-03, KIT-04, KIT-05, KIT-06, KIT-07, DOC-01d, DOC-02d, DOC-03d, DOC-04d, DOC-05d, DOC-06d, DOC-07d, DOC-08d, DOC-09d, DOC-10d, DOC-11d, DOC-12d, DOC-13d, DOC-14d
**Success Criteria** (what must be TRUE):
  1. A developer running `pnpm test --coverage` sees ≥ 90% line coverage on `src/parser/`, `src/model/`, `src/templates/`, and `src/helpers/`, a green test suite, canonical round-trip fixtures for all 12 C-CDA R2.1 document types, edge-case fixtures for BOM / line-endings / namespace prefix / mixed content / embedded HTML / base64 / null-flavor / unknown templateId / narrative-only section / unresolved IDREF / unknown OID / cardinality violation, at least one vendor-quirks fixture per Tier 2 warning code (each verified to emit the expected warning in lenient mode and throw `CCDAValidationError` under `{ strict: true }`), at least one fixture per built-in profile demonstrating fewer warnings with the profile than without, and full coverage of `defineTemplate` + `defineProfile` authoring APIs.
  2. A developer running `tsx examples/extract-problem-list.ts`, `examples/build-allergy-summary.ts`, and `examples/validate-against-ig.ts` sees each example execute end-to-end and print the documented output, demonstrating named helpers, allergy iteration + summary formatting, and `{ strict: true }` / `{ validate: true }` IG-validation respectively.
  3. A developer copying `examples/profile-starter-kit/` into a new directory can run `pnpm install && pnpm test && pnpm build` against the sample fixture with success; `dist/` entries match the `package.json` exports; CI and publish workflows validate with `actionlint`; `CUSTOMIZING.md` walks through rename → swap base profile → register OIDs / custom templates → write fixtures → publish; placeholders (`{{YOUR_ORG}}`, `{{PROFILE_NAME}}`) appear consistently.
  4. A developer opening the README on GitHub or npm sees the one-sentence value prop as the first line, badges, a 30-second copy-pasteable quickstart (install + parse + extract active problems), a 6–8-bullet feature list, a "C-CDA in 90 seconds" core-concepts section, the three access patterns (named helpers / template-aware section access / raw document model), the full Cookbook (every recipe listed in REQUIREMENTS.md DOC-06d), a top-level "Templates & Profiles" section, a 3-tier "Real-World Tolerance" section with table and runnable warnings-iteration example, an "Error Handling" section covering all five error types, a "Contributing" section, the cross-link to `@cosyte/hl7`, and the "Built by Cosyte" footer with license link.
  5. A developer looking for release history or roadmap finds `CHANGELOG.md` in Keep-a-Changelog format with an `[Unreleased]` section and a roadmap/stretch-goals section documenting the v2 deferrals (R1.1 support, Schematron validation, XMLDSig verification, PDF stylesheet rendering, FHIR conversion, DICOM SR ingestion, streaming parser); the "Publishing Your Profile" recipe links directly to `examples/profile-starter-kit/` and references `CUSTOMIZING.md`.
**Plans**: 5 plans
**UI hint**: no

---

## Parallelization Notes

Within each phase, plans that touch disjoint modules may run in parallel; plans that share a module must serialize. Concrete expectations:

- **Phase 1:** Toolchain plans (tsup config, Vitest config, ESLint+Prettier, tsconfig + strict flags, package.json exports + scripts, README skeleton, LICENSE) are largely independent and can run in parallel. **The XML-parser ADR is a discuss-phase deliverable that gates everything in Phase 2 — no parser source code may be written before `0001-xml-parser.md` is committed.** A final smoke-test plan runs last to verify the full `install/build/typecheck/lint/test` pipeline.
- **Phase 2:** The chosen XML parser (per the Phase 1 ADR) is wired in first. Namespace handling, processing-instruction preservation, mixed-content handling, IDREF resolution, base64 lazy decode, and BOM/charset normalization can then proceed in parallel against shared fixtures. The warnings/error-code registry and `onWarning` plumbing should be built early and consumed by each parser plan; strict-mode escalation is a capstone plan.
- **Phase 3:** Composite type parsers (CD, CE, CWE, II, AD, PN, TEL, TS/IVL_TS, PQ, ED) are independent and parallelizable. The `CCDADocument` shell, header parsers (patient, author, custodian, encounter), and section/entry wrapper traversal are serial dependencies. Mutation methods (`setHeaderField`, `addSection`, `removeSection`, `addEntry`, `removeEntry`, `setEntryField`) are a final plan gated on the read path — and the structural-sharing-vs-`markDirty` mutation contract is locked at a discuss step before any mutation code is written.
- **Phase 4:** The OID registry is one plan and unblocks `CodedValue.codeSystemName` resolution everywhere. The built-in template definitions (sections + entries) are independent files that parallelize across the C-CDA R2.1 core set; `defineTemplate()` API + duplicate-registration throw + override are a foundational plan that lands first.
- **Phase 5:** Helper builders (`problems`, `medications`, `allergies`, `immunizations`, `results`, `vitals`, `encounters`, `procedures`, `socialHistory`) are mutually independent and parallelizable. The narrative-content tree builder + IDREF reconciler are a serial pair; the `CCDA_NARRATIVE_ENTRY_MISMATCH` emit-site lands once both are in place.
- **Phase 6:** `toString()` and `toJSON()` can run in parallel (disjoint emitters). `prettyPrint()` and `buildDocument()` are independent. The round-trip fixture sweep is a final plan.
- **Phase 7:** `defineProfile()` core + validation errors is the first plan; `extends`/merge semantics and default-profile management can then parallelize. The five built-in profiles (epic, cerner, meditech, athena, generic) are mutually independent and all parallelizable once the API surface stabilizes; the per-vendor warning-reduction sweep is a capstone.
- **Phase 8:** Fixture authoring (canonical, edge-case, vendor-quirk, profile-authoring, template-authoring) parallelizes across categories. The three examples are independent. Starter-kit assembly is one plan; README authoring decomposes into quickstart + feature list, access patterns, cookbook, templates+profiles section, tolerance section, error handling, contributing/footer — most of which parallelize. CHANGELOG and the per-runtime-dep ADRs (any beyond the Phase 1 XML-parser ADR) are trivially parallel.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation & XML Parser ADR | 0/4 | Not started | - |
| 2. Core XML Parser & Tolerance | 0/5 | Not started | - |
| 3. Document Header, Typed Model & Data Types | 0/5 | Not started | - |
| 4. Templates, Sections & Coded Values | 0/4 | Not started | - |
| 5. Named Helpers & Narrative Reconciliation | 0/5 | Not started | - |
| 6. Serialization & Round-Trip | 0/4 | Not started | - |
| 7. Profile System & Built-ins | 0/5 | Not started | - |
| 8. Testing Hardening, Examples, Starter Kit & Documentation | 0/5 | Not started | - |

**v1 milestone:** 0/8 phases complete.

---

*Last updated: 2026-04-22 after initialization.*
