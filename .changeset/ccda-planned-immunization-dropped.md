---
"@cosyte/ccda": patch
---

Clinical safety: a planned immunization is no longer dropped from the model in silence.

A Plan of Treatment entry carrying the Planned Immunization Activity template (`…22.4.120`) matched
no template this parser recognized, so `getPlannedItems()` returned no item for it at all and raised
no warning. Reading that list to answer "what is this patient scheduled to receive" gave a clean,
warning-free answer with a scheduled vaccination missing from it: no `undefined` to test for, no code
to filter on, and a document that round-trips byte-for-byte, which is exactly why nothing caught it.
Nothing was corrupted; a fact was silently absent. It comes back as `kind: "immunizationActivity"`
now, one of seven planned-entry templates rather than six.

SUPPORT, NOT WARN, AND THE REASON IS THE SHAPE. C-CDA gives this template the same structure as a
Planned Medication Activity: a `substanceAdministration` in a planned mood whose `code` is base CDA
R2's `[0..1]` `ActSubstanceAdministrationCode` (the kind of administration act, and R2.1 constrains
`code` on neither template), with the substance participating through `consumable/manufacturedProduct`
`[1..1]` carrying Immunization Medication Information (`…22.4.54`). That is the path `plannedCodeElement` already reads, so reporting the drop
would have described a gap that took fewer lines to close. Its `code` is therefore the vaccine from
the consumable, never the act's own `<code>`, and every product warning applies to it,
`MEDICATION_PRODUCT_ARM_CONFLICT` included.

THE `vaccine` BINDING, NOT THE `medication` ONE, AND THE TWO ARE NOT INTERCHANGEABLE.
`MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM` and (with a
`TerminologyAdapter`) `SEMANTIC_CODE_INVALID` fire on a planned vaccine code for code with its
performed Immunization Activity twin. `vaccine` expects CVX alone where `medication` expects RxNorm
or NDC, so an NDC-coded planned vaccine draws `UNEXPECTED_CODE_SYSTEM` and an NDC-coded planned drug
does not. Parity is with each variant's own performed twin, which is the only binding either can
cite; matching the two planned variants to each other would mean inventing one.

SEVEN IS WHAT IT RETURNS, ELEVEN IS WHAT THE SECTION ADMITS, AND THE DOCS CONFLATED THEM. The four
templates a Plan of Treatment section may carry that are not returned are Instruction (`…22.4.20`),
Handoff Communication Participants (`…22.4.141`), Nutrition Recommendation (`…22.4.130`) and Goal
Observation (`…22.4.121`). Goal Observation is the load-bearing one: it is `moodCode="GOL"`, which
this parser classifies as neither performed nor planned, so returning it would contradict the
package's own mood model. Whether the other three should be reported as dropped is left open rather
than quietly decided.

ORDER IS LOAD-BEARING AND THE NEW TEMPLATE IS APPENDED, NOT INSERTED. Extraction takes the first
matching template and stops, so an act stacking `…22.4.42` and `…22.4.120` still reads as a
`medicationActivity`, exactly as it did before `…22.4.120` was recognized at all. Both variants read
the same consumable so the returned `CD` is identical either way; the order decides the reported
`kind` and with it the binding, and inserting it earlier would have taken a CVX-coded stacked act
from `UNEXPECTED_CODE_SYSTEM` to silent. Nothing in such a document ranks the two templates, so the
tie is broken by not moving. A test pins it, and that test passes against the previous behaviour,
which is what makes it a measured no-op rather than an assertion.

MEASURED, NOT ARGUED, AND THIS CHANGE DOES NOT GET THE PREVIOUS ONE'S FREE PASS. Wiring a slot check
was monotone by construction because `checkCodeSlot` only emits. This changes what is extracted, so
it could move rows in both directions and was budgeted as if it would. A 26-row matrix, thirteen
product shapes each parsed as a Planned Immunization Activity and as its performed twin, run against
the previous `src/`: all thirteen performed rows come back byte-identical, and all thirteen planned
rows move from the same prior reading, no item and no warning. No row loses a warning because no row
had one, and no row stops handing back a product because none handed one back. After the change the
two columns of all thirteen shapes agree exactly, which is the acceptance bar. Every pre-existing
matrix snapshot in the suite still passes unchanged.

