/**
 * Namespace-aware DOM read helpers shared across the `@cosyte/ccda` model
 * layer. C-CDA structural elements live in the HL7 v3 namespace, so child
 * lookups are namespace-scoped to that URI by default; attribute reads use the
 * unprefixed accessor (C-CDA attributes like `root`, `code`, `value`,
 * `nullFlavor` carry no namespace) except `xsi:type`, which is namespace-keyed.
 *
 * Every helper is read-only and returns whatever the document carries, so a
 * returned string is document content and must never be routed into a
 * diagnostic. The warning and fatal registries make that structurally
 * impossible (they interpolate nothing); {@link positionOf} is the one helper
 * here that feeds a diagnostic, and it bounds what it puts there.
 */

import { V3_NS, XSI_NS } from "../parser/namespaces.js";
import { safeElementName } from "../parser/tokens.js";
import type { CcdaPosition } from "../parser/types.js";
import type { Element, Node } from "@xmldom/xmldom";

/** Element node type per the DOM spec (`Node.ELEMENT_NODE`). @internal */
const ELEMENT_NODE = 1 as const;

/** Processing instruction node type per the DOM spec (`Node.PROCESSING_INSTRUCTION_NODE`). @internal */
const PROCESSING_INSTRUCTION_NODE = 7 as const;

/** Comment node type per the DOM spec (`Node.COMMENT_NODE`). @internal */
const COMMENT_NODE = 8 as const;

/**
 * Read an unprefixed attribute, returning `undefined` (never `null` or `""`)
 * when the attribute is absent or empty, matches the
 * `exactOptionalPropertyTypes` "omit, don't set undefined" discipline used
 * throughout the model.
 *
 * @example
 * ```ts
 * import { attr } from "@cosyte/ccda";
 * const root = attr(el, "root"); // string | undefined
 * ```
 */
export function attr(el: Element, name: string): string | undefined {
  const value = el.getAttribute(name);
  return value === null || value === "" ? undefined : value;
}

/**
 * Read the `xsi:type` attribute (namespace-qualified) that selects a concrete
 * HL7 v3 datatype for a polymorphic element. Returns `undefined` when absent.
 * A leading namespace prefix (e.g. `hl7:PQ`) is stripped to the local type
 * name.
 *
 * @example
 * ```ts
 * import { xsiType } from "@cosyte/ccda";
 * xsiType(valueEl); // "PQ" | "CD" | ... | undefined
 * ```
 */
export function xsiType(el: Element): string | undefined {
  const raw = el.getAttributeNS(XSI_NS, "type");
  if (raw === null || raw === "") return undefined;
  const colon = raw.lastIndexOf(":");
  return colon === -1 ? raw : raw.slice(colon + 1);
}

/**
 * Return the first direct child element in the HL7 v3 namespace with the given
 * local name, or `undefined`. Only direct children are considered (no
 * descendant search), so structurally distinct same-named elements at deeper
 * levels are not accidentally matched.
 *
 * @example
 * ```ts
 * import { child } from "@cosyte/ccda";
 * const code = child(sectionEl, "code"); // Element | undefined
 * ```
 */
export function child(el: Element, localName: string): Element | undefined {
  for (let n = el.firstChild; n !== null; n = n.nextSibling) {
    if (isV3Element(n, localName)) return n;
  }
  return undefined;
}

/**
 * Return all direct child elements in the HL7 v3 namespace with the given
 * local name, in document order. Empty array when none match.
 *
 * @example
 * ```ts
 * import { children } from "@cosyte/ccda";
 * for (const comp of children(bodyEl, "component")) {
 *   // ...
 * }
 * ```
 */
export function children(el: Element, localName: string): readonly Element[] {
  // Counted first, so the array is made at its size: an array grown from empty by `push` reserves
  // room for seventeen elements at the first one, and most lookups find none or one. Every slot is
  // filled before it is returned.
  let count = 0;
  let first: Element | undefined;
  for (let n = el.firstChild; n !== null; n = n.nextSibling) {
    if (isV3Element(n, localName)) {
      if (count === 0) first = n;
      count += 1;
    }
  }
  if (first === undefined) return [];
  if (count === 1) return [first];
  const out = new Array<Element>(count);
  let i = 0;
  for (let n: Node | null = first; n !== null; n = n.nextSibling) {
    if (isV3Element(n, localName)) {
      out[i] = n;
      i += 1;
    }
  }
  return out;
}

/**
 * Return all direct child elements (any namespace), in document order. Used
 * where the caller wants to enumerate structure without filtering by name.
 *
 * @example
 * ```ts
 * import { childElements } from "@cosyte/ccda";
 * const kids = childElements(el);
 * ```
 */
export function childElements(el: Element): readonly Element[] {
  return elementChildren(el);
}

/**
 * The direct child elements of `el`, in document order, in an array made at its size (see
 * {@link children}).
 *
 * @internal
 */
