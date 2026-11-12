/**
 * End-of-line handling, as XML 1.0 defines it (section 2.11): a carriage return followed by a line
 * feed, and a carriage return on its own, each become one line feed, and nothing else is rewritten.
 *
 * NEL (U+0085), LINE SEPARATOR (U+2028) and PARAGRAPH SEPARATOR (U+2029) are line breaks only in
 * XML 1.1. In XML 1.0 they are ordinary characters, legal in text, attribute values, comments,
 * CDATA sections and processing instructions, so a reader must hand them to the caller as they
 * were written. Each is checked here in each of those five places, through `parseSecureXml`
 * (`@xmldom/xmldom`'s tree) and through `parseCcda` (the compact reader's tree, or `@xmldom/xmldom`'s
 * for a text the compact reader hands back), alone and beside a carriage return that is rewritten.
 * XML 1.0 does not read them as white space either, so one inside a tag or outside the root makes
 * the text not well-formed, and both readers refuse it. libxml2, through `xmllint-wasm`, is the
 * second opinion on what XML 1.0 makes of each text.
 */

import type { CharacterData, Element } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { validateXML } from "xmllint-wasm";

import {
  CcdaDocument,
  CcdaParseError,
  editCcda,
  parseCcda,
  parseSecureXml,
  resolveLimits,
  type CcdaDocumentInit,
} from "../src/index.js";
import { breakInMarkup, parseSecureDom, parseSecureEditable } from "../src/parser/secure-xml.js";

/** The three characters XML 1.1 reads as line breaks and XML 1.0 does not. */
const KEPT: readonly (readonly [string, string])[] = [
  ["NEL (U+0085)", "\u0085"],
  ["LINE SEPARATOR (U+2028)", "\u2028"],
  ["PARAGRAPH SEPARATOR (U+2029)", "\u2029"],
];

