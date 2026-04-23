# @cosyte/ccda — v1 Requirements

All requirements are user-facing behaviors a developer consuming `@cosyte/ccda` can verify. REQ-IDs are stable across phases and referenced from `ROADMAP.md` for traceability.

> **Note on REQ-ID prefixes.** Two distinct categories share the `DOC-` prefix in this file: the *Document Type & Header* group (`DOC-01..06`, listed below as the "Document Type & Header (DOC)" section) and the *Documentation* group (`DOC-01..18`, listed below as the "Documentation (DOC)" section). The Traceability table at the bottom disambiguates them as `DOC-NNh` (header) and `DOC-NNd` (documentation). ROADMAP.md uses the same disambiguation.

> **Revision note (2026-04-22, post-research).** 15 REQs added, 9 modified, 1 deferred to v2 (MODEL-05). Driven by 4 parallel research agents' findings on stack, features, architecture, pitfalls. See `.planning/research/` for the source material.

---

## v1 Requirements

### Project Setup & Build (SETUP)

- [ ] **SETUP-01** — Developer can run `pnpm install && pnpm build && pnpm test` from a clean clone and all three succeed.
- [ ] **SETUP-02** — Package publishes as dual ESM + CJS with a correct `exports` map; consumers on either module system resolve the right entry point.
- [ ] **SETUP-03** — Every runtime dependency declared in `package.json` is backed by an ADR in `.planning/adr/` justifying its inclusion (maintained, trusted, MIT/Apache-licensed, no open CVEs on the pinned floor). Total runtime deps ≤ 3.
- [ ] **SETUP-04** — TypeScript consumers get full IntelliSense (types, JSDoc, `@example` tags) on every public API surface.
- [ ] **SETUP-05** — Repo targets Node 18+ and compiles to ES2022 with `"strict": true` and `"noUncheckedIndexedAccess": true`.
- [ ] **SETUP-06** — `pnpm lint` and `pnpm typecheck` pass with zero warnings.

### Core Parsing (PARSE)

- [ ] **PARSE-01** — `parseCCDA(raw)` parses any well-formed C-CDA R2.1 XML document (string or Buffer) and returns a `CCDADocument` object.
- [ ] **PARSE-02** — Parser correctly handles XML namespaces (default `urn:hl7-org:v3`, `voc`, `sdtc`, `xsi`) regardless of prefix variation across vendors; downstream accessors use `(namespaceURI, localName)` tuples, not prefix strings.
- [ ] **PARSE-03** — Parser preserves `<?xml-stylesheet ...?>` processing instructions (and DOCTYPE *declaration* metadata if present — but see PARSE-09) for round-trip serialization.
- [ ] **PARSE-04** — Parser reads mixed-content narrative (`<text>` with interleaved text nodes and inline elements) without losing any child content or child ordering.
- [ ] **PARSE-05** — Parser resolves `ID` / `IDREF` references within a document (entry → narrative `content[@ID]`) via a dedicated index (not relying on `Document.getElementById`, since C-CDA ships no DTD) and exposes the resolution.
- [ ] **PARSE-06** — Parser decodes base64-encoded `<observationMedia>` / `<reference>` attachments **on demand** (raw bytes exposed lazily to avoid memory blowup); single-attachment decode size capped at a configurable bound (default 10 MB) with `CCDA_DECODE_SIZE_EXCEEDED` fired when exceeded.
- [ ] **PARSE-07** — Parser handles UTF-8 with or without BOM silently (Tier 1: no warning); other declared charsets honored via the XML declaration using Node 18+ ICU `TextDecoder`.
- [ ] **PARSE-08** — `parseCCDA(raw, { strict: true })` runs IG-level structural validation (required templateIds, cardinality, required code bindings) and throws a typed `CCDAValidationError` aggregating all violations.
- [ ] **PARSE-09** — **Security: no DTD / no XXE.** Parser disables DTD processing by default. Any `<!DOCTYPE>` declaration (beyond an ignorable name-only declaration with no internal subset and no external subset) emits `CCDA_DTD_REJECTED` and the DTD content is discarded — under no circumstance does the parser resolve external entities, parameter entities, or internal entity references from the document. Documents that rely on entity expansion cannot be parsed (this is intentional — no Tier-3 bypass even in `{ strict: false }` / lenient mode). An `allowDoctypeDeclaration: false` (default `true` for name-only declarations) option is exposed.

### Document Type & Header (DOC)

- [ ] **DOC-01** — `doc.type` exposes the detected document type (`ccd`, `discharge-summary`, `progress-note`, `hp`, `consultation-note`, `referral-note`, `operative-note`, `procedure-note`, `care-plan`, `diagnostic-imaging`, `unstructured-document`, `transfer-summary`, or `unknown`) derived from the document-level `templateId`. `diagnostic-imaging` and `unstructured-document` are second-tier (detection + structural pass-through only; the helper surface does not apply meaningfully).
- [ ] **DOC-02** — `doc.templateIds` exposes the raw document-level `templateId` array (root + optional extension), preserved in original order. Patient Generated Document Header constraint (`2.16.840.1.113883.10.20.22.1.16`), when present, is surfaced via this same array — no dedicated helper.
- [ ] **DOC-03** — `doc.effectiveTime`, `doc.languageCode`, `doc.title`, `doc.confidentialityCode`, `doc.setId`, `doc.versionNumber` expose the corresponding ClinicalDocument header fields as parsed, safe-access values (`undefined` when absent — never throw).
- [ ] **DOC-04** — `doc.patient` exposes: `mrn`, `identifiers[]`, `name` (parsed PN), `familyName`, `givenName`, `fullName`, `dateOfBirth` (Date), `sex`, `address` (parsed AD), `phoneNumbers[]`, `race`, `ethnicity`, `languageCommunication`. All return `undefined` / `[]` when absent.
- [ ] **DOC-05** — `doc.author[]`, `doc.custodian`, `doc.informant[]`, `doc.legalAuthenticator`, `doc.authenticator[]`, `doc.dataEnterer`, `doc.informationRecipient[]` expose header participants with names and organization; absent participants return `undefined` or `[]`.
- [ ] **DOC-06** — `doc.encounter` (nullable) exposes the document-level encompassingEncounter: `id`, `code`, `effectiveTime` (start/end), `location`, `responsibleParty`.

