---
"@cosyte/ccda": patch
---

Docs: rewrite `docs-content/` capability claims as a capability doc, not a phase log (CCDA-P7
documentation residual). `troubleshooting.md` opened its boundary list with "As of **Phase 5b**",
a stamp no installer of `0.0.1` can resolve, and the list under it had drifted three slices behind
the code: it said the builder emitted "a CCD with five discrete-data sections", and named "editing
an existing document" and "a bring-your-own-credentials terminology adapter" as future work when
`editCcda` and `TerminologyAdapter` both ship. That section is now
**"What it does, and does not do, today"**, split into Reading / Building / Editing, with every
claim checked against the shipped source: all twelve document types recognized and fourteen entry
families decoded; `buildCcda` emitting a CCD **or** a Referral Note (two of twelve) with its exact
always-emitted and populated-only section sets; `<translation>` alternates wired at the problem,
allergen, medication drug + route, and vaccine + route slots and nowhere else; `editCcda` limited
to whole-section add/replace across twelve kinds, with no entry-level append, no section removal,
`RPLC` only, and validation-but-not-translation on that path. The boundaries that are genuinely open
are stated as open rather than resolved in the reader's favor: a built document is
expected-but-not-proven to pass an external IG validator, six of the twelve required-section (SHALL)
tables assert nothing pending per-type verification, and the UCUM atom set is curated rather than
complete.

The same drift is corrected across the rest of `docs-content/`: `cookbook.md` claimed editing was
future work 130 lines above its own `editCcda` recipe and undercounted the remaining document types
as eleven; `spec-notes-datatypes.md` still described the builder's "first slice" as header +
Problems + Allergies and omitted the shipped adapter hook; `spec-notes-model.md` called content
editing a later increment; `intro.md` labeled five shipped extractors "deferred". `README.md`, the
npm front page, carried the same false claim in its capability bullet ("the remaining ten document
types **and editing an existing document** are a later increment", roughly 200 lines below its own
"Edit a document" section) and listed only eight of the builder's fourteen CCD sections; both are
corrected. Two public JSDoc comments carrying the same stale claim are fixed with them
(`serializeCcda`'s "a builder API lands in a later phase", `BuildCcdaInit`'s "`documentType` is
`"ccd"` in this slice"), since the generated API reference is user-facing too. Documentation only,
no code, public-API, or warning-code change.
