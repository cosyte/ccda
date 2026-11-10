---
"@cosyte/ccda": patch
---

Document comments only, no behavior change. `ResolvedLimits`, `EditableSectionKind` and
`CDA_DOCUMENT_OID` are public exports and no longer carry an internal tag in their comments, so the
generated API reference shows them like any other export. The comment on `CDA_DOCUMENT_OID` now says
what the value is, the US Realm Header `templateId` root; it called it the ClinicalDocument class
code before.
