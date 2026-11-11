/**
 * {@link EditSurface} on the text of a document already written as the writer writes it, so an
 * edit needs no `@xmldom/xmldom` DOM of the document it edits.
 *
 * For such a text (`TreeDocument.writtenEnd` is not -1) `serializeDocument` of its DOM is the text
 * itself, up to its last node. Serializing is local: an element is written from its own name,
 * attributes and children and the namespaces its ancestors declare, never from its siblings. So
 * `serializeDocument` of the edited DOM is the text with each changed child replaced by what the
 * serializer writes for the new one in that place, and this surface writes it that way: it reads
 * the compact tree (`../parser/xml-tree.ts`) for the structure and the positions, records each
 * change, and at the end splices the text, each new node written by `serializeDocument` itself
 * inside a copy of the elements it sits in (their names and attributes, so the same namespaces are
 * declared above it). No `@xmldom/xmldom` tree of the whole document is built, and the parts of
 * the text no change touches are copied as they stand.
 *
 * {@link TextSurface.write} returns `undefined` where it cannot vouch for the text it would write
 * (changes that overlap, a copy the serializer writes in a form the cut does not expect); the
 * caller then makes the same edit on a DOM. `test/edit-text.test.ts` compares the two over the
 * output-equivalence corpus and documents written for the places a splice can go wrong.
 *
 * @internal
 */

import type { Document, Element } from "@xmldom/xmldom";

import { children } from "../model/dom.js";
import { xmldom } from "../parser/xmldom.js";
import type { TreeDocument, TreeElement } from "../parser/xml-tree.js";
import { serializeDocument } from "../serialize/serialize-dom.js";
import { writtenText } from "../serialize/write-tree.js";
import { collectIds, type EditSurface } from "./surface.js";

/** A `<component>` of the body: the one read there, if any, and the one there now. @internal */
interface Slot {
  readonly read: Element | undefined;
  current: Element;
}

/**
 * A change to the text: `[start, end)` replaced with `nodes` written as children of `parent`. With
 * `close`, the change is an append to `parent`, written where its children end, which for an
 * element with none means the `/>` of its tag.
 *
 * @internal
 */
interface Change {
  readonly start: number;
  readonly end: number;
  readonly parent: TreeElement;
  readonly nodes: readonly Element[];
  readonly close: boolean;
  /** The element as read that the change replaces or removes, if any. */
  readonly old: TreeElement | undefined;
}

/**
 * An edit of a written text: see the module comment.
 *
 * @internal
 */
export class TextSurface implements EditSurface {
  readonly doc: Document;
  readonly root: Element;
  private readonly text: string;
  private readonly writtenEnd: number;
  private body: TreeElement | undefined;
  private slots: Slot[] = [];
  private readonly changes: Change[] = [];
  private lineStarts: Int32Array | undefined;

  /** The surface of `text`, which `tree` was read from and found written (`writtenEnd` not -1). */
  constructor(tree: TreeDocument, text: string) {
    this.doc = new (xmldom().DOMImplementation)().createDocument(null, "", null);
    this.root = tree.root as unknown as Element;
    this.text = text;
    this.writtenEnd = tree.writtenEnd;
  }

  /** {@inheritDoc EditSurface.components} */
  components(body: Element): readonly Element[] {
    return this.slotsOf(body).map((slot) => slot.current);
  }

  /** {@inheritDoc EditSurface.replace} */
  replace(parent: Element, node: Element, old: Element): void {
    if (tree(parent) === this.body) {
      const slot = this.slots.find((s) => s.current === old) as Slot;
      slot.current = node;
      return;
    }
    this.change(old, [node]);
  }

  /** {@inheritDoc EditSurface.append} */
  append(parent: Element, node: Element): void {
    this.slotsOf(parent).push({ read: undefined, current: node });
  }

  /** {@inheritDoc EditSurface.remove} */
  remove(_parent: Element, old: Element): void {
    this.change(old, []);
  }

  /** {@inheritDoc EditSurface.insertBefore} */
  insertBefore(parent: Element, nodes: readonly Element[], anchor: Element | undefined): void {
    const at = anchor === undefined ? -1 : this.startOf(tree(anchor));
    this.changes.push({
      start: at,
      end: at,
      parent: tree(parent),
      nodes,
      close: anchor === undefined,
      old: undefined,
    });
  }

