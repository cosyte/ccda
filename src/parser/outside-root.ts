/**
 * The refusal `parseXml` adds to the reader `parseCcda` uses: nothing may sit outside the root
 * element but white space, comments and processing instructions (XML 1.0 productions [1], [22]
 * and [27], with white space as production [3] defines it: space, tab, carriage return and line
 * feed only, not NO-BREAK SPACE, NEL or LINE SEPARATOR).
 *
 * It reads the text itself rather than what `@xmldom/xmldom` reports, since xmldom drops some such
 * content with no report, keeps some as a node under the document, and normalizes NEL and LINE
 * SEPARATOR to a line feed before it reads. {@link refuseOutsideRootText} scans the text before
 * the tree is built, and {@link refuseOutsideRootNodes} checks the document's own nodes after.
 * The scan reads each start tag strictly, as XML 1.0 writes one: where it read a quote another way
 * than xmldom, the two would find the root's end in different places. Neither names anything the
 * text said. `parseSecureXml`, and so `parseCcda`, runs neither.
 *
 * The patterns are written inside the functions that use them, not at the top of the module:
 * StrykerJS cannot judge a mutant in a value computed once when the module loads.
 *
 * @packageDocumentation
 */

import { CcdaParseError, FATAL_CODES, FATAL_MESSAGES } from "./errors.js";

/** The fatal every refusal here throws, naming nothing the text said. */
function notWellFormed(): CcdaParseError {
  return new CcdaParseError(
    FATAL_CODES.NOT_WELL_FORMED_XML,
    FATAL_MESSAGES.NOT_WELL_FORMED_XML,
    {},
  );
}

/**
 * Where the white space, comments and processing instructions that start at `from` end: the first
 * index past them. An unclosed comment or instruction is not skipped.
 */
function skipMisc(source: string, from: number): number {
  const space = /[ \t\r\n]*/y;
  let at = from;
  for (;;) {
    space.lastIndex = at;
    space.exec(source);
    at = space.lastIndex;
    const [open, close] = source.startsWith("<!--", at) ? ["<!--", "-->"] : ["<?", "?>"];
    if (!source.startsWith(open, at)) return at;
    // Each close is searched for once, from its open on, so the scan is linear in the text.
    const end = source.indexOf(close, at + open.length);
    if (end === -1) return at;
    at = end + close.length;
  }
}

/**
 * An XML `Name` (XML 1.0 Fifth Edition productions [4] and [5]), colons included, as a pattern
 * source with no group.
 */
function namePattern(): string {
  const start =
    ":A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
  return `[${start}][${start}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F\\u2040]*`;
}

/**
 * One attribute as XML 1.0 writes it (productions [41], [25] and [10]), with the white space that
 * must come before it: white space, a name (its one group), `=` with optional white space either
 * side, and a value in double or single quotes holding no `<` and not the quote it is in.
 */
function attributePattern(): string {
  const space = "[ \\t\\r\\n]";
  return `${space}+(${namePattern()})${space}*=${space}*(?:"[^<"]*"|'[^<']*')`;
}

/**
 * A sticky pattern for the text inside the root element up to and through its next markup: any
 * characters but `<`, then a comment, a CDATA section, a processing instruction, an end tag (its
 * name in group 1) or a start tag (its name in group 2, its attributes in group 3, and the name of
 * the last of them in group 4, which nothing reads).
 *
 * A start tag matches only as XML 1.0 production [40] or [44] writes it: its name, then attributes
 * each as {@link attributePattern} reads one, then optional white space and `>` or `/>`. So a quote
 * in a start tag is read only as the opening or the closing of a value, and an unquoted value, an
 * attribute with no value, two attributes with no space between them, or a `<` in a value matches
 * no markup at all. A scan that read a quote any other way would find the end of the tag, and so
 * of the root, where `@xmldom/xmldom` does not.
 */
function markupPattern(): RegExp {
  const name = namePattern();
  const attribute = attributePattern();
  const comment = "!--[^]*?-->";
  const cdata = "!\\[CDATA\\[[^]*?\\]\\]>";
  const instruction = "\\?[^]*?\\?>";
  const endTag = `\\/(${name})[ \\t\\r\\n]*>`;
  const startTag = `(${name})((?:${attribute})*)[ \\t\\r\\n]*\\/?>`;
  return new RegExp(`[^<]*<(?:${comment}|${cdata}|${instruction}|${endTag}|${startTag})`, "uy");
}

