/**
 * Write a document the compact reader (`../parser/xml-tree.ts`) reads, as `serializeDocument`
 * writes the `@xmldom/xmldom` tree of the same text, without building that tree.
 *
 * For a tree read from text, `@xmldom/xmldom`'s serializer has nothing to add: every prefix and
 * default namespace an element or attribute uses is declared by an attribute of that element or an
 * ancestor, so it writes no declaration of its own and no prefix the element did not carry. What
 * is left is the form of each node, transcribed here:
 *
 * - an element as `<name`, each attribute as ` name="value"` in document order with `<`, `>`, `&`,
 *   `"`, tab, line feed and carriage return escaped (`&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#9;`,
 *   `&#10;`, `&#13;`), then `/>` when it has no children, else `>`, the children and `</name>`;
 * - text with `<`, `&` and `>` escaped, and a carriage return as `&#13;` (the node filter
 *   `serializeDocument` passes);
 * - a CDATA section, a comment and a processing instruction as `<![CDATA[data]]>`,
 *   `<!--data-->` and `<?target data?>`.
 *
 * One element is written differently there and is handed back instead: an element in the XHTML
 * namespace with no children, which `@xmldom/xmldom` closes with an end tag unless HTML calls it a
 * void element.
 *
 * **A text already written in these forms is its own XML.** The reader notes, as it reads,
 * whether every tag, attribute, reference and instruction stands in the one form this writer gives
 * it (`TreeDocument.writtenEnd`); when all do, writing the document is returning the text up to
 * its last node, with no tree walked and no string built. What this package writes reads that way,
 * so the re-parse in `buildCcda` and `editCcda`, and most documents passed on, are written so.
 * `test/write-tree.test.ts` compares this writer with `serializeDocument` over the
 * output-equivalence corpus and generated XML, and reads every text it writes back as written.
 *
 * @packageDocumentation
 */

import { normalizeLineEndings } from "../parser/secure-xml.js";
import {
  readDocument,
  type TreeCharacterData,
  type TreeElement,
  type TreeInstruction,
  type TreeNode,
} from "../parser/xml-tree.js";
import { XML_DECLARATION } from "./serialize-dom.js";

/** The XHTML namespace, whose childless elements `@xmldom/xmldom` writes by HTML's rules. @internal */
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** Node types this writer branches on. @internal */
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;

/** A character an attribute value escapes. @internal */
const ATTRIBUTE_ESCAPED_RE = /[<>&"\t\n\r]/g;

/** A character text escapes. @internal */
const TEXT_ESCAPED_RE = /[<>&\r]/g;

/** The escape of each character either escapes. @internal */
const ESCAPES: Readonly<Record<string, string>> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;",
  "\t": "&#9;",
  "\n": "&#10;",
  "\r": "&#13;",
};

/** The escape of one character. @internal */
function escape(c: string): string {
  return ESCAPES[c] as string;
}

/**
 * An attribute value as the writer writes it between its quotes, as `@xmldom/xmldom`'s serializer
 * does. `../edit/light-dom.ts` writes the elements an edit adds with it.
 *
 * @internal
 */
export function attributeText(value: string): string {
  ATTRIBUTE_ESCAPED_RE.lastIndex = 0;
  return ATTRIBUTE_ESCAPED_RE.test(value) ? value.replace(ATTRIBUTE_ESCAPED_RE, escape) : value;
}

/**
 * Text as the writer writes it: as `@xmldom/xmldom`'s serializer does, with a carriage return as
 * `&#13;` (the node filter `serializeDocument` passes).
 *
 * @internal
 */
export function textData(data: string): string {
  TEXT_ESCAPED_RE.lastIndex = 0;
  return TEXT_ESCAPED_RE.test(data) ? data.replace(TEXT_ESCAPED_RE, escape) : data;
}

/**
 * The XML `serializeDocument` writes for the `@xmldom/xmldom` tree of `source` (the text after
 * its byte order mark is removed; `lineBreaksToNormalize` as the gate scan found), or `undefined`
 * when the compact reader hands the text back or the tree holds an element written another way
 * there (see the module comment).
 *
 * @internal
 */
export function writeSource(source: string, lineBreaksToNormalize: boolean): string | undefined {
  const text = lineBreaksToNormalize ? normalizeLineEndings(source) : source;
  const doc = readDocument(text);
  if (doc === undefined) return undefined;
  if (doc.writtenEnd !== -1) return writtenText(text, doc.writtenEnd);
  const body = writeElement(doc.root);
  if (body === undefined) return undefined;
  return declared(doc.prolog + body + doc.epilog);
}

/**
 * The XML of a text that is already written as this writer writes it, up to `writtenEnd` (where
 * its last node ends): that much of the text, with the declaration `serializeDocument` adds when it
 * starts with none. The compact reader works out `writtenEnd` as it reads.
 *
 * @internal
 */
export function writtenText(text: string, writtenEnd: number): string {
  return declared(writtenEnd === text.length ? text : text.slice(0, writtenEnd));
}

/** The XML with the declaration `serializeDocument` adds to one that starts with none. @internal */
function declared(xml: string): string {
  return xml.startsWith("<?xml") ? xml : `${XML_DECLARATION}\n${xml}`;
}

/** Write an element and everything in it, or `undefined` for one written another way there. @internal */
function writeElement(root: TreeElement): string | undefined {
  let out = "";
  let node: TreeNode = root;
  for (;;) {
    if (node.nodeType === ELEMENT_NODE) {
      const el = node as TreeElement;
      out += `<${el.nodeName}`;
      const attrs = el.attrs;
      if (attrs !== null) {
        for (let i = 0; i < attrs.length; i += 3) {
          out += ` ${attrs[i] as string}="${attributeText(attrs[i + 1] as string)}"`;
        }
      }
      if (el.firstChild !== null) {
        out += ">";
        node = el.firstChild;
        continue;
      }
      if (el.namespaceURI === XHTML_NS) return undefined;
      out += "/>";
    } else {
      out += writeCharacterData(node as TreeCharacterData);
    }
    // The next node in document order: the next sibling, else the next sibling of the nearest
    // ancestor that has one, closing each ancestor left behind.
    let at: TreeNode = node;
    while (at.nextSibling === null) {
      const parent: TreeElement | null = at.parentNode;
      if (parent === null) return out;
      out += `</${parent.nodeName}>`;
      if (parent === root) return out;
      at = parent;
    }
    node = at.nextSibling;
  }
}

/** Write text, a CDATA section, a comment or a processing instruction. @internal */
function writeCharacterData(node: TreeCharacterData): string {
  const data = node.nodeValue;
  switch (node.nodeType) {
    case TEXT_NODE:
      return textData(data);
    case CDATA_SECTION_NODE:
      return `<![CDATA[${data}]]>`;
    case PROCESSING_INSTRUCTION_NODE:
      return `<?${(node as TreeInstruction).target} ${data}?>`;
    default:
      return `<!--${data}-->`;
  }
}
