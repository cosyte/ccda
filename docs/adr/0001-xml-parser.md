# ADR 0001 — XML parser for C-CDA

- **Status:** Accepted — `@xmldom/xmldom`
- **Date:** 2026-06-28 (accepted; proposed 2026-06-26)
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

**Adopt `@xmldom/xmldom`** as the single XML-parser runtime dependency for `@cosyte/ccda`,
**exact-pinned** (`0.9.10` at acceptance). This is **1 of the ≤ 3** runtime-dep budget; no other
runtime dep is added. The same library is intended to be the **shared XML substrate** for the sibling
`@cosyte/ncpdp` (modern NCPDP SCRIPT is also XML), so the suite carries **one** XML dependency and
**one** hardening posture to audit — keep the choices coordinated.

The real parse layer (Phase 1) configures and consumes it; this phase adds the dependency and ratifies
the choice so Phase-1 parse code is unblocked.

### Why `@xmldom/xmldom` (over the alternatives)

A fresh comparative pass (2026-06-28) across `@xmldom/xmldom`, `fast-xml-parser`, `sax`, and
`libxmljs2` reaffirmed the lean — the deciding factor is **faithful round-trip serialization**, which
only a real DOM provides:

- **`@xmldom/xmldom` (chosen)** — a standards-compliant, **pure-JS W3C DOM** (`DOMParser` /
  `XMLSerializer`), **zero transitive deps, no native build step**, first-party TypeScript types,
  actively maintained (`0.9.10`). A genuine DOM Level 2 Core makes namespaces and attributes
  first-class nodes that `XMLSerializer` re-emits, and mixed narrative content survives as child
  nodes — exactly what C-CDA's spec-clean emit needs (default `urn:hl7-org:v3` namespace, `xsi` /
  `sdtc` prefixes, attribute fidelity, `xsi:type` dispatch). Heavier than a streaming reader, but the
  DOM is the load-bearing requirement for a parser **+ serializer** library.
- **`fast-xml-parser` (rejected — wrong tool)** — fast, zero-native-deps, but **object-mode, not a
  DOM**: it round-trips *data*, not *document structure*. Prefix choices, attribute ordering, and
  mixed content are reconstructed heuristically — precisely where C-CDA conformance breaks on emit.
- **`sax` (rejected — incomplete)** — a healthy, safe streaming tokenizer with **no serializer**;
  using it means hand-building a DOM + emitter. Retain only as a possible streaming aux, never the
  primary.
- **`libxmljs2` (disqualified)** — binds native **libxml2** (a native build step, against the
  zero-native-build preference), **unmaintained** (~12 months no release), and carries **unpatched**
  type-confusion advisories (CVE-2024-34393 / -34394). Hard no.

### Security posture (recorded for Phase 1)

`@xmldom/xmldom` is a DOM-only implementation with **no external-entity resolver** — it does not
dereference external/system entities (no filesystem/network fetch), which is the XXE-safe baseline
C-CDA requires. Phase 1 must additionally: reject DTD/DOCTYPE via an explicit `onError` handler,
**never** enable an external resolver, and enforce the size/depth/node-count caps and entity-expansion
(billion-laughs) guards from the roadmap's security spine. Known CDATA-injection advisories on the
`0.8`/`0.9` lines are **patched** in `0.9.9` / `0.8.12`; we pin at/above the patched line and gate the
dependency behind the accuracy/conformance + fuzz runners. The `0.x` version signals advertised
non-completeness — hence the **exact pin** and the conformance gate.

## Consequences

- `@cosyte/ccda` now carries **one** runtime dependency — `@xmldom/xmldom` (exact `0.9.10`) — **1 of
  the ≤ 3** cap. This is a **one-way door**: once published, consumers inherit it and removing it later
  is a breaking change.
- The drift check tolerates this single ADR-justified runtime dep; CI/verify stay green (the dep is
  added to `package.json` + the lockfile; Phase 1 imports it).
- `CLAUDE.md` and the meta-repo `documentation/` (ecosystem-map + `repos/ccda.md`) are updated to the
  new runtime-dep posture (per the "documentation follows code" discipline).
- **Coordinate with `@cosyte/ncpdp`:** its SCRIPT-XML parser choice should reuse `@xmldom/xmldom` so
  the suite stays on a single XML substrate and one hardening posture. Record any divergence as its own
  ADR with rationale.
- Phase 1 owns the security configuration (DTD off, no external resolver, entity-expansion + size/depth
  caps) and the conformance/fuzz gating described above; this ADR only ratifies the dependency choice.
