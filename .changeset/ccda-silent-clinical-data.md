---
"@cosyte/ccda": patch
---

Close four instances of one defect class: **the parser got quieter the more broken the document
was.** Four new stable warning codes, three of them safety-critical.

**1. A `nullFlavor` asserted beside a populated value no longer passes silently
(`CONTRADICTORY_NULL_FLAVOR`), and on a dose the number is withheld.** `parsePq` read `value`, `unit`
and `nullFlavor` independently, so `<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>` parsed to
`{value: 10, unit: "mg", nullFlavor: "UNK"}` with **no warning of any kind**, and a consumer reading
`med.dose.value` got `10 mg` for a dose the document explicitly declared unknown.
`MISSING_DOSE_QUANTITY` could not fire, because the element _is_ present.

The warning is class-wide: every HL7 v3 datatype (`PQ`, `TS`, `IVL_PQ`, `IVL_TS`, `CD`, `II`, `ST`,
`ED`, `BL`) now routes its `nullFlavor` through one check, so the contradiction cannot be silent
wherever it appears. That includes the `INT` and `ST` arms of `readObservationValue`, which are parsed
inline rather than through the datatype layer and carried the identical defect on the slot that holds
lab values and assessment-scale scores: `<value xsi:type="INT" nullFlavor="UNK" value="12"/>` returned
a score of `12` with no warning. The `integer` observation value now carries `raw` (the verbatim
`@value` token) beside `value`, mirroring `PQ`, so it is resolved the same way; the `string`
observation value now carries `nullFlavor`, which it previously dropped from the model outright.

**The design tension, and how it was resolved.** A warning alone would keep the house rule (never
coerce, surface verbatim, flag) but leave the dangerous affordance intact: `dose.value` would still
hand back `10` to the many consumers who do not read `warnings` on a first integration, and of the
two readings the reassuring one is the one that can hurt a patient. So the parser also **withholds
the derived reading**: `PQ.value`, `TS.date` and an `integer` observation value's `value` are omitted,
while `raw`, `unit` and the `nullFlavor` are all preserved. Nothing the document said is lost, because `value` is not the document's bytes, it
is a `number` the parser manufactured by interpreting `raw`, and `raw` survives. This is precisely
what `MALFORMED_DATETIME` already does to `TS.date`, so it is the existing rule applied to a second
reason for distrusting an interpretation, not a new one. It reaches interval bounds too: a
`doseQuantity nullFlavor="UNK"` wrapping `<low>`/`<high>` withholds each bound's number, since the
range harm is the scalar harm by another route.

**What a naive consumer sees afterwards.** For the dose: `med.dose.value === undefined` (was `10`),
with `med.dose.raw === "10"`, `med.dose.unit === "mg"`, `med.dose.nullFlavor === "UNK"` and
`CONTRADICTORY_NULL_FLAVOR` in `doc.warnings`. A caller that reads only `.value` now reads "no dose",
which is what the document asserted. **The limit, stated rather than implied:** withholding applies
only where a verbatim copy survives beside a derived reading, which in this model is `PQ.value`,
`TS.date` and the `integer` observation value's `value`, and nothing else. On `CD`, `II`, `ST`, `ED`
and `BL` the value-bearing field **is** the
document's own text (`@code`, `@extension`, the element's content) with no second copy, so
withholding it would delete what the document said rather than decline to embellish it. Those warn
and keep the field: a contradicted `allergy.allergen.code` still returns the code, with `nullFlavor`
on the same object and the warning in `doc.warnings`. That gap is deliberate and argued, not
overlooked.

