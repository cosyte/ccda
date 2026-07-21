---
"@cosyte/ccda": patch
---

Phase 7 (twenty-third slice) — `editCcda` threads a bring-your-own terminology adapter into its final re-parse (CCDA-P7).

Closes the "editCcda-adapter-threading" deferral stated in the slice-21 (terminology-adapter) CHANGELOG:
"wiring the adapter into `editCcda`'s final re-parse is likewise deferred." `parseCcda` and `buildCcda`
already reach the semantic-validation tier — calling a consumer's `TerminologyAdapter.validateCode` on
each recognized coded slot and raising `SEMANTIC_CODE_INVALID` on a negative verdict — but `editCcda`
re-parsed its edited output with **no options**, so an edited document never reached that tier even when
the caller held an adapter. This threads it through.

**Change — mirror the `buildCcda` pattern exactly.** `EditCcdaOptions` gains an optional
`terminology?: TerminologyAdapter`, and `editCcda`'s closing `return parseCcda(serializeDocument(dom))`
now forwards it (`{ terminology }`) when supplied. Nothing else moves: the intermediate
`parseSecureXml(...)` that recovers the DOM for surgery is deliberately left adapter-free — it re-reads
the library's own already-clean source XML only to mutate it, and semantic validation belongs on the
**final** re-parse of the edited output, exactly where `buildCcda` runs it.

**Fail-safe — surfaced, never coerced.** As on the parse and build paths, the adapter can only ever add a
flag: `editCcda` emits every code **verbatim** (byte-faithful on untouched sections, spec-clean on the one
it rebuilds), and a `{ result: false }` verdict raises `SEMANTIC_CODE_INVALID` with the code preserved and
the value never rewritten. Validation runs over the **whole** edited document, so a rejected code in an
untouched section is flagged too, not only one in a grafted section. The flag is PHI-free (slot name +
code-system OID, never the clinical code). Opt-in and non-breaking: with no adapter the behavior is
unchanged, and the adapter is honored on both a revision and an in-place (`revision: false`) edit.

- **Public surface:** additive optional `terminology` field on `EditCcdaOptions`. No warning-code change
  (`SEMANTIC_CODE_INVALID` already exists), no new type, no behavior change without an adapter.
- **Tests:** `test/edit.test.ts` gains a terminology-threading block — opt-in (no adapter ⇒ no flag),
  a rejected code in the grafted section (flagged + preserved verbatim + PHI-free message), a rejected
  code in an **untouched** section (proves the adapter runs on the whole edited output), `revision: false`
  threading, and a permissive adapter staying silent. All fixtures synthetic.
- **Deferred (unchanged):** the adapter's optional `translate` (`$translate`) method remains defined but
  not consumed — emitting `<translation>` alternates from an adapter is a later increment; entry-level
  append into a populated section, section removal, and subsection edits remain out of `editCcda`'s scope.
