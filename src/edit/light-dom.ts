/**
 * The nodes an edit of a written text adds, and their writer: what `editCcda` builds a new section
 * and the revision's header elements with when it edits the text (`./text-surface.ts`), in place
 * of an `@xmldom/xmldom` document.
 *
 * **Nodes.** The builder (`../builder/build-ccda.ts`, through `../builder/dom.ts`) makes an
 * element with `createElementNS`, gives it attributes with `setAttribute` and `setAttributeNS`,
 * and text with `createTextNode`, and joins them with `appendChild`; the edit and the emit-time
 * diagnostics read them back with the model's read helpers (`../model/dom.ts`). A
 * {@link LightDocument} makes nodes that do exactly those things, the way `@xmldom/xmldom` does
 * them (a repeated attribute keeps its place and takes the new value), and nothing else.
 *
 * **Writer.** {@link LightWriter} writes them as `serializeDocument` writes the same nodes
 * appended to the elements of the text they go into. Its element step is transcribed from
 * `@xmldom/xmldom` 0.9's serializer (`serializeToString` in its `lib/dom.js`): the prefix an
 * unprefixed element in a namespace is written with, the declarations each element and attribute
 * adds when the namespaces in scope do not already bind its prefix to its namespace, and the
 * escapes of attribute values and text (with a carriage return in text as `&#13;`, the node filter
 * `serializeDocument` passes). The namespaces in scope are found by the same step, run over the
 * elements of the text the nodes go into, from the root down, as the serializer runs it over the
 * copies of them the edit wrote before. The root is never written with a namespace it does not
 * declare itself (it is the root, and its namespace is v3), so the serializer starts it with none
 * in scope.
 *
 * `test/edit-light.test.ts` compares this writer with `serializeDocument` over every editable
 * section and the header elements, under the namespace declarations a source can carry.
 *
 * @internal
 */

import { attributeText, textData } from "../serialize/write-tree.js";
import { attributeIndexNS, attributeNamed, attributeNamedNS } from "./attributes.js";
import type { TextElement } from "./text-read.js";

/** The namespace of the `xml:` prefix. @internal */
const XML_NS = "http://www.w3.org/XML/1998/namespace";

/** The namespace of `xmlns` and `xmlns:` attributes. @internal */
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** The XHTML namespace, whose childless elements `@xmldom/xmldom` writes by HTML's rules. @internal */
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** A node an edit adds: an element or text. @internal */
export type LightNode = LightElement | LightText;

/**
 * Text an edit adds.
 *
 * @internal
 */
export class LightText {
  /** The text. */
  readonly data: string;
  /** The parent element, once appended. */
  parentNode: LightElement | null = null;
  /** The next sibling, or `null`. */
  nextSibling: LightNode | null = null;

  /** Text holding `data`. */
  constructor(data: string) {
    this.data = data;
  }

  /** Always `3`, `Node.TEXT_NODE`. */
  get nodeType(): 3 {
    return 3;
  }
}

/**
 * An element an edit adds.
 *
 * @internal
 */
export class LightElement {
  /** The qualified name, `prefix:local` or `local`. */
  readonly nodeName: string;
  /** The name without its prefix. */
  readonly localName: string;
  /** The prefix, or `null`. */
  readonly prefix: string | null;
  /** The namespace the element is in, or `null`. */
  readonly namespaceURI: string | null;
  /** The parent element, once appended. */
  parentNode: LightElement | null = null;
  /** The first child, or `null`. */
  firstChild: LightNode | null = null;
  /** The last child, or `null`. */
  private lastChild: LightNode | null = null;
  /** The next sibling, or `null`. */
  nextSibling: LightNode | null = null;
  /** The attributes in the order they were set, three entries each: qualified name, value, namespace. */
  readonly attrs: (string | null)[] = [];

  /** An element named `qualifiedName` in `namespaceURI`, as `Document.createElementNS` makes one. */
  constructor(namespaceURI: string | null, qualifiedName: string) {
    const colon = qualifiedName.indexOf(":");
    this.nodeName = qualifiedName;
    this.prefix = colon === -1 ? null : qualifiedName.slice(0, colon);
    this.localName = colon === -1 ? qualifiedName : qualifiedName.slice(colon + 1);
    this.namespaceURI = namespaceURI;
  }

