/**
 * The writer of the compact reader's tree (`src/serialize/write-tree.ts`) against
 * `serializeDocument` over the `@xmldom/xmldom` tree of the same text.
 *
 * A parsed document writes its XML with this writer whenever the compact reader reads its text, so
 * for every text it writes, the string must be the one `serializeDocument` writes for the DOM
 * `@xmldom/xmldom` builds from that text, character for character. These tests hold that over the
 * output-equivalence corpus, written cases for each node and escape, and generated XML; and they
 * require that the writer does write the documents a real sender writes.
 */

import fc from "fast-check";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { serializeDocument } from "../src/serialize/serialize-dom.js";
import { writeSource } from "../src/serialize/write-tree.js";
import { generatedDocument } from "./_helpers/generated-xml.js";
import { outputCorpus } from "./_output-corpus.js";
import { assertProperty, propertyTimeout } from "./property/_runner.js";

/** A character XML's end-of-line handling rewrites, as the gate scan looks for them. */
const LINE_BREAK_RE = /[\r\u0085\u2028\u2029]/u;

/** What `serializeDocument` writes for the `@xmldom/xmldom` tree of `source`, or `"fatal"`. */
function xmldomWrite(source: string): string {
  try {
    const doc = new DOMParser({
      onError: (level: string) => {
        if (level === "fatalError") throw new Error("fatal");
      },
    }).parseFromString(source, "application/xml");
    return serializeDocument(doc);
  } catch {
    return "fatal";
  }
}

/**
 * Whether the writer is right about `raw` (with any byte order mark removed): it hands the text
 * back, or it writes what `serializeDocument` writes. Returns which, for the counts.
 */
function check(raw: string): "written" | "handed back" {
  const source = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const ours = writeSource(source, LINE_BREAK_RE.test(source));
  if (ours === undefined) return "handed back";
  const theirs = xmldomWrite(source);
  if (ours !== theirs) {
    let at = 0;
    while (at < ours.length && ours[at] === theirs[at]) at += 1;
    throw new Error(
      `wrote ${JSON.stringify(ours.slice(at, at + 80))} where @xmldom/xmldom wrote ${JSON.stringify(theirs.slice(at, at + 80))}, in ${raw.slice(0, 200)}`,
    );
  }
  return "written";
}

/** A minimal document in the HL7 v3 namespace around `body`. */
function doc(body: string, prolog = ""): string {
  return `${prolog}<ClinicalDocument xmlns="urn:hl7-org:v3">${body}</ClinicalDocument>`;
}

describe("the compact tree's writer against serializeDocument", () => {
  it("writes every corpus document as serializeDocument does or not at all", () => {
    const outcomes = outputCorpus().map((d) => ({ name: d.name, outcome: check(d.text) }));
    const handedBack = outcomes
      .filter((o) => /^(?:bench|fixture|document):/u.test(o.name) && o.outcome !== "written")
      .map((o) => o.name);
    expect(handedBack).toEqual([]);
  }, 120_000);

  it.each([
    ["no declaration", doc("<a/>")],
    ["a declaration", doc("<a/>", '<?xml version="1.0" encoding="UTF-8"?>\n')],
    ["a spaced declaration", doc("<a/>", '<?xml   version = "1.0"   ?>')],
    ["a stylesheet first", doc("<a/>", '<?xml-stylesheet type="text/xsl" href="a.xsl"?>\n')],
    ["a prolog", doc("<a/>", "\n<!-- p -->\n<?pi?>\n<?pi  data ?>\n")],
    ["an epilog", `${doc("<a/>")}\n<!-- e -->\n<?pi x?>\n  \n`],
    ["trailing white space only", `${doc("<a/>")}\n  \n`],
    ["a carriage return", doc("<c>a&#13;b &amp; &lt; &gt; c</c>")],
    ["escapes in text", doc("<c>&amp;&lt;&gt;&quot;&apos; > ]]&gt;</c>")],
    [
      "escapes in attributes",
      doc(`<a b="&amp;&lt;&gt;&quot;&apos;" c="x&#9;y&#10;z&#13;" d='"' e="t\tu\nv"/>`),
    ],
    ["CDATA, comments and instructions", doc("<c><![CDATA[a<&>]]><!-- c --><?pi?><?pi d ?></c>")],
    ["an empty CDATA section between text", doc("<c>a<![CDATA[]]>b</c>")],
    ["prefixes", doc(`<p:a xmlns:p="urn:p" p:b="1" xml:lang="en"><p:c/></p:a>`)],
    ["the default namespace undeclared", doc(`<a xmlns=""><b/></a>`)],
    [
      "a prefixed root",
      `<cda:ClinicalDocument xmlns:cda="urn:hl7-org:v3"><cda:a/></cda:ClinicalDocument>`,
    ],
    ["an XHTML element with children", doc(`<x:p xmlns:x="http://www.w3.org/1999/xhtml">t</x:p>`)],
    ["non-ASCII text", doc("<c>caf\u00e9 \ud83d\ude00</c>")],
    ["line breaks the reader normalizes", doc("<c>a\r\nb\rc\u0085d\u2028e</c>\r\n<d/>")],
  ])("writes %s as serializeDocument does", (_label, source) => {
    expect(check(source)).toBe("written");
  });

  it.each([
    ["an empty XHTML element", doc(`<x:br xmlns:x="http://www.w3.org/1999/xhtml"/>`)],
    [
      "an empty element in the XHTML default namespace",
      doc(`<p xmlns="http://www.w3.org/1999/xhtml"/>`),
    ],
    ["a text the reader hands back", doc("<c>&custom;</c>")],
  ])("hands back %s", (_label, source) => {
    expect(check(source)).toBe("handed back");
  });

  it("agrees with serializeDocument on generated XML", { timeout: propertyTimeout() }, () => {
    let written = 0;
    let total = 0;
    assertProperty(
      "compact tree writer agrees with serializeDocument",
      fc.property(generatedDocument(), (source) => {
        total += 1;
        if (check(source) === "written") written += 1;
      }),
      { numRuns: 400 },
    );
    expect(written / total).toBeGreaterThan(0.3);
  });
});
