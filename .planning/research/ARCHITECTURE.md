# Architecture — `@cosyte/ccda`

**Researched:** 2026-04-22
**Mode:** Architecture dimension (Project Research)
**Baseline:** `@cosyte/hl7` (`src/parser`, `src/model`, `src/helpers`, `src/serialize`, `src/builder`, `src/profiles`)
**Confidence:** HIGH on layout / data flow / mutation contract; MEDIUM on XML-adapter swap mechanics (depends on Phase 1 ADR outcome); MEDIUM on serialization fidelity strategy (validated against fast-xml-parser docs but unverified for libxmljs2)

---

## 0. Executive Summary

The `@cosyte/hl7` layout (`parser` → `model` → `helpers` → `serialize` → `builder` → `profiles`) is the right backbone. Three concrete divergences are warranted by C-CDA's nature:

1. **An XML-adapter directory** (`src/xml/`) — a thin port that hides the chosen XML library behind a stable `XmlNode` / `XmlDocument` surface. Without this boundary, a parser swap in v1.x rewrites half the codebase.
2. **A first-class `templates/` directory** — C-CDA is template-driven in a way HL7 v2 segments are not. Templates are data + a `parse(node, ctx)` function, registered through `defineTemplate()`. The registry and the built-in template definitions are siblings.
3. **A `narrative/` directory** — narrative reconciliation is a non-trivial subsystem (content-tree builder + IDREF reconciler + mismatch detector) that warrants its own module rather than being smeared across helpers.

**Phase ordering: confirm the current ROADMAP with one swap.** Move the OID registry into Phase 3 (or split Phase 4 so OIDs land before TYPES-02 needs them). Everything else is correctly ordered.

**Mutation contract recommendation: structural-sharing-with-new-instance.** Rationale below in §3.

**Laziness contract recommendation: parse the skeleton + section index eagerly; parse entries / narrative tree / base64 / helpers lazily and memoize.**

---

## 1. Component Diagram (top-level `src/` layout)

```
src/
├── index.ts                          ── public barrel; mirrors @cosyte/hl7's index.ts pattern
├── xml/                              ── XML-adapter port (NEW vs hl7)
│   ├── adapter.ts                    ── XmlNode / XmlDocument abstract surface
│   ├── fast-xml-parser-adapter.ts    ── concrete impl (one file; the only place the dep is imported)
│   ├── namespace.ts                  ── namespace resolution + prefix normalization
│   ├── processing-instructions.ts    ── PI capture/preserve (xml-stylesheet)
│   └── index.ts                      ── re-exports
├── parser/                           ── orchestration; analogous to hl7/parser/
│   ├── parse-ccda.ts                 ── public parseCCDA() entry; orchestrates xml→model
│   ├── parse-context.ts              ── ParseContext: warnings sink, profile, options, OID registry view
│   ├── normalize.ts                  ── BOM strip, charset detection, line-ending normalization
│   ├── document-type.ts              ── 12-doc-type detection from templateId
│   ├── header.ts                     ── parses ClinicalDocument header → typed model
│   ├── sections.ts                   ── walks <component><structuredBody>; resolves templates
│   ├── entries.ts                    ── delegates per-entry parse to template registry
│   ├── idref.ts                      ── intra-document ID/IDREF resolver
│   ├── warnings.ts                   ── WARNING_CODES + factory functions (15 Tier-2 codes from TOL-03)
│   ├── errors.ts                     ── CCDAParseError + CCDAValidationError + 4 fatal codes
│   ├── strict.ts                     ── strict-mode escalator + IG-validation runner (PARSE-08)
│   ├── types.ts                      ── ParseOptions, OnWarningCallback, internal raw types
│   └── index.ts
├── model/                            ── typed document model + RIM data types
│   ├── document.ts                   ── CCDADocument class (the Hl7Message analog)
│   ├── section.ts                    ── Section wrapper (templateIds, code, text, entries, rawXml)
│   ├── entry.ts                      ── Entry wrapper base + discriminated-union narrowing
│   ├── header-types.ts               ── Patient, Author, Custodian, Encounter, etc. shapes
│   ├── mutation.ts                   ── setHeaderField / addSection / removeSection / addEntry
│   ├── types/                        ── RIM composite parsers (mirrors hl7/model/types/ exactly)
│   │   ├── _shared.ts
│   │   ├── namespace.ts              ── re-export as `CDA.II`, `CDA.AD`, etc.
│   │   ├── ii.ts                     ── Instance Identifier (root + extension)
│   │   ├── cd.ts                     ── Concept Descriptor → CodedValue
│   │   ├── ce.ts ── cwe.ts           ── Coded with equivalents (siblings of CD)
│   │   ├── ad.ts                     ── Address
│   │   ├── pn.ts                     ── Person Name
│   │   ├── tel.ts                    ── Telecom
│   │   ├── ts.ts                     ── Timestamp (delegates to dates.ts)
│   │   ├── ivl-ts.ts ── eivl-ts.ts   ── Interval / event-related interval
│   │   ├── pq.ts                     ── Physical Quantity (value + UCUM unit)
│   │   ├── ed.ts                     ── Encapsulated Data (lazy base64)
│   │   ├── st.ts ── bl.ts ── int.ts ── real.ts
│   │   └── index.ts
│   ├── coded-value.ts                ── CodedValue assembly (CD/CE/CWE → flat shape; uses oids/)
│   ├── dates.ts                      ── HL7 TS/DTM parser (analog of hl7/parser/dates.ts)
│   └── index.ts
├── oids/                             ── OID registry (NEW vs hl7; CDA-specific)
│   ├── registry.ts                   ── OidRegistry class (Map<string, OidDescriptor>)
│   ├── builtins.ts                   ── 14 built-in OIDs (CODE-01) declared as data
│   └── index.ts
├── templates/                        ── Template registry + built-in templates (NEW vs hl7)
│   ├── registry.ts                   ── TemplateRegistry: Map<key, Template>; defineTemplate()
│   ├── define.ts                     ── public defineTemplate() factory (mirrors defineProfile)
│   ├── key.ts                        ── canonical key: `${root}|${extension ?? ""}`
│   ├── types.ts                      ── Template, EntryShape, TemplateContext
│   ├── sections/                     ── built-in section templates, one per file
│   │   ├── problems.ts               ── authored via defineTemplate() — not hand-built
│   │   ├── medications.ts
│   │   ├── allergies.ts
│   │   ├── immunizations.ts
│   │   ├── results.ts
│   │   ├── vitals.ts
│   │   ├── encounters.ts
│   │   ├── procedures.ts
│   │   ├── social-history.ts
│   │   ├── plan-of-treatment.ts
│   │   ├── assessment.ts
│   │   └── index.ts                  ── single registerBuiltins(registry) function — see §4
│   ├── entries/                      ── built-in entry templates, one per file
│   │   ├── problem-concern-act.ts
│   │   ├── problem-observation.ts
│   │   ├── medication-activity.ts
│   │   ├── medication-information.ts
│   │   ├── allergy-concern-act.ts
│   │   ├── allergy-intolerance-observation.ts
│   │   ├── result-organizer.ts
│   │   ├── result-observation.ts
│   │   ├── vital-signs-organizer.ts
│   │   ├── vital-sign-observation.ts
│   │   ├── immunization-activity.ts
│   │   ├── encounter-activity.ts
│   │   ├── procedure-activity-act.ts
│   │   ├── procedure-activity-observation.ts
│   │   ├── procedure-activity-procedure.ts
│   │   ├── social-history-observation.ts
│   │   ├── smoking-status.ts
│   │   ├── care-plan-goal.ts
│   │   ├── care-plan-intervention.ts
│   │   └── index.ts
│   └── index.ts
├── narrative/                        ── narrative subsystem (NEW vs hl7)
│   ├── content-tree.ts               ── NARR-01 structured-content-tree builder
│   ├── reconcile.ts                  ── NARR-02 IDREF reconciler
│   ├── mismatch.ts                   ── NARR-03 narrative↔entry diff + warning emit
│   └── index.ts
├── helpers/                          ── named helpers (analog of hl7/helpers/)
│   ├── types.ts                      ── Problem, Medication, Allergy, etc. typed shapes
│   ├── problems.ts                   ── doc.problems.{active,all,resolved}
│   ├── medications.ts
│   ├── allergies.ts
│   ├── immunizations.ts
│   ├── results.ts
│   ├── vitals.ts
│   ├── encounters.ts
│   ├── procedures.ts
│   ├── social-history.ts
│   └── index.ts
├── serialize/                        ── analog of hl7/serialize/
│   ├── to-string.ts                  ── doc.toString() — canonical C-CDA R2.1 emit
│   ├── to-json.ts                    ── doc.toJSON()
│   ├── pretty-print.ts               ── doc.prettyPrint()
│   ├── emit-element.ts               ── element-emit primitive (analog of emit-field.ts)
│   └── index.ts
├── builder/                          ── outbound construction (analog of hl7/builder/)
│   ├── build-document.ts             ── buildDocument({type, patient, ...})
│   ├── format-timestamp.ts           ── HL7-format TS emit
│   └── index.ts
├── profiles/                         ── profile system (analog of hl7/profiles/)
│   ├── define.ts                     ── defineProfile()
│   ├── validate.ts                   ── 4-class ProfileDefinitionError emitter
│   ├── merge.ts                      ── extends + merge semantics; lineage
│   ├── describe.ts                   ── profile.describe()
│   ├── default.ts                    ── set/getDefaultProfile()
│   ├── epic.ts ── cerner.ts ── meditech.ts ── athena.ts ── generic.ts
│   └── index.ts
└── validation/                       ── strict-mode IG checks (PARSE-08 / TOL-06)
    ├── ig-rules.ts                   ── cardinality + required-binding registry
    ├── runner.ts                     ── strict-mode validator; emits CCDAValidationError aggregate
    └── index.ts
```

