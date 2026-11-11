/**
 * What an edit reads of a written text (`src/edit/text-read.ts`): the elements it looks at, where
 * each stands, every `ID`, and `undefined` for a text not written as the read assumes, which the
 * edit then makes on a DOM. Every document here is synthetic.
 */

import { describe, expect, it } from "vitest";

import { readText, type TextElement } from "../src/edit/text-read.js";
import { V3_NS, XSI_NS } from "../src/parser/namespaces.js";

/** The children of `element` the read kept, by name. */
function names(element: TextElement | null): string[] {
  const out: string[] = [];
  for (let at = element?.firstChild ?? null; at !== null; at = at.nextSibling) {
    out.push(at.nodeName);
  }
  return out;
}

const SECTION =
  `<component><section ID="s1">` +
  `<templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>` +
  `<code code="11450-4"/>` +
  `<title>Problems</title>` +
  `<entry><act ID="a&amp;1"><id root="1"/></act></entry>` +
  `<component><section><code code="nested"/><text><paragraph ID="p1">x</paragraph></text></section></component>` +
  `</section></component>`;

const DOCUMENT =
  `<?xml version="1.0" encoding="UTF-8"?>\n<!-- a comment -->\n` +
  `<ClinicalDocument xmlns="${V3_NS}" xmlns:xsi="${XSI_NS}" xmlns:other="urn:example:other">` +
  `<id root="2.16.840.1.113883.19.5" extension="SYNTH-1"/>` +
  `<other:component><structuredBody/></other:component>` +
  `<recordTarget><patientRole><id ID="r1" root="1"/></patientRole></recordTarget>` +
  `<component><structuredBody>` +
  `<other:component><section/></other:component>` +
  `<?synthetic data?><![CDATA[<component>]]>` +
  SECTION +
  `</structuredBody></component></ClinicalDocument>\n<!-- after -->`;

describe("readText", () => {
  const read = readText(DOCUMENT);
  const root = read?.root as TextElement;

  it("reads the root's children, the body's components and their sections", () => {
    expect(names(root)).toEqual(["id", "other:component", "recordTarget", "component"]);
    const component = root.firstChild?.nextSibling?.nextSibling?.nextSibling as TextElement;
    const body = component.firstChild as TextElement;
    expect(names(component)).toEqual(["structuredBody"]);
    // The `other:` component is in another namespace, so it is not one the edit reads.
    expect(names(body)).toEqual(["component"]);
    const section = body.firstChild?.firstChild as TextElement;
    expect(names(section)).toEqual(["templateId", "code", "component"]);
    const nested = section.firstChild?.nextSibling?.nextSibling?.firstChild as TextElement;
    expect(names(nested)).toEqual(["code"]);
    // A child of the root in another namespace is read, and nothing in it is.
    expect(names(root.firstChild?.nextSibling as TextElement)).toEqual([]);
    expect(names(root.firstChild?.nextSibling?.nextSibling as TextElement)).toEqual([]);
  });

  it("records where each element read stands, and whether it is written empty", () => {
    const id = root.firstChild as TextElement;
    expect(DOCUMENT.slice(id.start, id.end)).toBe(
      `<id root="2.16.840.1.113883.19.5" extension="SYNTH-1"/>`,
    );
    expect(id.empty).toBe(true);
    expect(DOCUMENT.slice(root.start, root.end)).toMatch(
      /^<ClinicalDocument [^]*<\/ClinicalDocument>$/,
    );
    expect(root.empty).toBe(false);
  });

  it("reads names, namespaces and attributes as a parse does", () => {
    expect(root.nodeType).toBe(1);
    expect(root.localName).toBe("ClinicalDocument");
    expect(root.namespaceURI).toBe(V3_NS);
    expect(root.getAttribute("xmlns:xsi")).toBe(XSI_NS);
    expect(root.getAttribute("missing")).toBeNull();
    expect(root.getAttributeNS("http://www.w3.org/2000/xmlns/", "xsi")).toBe(XSI_NS);
    const other = root.firstChild?.nextSibling as TextElement;
    expect([other.prefix, other.localName, other.namespaceURI]).toEqual([
      "other",
      "component",
      "urn:example:other",
    ]);
  });

  it("reads every ID with the offset of its tag, and none in text, comments or CDATA", () => {
    expect(read?.ids).toEqual(["r1", "s1", "a&1", "p1"]);
    expect(read?.idAt.map((at) => DOCUMENT.slice(at, at + 4))).toEqual([
      "<id ",
      "<sec",
      "<act",
      "<par",
    ]);
  });

  it("reads attribute values with the references the writer writes", () => {
    const text = `<ClinicalDocument xmlns="${V3_NS}"><id root="a&amp;&lt;&gt;&quot;&#9;&#10;&#13;b"/></ClinicalDocument>`;
    expect(readText(text)?.root.firstChild?.getAttribute("root")).toBe(`a&<>"\t\n\rb`);
    const xml = `<ClinicalDocument xmlns="${V3_NS}" xml:lang="en-US"/>`;
    const lone = readText(xml)?.root as TextElement;
    expect(lone.empty).toBe(true);
    expect(lone.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang")).toBe("en-US");
  });

  it("reads an unbound default namespace as none", () => {
    const text = `<ClinicalDocument xmlns="${V3_NS}"><title xmlns=""/></ClinicalDocument>`;
    expect(readText(text)?.root.firstChild?.namespaceURI).toBeNull();
  });

  it.each([
    ["no root", `<!-- only a comment -->`],
    ["an unclosed root", `<ClinicalDocument xmlns="${V3_NS}">`],
    ["a name that runs to the end", `<ClinicalDocument`],
    ["an end tag with no start", `</ClinicalDocument>`],
    ["an end tag that does not close", `<a></a`],
    ["an unclosed comment", `<!-- <a/>`],
    ["an unclosed CDATA section", `<a><![CDATA[ </a>`],
    ["a declaration", `<!DOCTYPE a><a/>`],
    ["an unclosed instruction", `<?p <a/>`],
    ["a slash inside a tag", `<a/ b="c">`],
    ["a tab between attributes", `<a\tb="c"/>`],
    ["an attribute with no value", `<a b/>`],
    ["a single-quoted value", `<a b='c'/>`],
    ["an unclosed value", `<a b="c/>`],
    ["a raw tab in a value", `<a b="c\td"/>`],
    ["a raw line feed in an ID", `<a><b ID="c\nd"/></a>`],
    ["a reference the writer does not write", `<a b="&apos;"/>`],
    ["an unbound element prefix", `<p:a/>`],
    ["an unbound attribute prefix", `<a p:b="c"/>`],
  ])("hands back %s", (_name, text) => {
    expect(readText(text)).toBeUndefined();
  });
});