  /** {@inheritDoc EditSurface.ids} */
  ids(): Set<string> {
    const gone = new Set<Element>();
    const ids = new Set<string>();
    const added: Element[] = [];
    for (const slot of this.slots) {
      if (slot.current === slot.read) continue;
      if (slot.read !== undefined) gone.add(slot.read);
      added.push(slot.current);
    }
    for (const change of this.changes) {
      if (change.old !== undefined) gone.add(change.old as unknown as Element);
      added.push(...change.nodes);
    }
    collectIds(this.root, ids, gone);
    for (const node of added) collectIds(node, ids);
    return ids;
  }

  /**
   * The edited text, as `serializeDocument` writes the edited DOM, or `undefined` where a step
   * cannot be vouched for (see the module comment).
   */
  write(): string | undefined {
    const changes = [...this.changes];
    const body = this.body;
    if (body !== undefined) {
      const appended: Element[] = [];
      for (const slot of this.slots) {
        if (slot.read === undefined) appended.push(slot.current);
        else if (slot.current !== slot.read) {
          const read = tree(slot.read);
          changes.push({
            start: this.startOf(read),
            end: this.endOf(read),
            parent: body,
            nodes: [slot.current],
            close: false,
            old: read,
          });
        }
      }
      if (appended.length > 0) {
        changes.push({
          start: -1,
          end: -1,
          parent: body,
          nodes: appended,
          close: true,
          old: undefined,
        });
      }
    }
    const placed = changes.map((change, order) => ({ ...this.placed(change), order }));
    // In the order of the text; two changes at one place (two insertions before one element) in
    // the order they were made, which is the order the DOM holds them in.
    placed.sort((a, b) => a.start - b.start || a.order - b.order);
    const text = this.text;
    let out = "";
    let at = 0;
    for (const change of placed) {
      /* v8 ignore if -- the changes are to distinct elements and the places between them, so none overlaps another */
      if (change.start < at) return undefined;
      // A removal writes nothing in the place of what it removes.
      const written =
        change.nodes.length === 0 ? "" : writeChildren(this.doc, change.parent, change.nodes);
      /* v8 ignore if -- the serializer writes the copied elements as the text does (see writeChildren) */
      if (written === undefined) return undefined;
      out += text.slice(at, change.start) + change.before + written + change.after;
      at = change.end;
    }
    const edited = out + text.slice(at, this.writtenEnd);
    return writtenText(edited, edited.length);
  }

  /** The body's slots, read from `body` the first time. @internal */
  private slotsOf(body: Element): Slot[] {
    if (this.body === undefined) {
      this.body = tree(body);
      this.slots = children(body, "component").map((read) => ({ read, current: read }));
    }
    return this.slots;
  }

  /** Record `old`, an element as read, replaced with `nodes` (none to remove it). @internal */
  private change(old: Element, nodes: readonly Element[]): void {
    const read = tree(old);
    this.changes.push({
      start: this.startOf(read),
      end: this.endOf(read),
      parent: read.parentNode as TreeElement,
      nodes,
      close: false,
      old: read,
    });
  }

  /**
   * Where a change goes in the text, and what it writes around its nodes: an append goes before
   * the parent's end tag, or in place of the `/>` of a parent with no children, which then opens
   * and closes.
   *
   * @internal
   */
  private placed(change: Change): Change & { readonly before: string; readonly after: string } {
    if (!change.close) return { ...change, before: "", after: "" };
    const parent = change.parent;
    const end = this.endOf(parent);
    if (parent.firstChild === null) {
      return { ...change, start: end - 2, end, before: ">", after: `</${parent.nodeName}>` };
    }
    const at = end - parent.nodeName.length - 3;
    return { ...change, start: at, end: at, before: "", after: "" };
  }

  /** The offset of an element's `<`, from the line and column the reader recorded. @internal */
  private startOf(element: TreeElement): number {
    const starts = (this.lineStarts ??= lineStarts(this.text));
    return (starts[element.lineNumber - 1] as number) + element.columnNumber - 1;
  }

  /** The offset just past an element's end tag, or its `/>`. @internal */
  private endOf(element: TreeElement): number {
    return elementEnd(this.text, this.startOf(element));
  }
}

