/**
 * `parseXml` and `serializeXml`, the hardened XML reader `parseCcda` stands on and its writer,
 * exported for any XML format.
 *
 * The first suite is the contract that matters most: the exported reader refuses every attack the
 * internal one (`parseSecureXml`, with the limits resolved the same way) refuses, with the same
 * fatal code. Each row is run through both. Every value is synthetic.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CcdaParseError,
  DEFAULT_LIMITS,
  FATAL_CODES,
  parseSecureXml,
  parseXml,
  resolveLimits,
  serializeXml,
  WARNING_CODES,
  type CcdaParseLimits,
  type CcdaWarning,
} from "../src/index.js";
import { xmldom } from "../src/parser/xmldom.js";
import { refuseOutsideRootNodes, refuseOutsideRootText } from "../src/parser/outside-root.js";
import { firstDifference, readBackDifference } from "../src/xml/same-tree.js";
import { declaredPrefix } from "../src/xml/write.js";

/** What `run` threw, or `undefined` when it returned. */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (err) {
    return err;
  }
  return undefined;
}

/** The fatal code `run` threw as a `CcdaParseError`, or `"none"` when it returned. */
function fatalOf(run: () => unknown): string {
  const err = thrownBy(run);
  if (err === undefined) return "none";
  expect(err).toBeInstanceOf(CcdaParseError);
  return (err as CcdaParseError).code;
}

/** A marker that must never reach a message: it stands for whatever a hostile text carries. */
const MARKER = "zzmarkerzz";

interface Attack {
  readonly name: string;
  readonly text: string;
  readonly limits?: CcdaParseLimits;
  readonly code: string;
}

