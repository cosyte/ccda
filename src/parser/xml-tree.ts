/**
 * A compact reader for the XML a parse reads, and the small tree it builds.
 *
 * `parseCcda` reads the model from a tree through a handful of DOM members: an element's
 * `nodeType`, `localName`, `namespaceURI`, `firstChild`, `nextSibling`, `parentNode`,
 * `lineNumber`, `columnNumber`, `getAttribute` and `getAttributeNS`, and a text node's
 * `nodeValue`. The `@xmldom/xmldom` tree carries those and a great deal more: a child list, an
 * attribute map and an attribute node with a dozen fields for every attribute, an owner document
 * on every node. Building it was most of what a parse allocated. This reader builds only those
 * members, on two small classes, in one pass over the text.
 *
 * **It reads only what it can vouch for, and hands everything else back.** {@link readTree}
 * accepts a conservative subset of XML: ASCII names, quoted attributes separated by white space,
 * the five predefined entities and character references to legal characters, comments, CDATA
 * sections, processing instructions and an XML declaration of the standard form, one root, and
 * nothing outside it but white space, comments and processing instructions. Within that subset it
 * builds exactly the tree `@xmldom/xmldom` builds (the same nodes, names, namespaces, attribute
 * values, text and positions; `test/xml-tree.test.ts` compares the two node by node). On anything
 * else, a malformed document, an unknown entity, a non-ASCII name, a vendor quirk that
 * `@xmldom/xmldom` reports and recovers from, it returns `undefined` and the caller parses the text
 * with `@xmldom/xmldom` as before, so every error and every recovery stays the one it was.
 *
 * **What it does not check, `@xmldom/xmldom` does not either.** Text content is not validated
 * character by character, and neither is it there; the size, entity, DTD, depth and node-count
 * limits are enforced by `./secure-xml.ts` around this reader exactly as around the other.
 *
 * **Every string it hands out is part of the text or built from it.** A name, an attribute value
 * or a text node with nothing to decode is a slice of the source, which keeps the source alive as
 * long as the string is: the same as the `@xmldom/xmldom` tree, whose values are slices too, and
 * the parsed document keeps the source for its first `toString` anyway. Names, short attribute
 * values and the white space between elements are shared: a value read again is the string read
 * before, so a document's many `classCode="OBS"` hold one string.
 *
 * **It counts the tree's shape as it reads** (the elements at each depth, the first at each depth,
 * and the first element in each namespace), so the depth and node-count limits and the namespace
 * sweep `./secure-xml.ts` applies need no walk of the tree of their own.
 *
 * @internal
 */

/** The namespace of the `xml:` prefix, bound in every document. @internal */
const XML_NS = "http://www.w3.org/XML/1998/namespace";

/** The namespace of `xmlns` and `xmlns:` attributes. @internal */
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** DOM node types the reader builds. @internal */
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;

/** Character codes the reader branches on. @internal */
const TAB = 0x09;
const LINE_FEED = 0x0a;
const SPACE = 0x20;
const BANG = 0x21;
const DOUBLE_QUOTE = 0x22;
const HASH = 0x23;
const AMPERSAND = 0x26;
const SINGLE_QUOTE = 0x27;
const HYPHEN = 0x2d;
const DOT = 0x2e;
const SLASH = 0x2f;
const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;
const COLON = 0x3a;
const EQUALS = 0x3d;
const GREATER_THAN = 0x3e;
const QUESTION = 0x3f;
const UPPER_A = 0x41;
const UPPER_F = 0x46;
const UPPER_Z = 0x5a;
const UNDERSCORE = 0x5f;
const LOWER_A = 0x61;
const LOWER_F = 0x66;
const LOWER_X = 0x78;
const LOWER_Z = 0x7a;

/**
 * Every character is an XML `Char`: the test `@xmldom/xmldom` puts a comment, a CDATA section and a
 * processing instruction's data through (its grammar's `Char`, with the `u` flag, so a lone
 * surrogate fails). No carriage return can reach it: the text is read after its line endings are
 * normalized.
 *
 * @internal
 */
const CHARS_RE = /^[\t\n\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]*$/u;

/**
 * A processing instruction, as `@xmldom/xmldom`'s grammar reads one (`<?` Name, then white space
 * and the data up to the first `?>`), for the ASCII names this reader accepts. The name is
 * followed by white space or `?>`, neither of which a longer name could take, so where this
 * matches, the other grammar ends the instruction at the same `?>` with the same data.
 *
 * @internal
 */
