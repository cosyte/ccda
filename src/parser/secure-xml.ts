/**
 * Hardened XML substrate for `@cosyte/ccda`. This is the single place the
 * package constructs a DOM from untrusted input, and it owns the security
 * posture recorded in `docs/adr/0001-xml-parser.md`:
 *
 * - **No DTD / DOCTYPE.** Any `<!DOCTYPE` or `<!ENTITY` declaration is rejected
 *   outright (`XXE_OR_DTD_PRESENT`) before the DOM is built — this is the
 *   XXE / external-entity defense.
 * - **No external entity resolver.** `@xmldom/xmldom` is DOM-only and never
 *   dereferences external/system entities (no filesystem or network fetch);
 *   we additionally cap custom entity references (`ENTITY_EXPANSION_LIMIT`) as
 *   billion-laughs defense-in-depth.
 * - **Size / depth / node-count caps.** Oversized payloads
 *   (`INPUT_SIZE_LIMIT_EXCEEDED`), pathological nesting
 *   (`ELEMENT_DEPTH_LIMIT_EXCEEDED`), and pathological fan-out
 *   (`NODE_COUNT_LIMIT_EXCEEDED`) are rejected.
 * - **Base64 quarantine.** Embedded base64 (`<text mediaType=... representation="B64">`,
 *   nonXMLBody) is never decoded here — it survives as inert text in the DOM.
 *
 * A UTF-8 BOM is stripped (emitting `ENCODING_BOM_STRIPPED`). Malformed XML
 * surfaces as `NOT_WELL_FORMED_XML`. Everything here is pure and synchronous.
 */

import { DOMParser, type Document, type Element } from "@xmldom/xmldom";

import { positionOf } from "../model/dom.js";
import { CcdaParseError, FATAL_CODES } from "./errors.js";
import type { CcdaParseLimits } from "./types.js";
import { encodingBomStripped, type CcdaWarning } from "./warnings.js";

/** Fully-resolved safety caps — every field present (defaults merged in). @internal */
export interface ResolvedLimits {
  readonly maxInputBytes: number;
  readonly maxDepth: number;
  readonly maxNodeCount: number;
  readonly maxEntityExpansions: number;
}

/**
 * Library-default safety caps applied before DOM construction. Tuned to admit
 * real C-CDA documents (which can embed sizeable base64 images) while still
 * bounding hostile input. Callers tighten or loosen via
 * `ParseCcdaOptions.limits`.
 *
 * @example
 * ```ts
 * import { DEFAULT_LIMITS } from "@cosyte/ccda";
 * console.log(DEFAULT_LIMITS.maxInputBytes); // 30000000
 * ```
 */
export const DEFAULT_LIMITS: ResolvedLimits = {
  maxInputBytes: 30_000_000,
  maxDepth: 1000,
  maxNodeCount: 1_000_000,
  maxEntityExpansions: 1000,
};

/** Element node type per the DOM spec (`Node.ELEMENT_NODE`). @internal */
const ELEMENT_NODE = 1 as const;

/** The five XML predefined entities — always legal, never counted toward the expansion cap. @internal */
const PREDEFINED_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);

/** Detects a declared DTD or entity — the XXE / external-entity attack surface. @internal */
const DTD_RE = /<!DOCTYPE|<!ENTITY/iu;

/** Matches a custom (non-predefined, non-numeric) entity reference `&name;`. @internal */
const ENTITY_REF_RE = /&[a-z_][\w.-]*;/giu;

/**
 * Merge caller-supplied limit overrides over {@link DEFAULT_LIMITS}. Honors
 * `exactOptionalPropertyTypes` — an omitted override key falls back to the
 * default rather than producing `undefined`.
 *
 * @example
 * ```ts
 * import { resolveLimits } from "@cosyte/ccda";
 * const limits = resolveLimits({ maxDepth: 200 });
 * console.log(limits.maxDepth); // 200
 * ```
 */
export function resolveLimits(overrides?: CcdaParseLimits): ResolvedLimits {
  return {
    maxInputBytes: overrides?.maxInputBytes ?? DEFAULT_LIMITS.maxInputBytes,
    maxDepth: overrides?.maxDepth ?? DEFAULT_LIMITS.maxDepth,
    maxNodeCount: overrides?.maxNodeCount ?? DEFAULT_LIMITS.maxNodeCount,
    maxEntityExpansions: overrides?.maxEntityExpansions ?? DEFAULT_LIMITS.maxEntityExpansions,
  };
}

/**
 * Strip a leading UTF-8 BOM and run the pre-parse safety gauntlet (size,
 * DTD/DOCTYPE, entity-reference cap), then build a DOM with a hardened
 * `@xmldom/xmldom` `DOMParser`, then enforce the depth / node-count caps on
 * the constructed tree. Returns the root `Document`. Emits
 * `ENCODING_BOM_STRIPPED` via `emit` when a BOM was removed.
 *
 * Throws a {@link CcdaParseError} carrying a PHI-free {@link CcdaPosition} for
 * any safety violation or malformed XML — never returns a partially-built
 * document.
 *
 * @example
 * ```ts
 * import { parseSecureXml, resolveLimits } from "@cosyte/ccda";
 * const doc = parseSecureXml("<ClinicalDocument/>", resolveLimits(), () => {});
 * console.log(doc.documentElement?.localName); // "ClinicalDocument"
 * ```
 */