**Counts vs hl7:** 13 top-level dirs vs hl7's 6. New dirs: `xml/`, `oids/`, `templates/`, `narrative/`, `validation/`. Same names: `parser/`, `model/`, `helpers/`, `serialize/`, `builder/`, `profiles/`.

---

## 2. REQ-ID Category → Directory Mapping (one-line table)

This is the table the Phase-1 scaffold plan should grep against to know what file each REQ-ID will land in.

| REQ Category | Primary Directory | Notes |
|--------------|-------------------|-------|
| `SETUP-*` | repo root + `src/index.ts` stub | tooling, package.json, tsup, vitest |
| `DOC-15d` / `DOC-16d` | repo root (`LICENSE`) + `.planning/adr/` | foundation paper trail |
| `PARSE-01..07` | `src/parser/` + `src/xml/` | xml adapter wired through ParseContext |
| `PARSE-08` (strict) | `src/parser/strict.ts` + `src/validation/` | runner, not parser |
| `TOL-01..06` | `src/parser/warnings.ts`, `errors.ts`, `parse-context.ts` | `emitWarning` chokepoint lives in ParseContext |
| `DOC-01h..06h` (header) | `src/parser/header.ts` + `src/model/header-types.ts` | parser writes; model exposes |
| `MODEL-01..05` (read) | `src/model/document.ts`, `section.ts`, `entry.ts` | wrapper-cache pattern from hl7 |
| `MODEL-06..07` (mutation) | `src/model/mutation.ts` | structural-sharing — see §3 |
| `TYPES-01..06` | `src/model/types/*.ts` + `src/model/coded-value.ts` + `src/model/dates.ts` | one composite per file |
| `TPL-01..05` | `src/templates/` | registry + built-ins |
| `CODE-01..03` | `src/oids/` | registry; profile extends through `OidRegistry.extend()` |
| `HELPERS-01..10` | `src/helpers/` | thin wrappers over `doc.section(templateId).entries` |
| `NARR-01..04` | `src/narrative/` | content tree, reconcile, mismatch |
| `SER-01..05` | `src/serialize/` + `src/builder/` | `buildDocument` lives in `builder/`, `toString` in `serialize/` |
| `PROF-01..09` | `src/profiles/` | mirrors hl7 layout 1:1 |
| `BIP-01..05` | `src/profiles/{epic,cerner,meditech,athena,generic}.ts` | one per file; authored via defineProfile |
| `BIP-06` | `test/` | parity-fixture tests |
| `TEST-*`, `EX-*`, `KIT-*`, `DOC-*d` | `test/`, `examples/`, `examples/profile-starter-kit/`, `README.md` | non-`src/` |