const PI_RE =
  /<\?([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)(?:[ \t\n]+(?![ \t\n])([\t\n\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]*?))?\?>/uy;

/**
 * The XML declaration, transcribed from `@xmldom/xmldom`'s grammar (`XMLDecl`: version, an
 * optional encoding, an optional standalone flag), which it requires of an instruction named
 * `xml` at the start of the text.
 *
 * @internal
 */
const XML_DECL_RE =
  /<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:'1\.[0-9]+'|"1\.[0-9]+")(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"[A-Za-z][-A-Za-z0-9._]*"|'[A-Za-z][-A-Za-z0-9._]*'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:'(?:yes|no)'|"(?:yes|no)"))?[ \t\r\n]*\?>/y;

/** A node of the tree: an element, or text, CDATA, a comment or a processing instruction. @internal */
export type TreeNode = TreeElement | TreeCharacterData;

/**
 * An element of the tree. Its members carry the DOM names and meanings the model reads, so the
 * model reads this tree and an `@xmldom/xmldom` one alike.
 *
 * @internal
 */
export class TreeElement {
  /** The qualified name as written, `prefix:local` or `local`. */
  readonly nodeName: string;
  /** The name without its prefix. */
  readonly localName: string;
  /** The namespace the element is in, or `null`. */
  readonly namespaceURI: string | null;
  /** The parent element, or `null` for the root. */
  readonly parentNode: TreeElement | null;
  /** The first child node, or `null`. */
  firstChild: TreeNode | null = null;
  /** The next sibling node, or `null`. */
  nextSibling: TreeNode | null = null;
  /** The 1-based line of the element's `<`. */
  readonly lineNumber: number;
  /** The 1-based column of the element's `<`, in UTF-16 code units. */
  readonly columnNumber: number;
  /** The attributes in document order, three entries each: qualified name, value, namespace. */
  readonly attrs: readonly (string | null)[] | null;

  /** An element, with what it was read with: names, namespace, parent, attributes, position. */
  constructor(
    nodeName: string,
    localName: string,
    namespaceURI: string | null,
    parentNode: TreeElement | null,
    attrs: readonly (string | null)[] | null,
    lineNumber: number,
    columnNumber: number,
  ) {
    this.nodeName = nodeName;
    this.localName = localName;
    this.namespaceURI = namespaceURI;
    this.parentNode = parentNode;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
    this.attrs = attrs;
  }

  /** Always `1`, `Node.ELEMENT_NODE`. */
  get nodeType(): 1 {
    return 1;
  }

  /** The value of the attribute with this qualified name, or `null` (as `Element.getAttribute`). */
  getAttribute(name: string): string | null {
    const attrs = this.attrs;
    if (attrs === null) return null;
    for (let i = 0; i < attrs.length; i += 3) {
      if (attrs[i] === name) return attrs[i + 1] as string;
    }
    return null;
  }

  /**
   * The value of the attribute with this namespace and local name, or `null` (as
   * `Element.getAttributeNS`). The local name is the part of the qualified name after its colon.
   */
  getAttributeNS(namespaceURI: string | null, localName: string): string | null {
    const attrs = this.attrs;
    if (attrs === null) return null;
    for (let i = 0; i < attrs.length; i += 3) {
      if (attrs[i + 2] !== namespaceURI) continue;
      const name = attrs[i] as string;
      const colon = name.indexOf(":");
      const matches =
        colon === -1
          ? name === localName
          : name.length - colon - 1 === localName.length && name.endsWith(localName);
      if (matches) return attrs[i + 1] as string;
    }
    return null;
  }
}

/**
 * Text, a CDATA section, a comment or a processing instruction: a node with a value and no
 * children.
 *
 * @internal
 */
export class TreeCharacterData {
  /** `Node.TEXT_NODE`, `CDATA_SECTION_NODE`, `COMMENT_NODE` or `PROCESSING_INSTRUCTION_NODE`. */
  readonly nodeType: number;
  /** The text, the comment, or the instruction's data. */
  nodeValue: string;
  /** The parent element. */
  readonly parentNode: TreeElement;
  /** The next sibling node, or `null`. */
  nextSibling: TreeNode | null = null;

  /** A node of this type, with this value, under this parent. */
  constructor(nodeType: number, nodeValue: string, parentNode: TreeElement) {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
    this.parentNode = parentNode;
  }

  /** Always `null`: no children. */
  get firstChild(): null {
    return null;
  }

  /** The node's value, as `Node.textContent` reads it on a node that is not an element. */
  get textContent(): string {
    return this.nodeValue;
  }
}

