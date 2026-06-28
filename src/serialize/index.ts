/**
 * Public serialization surface for `@cosyte/ccda` — the conservative *emit*
 * half of the Postel's-Law contract, symmetric with `parseCcda`. Mirrors the
 * sibling `@cosyte/hl7`'s top-level emitter shape: a free `serializeCcda`
 * function plus the `CcdaDocument.toString()` instance method, both returning
 * the same spec-clean XML.
 */

import type { CcdaDocument } from "../model/document.js";

/**
 * Serialize a parsed {@link CcdaDocument} back to spec-clean C-CDA XML.
 *
 * The output is the faithful re-emission of the document the parser read — no
 * silent loss of unmodeled content — with a guaranteed XML declaration.
 * Serialization is a fixed point: `parseCcda(serializeCcda(doc))` re-serializes
 * to the identical string. Equivalent to `doc.toString()`.
 *
 * @param doc - A document produced by {@link parseCcda}.
 * @returns The spec-clean XML text.
 * @throws {Error} If `doc` was hand-constructed (not produced by `parseCcda`)
 *   and therefore retains no source document to emit — a builder API lands in a
 *   later phase.
 * @example
 * ```ts
 * import { parseCcda, serializeCcda } from "@cosyte/ccda";
 * const doc = parseCcda(xml);
 * const xmlOut = serializeCcda(doc); // spec-clean, declaration-prefixed
 * ```
 */
export function serializeCcda(doc: CcdaDocument): string {
  return doc.toString();
}
