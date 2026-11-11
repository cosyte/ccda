/**
 * Spec-clean DOM serializer for `@cosyte/ccda` (Postel's-Law *emit* side).
 *
 * C-CDA's "no silent loss" rule is met by serializing the **parsed DOM itself**
 * rather than reconstructing XML from the lossy read-model: every element,
 * attribute, namespace declaration (`xmlns` / `xmlns:xsi` / `xmlns:sdtc`),
 * `templateId`, and even content the read-model never modeled survives the
 * round-trip byte-for-byte at the node level. `parseSecureXml` already rejected
 * the unsafe constructs (DTD/DOCTYPE, external entities), so the retained tree
 * is safe to re-emit.
 *
 * The output is conservative: a well-formed XML document with a UTF-8
 * declaration. A carriage return in text is written as `&#13;`, so a parse keeps
 * it. Serialization is a **fixed point**, parsing the output and
 * re-serializing yields an identical string, which is what makes the
 * round-trip + idempotency conformance invariants hold.
 *
 * @packageDocumentation
 */

import type { Document, Node } from "@xmldom/xmldom";

import { xmldom } from "../parser/xmldom.js";

/** The conservative XML declaration prepended when the source carried none. @internal */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/** Text node type per the DOM spec (`Node.TEXT_NODE`). @internal */
const TEXT_NODE = 3 as const;

/**
 * Write a text node that holds a carriage return with that character as `&#13;`, and leave every
 * other node to the serializer.
 *
 * A parser turns a carriage return written raw into a line feed (XML's end-of-line handling),
 * so the only way one reaches a text node is a `&#13;` reference in the source, or a builder or
 * editor input holding one. `@xmldom/xmldom` escapes `<`, `>` and `&` in text but writes the
 * carriage return raw, so a parsed `&#13;` came back as a line feed on the next parse: a round
 * trip that changed the narrative, and a built narrative that no longer matched its own
 * `displayName` (`CODE_NARRATIVE_MISMATCH` on a clean build). Attribute values need nothing
 * here: the serializer already writes a carriage return in one as a reference. Text with no
 * carriage return is written exactly as before.
 *
 * @internal
 */
function keepCarriageReturns(node: Node): Node | string {
  if (node.nodeType !== TEXT_NODE) return node;
  const data = (node as Node & { readonly data: string }).data;
  if (!data.includes("\r")) return node;
  return data
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\r/gu, "&#13;");
}

/**
 * Serialize a parsed `@xmldom/xmldom` {@link Document} to spec-clean XML text.
 * Re-emits the document verbatim at the node level (no lossy model
 * reconstruction) and guarantees a leading XML declaration. Pure, never
 * mutates the document, never throws for a well-formed tree.
 *
 * @internal
 */
export function serializeDocument(doc: Document): string {
  // xmldom writes a string a node filter returns in the node's place, but its types allow only a
  // node back, so the filter is passed under the type they name.
  const filter = keepCarriageReturns as unknown as (node: Node) => Node;
  const xml = new (xmldom().XMLSerializer)().serializeToString(doc, filter);
  return xml.startsWith("<?xml") ? xml : `${XML_DECLARATION}\n${xml}`;
}
