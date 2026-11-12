/**
 * The hardened XML reader and writer `parseCcda` and `serializeCcda` stand on, for any XML, not only
 * C-CDA: `parseXml` reads a text into an `@xmldom/xmldom` document with every refusal and limit of
 * `parseCcda`'s substrate, and `serializeXml` writes a document or an element back out, refusing
 * anything `parseXml` would refuse to read.
 *
 * `parseXml` is `parseSecureXml` without the C-CDA part: it does not report an element outside the
 * HL7 v3 namespaces (`UNKNOWN_NAMESPACE_PREFIX`), since in another XML format that is no deviation,
 * and it takes its limits as options rather than a resolved record. Every refusal is the same one,
 * the same `CcdaParseError` with the same `FatalCode`, from the same code.
 *
 * @packageDocumentation
 */

import type { Document, Element, Node } from "@xmldom/xmldom";

import { parseSecureXml, resolveLimits } from "../parser/secure-xml.js";
import type { CcdaParseLimits, OnWarningCallback } from "../parser/types.js";
import { codePointLabel, firstForbiddenCodePoint } from "../parser/xml-chars.js";
import { xmldom } from "../parser/xmldom.js";
import { XML_DECLARATION } from "../serialize/serialize-dom.js";

/**
 * Options for {@link parseXml}. Every field is optional; `parseXml(text)` applies the library's
 * default limits ({@link DEFAULT_LIMITS}).
 *
 * @example
 * ```ts
 * import { parseXml, type ParseXmlOptions } from "@cosyte/ccda";
 * const options: ParseXmlOptions = { limits: { maxInputBytes: 1_000_000, maxDepth: 64 } };
 * const doc = parseXml("<pathway/>", options);
 * console.log(doc.documentElement?.localName); // "pathway"
 * ```
 */
export interface ParseXmlOptions {
  /**
   * Override one or more of the safety caps: input size, element depth, element count and custom
   * entity references. An omitted cap keeps its default ({@link DEFAULT_LIMITS}).
   */
  readonly limits?: CcdaParseLimits;
  /**
   * Called for each warning the reader raises. The only one it raises is `ENCODING_BOM_STRIPPED`,
   * when the text starts with a byte order mark, which is removed before the text is read.
   */
  readonly onWarning?: OnWarningCallback;
}

/**
 * Read an XML text into an `@xmldom/xmldom` {@link Document}, refusing what makes XML unsafe to
 * read. This is the reader `parseCcda` uses, for any XML format.
 *
 * It throws a {@link CcdaParseError}, and never returns a partly read document, when the text:
 *
 * - declares a DTD or an entity anywhere (`<!DOCTYPE`, `<!ENTITY`, in any case):
 *   `XXE_OR_DTD_PRESENT`. No external entity is ever fetched, and no entity is ever expanded;
 * - holds more custom entity references (`&name;` other than the five XML predefines) than
 *   `limits.maxEntityExpansions`: `ENTITY_EXPANSION_LIMIT`;
 * - is larger than `limits.maxInputBytes` in UTF-8: `INPUT_SIZE_LIMIT_EXCEEDED`;
 * - nests elements deeper than `limits.maxDepth`: `ELEMENT_DEPTH_LIMIT_EXCEEDED`;
 * - holds more elements than `limits.maxNodeCount`: `NODE_COUNT_LIMIT_EXCEEDED`;
 * - is not well-formed, holds no root element, or holds a character XML 1.0 forbids, written raw
 *   or as a character reference: `NOT_WELL_FORMED_XML`.
 *
 * No message or position names anything the text said. A leading byte order mark is removed and
 * reported as `ENCODING_BOM_STRIPPED` through `options.onWarning`. Unlike `parseCcda`, it does not
 * check the root element or report namespaces: any well-formed XML is read.
 *
 * @param text - The XML text.
 * @param options - Limits and a warning callback; see {@link ParseXmlOptions}.
 * @returns The document, with line and column positions on its elements.
 * @throws {@link CcdaParseError} For each refusal above.
 * @example
 * ```ts
 * import { parseXml, CcdaParseError, FATAL_CODES } from "@cosyte/ccda";
 * const doc = parseXml('<pathway id="example-1"><step order="1"/></pathway>');
 * console.log(doc.documentElement?.getAttribute("id")); // "example-1"
 * try {
 *   parseXml('<!DOCTYPE p [<!ENTITY x SYSTEM "file:///etc/passwd">]><p>&x;</p>');
 * } catch (err) {
 *   console.log(err instanceof CcdaParseError && err.code === FATAL_CODES.XXE_OR_DTD_PRESENT); // true
 * }
 * ```
 */
export function parseXml(text: string, options: ParseXmlOptions = {}): Document {
  const emit = options.onWarning ?? ignoreWarning;
  return parseSecureXml(text, resolveLimits(options.limits), emit, ignoreWarning);
}

/** Drop a warning: the namespace sweep's reporter, and the default `onWarning`. @internal */
function ignoreWarning(): void {
  // Nothing to do: a reader of another XML format has no namespace to expect.
}

/** `Node.ATTRIBUTE_NODE`. @internal */
const ATTRIBUTE_NODE = 2 as const;

/** `Node.TEXT_NODE`. @internal */
const TEXT_NODE = 3 as const;

/** `Node.PROCESSING_INSTRUCTION_NODE`. @internal */
const PROCESSING_INSTRUCTION_NODE = 7 as const;

/** `Node.DOCUMENT_NODE`. @internal */
const DOCUMENT_NODE = 9 as const;

/** `Node.DOCUMENT_TYPE_NODE`. @internal */
const DOCUMENT_TYPE_NODE = 10 as const;

