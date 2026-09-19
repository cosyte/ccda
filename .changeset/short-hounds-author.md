---
"@cosyte/ccda": minor
---

feat: read the header participations, so a parsed document can say who authored it

A consumer could ask whose document it was and what was in it, but not who wrote it.
`CcdaHeader` carried ten fields and not one of them was a participation. Every
conforming US Realm document carries at least one `author` and exactly one `custodian`,
and an inpatient Discharge Summary carries the encounter it summarises, so the parser
was dropping data the source document was required to supply. Provenance is the answer
to "who said this", which is what a clinician asks of a medication list assembled by
three systems.

`header.authorship` carries every document-level `<author>` in document order: its
identifiers, its assigned person's name or its assigned authoring device's identity,
the organization the document states it acted for, and its author `time` at exactly the
precision the document stated. A partial author time stays partial. `header.custodian`
carries the custodian organization with its identifiers and its name.
`header.encompassingEncounter` carries the `componentOf/encompassingEncounter` frame:
its `effectiveTime` bounds, each keeping its own precision and any `nullFlavor`, and its
`dischargeDispositionCode`.

**An inherited author reading is marked, never asserted.** CDA conducts an author down
from the document to a section and on to that section's entries, and this reports the
conduction rather than performing it silently. `CcdaSection.authorship` and each entry's
reading in `CcdaSection.entryAuthorship` carry an `inherited` flag: `false` when the
level stated these authors itself, `true` when it stated none and these are the nearest
enclosing level's. "The nearest enclosing author is this clinician" and "this entry was
authored by this clinician" are different claims and only the first is one the document
made. When no level carries an author the reading is absent at every level: the record
target, the custodian, a legal authenticator and an informant are never read as the
author, and no `componentOf` means no encounter frame rather than one derived from the
document `effectiveTime` or a `documentationOf` service event.

One warning code is added and none is renamed, removed or repurposed. An `<author>`
whose `assignedAuthor` carries neither an `assignedPerson` nor an
`assignedAuthoringDevice`, which the US Realm Header requires one of (CONF:1198-8456),
is kept, marked `unidentified`, and reported with `UNIDENTIFIED_AUTHOR`. It still
conducts to nested levels. Dropping it would turn "the document names an author whose
identity it never states" into "the document names no author", which is a more
reassuring claim than the document supports. The factory takes only a position and the
message comes whole from the frozen registry, so a clinician's name cannot reach a
diagnostic.

Entries an overriding `<subject>` declaration governs are absent from `entryAuthorship`
entirely, not even their `ids`: it is a record-target read path, and a governed entry
appearing in one would put another person's entry back on the model through a second
door.

**This is why the bump is minor rather than patch.** It adds seven exported types
(`CcdaAuthor`, `CcdaAuthoringDevice`, `CcdaAuthorship`, `CcdaCustodian`,
`CcdaEncompassingEncounter`, `CcdaEntryAuthorship`, `CcdaOrganization`) and one warning
code. `buildSection` takes an optional third argument, the enclosing author reading;
every existing call keeps working and reads the section as having no enclosing author,
which is what a caller framing a detached `<section>` is looking at.

This is the READ side only. Nothing the builder emits changes, and emitting
`componentOf` is not part of it.
