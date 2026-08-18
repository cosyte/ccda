---
"@cosyte/ccda": patch
---

required sections: every document type now reports how far it was verified

Six of the twelve required-section (SHALL) tables asserted nothing, and nothing
in the API said whether that meant "no requirement", "not checked yet" or "the
requirement is unassertable". A consumer could not tell a verified all-clear from
an unverified silence, and only the prose warned them not to.

Five of those six were read off the normative C-CDA R2.1 base implementation
guide's document-level conformance statements. Consultation Note now asserts
History of Present Illness (CONF:1198-28907), Allergies and Intolerances
(-28911) and Problems (-28929); each is scoped to the R2.1 `@extension` stamp its
constraint's rule context carries, so an R1.1-origin document is asserted exactly
as before. Progress Note, Procedure Note, Operative Note and Diagnostic Imaging
Report assert nothing still, and that is now a traced result rather than an
unread table: every SHALL section their templates name is either outside this
parser's recognized catalog or a choice, and each is reported by name with the
reason. Unstructured Document carries no `structuredBody` at all (its component
SHALL be a `nonXMLBody`, CONF:1198-31086), so it has no section obligation.

The addition is **additive**: nothing is removed, narrowed or renamed.
`requiredSectionKeys` and `missingRequiredSections` keep their signatures and
their shape, and the six document types that already asserted keys (CCD,
Discharge Summary, Referral Note, History and Physical, Care Plan, Transfer
Summary) return exactly the same values as before, including under the unstamped
reading, with every conformance id they already carried left in place.

New exports:

- `requiredSectionStatus(documentType, options?)`: the asserted `keys` plus a
  `verification` of `traced-complete`, `traced-partial`, `untraced` or
  `not-applicable`, the `traced` provenance (conformance id and the source's own
  section name) behind each traced key, and every SHALL section left
  `unasserted` with the reason it is unassertable.
- `requiredSectionStatuses(options?)`: all twelve, so the whole picture is
  enumerable by a consumer.
- `DOCUMENT_TYPES`: the runtime enumeration behind the `DocumentType` union.
- The types `RequiredSectionStatus`, `RequiredSectionVerification`,
  `TracedRequiredSection`, `UnassertedRequiredSection` and
  `UnassertedSectionReason`.

The only behaviour change is the one the trace bought: a Consultation Note that
carries the R2.1 stamp and omits History of Present Illness, Allergies or
Problems now draws `REQUIRED_SECTION_MISSING` (a warning, never a fatal) where it
previously parsed silent. A traced state is a claim about what was read for that
type, so the six types nobody re-read report `untraced` whether or not their keys
already cite a conformance id.
