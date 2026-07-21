---
"@cosyte/ccda": patch
---

Phase 7 (eighteenth slice) — a shared HL7 v3 TS date-format validator guards every builder date input (CCDA-P7).

Until now the builder emitted every caller-supplied date string verbatim into
`<effectiveTime>`/`low`/`high`/`value`/`birthTime`, so a malformed input (`"2026-07-21"` with dashes,
`"July 2026"`, or a calendar-invalid `"20260230"`) would silently serialize a schema-invalid,
potentially clinically-misread timestamp. A new single-source guard (`src/builder/hl7-ts.ts`,
`assertHl7Ts`) now validates every date the builder emits: it accepts the HL7 v3 TS literal
`YYYY[MM[DD[HHMMSS[.S][±ZZZZ]]]]` — including legitimate partial precision (`YYYY`, `YYYYMM`,
`YYYYMMDD`) and an optional fractional-second and `±ZZZZ` offset — and on a malformed input throws a
`TypeError` at build time rather than emit, guess, or coerce an invalid date (fail loud).

Acceptance is delegated to the parser's existing `parseV3DateTime` (`src/model/types/_shared.ts`, the
sole v3 TS grammar in the library), so the builder emits exactly the set of timestamps `parseCcda`
reads back cleanly — every date it accepts round-trips without a `MALFORMED_DATETIME` warning, and no
second, drift-prone grammar is introduced.

Wired through every date-emission site, enumerated so none is missed: patient + family-member
`birthTime`; the document `effectiveTime`; problem/allergy concern `low` (onset) + `high` (resolution);
the Medication Activity `IVL_TS` duration `low`/`high`; result & vitals organizers + observations;
immunization; procedure; encounter period `low`/`high`; smoking/social history; functional & mental
status observations + organizers; assessment scale; past medical history; plan of treatment; and the
family-history observation `effectiveTime`. Physical-quantity fields (age, dosing-frequency `PIVL_TS`
period, reference ranges) are deliberately untouched — they are `PQ`, not `TS`. No warning-code change
and no public-surface change; the guard is internal and rejects only inputs that were already
schema-invalid to emit.
