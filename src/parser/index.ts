/**
 * `parseCcda`, the lenient entry point for `@cosyte/ccda`. Pipeline:
 *
 * 1. **Secure XML substrate** (`parseSecureXml`), BOM strip, size/entity/DTD
 *    rejection, hardened DOM build, depth/node-count caps. All Tier-3 fatals
 *    (`XXE_OR_DTD_PRESENT`, `INPUT_SIZE_LIMIT_EXCEEDED`, … `NOT_WELL_FORMED_XML`)
 *    throw here.
 * 2. **Root gate**, the document element must be `ClinicalDocument` in the HL7
 *    v3 namespace, else `NOT_A_CLINICAL_DOCUMENT`.
 * 3. **Model build** (`buildDocument`), document-type recognition, header,
 *    section framing. Recoverable deviations become Tier-2 warnings.
 *
 * Lenient by default (Postel's Law): vendor quirks accrue as warnings on the
 * returned {@link CcdaDocument}. `{ strict: true }` escalates every Tier-2
 * warning to a thrown {@link CcdaParseError} so callers get one catch surface.
 */

import { CcdaParseError, FATAL_CODES, FATAL_MESSAGES, type FatalCode } from "./errors.js";
import { V3_NS } from "./namespaces.js";
import {
  DEFAULT_LIMITS,
  parseSecureSource,
  rebuildDom,
  resolveLimits,
  type ResolvedLimits,
  type SecureSource,
} from "./secure-xml.js";
import type { ParseCcdaOptions } from "./types.js";
import type { CcdaWarning } from "./warnings.js";
import { positionOf } from "../model/dom.js";
import {
  buildDocument,
  type CcdaDocument,
  documentWithText,
  documentWithXml,
} from "../model/document.js";
import { wrapEmitterWithProfile } from "../profiles/apply.js";
import { getDefaultCcdaProfile } from "../profiles/registry.js";
import type { CcdaProfile } from "../profiles/types.js";
import { serializeDocument } from "../serialize/serialize-dom.js";
import { writeSource, writtenText } from "../serialize/write-tree.js";

/**
 * Parse a C-CDA XML payload into an immutable {@link CcdaDocument}.
 *
 * **Lenient by default**, real-world, vendor-quirky documents parse rather
 * than throw, accruing {@link CcdaWarning}s on `doc.warnings`. Only
 * unrecoverable structural problems throw a {@link CcdaParseError} (a Tier-3
 * {@link FatalCode}): a declared DTD/external entity, a size/entity/depth limit
 * breach, malformed XML, or a root that is not `ClinicalDocument`. With
 * `{ strict: true }`, every Tier-2 deviation is escalated to a thrown
 * `CcdaParseError` instead of a warning.
 *
 * @param raw - The raw C-CDA XML document text.
 * @param options - Parse options; see {@link ParseCcdaOptions}. Lenient unless `strict` is set.
 * @returns The parsed document plus any recovered Tier-2 warnings.
 * @throws {@link CcdaParseError} on any Tier-3 fatal, or, when `options.strict`
 *   is `true`, on the first Tier-2 deviation.
 * @example
 * ```ts
 * import { parseCcda } from "@cosyte/ccda";
 * const doc = parseCcda(xml);
 * console.log(doc.documentType, doc.getPatient()?.name?.family);
 * for (const w of doc.warnings) console.warn(w.code, w.position);
 * ```
 */
export function parseCcda(raw: string, options: ParseCcdaOptions = {}): CcdaDocument {
  return parseCcdaText(raw, options, false);
}

/**
 * {@link parseCcda}, with the choice of when the document's XML is written.
 *
 * - `writeNow: false`, what `parseCcda` passes: the XML is written the first time `toString` (or
 *   `serializeCcda`, or an edit) asks for it, from a DOM built again from the source text the
 *   parse keeps. A caller that reads only the model never pays for it, and the tree is not kept
 *   for the document's life (it is many times the size of the text).
 * - `writeNow: true`, what `buildCcda` and `editCcda` pass: the XML is written during the parse.
 *   Both re-parse XML they have just written, and their callers nearly always ask for it back.
 *   When the parse built an `@xmldom/xmldom` DOM (a text the compact reader hands back) it is
 *   written from that DOM; when the parse read the compact tree, which the writer cannot write,
 *   the DOM is built from the text without the locator and written at once.
 *
 * The text is the same either way: the same source read by the same parser gives the same tree.
 *
 * @internal
 */