/**
 * A processing instruction: character data with a target.
 *
 * @internal
 */
export class TreeInstruction extends TreeCharacterData {
  /** The instruction's target, the name after `<?`. */
  readonly target: string;

  /** An instruction with this target and data, under this parent. */
  constructor(target: string, data: string, parentNode: TreeElement) {
    super(PROCESSING_INSTRUCTION_NODE, data, parentNode);
    this.target = target;
  }
}

/**
 * A document as {@link readDocument} reads it: the root element, and what stands before and after
 * it (the XML declaration, comments, processing instructions and the white space between them)
 * already written as `@xmldom/xmldom`'s serializer writes those nodes.
 *
 * @internal
 */
export interface TreeDocument {
  /** The root element. */
  readonly root: TreeElement;
  /** The nodes before the root, written out. */
  readonly prolog: string;
  /** The nodes after the root, written out. */
  readonly epilog: string;
  /** The tree's shape, counted as it was read. */
  readonly shape: TreeShape;
}

/**
 * What a walk of the tree level by level would find, counted while it is read, so the depth and
 * node-count limits and the namespace sweep need no walk of their own. Depth 0 is the root's.
 *
 * @internal
 */
export interface TreeShape {
  /** The number of elements at each depth. */
  readonly perDepth: readonly number[];
  /** The first element, in document order, at each depth. */
  readonly firstAtDepth: readonly TreeElement[];
  /**
   * For each namespace the elements are in (`null` for none), in the order first met in document
   * order: the shallowest element in it, the first in document order among those; its depth; and
   * its place in document order.
   */
  readonly namespaceElements: readonly TreeElement[];
  readonly namespaceDepths: readonly number[];
  readonly namespaceIndexes: readonly number[];
}

/**
 * Above this many attributes on one element, repeats are found through a set rather than by
 * comparing each attribute with those before it, so a tag with thousands of attributes is read in
 * linear time.
 *
 * @internal
 */
const MANY_ATTRIBUTES = 8;

/** A name's first character: an ASCII letter or `_`. @internal */
function isNameStart(code: number): boolean {
  return (
    (code >= LOWER_A && code <= LOWER_Z) ||
    (code >= UPPER_A && code <= UPPER_Z) ||
    code === UNDERSCORE
  );
}

/** A name's later character: an ASCII letter, digit, `_`, `-` or `.`. @internal */
function isNameChar(code: number): boolean {
  return (
    isNameStart(code) || (code >= DIGIT_0 && code <= DIGIT_9) || code === HYPHEN || code === DOT
  );
}

/** White space between the parts of a tag, and outside the root: space, tab or line feed. @internal */
function isSpace(code: number): boolean {
  return code === SPACE || code === LINE_FEED || code === TAB;
}

