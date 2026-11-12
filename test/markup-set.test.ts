/**
 * The characters XML 1.0 allows in a document but not in markup, and the walk of
 * `./secure-xml.ts` that finds one in markup.
 *
 * The set is derived here from the XML 1.0 (Fifth Edition) productions as the specification writes
 * them, and `hasMarkupExcluded` (`./xml-chars.ts`) and the gate scan's pattern are checked against
 * it at every code point, so neither class is picked by hand. libxml2 (through `xmllint-wasm`) checks
 * the derivation: a character after the `a` of `<a/>` is part of the element's name when it is a
 * name character, and makes the text not well-formed when it is not. Every boundary of every range,
 * the code points either side of it, and one code point in every block of 8,192 are checked this
 * way, and the parse is checked to agree.
 */

import type { Element } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { validateXML } from "xmllint-wasm";

import { CcdaParseError, parseSecureXml, resolveLimits } from "../src/index.js";
import { gatePattern, misplacedCharacter } from "../src/parser/secure-xml.js";
import { hasMarkupExcluded, isMarkupExcluded, isXmlChar } from "../src/parser/xml-chars.js";

/** A run of code points, its first and its last included. */
type Range = readonly [number, number];

/**
 * XML 1.0 (Fifth Edition): [2] `Char` (section 2.2), [3] `S` (section 2.3, one character of it),
 * [4] `NameStartChar` and [4a] `NameChar` (section 2.3), as the specification writes them.
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

/** One end of a range in a production: `#x` and hexadecimal digits, or the character itself. */
const pointOf = (written: string): number =>
  written.startsWith("#x") ? Number.parseInt(written.slice(2), 16) : (written.codePointAt(0) ?? 0);

/** The ranges a production matches: each alternative a code point, a range, a quoted character or a production. */
function rangesOf(name: string): Range[] {
  return (PRODUCTIONS[name] ?? "").split(" | ").flatMap((alternative): Range[] => {
    if (alternative in PRODUCTIONS) return rangesOf(alternative);
    if (alternative.startsWith("[")) {
      // No range in these productions has a hyphen at either end.
      const [first = "", last = ""] = alternative.slice(1, -1).split("-");
      return [[pointOf(first), pointOf(last)]];
    }
    const point = pointOf(alternative.startsWith('"') ? alternative.slice(1, -1) : alternative);
    return [[point, point]];
  });
}

const inRanges = (ranges: readonly Range[], code: number): boolean =>
  ranges.some(([first, last]) => code >= first && code <= last);

const CHAR = rangesOf("Char");
const SPACE = rangesOf("S");
const NAME_CHAR = rangesOf("NameChar");

/** Whether XML 1.0 allows a code point above ASCII in a document but neither as white space nor in a name. */
const derived = (code: number): boolean =>
  code >= 0x80 && inRanges(CHAR, code) && !inRanges(SPACE, code) && !inRanges(NAME_CHAR, code);

/** {@link derived} as runs of code points, found by walking every code point once. */
const DERIVED: readonly Range[] = (() => {
  const out: [number, number][] = [];
  for (let code = 0x80; code <= 0x10ffff; code++) {
    if (!derived(code)) continue;
    const last = out.at(-1);
    if (last !== undefined && last[1] === code - 1) last[1] = code;
    else out.push([code, code]);
  }
  return out;
})();

const hex = (code: number): string => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

/** Every code point but the surrogates, which a string holds only in pairs or unpaired. */
const everyCodePoint = (): number[] =>
  Array.from({ length: 0x110000 }, (_, code) => code).filter(
    (code) => code < 0xd800 || code > 0xdfff,
  );

/** libxml2's verdict on a text: well-formed or not. */
async function wellFormed(xml: string): Promise<boolean> {
  const result = await validateXML({
    xml: [{ fileName: "doc.xml", contents: xml }],
    normalization: "format",
  });
  return result.valid;
}

/** Whether `parseSecureXml` reads a text. */
function parses(xml: string): boolean {
  try {
    parseSecureXml(xml, resolveLimits(), () => {});
    return true;
  } catch (err) {
    expect(err).toBeInstanceOf(CcdaParseError);
    expect((err as CcdaParseError).code).toBe("NOT_WELL_FORMED_XML");
    return false;
  }
}

