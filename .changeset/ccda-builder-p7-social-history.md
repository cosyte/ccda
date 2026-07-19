---
"@cosyte/ccda": patch
---

Phase 7 (sixth slice) — builder emits a Social History (Smoking Status) section (CCDA-P7).
`buildCcda` now accepts `smokingStatus`. A **Social History** section (`…22.2.17`, LOINC `29762-2`,
the V3 `2015-08-01` stamp with no entries-required variant) emits one or more Smoking Status —
Meaningful Use observations (`…22.4.78`, the `2014-06-09` stamp), each with the fixed LOINC `code`
(`72166-2` "Tobacco smoking status"), a SHALL `statusCode`, a SHALL `effectiveTime` (the recorded
time; `nullFlavor="UNK"` when unknown), and the SHALL SNOMED CT `value` from the Current Smoking
Status value set. **Unknown is never defaulted to a status:** an omitted `value` is emitted as an
explicit `nullFlavor="UNK"` — read back by the parser as `unknown: true` and flagged
`SMOKING_STATUS_UNKNOWN` — never invented as "never smoker" (absent status ≠ non-smoker). The section
is emitted only when populated (Social History is not a CCD SHALL section). New public type
`BuildCcdaSmokingStatus`. Round-trip-by-construction and the zero-warning clean build hold; no parser
or warning-code change.