/** An element as the compact reader read it. @internal */
function tree(element: Element): TreeElement {
  return element as unknown as TreeElement;
}

/** The offset each line of `text` starts at, by 0-based line. @internal */
function lineStarts(text: string): Int32Array {
  let lines = 1;
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) lines += 1;
  const starts = new Int32Array(lines);
  let line = 1;
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) {
    starts[line] = at + 1;
    line += 1;
  }
  return starts;
}

/**
 * The offset just past the end of the element whose `<` is at `start`, in a text written as the
 * writer writes it: there a tag holds no `>` before its end (attribute values escape it), an
 * element with no children is written `<name .../>`, and only a comment, a CDATA section or a
 * processing instruction holds markup characters of its own, each ended by its own delimiter.
 *
 * @internal
 */
export function elementEnd(text: string, start: number): number {
  let depth = 0;
  let at = start;
  for (;;) {
    const lt = text.indexOf("<", at);
    const next = text.charCodeAt(lt + 1);
    if (next === 0x21 /* ! */) {
      at = text.startsWith("<!--", lt)
        ? text.indexOf("-->", lt + 4) + 3
        : text.indexOf("]]>", lt + 9) + 3;
      continue;
    }
    if (next === 0x3f /* ? */) {
      at = text.indexOf("?>", lt + 2) + 2;
      continue;
    }
    const gt = text.indexOf(">", lt);
    at = gt + 1;
    if (next === 0x2f /* / */) depth -= 1;
    else if (text.charCodeAt(gt - 1) !== 0x2f) depth += 1;
    if (depth === 0) return at;
  }
}

/**
 * `nodes` written as `serializeDocument` writes them as the children of `parent`: written inside
 * copies of `parent` and the elements around it (each with its name, namespace and attributes, as
 * `../parser/tree-dom.ts` builds them, so the serializer sees the same namespace declarations
 * above the nodes), then cut out of that text. The copy is written twice, empty and with the
 * nodes; the empty one says where the parent's start tag ends. `undefined` when either is not in
 * the form that cut assumes.
 *
 * @internal
 */
function writeChildren(
  doc: Document,
  parent: TreeElement,
  nodes: readonly Element[],
): string | undefined {
  // The copies, outermost first.
  const chain: TreeElement[] = [];
  for (let at: TreeElement | null = parent; at !== null; at = at.parentNode) chain.unshift(at);
  let top: Element | undefined;
  let inner: Element | undefined;
  for (const read of chain) {
    const copy = copyElement(doc, read);
    if (inner === undefined) top = copy;
    else inner.appendChild(copy);
    inner = copy;
  }
  const outer = top as Element;
  const holder = inner as Element;
  doc.appendChild(outer);
  try {
    let closeAbove = "";
    for (let i = chain.length - 2; i >= 0; i--) {
      closeAbove += `</${(chain[i] as TreeElement).nodeName}>`;
    }
    const close = `</${parent.nodeName}>${closeAbove}`;
    const empty = serializeDocument(doc);
    /* v8 ignore if -- an element read from text is written by its own name, and one in the v3 namespace closes with "/>" */
    if (!empty.endsWith(`/>${closeAbove}`)) return undefined;
    const open = empty.slice(0, empty.length - closeAbove.length - 2);
    for (const node of nodes) holder.appendChild(node);
    const full = serializeDocument(doc);
    for (const node of nodes) holder.removeChild(node);
    /* v8 ignore if -- the parent's start tag does not depend on its children */
    if (!full.startsWith(`${open}>`) || !full.endsWith(close)) return undefined;
    return full.slice(open.length + 1, full.length - close.length);
  } finally {
    doc.removeChild(outer);
  }
}

/** A copy of an element as read, with its name, namespace and attributes and no children. @internal */
function copyElement(doc: Document, read: TreeElement): Element {
  const copy = doc.createElementNS(read.namespaceURI, read.nodeName);
  const attrs = read.attrs;
  if (attrs !== null) {
    for (let i = 0; i < attrs.length; i += 3) {
      const attr = doc.createAttributeNS(attrs[i + 2] as string | null, attrs[i] as string);
      attr.value = attrs[i + 1] as string;
      (attr as { nodeValue: string | null }).nodeValue = attrs[i + 1] as string;
      copy.setAttributeNode(attr);
    }
  }
  return copy;
}
