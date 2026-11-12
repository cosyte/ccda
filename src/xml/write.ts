/**
 * The writer under `serializeXml`: it walks an `@xmldom/xmldom` document or element and writes XML
 * text itself, with no help from xmldom's serializer, and refuses with a {@link Refusal} a tree it
 * cannot write as text that reads back to the same tree.
 *
 * Every value it copies into the text goes through one path: an attribute value, a namespace it
 * declares and the data of a text node through {@link escapeValue}, which refuses a character XML
 * 1.0 forbids and writes every character a parse would change as a reference; every element and
 * attribute name through {@link checkName}; and the data of a comment, CDATA section or processing
 * instruction, which can hold no reference, through {@link checkMarkup}. It declares each namespace
 * itself, from the namespace each element and attribute carries, and refuses a tree whose names
 * cannot all be bound on one element (one prefix for two namespaces, a reserved prefix).
 *
 * `serializeXml` then reads the text back and compares the trees (`./same-tree.ts`), so a case this
 * writer misses is refused there rather than written.
 *
 * @packageDocumentation
 */

import { codePointLabel, firstForbiddenIndex } from "../parser/xml-chars.js";
import { XML_DECLARATION } from "../serialize/serialize-dom.js";

/**
 * A refusal, raised anywhere in the walk and turned into the `TypeError` `serializeXml` throws.
 * Its message is the reason, written here and never taken from the tree.
 *
 * @internal
 */
export class Refusal extends Error {}

/*
 * Every constant and pattern of the writer is written inside the function that uses it, not at the
 * top of the module: StrykerJS cannot judge a mutant in a value computed once when the module
 * loads, and reports it as surviving.
 */

/**
 * The namespace the `xml` prefix is bound to in every document.
 *
 * @internal
 */
export function xmlNamespace(): string {
  return "http://www.w3.org/XML/1998/namespace";
}

/**
 * The namespace of every namespace declaration, `xmlns` and `xmlns:p`.
 *
 * @internal
 */
export function xmlnsNamespace(): string {
  return "http://www.w3.org/2000/xmlns/";
}

/**
 * The members of a node the writer reads, each read only on the kinds of node that have it: `data`
 * on text, CDATA, comment and instruction nodes, `target` on an instruction, `value` on an
 * attribute, `attributes` on an element.
 *
 * @internal
 */
export interface XmlNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly namespaceURI: string | null;
  readonly data: string;
  readonly value: string;
  readonly target: string;
  readonly childNodes: ArrayLike<XmlNode>;
  readonly attributes: ArrayLike<XmlNode>;
}

/** The refusal shared by the checks of XML's own grammar. */
function notWellFormed(): Refusal {
  return new Refusal(
    "is not well-formed XML (a name that is not an XML name, a comment holding '--' or ending in '-', a CDATA section holding ']]>', a processing instruction holding '?>' or with a reserved target, or a document with no root element)",
  );
}

/**
 * Whether `name` is an XML name: an `NCName` of Namespaces in XML 1.0 (XML 1.0 Fifth Edition
 * productions [4] and [4a], `NameStartChar` and `NameChar`, without the colon), or, when
 * `qualified`, two joined by a colon.
 */
function isName(name: string, qualified: boolean): boolean {
  const start =
    "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
  const ncname = `[${start}][${start}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F\\u2040]*`;
  const pattern = qualified ? `^${ncname}(?::${ncname})?$` : `^${ncname}$`;
  // V8 keeps one compiled copy of a pattern for each source, so building it here costs no compile.
  return new RegExp(pattern, "u").test(name);
}

/**
 * The reference a character is written as in text or an attribute value: the markup characters by
 * name, and the characters a parse would not keep as they are (XML 1.0 sections 2.11 and 3.3.3: a
 * carriage return, NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR read as a line feed, and in an
 * attribute value a tab and a line feed read as a space) by number.
 */
function reference(char: string): string {
  switch (char) {
    case "&":
      return "&amp;";
    case "<":
      return "&lt;";
    case ">":
      return "&gt;";
    case '"':
      return "&quot;";
    case "\r":
      return "&#13;";
    case "\n":
      return "&#10;";
    case "\t":
      return "&#9;";
    default:
      return `&#x${char.charCodeAt(0).toString(16)};`;
  }
}

/** Throw a {@link Refusal} naming the code point when `value` holds a character XML 1.0 forbids. */
function refuseForbidden(value: string): void {
  const at = firstForbiddenIndex(value);
  if (at === -1) return;
  throw new Refusal(
    `holds ${codePointLabel(value.charCodeAt(at))}, a character XML 1.0 does not allow in a document`,
  );
}

