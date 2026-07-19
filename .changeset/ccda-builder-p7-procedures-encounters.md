---
"@cosyte/ccda": patch
---

Phase 7 (fifth slice) — builder emits Procedures and Encounters sections (CCDA-P7). `buildCcda` now
accepts `procedures` and `encounters`. A **Procedures** section emits one of the three Procedure
Activity variants — operative `<procedure>` (`…22.4.14`), non-altering `<act>` (`…22.4.12`), or
assessment `<observation>` (`…22.4.13`), all at the R2.1 `2014-06-09` stamp — each with its SHALL
`code` + `statusCode`, the performed-vs-planned `moodCode` (`EVN`/`INT`, read back as the parser's
disposition and never conflated), and the SHOULD [0..1] `effectiveTime` emitted only when supplied
(never fabricated). An observation-variant procedure that omits its SHALL `value` (`…22.4.13`) throws
rather than emit a non-conformant document. An **Encounters** section emits an Encounter Activity
(`…22.4.49`) with its SHALL `code` [1..1] (encounter type, CPT by default) and SHALL `effectiveTime`
[1..1] visit period (`IVL_TS`; a `nullFlavor="UNK"` low when no period is supplied). Both sections are
emitted only when populated (neither is a CCD SHALL section). New public types `BuildCcdaProcedure`
and `BuildCcdaEncounter`. Round-trip-by-construction and the zero-warning clean build hold; no parser
or warning-code change.
