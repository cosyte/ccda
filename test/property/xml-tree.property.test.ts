/**
 * `serializeXml` either refuses a tree with a `TypeError` or writes text `parseXml` reads back to
 * the same tree, for any tree the DOM API can build: hostile names, prefixes and namespaces,
 * values rich in line breaks and markup, and nodes directly under the document.
 *
 * The trees are built from a generated plan with `@xmldom/xmldom`'s own DOM calls; a call the DOM
 * refuses (a name it will not take) leaves that node or attribute out. The comparison is this
 * file's own, written apart from the one `serializeXml` runs, so a fault in that one is not
 * repeated here. Every value is synthetic.
 */

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { parseXml, serializeXml } from "../../src/index.js";
import { xmldom } from "../../src/parser/xmldom.js";

import { checkProperty, propertyTimeout } from "./_property.js";

// Each case builds, writes and reads a small tree, about a millisecond; the budget scales with
// the depth `COSYTE_PROPERTY_RUNS` sets (see `./_property.ts`).
vi.setConfig({ testTimeout: propertyTimeout() });

const XML = "http://www.w3.org/XML/1998/namespace";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const NEL = String.fromCharCode(0x85);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** Characters and runs a writer writes as references in text and attribute values. */
const ESCAPED = [
  "\r",
  "\n",
  "\r\n",
  "\t",
  " ",
  NEL,
  LINE_SEPARATOR,
  PARAGRAPH_SEPARATOR,
  "&",
  "&x;",
  "<",
  ">",
  '"',
  "'",
  "]]>",
];

/** Runs a writer must refuse somewhere: in a comment, an instruction, or anywhere at all. */
const REFUSED = ["--", "-", "?>", "<!DOCTYPE", "<!entity", "\u0001", "\uFFFE", "\uD800", "xml"];

/** A string of plain, escaped and refused runs, mostly plain so that many trees are written. */
const data = fc
  .array(
    fc.oneof(
      { arbitrary: fc.string({ unit: "binary", maxLength: 3 }), weight: 10 },
      { arbitrary: fc.constantFrom(...ESCAPED), weight: 4 },
      { arbitrary: fc.constantFrom(...REFUSED), weight: 1 },
    ),
    { maxLength: 4 },
  )
  .map((parts) => parts.join(""));

/** A name: mostly plain or prefixed, sometimes reserved, or not a name at all. */
const name = fc.oneof(
  {
    arbitrary: fc.constantFrom("a", "b", "c", "p:a", "q:b", "p:b", "x.y-z", "\u03B1\u03B2"),
    weight: 12,
  },
  {
    arbitrary: fc.constantFrom(
      "xml:lang",
      "xml:c",
      "xmlns",
      "xmlns:p",
      "xmlns:q",
      "xmlns:xml",
      "xmlns:xmlns",
      "a b",
      "1a",
      "-a",
      "p:q:r",
      ":a",
      "a:",
      "XmL",
    ),
    weight: 2,
  },
  { arbitrary: fc.string({ minLength: 1, maxLength: 3 }), weight: 1 },
);

/** A namespace: mostly none or plain, sometimes reserved or hostile. "none" calls the DOM with none. */
const namespace = fc.oneof(
  {
    arbitrary: fc.constantFrom<string | null>("none", null, "urn:example:a", "urn:example:b"),
    weight: 12,
  },
  {
    arbitrary: fc.constantFrom<string | null>(
      "",
      `urn:a${NEL}b`,
      `urn:a${LINE_SEPARATOR}b`,
      `urn:a${PARAGRAPH_SEPARATOR}b`,
      'urn:a\r\n\t"<&b',
      "urn:a\uFFFEb",
      XML,
      XMLNS,
    ),
    weight: 2,
  },
);

interface AttrPlan {
  readonly name: string;
  readonly namespace: string | null;
  readonly value: string;
}

type NodePlan =
  | {
      readonly kind: "element";
      readonly name: string;
      readonly namespace: string | null;
      readonly attributes: readonly AttrPlan[];
      readonly children: readonly NodePlan[];
    }
  | { readonly kind: "text" | "cdata" | "comment"; readonly data: string }
  | { readonly kind: "pi"; readonly target: string; readonly data: string };

/**
 * A name and a namespace: mostly a pair that fits (no prefix and no namespace, or the default; a
 * prefix and a namespace), sometimes any name with any namespace. An attribute takes the default
 * namespace from no declaration, so its fitting pairs give an unprefixed name none.
 */
