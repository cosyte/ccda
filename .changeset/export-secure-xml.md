---
"@cosyte/ccda": patch
---

Export the hardened XML reader `parseCcda` stands on, and a writer for it, for any XML format.

- `parseXml(text, options?)` reads any XML into an `@xmldom/xmldom` `Document` with every refusal of `parseCcda`'s substrate: a DTD or entity declaration anywhere (`XXE_OR_DTD_PRESENT`), so no external entity is fetched and no entity is expanded; custom entity references over the cap (`ENTITY_EXPANSION_LIMIT`); a text over the size cap; elements nested too deep or too many; and text that is not well-formed or holds a character XML 1.0 forbids. Each throws the same `CcdaParseError` code `parseCcda` throws for the same text. The limits are options (`options.limits`, the same `CcdaParseLimits` `parseCcda` takes), and `options.onWarning` receives `ENCODING_BOM_STRIPPED`. It raises no `UNKNOWN_NAMESPACE_PREFIX` and does not check the root element.
- `serializeXml(node)` writes a document (with an XML declaration first, unless it carries one) or an element, keeps a carriage return in text as `&#13;`, and throws a `TypeError` rather than write a tree `parseXml` would not read back: a DOCTYPE, a character XML 1.0 forbids, a name that is not an XML name, a comment holding `--`, a CDATA section holding `]]>`, a processing instruction holding `?>`, or a document with no root element. No message names anything the tree holds.
- A new page, "Parse and write any XML safely", documents both.

Nothing about reading or writing C-CDA changes, and no caller needs to change anything. `parseSecureXml` stays exported as it was.
