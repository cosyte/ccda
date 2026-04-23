# @cosyte/ccda

## What This Is

An open-source, developer-focused C-CDA (Consolidated Clinical Document Architecture) parser and utility library for Node.js and TypeScript, published under the Cosyte brand. It's the document sibling to `@cosyte/hl7`: where that library lets a developer extract the 10% of HL7 v2 fields they actually need in one line, `@cosyte/ccda` does the same for the real-world CCD/CCDA XML documents that Epic, Cerner, Meditech, athenahealth, and regional HIEs emit — without the developer having to read the C-CDA Implementation Guide, the CDA R2 base spec, or learn XPath.

The package is both a credibility asset for Cosyte's healthcare integration practice and a production tool used internally on client projects.

## Core Value

**A developer can parse a real-world, vendor-quirky C-CDA document and pull useful sections out of it in one line — without having read the C-CDA IG.** Everything else (typed document model, template-aware section access, narrative ↔ entry reconciliation, round-trip serialization, profile system for vendor quirks, strict validation mode) exists to support that north star.

C-CDA's surface area is enormous — 12+ document types, dozens of section templates, hundreds of entry templates, RIM-derived data types. The win is hiding that complexity behind a flat, named API for the fields developers actually reach for, while still exposing the full structured document for advanced use.

## Requirements

### Validated

(None yet — ship to validate)

### Active

See `REQUIREMENTS.md` for the full categorized list with REQ-IDs.

**Top-level capabilities:**

- [ ] Parse C-CDA R2.1 documents across the 12 standard document types (CCD, Discharge Summary, Progress Note, H&P, Consultation Note, Referral Note, Operative Note, Procedure Note, Care Plan, Diagnostic Imaging, Unstructured Document, Transfer Summary)
- [ ] Document type detection from `templateId`
- [ ] Typed document model: header (patient, author, custodian, encounter) + sections + entries
- [ ] Named helpers for common extractions (`doc.patient.mrn`, `doc.problems.active`, `doc.medications.current`, `doc.allergies`, `doc.immunizations`, `doc.results.recent`, `doc.vitals.latest`, `doc.encounters`, `doc.procedures`, `doc.socialHistory.smoking`)
- [ ] USCDI v3 helpers (`doc.familyHistory`, `doc.advanceDirectives`, `doc.functionalStatus`, `doc.healthConcerns`, `doc.goals`) — required by certified-EHR output
- [ ] Filter helpers across collections (`byCode`, `byRoute`, `activeAt`, `byCategory`, `latest`, `byDateRange`)
- [ ] `doc.summary()` single-call dashboard rollup (patient, active problems, current meds, allergies, last vitals, recent results, last encounter)
- [ ] Template-aware section access: get a section by `templateId` (primary) or LOINC code (fallback), receive typed entries
- [ ] Entry-level typed access for the C-CDA R2.1 entry templates (Problem Concern Act, Medication Activity, Allergy Concern Act, Result Organizer, Vital Signs Organizer, Reaction, Severity, Indication, Encounter Diagnosis V3, Service Delivery Location, Care Plan Goal/Intervention/Health Concern/Outcome, etc. — full enumerated list in `REQUIREMENTS.md` TPL-02)
- [ ] Narrative ↔ entry reconciliation via ID/IDREF (lazy on access), `section.isNarrativeOnly` boolean, mismatches surfaced as warnings scoped to medication dose / problem displayName / result numeric value
- [ ] Coded value resolution (code + codeSystem + displayName + `nullFlavor` as one object; SNOMED / LOINC / RxNorm / ICD-10 / CPT / CVX / UCUM / NDC recognized by OID)
- [ ] Lenient default parsing with stable warning codes and positional context for common real-world deviations
- [ ] **Security by default:** DTD processing disabled, billion-laughs defense (entity-count cap), decode-size cap for base64 attachments, warning snippets PHI-redacted by default
- [ ] Round-trip serialization (parse → modify → `toString()`) producing valid, namespace-clean C-CDA R2.1 XML with preserved stylesheet processing instructions
- [ ] `defineProfile()` API for vendor- and integration-specific quirks
- [ ] 7 built-in profiles (Epic, Cerner, Meditech, athenahealth, generic, Carequality, CommonWell) — EHRs + national HIE traffic
- [ ] Profile starter kit (`examples/profile-starter-kit/`) that ships publishable as-is
- [ ] Strict mode that runs IG-level structural validation (templateId presence, cardinality, required code bindings) and emits typed validation errors
- [ ] Three runnable examples (extract problem list, build allergy summary, validate against IG)
- [ ] Dual ESM + CJS build; strict TypeScript; Node 18+

### Out of Scope (v1)