/** Every code unit of a string as `U+XXXX`, so a failure shows which character changed. */
const units = (value: string | null | undefined): string =>
  value === null || value === undefined
    ? String(value)
    : Array.from(value, (ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}`).join(
        " ",
      );

const ROOT = '<ClinicalDocument xmlns="urn:hl7-org:v3">';

/** A document holding `ch` once in each of the five places, `x` before it and `y` after. */
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

/** The five places of {@link everyPlace}, each as {@link units} gives it. */
interface Places {
  readonly text: string;
  readonly attribute: string;
  readonly comment: string;
  readonly cdata: string;
  readonly instruction: string;
}

/** What a DOM reader made of the five places in {@link everyPlace}. */
function placesOf(root: Element | null): Places {
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

describe.each(KEPT)("%s", (_name, ch) => {
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

  it("is kept by parseSecureXml beside a carriage return, which is still rewritten", () => {
    const doc = parseSecureXml(everyPlace(`\r${ch}`), resolveLimits(), () => {});
    const withLineFeed = units(`x\n${ch}y`);
    expect(placesOf(doc.documentElement)).toEqual({
      text: withLineFeed,
      // XML 1.0 section 3.3.3: a line feed in an attribute value is normalized to a space.
      attribute: units(`x ${ch}y`),
      comment: withLineFeed,
      cdata: withLineFeed,
      instruction: withLineFeed,
    });
  });

  it("is kept by parseCcda in the title and the identifier it reads", () => {
    const header = parseCcda(everyPlace(ch)).header;
    expect(units(header.title)).toBe(expected);
    expect(units(header.documentId?.extension)).toBe(expected);
  });

  it("is kept by parseCcda in every place when it writes the document back out", () => {
    const written = parseCcda(everyPlace(ch)).toString();
    const doc = parseSecureXml(written, resolveLimits(), () => {});
    expect(placesOf(doc.documentElement)).toEqual(everywhere);
  });

  it("is kept by parseCcda beside a carriage return, which is still rewritten", () => {
    const parsed = parseCcda(everyPlace(`\r\n${ch}`));
    expect(units(parsed.header.title)).toBe(units(`x\n${ch}y`));
    expect(units(parsed.header.documentId?.extension)).toBe(units(`x ${ch}y`));
    const doc = parseSecureXml(parsed.toString(), resolveLimits(), () => {});
    expect(placesOf(doc.documentElement).comment).toBe(units(`x\n${ch}y`));
  });

  it("is kept by editCcda in the text it writes", () => {
    const edited = editCcda(parseCcda(everyPlace(ch)), { revision: false });
    expect(units(edited.header.title)).toBe(expected);
    const doc = parseSecureXml(edited.toString(), resolveLimits(), () => {});
    expect(placesOf(doc.documentElement)).toEqual(everywhere);
  });

  it("is in a text libxml2 reads as well-formed XML 1.0", async () => {
    expect(await wellFormed(everyPlace(ch))).toBe(true);
  });
});

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

describe.each(KEPT)("where XML 1.0 allows no %s", (_name, ch) => {
  const doc = (inner: string, before = "", after = ""): string =>
    `${before}${ROOT}${inner}</ClinicalDocument>${after}`;

  it.each([
    ["between an element name and an attribute", doc(`<id${ch}root="1"/>`)],
    ["between two attributes", doc(`<id root="1"${ch}extension="2"/>`)],
    ["before the end of an empty element", doc(`<id root="1"${ch}/>`)],
    ["before the end of a start tag", doc(`<title${ch}>x</title>`)],
    ["around the equals sign", doc(`<id root${ch}="1"/>`)],
    ["in an element name", doc(`<ti${ch}tle>x</ti${ch}tle>`)],
    ["in an end tag", doc(`<title>x</title${ch}>`)],
    ["in the root's end tag", `${ROOT}<title>x</title></ClinicalDocument${ch}>`],
    ["after a single-quoted attribute", doc(`<id root='1'${ch}extension='2'/>`)],
    ["after an attribute value holding a >", doc(`<id root="a>b"${ch}extension="2"/>`)],
    ["in a processing instruction's target", doc(`<?syn${ch}thetic x?>`)],
    ["right after a processing instruction's opening", doc(`<?${ch}synthetic x?>`)],
    ["in the XML declaration", doc("", `<?xml version="1.0"${ch}encoding="UTF-8"?>`)],
    ["before the root", doc("", ch)],
    ["after the root", doc("", "", ch)],
    ["between nodes after the root", doc("", "", `<!--c-->${ch}<?synthetic x?>`)],
    ["after a comment that never closes", doc(`<title>x${ch}</title><!--`)],
    ["after a CDATA section that never closes", doc(`<![CDATA[x${ch}`)],
    ["after a processing instruction that never closes", doc(`<?synthetic x${ch}`)],
    ["after a tag that never closes", `${ROOT}<title>x${ch}</title><id root="1"`],
    ["right after the < of a tag", doc(`<${ch}id root="1"/>`)],
    ["right after an empty root element", `<ClinicalDocument xmlns="urn:hl7-org:v3"/>${ch}`],
    ["right after a comment before the root", doc("", `<!--c-->${ch}`)],
    ["right before the root", doc("", `<?synthetic x?>${ch}`)],
    ["beside a markup declaration", doc(`<title>x${ch}y</title><!synthetic>`)],
  ])("refuses it %s, as libxml2 does", async (_label, xml) => {
    expect(await wellFormed(xml)).toBe(false);
    expect(outcomeOf(xml)).toBe("NOT_WELL_FORMED_XML");
  });

  it.each([
    ["in text after an empty element", doc(`<id root="1"/>x${ch}y`)],
    ["in text after an element's end", doc(`<title>a</title>x${ch}y`)],
    ["in text after a comment that holds a <", doc(`<!--<id-->x${ch}y`)],
    ["in an attribute value in single quotes", doc(`<id root='1' extension='x${ch}y'/>`)],
    ["in an attribute value holding the other quote", doc(`<id root='"' extension="x${ch}'y"/>`)],
    ["in a comment before the root", doc("", `<!--x${ch}y-->`)],
    ["in a comment after the root", doc("", "", `<!--x${ch}y-->`)],
    ["in a comment that holds a ]]>", doc("", "", `<!--]]>x${ch}y-->`)],
    ["in a CDATA section that holds a <!--", doc(`<title><![CDATA[<!--x${ch}y]]></title>`)],
    ["in a processing instruction's data, before the root", doc("", `<?synthetic x${ch}y?>`)],
    ["in a processing instruction's data, after a tab", doc(`<?synthetic\tx${ch}y?>`)],
    ["in an instruction whose target starts with xml", doc(`<?xml-synthetic x${ch}y?>`)],
    ["in text after an XML declaration", doc(`<title>x${ch}y</title>`, '<?xml version="1.0"?>')],
    ["in text deep inside the root", doc(`<a><b><c/>x${ch}y</b></a>`)],
    ["in a processing instruction's data, after a line feed", doc(`<?synthetic\nx${ch}y?>`)],
    ["in a processing instruction's data, after a CR", doc(`<?synthetic\rx${ch}y?>`)],
    ["at the end of an instruction's data, before the root", doc("", `<?synthetic x${ch}?>`)],
    ["at the end of a comment, before the root", doc("", `<!--x${ch}-->`)],
    ["at the end of a CDATA section", doc(`<title><![CDATA[x${ch}]]></title>`)],
    ["in text right before a processing instruction", doc(`<title>x</title>y${ch}<?synthetic x?>`)],
    ["in text right after an instruction with no data", doc(`<?synthetic?>x${ch}y`)],
    ["in text right after a comment", doc(`<!--c-->${ch}`)],
    ["in text right after a CDATA section", doc(`<title><![CDATA[c]]>${ch}</title>`)],
    ["in text right before an end tag", doc(`<title>x${ch}</title>`)],
    ["in text right after a start tag", doc(`<title>${ch}x</title>`)],
    ["in an attribute value right before its closing quote", doc(`<id root="1${ch}"/>`)],
    ["in an attribute value right after its opening quote", doc(`<id root="${ch}1"/>`)],
  ])("reads it %s, as libxml2 does", async (_label, xml) => {
    expect(await wellFormed(xml)).toBe(true);
    expect(outcomeOf(xml)).toBe("parsed");
  });
});

// The walk on its own: `@xmldom/xmldom` refuses some of these texts for another reason, which
// would hide a wrong answer from the walk behind the same fatal.
describe.each(KEPT)("the markup walk, for %s", (_name, ch) => {
  it.each([
    ["in a tag", `<a${ch}b="1"/>`],
    ["right after a <", `<${ch}a/>`],
    ["in an end tag", `<a></a${ch}>`],
    ["before the root", `${ch}<a/>`],
    ["after the root", `<a/>${ch}`],
    ["after a root with content", `<a><b/>x</a>${ch}`],
    ["after a root that holds a CDATA section with a <", `<a><![CDATA[x<]]></a>${ch}`],
    ["after a root that holds a comment with a <", `<a><!--x<--></a>${ch}`],
    ["after a root that holds an instruction with a <", `<a><?p x<?></a>${ch}`],
    ["after a root that holds an attribute with a >", `<a b=">"></a>${ch}`],
    ["after a root that holds an attribute with a /", `<a b="/"></a>${ch}`],
    ["after a comment before the root", `<!--c-->${ch}<a/>`],
    ["after an instruction before the root", `<?p x?>${ch}<a/>`],
    ["in an instruction target", `<?p${ch}q x?><a/>`],
    ["at the end of a target with no data", `<a><?p${ch}?></a>`],
    ["as a whole target", `<a><?${ch}?></a>`],
    ["in the XML declaration", `<?xml version="1.0"${ch}?><a/>`],
    ["in an unclosed comment", `<a/><!--${ch}`],
    ["in an unclosed CDATA section", `<a><![CDATA[${ch}`],
    ["in an unclosed instruction", `<a><?p ${ch}`],
    ["in an unclosed tag", `<a>${ch}<b c="1"`],
    ["in an unclosed attribute value", `<a>${ch}<b c="1>`],
  ])("finds it %s", (_label, source) => {
    expect(breakInMarkup(source)).toBe(true);
  });

  it.each([
    ["in text", `<a>x${ch}y</a>`],
    ["in text right after a start tag", `<a>${ch}</a>`],
    ["in text after an empty element", `<a><b/>${ch}</a>`],
    ["in nested text", `<a><b><c>${ch}</c></b>${ch}</a>`],
    ["in a double-quoted attribute", `<a b="${ch}" c="x${ch}"/>`],
    ["in a single-quoted attribute", `<a b='${ch}"' c='x'/>`],
    ["in a double-quoted attribute holding a '", `<a b="'${ch}"/>`],
    ["in a comment", `<!--${ch}--><a><!--x${ch}--></a><!--${ch}-->`],
    ["in a comment right after another", `<a/><!--x--><!--${ch}-->`],
    ["in a CDATA section", `<a><![CDATA[${ch}]]></a>`],
    ["in a CDATA section right after another", `<a><![CDATA[x]]><![CDATA[${ch}]]></a>`],
    ["in instruction data after a space", `<?p ${ch}?><a/>`],
    ["in instruction data after a tab", `<?p\t${ch}?><a/>`],
    ["in instruction data after a line feed", `<?p\n${ch}?><a/>`],
    ["in instruction data after a CR", `<?p\r${ch}?><a/>`],
    ["at the end of instruction data", `<?p x${ch}?><a/>`],
    ["in instruction data right after another", `<a/><?p x?><?q ${ch}?>`],
    ["in the data of an instruction whose target starts with xml", `<?xml-p ${ch}?><a/>`],
    ["in text after the XML declaration", `<?xml version="1.0"?><a>${ch}</a>`],
    ["in text right before an instruction", `<a>${ch}<?p x?></a>`],
    ["in text right after an instruction with no data", `<a><?p?>${ch}</a>`],
    ["in text right after a comment", `<a><!--c-->${ch}</a>`],
    ["in text right after a CDATA section", `<a><![CDATA[c]]>${ch}</a>`],
    ["in text after a tag whose last character before its > is a <", `<a><b<>${ch}</b<></a>`],
    ["nowhere, in a text without markup", "x"],
  ])("allows it %s", (_label, source) => {
    expect(breakInMarkup(source)).toBe(false);
  });
});

