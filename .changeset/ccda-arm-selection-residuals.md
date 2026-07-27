---
"@cosyte/ccda": patch
---

Close the two arm-selection residuals the previous slice named and did not fix, one of which that
slice created: a `<translation>` was invisible to the conflict rule, a repeated arm was never
compared at all, and a shipped docstring justified a safety classification from a premise that had
stopped being true.

**This is a behavioural change on a published package, in both directions.** `patch` is the only
legal bump on the locked `0.0.x` ladder (ADR 0001), so the version cannot carry the signal and this
prose has to. `med.drug` / `immunization.vaccine` now returns `undefined` where it previously
returned a code, on documents whose arms disagree only through a `<translation>` or only through a
repeated arm of one kind. It also now returns a code where it previously returned `undefined`, on
documents whose arms lead with different codings but where one arm's `<translation>` names the
other's code. No warning code is added, removed or renamed, and no code moves into or out of
`SAFETY_CRITICAL_CODES`.

**1. Arm selection was blind to `<translation>`, and that blind spot is this repo's own documented
real-world idiom.** `namesAProduct` and `namesConflictingProducts` keyed on the primary `@code`, so a
`manufacturedLabeledDrug` carrying `<code nullFlavor="OTH"><translation code="1191"
codeSystem="…6.88"/></code>` named no product as far as arm selection was concerned. The
`manufacturedMaterial` arm's drug was selected, and `MEDICATION_PRODUCT_ARM_CONFLICT` never fired.
That is the same "quietly picks between two drugs" failure the previous slice closed, one level
down, and it reached it through the exact shape this package's own datatype rules single out:
`nullFlavor` beside a `<translation>` is the documented C-CDA idiom for "not codable in the bound
value set, here is an alternate coding", treated as coherent rather than contradictory, which is
precisely why the arm's whole product identity is in the translation on that shape.

Each arm is now read across its **whole coding set**, its `<code>`'s own `@code` plus each
`<translation>` alternate, and two arms conflict when **none** of the codings one offers agrees with
any the other offers. For arms carrying a single coding that reduces to the previous rule exactly:
same symbol, and not that symbol under two different `@codeSystem`s. An arm that omits `@codeSystem`
is still not a disagreement, `MISSING_CODE_SYSTEM` already covers that shape and refusing here would
swap a loud warning for a quiet one.

**The set comparison narrows the warning in one shape, and that is intended rather than incidental.**
An arm whose `<translation>` names the code the other arm leads with is agreeing with it, in the
document's own words: a `<translation>` is by definition an alternate coding of the same concept, so
a document that offers both is asserting they denote one product. A `manufacturedMaterial` leading
with an NDC and translating to the RxNorm code the `manufacturedLabeledDrug` carries used to lose its
drug to a conflict warning; it now reads the material arm and stays quiet. Nothing beyond the
document's own link is inferred. Deciding that two codings the document never connected denote one
concept is a `TerminologyAdapter`'s job, and guessing it in the parser would be the manufactured
reading this whole rule refuses.

**Selection is deliberately not translation-aware, and the split is the load-bearing part.**
Translations settle whether the arms *disagree*. They never decide which element is handed to
`checkCodeSlot`, which is still chosen on primary `@code` alone. The stated boundary of this package
is that slot checks apply to a slot's primary coding while `<translation>` alternates are preserved
but never slot-checked, so selecting an arm on the strength of a translation would either hand
`checkCodeSlot` a `nullFlavor` primary and validate nothing, or require synthesizing a coding the
document never wrote in that position. A document where neither arm's primary names a product is
therefore read exactly as it was before, translation or no translation, so `MISSING_CODE_VALUE`,
`MISSING_CODE_SYSTEM` and `UNEXPECTED_CODE_SYSTEM` keep seeing the element they always saw.

**2. Two sibling `manufacturedMaterial` arms with different codes read the first, silently.** The
previous slice compared `manufacturedMaterial` against `manufacturedLabeledDrug` and stopped there,
so one arm kind repeated slipped past the rule that exists for exactly this. The conflict check now
runs over every `manufacturedMaterial/code` and every `manufacturedLabeledDrug/code` the
`manufacturedProduct` carries. `ManufacturedProduct` models one participant, so a repeated arm is
already outside the model, and the parser's job on a contradiction it cannot rank is the same
whichever markup shape carries it: refuse, warn, preserve everything verbatim.
`MEDICATION_PRODUCT_ARM_UNEXPECTED` is unaffected, it still keys on the presence of a
`manufacturedLabeledDrug` arm, so a repeated *material* arm draws the conflict warning alone.

**3. A shipped docstring justified a safety classification from a premise the previous slice had
falsified.** `MEDICATION_PRODUCT_ARM_UNEXPECTED`'s JSDoc asserted, without condition, that the
alternate arm's code "is read, not refused" and that "every code-system and terminology check applies
to it unchanged", and then argued its exclusion from `SAFETY_CRITICAL_CODES` from exactly that: "the
drug is present and fully checked". Both sentences were true when they were written. Introducing
`MEDICATION_PRODUCT_ARM_CONFLICT` made them false in the conflict state, where no code is selected at
all, and left them standing. The same claim sat in `docs-content/troubleshooting.md`.

**The classification is unchanged and the exclusion stands; what changed is the argument for it.**
Saying so explicitly matters more than the edit: a docstring that argues a classification from a
false premise is exactly what a later reader trusts, and the honest repair is to state the argument
that actually holds rather than quietly delete the sentence that stopped holding. That argument has
two halves. Wherever this code fires **alone**, a code was selected and fully checked, so it reports
known, meaning-preserving vendor noise a profile may defensibly tolerate. Wherever a code was **not**
selected, this code is by construction **not** alone: `MEDICATION_PRODUCT_ARM_CONFLICT` is in
`SAFETY_CRITICAL_CODES`, no profile may quiet it, and the withheld product is reported whether or not
the presence warning is tolerated. Tolerating this one can therefore never buy silence about a
withheld drug. The safety outcome was never at risk; the reasoning was.

**Nothing is lost.** `serializeCcda` re-emits the parsed DOM, so a translated arm and a repeated arm
both round-trip byte-for-byte, and a caller who needs a withheld one can read it off
`doc.toString()`. Both are pinned by test. `buildCcda` continues to emit a single
`manufacturedMaterial` with no `<translation>`.

**Provenance, stated rather than invented.** No normative SHALL is cited and none is fabricated. That
`ManufacturedProduct` models its participant as a choice, one arm rather than two and not a repeated
one, is base CDA R2 structure; that a `CD`'s `<translation>` carries an alternate coding *of the same
concept* is HL7 v3 datatype semantics. Whether the C-CDA R2.1 template forbids the alternate arm, or
forbids both together, or forbids a repeated one, needs the normative Schematron this repo does not
hold. The classification rests on the harm ordering `SAFETY_CRITICAL_CODES` encodes.

Every positive regression test was proven to fail without the fix by stashing `src/` and re-running,
including the narrowing case, which fails at base because base wrongly refuses there. The negatives
pin the shapes that must stay silent (a single arm merely carrying a translation, sibling arms that
agree, an arm that translates to the same drug, neither arm's primary naming one) so the widened
comparison cannot become "no drug for anyone". All fixtures are synthetic; the NDC-shaped codings are
deliberate all-zero and all-one placeholders rather than real labeler-product-package triples.
