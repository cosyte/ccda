---
"@cosyte/ccda": patch
---

Four values the parser dropped are now kept or reported.

- A `REAL` observation value (`<value xsi:type="REAL" value="7.25"/>`) is a new `real` arm of `ObservationValue`, `{ kind: "real", value, raw, nullFlavor }`, shaped like `integer`. It used to be `{ kind: "unsupported", xsiType: "REAL" }` with `RESULT_VALUE_TYPE_UNHANDLED`, and the number was in no field. A caller with an exhaustive `switch` on `kind` adds a `"real"` case; one that read `REAL` values out of `doc.toString()` can read `value` instead.
- A section entry whose statement carries no `templateId` now raises `MISSING_TEMPLATE_ID` on that statement, in every section. Entries are recognized by `templateId` alone, so such an entry reaches no model field; before this nothing was said.
- A Goal Observation that is a section's direct entry, in a Goals section or any other, now raises `PLAN_ENTRY_NOT_MODELED`. Goals are still not modeled.
- A procedure's device participants are kept on a new optional `devices` field of `Procedure`: each one's `ids` (the UDI on a Product Instance) and its device `code`. A Procedure Activity Procedure in a Medical Equipment section, where the C-CDA R2.1 guide names it (CONF:1098-31885), no longer raises `SECTION_PLACEMENT_SUSPECT`.

The `RESULT_VALUE_TYPE_UNHANDLED` message no longer says the raw value is preserved: it now says the type name and any text content are kept, and content in the value's attributes or child elements is not in the model. A caller that matches on that message text updates it; matching on the code is unchanged. A document with an entry that has no `templateId`, or with a Goal Observation entry, now carries one more warning, so a parse with `strict: true` throws on it where it did not before; a `REAL` value and an implant procedure in Medical Equipment each carry one fewer.
