# Technology Stack — `@cosyte/ccda`

**Project:** `@cosyte/ccda` — TypeScript-strict, dual-ESM+CJS, Node-18+ C-CDA R2.1 parser library
**Researched:** 2026-04-22
**Overall confidence:** HIGH on build/test toolchain and encoding; HIGH on XML-parser recommendation; MEDIUM on OID-registry strategy (no maintained npm package fits the bill — own registry is the answer).

---

## TL;DR — Prescriptive Stack

| Layer | Choice | Version (verified npm 2026-04-22) | License | Confidence |
|---|---|---|---|---|
| **XML parser (runtime)** | **`@xmldom/xmldom`** | `0.9.10` (2026-04-18) | MIT | **HIGH** |
| **XMLDSig (v2, not v1)** | `xml-crypto` (xmldom-family) | `6.1.2` | MIT | HIGH |
| **Bundler** | `tsup` | `8.5.1` | MIT | HIGH |
| **Test runner** | `vitest` + `@vitest/coverage-v8` | `4.1.5` / matching | MIT | HIGH |
| **Linter** | `eslint` (flat config) + `typescript-eslint` | `10.2.1` / `8.59.0` | MIT | HIGH |
| **Formatter** | `prettier` | `3.8.3` | MIT | HIGH |
| **Encoding (runtime, conditional)** | **None — Node `Buffer.from(...)` + WHATWG `TextDecoder` only** | — | — | HIGH |
| **OID registry** | **Own hand-curated TS module** (no npm dep) | — | — | HIGH |
| **ADR tooling** | **Plain markdown** under `.planning/adr/NNNN-*.md` | — | — | HIGH |
| **devDep: XML schema validation (Phase-8 Schematron-adjacent)** | `xmllint-wasm` (test-only) | `5.2.0` | MIT | MEDIUM |

**Total runtime deps: 1** (`@xmldom/xmldom`). Well under the ≤ 3 budget. `xml-crypto` only enters at the v2 XMLDSig roadmap item.

---

## 1. The XML-Parser Decision (the central ADR)

### Recommendation: `@xmldom/xmldom@0.9.10`

**Second-choice fallback:** `fast-xml-parser@5.7.x` *only* if a future profiling pass shows xmldom is unacceptably slow on the upper end of the 50KB–5MB document range. The fallback carries real costs (no DOM API, weaker namespace handling, custom round-trip plumbing, dependency on a four-package transitive tree, and a high CVE cadence).

### Candidate matrix

