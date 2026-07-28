---
"@cosyte/ccda": patch
---

Code-system check a planned medication's drug, exactly as a performed one's is checked, so a planned
medication with no drug identity at all can no longer reach a consumer carrying only a
profile-quietable warning.

**Four codes become newly reachable on a `PlannedItem.code`: `MISSING_CODE_VALUE`,
`MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM`, and (with a caller-supplied `TerminologyAdapter`)
`SEMANTIC_CODE_INVALID`. Nothing about what is read changes anywhere.**

`checkCodeSlot` runs at the five wired `CodeSlot`s, and a `PlannedItem.code` was not one of them. But
the `medicationActivity` variant's `code` **is** the drug, read from the same
`consumable/manufacturedProduct` a performed Medication Activity reads: the same coded value, in the
same terminology, at the same slot. A planned drug asserting a `@code` with no `@codeSystem`, an
empty `<code/>`, or an OID outside RxNorm/NDC was read and left unremarked, where a performed one
drew a safety-critical warning for each.

**The sharpest consequence, and why this is a fix rather than a tidy.**
`MEDICATION_PRODUCT_ARM_UNEXPECTED` and `MEDICATION_PRODUCT_ARM_REPEATED` are deliberately tolerable,
and that rests on a conditional argument: wherever they fire without a `<code>` having been selected
and read normally, an **unquietable** companion fires beside them. On the shape where an arm's
`<code>` asserts neither a symbol nor a `nullFlavor`, the companion that argument names is
`MISSING_CODE_VALUE`, which could not fire here. So the argument was false at this call site and only
at this call site. A planned medication whose single arm was
`<manufacturedLabeledDrug><code/></manufacturedLabeledDrug>` had no drug identity at all and drew
`MEDICATION_PRODUCT_ARM_UNEXPECTED` alone; two empty-`<code/>` material arms drew
`MEDICATION_PRODUCT_ARM_REPEATED` alone. Neither is in `SAFETY_CRITICAL_CODES`, so a vendor profile
plus the documented filter-the-expected-noise pattern reduced both to total silence, on the section
that says what a patient is **about to be given**. Both shapes now carry `MISSING_CODE_VALUE`, which
no profile can quiet.

**Four, not five, and the fifth is named rather than glossed.** `DEPRECATED_CODE_SYSTEM` is **not**
newly reachable: the `medication` slot's binding declares no deprecated systems, so it cannot fire at
that slot on a performed medication either. An ICD-9-CM OID on a drug draws `UNEXPECTED_CODE_SYSTEM`
in both places, and a matrix row pins that rather than leaving it to be inferred.

**Scoped to the one planned variant whose `code` is a drug.** The other five carry the planned act
itself, a LOINC observation, a CPT encounter, a SNOMED act, procedure or supply. None of those is one
of the five bound `CodeSlot`s, and binding them would mean inventing a value set this package cannot
cite without the normative R2.1 artifacts, so they are deliberately left unchecked and an empty
`<code>` on them stays silent exactly as before.

**Monotone whole, for the first time in this series, and measured rather than argued.** A new 26-row
matrix (thirteen arm shapes, each parsed as a planned medication **and** as its performed twin) run
against base `src/`: all thirteen performed rows come back byte-identical, ten of the thirteen planned
rows move, and every one of them moves by **gaining** the code its performed twin was already drawing.
No row goes from warned to silent, no row trades a safety-critical code for a weaker one, and no row
stops handing back a drug, because `checkCodeSlot` only emits: it selects nothing, withholds nothing,
and never touches the `CD`. After the change, the two columns of all thirteen shapes agree exactly,
which is the acceptance bar. The pre-existing 27-row planned-arm matrix moved exactly three rows, each
purely gaining `MISSING_CODE_VALUE`, and the performed-medication matrix is untouched.
