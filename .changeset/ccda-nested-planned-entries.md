---
"@cosyte/ccda": patch
---

Clinical safety: a planned entry nested in a Planned Intervention Act is no longer dropped from the
model in silence, for any of the seven planned templates.

`getPlannedItems()` read an `<entry>`'s own act and went no deeper. C-CDA groups the interventions
planned toward a goal in a **Planned Intervention Act** (`…22.4.146`), which carries an
`entryRelationship` for each of the seven planned templates and holds the planned act **inline** in
every one of them. So a planned drug order or a scheduled vaccination hanging off an intervention
came back as no item and no warning: no `undefined` to test for, no code to filter on, and a document
that round-trips byte-for-byte, which is exactly why nothing caught it. Reading that list to answer
"what is this patient scheduled to receive" gave a clean, warning-free answer with the entry missing
from it.

Those entries are now returned, and a nested act reads exactly as the same act reads as a direct
`<entry>`: same `kind`, same `code`, same slot check, same product warnings.
`MEDICATION_PRODUCT_ARM_CONFLICT` on a planned medication whose two `manufacturedProduct` arms name
two different drugs is reachable there for the first time, and so is the `vaccine` binding's
`UNEXPECTED_CODE_SYSTEM` on a planned vaccination. If you kept a workaround that read intervention
components out of `toString()`, you can drop it.

WHAT IS STILL NOT REACHED, because "nesting is fixed" would be false.

**C-CDA nests planned acts in two further places and neither is read.** A Nutrition Recommendation
(`…22.4.130`) inline-holds six of the seven, every planned template except Planned Immunization
Activity, by the identical `entryRelationship` pattern. And an Intervention Act (`…22.4.131`), the
performed sibling, inline-holds a Planned Intervention Act. A planned entry in either still comes
back as nothing with nothing said, unchanged. Read `toString()` if your senders nest that way.

**A pointer is never followed.** The container's `[1..*]` `typeCode="RSON"` relationship holds an
Entry Reference (`…22.4.122`) whose own SHALL names a Goal Observation recorded elsewhere in the
document. It carries an `<id>` and a `nullFlavor="NP"` `<code>` and no planned template, so it is
stepped over rather than resolved; resolving it would hand back an item the container does not hold.

**The performed acts the same container also admits stay out of the result.** Matching is on the
`templateId` root, so a Medication Activity (`…22.4.16`) and a Planned Medication Activity
(`…22.4.42`), both `substanceAdministration`s, are told apart by their template rather than by a
guess at their mood. `@moodCode` is still read onto each item's `disposition`, so a planned template
carrying a performed mood is reported as what it says.

**A returned item does not say whether it was direct or nested.** The Planned Intervention Act itself
is not modelled: there is no container type and no goal linkage, so the grouping toward the goal is
available only from `toString()`. Each item keeps its own `ids`, so a caller that needs the grouping
can correlate.

**Instruction (`…22.4.20`), Handoff Communication Participants (`…22.4.141`) and Nutrition
Recommendation (`…22.4.130`) are still not planned items**, inside the container exactly as inside
the Plan of Treatment Section, and nothing is raised about them. Goal Observation (`…22.4.121`)
remains excluded on its own grounds: it is `moodCode="GOL"`, which this parser classifies as neither
performed nor planned.

DOCUMENTED BOUNDS CORRECTED, with no behaviour change. The shared `effectiveTime` field on the
planned-item builder inputs was documented as `SHOULD [0..1]`. That is the cardinality on five of the
seven templates: both `substanceAdministration` variants SHALL carry exactly one (Planned Medication
Activity `…22.4.42`, CONF:1098-30468, and Planned Immunization Activity `…22.4.120`).
`BuildCcdaPlannedImmunization` already redeclares the field as required; `BuildCcdaPlannedOrder` does
not, so `buildCcda` can still emit a Planned Medication Activity short that SHALL element. Closing
that means making a field required on a published input type, a breaking change, and is not taken
here. Separately, `CcdaDocument.getPlannedItems()` carried neither of the accessor's two bounds
(seven of the section's eleven admissible entry templates, and how deep it reads); both are on it now.

No warning code was added, renamed or reclassified, and no published type changed.

PROVENANCE. The Planned Intervention Act's `entryRelationship` to each of the seven planned templates
(CONF:1198-32705, -32707, -32709, -32711, -32713, -32715, -32729), its `[1..*]` `typeCode="RSON"`
Entry Reference and that reference's Goal Observation constraint (CONF:1198-32673, -32720, -32722),
and the Interventions Section (`…21.2.3`, LOINC `62387-6` "Interventions Provided",
CONF:1198-15378/-30864) admitting the container as a direct entry (CONF:1198-32731) are the published
C-CDA Release 2.1 conformance statements. They were cross-checked against the R2.1 StructureDefinition
rendering and against HL7's own Guide Example for the act, which shows the containment directly: a
`typeCode="REFR"` relationship carrying a full inline `<procedure>`, beside a `typeCode="RSON"` one
carrying an Entry Reference. The later C-CDA StructureDefinition publications drop two of the seven
slices, so they are **not** a substitute source for an R2.1 claim. The Plan of Treatment Section's
eleven-template catalog is from the same R2.1 source and does not include the container, which is why
the fixtures place it in an Interventions Section.

PHI: every fixture is synthetic. No new `recordTarget`, name, date of birth or identifier beyond the
HL7 example OID arc. No new terminology code is minted anywhere: the nested fixtures reuse the exact
codes and display names this package already carries (RxNorm `314076` and `1191`, CVX `140`, SNOMED
`409073007`, `73761001` and `58938008`, CPT `99213`, LOINC `58410-2`). Where a template's own `<code>`
is not read and not measured, the fixture omits the element rather than inventing a concept to fill it.