function named(forAttribute: boolean): fc.Arbitrary<{ name: string; namespace: string | null }> {
  const plain = fc.constantFrom("a", "b", "c", "x.y-z", "_d");
  const prefixed = fc.constantFrom("p:a", "q:b", "p:b", "q:c");
  const uri = fc.constantFrom("urn:example:a", "urn:example:b");
  const none = fc.constantFrom<string | null>("none", null);
  return fc.oneof(
    {
      arbitrary: fc.record({ name: plain, namespace: forAttribute ? none : fc.oneof(uri, none) }),
      weight: 6,
    },
    { arbitrary: fc.record({ name: prefixed, namespace: uri }), weight: 4 },
    { arbitrary: fc.record({ name, namespace }), weight: 1 },
  );
}

const attribute: fc.Arbitrary<AttrPlan> = fc
  .tuple(named(true), data)
  .map(([n, value]) => ({ ...n, value }));

/** A comment or an instruction, the nodes a document holds outside its root as well. */
const markup: fc.Arbitrary<NodePlan> = fc.oneof(
  fc.record({ kind: fc.constant("comment" as const), data }),
  fc.record({
    kind: fc.constant("pi" as const),
    target: fc.oneof(
      { arbitrary: fc.constantFrom("app", "x-y"), weight: 6 },
      { arbitrary: fc.constantFrom("xml", "XML", "a:b"), weight: 1 },
    ),
    data,
  }),
);

/** Text and CDATA sections, which a document holds only as white space outside its root. */
const characters: fc.Arbitrary<NodePlan> = fc.oneof(
  fc.record({ kind: fc.constant("text" as const), data }),
  fc.record({ kind: fc.constant("cdata" as const), data }),
);

const leaf: fc.Arbitrary<NodePlan> = fc.oneof(
  { arbitrary: characters, weight: 2 },
  { arbitrary: markup, weight: 1 },
);

/** An element plan from its name, namespace, attributes and children. */
function element(children: fc.Arbitrary<NodePlan[]>): fc.Arbitrary<NodePlan> {
  return fc
    .tuple(named(false), fc.array(attribute, { maxLength: 3 }), children)
    .map(([n, attributes, kids]) => ({
      kind: "element" as const,
      ...n,
      attributes,
      children: kids,
    }));
}

const { node } = fc.letrec<{ node: NodePlan }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    leaf,
    element(fc.array(tie("node"), { maxLength: 3 })),
  ),
}));

/** Outside the root: mostly comments, instructions and white space; now and then text or CDATA. */
const outside: fc.Arbitrary<NodePlan> = fc.oneof(
  { arbitrary: markup, weight: 4 },
  { arbitrary: fc.constant({ kind: "text", data: " \n" } as const), weight: 2 },
  { arbitrary: characters, weight: 1 },
);

/** A document: nodes before the root, the root, and nodes after it. */
const documentPlan = fc.record({
  before: fc.array(outside, { maxLength: 2 }),
  root: element(fc.array(node, { maxLength: 4 })),
  after: fc.array(outside, { maxLength: 2 }),
});

type Doc = ReturnType<typeof parseXml>;
type DomNode = Doc["documentElement"] & object;

/** Run a DOM call, and give `undefined` when the DOM refuses it. */
function attempt<T>(call: () => T): T | undefined {
  try {
    return call();
  } catch {
    return undefined;
  }
}

/** Build one planned node with the DOM API, or `undefined` when the DOM refuses it. */
function build(doc: Doc, plan: NodePlan): unknown {
  switch (plan.kind) {
    case "text":
      return doc.createTextNode(plan.data);
    case "cdata":
      return attempt(() => doc.createCDATASection(plan.data));
    case "comment":
      return doc.createComment(plan.data);
    case "pi":
      return attempt(() => doc.createProcessingInstruction(plan.target, plan.data));
    case "element": {
      const element = attempt(() =>
        plan.namespace === "none"
          ? doc.createElement(plan.name)
          : doc.createElementNS(plan.namespace, plan.name),
      );
      if (element === undefined) return undefined;
      for (const attr of plan.attributes) {
        attempt(() => {
          if (attr.namespace === "none") element.setAttribute(attr.name, attr.value);
          else element.setAttributeNS(attr.namespace, attr.name, attr.value);
        });
      }
      for (const child of plan.children) {
        const built = build(doc, child);
        if (built !== undefined) attempt(() => element.appendChild(built as DomNode));
      }
      return element;
    }
  }
}

/** A document built from a plan, with no root of its own until the plan's is added. */
function buildDocument(plan: DocumentPlan): Doc {
  const doc = new (xmldom().DOMImplementation)().createDocument(null, "", null);
  for (const part of [...plan.before, plan.root, ...plan.after]) {
    const built = build(doc, part);
    if (built !== undefined) attempt(() => doc.appendChild(built as DomNode));
  }
  return doc;
}

type DocumentPlan = typeof documentPlan extends fc.Arbitrary<infer T> ? T : never;

/** A node as plain data, the way a reader of the XML sees it. */
type Canon =
  | {
      readonly element: string;
      readonly ns: string | null;
      readonly attributes: readonly (readonly [string, string | null, string])[];
      readonly declarations: Readonly<Record<string, string>>;
      readonly children: readonly Canon[];
    }
  | readonly [string, string];

