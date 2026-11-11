/**
 * Attribute lookups on a flat list of attributes, three entries each (qualified name, value,
 * namespace), as `../parser/xml-tree.ts` keeps them: shared by the elements an edit reads from a
 * written text (`./text-read.ts`) and those it builds (`./light-dom.ts`).
 *
 * @internal
 */

/**
 * The value of the attribute with this qualified name, or `null` (as `Element.getAttribute`).
 *
 * @internal
 */
export function attributeNamed(attrs: readonly (string | null)[], name: string): string | null {
  for (let i = 0; i < attrs.length; i += 3) {
    if (attrs[i] === name) return attrs[i + 1] as string;
  }
  return null;
}

/**
 * The index of the attribute with this namespace and local name, or -1 (as
 * `Element.getAttributeNodeNS` finds one). The local name is the part of the qualified name after
 * its colon.
 *
 * @internal
 */
export function attributeIndexNS(
  attrs: readonly (string | null)[],
  namespaceURI: string | null,
  localName: string,
): number {
  for (let i = 0; i < attrs.length; i += 3) {
    if (attrs[i + 2] !== namespaceURI) continue;
    const name = attrs[i] as string;
    const colon = name.indexOf(":");
    const matches =
      colon === -1
        ? name === localName
        : name.length - colon - 1 === localName.length && name.endsWith(localName);
    if (matches) return i;
  }
  return -1;
}

/**
 * The value of the attribute with this namespace and local name, or `null` (as
 * `Element.getAttributeNS`).
 *
 * @internal
 */
export function attributeNamedNS(
  attrs: readonly (string | null)[],
  namespaceURI: string | null,
  localName: string,
): string | null {
  const at = attributeIndexNS(attrs, namespaceURI, localName);
  return at === -1 ? null : (attrs[at + 1] as string);
}
