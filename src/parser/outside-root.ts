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
 * than xmldom, the two would find the root's end in different places. The scan also refuses an
 * `&` that starts no reference, in text or a value, and `]]>` in text, which xmldom reads as text
 * with no report, and counts each element's attributes and child nodes ({@link ScannedTree}) for
 * the check of the built tree (`./built-tree.ts`). Neither names anything the text said.
 * `parseSecureXml`, and so `parseCcda`, runs neither.
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
 * well-formedness constraint Unique Att Spec), and return the attributes' names. `attributes` is
 * group 3 of {@link markupPattern}, so each attribute in it is one match of `attribute`, the global
 * {@link attributePattern}, its name in group 1. Names are compared whole, prefix included here;
 * two prefixes bound to one namespace are told apart after the tree is built, from the names this
 * returns ({@link ScannedTree.sharedLocalNames}).
 */
function refuseDuplicateAttribute(attributes: string, attribute: RegExp): string[] {
  const seen = new Set<string>();
  for (const [, name] of attributes.matchAll(attribute)) {
    if (seen.has(name as string)) throw notWellFormed();
    seen.add(name as string);
  }
  return [...seen];
}

/**
 * The names among `names` (one start tag's attribute names) that two prefixes bound to one
 * namespace could make one attribute twice (Namespaces in XML 1.0, constraint Attributes Unique):
 * every prefixed name but an `xml:` or `xmlns:` one, when two of them share a local name; else
 * `undefined`. An `xmlns:` name is a declaration, and `xml` is the only prefix the xml namespace
 * may have (the tree check refuses another), so neither can name an attribute twice.
 */
function sharedLocalNames(names: readonly string[]): readonly string[] | undefined {
  const prefixed = names.filter(
    (name) => name.includes(":") && !name.startsWith("xml:") && !name.startsWith("xmlns:"),
  );
  const locals = new Set(prefixed.map((name) => name.slice(name.indexOf(":") + 1)));
  return locals.size < prefixed.length ? prefixed : undefined;
}

/**
 * Throw `NOT_WELL_FORMED_XML` when `content` (character data, or the attributes of a start tag)
 * holds an `&` that starts no reference (XML 1.0 productions [10], [14], [66] and [68]), or, when
 * `text`, the sequence `]]>` (production [14]). `@xmldom/xmldom` reads each of these as plain
 * text and reports nothing. `reference` is the pattern {@link bareAmpersandPattern} returns.
 */
function refuseBareMarkup(content: string, reference: RegExp, text: boolean): void {
  if (reference.test(content) || (text && content.includes("]]>"))) throw notWellFormed();
}

/**
 * A pattern for an `&` that does not start a reference: an entity reference (`&` a name `;`), a
 * decimal character reference (`&#` digits `;`) or a hexadecimal one (`&#x` hex digits `;`).
 */
function bareAmpersandPattern(): RegExp {
  return new RegExp(`&(?!(?:${namePattern()}|#[0-9]+|#x[0-9a-fA-F]+);)`, "u");
}

/**
 * What the scan read inside the root element, element by element in document order (the order of
 * their start tags), for the check after the tree is built (`./built-tree.ts`): the number of
 * attributes each start tag holds, the number of child nodes a DOM builds under each element, and
 * the prefixed attribute names of each element where two prefixes give one local name (see
 * `sharedLocalNames`).
 *
 * A child node is an element, a comment, a processing instruction, a CDATA section that is not
 * empty, or a run of text: text broken only by empty CDATA sections is one node, as a DOM
 * normalizes it, and an empty CDATA section is none.
 *
 * @internal
 */
export interface ScannedTree {
  readonly attributes: readonly number[];
  readonly children: readonly number[];
  readonly sharedLocalNames: ReadonlyMap<number, readonly string[]>;
}

/**
 * Throw `NOT_WELL_FORMED_XML` unless `source` is white space, comments and processing
 * instructions, then one element, then white space, comments and processing instructions again.
 * The element is found by its tags: every start tag is matched by an end tag of the same name, and
 * text, comments, CDATA sections and instructions inside it are passed over whole, so markup
 * characters in them, or in an attribute value, do not end it early. Each start tag must be well
 * formed as XML 1.0 writes one (see `markupPattern`), with no attribute named twice, so the
 * scan reads every quote where `@xmldom/xmldom` does, and no `&` may start no reference nor `]]>`
 * sit in text. It checks no more of the element than that; the tree is built after, and refuses the
 * rest of what is not well-formed. Returns what the scan counted inside the root.
 *
 * @internal
 */
export function refuseOutsideRootText(source: string): ScannedTree {
  const scan = scanRoot(source);
  if (skipMisc(source, scan.end) !== source.length) throw notWellFormed();
  return scan.tree;
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
  const { start, end } = scanRoot(source);
  return { start, end };
}

/** Count one more child node under the element at `index`, which the scan has counted already. */
function addChild(children: number[], index: number): void {
  children[index] = (children[index] as number) + 1;
}

/**
 * {@link rootSpan}, with what the scan read inside the root ({@link ScannedTree}). Each run of
 * text and each start tag's attributes are checked for an `&` that starts no reference, and each
 * run of text for `]]>`.
 */
function scanRoot(source: string): {
  readonly start: number;
  readonly end: number;
  readonly tree: ScannedTree;
} {
  const markup = markupPattern();
  const attribute = new RegExp(attributePattern(), "gu");
  const reference = bareAmpersandPattern();
  const start = skipMisc(source, 0);
  markup.lastIndex = start;
  let match = markup.exec(source);
  // The first markup must be the root's start tag, with nothing before it.
  if (match?.[2] === undefined || !match[0].startsWith("<")) throw notWellFormed();
  const attributeCounts: number[] = [];
  const children: number[] = [];
  const shared = new Map<number, readonly string[]>();
  // The index of each open element in the two arrays, innermost last.
  const open: { readonly name: string; readonly index: number }[] = [];
  /** Read a start tag: refuse what it must not hold, count it, and open it unless it closes. */
  const startTag = (whole: string, name: string, attributes: string): void => {
    const names = refuseDuplicateAttribute(attributes, attribute);
    refuseBareMarkup(attributes, reference, false);
    const index = attributeCounts.push(names.length) - 1;
    children.push(0);
    const sharing = sharedLocalNames(names);
    if (sharing !== undefined) shared.set(index, sharing);
    if (!whole.endsWith("/>")) open.push({ name, index });
  };
  startTag(match[0], match[2], match[3] as string);
  // Whether the last child counted under the innermost open element is a run of text.
  let afterText = false;
  while (open.length > 0) {
    match = markup.exec(source);
    if (match === null) throw notWellFormed();
    const [whole, endName, startName, attributes] = match;
    const at = whole.indexOf("<");
    // The loop runs only while an element is open.
    const parent = (open.at(-1) as { readonly index: number }).index;
    if (at > 0) {
      refuseBareMarkup(whole.slice(0, at), reference, true);
      if (!afterText) addChild(children, parent);
      afterText = true;
    }
    if (startName !== undefined) {
      addChild(children, parent);
      startTag(whole, startName, attributes as string);
      afterText = false;
    } else if (endName !== undefined) {
      if ((open.pop() as { readonly name: string }).name !== endName) throw notWellFormed();
      afterText = false;
    } else if (whole.slice(at) !== "<![CDATA[]]>") {
      // A comment, an instruction, or a CDATA section that is not empty; an empty one is no node.
      addChild(children, parent);
      afterText = false;
    }
  }
  return {
    start,
    end: markup.lastIndex,
    tree: { attributes: attributeCounts, children, sharedLocalNames: shared },
  };
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
