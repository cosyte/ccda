/**
 * fast-check generators for C-CDA, at `@cosyte/ccda/arbitraries`: spec-clean documents and the
 * structured input that builds them, the clinical entries inside them, messy document text the
 * parser accepts, and hostile input. We use them to test this library, and you can use them to
 * test code you build on it.
 *
 * `fast-check` is an optional peer dependency: install it to use this entry point. The main
 * entry point, `@cosyte/ccda`, never loads it.
 *
 * Every generated value is synthetic and random. Nothing in one looks like a patient's name,
 * date of birth, address or identifier: names and identifiers start with `Z`, and codes are
 * random numbers that name no real concept.
 *
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { parseCcda } from "@cosyte/ccda";
 * import { document } from "@cosyte/ccda/arbitraries";
 *
 * fc.assert(
 *   fc.property(document(), (doc) => parseCcda(doc.toString()).toString() === doc.toString()),
 * );
 * ```
 *
 * @packageDocumentation
 */

export { code, quantity, text, timestamp } from "./values.js";
export type { CodeOptions, QuantityOptions, TextOptions, TimestampOptions } from "./values.js";
export {
  allergy,
  document,
  documentInit,
  encounter,
  immunization,
  medication,
  patient,
  problem,
  procedure,
  resultPanel,
  vitalsPanel,
} from "./document.js";
export type { DocumentOptions } from "./document.js";
export { documentText, hostileInput } from "./text.js";
export type { HostileInputOptions } from "./text.js";
