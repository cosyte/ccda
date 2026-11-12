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

/** A document built with the DOM API, with a root `<root/>`. */
function newDocument(): ReturnType<typeof parseXml> {
  return new (xmldom().DOMImplementation)().createDocument(null, "root", null);
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
      .filter((s) => !/[\0-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF￾￿]/u.test(s));
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
