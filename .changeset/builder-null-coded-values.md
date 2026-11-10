---
"@cosyte/ccda": patch
---

`buildCcda` and `editCcda` now refuse a `null` or missing coded value with a `TypeError` that names
the field, where they threw a bare "Cannot read properties of null". A caller without the TypeScript
types could pass `allergies: [{ allergen: null }]`: that allergy now throws the documented "each
allergy must set either `allergen` or `noKnownAllergy: true`" error. A required code that is `null`,
missing, or not an object (a problem, a drug, a result test, a vital sign, a vaccine, a procedure, an
encounter type, an assessment scale, a past or discharge diagnosis, a planned item) throws a
`TypeError` naming its field path and never the value. An optional coded value that has a fallback
(a smoking status, a functional or mental status finding, a self-care activity or its ability, a
family member's relationship or condition) set to `null` now reads as absent, the same as leaving it
out, in both the narrative and the entry.