| Library | Latest | Pub date | Wk DLs | License | Deps | Native? | Maint signal | NS preserve | Mixed content | PI preserve | Round-trip prefix fidelity | ID/IDREF | TS types |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **`@xmldom/xmldom`** | 0.9.10 | 2026-04-18 | 25.5M | MIT | 0 | No | Active, fortnightly releases, security-responsive | **Yes — DOM Level 2 namespace-aware** (`createElementNS`, `getElementsByTagNameNS`) | **Yes (DOM Text + Element + CDATA nodes)** | **Yes (`createProcessingInstruction`)** | Good — preserves prefixes & namespaces; minor known deviations from the WHATWG serializer algorithm | `getElementById` (yes); IDREF resolution = build it ourselves | Built-in `.d.ts` |
| `fast-xml-parser` | 5.7.1 | 2026-04-17 | 71.4M | MIT | 4 | No | Hyperactive (15 patch releases in last 6 wks) — also implies high vuln-discovery rate | Strips by default; `removeNSPrefix:false` keeps the prefix as part of the tag name (string handling, not real namespace lookup) | **Partial** — `preserveOrder: true` produces an array-of-nodes form that captures interleaved text, but the dev model is awkward and post-parse traversal is hand-rolled | Yes via PI option | `preserveOrder` + `XMLBuilder` round-trips order, **but does not guarantee whitespace, comment positions, or attribute order**. Bug-prone in mixed-content narrative. | None (manual) | Built-in |
| `sax` | 1.6.0 | 2026-03-17 | 70.3M | BlueOak-1.0.0 | 0 | No | Maintained (isaacs) | Streaming events expose namespace URIs if you set the strict+xmlns flags | Streaming — you build the model | Yes (event) | N/A — no built-in serializer | None — DIY | `@types/sax` (DefinitelyTyped) |
| `saxes` | 6.0.0 | 2021-11-07 | 57.8M | ISC | 1 (`xmlchars`) | No | **Stalled** since Nov 2021 (4.5 yrs no release); volume from being a transitive dep | Yes, namespace-aware sax | Streaming | Yes | N/A | None | Built-in |
| `libxmljs2` | 0.37.0 | 2025-06-01 | 361K | MIT | `bindings`, `nan`, `node-gyp`, `prebuild-install` | **Yes (libxml2 bindings)** | **README says "NO LONGER MAINTAINED"** — final release 2025-06; `nan`/`node-gyp` toolchain is brittle on Node 22+ | Full libxml2 namespace support | Yes | Yes | Best-in-class fidelity | Yes (`getElementById`, libxml2 IDREF) | `@types/libxmljs2` |
| `htmlparser2` | 12.0.0 | 2026-03-20 | 69.7M | MIT | 4 | No | Active | **HTML-first** — XML namespace handling is by-tag-name only; no NS URI lookup | Yes | Limited | No real round-trip serializer (use `dom-serializer`) | None | Built-in |
| `slimdom` | 4.3.5 | 2024-04-01 | 19.7K | MIT | 0 | No | Quiet (last release April 2024); pure TS, namespace-correct per the DOM spec | **Yes — strictly DOM-spec namespace-correct** (the `xmldom` README explicitly notes `xmldom` deviates) | Yes | Yes | `serializeToWellFormedString` is good but not 100% byte-stable | **No `getElementById` implementation** | Built-in TS |
| `ltx` | 3.1.2 | 2025-01-11 | 30K | MIT | 0 | No | XMPP-focused; small surface | Limited | Limited | Limited | Limited | None | Built-in |
| `node-expat` | 2.4.1 | 2024-03-08 | 159K | MIT | `bindings`, `nan` | **Yes (expat bindings)** | Quiet; same `nan`/`node-gyp` install pain as libxmljs2 | Streaming | Streaming | Yes | N/A — streaming | None | DefinitelyTyped |

### Why `@xmldom/xmldom` wins for C-CDA specifically

C-CDA's pain points map directly to DOM-shaped problems:

1. **Namespaces are the central hazard.** C-CDA carries `xmlns="urn:hl7-org:v3"` as default plus `xsi`, `voc`, `sdtc`, and inconsistent vendor prefixing of `cda:`. We need real `getElementsByTagNameNS('urn:hl7-org:v3', 'templateId')` semantics so a vendor that re-binds the default namespace to `cda:` parses the same as one that doesn't. **Only the DOM-shaped libraries (xmldom, slimdom, libxmljs2) get this right.** `fast-xml-parser` and `htmlparser2` fall back to string matching on prefixed names, which means every template/section lookup has to handle prefix variants by hand — an entire class of bugs we'd rather not own.

2. **Mixed content is C-CDA narrative.** `<text>` blocks contain text nodes interleaved with `<paragraph>`, `<list>`, `<table>`, `<content ID="...">`, `<linkHtml>`, `<br/>`, and so on. The DOM model represents this natively as `childNodes` with `Node.TEXT_NODE` and `Node.ELEMENT_NODE` siblings. `fast-xml-parser` represents mixed content as an array-of-objects under `preserveOrder: true` that requires a custom traversal layer and is genuinely awkward to walk for the kind of narrative-iteration helpers we're shipping (NARR-01, NARR-02).

3. **IDREF resolution (PARSE-05).** `xmldom` ships `getElementById`. C-CDA's narrative `content[@ID]` uses XML `ID`, not `xml:id`, and we still want a fast lookup. We will need to *register* IDs ourselves regardless (XML-DOM's `getElementById` only finds attributes typed as `ID` by a DTD, which C-CDA doesn't ship), but the surrounding DOM API (`Document.querySelectorAll` is missing in xmldom but `getElementsByTagName*` is enough) makes our own ID-index implementation small and obvious.

4. **Processing instructions (PARSE-03).** `<?xml-stylesheet?>` survives a parse-and-serialize round-trip with xmldom because PIs are first-class DOM nodes. `fast-xml-parser` has options for PIs but they're a separate code path.

