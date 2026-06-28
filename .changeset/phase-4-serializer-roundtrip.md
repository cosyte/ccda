---
"@cosyte/ccda": patch
---

Phase 4 — spec-clean serializer + round-trip + immutable copy-with. The conservative *emit* half of
the Postel's-Law contract, symmetric with `parseCcda`:

- **`serializeCcda(doc)` and `doc.toString()`** re-emit a parsed document as spec-clean C-CDA XML with
  a guaranteed UTF-8 declaration. Both return the same string. Serialization is a **fixed point**:
  `parseCcda(serializeCcda(doc))` re-serializes to the identical text, and `parse(serialize(x))` is
  canonically equal to `x` — backed by the `@cosyte/test-utils` round-trip property invariant.
- **No silent loss.** The output is snapshotted from the parsed XML DOM at parse time rather than
  reconstructed from the lossy read-model, so every element, attribute, namespace declaration
  (`xmlns` / `xmlns:xsi` / `xmlns:sdtc`), `templateId`, and even content the read-model never models
  survives the round-trip. A `nonXMLBody` base64 payload stays inert. A hand-constructed document
  (not produced by `parseCcda`) retains no source and throws from `toString()` until a builder API
  lands in a later phase.
- **`doc.withWarnings(extra)`** — the sanctioned structural-sharing copy-with: returns a new
  `CcdaDocument` with `extra` warnings appended, sharing every parsed field (header, sections,
  entries, serialized snapshot) by reference; the original is never mutated. Enforced by the
  `@cosyte/test-utils` immutability property.
