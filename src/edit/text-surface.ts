/**
 * {@link EditSurface} on the text of a document already written as the writer writes it, so an
 * edit needs no `@xmldom/xmldom` DOM of the document it edits, and no tree of it either.
 *
 * For such a text (`TreeDocument.writtenEnd` is not -1) `serializeDocument` of its DOM is the text
 * itself, up to its last node. Serializing is local: an element is written from its own name,
 * attributes and children and the namespaces its ancestors declare, never from its siblings. So
 * `serializeDocument` of the edited DOM is the text with each changed child replaced by what the
 * serializer writes for the new one in that place, and this surface writes it that way. It reads
 * only the elements the edit looks at, with where each stands in the text, and every `ID`
 * (`./text-read.ts`); it records each change; and at the end it splices the text, each new node
 * written as the serializer writes it in that place (`./light-dom.ts`). The new nodes are built
 * as light nodes rather than `@xmldom/xmldom` ones, and the parts of the text no change touches
 * are copied as they stand.
 *
 * {@link TextSurface.write} returns `undefined` where it cannot vouch for the text it would write
 * (changes that overlap, a new element written by HTML's rules); the caller then makes the same
 * edit on a DOM. `test/edit-text.test.ts` compares the two over the output-equivalence corpus and
 * documents written for the places a splice can go wrong.
 *
 * @internal
 */

import type { Document, Element } from "@xmldom/xmldom";

import { children } from "../model/dom.js";
import { writtenText } from "../serialize/write-tree.js";
import { LightDocument, LightWriter, type LightNode } from "./light-dom.js";
import { collectIds, type EditSurface } from "./surface.js";
import type { TextElement, TextRead } from "./text-read.js";

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
  readonly parent: TextElement;
  readonly nodes: readonly Element[];
  readonly close: boolean;
  /** The element as read that the change replaces or removes, if any. */
  readonly old: TextElement | undefined;
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
  private readonly read: TextRead;
  private body: TextElement | undefined;
  private slots: Slot[] = [];
  private readonly changes: Change[] = [];

  /**
   * The surface of `text`, written up to `writtenEnd`, which `read` was read from
   * (`./text-read.ts`).
   */
  constructor(read: TextRead, text: string, writtenEnd: number) {
    this.doc = new LightDocument() as unknown as Document;
    this.root = read.root as unknown as Element;
    this.read = read;
    this.text = text;
    this.writtenEnd = writtenEnd;
  }

  /** {@inheritDoc EditSurface.components} */
  components(body: Element): readonly Element[] {
    return this.slotsOf(body).map((slot) => slot.current);
  }

  /** {@inheritDoc EditSurface.replace} */
  replace(parent: Element, node: Element, old: Element): void {
    if (textElement(parent) === this.body) {
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
    const at = anchor === undefined ? -1 : textElement(anchor).start;
    this.changes.push({
      start: at,
      end: at,
      parent: textElement(parent),
      nodes,
      close: anchor === undefined,
      old: undefined,
    });
  }

  /** {@inheritDoc EditSurface.ids} */
  ids(): Set<string> {
    // The text's IDs, less those inside an element a change replaced or removed, and the IDs of
    // what the changes add.
    const gone: TextElement[] = [];
    const added: Element[] = [];
    for (const slot of this.slots) {
      if (slot.current === slot.read) continue;
      if (slot.read !== undefined) gone.push(textElement(slot.read));
      added.push(slot.current);
    }
    for (const change of this.changes) {
      if (change.old !== undefined) gone.push(change.old);
      added.push(...change.nodes);
    }
    const ids = new Set<string>();
    const { ids: found, idAt } = this.read;
    for (let i = 0; i < found.length; i++) {
      const at = idAt[i] as number;
      if (!gone.some((element) => at >= element.start && at < element.end)) {
        ids.add(found[i] as string);
      }
    }
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
          const read = textElement(slot.read);
          changes.push({
            start: read.start,
            end: read.end,
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
    const placed = changes.map((change, order) => ({ ...placedChange(change), order }));
    // In the order of the text; two changes at one place (two insertions before one element) in
    // the order they were made, which is the order the DOM holds them in.
    placed.sort((a, b) => a.start - b.start || a.order - b.order);
    const text = this.text;
    const writer = new LightWriter();
    let out = "";
    let at = 0;
    for (const change of placed) {
      /* v8 ignore if -- the changes are to distinct elements and the places between them, so none overlaps another */
      if (change.start < at) return undefined;
      // A removal writes nothing in the place of what it removes.
      const written =
        change.nodes.length === 0
          ? ""
          : writer.write(change.parent, change.nodes as unknown as readonly LightNode[]);
      /* v8 ignore if -- the builder makes no element in the XHTML namespace, the one the serializer writes by HTML's rules */
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
      this.body = textElement(body);
      this.slots = children(body, "component").map((read) => ({ read, current: read }));
    }
    return this.slots;
  }

  /** Record `old`, an element as read, replaced with `nodes` (none to remove it). @internal */
  private change(old: Element, nodes: readonly Element[]): void {
    const read = textElement(old);
    this.changes.push({
      start: read.start,
      end: read.end,
      parent: read.parentNode as TextElement,
      nodes,
      close: false,
      old: read,
    });
  }
}

/**
 * Where a change goes in the text, and what it writes around its nodes: an append goes before
 * the parent's end tag, or in place of the `/>` of a parent with no children, which then opens
 * and closes.
 *
 * @internal
 */
function placedChange(
  change: Change,
): Change & { readonly before: string; readonly after: string } {
  if (!change.close) return { ...change, before: "", after: "" };
  const parent = change.parent;
  const end = parent.end;
  if (parent.empty) {
    return { ...change, start: end - 2, end, before: ">", after: `</${parent.nodeName}>` };
  }
  const at = end - parent.nodeName.length - 3;
  return { ...change, start: at, end: at, before: "", after: "" };
}

/** An element as the text was read. @internal */
function textElement(element: Element): TextElement {
  return element as unknown as TextElement;
}