5. **Round-trip serialization (SER-01, SER-02).** xmldom's `XMLSerializer.serializeToString()` is the W3C reference shape. There are documented deviations from the WHATWG serialization algorithm at the prefix-allocation edge, but for the canonical C-CDA emission case (we'll always emit `xmlns="urn:hl7-org:v3"` and known prefixes) we control the input shape. The new `requireWellFormed: true` option (added 0.9.10) hardens us against accidental injection in our own emitted documents.

6. **Ecosystem alignment.** `xml-crypto` (XMLDSig, 2.6M weekly downloads) and `xpath` (7M weekly downloads) both depend on `@xmldom/xmldom`. If we ever ship the v2 XMLDSig validation deferral, the document handed to `xml-crypto` is the same document we already parsed. No rewrite, no double-parse, no model translation. This is the single biggest forward-compatibility argument.

7. **Zero transitive deps.** `@xmldom/xmldom` declares zero `dependencies`. `fast-xml-parser` brings in `@nodable/entities`, `fast-xml-builder`, `path-expression-matcher`, and `strnum`. For a library where every supply-chain link matters, four extra hops vs. zero is meaningful.

### Why we reject each alternative

| Library | Reject reason |
|---|---|
| `fast-xml-parser` | Namespace handling is name-string only (no real NS URI lookup); mixed-content model under `preserveOrder` is clumsy for narrative; high CVE cadence (10 GitHub advisories since 2023, including critical and high in Q1 2026); 4 transitive deps; v4 to v5 breaking changes still echoing through ecosystem. **Kept as written-down second choice** purely as the perf escape hatch if xmldom underperforms on 5MB documents. |
| `sax` | Streaming-only; we'd build the entire DOM ourselves. C-CDA documents are 50KB–5MB — the perf win from streaming doesn't justify owning a model layer. Streaming may revisit at v2 for the "very large documents" deferral. |
| `saxes` | Stalled (no release since Nov 2021); inherits sax's streaming-only constraints. |
| **`libxmljs2`** | **Hard reject.** README explicitly says "NO LONGER MAINTAINED"; native bindings via `nan`/`node-gyp` make `pnpm install` brittle on locked-down CI hosts (no compiler, no Python, ARM/Linux-musl edge cases); prebuilt-binaries are not always current to Node 22/24. A library shipped to other developers cannot make `node-gyp` their problem. |
| `htmlparser2` | HTML-first (no real XML namespace model); not designed for round-trip XML serialization. Wrong tool. |
| `slimdom` | Strong on namespace correctness (better than xmldom on paper) and pure TS, but: (a) **no `getElementById`** out of the box, (b) very low adoption (~20K weekly downloads vs. 25.5M), (c) last release April 2024 — quieter than xmldom, (d) round-trip serializer recommends `serializeToWellFormedString` but isn't byte-stable either. The namespace-correctness edge does not outweigh the ecosystem mass behind xmldom + `xml-crypto` + `xpath`. **Worth re-evaluating at v2** if xmldom maintenance falters. |
| `ltx` | XMPP-focused; not a general XML library. |
| `node-expat` | Same native-bindings install pain as `libxmljs2`; streaming-only. |

### Risks we're explicitly accepting on `@xmldom/xmldom`

1. **CVE history is non-trivial.** April 2026 alone shipped 5 high-severity advisories (CVE-2026-41672/41673/41674/41675 and CVE-2026-34601), all patched in 0.9.10 (the version we're pinning). Mitigation: pin a floor (`"@xmldom/xmldom": "^0.9.10"`), keep it on Renovate/Dependabot, and audit the CHANGELOG at every milestone bump.
2. **Documented namespace-prefix deviations vs. WHATWG.** For *parsing* C-CDA this doesn't bite (we read namespaces, we don't generate prefix conflicts at parse time). For *emission* (SER-01) we will be the source of truth for prefixes we emit, so the deviations don't affect us in the canonical-emission path. Confirm with a Phase-2 round-trip test on a known mixed-prefix fixture.
3. **No `querySelector` / no XPath.** We'll write our own simplified XPath-ish accessor (MODEL-05 — "no XPath engine" is already in the requirements), so this is a non-issue.

