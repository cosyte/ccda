/**
 * Internal DOM-construction helpers for the `@cosyte/ccda` builder. The builder
 * emits through the **same `@xmldom/xmldom` DOM the parser reads**, it assembles
 * a document with `createElementNS`, serializes it with the shared
 * `serializeDocument`, then hands the text to `parseCcda`. Building the DOM (not
 * concatenating strings) means the serializer performs all XML escaping, so
 * arbitrary text (a patient name, a display label) can never break well-formedness
 * or inject markup, the round-trip-through-parse contract holds by construction.
 *
 * Escaping cannot help a character XML 1.0 forbids outright (a C0 control such as U+0001, an
 * unpaired surrogate, U+FFFE or U+FFFF): it has no escaped form, and the serializer writes it raw,
 * so the text would no longer be XML. `buildCcda` refuses such a character in its input before it
 * builds anything, naming the input field. Every text node and attribute value written here is
 * checked again as it is set, so a value that reaches the document by another route (a terminology
 * adapter's translation) is refused too rather than written.
 *
 * @packageDocumentation
 */

import type { Document, Element, Text } from "@xmldom/xmldom";

import { SDTC_NS, V3_NS, XSI_NS } from "../parser/namespaces.js";
import { codePointLabel, firstForbiddenCodePoint } from "../parser/xml-chars.js";
import { xmldom } from "../parser/xmldom.js";

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
  const doc = new (xmldom().DOMImplementation)().createDocument(V3_NS, "ClinicalDocument", null);
  const root = doc.documentElement;
  /* v8 ignore if -- createDocument with a qualified name always yields a root */
  if (root === null) {
    // Unreachable: createDocument with a qualified name always yields a root.
    throw new Error("buildCcda: failed to create ClinicalDocument root.");
  }
  root.setAttributeNS(XMLNS_NS, "xmlns:xsi", XSI_NS);
  return { doc, root };
}

/**
 * Throw when `value` holds a character XML 1.0 forbids. The message names `field` and the code
 * point, never the value: the value is clinical text, and the caller knows what they passed.
 * Refusing rather than replacing is deliberate: dropping or substituting a character would change
 * clinical text without the caller knowing.
 *
 * @internal
 */
export function refuseForbiddenCharacter(value: string, field: string): void {
  const code = firstForbiddenCodePoint(value);
  if (code === undefined) return;
  throw new TypeError(
    `buildCcda: ${field} holds ${codePointLabel(code)}, a character XML 1.0 does not allow in a ` +
      "document. Remove it before building; the builder does not change clinical text for you.",
  );
}

/** Set each defined attribute on an element (skipping `undefined`). @internal */
function setAttrs(target: Element, attrs: Attrs | undefined): void {
  if (attrs === undefined) return;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    refuseForbiddenCharacter(value, `the ${name} attribute of <${target.nodeName}>`);
    target.setAttribute(name, value);
  }
}

/**
 * Create a text node holding `value`, refusing a character XML 1.0 forbids. `parent` names the
 * element it goes in, for the refusal.
 *
 * @internal
 */
export function textNode(doc: Document, parent: string, value: string): Text {
  refuseForbiddenCharacter(value, `the text of <${parent}>`);
  return doc.createTextNode(value);
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
  e.appendChild(textNode(doc, name, value));
  return e;
}

/**
 * Create an element in the HL7 SDO-extension namespace (`urn:hl7-org:sdtc`),
 * serialized with the `sdtc:` prefix (e.g. `<sdtc:deceasedInd>`). The prefix's
 * `xmlns:sdtc` declaration is emitted by the serializer where the element is
 * placed; the parser recognizes the namespace and reads the element by local
 * name. Used for the standards-extension elements CDA permits outside the v3
 * namespace (e.g. the family-member `sdtc:deceasedInd` flag).
 *
 * @internal
 */
export function sdtcEl(doc: Document, localName: string, attrs?: Attrs): Element {
  const e = doc.createElementNS(SDTC_NS, `sdtc:${localName}`);
  setAttrs(e, attrs);
  return e;
}

/**
 * Create a named element carrying an `xsi:type` (set in the XSI namespace, so it
 * serializes as the `xsi:` prefix declared on the root), with optional attributes
 * and child elements. Used for typed `<value>`s and the `IVL_TS`/`PIVL_TS`
 * `<effectiveTime>` siblings.
 *
 * @internal
 */
export function typedEl(
  doc: Document,
  name: string,
  xsiType: string,
  attrs?: Attrs,
  ...children: readonly Element[]
): Element {
  const e = el(doc, name, attrs, ...children);
  e.setAttributeNS(XSI_NS, "xsi:type", xsiType);
  return e;
}

/**
 * Create a `<value xsi:type="…">` element and set its `xsi:type` in the XSI
 * namespace (so it serializes as the `xsi:` prefix declared on the root).
 *
 * @internal
 */
export function typedValue(doc: Document, xsiType: string, attrs?: Attrs): Element {
  return typedEl(doc, "value", xsiType, attrs);
}
