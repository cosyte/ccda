---
"@cosyte/ccda": patch
---

Phase 7 (twentieth slice) — `editCcda`: the read→edit→write loop for C-CDA document editing (CCDA-P7).

A third emit-side primitive alongside `parseCcda` (read) and `buildCcda` (construct): it takes a
document already produced by `parseCcda` and re-emits it with a section **added** or **replaced**,
returning the re-parsed `CcdaDocument`, so `parseCcda(editCcda(parseCcda(xml), …).toString())`
round-trips. Grounded firsthand against CDA R2 — the `ClinicalDocument` XSD element sequence in
`HL7/CDA-core-2.0` `POCD_MT000040.xsd` and the HL7 C-CDA-Examples "Parent Document Replace
Relationship" sample.

- **Byte-faithful on untouched sections.** The edit is DOM surgery on the document the parser actually
  read (recovered from the serialized snapshot every parsed document retains), not a reconstruction
  from the lossy read-model — every section, entry, attribute, namespace declaration, and even content
  this library never models survives verbatim; only the one targeted section is rebuilt, through the
  same per-section emitters `buildCcda` uses (a new internal `buildSectionComponent` dispatcher over
  the twelve single-list section kinds). Grafted-section narrative `ID`s are renumbered so a
  `<reference value="#id">` can never become ambiguous.
- **Fail-safe.** An empty content list yields a spec-clean `nullFlavor="NI"` shell (never fabricated
  entries); an edit that would drop a per-document-type SHALL required section throws a typed
  `CcdaEditError` (`REQUIRED_SECTION_MISSING`); `add`/`replace`/`upsert` throw
  `SECTION_ALREADY_PRESENT` / `SECTION_ABSENT` on a precondition violation; and every builder guard
  (invalid HL7 timestamp, resolved-without-resolution-date) still throws.
- **CDA R2 revision provenance.** By default an edit produces a revision: a new `ClinicalDocument.id`,
  the same version-series `setId` (minted when absent), an incremented `versionNumber`, and a
  `relatedDocument typeCode="RPLC"` naming the prior version — all inserted at their CDA R2 XSD
  sequence positions. `revision: false` edits in place. The header model now reads
  `setId`/`versionNumber`/`relatedDocuments` so the revision chain is observable through `parseCcda`.
- **Public surface:** `editCcda`, `CcdaEditError`, `EditCcdaOptions`, `SectionEdit`, `SectionEditMode`,
  `RevisionInit`, `DocumentIdInit`, `CcdaEditErrorCode`, `EditableSectionKind`, and
  `RelatedDocument` / `ParentDocument` on `CcdaHeader`.
- **Deferred (stated):** entry-level append that byte-preserves a section's other entries (use a
  section `replace` with the full entry set); Functional/Mental Status and narrative-only sections as
  edit targets; section removal; subsection edits; and the `APND` / `XFRM` relationships. A default
  revision edit also drops any non-`RPLC` (`APND`/`XFRM`) `relatedDocument` the source carried, and —
  when the source has no `setId`/`versionNumber` — synthesizes the `parentDocument`'s series metadata
  (minted `setId`, `versionNumber=1`); both are revision-provenance conventions, never clinical data.

Provenance: CDA R2 `ClinicalDocument` XSD element sequence verified firsthand against
`HL7/CDA-core-2.0` `schema/normative/infrastructure/cda/POCD_MT000040.xsd`; the `RPLC`
replacement relationship + `setId`-same / `versionNumber`-increment semantics against the HL7
`C-CDA-Examples` "General/Parent Document Replace Relationship/CCD Parent Document Replace
(C-CDAR2.1).xml" sample. Slice verified NOT REFUTED by the conformance-refuter gate.
