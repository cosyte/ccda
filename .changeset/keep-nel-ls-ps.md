---
"@cosyte/ccda": patch
---

`parseCcda`, `parseSecureXml` and `editCcda` now read line endings as XML 1.0 does, and keep NEL (U+0085), LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR (U+2029) as they were written.

- XML 1.0 (section 2.11) rewrites only a carriage return followed by a line feed, and a carriage return on its own, each to one line feed. The parser also rewrote the three characters above, as XML 1.1 does: each became a line feed in text, comments, CDATA sections and processing instructions, and a space in an attribute value, with no warning. Narrative text holding one was changed without a word.
- Each of them is now kept in text, attribute values, comments, CDATA sections and processing instruction data, in the model and in the XML the document writes back out. CR LF and a lone CR still become one line feed.
- XML 1.0 does not read them as white space. A text that holds one between the parts of a tag, in an end tag, in a processing instruction's target or the XML declaration, or outside the root element is not well formed, and now throws `CcdaParseError` with code `NOT_WELL_FORMED_XML`, as libxml2 refuses it. Before, such a text was read as if the character were a line feed; without the rewrite, the DOM library under the parser would read such a tag as plain text.

What a caller may need to change:

- Code that relied on these characters arriving as line feeds now receives them as they were written. Replace them after the parse if you want line feeds.
- A text that uses one of them as white space inside markup or outside the root used to parse and now throws `NOT_WELL_FORMED_XML`. Replace the character with a line feed in those places before you parse.
