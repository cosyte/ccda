/**
 * The compact reader (`src/parser/xml-tree.ts`) against `@xmldom/xmldom`, node by node.
 *
 * The reader reads a text `parseCcda` is given only when it can vouch for the result: for any text
 * it reads, `@xmldom/xmldom` must read the same text without a fatal error to a tree with the same
 * nodes, names, namespaces, attributes (in order, with their namespaces), values, text, line and
 * column; for any text it hands back, `parseCcda` reads it with `@xmldom/xmldom` as before. These
 * tests hold the first half over the output-equivalence corpus, a list written for every way the
 * reader can refuse, and generated XML; and they require that the reader does read the documents a
 * real sender writes, so a reader that handed everything back could not pass by doing nothing.
 */

import fc from "fast-check";
import { DOMParser, normalizeLineEndings as xmldomLineEndings } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { normalizeLineEndings } from "../src/parser/secure-xml.js";
import { TreeElement, readTree, type TreeCharacterData } from "../src/parser/xml-tree.js";
import { text } from "../src/index.js";
import { outputCorpus } from "./_output-corpus.js";
import { generatedDocument } from "./_helpers/generated-xml.js";
import { checkProperty, propertyTimeout } from "./property/_property.js";

const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** A node of either tree, read through the members both carry. */
interface AnyNode {
  readonly nodeType: number;
  readonly nodeName?: string;
  readonly localName?: string | null;
  readonly namespaceURI?: string | null;
  readonly nodeValue?: string | null;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
  readonly firstChild: AnyNode | null;
  readonly nextSibling: AnyNode | null;
  readonly parentNode: AnyNode | null;
  readonly attrs?: readonly (string | null)[] | null;
  readonly attributes?: ArrayLike<{
    readonly name: string;
    readonly value: string;
    readonly namespaceURI: string | null;
  }>;
}

/** The text as `parseCcda` hands it to a reader: no byte order mark, line endings normalized. */
function prepared(raw: string): string {
  const source = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return xmldomLineEndings(source);
}

/** The root `@xmldom/xmldom` reads from `source` with its locator, or `"fatal"`. */
function xmldomRoot(source: string): AnyNode | "fatal" {
  try {
    const doc = new DOMParser({
      locator: true,
      normalizeLineEndings: (s: string) => s,
      onError: (level: string) => {
        if (level === "fatalError") throw new Error("fatal");
      },
    }).parseFromString(source, "application/xml");
    return (doc.documentElement as unknown as AnyNode | null) ?? "fatal";
  } catch {
    return "fatal";
  }
}

/** One node's own description: everything a comparison checks of it but its children. */
function describeNode(node: AnyNode): string {
  if (node.nodeType !== 1) return `${String(node.nodeType)} ${JSON.stringify(node.nodeValue)}`;
  const attrs: string[] = [];
  if (node.attributes !== undefined) {
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes[i] as { name: string; value: string; namespaceURI: string | null };
      attrs.push(`${a.name}=${JSON.stringify(a.value)}@${String(a.namespaceURI)}`);
    }
  } else {
    const list = node.attrs ?? [];
    for (let i = 0; i < list.length; i += 3) {
      attrs.push(`${String(list[i])}=${JSON.stringify(list[i + 1])}@${String(list[i + 2])}`);
    }
  }
  return [
    node.nodeName,
    node.localName,
    String(node.namespaceURI),
    `${String(node.lineNumber)}:${String(node.columnNumber)}`,
    `[${attrs.join(" ")}]`,
  ].join(" ");
}

/** The first difference between two trees, or `undefined` when they are the same. */
function difference(ours: AnyNode, theirs: AnyNode): string | undefined {
  const pending: [AnyNode, AnyNode][] = [[ours, theirs]];
  for (let pair = pending.pop(); pair !== undefined; pair = pending.pop()) {
    const [a, b] = pair;
    const da = describeNode(a);
    const db = describeNode(b);
    if (da !== db) return `${da}\n  vs ${db}`;
    let ca = a.firstChild;
    let cb = b.firstChild;
    while (ca !== null || cb !== null) {
      if (ca === null || cb === null) return `the children of ${da} differ in number`;
      if (ca.parentNode !== a || cb.parentNode !== b) return `a parent link under ${da}`;
      pending.push([ca, cb]);
      ca = ca.nextSibling;
      cb = cb.nextSibling;
    }
  }
  return undefined;
}

/**
 * Whether the reader is right about `raw`: it hands the text back, or `@xmldom/xmldom` reads it
 * without a fatal error to the same tree. Returns what was found, for the counts.
 */
