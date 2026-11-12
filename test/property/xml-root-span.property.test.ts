/**
 * The scan `parseXml` runs before `@xmldom/xmldom` builds the tree finds the root element where
 * xmldom does, for any well-formed text: attributes in both quote kinds with `>`, `/>`, an end tag
 * and the other quote in their values, namespaces, comments, CDATA sections and processing
 * instructions holding markup, inside the root and around it. And a start tag made not well-formed
 * in any of the ways XML 1.0 forbids is refused, wherever the change moves the end of the tag.
 *
 * The texts are written here as strings, so the place the root starts and ends is known from the
 * pieces, not read back by the code under test. Every value is synthetic.
 */

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { CcdaParseError, FATAL_CODES, parseXml } from "../../src/index.js";
import { rootSpan } from "../../src/parser/outside-root.js";
import { xmldom } from "../../src/parser/xmldom.js";

import { checkProperty, propertyTimeout } from "./_property.js";

// Each case writes and reads a small text, well under a millisecond; the budget scales with the
// depth `COSYTE_PROPERTY_RUNS` sets (see `./_property.ts`).
vi.setConfig({ testTimeout: propertyTimeout() });

/** White space between the parts of a tag: none, or any of XML's four characters. */
const gap = fc.constantFrom("", " ", "\t", "\n", "\r\n", "  ");
const space = fc.constantFrom(" ", "\t", "\n", "\r\n", " \n ");

/** A value's characters, rich in markup a scan could take for the end of a tag. */
const valuePart = fc.constantFrom(
  "v",
  ">",
  "/>",
  "&lt;/r>",
  " ",
  "&amp;",
  "&#62;",
  '"',
  "'",
  "-->",
);

/** An attribute value in either quote, with the quote it is in written as a reference. */
const value = fc
  .tuple(fc.constantFrom('"', "'"), fc.array(valuePart, { maxLength: 4 }))
  .map(([quote, parts]) => {
    const raw = parts.join("");
    const escaped = raw.replaceAll(quote, quote === '"' ? "&quot;" : "&apos;");
    return `${quote}${escaped}${quote}`;
  });

/** Attributes, each name once, in either namespace or none. */
const attributes = fc
  .uniqueArray(fc.constantFrom("x", "y", "id", "p:z", "q:w", "p:x"), { maxLength: 3 })
  .chain((names) =>
    fc
      .tuple(
        ...names.map((n) =>
          fc.tuple(space, gap, gap, value).map(([s, a, b, v]) => `${s}${n}${a}=${b}${v}`),
        ),
      )
      .map((parts) => parts.join("")),
  );

/** Content inside an element that holds markup characters but no markup a scan may end on. */
const inner = fc.constantFrom(
  "text",
  " > ",
  "]]",
  "&amp;",
  "<!-- </r> > -->",
  "<![CDATA[</r> <r> ]]>",
  "<?pi </r> ?>",
);

const elementName = fc.constantFrom("r", "a", "p:r", "q:b", "α");

const { element } = fc.letrec<{ element: string }>((tie) => ({
  element: fc.oneof(
    { depthSize: "small" },
    fc.tuple(elementName, attributes, gap).map(([n, a, g]) => `<${n}${a}${g}/>`),
    fc
      .tuple(
        elementName,
        attributes,
        gap,
        fc.array(fc.oneof(inner, tie("element")), { maxLength: 3 }),
        gap,
      )
      .map(([n, a, g, content, h]) => `<${n}${a}${g}>${content.join("")}</${n}${h}>`),
  ),
}));

/** The root: an element whose own start tag declares both prefixes the names use. */
const root = fc
  .tuple(elementName, attributes, gap, fc.array(fc.oneof(inner, element), { maxLength: 3 }))
  .map(([n, a, g, content]) => ({
    open: `<${n} xmlns:p="urn:example:p" xmlns:q='urn:example:q'${a}`,
    rest: `${g}>${content.join("")}</${n}>`,
  }));

/** What may sit outside the root: white space, comments and instructions. */
const misc = fc
  .array(fc.constantFrom(" ", "\n", "\r\n\t", "<!-- <r> -->", "<?pi a > b?>"), { maxLength: 3 })
  .map((parts) => parts.join(""));

const prolog = fc
  .tuple(
    fc.constantFrom("", '<?xml version="1.0"?>', "<?xml version='1.0' encoding='UTF-8'?>\n"),
    misc,
  )
  .map(([declaration, rest]) => `${declaration}${rest}`);

/** The root's text as xmldom writes its element back out. */
function written(text: string): string {
  const { DOMParser, XMLSerializer } = xmldom();
  const doc = new DOMParser({ onError: () => undefined }).parseFromString(text, "application/xml");
  return new XMLSerializer().serializeToString(doc.documentElement as never);
}

/** Ways to make the root's last attribute not well-formed, each from its name and quoted value. */
const breaks = fc.constantFrom(
  // unquoted, starting with a letter: a value of two quotes alone, `""`, would be quoted again
  (n: string, v: string) => `${n}=v${v.slice(1, -1)}`,
  (n: string, v: string) => `${n}=${v.slice(1, -1)}${v.slice(-1)}`, // no opening quote
  (n: string) => n, // no value
  (n: string) => `${n}=`, // no value after =
  (n: string, v: string) => `${n}=${v} ${n}=${v}`, // named twice
  (n: string, v: string) => `${n}=${v}${n.toUpperCase()}=${v}`, // no space before the next
  (n: string, v: string) => `${n}=${v.slice(0, 1)}<${v.slice(1)}`, // a less-than in the value
);

describe("the scan and xmldom agree on the root (property)", () => {
  it("finds the root's span where xmldom's root element is written from", () => {
    checkProperty(
      "rootSpan: the span xmldom reads as the root",
      fc.property(prolog, root, misc, (before, { open, rest }, after) => {
        const text = `${before}${open}${rest}${after}`;
        const span = rootSpan(text);
        expect(span).toEqual({
          start: before.length,
          end: before.length + open.length + rest.length,
        });
        expect(written(text.slice(span.start, span.end))).toBe(written(text));
        expect(parseXml(text).documentElement).not.toBeNull();
      }),
    );
  });

  it("refuses a root whose start tag is made not well-formed, wherever its end moves", () => {
    checkProperty(
      "parseXml: refuses a malformed start tag",
      fc.property(
        prolog,
        root,
        fc.constantFrom("k", "kk"),
        value,
        breaks,
        misc,
        fc.constantFrom("", "Synthetic", '"/>Synthetic"/>', "'/>Synthetic'/>"),
        (before, { open, rest }, name, quoted, broken, after, junk) => {
          const text = `${before}${open} ${broken(name, quoted)}${rest}${after}${junk}`;
          let code = "none";
          try {
            parseXml(text);
          } catch (err) {
            expect(err).toBeInstanceOf(CcdaParseError);
            code = (err as CcdaParseError).code;
          }
          expect(code).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
        },
      ),
    );
  });
});
