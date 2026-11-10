---
"@cosyte/ccda": patch
---

A carriage return in text now survives serializing. `serializeCcda` and `doc.toString()` write it as `&#13;`, where they wrote it raw and a parse of the output read it back as a line feed. A document whose narrative held `&#13;` changed its text on the first round trip, and `buildCcda` with a `displayName` holding a carriage return built a narrative that no longer matched it, so the built document carried a `CODE_NARRATIVE_MISMATCH` warning. Text without a carriage return serializes exactly as before.
