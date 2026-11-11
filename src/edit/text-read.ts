/**
 * What an edit reads of a document whose text is already written as the writer writes it
 * (`TreeDocument.writtenEnd` is not -1): the few elements the edit looks at, where each stands in
 * the text, and every `ID` attribute value. No tree of the whole document is built.
 *
 * An edit reads the `ClinicalDocument` root and its children (the header elements it replaces,
 * removes, inserts before and copies from), the `structuredBody` and its `<component>`s, and in
 * each the `<section>` with its `templateId`s, its `code` and its nested `<component>`s, which the
 * required-section check walks. Those are read here as {@link TextElement}s, with their names,
 * namespaces and attributes; every other element is stepped over, its attributes read only for an
 * `ID`. The read is one pass over the text and allocates for what it keeps, not for the document.
 *
 * **It relies on the text being written.** There a tag holds no `>` and no `<` before its end
 * (attribute values escape both), every attribute is quoted, an element with no children is
 * written `<name .../>`, only a comment, a CDATA section or a processing instruction holds markup
 * characters of its own (each ended by its own delimiter), and an attribute value holds only the
 * references the writer writes. Where the text is not like that after all, {@link readText}
 * returns `undefined` and the edit is made on a DOM instead.
 *
 * @internal
 */

import { V3_NS } from "../parser/namespaces.js";
import { attributeNamed, attributeNamedNS } from "./attributes.js";

/** The namespace of the `xml:` prefix, bound in every document. @internal */
const XML_NS = "http://www.w3.org/XML/1998/namespace";

/** The namespace of `xmlns` and `xmlns:` attributes. @internal */
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** Character codes the read branches on. @internal */
const SPACE = 0x20;
const BANG = 0x21;
const DOUBLE_QUOTE = 0x22;
const SLASH = 0x2f;
const COLON = 0x3a;
const GREATER_THAN = 0x3e;
const QUESTION = 0x3f;

/**
 * Which children of an element the edit reads: of the root, every one; of the root's
 * `<component>`, the `structuredBody`; of the `structuredBody` and of a section, each
 * `<component>`; of a `<component>` there, its `<section>`; of a section, also its `templateId`s
 * and `code`. Of any other element, none.
 *
 * @internal
 */
const NONE = 0;
const ROOT = 1;
const TOP_COMPONENT = 2;
const BODY = 3;
const COMPONENT = 4;
const SECTION = 5;

/**
 * A character an attribute value of a written text never holds raw, or a reference the writer
 * never writes there. @internal
 */