  /** Always `1`, `Node.ELEMENT_NODE`. */
  get nodeType(): 1 {
    return 1;
  }

  /** The value of the attribute with this qualified name, or `null`. */
  getAttribute(name: string): string | null {
    return attributeNamed(this.attrs, name);
  }

  /** The value of the attribute with this namespace and local name, or `null`. */
  getAttributeNS(namespaceURI: string | null, localName: string): string | null {
    return attributeNamedNS(this.attrs, namespaceURI, localName);
  }

  /** Set the attribute with this qualified name, in no namespace (as `Element.setAttribute`). */
  setAttribute(name: string, value: string): void {
    const attrs = this.attrs;
    for (let i = 0; i < attrs.length; i += 3) {
      if (attrs[i] === name) {
        attrs[i + 1] = value;
        return;
      }
    }
    attrs.push(name, value, null);
  }

  /** Set the attribute with this namespace and qualified name (as `Element.setAttributeNS`). */
  setAttributeNS(namespaceURI: string, qualifiedName: string, value: string): void {
    const colon = qualifiedName.indexOf(":");
    const at = attributeIndexNS(this.attrs, namespaceURI, qualifiedName.slice(colon + 1));
    if (at === -1) this.attrs.push(qualifiedName, value, namespaceURI);
    else this.attrs[at + 1] = value;
  }

  /** Add `node`, made by the same document and in no element yet, as the last child. */
  appendChild<T extends LightNode>(node: T): T {
    node.parentNode = this;
    if (this.lastChild === null) this.firstChild = node;
    else this.lastChild.nextSibling = node;
    this.lastChild = node;
    return node;
  }
}

/**
 * What an edit of a written text builds new nodes with, in place of an `@xmldom/xmldom` document.
 *
 * @internal
 */
export class LightDocument {
  /** An element, as `Document.createElementNS` makes one. */
  createElementNS(namespaceURI: string | null, qualifiedName: string): LightElement {
    return new LightElement(namespaceURI, qualifiedName);
  }

  /** Text, as `Document.createTextNode` makes it. */
  createTextNode(data: string): LightText {
    return new LightText(data);
  }
}

/**
 * An element as the serializer's element step reads it: an element of the text
 * (`./text-read.ts`) or one an edit adds.
 *
 * @internal
 */
interface Named {
  readonly nodeName: string;
  readonly prefix: string | null;
  readonly namespaceURI: string | null;
  readonly attrs: readonly (string | null)[];
}

/**
 * The namespaces in scope, two entries each, prefix (`""` for the default namespace) and
 * namespace, the innermost last, as the serializer's list of visible namespaces holds them.
 *
 * @internal
 */
type Scope = (string | null)[];

/** A start tag, as the serializer writes it up to its `>` or `/>`, its name, and the scope inside it. @internal */
interface StartTag {
  readonly text: string;
  readonly name: string;
  readonly inner: Scope;
}

/**
 * Whether an element or attribute with this prefix and namespace needs a declaration of its own
 * in `scope` (the serializer's `needNamespaceDefine`).
 *
 * @internal
 */
function needsDeclaration(prefix: string | null, namespace: string | null, scope: Scope): boolean {
  if (namespace === null || namespace === "") return false;
  const p = prefix ?? "";
  if ((p === "xml" && namespace === XML_NS) || namespace === XMLNS_NS) return false;
  for (let i = scope.length - 2; i >= 0; i -= 2) {
    if (scope[i] === p) return scope[i + 1] !== namespace;
  }
  return true;
}

/** A namespace declaration, as the serializer writes one. @internal */
function declaration(prefix: string, namespace: string): string {
  return ` ${prefix === "" ? "xmlns" : `xmlns:${prefix}`}="${attributeText(namespace)}"`;
}

/**
 * The serializer's element step: the start tag of `element` in `scope`, up to where it closes,
 * the name its end tag repeats, and the namespaces in scope for its children.
 *
 * @internal
 */
