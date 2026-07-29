---
"@cosyte/ccda": patch
---

Documentation and one runtime message now describe the software rather than the project that built
it. No API, type, or parsing behaviour changes.

**One runtime message changed, and it was wrong as well as noisy.** Calling `toString()` on a
hand-constructed `CcdaDocument` threw with a trailing clause promising a document builder that would
arrive later. `buildCcda` ships and has for some time, so the message told you to wait for something
you already had. The error now reads "CcdaDocument.toString: no source document retained. Only
documents produced by parseCcda can be serialized." If you match on this string, match on
`no source document retained`, which is unchanged.

**Two published JSDoc claims were false and are gone, not reworded.** `CcdaDocument` was documented
as framing identity and narrative only, with clinical entry extraction still to come, and `BL` as a
datatype the parser modelled even though it did not yet extract clinical entries. Both describe a
package that no longer exists: fourteen entry families are extracted today. Editors rendering these
on hover were showing a capability boundary that had not been true for a long time.

**Three published builder docblocks stated the wrong thing about how they came to say it**, rather
than about what the builder does. The `effectiveTime` cardinality notes on the planned-entry input
types kept their substance, including the correction that `[0..1]` holds on five of the seven planned
templates and not on both `substanceAdministration` variants, and dropped the narration of their own
editing history.

**The Assessment Scale Observation is no longer described as unimplemented.** The
Functional/Mental Status organizer types said it was "deferred"; the builder emits it as a direct
section entry, which is where C-CDA R2.1 puts it, and the surrounding text already said so.

**On the docs site, `installation.md` said the package was published at `0.0.1`.** It is `0.0.2`.

Also removed across `README.md`, `docs-content/`, and the JSDoc compiled into `dist/index.d.ts` and
`dist/index.d.cts`: internal work-item identifiers, internal release bookkeeping, decision-record
numbers, pointers to a planning document you cannot open, and commentary about how these pages were
written.
Every remaining boundary statement is unchanged, including the qualifiers that bound them, because a
limitation with its grounding removed reads as a stronger guarantee than the code provides.
