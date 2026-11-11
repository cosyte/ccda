/**
 * When a parsed document's XML is written, and what does the writing.
 *
 * `parseCcda` writes a document's XML the first time `toString` (or `serializeCcda`, or an edit)
 * asks for it, and keeps it: a caller that reads only the model never pays for the write, and the
 * DOM is not kept for the document's life. These tests count the writes to pin that (a call of
 * `serializeDocument`, or of `writeSource` that wrote, the writer of the compact reader's tree),
 * and compare the text with what the source gives when it is parsed and written at once, so a
 * change that writes eagerly again, writes twice, or writes something else fails here.
 *
 * `buildCcda` and `editCcda` re-parse XML they have just written and their callers nearly always
 * ask for it back, so they write it as they parse, once, as every parse did before.
 */

import { DOMParser } from "@xmldom/xmldom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildCcda as buildFixture } from "./__fixtures__/ccda.js";
import type * as SerializeDom from "../src/serialize/serialize-dom.js";
import type * as WriteTree from "../src/serialize/write-tree.js";
import { referralNote } from "../bench/shapes.mjs";

const calls = vi.hoisted(() => ({ serialize: 0 }));

vi.mock("../src/serialize/write-tree.js", async (importOriginal) => {
  const original = await importOriginal<typeof WriteTree>();
  return {
    ...original,
    writeSource: (...args: Parameters<typeof original.writeSource>): string | undefined => {
      const written = original.writeSource(...args);
      if (written !== undefined) calls.serialize += 1;
      return written;
    },
  };
});

vi.mock("../src/serialize/serialize-dom.js", async (importOriginal) => {
  const original = await importOriginal<typeof SerializeDom>();
  return {
    ...original,
    serializeDocument: (doc: Parameters<typeof original.serializeDocument>[0]): string => {
      calls.serialize += 1;
      return original.serializeDocument(doc);
    },
  };
});

const { buildCcda, editCcda, parseCcda, serializeCcda, text } = await import("../src/index.js");
const { serializeDocument } = await import("../src/serialize/serialize-dom.js");

beforeEach(() => {
  calls.serialize = 0;
});

describe("parseCcda writes its XML on first use", () => {
  it("writes nothing while it parses", () => {
    parseCcda(referralNote(0));
    expect(calls.serialize).toBe(0);
  });

  it("writes once on the first toString, and returns the kept string after", () => {
    const doc = parseCcda(referralNote(1));
    const first = doc.toString();
    expect(calls.serialize).toBe(1);
    expect(doc.toString()).toBe(first);
    expect(serializeCcda(doc)).toBe(first);
    expect(calls.serialize).toBe(1);
  });

  it("shares one write with every document withWarnings derives, in either order", () => {
    const doc = parseCcda(referralNote(2));
    const annotated = doc.withWarnings([]);
    const again = annotated.withWarnings([]);
    const text = again.toString();
    expect(doc.toString()).toBe(text);
    expect(annotated.toString()).toBe(text);
    expect(calls.serialize).toBe(1);
  });

  it("writes the text a parse that wrote at once would have written", () => {
    // Line breaks the end-of-line handling rewrites, a byte order mark, and a carriage return
    // written as a reference: the rebuilt tree must be the one the parse read.
    const sources = [
      referralNote(3),
      `\uFEFF${buildFixture()}`,
      buildFixture().replace(/\n/gu, "\r\n"),
      buildFixture().replace("<title>Synthetic Test Document</title>", "<title>a&#13;b</title>"),
      // An empty XHTML element, which the compact tree's writer hands to @xmldom/xmldom.
      buildFixture().replace("<title>", '<x:br xmlns:x="http://www.w3.org/1999/xhtml"/><title>'),
    ];
    for (const source of sources) {
      const stripped = source.startsWith("\uFEFF") ? source.slice(1) : source;
      const expected = serializeDocument(
        new DOMParser({ locator: true }).parseFromString(stripped, "application/xml"),
      );
      expect(parseCcda(source).toString()).toBe(expected);
    }
  });
});

describe("buildCcda and editCcda write as they parse", () => {
  it("buildCcda writes its document, then re-parses and writes it once more, and no more", () => {
    const doc = buildCcda({
      patient: {
        mrn: "MRN001",
        given: ["Jane"],
        family: "Doe",
        gender: "F",
        birthTime: "19800101",
      },
      effectiveTime: "20240101",
    });
    expect(calls.serialize).toBe(2);
    doc.toString();
    expect(calls.serialize).toBe(2);
  });

  it("writes once on the first toString when the compact tree's writer hands the tree back", () => {
    const doc = parseCcda(
      buildFixture().replace("<title>", '<x:p xmlns:x="http://www.w3.org/1999/xhtml"/><title>'),
    );
    const first = doc.toString();
    expect(first).toContain('<x:p xmlns:x="http://www.w3.org/1999/xhtml"></x:p>');
    expect(calls.serialize).toBe(1);
    expect(doc.toString()).toBe(first);
    expect(calls.serialize).toBe(1);
  });

  it("editCcda writes the edit and the re-parse, and its toString writes nothing more", () => {
    const source = parseCcda(referralNote(4));
    source.toString();
    calls.serialize = 0;
    const edited = editCcda(source);
    expect(calls.serialize).toBe(2);
    edited.toString();
    expect(calls.serialize).toBe(2);
  });
});

describe("text", () => {
  const parse = (xml: string): Document =>
    new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;

  it("reads what textContent reads, trimmed, for every shape of content", () => {
    const shapes = [
      "<e/>",
      "<e>  </e>",
      "<e> one </e>",
      "<e><![CDATA[ cdata ]]></e>",
      "<e>a<b>b<c>c</c></b><!-- no -->d<?pi no?><f/>e</e>",
      "<e><b><c/></b></e>",
      "<e><b><c>deep</c></b></e>",
      "<e>x<b><c>y</c></b></e>",
      "<e><b>last</b></e>",
      "<e><!-- only a comment --></e>",
      "<e><?pi only?></e>",
    ];
    for (const shape of shapes) {
      const el = parse(shape).documentElement as unknown as Parameters<typeof text>[0];
      const expected = (el.textContent ?? "").trim();
      expect(text(el)).toBe(expected === "" ? undefined : expected);
    }
  });

  it("reads a node that is not an element through textContent, as before", () => {
    const doc = parse("<e> inner </e>");
    const node = doc.documentElement?.firstChild as unknown as Parameters<typeof text>[0];
    expect(text(node)).toBe("inner");
    // A document's textContent is null, which reads as no text.
    expect(text(doc as unknown as Parameters<typeof text>[0])).toBeUndefined();
  });
});
