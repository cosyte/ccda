---
"@cosyte/ccda": patch
---

Read a Planned Medication Activity's drug from its `consumable`, always, so two product arms naming
two different drugs can no longer go unmentioned on the Plan of Treatment.

**No new warning codes. One behaviour change on one entry variant, and one warning message narrowed.**

`plannedCodeElement` returned the planned act's direct `<code>` **before** it ever called
`consumableProductCode`, so a planned medication carrying one never had its consumable looked at.
Every warning that function raises was unreachable there, `MEDICATION_PRODUCT_ARM_CONFLICT` above
all: two `manufacturedProduct` arms naming two different drugs drew nothing at all, on the section
that says what a patient is **about to be given**. `MISSING_PRODUCT_CODE`,
`MEDICATION_PRODUCT_ARM_UNEXPECTED`, `MEDICATION_PRODUCT_ARM_REPEATED`,
`MEDICATION_PRODUCT_CODE_REPEATED` and `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` were unreachable
with it.

The root cause is semantic. CDA R2 types `SubstanceAdministration.code` as an
`ActSubstanceAdministrationCode`, the _kind of administration act_, while the substance participates
through `consumable/manufacturedProduct`. So the direct `<code>` was never a weaker drug code to fall
back on, and preferring it read an act type into the drug slot. `code` on a planned
`medicationActivity` was the drug on a document without an act `<code>` and the act type on one with
it, so a consumer could not rely on it being either; it is now always the drug, exactly as `drug` is
on a performed Medication Activity and `vaccine` is on an Immunization Activity, the other two
`consumable` call sites, both of which have always ignored the act's own `<code>`. `buildCcda` is
what hid the defect: it emits the drug in the `consumable` and no direct `<code>` for this variant,
so no round-trip fixture could produce the shape. The act `<code>` is not on the model for this
variant, as it is not for the other two call sites, and round-trips through `doc.toString()`.

**What did NOT generalize with it, stated so nobody reads more into the fix**: `checkCodeSlot` and a
`TerminologyAdapter` run at the five wired `CodeSlot`s only, and a `PlannedItem.code` was not one of
them, so `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM` and
`SEMANTIC_CODE_INVALID` could not fire on a planned medication's drug where they all fire on a
performed one's. That limit predates this change and was unchanged by it. It is closed **separately,
in this same release**, by the drug-slot change entered beside this one, which carries its own
base-measured matrix rather than being folded into this slice.

Monotonicity is measured against the previous release's `src/` rather than argued, and this slice has
**one exception**. Across a 27-row matrix, the nine "no act `<code>`" rows come back byte-identical
and the performed-medication matrix is untouched; the nine "act `<code>` present" rows are pure gain
(base is silent on all nine while reading an act type as the drug); the nine "act `<code>` +
narrative" rows move on `CODE_NARRATIVE_MISMATCH` alone, eight losing it, two of those going warned
to silent and two trading it for a tolerable code. That is a false positive removed rather than a
signal lost, and the matrix shows why: base fires it on **nine of nine** rows, the clean document
included, because an act type's `displayName` can never match a narrative naming a drug. It was a
constant, not a predicate. After, it fires on **one of nine**, exactly the row whose structured drug
contradicts the narrative, the failure it exists to catch. No row loses a product warning.

Also narrows `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s message, which opened "No
manufacturedProduct arm asserts a primary `@code`" and called the `<translation>` the _only_ place
the product was named. Both are false on an arm whose **second** `<code>` asserts a primary, which
selection never reads. Message text only, no behaviour change.