const ATTACKS: readonly Attack[] = [
  {
    name: "an external entity reading a local file (XXE)",
    text: `<?xml version="1.0"?>\n<!DOCTYPE p [ <!ENTITY ${MARKER} SYSTEM "file:///etc/passwd"> ]>\n<p>&${MARKER};</p>`,
    code: FATAL_CODES.XXE_OR_DTD_PRESENT,
  },
  {
    name: "an external entity fetching a URL (server-side request)",
    text: `<!DOCTYPE p [ <!ENTITY e SYSTEM "http://example.com/${MARKER}"> ]><p>&e;</p>`,
    code: FATAL_CODES.XXE_OR_DTD_PRESENT,
  },
  {
    name: "a billion-laughs entity expansion",
    text: [
      "<!DOCTYPE lolz [",
      '  <!ENTITY lol "lol">',
      '  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">',
      '  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">',
      "]>",
      "<p>&lol3;</p>",
    ].join("\n"),
    code: FATAL_CODES.XXE_OR_DTD_PRESENT,
  },
  {
    name: "an external parameter entity",
    text: '<!DOCTYPE p [ <!ENTITY % ext SYSTEM "http://example.com/x.dtd"> %ext; ]><p/>',
    code: FATAL_CODES.XXE_OR_DTD_PRESENT,
  },
  {
    name: "an external DTD with no internal subset",
    text: '<!DOCTYPE p SYSTEM "http://example.com/p.dtd"><p/>',
    code: FATAL_CODES.XXE_OR_DTD_PRESENT,
  },
  {
    name: "a DOCTYPE written in lower case",
    text: "<!doctype p><p/>",
    code: FATAL_CODES.XXE_OR_DTD_PRESENT,
  },
  {
    name: "an entity declaration outside any DOCTYPE",
    text: '<p><!ENTITY e "x"></p>',
    code: FATAL_CODES.XXE_OR_DTD_PRESENT,
  },
  {
    name: "a DTD after the root element",
    text: "<p/><!DOCTYPE p>",
    code: FATAL_CODES.XXE_OR_DTD_PRESENT,
  },
  {
    name: "a flood of undeclared entity references over the default cap",
    text: `<p>${"&e;".repeat(DEFAULT_LIMITS.maxEntityExpansions + 1)}</p>`,
    code: FATAL_CODES.ENTITY_EXPANSION_LIMIT,
  },
  {
    name: "entity references over a cap the caller set",
    text: "<p>&a;&b;&c;</p>",
    limits: { maxEntityExpansions: 2 },
    code: FATAL_CODES.ENTITY_EXPANSION_LIMIT,
  },
  {
    name: "a text over the size cap the caller set",
    text: `<p>${"x".repeat(64)}</p>`,
    limits: { maxInputBytes: 64 },
    code: FATAL_CODES.INPUT_SIZE_LIMIT_EXCEEDED,
  },
  {
    name: "a text whose UTF-8 bytes, not its characters, pass the size cap",
    text: `<p>${"\u00e9".repeat(30)}</p>`,
    limits: { maxInputBytes: 40 },
    code: FATAL_CODES.INPUT_SIZE_LIMIT_EXCEEDED,
  },
  {
    name: "nesting past the default depth cap",
    text: `${"<a>".repeat(DEFAULT_LIMITS.maxDepth + 1)}${"</a>".repeat(DEFAULT_LIMITS.maxDepth + 1)}`,
    code: FATAL_CODES.ELEMENT_DEPTH_LIMIT_EXCEEDED,
  },
  {
    name: "nesting past a depth cap the caller set",
    text: "<a><b><c><d/></c></b></a>",
    limits: { maxDepth: 3 },
    code: FATAL_CODES.ELEMENT_DEPTH_LIMIT_EXCEEDED,
  },
  {
    name: "fan-out past an element-count cap the caller set",
    text: `<a>${"<b/>".repeat(5)}</a>`,
    limits: { maxNodeCount: 5 },
    code: FATAL_CODES.NODE_COUNT_LIMIT_EXCEEDED,
  },
  {
    name: "a character XML 1.0 forbids, written raw",
    text: `<p>${MARKER}\u0001</p>`,
    code: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
  {
    name: "a character XML 1.0 forbids, written as a reference in an attribute",
    text: `<p a="${MARKER}&#x1;"/>`,
    code: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
  {
    name: "an unpaired surrogate",
    text: "<p>\ud800</p>",
    code: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
  {
    name: "an unbound namespace prefix",
    text: `<${MARKER}:p/>`,
    code: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
  {
    name: "a mismatched end tag",
    text: `<p><${MARKER}></p>`,
    code: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
  { name: "an empty text", text: "", code: FATAL_CODES.NOT_WELL_FORMED_XML },
  {
    name: "a text with no root element",
    text: '<?xml version="1.0"?><!-- nothing -->',
    code: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
];

describe("parseXml refuses each attack the internal reader refuses", () => {
  for (const attack of ATTACKS) {
    it(`refuses ${attack.name} with ${attack.code}, as parseSecureXml does`, () => {
      const internal = fatalOf(() =>
        parseSecureXml(attack.text, resolveLimits(attack.limits), () => undefined),
      );
      expect(internal).toBe(attack.code);
      const options = attack.limits === undefined ? {} : { limits: attack.limits };
      expect(fatalOf(() => parseXml(attack.text, options))).toBe(internal);
    });
  }

  it("never puts the text in a refusal's message, position or stack", () => {
    for (const attack of ATTACKS) {
      const err = thrownBy(() => parseXml(attack.text, attack.limits && { limits: attack.limits }));
      expect(err).toBeInstanceOf(CcdaParseError);
      const parseError = err as CcdaParseError;
      expect(parseError.message, attack.name).not.toContain(MARKER);
      expect(String(parseError.stack), attack.name).not.toContain(MARKER);
      expect(JSON.stringify(parseError.position), attack.name).not.toContain(MARKER);
      expect("cause" in parseError, attack.name).toBe(false);
    }
  });

  it("applies the default size cap when no limit is given", () => {
    const text = `<p>${"x".repeat(DEFAULT_LIMITS.maxInputBytes)}</p>`;
    expect(fatalOf(() => parseXml(text))).toBe(FATAL_CODES.INPUT_SIZE_LIMIT_EXCEEDED);
  });

  it("reads what is within each limit, at the limit", () => {
    expect(fatalOf(() => parseXml("<a><b><c/></b></a>", { limits: { maxDepth: 3 } }))).toBe("none");
    expect(
      fatalOf(() => parseXml(`<a>${"<b/>".repeat(4)}</a>`, { limits: { maxNodeCount: 5 } })),
    ).toBe("none");
    expect(fatalOf(() => parseXml("<p>&a;&b;</p>", { limits: { maxEntityExpansions: 2 } }))).toBe(
      "none",
    );
    const text = "<p>x</p>";
    expect(fatalOf(() => parseXml(text, { limits: { maxInputBytes: text.length } }))).toBe("none");
  });

  it("never counts the five predefined entities or a character reference toward the cap", () => {
    const doc = parseXml("<p a='&quot;'>&amp;&lt;&gt;&apos;&#65;&#x42;</p>", {
      limits: { maxEntityExpansions: 0 },
    });
    expect(doc.documentElement?.textContent).toBe("&<>'AB");
    expect(doc.documentElement?.getAttribute("a")).toBe('"');
  });
});

describe("parseXml reads any XML, not only C-CDA", () => {
  it("returns the document, with positions, for a root in no namespace", () => {
    const doc = parseXml(
      '<pathway id="example-1">\n  <step order="1">Synthetic step</step>\n</pathway>',
    );
    const root = doc.documentElement;
    expect(root?.localName).toBe("pathway");
    expect(root?.namespaceURI).toBeNull();
    const step = root?.getElementsByTagName("step")[0] as unknown as { lineNumber: number };
    expect(step.lineNumber).toBe(2);
  });

  it("raises no namespace warning, where the C-CDA reader raises one", () => {
    const text =
      '<pathway xmlns="urn:example:pathways"><x:step xmlns:x="urn:example:other"/></pathway>';
    const internal: CcdaWarning[] = [];
    parseSecureXml(text, resolveLimits(), (w) => internal.push(w));
    expect(internal.map((w) => w.code)).toContain(WARNING_CODES.UNKNOWN_NAMESPACE_PREFIX);

    const warnings: CcdaWarning[] = [];
    parseXml(text, { onWarning: (w) => warnings.push(w) });
    expect(warnings).toStrictEqual([]);
  });

  it("removes a byte order mark and reports it through onWarning", () => {
    const warnings: CcdaWarning[] = [];
    const doc = parseXml("\ufeff<p/>", { onWarning: (w) => warnings.push(w) });
    expect(doc.documentElement?.localName).toBe("p");
    expect(warnings.map((w) => w.code)).toStrictEqual([WARNING_CODES.ENCODING_BOM_STRIPPED]);
  });

  it("removes a byte order mark with no onWarning given", () => {
    expect(parseXml("\ufeff<p/>").documentElement?.localName).toBe("p");
  });

  it("normalizes line endings as XML does", () => {
    expect(parseXml("<p>a\r\nb\rc</p>").documentElement?.textContent).toBe("a\nb\nc");
  });
});

/**
 * Characters that are not XML white space (XML 1.0 production [3] is space, tab, carriage return
 * and line feed only), though JavaScript's `trim` and `\s` take each as white space.
 */
const NOT_XML_SPACE: readonly (readonly [string, string])[] = [
  ["NO-BREAK SPACE", String.fromCodePoint(0xa0)],
  ["IDEOGRAPHIC SPACE", String.fromCodePoint(0x3000)],
  ["a byte order mark", String.fromCodePoint(0xfeff)],
  ["LINE SEPARATOR", String.fromCodePoint(0x2028)],
  ["NEL", String.fromCodePoint(0x85)],
];

/**
 * Texts with content outside the root element that XML 1.0 productions [1], [22] and [27] forbid:
 * anything there but white space, comments and processing instructions. `parseSecureXml` is what
 * `parseCcda` reads with, and each row names what it does with the text, as it did before
 * `parseXml` existed: `"none"` when it reads it, else the fatal code.
 */
const OUTSIDE_ROOT: readonly {
  readonly name: string;
  readonly text: string;
  readonly secure?: string;
}[] = [
  { name: "text before the root", text: `Synthetic ${MARKER}<a/>` },
  { name: "text after the root", text: `<a/>Synthetic ${MARKER}` },
  { name: "text after the declaration", text: `<?xml version="1.0"?>${MARKER}<a/>` },
  { name: "text between a prolog comment and the root", text: `<!--c-->${MARKER}<a/>` },
  { name: "text after the root, before a comment", text: `<a/>${MARKER}<!--c--><?p x?>` },
  { name: "text, a raw ampersand and a raw less-than after the root", text: "<a/>a & b < c" },
  { name: "a predefined entity reference after the root", text: "<a/>&amp;" },
  { name: "a character reference after the root", text: "<a/>&#65;" },
  { name: "a custom entity reference after the root", text: `<a/>&${MARKER};` },
  { name: "text after a byte order mark, before the root", text: `\ufeff${MARKER}<a/>` },
  { name: "a reference before the root", text: "&amp;<a/>" },
  { name: "a stray less-than before the root", text: "<<a/>" },
  { name: "a stray less-than after the root", text: "<a/><" },
  { name: "a stray less-than and a space after the root", text: "<a/>< " },
  { name: "a stray less-than after a trailing comment", text: "<a/><!--c--><" },
  { name: "a CDATA section after the root", text: `<a/><![CDATA[${MARKER}]]>` },
  {
    name: "a CDATA section before the root",
    text: `<![CDATA[${MARKER}]]><a/>`,
    secure: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
  {
    name: "a second element after the root",
    text: "<a/><b/>",
    secure: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
  {
    name: "a second element after a trailing comment",
    text: "<a/><!--c--><b>x</b>",
    secure: FATAL_CODES.NOT_WELL_FORMED_XML,
  },
  ...NOT_XML_SPACE.flatMap(([label, char]) => [
    { name: `${label} after the root`, text: `<a/>${char}` },
    { name: `${label} before the root`, text: `\n${char}<a/>` },
    { name: `${label} after a trailing comment`, text: `<a/><!--c-->${char}` },
  ]),
];

describe("parseXml refuses character data outside the root element", () => {
  it.each(OUTSIDE_ROOT)("refuses $name with NOT_WELL_FORMED_XML", ({ text }) => {
    const err = thrownBy(() => parseXml(text));
    expect(err).toBeInstanceOf(CcdaParseError);
    expect((err as CcdaParseError).code).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    expect((err as CcdaParseError).message).not.toContain(MARKER);
    expect((err as CcdaParseError).message).not.toContain("Synthetic");
  });

  it("reads white space, comments and processing instructions around the root", () => {
    const text = '\ufeff<?xml version="1.0"?>\n<!--c-->\t<?p x?> \r\n<a/>\n<!--d--> <?q y?>\r\n\t ';
    const doc = parseXml(text);
    expect(doc.documentElement?.localName).toBe("a");
    expect(doc.documentElement?.parentNode).toBe(doc);
  });

  it("reads text inside the root, and markup characters in comments outside it", () => {
    const doc = parseXml("<!-- a & b > c --><a>Synthetic text</a><?p x > y?>");
    expect(doc.documentElement?.textContent).toBe("Synthetic text");
  });

  it("still reads what xmldom reports for other reasons, such as an undeclared entity", () => {
    // xmldom reports `&name;` with no declaration as an error too; that one is not outside the
    // root, is never expanded, and counts toward maxEntityExpansions, so it is read as before.
    expect(parseXml("<a>Synthetic &undeclared;</a>").documentElement?.localName).toBe("a");
  });

  it.each(OUTSIDE_ROOT)(
    "leaves the C-CDA reader as it was: parseSecureXml on $name",
    ({ text, secure }) => {
      // The internal reader's leniency is unchanged; only the exported parseXml refuses.
      expect(fatalOf(() => parseSecureXml(text, resolveLimits(), () => {}))).toBe(secure ?? "none");
    },
  );

  it("refuses an unclosed comment or instruction outside the root, and an unclosed root", () => {
    for (const text of ["<!--c<a/>", "<?p x<a/>", "<a/><!--c", "<a/><?p x", "<a>", "<a><b></a>"]) {
      expect(
        fatalOf(() => parseXml(text)),
        JSON.stringify(text),
      ).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    }
  });

  it("finds the end of the root past markup characters inside it", () => {
    const text =
      '<?xml version="1.0"?>\n<a:r xmlns:a="urn:example:a" x=\'1/>\' y="b>/c">' +
      "<s/><t >x &amp; y<!-- </a:r> --><![CDATA[</a:r>]]><?p </a:r>?></t ></a:r\t>\r\n<!--z-->";
    const doc = parseXml(text);
    expect(doc.documentElement?.localName).toBe("r");
    expect(doc.documentElement?.childNodes.length).toBe(2);
  });
});

describe("the scan of the text outside the root element", () => {
  /** What the scan does with `text`: `"none"` when it passes it, else the fatal code. */
  function scanned(text: string): string {
    return fatalOf(() => refuseOutsideRootText(text));
  }

  it("passes one element with only white space, comments and instructions around it", () => {
    for (const text of [
      "<a/>",
      "<a></a>",
      " \t\r\n<a/> \t\r\n",
      "<!--c--><?p x?><a/><!--d--><?q y?>",
      "<a:b:c/>",
      `<${String.fromCodePoint(0x10000)}/>`,
      "<a x='1' y=\"2\"/>",
      "<a\n/>",
      "<a\t>t</a>",
    ]) {
      expect(scanned(text), JSON.stringify(text)).toBe("none");
    }
  });

  it("refuses a text with no element, or nothing but a comment or instruction", () => {
    for (const text of ["", " ", "x", "<!--c-->", "<?p x?>", "</a>", "<![CDATA[x]]>"]) {
      expect(scanned(text), JSON.stringify(text)).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    }
  });

  it("refuses a tag that does not start with a name, or a name not followed by a separator", () => {
    for (const text of ["< a/>", "<1a/>", "<-a/>", "<a<b/>", '<a"x"/>', "<a/ >"]) {
      expect(scanned(text), JSON.stringify(text)).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    }
  });

  it("matches each end tag to its start tag by name", () => {
    expect(scanned("<a><b></b></a>")).toBe("none");
    expect(scanned("<a></b>")).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    expect(scanned("<a><b></a></b>")).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
  });

  it("ends each comment, CDATA section and instruction inside the root at its first close", () => {
    // Read to the last close instead, each would swallow the <b> between two of them.
    for (const [open, close] of [
      ["<!--", "-->"],
      ["<![CDATA[", "]]>"],
      ["<?p ", "?>"],
    ]) {
      const text = `<a>${open}x${close}<b>${open}y${close}</b></a>`;
      expect(scanned(text), text).toBe("none");
    }
  });

  it("ends each comment and instruction outside the root at its first close", () => {
    expect(scanned("<!--c--><a/><!--d-->")).toBe("none");
    expect(scanned("<?p x?><a/><?q y?>")).toBe("none");
    expect(scanned("<!--c--><a><!--d--></a>")).toBe("none");
  });

  it("reads past a greater-than in either kind of quoted attribute value", () => {
    expect(scanned("<a x='>/'><b y=\">\"/></a>")).toBe("none");
    expect(scanned("<a x='>'/>z")).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
  });
});

describe("the check of the nodes directly under the document", () => {
  /** What the check does with these nodes: `"none"` when it passes them, else the fatal code. */
  function checked(...nodes: { nodeType: number; data: string }[]): string {
    return fatalOf(() => refuseOutsideRootNodes({ childNodes: nodes }));
  }
  const element = { nodeType: 1, data: "" };

  it("passes one element with comments, instructions and white space text beside it", () => {
    expect(checked(element)).toBe("none");
    expect(
      checked(
        { nodeType: 8, data: "c" },
        { nodeType: 7, data: "x" },
        { nodeType: 3, data: " \t\r\n" },
        element,
        { nodeType: 3, data: "" },
      ),
    ).toBe("none");
  });

  it("refuses text that is not XML white space, wherever it sits in the text", () => {
    for (const data of ["x", "\n x\n", " x", "x ", String.fromCodePoint(0xa0)]) {
      expect(checked(element, { nodeType: 3, data }), JSON.stringify(data)).toBe(
        FATAL_CODES.NOT_WELL_FORMED_XML,
      );
    }
  });

  it("refuses a CDATA section, even of white space, a second element, and none", () => {
    expect(checked(element, { nodeType: 4, data: " " })).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    expect(checked(element, element)).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    expect(checked({ nodeType: 8, data: "c" })).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    expect(checked()).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
  });
});

/** A document built with the DOM API, with a root `<root/>`. */
function newDocument(): ReturnType<typeof parseXml> {
  return new (xmldom().DOMImplementation)().createDocument(null, "root", null);
}

/**
 * An element no DOM call would build, for a check the DOM API makes before the writer could: a
 * plain object with the members the writer reads.
 */
function fakeElement(name: string, namespaceURI: string | null): never {
  const plain = { nodeType: 1, nodeName: name, namespaceURI, attributes: [], childNodes: [] };
  return plain as never;
}

/** The message of the `TypeError` `serializeXml` threw for `node`. */
function refusalOf(node: Parameters<typeof serializeXml>[0]): string {
  const err = thrownBy(() => serializeXml(node));
  expect(err).toBeInstanceOf(TypeError);
  return (err as TypeError).message;
}

describe("serializeXml writes what parseXml reads back", () => {
  it("writes a document with a declaration, and is a fixed point", () => {
    const text = '<pathway id="example-1"><step order="1">Synthetic &amp; step</step></pathway>';
    const out = serializeXml(parseXml(text));
    expect(out).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n${text}`);
    expect(serializeXml(parseXml(out))).toBe(out);
  });

  it("keeps a declaration the document carries, once", () => {
    const text = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p/>';
    expect(serializeXml(parseXml(text))).toBe(text);
  });

  it("writes an element alone, with no declaration", () => {
    const doc = parseXml('<pathway xmlns="urn:example:pathways"><step order="1"/></pathway>');
    const step = doc.documentElement?.firstChild;
    expect(serializeXml(step as never)).toBe('<step order="1" xmlns="urn:example:pathways"/>');
  });

  it("keeps a carriage return in text and in an attribute through a round trip", () => {
    const doc = parseXml('<p a="1&#13;2">x&#13;y &lt;&amp;&gt;</p>');
    const out = serializeXml(doc);
    expect(out).toContain("x&#13;y &lt;&amp;&gt;");
    const again = parseXml(out).documentElement;
    expect(again?.textContent).toBe("x\ry <&>");
    expect(again?.getAttribute("a")).toBe("1\r2");
  });

  it("writes a document built with the DOM API", () => {
    const doc = newDocument();
    const root = doc.documentElement;
    root?.setAttribute("status", 'a "quoted" <value>');
    root?.appendChild(doc.createTextNode("Synthetic text"));
    root?.appendChild(doc.createComment(" a comment "));
    root?.appendChild(doc.createCDATASection("<raw>"));
    root?.appendChild(doc.createProcessingInstruction("app", "step=1"));
    const out = serializeXml(doc);
    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<root status="a &quot;quoted&quot; &lt;value&gt;">Synthetic text<!-- a comment --><![CDATA[<raw>]]><?app step=1?></root>',
    );
    expect(serializeXml(parseXml(out))).toBe(out);
  });

  it("writes an instruction other than the declaration first in a document as it is", () => {
    const doc = newDocument();
    doc.insertBefore(doc.createProcessingInstruction("app", "step=1"), doc.firstChild);
    expect(serializeXml(doc)).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<?app step=1?><root/>');
  });

  it("writes a namespaced element and attribute with their declarations", () => {
    const doc = newDocument();
    doc.documentElement?.setAttributeNS("urn:example:attr", "p:a", "1");
    doc.documentElement?.appendChild(doc.createElementNS("urn:example:el", "x"));
    const out = serializeXml(doc);
    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<root xmlns:p="urn:example:attr" p:a="1"><x xmlns="urn:example:el"/></root>',
    );
    expect(serializeXml(parseXml(out))).toBe(out);
  });

  it("round-trips any allowed text and attribute value (property)", () => {
    const allowed = fc
      .string({ unit: "binary" })
      .filter((s) => !/[\0-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF\uFFFE\uFFFF]/u.test(s));
    fc.assert(
      fc.property(allowed, allowed, (text, value) => {
        const doc = newDocument();
        doc.documentElement?.setAttribute("v", value);
        doc.documentElement?.appendChild(doc.createTextNode(text));
        const back = parseXml(serializeXml(doc)).documentElement;
        expect(back?.getAttribute("v")).toBe(value);
        expect(back?.textContent).toBe(text);
      }),
      { numRuns: 200 },
    );
  });
});

describe("serializeXml refuses a tree parseXml would not read back", () => {
  it("refuses a DOCTYPE", () => {
    const impl = new (xmldom().DOMImplementation)();
    const doc = impl.createDocument(null, "root", impl.createDocumentType("root", "", MARKER));
    expect(refusalOf(doc)).toBe(
      "serializeXml: the tree holds a DOCTYPE, which parseXml refuses, so it was not written.",
    );
  });

  it("refuses a forbidden character in every place a node holds one, naming only the code point", () => {
    const places: ((doc: ReturnType<typeof newDocument>, value: string) => void)[] = [
      (doc, value) => doc.documentElement?.appendChild(doc.createTextNode(value)),
      (doc, value) => doc.documentElement?.appendChild(doc.createTextNode(`${value}\r`)),
      (doc, value) => doc.documentElement?.setAttribute("a", value),
      (doc, value) => doc.documentElement?.appendChild(doc.createComment(value)),
      (doc, value) => doc.documentElement?.appendChild(doc.createCDATASection(value)),
      (doc, value) =>
        doc.documentElement?.appendChild(doc.createProcessingInstruction("app", value)),
      (doc, value) =>
        doc.insertBefore(doc.createProcessingInstruction("xml", value), doc.firstChild),
    ];
    for (const [index, place] of places.entries()) {
      const doc = newDocument();
      place(doc, `${MARKER}\u0001`);
      const message = refusalOf(doc);
      expect(message, String(index)).toBe(
        "serializeXml: the tree holds U+0001, a character XML 1.0 does not allow in a document, so it was not written.",
      );
      expect(message).not.toContain(MARKER);
    }
  });

  it("refuses a forbidden character in a namespace it would declare, element or attribute", () => {
    const places: ((doc: ReturnType<typeof newDocument>, uri: string) => void)[] = [
      (doc, uri) => doc.documentElement?.appendChild(doc.createElementNS(uri, "x")),
      (doc, uri) => doc.documentElement?.setAttributeNS(uri, "p:a", "1"),
    ];
    for (const [index, place] of places.entries()) {
      const doc = newDocument();
      place(doc, `urn:${MARKER}\uFFFE`);
      const message = refusalOf(doc);
      expect(message, String(index)).toBe(
        "serializeXml: the tree holds U+FFFE, a character XML 1.0 does not allow in a document, so it was not written.",
      );
    }
  });

  it("refuses what is not well-formed, naming nothing the tree holds", () => {
    const cases: ((doc: ReturnType<typeof newDocument>) => void)[] = [
      (doc) => doc.documentElement?.appendChild(doc.createComment(`${MARKER}--`)),
      (doc) => doc.documentElement?.appendChild(doc.createComment(`${MARKER}-`)),
      (doc) => {
        const cdata = doc.createCDATASection(MARKER);
        cdata.data = `${MARKER}]]>`;
        doc.documentElement?.appendChild(cdata);
      },
      (doc) => {
        const pi = doc.createProcessingInstruction("app", MARKER);
        pi.data = `${MARKER}?>`;
        doc.documentElement?.appendChild(pi);
      },
      (doc) => doc.documentElement?.appendChild(doc.createElement(`${MARKER} x`)),
      // A declaration anywhere but first. One first whose data would close it early is an XML
      // declaration that is not one, refused below.
      (doc) => doc.documentElement?.appendChild(doc.createProcessingInstruction("xml", MARKER)),
      (doc) => doc.appendChild(doc.createProcessingInstruction("xml", MARKER)),
      // A processing instruction target may hold no colon (Namespaces in XML 1.0, section 7).
      (doc) => doc.documentElement?.appendChild(doc.createProcessingInstruction("app:x", "1")),
      // A namespace declaration whose name is not an XML name.
      (doc) => doc.documentElement?.setAttribute("xmlns:a b", "urn:example:a"),
      (doc) => {
        const root = doc.documentElement;
        if (root !== null) doc.removeChild(root);
      },
    ];
    for (const [index, change] of cases.entries()) {
      const doc = newDocument();
      change(doc);
      const message = refusalOf(doc);
      expect(message, String(index)).toMatch(/^serializeXml: the tree is not well-formed XML /u);
      expect(message, String(index)).not.toContain(MARKER);
      expect("cause" in (thrownBy(() => serializeXml(doc)) as Error), String(index)).toBe(false);
    }
  });
});

/** NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR: XML's end-of-line handling reads each as a line feed. */
const NEL = String.fromCharCode(0x85);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

describe("serializeXml writes only what parseXml reads back to the same tree", () => {
  it("refuses a DTD or entity marker, in any case, in a comment, CDATA section or instruction", () => {
    const places: ((doc: ReturnType<typeof newDocument>, data: string) => void)[] = [
      (doc, data) => doc.documentElement?.appendChild(doc.createComment(data)),
      (doc, data) => doc.documentElement?.appendChild(doc.createCDATASection(data)),
      (doc, data) => doc.documentElement?.appendChild(doc.createProcessingInstruction("app", data)),
      (doc, data) => doc.insertBefore(doc.createProcessingInstruction("app", data), doc.firstChild),
    ];
    for (const marker of ["<!DOCTYPE x", "<!ENTITY x", "<!doctype", "<!eNtItY"]) {
      for (const [index, place] of places.entries()) {
        const doc = newDocument();
        place(doc, `${MARKER} ${marker}`);
        const message = refusalOf(doc);
        expect(message, `${marker} ${String(index)}`).toBe(
          "serializeXml: the tree holds '<!DOCTYPE' or '<!ENTITY' in a comment, CDATA section or processing instruction, which parseXml refuses, so it was not written.",
        );
        expect(message).not.toContain(MARKER);
      }
    }
  });

  it("refuses a line break a parse rewrites, in a comment, CDATA section or instruction", () => {
    const places: ((doc: ReturnType<typeof newDocument>, data: string) => void)[] = [
      (doc, data) => doc.documentElement?.appendChild(doc.createComment(data)),
      (doc, data) => doc.documentElement?.appendChild(doc.createCDATASection(data)),
      (doc, data) => doc.documentElement?.appendChild(doc.createProcessingInstruction("app", data)),
    ];
    const breaks = [
      ["\r", "U+000D"],
      [NEL, "U+0085"],
      [LINE_SEPARATOR, "U+2028"],
      [PARAGRAPH_SEPARATOR, "U+2029"],
    ] as const;
    for (const [char, label] of breaks) {
      for (const [index, place] of places.entries()) {
        const doc = newDocument();
        place(doc, `${MARKER}${char}x`);
        const message = refusalOf(doc);
        expect(message, `${label} ${String(index)}`).toBe(
          `serializeXml: the tree holds ${label} in a comment, CDATA section or processing instruction, where a parse reads it as a line feed, so it was not written.`,
        );
        expect(message).not.toContain(MARKER);
      }
    }
  });

  it("keeps a line feed and a tab in a comment, CDATA section and instruction", () => {
    const doc = newDocument();
    doc.documentElement?.appendChild(doc.createComment("a\nb\tc"));
    doc.documentElement?.appendChild(doc.createCDATASection("a\nb\tc"));
    doc.documentElement?.appendChild(doc.createProcessingInstruction("app", "a\nb\tc"));
    const out = serializeXml(doc);
    expect(out).toContain("<!--a\nb\tc--><![CDATA[a\nb\tc]]><?app a\nb\tc?>");
    expect(serializeXml(parseXml(out))).toBe(out);
  });

  it("refuses a leading xml declaration whose data is not an XML declaration", () => {
    const bad = [
      "garbage",
      'version="1.0" ?',
      'version="1.0"><!DOCTYPE r',
      'version="1.0',
      "version=1.0",
      'version="2.0"',
      'version="1."',
      'version="1x0"',
      `version="1.0'`,
      'version="1.0" encoding=""',
      'version="1.0" encoding="UTF 8"',
      'version="1.0" standalone="yes"x',
      'encoding="UTF-8"',
      'version="1.0" standalone="yes" encoding="UTF-8"',
      'version="1.0" standalone="maybe"',
      'version="1.0" encoding="8bit"',
      'version="1.0"encoding="UTF-8"',
      `version="1.0" encoding='UTF-8"`,
      'version="1.0"\r',
      ' version="1.0"',
      `version="1.0" ${MARKER}`,
      `version="1.0" ${MARKER}?>`,
    ];
    for (const data of bad) {
      const doc = newDocument();
      const pi = doc.createProcessingInstruction("xml", "placeholder");
      // Set after creation: createProcessingInstruction itself refuses data holding '?>'.
      pi.data = data;
      doc.insertBefore(pi, doc.firstChild);
      const message = refusalOf(doc);
      expect(message, data).toBe(
        "serializeXml: the tree holds an XML declaration that is not one (a version, then an optional encoding and standalone), so it was not written.",
      );
    }
  });

  it("writes a leading xml declaration that matches the grammar, as it is", () => {
    const good = [
      'version="1.0"',
      "version='1.0'",
      'version = "1.0"',
      'version="1.1"',
      'version="1.0" encoding="UTF-8"',
      `version="1.0" encoding='iso-8859-1'`,
      'version="1.0" standalone="no"',
      'version="1.0" encoding="UTF-8" standalone="yes"',
      'version="1.0"\tencoding="UTF-8"\n standalone="yes" ',
      'version="1.10"',
      "version='1.10'  encoding='UTF-8'  standalone='no'",
      "version\n=\n'1.0'\n\nencoding\t=\t\"Latin_1.x-y\"",
      `version="1.0" standalone = 'yes'`,
    ];
    for (const data of good) {
      const doc = newDocument();
      doc.insertBefore(doc.createProcessingInstruction("xml", data), doc.firstChild);
      const out = serializeXml(doc);
      expect(out, data).toBe(`<?xml ${data}?><root/>`);
      expect(parseXml(out).documentElement?.localName, data).toBe("root");
    }
  });

  it("writes NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR as references, in text and attributes", () => {
    // Each separator twice, so a writer that replaces only the first one is caught.
    const value = `a${LINE_SEPARATOR}b${NEL}c${PARAGRAPH_SEPARATOR}d\r\ne${LINE_SEPARATOR}${NEL}${PARAGRAPH_SEPARATOR}`;
    const doc = newDocument();
    doc.documentElement?.setAttribute("v", value);
    doc.documentElement?.appendChild(doc.createTextNode(value));
    const out = serializeXml(doc);
    const refs = "&#x2028;&#x85;&#x2029;";
    expect(out).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<root v="a&#x2028;b&#x85;c&#x2029;d&#13;&#10;e${refs}">a&#x2028;b&#x85;c&#x2029;d&#13;\ne${refs}</root>`,
    );
    const back = parseXml(out).documentElement;
    expect(back?.getAttribute("v")).toBe(value);
    expect(back?.textContent).toBe(value);
  });

  it("still refuses an attribute name that is not an XML name when its value holds a line separator", () => {
    const doc = newDocument();
    doc.documentElement?.setAttribute(`${MARKER} x`, `a${LINE_SEPARATOR}b`);
    const message = refusalOf(doc);
    expect(message).toMatch(/^serializeXml: the tree is not well-formed XML /u);
    expect(message).not.toContain(MARKER);
  });

  it("refuses a prefixed element or attribute name with no namespace", () => {
    const cases: ((doc: ReturnType<typeof newDocument>) => void)[] = [
      (doc) => doc.documentElement?.setAttribute(`${MARKER}:b`, "1"),
      (doc) => doc.documentElement?.appendChild(doc.createElement(`${MARKER}:b`)),
      // Only a name that starts with `xmlns:` or `xml:` is bound in every document.
      (doc) => doc.documentElement?.setAttribute(`${MARKER}:xml:b`, "1"),
      (doc) => doc.documentElement?.setAttribute(`${MARKER}:xmlns:b`, "1"),
      (doc) => doc.documentElement?.appendChild(doc.createElement("xml:b")),
    ];
    for (const [index, change] of cases.entries()) {
      const doc = newDocument();
      change(doc);
      const message = refusalOf(doc);
      expect(message, String(index)).toBe(
        "serializeXml: the tree holds a prefixed name with no namespace, which no declaration binds, so it was not written.",
      );
    }
  });

  it("writes a namespace declaration and an xml: attribute set without a namespace", () => {
    const doc = newDocument();
    doc.documentElement?.setAttribute("xmlns:p", "urn:example:p");
    doc.documentElement?.setAttribute("xml:lang", "en");
    const out = serializeXml(doc);
    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<root xmlns:p="urn:example:p" xml:lang="en"/>',
    );
    const back = parseXml(out).documentElement;
    expect(back?.getAttribute("xmlns:p")).toBe("urn:example:p");
    expect(back?.getAttribute("xml:lang")).toBe("en");
  });

  it("round-trips text and attribute values rich in line breaks and markup (property)", () => {
    const allowedChar = fc
      .string({ unit: "binary", minLength: 1, maxLength: 1 })
      .filter((s) => !/[\0-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF\uFFFE\uFFFF]/u.test(s));
    const unit = fc.oneof(
      fc.constantFrom(
        "\r",
        "\n",
        "\r\n",
        "\t",
        NEL,
        LINE_SEPARATOR,
        PARAGRAPH_SEPARATOR,
        "&",
        "<",
        ">",
        '"',
        "'",
        "]]>",
      ),
      allowedChar,
    );
    const rich = fc.array(unit, { maxLength: 24 }).map((parts) => parts.join(""));
    fc.assert(
      fc.property(rich, rich, (text, value) => {
        const doc = newDocument();
        doc.documentElement?.setAttribute("v", value);
        doc.documentElement?.appendChild(doc.createTextNode(text));
        const back = parseXml(serializeXml(doc)).documentElement;
        expect(back?.getAttribute("v")).toBe(value);
        expect(back?.textContent).toBe(text);
      }),
      { numRuns: 300 },
    );
  });
});

describe("parseXml refuses a limit that is NaN", () => {
  for (const field of [
    "maxInputBytes",
    "maxDepth",
    "maxNodeCount",
    "maxEntityExpansions",
  ] as const) {
    it(`refuses ${field}: NaN with a TypeError, rather than lifting the cap`, () => {
      const err = thrownBy(() => parseXml("<a><b/></a>", { limits: { [field]: Number.NaN } }));
      expect(err).toBeInstanceOf(TypeError);
      expect((err as TypeError).message).toBe(
        `parseXml: options.limits.${field} is NaN, which would turn its cap off; give a number, or leave it out for the default.`,
      );
    });
  }

  it("still takes a cap of Infinity, which lifts it, as parseCcda does", () => {
    const limits = { maxDepth: Number.POSITIVE_INFINITY };
    expect(parseXml("<a><b/></a>", { limits }).documentElement?.localName).toBe("a");
  });
});

/** The `TypeError` message `serializeXml` throws for a reason. */
function refused(why: string): string {
  return `serializeXml: the tree ${why}, so it was not written.`;
}

const TWO_NAMESPACES = refused(
  "binds one prefix to two namespaces on one element, which no start tag can declare",
);

const XMLNS = "http://www.w3.org/2000/xmlns/";
const XML = "http://www.w3.org/XML/1998/namespace";

describe("serializeXml writes namespaces itself, through one escaping path", () => {
  it("writes NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR in a namespace as references", () => {
    const places: ((doc: ReturnType<typeof newDocument>, uri: string) => () => unknown)[] = [
      (doc, uri) => {
        doc.documentElement?.appendChild(doc.createElementNS(uri, "p:c"));
        return () => doc.documentElement?.firstChild;
      },
      (doc, uri) => {
        doc.documentElement?.appendChild(doc.createElementNS(uri, "c"));
        return () => doc.documentElement?.firstChild;
      },
      (doc, uri) => {
        doc.documentElement?.setAttributeNS(uri, "p:x", "1");
        return () => doc.documentElement?.getAttributeNode("p:x");
      },
    ];
    for (const [char, ref] of [
      [NEL, "&#x85;"],
      [LINE_SEPARATOR, "&#x2028;"],
      [PARAGRAPH_SEPARATOR, "&#x2029;"],
    ] as const) {
      for (const [index, place] of places.entries()) {
        const uri = `urn:a${char}b`;
        const doc = newDocument();
        place(doc, uri);
        const out = serializeXml(doc);
        expect(out, `${ref} ${String(index)}`).toContain(`="urn:a${ref}b"`);
        const back = parseXml(out);
        const node = place(back, "urn:unused")() as { namespaceURI: string | null };
        expect(node.namespaceURI, `${ref} ${String(index)}`).toBe(uri);
      }
    }
  });

  it("refuses one prefix bound to two namespaces on one element", () => {
    const cases: ((doc: ReturnType<typeof newDocument>) => void)[] = [
      (doc) => {
        const e = doc.createElementNS("urn:example:a", "p:e");
        e.setAttributeNS("urn:example:b", "p:c", "2");
        doc.documentElement?.appendChild(e);
      },
      (doc) => {
        doc.documentElement?.setAttributeNS("urn:example:a", "p:b", "1");
        doc.documentElement?.setAttributeNS("urn:example:b", "p:c", "2");
      },
      // A declaration the element carries, against its own namespace.
      (doc) => {
        const e = doc.createElementNS("urn:example:a", "p:e");
        e.setAttribute("xmlns:p", "urn:example:z");
        doc.documentElement?.appendChild(e);
      },
      (doc) => {
        const e = doc.createElementNS(null, "e");
        e.setAttribute("xmlns", "urn:example:z");
        doc.documentElement?.appendChild(e);
      },
    ];
    for (const [index, change] of cases.entries()) {
      const doc = newDocument();
      change(doc);
      expect(refusalOf(doc), String(index)).toBe(TWO_NAMESPACES);
    }
  });

  it("refuses one prefix declared twice on one element", () => {
    for (const uri of ["urn:example:a", "urn:example:b"]) {
      const doc = newDocument();
      doc.documentElement?.setAttribute("xmlns:p", "urn:example:a");
      doc.documentElement?.setAttributeNS(XMLNS, "xmlns:p", uri);
      expect(refusalOf(doc), uri).toBe(
        refused("declares one prefix twice on one element, which a parse refuses"),
      );
    }
  });

  it("rebinds a prefix on a child, and undeclares the default namespace, so each reads back", () => {
    const doc = parseXml('<r xmlns:p="urn:example:a" xmlns="urn:example:d"><p:c/></r>');
    doc.documentElement?.setAttribute("xmlns:p", "urn:example:z");
    doc.documentElement?.appendChild(doc.createElementNS(null, "n"));
    const out = serializeXml(doc);
    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<r xmlns:p="urn:example:z" xmlns="urn:example:d"><p:c xmlns:p="urn:example:a"/><n xmlns=""/></r>',
    );
    const back = parseXml(out).documentElement;
    expect((back?.firstChild as { namespaceURI: string | null }).namespaceURI).toBe(
      "urn:example:a",
    );
    expect((back?.lastChild as { namespaceURI: string | null }).namespaceURI).toBeNull();
  });

  it("keeps a default namespace undeclared on an element, and on what it holds", () => {
    const text =
      '<?xml version="1.0" encoding="UTF-8"?>\n<r xmlns="urn:example:d"><c xmlns=""><d/></c></r>';
    expect(serializeXml(parseXml(text))).toBe(text);
  });

  it("refuses an element with the prefix xmlns", () => {
    const doc = newDocument();
    doc.documentElement?.appendChild(doc.createElementNS(XMLNS, "xmlns:foo"));
    expect(refusalOf(doc)).toBe(
      refused(
        "holds an element with the prefix xmlns, which only a namespace declaration may carry",
      ),
    );
  });

  it("refuses a declaration or a name Namespaces in XML 1.0 forbids", () => {
    const cases: ((doc: ReturnType<typeof newDocument>) => void)[] = [
      (doc) => doc.documentElement?.setAttribute("xmlns:xmlns", "urn:example:a"),
      (doc) => doc.documentElement?.setAttribute("xmlns:p", ""),
      (doc) => doc.documentElement?.setAttribute("xmlns:p", XML),
      (doc) => doc.documentElement?.setAttribute("xmlns:xml", "urn:example:a"),
      (doc) => doc.documentElement?.setAttribute("xmlns", XMLNS),
    ];
    for (const [index, change] of cases.entries()) {
      const doc = newDocument();
      change(doc);
      expect(refusalOf(doc), String(index)).toBe(
        refused(
          "holds a name or declaration Namespaces in XML 1.0 forbids (the prefix xmlns, the xml or xmlns namespace under another prefix, or a prefix bound to no namespace)",
        ),
      );
    }
  });

  it("writes the xml namespace under its own prefix, declared or not", () => {
    const doc = newDocument();
    doc.documentElement?.setAttribute("xmlns:xml", XML);
    doc.documentElement?.setAttributeNS(XML, "xml:space", "preserve");
    doc.documentElement?.appendChild(doc.createElementNS(XML, "xml:c"));
    const out = serializeXml(doc);
    expect(out).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<root xmlns:xml="${XML}" xml:space="preserve"><xml:c/></root>`,
    );
  });

  it("refuses an attribute in a namespace with no prefix", () => {
    const doc = newDocument();
    doc.documentElement?.setAttributeNS("urn:example:a", "y", "1");
    expect(refusalOf(doc)).toBe(
      refused("holds an attribute in a namespace with no prefix, which no declaration can give it"),
    );
  });
});

describe("serializeXml refuses a node outside the root that a parse drops or rewrites", () => {
  it("refuses text that is not white space directly under the document", () => {
    for (const before of [true, false]) {
      const doc = newDocument();
      const text = doc.createTextNode(`${MARKER} note`);
      if (before) doc.insertBefore(text, doc.documentElement);
      else doc.appendChild(text);
      const message = refusalOf(doc);
      expect(message).toBe(refused("holds text outside the root element, which parseXml refuses"));
      expect(message).not.toContain(MARKER);
    }
  });

  it("refuses a CDATA section directly under the document", () => {
    for (const before of [true, false]) {
      const doc = newDocument();
      const cdata = doc.createCDATASection("note");
      if (before) doc.insertBefore(cdata, doc.documentElement);
      else doc.appendChild(cdata);
      expect(refusalOf(doc)).toBe(
        refused("holds a CDATA section outside the root element, which parseXml refuses"),
      );
    }
  });

  it("writes white space, a comment and an instruction outside the root as they are", () => {
    const doc = newDocument();
    doc.insertBefore(doc.createTextNode(" \n\t"), doc.documentElement);
    doc.appendChild(doc.createTextNode("\r\n"));
    doc.appendChild(doc.createComment("after"));
    doc.appendChild(doc.createProcessingInstruction("app", "x"));
    const out = serializeXml(doc);
    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n \n\t<root/>\r\n<!--after--><?app x?>',
    );
  });

  it("refuses an instruction whose data starts with white space, which a parse drops", () => {
    for (const data of [" x", "\tx", "\nx", " "]) {
      const doc = newDocument();
      doc.documentElement?.appendChild(doc.createProcessingInstruction("foo", data));
      expect(refusalOf(doc), JSON.stringify(data)).toBe(
        refused(
          "holds a processing instruction whose data starts with white space, which a parse drops",
        ),
      );
    }
  });

  it("writes an instruction with no data, or data with inner white space, so it reads back", () => {
    const doc = newDocument();
    doc.documentElement?.appendChild(doc.createProcessingInstruction("foo", ""));
    doc.documentElement?.appendChild(doc.createProcessingInstruction("bar", "x  y "));
    const out = serializeXml(doc);
    expect(out).toContain("<root><?foo?><?bar x  y ?></root>");
    const back = parseXml(out).documentElement;
    expect((back?.firstChild as unknown as { data: string }).data).toBe("");
    expect((back?.lastChild as unknown as { data: string }).data).toBe("x  y ");
  });
});

describe("serializeXml reads its own output back before it returns it", () => {
  it("refuses a tree whose text parseXml refuses, naming the code and nothing of the tree", () => {
    const doc = newDocument();
    doc.documentElement?.setAttribute("xml:lang", MARKER);
    doc.documentElement?.setAttributeNS(XML, "xml:lang", MARKER);
    const message = refusalOf(doc);
    expect(message).toBe(
      refused("would be written as text parseXml refuses (NOT_WELL_FORMED_XML)"),
    );
    expect(message).not.toContain(MARKER);
  });

  it("joins adjacent text and drops an empty text node or CDATA section, as a parse does", () => {
    const doc = newDocument();
    const root = doc.documentElement;
    root?.appendChild(doc.createTextNode("a"));
    root?.appendChild(doc.createCDATASection(""));
    root?.appendChild(doc.createTextNode("b"));
    root?.appendChild(doc.createTextNode(""));
    expect(serializeXml(doc)).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<root>ab</root>');
  });

  it("writes a tree far deeper than the call stack allows recursion for", () => {
    const doc = newDocument();
    let at = doc.documentElement;
    for (let depth = 0; depth < 10_000; depth += 1) {
      const child = doc.createElement("a");
      at?.appendChild(child);
      at = child;
    }
    const out = serializeXml(doc);
    expect(out).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<root>${"<a>".repeat(9_999)}<a/>${"</a>".repeat(9_999)}</root>`,
    );
  });

  it("refuses a node that is not a document or an element, or one no DOM built", () => {
    const text = parseXml("<r>x</r>").documentElement?.firstChild;
    expect(refusalOf(text as never)).toBe(refused("is not a document or an element"));
    const entity = {
      nodeType: 1,
      nodeName: "r",
      namespaceURI: null,
      attributes: [],
      childNodes: [{ nodeType: 5, nodeName: MARKER, childNodes: [] }],
    };
    expect(refusalOf(entity as never)).toBe(
      refused("holds a node of a kind XML text cannot hold there (such as an entity reference)"),
    );
    const broken = {
      nodeType: 1,
      get nodeName(): string {
        throw new Error(MARKER);
      },
    };
    const message = refusalOf(broken as never);
    expect(message).toBe(refused("could not be read as a DOM tree"));
    expect("cause" in (thrownBy(() => serializeXml(broken as never)) as Error)).toBe(false);
  });
});

describe("the tree comparison serializeXml reads back with", () => {
  /** The first difference between the tree of text `a` (or a node) and the document of text `b`. */
  function differs(
    a: string | Parameters<typeof firstDifference>[0],
    b: string,
  ): string | undefined {
    const left = typeof a === "string" ? (parseXml(a) as never) : a;
    return firstDifference(left, parseXml(b) as never);
  }

  it("finds no difference between a tree and itself, or the declaration the writer adds", () => {
    const text =
      '<r xmlns:p="urn:example:a" p:a="1" b="2"><!--c--><?app x?><![CDATA[d]]>e<p:f/></r>';
    expect(differs(text, text)).toBeUndefined();
    expect(differs(text, `<?xml version="1.0"?>\n${text}`)).toBeUndefined();
    expect(differs(`<!--c-->\n${text}\n`, `<!--c-->${text}`)).toBeUndefined();
    expect(differs('<r a="1"/>', '<r xmlns:p="urn:example:a" a="1"/>')).toBeUndefined();
  });

  it("names the kind of the first node that differs, and nothing it holds", () => {
    const rows: [string, string, string][] = [
      ["<r/>", "<s/>", "an element"],
      ["<r/>", '<r xmlns="urn:example:a"/>', "an element"],
      ['<r a="1"/>', '<r a="2"/>', "an attribute"],
      ['<r a="1" b="2"/>', '<r a="1"/>', "an attribute"],
      ['<r a="1"/>', '<r a="1" b="2"/>', "an attribute"],
      ['<r xmlns:p="urn:example:a"/>', '<r xmlns:p="urn:example:b"/>', "a namespace declaration"],
      ['<r xmlns:p="urn:example:a"/>', "<r/>", "a namespace declaration"],
      ["<r>a</r>", "<r>b</r>", "text"],
      ["<r><![CDATA[a]]></r>", "<r><![CDATA[b]]></r>", "a CDATA section"],
      ["<r><!--a--></r>", "<r><!--b--></r>", "a comment"],
      ["<r><?a x?></r>", "<r><?b x?></r>", "a processing instruction"],
      ["<r><?a x?></r>", "<r><?a y?></r>", "a processing instruction"],
      ["<r>a</r>", "<r><![CDATA[a]]></r>", "text"],
      ["<r><a/></r>", "<r><a/><a/></r>", "the nodes of an element or document"],
      ["<r><a><b/></a></r>", "<r><a><c/></a></r>", "an element"],
      ["<!--a--><r/>", "<r/>", "the nodes of an element or document"],
      ['<?xml version="1.0"?><r/>', "<r/>", "the nodes of an element or document"],
    ];
    for (const [a, b, kind] of rows) {
      expect(differs(a, b), `${a} / ${b}`).toBe(kind);
    }
  });

  it("compares an element with the root of the text it was written as", () => {
    const element = parseXml('<r><c a="1">x</c></r>').documentElement?.firstChild;
    expect(differs(element as never, '<c a="1">x</c>')).toBeUndefined();
    expect(differs(element as never, '<c a="1">y</c>')).toBe("text");
  });

  it("reports text parseXml refuses by its fatal code", () => {
    expect(readBackDifference("<r", parseXml("<r/>") as never)).toBe(
      "would be written as text parseXml refuses (NOT_WELL_FORMED_XML)",
    );
    expect(readBackDifference('<r a="2"/>', parseXml('<r a="1"/>') as never)).toBe(
      "would not read back the same (an attribute differs)",
    );
  });

  it("reads back without the reader's limits, which the writer does not apply", () => {
    const deep = `${"<a>".repeat(1_200)}${"</a>".repeat(1_200)}`;
    expect(readBackDifference(deep, parseXml(deep, { limits: { maxDepth: 2_000 } }) as never)).toBe(
      undefined,
    );
  });
});

describe("serializeXml and its check, at the edges each choice turns on", () => {
  it("refuses a name in a namespace that is not an XML name, which no DOM call builds", () => {
    const message = refusalOf(fakeElement(`${MARKER}:q:r`, "urn:example:a"));
    expect(message).toMatch(/^serializeXml: the tree is not well-formed XML /u);
    expect(message).not.toContain(MARKER);
  });

  it("refuses an element in the xmlns namespace under another prefix, which no DOM call builds", () => {
    expect(refusalOf(fakeElement("foo:c", XMLNS))).toBe(
      refused(
        "holds a name or declaration Namespaces in XML 1.0 forbids (the prefix xmlns, the xml or xmlns namespace under another prefix, or a prefix bound to no namespace)",
      ),
    );
  });

  it("writes an element in the xml namespace with no declaration, since xml is always bound", () => {
    const doc = newDocument();
    doc.documentElement?.appendChild(doc.createElementNS(XML, "xml:c"));
    expect(serializeXml(doc)).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<root><xml:c/></root>');
  });

  it("writes a quote, tab and line feed in a namespace and a value as references", () => {
    const uri = 'urn:a"\t\nb';
    const doc = newDocument();
    doc.documentElement?.setAttributeNS(uri, "p:x", "1\t2");
    const out = serializeXml(doc);
    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<root xmlns:p="urn:a&quot;&#9;&#10;b" p:x="1&#9;2"/>',
    );
    const attr = parseXml(out).documentElement?.getAttributeNode("p:x");
    expect(attr?.namespaceURI).toBe(uri);
    expect(attr?.value).toBe("1\t2");
  });

  it("refuses an instruction with the target xml in any case inside the root", () => {
    for (const target of ["xml", "XML", "XmL"]) {
      const doc = newDocument();
      doc.documentElement?.appendChild(doc.createProcessingInstruction(target, "a"));
      expect(refusalOf(doc), target).toMatch(/^serializeXml: the tree is not well-formed XML /u);
    }
  });

  it("writes an instruction whose target only starts or ends with xml", () => {
    const doc = newDocument();
    doc.documentElement?.appendChild(doc.createProcessingInstruction("xml-stylesheet", "a"));
    doc.documentElement?.appendChild(doc.createProcessingInstruction("myxml", "b"));
    expect(serializeXml(doc)).toContain("<root><?xml-stylesheet a?><?myxml b?></root>");
  });

  it("tells a namespace declaration from another attribute by its name and namespace", () => {
    const attr = (nodeName: string, namespaceURI: string | null): never => {
      const plain = { nodeName, namespaceURI };
      return plain as never;
    };
    expect(declaredPrefix(attr("xmlns", null))).toBe("");
    expect(declaredPrefix(attr("xmlns:p", null))).toBe("p");
    expect(declaredPrefix(attr("xmlns:p", XMLNS))).toBe("p");
    expect(declaredPrefix(attr("xmlns:p", "urn:example:a"))).toBeUndefined();
    expect(declaredPrefix(attr("xmlnsp", null))).toBeUndefined();
    expect(declaredPrefix(attr("p:xmlns", null))).toBeUndefined();
  });

  it("compares an empty comment, and white space in a comment outside the root", () => {
    expect(firstDifference(parseXml("<r><!----></r>") as never, parseXml("<r/>") as never)).toBe(
      "the nodes of an element or document",
    );
    expect(firstDifference(parseXml("<!-- --><r/>") as never, parseXml("<r/>") as never)).toBe(
      "the nodes of an element or document",
    );
  });

  it("compares text outside the root that is not white space, and a document with no nodes", () => {
    const doc = newDocument();
    doc.insertBefore(doc.createTextNode("x"), doc.documentElement);
    expect(firstDifference(doc as never, parseXml("<root/>") as never)).toBe(
      "the nodes of an element or document",
    );
    const empty = new (xmldom().DOMImplementation)().createDocument(null, "", null);
    expect(firstDifference(empty as never, parseXml("<root/>") as never)).toBe(
      "the nodes of an element or document",
    );
  });

  it("compares the namespace of each attribute, an xml: one in the xml namespace", () => {
    const inNamespace = newDocument();
    inNamespace.documentElement?.setAttributeNS("urn:example:a", "p:x", "1");
    expect(
      firstDifference(
        inNamespace as never,
        parseXml('<root xmlns:p="urn:example:b" p:x="1"/>') as never,
      ),
    ).toBe("an attribute");
    const unbound = newDocument();
    unbound.documentElement?.setAttribute("x:y", "1");
    expect(
      firstDifference(unbound as never, parseXml(`<root xmlns:x="${XML}" x:y="1"/>`) as never),
    ).toBe("an attribute");
    const lang = newDocument();
    lang.documentElement?.setAttribute("xml:lang", "en");
    expect(firstDifference(lang as never, parseXml('<root xml:lang="en"/>') as never)).toBe(
      undefined,
    );
  });
});
