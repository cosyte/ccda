---
"@cosyte/ccda": patch
---

Recognize the C-CDA R2.1 **Interventions Section** (`2.16.840.1.113883.10.20.21.2.3`, LOINC
`62387-6`), and correct 63 documentation examples that told a reader to import symbols the package
does not export.

**The section catalog gains one entry, and no existing entry changes.** The Interventions Section is
the conformant home of the Planned Intervention Act, the container whose nested planned entries this
package already reads. Because the section itself was not in the catalog, a document that placed
that container exactly where the standard puts it was framed as an unrecognized section and drew
`UNKNOWN_SECTION_CODE`. It is now recognized on the primary `templateId` path, resolves through
`sectionForTemplateRoot` and `sectionForLoinc`, and is reachable as
`doc.findSection("interventions")`.

Matching is on the root alone, so all three version stamps in circulation are accepted (unversioned,
`2014-06-09`, and R2.1's `2015-08-01`). That tolerance is not theoretical: HL7's own published Care
Plan example carries the older stamp. There is no entries-optional sibling root for this section, so
exactly one root is registered.

**What moves, measured against the previous release rather than argued.** Ten section shapes were
parsed before and after. Only Interventions Sections move; a Results Section, whose root differs by a
single arc, is unchanged, as is an unrecognized section and a section matched by LOINC fallback.
`UNKNOWN_SECTION_CODE` is withdrawn only where it had been firing unconditionally: no root matched
this section and no LOINC did either, so every document carrying the code drew it, with no input that
avoided it. Two further changes are worth knowing before upgrading:

- A section carrying the Interventions `templateId` under some other section's `<code>` was
  previously framed as that other section, off the LOINC fallback, and drew
  `SECTION_MATCHED_BY_LOINC_FALLBACK`. It is now framed as an Interventions Section on the
  `templateId`, and the fallback warning correctly stands down, because no fallback was taken. The
  reading it replaces was the worse one: an Interventions Section reported as a patient's Problems
  list.
- `SECTION_PLACEMENT_SUSPECT` can now fire on an entry inside an Interventions Section. Misplaced
  entries are only checked in sections that are recognized, so recognizing this one is what makes
  them visible. A conformant Interventions Section stays silent.

**Two builder input types are now exported: `BuildCcdaAssessmentScale` and
`BuildCcdaAssessmentScaleItem`.** Both are already the element type of public `buildCcda` fields
(`functionalStatusScales` and `mentalStatusScales`), so a caller populating either had no way to name
the value being constructed. Purely additive.

**64 `@example` blocks across four modules cited an import that does not resolve.** They wrote
`import { X } from "@cosyte/ccda"` for internal helpers, warning factories and builder types that the
package entry point does not export. These ship in the published type declarations, where they are
copy-pasteable, so following one produced an import error. Each is now either a module-relative
import, for a symbol that is deliberately internal, or a corrected example built only from the public
surface; the two builder types named above were the ones whose right answer was to export the symbol
instead. A new test resolves every documented import through the TypeScript checker against the
module it names, so an example can no longer claim a symbol lives somewhere it does not.

No warning code was added, renamed or reclassified, no existing type changed, and nothing about how
entries are read has changed.
