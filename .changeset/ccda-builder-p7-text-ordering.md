---
"@cosyte/ccda": patch
---

Phase 7 (sixteenth slice) — the builder emits `<text>` in CDA R2 element-sequence order (immediately after `<code>`, before `statusCode`/`effectiveTime`/`value`) for Problem (…22.4.4), Allergy-Intolerance (…22.4.7), and Smoking Status (…22.4.78) observations. These three previously appended the narrative `<text><reference>` after the value (allergies: after every `entryRelationship`), which is XSD-invalid against the `POCD_MT000040.Observation` `xs:sequence`. Byte-order-only within each element's children; the lenient parser round-trip is unchanged, and no warning code or public API moves (CCDA-P7).