function check(raw: string): "read" | "handed back" {
  const source = prepared(raw);
  const ours = readTree(source);
  if (ours === undefined) return "handed back";
  const theirs = xmldomRoot(source);
  if (theirs === "fatal")
    throw new Error(`read a text @xmldom/xmldom refuses: ${raw.slice(0, 200)}`);
  const diff = difference(ours, theirs);
  if (diff !== undefined) throw new Error(`${diff}\nin ${raw.slice(0, 200)}`);
  return "read";
}

/** A minimal document in the HL7 v3 namespace around `body`. */
function doc(body: string, prolog = ""): string {
  return `${prolog}<ClinicalDocument xmlns="urn:hl7-org:v3">${body}</ClinicalDocument>`;
}

describe("the compact reader against @xmldom/xmldom", () => {
  it("reads every corpus document either as @xmldom/xmldom does or not at all", () => {
    const outcomes = outputCorpus().map((d) => ({ name: d.name, outcome: check(d.text) }));
    // The documents a sender writes are read here, not handed back: the bench shapes, every
    // fixture, and every document drawn from the generators.
    const handedBack = outcomes
      .filter((o) => /^(?:bench|fixture|document):/u.test(o.name) && o.outcome !== "read")
      .map((o) => o.name);
    expect(handedBack).toEqual([]);
  }, 120_000);

  it.each([
    ["an XML declaration and white space", '<?xml version="1.0" encoding="UTF-8"?>\n'],
    ["a declaration in single quotes", "<?xml version='1.0' standalone='no'?>"],
    ["comments and instructions before the root", "<!-- a -->\n<?pi x?>\n"],
  ])("reads a prolog: %s", (_label, prolog) => {
    expect(check(doc("<a/>", prolog))).toBe("read");
  });

  it.each([
    ["attributes quoted either way, spaced around =", `<a b='1' c = "2"\n d\t=\t'3'/>`],
    ["white space and references in attributes", `<a b="x\ty\nz" c="&#9;&#10;&#13;&#x20;"/>`],
    ["predefined entities", `<a b="&amp;&lt;&gt;&quot;&apos;">&amp;&lt;&gt;&quot;&apos;</a>`],
    ["character references", "<c>&#65;&#x41;&#x1F600;&#0065;&#xd7ff;&#xE000;&#xfffd;</c>"],
    [
      "comments, CDATA and instructions",
      "<a><!-- c & d --><![CDATA[x<&y]]>&amp;<?pi?><?pi data ?></a>",
    ],
    ["two names that share a hash", "<yaczfa/><glbppa/><glbppa/>"],
    ["an empty CDATA section between two runs of text", "<c>a<![CDATA[]]>b</c>"],
    ["an empty comment", "<c><!----></c>"],
    ["names with digits, dots, hyphens and underscores", "<_a.b-c1 _d.e-f2='1'/>"],
    [
      "namespaces declared, rebound and undeclared",
      `<p:a xmlns:p="urn:x"><p:b xmlns:p="urn:y"/><p:c/><d xmlns=""><e/></d></p:a>`,
    ],
    [
      "xml: attributes and xsi:type under any prefix",
      `<a xml:lang="en" xmlns:x="http://www.w3.org/2001/XMLSchema-instance" x:type="CD"/>`,
    ],
    ["end tags with white space", "<a></a ><b></b\n>"],
    ["self-closing tags with white space", `<a b="1" /><c />`],
    ["non-ASCII text and columns after it", "<c>caf\u00e9 \ud83d\ude00</c><d/>\n\t<e/>"],
    ["text with a greater-than and a ]]>", "<c>a > b ]]> c</c>"],
    ["control characters in text, which neither reader checks", "<c>a\u0001b\uFFFEc</c>"],
    ["a long run of white space", `<a>${" ".repeat(300)}<b/></a>`],
    [
      "many attributes",
      `<a ${Array.from({ length: 20 }, (_v, i) => `a${String(i)}="${String(i)}"`).join(" ")}/>`,
    ],
    [
      "many attributes in namespaces",
      `<a xmlns:p="urn:x" xmlns:q="urn:y" ${Array.from({ length: 10 }, (_v, i) => `p:a${String(i)}="1" q:a${String(i)}="2"`).join(" ")}/>`,
    ],
  ])("reads %s as @xmldom/xmldom does", (_label, body) => {
    expect(check(doc(body))).toBe("read");
  });

  it.each([
    ["a custom entity", "<c>&custom;</c>"],
    ["an upper-case predefined entity", "<c>&AMP;</c>"],
    ["an ampersand with no semicolon", "<c>AT&T</c>"],
    ["an ampersand whose semicolon is past the text", "<c>a & b</c><d>;</d>"],
    ["a character reference with an upper-case X", "<c>&#X41;</c>"],
    ["a character reference to NUL", "<c>&#0;</c>"],
    ["a character reference to a surrogate", "<c>&#xD800;</c>"],
    ["a character reference past U+10FFFF", "<c>&#x110000;</c>"],
    ["a character reference to U+FFFE", "<c>&#xFFFE;</c>"],
    ["a character reference with too many digits", "<c>&#00000000065;</c>"],
    ["a character reference with no digits", "<c>&#;</c>"],
    ["a hexadecimal reference with no digits", "<c>&#x;</c>"],
    ["a decimal reference with a letter", "<c>&#6a;</c>"],
    ["a hexadecimal reference with a non-digit", "<c>&#x4g;</c>"],
    ["a custom entity in an attribute", `<a b="&x;"/>`],
    ["a non-ASCII element name", "<caf\u00e9/>"],
    ["a non-ASCII attribute name", `<a caf\u00e9="1"/>`],
    ["a name with two colons", "<a:b:c/>"],
    ["a name ending in a colon", "<a:/>"],
    ["a name starting with a digit", "<1a/>"],
    ["a bare less-than", "<c>a < b</c>"],
    ["a less-than at the end", "<c/><"],
    ["a NBSP between attributes", "<a\u00a0b='1'/>"],
    ["a control character between attributes", "<a\u0001b='1'/>"],
    ["no space between attributes", `<a b="1"c="2"/>`],
    ["an attribute name with no equals sign", "<a b/>"],
    ["an attribute with no quote", "<a b=1/>"],
    ["an attribute with no closing quote", `<a b="1/>`],
    ["a less-than in an attribute", `<a b="<"/>`],
    ["a less-than after the attributes", `<a b="1" <c/>`],
    ["a repeated attribute", `<a b="1" b="2"/>`],
    [
      "two attributes with one namespace and local name",
      `<a xmlns:p="urn:x" xmlns:q="urn:x" p:b="1" q:b="2"/>`,
    ],
    [
      "a repeated attribute among many",
      `<a ${Array.from({ length: 12 }, (_v, i) => `a${String(i)}="1"`).join(" ")} a3="x"/>`,
    ],
    [
      "one namespace and local name twice among many",
      `<a xmlns:p="urn:x" xmlns:q="urn:x" ${Array.from({ length: 12 }, (_v, i) => `a${String(i)}="1"`).join(" ")} p:b="1" q:b="2"/>`,
    ],
    ["an unbound element prefix", "<p:a/>"],
    ["an unbound attribute prefix", `<a p:b="1"/>`],
    ["a prefix bound to nothing", `<a xmlns:p=""/>`],
    ["the xml prefix declared", `<a xmlns:xml="${XML_NS}"/>`],
    ["the xmlns prefix declared", `<a xmlns:xmlns="urn:x"/>`],
    ["a prefix bound to the XML namespace", `<a xmlns:p="${XML_NS}"/>`],
    ["the default namespace bound to the xmlns namespace", `<a xmlns="${XMLNS_NS}"/>`],
    ["an element with the xml prefix", "<xml:a/>"],
    ["an element named xmlns", "<xmlns/>"],
    ["an element with the xmlns prefix", `<xmlns:a/>`],
    ["a prefix used out of its scope", `<a xmlns:p="urn:x"/><p:b/>`],
    ["a mismatched end tag", "<a></b>"],
    ["a longer end tag", "<a></ab>"],
    ["a prefixed end tag for an unprefixed element", "<a></a:b>"],
    ["an end tag with content after the name", "<a></a\nb>"],
    ["a self-closing slash apart from its >", "<a/ >"],
    ["a comment with a double hyphen", "<!-- a -- b -->"],
    ["a comment ending in a hyphen", "<!-- a --->"],
    ["an unterminated comment", "<!-- a"],
    ["a comment holding a lone surrogate", "<!-- \ud800 -->"],
    ["an unterminated CDATA section", "<c><![CDATA[a</c>"],
    ["a CDATA section holding a lone surrogate", "<c><![CDATA[\ud800]]></c>"],
    ["a markup declaration", "<!ELEMENT a>"],
    ["a malformed comment opening", "<!-x>"],
    ["an instruction named xml inside the document", '<?xml version="1.0"?>'],
    ["an instruction with a colon after its name", "<?a:b:c d?>"],
    ["an unterminated instruction", "<?pi a"],
    ["an instruction with a non-ASCII name", "<?caf\u00e9?>"],
  ])("hands back %s", (_label, body) => {
    expect(check(doc(body))).toBe("handed back");
  });

  it.each([
    ["an empty text", ""],
    ["white space only", " \n "],
    ["text before the root", "x<a/>"],
    ["text after the root", "<a/>x"],
    ["CDATA after the root", "<a/><![CDATA[x]]>"],
    ["a second root", "<a/><b/>"],
    ["an end tag before any element", "</a>"],
    ["an unclosed root", "<a>"],
    ["an XML declaration after white space", ' <?xml version="1.0"?><a/>'],
    ["an XML declaration in upper case", '<?XML version="1.0"?><a/>'],
    ["an XML declaration with an unknown version", '<?xml version="2.0"?><a/>'],
  ])("hands back a document with %s", (_label, source) => {
    expect(check(source)).toBe("handed back");
  });

  it("reads the line and column of every element as @xmldom/xmldom's locator counts them", () => {
    const source = `<?xml version="1.0"?>\n<a>\n  <b c="1\n2"\n     d="3"/><!-- x\ny --><e/>\n\t<f><![CDATA[\n]]><g/></f></a>`;
    expect(check(source)).toBe("read");
    const root = readTree(source);
    const positions: string[] = [];
    const walk = (node: TreeElement): void => {
      positions.push(`${node.localName}@${String(node.lineNumber)}:${String(node.columnNumber)}`);
      for (let n = node.firstChild; n !== null; n = n.nextSibling) {
        if (n instanceof TreeElement) walk(n);
      }
    };
    walk(root as TreeElement);
    expect(positions).toEqual(["a@2:1", "b@3:3", "e@6:6", "f@7:2", "g@8:4"]);
  });

  it("agrees with @xmldom/xmldom on generated XML", { timeout: propertyTimeout() }, () => {
    let read = 0;
    let total = 0;
    checkProperty(
      "compact reader agrees with @xmldom/xmldom",
      fc.property(generatedDocument(), (source) => {
        total += 1;
        if (check(source) === "read") read += 1;
      }),
      { numRuns: 400 },
    );
    // The generator is useful only while most of what it writes is read rather than handed back.
    expect(read / total).toBeGreaterThan(0.3);
  });
});

