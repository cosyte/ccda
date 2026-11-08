---
"@cosyte/ccda": patch
---

`editCcda` now checks an edit against the SHALL required-section set the document was parsed under. An R1.1-origin document (no R2.1 `@extension` stamp) is edited under the reduced set its parse used, and a document stamped for a release we do not model is not evaluated, as at parse time. Before, an edit took the R2.1 set whatever the source carried, so replacing a section that held a nested Vital Signs or Social History section on an R1.1 CCD threw `REQUIRED_SECTION_MISSING` for a section its parse never required.

The `@example` on `profileQuirkApplied` in the published type declarations imported `deprecatedLoinc` from `@cosyte/ccda`, which does not export it. It now takes its warning from `parseCcda`. In the repository, 60 more `@example` blocks on internal helpers named `@cosyte/ccda` for symbols it does not export; they now import from their own module, and a test now fails on any `@example` import that does not resolve.