/**
 * A value as XML text: refused when it holds a character XML 1.0 forbids, and otherwise written
 * with every character a parse would change as its {@link reference}. Text keeps a tab and a line
 * feed as they are; an attribute value (and a namespace, which is one) writes them as references
 * too, and a double quote, which closes it.
 *
 * @internal
 */
export function escapeValue(value: string, inAttribute: boolean): string {
  refuseForbidden(value);
  const pattern = inAttribute ? /[&<>"\t\n\r\u0085\u2028\u2029]/gu : /[&<>\r\u0085\u2028\u2029]/gu;
  return value.replace(pattern, reference);
}

/**
 * Throw a {@link Refusal} when the data of a comment, CDATA section or processing instruction holds
 * a character XML 1.0 forbids, a DTD or entity marker in any case (which `parseXml`'s gate refuses
 * wherever it sits), or a character a parse reads as a line feed (carriage return, NEL, LINE
 * SEPARATOR, PARAGRAPH SEPARATOR), which cannot be written as a reference there.
 *
 * @internal
 */
function checkMarkup(data: string): void {
  refuseForbidden(data);
  if (/<!DOCTYPE|<!ENTITY/iu.test(data)) {
    throw new Refusal(
      "holds '<!DOCTYPE' or '<!ENTITY' in a comment, CDATA section or processing instruction, which parseXml refuses",
    );
  }
  const at = data.search(/[\r\u0085\u2028\u2029]/u);
  if (at !== -1) {
    throw new Refusal(
      `holds ${codePointLabel(data.charCodeAt(at))} in a comment, CDATA section or processing instruction, where a parse reads it as a line feed`,
    );
  }
}

/** Throw a {@link Refusal} when `name` is not an XML name: one `NCName`, or two joined by `:`. */
function checkName(name: string): void {
  if (!isName(name, true)) throw notWellFormed();
}

/** The prefix of a qualified name, or `""` when it has none. */
function prefixOf(name: string): string {
  const colon = name.indexOf(":");
  return colon === -1 ? "" : name.slice(0, colon);
}

/**
 * The prefix an attribute declares, when it is a namespace declaration: `""` for `xmlns`, `p` for
 * `xmlns:p`, set with or without the xmlns namespace. `undefined` for any other attribute.
 *
 * @internal
 */
export function declaredPrefix(attr: XmlNode): string | undefined {
  const name = attr.nodeName;
  const uri = attr.namespaceURI;
  if (uri !== null && uri !== xmlnsNamespace()) return undefined;
  if (name === "xmlns") return "";
  return name.startsWith("xmlns:") ? name.slice(6) : undefined;
}

/**
 * The namespaces in scope at an element, each prefix (`""` for the default namespace) to its
 * namespace (`""` for none), its own declarations over its ancestors', so a lookup costs the same
 * at any depth.
 */
type Scope = ReadonlyMap<string, string>;

/**
 * The scope every document starts in: `xml` bound, no default namespace. (`xmlns` is bound too,
 * but only a declaration carries it, and an element with it is refused.)
 */
function rootScope(): Scope {
  return new Map([["xml", xmlNamespace()]]);
}

/**
 * The namespace `prefix` is bound to in `scope`, or `null` when none is: no declaration binds it,
 * or it is the default namespace undeclared with `xmlns=""`.
 */
function lookup(scope: Scope, prefix: string): string | null {
  const uri = scope.get(prefix);
  return uri === undefined || uri === "" ? null : uri;
}

/**
 * Throw a {@link Refusal} for a declaration Namespaces in XML 1.0 forbids: the prefix `xmlns`, the
 * xmlns namespace, the xml namespace bound to a prefix other than `xml` or `xml` bound to another,
 * or a prefix bound to no namespace (which only XML 1.1 allows).
 */
function checkDeclaration(prefix: string, uri: string): void {
  if (
    prefix === "xmlns" ||
    uri === xmlnsNamespace() ||
    (prefix === "xml") !== (uri === xmlNamespace()) ||
    (prefix !== "" && uri === "")
  ) {
    throw new Refusal(
      "holds a name or declaration Namespaces in XML 1.0 forbids (the prefix xmlns, the xml or xmlns namespace under another prefix, or a prefix bound to no namespace)",
    );
  }
}

/**
 * The declarations one element is written with: those it carries, then those the writer adds so
 * that each name on it is bound to its namespace.
 */
class Declarations {
  readonly #local = new Map<string, string>();

  constructor(readonly scope: Scope) {}

  /** Record a declaration the element carries. */
  carry(prefix: string, uri: string): void {
    checkDeclaration(prefix, uri);
    if (this.#local.has(prefix)) {
      throw new Refusal("declares one prefix twice on one element, which a parse refuses");
    }
    this.#local.set(prefix, uri);
  }

  /**
   * Bind `prefix` to `uri` on this element (`null` for no namespace, which only the default
   * namespace can be). Returns the declaration to write, or `""` when the prefix is bound to it
   * already.
   */
  bind(prefix: string, uri: string | null): string {
    const local = this.#local.get(prefix);
    const bound = local === undefined ? lookup(this.scope, prefix) : local === "" ? null : local;
    if (bound === uri) return "";
    if (local !== undefined) {
      throw new Refusal(
        "binds one prefix to two namespaces on one element, which no start tag can declare",
      );
    }
    const value = uri ?? "";
    checkDeclaration(prefix, value);
    this.#local.set(prefix, value);
    return ` ${prefix === "" ? "xmlns" : `xmlns:${prefix}`}="${escapeValue(value, true)}"`;
  }

  /** The scope of the element's content. */
  inner(): Scope {
    return new Map([...this.scope, ...this.#local]);
  }
}

/**
 * Throw a {@link Refusal} for a prefixed name with no namespace: no declaration can bind it. An
 * attribute `xml:` is read back in the xml namespace, which every document binds, and passes.
 */
function refuseUnbound(prefix: string, isAttribute: boolean): void {
  if (prefix === "" || (isAttribute && prefix === "xml")) return;
  throw new Refusal("holds a prefixed name with no namespace, which no declaration binds");
}

/** The start tag of an element, without its closing `>` or `/>`, and the scope of its content. */
function startTag(element: XmlNode, scope: Scope): { tag: string; inner: Scope } {
  const name = element.nodeName;
  const uri = element.namespaceURI;
  const prefix = prefixOf(name);
  if (uri === null) refuseUnbound(prefix, false);
  checkName(name);
  if (prefix === "xmlns") {
    throw new Refusal(
      "holds an element with the prefix xmlns, which only a namespace declaration may carry",
    );
  }
  const declarations = new Declarations(scope);
  const attributes = Array.from(element.attributes);
  for (const attr of attributes) {
    const declared = declaredPrefix(attr);
    if (declared !== undefined) declarations.carry(declared, attr.value);
  }
  const own = declarations.bind(prefix, uri);
  let tag = `<${name}`;
  for (const attr of attributes) {
    tag += attribute(attr, declarations);
  }
  return { tag: tag + own, inner: declarations.inner() };
}

/** One attribute, ` name="value"`, after the declaration its namespace needs, if any. */
function attribute(attr: XmlNode, declarations: Declarations): string {
  const name = attr.nodeName;
  const value = escapeValue(attr.value, true);
  if (declaredPrefix(attr) !== undefined) {
    checkName(name);
    return ` ${name}="${value}"`;
  }
  const uri = attr.namespaceURI;
  const prefix = prefixOf(name);
  if (uri === null) refuseUnbound(prefix, true);
  checkName(name);
  if (uri === null) return ` ${name}="${value}"`;
  if (prefix === "") {
    throw new Refusal(
      "holds an attribute in a namespace with no prefix, which no declaration can give it",
    );
  }
  return `${declarations.bind(prefix, uri)} ${name}="${value}"`;
}

/** `Node.ELEMENT_NODE` and the other node types the writer meets. */
const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;
const INSTRUCTION = 7;
const COMMENT = 8;
const DOCUMENT = 9;
const DOCTYPE = 10;

/** A processing instruction, `<?target data?>`, checked so it reads back with the same data. */
function instruction(node: XmlNode): string {
  const target = node.target;
  const data = node.data;
  checkMarkup(data);
  // A target is a name with no colon (Namespaces in XML 1.0, section 7), and not `xml` in any case.
  if (!isName(target, false) || /^xml$/iu.test(target) || data.includes("?>")) {
    throw notWellFormed();
  }
  if (/^[ \t\n]/u.test(data)) {
    throw new Refusal(
      "holds a processing instruction whose data starts with white space, which a parse drops",
    );
  }
  return data === "" ? `<?${target}?>` : `<?${target} ${data}?>`;
}

/** A comment, `<!--data-->`, checked as {@link checkMarkup} checks it. */
function comment(data: string): string {
  checkMarkup(data);
  if (data.includes("--") || data.endsWith("-")) throw notWellFormed();
  return `<!--${data}-->`;
}

/** A CDATA section, `<![CDATA[data]]>`; an empty one, which a parse drops, is not written. */
function cdata(data: string): string {
  checkMarkup(data);
  if (data.includes("]]>")) throw notWellFormed();
  return data === "" ? "" : `<![CDATA[${data}]]>`;
}

/**
 * One node in an element's content: an element (pushed for the walk to write), text, a CDATA
 * section, a comment or a processing instruction. Any other kind is refused.
 */
function content(node: XmlNode): string {
  switch (node.nodeType) {
    case TEXT:
      return escapeValue(node.data, false);
    case CDATA:
      return cdata(node.data);
    case COMMENT:
      return comment(node.data);
    case INSTRUCTION:
      return instruction(node);
    default:
      throw new Refusal(
        "holds a node of a kind XML text cannot hold there (such as an entity reference)",
      );
  }
}

/** One step of the walk: an element to open in a scope, or a closing tag to write. */
type Step = { readonly element: XmlNode; readonly scope: Scope } | string;

/**
 * An element and everything in it, walked with a stack of its own rather than by recursion, so a
 * deep tree cannot overflow the call stack.
 */
function writeElement(root: XmlNode, scope: Scope): string {
  const out: string[] = [];
  const stack: Step[] = [{ element: root, scope }];
  for (let step = stack.pop(); step !== undefined; step = stack.pop()) {
    if (typeof step === "string") {
      out.push(step);
      continue;
    }
    const { tag, inner } = startTag(step.element, step.scope);
    const children = Array.from(step.element.childNodes);
    if (children.length === 0) {
      out.push(`${tag}/>`);
      continue;
    }
    out.push(`${tag}>`);
    stack.push(`</${step.element.nodeName}>`);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i] as XmlNode;
      stack.push(child.nodeType === ELEMENT ? { element: child, scope: inner } : content(child));
    }
  }
  return out.join("");
}

/**
 * The XML declaration, written as it was when its data is an XML declaration's, and refused
 * otherwise. The data, after `<?xml ` and before `?>`, follows XML 1.0 productions [23] to [26],
 * [32], [80] and [81]: a version `1.` and digits, then an optional encoding name, then an optional
 * `standalone` of `yes` or `no`, in that order, each quoted with matching quotes, then optional
 * space. The space is a space, tab or line feed: a carriage return would be read back as a line
 * feed.
 */
function declaration(data: string): string {
  refuseForbidden(data);
  const grammar =
    /^version[ \t\n]*=[ \t\n]*(?:"1\.[0-9]+"|'1\.[0-9]+')(?:[ \t\n]+encoding[ \t\n]*=[ \t\n]*(?:"[A-Za-z][\w.-]*"|'[A-Za-z][\w.-]*'))?(?:[ \t\n]+standalone[ \t\n]*=[ \t\n]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\n]*$/u;
  if (!grammar.test(data)) {
    throw new Refusal(
      "holds an XML declaration that is not one (a version, then an optional encoding and standalone)",
    );
  }
  return `<?xml ${data}?>`;
}

/**
 * Whether a node is a processing instruction with the target `xml`: the only node with a `target`
 * is an instruction.
 */
function isDeclaration(node: XmlNode | undefined): boolean {
  return node?.target === "xml";
}

/**
 * One node of a document, outside its root element: the XML declaration when it comes first, a
 * comment, a processing instruction, or white space, which is written as it is (a parse keeps no
 * text outside the root, so none is compared). A DOCTYPE, other text and a CDATA section are
 * refused.
 */
function prolog(node: XmlNode, first: boolean): string {
  switch (node.nodeType) {
    case DOCTYPE:
      throw new Refusal("holds a DOCTYPE, which parseXml refuses");
    case TEXT:
      if (/^[ \t\n\r]*$/u.test(node.data)) return node.data;
      throw new Refusal("holds text outside the root element, which a parse drops");
    case CDATA:
      throw new Refusal("holds a CDATA section outside the root element, which a parse refuses");
    default:
      return first && isDeclaration(node) ? declaration(node.data) : content(node);
  }
}

/**
 * Write a document or an element as XML text. A document is written with
 * {@link XML_DECLARATION} and a line feed first when it carries no declaration. Throws a
 * {@link Refusal} for a tree it cannot write as text that reads back the same.
 *
 * @internal
 */
export function writeXml(node: XmlNode): string {
  if (node.nodeType === ELEMENT) return writeElement(node, rootScope());
  if (node.nodeType !== DOCUMENT) throw new Refusal("is not a document or an element");
  const children = Array.from(node.childNodes);
  let out = isDeclaration(children[0]) ? "" : `${XML_DECLARATION}\n`;
  let root = false;
  for (const [index, child] of children.entries()) {
    if (child.nodeType === ELEMENT) {
      root = true;
      out += writeElement(child, rootScope());
    } else {
      out += prolog(child, index === 0);
    }
  }
  if (!root) throw notWellFormed();
  return out;
}
