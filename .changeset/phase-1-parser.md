---
"@cosyte/ccda": patch
---

Phase 1 — the first working parser. `parseCcda(xml)` now turns a real C-CDA R2.1 document into an
immutable `CcdaDocument`: recognized `documentType` (all 12 US Realm document types), the US Realm
header (document identity, `effectiveTime`, `confidentialityCode`, `languageCode`), patient
demographics + identifiers (`getPatient()`, `getMrn()`), and framed sections recognized by
`templateId` with LOINC fallback (`findSection()`, `allSections()`, narrative text + `ID` index).

Liberal on parse, conservative on emit (Postel's Law): recoverable vendor quirks surface as
stable-coded Tier-2 `CcdaWarning`s (`doc.warnings`, or `onWarning`/`strict`), never thrown. The
hardened XML substrate rejects unrecoverable/hostile input as Tier-3 `CcdaParseError`s — DTD/XXE,
billion-laughs entity expansion, oversized input, over-deep nesting, excessive fan-out, malformed
XML, and non-`ClinicalDocument` roots. Every diagnostic message and position is PHI-free.

Also ships the HL7 v3 datatype layer (`II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`,
variable-precision v3 datetime parsing, null-flavor handling), namespace-aware DOM read helpers, and
tunable safety caps (`DEFAULT_LIMITS`, `resolveLimits`, `parseSecureXml`).
