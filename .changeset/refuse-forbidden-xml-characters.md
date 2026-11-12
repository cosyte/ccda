---
"@cosyte/ccda": patch
---

`buildCcda` no longer writes a character XML 1.0 forbids, and `parseCcda` no longer reads one.

- XML 1.0 forbids the control characters U+0000 to U+001F other than tab, line feed and carriage return, an unpaired surrogate, and U+FFFE and U+FFFF. Escaping cannot carry them. `buildCcda` used to write such a character from its input as it was, so it returned a document no XML parser accepts, and its own reparse read it without a warning.
- `buildCcda` now checks every string in its input, in every field, and every string a terminology adapter's `translate` returns, before it writes anything. On the first such character it throws a `TypeError` naming the field and the code point, for example `` buildCcda: problems[0].problem.displayName holds U+0001, ... ``. The message never carries the text. It refuses rather than removes or replaces the character, because a silent change to clinical text is worse than an error.
- `parseCcda` and `editCcda` now throw `CcdaParseError` with code `NOT_WELL_FORMED_XML` for a text that holds such a character, written as it is or as a character reference (`&#1;`, `&#xFFFE;`, `&#x110000;`), where they used to read it into the document and write it back out.

What a caller may need to change:

- A build whose input held such a character used to return a document and now throws a `TypeError`. Clean the text before you build if your source can carry one.
- A parse or an edit of such a text used to succeed and now throws `NOT_WELL_FORMED_XML`, the same fatal any other text that is not XML gets. A character reference inside a comment or a CDATA section that names such a code point is refused too.
