---
"@cosyte/ccda": patch
---

Ratify the XML-parser ADR (`docs/adr/0001-xml-parser.md` → Accepted) and add the first runtime
dependency, `@xmldom/xmldom` (exact-pinned) — chosen for faithful W3C-DOM round-trip and an XXE-safe,
hardenable posture; 1 of the ≤ 3 runtime-dep cap, intended as the shared XML substrate with
`@cosyte/ncpdp`. No parse-layer code yet; Phase 1 configures and consumes it.