export function parseCcdaText(
  raw: string,
  options: ParseCcdaOptions,
  writeNow: boolean,
): CcdaDocument {
  const limits = resolveLimits(options.limits);
  const warnings: CcdaWarning[] = [];
  const profile = resolveProfile(options);
  // The profile transform runs FIRST (it may re-badge a warning as an expected
  // PROFILE_QUIRK_APPLIED), then the base emitter records / escalates it. An
  // `expected` warning never escalates in strict mode, see makeEmitter.
  const emit = wrapEmitterWithProfile(makeEmitter(warnings, options), profile);

  // `UNKNOWN_NAMESPACE_PREFIX` is collected during the secure-XML walk and
  // replayed at the end of this function rather than emitted where it is found.
  // The walk runs before the root gate and before any clinical parsing, and in
  // strict mode the emitter escalates the FIRST warning it is handed, so
  // emitting in place let a foreign vendor block preempt both
  // `NOT_A_CLINICAL_DOCUMENT` on a document that is not a C-CDA and a
  // safety-critical per-element code on one that is. A namespace deviation is a
  // statement about the whole document; it must never take a fatal's or a
  // safety-critical code's place. The cost is that in lenient mode these land
  // last on `doc.warnings` rather than in discovery order.
  const foreignNamespaces: CcdaWarning[] = [];
  const accepted = parseSecureSource(raw, limits, emit, (warning) =>
    foreignNamespaces.push(warning),
  );

  const root = accepted.root;
  if (root === null) {
    throw new CcdaParseError(
      FATAL_CODES.NOT_WELL_FORMED_XML,
      FATAL_MESSAGES.NOT_WELL_FORMED_XML,
      {},
    );
  }
  if (root.namespaceURI !== V3_NS || root.localName !== "ClinicalDocument") {
    throw new CcdaParseError(
      FATAL_CODES.NOT_A_CLINICAL_DOCUMENT,
      FATAL_MESSAGES.NOT_A_CLINICAL_DOCUMENT,
      positionOf(root),
    );
  }

  // The parse context threads the warning sink and, when the consumer supplied
  // them, the two bring-your-own contracts down to the code-system layer: the
  // terminology adapter (is this code real in its SYSTEM) and the value-set
  // source (is it in the VALUE SET its slot's binding names). They are
  // independent, so each key is added on its own and a parse supplying neither
  // is byte-for-byte the parse this library has always produced.
  // Under `exactOptionalPropertyTypes`, omit a key rather than pass `undefined`.
  const ctx = {
    emit,
    ...(options.terminology !== undefined ? { terminology: options.terminology } : {}),
    ...(options.valueSets !== undefined ? { valueSets: options.valueSets } : {}),
  };
  const parts = buildDocument(root, ctx);
  for (const warning of foreignNamespaces) emit(warning);
  const init =
    profile === undefined
      ? { ...parts, warnings }
      : { ...parts, warnings, profile: { name: profile.name, lineage: profile.lineage } };
  const written = isWrittenWithin(accepted, limits);
  if (writeNow) {
    // From the `@xmldom/xmldom` tree when the parse built one, else as `writerFor` writes it.
    const serialized =
      accepted.dom === undefined ? writerFor(accepted)() : serializeDocument(accepted.dom);
    return documentWithXml(init, serialized, written);
  }
  return documentWithText(init, writerFor(accepted), written);
}

/**
 * Whether the XML the document writes is known, from this parse, to be written as the writer
 * writes it and to pass the default limits, so `editCcda` can edit it without reading it whole
 * again: the text was found written with no line ending rewritten (so the XML is that text), and
 * passed limits no looser than the defaults on its depth and node count. The XML has the same
 * elements as the text; its size and references the edit checks again, as the defaults say.
 *
 * @internal
 */
