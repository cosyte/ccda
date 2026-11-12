---
"@cosyte/ccda": patch
---

Export the hardened XML reader `parseCcda` stands on, and a writer for it, for any XML format.

- `parseXml(text, options?)` reads any XML into an `@xmldom/xmldom` `Document` with every refusal of `parseCcda`'s substrate: a DTD or entity declaration anywhere (`XXE_OR_DTD_PRESENT`), so no external entity is fetched and no entity is expanded; custom entity references over the cap (`ENTITY_EXPANSION_LIMIT`); a text over the size cap; elements nested too deep or too many; and text that is not well-formed or holds a character XML 1.0 forbids. Each throws the same `CcdaParseError` code `parseCcda` throws for the same text. The limits are options (`options.limits`, the same `CcdaParseLimits` `parseCcda` takes), and `options.onWarning` receives `ENCODING_BOM_STRIPPED`. It raises no `UNKNOWN_NAMESPACE_PREFIX` and does not check the root element. A limit of `NaN` throws a `TypeError`, since it would turn its cap off; `Infinity` lifts a cap, as it does for `parseCcda`.
- `serializeXml(node)` writes a document (with an XML declaration first, unless it carries one) or an element. In text and attribute values it writes a carriage return, NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR as character references, so a parse keeps them. It throws a `TypeError` rather than write a tree `parseXml` would not read back to the same tree: a DOCTYPE; `<!DOCTYPE` or `<!ENTITY` inside a comment, CDATA section or processing instruction; a carriage return, NEL, LINE SEPARATOR or PARAGRAPH SEPARATOR in one of those; an XML declaration that is not a version, an optional encoding and an optional standalone; a prefixed name with no namespace; a character XML 1.0 forbids; a name that is not an XML name; a comment holding `--`; a CDATA section holding `]]>`; a processing instruction holding `?>`; or a document with no root element. No message names anything the tree holds. The writer does not apply the reader's limits.
- A new page, "Parse and write any XML safely", documents both.

Nothing about reading or writing C-CDA changes, and no caller needs to change anything. `parseSecureXml` stays exported as it was.