- **C-CDA R1.1** — R2.1 only; R1.1 is legacy enough that we punt
- **Plain CDA R2 documents that are not C-CDA-conformant** — we're a C-CDA library, not a general CDA library
- **HL7 v3 messaging** — different beast entirely
- **FHIR conversion** — future `@cosyte/ccda-to-fhir` bridge (Medplum's `@medplum/ccda` already owns the FHIR-conversion lane; competing on it is a category mistake)
- **DICOM SR ingestion** — different structured-doc spec
- **Schematron validation against the official Schematron files** — roadmap; we ship our own IG-derived structural checks instead
- **Digital signature verification (XMLDSig)** — roadmap
- **PDF rendering of stylesheet output** — roadmap
- **Narrative-to-HTML rendering** — XSS surface (cf. SMART Health IT 2014 disclosure); use Lantana's canonical CDA stylesheets
- **PHI redaction / de-identification** — different problem space
- **Clinical-decision-support inference** (drug interactions, allergy interactions) — not what this library is
- **`doc.get('xpath-ish-path')`** — the v1 spec considered a half-XPath escape hatch; deferred to v2 with a real XPath-1.0-subset spec. v1 escape hatch is `section.rawXml` plus the XML-adapter node tree.
- **Outbound construction for non-CCD document types** — `buildDocument({ type: 'ccd', ... })` ships in v1; Discharge Summary / Care Plan / etc. builders deferred to v2.

## Context

- **Market gap:** Existing Node C-CDA tooling is either crusty XPath-based scripts, FHIR-conversion pipelines that drop fidelity, or Java libraries wrapped in child processes. Nothing in the Node ecosystem offers a typed, one-line DX for the 10% of fields developers reach for most. The DX bar is low; clearing it by a wide margin is tractable.
- **Real-world tolerance is the credibility gate:** Production C-CDA documents from major EHRs routinely violate the IG — missing `templateId`s, wrong code-system OIDs, narrative-only sections with no entries, unresolved IDREFs, mixed-content text nodes, namespace prefix variations, embedded HTML in narrative, base64 attachments. A library that strictly enforces the IG rejects a meaningful percentage of real documents. Default mode is lenient; deviations surface as warnings with stable codes and positional context.
- **Document sibling to `@cosyte/hl7`:** Shipped DX, artifact discipline, profile system, and tolerance model mirror `@cosyte/hl7`. A developer who has used `@cosyte/hl7` should feel instantly at home. The two packages together are Cosyte's answer for "I have a real clinical interface feed — parse it."
- **Profiles are a growth loop:** Built-in profiles cover broad vendor patterns, but real production specs live at the integration level (specific EHR instances, HIE deployments, regional exchanges). Every published profile package is a signal of library adoption and a contribution back. The starter kit makes publishing a profile take minutes, not hours.
- **Dogfooding:** Cosyte uses this internally on client projects, so production hardening isn't theoretical — the library's credibility matches the company's.
- **License choice:** MIT, to maximize adoption. This is a library, not a product.

## Constraints

- **Language:** TypeScript strict (`"strict": true`, `"noUncheckedIndexedAccess": true`). No `any`, no unjustified `as` casts.
- **Target:** ES2022, dual package (ESM + CJS) via `tsup`. Node 18+.
- **Runtime deps:** **Allowed** — deliberate divergence from `@cosyte/hl7`, which is zero-dep. XML parsing with full namespace + mixed-content + IDREF support is not worth re-implementing from scratch. The bar is: each runtime dep must be actively maintained, broadly trusted, MIT/Apache-licensed, free of open CVEs on the pinned floor, and justified in an ADR. Target total ≤ 3 runtime deps. The XML parser choice (candidates: `fast-xml-parser`, `sax`, `@xmldom/xmldom`, `libxmljs2`) is a Phase-1 discuss-phase decision — no parser code gets written before it's locked. **Research recommendation: `@xmldom/xmldom ^0.9.10`** (namespace-aware DOM, mixed-content native, MIT, zero transitive deps; ratified or diverged at the Phase 1 discuss step).
- **Package manager:** pnpm. Package name: `@cosyte/ccda`. License: MIT.
- **Test coverage:** ≥ 90% line coverage on `src/parser/`, `src/model/`, `src/templates/`, `src/narrative/`, `src/helpers/`.
- **No console logging in library code.** Throw typed errors or return results.
- **Immutable documents by default.** Mutation only via explicit methods that return a new `CCDADocument` instance (structural sharing); the original is never mutated.
- **Security by default.** DTD processing disabled (no XXE, no parameter-entity include); per-document entity-expansion count capped (billion-laughs defense); per-attachment + cumulative decode-size capped (oversized-payload defense); warning snippets PHI-redacted by default. Opt-out flags exist for debugging consoles but never for production parses.
- **XML adapter boundary.** All XML-library access is funneled through `src/xml/adapter.ts`; every other directory imports only from `src/xml/index.ts`. The chosen library can be swapped later without rewriting downstream code.
- **Postel's Law:** parser is liberal (lenient default + warnings with stable codes and XPath-ish positional context); serializer is conservative (always emits canonical, namespace-clean C-CDA R2.1 XML).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Lenient parsing is the default, strict mode opt-in | Production C-CDAs from major EHRs routinely violate the IG. Strict-by-default would reject real-world traffic. Strict mode still exists for validators and CI. | — Pending |
| Warnings carry stable string codes + positional context | Developers need to programmatically react to specific deviations (`CCDA_MISSING_TEMPLATE_ID`, `CCDA_NARRATIVE_ENTRY_MISMATCH`, `CCDA_OID_NOT_RECOGNIZED`, `CCDA_NULLFLAVOR_IN_REQUIRED_FIELD`, `CCDA_MISSING_XSI_TYPE`, `CCDA_DTD_REJECTED`, `CCDA_DECODE_SIZE_EXCEEDED`, etc.). Human messages alone are not enough. | — Pending |
| Templates are plain data, built-in registry uses the same `defineTemplate` / `defineProfile` API developers use | Built-ins and developer-authored templates/profiles are equal citizens of the same API. Keeps the built-ins honest — anything shipped must be expressible through the public API. | — Pending |
| Section access is template-first, code-second (templateId primary, LOINC fallback) | Vendors get the LOINC section codes wrong more often than the templateIds. Templating identifies a section by what it *is* rather than what it *claims to be*. | — Pending |
| Narrative is preserved verbatim and reconciled against entries (lazy on access); conflicts expose both and fire a warning scoped to medication dose / problem displayName / result numeric | We never silently choose narrative over entry or vice versa. Both are exposed, the developer decides, and `CCDA_NARRATIVE_ENTRY_MISMATCH` surfaces the mismatch — but only for the three categories where conflict-detection is cheap and unambiguous. | — Pending |
| Serializer always emits spec-clean C-CDA R2.1, regardless of what was parsed | Postel's Law. The parser is liberal; the emitter is conservative. Prevents vendor quirks from propagating downstream. | — Pending |
| Runtime dependencies are allowed, but each one requires an ADR (target ≤ 3); pinned floors above all known CVEs | Divergence from `@cosyte/hl7` zero-dep stance is deliberate and justified only for work (XML parsing) not worth re-implementing. Every dep is a supply-chain concern — gate accordingly. | — Pending |
| Built-in OID/code-system registry is opt-in extensible via `defineProfile` | So HIE-specific and locally-defined code systems can be registered without forking the library. | — Pending |
| Fatal errors only for unrecoverable structural corruption | Small Tier-3 set: `NOT_XML`, `NO_CLINICAL_DOCUMENT_ROOT`, `INVALID_NAMESPACE`, `EMPTY_INPUT`. Everything else is a warning. (DTD presence is a warning + reject, not a fatal — keeps lenient mode credible.) | — Pending |
| Profile starter kit is a first-class deliverable, not a doc section | The growth loop depends on frictionless publishing. "Copy this directory, customize, `pnpm publish`" is the entire target DX. Mirrors the `@cosyte/hl7` starter-kit pattern. | — Pending |
| **XML parser: `@xmldom/xmldom ^0.9.10` (research-recommended; ADR-ratified at Phase 1)** | Namespace-aware DOM API, native mixed-content support, MIT, zero transitive deps, 25.5M weekly downloads. Patched 5 high-severity CVEs same-day on 2026-04-18 — version floor matters. Second-choice fallback `fast-xml-parser` 5.7.x kept as a perf escape-hatch only. Hard reject `libxmljs2` (unmaintained + native-build pain on Node 22+). | — Pending (ratified at Phase 1) |
| **Mutation contract: structural-sharing-with-new-instance** (mutators return a new `CCDADocument`; the original is never modified) | Diverges from `@cosyte/hl7`'s `markDirty` because C-CDA's deeper nesting makes cache invalidation in `markDirty` painful; structural-sharing gives genuinely-immutable semantics, simpler per-instance lazy caches, and clean round-trip semantics (`doc1.toString() !== doc2.toString()` after mutation). | — Pending (ratified at Phase 3) |
| **XML-adapter boundary** in `src/xml/adapter.ts`; one concrete impl file imports the chosen library; everything else imports only from `src/xml/index.ts` | Lets us swap the underlying XML library later without rewriting downstream code. Keeps the parser-choice ADR genuinely reversible. | — Pending |
| **Profile `extends` merge order: leftmost-ancestral, rightmost-layered, `defineProfile` body wins last word** | Predictable, named lineage; `extends: [a, b]` means `a` is the most-ancestral, `b` layers on top, the profile's own options have final say. Type-checked as `Profile \| readonly Profile[]`, never `any[]`. | — Pending |
| **Composite types carry `nullFlavor` first-class** (TYPES-01/02 amended) | The semantic distinction between "field absent" and `<value nullFlavor="UNK"/>` matters clinically (allergy safety alerts, "no known X" semantics). Helpers downstream cannot reconstruct the flag from raw elements after the fact. | — Pending |
| **Security posture: DTD disabled, billion-laughs bounded, decode caps, PHI-redacted snippets — no Tier-3 bypass** | Healthcare library; first CISO review must find safe defaults. Lenient mode does NOT bypass any security check. Opt-out flags exist for debugging consoles but never for production parses. SECURITY.md ships at repo root. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-22 after research-pass revision (15 REQs added, 9 modified, 1 deferred to v2; XML-parser recommendation, mutation contract, security posture, and 2 HIE profiles logged as Key Decisions).*
