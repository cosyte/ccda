/**
 * The characters XML 1.0 allows in a document, and the ones it forbids.
 *
 * XML 1.0 (Fifth Edition) section 2.2, production [2]:
 *
 * ```
 * Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 * ```
 *
 * Every character of a well-formed document matches `Char`, written raw or as a character
 * reference (section 4.1, "Well-formedness constraint: Legal Character"). So the C0 control
 * characters other than tab, line feed and carriage return, the surrogate block U+D800 to U+DFFF,
 * and U+FFFE and U+FFFF never appear in one. A JavaScript string can hold all of them (a surrogate
 * only unpaired: a pair is one character above U+FFFF, which XML allows), so a writer that copies
 * a caller's string into a document must check it, and a reader must refuse a text that holds one.
 *
 * @packageDocumentation
 */

/**
 * One character XML 1.0 forbids. With the `u` flag a surrogate pair is one character, so the
 * surrogate range here matches an unpaired surrogate only.
 *
 * @internal
 */
const FORBIDDEN_CHAR_RE = /[\0-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF\uFFFE\uFFFF]/u;

/**
 * Whether a code point is an XML 1.0 `Char`.
 *
 * @internal
 */
export function isXmlChar(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0d ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/**
 * The code point of the first character in `value` that XML 1.0 forbids, or `undefined` when it
 * holds none.
 *
 * @internal
 */
export function firstForbiddenCodePoint(value: string): number | undefined {
  const match = FORBIDDEN_CHAR_RE.exec(value);
  return match === null ? undefined : match[0].charCodeAt(0);
}

/**
 * A code point written as Unicode writes it: `U+` and at least four upper-case hexadecimal digits
 * (`U+0001`, `U+FFFE`).
 *
 * @internal
 */
export function codePointLabel(code: number): string {
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Whether a string holds a character outside ASCII that XML 1.0 allows in a document (`Char`,
 * production [2]) but neither as white space (`S`, [3]) nor in a name (`NameChar`, [4a]). No part
 * of a tag outside its attribute values may hold one, nor may a processing instruction's target,
 * the XML declaration, or the document outside its root element. U+0080, NEL (U+0085), the
 * no-break space (U+00A0), the line and paragraph separators (U+2028, U+2029), the other Unicode
 * spaces and the private use characters are among them. ASCII is left out: the ASCII characters
 * outside `S` and `NameChar` are the punctuation a tag is written with and that text is full of,
 * and none of them is white space to any reader.
 *
 * The class is not picked by hand. It is what `test/markup-set.test.ts` derives from the four
 * productions as the specification writes them (`Char` without `NameChar`, above U+007F, where
 * `S` holds nothing), and that test checks this function against every code point. The gate scan
 * of `./secure-xml.ts` holds the same class, checked the same way. The pattern is written in the
 * function, not as a module constant, so a test that calls it is traced to it.
 *
 * @internal
 */
export function hasMarkupExcluded(text: string): boolean {
  return /[\u0080-\u00B6\u00B8-\u00BF\u00D7\u00F7\u037E\u2000-\u200B\u200E-\u203E\u2041-\u206F\u2190-\u2BFF\u2FF0-\u3000\uE000-\uF8FF\uFDD0-\uFDEF\u{F0000}-\u{10FFFF}]/u.test(
    text,
  );
}

/**
 * Whether a code point is one {@link hasMarkupExcluded} finds. A lone surrogate is not.
 *
 * @internal
 */
export function isMarkupExcluded(code: number): boolean {
  return hasMarkupExcluded(String.fromCodePoint(code));
}
