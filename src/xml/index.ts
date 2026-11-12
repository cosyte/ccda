/**
 * The hardened XML reader `parseCcda` stands on, and a writer for it, for any XML, not only C-CDA:
 * `parseXml` reads a text into an `@xmldom/xmldom` document with every refusal and limit of
 * `parseCcda`'s substrate, and `serializeXml` writes a document or an element back out with a
 * writer of its own (`./write.ts`), then reads its output back and compares the trees
 * (`./same-tree.ts`), so it returns only text `parseXml` reads back to the same tree.
 *
 * `parseXml` is `parseSecureXml` without the C-CDA part: it does not report an element outside the
 * HL7 v3 namespaces (`UNKNOWN_NAMESPACE_PREFIX`), since in another XML format that is no deviation,
 * and it takes its limits as options rather than a resolved record. Every refusal is the same one,
 * the same `CcdaParseError` with the same `FatalCode`, from the same code, with one more: anything
 * before or after the root element but white space, comments and processing instructions, and any
 * start tag XML 1.0 makes not well-formed, which `@xmldom/xmldom` drops, keeps or reads past and
 * `parseSecureXml` tolerates, is refused as `NOT_WELL_FORMED_XML` (`readSecureXml`,
 * `../parser/outside-root.ts`).
 *
 * @packageDocumentation
 */

import type { Document, Element } from "@xmldom/xmldom";

import { readSecureXml, resolveLimits } from "../parser/secure-xml.js";
import type { CcdaParseLimits, OnWarningCallback } from "../parser/types.js";

import { readBackDifference } from "./same-tree.js";
import { Refusal, writeXml, type XmlNode } from "./write.js";

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
 * - is not well-formed, holds no root element, holds anything before or after the root element
 *   but white space (space, tab, carriage return, line feed), comments and processing
 *   instructions (text, a reference, a stray `<`, a CDATA section, a second element), holds a
 *   start tag XML 1.0 makes not well-formed (an unquoted value, an attribute with no value, a
 *   quote that does not open or close a value, two attributes with no white space between them,
 *   one attribute named twice, a `<` in a value), or holds a character XML 1.0 forbids, written
 *   raw or as a character reference: `NOT_WELL_FORMED_XML`. Anything else `@xmldom/xmldom`
 *   reports while it reads, even as a warning, is refused the same way, but for U+FFFD and an
 *   undeclared entity reference, below.
 *
 * No message or position names anything the text said. A leading byte order mark is removed and
 * reported as `ENCODING_BOM_STRIPPED` through `options.onWarning`. Unlike `parseCcda`, it does not
 * check the root element or report namespaces: any well-formed XML is read. An entity reference
 * with no declaration (`&name;`) is read as `parseCcda` reads it: never expanded, and counted
 * toward `limits.maxEntityExpansions`. U+FFFD REPLACEMENT CHARACTER, which XML allows, is read.
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
  return readSecureXml(text, resolveLimits(options.limits), emit, ignoreWarning, true);
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

/**
 * Write an `@xmldom/xmldom` document or element as XML text that {@link parseXml} reads back to the
 * same tree. A document is written with an XML declaration (`<?xml version="1.0"
 * encoding="UTF-8"?>`) and a line feed first when it carries none; an element is written alone,
 * with a declaration for each namespace its names need.
 *
 * It holds that promise by construction. It writes the tree with a writer of its own, which copies
 * every attribute value, namespace and text through one escaping path and declares every namespace
 * itself. Then, before it returns, it reads its own text back with the reader `parseXml` uses (its
 * limits lifted) and compares that tree with the input: element and attribute names, namespaces,
 * attribute values in order, the namespace declarations the input carries, text, CDATA sections,
 * comments and processing instructions, in order. A refusal or any difference throws a
 * `TypeError` naming the kind of node, never its content. Adjacent text nodes compare as one text
 * and an empty text node or CDATA section as none, as a parse reads them; outside the root element,
 * white space is not compared (the XML Infoset holds no text there), nor is the declaration
 * the writer adds.
 *
 * The read-back costs a parse of the output and a walk of both trees on every call, which is most
 * of what `serializeXml` costs: bench/ccda.bench.mjs measures it beside `parseXml` and beside
 * xmldom's own `XMLSerializer`, which checks nothing.
 *
 * It refuses, with a `TypeError`, a tree it cannot write as text that reads back the same:
 *
 * - a character XML 1.0 forbids anywhere: in text, an attribute value, a comment, a CDATA section,
 *   a processing instruction or a namespace (the message names the code point, never the text);
 * - a DOCTYPE, which `parseXml` refuses, and `<!DOCTYPE` or `<!ENTITY` (in any case) in a comment,
 *   a CDATA section or a processing instruction, which `parseXml` refuses wherever it sits;
 * - a carriage return, NEL, LINE SEPARATOR or PARAGRAPH SEPARATOR in a comment, a CDATA section or
 *   a processing instruction, which a parse reads as a line feed and which cannot be written as a
 *   reference there;
 * - a processing instruction whose data starts with a space, tab or line feed, which a parse
 *   drops;
 * - text other than white space, or a CDATA section, directly under the document, which
 *   `parseXml` refuses;
 * - an XML declaration (an instruction with the target `xml` first in the document) whose data is
 *   not a version, then an optional encoding and an optional standalone, in that order;
 * - a prefixed element or attribute name with no namespace, which no declaration binds (an
 *   `xmlns:` or `xml:` attribute is written as it is);
 * - one prefix bound to two namespaces on one element (by the element's name, its attributes'
 *   names or a declaration it carries), or declared twice on it;
 * - an element with the prefix `xmlns`, an attribute in a namespace with no prefix, and a
 *   declaration Namespaces in XML 1.0 forbids (the prefix `xmlns`, the xml or xmlns namespace
 *   under another prefix, or a prefix bound to no namespace);
 * - a name that is not an XML name, a comment holding `--` or ending in `-`, a CDATA section
 *   holding `]]>`, a processing instruction holding `?>` or with the target `xml` anywhere but
 *   first, or a document with no root element;
 * - anything else whose text the read-back refuses or reads as another tree.
 *
 * No message names anything the tree holds. In text, a carriage return is written as `&#13;`,
 * NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR as `&#x85;`, `&#x2028;` and `&#x2029;`, and `<`, `>`
 * and `&` as references; in an attribute value or a namespace, `<`, `>`, `&`, `"`, tab, line feed,
 * carriage return and those three are written as references. So a parse keeps each of them.
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
  const tree = node as unknown as XmlNode;
  let xml: string;
  try {
    xml = writeXml(tree);
  } catch (err) {
    // Every refusal is a Refusal, whose message is fixed text; a DOM accessor that throws (a node
    // xmldom did not build) is reported the same way, with nothing of the tree in it.
    const why = err instanceof Refusal ? err.message : "could not be read as a DOM tree";
    // eslint-disable-next-line preserve-caught-error -- a cause could carry the tree's names
    throw new TypeError(`serializeXml: the tree ${why}, so it was not written.`);
  }
  const why = readBackDifference(xml, tree);
  if (why !== undefined)
    throw new TypeError(`serializeXml: the tree ${why}, so it was not written.`);
  return xml;
}
