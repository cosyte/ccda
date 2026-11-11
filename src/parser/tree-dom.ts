/**
 * The `@xmldom/xmldom` document of a text the compact reader (`./xml-tree.ts`) read, built from
 * its tree rather than by `@xmldom/xmldom`'s own parser.
 *
 * `editCcda` edits a DOM of the source's XML when that XML is not in the form the writer gives it
 * (otherwise it edits the text, `../edit/text-surface.ts`). Building that DOM through the DOM methods, from a
 * tree already read, does what `DOMParser` does after its tokenizer has run, the same calls in the
 * same order: the document from `createDocument(null, "")`, each element from `createElementNS`
 * with the line and column of its `<`, each attribute from `createAttributeNS` with its value and
 * `setAttributeNode`, in document order; text, CDATA sections, comments and processing
 * instructions from their `create` methods; the nodes before and after the root on the document.
 * What it skips is the tokenizer, which builds a regular expression for every end tag.
 * `test/tree-dom.test.ts` compares the two documents node by node.
 *
 * @packageDocumentation
 */

import type { Document, Element, Node } from "@xmldom/xmldom";

import type {
  OutsideNode,
  TreeDocument,
  TreeElement,
  TreeInstruction,
  TreeNode,
} from "./xml-tree.js";
import { xmldom } from "./xmldom.js";

/** Node types this module branches on. @internal */
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;

/**
 * The `@xmldom/xmldom` document `DOMParser`, with its locator, builds from the text `tree` was
 * read from.
 *
 * @internal
 */
export function domOfTree(tree: TreeDocument): Document {
  const doc = new (xmldom().DOMImplementation)().createDocument(null, "", null);
  const outside = tree.outside;
  for (let i = 0; i < outside.length; i++) {
    if (i === tree.rootAt) appendTree(doc, tree.root);
    doc.appendChild(outsideNode(doc, outside[i] as OutsideNode));
  }
  // No node outside the root follows it: the root comes last.
  if (tree.rootAt >= outside.length) appendTree(doc, tree.root);
  return doc;
}

/** A node outside the root, made in `doc`. @internal */
function outsideNode(doc: Document, node: OutsideNode): Node {
  if (node.nodeType === TEXT_NODE) return doc.createTextNode(node.nodeValue);
  if (node.nodeType === PROCESSING_INSTRUCTION_NODE) {
    return doc.createProcessingInstruction(node.target, node.nodeValue);
  }
  return doc.createComment(node.nodeValue);
}

/** Append the root and everything in it to `doc`, in document order. @internal */
function appendTree(doc: Document, root: TreeElement): void {
  // Each tree node with the DOM node its children go into.
  const pending: [TreeNode, Node][] = [[root, doc]];
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    const [node, parent] = item;
    if (node.nodeType !== ELEMENT_NODE) {
      parent.appendChild(characterData(doc, node as Exclude<TreeNode, TreeElement>));
      continue;
    }
    const tree = node as TreeElement;
    const el: Element = doc.createElementNS(tree.namespaceURI, tree.nodeName);
    // As `DOMParser` places an element: on the parent first, then its position, then attributes.
    parent.appendChild(el);
    const located = el as Element & { lineNumber: number; columnNumber: number };
    located.lineNumber = tree.lineNumber;
    located.columnNumber = tree.columnNumber;
    const attrs = tree.attrs;
    if (attrs !== null) {
      for (let i = 0; i < attrs.length; i += 3) {
        const attr = doc.createAttributeNS(attrs[i + 2] as string | null, attrs[i] as string);
        attr.value = attrs[i + 1] as string;
        (attr as { nodeValue: string | null }).nodeValue = attrs[i + 1] as string;
        el.setAttributeNode(attr);
      }
    }
    // Children are pushed last first, so they are taken, and appended, first to last.
    const children: TreeNode[] = [];
    for (let child = tree.firstChild; child !== null; child = child.nextSibling)
      children.push(child);
    for (let i = children.length - 1; i >= 0; i--) pending.push([children[i] as TreeNode, el]);
  }
}

/** A text, CDATA, comment or instruction node, made in `doc`. @internal */
function characterData(doc: Document, node: Exclude<TreeNode, TreeElement>): Node {
  switch (node.nodeType) {
    case TEXT_NODE:
      return doc.createTextNode(node.nodeValue);
    case CDATA_SECTION_NODE:
      return doc.createCDATASection(node.nodeValue);
    case PROCESSING_INSTRUCTION_NODE:
      return doc.createProcessingInstruction((node as TreeInstruction).target, node.nodeValue);
    default:
      return doc.createComment(node.nodeValue);
  }
}
