/**
 * What `editCcda` edits: the few changes an edit makes to a document, behind one interface, so the
 * same edit runs on an `@xmldom/xmldom` DOM ({@link DomSurface}) and on the text of a document
 * already written in the writer's form (`./text-surface.ts`), which needs no DOM of the document.
 *
 * An edit changes the children of two elements only: the `structuredBody` (a section's
 * `<component>` replaced or appended) and the `ClinicalDocument` root (the revision's header
 * elements replaced, removed or inserted). Everything else it reads, with the model's read helpers,
 * from elements that stay as they were read.
 *
 * @internal
 */

import type { Document, Element, Node } from "@xmldom/xmldom";

import { attr, children } from "../model/dom.js";

/** Element node type per the DOM spec (`Node.ELEMENT_NODE`). @internal */
const ELEMENT_NODE = 1;

/**
 * The changes an edit makes, and the reads that see them. New nodes are made in {@link doc}.
 *
 * @internal
 */
export interface EditSurface {
  /** The document new nodes are made in. */
  readonly doc: Document;
  /** The `ClinicalDocument` element, as read. */
  readonly root: Element;
  /** The `<component>` children of the `structuredBody`, with every change made so far. */
  components(body: Element): readonly Element[];
  /** Put `node` in the place of `old`, a child of `parent`. */
  replace(parent: Element, node: Element, old: Element): void;
  /** Add `node` as the last child of `parent`. */
  append(parent: Element, node: Element): void;
  /** Take `old`, a child of `parent`, out. */
  remove(parent: Element, old: Element): void;
  /** Put `nodes`, in order, before `anchor`, a child of `parent` as read, or last when there is none. */
  insertBefore(parent: Element, nodes: readonly Element[], anchor: Element | undefined): void;
  /** Every `ID` attribute value in the document, with every change made so far. */
  ids(): Set<string>;
}

/**
 * {@link EditSurface} on an `@xmldom/xmldom` document: each change is the DOM method of the same
 * name.
 *
 * @internal
 */
export class DomSurface implements EditSurface {
  readonly doc: Document;
  readonly root: Element;

  /** The surface of `doc`, whose document element is `root`. */
  constructor(doc: Document, root: Element) {
    this.doc = doc;
    this.root = root;
  }

  /** {@inheritDoc EditSurface.components} */
  components(body: Element): readonly Element[] {
    return children(body, "component");
  }

  /** {@inheritDoc EditSurface.replace} */
  replace(parent: Element, node: Element, old: Element): void {
    parent.replaceChild(node, old);
  }

  /** {@inheritDoc EditSurface.append} */
  append(parent: Element, node: Element): void {
    parent.appendChild(node);
  }

  /** {@inheritDoc EditSurface.remove} */
  remove(parent: Element, old: Element): void {
    parent.removeChild(old);
  }

  /** {@inheritDoc EditSurface.insertBefore} */
  insertBefore(parent: Element, nodes: readonly Element[], anchor: Element | undefined): void {
    for (const node of nodes) parent.insertBefore(node, anchor ?? null);
  }

  /** {@inheritDoc EditSurface.ids} */
  ids(): Set<string> {
    const ids = new Set<string>();
    collectIds(this.root, ids);
    return ids;
  }
}

/**
 * Add every `ID` attribute value in `root` and the elements in it to `ids`, leaving out the
 * elements in `skip` and everything in them. It walks the sibling and parent links, so it makes no
 * array of children for each element, and no recursion a deep document could exhaust.
 *
 * @internal
 */
export function collectIds(root: Element, ids: Set<string>, skip?: ReadonlySet<Element>): void {
  let node: Node | null = root;
  while (node !== null) {
    let next: Node | null = null;
    if (node.nodeType === ELEMENT_NODE && skip?.has(node as Element) !== true) {
      const id = attr(node as Element, "ID");
      if (id !== undefined) ids.add(id);
      next = node.firstChild;
    }
    if (next === null) {
      // The next node in document order inside `root`: the next sibling, else the next sibling of
      // the nearest ancestor that has one.
      let at: Node = node;
      while (at !== root && at.nextSibling === null) at = at.parentNode as Node;
      next = at === root ? null : at.nextSibling;
    }
    node = next;
  }
}