/**
 * Raised inside the serializer's node filter, so the refusal leaves the walk at once, and turned
 * into the `TypeError` {@link serializeXml} throws. Its message is the reason, written here and
 * never taken from the tree. @internal
 */
class Refusal extends Error {}

/**
 * Throw a {@link Refusal} naming the code point when `value` holds a character XML 1.0 forbids. A
 * `null` (no namespace) holds none. @internal
 */
function refuseForbidden(value: string | null): void {
  // Stryker disable next-line ConditionalExpression: equivalent, a null read as text is "null".
  if (value === null) return;
  const code = firstForbiddenCodePoint(value);
  if (code === undefined) return;
  throw new Refusal(
    `holds ${codePointLabel(code)}, a character XML 1.0 does not allow in a document`,
  );
}

/** The members of a node {@link writeFilter} reads, by its type. @internal */
type FilteredNode = Node & {
  readonly namespaceURI: string | null;
  readonly value?: string;
  readonly data?: string;
  readonly target?: string;
};

/**
 * The node filter {@link serializeXml} writes with, which sees every node and attribute before the
 * serializer writes it. It refuses a DOCTYPE, and a character XML 1.0 forbids wherever one would be
 * written: a namespace (which the serializer may declare), an attribute value, and the data of a
 * text, CDATA, comment or processing instruction node. It writes the XML declaration a parse keeps
 * as the document's first node as it was, and a text node itself ({@link writeText}). Every other
 * node is left to the serializer.
 *
 * @internal
 */
function writeFilter(node: FilteredNode): Node | string {
  const type = node.nodeType;
  if (type === DOCUMENT_TYPE_NODE) throw new Refusal("holds a DOCTYPE, which parseXml refuses");
  refuseForbidden(node.namespaceURI);
  refuseForbidden((type === ATTRIBUTE_NODE ? node.value : node.data) ?? null);
  if (type === PROCESSING_INSTRUCTION_NODE) return writeInstruction(node);
  if (type === TEXT_NODE) return writeText(node.data as string);
  return node;
}

/**
 * A processing instruction: the XML declaration as it was, when it is the document's first node
 * and nothing in it closes it early; any other instruction left to the serializer. Its
 * well-formedness check refuses the target `xml`, and a parse keeps the declaration as an
 * instruction with that target.
 *
 * @internal
 */
function writeInstruction(node: FilteredNode): Node | string {
  const data = node.data as string;
  const declaration =
    node.target === "xml" &&
    node.previousSibling === null &&
    node.parentNode === node.ownerDocument &&
    !data.includes("?>");
  return declaration ? `<?xml ${data}?>` : node;
}

/**
 * A text node's data as XML text: `<`, `>` and `&` escaped as the serializer escapes them, and a
 * carriage return as `&#13;`, which the serializer writes raw and a parse would read as a line
 * feed.
 *
 * @internal
 */
function writeText(data: string): string {
  return data
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\r/gu, "&#13;");
}

/**
 * Write an `@xmldom/xmldom` document or element as XML text that {@link parseXml} reads back to the
 * same tree. A document is written with an XML declaration (`<?xml version="1.0"
 * encoding="UTF-8"?>`) first when it carries none; an element is written alone.
 *
 * It refuses, with a `TypeError`, a tree it cannot write as well-formed XML that `parseXml` accepts,
 * rather than writing text a reader would reject or read differently:
 *
 * - a character XML 1.0 forbids anywhere: in text, an attribute value, a comment, a CDATA section,
 *   a processing instruction or a namespace (the message names the code point, never the text);
 * - a DOCTYPE, which `parseXml` refuses;
 * - a name that is not an XML name, a comment holding `--` or ending in `-`, a CDATA section
 *   holding `]]>`, a processing instruction holding `?>`, or a document with no root element.
 *
 * No message names anything the tree holds. A carriage return in text is written as `&#13;`, so a
 * parse keeps it; `<`, `>` and `&` in text and `<`, `>`, `&`, `"`, tab, line feed and carriage
 * return in an attribute value are written as references.
 *
 * @param node - A document or an element, from {@link parseXml} or built with the DOM API.
 * @returns The XML text.
 * @throws {TypeError} For each refusal above.
 * @example
 * ```ts
 * import { parseXml, serializeXml } from "@cosyte/ccda";
 * const doc = parseXml('<pathway id="example-1"><step order="1"/></pathway>');
 * doc.documentElement?.setAttribute("status", "active");
 * console.log(serializeXml(doc));
 * // <?xml version="1.0" encoding="UTF-8"?>
 * // <pathway id="example-1" status="active"><step order="1"/></pathway>
 * ```
 */
export function serializeXml(node: Document | Element): string {
  let xml: string;
  try {
    xml = new (xmldom().XMLSerializer)().serializeToString(node, {
      requireWellFormed: true,
      // xmldom writes a string a node filter returns in the node's place, but its types allow
      // only a node back, so the filter is passed under the type they name.
      nodeFilter: writeFilter as unknown as (node: Node) => Node,
    });
  } catch (err) {
    // xmldom's own refusals name the offending name, which the tree's author chose: none of it
    // reaches the message, and the error is not kept as a cause, where a caller logging the error
    // would log it too.
    const why =
      err instanceof Refusal
        ? err.message
        : "is not well-formed XML (a name that is not an XML name, a comment holding '--', a CDATA section holding ']]>', a processing instruction holding '?>', or a document with no root element)";
    // eslint-disable-next-line preserve-caught-error -- the cause would carry the tree's names, see above
    throw new TypeError(`serializeXml: the tree ${why}, so it was not written.`);
  }
  if (node.nodeType !== DOCUMENT_NODE || xml.startsWith("<?xml")) return xml;
  return `${XML_DECLARATION}\n${xml}`;
}
