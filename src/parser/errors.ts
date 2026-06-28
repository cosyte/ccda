/**
 * Fatal error taxonomy for the `@cosyte/ccda` parser pipeline. Seven Tier-3
 * codes cover every unrecoverable structural / safety failure; anything less
 * severe is a Tier-2 warning (see `./warnings.ts`). `CcdaParseError` is thrown
 * directly; consumers narrow via the `code` discriminant.
 *
 * The first five codes are **security fatals** raised by the hardened XML
 * substrate (`./secure-xml.ts`) before or during DOM construction — they are
 * the load-bearing defense against hostile XML (XXE, billion-laughs, oversized,
 * pathologically deep, or pathologically wide payloads). The last two cover
 * malformed input and a well-formed-but-wrong-root document.
 */

import type { CcdaPosition } from "./types.js";

/**
 * Stable string codes for every Tier-3 fatal the parser may throw. Consumers
 * narrow on `err.code` to react to specific structural or safety failures.
 * Each code is its own value (`key === value`) so the set survives
 * `Object.values(...)` into a snapshot tripwire. Renaming a code is a
 * **breaking change**.
 *
 * @example
 * ```ts
 * import { parseCcda, FATAL_CODES, CcdaParseError } from "@cosyte/ccda";
 * try {
 *   parseCcda(hostileXml);
 * } catch (err) {
 *   if (err instanceof CcdaParseError && err.code === FATAL_CODES.XXE_OR_DTD_PRESENT) {
 *     // reject the document — it declared a DTD / external entity
 *   }
 * }
 * ```
 */
export const FATAL_CODES = {
  XXE_OR_DTD_PRESENT: "XXE_OR_DTD_PRESENT",
  ENTITY_EXPANSION_LIMIT: "ENTITY_EXPANSION_LIMIT",
  INPUT_SIZE_LIMIT_EXCEEDED: "INPUT_SIZE_LIMIT_EXCEEDED",
  ELEMENT_DEPTH_LIMIT_EXCEEDED: "ELEMENT_DEPTH_LIMIT_EXCEEDED",
  NODE_COUNT_LIMIT_EXCEEDED: "NODE_COUNT_LIMIT_EXCEEDED",
  NOT_WELL_FORMED_XML: "NOT_WELL_FORMED_XML",
  NOT_A_CLINICAL_DOCUMENT: "NOT_A_CLINICAL_DOCUMENT",
} as const;

/**
 * Discriminant type for `CcdaParseError.code`. Narrowing a caught error by
 * this code lets consumers write exhaustive `switch` blocks (enabled by the
 * `switch-exhaustiveness-check` lint rule) and guarantees a typo-free
 * comparison against the `FATAL_CODES` registry.
 *
 * @example
 * ```ts
 * import type { FatalCode } from "@cosyte/ccda";
 * function describe(code: FatalCode): string {
 *   switch (code) {
 *     case "XXE_OR_DTD_PRESENT":
 *       return "document declared a DTD or external entity";
 *     case "ENTITY_EXPANSION_LIMIT":
 *       return "too many entity expansions";
 *     case "INPUT_SIZE_LIMIT_EXCEEDED":
 *       return "input too large";
 *     case "ELEMENT_DEPTH_LIMIT_EXCEEDED":
 *       return "nesting too deep";
 *     case "NODE_COUNT_LIMIT_EXCEEDED":
 *       return "too many elements";
 *     case "NOT_WELL_FORMED_XML":
 *       return "XML did not parse";
 *     case "NOT_A_CLINICAL_DOCUMENT":
 *       return "root element is not ClinicalDocument";
 *   }
 * }
 * ```
 */
export type FatalCode = (typeof FATAL_CODES)[keyof typeof FATAL_CODES];

/**
 * Thrown by `parseCcda` (and the secure XML substrate it calls) when the
 * input violates one of the seven unrecoverable Tier-3 rules — a declared
 * DTD/external entity, entity-expansion or size/depth/node-count limits,
 * malformed XML, or a well-formed document whose root is not
 * `ClinicalDocument`. Carries a
 * **PHI-free** structural `position`; unlike some sibling parsers it does not
 * retain a raw input snippet, precisely because C-CDA payloads are clinical
 * documents and any snippet would risk leaking PHI.
 *
 * @example
 * ```ts
 * import { parseCcda, CcdaParseError } from "@cosyte/ccda";
 * try {
 *   parseCcda(raw);
 * } catch (err) {
 *   if (err instanceof CcdaParseError && err.code === "NOT_A_CLINICAL_DOCUMENT") {
 *     // err.position, err.code available — no PHI in either
 *   }
 * }
 * ```
 */
export class CcdaParseError extends Error {
  public readonly code: FatalCode;
  public readonly position: CcdaPosition;

  /**
   * Construct a new `CcdaParseError`. All three fields are required so every
   * thrower populates a code, a human-readable (PHI-free) message, and a
   * structural position.
   *
   * @internal
   */
  public constructor(code: FatalCode, message: string, position: CcdaPosition) {
    super(message);
    this.name = "CcdaParseError";
    this.code = code;
    this.position = position;
  }
}
