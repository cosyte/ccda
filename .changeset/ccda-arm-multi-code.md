---
"@cosyte/ccda": patch
---

Compare every `<code>` a `manufacturedProduct` arm carries, not just the first, so an arm naming two
drugs in two sibling `<code>`s can no longer hand one of them back in silence.

**One new stable warning code, `MEDICATION_PRODUCT_CODE_REPEATED` (safety-critical, so no profile can
tolerate it), and `MEDICATION_PRODUCT_ARM_CONFLICT` fires on strictly more documents than before,
never fewer. Nothing about what is read changes**, except where the conflict rule now withholds a
product it previously picked.

Arm selection read only the **first** `<code>` child of each `manufacturedMaterial` and
`manufacturedLabeledDrug`. `Material.code` and `LabeledDrug.code` are each at most one in CDA R2, so
a second `<code>` is already outside the model, but it was dropped before anything compared it: it
never reached the conflict rule and drew no warning of any kind. A `manufacturedMaterial` writing an
RxNorm code for Lisinopril and a second one for Aspirin therefore returned Lisinopril as _the_
product and discarded the other, in complete silence. That is exactly the failure
`MEDICATION_PRODUCT_ARM_CONFLICT` exists to refuse, a silent pick between two named drugs, on a shape
that rule could not see. It is the same failure as the repeated _arm_, one markup layer further in.

Every `<code>` on every arm now reaches the comparison, so that shape conflicts and no product is
returned. Applies at all three consumable call sites, with one pre-existing limit this slice does
not change: Medication Activity and Immunization Activity always, and Planned Medication Activity
only when the planned act carries no `<code>` of its own, because a direct `<code>` short-circuits
the consumable read before any arm is looked at.

**Selection was deliberately not widened with it.** "Disagreement is read across every arm, selection
is not" is the split this area is built on, and a second `<code>` is a new _candidate_ rather than a
new arm. Every candidate it adds sits earlier in document order than a later arm's `<code>`, and
selection ranks on "names a product" alone, which is completeness-blind on purpose. Admitting them
would therefore re-decide picks the document never re-decided, displacing an equally-symboled but
richer sibling coding: a bare `<code code="X"/>` over a `<code code="X" displayName="..."/>`, taking
`CODE_NARRATIVE_MISMATCH` (the only guard on the structured code contradicting the narrative) with
it; over a `<code>` carrying the `<translation>` alternates; or over an empty `<code/>` that
`MISSING_CODE_VALUE` fires on. All three are safety-critical signals, and all three would be traded
for a symbol that was already identical, since only codings that **agree** survive the conflict check.
Ranking the candidates by completeness instead would be the parser choosing between codings the
document wrote as equals. So the `CD` a caller reads is byte-identical to what it was.

**`MEDICATION_PRODUCT_CODE_REPEATED` reports the cardinality itself**, whether or not the repeated
`<code>`s agree, on the same split the repeated-arm code already makes: cardinality and agreement are
separate facts with separate codes. It is reported **per arm** rather than per `manufacturedProduct`,
because it states a fact about a particular arm and its `position` names which one, so a product with
two offending arms draws two warnings at two positions rather than one pointing at only one of them.

**It is safety-critical, unlike `MEDICATION_PRODUCT_ARM_REPEATED`, and the difference is selection.**
With two arms, the one naming a product is the one read, so the repeated-arm code never fires alone
over a lost drug. With two `<code>`s on one arm, only the arm's lead `<code>` is selected, so there is
a state where this code fires **alone** and a named drug is lost: the lead asserts a `nullFlavor` and
the sibling names an RxNorm product, so `med.drug?.code` is `undefined` over a document that names the
drug one element along. Nothing else can fire there. `MISSING_PRODUCT_CODE` cannot (a `<code>`
exists), the conflict rule cannot (an exceptional value is not a rival drug, which is what lets a
null-marked arm lose to a naming one everywhere else), and the code-system checks are quiet by design
on a `nullFlavor`-only slot. That is `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s harm with a sibling
`<code>` in place of a `<translation>`, and it is classified the same way for the same reason.
It therefore over-fires on the benign identical repeat, deliberately: splitting that shape off would
let what the codings happen to _say_ decide whether a structural deviation is named, the exact
inversion the repeated-arm code refuses one layer out, and over-firing costs a warning while
under-firing costs a drug.

**Monotonicity, the safety property of this area, is measured rather than argued**, by running the
arm-shape matrix in `test/entries.test.ts` against the previous release's `src/`. All nineteen
pre-existing rows come back **byte-identical**; only the eight new rows move. Every one of the eight
gains warnings, and every one reads exactly what the previous release read except the three the
conflict rule now withholds outright. **Exactly one row's warning set is not a superset of its old
one**, and it is the documented suppression rather than a lost signal:
`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` stands down behind `MEDICATION_PRODUCT_ARM_CONFLICT`, as
`MISSING_PRODUCT_CODE` already does, because the conflict is the stronger statement about the same
slot. Both are safety-critical, so no profile can quiet either. The invariant holds in the form that
is actually true: **no row goes from warned to silent, and no row trades a safety-critical code for a
weaker one.** "No product code stops being reported" remains a false way to state it.

Nothing is lost in any of these states: `serializeCcda` re-emits the parsed DOM, so every arm and
every `<code>` round-trips byte-for-byte.
