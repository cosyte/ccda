/**
 * II — HL7 v3 Instance Identifier. The universal identifier datatype in CDA:
 * `templateId`, document `id`, patient identifiers, and assigned-authority ids
 * are all II. Carries a `root` (an OID or UUID), an optional `extension`
 * (the local id within that root), an optional human-readable
 * `assigningAuthorityName`, and `nullFlavor`. This parser is silent — callers
 * that need to flag, e.g., a missing assigning authority do so at their layer.
 */

import { attr } from "../dom.js";
import { readNullFlavor, type ParseCtx } from "./_shared.js";
import type { Element } from "@xmldom/xmldom";

/**
 * Parsed HL7 v3 Instance Identifier. `root` is the namespace OID/UUID;
 * `extension` is the local identifier within it. For a `templateId`, `root`
 * (and optionally `extension`, the R2.1 version stamp) are the meaningful
 * fields; for a patient id, `root`+`extension` form the full MRN.
 *
 * @example
 * ```ts
 * import type { II } from "@cosyte/ccda";
 * const id: II = { root: "2.16.840.1.113883.19.5", extension: "12345" };
 * ```
 */
export interface II {
  readonly root?: string;
  readonly extension?: string;
  readonly assigningAuthorityName?: string;
  readonly nullFlavor?: string;
}

/**
 * Parse an `II` element into a typed {@link II}. Returns `undefined` when the
 * element itself is absent. Never throws; omits any field the element does not
 * carry.
 *
 * @example
 * ```ts
 * import { parseIi } from "@cosyte/ccda";
 * const id = parseIi(idEl, { emit: () => {} });
 * console.log(id?.root);
 * ```
 */
export function parseIi(el: Element | undefined, ctx: ParseCtx): II | undefined {
  if (el === undefined) return undefined;
  const out: {
    root?: string;
    extension?: string;
    assigningAuthorityName?: string;
    nullFlavor?: string;
  } = {};
  const root = attr(el, "root");
  if (root !== undefined) out.root = root;
  const extension = attr(el, "extension");
  if (extension !== undefined) out.extension = extension;
  const authority = attr(el, "assigningAuthorityName");
  if (authority !== undefined) out.assigningAuthorityName = authority;
  const nullFlavor = readNullFlavor(el, ctx);
  if (nullFlavor !== undefined) out.nullFlavor = nullFlavor;
  return out;
}