### ADR template (for `.planning/adr/0001-xml-parser.md`)

```
# ADR-0001: XML Parser Choice — @xmldom/xmldom

Status: Accepted (Phase 1)

## Context
[Problem: C-CDA needs namespace-aware DOM, mixed-content narrative,
PI preservation, IDREF resolution, round-trip serialization.]

## Decision
Adopt @xmldom/xmldom@^0.9.10 as the sole XML runtime dependency.

## Alternatives Considered
- fast-xml-parser (rejected: NS handling, CVE cadence, mixed-content awkwardness)
- libxmljs2 (rejected: unmaintained + native bindings)
- slimdom (rejected: low adoption, no getElementById)
- sax/saxes (rejected: streaming-only; v2 candidate)

## Maintenance Signals
- 25.5M weekly downloads, MIT, 0 deps
- Released 2026-04-18 (0.9.10)
- Patched 5 CVEs same day
- xml-crypto + xpath ecosystems depend on it

## Bar Cleared
- MIT license: yes
- Actively maintained: yes (fortnightly releases)
- Trusted: yes (xml-crypto, xpath, JSDOM-adjacent ecosystem)
- ADR-tracked: this document
```

---

## 2. Build Toolchain — `tsup`

### Recommendation: keep `tsup@^8.5.1`. **Confirm the @cosyte/hl7 baseline.**

**Why not switch:**

- `tsup` is at `8.5.1` (2025-11-12), still actively maintained, still the boring-and-correct dual-ESM+CJS bundler for TS libs.
- `tsdown` (`0.21.10`, rolldown-based, from the Vite team) is genuinely interesting — faster, written by the rolldown crew — but at `0.x` it's still pre-1.0 with sub-monthly breaking changes. Wait for `1.0.0` plus six months of soak before adopting on a healthcare library where supply-chain calm is the point.
- `unbuild` (`3.6.1`, unjs) is fine for nuxt-adjacent use but heavier than tsup for our needs.
- `tshy` (`4.1.1`, Isaac Schlueter) is a credible alternative — it uses `tsc` directly, no esbuild, very predictable output. But it doesn't bundle (each `.ts` becomes one `.js`), so it's a different deliverable shape. Stick with the @cosyte/hl7 model: bundled `dist/index.mjs` + `dist/index.cjs`.

**Action:** copy the `@cosyte/hl7` `tsup.config.ts` verbatim, change entry point and types path.

---

## 3. Testing — `vitest` + `@vitest/coverage-v8`

### Recommendation: keep `vitest@^4.1.5`. **Confirm the @cosyte/hl7 baseline.**

`vitest` 4.x (released 2026-04-21) is the current generation; 1.x to 4.x is a major-version jump from the @cosyte/hl7 lock — coordinate when bumping. `@vitest/coverage-v8` should match the vitest major.

### C-CDA-specific dev-only additions worth picking up

| Package | Purpose | When |
|---|---|---|
| **`xmllint-wasm@^5.2.0`** | XSD validation in Phase 8 against the C-CDA R2.1 schema (CCDA_RNF_RIM_FIXED + ccd.xsd). Pure WASM, no native install, MIT, 0 deps, 107K weekly downloads. Use only in `test/` to assert our canonical fixtures are XSD-valid. **Do NOT** add as runtime dep. | Phase 8 (TEST-02 canonical-fixture validity) |
| **No XML diff library** | Ship our own structural-diff over the parsed-document model — see section 4 below. | — |

`xmllint-wasm` solves "is our canonical-emission XML actually valid against the C-CDA Schematron-adjacent XSDs" without dragging libxmljs2's native pain into devDeps. (Schematron the file format is a separate beast — it's deferred to v2 per the requirements.)

---

## 4. Round-Trip Equivalence Testing — Don't add a c14n dep

### Recommendation: implement structural deep-equal over our own parsed `CCDADocument` model.

**Why not pull in canonical-XML / structural-diff packages:**

