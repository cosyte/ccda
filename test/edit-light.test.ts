/**
 * The light nodes an edit of a written text builds, and their writer (`src/edit/light-dom.ts`),
 * against `@xmldom/xmldom`: the same builder run on each, and what `serializeDocument` writes for
 * the `@xmldom/xmldom` nodes appended to copies of the elements of the text they go into, as the
 * edit wrote them before it had a writer of its own. Every editable section kind, built from
 * generated content (free text with every character XML escapes, a carriage return among them),
 * under the namespace declarations a source can carry: a default namespace, a prefixed root with
 * no `xsi` declaration, `xsi` and `sdtc` under other prefixes.
 *
 * Every document and value here is synthetic.
 */

import fc from "fast-check";
import type { Document, Element } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { documentInit } from "../src/arbitraries/document.js";
import { buildSectionComponent, type SectionInput } from "../src/builder/build-ccda.js";
import { el, sdtcEl, typedEl } from "../src/builder/dom.js";
import { LightDocument, LightElement, LightWriter, type LightNode } from "../src/edit/light-dom.js";
import { readText, type TextElement } from "../src/edit/text-read.js";
import { SDTC_NS, V3_NS, XSI_NS } from "../src/parser/namespaces.js";
import { xmldom } from "../src/parser/xmldom.js";
import { serializeNodes } from "../src/serialize/serialize-dom.js";

const HTML = "http://www.w3.org/1999/xhtml";

/** Root start tags a source can carry, each written as the writer writes it. */
const ROOTS: readonly { readonly name: string; readonly open: string; readonly close: string }[] = [
  {
    name: "a default namespace with xsi",
    open: `<ClinicalDocument xmlns="${V3_NS}" xmlns:xsi="${XSI_NS}" xml:lang="en-US">`,
    close: "</ClinicalDocument>",
  },
  {
    name: "a prefixed root with no xsi",
    open: `<cda:ClinicalDocument xmlns:cda="${V3_NS}">`,
    close: "</cda:ClinicalDocument>",
  },
  {
    name: "xsi and sdtc under other prefixes",
    open: `<ClinicalDocument xmlns="${V3_NS}" xmlns:i="${XSI_NS}" xmlns:ext="${SDTC_NS}">`,
    close: "</ClinicalDocument>",
  },
  {
    name: "both a default namespace and a prefix for v3, and sdtc declared",
    open: `<ClinicalDocument xmlns:hl7="${V3_NS}" xmlns="${V3_NS}" xmlns:sdtc="${SDTC_NS}" xmlns:xsi="${XSI_NS}">`,
    close: "</ClinicalDocument>",
  },
];

/** The `structuredBody` of a written document whose root starts `open`. */
function bodyOf(open: string, close: string): TextElement {
  const prefix = open.startsWith("<cda:") ? "cda:" : "";
  const read = readText(
    `${open}<${prefix}component><${prefix}structuredBody/></${prefix}component>${close}`,
  );
  const component = read?.root.firstChild as TextElement;
  return component.firstChild as TextElement;
}

/**
 * What `serializeDocument` writes for `nodes` as the children of `parent`: written inside
 * `@xmldom/xmldom` copies of `parent` and the elements around it, then cut out.
 */
function reference(doc: Document, parent: TextElement, nodes: readonly Element[]): string {
  const chain: TextElement[] = [];
  for (let at: TextElement | null = parent; at !== null; at = at.parentNode) chain.unshift(at);
  let top: Element | undefined;
  let holder: Element | undefined;
  for (const read of chain) {
    const copy = doc.createElementNS(read.namespaceURI, read.nodeName);
    for (let i = 0; i < read.attrs.length; i += 3) {
      const attr = doc.createAttributeNS(read.attrs[i + 2] ?? null, read.attrs[i] as string);
      attr.value = read.attrs[i + 1] as string;
      copy.setAttributeNode(attr);
    }
    if (holder === undefined) top = copy;
    else holder.appendChild(copy);
    holder = copy;
  }
  doc.appendChild(top as Element);
  let closeAbove = "";
  for (let i = chain.length - 2; i >= 0; i--)
    closeAbove += `</${(chain[i] as TextElement).nodeName}>`;
  const empty = serializeNodes(doc);
  const open = empty.slice(0, empty.length - closeAbove.length - 2);
  for (const node of nodes) (holder as Element).appendChild(node);
  const full = serializeNodes(doc);
  doc.removeChild(top as Element);
  return full.slice(open.length + 1, full.length - `</${parent.nodeName}>${closeAbove}`.length);
}

/** A new `@xmldom/xmldom` document to build in. */
function xmldomDocument(): Document {
  return new (xmldom().DOMImplementation)().createDocument(null, "", null);
}

/** A light document, typed as the builder takes one. */
function lightDocument(): Document {
  return new LightDocument() as unknown as Document;
}