---

## 3. Data Flow on `parseCCDA(raw, options?)`

End-to-end trace, with directories in brackets and warning-emission points marked ⚠️:

```
parseCCDA(raw, options?)                                       [parser/parse-ccda.ts]
   │
   ▼
1. Resolve effective profile (explicit > default > none)      [profiles/default.ts]
   ▼
2. Construct ParseContext                                     [parser/parse-context.ts]
     - warnings: Hl7ParseWarning[] (sink)
     - onWarning callback (TOL-05)
     - profile descriptor + merged customTemplates + merged oidRegistry
     - options.strict, options.validate, options.dateFormats
     - emitWarning(code, position, ctx) ← THE CHOKEPOINT
   ▼
3. normalize(raw)                                             [parser/normalize.ts]
     - Buffer → string via XML declaration's charset (PARSE-07)
     - BOM strip (silent, Tier 1)
     - line-ending unification
   ▼
4. xml.parse(text)                                            [xml/fast-xml-parser-adapter.ts]
     - returns XmlDocument: { root: XmlNode, processingInstructions, doctype }
     - throws CCDAParseError(NOT_XML) on lex failure  ⚠️ FATAL
   ▼
5. validateRoot(xmlDoc)                                       [parser/parse-ccda.ts]
     - root must be ClinicalDocument else CCDAParseError(NO_CLINICAL_DOCUMENT_ROOT) ⚠️ FATAL
     - default ns must be urn:hl7-org:v3 else INVALID_NAMESPACE ⚠️ FATAL
   ▼
6. resolveNamespaces(xmlDoc)                                  [xml/namespace.ts]
     - default + voc + sdtc + xsi prefix-agnostic resolution (PARSE-02)
     - emits CCDA_NAMESPACE_PREFIX_VARIATION when nondefault prefix used ⚠️
   ▼
7. detectDocumentType(rootNode, ctx)                          [parser/document-type.ts]
     - reads ClinicalDocument/templateId[] → 1 of 12 doc types or 'unknown' (DOC-01h)
     - emits CCDA_MISSING_TEMPLATE_ID if absent ⚠️
   ▼
8. parseHeader(rootNode, ctx)                                 [parser/header.ts]
     - patient, author[], custodian, informant[], legalAuthenticator,
       authenticator[], dataEnterer, informationRecipient[], encounter
     - delegates each composite field to model/types/{ad,pn,ii,...}
   ▼
9. indexSections(rootNode)                                    [parser/sections.ts]
     - walks ClinicalDocument/component/structuredBody/component/section
     - builds a SectionIndex: SectionDescriptor[] containing {
         templateIds, loincCode, titleNode, textNode (UNPARSED),
         entryNodes (UNPARSED), rawElement
       }
     - DOES NOT YET PARSE entries or narrative tree (laziness — see §8)
   ▼
10. resolveIDREFs(rootNode)                                   [parser/idref.ts]
     - one O(n) pass; build Map<id, XmlNode>
     - exposed via doc.resolveId(id) for §11 narrative reconcile
   ▼
11. (LAZY, on access) for each section.entries:               [parser/entries.ts]
     - lookup template by templateId(s) via registry            [templates/registry.ts]
       - hit → call template.parse(entryNode, ctx) → typed entry
       - miss → emit CCDA_UNKNOWN_TEMPLATE_ID; return generic Entry ⚠️
     - LOINC fallback ONLY for section-level lookup (§4); NEVER overrides templateId
   ▼
12. (LAZY, on access) section.text:                           [narrative/content-tree.ts]
     - parse <text> mixed-content into structured ContentTree
     - preserve verbatim (NARR-04); never rewrite
   ▼
13. (LAZY, on call) section.reconcile():                      [narrative/reconcile.ts]
     - walk entries; match text/reference[@value] → narrative content[@ID]
     - emit CCDA_UNRESOLVED_IDREF for misses ⚠️
     - delegate value-comparison to narrative/mismatch.ts
       - emit CCDA_NARRATIVE_ENTRY_MISMATCH on disagreement ⚠️
   ▼
14. construct CCDADocument (frozen wrapper)                   [model/document.ts]
     - holds: rawXml (the XmlDocument), rootNode, header (parsed),
              sectionIndex, idMap, ctx (warnings, profile, oidRegistry)
   ▼
15. options.strict || options.validate?                       [validation/runner.ts]
     - run IG-rule sweep (cardinality, required bindings, templateId presence)
     - lenient: append issues to doc.issues (TOL-06)
     - strict: throw CCDAValidationError aggregating ALL issues (TOL-01) ⚠️ FATAL
   ▼
16. return CCDADocument
```