- `xml-c14n@0.0.6` is 2013-vintage, unmaintained, BSD, single-author. Hard pass.
- The serious c14n implementation in JS is part of `xml-crypto` (and only useful when we get to XMLDSig in v2). Pulling it in *now* for round-trip tests would add a runtime dep we don't need.
- Structural-XML diff packages (`xmldiff`, `diff-xml`, etc.) are all weakly maintained npm libraries. None are credible.

**The actual problem we're solving (SER-02):** "parse to toString to parse yields a structurally equivalent `CCDADocument`." That's our model — we *own* the equivalence definition. Implement a `documentsAreStructurallyEquivalent(a, b)` test helper that compares:

- normalized header fields
- ordered `templateIds`
- per-section: templateIds, code, title, entries (recursively)
- narrative comparison: walk the `text` content tree and compare structure modulo whitespace-only text-node coalescing

This is ~150 lines of test-helper code, zero new deps, and we control exactly what "equivalent" means — which is what the Postel's-Law emitter contract demands.

For mixed-content narrative specifically: an element-by-element walk of `childNodes` post-`Document.normalize()` is sufficient. If we want extra confidence, optional: pretty-print both sides via `xml-formatter@3.7.0` (devDep only) and snapshot-diff. Not strictly needed.

---

## 5. OID / Terminology Registry — Ship our own

### Recommendation: hand-curated TypeScript module under `src/code-systems/registry.ts`. **No npm dependency.**

**Why not pull in a package:**

- There is no maintained, narrowly-scoped npm package that does "OID -> codeSystemName" for the dozen HL7 code systems we need. Searching for HL7 / SNOMED / LOINC / RxNorm npm packages returns either:
  - giant terminology-server clients (`fhir.js`, FHIR terminology services) — way out of scope
  - dead 5-year-old packages (`hl7-dictionary`, `oid-utils`) with under 1K weekly downloads
  - Python ports
- The data we need (CODE-01) is ~20–30 OID-to-name mappings, each of which is a single-line TypeScript object. Hand-curating is faster than evaluating any package. We also get exact control over names matching what C-CDA emitters actually write.
- Keeping it in-source means `defineProfile({ oidRegistry: { ... } })` (CODE-03) extends the *same* shape developers already see in our source — no adapter layer, no version-pinning of an external data package.

**Implementation pattern:**

```typescript
// src/code-systems/registry.ts
export const BUILT_IN_OID_REGISTRY = {
  '2.16.840.1.113883.6.96':  { name: 'SNOMED CT', uri: 'http://snomed.info/sct' },
  '2.16.840.1.113883.6.1':   { name: 'LOINC', uri: 'http://loinc.org' },
  '2.16.840.1.113883.6.88':  { name: 'RxNorm', uri: 'http://www.nlm.nih.gov/research/umls/rxnorm' },
  // ...
} as const satisfies Record<string, { name: string; uri?: string }>;
```

That's the entire dep. Sourced from the HL7 OID Registry (`https://oidref.com`) and the C-CDA Companion Guide.

**If it turns out we need more:** `@types/hl7` doesn't exist; the closest curated source is the iHRIS `hl7-dictionary` JSON dump on GitHub which we could vendor (copy the data, not the dep) if our 30 OIDs grows past 100.

---

## 6. Encoding / Character Sets — No `iconv-lite`

### Recommendation: **Node stdlib only.** Use `Buffer` plus WHATWG `TextDecoder`. Skip `iconv-lite`.

**Why:**

- Node 18+ ships WHATWG `TextDecoder` natively, with full ICU support including `iso-8859-1`, `windows-1252`, `utf-8`, `utf-16`, and roughly 30 other encodings — well past what C-CDA documents actually carry.
- Real-world C-CDA: 99%+ are UTF-8 (the IG mandates it). The remaining tail is `iso-8859-1` and `windows-1252` from older Meditech / regional HIE feeds. Both are TextDecoder-supported out of the box.
- `iconv-lite@0.7.2` has 216M weekly downloads and is solid, but it's 200KB and brings in `safer-buffer`. For a library where "≤ 3 runtime deps" is a hard constraint and TextDecoder covers the realistic case, adding `iconv-lite` is unjustified.
- BOM handling (PARSE-07) is trivial: strip a leading `0xEF 0xBB 0xBF` before decoding.

