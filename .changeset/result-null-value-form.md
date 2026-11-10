---
"@cosyte/ccda": patch
---

`buildCcda` and `editCcda` now treat a `null` result value form as absent, the same as a missing
one. A caller without the TypeScript types could pass `stringValue: null`; the builder counted that
as the one value form and emitted an empty `ST` value under a narrative line with nothing after the
test name, with no warning. Such a result now throws the same `TypeError` as a result with no value
form, and so does one whose every form is `null`. A `null` form beside one real form is skipped: the
real form is emitted, so `{ quantity: null, stringValue: "high" }` emits `ST` "high" and
`{ stringValue: null, quantity: { value: 5, unit: "mg/dL" } }` emits the `PQ`. Two real forms still
throw, with or without a `null` third.