export function elementChildren(el: Element): Element[] {
  let count = 0;
  let first: Element | undefined;
  for (let n = el.firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType === ELEMENT_NODE) {
      if (count === 0) first = n as Element;
      count += 1;
    }
  }
  if (first === undefined) return [];
  if (count === 1) return [first];
  const out = new Array<Element>(count);
  let i = 0;
  for (let n: Node | null = first; n !== null; n = n.nextSibling) {
    if (n.nodeType === ELEMENT_NODE) {
      out[i] = n as Element;
      i += 1;
    }
  }
  return out;
}

/**
 * Concatenated text content of an element with leading/trailing whitespace
 * trimmed, or `undefined` when there is no non-whitespace text. Does not decode
 * or interpret embedded base64, base64 stays quarantined as inert text.
 *
 * @example
 * ```ts
 * import { text } from "@cosyte/ccda";
 * text(titleEl); // "Allergies" | undefined
 * ```
 */
export function text(el: Element): string | undefined {
  const raw = el.nodeType === ELEMENT_NODE ? textContentOf(el) : el.textContent;
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * An element's `textContent`, read without the copies `@xmldom/xmldom` makes for it. Its getter
 * walks the subtree with a frame object per node and joins an array of the parts; this walks the
 * same nodes in the same order through the sibling and parent links, and returns the one text
 * node of an element that has only one (a title, a code's original text, most narrative cells)
 * as it is.
 *
 * The same rule as the getter: every descendant's `nodeValue` in document order, elements
 * entered, processing instructions and comments left out. What is left is a text or CDATA node,
 * whose value is always a string: `@xmldom/xmldom` refuses any other kind of node as an element's
 * child.
 *
 * @internal
 */
function textContentOf(el: Element): string {
  const first = el.firstChild;
  if (first !== null && first.nextSibling === null && contributesText(first.nodeType)) {
    return first.nodeValue as string;
  }
  let out = "";
  let node: Node | null = first;
  while (node !== null) {
    const type = node.nodeType;
    if (type === ELEMENT_NODE) {
      const inner: Node | null = node.firstChild;
      if (inner !== null) {
        node = inner;
        continue;
      }
    } else if (contributesText(type)) {
      out += node.nodeValue as string;
    }
    // The next node in document order inside `el`: the next sibling, else the next sibling of
    // the nearest ancestor that has one, stopping at `el`.
    let next: Node | null = node.nextSibling;
    let up: Node | null = node;
    while (next === null) {
      up = up.parentNode;
      if (up === null || up === el) break;
      next = up.nextSibling;
    }
    node = next;
  }
  return out;
}

/** Whether a node of this type adds its value to an element's text: not an element, comment or processing instruction. @internal */
function contributesText(nodeType: number): boolean {
  return (
    nodeType !== ELEMENT_NODE &&
    nodeType !== COMMENT_NODE &&
    nodeType !== PROCESSING_INSTRUCTION_NODE
  );
}

/**
 * Build a structural position for an element: its local name as a path hint
 * plus the locator line/column `@xmldom/xmldom` recorded (when present). Never
 * includes attribute values or text content.
 *
 * **`path` is bounded on membership, not copied.** A local name is an XML
 * NCName, so a sender can call an element anything, and `enforceStructureLimits`
 * in `../parser/secure-xml.ts` positions on arbitrary elements from a hostile
 * document. Only a name in the CDA vocabulary this parser navigates is echoed;
 * anything else becomes `<withheld>` (see `../parser/tokens.ts`). Line and
 * column still locate it exactly.
 *
 * @example
 * ```ts
 * import { positionOf } from "@cosyte/ccda";
 * const pos = positionOf(sectionEl); // { path: "section", line: 42, ... }
 * ```
 */
export function positionOf(el: Element): CcdaPosition {
  const withLoc = el as Element & { lineNumber?: number; columnNumber?: number };
  const pos: { path?: string; line?: number; column?: number } = {};
  /* v8 ignore else -- every element @xmldom/xmldom builds has a non-empty local name */
  if (typeof el.localName === "string" && el.localName.length > 0) {
    pos.path = safeElementName(el.localName);
  }
  if (typeof withLoc.lineNumber === "number") pos.line = withLoc.lineNumber;
  if (typeof withLoc.columnNumber === "number") pos.column = withLoc.columnNumber;
  return pos;
}

/**
 * True when a node is an element in the HL7 v3 namespace with the given local name. The local
 * name is compared before the namespace: nearly every sibling a lookup passes over has another
 * name, and a name that differs (in length, or in its first characters) is told apart sooner
 * than a namespace that matches, which has to be read to its end. Only text nodes lack a
 * `localName` of their own (it is `undefined` or `null`), and neither equals a name.
 *
 * @internal
 */
function isV3Element(node: Node, localName: string): node is Element {
  const el = node as Element;
  return el.localName === localName && el.nodeType === ELEMENT_NODE && el.namespaceURI === V3_NS;
}