WHAT THIS STILL DOES NOT REACH: a planned entry that is nested rather than a direct `<entry>` act.
`getPlannedItems()` reads an `<entry>`'s own act and no deeper, so a Planned Immunization Activity
inside a Planned Intervention Act (`…22.4.146`, which R2.1 lets contain one) is still returned as
nothing, with nothing said. That is a standing limitation of the accessor for all seven kinds rather
than something this change introduced, and it is written down so nobody reads "a planned immunization
now comes back" as covering the nested shape. A Goal Observation is not a second such container: its
`plannedComponent` entryRelationship targets Entry Reference, so it references a planned entry rather
than nesting one.

A Planned Immunization Activity sitting as a direct entry of another recognized section now draws
`SECTION_PLACEMENT_SUSPECT` (tolerable by a profile), joining the six planned roots already mapped to
the Plan of Treatment. That map can only ever make the code fire more.

`buildCcda` EMITS THE VARIANT TOO, deliberately: until it could emit the shape, no round-trip fixture
could exercise it, and an un-emittable shape is precisely what hid the defect the previous slice
fixed. Two details are the template's rather than house style. Its `templateId` is root-only
(`…22.4.120` is unversioned, where the six `…22.4.39`-`…22.4.44` templates carry the R2.1
`2014-06-09` stamp), and `effectiveTime` is required on `BuildCcdaPlannedImmunization`, because the
template makes it `[1..1]`. That is **not** unique to it: Planned Medication Activity (`…22.4.42`)
SHALL carry exactly one too, and it is the other five that are `[0..1]`. `BuildCcdaPlannedOrder` still
types the field optional, so `buildCcda` can emit a Planned Medication Activity short that element;
that gap predates this change and is not closed here, because requiring the field is a breaking change
to a published input type. New exported type: `BuildCcdaPlannedImmunization`. `PlannedItemKind` gains
`"immunizationActivity"`.

TWO DOCUMENTATION DEFECTS PICKED UP IN THE SAME PASS, both pre-existing and neither a behaviour
change.

First, the enumeration of unquietable companions behind the tolerable product-arm codes listed three
and there are four. `MEDICATION_PRODUCT_ARM_UNEXPECTED` and `MEDICATION_PRODUCT_ARM_REPEATED` are
tolerable only because every state in which no product identity comes back carries a companion no
profile can quiet. The published list named `MEDICATION_PRODUCT_ARM_CONFLICT`,
`MISSING_PRODUCT_CODE` and `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` and omitted
`MISSING_CODE_VALUE`, the companion on the shape where an element is selected and asserts neither a
symbol nor a `nullFlavor`. It covered the states where selection failed rather than every state where
identity is absent. All four are safety-critical, so no classification moves. Corrected in the README,
the troubleshooting guide and both warning docblocks, and
`MEDICATION_PRODUCT_ARM_UNEXPECTED`'s warning message now names the third companion too.

Second, the five unchecked planned kinds were justified more strongly than the facts support. The
stated reason was that binding them would mean inventing a value set this package cannot cite. That
is true of the system checks only: `MISSING_CODE_VALUE` and `MISSING_CODE_SYSTEM` are raised before
any binding is read, so both could be raised on an act-coded planned `<code>` without citing a value
set. Leaving those five unchecked is a choice, and the documentation now says so. The behaviour is
unchanged; widening it is a separate decision.

PROVENANCE, stated rather than assumed, because one claim in this change was published wrong before
it was checked. Template identity, cardinality and version stamp for `…22.4.120` and `…22.4.42` are
taken from the HL7 `CDA-ccda` StructureDefinitions and C-CDA Online, cross-checked against each other
rather than read once: `…22.4.120` root-only with no `@extension`, `statusCode` fixed `active`,
`effectiveTime` `[1..1]`, `consumable` `[1..1]` carrying `…22.4.54`; `…22.4.42` `effectiveTime`
`[1..1]` (CONF:1098-30468). The eleven-template Plan of Treatment Section catalog is from the same
source. `SubstanceAdministration.code`'s `[0..1]` and its `ActSubstanceAdministrationCode` domain are
base CDA R2, not C-CDA. CVX 140 and 141 and their display names are the CDC IIS code set, already
verified in this repo. No conformance verb is claimed anywhere this change could not cite one, and
where the repo does not hold the normative R2.1 Schematron it says so instead of inventing a SHALL.

PHI: every fixture is synthetic. No new `recordTarget`, name, date of birth or identifier beyond the
HL7 example OID arc. No new terminology code is minted: the vaccine fixtures reuse CVX 140 and 141
with the display names already verified against the CDC IIS code set in this repo, since mislabelled
fixture codes are this area's repeat defect class.
