# FEATURES — `@cosyte/ccda` v1 Analysis

**Confidence:** MEDIUM-HIGH on existing-tooling survey (npm + GitHub directly verified). MEDIUM on USCDI v3/v4 alignment (HL7 source pages 403'd to WebFetch; relied on aggregator sources). LOW-MEDIUM on vendor-specific quirks (vendor docs are gated; relied on integration-blog second-hand sources).

---

## 1. Existing Tooling Survey

### Comparison Matrix

| Library | Last release | Language | License | Stars / DL | Strength | Failure mode |
|---|---|---|---|---|---|---|
| **`@medplum/ccda`** | Active (multiple 2025 releases) | TypeScript | Apache-2.0 | Part of medplum monorepo (4k+ stars) | Built around C-CDA ↔ FHIR conversion via IPS bridge; clean function API (`convertXmlToCcda`, `convertCcdaToXml`, `convertCcdaToFhir`, `convertFhirToCcda`); actively maintained; FHIR R4 / US Core / USCDI / IPS / C-CDA aligned | **Lossy by design** — pivots through FHIR/IPS, so vendor narrative quirks, non-USCDI sections, and entry/narrative reconciliation are not its job. No "give me the patient's active problems in one line" surface — you transform to FHIR first. Tight coupling to medplum core types. |
| **`@amida-tech/blue-button`** | v1.10.9 (~Aug 2025), but core architecture is ~10y old | JavaScript (no TS) | Apache-2.0 | npm exists; original `blue-button` package abandoned 9y | Detects doc type, parses C32 + CCDA + CMS Blue Button + VA + format-x; broad section coverage (demographics, vitals, meds, problems, immunizations, results, allergies, encounters, procedures, social history, plan of care, payers); generator + parser | No TypeScript types, callback-style API, custom pseudo-XPath template DSL inherited from `blue-button-xml` is opaque, no narrative reconciliation, no vendor profile system, no warning codes — just throws or silently drops. Considered "the one that exists" but not loved. |
| **`jmandel/ccda-to-json`** | Last meaningful commit ~2014 (6 commits, 37 stars) | JavaScript | Apache-2.0 | 37 stars, 17 forks | Historically influential (Josh Mandel = SMART Health IT); has corpus of sample CCDAs in sibling repo | **Effectively abandoned.** Depends on `libxmljs` (native build pain on Node 18+/22+/Apple Silicon), `xdate`, `optimist`, `underscore`, `node-uuid`. Not on npm under this name; published as `ccda-parser@0.0.1` placeholder. |
| **`@redoxengine/redox-hl7-v2`** | Active | TypeScript | Apache-2.0 | (HL7v2 not C-CDA) | Schema-fied JSON output for HL7v2 | **Not a C-CDA library.** Redox handles C-CDA inside its API platform, not as a published parser. The SDK gap is real. |
| **`onc-healthit/ccda-parser`** | Java / WAR deployment | Java | OSS | (low) | ONC reference implementation; backs the certification validator | Not a Node library; deploy-as-server only; intended for validation not extraction. |
| **`microsoft/FHIR-Converter`** | Active (Microsoft + community) | C# / Liquid templates | MIT | (used inside Azure Health Data Services) | Liquid-template-driven C-CDA→FHIR; VS Code extension for template editing | **Conversion-first, not extraction-first.** Requires .NET runtime or Azure host; templates are themselves a debugging surface; date timezone-mangling and "may produce resources without IDs" are documented limitations; not supported by Microsoft. No "extract problem list" path. |
| **Lantana stylesheets / validator** | Active 2024 | Java + XSLT | OSS | — | Authoritative validator (`onc-healthit/reference-ccda-validator` v3.1.77 added USCDIv3 vocab validation 2024-03-26); CDA stylesheets render documents in browsers | Validation/render only; not a programmatic extraction API. |
| **`mansooralam/ccda-parser`, `MemoirHealth/ccda-parser`** | Python | OSS | — | low | — | Both abandoned; MemoirHealth's README says "largely unstable, ported to C++". |
| **`UHIN/ccda-parser-library`** | PHP/Composer | OSS | — | low | — | PHP-only, low downloads, regional. |
| **`dhananjaykadam/ccd-parser`** | Java | OSS | — | low | "Supports major EMR" claim, string + file inputs | Java; no Node story. |
| **`bluebutton.js`** (`amida-tech` predecessor) | Last meaningful release ~2014 | JavaScript | Apache-2.0 | older than time | Pioneer | Abandoned. |

### The DX Gap `@cosyte/ccda` Should Fill

Three observations the matrix makes:

1. **Every active maintained Node library is FHIR-conversion-first.** `@medplum/ccda` is the only credible 2025-vintage TS option, and it pivots through FHIR. Nothing in the JS ecosystem says "you have a real Epic CCD; give me `doc.problems.active` in one line" without first converting to FHIR. That is the wedge.
2. **The good extraction-first libraries are abandoned.** BlueButton and ccda-to-json defined the expected DX (helper-style getters, normalized JSON) but stopped maintenance ~2014. Their template DSL is the right idea; nobody has shipped a typed, currently maintained version of it.
3. **Validation is solved (Lantana / ONC), conversion is solved (Medplum / Microsoft), extraction is unsolved.** Don't compete on validation depth or FHIR mapping completeness — both have entrenched, well-resourced incumbents. Compete on the Postel's-Law-lenient extraction path no one currently maintains.

This validates the existing PROJECT.md "Core Value." The market gap is real.

---

## 2. Document Types — Drop-or-Add Analysis

The 12-document list in REQUIREMENTS DOC-01 is **mostly right but slightly stale**. Findings:

- **C-CDA v4.0.0 (2024) explicitly lists 11 document types**, not 12. Diagnostic Imaging Report (DIR) is **not** in the v4.0.0 main document constraints page — it lives in C-CDA R2.1 / R2.2 with templateId `2.16.840.1.113883.10.20.22.1.5` but was not carried forward as a primary document constraint into v4. DIR remains valid for receivers (you'll see them in production from radiology systems and PACS-driven workflows), but it's a minority case. **Keep DIR in v1** — radiology integrations are real and "we don't parse DIR" is an awkward limitation — but mark internally as lower-priority for fixture-investment.

- **"Patient Generated Document" is a header constraint, not a document body type.** It's `2.16.840.1.113883.10.20.22.1.16` (Patient Generated Document Header). Real-world adoption in EHRs is **low** as of 2026 (it's specified for patient-portal-uploaded documents, e.g. patient-completed PHQ-9). I would **NOT** add this as a separately listed document type in DOC-01. Instead, add a note in DOC-02 that the templateId array can carry that header constraint and the library should expose it (already covered by `doc.templateIds`).

- **"Care Plan" adoption is genuine in 2026.** ONC §170.315(b)(9) Care Plan certification criterion has been live since 2015; HTI-1 mandates USCDI v3 by Jan 1 2026. Care Plan documents are emitted by certified EHRs for transitions of care. **Keep as v1.**

- **Operative Note: keep.** Surgical specialties emit it; required by some accreditation workflows.

- **"Unstructured Document" (`2.16.840.1.113883.10.20.21.1.10`): keep, but with clear scope.** It's a wrapper around a base64-encoded PDF/RTF/text. The library should: (a) detect the type, (b) expose the `nonXMLBody` element with mediaType + the raw bytes via the same lazy-attachment path PARSE-06 already covers. Do NOT parse the PDF itself. This is a 1-day implementation that prevents "your library threw on this CCD" complaints.

- **Missing from DOC-01:** Nothing critical. The 12 listed (minus PGHD) cover ~99% of documents you'll see. DO NOT add PGHD. DO NOT add separate "Referral Note" / "Consultation Request" splits — they share templateIds in practice.

**Concrete recommendation for DOC-01:** Drop nothing; add nothing. The list is correct. But the spec should make explicit that "diagnostic-imaging" and "unstructured-document" are second-tier (good detection + structural pass-through; helpers don't apply meaningfully) so phase plans can right-size investment.

---

## 3. Section + Entry Templates — Minimum Viable Set

### Sections — TPL-01 gaps

REQUIREMENTS TPL-01 lists Problem, Medications, Allergies, Immunizations, Results, Vitals, Encounters, Procedures, Social History, Plan of Treatment, Assessment, "plus the rest of the R2.1 core set." That trailing phrase is doing too much work — it hides real obligations. The Discharge Summary alone needs sections that aren't in any other doc type:

**Sections that MUST be enumerated, not glossed under "the rest":**

Discharge Summary specifics:
- **Hospital Course Section** (`1.3.6.1.4.1.19376.1.5.3.1.3.5`) — IHE-rooted OID, narrative-heavy
- **Hospital Discharge Diagnosis Section (V3)** (`2.16.840.1.113883.10.20.22.2.24`)
- **Discharge Medications Section (entries required) (V3)** (`2.16.840.1.113883.10.20.22.2.11.1`)
- **Hospital Discharge Instructions Section** (`2.16.840.1.113883.10.20.22.2.41`)
- **Hospital Discharge Studies Summary Section**
- **Hospital Admission Diagnosis Section** + **Admission Medications Section**

H&P specifics:
- **Chief Complaint Section** (or **Chief Complaint and Reason for Visit Section**)
- **History of Present Illness Section**
- **Past Medical History Section**
- **Family History Section** (also USCDI-relevant)
- **Review of Systems Section**
- **Physical Exam Section**

Care Plan specifics:
- **Health Concerns Section** (`2.16.840.1.113883.10.20.22.2.58`)
- **Goals Section** (`2.16.840.1.113883.10.20.22.2.60`)
- **Interventions Section (V3)** (`2.16.840.1.113883.10.20.22.2.61.1`) — **certification requires this for Care Plan**
- **Health Status Evaluations and Outcomes Section** (`2.16.840.1.113883.10.20.22.2.61` variants) — **certification requires this for Care Plan**
- **Nutrition Section**

Operative Note specifics:
- **Anesthesia Section**, **Complications Section**, **Postoperative Diagnosis Section**, **Preoperative Diagnosis Section**, **Procedure Description Section**, **Procedure Findings Section**, **Procedure Specimens Taken Section**, **Procedure Disposition Section**, **Procedure Indications Section**, **Estimated Blood Loss Section**, **Surgical Drains Section**, **Planned Procedure Section**, **Procedure Implants Section**

Diagnostic Imaging:
- **Findings Section**, **Reason for Visit Section** (DIR-specific), **DICOM Object Catalog Section**

USCDI v3 / Companion Guide R4.1 add:
- **Mental Status Section** (USCDI v3 surfaces cognitive/behavioral data)
- **Notes Section** (clinical notes class in USCDI v3)
- **Goals Section** (USCDI v3 makes goals first-class)
- **Health Concerns Section** (USCDI v3)
- **Reason for Referral Section**
- **Advance Directives Section (V3)** + **Functional Status Section (V2)** + **Mental Status Section (V2)**

**Concrete recommendation: rewrite TPL-01 as an explicit enumerated list, not "the rest." Otherwise this REQ is a moving target during Phase 4.** Group by document type so phase plans can validate completeness against the 12 doc types' required sections.

### Entries — TPL-02 gaps

Reviewing TPL-02 against the actual R2.1 IG, you have **conflations**:

- **You list "Allergy–Intolerance Observation" but not "Reaction Observation" separately.** These are distinct templates (`2.16.840.1.113883.10.20.22.4.7` vs. `2.16.840.1.113883.10.20.22.4.9`). Allergy-Intolerance Observation is the parent (substance + negation); Reaction Observation is the child (manifestation). Both ship.
- **"Severity Observation"** (`2.16.840.1.113883.10.20.22.4.8`) is its own template, used inside both Reaction and Problem. Add it.
- **"Indication"** (`2.16.840.1.113883.10.20.22.4.19`) is its own template — used inside Medication Activity (the indication for the prescription) and inside Procedure Activity. Add it explicitly; otherwise medication-with-indication semantics get lost.
- **"Drug Vehicle"** (`2.16.840.1.113883.10.20.22.4.24`) — separate template for the carrier (e.g., saline solution). Real but uncommon. **DEFER to v2.**
- **"Medication Information"** (`2.16.840.1.113883.10.20.22.4.23`) — drug substance metadata wrapper, properly distinct from Medication Activity. You already list it; good.
- **"Medication Supply Order"** (`2.16.840.1.113883.10.20.22.4.17`) — fills/refills information. Add (or explicitly defer).
- **"Encounter Diagnosis (V3)"** (`2.16.840.1.113883.10.20.22.4.80`) — a wrapper organizing Problem Observations within an encounter. Add; otherwise `doc.encounters[].diagnoses[]` (HELPERS-07) can't be implemented cleanly.
- **"Service Delivery Location"** (`2.16.840.1.113883.10.20.22.4.32`) — referenced by encounters and procedures. Add.
- **"Performer Participation"** wrappers — minor; defer.
- **"Healthcare Provider"** / **Author Participation** — header-level participants; separate from entry templates but relevant. Already covered by DOC-05h.
- **Care Plan entries you list** ("Care Plan Goal/Intervention") need to be: **Goal Observation** (`2.16.840.1.113883.10.20.22.4.121`), **Intervention Act (V2)** (`2.16.840.1.113883.10.20.22.4.131`), **Health Concern Act (V2)** (`2.16.840.1.113883.10.20.22.4.132`), **Outcome Observation (V2)** (`2.16.840.1.113883.10.20.22.4.144`). Name each.

USCDI v3 / Companion Guide R4.1 adds (verified via 2024 ONC validator update):
- **Sex Parameter for Clinical Use Observation** — USCDI v3 added gender identity, sexual orientation, sex parameter. Companion Guide R4.1 entries.
- **Gender Identity Observation** + **Sexual Orientation Observation** — these are USCDI v3 mandatory data elements; add explicit entry support.
- **Specimen Type Observation** — added in C-CDA Validator v3.1.77 (March 2024) for USCDIv3 vocab validation.

**Concrete recommendation: rewrite TPL-02 with the same enumerated-list rigor as TPL-01. Add Indication, Reaction, Severity, Encounter Diagnosis, Service Delivery Location, the four Care Plan entries (Goal/Intervention/Health Concern/Outcome), and the three USCDI v3 demographic observations (Gender Identity, Sexual Orientation, Sex Parameter for Clinical Use). Defer Drug Vehicle.**

---

## 4. Named Helpers — DX Comparison

The proposed surface is broadly idiomatic and mirrors `@cosyte/hl7`'s validated DX (which shipped 9 helpers across `msg.meta`/`msg.patient`/`msg.visit`/`msg.observations()`/`msg.orders()`/`msg.nextOfKin()`/`msg.allergies()`/`msg.diagnoses()`/`msg.insurance()`). Two specific divergences from hl7-parser worth flagging:

### Active vs. all vs. resolved — getter or filter?

The hl7-parser equivalent uses a single zero-arg method (`msg.observations()`) returning the full set, and developers filter. The CCDA spec proposes **named getters** (`doc.problems.active`, `doc.problems.all`, `doc.problems.resolved`).

**Recommendation: keep named getters.** Reason: in HL7v2 the consumer is processing one event at a time (one ADT, one ORU); filtering is natural. In CCDA the consumer is querying a longitudinal record snapshot; "active problems" is the dominant query (that's what 90% of dashboards show). Forcing developers to write `doc.problems.all.filter(p => p.status === 'active')` every time is exactly the friction the library exists to remove. Also, `active` has known status-code matching logic (active vs. completed vs. aborted vs. suspended; SNOMED 55561003 vs. 73425007) that should live in the library, not in user code. The named getter is correct.

But add **filter helpers as well** — they aren't redundant, they cover the long tail. Specifically add to HELPERS-XX:

- `doc.problems.byCode(snomedCode | loincCode | code)` — returns problems matching any code system; takes either a string or `{ code, codeSystem }`
- `doc.medications.byRoute(routeCode)` — UCUM-aware; constant pain point in practice
- `doc.medications.activeAt(date)` — point-in-time query; needed for "what was the patient on at admission?"
- `doc.results.byCategory(loincCategory)` — group by lab panel
- `doc.results.byCode(loincCode)` — get all instances of "Hemoglobin" over time
- `doc.results.latest(loincCode)` — most recent value of a specific test
- `doc.allergies.active` (mirror problems pattern)
- `doc.encounters.byDateRange(from, to)`

### `doc.summary()` rollup

YES. This is a small differentiator with outsized DX value. Spec a dedicated REQ:

**HELPERS-NEW** — `doc.summary()` returns an object with `{ patient: {mrn, name, dob, sex, age}, activeProblems: CodedValue[], currentMedications: string[], allergies: string[], lastVitals: VitalsPanel, recentResults: {loinc, value, units, when}[], lastEncounter: {when, type, location} }`. One call returns the dashboard.

Pattern matches what every real consumer writes by hand on day 1.

### Other helper additions worth considering

- `doc.familyHistory` (USCDI v3 makes this required)
- `doc.advanceDirectives` (USCDI v3)
- `doc.functionalStatus` (USCDI v3)
- `doc.mentalStatus` (USCDI v3)
- `doc.healthConcerns` (Care Plan + USCDI v3)
- `doc.goals` (Care Plan + USCDI v3)
- `doc.interventions` (Care Plan)
- `doc.notes` (USCDI v3 Clinical Notes — narrative-heavy)
- `doc.demographics.genderIdentity` / `doc.demographics.sexualOrientation` / `doc.demographics.sexForClinicalUse` (USCDI v3 mandatory)

Not all should be v1. **TABLE STAKES additions: `doc.familyHistory`, `doc.advanceDirectives`, `doc.functionalStatus`, `doc.healthConcerns`, `doc.goals`.** These are USCDI v3 and Care Plan certification-required; not having them = "doesn't support modern certified-EHR output."

**DEFER to v2:** `doc.demographics.{genderIdentity, sexualOrientation, sexForClinicalUse}`, `doc.notes`. They're real but lower-frequency in early adoption.

---

## 5. Narrative ↔ Entry Reconciliation — Contract Critique

### Real-world EHR behavior

Verified pattern (Lantana "CDA in the Wild" series + Medplum docs + Carequality "Concise Consolidated CDA" 2022 paper): **entry-narrative parity is rarely complete in the wild.** Specifically:

- **Epic**: Generally good entry/narrative parity but adds custom narrative tables that don't fully match entries.
- **Cerner/Oracle Health**: Good entry coverage, narrative often auto-generated from entries (so they match by construction); custom Z-templates appear with `extension` attribute variations.
- **Meditech**: Frequent narrative-only sections, especially for History of Present Illness, Hospital Course, Physical Exam — entries simply absent.
- **athenahealth**: Documented pattern of narrative-only sections in some areas; HPI and assessment narratives commonly lack matched entries.
- **Smaller / older / regional EHRs**: Often the entries lag the narrative; narrative is the "truth."

**Conclusion: narrative-only sections are not edge cases — they are a primary case.** This is already in TOL-03 as `CCDA_NARRATIVE_ONLY_SECTION` (good). The reconcile API needs to handle it as a normal output, not a degraded state.

### Is `section.reconcile()` the right shape?

Mostly yes, but two refinements:

1. **Don't make it a method that the user has to call.** The reconciliation map should be **pre-computed lazily on first access** of `section.entries[N].linkedNarrative` or `section.unmatchedEntries` or `section.orphanNarrative`. Reason: if it's a method, devs forget to call it and `CCDA_NARRATIVE_ENTRY_MISMATCH` warnings never surface. If it's lazy on access, the warning fires the moment a developer asks the question.

2. **Reconciliation result needs a fourth bucket, not three.** NARR-02 lists `matchedEntries`, `unmatchedEntries`, `orphanNarrative`. Add **`narrativeOnlySection`** as a section-level boolean — a section with a `<text>` and zero entries should be queryable as `section.isNarrativeOnly` without iterating. This is the single most common reconciliation question in practice.

### Mismatch policy

Current spec says mismatches fire `CCDA_NARRATIVE_ENTRY_MISMATCH` warning. **Keep as warning by default; escalate in strict.** Don't make this an error — too noisy in practice (every Epic doc has at least one narrative table cell that doesn't textually match a `<doseQuantity>` because units are abbreviated differently). The warning + both-values-exposed is correct.

### NARR-03 needs a tightening

"narrative text conflicts with its structured value" is too vague to test. Real conflict-detection requires per-entry-type rules (e.g., medication: dose+units in narrative vs. doseQuantity; problem: code displayName vs. narrative text). Spec the conflict-detection scope: **for v1, only fire the warning on (a) medication dose mismatches, (b) problem code-displayName vs narrative-text mismatches when narrative-text is non-empty, (c) result value-numeric mismatches.** Everything else is too noisy or too expensive to compute.

---

## 6. Profiles — What Production Integrations Actually Differ On

**Confidence: LOW-MEDIUM.** Vendor C-CDA conformance docs are gated. The following is synthesized from open developer-portal pages, Lantana "CDA in the Wild" posts, and integration-blog second-hand sources.

### Per-vendor top quirks (best evidence)

**Epic (`profiles.epic`):**
- MRN OID: `1.2.840.114350.1.13.{customer}.1.7.5.737384.14` family — every Epic instance has a customer-specific OID rather than a single global Epic OID. Profile must do **OID-pattern recognition** (`1.2.840.114350.1.13.*`) rather than literal OID matching to identify "this is an Epic MRN."
- `assigningAuthorityName` typically `"EPI"` for the MRN.
- Care Everywhere documents add Epic-specific stylesheet PIs.
- Often emits multiple `<id>` elements on patient (`recordTarget/patientRole/id`) — MRN, Care Everywhere ID, FHIR ID, sometimes payer ID. Profile should pick the MRN per OID-pattern, not by position.

**Cerner / Oracle Health (`profiles.cerner`):**
- ISO-8601 datetime format with `T` separator in some sections (deviation from HL7 TS basic format).
- Custom Z-templates with extensions like `_ZID`, `_ZNT`.
- Powerchart millennium customer-specific OIDs in `2.16.840.1.113883.3.13.6` family for some institutional identifiers.
- Often emits empty `<entry>` wrappers around null-flavor observations rather than omitting the entry.

**Meditech (`profiles.meditech`):**
- Date format `YYYYMMDDHHmm` (minute precision, no seconds) frequent.
- Narrative-heavy: HPI, hospital course, physical exam often narrative-only.
- Less rigorous templateId compliance — sometimes only roots, no extensions.

**athenahealth (`profiles.athena`):**
- Date format `MM/DD/YYYY` and `MM/DD/YYYY HH:mm:ss` (human-format dates, requires `dateFormats` fallback path).
- Documented narrative-only assessment / plan sections.
- Custom OIDs in `2.16.840.1.113883.3.564` family.

**Generic (`profiles.generic`):**
- Catch-all: relaxed templateId-extension matching (root-only OK), permissive date parsing, broader OID-recognition for known-but-uncategorized vendor OIDs (NextGen, eClinicalWorks, Allscripts, Greenway, athenaPractice).

### Add a regional-HIE profile category? — YES.

Carequality and CommonWell explicitly have C-CDA standardization initiatives ("Concise Consolidated CDA" 2022 paper from Carequality) and they introduce their own conventions:

- **Carequality** docs frequently include **External Document Reference** templates linking back to source documents in the network — profile should not emit `CCDA_UNKNOWN_TEMPLATE_ID` for those.
- **CommonWell** patient-record locator IDs use specific OID family (`2.16.840.1.113883.3.3330.*`).
- **eHealth Exchange** docs carry network-specific custodian patterns.

**Concrete recommendation: add `BIP-07` for `profiles.carequality` and `BIP-08` for `profiles.commonwell`.** These are not "extra credit" — they cover the dominant national HIE traffic. Without them, every CCD pulled from Carequality/CommonWell looks "quirky" to your library and emits warnings the dev has to handle. Two more profiles is small effort and meaningfully expands real-world coverage.

Do NOT add `profiles.eHealthExchange` separately — its docs largely overlap Carequality. Cover it with the generic profile.

---

## 7. Anti-Features — What to NOT Build in v1

### Confirm existing Out-of-Scope (all correct)

- C-CDA R1.1 — correct
- Plain CDA R2 non-C-CDA — correct
- HL7 v3 messaging — correct
- FHIR conversion — correct (and important: `@medplum/ccda` already owns this lane; competing here is a category mistake)
- DICOM SR ingestion — correct
- Schematron validation — correct (Lantana / ONC own this; you can't beat them in v1)
- XMLDSig verification — correct
- PDF rendering — correct

### Add to Anti-Features (currently in scope but should be punted)

1. **`MODEL-05` — `doc.get('xpath-ish-path')` "simplified XPath-ish" escape hatch.** This is a misshapen API. Either:
   - You build a real XPath subset (work, debt, surface area), or
   - You don't (developers reach for the underlying XML node directly).

   **Recommendation: drop MODEL-05 from v1.** Replace with a documented escape hatch: `section.rawXml` (already in MODEL-03) + an exported `parseXml` helper that returns the underlying parser's node tree. If a developer has a problem the helpers don't cover, give them the actual XML, not a half-XPath. **DEFER to v2** with a real XPath subset spec.

2. **`SER-05` — `buildDocument({type, patient, ...}).addSection(...).addEntry(...).toString()` outbound construction API.** This is a substantial deliverable — building C-CDA from scratch requires emitting valid templateIds, narrative blocks, all the RIM scaffolding, namespaces, plus matching the IG cardinality you don't enforce on parse. The hl7-parser has the equivalent (`buildMessage`) and it took meaningful effort even in HL7v2's flat structure.
   - **Recommendation: NARROW the scope.** Keep `buildDocument` for **CCD only** in v1 (the highest-leverage doc type for outbound). Defer Discharge Summary / Care Plan / etc. construction to v2. Otherwise this REQ is a phase-blocker. Or: punt entirely and ship a `examples/build-minimal-ccd.ts` that uses string templating to produce the smallest valid CCD — not a real builder API.

3. **`HELPERS-09` smoking-status meaningful-use entry — keep, but rename the surface.** `doc.socialHistory.smoking` is fine; just be aware that in 2026, smoking status as a stand-alone first-class field is increasingly USCDI-redundant (it's now part of broader Social Determinants of Health observations). Don't break the API around it; keep the named getter; but also expose `doc.socialHistory.byLoinc(loincCode)` for the broader SDOH set.

4. **`SER-04` `prettyPrint()`** — keep but timebox. Pretty-print of a 50-section CCD becomes its own "what should I show?" UX rabbit hole. Spec it tightly: header summary line + per-section "Section Name (templateId): N entries" + helper-rollup line ("Active problems: 4, Current medications: 7, Allergies: 2"). Anything richer is YAGNI.

5. **`HELPERS-06` vitals as a fixed panel.** "Typical panel: BP, HR, RR, temp, SpO2, weight, height, BMI" is a brittle list. EHRs emit pain scores, head circumference, oxygen flow rates, BSA, MAP, etc. **Recommendation: keep `doc.vitals.latest` returning the conventional panel as a typed object, but make it return undefined for slots not present (don't fabricate), AND add `doc.vitals.byLoinc(code)` + `doc.vitals.all` as the escape paths.**

### Other strong-anti-features for v1

- **No PHI redaction / de-identification.** Out of scope. Different problem space.
- **No clinical-decision-support inference** (e.g., "this med-allergy combo is dangerous"). Out of scope. Not what this library is.
- **No SOAP/REST transport for IHE XDS.b retrieval.** Out of scope. Document parser, not document fetcher.
- **No HTML / React rendering of narrative.** Stylesheet PI is preserved; consumers can apply XSLT if they want. Ship `narrative.toHtml()`? **NO** — it's a security surface (the SMART Health IT 2014 disclosure documented exactly this category of XSS), and Lantana already publishes the canonical CDA stylesheets.
- **No migration codecs (C32 → C-CDA).** Out of scope. C32 is dead enough.

---

## 8. Three One-Line "Why Pick This Over a Java Pipeline" Wins

For the README hero pitch, the three highest-leverage demonstrations:

1. **`doc.summary()` returns a one-shot dashboard object in 5 lines of TS.**
   ```ts
   const doc = parseCCDA(xml);
   console.log(doc.summary());
   // { patient: {...}, activeProblems: [...], currentMedications: [...],
   //   allergies: [...], lastVitals: {...}, recentResults: [...] }
   ```
   No XPath, no Mirth channel, no Liquid templates. The Java/Mirth equivalent is dozens of lines plus runtime infrastructure.

2. **Lenient parsing of a real Epic Care Everywhere CCD with quirks surfaces them as warnings, not errors:**
   ```ts
   const doc = parseCCDA(realEpicCcd, profiles.epic);
   doc.problems.active;            // works
   doc.warnings.find(w => w.code === 'CCDA_NARRATIVE_ENTRY_MISMATCH')
   ```
   The Lantana/ONC validator says "INVALID" and stops. A hand-rolled Java parser throws. `@cosyte/ccda` extracts what it can, surfaces quirks as data, and lets the developer decide.

3. **Profile authoring + publishing in a single starter-kit `pnpm publish`.**
   `@cosyte/ccda-carequality`, `@cosyte/ccda-mychart-customer-1234`, `@hospital/ccda-internal-profile` — every published profile package compounds. The Java alternative is forking MDHT.

If you can't demonstrate these three in <30 lines of README copy, the value prop hasn't landed.

---

## Categorization — Ruthless Sort by REQ-ID

### TABLE STAKES (must ship v1; library rejected without it)
- **All of SETUP, PARSE, TOL** — foundation; spec is correct.
- **DOC-01h..DOC-06h, MODEL-01..MODEL-04, MODEL-06, MODEL-07** — typed model.
- **TYPES-01..TYPES-06** — composite data types.
- **TPL-01, TPL-02, TPL-03, TPL-04, TPL-05** — but TPL-01 and TPL-02 must be **rewritten as enumerated lists** (see §3 above) including: Hospital Course, Hospital Discharge Diagnosis, Discharge Medications (entries required), Hospital Discharge Instructions, Chief Complaint, History of Present Illness, Past Medical History, Family History, Review of Systems, Physical Exam, Health Concerns, Goals, Interventions (V3), Health Status Evaluations and Outcomes, Operative Note section family, Findings (DIR), and the entry templates: Reaction Observation, Severity Observation, Indication, Encounter Diagnosis (V3), Service Delivery Location, Goal Observation, Intervention Act (V2), Health Concern Act (V2), Outcome Observation (V2).
- **CODE-01..CODE-03** — OID registry.
- **HELPERS-01..HELPERS-08, HELPERS-10** — core helpers.
- **NARR-01, NARR-02, NARR-04** — narrative is a credibility gate.
- **SER-01, SER-02, SER-03** — round-trip is non-negotiable.
- **PROF-01..PROF-09** — profile system.
- **BIP-01..BIP-06** — five built-in profiles.
- **TEST-01..TEST-09** — coverage discipline.
- **EX-01..EX-03** — runnable examples.
- **All KIT-XX** — starter kit.
- **All DOC-XXd** — documentation.

### DIFFERENTIATORS (worth shipping for competitive edge)
- **NEW REQ — `doc.summary()` rollup helper** — single-call dashboard. Explicitly add.
- **NEW REQ — filter helpers** (`byCode`, `byRoute`, `byCategory`, `latest(code)`, `activeAt(date)`) per HELPERS-01..08.
- **NEW REQ — `doc.familyHistory`, `doc.advanceDirectives`, `doc.functionalStatus`, `doc.healthConcerns`, `doc.goals`** — USCDI v3 + Care Plan certification helpers.
- **NEW REQ — `BIP-07 profiles.carequality`, `BIP-08 profiles.commonwell`** — national HIE profiles.
- **NEW REQ — `section.isNarrativeOnly` boolean** + lazy reconciliation on access (refines NARR-02).
- **NARR-03 narrowed** — fire mismatch warnings only on three defined entry-type categories (medication doses, problem code/text, numeric result values). Otherwise too noisy.
- Profile starter kit (already TABLE STAKES) is also a differentiator vs. every competitor.

### ANTI-FEATURES (deliberately do NOT build)
- C-CDA R1.1 (already excluded).
- FHIR conversion (already excluded; reinforced — Medplum owns this lane).
- Schematron / XMLDSig / PDF rendering (already excluded).
- HTML rendering of narrative (XSS surface; Lantana's stylesheets exist).
- PHI redaction / de-identification.
- IHE XDS.b transport.
- C32 → C-CDA migration.
- Clinical decision support / drug-interaction inference.

### DEFER TO v2 (worth eventually; punt v1)
- **`MODEL-05` (`doc.get('xpath-ish-path')`)** — drop in v1; defer with a real XPath subset spec.
- **`SER-05` (`buildDocument` outbound construction)** — narrow to CCD-only in v1 OR drop entirely. As written, this is the largest single phase risk after TPL-01/TPL-02.
- **Drug Vehicle entry template** (`2.16.840.1.113883.10.20.22.4.24`).
- **`doc.demographics.{genderIdentity, sexualOrientation, sexForClinicalUse}`** — USCDI v3 data classes; real but lower-priority adoption signal.
- **`doc.notes` (Clinical Notes section)** — narrative-heavy, low-leverage for typed extraction.
- **Patient Generated Document Header support** (already not listed; correct to keep deferred).
- Streaming parser (already deferred).
- Typed document-type overlays (already deferred).
- JSON Schema / Zod emission (already deferred).

---

## Specific Spec-Edit Recommendations (Concrete REQ-ID Changes)

| REQ-ID | Action | Reason |
|---|---|---|
| `DOC-01h` | Keep 12-doc list; add internal note: DIR + unstructured-document are second-tier (detection + structural pass-through; helpers don't apply) | Right-size phase plan investment |
| `MODEL-05` | **DROP from v1, defer to v2.** Document `section.rawXml` as the escape hatch instead. | Half-XPath is a worse API than raw XML access |
| `TPL-01` | **REWRITE as explicit enumerated list** with all sections named in §3 above, grouped by document type | "Plus the rest" is a moving target during Phase 4 |
| `TPL-02` | **REWRITE as explicit enumerated list** adding Reaction Observation, Severity Observation, Indication, Encounter Diagnosis V3, Service Delivery Location, Goal Observation, Intervention Act V2, Health Concern Act V2, Outcome Observation V2 | Conflations and gaps; Care Plan certification requires the V2 entries |
| `HELPERS-NEW-1` | **ADD `doc.summary()` rollup** | Single-call dashboard; differentiator |
| `HELPERS-NEW-2` | **ADD filter helpers**: `doc.problems.byCode(...)`, `doc.medications.byRoute(...)`, `doc.medications.activeAt(...)`, `doc.results.byCategory(...)`, `doc.results.byCode(...)`, `doc.results.latest(...)`, `doc.encounters.byDateRange(...)` | High-frequency long-tail queries |
| `HELPERS-NEW-3` | **ADD USCDI v3 / Care Plan helpers**: `doc.familyHistory`, `doc.advanceDirectives`, `doc.functionalStatus`, `doc.healthConcerns`, `doc.goals` | Required by certified-EHR output |
| `HELPERS-06` | Keep `doc.vitals.latest` typed panel; **add `doc.vitals.byLoinc(code)`** and `doc.vitals.all` | Brittle fixed panel |
| `HELPERS-09` | Keep `doc.socialHistory.smoking`; **add `doc.socialHistory.byLoinc(code)`** for broader SDOH | Future-proof for SDOH expansion |
| `NARR-02` | **Refine: lazy on access, not method-call.** Add `section.isNarrativeOnly` boolean. | Method-call is forgotten; warnings never surface |
| `NARR-03` | **Narrow scope explicitly** to three entry-type mismatch categories | Too noisy as written |
| `SER-05` | **Narrow to CCD-only in v1**, OR drop entirely and ship a stringly-typed example | Biggest single phase-blocker risk |
| `BIP-NEW-1` | **ADD `BIP-07 profiles.carequality`** | Dominant national HIE profile |
| `BIP-NEW-2` | **ADD `BIP-08 profiles.commonwell`** | Dominant national HIE profile |
| `TEST-02` | Add Patient Generated Document Header presence to fixture set as "exotic case the parser doesn't choke on" | Defensive coverage |

---

## Sources

Web-verified (HIGH-MEDIUM confidence):
- @medplum/ccda — npm package
- Medplum C-CDA documentation
- @amida-tech/blue-button — npm
- amida-tech/blue-button — GitHub
- jmandel/ccda-to-json — GitHub (37 stars, last meaningful work ~2014)
- @redoxengine/redox-hl7-v2 — GitHub (HL7v2 only, no C-CDA SDK)
- microsoft/FHIR-Converter — GitHub
- Microsoft Learn — $convert-data FAQ documenting Liquid template limitations
- onc-healthit/reference-ccda-validator — v3.1.77 added USCDIv3 vocab validation 2024-03-26
- onc-healthit/ccda-parser (Java reference)
- Lantana free CDA tools
- Lantana — CDA in the Wild: Narrative Issues #5
- HL7 C-CDA v4.0.0 IG home (11 document types + 2 header constraints)
- HL7 C-CDA v5.0.0 ballot supporting guidance
- Discharge Diagnosis Section structure definition
- Encounter Diagnosis V3 structure definition
- HL7 C-CDA Companion Guide R4.1
- Carequality "Concise C-CDA" 2022 paper
- Carequality + CommonWell connectivity
- Epic OID reference — Epic customer-specific MRN OID family
- open.epic Technical Specifications
- C-CDA Examples — Multiple Patient Identifiers (vendor pattern)
- HL7 C-CDA-Examples repo
- USCDI v3 mandatory data classes (NCQA / IMO Health)
- USCDI v4 / v5 status (HealthIT.gov)
- ONC Care Plan certification §170.315(b)(9)
- SMART Health IT — 2014 C-CDA display XSS case study (security argument against narrative-to-HTML)
- HL7.CDA.US.CCDAR2DOT2 — Diagnostic Imaging Report (V3)
- Patient Generated Document Header product brief (HL7)

Note on confidence gaps to flag for follow-up: HL7's `hl7.org/cda/us/ccda/...` pages returned 403 on direct WebFetch; vendor documentation portals (Epic, Cerner, athenahealth, Meditech) are gated and not directly verifiable. Vendor-quirk specifics in §6 are my best synthesis from open sources; recommend Phase 7 (Profiles) opens with a fixture-collection task to ground the profiles in real captured documents from each vendor before locking the BIP REQs.
