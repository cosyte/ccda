---
"@cosyte/ccda": patch
---

Two declared diagnostics that nothing could ever produce now work, and `NULL_FLAVORS` is the whole
HL7 v3 NullFlavor code system rather than eight of its seventeen concepts.

- **`UNKNOWN_NAMESPACE_PREFIX` has a call site.** It was in `WARNING_CODES`, exported with a factory,
  and constructed by nothing, so a foreign namespace was reported nowhere while a consumer could
  narrow on a code that never fired. The reason it stayed invisible is worth knowing: every child
  lookup in the model layer is scoped to `urn:hl7-org:v3`, so no navigation step could ever meet a
  foreign element. It is raised from the DOM walk that enforces the depth and node-count caps, the
  one exhaustive traversal, **once per distinct foreign namespace** rather than once per node, so a
  vendor extension block is one warning however many elements it spans. An element carrying no
  namespace at all counts as foreign. Attributes are not swept, because an unprefixed C-CDA attribute
  carries no namespace and an `xmlns:` declaration lives in the namespace reserved for declarations,
  so sweeping them would flag every attribute in a conforming document. The node is retained and
  round-trips through `serializeCcda` unchanged.

  It is replayed **after** the model is built rather than emitted where it is found, because under
  `{ strict: true }` the first warning is the one that throws: a namespace deviation is a statement
  about the whole document and must not take the place of `NOT_A_CLINICAL_DOCUMENT` on a payload
  that is not a C-CDA, or of a safety-critical code such as `MISSING_CODE_SYSTEM` on one that is. In
  lenient mode that means these land last on `doc.warnings`, so `OnWarningCallback` now documents
  emission order rather than discovery order. The message text also changed, because the code name is
  historical: it says `PREFIX`, but what is tested is the element's namespace, and an element in no
  namespace at all raises it with no prefix in sight. Renaming a stable code would be breaking, so
  the message says what the code does instead.

- **`CcdaPosition.templateId` is populated.** It was declared and set by nothing, so a
  `QuirkTolerance` keyed on a template OID silently tolerated nothing. Three codes carry it now:
  `TEMPLATE_EXTENSION_ABSENT` (the matched document-type root) and `UNKNOWN_SECTION_CODE` /
  `SECTION_MATCHED_BY_LOINC_FALLBACK` (the section's first rooted `templateId`). Two document-level
  codes carry none on purpose: `MISSING_TEMPLATE_ID` has no template to name, and
  `UNKNOWN_DOCUMENT_TEMPLATE`'s subject is the templateId **set** naming no type, where the obvious
  pick (the first root in document order) is the US Realm Header stamp on essentially every real
  C-CDA, so keying a tolerance on it would read like narrowing while tolerating the code everywhere.
  The OID is bounded on the HL7 v3 UID shape and reads `<withheld>` otherwise, exactly as
  `position.sectionCode` is bounded on the LOINC shape. `QuirkMatch` now documents which codes carry
  which field: a `match` keyed on a field the warning does not carry is inert rather than broad, and
  entry-level codes such as `DEPRECATED_LOINC` carry neither.

- **`NULL_FLAVORS` is the whole code system**, all seventeen concepts of
  `2.16.840.1.113883.5.1008`, transcribed from the published HL7 Terminology `v3-NullFlavor`
  code system (`content: complete`). It held eight, so a conforming `nullFlavor="PINF"` on a `PQ` and
  the `nullFlavor="NP"` a real Plan of Treatment carries on a `<code>` both drew a false
  `INVALID_NULL_FLAVOR`, and both read `<withheld>` wherever the `templateId` and `ED` bounds test
  membership. Those nine tokens (`INV`, `DER`, `NINF`, `PINF`, `UNC`, `NAVU`, `QS`, `TRC`, `NP`) stop
  drawing the warning and are echoed rather than withheld. The `NullFlavor` union widens with them,
  which is a change for anyone switching exhaustively over it. `NP` is retired in the published code
  system and is admitted all the same: `INVALID_NULL_FLAVOR` asserts that a token is not a concept of
  the system, and it is one. The `smartScorecard` profile's `INVALID_NULL_FLAVOR` rationale no longer
  cites `UNC` as a malformed token, because `UNC` is a real concept of the system.
