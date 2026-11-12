---
"@cosyte/ccda": patch
---

`parseCcda`, `parseSecureXml` and `editCcda` now refuse, with `NOT_WELL_FORMED_XML`, a character outside ASCII that XML 1.0 allows in a document but neither as white space nor in a name, wherever XML 1.0 allows only those.

- The new refusals. Such a character between the parts of a start tag, in an element or attribute name, in an end tag, in a processing instruction's target, in the XML declaration, or before or after the root element now throws `CcdaParseError` with code `NOT_WELL_FORMED_XML`, as libxml2 refuses it. The characters are U+0080 to U+00BF but U+00B7, U+00D7, U+00F7, U+037E, U+2000 to U+200B, U+200E to U+203E, U+2041 to U+206F, U+2190 to U+2BFF, U+2FF0 to U+3000, U+E000 to U+F8FF, U+FDD0 to U+FDEF and U+F0000 to U+10FFFF, read from XML 1.0's productions for a character, white space and a name character. They include U+0080, the no-break space (U+00A0), the other Unicode spaces and the private use characters. Before, the DOM library under the parser read U+0080 inside a tag as white space, and read a tag holding most of the others as plain text, `<` and all, with no warning, so an element could gain a wrong attribute split or become narrative text.
- Text, attribute values, comments, CDATA sections and processing instruction data keep these characters as they were written, as before.

What a caller may need to change:

- A text that uses one of these characters as white space inside a tag, or holds one outside the root, used to parse and now throws `NOT_WELL_FORMED_XML`. Replace the character with a space inside the tag, or remove it outside the root, before you parse.