**Where strict-mode checks fit:** **Both, with a clear split.**
- Parser-level deviations (Tier 2) emit during parse via `ctx.emitWarning`; strict mode escalates the **aggregate** at end-of-parse, not the first one. This matches how `@cosyte/hl7` does it and matches TOL-01's aggregation contract.
- IG structural validation (cardinality, required bindings, required templateIds) runs as a **separate pass** after parse (`src/validation/runner.ts`). This separation matters because a future user might want `parseCCDA(raw, { validate: true })` (run IG rules, accumulate to `doc.issues`) without `strict: true` (don't throw). TOL-06 explicitly requires this two-mode behavior.

**Why warnings emit at chokepoint, not at random sites:** mirrors hl7's `emitWarning` pattern. Every warning code carries position (line/column or XPath-ish) and stable code, so the sink can dedupe, callback, and aggregate uniformly.

---

## 4. Document Model (CCDADocument): class vs frozen object

**Recommendation: class.** Mirror hl7's `Hl7Message` pattern.

Rationale:
1. **Wrapper caches** — `Section`/`Entry` wrappers are constructed lazily and cached per-document for referential stability (`doc.section(x) === doc.section(x)`). A class with private fields is the cleanest way to house the cache without leaking it into `toJSON()` output. hl7 already validated this pattern.
2. **Method surface** — `doc.toString()`, `doc.toJSON()`, `doc.prettyPrint()`, `doc.section(...)`, `doc.get(...)`, `doc.resolveId(...)`, `doc.section(...).reconcile()` are all instance methods. A frozen plain object with method namespaces (e.g. `doc.serialize.toString()`) adds depth without payoff and breaks the hl7 muscle memory.
3. **Mutation methods** must live somewhere. A class with `mutation.ts` mixed in (or composed on the prototype) is honest about the fact that `setHeaderField` returns a new instance. A frozen object would hide this behind ad-hoc factory helpers.
4. **`Object.freeze` is still applied to data fields** — `warnings`, `templateIds`, etc. are frozen at the model boundary. The *class* is not the freeze unit; the *fields* are.

**Entry typing strategy: discriminated union by templateId, surfaced through a generic narrowing helper.**

```ts
// Definitive shape (template-driven)
type Entry =
  | ProblemConcernAct        // templateId 2.16.840.1.113883.10.20.22.4.3
  | ProblemObservation       // 2.16.840.1.113883.10.20.22.4.4
  | MedicationActivity       // 2.16.840.1.113883.10.20.22.4.16
  | AllergyConcernAct        // 2.16.840.1.113883.10.20.22.4.30
  | ResultOrganizer          // 2.16.840.1.113883.10.20.22.4.1
  | /* ... */
  | UnknownEntry;            // fallback when template lookup misses

// Each variant has a `kind` discriminator derived from templateId
interface ProblemObservation {
  readonly kind: "problem-observation";
  readonly templateIds: readonly II[];
  readonly code: CodedValue;
  readonly value: CodedValue;
  readonly effectiveTime?: { low?: Date; high?: Date };
  readonly statusCode?: string;
  readonly rawXml: XmlNode;
}

// Narrowing by templateId
section.entriesOfKind("problem-observation"); // returns ProblemObservation[]
```

The discriminator is **string** not the raw OID, so consumers can `switch` ergonomically without the OID-string ceremony. The mapping templateId→kind lives in the template registration (`defineTemplate({ kind: "problem-observation", templateId: "2.16.840.1.113883.10.20.22.4.4" })`). This way the discriminator is data, not a separate hand-maintained enum.

**Mutation contract: structural-sharing-with-new-instance.**

This is the open Phase-3 decision in STATE.md. My recommendation: **`mutation.ts` returns a new `CCDADocument` instance.**

Rationale:
1. **REQ-MODEL-06 says "immutable by default."** The `markDirty` variant requires mutating the instance and invalidating caches; that's *not* immutable, it's "immutable until you say otherwise." Reasoning about immutability is easier when the type system enforces it (`readonly` everywhere, no escape hatch).
2. **Structural sharing is cheap for C-CDA.** The DOM is already parsed; rebuilding `CCDADocument` is a wrapper-construction cost, not a re-parse. Sections that didn't change can share the underlying `XmlNode` reference. This is how Immer, Immutable.js, and most modern tree-mutators work.
3. **Round-trip semantics are clearer.** `const doc2 = doc.addSection(s); doc.toString() !== doc2.toString()` is the natural contract. With `markDirty`, `doc.toString()` after `doc.addSection(s)` would change in place — surprising for a "immutable" API.
4. **Wrapper-cache invalidation is local, not global.** With `markDirty`, every cached wrapper must be invalidated. With new-instance, the new instance just has an empty cache. Less code, fewer bugs.
5. **hl7 chose `markDirty`** — but hl7's mutation surface is shallower (segments are top-level, not nested under sections under bodies). C-CDA's depth makes `markDirty` cache invalidation more painful.

Implementation note: `setEntryField(sectionIndex, entryIndex, field, value)` on a deeply nested document doesn't have to deep-copy the whole tree. The `mutation.ts` module can rebuild the changed path (entry → entries[] → section → sections[] → document) and structurally share the unchanged sections. ~200 lines, well-tested in the immutable-data-structures ecosystem.

---

## 5. XML Adapter Boundary

**Recommendation: a 1-file public adapter surface in `src/xml/adapter.ts`, exactly one concrete implementation in `src/xml/fast-xml-parser-adapter.ts` (or whichever wins the ADR), and the rest of the codebase imports ONLY from `src/xml/index.ts`.**

The public surface (the contract) is small enough to fit on a screen:

```ts
// src/xml/adapter.ts — what the rest of the codebase sees
export interface XmlNode {
  readonly localName: string;
  readonly namespaceURI: string | undefined;
  readonly attributes: ReadonlyMap<string, XmlAttribute>;
  readonly children: readonly XmlNode[];
  readonly text: string | undefined;          // direct text content (mixed-content joined)
  readonly textNodes: readonly TextOrElement[]; // ordered: preserves mixed content (NARR-01)
  readonly position: { line: number; column: number } | undefined;

  attr(name: string, ns?: string): string | undefined;
  child(localName: string, ns?: string): XmlNode | undefined;
  children_(localName: string, ns?: string): readonly XmlNode[];
  walk(visitor: (n: XmlNode) => void): void;
}

export interface XmlAttribute {
  readonly localName: string;
  readonly namespaceURI: string | undefined;
  readonly value: string;
}

export type TextOrElement =
  | { type: "text"; value: string }
  | { type: "element"; node: XmlNode };

export interface XmlDocument {
  readonly root: XmlNode;
  readonly processingInstructions: readonly ProcessingInstruction[];
  readonly doctype: string | undefined;
  readonly xmlDeclaration: { version: string; encoding: string | undefined } | undefined;
}

export interface ProcessingInstruction {
  readonly target: string;            // e.g. "xml-stylesheet"
  readonly data: string;
  readonly position: number;          // index relative to root
}

export interface XmlAdapter {
  parse(input: string): XmlDocument;
  serialize(doc: XmlDocument): string; // for round-trip preserving PIs + namespaces
}

export function getXmlAdapter(): XmlAdapter;
```

Rules:
- **Exactly one file imports the chosen XML library directly** (`fast-xml-parser-adapter.ts` etc.). All other code paths import `XmlNode`, `XmlDocument`, etc. from `src/xml/index.ts`.
- `parser/`, `model/`, `templates/`, `narrative/`, `serialize/`, `builder/`, `helpers/`, `profiles/` code may **never** import from a concrete XML library — only from the abstract surface.
- A swap looks like: write `xmldom-adapter.ts`, change one line in `src/xml/index.ts`, run the test suite. If types stay stable, no downstream file changes.

**Concrete library recommendation (HIGH confidence on the recommendation, MEDIUM confidence that it survives Phase 1 ADR scrutiny without amendment):** **`fast-xml-parser` v4** with `preserveOrder: true`, `parseTagValue: false`, `ignoreAttributes: false`, `removeNSPrefix: false`, `processEntities: true`.

Why fast-xml-parser:
- MIT-licensed, actively maintained, broadly trusted, zero native deps (works on every Node 18+ platform without prebuilds — a real risk with libxmljs2).
- `preserveOrder: true` keeps mixed-content node order, which is mandatory for NARR-01 + SER-01.
- Smaller install footprint than `@xmldom/xmldom`, faster than `sax` for non-streaming use.
- Round-trip via `XMLBuilder` is well-traveled.

Why **not** the alternatives (one-line each):
- **`@xmldom/xmldom`** — full DOM fidelity, but heavier and slower; only worth it if we need full DOM Level 2 APIs that we don't.
- **`sax`** — streaming-only; we need a tree, building it ourselves doubles the work.
- **`libxmljs2`** — native dep; supply-chain + cross-platform liability for a library shipped on npm. Hard sell in an ADR.

The ADR is the right place to confirm; the architecture works with any of the four because of the adapter boundary.

---

## 6. Template Registry Pattern

**Registry shape: `Map<string, Template>` keyed by `${root}|${extension ?? ""}`.**

Rationale:
- Lookup is O(1).
- A single string key handles both `root`-only and `root|extension` templates without a tree.
- `defineTemplate({ templateId, extension })` produces the key deterministically; lookup `findTemplate(templateIds: II[])` walks the array and returns the first hit (longer-key matches preferred — i.e., `root|ext` checked before bare `root`).

LOINC fallback is stored separately (`Map<string, Template>` keyed by LOINC code) and consulted **only for section lookup** when no templateId match exists. **TPL-05 explicitly forbids LOINC ever winning over templateId**, so the fallback is checked second; the section walker's lookup function makes that ordering explicit.

**`defineTemplate({ override: true })` interaction:**

The built-in registry is constructed once (eagerly at module load — see laziness contract) and **never mutated after**. User-supplied templates land in a **second registry** that the parser checks first:

```
ParseContext.findTemplate(templateIds) {
  // 1. user/profile-supplied registry (override: true wins here)
  // 2. built-in registry
  // 3. LOINC fallback (section-only)
  // 4. miss → CCDA_UNKNOWN_TEMPLATE_ID
}
```

Per-parse profile templates extend the *user* registry for the scope of one parse (closed-over in ParseContext, not mutating any global). This matches PROF-07 ("profile-registered custom templates extend the template registry **for that parse**").

`{ override: true }` semantics:
- Without `override`, registering a duplicate (in the user registry) throws `TemplateDefinitionError`.
- With `override`, the user's entry replaces the user-registry entry for that key. The built-in is not mutated.
- The user's override always wins lookup against the built-in.

This is "copy-on-write per profile" achieved without any literal copying — the built-in is shared by reference; profiles layer on top.

**Built-ins authored via the public API — keeping it honest:**

Each file in `src/templates/sections/` and `src/templates/entries/` looks like:

```ts
// src/templates/entries/problem-observation.ts
import { defineTemplate } from "../define.js";

export const problemObservation = defineTemplate({
  kind: "problem-observation",
  name: "Problem Observation",
  templateId: "2.16.840.1.113883.10.20.22.4.4",
  extension: "2015-08-01",
  parse(node, ctx) { /* ... */ },
});
```

`src/templates/index.ts` calls `registerBuiltins(registry)` once on import, which does:

```ts
[problemObservation, problemConcernAct, /* ... ~30 entry templates */].forEach(
  (t) => registry.registerBuiltin(t),
);
```

`registerBuiltin` is internal-only (not exposed from `src/index.ts`); `defineTemplate` is the public author surface. **Code review can grep `defineTemplate(` and find every template definition** — built-in or user-supplied — and verify the pattern is identical. This is the same honesty discipline `@cosyte/hl7` applies to `defineProfile`.

**Eager vs lazy template loading:**

Built-in templates are imported eagerly at `src/templates/index.ts` load time. Cost: ~30-50 small modules, sub-millisecond module-load. Tree-shaking concern: yes — ESM consumers that only use `parseCCDA` will pull in all built-in templates. **This is the right tradeoff** because:
1. C-CDA without templates is barely useful; consumers will hit them on first parse.
2. Lazy template loading would require dynamic `import()` inside `parser/entries.ts`, breaking sync `parseCCDA` semantics (it would have to become `async`).
3. The total weight of all built-in template definitions is bounded — they're declarative parse functions, not heavy code.

If tree-shaking becomes a real issue post-v1, we can split into `@cosyte/ccda` (core + minimal templates) and `@cosyte/ccda-templates-full` (everything). v2 problem.

---

## 7. Profile Composition

**Merge resolution order recommendation: leftmost-wins for `extends: [p1, p2, ...]`, child overrides ALL parents for the directly-supplied options.**

Rationale: `extends: [base, regional]` reads as "I'm based on `base`, with `regional` quirks layered on top, and **I** add my final word." Leftmost in the array is the most "ancestral"; rightmost is the most specific override. The `defineProfile` body is the most specific of all.

This matches how CSS cascade and inheritance lattices are conventionally read, and matches `@cosyte/hl7`'s existing `mergeLineage` semantics in `src/profiles/merge.ts` (verify against that file before locking).

Per-option merge semantics (mirror PROF-03):
- **Scalars** (`description`, `name`) — child overwrites; `name` is always the child's name.
- **Arrays** (`dateFormats`) — concat + dedupe (first-occurrence wins per hl7 D-21).
- **`oidRegistry`** — deep-merge per OID; child entry replaces parent entry for the same OID.
- **`customTemplates`** — deep-merge per templateId key; child template replaces parent template.
- **`onWarning`** — chain (parent first, then child); both fire.

**Typing strategy that survives `extends: any[]`:**

```ts
type ExtendsOption = Profile | readonly Profile[];

interface DefineProfileOptions {
  readonly name: string;
  readonly description?: string;
  readonly oidRegistry?: Readonly<Record<string, OidDescriptor>>;
  readonly customTemplates?: Readonly<Record<string, Template>>;
  readonly onWarning?: OnWarningCallback;
  readonly extends?: ExtendsOption;
}
```

Key: never type `extends` as `unknown` or `any[]`. Always `Profile | readonly Profile[]`. The `merge.ts` normaliser turns the single-profile form into a one-element array internally so the rest of the merge code sees a uniform shape. hl7's `normaliseParents` does exactly this; copy it.

**Where profile state lives during a parse:**

**Closed over in `ParseContext`,** passed down by reference. Not a parameter on every function. Concretely:

```ts
class ParseContext {
  readonly profile: ProfileDescriptor | undefined;
  readonly oidRegistry: OidRegistry;       // merged: builtin + profile
  readonly templateRegistry: TemplateRegistry; // merged: user + builtin
  readonly emitWarning: (code, position, ctx) => void;
  readonly options: ParseOptions;
  // ...
}
```

`templates/`, `model/coded-value.ts`, `narrative/reconcile.ts` all take `ctx: ParseContext` as their last parameter and reach into it for what they need. No global state, no module-level mutation, no thread-safety concerns. This mirrors hl7's pattern in `parser/types.ts`'s `Profile` field threading.

---

## 8. Serialization Fidelity

**Recommendation: keep the parsed `XmlDocument` (raw tree) on `CCDADocument` alongside the typed model. Re-emit from raw + typed-overlay deltas.**

`@cosyte/hl7` keeps `rawSegments` on `Hl7Message` for exactly this reason — round-trip must produce the exact same on-disk representation when nothing changed. C-CDA's analog is **harder** because XML has more degrees of freedom than HL7 v2 delimiters:

- Namespace prefix variation (`xmlns="urn:hl7-org:v3"` vs `xmlns:cda="..."` with prefixed elements)
- Whitespace between elements
- Attribute ordering
- Self-closing vs `<foo></foo>`
- `<?xml-stylesheet?>` and other PIs at the prolog
- DOCTYPE
- Comments (rare in C-CDA but legal)

The conservative-emitter REQ (SER-01) **does NOT mean "lose original formatting."** It means: when emitting, normalize to canonical C-CDA R2.1 (default namespace `urn:hl7-org:v3`, `xsi:`/`voc:`/`sdtc:` only when needed, no vendor namespace junk). It does not say we re-emit attributes in alphabetical order or strip whitespace.

**Strategy:**
1. `CCDADocument` carries `rawXml: XmlDocument` (the parsed tree).
2. Mutation methods (`setHeaderField`, `addEntry`, etc.) produce a new `CCDADocument` whose raw tree has the affected node replaced; unchanged nodes are shared by reference (structural sharing — see §3).
3. `toString()` walks the raw tree and emits via the XML adapter's `serialize(doc)`. PIs and DOCTYPE come along.
4. **Canonicalization happens in `serialize/to-string.ts`'s post-processing** (or the adapter's serializer config): force default namespace, strip vendor `xmlns:foo` declarations that aren't actually used, normalize attribute namespace prefixes.
5. For `buildDocument({...})` (SER-05), there's no parsed source — emit from the typed model into a synthetic `XmlDocument`, then run the same serializer.

