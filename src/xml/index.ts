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
import { codePointLabel, firstForbiddenIndex } from "../parser/xml-chars.js";
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
 * A limit of `NaN` is refused with a `TypeError` before the text is read, since it would turn its
 * cap off; `Infinity` lifts a cap, as it does for `parseCcda`.
 *
 * @param text - The XML text.
 * @param options - Limits and a warning callback; see {@link ParseXmlOptions}.
 * @returns The document, with line and column positions on its elements.
 * @throws {@link CcdaParseError} For each refusal above.
 * @throws {TypeError} When a limit in `options.limits` is `NaN`.
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
  refuseNaNLimit(options.limits);
  const emit = options.onWarning ?? ignoreWarning;
  return parseSecureXml(text, resolveLimits(options.limits), emit, ignoreWarning);
}

/**
 * Throw a `TypeError` when a cap is `NaN`: every comparison with `NaN` is false, so the reader
 * would pass every text over that cap, the cap silently off. `Infinity` lifts a cap on purpose and
 * is taken, as `parseCcda` takes it.
 *
 * The constants and patterns in this module's checks are written inside the functions that use
 * them, not at the top of the module: StrykerJS cannot judge a mutant in a value computed once when
 * the module loads, and reports it as surviving. @internal
 */
function refuseNaNLimit(limits: CcdaParseLimits | undefined): void {
  const fields = ["maxInputBytes", "maxDepth", "maxNodeCount", "maxEntityExpansions"] as const;
  for (const field of fields) {
    if (Number.isNaN(limits?.[field])) {
      throw new TypeError(
        `parseXml: options.limits.${field} is NaN, which would turn its cap off; give a number, or leave it out for the default.`,
      );
    }
  }
}

/** Drop a warning: the namespace sweep's reporter, and the default `onWarning`. @internal */
function ignoreWarning(): void {
  // Nothing to do: a reader of another XML format has no namespace to expect.
}

/** `Node.ATTRIBUTE_NODE`. @internal */
const ATTRIBUTE_NODE = 2 as const;

/** `Node.TEXT_NODE`. @internal */
const TEXT_NODE = 3 as const;

/** `Node.CDATA_SECTION_NODE`. @internal */
const CDATA_SECTION_NODE = 4 as const;

/** `Node.PROCESSING_INSTRUCTION_NODE`. @internal */
const PROCESSING_INSTRUCTION_NODE = 7 as const;

/** `Node.COMMENT_NODE`. @internal */
const COMMENT_NODE = 8 as const;

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
 * Throw a {@link Refusal} naming the code point when `value` holds a character XML 1.0 forbids.
 * It reads `value` with a string method, so it takes a string only. @internal
 */
