# ADR 0001 — XML parser for C-CDA

- **Status:** Proposed (pending decision — placeholder)
- **Date:** 2026-06-26
- **Deciders:** Noah Schatz

## Context

C-CDA is an XML format (HL7 CDA R2.1). Parsing it needs an XML reader, which the `@cosyte/*` parsers
do **not** otherwise carry — the suite defaults to **zero runtime dependencies** as a supply-chain
gate (see the meta-repo's `documentation/conventions.md` → "Zero (or near-zero) runtime
dependencies"). The standard makes a **capped, ADR-justified exception** for `ccda`/`ncpdp`: an XML
parser is allowed for their XML/EDI formats, decided per an ADR, with a ceiling of **≤ 3** runtime
deps total.

Adding a runtime dependency is a **one-way door**: once `@cosyte/ccda` is published with an XML parser
in its dependency tree, consumers inherit it and removing it later is a breaking change. The scaffold
therefore stays **zero-dep** and defers this choice until the parse layer is actually being built.

## Decision

**Pending.** No XML-parser dependency is added at scaffold time. The `parseCcda` stub in
`src/index.ts` is zero-dep and returns the archetype shape only.

When the real parse layer lands, ratify one of the candidates below (or a justified alternative) by
updating this ADR to **Accepted**, recording the rationale, and only then adding the dependency.

## Options under consideration

- **`@xmldom/xmldom`** — a standards-compliant, pure-JS W3C DOM (`DOMParser`/`XMLSerializer`)
  implementation. Leaning toward this: a real DOM maps cleanly onto C-CDA's
  document → section → entry → template structure and onto a spec-clean **serializer** (Postel's Law:
  lenient parse, conservative emit), and it has no native build step. Heavier than a SAX/streaming
  reader.
- **`fast-xml-parser`** — fast, zero-native-deps, parses to plain JS objects. Lighter and quicker,
  but object-mode (not a DOM) makes faithful round-trip serialization and namespace/attribute
  fidelity more work to get spec-clean.

Both are evaluated against: round-trip fidelity (namespaces, attributes, mixed content, the
structured-body ↔ narrative-block agreement C-CDA requires), bundle/supply-chain weight, maintenance
health, and TypeScript types.

## Consequences

- Until ratified: `@cosyte/ccda` ships **zero runtime deps**; the drift check and CI stay green on the
  zero-dep baseline.
- After ratification: at most one XML-parser dep is added (well within the ≤ 3 cap), this ADR is
  updated to **Accepted** with the chosen library and rationale, and `CLAUDE.md` + the meta-repo
  `documentation/` (ecosystem-map + `repos/ccda.md`) are updated to reflect the new runtime-dep
  posture (per the "documentation follows code" discipline).
