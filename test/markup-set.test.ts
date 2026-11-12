/**
 * The set of characters XML 1.0 allows in a document but not in markup, as `./xml-chars.ts`
 * computes it from the productions, and the walk of `./secure-xml.ts` that finds one in markup.
 *
 * libxml2 (through `xmllint-wasm`) checks the set: a character after the `a` of `<a/>` is part of
 * the element's name when it is a name character, and makes the text not well-formed when it is
 * not. Every boundary of every range, the code points either side of it, and one code point in
 * every block of 8,192 are checked this way, and the parse is checked to agree.
 */

import type { Element } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { validateXML } from "xmllint-wasm";

import { CcdaParseError, parseSecureXml, resolveLimits } from "../src/index.js";
import { misplacedCharacter } from "../src/parser/secure-xml.js";
import {
  isXmlChar,
  MARKUP_EXCLUDED_CLASS,
  MARKUP_EXCLUDED_RANGES,
} from "../src/parser/xml-chars.js";

const hex = (code: number): string => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

/** Whether a code point is in the set, read from the ranges. */
const excluded = (code: number): boolean =>
  MARKUP_EXCLUDED_RANGES.some(([first, last]) => code >= first && code <= last);

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
  it("are these ranges, in order, apart, and all outside ASCII", () => {
    expect(MARKUP_EXCLUDED_RANGES.map(([first, last]) => `${hex(first)}..${hex(last)}`)).toEqual([
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
  });

  it("are written as a character class that matches exactly them", () => {
    const re = new RegExp(`^[${MARKUP_EXCLUDED_CLASS}]$`, "u");
    for (const [first, last] of MARKUP_EXCLUDED_RANGES) {
      for (const code of [first - 1, first, last, last + 1].filter((c) => c <= 0x10ffff)) {
        expect(re.test(String.fromCodePoint(code)), hex(code)).toBe(excluded(code));
      }
    }
    expect(MARKUP_EXCLUDED_CLASS.startsWith("\\u{80}-\\u{B6}\\u{B8}-\\u{BF}\\u{D7}")).toBe(true);
  });

  it("include U+0080, the no-break space, NEL and the line and paragraph separators", () => {
    for (const code of [0x80, 0x85, 0xa0, 0x2028, 0x2029, 0x3000]) {
      expect(excluded(code), hex(code)).toBe(true);
    }
    // Name characters outside ASCII that sit between them.
    for (const code of [0xb7, 0xc0, 0x300, 0x203f, 0x2040, 0x200c, 0x200d, 0xfeff, 0xeffff]) {
      expect(excluded(code), hex(code)).toBe(false);
    }
  });

  const boundaries = [
    ...new Set(
      MARKUP_EXCLUDED_RANGES.flatMap(([first, last]) => [first - 1, first, last, last + 1]),
    ),
  ];
  const sample = Array.from({ length: 0x110000 / 0x2000 }, (_, block) => block * 0x2000 + 0xfff);
  const codes = [...boundaries, ...sample].filter((code) => code >= 0x80 && isXmlChar(code));

  it(
    `are the ones libxml2 refuses after a name's first letter, at ${String(codes.length)} code points`,
    {
      timeout: 60_000,
    },
    async () => {
      const disagreements: string[] = [];
      for (const code of codes) {
        const xml = `<a${String.fromCodePoint(code)}/>`;
        const libxml2 = await wellFormed(xml);
        if (libxml2 === excluded(code) || parses(xml) !== libxml2) disagreements.push(hex(code));
      }
      expect(disagreements).toEqual([]);
    },
  );
});

describe.each(
  MARKUP_EXCLUDED_RANGES.flatMap(([first, last]) => [first, last]).map((code) => [
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
