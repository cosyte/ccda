---
"@cosyte/ccda": patch
---

`buildCcda` and `editCcda` now refuse a result whose only value form is `null`. A caller without
the TypeScript types could pass `stringValue: null`; the builder counted that as the one value form
and emitted an empty `ST` value under a narrative line with nothing after the test name, with no
warning. `null` now counts as absent, so such a result throws the same `TypeError` as a result with
no value form.
