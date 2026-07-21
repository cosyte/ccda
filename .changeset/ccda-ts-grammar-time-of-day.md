---
"@cosyte/ccda": patch
---

Phase 7 (nineteenth slice) — the v3 `TS` datetime grammar requires a time-of-day before a fraction/offset (CCDA-P7).

The shared HL7 v3 `TS` grammar (`TS_RE` / `parseV3DateTime`, `src/model/types/_shared.ts`) previously let a
fractional-second (`.fraction`) or a `±ZZZZ` timezone offset hang on a bare year/month/day value that carried
**no intervening time components**. The result was a **silent misparse**, not a rejection: a dropped-dash ISO
date like `"2026-0721"` (one dash removed from `"2026-07-21"`) was read as year `2026` carrying a `-07:21`
offset — i.e. `2026-01-01T07:21Z` — and `"2026+0500"`, `"202607.5"`, `"20260721.5"`, `"20260721-0500"` were
mis-read the same way.

The grammar is tightened to the canonical CDA R2 / HL7 v3 datatypes `TS` literal `YYYYMMDDHHMMSS.UUUU[±ZZzz]`
(grounded firsthand against the HL7 v3 Abstract Data Types `TS` (PointInTime) definition as carried into CDA R2, and the ISO 8601 it derives from,
where a decimal fraction and a zone designator attach to a **time** component, never to a bare date): a
fraction or offset is accepted **only once the hour is present**. Such inputs now surface `MALFORMED_DATETIME`
on parse (raw preserved, `date` left `undefined`) and **throw a `TypeError` at build time** — because the
builder's `assertHl7Ts` (eighteenth slice) delegates to this one grammar, the fix tightens the parser and the
builder from a single edit.

**Every legitimate value is preserved byte-for-byte** — valid partial-precision dates (`YYYY`, `YYYYMM`,
`YYYYMMDD`), full timestamps, real `±ZZZZ` offsets on a time-of-day, and fractional seconds on a full
timestamp all parse exactly as before; only the "offset/fraction on a value missing its time components" case
changes, from silent-misparse to a surfaced rejection. The capture-group layout is unchanged, so no call site
is affected; no warning-code change and no public-surface change. Regression tests cover the `"2026-0721"`-class
input on both the parse (`parseV3DateTime`, `parseTs` → `MALFORMED_DATETIME`) and build (`assertHl7Ts` →
`TypeError`) paths.

Deferred: the remaining Phase 7 scope — C-CDA document editing (re-emit a parsed doc with a modified section);
the bring-your-own-credentials terminology adapter; and the external-validator / Schematron differential-testing
gate.
