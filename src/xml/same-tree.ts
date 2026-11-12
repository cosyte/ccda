/**
 * The check `serializeXml` makes on its own output before returning it: read the text back with
 * the reader `parseXml` uses, its caps lifted, and compare that tree to the one written. A refusal
 * or a difference is reported by the kind of node, never by anything the tree holds.
 *
 * Two trees are the same when they hold the same nodes in the same order: each element's name and
 * namespace; its attributes (name, namespace and value, in order); the namespace declarations it
 * carries (a declaration the writer added to bind a name is not one the input lacked); and its
 * text, CDATA sections, comments and processing instructions (target and data). Adjacent text
 * nodes are one text, as a parse reads them, and an empty text node or CDATA section is none.
 * Outside the root element, white space is not compared (the XML Infoset holds no text there),
 * and the XML declaration the writer adds to a document that has none is not either.
 *
 * @packageDocumentation
 */

import type { Document } from "@xmldom/xmldom";

import type { CcdaParseError } from "../parser/errors.js";
import { parseSecureXml } from "../parser/secure-xml.js";
import { declaredPrefix, xmlNamespace, type XmlNode } from "./write.js";

/** Drop a warning: the check reads text it wrote, and only its tree matters. */
function ignore(): void {
  // Nothing to report.
}

/** The node types compared; a comment is the one other kind content holds. */
const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;
const INSTRUCTION = 7;
const DOCUMENT = 9;

/**
 * The kind of a node, as a refusal names it. Written in a function, not a table at the top of the
 * module: StrykerJS cannot judge a mutant in a value computed once when the module loads.
 */
function kindOf(type: number): string {
  switch (type) {
    case ELEMENT:
      return "an element";
    case TEXT:
      return "text";
    case CDATA:
      return "a CDATA section";
    case INSTRUCTION:
      return "a processing instruction";
    default:
      return "a comment";
  }
}

/**
 * The nodes of an element's content as a parse would hold them: adjacent text joined, an empty text
 * node or CDATA section dropped. Each is its type and, for all but an element, its data (an
 * instruction's target first).
 */
function contentOf(parent: XmlNode): { node: XmlNode; type: number; data: string }[] {
  const out: { node: XmlNode; type: number; data: string }[] = [];
  for (const node of Array.from(parent.childNodes)) {
    const type = node.nodeType;
    const data = type === INSTRUCTION ? `${node.target}?${node.data}` : node.data;
    if ((type === TEXT || type === CDATA) && data === "") continue;
    const last = out.at(-1);
    if (type === TEXT && last?.type === TEXT) {
      last.data += data;
      continue;
    }
    out.push({ node, type, data });
  }
  return out;
}

/** The nodes of a document outside its root that a parse keeps: all but white space. */
function prologOf(doc: XmlNode): { node: XmlNode; type: number; data: string }[] {
  return contentOf(doc).filter((x) => x.type !== TEXT || !/^[ \t\n\r]*$/u.test(x.data));
}

/**
 * Whether a node of a document is a processing instruction with the target `xml`: the only node
 * with a `target` is an instruction.
 */
function isDeclaration(x: { node: XmlNode } | undefined): boolean {
  return x?.node.target === "xml";
}

/** An attribute's namespace as a parse gives it: `xml:` is in the xml namespace, set or not. */
function attributeNamespace(attr: XmlNode): string | null {
  if (attr.namespaceURI !== null) return attr.namespaceURI;
  return attr.nodeName.startsWith("xml:") ? xmlNamespace() : null;
}

/** The kind of the first difference between two elements' own names and attributes, if any. */
function elementDifference(a: XmlNode, b: XmlNode): string | undefined {
  if (a.nodeName !== b.nodeName || a.namespaceURI !== b.namespaceURI) {
    return kindOf(ELEMENT);
  }
  const declarations = new Map<string, string>();
  const attributes: string[] = [];
  for (const attr of Array.from(b.attributes)) {
    const prefix = declaredPrefix(attr);
    if (prefix === undefined) attributes.push(attributeKey(attr));
    else declarations.set(prefix, attr.value);
  }
  let at = 0;
  for (const attr of Array.from(a.attributes)) {
    const prefix = declaredPrefix(attr);
    if (prefix !== undefined) {
      if (declarations.get(prefix) !== attr.value) return "a namespace declaration";
    } else if (attributes[at++] !== attributeKey(attr)) {
      return "an attribute";
    }
  }
  return at === attributes.length ? undefined : "an attribute";
}

/** An attribute's name, namespace and value, as one string to compare. */
function attributeKey(attr: XmlNode): string {
  return JSON.stringify([attr.nodeName, attributeNamespace(attr), attr.value]);
}

/**
 * The kind of the first node where tree `b` differs from tree `a`, or `undefined` when they are
 * the same. Each is a document or an element; the walk keeps a stack of its own, so a deep tree
 * cannot overflow the call stack.
 *
 * @internal
 */
export function firstDifference(a: XmlNode, b: XmlNode): string | undefined {
  const pairs: [XmlNode, XmlNode][] = [];
  if (a.nodeType === DOCUMENT) {
    const left = prologOf(a);
    const right = prologOf(b);
    if (!isDeclaration(left[0]) && isDeclaration(right[0])) right.shift();
    const why = sameNodes(left, right, pairs);
    if (why !== undefined) return why;
  } else {
    const root = (b as unknown as Document).documentElement as unknown as XmlNode;
    pairs.push([a, root]);
  }
  for (let pair = pairs.pop(); pair !== undefined; pair = pairs.pop()) {
    const why =
      elementDifference(pair[0], pair[1]) ??
      sameNodes(contentOf(pair[0]), contentOf(pair[1]), pairs);
    if (why !== undefined) return why;
  }
  return undefined;
}

/**
 * Compare two lists of nodes, one by one, and queue each pair of elements on `pairs`. Returns the
 * kind of the first that differs, or `"the nodes of an element or document"` when one list is
 * longer.
 */
function sameNodes(
  left: readonly { node: XmlNode; type: number; data: string }[],
  right: readonly { node: XmlNode; type: number; data: string }[],
  pairs: [XmlNode, XmlNode][],
): string | undefined {
  if (left.length !== right.length) return "the nodes of an element or document";
  for (const [index, x] of left.entries()) {
    const y = right[index] as (typeof right)[number];
    if (x.type !== y.type || x.data !== y.data) return kindOf(x.type);
    if (x.type === ELEMENT) pairs.push([x.node, y.node]);
  }
  return undefined;
}

/**
 * Read `xml` back and compare it to `node`, the tree it was written from. Returns why it would not
 * read back the same (the fatal code of a refusal, or the kind of the first node that differs), or
 * `undefined` when it does.
 *
 * @internal
 */
export function readBackDifference(xml: string, node: XmlNode): string | undefined {
  // No cap: the writer does not apply the reader's limits, so neither does its check.
  const limits = {
    maxInputBytes: Number.POSITIVE_INFINITY,
    maxDepth: Number.POSITIVE_INFINITY,
    maxNodeCount: Number.POSITIVE_INFINITY,
    maxEntityExpansions: Number.POSITIVE_INFINITY,
  };
  let doc: XmlNode;
  try {
    doc = parseSecureXml(xml, limits, ignore, ignore) as unknown as XmlNode;
  } catch (err) {
    // The reader throws a CcdaParseError and nothing else; its code names no content.
    return `would be written as text parseXml refuses (${(err as CcdaParseError).code})`;
  }
  const kind = firstDifference(node, doc);
  return kind === undefined ? undefined : `would not read back the same (${kind} differs)`;
}