/**
 * Throw `NOT_WELL_FORMED_XML` when one name is given to two attributes of a start tag (XML 1.0
 * well-formedness constraint Unique Att Spec). `attributes` is group 3 of {@link markupPattern}, so
 * each attribute in it is one match of `attribute`, the global {@link attributePattern}, its name
 * in group 1. Names are compared whole, prefix included; two prefixes bound to one namespace are
 * left to the tree's builder.
 */
function refuseDuplicateAttribute(attributes: string, attribute: RegExp): void {
  const seen = new Set<string>();
  for (const [, name] of attributes.matchAll(attribute)) {
    if (seen.has(name as string)) throw notWellFormed();
    seen.add(name as string);
  }
}

/**
 * Throw `NOT_WELL_FORMED_XML` unless `source` is white space, comments and processing
 * instructions, then one element, then white space, comments and processing instructions again.
 * The element is found by its tags: every start tag is matched by an end tag of the same name, and
 * text, comments, CDATA sections and instructions inside it are passed over whole, so markup
 * characters in them, or in an attribute value, do not end it early. Each start tag must be well
 * formed as XML 1.0 writes one (see `markupPattern`), with no attribute named twice, so the
 * scan reads every quote where `@xmldom/xmldom` does. It checks no more of the element than that;
 * the tree is built after, and refuses the rest of what is not well-formed.
 *
 * @internal
 */
export function refuseOutsideRootText(source: string): void {
  if (skipMisc(source, rootSpan(source).end) !== source.length) throw notWellFormed();
}

/**
 * Where the root element sits in `source`, as the scan of {@link refuseOutsideRootText} reads it:
 * `start` is the index of its `<`, `end` the index just past its last `>`. Throws
 * `NOT_WELL_FORMED_XML` when the text does not start with white space, comments and processing
 * instructions, then a root the scan can read to its end.
 *
 * @internal
 */
export function rootSpan(source: string): { readonly start: number; readonly end: number } {
  const markup = markupPattern();
  const attribute = new RegExp(attributePattern(), "gu");
  const start = skipMisc(source, 0);
  markup.lastIndex = start;
  let match = markup.exec(source);
  // The first markup must be the root's start tag, with nothing before it.
  if (match?.[2] === undefined || !match[0].startsWith("<")) throw notWellFormed();
  const open: string[] = [];
  do {
    const [whole, endName, startName, attributes] = match;
    if (startName !== undefined) {
      refuseDuplicateAttribute(attributes as string, attribute);
      if (!whole.endsWith("/>")) open.push(startName);
    } else if (endName !== undefined && open.pop() !== endName) {
      throw notWellFormed();
    }
    if (open.length === 0) return { start, end: markup.lastIndex };
    match = markup.exec(source);
  } while (match !== null);
  throw notWellFormed();
}

/** A node directly under a document, as {@link refuseOutsideRootNodes} reads it. @internal */
export interface TopLevelNode {
  readonly nodeType: number;
  readonly data: string;
}

/**
 * Throw `NOT_WELL_FORMED_XML` unless the nodes directly under a document are exactly one element,
 * with only comments, processing instructions and text that is XML white space beside it. Text
 * other than that, a CDATA section, a second element, or none, is refused.
 *
 * @internal
 */
export function refuseOutsideRootNodes(doc: { readonly childNodes: ArrayLike<unknown> }): void {
  let elements = 0;
  // Every node xmldom builds has a nodeType, and a text node its data.
  for (const node of Array.from(doc.childNodes) as TopLevelNode[]) {
    if (node.nodeType === 1) elements += 1;
    else if (!isMisc(node)) throw notWellFormed();
  }
  if (elements !== 1) throw notWellFormed();
}

/**
 * Whether a node may sit beside the root element: a comment (8), a processing instruction (7), or
 * a text node (3) of XML white space alone.
 */
function isMisc(node: TopLevelNode): boolean {
  return (
    node.nodeType === 8 ||
    node.nodeType === 7 ||
    (node.nodeType === 3 && /^[ \t\r\n]*$/u.test(node.data))
  );
}
