/**
 * The four guards `parseXml` keeps on what it reads, each on its own: the scan of the text before
 * the tree is built (`refuseOutsideRootText`), `@xmldom/xmldom`'s reports while it builds the tree,
 * every one fatal but the two a text `parseXml` reads can draw, the check of the document's own
 * nodes after (`refuseOutsideRootNodes`), and the check of the whole tree against what the scan
 * counted (`refuseTreeDifference`). One guard or more is switched off here, so that each test
 * shows what one guard refuses when the one before it misses. Every value is synthetic.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import * as builtTree from "../src/parser/built-tree.js";
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

vi.mock("../src/parser/built-tree.js", async (importOriginal) => {
  const actual = await importOriginal<typeof builtTree>();
  return { ...actual, refuseTreeDifference: vi.fn(actual.refuseTreeDifference) };
});

const scan = vi.mocked(outsideRoot.refuseOutsideRootText);
const nodeCheck = vi.mocked(outsideRoot.refuseOutsideRootNodes);
const treeCheck = vi.mocked(builtTree.refuseTreeDifference);

afterEach(() => {
  scan.mockClear();
  nodeCheck.mockClear();
  treeCheck.mockClear();
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

/**
 * Switch the scan off for the next call. With no scan there is no count to check the tree
 * against, so the tree check is skipped too, as it is for `parseSecureXml`.
 */
function withoutScan(): void {
  scan.mockImplementationOnce(() => undefined as unknown as outsideRoot.ScannedTree);
}

describe("parseXml's guards, one at a time", () => {
  it("runs the scan, the node check and the tree check on every text", () => {
    expect(fatalOf("<a/>")).toBe("none");
    expect(scan).toHaveBeenCalledTimes(1);
    expect(nodeCheck).toHaveBeenCalledTimes(1);
    expect(treeCheck).toHaveBeenCalledTimes(1);
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

  it("refuses, by the tree check alone, an attribute xmldom drops with no report", () => {
    // Two prefixes bound to one namespace name one attribute twice; the scan compares names whole
    // and passes it, xmldom keeps one of the two and reports nothing.
    const text = '<a xmlns:p="urn:example:x" xmlns:q="urn:example:x" p:x="first" q:x="second"/>';
    treeCheck.mockImplementationOnce(() => undefined);
    expect(fatalOf(text)).toBe("none");
    expect(fatalOf(text)).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
    expect(treeCheck).toHaveBeenCalledTimes(2);
  });

  it("refuses, by the tree check's counts alone, an attribute xmldom drops", () => {
    // With the names passed as if no two shared a local name, the attribute count still differs.
    const real = treeCheck.getMockImplementation() as typeof builtTree.refuseTreeDifference;
    treeCheck.mockImplementationOnce((doc, scanned) =>
      real(doc, { ...scanned, sharedLocalNames: new Map() }),
    );
    expect(
      fatalOf('<a xmlns:p="urn:example:x" xmlns:q="urn:example:x" p:x="first" q:x="second"/>'),
    ).toBe(FATAL_CODES.NOT_WELL_FORMED_XML);
  });
});
