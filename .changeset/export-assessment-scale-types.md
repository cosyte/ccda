---
"@cosyte/ccda": patch
---

`BuildCcdaAssessmentScale` and `BuildCcdaAssessmentScaleItem` are now exported from the package
root. They type the `functionalStatusScales` and `mentalStatusScales` fields of `buildCcda` and each
scale's `supporting` items, but a TypeScript caller could not import them by name and had to reach
them through `NonNullable<BuildCcdaInit["mentalStatusScales"]>[number]`. What `buildCcda` emits is
unchanged.