export function parseSecureXml(
  raw: string,
  limits: ResolvedLimits,
  emit: (warning: CcdaWarning) => void,
): Document {
  let source = raw;
  if (source.charCodeAt(0) === 0xfeff) {
    source = source.slice(1);
    emit(encodingBomStripped({}));
  }

  const byteLength = Buffer.byteLength(source, "utf8");
  if (byteLength > limits.maxInputBytes) {
    throw new CcdaParseError(
      FATAL_CODES.INPUT_SIZE_LIMIT_EXCEEDED,
      `Input is ${String(byteLength)} bytes, exceeding the ${String(limits.maxInputBytes)}-byte cap.`,
      {},
    );
  }

  if (DTD_RE.test(source)) {
    throw new CcdaParseError(
      FATAL_CODES.XXE_OR_DTD_PRESENT,
      `Input declares a DTD/DOCTYPE or custom entity; rejected to prevent XXE / external-entity attacks.`,
      {},
    );
  }

  countEntityRefs(source, limits);

  const doc = buildDom(source);
  enforceStructureLimits(doc, limits);
  return doc;
}

/**
 * Count custom entity references and throw `ENTITY_EXPANSION_LIMIT` when the
 * count exceeds the cap. Predefined (`&amp;` …) and numeric (`&#…;`) references
 * are never counted. With DTDs already rejected these references could only be
 * undefined anyway — this is billion-laughs defense-in-depth.
 *
 * @internal
 */
function countEntityRefs(source: string, limits: ResolvedLimits): void {
  const refs = source.match(ENTITY_REF_RE);
  if (refs === null) return;
  let count = 0;
  for (const ref of refs) {
    const name = ref.slice(1, -1).toLowerCase();
    if (PREDEFINED_ENTITIES.has(name)) continue;
    count += 1;
    if (count > limits.maxEntityExpansions) {
      throw new CcdaParseError(
        FATAL_CODES.ENTITY_EXPANSION_LIMIT,
        `Input contains more than ${String(limits.maxEntityExpansions)} custom entity references.`,
        {},
      );
    }
  }
}

/**
 * PHI-safe message for any not-well-formed-XML fatal. The raw `@xmldom/xmldom`
 * error text can echo surrounding source (which for a C-CDA is clinical
 * content), so it is **never** propagated — every malformed-XML path reports
 * this generic, content-free string instead. @internal
 */
const NOT_WELL_FORMED_MESSAGE = "Input is not well-formed XML.";

/**
 * Construct the DOM with a hardened parser. The `onError` handler tolerates
 * `warning`/`error` levels (Postel's Law — the lenient parser recovers what it
 * can) but converts any `fatalError` into a PHI-safe `NOT_WELL_FORMED_XML`
 * fatal. `@xmldom/xmldom` also throws directly for some malformed inputs; those
 * are caught and normalized to the same fatal. A null document element is left
 * for the caller's root gate to reject.
 *
 * @internal
 */
function buildDom(source: string): Document {
  const parser = new DOMParser({
    locator: true,
    onError: (level: "warning" | "error" | "fatalError"): void => {
      if (level === "fatalError") {
        throw new CcdaParseError(FATAL_CODES.NOT_WELL_FORMED_XML, NOT_WELL_FORMED_MESSAGE, {});
      }
    },
  });

  try {
    return parser.parseFromString(source, "application/xml");
  } catch (err) {
    if (err instanceof CcdaParseError) throw err;
    throw new CcdaParseError(FATAL_CODES.NOT_WELL_FORMED_XML, NOT_WELL_FORMED_MESSAGE, {});
  }
}

/**
 * Walk the constructed DOM iteratively (no recursion — itself a depth-attack
 * surface) to enforce `maxDepth` and `maxNodeCount`. Counts element nodes only;
 * throws `ELEMENT_DEPTH_LIMIT_EXCEEDED` for over-deep nesting and
 * `NODE_COUNT_LIMIT_EXCEEDED` for excessive fan-out.
 *
 * @internal
 */
function enforceStructureLimits(doc: Document, limits: ResolvedLimits): void {
  const root = doc.documentElement;
  if (root === null) return;

  let nodeCount = 0;
  let level: { node: Element; depth: number }[] = [{ node: root, depth: 1 }];

  while (level.length > 0) {
    const next: { node: Element; depth: number }[] = [];
    for (const { node, depth } of level) {
      nodeCount += 1;
      if (depth > limits.maxDepth) {
        throw new CcdaParseError(
          FATAL_CODES.ELEMENT_DEPTH_LIMIT_EXCEEDED,
          `Element nesting depth exceeds the ${String(limits.maxDepth)}-level cap.`,
          positionOf(node),
        );
      }
      if (nodeCount > limits.maxNodeCount) {
        throw new CcdaParseError(
          FATAL_CODES.NODE_COUNT_LIMIT_EXCEEDED,
          `Element count exceeds the ${String(limits.maxNodeCount)}-node cap.`,
          {},
        );
      }
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (child.nodeType === ELEMENT_NODE)
          next.push({ node: child as Element, depth: depth + 1 });
      }
    }
    level = next;
  }
}
