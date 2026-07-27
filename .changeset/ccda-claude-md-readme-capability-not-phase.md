---
"@cosyte/ccda": patch
---

Correct the two remaining stale-status documents: `CLAUDE.md`'s Status section and `README.md`'s
phase-stamped headings.

`CLAUDE.md` governs every agent session in this repo, and its Status section was false in two ways:
it claimed the package was "not yet published to npm" (it is published at `0.0.1`) and that
`src/index.ts` carried archetype "stubs" (it exports a working parser, serializer, builder, and
editor). It now describes the real export surface and states five boundaries under-warning: the
builder covers two of twelve document types, a `TerminologyAdapter` is consulted at five `CodeSlot`s
only, six of twelve required-section SHALL tables assert nothing, Functional/Mental Status are
buildable but not editable, and a built document is expected-but-not-proven to pass an external IG
validator. Its stale coverage gate ("before v1 ships", with a directory list that no longer matches
`vitest.config.ts`) is corrected to the gate that runs today.

`README.md` is the npm front page, so its five `## What it extracts (Phase N)` headings are restated
as the capability each describes: a reader could not resolve "Phase 5b" to anything. The same pass
fixes the accuracy defects around them: the status banner's closing "the other document types land in
a later increment" is made explicit that parsing recognizes all twelve and only building is limited;
the terminology section's "consults it at each clinical coded slot" is corrected to the five slots
that are actually wired, with the unwired slots named; the Edit section now states what editing does
not cover; and required-section validation now says six of twelve tables assert nothing and that a
quiet parse is not a conformance result. Two subsections mis-nested under extraction headings are
promoted to top level.

Documentation only, no source or public API change.
