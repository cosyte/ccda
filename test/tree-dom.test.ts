/**
 * The `@xmldom/xmldom` document built from the compact reader's tree (`src/parser/tree-dom.ts`),
 * which `editCcda` edits, against the one `DOMParser` builds from the same text.
 *
 * For every text the reader reads, the two documents must hold the same nodes in the same order,
 * the document's own children included: the same types, names, prefixes, namespaces, values,
 * instruction targets, attributes (in order, with their names, values and namespaces), and the
 * same line and column on every element; and `serializeDocument` must write them the same.
 * `parseSecureDom`, which builds it for an edit, must refuse what `parseSecureXml` refuses.
 */

import fc from "fast-check";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import { CcdaParseError } from "../src/parser/errors.js";
import {
  normalizeLineEndings,
  parseSecureDom,
  parseSecureXml,
  resolveLimits,
} from "../src/parser/secure-xml.js";
import { domOfTree } from "../src/parser/tree-dom.js";
import { readDocument } from "../src/parser/xml-tree.js";
import { serializeDocument } from "../src/serialize/serialize-dom.js";
import { generatedDocument } from "./_helpers/generated-xml.js";
import { outputCorpus } from "./_output-corpus.js";
import { assertProperty, propertyTimeout } from "./property/_runner.js";

/** A DOM node, read through the members both documents carry. */
interface DomNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly localName?: string | null;
  readonly prefix?: string | null;
  readonly namespaceURI?: string | null;
  readonly nodeValue: string | null;
  readonly target?: string;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
  readonly firstChild: DomNode | null;
  readonly nextSibling: DomNode | null;
  readonly attributes?: ArrayLike<{
    readonly name: string;
    readonly value: string;
    readonly prefix: string | null;
    readonly localName: string;
    readonly namespaceURI: string | null;
  }>;
}

/** One node's own description: everything compared but its children. */
function describeNode(node: DomNode): string {
  const parts: unknown[] = [node.nodeType, node.nodeName, node.nodeValue, node.target];
  if (node.nodeType === 1) {
    parts.push(node.localName, node.prefix, node.namespaceURI, node.lineNumber, node.columnNumber);
    const attrs = node.attributes ?? [];
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i] as NonNullable<DomNode["attributes"]>[number];
      parts.push([a.name, a.value, a.prefix, a.localName, a.namespaceURI]);
    }
  }
  return JSON.stringify(parts);
}

/** The first difference between two documents, or `undefined`. */
function difference(ours: DomNode, theirs: DomNode): string | undefined {
  const pending: [DomNode, DomNode][] = [[ours, theirs]];
  for (let pair = pending.pop(); pair !== undefined; pair = pending.pop()) {
    const [a, b] = pair;
    const da = describeNode(a);
    const db = describeNode(b);
    if (da !== db) return `${da}\n  vs ${db}`;
    let ca = a.firstChild;
    let cb = b.firstChild;
    while (ca !== null || cb !== null) {
      if (ca === null || cb === null) return `the children of ${da} differ in number`;
      pending.push([ca, cb]);
      ca = ca.nextSibling;
      cb = cb.nextSibling;
    }
  }
  return undefined;
}

/** Whether the documents agree for `raw`; `"handed back"` when the reader does not read it. */
function check(raw: string): "same" | "handed back" {
  const stripped = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const source = normalizeLineEndings(stripped);
  const tree = readDocument(source);
  if (tree === undefined) return "handed back";
  const ours = domOfTree(tree);
  const theirs = new DOMParser({
    locator: true,
    normalizeLineEndings: (s: string) => s,
  }).parseFromString(source, "application/xml");
  const diff = difference(ours, theirs);
  if (diff !== undefined) throw new Error(`${diff}\nin ${raw.slice(0, 200)}`);
  expect(serializeDocument(ours)).toBe(serializeDocument(theirs));
  return "same";
}

/** The fatal a call throws, as code and position, or `"none"`. */
function fatalOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    if (!(error instanceof CcdaParseError)) throw error;
    return { code: error.code, position: error.position };
  }
  return "none";
}

describe("the document built from the compact tree", () => {
  it("is the document DOMParser builds, for every corpus document the reader reads", () => {
    const outcomes = outputCorpus().map((d) => ({ name: d.name, outcome: check(d.text) }));
    expect(outcomes.filter((o) => o.outcome === "same").length).toBeGreaterThan(200);
  }, 120_000);

  it("is the document DOMParser builds, for generated XML", { timeout: propertyTimeout() }, () => {
    assertProperty(
      "document from the compact tree agrees with DOMParser",
      fc.property(generatedDocument(), (source) => {
        check(source);
      }),
      { numRuns: 300 },
    );
  });

  it("holds the nodes before and after the root, and a root with none around it", () => {
    expect(check('<?xml version="1.0"?>\n<!-- a -->\n<?pi d?>\n<r>t</r>\n<!-- b -->\n')).toBe(
      "same",
    );
    expect(check("<r/>")).toBe("same");
  });

  it("reads no index past the nodes outside the root", () => {
    const sources = [
      "<r/>",
      "<!-- a -->\n<r/>",
      "<r/>\n<!-- b -->\n<?pi d?>\n",
      '<?xml version="1.0"?>\n<!-- a -->\n<r>t</r>\n<?pi d?>\n<!-- b -->',
    ];
    for (const source of sources) {
      const tree = readDocument(source);
      if (tree === undefined) throw new Error(`the reader handed back ${source}`);
      const outside = new Proxy(tree.outside, {
        get(target, key, receiver) {
          if (typeof key === "string" && /^\d+$/.test(key) && Number(key) >= target.length) {
            throw new RangeError(`read outside[${key}] of ${target.length}`);
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      });
      const ours = domOfTree({ ...tree, outside });
      const theirs = new DOMParser({ locator: true }).parseFromString(source, "application/xml");
      expect(difference(ours, theirs)).toBeUndefined();
    }
  });
});

describe("parseSecureDom", () => {
  const xml = `<ClinicalDocument xmlns="urn:hl7-org:v3"><a><b><c/></b></a></ClinicalDocument>`;
  const noop = (): void => undefined;

  it("refuses what parseSecureXml refuses, at the same element", () => {
    for (const limits of [{ maxDepth: 2 }, { maxNodeCount: 2 }, { maxInputBytes: 10 }]) {
      const resolved = resolveLimits(limits);
      const ours = fatalOf(() => parseSecureDom(xml, resolved, noop));
      expect(ours).not.toBe("none");
      expect(ours).toEqual(fatalOf(() => parseSecureXml(xml, resolved, noop)));
    }
  });

  it("builds a text the reader hands back with DOMParser, as before", () => {
    const quirky = `<ClinicalDocument xmlns="urn:hl7-org:v3"><caf\u00e9/></ClinicalDocument>`;
    expect(readDocument(quirky)).toBeUndefined();
    const ours = parseSecureDom(quirky, resolveLimits(), noop);
    const theirs = parseSecureXml(quirky, resolveLimits(), noop);
    expect(serializeDocument(ours)).toBe(serializeDocument(theirs));
    expect(fatalOf(() => parseSecureDom("<a>", resolveLimits(), noop))).toEqual(
      fatalOf(() => parseSecureXml("<a>", resolveLimits(), noop)),
    );
  });
});
