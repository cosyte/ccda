---
"@cosyte/ccda": minor
---

feat: measure conformance against the normative artifacts, and fix what the measurement found

A built document's conformance was expected rather than proven. The README said so:
the builder's gap had been "grounded against the raw C-CDA R2.1 IG text rather than a
validator run". It is measured now, and measuring it found 86 error-severity results
across the populated document the builder emits, then eight more once the measured set
covered every section it can emit rather than one populated init shape.

`pnpm conformance` fetches the normative C-CDA R2.1 Schematron, its vocabulary file
and the CDA R2 XML schema at run time from pinned immutable references, validates
every document the builder emits against the schema and then the Schematron's
error-severity phase, re-runs the Schematron over a public sample corpus parsed and
re-serialized through this library, and writes `documentation/conformance-report.md`.
The run fails if the committed report differs from what it just produced, and the
ordinary suite fails unless the README's conformance statement agrees with the report
on the artifact revision, the document types validated, the count of error-severity
results and the count of round trips whose error sets differed. The current result is
zero and zero.

**This is why the bump is minor rather than patch.** It adds one exported type
(`BuildCcdaSelfCareActivity`) and one warning code (`MISSING_SELF_CARE_ACTIVITY`), and
it moves what the builder emits and therefore what a consumer reads back from it. The
emitted changes: the patient carries `raceCode` and `ethnicGroupCode` as
`nullFlavor="UNK"`; the device author carries a `representedOrganization`; a CCD
carries `documentationOf/serviceEvent`; a Referral Note carries an
`informationRecipient`; an empty required section declares the entries-required
`templateId` alongside the entries-optional one; both Concern Acts carry the `CONC`
code the guide fixes and the CDA R2 `Act` sequence makes mandatory; a Reaction
Observation carries an `id`; a no-known-allergy entry carries the substance
participant with a `nullFlavor="NA"` code; the Vital Signs Organizer carries the
LOINC code its 2.1-only branch requires rather than the SNOMED one; an Immunization
Activity states `negationInd` on both arms; a Result Organizer emits its
`effectiveTime` as an interval; and an act-variant procedure carries the
`effectiveTime` that variant alone requires at error severity.

Two reads change with them. A no-known-allergy entry's `allergen` is now present and
explicitly `nullFlavor="NA"` rather than absent, which is what an entry from any other
system has always parsed to here; `noKnownAllergy` and `negated` are unchanged and
there is no code to mistake for an allergen. An administered immunization now reads
back `refused: false` rather than `undefined`, because the document states it.

Widening the measured set from one populated init shape to every section the builder
emits found eight more, and closing them moved five more things. The Age Observation's
fixed `code` is SNOMED CT `445518008` "Age At Onset" rather than `397659008` "Age"; the
Family History Death Observation's fixed `value` is `419099009` "Dead" rather than
`419620001` "Death"; a Family History Observation's fixed `code` carries the LOINC
`75315-2` translation its template requires; a Mental Status Observation's fixed `code`
carries the LOINC `75275-8` translation its template requires; and a Functional Status
Organizer is written only when it carries the Self-Care Activities (ADL and IADL)
observation the template SHALL contain.

That last one is the only change a caller has to do anything about.
`BuildCcdaFunctionalStatusOrganizer` takes `selfCareActivities`, each written as a
`…22.4.128` observation and read back as an ordinary functional-status finding. Supply
none and the organizer is not written: its findings go out as standalone Functional
Status Observations, every one of them present and unchanged, and the returned document
carries `MISSING_SELF_CARE_ACTIVITY` saying the grouping, its categorization code and
its `effectiveTime` were dropped and why. Fabricating an all-`nullFlavor` activity would
assert an assessment nobody performed, and writing the organizer anyway would stamp a
template the document does not satisfy.

The XML schema the harness validates against is the SDTC-extended tree at the same
pinned commit rather than `schema/normative`, because the builder emits the HL7-approved
`sdtc:deceasedInd` extension and the normative schema declares no extension elements.

Every fix keeps the never-invent-content rule: a `SHALL` slot with no known value is
`nullFlavor`, and no clinical time, dose, route or code is invented to satisfy a
cardinality.

**What the measurement does not cover**, stated where the capability is rather than
below it: the two document types the builder emits and not the other ten, the
error-severity phase and not the warning phase, value-set membership only where the
Schematron's own vocabulary file checks it, and a round trip that is differential
rather than absolute. It is an assessment against a published artifact, not a
certification, and no accredited body has reviewed it. The harness needs network
egress and fails explicitly without it; there is no offline pass. Nothing it fetches
is committed or ever sits in a tracked path.

Two development dependencies, neither reaching the runtime set: `xmllint-wasm` for
XML Schema validation and `xpath` for XPath 1.0 evaluation.
