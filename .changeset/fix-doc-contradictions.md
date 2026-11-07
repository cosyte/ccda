---
"@cosyte/ccda": patch
---

docs: correct statements in the README and API documentation that disagreed with what the package does.

The README now says `buildCcda` emits three document types wherever it described two, gives every
document type its current required-section verification state, names the `condition` and
`ageAtOnset` fields a family history observation actually carries, names `MISSING_SELF_CARE_ACTIVITY`
as the second emit-side warning, and lists `ccdaProfiles.default` among the built-in profiles. The
API documentation no longer suggests `HumanName.text` as a display name: it is the whole `<name>`
element's text, so a structured name reads as its parts run together. Nothing the package parses,
builds or serializes changes.