### Typed Model & Access (MODEL)

- [ ] **MODEL-01** — `doc.sections` returns every top-level section in document order, each typed as a `Section` wrapper.
- [ ] **MODEL-02** — `doc.section(templateId)` returns the first matching section by `templateId` (root or root+extension); `doc.section(loincCode)` returns the first matching section by LOINC code when no templateId match is found. Template match wins over code match.
- [ ] **MODEL-03** — `Section` exposes `.templateIds`, `.code` (LOINC code object), `.title`, `.text` (narrative as structured content tree), `.entries` (typed entries), `.isNullFlavor`, `.isNarrativeOnly` (boolean — true iff `<text>` present and zero `<entry>`), and `.rawXml` (the raw XML node for escape-hatch access the typed helpers don't cover).
- [ ] **MODEL-04** — Entry wrappers expose the C-CDA R2.1 entry-template shapes as a discriminated union keyed by a `kind` string derived at `defineTemplate()` call sites. Unknown entry types parse into a `{ kind: 'unknown', xsiType, templateIds, raw }` fallback shape so the union stays bounded and TS narrowing stays fast.
- [ ] ~~**MODEL-05** — `doc.get('xpath-ish-path')`~~ **DEFERRED to v2.** Replaced by `section.rawXml` (MODEL-03) + the XML-adapter node tree as the explicit escape hatch. A "half-XPath" is a worse API than raw XML access; v2 may add a real XPath subset.
- [ ] **MODEL-06** — Parsed `CCDADocument` is immutable by default; mutation is possible only via explicit methods (`setHeaderField`, `addSection`, `removeSection`, `addEntry`, `removeEntry`, `setEntryField`).
- [ ] **MODEL-07** — Mutation methods return a **new** `CCDADocument` via structural sharing (the original instance remains unchanged; `doc1 !== doc2`). Per-instance lazy caches do not need invalidation; round-trip semantics are clean (`doc.toString()` reflects the instance state at the moment of call).

### Data Types (TYPES)

- [ ] **TYPES-01** — TypeScript interfaces exist and are exported for the C-CDA / RIM composite data types used by the library: `CD`, `CE`, `CWE` (coded), `II` (instance identifier), `AD` (address), `PN` (person name), `TEL` (telecom), `TS` / `IVL_TS` / `EIVL_TS` (timestamps / intervals), `PQ` (physical quantity), `ED` (encapsulated data), `ST`, `BL`, `INT`, `REAL`. Every composite type carries a `nullFlavor?: NullFlavor` field where the source XML element has `@nullFlavor`; values and nullFlavor coexist (a nulled value is not the same as an absent element).
- [ ] **TYPES-02** — `CodedValue` (our flat shape for CD/CE/CWE) exposes `code`, `codeSystem` (OID), `codeSystemName` (resolved via the built-in OID registry when known — see CODE-01/02), `displayName`, `originalText`, `translations[]`, and `nullFlavor?`.
- [ ] **TYPES-03** — HL7 TS/DTM strings (`YYYYMMDDHHMMSS[.SSSS][+/-ZZZZ]`) parse to JS `Date` with valid truncations; raw string remains accessible.
- [ ] **TYPES-04** — Unparseable timestamps return `undefined` for the `Date` getter (no throw); raw remains accessible.
- [ ] **TYPES-05** — `PQ` exposes `value` (number) + `unit` (UCUM string); unparseable `value` returns `undefined` with raw preserved.
- [ ] **TYPES-06** — `II` distinguishes OID (`root` is dotted numeric), UUID (`root` is UUID), and "root + extension" forms; `mrn`-pickers prefer a recognized MRN OID registry (including vendor OID patterns surfaced via profiles — see BIP-01..05).

### Named Helpers (HELPERS)

- [ ] **HELPERS-01** — `doc.problems.active`, `doc.problems.all`, `doc.problems.resolved` return typed arrays of problem entries with `code` (CodedValue), `name`, `status`, `onsetDate`, `resolvedDate`, `author`. Active status is derived via SNOMED status-code matching (not by position or narrative scraping). `doc.problems.active === []` means "no active problems in the document"; when the Problem section is absent entirely, the array is empty AND `doc.warnings` does not fire a "missing problem list" warning (absence is valid per IG).
- [ ] **HELPERS-02** — `doc.medications.current`, `doc.medications.all`, `doc.medications.discontinued` return typed arrays with `medication` (CodedValue), `name`, `dose`, `route`, `frequency`, `effectiveTime` (start/end; half-bounded intervals allowed — `high === undefined` means "still active"), `status`, `prescriber`.
- [ ] **HELPERS-03** — `doc.allergies` returns a typed array with `substance` (CodedValue), `reaction`, `severity`, `status`, `onsetDate`. The library distinguishes three cases: absent allergy section (`doc.allergies === []` plus no warning — caller must not infer "no allergies"); explicitly-stated "No Known Allergies" via a negated Allergy Concern Act with nullFlavor or SNOMED `no known allergy` code (exposed as `doc.allergies.isNoKnownAllergies === true`); and populated allergy entries.
- [ ] **HELPERS-04** — `doc.immunizations` returns a typed array with `vaccine` (CodedValue, CVX-resolved when OID matches), `administeredDate`, `dose`, `route`, `lotNumber`, `manufacturer`, `status`.
- [ ] **HELPERS-05** — `doc.results.recent`, `doc.results.all` return typed arrays of result observations grouped by organizer, with `code`, `value` (typed by `xsi:type` — see TOL-03 xsi:type handling), `units`, `referenceRange`, `interpretationCode`, `effectiveTime`, `status`.
- [ ] **HELPERS-06** — `doc.vitals.latest` returns a typed panel (systolic BP, diastolic BP, heart rate, respiratory rate, temperature, SpO2, weight, height, BMI — `undefined` for slots not present in the document; never fabricated). `doc.vitals.all` returns every vital-sign observation. `doc.vitals.byLoinc(code)` returns observations filtered by LOINC code.
- [ ] **HELPERS-07** — `doc.encounters` returns a typed array with `code`, `diagnoses[]` (via Encounter Diagnosis V3 wrapper — see TPL-02), `location`, `provider`, `effectiveTime` (start/end), `dischargeDisposition`.
- [ ] **HELPERS-08** — `doc.procedures` returns a typed array with `code` (CodedValue), `name`, `performedDate`, `performer`, `targetSite`, `status`.
- [ ] **HELPERS-09** — `doc.socialHistory.smoking` (nullable) surfaces the Smoking Status Meaningful-Use entry when present; `doc.socialHistory.observations[]` exposes the full Social History section; `doc.socialHistory.byLoinc(code)` returns observations filtered by LOINC code (SDOH observations, pregnancy status, etc.).
- [ ] **HELPERS-10** — All helpers return `undefined` / empty arrays for missing optional data; never throw.
- [ ] **HELPERS-11** — `doc.familyHistory` returns a typed array of family-history observations (`relationship`, `condition`, `age`, `dateOfBirth`, `deceased`, `causeOfDeath`) derived from the Family History Section. USCDI v3 data class.
- [ ] **HELPERS-12** — `doc.advanceDirectives` returns a typed array (`directive`, `effectiveTime`, `custodian`, `verification`, `reference`) derived from the Advance Directives Section (V3). USCDI v3 data class.
- [ ] **HELPERS-13** — `doc.functionalStatus` returns a typed array of functional-status observations (`assessment`, `score`, `effectiveTime`) derived from the Functional Status Section (V2). USCDI v3 data class.
- [ ] **HELPERS-14** — `doc.healthConcerns` returns a typed array of Health Concern Acts (`concern`, `status`, `effectiveTime`, `relatedProblems[]`) derived from the Health Concerns Section. USCDI v3 + Care Plan certification.
- [ ] **HELPERS-15** — `doc.goals` returns a typed array of Goal Observations (`goal`, `targetDate`, `progress`, `relatedHealthConcerns[]`) derived from the Goals Section. USCDI v3 + Care Plan certification.
- [ ] **HELPERS-16** — Filter helpers on the collection helpers: `doc.problems.byCode(code | {code, codeSystem})`, `doc.medications.byRoute(routeCode)`, `doc.medications.activeAt(date)`, `doc.results.byCategory(loincCategory)`, `doc.results.byCode(loincCode)`, `doc.results.latest(loincCode)`, `doc.encounters.byDateRange(from, to)`. All return typed arrays or `undefined`; never throw.
- [ ] **HELPERS-17** — `doc.summary()` returns a single dashboard-shaped rollup: `{ patient: {mrn, name, dob, sex, age}, activeProblems: CodedValue[], currentMedications: string[], allergies: string[], lastVitals: VitalsPanel, recentResults: {loinc, value, units, when}[], lastEncounter: {when, type, location} }`. Single-call convenience for the most common consumer query.

### Narrative ↔ Entry Reconciliation (NARR)

- [ ] **NARR-01** — `section.text` exposes the narrative as a structured content tree (paragraphs, tables, lists, `<content ID="...">` spans, inline HTML-like elements) — not a flat string. Narrative is byte-for-byte preserved through parse → serialize.
- [ ] **NARR-02** — Reconciliation is **lazy on access**, not a user-invoked method. On first access of `section.matchedEntries`, `section.unmatchedEntries`, or `section.orphanNarrative`, the library walks `text/reference[@value]` IDREFs in each entry against narrative `content[@ID]` elements and populates the three buckets; `section.isNarrativeOnly` is available without iteration. Unresolved IDREFs emit `CCDA_UNRESOLVED_IDREF`.
- [ ] **NARR-03** — When an entry's reconciled narrative text conflicts with its structured value, `CCDA_NARRATIVE_ENTRY_MISMATCH` fires with both values and positional context. Conflict-detection scope for v1 is bounded to three entry-type categories: (a) Medication Activity dose + units mismatches, (b) Problem Observation code-displayName vs narrative-text mismatches when narrative-text is non-empty, (c) Result Observation numeric value mismatches. Everything else is too noisy or too expensive for v1.
- [ ] **NARR-04** — Narrative is preserved verbatim on parse and emitted verbatim on serialize; the library never rewrites narrative content from structured entries (Postel's Law at the narrative layer).

### Real-World Tolerance & Warnings (TOL)

- [ ] **TOL-01** — Default parse mode is lenient; `{ strict: true }` escalates every Tier 2 warning to a thrown `CCDAValidationError` aggregating all violations with their codes and positional context.
- [ ] **TOL-02** — Tier 3 fatal errors throw `CCDAParseError` with stable codes even in lenient mode: `NOT_XML`, `NO_CLINICAL_DOCUMENT_ROOT`, `INVALID_NAMESPACE`, `EMPTY_INPUT`. Each error includes `message`, `position` (line/column), and `snippet` (subject to TOL-07 redaction).
- [ ] **TOL-03** — Parser emits Tier 2 warnings with stable codes and XPath-ish positional context for defined scenarios: `CCDA_MISSING_TEMPLATE_ID`, `CCDA_UNKNOWN_TEMPLATE_ID`, `CCDA_NARRATIVE_ONLY_SECTION`, `CCDA_NARRATIVE_ENTRY_MISMATCH`, `CCDA_UNRESOLVED_IDREF`, `CCDA_OID_NOT_RECOGNIZED`, `CCDA_CODE_SYSTEM_MISMATCH`, `CCDA_NULLFLAVOR_IN_REQUIRED_FIELD`, `CCDA_MIXED_CONTENT_DEVIATION`, `CCDA_NAMESPACE_PREFIX_VARIATION`, `CCDA_EMBEDDED_HTML_IN_NARRATIVE`, `CCDA_BASE64_ATTACHMENT_PRESENT`, `CCDA_CARDINALITY_VIOLATION`, `CCDA_REQUIRED_BINDING_MISSING`, `CCDA_TIMESTAMP_FALLBACK_FORMAT`, `CCDA_MISSING_XSI_TYPE` (observation with `<value>` lacks `xsi:type`), `CCDA_XSI_TYPE_NAMESPACE_DEVIATION` (xsi:type QName prefix resolves to a non-`urn:hl7-org:v3` URI), `CCDA_DTD_REJECTED`, `CCDA_DECODE_SIZE_EXCEEDED`, `CCDA_ENTITY_EXPANSION_EXCEEDED`.
- [ ] **TOL-04** — `doc.warnings` is always an array of `CCDAParseWarning` objects (possibly empty) on a parsed document.
- [ ] **TOL-05** — `onWarning` callback option is invoked for every warning as it is emitted.
- [ ] **TOL-06** — `doc.issues` (IG-validation issues under strict mode, or when `{ validate: true }` is passed without `strict`) separates IG-cardinality / required-binding issues from parser-level warnings.
- [ ] **TOL-07** — **PHI-safe warning snippets.** `CCDAParseWarning.snippet` and `CCDAParseError.snippet` default to a short (≤ 80 chars) positional excerpt that strips element-content text nodes (node names, attribute names, and attribute values preserved; inner text redacted to `<…>`). A `{ redactSnippets: false }` parse option exposes unredacted snippets for debugging consoles. Library consumers can route warnings to logs without accidentally leaking PHI.
- [ ] **TOL-08** — **Decode-size bounds.** Parser tracks cumulative decode size for base64 attachments and entity expansion; exceeding `{ maxDecodedBytes: 50_000_000 }` (default 50 MB) emits `CCDA_DECODE_SIZE_EXCEEDED` and truncates decoding (lenient) or throws `CCDAParseError` (strict). Per-entity expansion count capped at `{ maxEntityCount: 10_000 }` with `CCDA_ENTITY_EXPANSION_EXCEEDED` — billion-laughs defense.

### Serialization & Round-Trip (SER)

- [ ] **SER-01** — `doc.toString()` produces namespace-clean, canonical C-CDA R2.1 XML regardless of quirks in the input (Postel's Law: conservative emitter). Default namespace forced to `urn:hl7-org:v3`; vendor prefix aliases stripped. `<?xml-stylesheet?>` processing instructions preserved.
- [ ] **SER-02** — Round-trip `parse → toString → parse` yields a **structurally equivalent** (not byte-identical) `CCDADocument` for every canonical fixture, verified by a structural-equivalence walker over the typed model (header + sections + entries + narrative tree).
- [ ] **SER-03** — `doc.toJSON()` returns a structured JSON representation of the full document (header + sections + entries).
- [ ] **SER-04** — `doc.prettyPrint()` returns a human-readable multi-line summary for logging/debugging: header summary line + per-section "Section Name (templateId): N entries" line + a helper-rollup line ("Active problems: 4, Current medications: 7, Allergies: 2"). Tightly scoped — no richer rendering (see Out of Scope for narrative-to-HTML).
- [ ] **SER-05** — `buildDocument({type: 'ccd', patient, ...}).addSection(...).addEntry(...).toString()` constructs a valid outbound **CCD** document from scratch. **v1 supports CCD only** — Discharge Summary / Care Plan / etc. outbound construction deferred to v2. The CCD builder is demonstrated in an `examples/build-minimal-ccd.ts` runnable.

### Templates (TPL)

- [ ] **TPL-01** — Built-in C-CDA R2.1 **section templates** ship and are authored via the public `defineTemplate()` API. Enumerated set (grouped by primary document type) — every listed template is registered by `templateId` (root + optional extension) and, where applicable, a LOINC code:
  - **Core (shared across CCD / Discharge Summary / Progress Note / H&P / Consultation / Referral / Transfer Summary):** Problem Section (entries required) V3, Medications Section (entries required) V2, Allergies and Intolerances Section (entries required) V3, Immunizations Section (entries required) V3, Results Section (entries required) V3, Vital Signs Section (entries required) V3, Encounters Section (entries required) V3, Procedures Section (entries required) V2, Social History Section V3, Plan of Treatment Section V2, Assessment Section, Assessment and Plan Section V2, Reason for Referral Section, Reason for Visit Section, Instructions Section V2, Medical Equipment Section V2, Functional Status Section V2, Mental Status Section V2, Advance Directives Section (entries required) V3, Payers Section V3, Chief Complaint Section, Chief Complaint and Reason for Visit Section, History of Present Illness Section, Past Medical History Section V3, Family History Section V3, Review of Systems Section, Physical Exam Section V3, General Status Section, Nutrition Section.
  - **Discharge Summary specific:** Hospital Course Section (IHE-rooted `1.3.6.1.4.1.19376.1.5.3.1.3.5`), Hospital Discharge Diagnosis Section V3, Discharge Medications Section (entries required) V3, Hospital Discharge Instructions Section, Hospital Discharge Studies Summary Section, Hospital Admission Diagnosis Section V3, Admission Medications Section V3, Hospital Consultations Section, Hospital Discharge Physical Section.
  - **Care Plan specific:** Health Concerns Section V2, Goals Section, Interventions Section V3, Health Status Evaluations and Outcomes Section V2.
  - **Operative Note specific:** Anesthesia Section V2, Complications Section V3, Postoperative Diagnosis Section, Preoperative Diagnosis Section V3, Procedure Description Section, Procedure Findings Section V3, Procedure Specimens Taken Section, Procedure Disposition Section, Procedure Indications Section V2, Estimated Blood Loss Section, Surgical Drains Section, Planned Procedure Section V2, Procedure Implants Section.
  - **Diagnostic Imaging specific:** Findings Section, DICOM Object Catalog Section.
  - **Notes Section** (USCDI v3) — **DEFERRED to v2** (low-leverage for typed extraction; narrative-heavy).
- [ ] **TPL-02** — Built-in C-CDA R2.1 **entry templates** ship and are authored via the public `defineTemplate()` API. Enumerated set:
  - **Problems:** Problem Concern Act V3, Problem Observation V3.
  - **Medications:** Medication Activity V2, Medication Information V2, Medication Supply Order V3, Indication V2.
  - **Allergies:** Allergy Concern Act V3, Allergy–Intolerance Observation V2, Reaction Observation V2, Severity Observation V2.
  - **Results:** Result Organizer V3, Result Observation V3.
  - **Vital Signs:** Vital Signs Organizer V2, Vital Sign Observation V2.
  - **Immunizations:** Immunization Activity V3, Immunization Medication Information V2.
  - **Encounters:** Encounter Activity V3, Encounter Diagnosis V3, Service Delivery Location.
  - **Procedures:** Procedure Activity Act V2, Procedure Activity Observation V2, Procedure Activity Procedure V2.
  - **Social History:** Social History Observation V3, Smoking Status — Meaningful Use V2, Tobacco Use V2, Pregnancy Observation.
  - **Care Plan:** Goal Observation, Intervention Act V2, Health Concern Act V2, Outcome Observation V2.
  - **Family History:** Family History Observation V3, Family History Organizer V3.
  - **Functional Status:** Functional Status Observation V2, Cognitive Status Observation V2.
  - **Plan of Treatment:** Planned Observation V2, Planned Procedure V2, Planned Medication Activity V2.
  - **USCDI v3 demographic observations** — **DEFERRED to v2:** Gender Identity Observation, Sexual Orientation Observation, Sex Parameter for Clinical Use Observation.
  - **Drug Vehicle** — **DEFERRED to v2** (real but uncommon in production).
- [ ] **TPL-03** — `defineTemplate({ name, templateId, extension?, parse, entryShape? })` registers a template; duplicate registration throws `TemplateDefinitionError` unless `{ override: true }` is set.
- [ ] **TPL-04** — The built-in template registry composes with developer-registered templates; developer-registered templates take precedence on override. Registry is `Map<\`${root}|${extension ?? ""}\`, Template>` with separate built-in (read-only after init) and user/profile (override) layers.
- [ ] **TPL-05** — Recognizing a template is a pure lookup against `templateId` (root + optional `@extension`); LOINC code is a fallback only and never wins over a template match.

### Profiles (PROF)

- [ ] **PROF-01** — `defineProfile({ name, ...options })` returns a valid `Profile` object; name is required.
- [ ] **PROF-02** — `defineProfile()` throws `ProfileDefinitionError` with a clear message for invalid input: bad option shapes, duplicate custom OIDs, unknown option keys.
- [ ] **PROF-03** — `extends: parentProfile` and `extends: [p1, p2]` inherit and compose options; merge semantics documented (leftmost-ancestral, rightmost-layered; scalars overwrite, arrays concat+dedupe, `oidRegistry` / `customTemplates` deep-merge per key, `onWarning` handlers chain in leftmost-first order, the `defineProfile` body has final word). Typed as `Profile | readonly Profile[]`, never `any[]`.
- [ ] **PROF-04** — `profile.name`, `profile.description`, `profile.oidRegistry`, `profile.customTemplates`, `profile.lineage` are readonly and reflect applied options.
- [ ] **PROF-05** — `profile.describe()` returns a non-empty human-readable summary containing the profile name.
- [ ] **PROF-06** — `parseCCDA(raw, profile)` applies profile behavior to the parse; `doc.profile?.name` and `doc.profile?.lineage` are set on the parsed document. Profile state is passed via parser context (no module globals for an explicit-argument parse).
- [ ] **PROF-07** — Profile-registered OIDs extend the code-system resolver (so `codeSystemName` resolves for HIE-local OIDs); profile-registered custom templates extend the template registry for that parse.
- [ ] **PROF-08** — `setDefaultProfile(p)` / `getDefaultProfile()` / `setDefaultProfile(null)` manage a process-scoped default; explicit argument overrides; `parseCCDA(raw, { profile: null })` opts out for one call.
- [ ] **PROF-09** — Round-trip: a document parsed with a custom profile and re-serialized produces namespace-clean C-CDA (profile quirks affect parsing, not serialization).

### Built-in Profiles (BIP)

- [ ] **BIP-01** — `profiles.epic` ships and is authored via the public `defineProfile()` API. Recognizes Epic customer-specific MRN OID family via pattern `1.2.840.114350.1.13.*`; handles Epic `sdtc:` extensions and multi-CCD envelopes.
- [ ] **BIP-02** — `profiles.cerner` ships and is authored via the public `defineProfile()` API. Handles ISO-8601 datetime with `T` separator; recognizes Cerner OID family `2.16.840.1.113883.3.13.6.*`; tolerates empty `<entry>` wrappers around null-flavor observations; accepts custom Z-templates with `_ZID`/`_ZNT` extensions.
- [ ] **BIP-03** — `profiles.meditech` ships and is authored via the public `defineProfile()` API. Date fallbacks include `YYYYMMDDHHmm` (minute precision); tolerates root-only templateIds (missing extension); narrative-only sections for HPI, Hospital Course, Physical Exam.
- [ ] **BIP-04** — `profiles.athena` ships and is authored via the public `defineProfile()` API. Date fallbacks include `MM/DD/YYYY` and `MM/DD/YYYY HH:mm:ss`; recognizes athenahealth OID family `2.16.840.1.113883.3.564.*`; narrative-only assessment/plan tolerated.
- [ ] **BIP-05** — `profiles.generic` ships and is authored via the public `defineProfile()` API as the broad-vendor fallback (relaxed templateId-extension matching, permissive date parsing, broadened OID recognition for NextGen / eClinicalWorks / Allscripts / Greenway / athenaPractice).
- [ ] **BIP-06** — Each built-in profile reduces warnings on a realistic vendor-shape fixture versus lenient mode without a profile.
- [ ] **BIP-07** — `profiles.carequality` ships and is authored via the public `defineProfile()` API. Recognizes Carequality's External Document Reference templates so they don't emit `CCDA_UNKNOWN_TEMPLATE_ID`; applies Carequality "Concise C-CDA" section-prioritization conventions.
- [ ] **BIP-08** — `profiles.commonwell` ships and is authored via the public `defineProfile()` API. Recognizes CommonWell patient-record locator OID family `2.16.840.1.113883.3.3330.*`; handles network-specific custodian patterns.

### Coded Values & OID Registry (CODE)

- [ ] **CODE-01** — Built-in OID registry recognizes at least: SNOMED CT (`2.16.840.1.113883.6.96`), LOINC (`2.16.840.1.113883.6.1`), RxNorm (`2.16.840.1.113883.6.88`), ICD-10-CM (`2.16.840.1.113883.6.90`), ICD-10-PCS (`2.16.840.1.113883.6.4`), CPT-4 (`2.16.840.1.113883.6.12`), CVX (`2.16.840.1.113883.12.292`), UCUM (`2.16.840.1.113883.6.8`), NDC (`2.16.840.1.113883.6.69`), HL7 Administrative Gender, Marital Status, Race Category, Ethnicity (HL7-maintained).
- [ ] **CODE-02** — `CodedValue.codeSystemName` resolves via the OID registry when the OID is recognized; unresolved OIDs emit `CCDA_OID_NOT_RECOGNIZED` and leave `codeSystemName` undefined.
- [ ] **CODE-03** — `defineProfile({ oidRegistry: { ... } })` extends the registry for the scope of parses using that profile.

### Testing & Fixtures (TEST)

- [ ] **TEST-01** — `pnpm test --coverage` reports ≥ 90% line coverage on `src/parser/`, `src/model/`, `src/templates/`, `src/narrative/`, and `src/helpers/`.
- [ ] **TEST-02** — Canonical fixtures exist and round-trip losslessly for: CCD, Discharge Summary, Progress Note, H&P, Consultation Note, Referral Note, Operative Note, Procedure Note, Care Plan, Diagnostic Imaging, Unstructured Document, Transfer Summary. Each fixture is minimal but IG-valid. An additional fixture demonstrates the Patient Generated Document Header constraint is not rejected.
- [ ] **TEST-03** — Edge-case fixtures cover: BOM / no-BOM, Windows vs Unix line endings, `<?xml-stylesheet?>`-present vs absent, namespace-prefix variation (`cda:` vs default), mixed-content narrative (text + inline elements + tables), embedded HTML in narrative, base64 `<observationMedia>` attachment, null-flavor in required fields, unknown templateId, narrative-only section (no entries), unresolved IDREF, OID with unknown code system, cardinality violation in strict mode, `xsi:type` missing on observation value, `xsi:type` prefix resolving to a non-`urn:hl7-org:v3` namespace.
- [ ] **TEST-04** — Malformed documents throw `CCDAParseError` with descriptive position/snippet (not XML, no `<ClinicalDocument>` root, wrong namespace, empty input).
- [ ] **TEST-05** — `test/fixtures/vendor-quirks/` contains at least one fixture per Tier 2 scenario listed in TOL-03, each verified to emit the expected warning and still parse in lenient mode.
- [ ] **TEST-06** — Strict-mode escalation test: every Tier 2 vendor-quirks fixture throws `CCDAValidationError` under `{ strict: true }`.
- [ ] **TEST-07** — At least one fixture per built-in profile (`epic`, `cerner`, `meditech`, `athena`, `generic`, `carequality`, `commonwell`) demonstrates fewer warnings with the profile than without.
- [ ] **TEST-08** — Profile-authoring test suite covers: valid `defineProfile` output; `ProfileDefinitionError` cases; `extends` single + array; merge semantics per option category; default-profile set/get/opt-out; `profile.describe()`; `doc.profile` attribution; round-trip with custom profile.
- [ ] **TEST-09** — Template-authoring test suite covers: valid `defineTemplate` output; duplicate-registration throw + override; developer override of a built-in template; template lookup by templateId vs LOINC fallback.
- [ ] **TEST-10** — **Security fixtures.** `test/fixtures/security/` contains: XXE exfiltration attempt (file-URI + http-URI external entities), billion-laughs entity expansion, parameter-entity include, deeply-nested narrative (recursion bounds), oversized base64 attachment (> `maxDecodedBytes`), `<!DOCTYPE>` with internal subset, and a document whose error-path snippet would contain PHI if not redacted. Each fixture is verified to either parse safely (emitting the appropriate `CCDA_DTD_REJECTED` / `CCDA_DECODE_SIZE_EXCEEDED` / `CCDA_ENTITY_EXPANSION_EXCEEDED` warning or fatal-error-with-redacted-snippet) OR throw a `CCDAParseError` — and NEVER fetch an external resource, allocate > `maxDecodedBytes`, or leak PHI into a warning snippet.

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
- [ ] **DOC-03** — README has a feature list (6–8 bullets) highlighting developer-centric wins (one-line extraction, USCDI v3 helpers, vendor profiles, round-trip, strict-mode validation, PHI-safe warnings).
- [ ] **DOC-04** — README has a "C-CDA in 90 seconds" core-concepts section (ClinicalDocument → header + body; body = sections; sections have narrative + entries; templateId identifies structure; LOINC code identifies purpose; narrative-only sections are normal).
- [ ] **DOC-05** — README covers the three access patterns (named helpers / template-aware section access / raw document model via `section.rawXml`) with runnable examples.
- [ ] **DOC-06** — README Cookbook section contains recipes: extract problem list, build allergy summary, list current medications, pull the latest vitals panel, iterate immunizations, resolve a CodedValue through the OID registry, handle narrative ↔ entry mismatch, validate against the IG, register a custom Z-template via `defineTemplate`, author your first profile, extend a profile, publish a profile package, round-trip a document after modification, use `doc.summary()` for a single-call dashboard, use filter helpers (`byCode`, `byRoute`, `latest`, `activeAt`, `byDateRange`).
- [ ] **DOC-07** — README has a top-level "Templates & Profiles" section covering template authoring, profile authoring, merge semantics, inspection, publishing — not buried in API reference.
- [ ] **DOC-08** — README "Real-World Tolerance" section explains the 3-tier deviation model (silent / warn / fatal) with a compact table and a runnable warnings-iteration example.
- [ ] **DOC-09** — README "Error Handling" section covers `CCDAParseError`, `CCDAParseWarning`, `CCDAValidationError`, `ProfileDefinitionError`, `TemplateDefinitionError` with examples.
- [ ] **DOC-10** — README "Contributing" section points to `CONTRIBUTING.md` and invites vendor-quirk fixtures, template improvements, and standalone profile packages.
- [ ] **DOC-11** — README ends with "Built by [Cosyte](https://cosyte.com)" and a license link; cross-links to sibling package `@cosyte/hl7`.
- [ ] **DOC-12** — Roadmap / stretch-goals section documents the v2 deferrals (R1.1 support, Schematron validation, XMLDSig verification, PDF stylesheet rendering, FHIR conversion, DICOM SR ingestion, streaming parser, `doc.get(path)` XPath-subset, outbound construction for non-CCD document types, USCDI v3 demographic observations, Notes Section).
- [ ] **DOC-13** — "Publishing Your Profile" recipe links directly to `examples/profile-starter-kit/` and references `CUSTOMIZING.md`.
- [ ] **DOC-14** — `CHANGELOG.md` exists in Keep-a-Changelog format with an `[Unreleased]` section.
- [ ] **DOC-15** — `LICENSE` (MIT) exists at repo root.
- [ ] **DOC-16** — One ADR per runtime dependency exists under `.planning/adr/` (at minimum: the chosen XML parser). Each ADR states the decision, alternatives considered, licensing, maintenance signals (last release, weekly downloads, open-issue age, CVE history), the version floor chosen, and the bar it cleared. The XML-parser ADR explicitly mandates: (a) namespace-aware parsing with `(namespaceURI, localName)` tuple access; (b) mixed-content preservation with order; (c) DTD processing disabled by default; (d) a thin typed-accessor adapter contract in `src/xml/adapter.ts` so the underlying library can be swapped later; (e) pinned version floor above all known CVEs.
- [ ] **DOC-17** — `SECURITY.md` exists at repo root documenting the threat model (XXE, billion-laughs, DTD-driven request, oversized decode, PHI-in-logs), the defensive posture (DTD disabled, entity expansion bounded, decode-size bounded, snippets redacted by default), the supported-versions policy, and the private-disclosure email/contact.
- [ ] **DOC-18** — README "Security" section summarizes the defensive posture (DTD disabled, XXE prevented, decode caps, PHI-safe warnings) and links to `SECURITY.md`.

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
- **MODEL-05** — `doc.get('xpath-ish-path')` escape hatch (will land as a real XPath-1.0-subset spec, not a half-XPath)
- **Outbound construction for non-CCD document types** — SER-05 v1 ships CCD only; Discharge Summary / Care Plan / etc. builders deferred
- **USCDI v3 demographic observations** — Gender Identity Observation, Sexual Orientation Observation, Sex Parameter for Clinical Use Observation (templates deferred; raw XML still accessible via `section.rawXml`)
- **Notes Section (USCDI v3)** — narrative-heavy, low-leverage for typed extraction
- **Drug Vehicle entry template** — real but uncommon
- `narrative.toHtml()` / React rendering — security surface (XSS); Lantana's canonical CDA stylesheets already exist for this

## Out of Scope

- Plain CDA R2 documents that are not C-CDA-conformant — we're a C-CDA library, not a general CDA library
- HL7 v3 messaging — different spec family
- FHIR conversion — future companion package
- Exhaustive coded-value validation against full terminologies — we validate structure and known OIDs, not every SNOMED/LOINC table
- PHI redaction / de-identification — different problem space
- Clinical-decision-support inference (drug-interaction, allergy-interaction checks) — not what this library is
- SOAP/REST transport for IHE XDS.b retrieval — document parser, not document fetcher
- Narrative-to-HTML rendering — XSS surface; use Lantana's canonical CDA stylesheets
- C32 → C-CDA migration codecs — C32 is dead enough

---

## Traceability

Every v1 REQ-ID maps to exactly one phase in `ROADMAP.md`. **130 / 130 mapped** (no orphans, no duplicates). MODEL-05 is not counted (deferred to v2).

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
| PARSE-09 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-01 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-02 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-03 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-04 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-05 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-06 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-07 | Phase 2 — Core XML Parser & Tolerance | Pending |
| TOL-08 | Phase 2 — Core XML Parser & Tolerance | Pending |
| DOC-01h | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| DOC-02h | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| DOC-03h | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| DOC-04h | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| DOC-05h | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| DOC-06h | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| MODEL-01 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| MODEL-02 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| MODEL-03 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| MODEL-04 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| MODEL-06 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| MODEL-07 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| TYPES-01 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| TYPES-02 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| TYPES-03 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| TYPES-04 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| TYPES-05 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| TYPES-06 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| CODE-01 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| CODE-02 | Phase 3 — Document Header, Typed Model, Types & OIDs | Pending |
| TPL-01 | Phase 4 — Templates & Section Resolution | Pending |
| TPL-02 | Phase 4 — Templates & Section Resolution | Pending |
| TPL-03 | Phase 4 — Templates & Section Resolution | Pending |
| TPL-04 | Phase 4 — Templates & Section Resolution | Pending |
| TPL-05 | Phase 4 — Templates & Section Resolution | Pending |
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
| HELPERS-11 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-12 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-13 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-14 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-15 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-16 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
| HELPERS-17 | Phase 5 — Named Helpers & Narrative Reconciliation | Pending |
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
| BIP-07 | Phase 7 — Profile System & Built-ins | Pending |
| BIP-08 | Phase 7 — Profile System & Built-ins | Pending |
| CODE-03 | Phase 7 — Profile System & Built-ins | Pending |
| TEST-01 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-02 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-03 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-04 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-05 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-06 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-07 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-08 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-09 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| TEST-10 | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
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
| DOC-17d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |
| DOC-18d | Phase 8 — Testing Hardening, Examples, Starter Kit & Documentation | Pending |

**Coverage:** 130 / 130 v1 REQ-IDs mapped (MODEL-05 deferred to v2 and not counted).

Per-phase totals:
- Phase 1: 8 (SETUP × 6 + DOC-15d + DOC-16d)
- Phase 2: 17 (PARSE × 9 + TOL × 8)
- Phase 3: 20 (DOC-h × 6 + MODEL × 6 + TYPES × 6 + CODE × 2)
- Phase 4: 5 (TPL × 5)
- Phase 5: 21 (HELPERS × 17 + NARR × 4)
- Phase 6: 5 (SER × 5)
- Phase 7: 18 (PROF × 9 + BIP × 8 + CODE-03)
- Phase 8: 36 (TEST × 10 + EX × 3 + KIT × 7 + DOC-d × 16)
- **Total:** 130

---

*Last updated: 2026-04-22 (research-pass revision — 15 REQs added, 9 modified, 1 deferred to v2, CODE-01/02 moved to Phase 3, CODE-03 moved to Phase 7).*
