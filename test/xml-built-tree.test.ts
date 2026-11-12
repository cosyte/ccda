/**
 * The check `parseXml` runs on the tree `@xmldom/xmldom` built against what the scan of the text
 * counted (`src/parser/built-tree.ts`), the counts the scan keeps (`src/parser/outside-root.ts`),
 * and the one xmldom error `parseXml` reads past (`isToleratedReport`). The check is fed trees
 * written here, so each refusal is shown on its own, whatever xmldom does. Every value is
 * synthetic.
 */

import { describe, expect, it } from "vitest";

import { CcdaParseError, FATAL_CODES } from "../src/index.js";
import {
  refuseTreeDifference,
  type BuiltAttribute,
  type BuiltNode,
} from "../src/parser/built-tree.js";
import { refuseOutsideRootText, type ScannedTree } from "../src/parser/outside-root.js";
import { isToleratedReport } from "../src/parser/secure-xml.js";

/** An attribute named `name`, its prefix and local name read from it. */
function attr(name: string, value = "v"): BuiltAttribute {
  const colon = name.indexOf(":");
  return {
    name,
    prefix: colon === -1 ? null : name.slice(0, colon),
    localName: name.slice(colon + 1),
    value,
  };
}

function element(attributes: BuiltAttribute[], ...children: BuiltNode[]): BuiltNode {
  return { nodeType: 1, attributes, childNodes: children };
}

function text(): BuiltNode {
  return { nodeType: 3, childNodes: [] };
}

function instruction(target: string): BuiltNode {
  return { nodeType: 7, target, childNodes: [] };
}

function documentOf(...children: BuiltNode[]): BuiltNode {
  return { nodeType: 9, childNodes: children };
}

function scanned(
  attributes: number[],
  children: number[],
  shared: [number, string[]][] = [],
): ScannedTree {
  return { attributes, children, sharedLocalNames: new Map(shared) };
}

/** What the check does: `"none"` when it passes the tree, else the fatal code. */
function checked(doc: BuiltNode, scan: ScannedTree): string {
  try {
    refuseTreeDifference(doc, scan);
  } catch (err) {
    expect(err).toBeInstanceOf(CcdaParseError);
    expect((err as CcdaParseError).message).not.toContain("urn:example");
    return (err as CcdaParseError).code;
  }
  return "none";
}

const NOT_WELL_FORMED = FATAL_CODES.NOT_WELL_FORMED_XML;

describe("the check of the built tree against the scan", () => {
  const tree = documentOf(
    text(),
    element([attr("x")], text(), element([]), instruction("p")),
    instruction("q"),
  );

  it("passes a tree that holds what the scan counted", () => {
    expect(checked(tree, scanned([1, 0], [3, 0]))).toBe("none");
  });

  it("refuses an element with another number of attributes than the scan counted", () => {
    expect(checked(tree, scanned([2, 0], [3, 0]))).toBe(NOT_WELL_FORMED);
    expect(checked(tree, scanned([1, 1], [3, 0]))).toBe(NOT_WELL_FORMED);
  });

  it("refuses an element with another number of child nodes than the scan counted", () => {
    expect(checked(tree, scanned([1, 0], [2, 0]))).toBe(NOT_WELL_FORMED);
    expect(checked(tree, scanned([1, 0], [3, 1]))).toBe(NOT_WELL_FORMED);
  });

  it("refuses a tree with fewer elements than the scan counted", () => {
    expect(checked(tree, scanned([1, 0, 0], [3, 0, 0]))).toBe(NOT_WELL_FORMED);
  });

  it("refuses a colon in an instruction's target, under the document or in the root", () => {
    expect(checked(documentOf(element([]), instruction("p:q")), scanned([0], [0]))).toBe(
      NOT_WELL_FORMED,
    );
    expect(checked(documentOf(element([], instruction("p:q"))), scanned([0], [1]))).toBe(
      NOT_WELL_FORMED,
    );
  });

  it("refuses each declaration Namespaces in XML 1.0 forbids", () => {
    const xml = "http://www.w3.org/XML/1998/namespace";
    const xmlns = "http://www.w3.org/2000/xmlns/";
    for (const [name, value] of [
      ["xmlns:xmlns", "urn:example:x"],
      ["xmlns:p", ""],
      ["xmlns:p", xml],
      ["xmlns:p", xmlns],
      ["xmlns:xml", "urn:example:x"],
      ["xmlns:xml", ""],
      ["xmlns", xml],
      ["xmlns", xmlns],
    ] as const) {
      expect(
        checked(documentOf(element([attr(name, value)])), scanned([1], [0])),
        `${name}=${value}`,
      ).toBe(NOT_WELL_FORMED);
    }
    for (const [name, value] of [
      ["xmlns:xml", xml],
      ["xmlns", ""],
      ["xmlns", "urn:example:x"],
      ["xmlns:p", "urn:example:x"],
      ["x", xml],
      ["p:x", ""],
    ] as const) {
      expect(
        checked(documentOf(element([attr(name, value)])), scanned([1], [0])),
        `${name}=${value}`,
      ).toBe("none");
    }
  });

  it("refuses one attribute named through two prefixes for one namespace", () => {
    const names = ["xmlns:p", "xmlns:q", "p:x", "q:x"];
    const one = documentOf(
      element([attr("xmlns:p", "urn:example:x"), attr("xmlns:q", "urn:example:x"), attr("q:x")]),
    );
    // The scan saw four attributes and xmldom kept three; the names are refused first.
    expect(checked(one, scanned([4], [0], [[0, names]]))).toBe(NOT_WELL_FORMED);
    // Two namespaces: two names. An unprefixed name beside them is in no namespace.
    const two = documentOf(
      element([attr("xmlns:p", "urn:example:x"), attr("xmlns:q", "urn:example:y"), attr("p:x")]),
    );
    expect(checked(two, scanned([3], [0], [[0, [...names, "x"]]]))).toBe("none");
  });

  it("resolves each prefix to its innermost binding, and unbinds it when the element ends", () => {
    const names = ["p:x", "q:x"];
    // p is bound to x on the root, to y on the first child only; q to x on the second child.
    const doc = documentOf(
      element(
        [attr("xmlns:p", "urn:example:x")],
        element([attr("xmlns:p", "urn:example:y")], element([attr("xmlns:q", "urn:example:x")])),
        element([attr("xmlns:q", "urn:example:x")]),
      ),
    );
    // On the grandchild p is y and q is x: two names. On the second child p is x again.
    expect(checked(doc, scanned([1, 1, 1, 1], [2, 1, 0, 0], [[2, names]]))).toBe("none");
    expect(checked(doc, scanned([1, 1, 1, 1], [2, 1, 0, 0], [[3, names]]))).toBe(NOT_WELL_FORMED);
  });

  it("reads xml as bound to the xml namespace from the start", () => {
    const names = ["xml:lang", "p:lang"];
    const doc = documentOf(element([attr("xmlns:p", "urn:example:x")]));
    expect(checked(doc, scanned([1], [0], [[0, names]]))).toBe("none");
  });

  it("walks a tree far deeper than the call stack allows recursion for", () => {
    let node = element([]);
    const depth = 100_000;
    for (let i = 1; i < depth; i += 1) node = element([], node);
    const counts = Array.from({ length: depth }, (_, i) => (i === depth - 1 ? 0 : 1));
    expect(checked(documentOf(node), scanned(new Array<number>(depth).fill(0), counts))).toBe(
      "none",
    );
  });

  it("takes an element with more children than a call takes arguments", () => {
    const many = Array.from({ length: 200_000 }, () => text());
    const wide: BuiltNode = { nodeType: 1, attributes: [], childNodes: many };
    expect(checked(documentOf(wide), scanned([0], [200_000]))).toBe("none");
  });
});

