---
"@cosyte/ccda": minor
---

Build an inpatient Discharge Summary, the third of the twelve document types

`buildCcda` emits a Discharge Summary for `documentType: "dischargeSummary"`,
alongside the CCD and the Referral Note. `minor` rather than `patch` because the
package entry point gains two exported types: `BuildableDocumentType` (the union
of the three types the builder emits) and `BuildCcdaEncompassingEncounter`.
Nothing published was removed, renamed or narrowed, and no CCD or Referral Note
changes by a byte.

The document specializes the US Realm header with its own document `templateId`
root (`2.16.840.1.113883.10.20.22.1.8`, stamped `2015-08-01`), its LOINC document
code (`18842-5`), and the four SHALL sections its errors rule names: Allergies,
the narrative-only Hospital Course (`1.3.6.1.4.1.19376.1.5.3.1.3.5`, LOINC
`8648-8`), Discharge Diagnosis (V3) and Plan of Treatment (V2). Neither Problems
nor Medications is in that set, so unlike a CCD or a Referral Note a Discharge
Summary emits them only when you supply content, and Discharge Medications is a
SHOULD in the document's warnings rule and is not emitted at all. Three new
inputs carry the content: `hospitalCourse`, `dischargeDiagnoses` and
`encompassingEncounter`.

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

**A Discharge Summary reparses with exactly one warning, and it is expected.** Its
SHALL Hospital Course Section is an IHE PCC template this parser's section catalog
does not recognize, so the section is emitted, because the document's normative
errors rule requires it, and the parser raises one `UNKNOWN_SECTION_CODE` saying
truthfully that it does not know the template. `findSection("hospitalCourse")`
does not resolve; the section is in `doc.sections` with `key: undefined` and its
narrative intact. A CCD and a Referral Note still reparse with zero warnings.

Asking for one of the other nine types still throws a `TypeError` naming what you
asked for. That refusal is now derived from the builder's own specialization
table rather than from a list of strings, so a thirteenth recognized type is
refused the day it is recognized, and the membership test is `Object.hasOwn`
rather than `in`, so an untyped caller passing a prototype key is refused instead
of crashing partway through a build.

Measured, not asserted: `pnpm conformance` validates fifteen built documents,
two of them Discharge Summaries at both ends of the input range, against the CDA
R2 XML schema and the error-severity phase of the normative C-CDA R2.1
Schematron, with zero error-severity results. The README conformance statement
and the tracked report move with it, from two of twelve to three.
