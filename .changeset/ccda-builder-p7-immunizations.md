---
"@cosyte/ccda": patch
---

Phase 7 (fourth slice) — builder emits an Immunizations section (CCDA-P7). `buildCcda` now accepts
`immunizations` and emits an Immunization Activity → Immunization Medication Information (CVX vaccine,
dose, route, SHALL administration `effectiveTime`); a `refused` shot is `negationInd="true"` (flagged
`IMMUNIZATION_REFUSED` on re-parse), never conflated with a `nullFlavor` "unknown". The section is
emitted only when populated (not a CCD SHALL section). Round-trip-by-construction and the zero-warning
clean build hold; no parser or warning-code change.
