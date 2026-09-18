/**
 * Stable failure codes for the conformance harness, and the error type that carries them.
 *
 * Every way this harness can fail has a code a caller can switch on, a context line naming
 * what failed, and a remedy line naming what to do about it (`observability` B2). The codes
 * are the harness's published surface for CI and for `test/conformance/fail-safe.test.ts`,
 * which asserts the exact code rather than a non-zero exit: a crash also produces a non-zero
 * exit, so `not.toBe(0)` would accept the one outcome this gate exists to distinguish.
 *
 * NOTHING HERE INTERPOLATES A VALUE READ OUT OF A DOCUMENT UNDER VALIDATION. The context a
 * failure carries is an artifact name, a URL, a digest, a path inside an archive, or a count.
 * That bound is the same one `src/parser/warnings.ts` holds the library's own diagnostics to,
 * and it is why AC-6 can be graded by searching the whole output stream for a marker token.
 */

/** The failure modes `pnpm conformance` can exit on. A published code never changes meaning. */
export const CONFORMANCE_CODES = {
  /** A pinned artifact could not be fetched at all (no network, DNS, HTTP status, timeout). */
  ARTIFACT_UNREACHABLE: "CONFORMANCE_ARTIFACT_UNREACHABLE",
  /** A fetched artifact's bytes do not hash to the digest this repository pins it to. */
  ARTIFACT_DIGEST_MISMATCH: "CONFORMANCE_ARTIFACT_DIGEST_MISMATCH",
  /** The corpus archive does not carry a path the pin names, or unpacked to nothing readable. */
  ARTIFACT_MISSING_PATH: "CONFORMANCE_ARTIFACT_MISSING_PATH",
  /** XML schema validation was asked to run against an empty schema set. */
  SCHEMA_SET_EMPTY: "CONFORMANCE_SCHEMA_SET_EMPTY",
  /** The corpus archive unpacked cleanly and contained zero documents. */
  CORPUS_EMPTY: "CONFORMANCE_CORPUS_EMPTY",
  /** The run finished having validated zero built documents. */
  NO_DOCUMENTS_VALIDATED: "CONFORMANCE_NO_DOCUMENTS_VALIDATED",
  /** A rule context or assertion in the Schematron could not be compiled by the XPath engine. */
  SCHEMATRON_UNCOMPILABLE: "CONFORMANCE_SCHEMATRON_UNCOMPILABLE",
  /** At least one error-severity result was raised against a document `buildCcda` emitted. */
  ERRORS_FOUND: "CONFORMANCE_ERRORS_FOUND",
  /** At least one corpus document's error set changed across parse plus re-serialize. */
  ROUND_TRIP_DIVERGED: "CONFORMANCE_ROUND_TRIP_DIVERGED",
  /** The tracked report's committed bytes differ from what this run produced. */
  REPORT_STALE: "CONFORMANCE_REPORT_STALE",
} as const;

/** One of the stable failure codes above. */
export type ConformanceCode = (typeof CONFORMANCE_CODES)[keyof typeof CONFORMANCE_CODES];

/**
 * A harness failure carrying its stable code, the context that produced it, and the action
 * available to whoever reads it. Constructed from three separate strings rather than one
 * pre-formatted message so a test can assert the code and the remedy independently of wording.
 */
export class ConformanceError extends Error {
  /** The stable code a caller switches on. */
  readonly code: ConformanceCode;

  /** What failed, in structural terms: an artifact name, a path, a count. Never a document value. */
  readonly context: string;

  /** What to do about it. */
  readonly remedy: string;

  /**
   * @param code - The stable failure code.
   * @param context - What failed, in structural terms.
   * @param remedy - The action available to the reader.
   */
  constructor(code: ConformanceCode, context: string, remedy: string) {
    super(`${code}: ${context}\n  ${remedy}`);
    this.name = "ConformanceError";
    this.code = code;
    this.context = context;
    this.remedy = remedy;
  }
}