Only a _value-bearing_ assertion contradicts, which keeps the check quiet on conforming documents. A
`PQ` `@unit` with no `@value` (a dimension without a magnitude), an `II` `@root` with no `@extension`
(a namespace without a local identifier), and a `CD`'s `originalText`, `<translation>`, `displayName`
or bare `@codeSystem` (the documented C-CDA idiom for "not codable in the bound value set, here is the
source text or an alternate coding") all describe a null value rather than contradicting it, and stay
silent. **Provenance:** no normative SHALL is cited and none is invented, the CDA R2 schema declares
`nullFlavor` and the value attributes independently, so the shape is schema-valid. The rule rests on
v3 datatype semantics (`nullFlavor` is a property of `ANY` marking an _exceptional value_, one with
no proper value) and on the harm ordering `SAFETY_CRITICAL_CODES` has always encoded.

**2. A medication under `manufacturedLabeledDrug` no longer loses its drug.** The drug element was
hard-coded to `consumable/manufacturedProduct/manufacturedMaterial/code`, but CDA R2's
`ManufacturedProduct` is a **choice** and `manufacturedLabeledDrug` is equally valid. That shape
yielded `drug: undefined` with zero warnings while dose and route survived, so the record read as a
well-formed medication that simply had no drug, and `checkCodeSlot` could not catch it because there
was no code to check. Both arms are now read, at all three consumable call sites (Medication
Activity, Immunization Activity, Planned Medication Activity); the alternate arm is flagged
`MEDICATION_PRODUCT_ARM_UNEXPECTED` and the code then flows through the ordinary `checkCodeSlot` path
unchanged. Reading it beats warning-and-ignoring it: the arm carries the same `CE`, and silence was
strictly worse. That warning is deliberately **not** safety-critical, since the drug is present and
fully checked, this flags known vendor shape rather than lost clinical data, so a profile may
tolerate it. Whether the C-CDA template _forbids_ the alternate arm is a normative question this repo
cannot settle without the R2.1 Schematron, so no conformance verb is claimed. The backstop is new and
loud: a `substanceAdministration` whose consumable yields **no** product code on any arm now raises
`MISSING_PRODUCT_CODE`, which **is** safety-critical (`MISSING_DOSE_QUANTITY` loses how much of a
known drug; this loses which drug). It fires at all three sites, the planned one included, and a
planned medication reaches it only after its direct `<code>` is absent too; the other planned kinds
are left alone, since their `code` is optional and an absence there is not a lost drug. `serializeCcda` re-emits the parsed DOM verbatim, so either arm
round-trips byte-for-byte; `buildCcda` continues to emit `manufacturedMaterial`.

**3. A coded slot present but asserting no code is no longer silent (`MISSING_CODE_VALUE`).** The
mirror of `MISSING_CODE_SYSTEM`, which the previous slice scoped out: a `CD` at a wired `CodeSlot`
carrying no usable `@code` (absent, empty, or whitespace) **and** no `@nullFlavor`, e.g. a
system-only `<value codeSystem="…6.96"/>`. A system without a symbol identifies a concept no better
than a symbol without a system. The `nullFlavor` is what separates the shapes: a `nullFlavor`-only
`CD` is a _complete_ statement ("this concept is unknown") and stays silent, while one that says
nothing at all leaves a reader unable to tell an absent concept from one lost in transformation. An
absent element stays silent too. Safety-critical, for the same reason `MISSING_DOSE_QUANTITY` is: an
undeclared absence at a safety-critical slot, and effectively the lone signal,
since with no symbol there is nothing for a `TerminologyAdapter` to recognise and
`SEMANTIC_CODE_INVALID` is not a signal that can be relied on behind it.

**4. `SAFETY_CRITICAL_CODES` is now genuinely immutable.** `Object.freeze(new Set(...))` seals own
properties but leaves `Set.prototype.delete` free to mutate the internal slot, so
`SAFETY_CRITICAL_CODES.delete(code)` succeeded, and the `Object.isFrozen` assertion covering it
proved nothing about the contents of the set that guards every safety-critical code. It is now a
frozen read-only view over a `Set` reachable from nowhere else: `add` / `delete` / `clear` are not
properties of it at all, so calling one throws `TypeError`, and the freeze stops anyone bolting one
on. Every read _operation_ behaves identically (`has`, `size`, `keys`, `values`, `entries`,
`forEach`, iteration, spread). The one behavioural difference, disclosed rather than glossed: the
exported value is no longer a `Set` **instance**, so `SAFETY_CRITICAL_CODES instanceof Set` is now
`false`, `JSON.stringify(...)` is `{"size":N}` rather than `{}`, and `Object.keys(...)` lists the
view's read methods rather than being empty. The test now asserts the mutations are refused and the
guarded codes survive.

Adding warning codes is a public-surface change on the `0.0.x` ladder: a consumer switching
exhaustively on `WarningCode` will see four new members, and `PQ.value` / `TS.date` are now absent on
a contradicted value where they were previously populated. Every positive regression test was proven
to fail without the fix; the negatives pin the shapes that must stay silent so the fix cannot become
noisy. All fixtures are synthetic.
