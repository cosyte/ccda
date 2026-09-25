---
"@cosyte/ccda": minor
---

Build an inpatient Discharge Summary, the third of the twelve document types

`buildCcda` emits a Discharge Summary for `documentType: "dischargeSummary"`,
alongside the CCD and the Referral Note. `minor` rather than `patch` because the
package entry point gains two exported types: `BuildableDocumentType` (the union
of the three types the builder emits) and `BuildCcdaEncompassingEncounter`, and
the published `UnassertedSectionReason` union gains a third member,
`"assertion-would-tighten-parse"`. Nothing published was removed or renamed, and a
CCD or a Referral Note built from an init that names no Discharge Summary input
does not change by a byte.

The document specializes the US Realm header with its own document `templateId`
root (`2.16.840.1.113883.10.20.22.1.8`, stamped `2015-08-01`), its LOINC document
code (`18842-5`), and the four SHALL sections its errors rule names: Allergies,
the narrative-only Hospital Course (`1.3.6.1.4.1.19376.1.5.3.1.3.5`, LOINC
`8648-8`), Discharge Diagnosis (V3) and Plan of Treatment (V2). Neither Problems
nor Medications is in that set, so unlike a CCD or a Referral Note a Discharge
Summary emits them only when you supply content, the medications in the
Medications Section; Discharge Medications is a SHOULD in the document's warnings
rule and is not emitted at all. Three new inputs carry the content:
`hospitalCourse`, `dischargeDiagnoses` and `encompassingEncounter`.

**What you supply is emitted or refused, never dropped.** Those three inputs throw
a `TypeError` on a CCD or a Referral Note instead of being ignored, and
`assessment` and `reasonForReferral`, the Referral Note's narratives, throw on a
Discharge Summary. A CCD still ignores `assessment` and `reasonForReferral`, as it
always has.

It is the only type carrying `componentOf/encompassingEncounter`, the frame
naming the stay. Every slot in it is required by the template and none is ever
invented: an encounter period bound or a discharge disposition you did not supply
is emitted as an explicit `nullFlavor="UNK"`, which satisfies the cardinality,
says the fact is unknown rather than stating one, and reparses as absent. None of
the three is ever derived from the document `effectiveTime` or from a
`documentationOf` service event. A supplied bound keeps exactly the precision you
gave it. The disposition's `codeSystem` defaults to the NUBC UB-04 Patient
Discharge Status code set, the system every member of the value set the template
names carries, and your own `codeSystem` is emitted verbatim instead when you
supply one.

**All three types reparse with zero warnings.** The Hospital Course Section is an
IHE PCC template outside the section catalog; `parseCcda` now recognizes it by its
root (`findSection("hospitalCourse")` resolves), in every document and not only a
built one, so a section carrying that root and matching nothing in the catalog no
longer raises `UNKNOWN_SECTION_CODE`. That is the only parse output that moves:
the root is consulted after every catalog root and the LOINC fallback, so no
section changes key; the LOINC code `8648-8` alone still raises
`UNKNOWN_SECTION_CODE`; no entry in such a section is newly flagged as misplaced;
and the section is not asserted as required, so no Discharge Summary that omits it
gains a `REQUIRED_SECTION_MISSING`. `requiredSectionStatus("dischargeSummary")`
names it as unasserted with the new reason `"assertion-would-tighten-parse"`.

Asking for one of the other nine types still throws a `TypeError` naming what you
asked for. That refusal is now derived from the builder's own specialization
table rather than from a list of strings, so a thirteenth recognized type is
refused the day it is recognized, and the membership test is `Object.hasOwn`
rather than `in`, so an untyped caller passing a prototype key is refused instead
of crashing partway through a build. Only an omitted (`undefined`) `documentType`
defaults to a CCD: `null`, which used to build a CCD, is refused, and so is any
value that is not a string, before any lookup and without converting it.

Measured, not asserted: `pnpm conformance` validates fifteen built documents,
two of them Discharge Summaries at both ends of the input range, against the CDA
R2 XML schema and the error-severity phase of the normative C-CDA R2.1
Schematron, with zero error-severity results. The README conformance statement
and the tracked report move with it, from two of twelve to three.