describe("carriage returns", () => {
  it("are rewritten as XML 1.0 says: CR LF and a lone CR each become one line feed", () => {
    const doc = parseSecureXml(
      `${ROOT}<title>a\r\nb\rc\r\r\nd</title></ClinicalDocument>`,
      resolveLimits(),
      () => {},
    );
    expect(units(doc.documentElement?.textContent)).toBe(units("a\nb\nc\n\nd"));
    expect(
      units(parseCcda(`${ROOT}<title>a\r\nb\rc\r\r\nd</title></ClinicalDocument>`).header.title),
    ).toBe(units("a\nb\nc\n\nd"));
  });

  // `editCcda` hands this reader only XML the package wrote, which never holds a raw carriage
  // return (the writer escapes one in text as `&#13;`), so its rewrite is checked here directly.
  it.each(KEPT)("are rewritten by the editable read, which keeps %s beside them", (_name, ch) => {
    const xml = `${ROOT}<title>a\r\nb\r${ch}c</title></ClinicalDocument>`;
    const read = parseSecureEditable(xml, resolveLimits(), () => {});
    expect(read.text).toBe(`${ROOT}<title>a\nb\n${ch}c</title></ClinicalDocument>`);
    expect(read.tree).toBeDefined();
    const dom = parseSecureDom(xml, resolveLimits(), () => {});
    expect(units(dom.documentElement?.textContent)).toBe(units(`a\nb\n${ch}c`));
  });

  it.each(KEPT)(
    "are rewritten when an edit reads XML that holds one raw, keeping %s",
    (_name, ch) => {
      // A document the package parsed or built never writes a raw carriage return (text holds it
      // as `&#13;`), so one is handed in here as the XML a hand-constructed document retains.
      const raw = `${ROOT}<title>a${ch}b</title><!--c\r\nd${ch}e--></ClinicalDocument>`;
      const parsed = parseCcda(raw);
      // The parsed fields, less the optional ones it left unset, which the init may not name.
      const fields = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => value !== undefined),
      ) as unknown as CcdaDocumentInit;
      const handed = new CcdaDocument({ ...fields, serialized: raw });
      const edited = editCcda(handed, { revision: false }).toString();
      expect(edited).toBe(editCcda(parsed, { revision: false }).toString());
      expect(edited).toContain(`<!--c\nd${ch}e-->`);
      expect(edited).toContain(`<title>a${ch}b</title>`);
    },
  );
});
