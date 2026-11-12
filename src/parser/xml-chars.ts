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

/** A run of code points, its first and its last included. @internal */
export type CodePointRange = readonly [first: number, last: number];

/**
 * The productions of XML 1.0 (Fifth Edition) a character class is read from, as the
 * specification writes them: [2] `Char` (section 2.2), [3] `S` (section 2.3, one character of
 * it), [4] `NameStartChar` and [4a] `NameChar` (section 2.3). {@link rangesOf} reads them, so the
 * ranges they match are not transcribed by hand.
 *
 * @internal
 */
const PRODUCTIONS: Readonly<Record<string, string>> = {
  Char: "#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]",
  S: "#x20 | #x9 | #xD | #xA",
  NameStartChar:
    '":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x2FF] | [#x370-#x37D] | ' +
    "[#x37F-#x1FFF] | [#x200C-#x200D] | [#x2070-#x218F] | [#x2C00-#x2FEF] | [#x3001-#xD7FF] | " +
    "[#xF900-#xFDCF] | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]",
  NameChar: 'NameStartChar | "-" | "." | [0-9] | #xB7 | [#x0300-#x036F] | [#x203F-#x2040]',
};

/** One end of a range in a production: `#x` and hexadecimal digits, or the character itself. @internal */
function codePointOf(written: string): number {
  return written.startsWith("#x")
    ? Number.parseInt(written.slice(2), 16)
    : (written.codePointAt(0) as number);
}

/**
 * The code point ranges a production of {@link PRODUCTIONS} matches, in its order: each
 * alternative is a code point (`#xA`), a range (`[#x20-#xD7FF]`, `[A-Z]`), a quoted character
 * (`":"`, `"-"`) or the name of another production.
 *
 * @internal
 */
function rangesOf(name: string): CodePointRange[] {
  return (PRODUCTIONS[name] as string).split(" | ").flatMap((alternative): CodePointRange[] => {
    if (alternative in PRODUCTIONS) return rangesOf(alternative);
    if (alternative.startsWith("[")) {
      // The hyphen between the two ends: never the first character, which may be a hyphen itself.
      const [first, last] = alternative.slice(1, -1).split(/(?<=.)-/u) as [string, string];
      return [[codePointOf(first), codePointOf(last)]];
    }
    const point = codePointOf(alternative.startsWith('"') ? alternative.slice(1, -1) : alternative);
    return [[point, point]];
  });
}

/** Whether a code point lies in any of these ranges. @internal */
function inRanges(ranges: readonly CodePointRange[], code: number): boolean {
  return ranges.some(([first, last]) => code >= first && code <= last);
}

/**
 * The characters outside ASCII that XML 1.0 allows in a document (`Char`) but neither as white
 * space (`S`) nor in a name (`NameChar`). No part of a tag outside its attribute values may hold
 * one, nor may a processing instruction's target, the XML declaration, or the document outside its
 * root element. U+0080, NEL (U+0085), the no-break space (U+00A0), the line and paragraph
 * separators (U+2028, U+2029), the other Unicode spaces and the private use characters are among
 * them. ASCII is left out: the ASCII characters outside `S` and `NameChar` are the punctuation a
 * tag is written with and that text is full of, and none of them is white space to any reader.
 *
 * Computed once, from {@link PRODUCTIONS}: every code point at which one of the productions starts
 * or stops matching begins a run in which none of them changes, and each run whose first code point
 * is in the set is in it whole. The runs come out in order and do not overlap.
 *
 * @internal
 */
export const MARKUP_EXCLUDED_RANGES: readonly CodePointRange[] = ((): CodePointRange[] => {
  const char = rangesOf("Char");
  const space = rangesOf("S");
  const nameChar = rangesOf("NameChar");
  const starts = new Set<number>([0x80]);
  for (const [first, last] of [...char, ...space, ...nameChar]) {
    starts.add(first);
    starts.add(last + 1);
  }
  const sorted = [...starts].sort((a, b) => a - b);
  const out: CodePointRange[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const first = sorted[i] as number;
    if (
      first >= 0x80 &&
      inRanges(char, first) &&
      !inRanges(space, first) &&
      !inRanges(nameChar, first)
    ) {
      out.push([first, (sorted[i + 1] as number) - 1]);
    }
  }
  return out;
})();

/**
 * Whether a code point is one of {@link MARKUP_EXCLUDED_RANGES}. A lone surrogate is not.
 *
 * @internal
 */
export function isMarkupExcluded(code: number): boolean {
  return inRanges(MARKUP_EXCLUDED_RANGES, code);
}

/** A code point as a `u`-flag regular expression escape, `\u{80}`. @internal */
function codePointEscape(code: number): string {
  return `\\u{${code.toString(16).toUpperCase()}}`;
}

/**
 * {@link MARKUP_EXCLUDED_RANGES} as the body of a regular expression character class, for a pattern
 * with the `u` flag (`\u{80}-\u{B6}...`).
 *
 * @internal
 */
export const MARKUP_EXCLUDED_CLASS: string = MARKUP_EXCLUDED_RANGES.map(([first, last]) =>
  first === last ? codePointEscape(first) : `${codePointEscape(first)}-${codePointEscape(last)}`,
).join("");

/** One of {@link MARKUP_EXCLUDED_RANGES}. Neither global nor sticky, so it keeps no state. @internal */
const MARKUP_EXCLUDED_RE = new RegExp(`[${MARKUP_EXCLUDED_CLASS}]`, "u");

/**
 * Whether a string holds any of {@link MARKUP_EXCLUDED_RANGES}.
 *
 * @internal
 */
export function hasMarkupExcluded(text: string): boolean {
  return MARKUP_EXCLUDED_RE.test(text);
}
