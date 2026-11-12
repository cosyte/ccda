/**
 * The three guards `parseXml` keeps on what it reads, each on its own: the scan of the text before
 * the tree is built (`refuseOutsideRootText`), `@xmldom/xmldom`'s reports while it builds the tree,
 * every one fatal but the two a text `parseXml` reads can draw, and the check of the document's own
 * nodes after (`refuseOutsideRootNodes`). The scan is switched off here, and the node check too in
 * one case, so that each test shows what one guard refuses when the one before it misses. Every
 * value is synthetic.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import * as outsideRoot from "../src/parser/outside-root.js";
import { CcdaParseError, FATAL_CODES, parseXml } from "../src/index.js";

vi.mock("../src/parser/outside-root.js", async (importOriginal) => {
  const actual = await importOriginal<typeof outsideRoot>();
  return {
    ...actual,
    refuseOutsideRootText: vi.fn(actual.refuseOutsideRootText),
    refuseOutsideRootNodes: vi.fn(actual.refuseOutsideRootNodes),
  };
});

const scan = vi.mocked(outsideRoot.refuseOutsideRootText);
const nodeCheck = vi.mocked(outsideRoot.refuseOutsideRootNodes);

afterEach(() => {
  scan.mockClear();
  nodeCheck.mockClear();
});

/** The fatal code `parseXml(text)` threw, or `"none"` when it returned a document. */
function fatalOf(text: string): string {
  try {
    parseXml(text);
  } catch (err) {
    expect(err).toBeInstanceOf(CcdaParseError);
    return (err as CcdaParseError).code;
  }
  return "none";
}

/** Switch the scan off for the next call. */
function withoutScan(): void {
  scan.mockImplementationOnce(() => undefined);
}

describe("parseXml's guards, one at a time", () => {
  it("runs the scan and the node check on every text", () => {
    expect(fatalOf("<a/>")).toBe("none");
    expect(scan).toHaveBeenCalledTimes(1);
    expect(nodeCheck).toHaveBeenCalledTimes(1);
  });

  it("refuses, past the scan, every start tag xmldom reads with a warning", () => {
    for (const text of [
      '<r x=b"c/>Synthetic junk"/>',
      "<r x=b'c/>Synthetic junk'/>",
      '<r x=b"c/>Synthetic junk"/>\n',
      '<r x=b"c></r>JUNK<?p " ></r><?q ?>',
      "<r x=b'c></r>JUNK<?p ' ></r><?q ?>",
      "<r x=b/>",
      "<r x/>",
      '<r a="1"b="2"/>',
    ]) {
      withoutScan();
      expect(fatalOf(text), text).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    }
  });

  it("refuses, past the scan, text after the root that xmldom drops with an error", () => {
    withoutScan();
    expect(fatalOf("<r/>Synthetic junk")).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    expect(nodeCheck).not.toHaveBeenCalled();
  });

  it("still reads, past the scan, the two reports a text parseXml reads can draw", () => {
    withoutScan();
    expect(fatalOf('<a b="�">&undeclared;</a>')).toBe("none");
  });

  it("refuses, past the scan and xmldom, a CDATA section after the root by its node check", () => {
    // xmldom reports nothing here and keeps the section under the document.
    withoutScan();
    nodeCheck.mockImplementationOnce(() => undefined);
    expect(fatalOf("<r/><![CDATA[Synthetic]]>")).toBe("none");
    withoutScan();
    expect(fatalOf("<r/><![CDATA[Synthetic]]>")).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
  });
});