function startTag(element: Named, scope: Scope): StartTag {
  const nodeName = element.nodeName;
  const namespace = element.namespaceURI;
  const attrs = element.attrs;
  let name = nodeName;
  if (element.prefix === null && namespace !== null && namespace !== "") {
    // The default namespace in force: the element's own `xmlns`, else the innermost default
    // binding to its namespace. Unless that is its namespace, the innermost prefix bound to it.
    let inForce: string | null | undefined = attributeNamed(attrs, "xmlns") ?? undefined;
    if (inForce === undefined || inForce === "") {
      for (let i = scope.length - 2; i >= 0; i -= 2) {
        if (scope[i] === "" && scope[i + 1] === namespace) {
          inForce = namespace;
          break;
        }
      }
    }
    if (inForce !== namespace) {
      // A binding found here has a prefix: a default binding to this namespace would be in force.
      for (let i = scope.length - 2; i >= 0; i -= 2) {
        if (scope[i + 1] === namespace) {
          name = `${scope[i] as string}:${nodeName}`;
          break;
        }
      }
    }
  }
  let text = `<${name}`;
  // The scope inside is the one outside until the element adds to it, and a copy from then on.
  let inner = scope;
  const bind = (prefix: string, bound: string | null): void => {
    if (inner === scope) inner = scope.slice();
    inner.push(prefix, bound);
  };
  for (let i = 0; i < attrs.length; i += 3) {
    const qualified = attrs[i] as string;
    if (attrs[i + 2] === XMLNS_NS && qualified.startsWith("xmlns:")) {
      bind(qualified.slice(6), attrs[i + 1] as string);
    } else if (qualified === "xmlns") {
      bind("", attrs[i + 1] as string);
    }
  }
  for (let i = 0; i < attrs.length; i += 3) {
    const qualified = attrs[i] as string;
    const attrNamespace = attrs[i + 2] as string | null;
    const colon = qualified.indexOf(":");
    const prefix = colon === -1 ? null : qualified.slice(0, colon);
    // Only an attribute with a prefix is in a namespace that needs declaring: an unprefixed one is
    // in none, and `xmlns` is in the one no declaration names.
    if (needsDeclaration(prefix, attrNamespace, inner)) {
      text += declaration(prefix as string, attrNamespace as string);
      bind(prefix as string, attrNamespace);
    }
    text += ` ${qualified}="${attributeText(attrs[i + 1] as string)}"`;
  }
  if (name === nodeName && needsDeclaration(element.prefix, namespace, inner)) {
    const p = element.prefix ?? "";
    text += declaration(p, namespace as string);
    bind(p, namespace);
  }
  return { text, name, inner };
}

/**
 * Writes the nodes an edit adds as children of an element of a written text, as
 * `serializeDocument` writes them there (see the module comment).
 *
 * @internal
 */
export class LightWriter {
  /** The namespaces in scope inside each element of the text written into so far. */
  private readonly scopes = new Map<TextElement, Scope>();

  /**
   * `nodes`, written as the children of `parent`, an element of the text; `undefined` when one is
   * written by HTML's rules there (an element in the XHTML namespace with no children), which the
   * edit leaves to the DOM.
   */
  write(parent: TextElement, nodes: readonly LightNode[]): string | undefined {
    const scope = this.scopeInside(parent);
    let out = "";
    for (const node of nodes) {
      const written = writeNode(node, scope);
      if (written === undefined) return undefined;
      out += written;
    }
    return out;
  }

  /** The namespaces in scope inside `element`, from its ancestors' start tags and its own. @internal */
  private scopeInside(element: TextElement): Scope {
    const known = this.scopes.get(element);
    if (known !== undefined) return known;
    const parent = element.parentNode;
    const inner = startTag(element, parent === null ? [] : this.scopeInside(parent)).inner;
    this.scopes.set(element, inner);
    return inner;
  }
}

/** One node an edit adds, in `scope`, and everything in it. @internal */
function writeNode(node: LightNode, scope: Scope): string | undefined {
  if (node instanceof LightText) return textData(node.data);
  const tag = startTag(node, scope);
  if (node.firstChild === null) {
    if (node.namespaceURI === XHTML_NS) return undefined;
    return `${tag.text}/>`;
  }
  let out = `${tag.text}>`;
  for (let child: LightNode | null = node.firstChild; child !== null; child = child.nextSibling) {
    const written = writeNode(child, tag.inner);
    if (written === undefined) return undefined;
    out += written;
  }
  return `${out}</${tag.name}>`;
}
