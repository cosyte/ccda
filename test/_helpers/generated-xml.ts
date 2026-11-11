/**
 * Generated XML for the tests that compare this package's compact reader and its writer with
 * `@xmldom/xmldom`: documents built from elements, attributes, text, references, comments, CDATA
 * sections and processing instructions, mostly of the forms the reader reads, with a few of the
 * forms it hands back or that make a document malformed.
 */

import fc from "fast-check";

/**
 * Pick from `good` most of the time and from `bad` (what the reader hands back, or what makes the
 * document malformed) now and then, so most generated documents are read and compared.
 */
function mostly<T>(good: readonly T[], bad: readonly T[]): fc.Arbitrary<T> {
  return fc.oneof(
    { arbitrary: fc.constantFrom(...good), weight: 12 },
    { arbitrary: fc.constantFrom(...bad), weight: 1 },
  );
}

/** Names: the ASCII ones the reader reads, and a few it hands back. */
const NAME = mostly(
  ["a", "b", "templateId", "x.y", "_z", "a-b", "a1", "p:a", "q:b"],
  ["u:c", "xmlns"],
);
const ATTRIBUTE = mostly(
  ["a", "b", "c", "p:a", "q:b", "xml:lang", "xsi:type", "xmlns", "xmlns:p", "xmlns:q"],
  ["u:a", "xmlns:xml"],
);
const NAMESPACE = fc.constantFrom(
  "http://www.w3.org/1999/xhtml",
  "urn:x",
  "urn:y",
  "",
  "http://www.w3.org/2001/XMLSchema-instance",
);
const SPACE = fc.constantFrom(" ", "  ", "\n", "\t", "\r\n");
const TEXT_UNIT = mostly(
  [
    "x",
    " ",
    "\n",
    "\t",
    "\r",
    "&amp;",
    "&lt;",
    "&gt;",
    "&quot;",
    "&apos;",
    "&#10;",
    "&#x9;",
    "&#x1F600;",
    ">",
    "]]>",
    "\u00e9",
    "\ud83d\ude00",
    "\u2028",
    "\u0085",
  ],
  ["&#0;", "&bogus;", "&", "<"],
);
const ATTRIBUTE_UNIT = fc.oneof(TEXT_UNIT, fc.constantFrom('"', "'"));

/** An attribute: a name, white space around `=`, a quote and a value. */
const attribute = fc
  .tuple(
    ATTRIBUTE,
    fc.oneof(NAMESPACE, fc.string({ unit: ATTRIBUTE_UNIT, maxLength: 4 })),
    fc.constantFrom('"', "'"),
    fc.constantFrom("=", " = ", "=\n"),
  )
  .map(([name, value, quote, eq]) => {
    const clean = value.split(quote).join("");
    return `${name}${eq}${quote}${clean}${quote}`;
  });

/** Content: elements, text, comments, CDATA sections and instructions, nested a few levels. */
const content = fc.letrec<{ node: string; element: string }>((tie) => ({
  element: fc
    .tuple(
      NAME,
      fc.array(fc.tuple(SPACE, attribute), { maxLength: 3 }),
      fc.array(tie("node"), { maxLength: 4 }),
      fc.boolean(),
      fc.option(NAME, { freq: 8 }),
    )
    .map(([name, attrs, kids, selfClose, endName]) => {
      const start = `<${name}${attrs.map(([s, a]) => `${s}${a}`).join("")}`;
      if (selfClose && kids.length === 0) return `${start}/>`;
      return `${start}>${kids.join("")}</${endName ?? name}>`;
    }),
  // At the deepest level the first choice, text, is the one taken, so the recursion ends.
  node: fc.oneof(
    { depthSize: "small", maxDepth: 4, withCrossShrink: true },
    fc.string({ unit: TEXT_UNIT, maxLength: 6 }),
    tie("element"),
    mostly(
      ["<!-- c -->", "<!---->", "<![CDATA[a<&]]>", "<![CDATA[]]>", "<?pi?>", "<?pi d ?>"],
      ["<!-- a--b -->", "<![CDATA[a"],
    ),
  ),
}));

/** A document: a prolog, a root declaring the prefixes the names use (or not), and an epilog. */
export function generatedDocument(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(
        "",
        '<?xml version="1.0"?>\n',
        '<?xml-stylesheet type="text/xsl" href="a.xsl"?>\n',
        "\n<?pi?>\n<!-- p -->",
        " ",
      ),
      fc.constantFrom(
        ' xmlns="urn:hl7-org:v3" xmlns:p="urn:p" xmlns:q="urn:q" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        ' xmlns:p="urn:p"',
        "",
      ),
      fc.array(content.node, { maxLength: 5 }),
      fc.constantFrom("", "\n", "<!-- e -->", "\n<?pi d?>\n  ", "x"),
    )
    .map(([prolog, decls, kids, epilog]) => `${prolog}<r${decls}>${kids.join("")}</r>${epilog}`);
}