**The escape hatch:** if Phase 2 surfaces a vendor fixture in some encoding `TextDecoder` can't handle (extremely unlikely — Node ships full ICU since 13), revisit and add `iconv-lite` with an ADR. Lock in the no-dep path now.

**Implementation sketch:**

```typescript
const BOM = '\uFEFF';

function readXmlInput(raw: string | Buffer): string {
  if (typeof raw === 'string') {
    return raw.startsWith(BOM) ? raw.slice(1) : raw;
  }
  // Sniff XML declaration encoding; default UTF-8
  const head = raw.subarray(0, 256).toString('latin1');
  const m = /<\?xml[^?>]*encoding=["']([^"']+)["']/i.exec(head);
  const encoding = (m?.[1] ?? 'utf-8').toLowerCase();
  const decoded = new TextDecoder(encoding, { ignoreBOM: false }).decode(raw);
  return decoded.startsWith(BOM) ? decoded.slice(1) : decoded;
}
```

Zero deps. PARSE-07 satisfied.

---

## 7. ADR Tooling — Plain markdown, no dep

### Recommendation: plain `.md` files under `.planning/adr/` named `NNNN-<slug>.md`. **No tooling.**

**Why not adr-tools or log4brains:**

- `adr-tools@2.0.4` (last release 2020) is shell scripts that just create a numbered markdown file from a template. We can do that with a 10-line bash function — or just type `0001-xml-parser.md`.
- `log4brains@1.1.0` (last release Dec 2024) generates a static-site UI for ADRs. Beautiful. Also massive overkill for a library that will end up with 1–3 ADRs total (one per runtime dep, capped at 3).
- The constraint (SETUP-03, DOC-16d) is "one ADR per runtime dep, justifying inclusion." That's a 30-line markdown file per ADR. Tooling is friction.

**Pattern:** copy the ADR template sketched in section 1 into `.planning/adr/template.md`. Number files sequentially. Done. The lightest-weight thing that meets the requirement is the requirement-meeting thing.

---

## Final dependency manifest (concrete `package.json` fragments)

```json
{
  "engines": { "node": ">=18.0.0" },
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "dependencies": {
    "@xmldom/xmldom": "^0.9.10"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@vitest/coverage-v8": "^4.1.5",
    "eslint": "^10.2.1",
    "typescript-eslint": "^8.59.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-jsdoc": "^48.0.0",
    "prettier": "^3.8.3",
    "tsup": "^8.5.1",
    "tsx": "^4.0.0",
    "typescript": "^5.3.0",
    "vitest": "^4.1.5",
    "xmllint-wasm": "^5.2.0"
  }
}
```

**Runtime deps: 1 / 3.** Headroom for two more if a profiling-driven need emerges (e.g. `iconv-lite` for an unforeseen encoding) — each requiring its own ADR per SETUP-03.

---

## What changed vs. the `@cosyte/hl7` baseline

| Area | `@cosyte/hl7` | `@cosyte/ccda` | Reason |
|---|---|---|---|
| Runtime deps | 0 | 1 (`@xmldom/xmldom`) | XML w/ namespaces + mixed content + PIs is not worth re-implementing |
| Bundler | tsup | tsup | unchanged |
| Test runner | vitest 1.x | vitest 4.x | bump to current generation |
| Linter | eslint 8.x + `@typescript-eslint/*` (legacy plugin shape) | eslint 10.x flat config + `typescript-eslint` (unified package) | flat config is now the only supported eslint mode |
| Coverage | `@vitest/coverage-v8` 1.x | `@vitest/coverage-v8` 4.x | match vitest major |
| Encoding | n/a (HL7 v2 is ASCII-ish) | Node stdlib `TextDecoder` only | UTF-8 dominant; no dep needed |
| ADR tooling | none | plain markdown | required by SETUP-03 / DOC-16d for the XML-parser dep |

---

## Confidence Assessment

