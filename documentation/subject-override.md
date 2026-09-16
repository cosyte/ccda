# The subject override, in full

Whose data an entry is about, and what this package withholds when a document says it is not
the record target's, moved out of `README.md` so the front page stays short enough to read in
one sitting. Nothing is rewritten: the heading and the prose below are the ones `README.md`
carried, and `README.md` links here from the heading the text left behind.

## Whose data an entry is about: the subject override

CDA R2 gives `Section.subject` cardinality `0..1` and defines it as the "Primary target of the entries
recorded in a section"; C-CDA admits the same override on a clinical statement. So a conformant
document can carry a relative's, a donor's or a contact's clinical statement inside the patient's
document, and every read path documented above as the patient's own data must not hand one back.

**An entry under a subject declaration is withheld from every record-target read path and flagged
`SUBJECT_CONTEXT_OVERRIDE` (safety-critical, no profile may tolerate it).** Four rules decide it, and
each is a decision rather than an implementation detail:

- **Presence is the trigger.** A `<subject>` is an override whatever it names. Nothing is compared with
  the record target and nothing is resolved to the patient: that would make the answer depend on vendor
  identifier hygiene, which is the guess this library's fail-safe rule forbids. An empty declaration, a
  `nullFlavor`-only one, a repeated one, and one that restates the patient's own name and MRN are all
  overrides. **The cost is stated rather than hidden**: a vendor that redundantly repeats the patient as
  an entry subject loses those entries from `getProblems()` and friends and gains a warning per entry.
  That is the safe direction of the error.
- **The nearest enclosing declaration wins**, the standard's own conduction rule. A section nested
  inside a declaring section inherits that declaration unless it declares its own, and governance is
  resolved from the element's ancestors, so handing a subsection straight to `extractProblems(...)`
  withholds exactly as parsing the whole document does. No public read path is a bypass around another.
- **The whole top-level `<entry>` is withheld**, its own statement and every statement nested inside it,
  and it is the unit of the warning count too. A declaration on the second Problem Observation of a
  Problem Concern Act withholds the WHOLE concern act and emits ONE warning at the act's locus: a
  concern act returned one observation short, silently, is exactly the confidently wrong clinical answer
  this exists to prevent.
- **A Family History Organizer's own `<subject>` slot is never an override.** It is that template's
  mechanism for naming the relative, whatever the slot contains, so it draws no warning and it
  re-overrides an enclosing section declaration. `getFamilyHistory()` returns what it always returned,
  in every document shape; withholding never removes anything from it. **The carve-out is read-side
  and reaches only the organizer that read path reads**: an entry carrying the Family History
  Organizer template beside one a record-target read path returns (a Result Organizer, say) is
  withheld and flagged like any other, and so is an entry whose declaration sits deeper inside it. A
  `templateId` is one element and C-CDA entries carry several, so a stray one cannot switch the rule
  off.

The count is **per section and sums over the document**: N governed top-level entries in a section
produce exactly N instances in document order, each naming that entry's own bounded locus (element
path, the section's LOINC code, line and column), and a section that declares an override but governs
no entry anywhere beneath it produces exactly one instance at its own locus instead. A document whose
Problems section declares an override over three entries and whose Allergies section declares one over
none produces four, never three.

**Withholding is read-side only.** The withheld entry is not dropped from the document: `toString()` /
`serializeCcda()` reproduce it byte for byte (the round trip is unchanged), and the section's narrative
is returned unredacted, unreordered and unannotated. Nothing new is modelled for third-party subjects:
a withheld entry is reachable only through the re-serialized document. Under `{ strict: true }` the
warning escalates like every other safety-critical Tier-2 code, so a document carrying an override now
throws where it previously parsed.

