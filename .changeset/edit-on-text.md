---
"@cosyte/ccda": patch
---

`editCcda` makes its edit on the source's XML text instead of on an `@xmldom/xmldom` DOM of the
whole document, so an edit holds far less memory. The edited XML, the returned document, its
warnings and every error are unchanged, and no caller needs to change anything.

- When the source's XML is in the form our writer gives it, which is nearly always, the edit reads
  that text with the compact reader for its structure, writes each new section and header element
  with the same serializer as before, and splices them into the text where the elements they
  replace stand. The rest of the text is copied as it is.
- Any other text is edited on a DOM, as before.
