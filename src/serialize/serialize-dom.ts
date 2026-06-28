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
 * declaration. Serialization is a **fixed point** — parsing the output and
 * re-serializing yields an identical string — which is what makes the
 * round-trip + idempotency conformance invariants hold.
 *
 * @packageDocumentation
 */

import { XMLSerializer, type Document } from "@xmldom/xmldom";

/** The conservative XML declaration prepended when the source carried none. @internal */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Serialize a parsed `@xmldom/xmldom` {@link Document} to spec-clean XML text.
 * Re-emits the document verbatim at the node level (no lossy model
 * reconstruction) and guarantees a leading XML declaration. Pure — never
 * mutates the document, never throws for a well-formed tree.
 *
 * @internal
 */
export function serializeDocument(doc: Document): string {
  const xml = new XMLSerializer().serializeToString(doc);
  return xml.startsWith("<?xml") ? xml : `${XML_DECLARATION}\n${xml}`;
}
