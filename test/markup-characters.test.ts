/**
 * Characters XML 1.0 allows in a document but not between the parts of a tag.
 *
 * Inside a tag, outside its attribute values, XML 1.0 allows only white space (production [3]: space,
 * tab, line feed, carriage return), name characters (production [4a]) and the punctuation a tag is
 * written with. A character outside ASCII that is neither, such as U+0080 or a no-break space
 * (U+00A0), makes the text not well-formed there, and libxml2 refuses it. `@xmldom/xmldom` instead
 * reads U+0080 in a tag as white space, and reads a tag holding a no-break space as plain text, `<`
 * and all, so without the check an element could gain a wrong attribute split or turn into
 * narrative text without a word. Each case here goes through `parseSecureXml` and `parseCcda`, and
 * libxml2 (through `xmllint-wasm`) is the second opinion on what XML 1.0 makes of each text. The
 * same characters stay legal, and are kept, in text, attribute values, comments, CDATA sections
 * and the data of a processing instruction.
 */

import type { CharacterData, Element } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { validateXML } from "xmllint-wasm";

import {
  CcdaParseError,
  editCcda,
  parseCcda,
  parseSecureXml,
  resolveLimits,
} from "../src/index.js";

/**
 * The two characters this check was written for, then four more of the characters it covers:
 * two Unicode spaces, a symbol narrative text often holds, and a character above U+FFFF, which
 * `@xmldom/xmldom` reads as a name character and XML 1.0 does not.
 */
const CHARACTERS: readonly (readonly [string, string])[] = [
  ["U+0080", "\u0080"],
  ["NO-BREAK SPACE (U+00A0)", "\u00a0"],
  ["EM SPACE (U+2003)", "\u2003"],
  ["IDEOGRAPHIC SPACE (U+3000)", "\u3000"],
  ["MULTIPLICATION SIGN (U+00D7)", "\u00d7"],
  ["U+F0000", "\u{f0000}"],
];

