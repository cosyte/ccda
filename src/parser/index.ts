/**
 * `parseCcda` — the lenient entry point for `@cosyte/ccda`. Pipeline:
 *
 * 1. **Secure XML substrate** (`parseSecureXml`) — BOM strip, size/entity/DTD
 *    rejection, hardened DOM build, depth/node-count caps. All Tier-3 fatals
 *    (`XXE_OR_DTD_PRESENT`, `INPUT_SIZE_LIMIT_EXCEEDED`, … `NOT_WELL_FORMED_XML`)
 *    throw here.
 * 2. **Root gate** — the document element must be `ClinicalDocument` in the HL7
 *    v3 namespace, else `NOT_A_CLINICAL_DOCUMENT`.
 * 3. **Model build** (`buildDocument`) — document-type recognition, header,
 *    section framing. Recoverable deviations become Tier-2 warnings.
 *
 * Lenient by default (Postel's Law): vendor quirks accrue as warnings on the
 * returned {@link CcdaDocument}. `{ strict: true }` escalates every Tier-2
 * warning to a thrown {@link CcdaParseError} so callers get one catch surface.
 */

import { CcdaParseError, FATAL_CODES, type FatalCode } from "./errors.js";
import { V3_NS } from "./namespaces.js";
import { parseSecureXml, resolveLimits } from "./secure-xml.js";
import type { ParseCcdaOptions } from "./types.js";
import type { CcdaWarning } from "./warnings.js";
import { positionOf } from "../model/dom.js";
import { buildDocument, CcdaDocument } from "../model/document.js";
import { wrapEmitterWithProfile } from "../profiles/apply.js";
import { getDefaultCcdaProfile } from "../profiles/registry.js";
import type { CcdaProfile } from "../profiles/types.js";
import { serializeDocument } from "../serialize/serialize-dom.js";

/**
 * Parse a C-CDA XML payload into an immutable {@link CcdaDocument}.
 *
 * **Lenient by default** — real-world, vendor-quirky documents parse rather
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
 * @throws {@link CcdaParseError} on any Tier-3 fatal, or — when `options.strict`
 *   is `true` — on the first Tier-2 deviation.
 * @example
 * ```ts
 * import { parseCcda } from "@cosyte/ccda";
 * const doc = parseCcda(xml);
 * console.log(doc.documentType, doc.getPatient()?.name?.text);
 * for (const w of doc.warnings) console.warn(w.code, w.position);
 * ```
 */
export function parseCcda(raw: string, options: ParseCcdaOptions = {}): CcdaDocument {
  const limits = resolveLimits(options.limits);
  const warnings: CcdaWarning[] = [];
  const profile = resolveProfile(options);
  // The profile transform runs FIRST (it may re-badge a warning as an expected
  // PROFILE_QUIRK_APPLIED), then the base emitter records / escalates it. An
  // `expected` warning never escalates in strict mode — see makeEmitter.
  const emit = wrapEmitterWithProfile(makeEmitter(warnings, options), profile);

  const doc = parseSecureXml(raw, limits, emit);

  const root = doc.documentElement;
  if (root === null) {
    throw new CcdaParseError(
      FATAL_CODES.NOT_WELL_FORMED_XML,
      "Input produced no document element.",
      {},
    );
  }
  if (root.namespaceURI !== V3_NS || root.localName !== "ClinicalDocument") {
    throw new CcdaParseError(
      FATAL_CODES.NOT_A_CLINICAL_DOCUMENT,
      `Root element is <${root.localName ?? "?"}>, not a ClinicalDocument in the HL7 v3 namespace.`,
      positionOf(root),
    );
  }

  // The parse context threads the warning sink and — when the consumer supplied
  // one — the bring-your-own terminology adapter down to the code-system layer.
  // Under `exactOptionalPropertyTypes`, omit the key rather than pass `undefined`.
  const ctx =
    options.terminology !== undefined ? { emit, terminology: options.terminology } : { emit };
  const parts = buildDocument(root, ctx);
  const serialized = serializeDocument(doc);
  const init = { ...parts, warnings, serialized };
  if (profile !== undefined) {
    return new CcdaDocument({
      ...init,
      profile: { name: profile.name, lineage: profile.lineage },
    });
  }
  return new CcdaDocument(init);
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
 * `warnings` and forwarded to `options.onWarning` (in discovery order, before
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
    // An `expected` warning is one a profile deliberately tolerated — it must
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
    // defeat lenient parsing — swallow it (mirrors the sibling `@cosyte/hl7`
    // D-22 contract). The warning is already recorded on `warnings`.
    if (options.onWarning !== undefined) {
      try {
        options.onWarning(warning);
      } catch {
        /* handler errors are contained */
      }
    }
  };
}