interface Raw {
  nodeType: number;
  nodeName: string;
  namespaceURI: string | null;
  data: string;
  target: string;
  value: string;
  childNodes: ArrayLike<Raw>;
  attributes: ArrayLike<Raw>;
}

/** Whether an attribute is a namespace declaration, set with or without the xmlns namespace. */
function isDeclaration(attr: Raw): boolean {
  const ok = attr.namespaceURI === null || attr.namespaceURI === XMLNS;
  return ok && (attr.nodeName === "xmlns" || attr.nodeName.startsWith("xmlns:"));
}

/** The children of a node as a reader sees them: text joined, empty text and CDATA gone. */
function canonChildren(parent: Raw): Canon[] {
  const out: Canon[] = [];
  for (const child of Array.from(parent.childNodes)) {
    const item = canon(child);
    if (Array.isArray(item)) {
      const [kind, value] = item as readonly [string, string];
      if ((kind === "text" || kind === "cdata") && value === "") continue;
      const last = out.at(-1);
      if (kind === "text" && Array.isArray(last) && last[0] === "text") {
        out[out.length - 1] = ["text", (last[1] as string) + value];
        continue;
      }
    }
    out.push(item);
  }
  return out;
}

/** One node as plain data. */
function canon(raw: Raw): Canon {
  switch (raw.nodeType) {
    case 1: {
      const attributes: [string, string | null, string][] = [];
      const declarations: Record<string, string> = {};
      for (const attr of Array.from(raw.attributes)) {
        if (isDeclaration(attr)) {
          declarations[attr.nodeName] = attr.value;
        } else {
          const ns = attr.namespaceURI ?? (attr.nodeName.startsWith("xml:") ? XML : null);
          attributes.push([attr.nodeName, ns, attr.value]);
        }
      }
      return {
        element: raw.nodeName,
        ns: raw.namespaceURI,
        attributes,
        declarations,
        children: canonChildren(raw),
      };
    }
    case 3:
      return ["text", raw.data];
    case 4:
      return ["cdata", raw.data];
    case 7:
      return ["pi", `${raw.target} ${raw.data}`];
    default:
      return ["comment", raw.data];
  }
}

/**
 * Assert that `back` holds what `tree` held: the same nodes, and on each element every declaration
 * the input carried (the writer may add declarations of its own). Outside the root, white space
 * and the declaration the writer adds are not compared.
 */
function expectSameTree(tree: Canon[], back: Canon[]): void {
  expect(back.length).toBe(tree.length);
  for (const [index, a] of tree.entries()) {
    const b = back[index] as Canon;
    if (Array.isArray(a)) {
      expect(b).toEqual(a);
      continue;
    }
    const x = a as Exclude<Canon, readonly [string, string]>;
    const y = b as Exclude<Canon, readonly [string, string]>;
    expect([y.element, y.ns, y.attributes]).toEqual([x.element, x.ns, x.attributes]);
    for (const [declared, value] of Object.entries(x.declarations)) {
      expect(y.declarations[declared]).toBe(value);
    }
    expectSameTree([...x.children], [...y.children]);
  }
}

/** The nodes of a document a reader keeps, without white space outside the root. */
function documentNodes(doc: Doc, dropDeclaration: boolean): Canon[] {
  const nodes = canonChildren(doc as unknown as Raw).filter(
    (c) => !(Array.isArray(c) && c[0] === "text" && /^[ \t\n\r]*$/u.test(c[1] as string)),
  );
  const first = nodes[0];
  if (dropDeclaration && Array.isArray(first) && (first[1] as string).startsWith("xml ")) {
    nodes.shift();
  }
  return nodes;
}

describe("serializeXml on any tree the DOM can build (property)", () => {
  it("refuses it with a TypeError, or writes text parseXml reads back to the same tree", () => {
    let written = 0;
    let runs = 0;
    checkProperty(
      "serializeXml: refuses or reads back the same",
      fc.property(documentPlan, (plan) => {
        runs += 1;
        const doc = buildDocument(plan);
        let out: string;
        try {
          out = serializeXml(doc);
        } catch (err) {
          expect(err).toBeInstanceOf(TypeError);
          return;
        }
        written += 1;
        const back = parseXml(out, {
          limits: {
            maxDepth: Number.POSITIVE_INFINITY,
            maxEntityExpansions: Number.POSITIVE_INFINITY,
          },
        });
        const first = doc.firstChild as unknown as Raw | null;
        const carried = first?.nodeType === 7 && first.target === "xml";
        expectSameTree(documentNodes(doc, false), documentNodes(back, !carried));
      }),
    );
    // The generator is no use if it builds only trees the writer refuses.
    expect(written).toBeGreaterThan(runs / 10);
  });
});
