---
"@cosyte/ccda": patch
---

`parseCcda` is faster and allocates less, and `editCcda` holds less memory at its peak. Every parsed
model, warning, error, edit result and serialized text is unchanged, and so is every XML security
limit.

- `parseCcda` writes a document's XML the first time `toString`, `serializeCcda` or an edit asks for
  it, from the source text it keeps, rather than on every parse. A caller that reads only the model
  no longer pays for the write. The first `toString` of a parsed document now builds the source's
  tree again to write it, so a parse followed by `toString` costs more than before; every later
  `toString` returns the kept string.
- The checks before the tree is built (a declared DTD or entity, and the entity reference cap) read
  the text in one pass instead of two, and XML's end-of-line rewrite is skipped on a text with
  nothing to rewrite.
- The subject-override reading of a section's entries is worked out once per section in a parse
  instead of once for each of the fourteen entry families, and walks each entry without copying
  its children.
- An element's text and its template roots are read in place, without the arrays built to read
  them before.
- `editCcda` releases the tree it edits before it parses the result.