/** The same ID generator for both builds. */
function ids(): (prefix: string) => string {
  const counters = new Map<string, number>();
  return (prefix) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-e${n.toString()}`;
  };
}

describe("LightWriter", () => {
  it("writes every editable section as serializeDocument writes it, in every namespace context", () => {
    fc.assert(
      fc.property(documentInit({ maxEntries: 2 }), (init) => {
        const sections: SectionInput[] = [
          { kind: "problems", content: init.problems ?? [] },
          { kind: "allergies", content: init.allergies ?? [] },
          { kind: "medications", content: init.medications ?? [] },
          { kind: "results", content: init.results ?? [] },
          { kind: "vitalSigns", content: init.vitalSigns ?? [] },
          { kind: "immunizations", content: init.immunizations ?? [] },
          { kind: "procedures", content: init.procedures ?? [] },
          { kind: "encounters", content: init.encounters ?? [] },
          { kind: "socialHistory", content: init.smokingStatus ?? [] },
          { kind: "pastMedicalHistory", content: init.pastMedicalHistory ?? [] },
          { kind: "planOfTreatment", content: init.planOfTreatment ?? [] },
          { kind: "familyHistory", content: init.familyHistory ?? [] },
        ];
        for (const { open, close } of ROOTS) {
          const body = bodyOf(open, close);
          const writer = new LightWriter();
          for (const input of sections) {
            const light = buildSectionComponent(lightDocument(), input, ids());
            const doc = xmldomDocument();
            const dom = buildSectionComponent(doc, input, ids());
            const written = writer.write(body, [light as unknown as LightNode]);
            expect(written).toBe(reference(doc, body, [dom]));
          }
        }
      }),
      { numRuns: 40, seed: 20261111 },
    );
  });

  it("writes elements in sdtc, typed values, and a carriage return as serializeDocument does", () => {
    const make = (doc: Document): Element[] => [
      el(doc, "id", { root: "2.16.840.1.113883.19.5", extension: 'a"b<c>&d\te\nf\rg' }),
      sdtcEl(doc, "deceasedInd", { value: "false" }),
      typedEl(doc, "value", "PQ", { value: "1", unit: "mg" }, el(doc, "translation")),
      el(doc, "title", {}, doc.createTextNode("line one\r\nline two <&>") as unknown as Element),
      el(doc, "text", {}, doc.createTextNode("") as unknown as Element),
    ];
    for (const { open, close } of ROOTS) {
      const body = bodyOf(open, close);
      const doc = xmldomDocument();
      const written = new LightWriter().write(
        body,
        make(lightDocument()) as unknown as LightNode[],
      );
      expect(written).toBe(reference(doc, body, make(doc)));
    }
  });

  it("hands back an element in the XHTML namespace with no children, at any depth", () => {
    const body = bodyOf(ROOTS[0]?.open as string, ROOTS[0]?.close as string);
    const doc = new LightDocument();
    const br = doc.createElementNS(HTML, "br");
    expect(new LightWriter().write(body, [br])).toBeUndefined();
    const holder = doc.createElementNS(V3_NS, "text");
    holder.appendChild(doc.createElementNS(HTML, "br"));
    expect(new LightWriter().write(body, [holder])).toBeUndefined();
    const filled = doc.createElementNS(HTML, "p");
    filled.appendChild(doc.createTextNode("x"));
    expect(new LightWriter().write(body, [filled])).toBe(`<p xmlns="${HTML}">x</p>`);
  });
});

describe("LightElement", () => {
  it("sets and reads attributes as an @xmldom/xmldom element does", () => {
    const light = new LightElement(V3_NS, "value");
    const dom = xmldomDocument().createElementNS(V3_NS, "value");
    for (const element of [light, dom] as const) {
      element.setAttribute("value", "1");
      element.setAttributeNS(XSI_NS, "xsi:type", "PQ");
      element.setAttribute("unit", "mg");
      element.setAttribute("value", "2");
      element.setAttributeNS(XSI_NS, "xsi:type", "IVL_PQ");
    }
    expect(light.attrs).toEqual([
      "value",
      "2",
      null,
      "xsi:type",
      "IVL_PQ",
      XSI_NS,
      "unit",
      "mg",
      null,
    ]);
    expect(light.getAttribute("value")).toBe(dom.getAttribute("value"));
    expect(light.getAttribute("missing")).toBe(dom.getAttribute("missing"));
    expect(light.getAttributeNS(XSI_NS, "type")).toBe(dom.getAttributeNS(XSI_NS, "type"));
    expect(light.getAttributeNS(null, "unit")).toBe(dom.getAttributeNS(null, "unit"));
    expect(light.getAttributeNS(XSI_NS, "unit")).toBe(dom.getAttributeNS(XSI_NS, "unit"));
    expect(light.getAttributeNS(XSI_NS, "typo")).toBe(dom.getAttributeNS(XSI_NS, "typo"));
    expect(light.localName).toBe("value");
    expect(new LightElement(SDTC_NS, "sdtc:deceasedInd").localName).toBe("deceasedInd");
  });
});
