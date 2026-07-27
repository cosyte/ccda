---
"@cosyte/ccda": patch
---

Report a medication product that is named only in a `<translation>`, report a repeated
`manufacturedProduct` arm, and let two translation-only arms disagree inside one terminology.

**Two new stable warning codes.** `MEDICATION_PRODUCT_ARM_CONFLICT`'s predicate widens in exactly one
shape, described below, and it moves in one direction only: it fires on strictly more documents than
before, never fewer, and no document that was refused before is accepted now. The cost of that
direction is stated rather than buried: **a document that used to yield a product code can now yield
none.** Where a third arm asserts a primary and two other arms disagree only through their
translations, the whole product is withheld behind the conflict code and `med.drug` goes from a coded
`CD` to `undefined`. That is the trade the conflict code has always made: refuse to pick when the
document contradicts itself, and say so loudly rather than answering from one arm.

`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` (safety-critical) fires when no `manufacturedProduct` arm
asserts a primary `@code` and the product is named in a `<translation>` instead, which is the
`nullFlavor="OTH"` plus `<translation>` idiom for a concept that is not codable in the bound value
set. The reading does not change: `med.drug` / `immunization.vaccine` still comes back as the
selection rule always picked it, and `drug.code` is still `undefined`, because slot checks apply to a
slot's **primary** coding and lifting a translation into the product position would hand
`checkCodeSlot` a coding the document never wrote there. What changes is that the shape used to be
entirely silent: `MISSING_PRODUCT_CODE` cannot fire, an arm did carry a `<code>`, and `checkCodeSlot`
is quiet by design on a `nullFlavor`-only slot, since a declared `nullFlavor` is a complete statement
that the concept is unknown, which here it is not. A consumer reading `med.drug?.code` saw a
medication with a dose, a route and a timing and no drug, with no warning at all, over a document
that names the drug one element down.

**Where the coding is reachable depends on which arm holds it, and the warning's message and
`position` say which.** Only one arm ever becomes `med.drug`: when that is the arm carrying the
translation, the coding is somewhere on `drug.translation` and you have to search that list rather
than read `[0]`, since a `<code>` may carry several `<translation>`s and the first can be
`nullFlavor`-marked or in a code system you did not want. When it is not (two arms, neither asserting
a primary, the translation sitting on the one that was not selected), the returned `CD` is the other
arm's and no product-naming coding is on it, so the coding is reachable only through
`doc.toString()`. On the
`nullFlavor`-marked idiom this is the lone signal, which is why no profile may quiet it; on the
variant that asserts neither a symbol nor a `nullFlavor`, `MISSING_CODE_VALUE` fires beside it and is
itself safety-critical. It stands down behind `MEDICATION_PRODUCT_ARM_CONFLICT` exactly as
`MISSING_PRODUCT_CODE` already does, and applies at all three consumable call sites.

`MEDICATION_PRODUCT_ARM_REPEATED` (tolerable by a profile) fires when one `manufacturedProduct`
carries more than one arm of the same kind. Repeated arms that disagreed were already refused;
repeated arms that agreed were reduced to one with nothing said, so a document asserting the same
product three times reported identically to one asserting it once. It is keyed to the arms rather
than to their codings, as the presence warning is, so an arm carrying no `<code>` counts. Where it
fires alone a `<code>` was selected and read exactly as a single-arm document's would have been, and
each state where that would not be enough carries an unquietable companion
(`MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE`, or
`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`).

**Where BOTH arms fall back to `<translation>`s, sharing one coding is no longer always enough to
agree.** That is the one pairing where the shared-coarser-coding hazard survives, because neither arm
asserts a primary to compare: two arms translating to a shared coarser concept plus two different
strengths agree on the coarse coding while naming two products. Such arms now also conflict when each
names a coding the other does not **and** two of those unshared codings are in the **same code system
under different symbols**. An arm
that merely offers an extra alternate the other stayed quiet about (an NDC beside the RxNorm concept
both share) is elaborating its own concept, which is what HL7 v3 says a `<translation>` does, and is
deliberately not a conflict: a shorter list is not a denial. Codings in different code systems are
never compared, because deciding whether an NDC and an RxNorm concept denote one product is
terminology work rather than parsing. Two arms that both assert a primary `@code` are still compared
on those primaries alone.

That same-terminology test is a parser's reading rather than something the document asserts, and it
deliberately over-fires: two NDC package codes can describe one drug, and an RxNorm branded drug and
its clinical equivalent are one product at two granularities, but telling those apart is the
terminology work refused just above. Over-firing costs a withheld product beside a loud
safety-critical code; under-firing costs one of two strengths handed back in silence.

On the newly-refused shapes `med.drug` is `undefined` with the conflict code beside it. Where the two
fallback arms are the only ones, it was previously the first arm's `nullFlavor` `CD` and that arm's
translations, and `med.drug?.code` was `undefined` either way. Where a third arm asserts a primary
the fallback arms disagree behind, it was previously that arm's fully coded `CD`.

Nothing is lost in any of these states: `serializeCcda` re-emits the parsed DOM, so every arm and
every `<translation>` round-trips byte-for-byte.

Also corrects a `CHANGELOG` sentence that argued `MEDICATION_PRODUCT_ARM_UNEXPECTED`'s classification
from "the drug is present and fully checked". There are states in which no product code is selected
at all, and each carries its own untolerable code; the conditional form is what holds.