describe("the tree's own members", () => {
  const root = readTree(
    `<r xmlns="urn:x" xmlns:p="urn:p" a="1" p:b="2"><t>one</t>two<?pi d?><!--c--></r>`,
  ) as TreeElement;

  it("reads attributes by qualified name and by namespace and local name", () => {
    expect(root.nodeType).toBe(1);
    expect(root.getAttribute("a")).toBe("1");
    expect(root.getAttribute("p:b")).toBe("2");
    expect(root.getAttribute("b")).toBeNull();
    expect(root.getAttributeNS("urn:p", "b")).toBe("2");
    expect(root.getAttributeNS("urn:p", "bb")).toBeNull();
    expect(root.getAttributeNS("urn:p", "c")).toBeNull();
    expect(root.getAttributeNS(null, "a")).toBe("1");
    expect(root.getAttributeNS(XMLNS_NS, "xmlns")).toBe("urn:x");
    expect(root.getAttributeNS(XMLNS_NS, "p")).toBe("urn:p");
    expect(root.getAttributeNS("urn:x", "a")).toBeNull();
    const child = root.firstChild as TreeElement;
    expect(child.getAttribute("a")).toBeNull();
    expect(child.getAttributeNS(null, "a")).toBeNull();
  });

  it("gives character data no children and its value as its text", () => {
    const textNode = (root.firstChild as TreeElement).nextSibling as TreeCharacterData;
    expect(textNode.firstChild).toBeNull();
    expect(textNode.textContent).toBe("two");
    // The model's `text` reads a node that is not an element through `textContent`.
    expect(text(textNode as unknown as Parameters<typeof text>[0])).toBe("two");
    expect(text(root as unknown as Parameters<typeof text>[0])).toBe("onetwo");
  });
});

describe("line-ending normalization", () => {
  it("is @xmldom/xmldom's", () => {
    for (const sample of [
      "a\r\nb\rc\nd\u0085e\u2028f\u2029g",
      "\r\r\n\n\r\u0085\u0085\r",
      "no breaks",
      "",
    ]) {
      expect(normalizeLineEndings(sample)).toBe(xmldomLineEndings(sample));
    }
  });
});
