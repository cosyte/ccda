---
"@cosyte/ccda": patch
---

Phase 7 (twenty-second slice) — `editCcda` no longer emits an id-less RPLC `parentDocument` (CDA R2 SHALL fix, CCDA-P7).

A real CDA R2 conformance defect surfaced by the slice-20 independent refuter. `stampRevision` appended
the parent `<id>` only `if (oldIdEl !== undefined)`, while `deriveNewDocId` always minted the new
document id — so revising a source `ClinicalDocument` that carries **no `<id>`** produced a
`<relatedDocument typeCode="RPLC"><parentDocument>` with `code`/`setId`/`versionNumber` but **no `<id>`**.
That violates `POCD_MT000040.ParentDocument.id`, which is **`1..*` SHALL** — grounded firsthand against
`HL7/CDA-core-2.0` `schema/normative/infrastructure/cda/POCD_MT000040.xsd`
(`<xs:element name="id" type="II" maxOccurs="unbounded"/>`, no `minOccurs` ⇒ XSD default `1`). The
id-less source is itself invalid there: `ClinicalDocument.id` is `1..1` SHALL.

**Fix — refuse, do not mint.** `editCcda` now throws the new stable `CcdaEditError` code
`SOURCE_MISSING_ID` when asked to stamp a revision of a source with no `ClinicalDocument.id`, rather than
mint a fabricated parent identifier. The RPLC `relatedDocument` exists precisely to name the replaced
prior version **by its id**; a document with no id has no prior-version identity to name, and inventing
one would fabricate a clinical identifier (conservative-emit + never-fabricate contract). Minting the
*new* document id via `deriveNewDocId` stays legitimate — we are genuinely creating a new document —
but minting the *parent's* id is not. Refusal is scoped to the revision path: `revision: false` still
edits an id-less source in place (no `parentDocument`, so no `ParentDocument.id` requirement). A source
**with** an id is byte-unchanged.

- **Public surface:** additive `SOURCE_MISSING_ID` member on the `CcdaEditErrorCode` union.
- **Tests:** regression coverage for the id-less parse path (throws `SOURCE_MISSING_ID`), the in-place
  `revision: false` escape (edits without a `parentDocument`), and the build path (`buildCcda` always
  emits a `ClinicalDocument.id`, so its RPLC `parentDocument` always carries the SHALL id). All fixtures
  synthetic.
