---
"@cosyte/ccda": patch
---

`parseCcda` builds a much smaller tree, a parsed document writes its XML without building an
`@xmldom/xmldom` tree, and importing the package no longer loads `@xmldom/xmldom`. Every parsed
model, warning, error, edit result and serialized text is unchanged, and so is every XML security
limit.

- `parseCcda` reads the document with a compact reader of its own that keeps only what the model
  reads. It reads only XML it can vouch for; any other text (a malformed document, an unknown
  entity, a non-ASCII element name, a quirk `@xmldom/xmldom` reports and recovers from) is read by
  `@xmldom/xmldom` as before, so every error and every recovery is the one it was. The size, DTD,
  entity, depth and node-count limits run around both; for the compact tree the depth and
  node-count limits and the foreign-namespace sweep are worked out from counts the reader keeps as
  it reads, rather than a second walk of the tree.
- The first `toString` of a parsed document, and the re-parse in `buildCcda` and `editCcda`, write
  the XML from that compact tree, as `@xmldom/xmldom`'s serializer writes the same text; a text
  already written in the form that serializer gives it is returned as it stands.
- Deliberate change: `@xmldom/xmldom` is loaded the first time something needs it (`editCcda`,
  `buildCcda`, `parseSecureXml`, or a text the compact reader hands back, to parse or to write),
  not when the package is imported. It is loaded with `require`, which a bundler that inlines
  dependencies does not see. If you bundle `@cosyte/ccda` that way, keep `@xmldom/xmldom` installed
  beside the bundle or mark it external, as you would any dependency loaded at run time. Running
  from `node_modules` needs no change.
- `children()` and `childElements()` make their arrays at their final size, and the search for a
  narrative or product element, and for an entry's clinical act, allocate less on each call.
