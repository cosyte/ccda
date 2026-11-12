/**
 * The check `parseXml` runs on the tree `@xmldom/xmldom` built, against what the scan of the text
 * read before it (`./outside-root.ts`). xmldom drops some content with no report, so the tree is
 * not trusted to hold what the text held: an element whose attributes or child nodes the tree
 * counts otherwise than the scan is refused. It also refuses what Namespaces in XML 1.0 forbids and
 * xmldom reads with no report: two attributes that name one namespace and local name through two
 * prefixes (constraint Attributes Unique, where xmldom keeps one and drops the other), a namespace
 * declaration the constraints Reserved Prefixes and Namespace Names and No Prefix Undeclaring
 * forbid, and a colon in a processing instruction's target (section 7). Every refusal is
 * `NOT_WELL_FORMED_XML`, naming nothing the text said. `parseSecureXml`, and so `parseCcda`, does
 * not run it.
 *
 * @packageDocumentation
 */

import { CcdaParseError, FATAL_CODES, FATAL_MESSAGES } from "./errors.js";
import type { ScannedTree } from "./outside-root.js";

/** An attribute as the check reads it from the built tree. @internal */
export interface BuiltAttribute {
  readonly name: string;
  readonly prefix: string | null;
  readonly localName: string;
  readonly value: string;
}

/** A node as the check reads it from the built tree. @internal */
export interface BuiltNode {
  readonly nodeType: number;
  readonly childNodes: ArrayLike<BuiltNode>;
  readonly attributes?: ArrayLike<BuiltAttribute>;
  readonly target?: string;
}

/** The fatal every refusal here throws, naming nothing the text said. */
function notWellFormed(): CcdaParseError {
  return new CcdaParseError(
    FATAL_CODES.NOT_WELL_FORMED_XML,
    FATAL_MESSAGES.NOT_WELL_FORMED_XML,
    {},
  );
}

/**
 * Throw `NOT_WELL_FORMED_XML` when a declaration binds `prefix` (the empty string for the default
 * namespace) to `uri` as Namespaces in XML 1.0 forbids: a declaration of the prefix `xmlns`, any
 * binding to the xmlns namespace, the prefix `xml` bound to another namespace or the xml namespace
 * under another prefix or as the default, or a prefix bound to no namespace.
 */
function refuseForbiddenDeclaration(prefix: string, uri: string): void {
  const xml = "http://www.w3.org/XML/1998/namespace";
  if (
    prefix === "xmlns" ||
    uri === "http://www.w3.org/2000/xmlns/" ||
    (prefix === "xml") !== (uri === xml) ||
    (uri === "" && prefix !== "")
  ) {
    throw notWellFormed();
  }
}

/** The prefixes an element declared, each with the namespace it had before, to restore. */
type Restore = readonly (readonly [string, string | undefined])[];

/**
 * Check the namespace declarations among `attributes`, bind each declared prefix in `bindings`,
 * and return what to restore when the element ends.
 */
function declare(
  attributes: ArrayLike<BuiltAttribute>,
  bindings: Map<string, string | undefined>,
): Restore {
  const all = Array.from(attributes);
  for (const attribute of all) {
    if (attribute.name === "xmlns") refuseForbiddenDeclaration("", attribute.value);
  }
  return all
    .filter((attribute) => attribute.prefix === "xmlns")
    .map((attribute) => {
      refuseForbiddenDeclaration(attribute.localName, attribute.value);
      const previous = bindings.get(attribute.localName);
      bindings.set(attribute.localName, attribute.value);
      return [attribute.localName, previous] as const;
    });
}

/**
 * Throw `NOT_WELL_FORMED_XML` when two of `names` (prefixed attribute names the scan read on one
 * start tag, `xml:` and `xmlns:` ones left out) name one namespace and local name, their prefixes
 * resolved through `bindings`. Every prefix the tree holds is bound: xmldom refuses an undeclared
 * one.
 */
function refuseSharedName(
  names: readonly string[],
  bindings: ReadonlyMap<string, string | undefined>,
): void {
  const seen = new Set<string>();
  for (const name of names) {
    const colon = name.indexOf(":");
    const key = `${bindings.get(name.slice(0, colon))} ${name.slice(colon + 1)}`;
    if (seen.has(key)) throw notWellFormed();
    seen.add(key);
  }
}

/**
 * Throw `NOT_WELL_FORMED_XML` unless the tree under `doc` holds what `scanned` read: walking its
 * elements in document order, each holds as many attributes and child nodes as the scan counted
 * on the same element, and there are as many elements. Before the counts, each element's
 * namespace declarations are checked, and its attribute names when two prefixes give one local
 * name; and each processing instruction's target is checked for a colon. The walk keeps its own
 * stack, so a tree of any depth is read without recursion.
 *
 * @internal
 */
export function refuseTreeDifference(doc: BuiltNode, scanned: ScannedTree): void {
  // Each prefix's namespace in scope; a prefix out of scope maps to undefined or is absent.
  const bindings = new Map<string, string | undefined>();
  // Nodes to visit, the next last, and, after each element's children, what to restore. The
  // nodes under the document are taken in any order: one element, and nothing else counted.
  const pending: (BuiltNode | Restore)[] = Array.from(doc.childNodes);
  let index = 0;
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    if (Array.isArray(item)) {
      for (const [prefix, uri] of item as Restore) bindings.set(prefix, uri);
    } else if ((item as BuiltNode).nodeType === 1) {
      const node = item as BuiltNode;
      const attributes = node.attributes as ArrayLike<BuiltAttribute>;
      pending.push(declare(attributes, bindings));
      const names = scanned.sharedLocalNames.get(index);
      if (names !== undefined) refuseSharedName(names, bindings);
      if (
        attributes.length !== scanned.attributes[index] ||
        node.childNodes.length !== scanned.children[index]
      ) {
        throw notWellFormed();
      }
      index += 1;
      // One push each, not a spread: an element may hold more children than a call takes.
      for (let i = node.childNodes.length - 1; i >= 0; i -= 1) {
        pending.push(node.childNodes[i] as BuiltNode);
      }
    } else if (
      (item as BuiltNode).nodeType === 7 &&
      ((item as BuiltNode).target as string).includes(":")
    ) {
      throw notWellFormed();
    }
  }
  if (index !== scanned.attributes.length) throw notWellFormed();
}