describe("the characters XML 1.0 allows in a document but not in markup", () => {
  it("are, read from the productions, these runs", () => {
    expect(DERIVED.map(([first, last]) => `${hex(first)}..${hex(last)}`)).toEqual([
      "U+0080..U+00B6",
      "U+00B8..U+00BF",
      "U+00D7..U+00D7",
      "U+00F7..U+00F7",
      "U+037E..U+037E",
      "U+2000..U+200B",
      "U+200E..U+203E",
      "U+2041..U+206F",
      "U+2190..U+2BFF",
      "U+2FF0..U+3000",
      "U+E000..U+F8FF",
      "U+FDD0..U+FDEF",
      "U+F0000..U+10FFFF",
    ]);
    for (const code of [0x80, 0x85, 0xa0, 0x2028, 0x2029, 0x3000]) {
      expect(derived(code), hex(code)).toBe(true);
    }
  });

  it("are exactly the ones hasMarkupExcluded finds, at every code point", () => {
    const disagreements = everyCodePoint().filter(
      (code) =>
        hasMarkupExcluded(String.fromCodePoint(code)) !== derived(code) ||
        isMarkupExcluded(code) !== derived(code),
    );
    expect(disagreements.map(hex)).toEqual([]);
    expect(isMarkupExcluded(0xdb80)).toBe(false);
    expect(hasMarkupExcluded(`a${String.fromCodePoint(0xa0)}`)).toBe(true);
    expect(hasMarkupExcluded("a b")).toBe(false);
  });

  it("are, with the characters XML 1.0 forbids and the carriage return, what the gate scan finds", () => {
    const gate = gatePattern();
    const found = (code: number): boolean => {
      gate.lastIndex = 0;
      return gate.exec(String.fromCodePoint(code)) !== null;
    };
    const disagreements = everyCodePoint().filter(
      (code) => found(code) !== (derived(code) || !isXmlChar(code) || code === 0x0d),
    );
    // With the `i` flag, MICRO SIGN (U+00B5) in the class also matches the Greek letters that
    // fold to it: a text holding one of those runs the markup walk, which finds nothing.
    expect(disagreements.map(hex)).toEqual(["U+039C", "U+03BC"]);
    expect(found(0xd800)).toBe(true);
  });

  const boundaries = [
    ...new Set(DERIVED.flatMap(([first, last]) => [first - 1, first, last, last + 1])),
  ];
  const sample = Array.from({ length: 0x110000 / 0x2000 }, (_, block) => block * 0x2000 + 0xfff);
  const codes = [...boundaries, ...sample].filter((code) => code >= 0x80 && isXmlChar(code));

  it(
    `are the ones libxml2 refuses after a name's first letter, at ${String(codes.length)} code points`,
    { timeout: 60_000 },
    async () => {
      const disagreements: string[] = [];
      for (const code of codes) {
        const xml = `<r><a${String.fromCodePoint(code)}/></r>`;
        const libxml2 = await wellFormed(xml);
        if (libxml2 === derived(code) || parses(xml) !== libxml2) disagreements.push(hex(code));
      }
      expect(disagreements).toEqual([]);
    },
  );
});

describe.each(
  DERIVED.flatMap(([first, last]) => [first, last]).map((code) => [
    hex(code),
    String.fromCodePoint(code),
  ]),
)("the markup walk, for %s", (_name, ch) => {
  it.each([
    ["in a tag", `<a${ch}b="1"/>`],
    ["after an attribute value", `<a b="1"${ch}c="2"/>`],
    ["after a single-quoted attribute value holding a >", `<a b='>'${ch}/>`],
    ["right after a <", `<${ch}a/>`],
    ["in an end tag", `<a></a${ch}>`],
    ["before the root", `${ch}<a/>`],
    ["after the root", `<a/>${ch}`],
    ["in an instruction target", `<?p${ch}q x?><a/>`],
    ["in the XML declaration", `<?xml version="1.0"${ch}?><a/>`],
    ["in text before an unclosed tag", `<a>${ch}<b c="1"`],
    ["in an unclosed attribute value", `<a><b c="${ch}`],
  ])("finds it %s", (_label, source) => {
    expect(misplacedCharacter(source)).toBe(true);
  });

  it.each([
    ["in text", `<a>x${ch}y</a>`],
    [
      "in text, beside a tag whose names hold name characters outside ASCII",
      `<a\u00b7\u00c0 b\u0300="1">${ch}</a\u00b7\u00c0>`,
    ],
    ["in a double-quoted attribute", `<a b="${ch}" c="x${ch}'"/>`],
    ["in a single-quoted attribute", `<a b='${ch}"' c='x'/>`],
    ["in a comment", `<!--${ch}--><a><!--x${ch}--></a>`],
    ["in a CDATA section", `<a><![CDATA[<${ch}]]></a>`],
    ["in instruction data", `<?p ${ch}?><a/>`],
  ])("allows it %s", (_label, source) => {
    expect(misplacedCharacter(source)).toBe(false);
  });
});

describe("the gate's case-insensitive scan", () => {
  // With the `i` flag, MICRO SIGN (U+00B5) in the gate's class also matches the Greek letters that
  // fold to it. A text holding one runs the walk, which finds nothing, and reads as it did.
  it.each([
    ["GREEK SMALL LETTER MU (U+03BC)", "\u03bc"],
    ["GREEK CAPITAL LETTER MU (U+039C)", "\u039c"],
  ])("reads %s in a name as the name character it is", (_name, ch) => {
    const doc = parseSecureXml(
      `<r><a${ch} b${ch}="1">${ch}</a${ch}></r>`,
      resolveLimits(),
      () => {},
    );
    const element = doc.documentElement?.firstChild as Element | null;
    expect(element?.nodeName).toBe(`a${ch}`);
    expect(element?.getAttribute(`b${ch}`)).toBe("1");
    expect(element?.textContent).toBe(ch);
  });
});