function isWrittenWithin(accepted: SecureSource, limits: ResolvedLimits): boolean {
  return (
    accepted.writtenEnd !== -1 &&
    !accepted.lineBreaksToNormalize &&
    limits.maxDepth <= DEFAULT_LIMITS.maxDepth &&
    limits.maxNodeCount <= DEFAULT_LIMITS.maxNodeCount
  );
}

/**
 * The function that writes a parsed document's XML on first use: it builds the DOM of the source
 * again and serializes it. A function of its own, so what it closes over is the source text and
 * the gate's finding, never the tree or anything else the parse held.
 *
 * @internal
 */
function writerFor(accepted: SecureSource): () => string {
  const source = accepted.source;
  const lineBreaksToNormalize = accepted.lineBreaksToNormalize;
  // A text the reader found already written as the writer writes it is its own XML. The end it
  // found is in the text it read, which is this one only when no line ending was rewritten.
  const writtenEnd = lineBreaksToNormalize ? -1 : accepted.writtenEnd;
  if (writtenEnd !== -1) return () => writtenText(source, writtenEnd);
  return () => writeText({ source, lineBreaksToNormalize });
}

/**
 * The XML of an accepted text: written from the compact reader's tree when it reads the text and
 * the tree holds nothing written another way (`../serialize/write-tree.ts`), else from the
 * `@xmldom/xmldom` DOM built again. The two write the same XML for the same text.
 *
 * @internal
 */
function writeText(accepted: Pick<SecureSource, "source" | "lineBreaksToNormalize">): string {
  return (
    writeSource(accepted.source, accepted.lineBreaksToNormalize) ??
    serializeDocument(rebuildDom(accepted))
  );
}

/**
 * Resolve the effective profile for a parse. An explicit `options.profile` wins:
 * a {@link CcdaProfile} is used as-is; `null` opts out of the process-scoped
 * default for this call. When `profile` is omitted, the process-scoped default
 * ({@link setDefaultCcdaProfile}) applies, or `undefined` when none is set.
 *
 * @internal
 */
function resolveProfile(options: ParseCcdaOptions): CcdaProfile | undefined {
  if (options.profile === null) return undefined;
  if (options.profile !== undefined) return options.profile;
  return getDefaultCcdaProfile();
}

/**
 * Build the warning sink. In lenient mode each warning is appended to
 * `warnings` and forwarded to `options.onWarning` (in emission order, before
 * the append is observable to later code). In strict mode the warning is
 * escalated to a thrown {@link CcdaParseError}, reusing the Tier-3 error shape
 * so consumers have a single catch surface.
 *
 * @internal
 */
function makeEmitter(
  warnings: CcdaWarning[],
  options: ParseCcdaOptions,
): (warning: CcdaWarning) => void {
  return (warning) => {
    // An `expected` warning is one a profile deliberately tolerated, it must
    // NOT escalate in strict mode (the whole point of the profile is that this
    // deviation is known/benign). It is still recorded below so nothing is lost.
    if (options.strict === true && warning.expected !== true) {
      // Strict mode escalates a Tier-2 warning into a thrown CcdaParseError so
      // callers have one catch surface. `code` is typed `FatalCode` at compile
      // time (the six Tier-3 codes) to keep exhaustive-switch checks honest for
      // lenient callers; at runtime under strict mode it also carries the
      // WarningCode. The double assertion is the minimum-surface way to reuse
      // the error shape without widening FatalCode into the lenient type surface.
      throw new CcdaParseError(
        warning.code as unknown as FatalCode,
        warning.message,
        warning.position,
      );
    }
    warnings.push(warning);
    // A throw in the caller's handler must not bubble out of the parser and
    // defeat lenient parsing, swallow it (the same contract the sibling
    // `@cosyte/hl7` keeps for its warning handler). The warning is already
    // recorded on `warnings`.
    if (options.onWarning !== undefined) {
      try {
        options.onWarning(warning);
      } catch {
        /* handler errors are contained */
      }
    }
  };
}