describe("what the scan counts inside the root", () => {
  it("counts attributes and child nodes per element, in document order", () => {
    const tree = refuseOutsideRootText(
      '<!--c--><a x="1" y="2">t<!--c--><?p?><![CDATA[d]]><b z="3"/>u<c>v</c></a> ',
    );
    expect(tree.attributes).toEqual([2, 1, 0]);
    expect(tree.children).toEqual([7, 0, 1]);
    expect(tree.sharedLocalNames.size).toBe(0);
  });

  it("counts text broken only by empty CDATA sections once, and an empty section as none", () => {
    expect(refuseOutsideRootText("<a>x<![CDATA[]]>y</a>").children).toEqual([1]);
    expect(refuseOutsideRootText("<a><![CDATA[]]></a>").children).toEqual([0]);
    expect(refuseOutsideRootText("<a><![CDATA[]]>x<b/>y</a>").children).toEqual([3, 0]);
    expect(refuseOutsideRootText("<a><![CDATA[<![CDATA[]]></a>").children).toEqual([1]);
    expect(refuseOutsideRootText("<a><b>x</b>y<c>z</c><!--c-->w</a>").children).toEqual([5, 1, 1]);
  });

  it("keeps the names of a start tag where two prefixes give one local name", () => {
    const tree = refuseOutsideRootText('<a p:x="1"><b p:x="1" q:x="2" y="3" xmlns:x="u"/></a>');
    expect([...tree.sharedLocalNames]).toEqual([[1, ["p:x", "q:x", "y", "xmlns:x"]]]);
    for (const text of [
      '<a p:x="1" x="2"/>',
      '<a xmlns:x="u" p:x="1"/>',
      '<a p:x="1" p:y="2"/>',
      '<a xmlns:p="u" xmlns:q="u"/>',
    ]) {
      expect(refuseOutsideRootText(text).sharedLocalNames.size, text).toBe(0);
    }
  });
});

describe("the xmldom reports parseXml reads past", () => {
  it("reads past the warning on U+FFFD by its whole words", () => {
    const words = "Unicode replacement character detected, source encoding issues?";
    expect(isToleratedReport("warning", words)).toBe(true);
    expect(isToleratedReport("warning", `${words} `)).toBe(false);
    expect(isToleratedReport("error", words)).toBe(false);
  });

  it("reads past an undeclared entity only when the report is its whole shape", () => {
    for (const message of [
      "entity not found:&a;",
      "entity not found:&_x9;",
      "entity not found:&Z;",
    ]) {
      expect(isToleratedReport("error", message), message).toBe(true);
    }
    for (const message of [
      "entity not found:",
      "entity not found:&;",
      "entity not found:&1a;",
      "entity not found:&a",
      "entity not found:&a; ",
      "entity not found:&a;&b;",
      "entity not found:&a-b;",
      " entity not found:&a;",
      "xentity not found:&a;",
      "entity not found:a;",
      "EntityRef: expecting ;",
    ]) {
      expect(isToleratedReport("error", message), message).toBe(false);
    }
    expect(isToleratedReport("warning", "entity not found:&a;")).toBe(false);
  });
});
