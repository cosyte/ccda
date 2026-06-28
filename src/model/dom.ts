/**
 * Namespace-aware DOM read helpers shared across the `@cosyte/ccda` model
 * layer. C-CDA structural elements live in the HL7 v3 namespace, so child
 * lookups are namespace-scoped to that URI by default; attribute reads use the
 * unprefixed accessor (C-CDA attributes like `root`, `code`, `value`,
 * `nullFlavor` carry no namespace) except `xsi:type`, which is namespace-keyed.
 *
 * Every helper is read-only and PHI-safe in the sense that it returns whatever
 * the document carries — callers are responsible for never routing returned
 * *values* into warning/error message strings (only structural locators).
 */

import { V3_NS, XSI_NS } from "../parser/namespaces.js";
import type { CcdaPosition } from "../parser/types.js";
import type { Element, Node } from "@xmldom/xmldom";

/** Element node type per the DOM spec (`Node.ELEMENT_NODE`). @internal */
const ELEMENT_NODE = 1 as const;

/**
 * Read an unprefixed attribute, returning `undefined` (never `null` or `""`)
 * when the attribute is absent or empty — matches the
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
  const out: Element[] = [];
  for (let n = el.firstChild; n !== null; n = n.nextSibling) {
    if (isV3Element(n, localName)) out.push(n);
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
  const out: Element[] = [];
  for (let n = el.firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType === ELEMENT_NODE) out.push(n as Element);
  }
  return out;
}

/**
 * Concatenated text content of an element with leading/trailing whitespace
 * trimmed, or `undefined` when there is no non-whitespace text. Does not decode
 * or interpret embedded base64 — base64 stays quarantined as inert text.
 *
 * @example
 * ```ts
 * import { text } from "@cosyte/ccda";
 * text(titleEl); // "Allergies" | undefined
 * ```
 */
export function text(el: Element): string | undefined {
  const raw = el.textContent;
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Build a PHI-free structural position for an element — its local name as a
 * path hint plus the locator line/column `@xmldom/xmldom` recorded (when
 * present). Never includes attribute values or text content.
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
  if (typeof el.localName === "string" && el.localName.length > 0) pos.path = el.localName;
  if (typeof withLoc.lineNumber === "number") pos.line = withLoc.lineNumber;
  if (typeof withLoc.columnNumber === "number") pos.column = withLoc.columnNumber;
  return pos;
}

/** True when a node is an element in the HL7 v3 namespace with the given local name. @internal */
function isV3Element(node: Node, localName: string): node is Element {
  if (node.nodeType !== ELEMENT_NODE) return false;
  const el = node as Element;
  return el.namespaceURI === V3_NS && el.localName === localName;
}
