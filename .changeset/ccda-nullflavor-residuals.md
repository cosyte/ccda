---
"@cosyte/ccda": patch
---

Close the two residuals the previous slice named and argued rather than fixed: a **patient
identifier** read out of a `nullFlavor`-marked `<id>`, and a medication naming **two different
drugs** with one silently dropped. One new stable warning code, safety-critical.

**This is a behavioural change on a published package.** `patch` is the only legal bump on the
locked `0.0.x` ladder (ADR 0001), so the version cannot carry the signal and this prose has to.
`doc.getMrn()` now returns `undefined` where it previously returned an MRN, on documents where the
`<id>` carrying it was marked `nullFlavor`. `med.drug` / `immunization.vaccine` now returns
`undefined` where it previously returned the `manufacturedMaterial` code, on documents that carry
both `ManufacturedProduct` arms naming different products. `editCcda` now throws
`CcdaEditError("SOURCE_MISSING_ID")` where it previously succeeded, when asked to stamp an `RPLC`
revision on a source whose `ClinicalDocument.id` is `nullFlavor`-marked. A consumer switching
exhaustively on `WarningCode` will see one new member.

**1. `getMrn()` no longer hands back an MRN the document disowned.** The previous slice made
`<id nullFlavor="UNK" extension="MRN001"/>` warn (`CONTRADICTORY_NULL_FLAVOR`, safety-critical), but
`pickMrn` still returned `"MRN001"`, so `doc.getMrn()` produced a patient identifier out of a field
the document had explicitly marked unknown. A **misfiled patient record** is the third harm this
package's ordering names, alongside a wrong dose and a wrong code system, and it is the worst of the
three to catch after the fact: it is silent, it persists, and it contaminates every record joined to
it downstream. `pickMrn` now returns `undefined` when the **first** `patientRole/id` carries a
`nullFlavor`.

**It withholds, it does not substitute.** Falling through to the next `<id>` is the tempting move
and the worse one. CDA R2 makes `patientRole/id` `1..*` and nothing in the document ranks the
entries, so the second id is not "another MRN", it is whatever the sending system listed second,
commonly a plan member number, an account number, or the SSN under `2.16.840.1.113883.4.1`.
Answering the MRN question confidently from a different assigning authority, with no signal naming
the substitution, trades one wrong-identifier failure for a quieter one. The rule being applied
declines a manufactured reading; it does not manufacture a replacement. Same slot, same position,
reading withheld. A caller who knows their own authority OIDs can resolve it from
`getPatient()?.identifiers`, which still reports every id in full.

**The datatype is deliberately unchanged, and that is the whole argument.** `parseIi` still keeps
`@extension` on a contradicted `<id>`. It **is** the document's own text, with no second copy the
way `PQ.raw` sits beside `PQ.value`, so withholding it there would delete what the document said
rather than decline to embellish it, which is exactly the limit the previous slice stated. What
moved is _where_ the withholding happens. `pickMrn` does not report a datum, it manufactures a
**selection**: it picks one `<id>` out of a list and flattens it to a bare `string` that no longer
carries the `nullFlavor` qualifying it. That is precisely the relationship `PQ.value` has to
`PQ.raw`, so the existing rule applies unchanged, one layer up, and it buys both properties instead
of trading one for the other.

**What a naive consumer sees afterwards.** `doc.getMrn() === undefined` (was `"MRN001"`), with
`CONTRADICTORY_NULL_FLAVOR` in `doc.warnings`, and the verbatim value still reachable at
`doc.getPatient()?.identifiers[0]`, which reports `{root, extension: "MRN001", nullFlavor: "UNK"}`.
A caller reading only `getMrn()` now reads "no MRN", which is what the document asserted. The
positional contract is otherwise unchanged: it is still the first `patientRole/id`, never a
different one.

**The other identity slots are left reporting the document verbatim, and they differ for a reason.**
`ClinicalDocument.id`, `setId`, `relatedDocument/parentDocument/id` and every entry-level `<id>` (the
practice-, lab- and act-assigned identifiers) are only ever handed back as the whole datatype, with
the `nullFlavor` on the same object and the warning in `doc.warnings`. No accessor flattens any of
them to a naked string, so there is no dangerous affordance to close, and withholding there would
lose data for no safety gain.

**`templateId` is the stated exception rather than a member of that list.** Document- and
section-type recognition _does_ derive a reading from `templateId.@root`, so
`<templateId root="…22.1.2" nullFlavor="NA"/>` still resolves the document type and, through it, the
required-section SHALL set. That is left unchanged on purpose: a `templateId` is a conformance
assertion about the document's _shape_, not an identifier for a person or a record, so a mis-read
costs a spurious or missing `REQUIRED_SECTION_MISSING` rather than a misattributed clinical fact,
and declining to recognize would make the parser less informative rather than safer by swapping a
working document type for `UNKNOWN_DOCUMENT_TEMPLATE`.

