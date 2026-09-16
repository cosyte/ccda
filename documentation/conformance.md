# Release recognition and required-section validation, in full

Which C-CDA release this package reads a document against, and what its required-section
tables assert for each document type, moved out of `README.md` so the front page stays short
enough to read in one sitting. Nothing is rewritten: the headings and the prose below are the
ones `README.md` carried, at the heading levels it used, and `README.md` links here from each
heading the text left behind.

## Which C-CDA release this validates against

**C-CDA R2.1**, and that is an exported value rather than only this sentence:

```ts
import { CCDA_CONFORMANCE_RELEASE } from "@cosyte/ccda";

CCDA_CONFORMANCE_RELEASE; // "R2.1"
```

Every conformance table here (the required-section SHALL sets, the recognition catalogs) is written
against that release, and nothing below moves it.

**A document written for a later release is recognized and named, which is not the same as being
read against it.** C-CDA 3.0.0 gave every document template a new `@extension`, `2024-05-01`, and
4.0.0 and 5.0.0 kept it, so a post-R2.1 document is detectable from the `templateId` that resolves
its type. Recognition reads that stamp into one of **three** states, and a boolean cannot hold them:

| the resolving `templateId` | reading             | diagnostic                                                                 | required-section verdict         |
| -------------------------- | ------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| `@extension="2015-08-01"`  | `r21-stamped`       | none                                                                       | the full R2.1 obligation         |
| no `@extension` at all     | `unstamped`         | `TEMPLATE_EXTENSION_ABSENT`                                                | the R1.1-origin reading          |
| any other `@extension`     | `unmodeled-release` | `TEMPLATE_EXTENSION_UNMODELED_RELEASE` + `REQUIRED_SECTIONS_NOT_EVALUATED` | **not evaluated**, never reduced |

The third row is the one worth reading twice. A stamp this package does not model means the
obligation is **reported unevaluated**, not computed smaller: a `2024-05-01` CCD carrying neither
Social History nor Vital Signs draws no `REQUIRED_SECTION_MISSING`, and says so out loud rather than
by omission. Parsing is otherwise unchanged: the document is read leniently, nothing is refused, and
the clinical reading is identical to the same document stamped `2015-08-01`.

**A reported stamp never comes from the document.** `CCDA_RELEASE_STAMPS` is the closed table this
package owns (`2015-08-01` → `R2.1`, `2024-05-01` → `R3.0 or later`), and a message names a member of
it or names no stamp at all, so a sender-controlled `@extension` cannot reach a `CcdaWarning.message`.
`releaseForTemplateExtension` exposes that lookup, and `readTemplateStamp` the three-state reading.

The existential R2.1 rule is unchanged: a document carrying the resolving root **twice**, once
stamped `2015-08-01` and once for a later release, is inside the Schematron rule's context and is
evaluated under the full R2.1 obligation.

**What this does not do:** it does not read a document against C-CDA 3.0.0, 4.0.0 or 5.0.0. 4.0.0
relaxed the US Realm Header and 5.0.0 added a Pregnancy Section, and neither is modelled here.
Knowing which guide a document was written for is the whole of what is claimed.

## Required-section validation

For a recognized `DocumentType`, a required (SHALL) catalog section that is absent surfaces a
`REQUIRED_SECTION_MISSING` **warning**, never a fatal, so a missing section never blocks reading the
data that _is_ present. `requiredSectionKeys(documentType)` and
`missingRequiredSections(documentType, presentKeys)` expose the table directly.

The table is **conservative**: it asserts only unconditional, in-catalog, high-confidence SHALL
constraints and deliberately omits choice constraints (`SHALL contain A OR B`), SHOULD/MAY sections,
and SHALL sections outside the recognized catalog (e.g. Hospital Course, Physical Exam). A document
type with an empty table therefore means _"no unconditional in-catalog SHALL section is asserted yet"_,
not _"this type has no requirements"_. Broadening a table is additive and safe.

The **CCD** table is fully traced. It asserts **six** sections, read directly off the normative C-CDA
R2.1 Schematron's CCD (V3) rule: **Allergies** (CONF:1198-30662), **Medications** (-30664),
**Problems** (-30666), **Results** (-30670), **Social History** (-30688), and **Vital Signs**
(-30690). Procedures (-30668) and Plan of Treatment (-30686) are **SHOULD**, not SHALL, so neither is
asserted. This is the same set `buildCcda` emits for a CCD: the parser warns about exactly the
sections the builder guarantees, in both directions.

**The six section templates do not share one version stamp.** Each assert names a `@root` _and_ an
`@extension`, and **Medications (`…22.2.1.1`) is `2014-06-09`** where the other five are
`2015-08-01`: R2.1 revised that section at the earlier stamp and never re-issued it. `buildCcda`
emits the pair the Schematron asks for. Section _recognition_ on parse matches the root alone, so a
document stamped either way still reads back the same.

