---
"@cosyte/ccda": patch
---

Recognize the C-CDA R2.1 **Interventions Section** (`2.16.840.1.113883.10.20.21.2.3`, LOINC
`62387-6`).

**The section catalog gains one entry, and no existing entry changes.** The Interventions Section is
the conformant home of the Planned Intervention Act, the container whose nested planned entries this
package already reads. Because the section itself was not in the catalog, a document that placed
that container exactly where the standard puts it was framed as an unrecognized section and drew
`UNKNOWN_SECTION_CODE`. It is now recognized on the primary `templateId` path, resolves through
`sectionForTemplateRoot` and `sectionForLoinc`, and is reachable as
`doc.findSection("interventions")`.

Matching is on the root alone, so all three version stamps in circulation are accepted (unversioned,
`2014-06-09`, and R2.1's `2015-08-01`), which is this catalog's uniform root-primary contract rather
than a tolerance granted specially here. There is no entries-required sibling root for this section,
so exactly one root is registered.

**What moves, measured against the previous release rather than argued.** Thirteen section shapes
were parsed before and after and the two readings diffed. Every move is confined to sections carrying
this `templateId` or this LOINC; a Results Section, whose root differs by a single arc, is unchanged,
as are an unrecognized section and a section matched by LOINC fallback. Four things are worth knowing
before upgrading:

- `UNKNOWN_SECTION_CODE` is withdrawn where a section carrying `62387-6` previously resolved to
  nothing at all. This is not the same as "every document carrying the code": a section stamped with
  the Interventions root alongside another recognized root already resolved on that other root and
  was already silent.
- A section carrying the Interventions `templateId` under some other section's `<code>` was
  previously framed as that other section, off the LOINC fallback, and drew
  `SECTION_MATCHED_BY_LOINC_FALLBACK`. It is now framed as an Interventions Section on the
  `templateId`, and the fallback warning correctly stands down, because no fallback was taken. The
  reading it replaces was the worse one: an Interventions Section reported as a patient's Problems
  list.
- **That same document now raises `REQUIRED_SECTION_MISSING` for the section it used to be mistaken
  for.** Required-section validation is driven by the keys the catalog assigns, so a CCD whose only
  "Problems" section was really an Interventions Section is now correctly told its required Problems
  section is absent. It is safety-critical and cannot be quieted by a profile, so such a document
  gets louder rather than quieter.
- **On a section double-stamped with the Interventions root and another recognized root, whichever
  root is listed first now wins.** Previously the Interventions root matched nothing, so the other
  root always won. If you have documents stamped that way and branch on `findSection(...)`, check
  them. The section is still framed and its narrative retained, and no clinical fact is lost, because
  entry extraction does not depend on the section key.

`SECTION_PLACEMENT_SUSPECT` can also now fire on an entry inside an Interventions Section. Misplaced
entries are only checked in sections that are recognized, so recognizing this one is what makes them
visible. A conformant Interventions Section stays silent.

No warning code was added, renamed or reclassified, no existing type changed, and nothing about how
entries are read has changed.
