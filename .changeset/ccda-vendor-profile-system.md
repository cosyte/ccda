---
"@cosyte/ccda": patch
---

Phase 6 — vendor / conformance profile system (registry with provenance) (CCDA-P6).

Adds a `defineCcdaProfile()` engine mirroring the sibling `@cosyte/hl7` profile shape (`name` /
`lineage` / `describe()` / `extends`-merge), a provenance-backed built-in registry (`ccdaProfiles`,
`getCcdaProfile`, `listCcdaProfiles`), and a process-scoped default (`set/getDefaultCcdaProfile`).
`parseCcda(xml, { profile })` applies it: a profile downgrades the **non-safety-critical** deviations
it *expects* to a `PROFILE_QUIRK_APPLIED` warning (flagged `expected`, carrying the original
`toleratedCode`) — the deviation is **never dropped** — and never changes an extracted clinical value
(it operates purely at the warning-emitter layer). `doc.profile` records the applied profile.

The load-bearing rule is a **safety gate**: a profile can never tolerate a safety-critical warning
code (patient identity, allergy negation/granularity, dose/route/timing, UCUM units, code↔narrative
mismatch, unhandled value types, status/mood conflation, a wrong/unknown code system, a malformed
datetime, or a missing SHALL section) — `defineCcdaProfile()` throws `CcdaProfileDefinitionError` at
definition time (`SAFETY_CRITICAL_CODES`).

Ships two evidence-backed built-ins grounded in cited public sources (per ADR 0018, no invented
vendor quirks): `smartScorecard` (deprecated-terminology tolerance — SMART C-CDA Scorecard + D'Amore
et al., JAMIA 2014) and `legacyR11` (R1.1-origin receive-tolerance — ONC §170.315(b)(1) receive-both
requirement + the CC0 HL7/C-CDA-Examples corpus), plus a conservative `default` baseline. Named
per-vendor profiles deliberately await a real vendor-attributed grounding document.

Synthetic-only fixtures throughout (reuse the existing `buildCcda` builder; standard terminology
codes and fake OIDs only) — no realistic PHI. New warning code `PROFILE_QUIRK_APPLIED`; new error
`CcdaProfileDefinitionError`; `CcdaWarning` gains optional `expected` / `profile` / `toleratedCode`
fields; `CcdaDocument` gains `profile` attribution.
