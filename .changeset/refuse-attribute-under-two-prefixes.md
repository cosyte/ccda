---
"@cosyte/ccda": patch
---

`parseCcda` and `parseSecureXml` now refuse an element that holds one attribute name twice under two prefixes of one namespace, where they used to read it with one of the two values missing.

- Namespaces in XML 1.0 (section 6.3) makes an element not well formed when two of its attributes share a local name and their prefixes are bound to the same namespace, for example `xsi:type="CD"` beside `t:type="PQ"` with `t` also bound to the XML Schema instance namespace, on the element or above it. `@xmldom/xmldom` builds such an element with the later attribute only and reports nothing, so a C-CDA document that carried a value in the earlier attribute was read with that value missing and no warning.
- Such a document now throws `CcdaParseError` with code `NOT_WELL_FORMED_XML`, the same fatal any other text that is not XML gets, with no position and no document text in the message. The check is one comparison per element as it is built, so a parse stays linear and inside the limits it already has.
- One local name in two different namespaces, and an unprefixed attribute beside a prefixed one, are allowed by XML and read as before.

What a caller may need to change: a parse of such a document used to return it and now throws `NOT_WELL_FORMED_XML`. If a sender produces one, remove one of the two attributes, or rename it, before you parse.
