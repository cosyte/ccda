/**
 * Internal DOM-construction helpers for the `@cosyte/ccda` builder. The builder
 * emits through the **same `@xmldom/xmldom` DOM the parser reads** — it assembles
 * a document with `createElementNS`, serializes it with the shared
 * `serializeDocument`, then hands the text to `parseCcda`. Building the DOM (not
 * concatenating strings) means the serializer performs all XML escaping, so
 * arbitrary text (a patient name, a display label) can never break well-formedness
 * or inject markup — the round-trip-through-parse contract holds by construction.
 *
 * @packageDocumentation
 */

import { DOMImplementation, type Document, type Element } from "@xmldom/xmldom";

import { V3_NS, XSI_NS } from "../parser/namespaces.js";

/** The XML Namespaces namespace, used to declare `xmlns:*` prefixes. @internal */
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** Attribute name→value map; `undefined` values are skipped (never emitted). @internal */
export type Attrs = Readonly<Record<string, string | undefined>>;

/**
 * Create an empty CDA `ClinicalDocument` in the HL7 v3 default namespace with
 * `xmlns:xsi` declared on the root (for the `xsi:type` attributes the value
 * datatypes carry). Returns the {@link Document}; its `documentElement` is the
 * root to build onto.
 *
 * @internal
 */
export function newCdaDocument(): { readonly doc: Document; readonly root: Element } {
  const doc = new DOMImplementation().createDocument(V3_NS, "ClinicalDocument", null);
  const root = doc.documentElement;
  if (root === null) {
    // Unreachable: createDocument with a qualified name always yields a root.
    throw new Error("buildCcda: failed to create ClinicalDocument root.");
  }
  root.setAttributeNS(XMLNS_NS, "xmlns:xsi", XSI_NS);
  return { doc, root };
}

/** Set each defined attribute on an element (skipping `undefined`). @internal */
function setAttrs(target: Element, attrs: Attrs | undefined): void {
  if (attrs === undefined) return;
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined) target.setAttribute(name, value);
  }
}

/**
 * Create a v3-namespace element with optional attributes and child elements.
 * Children are appended in argument order.
 *
 * @internal
 */
export function el(
  doc: Document,
  name: string,
  attrs?: Attrs,
  ...children: readonly Element[]
): Element {
  const e = doc.createElementNS(V3_NS, name);
  setAttrs(e, attrs);
  for (const child of children) e.appendChild(child);
  return e;
}

/**
 * Create a v3-namespace element whose sole content is the given text (appended
 * as a text node, so the serializer escapes it). Optional attributes too.
 *
 * @internal
 */
export function textEl(doc: Document, name: string, value: string, attrs?: Attrs): Element {
  const e = el(doc, name, attrs);
  e.appendChild(doc.createTextNode(value));
  return e;
}

/**
 * Create a `<value xsi:type="…">` element and set its `xsi:type` in the XSI
 * namespace (so it serializes as the `xsi:` prefix declared on the root).
 *
 * @internal
 */
export function typedValue(doc: Document, xsiType: string, attrs?: Attrs): Element {
  const e = el(doc, "value", attrs);
  e.setAttributeNS(XSI_NS, "xsi:type", xsiType);
  return e;
}