**The one exception is the emit side.** Stamping a CDA R2 `RPLC` revision copies the source's `<id>`
into the new `relatedDocument/parentDocument`, and it copied `root`/`extension` only, dropping a
`@nullFlavor` on the way, which would promote an identifier the source disowned into an unqualified
assertion about which document is being replaced. `editCcda` now refuses: a revision of a source
whose `ClinicalDocument.id` is null-marked throws `CcdaEditError` `SOURCE_MISSING_ID`, the same
refusal an id-less source already got and for the same reason (an `<id>` marked null names no prior
version for the RPLC link to replace). A null-marked `setId` gets the milder remedy its optionality
allows: it identifies no version series, so it is treated as absent and a fresh series id is minted
rather than the disowned one being asserted twice. `revision: false` still edits in place.

**2. A `manufacturedProduct` carrying BOTH arms no longer silently drops one
(`MEDICATION_PRODUCT_ARM_CONFLICT`, safety-critical).** The previous slice fixed the _single_-arm
case but left `manufacturedMaterial` unconditionally preferred, so a document carrying
`manufacturedMaterial` **and** `manufacturedLabeledDrug` with different codes had one of its two
named drugs dropped without a word: `med.drug` read as a well-formed, confident answer to a question
the document had answered twice, differently.

Two drugs on one medication is a contradictory document, and **nothing in the document ranks the
arms**. Preferring one is therefore not reporting what the document said, it is manufacturing a
choice the document declined to make, and handing a naive consumer one of two contradictory drugs
with the other gone. So the parser refuses when **both** arms name a product and the products
differ (a different `@code`, or one `@code` under two different `@codeSystem`s): no product code is
selected, `drug` / `vaccine` is `undefined`, and the new warning is the signal. This is the
`CONTRADICTORY_NULL_FLAVOR` resolution applied to a structural contradiction rather than a datatype
one, the same three moves in the same order: warn, withhold the manufactured reading, preserve
everything verbatim.

`MISSING_PRODUCT_CODE` is deliberately **suppressed** behind it at all three consumable call sites
(Medication Activity, Immunization Activity, Planned Medication Activity), because "no arm yielded a
code" would be false here and the conflict warning is the stronger, more specific statement, the
same substitution `CONTRADICTORY_NULL_FLAVOR` already makes for `MISSING_UNIT_ON_PQ` on a withheld
quantity. The other cost is named rather than hidden: with no code selected, `checkCodeSlot` has
nothing to check, so `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM`, `DEPRECATED_CODE_SYSTEM` and
`SEMANTIC_CODE_INVALID` cannot fire for that slot either. That is why the new code is
safety-critical and no profile may quiet it, it is the lone signal by construction, and it is also
why the rule is scoped as narrowly as it is.

**An arm that asserts no symbol names no product, so it never conflicts with one that does.** A
`nullFlavor`-only `<code>`, or an arm with no `<code>` at all, is an _exceptional value_ under HL7
v3 rather than a competing one, which is the same rule `contradictsAssertedValue` applies one layer
down: only a value-bearing assertion can contradict. Whichever arm names the drug is read. This
matters in both directions. Refusing here would discard an RxNorm code the document names exactly
once, and take every `checkCodeSlot` check on it down with it, which is the "parser got quieter
about a wrong code system" regression this whole line of work exists to reverse. And it is also the
direction the previous behaviour lost data in: a `nullFlavor`-only `manufacturedMaterial` used to
win over a `manufacturedLabeledDrug` naming a real RxNorm concept, in silence. Two arms naming the
**same** product are redundant rather than contradictory, so the material arm is read exactly as
before. An arm naming the same `@code` while omitting `@codeSystem` is not a conflict either,
`MISSING_CODE_SYSTEM` already covers that shape and withholding instead would swap a loud warning
for a quiet one. No terminology equivalence is attempted: deciding that two different codes denote
one concept is a `TerminologyAdapter`'s job, and guessing it in the parser would be the same
manufactured reading this check exists to refuse.

**`MEDICATION_PRODUCT_ARM_UNEXPECTED` now keys off the arm rather than its `<code>`.** A name-only
`manufacturedLabeledDrug` (legal CDA R2, `LabeledDrug.name`) is the same deviation from the C-CDA
templates, and keying on the code let markup shape rather than meaning decide whether it was
reported. It stays tolerable, and it fires alongside the conflict warning when both apply.

**Nothing is lost.** `serializeCcda` re-emits the parsed DOM, so both arms round-trip byte-for-byte
and a caller who needs the withheld one can still read it off `doc.toString()`, which is pinned by
test. `buildCcda` continues to emit a single `manufacturedMaterial`.

**Provenance, stated rather than invented.** No normative SHALL is cited for either change and none
is fabricated. CDA R2 declares `@nullFlavor` and `@extension` on `II` independently, and neither CDA
R2 nor C-CDA R2.1 states which `patientRole/id` is the MRN; that `ManufacturedProduct` models one
participant rather than two is base CDA R2 structure, but whether the C-CDA template forbids both
arms together is a question that needs the normative R2.1 Schematron this repo does not hold. Both
rules rest on HL7 v3 datatype semantics (`nullFlavor` is a property of `ANY` marking an _exceptional
value_, one with no proper value) plus the harm ordering `SAFETY_CRITICAL_CODES` encodes.

Every positive regression test was proven to fail without the fix by stashing `src/` and re-running;
the negatives pin the shapes that must stay silent (a legitimately absent id, a `nullFlavor`-only
`<id>` as a complete statement, a single-arm consumable, a clean document) so the fix cannot become
noisy. All fixtures are synthetic, with obviously-synthetic identifier values.