| Decision | Confidence | Notes |
|---|---|---|
| `@xmldom/xmldom` as the XML parser | **HIGH** | Verified version, license, deps, CVE patch status, ecosystem alignment with `xml-crypto`/`xpath`, namespace-aware DOM, mixed-content support, PI support, MIT, 0 deps. The single most-investigated decision in this doc. |
| `tsup` confirmed | **HIGH** | Already proven on `@cosyte/hl7`; current at 8.5.1; alternatives (tsdown) not yet 1.0. |
| `vitest` 4.x confirmed | **HIGH** | Released 2026-04-21; current generation. |
| `eslint` 10 flat + `typescript-eslint` 8 | **HIGH** | Current GA versions as of 2026-04-22. |
| `prettier` 3.8.3 | **HIGH** | Current. |
| **No** `iconv-lite` | **HIGH** | Node 18+ ICU TextDecoder covers realistic C-CDA charsets; explicit escape hatch documented. |
| **Own** OID registry, no npm dep | **HIGH** | Verified no maintained, narrowly-scoped npm package fits the "OID -> codeSystemName" need; data set is small enough to hand-curate. |
| **Plain-markdown** ADRs | **HIGH** | Volume (1–3 ADRs) doesn't justify tooling. |
| `xmllint-wasm` for Phase-8 schema validation | **MEDIUM** | We don't yet know whether shipping XSDs in test/ matches our actual fixture-generation strategy; revisit during Phase 8 planning. |
| Skip canonical-XML / XML-diff library | **HIGH** | Round-trip equivalence is over our own model, not the XML byte-stream. |
| Second-choice fallback `fast-xml-parser` | **MEDIUM** | Only the *fallback designation* is medium — it's a real fallback if perf demands it, but the costs (NS handling, CVE cadence, mixed-content awkwardness) are real and we should treat the switch as a redesign, not a swap. |

---

## Open Questions for Phase Research

These are flagged for downstream phases; not blockers on Phase 1.

1. **Phase 2:** Does `xmldom`'s `XMLSerializer.serializeToString()` actually round-trip a mixed-prefix C-CDA fixture (`<cda:section>` vs default-namespace `<section>`) with byte-stable namespace declarations? Build a fixture early; confirm or document deviation.
2. **Phase 2:** What is real-world parse latency for a 5MB C-CDA on Node 22? If > 200ms, revisit `fast-xml-parser` fallback.
3. **Phase 6:** Does `xmldom` preserve attribute order on serialization? (Our spec says we always emit canonical, so order is *our* choice — but we want to pick stable order.)
4. **Phase 8:** Final call on `xmllint-wasm` vs. hand-rolled structural validation for the canonical-fixture sweep.
5. **v2 roadmap:** When XMLDSig lands, confirm `xml-crypto@^6` still hands DOM nodes from `@xmldom/xmldom@^0.9` cleanly (it does today; verify at the time).

---

## Sources

- npm Registry API — package metadata, version dates, licenses, dependency lists, weekly downloads (queried 2026-04-22)
- [`@xmldom/xmldom` CHANGELOG (0.9.10)](https://github.com/xmldom/xmldom/blob/master/CHANGELOG.md) — confirms April 2026 CVE patches and `requireWellFormed` option
- [GitHub Advisories Database — `@xmldom/xmldom`](https://github.com/advisories?query=xmldom) — 9 advisories total, 5 high-severity April 2026 patched in 0.9.10
- [GitHub Advisories Database — `fast-xml-parser`](https://github.com/advisories?query=fast-xml-parser) — 10 advisories since 2023 including critical Feb 2026
- [`fast-xml-parser` CHANGELOG](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/CHANGELOG.md) — 15+ patch releases in last 6 weeks
- [`libxmljs2` README](https://github.com/marudor/libxmljs2) — explicit "NO LONGER MAINTAINED" notice
- [`slimdom.js` README](https://github.com/bwrrp/slimdom.js) — namespace-correct DOM, no `getElementById`, last release April 2024
- [`xml-crypto`](https://github.com/node-saml/xml-crypto) — depends on `@xmldom/xmldom` (ecosystem-alignment evidence)
- [HL7 OID Registry (oidref.com)](https://oidref.com) — source for hand-curated `BUILT_IN_OID_REGISTRY`
- [Node 18 WHATWG TextDecoder docs](https://nodejs.org/api/util.html#class-utiltextdecoder) — confirms ICU encoding coverage including iso-8859-1, windows-1252