/** Whether a code point is an XML `Char`, which a character reference must name to be read here. @internal */
function isXmlChar(code: number): boolean {
  return (
    code === TAB ||
    code === LINE_FEED ||
    code === 0x0d ||
    (code >= SPACE && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/** A hexadecimal digit's value, or -1. @internal */
function hexValue(code: number): number {
  if (code >= DIGIT_0 && code <= DIGIT_9) return code - DIGIT_0;
  if (code >= LOWER_A && code <= LOWER_F) return code - LOWER_A + 10;
  if (code >= UPPER_A && code <= UPPER_F) return code - UPPER_A + 10;
  return -1;
}

/** The most digits a character reference may have here: any legal one fits, with no leading zero run. @internal */
const MAX_REFERENCE_DIGITS = 7;

/** The number of strings the reader keeps to share: a power of two. @internal */
const SHARED_SLOTS = 512;

/** The longest attribute value shared rather than sliced: codes, OIDs, class and mood codes repeat. @internal */
const MAX_SHARED_VALUE = 64;

/** The longest run of white space shared rather than sliced. @internal */
const MAX_SHARED_SPACE = 256;

/**
 * Read `source` into a tree and return its root element, or `undefined` when the text is outside
 * the subset this reader vouches for (see the module comment). `source` is the text after its
 * byte order mark is removed and its line endings normalized, as `@xmldom/xmldom` reads it.
 *
 * @internal
 */
export function readTree(source: string): TreeElement | undefined {
  return readDocument(source)?.root;
}

/**
 * {@link readTree}, with the nodes outside the root written out beside it (see
 * {@link TreeDocument}), for writing the document back out.
 *
 * @internal
 */
export function readDocument(source: string): TreeDocument | undefined {
  return new Reader(source).read();
}

/** One read of one text. @internal */
class Reader {
  private readonly source: string;
  private readonly length: number;

  /** The 1-based line of the text at {@link lineStart}, the offset its line starts at, and the next line feed at or after it. */
  private line = 1;
  private lineStart = 0;
  private nextLineFeed: number;

  /** The next `&` at or after the last place one was looked for, or the length of the text when there is none. */
  private nextAmpersand: number;

  /** The open elements, innermost last, and the last child of each. */
  private readonly open: TreeElement[] = [];
  private readonly lastChild: (TreeNode | null)[] = [];
  private root: TreeElement | undefined = undefined;

  /**
   * The nodes outside the root, written out: the white space read last outside it (written only
   * when a node follows it, as `@xmldom/xmldom` adds none for white space that ends the text), and
   * what stands before and after the root.
   */
  private space = "";
  private prolog = "";
  private epilog = "";

  /**
   * The namespace each prefix in scope is bound to (`""` for the default namespace), and what each
   * declaration replaced, to put back when its element ends: a prefix, the binding it had
   * (`undefined` when it had none), and for each open element the number of entries it added.
   * A lookup is one map read however deep the declarations nest.
   */
  private readonly bindings = new Map<string, string | null>([
    ["", null],
    ["xml", XML_NS],
  ]);
  private readonly replacedPrefix: string[] = [];
  private readonly replacedUri: (string | null | undefined)[] = [];
  private readonly declared: number[] = [];

  /** The tree's shape, counted as each element is read (see {@link TreeShape}). */
  private readonly perDepth: number[] = [];
  private readonly firstAtDepth: TreeElement[] = [];
  private readonly namespaceElements: TreeElement[] = [];
  private readonly namespaceDepths: number[] = [];
  private readonly namespaceIndexes: number[] = [];
  private readonly namespaceSlots = new Map<string, number>();
  private noNamespaceSlot = -1;
  private elementCount = 0;
  /** The namespace of the last element read and its slot: most elements share their neighbour's. */
  private lastNamespace: string | null | undefined = undefined;
  private lastSlot = -1;

  /** The first `<` at or after {@link ltFrom}, or -1: what a start tag found, kept for the text after it. */
  private ltFrom = Number.MAX_SAFE_INTEGER;
  private ltAt = -1;

  /**
   * Names and runs of white space read so far, shared rather than sliced again: a table of
   * {@link SHARED_SLOTS} strings, each in the slot a hash of its text picks. A string whose slot
   * holds another takes it over; the table is made at its size once, and never grows.
   */
  private readonly seen = new Array<string | undefined>(SHARED_SLOTS);

  /**
   * The attributes of the start tag being read, copied to an array of their own size when it ends.
   * Its length is never set back: an array cut to empty gives up its storage and grows it again at
   * the next `push`, so the count of entries in use is kept beside it.
   */
  private readonly pending: (string | null)[] = [];

  constructor(source: string) {
    this.source = source;
    this.length = source.length;
    this.nextLineFeed = source.indexOf("\n");
    const amp = source.indexOf("&");
    this.nextAmpersand = amp === -1 ? source.length : amp;
  }

  read(): TreeDocument | undefined {
    const source = this.source;
    let pos = 0;
    while (pos < this.length) {
      const known = this.ltFrom <= pos && (this.ltAt === -1 || this.ltAt >= pos);
      const lt = known ? this.ltAt : source.indexOf("<", pos);
      const textEnd = lt === -1 ? this.length : lt;
      if (textEnd > pos && !this.text(pos, textEnd)) return undefined;
      if (lt === -1) break;
      const next = source.charCodeAt(lt + 1);
      let end: number;
      if (next === SLASH) end = this.endTag(lt);
      else if (next === QUESTION) end = this.instruction(lt);
      else if (next === BANG) end = this.commentOrCdata(lt);
      else end = this.startTag(lt);
      if (end === -1) return undefined;
      pos = end;
    }
    if (this.open.length > 0 || this.root === undefined) return undefined;
    const shape: TreeShape = {
      perDepth: this.perDepth,
      firstAtDepth: this.firstAtDepth,
      namespaceElements: this.namespaceElements,
      namespaceDepths: this.namespaceDepths,
      namespaceIndexes: this.namespaceIndexes,
    };
    return { root: this.root, prolog: this.prolog, epilog: this.epilog, shape };
  }

  /** Read the text from `start` to `end`: white space only outside the root, a text node inside it. */
  private text(start: number, end: number): boolean {
    const source = this.source;
    if (this.open.length === 0) {
      for (let i = start; i < end; i++) {
        if (!isSpace(source.charCodeAt(i))) return false;
      }
      this.space = source.slice(start, end);
      return true;
    }
    const value = this.decoded(start, end, false);
    if (value === undefined) return false;
    this.append(new TreeCharacterData(TEXT_NODE, value, this.current()), true);
    return true;
  }

  /**
   * The text from `start` to `end` as `@xmldom/xmldom` reads it: in an attribute value, a tab or
   * line feed becomes a space first; then each predefined entity and character reference is
   * replaced by what it stands for. `undefined` when it holds any other `&`.
   */
  private decoded(start: number, end: number, attribute: boolean): string | undefined {
    const source = this.source;
    if (this.nextAmpersand < start) {
      const amp = source.indexOf("&", start);
      this.nextAmpersand = amp === -1 ? this.length : amp;
    }
    const hasReference = this.nextAmpersand < end;
    if (!attribute && !hasReference) return this.plainText(start, end);
    if (attribute && !hasReference && !hasTabOrLineFeed(source, start, end)) {
      return end - start <= MAX_SHARED_VALUE ? this.shared(start, end) : source.slice(start, end);
    }
    let out = "";
    let from = start;
    for (let i = start; i < end; i++) {
      const code = source.charCodeAt(i);
      if (attribute && (code === TAB || code === LINE_FEED)) {
        out += `${source.slice(from, i)} `;
        from = i + 1;
      } else if (code === AMPERSAND) {
        const semi = source.indexOf(";", i + 1);
        if (semi === -1 || semi >= end) return undefined;
        const value = referenceValue(source, i + 1, semi);
        if (value === undefined) return undefined;
        out += source.slice(from, i) + value;
        i = semi;
        from = semi + 1;
      }
    }
    const amp = source.indexOf("&", end);
    this.nextAmpersand = amp === -1 ? this.length : amp;
    return out + source.slice(from, end);
  }

  /** Text with nothing to decode: a shared string for a run of white space, else a slice. */
  private plainText(start: number, end: number): string {
    const source = this.source;
    const length = end - start;
    if (length <= MAX_SHARED_SPACE) {
      let i = start;
      while (i < end && isSpace(source.charCodeAt(i))) i++;
      if (i === end) return this.shared(start, end);
    }
    return source.slice(start, end);
  }

  /**
   * The string from `start` to `end`, shared with an equal one read before. Strings are found by
   * an FNV-1a hash of their text and compared in place.
   */
  private shared(start: number, end: number): string {
    const source = this.source;
    let hash = 0x811c9dc5;
    for (let i = start; i < end; i++) {
      hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193);
    }
    const slot = hash & (SHARED_SLOTS - 1);
    const known = this.seen[slot];
    if (known !== undefined && known.length === end - start && source.startsWith(known, start)) {
      return known;
    }
    const value = source.slice(start, end);
    this.seen[slot] = value;
    return value;
  }

  /** Write out a node outside the root, after the white space before it. */
  private outside(written: string): void {
    const piece = this.space + written;
    this.space = "";
    if (this.root === undefined) this.prolog += piece;
    else this.epilog += piece;
  }

  /** The innermost open element. Called only while one is open. */
  private current(): TreeElement {
    return this.open[this.open.length - 1] as TreeElement;
  }

  /**
   * Append a node to the innermost open element. Text that follows text joins it, as the
   * `normalize()` `@xmldom/xmldom` runs at the end of its parse joins them (an empty CDATA
   * section between two runs of text leaves them side by side).
   */
  private append(node: TreeCharacterData | TreeElement, isText: boolean): void {
    const depth = this.open.length - 1;
    const last = this.lastChild[depth] as TreeNode | null;
    if (last === null) {
      this.current().firstChild = node;
    } else {
      if (isText && last.nodeType === TEXT_NODE) {
        last.nodeValue += (node as TreeCharacterData).nodeValue;
        return;
      }
      last.nextSibling = node;
    }
    this.lastChild[depth] = node;
  }

  /** The end of the name starting at `start` (an ASCII name, with at most one colon inside it), or -1. */
  private nameEnd(start: number): number {
    const source = this.source;
    if (!isNameStart(source.charCodeAt(start))) return -1;
    let i = start + 1;
    while (isNameChar(source.charCodeAt(i))) i++;
    if (source.charCodeAt(i) === COLON) {
      if (!isNameStart(source.charCodeAt(i + 1))) return -1;
      i += 2;
      while (isNameChar(source.charCodeAt(i))) i++;
    }
    return i;
  }

  /** Skip white space from `pos`; return where it ends. */
  private skipSpace(pos: number): number {
    let i = pos;
    while (isSpace(this.source.charCodeAt(i))) i++;
    return i;
  }

  /** The line and column of offset `pos`, as `@xmldom/xmldom`'s locator counts them. */
  private advanceLines(pos: number): void {
    while (this.nextLineFeed !== -1 && this.nextLineFeed < pos) {
      this.line += 1;
      this.lineStart = this.nextLineFeed + 1;
      this.nextLineFeed = this.source.indexOf("\n", this.lineStart);
    }
  }

  /** Read a start tag at `lt`; return the offset after it, or -1. */
  private startTag(lt: number): number {
    const source = this.source;
    const nameStart = lt + 1;
    const nameEnd = this.nameEnd(nameStart);
    if (nameEnd === -1) return -1;
    // A `<` inside an attribute value is refused here; anywhere else in the tag it fails the name
    // or the `>` it stands in the place of.
    const nextLt = source.indexOf("<", nameEnd);
    this.ltFrom = nameEnd;
    this.ltAt = nextLt;

    const pending = this.pending;
    let count = 0;
    let pos = nameEnd;
    let closed = false;
    for (;;) {
      const afterSpace = this.skipSpace(pos);
      const code = source.charCodeAt(afterSpace);
      if (code === GREATER_THAN) {
        pos = afterSpace + 1;
        break;
      }
      if (code === SLASH && source.charCodeAt(afterSpace + 1) === GREATER_THAN) {
        pos = afterSpace + 2;
        closed = true;
        break;
      }
      if (afterSpace === pos) return -1;
      const attrEnd = this.nameEnd(afterSpace);
      if (attrEnd === -1) return -1;
      const eq = this.skipSpace(attrEnd);
      if (source.charCodeAt(eq) !== EQUALS) return -1;
      const open = this.skipSpace(eq + 1);
      const quote = source.charCodeAt(open);
      if (quote !== DOUBLE_QUOTE && quote !== SINGLE_QUOTE) return -1;
      const close = source.indexOf(quote === DOUBLE_QUOTE ? '"' : "'", open + 1);
      if (close === -1 || (nextLt !== -1 && nextLt < close)) return -1;
      const value = this.decoded(open + 1, close, true);
      if (value === undefined) return -1;
      pending[count] = this.shared(afterSpace, attrEnd);
      pending[count + 1] = value;
      pending[count + 2] = null;
      count += 3;
      pos = close + 1;
    }

    const element = this.element(
      lt,
      nameStart,
      nameEnd,
      count === 0 ? null : pending.slice(0, count),
    );
    if (element === undefined) return -1;
    if (!closed) {
      this.open.push(element);
      this.lastChild.push(null);
    } else {
      this.unbind();
    }
    return pos;
  }

  /**
   * Bind the namespaces an element declares, resolve its name's and its attributes' namespaces,
   * and add it to the tree. `undefined` for a declaration, a prefix or a pair of attributes
   * `@xmldom/xmldom` refuses or reads in a way this reader does not repeat: a prefix bound to
   * nothing, the reserved prefixes and namespaces, an unbound prefix, a repeated attribute.
   */
  private element(
    lt: number,
    nameStart: number,
    nameEnd: number,
    attrs: (string | null)[] | null,
  ): TreeElement | undefined {
    const source = this.source;
    const bindings = this.bindings;
    let declarations = 0;
    if (attrs !== null) {
      for (let i = 0; i < attrs.length; i += 3) {
        const name = attrs[i] as string;
        const uri = attrs[i + 1] as string;
        let prefix: string;
        if (name === "xmlns") prefix = "";
        else if (name.startsWith("xmlns:")) prefix = name.slice(6);
        else continue;
        if (prefix === "xml" || prefix === "xmlns" || uri === XML_NS || uri === XMLNS_NS) {
          return undefined;
        }
        if (prefix !== "" && uri === "") return undefined;
        this.replacedPrefix.push(prefix);
        this.replacedUri.push(bindings.get(prefix));
        declarations += 1;
        bindings.set(prefix, uri === "" ? null : uri);
        attrs[i + 2] = XMLNS_NS;
      }
    }
    // A refusal below ends the read, so nothing it leaves bound is ever read.
    this.declared.push(declarations);
    if (attrs !== null) {
      for (let i = 0; i < attrs.length; i += 3) {
        const name = attrs[i] as string;
        const colon = name.indexOf(":");
        if (colon !== -1 && attrs[i + 2] === null) {
          const prefix = name.slice(0, colon);
          // Only the default namespace is ever bound to null, and a prefix here is never empty.
          const uri = bindings.get(prefix);
          if (uri === undefined) return undefined;
          attrs[i + 2] = uri;
        }
      }
      if (hasRepeatedAttribute(attrs)) return undefined;
    }

    const nodeName = this.shared(nameStart, nameEnd);
    const colon = nodeName.indexOf(":");
    let localName = nodeName;
    let namespaceURI: string | null | undefined;
    if (colon === -1) {
      if (nodeName === "xmlns") return undefined;
      // The default namespace is always bound: to null at the start, and put back when undeclared.
      namespaceURI = bindings.get("");
    } else {
      const prefix = source.slice(nameStart, nameStart + colon);
      if (prefix === "xml" || prefix === "xmlns") return undefined;
      namespaceURI = bindings.get(prefix);
      if (namespaceURI === undefined) return undefined;
      localName = this.shared(nameStart + colon + 1, nameEnd);
    }

    const depth = this.open.length;
    if (depth === 0) {
      if (this.root !== undefined) return undefined;
      this.prolog += this.space;
      this.space = "";
    }
    this.advanceLines(lt);
    const parent = depth === 0 ? null : this.current();
    const element = new TreeElement(
      nodeName,
      localName,
      namespaceURI as string | null,
      parent,
      attrs,
      this.line,
      lt - this.lineStart + 1,
    );
    if (parent === null) this.root = element;
    else this.append(element, false);
    this.count(element, depth);
    return element;
  }

  /** Count an element into the tree's shape (see {@link TreeShape}). */
  private count(element: TreeElement, depth: number): void {
    if (depth === this.perDepth.length) {
      this.perDepth.push(1);
      this.firstAtDepth.push(element);
    } else {
      this.perDepth[depth] = (this.perDepth[depth] as number) + 1;
    }
    const index = this.elementCount;
    this.elementCount += 1;
    const ns = element.namespaceURI;
    let slot = this.lastSlot;
    if (ns !== this.lastNamespace) {
      slot = ns === null ? this.noNamespaceSlot : (this.namespaceSlots.get(ns) ?? -1);
      this.lastNamespace = ns;
    }
    if (slot === -1) {
      slot = this.namespaceElements.length;
      this.namespaceElements.push(element);
      this.namespaceDepths.push(depth);
      this.namespaceIndexes.push(index);
      if (ns === null) this.noNamespaceSlot = slot;
      else this.namespaceSlots.set(ns, slot);
    } else if ((this.namespaceDepths[slot] as number) > depth) {
      this.namespaceElements[slot] = element;
      this.namespaceDepths[slot] = depth;
      this.namespaceIndexes[slot] = index;
    }
    this.lastSlot = slot;
  }

  /** Put back the bindings the element that is ending declared over. */
  private unbind(): void {
    const bindings = this.bindings;
    for (let n = this.declared.pop() as number; n > 0; n--) {
      const prefix = this.replacedPrefix.pop() as string;
      const uri = this.replacedUri.pop();
      if (uri === undefined) bindings.delete(prefix);
      else bindings.set(prefix, uri);
    }
  }

  /** Read an end tag at `lt`: the open element's name, white space, `>`. Return the offset after it, or -1. */
  private endTag(lt: number): number {
    const source = this.source;
    const element = this.open[this.open.length - 1];
    if (element === undefined) return -1;
    const name = element.nodeName;
    const nameStart = lt + 2;
    if (
      !source.startsWith(name, nameStart) ||
      isNameChar(source.charCodeAt(nameStart + name.length))
    ) {
      return -1;
    }
    if (source.charCodeAt(nameStart + name.length) === COLON) return -1;
    const gt = this.skipSpace(nameStart + name.length);
    if (source.charCodeAt(gt) !== GREATER_THAN) return -1;
    this.open.pop();
    this.lastChild.pop();
    this.unbind();
    return gt + 1;
  }

  /** Read a processing instruction (or the XML declaration) at `lt`; return the offset after it, or -1. */
  private instruction(lt: number): number {
    const source = this.source;
    PI_RE.lastIndex = lt;
    const match = PI_RE.exec(source);
    if (match === null) return -1;
    const target = match[1] as string;
    if (target.toLowerCase() === "xml") {
      if (lt !== 0) return -1;
      XML_DECL_RE.lastIndex = 0;
      if (!XML_DECL_RE.test(source)) return -1;
    }
    const data = match[2] ?? "";
    if (this.open.length > 0) {
      this.append(new TreeInstruction(target, data, this.current()), false);
    } else {
      this.outside(`<?${target} ${data}?>`);
    }
    return lt + match[0].length;
  }

  /** Read a comment or a CDATA section at `lt`; return the offset after it, or -1. */
  private commentOrCdata(lt: number): number {
    const source = this.source;
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("--", lt + 4);
      if (end === -1 || source.charCodeAt(end + 2) !== GREATER_THAN) return -1;
      const value = source.slice(lt + 4, end);
      if (!CHARS_RE.test(value)) return -1;
      if (this.open.length > 0) {
        this.append(new TreeCharacterData(COMMENT_NODE, value, this.current()), false);
      } else {
        this.outside(`<!--${value}-->`);
      }
      return end + 3;
    }
    if (source.startsWith("<![CDATA[", lt) && this.open.length > 0) {
      const end = source.indexOf("]]>", lt + 9);
      if (end === -1) return -1;
      const value = source.slice(lt + 9, end);
      if (!CHARS_RE.test(value)) return -1;
      // An empty section adds no node, as `@xmldom/xmldom` adds none.
      if (value !== "") {
        this.append(new TreeCharacterData(CDATA_SECTION_NODE, value, this.current()), false);
      }
      return end + 3;
    }
    return -1;
  }
}

/** The part of a qualified name after its colon, or the name itself. @internal */
function localPart(name: string): string {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

/**
 * Whether two attributes of one element share a qualified name, or a namespace and a local name
 * (`@xmldom/xmldom` refuses the first and keeps only the later of the second). Each entry is a
 * qualified name, a value and the namespace, which is `null` only for an unprefixed attribute.
 *
 * @internal
 */
function hasRepeatedAttribute(attrs: readonly (string | null)[]): boolean {
  if (attrs.length <= MANY_ATTRIBUTES * 3) {
    for (let i = 3; i < attrs.length; i += 3) {
      const name = attrs[i] as string;
      const ns = attrs[i + 2];
      for (let j = 0; j < i; j += 3) {
        if (attrs[j] === name) return true;
        if (
          ns !== null &&
          attrs[j + 2] === ns &&
          localPart(attrs[j] as string) === localPart(name)
        ) {
          return true;
        }
      }
    }
    return false;
  }
  const names = new Set<string>();
  const expanded = new Set<string>();
  for (let i = 0; i < attrs.length; i += 3) {
    const name = attrs[i] as string;
    if (names.has(name)) return true;
    names.add(name);
    const ns = attrs[i + 2];
    if (ns !== null) {
      // A local name holds no space, so the first space in the key ends it: no two pairs share one.
      const key = `${localPart(name)} ${ns}`;
      if (expanded.has(key)) return true;
      expanded.add(key);
    }
  }
  return false;
}

/** Whether the text from `start` to `end` holds a tab or a line feed. @internal */
function hasTabOrLineFeed(source: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const code = source.charCodeAt(i);
    if (code === TAB || code === LINE_FEED) return true;
  }
  return false;
}

/**
 * What the reference from `start` (after its `&`) to `semi` (its `;`) stands for: one of the
 * five predefined entities, or a decimal or hexadecimal character reference to an XML `Char`.
 * `undefined` for anything else.
 *
 * @internal
 */
function referenceValue(source: string, start: number, semi: number): string | undefined {
  const length = semi - start;
  if (source.charCodeAt(start) !== HASH) {
    if (length === 3 && source.startsWith("amp", start)) return "&";
    if (length === 2 && source.startsWith("lt", start)) return "<";
    if (length === 2 && source.startsWith("gt", start)) return ">";
    if (length === 4 && source.startsWith("quot", start)) return '"';
    if (length === 4 && source.startsWith("apos", start)) return "'";
    return undefined;
  }
  const hex = source.charCodeAt(start + 1) === LOWER_X;
  const digitsStart = hex ? start + 2 : start + 1;
  const digits = semi - digitsStart;
  if (digits < 1 || digits > MAX_REFERENCE_DIGITS) return undefined;
  let code = 0;
  for (let i = digitsStart; i < semi; i++) {
    const c = source.charCodeAt(i);
    if (hex) {
      const v = hexValue(c);
      if (v === -1) return undefined;
      code = code * 16 + v;
    } else {
      if (c < DIGIT_0 || c > DIGIT_9) return undefined;
      code = code * 10 + (c - DIGIT_0);
    }
  }
  if (!isXmlChar(code)) return undefined;
  return String.fromCodePoint(code);
}