const UNWRITTEN_VALUE_RE = /[\t\n<]|&(?!(?:amp|lt|gt|quot|#9|#10|#13);)/;

/** A reference the writer writes in an attribute value. @internal */
const VALUE_REFERENCE_RE = /&(amp|lt|gt|quot|#9|#10|#13);/g;

/** What each of those references stands for. @internal */
const REFERENCED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#9": "\t",
  "#10": "\n",
  "#13": "\r",
};

/**
 * An element the edit reads. It carries the members the model's read helpers use
 * (`../model/dom.ts`) and those `@xmldom/xmldom`'s serializer reads for the namespaces an element
 * declares, and where it stands in the text. Its children are only those the edit reads (see the
 * module comment), linked in document order.
 *
 * @internal
 */
export class TextElement {
  /** The qualified name as written, `prefix:local` or `local`. */
  readonly nodeName: string;
  /** The name without its prefix. */
  readonly localName: string;
  /** The prefix, or `null`. */
  readonly prefix: string | null;
  /** The namespace the element is in, or `null`. */
  readonly namespaceURI: string | null;
  /** The parent element, or `null` for the root. */
  readonly parentNode: TextElement | null;
  /** The first child the edit reads, or `null`. */
  firstChild: TextElement | null = null;
  /** The next sibling the edit reads, or `null`. */
  nextSibling: TextElement | null = null;
  /** The attributes in document order, three entries each: qualified name, value, namespace. */
  readonly attrs: readonly (string | null)[];
  /** The offset of the element's `<`. */
  readonly start: number;
  /** The offset just past its end tag or its `/>`. */
  end = -1;
  /** Whether it is written `<name .../>`, which in a written text is an element with no children. */
  empty = false;

  /** An element read at `start`, with its names, namespace, parent and attributes. */
  constructor(
    nodeName: string,
    prefix: string | null,
    namespaceURI: string | null,
    parentNode: TextElement | null,
    attrs: readonly (string | null)[],
    start: number,
  ) {
    this.nodeName = nodeName;
    this.prefix = prefix;
    this.localName = prefix === null ? nodeName : nodeName.slice(prefix.length + 1);
    this.namespaceURI = namespaceURI;
    this.parentNode = parentNode;
    this.attrs = attrs;
    this.start = start;
  }

  /** Always `1`, `Node.ELEMENT_NODE`. */
  get nodeType(): 1 {
    return 1;
  }

  /** The value of the attribute with this qualified name, or `null` (as `Element.getAttribute`). */
  getAttribute(name: string): string | null {
    return attributeNamed(this.attrs, name);
  }

  /** The value of the attribute with this namespace and local name, or `null`. */
  getAttributeNS(namespaceURI: string | null, localName: string): string | null {
    return attributeNamedNS(this.attrs, namespaceURI, localName);
  }
}

/**
 * What {@link readText} read: the root, and every `ID` attribute value in the document with the
 * offset of the tag it is on, in document order.
 *
 * @internal
 */
export interface TextRead {
  readonly root: TextElement;
  readonly ids: readonly string[];
  readonly idAt: readonly number[];
}

/** An open element read: the element, which of its children are read, and its last read child. @internal */
interface Open {
  readonly element: TextElement;
  readonly reads: number;
  last: TextElement | null;
  /** The number of entries in the prefix bindings before the element declared any. */
  readonly bound: number;
}

/**
 * Read a written text (see the module comment), or `undefined` where it is not written as the
 * read assumes.
 *
 * @internal
 */
export function readText(text: string): TextRead | undefined {
  return new Read(text).read();
}

/** One read of one text. @internal */
class Read {
  private readonly text: string;
  private readonly open: Open[] = [];
  private root: TextElement | undefined;
  private readonly ids: string[] = [];
  private readonly idAt: number[] = [];
  /** The prefix bindings in scope of the elements read, two entries each: prefix and namespace. */
  private readonly bindings: (string | null)[] = ["", null, "xml", XML_NS];
  /**
   * The attributes of the tag being read, when it is read, two entries each (name and value), and
   * the number of entries in use: the array is kept from tag to tag rather than made for each.
   */
  private readonly pending: string[] = [];
  private kept = 0;
  /** The value of the tag's `ID`, if it has one. */
  private id: string | undefined;
  /**
   * The elements open inside the innermost element read whose children are not read: they need
   * no entry in {@link open}, only a count, so a read keeps an entry for few elements.
   */
  private skipped = 0;

  constructor(text: string) {
    this.text = text;
  }

  read(): TextRead | undefined {
    const text = this.text;
    let pos = 0;
    for (;;) {
      const lt = text.indexOf("<", pos);
      if (lt === -1) break;
      const next = text.charCodeAt(lt + 1);
      if (next === BANG) {
        const close = text.startsWith("<!--", lt)
          ? text.indexOf("-->", lt + 4) + 3
          : text.startsWith("<![CDATA[", lt)
            ? text.indexOf("]]>", lt + 9) + 3
            : 2;
        if (close === 2) return undefined;
        pos = close;
      } else if (next === QUESTION) {
        const close = text.indexOf("?>", lt + 2);
        if (close === -1) return undefined;
        pos = close + 2;
      } else if (next === SLASH) {
        const gt = text.indexOf(">", lt);
        if (gt === -1) return undefined;
        pos = gt + 1;
        if (this.skipped > 0) {
          this.skipped -= 1;
          continue;
        }
        const open = this.open.pop();
        if (open === undefined) return undefined;
        open.element.end = pos;
        this.bindings.length = open.bound;
        // Nothing after the root's end tag is read: an edit copies it as it stands.
        if (this.open.length === 0) break;
      } else {
        pos = this.startTag(lt);
        if (pos === -1) return undefined;
        if (this.open.length === 0) break;
      }
    }
    const root = this.root;
    if (root === undefined || this.open.length > 0) return undefined;
    return { root, ids: this.ids, idAt: this.idAt };
  }

  /** Read the start tag at `lt`; return the offset after it, or -1. @internal */
  private startTag(lt: number): number {
    const text = this.text;
    const parent = this.open.at(-1);
    let at = lt + 1;
    let localStart = at;
    for (;;) {
      const code = text.charCodeAt(at);
      if (code <= SPACE || code === SLASH || code === GREATER_THAN || Number.isNaN(code)) break;
      if (code === COLON) localStart = at + 1;
      at += 1;
    }
    const reads = parent === undefined ? ROOT : this.skipped > 0 ? NONE : parent.reads;
    const wanted =
      reads === ROOT || (reads !== NONE && isWanted(reads, text.slice(localStart, at)));
    this.kept = 0;
    this.id = undefined;
    const end = this.attributes(at, wanted);
    if (end === -1) return -1;
    if (this.id !== undefined) {
      this.ids.push(this.id);
      this.idAt.push(lt);
    }
    const empty = text.charCodeAt(end) === SLASH;
    const after = empty ? end + 2 : end + 1;
    const bound = this.bindings.length;
    let element: TextElement | undefined;
    let childReads = NONE;
    if (wanted) {
      const nodeName = text.slice(lt + 1, at);
      element = this.element(nodeName, localStart - lt - 2, lt, parent?.element ?? null);
      if (element === undefined) return -1;
      if (reads !== ROOT && element.namespaceURI !== V3_NS) {
        element = undefined;
        this.bindings.length = bound;
      } else {
        childReads = childrenRead(reads, element);
      }
    }
    if (element !== undefined) {
      if (parent === undefined) this.root = element;
      else {
        if (parent.last === null) parent.element.firstChild = element;
        else parent.last.nextSibling = element;
        parent.last = element;
      }
    }
    if (empty) {
      if (element !== undefined) {
        element.empty = true;
        element.end = after;
      }
      this.bindings.length = bound;
    } else if (element === undefined) {
      // None of its children is read, nor anything in them: only its depth is counted.
      this.skipped += 1;
    } else {
      this.open.push({ element, reads: childReads, last: null, bound });
    }
    return after;
  }

  /**
   * Read the attributes from `at` to the end of the tag, keeping them in {@link pending} when
   * `keep`, and the value of an `ID`; return the offset of the tag's `/` or `>`, or -1. @internal
   */
  private attributes(at: number, keep: boolean): number {
    const text = this.text;
    let pos = at;
    for (;;) {
      const code = text.charCodeAt(pos);
      if (code === GREATER_THAN) return pos;
      if (code === SLASH) return text.charCodeAt(pos + 1) === GREATER_THAN ? pos : -1;
      if (code !== SPACE) return -1;
      const nameStart = pos + 1;
      const eq = text.indexOf("=", nameStart);
      if (eq === -1 || text.charCodeAt(eq + 1) !== DOUBLE_QUOTE) return -1;
      const close = text.indexOf('"', eq + 2);
      if (close === -1) return -1;
      const isId = eq - nameStart === 2 && text.startsWith("ID", nameStart);
      if (keep || isId) {
        const value = attributeValue(text.slice(eq + 2, close));
        if (value === undefined) return -1;
        if (keep) {
          this.pending[this.kept] = text.slice(nameStart, eq);
          this.pending[this.kept + 1] = value;
          this.kept += 2;
        }
        if (isId) this.id = value;
      }
      pos = close + 1;
    }
  }

  /**
   * The element read at `lt`, with its attributes, its namespace and theirs bound as its
   * declarations and those in scope say, or `undefined` for a prefix no declaration binds. @internal
   */
  private element(
    nodeName: string,
    colon: number,
    lt: number,
    parent: TextElement | null,
  ): TextElement | undefined {
    const bindings = this.bindings;
    const pairs = this.pending;
    const kept = this.kept;
    for (let i = 0; i < kept; i += 2) {
      const name = pairs[i] as string;
      if (name === "xmlns")
        bindings.push("", pairs[i + 1] === "" ? null : (pairs[i + 1] as string));
      else if (name.startsWith("xmlns:")) bindings.push(name.slice(6), pairs[i + 1] as string);
    }
    const attrs = new Array<string | null>((kept / 2) * 3);
    for (let i = 0, j = 0; i < kept; i += 2, j += 3) {
      const name = pairs[i] as string;
      const nameColon = name.indexOf(":");
      let namespace: string | null;
      if (name === "xmlns" || name.startsWith("xmlns:")) namespace = XMLNS_NS;
      else if (nameColon === -1) namespace = null;
      else {
        const bound = this.lookup(name.slice(0, nameColon));
        if (bound === undefined) return undefined;
        namespace = bound;
      }
      attrs[j] = name;
      attrs[j + 1] = pairs[i + 1] as string;
      attrs[j + 2] = namespace;
    }
    const prefix = colon === -1 ? null : nodeName.slice(0, colon);
    const namespace = this.lookup(prefix ?? "");
    if (namespace === undefined) return undefined;
    return new TextElement(nodeName, prefix, namespace, parent, attrs, lt);
  }

  /** The namespace a prefix is bound to (`""` for the default namespace, `null` when none is), or `undefined` for a prefix no declaration binds. @internal */
  private lookup(prefix: string): string | null | undefined {
    const bindings = this.bindings;
    for (let i = bindings.length - 2; i >= 0; i -= 2) {
      if (bindings[i] === prefix) return bindings[i + 1];
    }
    return undefined;
  }
}

/** Whether a child named `localName` of an element whose children are read as `reads` is read. @internal */
function isWanted(reads: number, localName: string): boolean {
  switch (reads) {
    case TOP_COMPONENT:
      return localName === "structuredBody";
    case COMPONENT:
      return localName === "section";
    case SECTION:
      return localName === "component" || localName === "templateId" || localName === "code";
    default:
      return localName === "component";
  }
}

/** Which children of `element`, read as a child of an element read as `reads`, are read. @internal */
function childrenRead(reads: number, element: TextElement): number {
  const name = element.localName;
  if (element.namespaceURI !== V3_NS) return NONE;
  switch (reads) {
    case ROOT:
      return element.parentNode === null ? ROOT : name === "component" ? TOP_COMPONENT : NONE;
    case TOP_COMPONENT:
      return BODY;
    case BODY:
      return COMPONENT;
    case COMPONENT:
      return SECTION;
    default:
      return name === "component" ? COMPONENT : NONE;
  }
}

/**
 * An attribute value of a written text as a parse reads it, or `undefined` for one the writer
 * would not have written so. @internal
 */
function attributeValue(raw: string): string | undefined {
  if (!raw.includes("&") && !raw.includes("<") && !raw.includes("\t") && !raw.includes("\n")) {
    return raw;
  }
  if (UNWRITTEN_VALUE_RE.test(raw)) return undefined;
  return raw.replace(VALUE_REFERENCE_RE, (_match, name: string) => REFERENCED[name] as string);
}
