---
"@cosyte/ccda": patch
---

Phase 7 (twenty-first slice) — bring-your-own (BYO) terminology adapter, semantic-validation path (CCDA-P7).

A small, dependency-free `TerminologyAdapter` interface a consumer implements over their own **licensed**
terminology service, wired into the parser's code-system recognition so `parseCcda(xml, { terminology })`
and `buildCcda(init, { terminology })` reach the semantic-validation tier that structural recognition
(`checkCodeSlot`) deliberately cannot — confirming a code is a real, active member of its system, the
highest-severity real-world defect a structurally-valid document can carry. `@cosyte/ccda` **imports no
terminology library** — it stays a zero-dep-beyond-`@xmldom/xmldom` sibling and only calls the adapter you
supply, and only when supplied. The interface shape mirrors the FHIR Terminology Module (`$validate-code`,
`$translate`) and the sibling `@cosyte/terminology` engine, so that engine (or a UMLS / VSAC service) can be
wired in behind it.

- **Opt-in, non-breaking.** With no adapter, behavior is unchanged (structural recognize-only, no new
  warning). `validateCode` runs for each recognized coded slot (problem, medication, allergen, route,
  vaccine) carrying both a `@code` and a `@codeSystem`.
- **Fail-safe — surfaced, never coerced.** A `{ result: false }` verdict raises the new stable warning
  `SEMANTIC_CODE_INVALID` with the code **preserved verbatim** — never rewritten to a "corrected" value,
  and the adapter's advisory `display` is never applied back onto the document. An adapter can never
  silently change a safety-critical code; it can only add a flag. `undefined` ("no opinion" — system out of
  the adapter's coverage) is silent, so a partial-coverage adapter adds no noise. The builder emits every
  code verbatim and surfaces the flag on the re-parsed document — validation *on build*, never mutation.
- **PHI-free.** The `SEMANTIC_CODE_INVALID` message carries only the slot name and the code-system OID
  (structural identifiers, as `UNEXPECTED_CODE_SYSTEM` / `DEPRECATED_CODE_SYSTEM` already do) — never the
  specific clinical code, nor the adapter's free-text `message` / `display`.
- **Public surface:** `TerminologyAdapter`, `TerminologyCoding`, `CodeValidationResult`,
  `CodeTranslationResult`, `BuildCcdaOptions`, the `SEMANTIC_CODE_INVALID` warning code + its
  `semanticCodeInvalid` factory, and the new optional `terminology` field on `ParseCcdaOptions` /
  `BuildCcdaOptions`.
- **Deferred (stated):** the interface's optional `translate` (`$translate`) method is **defined but not yet
  consumed** — emitting `<translation>` alternates from an adapter is a later increment; wiring the adapter
  into `editCcda`'s final re-parse is likewise deferred. `TerminologyCoding.system` is the C-CDA
  `@codeSystem` OID (not a canonical URI); a consumer bridges OID→URI inside their adapter (e.g. via
  `@cosyte/terminology`'s `resolveSystem`).

Grounded firsthand: the FHIR `ValueSet/$validate-code` out-parameters (`result: boolean`, advisory
`display` / `message`) and the sibling `@cosyte/terminology` engine's shipped `Coding` + `$translate`
surface (`/workspace/terminology/src`). Roadmap §5 tier-3 ("bring-your-own-credentials adapter, never
bundled") and Phase 7 ("the semantic adapter is opt-in — its absence never blocks parsing; with it, a
semantically-invalid code becomes a warning, never a silent correction"). Slice verified NOT REFUTED by the
conformance-refuter gate.
