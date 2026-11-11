---
"@cosyte/ccda": patch
---

`editCcda` holds less memory again on the small documents a feed edits all day. The edited XML, the
returned document, its warnings and every error are unchanged, and no caller needs to change
anything.

- On a source whose XML is in the form our writer gives it, the edit now reads only the elements it
  looks at (the header, the body's sections and every `ID`), not a tree of the whole document, and
  builds the new section and header elements without `@xmldom/xmldom`. It writes them as the same
  serializer wrote them before, so the bytes are the same. A parse records whether its document's
  XML is in that form, so an edit of a parsed document does not read the XML whole to find out.
- An edit reports whether it was made on the text or fell back to a DOM on the `cosyte:ccda:edit`
  channel of `node:diagnostics_channel`, as `{ path: "text" }` or `{ path: "dom" }`, only while
  something subscribes. Our benchmarks read it.
