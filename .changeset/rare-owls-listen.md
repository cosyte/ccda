---
"@cosyte/ccda": patch
---

subject override: an entry is never read as the patient's unless it is

CDA R2 gives `Section.subject` cardinality `0..1` and defines it as the "primary
target of the entries recorded in a section"; C-CDA admits the same override on a
clinical statement. So a conformant document can carry a relative's, a donor's or
a contact's clinical statement inside the patient's document. This parser read
`<subject>` in exactly one place (a Family History Organizer's `relatedSubject`)
and every other extractor handed such an entry back as the patient's, silently.
That is another person's clinical data attributed to this patient, in a read path
documented as the patient's own.

A top-level `<entry>` that a subject declaration governs is now **withheld** from
every record-target read path and flagged with a new safety-critical Tier-2
warning, `SUBJECT_CONTEXT_OVERRIDE`, which no vendor profile may tolerate. An
entry is governed when it carries a declaration itself, when a clinical statement
nested inside it carries one, or when an enclosing section carries one (the
nearest enclosing declaration wins, which is the standard's own conduction rule).

Four things are decisions rather than details:

- **Presence is the trigger.** A declaration is an override whatever it names.
  Nothing is compared with the record target and nothing is resolved to the
  patient, because that would make a clinical answer depend on vendor identifier
  hygiene. A document that redundantly restates the patient as an entry subject
  therefore loses those entries from the record-target read paths and gains a
  warning for each: the safe direction of the error, and the accepted cost.
- **The whole top-level entry is withheld**, its own statement and every statement
  nested inside it, and the same unit does the counting. A declaration on the
  second Problem Observation of a Problem Concern Act withholds that whole concern
  act and emits one warning at the act's locus, never a concern act handed back
  one observation short.
- **Family History is untouched.** A Family History Organizer's own subject slot
  is that template's mechanism for naming the relative, whatever it contains, so
  it is never an override, draws no warning, and re-overrides an enclosing section
  declaration. `getFamilyHistory()`, the `familyHistory` field,
  `extractFamilyHistory` and the aggregate's family-history slot return exactly
  what they returned before, in every document shape. That carve-out is read-side
  and reaches only the organizer the family-history path itself reads: an entry
  that carries the Family History Organizer template beside one a record-target
  read path returns (a Result Organizer, a Problem Concern Act) is withheld and
  reported like any other, because a `templateId` is one element and C-CDA entries
  carry several. A declaration nested deeper inside an entry is never that slot.
- **Withholding is read-side only.** The withheld entry is not dropped: the
  byte-faithful round trip through `toString()` / `serializeCcda` reproduces it
  unchanged, and section narrative is returned unredacted, unreordered and
  unannotated.

The count is per section and sums over the document: N governed top-level entries
in a section produce exactly N instances, in document order, each naming that
entry's own bounded locus (an element path from the CDA vocabulary, the section's
LOINC code, line and column, with `<withheld>` for anything that fails its bound),
and a section that declares an override but governs no entry anywhere beneath it
produces exactly one instance at its own locus instead. The same withholding
applies to a per-family or aggregate extraction invoked directly on a section,
including a nested subsection governed by an ancestor's declaration, with the
warnings delivered on the parse context those functions already accept: no
signature, parameter or return type changes. `extractFamilyHistory` delivers them
too, while returning its own contents whole.

Two behaviour changes to expect. A document carrying an override loses those
entries from `getProblems()` / `getMedications()` / `getAllergies()` and the other
ten record-target families where it previously returned them as the patient's,
and under `{ strict: true }` it now throws, because the new code escalates like
every other safety-critical Tier-2 warning. Nothing is modelled for third-party
subjects: a withheld entry is reachable only through the re-serialized document.