**Those six CONF ids are scoped to the R2.1 stamp**, because the rule they live in matches only a
`ClinicalDocument` whose CCD `templateId` carries `@extension="2015-08-01"`. **Social History** and
**Vital Signs** are therefore asserted only against an R2.1-stamped document. An R1.1-origin CCD
(the same root with no extension, the condition that raises `TEMPLATE_EXTENSION_ABSENT`) is asserted
exactly as it was before this table was traced: Allergies, Medications, Problems, Results. That is
not a claim that R1.1 omitted the other two; it is the absence of a source, recorded rather than
guessed. Both `requiredSectionKeys` and `missingRequiredSections` take an optional
`{ r21Stamped: false }` to ask for the unstamped reading.

**A document stamped for a release later than R2.1 gets neither reading.** It is outside those rules
just as an unstamped document is, but it is a different document and the unstamped reduction is a
statement about the past. Such a document draws a `REQUIRED_SECTIONS_NOT_EVALUATED` warning and **no
`REQUIRED_SECTION_MISSING` at all**, and `requiredSectionStatus(type, { stamp: "unmodeled-release" })`
reports `evaluation: "not-evaluated"` so an empty key set still says which emptiness it is. See
[Which C-CDA release this validates against](#which-c-cda-release-this-validates-against).

The **Referral Note**
asserts **Reason for Referral** alongside Problems, Allergies, and Medications (traced to the
normative R2.1 Schematron, CONF:1198-30925), so the SHALL check does not stay silent when a Referral
Note omits it. Its Assessment/Plan requirement stays out (a choice constraint), as do its Results and
Plan of Treatment sections (SHOULD, not SHALL).

A **Discharge Summary** asserts **Allergies** (CONF:1198-30520), **Discharge Diagnosis** (-30524)
and **Plan of Treatment** (-30528), the three sections its errors rule requires unconditionally that
this parser recognizes. It does **not** assert **Discharge Medications**: the normative source puts
that section in the document's _warnings_ rule as a SHOULD (-30525), so a conformant Discharge
Summary that omits it draws no warning. **Hospital Course** (-30522) is an unconditional SHALL that
this parser's catalog does not recognize, so it is reported as unasserted rather than silently
dropped.

A **History and Physical** asserts seven of the ten sections its errors rule names: Allergies
(-30572), Family History (-30584), Past Medical History (-30588), Medications (-30596), Results
(-30606), Social History (-30610) and Vital Signs (-30612). General Status (-30586), Physical Exam
(-30598) and Review of Systems (-30608) are outside the recognized catalog, and its two choices
(-30613, -30614) assert neither half. A **Transfer Summary** asserts all six of its named SHALL
sections: Allergies (-28256), Medications (-28278), Problems (-28284), Results (-28288), Vital Signs
(-28292) and Reason for Referral (-31343); its Assessment/Plan choice (-31582) stays out. A **Care
Plan** asserts both of its named SHALL sections, Health Concerns (-28756) and Goals (-28762).

**Every key added by one of those re-reads is scoped to the R2.1 stamp**, exactly as the CCD's two
newest keys are, because every one of those document-level rules matches only a `ClinicalDocument`
whose `templateId` carries `@extension="2015-08-01"`. So an unstamped, R1.1-origin document is
asserted exactly as it was before, with one exception in the safe direction: a key **withdrawn**
because the source states it as a SHOULD or as a choice is withdrawn from the unstamped reading too,
because "no sentence made this unconditional" does not depend on the stamp. That is why an unstamped
Discharge Summary no longer asserts Discharge Medications either.

### What each document type asserts, and how much of it was verified

**Every one of the twelve types reports a verification state**, so an empty asserted set is never
ambiguous. `requiredSectionStatus(documentType)` returns the same `keys` as `requiredSectionKeys`
plus a `verification` of `traced-complete`, `traced-partial`, `untraced` or `not-applicable`, an
`evaluation` of `evaluated` or `not-evaluated`, the provenance (`traced`) of every key read off the
source, every SHALL section left `unasserted` with the reason, and the `source` the reading was taken
from. `requiredSectionStatuses()` returns all twelve at once, and `DOCUMENT_TYPES` enumerates the
types themselves.

The two states answer different questions and neither substitutes for the other. `verification` is
about the **type**: how much of its obligation has been read off the normative source, which no
option moves. `evaluation` is about the **lookup**: whether the stamp you supplied put the document
inside those tables at all. `traced-complete` beside an empty key set and `not-evaluated` is not a
contradiction; it means the obligation is fully read and this document's release is not one it
reaches.

A state says what was read off the normative C-CDA R2.1 base implementation guide **for that type**,
not what this package has ever cited: `traced-complete` claims every SHALL section the source names
is asserted, which is a completeness claim, so a type nobody re-read stays `untraced` even when its
keys carry conformance ids. **No recognized type reports `untraced` today**: every one of the twelve
has had its document-level rules read.

**Each status names the artifact it was read from and that artifact's own revision.**
`status.source` carries `{ artifact, revision }`, where `revision` is the artifact's self-reported
revision date rather than the date this package looked at it. A reader holding a newer revision of
the same artifact can therefore tell a table is stale without re-deriving it, and a re-read that
changes nothing does not move the date.

| document type             | state             | asserted                                                                                                                                                                                                      | named but not asserted                                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consultation Note         | `traced-partial`  | History of Present Illness (CONF:1198-28907), Allergies (-28911), Problems (-28929), all scoped to the R2.1 stamp                                                                                             | Reason for Referral **or** Reason for Visit (-9504); Assessment and Plan **or** Assessment plus Plan of Treatment (-9501). Neither is unconditional                                                                                                                                          |
| Progress Note             | `traced-partial`  | nothing: the source names no unconditional SHALL section for it                                                                                                                                               | the Assessment/Plan choice (-30657)                                                                                                                                                                                                                                                          |
| Procedure Note            | `traced-partial`  | nothing                                                                                                                                                                                                       | Complications (-30387), Procedure Description (-30356), Procedure Indications (-30358), Postprocedure Diagnosis (-30360), all outside the recognized catalog; the Assessment/Plan choice (-30412)                                                                                            |
| Operative Note            | `traced-partial`  | nothing                                                                                                                                                                                                       | Anesthesia (-30487), Complications (-30489), Preoperative Diagnosis (-30491), Procedure Estimated Blood Loss (-30493), Procedure Findings (-30495), Procedure Specimens Taken (-30497), Procedure Description (-30499), Postoperative Diagnosis (-30501), all outside the recognized catalog |
| Diagnostic Imaging Report | `traced-partial`  | nothing                                                                                                                                                                                                       | Findings (DIR) (-30697), outside the recognized catalog                                                                                                                                                                                                                                      |
| Unstructured Document     | `not-applicable`  | nothing                                                                                                                                                                                                       | nothing: its component SHALL be a `nonXMLBody` (-31086), so it carries no section to require                                                                                                                                                                                                 |
| CCD                       | `traced-complete` | Allergies (-30662), Medications (-30664), Problems (-30666), Results (-30670), Social History (-30688), Vital Signs (-30690); the last two scoped to the R2.1 stamp                                           | nothing: all six of its SHALL sections are asserted. Procedures (-30668) and Plan of Treatment (-30686) are SHOULD, so they are not part of the obligation                                                                                                                                   |
| Care Plan                 | `traced-complete` | Health Concerns (-28756), Goals (-28762)                                                                                                                                                                      | nothing: both of its SHALL sections are asserted                                                                                                                                                                                                                                             |
| Discharge Summary         | `traced-partial`  | Allergies (-30520), Discharge Diagnosis (-30524), Plan of Treatment (-30528, scoped to the R2.1 stamp)                                                                                                        | Hospital Course (-30522), outside the recognized catalog. Discharge Medications is a SHOULD (-30525) and is therefore not required at all                                                                                                                                                    |
| Referral Note             | `traced-partial`  | Allergies (-30912), Medications (-30923), Problems (-29087), Reason for Referral (-30925)                                                                                                                     | the Assessment/Plan choice (-29102)                                                                                                                                                                                                                                                          |
| History and Physical      | `traced-partial`  | Allergies (-30572), Family History (-30584), Past Medical History (-30588), Medications (-30596), Results (-30606), Social History (-30610), Vital Signs (-30612); all but Allergies scoped to the R2.1 stamp | General Status (-30586), Physical Exam (-30598), Review of Systems (-30608), all outside the recognized catalog; the chief-complaint/reason-for-visit choice (-30613) and the Assessment/Plan choice (-30614)                                                                                |
| Transfer Summary          | `traced-partial`  | Allergies (-28256), Medications (-28278), Problems (-28284), Results (-28288), Vital Signs (-28292), Reason for Referral (-31343); the last three scoped to the R2.1 stamp                                    | the Assessment/Plan choice (-31582)                                                                                                                                                                                                                                                          |

**This check still under-warns, and the state says where.** A `traced-partial` type is not checking
the sections listed in its right-hand column: a document of one can be missing a section its type
requires and still parse clean. A `traced-complete` type is checking every section its type's
document-level rule names, which is still not the whole of conformance: nothing here validates what a
section or an entry contains. **A quiet parse is not a conformance result.** If your pipeline needs
IG conformance, validate the document with an external validator.