function refuseForbidden(value: string): void {
  const at = firstForbiddenIndex(value);
  if (at === -1) return;
  throw new Refusal(
    `holds ${codePointLabel(value.charCodeAt(at))}, a character XML 1.0 does not allow in a document`,
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
 * serializer writes it. It refuses a DOCTYPE; a character XML 1.0 forbids wherever one would be
 * written: a namespace (which the serializer may declare), an attribute value, and the data of a
 * text, CDATA, comment or processing instruction node; and a prefixed name with no namespace. It
 * writes the XML declaration a parse keeps as the document's first node ({@link writeDeclaration}),
 * a text node ({@link writeText}) and an attribute ({@link writeAttribute})
 * itself, and checks a comment, CDATA section or instruction ({@link refuseMarkup}). Every other
 * node is left to the serializer.
 *
 * @internal
 */
function writeFilter(node: FilteredNode): Node | string {
  const type = node.nodeType;
  if (type === DOCUMENT_TYPE_NODE) throw new Refusal("holds a DOCTYPE, which parseXml refuses");
  const uri = node.namespaceURI;
  if (uri !== null) refuseForbidden(uri);
  const text = type === ATTRIBUTE_NODE ? node.value : node.data;
  if (text !== undefined) refuseForbidden(text);
  refuseUnboundPrefix(node);
  if (type === TEXT_NODE) return writeText(node.data as string);
  if (type === ATTRIBUTE_NODE) return writeAttribute(node);
  if (isLeadingDeclaration(node)) return writeDeclaration(node.data as string);
  if (
    type === COMMENT_NODE ||
    type === CDATA_SECTION_NODE ||
    type === PROCESSING_INSTRUCTION_NODE
  ) {
    refuseMarkup(node.data as string);
  }
  return node;
}

/**
 * Throw a {@link Refusal} when an element or attribute name carries a prefix and the node has no
 * namespace: the serializer writes no declaration for it, and a parse refuses an unbound prefix. A
 * namespace declaration (`xmlns:p`) and an `xml:` attribute set without a namespace are read back
 * as they are, since `xmlns` and `xml` are bound in every document. Every node passes through it:
 * the other names (`#text`, `#comment`, `#document`) hold no colon, and a processing instruction
 * target may not hold one (Namespaces in XML 1.0, section 7). @internal
 */
function refuseUnboundPrefix(node: FilteredNode): void {
  const name = node.nodeName;
  if (node.namespaceURI !== null || !name.includes(":")) return;
  if (node.nodeType === ATTRIBUTE_NODE && /^xml(?:ns)?:/u.test(name)) return;
  throw new Refusal("holds a prefixed name with no namespace, which no declaration binds");
}

/**
 * Throw a {@link Refusal} when the data of a comment, CDATA section or processing instruction holds
 * a DTD or entity marker in any case, which `parseXml`'s gate refuses wherever it sits, or a
 * character XML's end-of-line handling reads as a line feed (carriage return, NEL, LINE SEPARATOR,
 * PARAGRAPH SEPARATOR), which cannot be written as a reference there. @internal
 */
function refuseMarkup(data: string): void {
  if (/<!DOCTYPE|<!ENTITY/iu.test(data)) {
    throw new Refusal(
      "holds '<!DOCTYPE' or '<!ENTITY' in a comment, CDATA section or processing instruction, which parseXml refuses",
    );
  }
  const at = data.search(/[\r\u0085\u2028\u2029]/u);
  if (at === -1) return;
  throw new Refusal(
    `holds ${codePointLabel(data.charCodeAt(at))} in a comment, CDATA section or processing instruction, where a parse reads it as a line feed`,
  );
}

/**
 * Whether a node is the XML declaration a parse keeps: a processing instruction (the one node with
 * a `target`) with the target `xml`, as the document's first node. Anywhere else the serializer's
 * well-formedness check refuses the target `xml`. @internal
 */
function isLeadingDeclaration(node: FilteredNode): boolean {
  return (
    node.target === "xml" && node.previousSibling === null && node.parentNode === node.ownerDocument
  );
}

/**
 * The XML declaration, written as it was when its data is an XML declaration's, and refused
 * otherwise. The data, after `<?xml ` and before `?>`, follows XML 1.0 productions [23] to [26],
 * [32], [80] and [81]: a version `1.` and digits, then an optional encoding name, then an optional
 * `standalone` of `yes` or `no`, in that order, each quoted with matching quotes, then optional
 * space. The space is a space, tab or line feed: a carriage return would be read back as a line
 * feed. @internal
 */
function writeDeclaration(data: string): string {
  const declaration =
    /^version[ \t\n]*=[ \t\n]*(?:"1\.[0-9]+"|'1\.[0-9]+')(?:[ \t\n]+encoding[ \t\n]*=[ \t\n]*(?:"[A-Za-z][\w.-]*"|'[A-Za-z][\w.-]*'))?(?:[ \t\n]+standalone[ \t\n]*=[ \t\n]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\n]*$/u;
  if (!declaration.test(data)) {
    throw new Refusal(
      "holds an XML declaration that is not one (a version, then an optional encoding and standalone)",
    );
  }
  return `<?xml ${data}?>`;
}

/**
 * NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR in `text` written as hexadecimal character
 * references: the serializer writes them raw, and a parse reads each as a line feed. @internal
 */
function referenceLineBreaks(text: string): string {
  return text.replace(/[\u0085\u2028\u2029]/gu, (char) => `&#x${char.charCodeAt(0).toString(16)};`);
}

/**
 * A text node's data as XML text: `<`, `>` and `&` escaped as the serializer escapes them, a
 * carriage return as `&#13;`, and NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR as references,
 * which the serializer writes raw and a parse would read as a line feed.
 *
 * @internal
 */
function writeText(data: string): string {
  return referenceLineBreaks(
    data
      .replace(/&/gu, "&amp;")
      .replace(/</gu, "&lt;")
      .replace(/>/gu, "&gt;")
      .replace(/\r/gu, "&#13;"),
  );
}

/**
 * An attribute, ` name="value"`: the serializer writes it alone, exactly as it writes it in place
 * (its name checked as it checks every name, and `<`, `>`, `&`, `"`, tab, line feed and carriage
 * return in the value written as references), and NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR,
 * which it writes raw, are then written as references. None of the three can be part of an XML
 * name, so only the value changes. @internal
 */
function writeAttribute(node: FilteredNode): string {
  return referenceLineBreaks(
    new (xmldom().XMLSerializer)().serializeToString(node, { requireWellFormed: true }),
  );
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
 * - a DOCTYPE, which `parseXml` refuses, and `<!DOCTYPE` or `<!ENTITY` (in any case) in a comment,
 *   a CDATA section or a processing instruction, which `parseXml` refuses wherever it sits;
 * - a carriage return, NEL, LINE SEPARATOR or PARAGRAPH SEPARATOR in a comment, a CDATA section or
 *   a processing instruction, which a parse reads as a line feed and which cannot be written as a
 *   reference there;
 * - an XML declaration (an instruction with the target `xml` first in the document) whose data is
 *   not a version, then an optional encoding and an optional standalone, in that order;
 * - a prefixed element or attribute name with no namespace, which no declaration binds (an
 *   `xmlns:` or `xml:` attribute is written as it is);
 * - a name that is not an XML name, a comment holding `--` or ending in `-`, a CDATA section
 *   holding `]]>`, a processing instruction holding `?>`, or a document with no root element.
 *
 * No message names anything the tree holds. In text, a carriage return is written as `&#13;`,
 * NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR as `&#x85;`, `&#x2028;` and `&#x2029;`, and `<`, `>`
 * and `&` as references; in an attribute value, `<`, `>`, `&`, `"`, tab, line feed, carriage
 * return and those three are written as references. So a parse keeps each of them.
 *
 * The writer does not apply the reader's limits: a tree deeper or larger than a reader's limits,
 * or a comment, CDATA section or processing instruction holding more `&name;` strings than its
 * `maxEntityExpansions` (the reader counts them wherever they sit), is written, and that reader
 * refuses it.
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