Trade-off: **cannot achieve byte-perfect round-trip in lenient mode** (PI ordering and whitespace will normalize). REQ SER-02 is "structurally equivalent," not "byte-identical," so this is acceptable.

**Preserving namespace prefixes and PIs through round-trip:**
- PIs: stored on `XmlDocument.processingInstructions`; re-emitted in the prolog. The xml-stylesheet PI specifically (PARSE-03) is the most visible — round-trip tests should assert it appears unchanged.
- Namespace prefixes: the adapter records the prefix used at each namespace declaration; the serializer respects the document's declared default prefix. If the document used `cda:` prefixed elements, we emit unprefixed (default namespace) — this is the canonicalization SER-01 demands. The fact that input prefix differs from output prefix is a deliberate Postel's-law normalization, not a bug.

---

## 9. Phase Build Order — Recommendation

**Bottom line: confirm the current ROADMAP with one small re-org. The ordering is dependency-correct.**

Current order (from ROADMAP.md):
```
1: Foundation + ADR
2: Parser + Tolerance
3: Header + Model + Types
4: Templates + Sections + OIDs
5: Helpers + Narrative
6: Serialization
7: Profiles
8: Testing/Examples/Docs
```

### Specific drill-in answers

**Q: Should OID registry + CodedValue resolution land BEFORE the typed model (so TYPES-02 isn't blocked)?**

This is the one real ordering wrinkle. TYPES-02 says `CodedValue.codeSystemName` resolves via the OID registry. If Phase 3 ships `CodedValue` but the registry lands in Phase 4, then Phase-3's `codeSystemName` is stub-undefined for an entire phase.

**Recommendation: split Phase 4 — move OID registry into Phase 3 as a small late plan.** Concretely, the Phase 3 plan list (from ROADMAP):

```
3.1 Composite type parsers (CD, CE, CWE, II, AD, PN, TEL, TS/IVL_TS, PQ, ED) — parallel
3.2 CCDADocument shell + header parsers (patient, author, custodian, encounter)
3.3 Section/entry wrapper traversal
3.4 OID registry (CODE-01, CODE-02 emit)        ← MOVED FROM PHASE 4
3.5 CodedValue.codeSystemName wired to registry
3.6 Mutation methods (gated on read-path)
```

Then Phase 4 becomes purely template-focused:

```
4.1 defineTemplate() API + registry + duplicate-throw + override
4.2 Built-in section templates (parallel across files)
4.3 Built-in entry templates (parallel across files)
4.4 Template-first / LOINC-fallback section lookup wiring
4.5 (was CODE-03) Profile-registered OID extension hooks — DEFER TO PHASE 7
```

CODE-03 ("`defineProfile({ oidRegistry })` extends the registry") only matters once profiles exist; it can move to Phase 7 cleanly. The OID registry plumbing is in place from Phase 3; Phase 7 just adds the profile-extends hook.

**Why this matters:** the Phase-3 verifier should be able to assert TYPES-02 closed without phase-skipping. Today's roadmap ordering forces Phase 3 to ship with TYPES-02 partially stubbed and Phase 4 to backfill — fragile.

**Q: Should serialization land BEFORE helpers (so round-trip tests cover helper output too)?**

**No, current ordering (helpers before serialization) is correct.** Reasoning:
- Helpers (Phase 5) are READ-ONLY views over the typed model. They don't mutate or serialize anything. They have nothing to round-trip.
- Serialization (Phase 6) round-trip tests (SER-02) cover `parse → toString → parse` structural equivalence, which exercises the FULL document model — header, sections, entries, narrative — all of which Phase 5 has already populated. Helpers are downstream readers; their output is automatically covered when the underlying model round-trips.
- The current Phase-6 dependency line ("Depends on: Phase 3, Phase 5") is correct — Phase 5 must land first so narrative reconciliation is in place before round-trip tests assert `<text>` preservation.

If anything, the open question is whether Phase 6 should also depend on Phase 4 explicitly (it does, transitively, through Phase 5 → Phase 4 → Phase 3). I'd add the explicit edge for documentation clarity.

**Q: Should narrative reconciliation be its own phase rather than bundled with helpers?**

**No, keep them in Phase 5 together.** Narrative reconciliation is a peer of helpers in scope (NARR-01..04 = 4 REQs; HELPERS-01..10 = 10 REQs; together = 14 REQs which is right-sized for one phase). Separating them adds a phase boundary that doesn't pay for itself. The plan-level decomposition in Phase 5 already separates them (helpers parallel, narrative serial pair) per the parallelization notes — that's the right granularity.

The one risk: narrative reconciliation depends on the section's typed entries existing (so it can extract `text/reference[@value]` from each entry). Phase 4 ships the templates that produce typed entries, so Phase 5's narrative work isn't blocked. Sequence within Phase 5: narrative-content tree builder is independent and can land first; reconciler depends on entries being in place.

**Q: Should profiles land BEFORE built-in vendor profiles & quirk fixtures, or together?**

**Together in Phase 7, but built-ins must land AFTER the API surface stabilizes** — which is exactly what the current ROADMAP says ("the five built-in profiles...are mutually independent and all parallelizable once the API surface stabilizes"). Confirm this; no change.

The vendor-quirk **fixtures** (TEST-05, TEST-07) are correctly in Phase 8 — fixtures need both the parser (Phase 2) and the profile system (Phase 7) in place. The current edge `Phase 8 depends on Phase 2,3,4,5,6,7` captures this.

### Confirm-or-modify summary

| Phase | Current | Recommendation |
|-------|---------|---------------|
| 1 | Foundation + XML ADR | **CONFIRM** |
| 2 | Parser + Tolerance | **CONFIRM** |
| 3 | Header + Model + Types | **MODIFY**: pull OID registry (CODE-01, CODE-02) into a late plan in this phase so TYPES-02 isn't stubbed |
| 4 | Templates + Sections + OIDs | **MODIFY**: drop CODE-01/02 (moved to Phase 3); CODE-03 (profile-extends) moves to Phase 7 |
| 5 | Helpers + Narrative | **CONFIRM** |
| 6 | Serialization & Round-Trip | **CONFIRM** (consider explicit edge to Phase 4 for clarity) |
| 7 | Profiles + Built-ins | **MODIFY**: add CODE-03 to this phase's REQ list |
| 8 | Testing + Examples + Docs | **CONFIRM** |

REQ-ID re-mapping summary:
- `CODE-01`, `CODE-02` → Phase 4 → **Phase 3**
- `CODE-03` → Phase 4 → **Phase 7**

Total: 116/116 still mapped; 3 REQs migrated.

---

## 10. Performance / Laziness Contract

C-CDA documents range 50KB–5MB. The DOM model is fine for that range (a 5MB CDA is ~50K element nodes — well under 1GB heap on Node 18+).

**Laziness contract per data path** (recommend documenting this explicitly in `STATE.md` and the ADR):

| Data Path | Eager or Lazy | Memoization | Trigger |
|-----------|---------------|-------------|---------|
| **XML parse** (raw → XmlDocument) | Eager | n/a (one-time) | `parseCCDA()` call |
| **Namespace resolution** | Eager | n/a (in-place) | during XML parse |
| **Header parse** (patient, author, custodian, etc.) | Eager | per-doc cache | `parseCCDA()` call |
| **Document type detection** | Eager | per-doc cache | `parseCCDA()` call |
| **Section index** (templateIds, code, title, raw text node, raw entry nodes) | Eager | per-doc cache | `parseCCDA()` call |
| **IDREF map** (id → XmlNode) | Eager | per-doc cache | `parseCCDA()` call |
| **Section.entries** (typed entry parse) | **Lazy** | per-section cache | first `section.entries` access |
| **Section.text** (narrative content tree) | **Lazy** | per-section cache | first `section.text` access |
| **Narrative reconciliation** | **Lazy** | per-section cache | `section.reconcile()` call |
| **Helper rollups** (`doc.problems.active`, etc.) | **Lazy** | per-doc cache, per-helper | first helper-property access |
| **`<observationMedia>` base64 decode** (PARSE-06) | **Lazy** | per-attachment cache | `attachment.bytes` access |
| **Strict-mode IG validation** | Eager IF `{ strict: true }` else **lazy** if `{ validate: true }` else never | per-doc cache | option flag |
| **`doc.toJSON()` / `doc.toString()` / `doc.prettyPrint()`** | Lazy (computed on call) | NOT cached (output may differ if mutated) | method call |

**Why eager skeleton, lazy fill:**
- The skeleton (header + section index + ID map) is what every consumer touches. Parsing it eagerly is the right tax for the "one-line DX" north star — `doc.patient.mrn` cannot wait on lazy parsing without breaking the API.
- Entry parsing is the expensive part (template lookup + RIM type parsing per entry; a Results section can have 200+ observations). Most consumers want one specific section's entries; lazy parsing is a 10x-50x win for typical use.
- Narrative trees are heavy (mixed-content tree with potentially hundreds of inline elements per section). Most consumers ignore narrative entirely; lazy is mandatory.
- Helpers are derived; caching them per-doc is correct because mutation invalidates the document anyway (new instance, empty cache — see §3 mutation).
- Base64 attachments can be megabytes. PARSE-06 explicitly mandates lazy.

**Cache invalidation:** because mutation returns a new `CCDADocument` (§3), caches are per-instance and never need invalidation. The new instance has an empty cache; the old instance is still valid for its frozen view of the data.

---

## 11. Build-Order Dependency Graph

```
Phase 1 (Foundation + ADR)
   │
   ▼
Phase 2 (Parser + Tolerance)
   │
   ├──────────────┐
   ▼              │
Phase 3           │
(Header, Model,   │
 Types, OIDs)     │
   │              │
   ▼              │
Phase 4           │
(Templates +      │
 Section lookup)  │
   │              │
   ▼              │
Phase 5 (Helpers + Narrative)
   │
   ▼
Phase 6 (Serialization)
   │     ▲
   │     │
Phase 7 (Profiles + Built-ins) ─────┐
                                     │
                                     ▼
                               Phase 8 (Testing + Examples + Docs)
                                     ▲
                                     │
                          (fed by Phases 2, 3, 4, 5, 6, 7)
```

Critical paths:
- Phase 3 OID move: CODE-01/02 must complete before Phase 3 can ship TYPES-02 closed. Plan-level: OID registry plan comes after composite parsers but can run parallel to mutation plan.
- Phase 7 must wait on Phase 6 because PROF-09 (round-trip with profile produces clean C-CDA) requires `toString()` to exist.
- Phase 8 fixtures depend on Phases 2-7 in their entirety — no surprises.

---

## 12. Anti-Patterns to Avoid

- **Letting concrete XML library types leak past `src/xml/`.** Even one `import { XMLParser } from 'fast-xml-parser'` outside `xml/` breaks the swap discipline.
- **Eagerly parsing all entries on `parseCCDA()`.** A 5MB CDA with 800 entries would do 800 template lookups + RIM parses for a consumer who only wants `doc.patient.mrn`. Lazy entries is mandatory.
- **In-place mutation under the "immutable" banner** (the `markDirty` variant). Pick one and commit; my recommendation is structural-sharing-with-new-instance.
- **Helpers reaching into raw XmlNodes.** Helpers should consume the typed entry model (`section.entriesOfKind("problem-observation")`), never `node.getAttribute('value')`. If a helper needs raw XML, it's a sign the entry template under-parses.
- **Hand-coding the built-in template registry as a bespoke object literal.** Use `defineTemplate()` for every built-in. This is the honesty discipline that makes the public API trustworthy. (Same lesson `@cosyte/hl7` learned with `defineProfile()`.)
- **Mixing parser-emitted warnings and IG-validation issues into a single array.** TOL-06 explicitly separates `doc.warnings` (parser-level) from `doc.issues` (IG-validation). Don't merge them; the separation is consumer-meaningful.
- **Narrative rewriting from structured entries** (NARR-04 forbids it). Resist any temptation to "improve" `<text>` from typed entry data.
- **Synchronous OID-resolution side effects** (e.g., logging on lookup miss). Emit the warning through `ctx.emitWarning` and return undefined. No console.

---

## 13. Open Questions for Phase 1 Discuss-Step

1. **XML parser final lock** — current recommendation `fast-xml-parser`, but ADR may surface a maintenance signal that swings to `@xmldom/xmldom`. Architecture is robust to either.
2. **Strict-mode IG-rule registry shape** — declarative (rules-as-data) vs functional (rules-as-functions). Recommendation: declarative for cardinality; functional for binding checks. Defer to Phase 2 plan that builds the warnings registry.
3. **Discriminator string convention** — `"problem-observation"` vs `"problemObservation"` vs the OID itself. Recommend kebab-case strings, locked at template-registration time.
4. **Single OID registry vs per-doc-instance overlay** — the "merged: builtin + profile" registry can be either (a) mutated per parse (bad: side effects across parses) or (b) a layered lookup (better: built-in shared, profile layer per ParseContext). Recommend (b).
5. **Should `CCDADocument` expose `doc.rawXml`?** — useful escape hatch for advanced consumers, but couples them to the XML adapter type. Recommend YES, with a clear "advanced / unstable" docstring; type as `unknown` if we want to discourage use.

---

## 14. Sources

- `/home/nschatz/projects/cosyte/hl7-parser/src/` — direct read of the baseline layout (HIGH confidence on conventions)
- `/home/nschatz/projects/cosyte/ccda/.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md` — REQ-ID counts, phase boundaries, key decisions (HIGH confidence)
- `@cosyte/hl7` Phase 6 profiles + Phase 3 model code as proven patterns for `defineProfile`/`Hl7Message`/wrapper-cache (HIGH confidence — read directly)
- [fast-xml-parser docs (v4 XMLparseOptions)](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/docs/v4/2.XMLparseOptions.md) — `preserveOrder`, namespace handling, mixed-content support (MEDIUM confidence — verified that the features exist; not verified for this exact version's edge cases)
- [fast-xml-parser npm](https://www.npmjs.com/package/fast-xml-parser) — license, maintenance signal (MEDIUM confidence)
- HL7 CDA R2 / C-CDA R2.1 IG knowledge from training (MEDIUM confidence; ADRs and built-in template authors will validate against the published IG)
- General immutable-data-structure patterns (Immer, Immutable.js — structural sharing) — HIGH confidence on the pattern, MEDIUM confidence on best fit for C-CDA depth

---

*Architecture document for Phase 6 Research, project @cosyte/ccda. Locked in this version against the inputs above; revisit at the Phase 1 discuss-step after the XML-parser ADR commits.*