/** Every code point of a string as `U+XXXX`, so a failure shows which character changed. */
const units = (value: string | null | undefined): string =>
  value === null || value === undefined
    ? String(value)
    : Array.from(value, (ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}`).join(
        " ",
      );

const ROOT = '<ClinicalDocument xmlns="urn:hl7-org:v3">';

/** A document holding `ch` once in each of the five places it is legal, `x` before it and `y` after. */
function everyPlace(ch: string): string {
  return (
    `${ROOT}<id root="2.16.840.1.113883.19.5" extension="x${ch}y"/>` +
    `<title>x${ch}y</title>` +
    `<!--x${ch}y-->` +
    `<code code="x"><originalText><![CDATA[x${ch}y]]></originalText></code>` +
    `<?synthetic x${ch}y?>` +
    `</ClinicalDocument>`
  );
}

/** What a DOM reader made of the five places in {@link everyPlace}. */
function placesOf(root: Element | null): Record<string, string> {
  if (root === null) throw new Error("no document element");
  const id = root.getElementsByTagName("id")[0];
  const title = root.getElementsByTagName("title")[0];
  const originalText = root.getElementsByTagName("originalText")[0];
  const nodes = Array.from(root.childNodes);
  const comment = nodes.find((node) => node.nodeType === 8) as CharacterData | undefined;
  const instruction = nodes.find((node) => node.nodeType === 7) as CharacterData | undefined;
  const cdata = Array.from(originalText?.childNodes ?? []).find((node) => node.nodeType === 4) as
    CharacterData | undefined;
  return {
    text: units(title?.textContent),
    attribute: units(id?.getAttribute("extension")),
    comment: units(comment?.data),
    cdata: units(cdata?.data),
    instruction: units(instruction?.data),
  };
}

/** libxml2's verdict on a text: well-formed or not. */
async function wellFormed(xml: string): Promise<boolean> {
  const result = await validateXML({
    xml: [{ fileName: "doc.xml", contents: xml }],
    normalization: "format",
  });
  return result.valid;
}

/** `parsed`, or the code of the fatal a parse threw, for `parseSecureXml` and `parseCcda` alike. */
function outcomeOf(xml: string): string {
  const outcomes = [() => parseSecureXml(xml, resolveLimits(), () => {}), () => parseCcda(xml)].map(
    (parse) => {
      try {
        parse();
        return "parsed";
      } catch (err) {
        expect(err).toBeInstanceOf(CcdaParseError);
        expect((err as CcdaParseError).message).not.toContain("synthetic");
        return (err as CcdaParseError).code;
      }
    },
  );
  expect(outcomes[1]).toBe(outcomes[0]);
  return outcomes[0] as string;
}

describe.each(CHARACTERS)("%s", (_name, ch) => {
  const expected = units(`x${ch}y`);
  const everywhere = {
    text: expected,
    attribute: expected,
    comment: expected,
    cdata: expected,
    instruction: expected,
  };

  it("is kept by parseSecureXml in text, an attribute, a comment, CDATA and an instruction", () => {
    const doc = parseSecureXml(everyPlace(ch), resolveLimits(), () => {});
    expect(placesOf(doc.documentElement)).toEqual(everywhere);
  });

  it("is kept by parseCcda in the title and the identifier, and in the XML it writes", () => {
    const parsed = parseCcda(everyPlace(ch));
    expect(units(parsed.header.title)).toBe(expected);
    expect(units(parsed.header.documentId?.extension)).toBe(expected);
    const doc = parseSecureXml(parsed.toString(), resolveLimits(), () => {});
    expect(placesOf(doc.documentElement)).toEqual(everywhere);
  });

  it("is kept by editCcda in the text it writes", () => {
    const edited = editCcda(parseCcda(everyPlace(ch)), { revision: false });
    const doc = parseSecureXml(edited.toString(), resolveLimits(), () => {});
    expect(placesOf(doc.documentElement)).toEqual(everywhere);
  });

  it("is in a text libxml2 reads as well-formed XML 1.0", async () => {
    expect(await wellFormed(everyPlace(ch))).toBe(true);
  });

  const doc = (inner: string, before = "", after = ""): string =>
    `${before}${ROOT}${inner}</ClinicalDocument>${after}`;

  it.each([
    ["between an element name and an attribute", doc(`<id${ch}root="1"/>`)],
    ["between two attributes", doc(`<id root="1"${ch}extension="2"/>`)],
    ["between two attributes in single quotes", doc(`<id root='1'${ch}extension='2'/>`)],
    ["before the end of an empty element", doc(`<id root="1"${ch}/>`)],
    ["before the end of a start tag", doc(`<title${ch}>x</title>`)],
    ["before the equals sign", doc(`<id root${ch}="1"/>`)],
    ["after the equals sign", doc(`<id root=${ch}"1"/>`)],
    ["in an element name", doc(`<ti${ch}tle>x</ti${ch}tle>`)],
    ["in an attribute name", doc(`<id ro${ch}ot="1"/>`)],
    ["right after the < of a tag", doc(`<${ch}id root="1"/>`)],
    ["in an end tag", doc(`<title>x</title${ch}>`)],
    ["in the root's end tag", `${ROOT}<title>x</title></ClinicalDocument${ch}>`],
    ["in a processing instruction's target", doc(`<?syn${ch}thetic x?>`)],
    ["in place of the space after a processing instruction's target", doc(`<?synthetic${ch}x?>`)],
    ["in the XML declaration", doc("", `<?xml version="1.0"${ch}encoding="UTF-8"?>`)],
    ["before the root", doc("", ch)],
    ["after the root", doc("", "", ch)],
  ])("refuses it %s, as libxml2 does", async (_label, xml) => {
    expect(await wellFormed(xml)).toBe(false);
    expect(outcomeOf(xml)).toBe("NOT_WELL_FORMED_XML");
  });

  it.each([
    ["in text after an empty element", doc(`<id root="1"/>x${ch}y`)],
    ["in an attribute value in single quotes", doc(`<id root='1' extension='x${ch}y'/>`)],
    ["in an attribute value holding the other quote", doc(`<id root='"' extension="x${ch}'y"/>`)],
    ["in a comment before the root", doc("", `<!--x${ch}y-->`)],
    ["in a comment after the root", doc("", "", `<!--x${ch}y-->`)],
    ["in a processing instruction's data, before the root", doc("", `<?synthetic x${ch}y?>`)],
    ["in text after an XML declaration", doc(`<title>x${ch}y</title>`, '<?xml version="1.0"?>')],
    ["in a CDATA section that holds a <", doc(`<title><![CDATA[<a${ch}b>]]></title>`)],
  ])("reads it %s, as libxml2 does", async (_label, xml) => {
    expect(await wellFormed(xml)).toBe(true);
    expect(outcomeOf(xml)).toBe("parsed");
  });
});
