/**
 * Hardened XML substrate for `@cosyte/ccda`. This is the single place the
 * package builds a tree from untrusted input, and it owns the security
 * posture. A parse builds the compact tree of `./xml-tree.ts` when that reader
 * vouches for the text and an `@xmldom/xmldom` DOM otherwise; every check below
 * runs around both the same way:
 *
 * - **No DTD / DOCTYPE.** Any `<!DOCTYPE` or `<!ENTITY` declaration is rejected
 *   outright (`XXE_OR_DTD_PRESENT`) before the DOM is built, this is the
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
 *   nonXMLBody) is never decoded here, it survives as inert text in the DOM.
 *
 * A UTF-8 BOM is stripped (emitting `ENCODING_BOM_STRIPPED`). Malformed XML
 * surfaces as `NOT_WELL_FORMED_XML`. Everything here is pure and synchronous.
 *
 * It also owns the **foreign-namespace sweep** that raises
 * `UNKNOWN_NAMESPACE_PREFIX`, which is a placement decision rather than an
 * accident. The model layer's child lookups (`../model/dom.ts`) are scoped to
 * `urn:hl7-org:v3`, so an element outside the recognized set is invisible to
 * every stage above this one: there is no navigation step that could notice it.
 * The depth / node-count walk here is the package's only exhaustive traversal,
 * so the sweep rides on it and costs no second pass.
 */

import type { Document, Element } from "@xmldom/xmldom";

import { positionOf } from "../model/dom.js";
import { CcdaParseError, FATAL_CODES, FATAL_MESSAGES } from "./errors.js";
import { isRecognizedNamespace } from "./namespaces.js";
import { refuseTreeDifference } from "./built-tree.js";
import { refuseOutsideRootNodes, refuseOutsideRootText } from "./outside-root.js";
import { isXmlChar } from "./xml-chars.js";
import type { CcdaParseLimits } from "./types.js";
import { encodingBomStripped, unknownNamespacePrefix, type CcdaWarning } from "./warnings.js";
import { domOfTree } from "./tree-dom.js";
import { readDocument, type TreeDocument, type TreeShape } from "./xml-tree.js";
import { xmldom } from "./xmldom.js";

/** Fully-resolved safety caps, every field present (defaults merged in), as `resolveLimits` returns them. */
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

/** A UTF-8 byte order mark, as the first UTF-16 code unit of a decoded text. @internal */
const BYTE_ORDER_MARK = 0xfeff;

/** The five XML predefined entities, always legal, never counted toward the expansion cap. @internal */
const PREDEFINED_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);

/**
 * The one scan of the input text before the DOM is built. Each match is one of three things, told
 * apart by its first character:
 *
 * - `<`: a declared DTD or entity (`<!DOCTYPE`, `<!ENTITY`), the XXE / external-entity attack
 *   surface;
 * - `&`: an entity reference `&name;` (predefined ones are told apart after the match), or, when
 *   `#` follows the `&`, a character reference `&#...;`, whose code point is checked;
 * - a carriage return, NEL, LINE SEPARATOR or PARAGRAPH SEPARATOR: a character XML's end-of-line
 *   handling rewrites;
 * - anything else: a character XML 1.0 forbids (`./xml-chars.ts`): a C0 control other than tab,
 *   line feed and carriage return, an unpaired surrogate (the `u` flag reads a pair as one
 *   character, so only an unpaired one matches the surrogate range), U+FFFE or U+FFFF.
 *
 * The DTD alternatives and the entity half of the `&` alternative are the two patterns this module
 * ran as separate passes before (`/<!DOCTYPE|<!ENTITY/iu`, then `/&[a-z_][\w.-]*;/giu` over the
 * whole text), with the same flags, so they match exactly what those matched: no DTD match can
 * overlap an entity reference (one holds no `&`, the other no `<`), and a character reference
 * (`&#`) cannot overlap one either, so the references found are the same ones in the same order.
 * One global scan of a string with few matches is several times cheaper than the two passes. The
 * last alternative, one character class, lets the parse skip the end-of-line rewrite when there is
 * nothing for it to rewrite, and finds in the same scan a character no XML parser may accept,
 * which `@xmldom/xmldom` and the compact reader would otherwise read into the document without a
 * word; so does the character reference half of the `&` alternative.
 *
 * @internal
 */
const GATE_RE =
  /<!DOCTYPE|<!ENTITY|&(?:[a-z_][\w.-]*|#x?[0-9a-f]+);|[\0-\x08\x0B-\x1F\u0085\u2028\u2029\uD800-\uDFFF\uFFFE\uFFFF]/giu;

/** `<`, the first character of a {@link GATE_RE} match on a DTD or entity declaration. @internal */
const LESS_THAN = 0x3c;

/** `&`, the first character of a {@link GATE_RE} match on an entity reference. @internal */
const AMPERSAND = 0x26;

/** `#`, the second character of a {@link GATE_RE} match on a character reference. @internal */
const HASH = 0x23;

/** `x`, the third character of a {@link GATE_RE} match on a hexadecimal character reference. @internal */
const LOWER_X = 0x78;

/** `X`: `&#X...;` is not a character reference in XML, so the gate leaves it to the parser. @internal */
const UPPER_X = 0x58;

/** A carriage return, the first character end-of-line handling rewrites. @internal */
const CARRIAGE_RETURN = 0x0d;

/** NEL, rewritten by end-of-line handling. @internal */
const NEXT_LINE = 0x85;

/** LINE SEPARATOR, rewritten by end-of-line handling. @internal */
const LINE_SEPARATOR = 0x2028;

/** PARAGRAPH SEPARATOR, rewritten by end-of-line handling. @internal */
const PARAGRAPH_SEPARATOR = 0x2029;

/** A carriage return followed by a line feed or NEL: one line break. @internal */
const LINE_BREAK_PAIR_RE = /\r[\n\u0085]/g;

/** Any other character the end-of-line handling turns into a line feed. @internal */
const LINE_BREAK_RE = /[\r\u0085\u2028\u2029]/g;

/**
 * Merge caller-supplied limit overrides over {@link DEFAULT_LIMITS}. Honors
 * `exactOptionalPropertyTypes`, an omitted override key falls back to the
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
 * any safety violation or malformed XML, never returns a partially-built
 * document.
 *
 * `UNKNOWN_NAMESPACE_PREFIX` goes to `reportForeignNamespace` rather than to
 * `emit`, and that separation is load-bearing rather than tidy. This function
 * runs before `parseCcda`'s root gate and before any clinical parsing, and in
 * strict mode the emitter escalates the **first** warning it is handed. Routing
 * a whole-document observation through `emit` here would therefore let it
 * preempt `NOT_A_CLINICAL_DOCUMENT` on a document that is not a C-CDA at all,
 * and preempt a safety-critical per-element code such as `MISSING_CODE_SYSTEM`
 * on one that is. `parseCcda` passes a collector and replays it **after** the
 * model is built, so those keep their precedence. The parameter defaults to
 * `emit` for a caller using this function on its own, where there is no later
 * stage to defer to.
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
  reportForeignNamespace: (warning: CcdaWarning) => void = emit,
): Document {
  return readSecureXml(raw, limits, emit, reportForeignNamespace, false);
}

/**
 * {@link parseSecureXml}, with more refusals when `refuseOutsideRoot` is set: anything outside
 * the root element but white space, comments and processing instructions throws
 * `NOT_WELL_FORMED_XML`, as XML 1.0 productions [1], [22] and [27] make such a text not
 * well-formed, and so does a start tag XML 1.0 makes not well-formed. `@xmldom/xmldom` drops some
 * of that content, keeps some as a node under the document, and reports some of it only as a
 * warning or an error, which `parseSecureXml` (and so `parseCcda`) tolerates. The exported
 * `parseXml` sets the flag, so a sender's content is never lost without a word. Four guards hold
 * it, none trusting the others: a scan of the text before the tree is built
 * ({@link refuseOutsideRootText}), which reads start tags as XML does, and refuses an `&` that
 * starts no reference and `]]>` in text; xmldom's reports while it builds, every one fatal but the
 * two a well-formed text can draw ({@link isToleratedReport}); a check of the document's own nodes
 * after ({@link refuseOutsideRootNodes}); and a check of the whole tree against what the scan
 * counted, with the namespace rules xmldom does not keep ({@link refuseTreeDifference}).
 *
 * @internal
 */
export function readSecureXml(
  raw: string,
  limits: ResolvedLimits,
  emit: (warning: CcdaWarning) => void,
  reportForeignNamespace: (warning: CcdaWarning) => void,
  refuseOutsideRoot: boolean,
): Document {
  const accepted = acceptSource(raw, limits, emit);
  const scanned = refuseOutsideRoot ? refuseOutsideRootText(accepted.source) : undefined;
  const doc = buildDom(accepted.source, accepted.lineBreaksToNormalize, true, refuseOutsideRoot);
  // A guard that trusts neither the scan nor xmldom's reports: a CDATA section after the root is
  // one text xmldom reports nothing for and keeps under the document (test/xml-guards.test.ts).
  if (refuseOutsideRoot) refuseOutsideRootNodes(doc);
  enforceStructureLimits(doc.documentElement, limits, reportForeignNamespace);
  // The tree must hold what the scan read: xmldom drops an attribute named twice through two
  // prefixes with no report, so its tree is checked against the scan's counts.
  if (scanned !== undefined) refuseTreeDifference(doc, scanned);
  return doc;
}

/**
 * {@link parseSecureXml} for `editCcda`, which edits the document it returns: the same gate,
 * limits, fatals and document, with the document built from the compact reader's tree
 * (`./tree-dom.ts`) when the reader reads the text, rather than by `@xmldom/xmldom`'s parser.
 * Foreign namespaces go to `emit`, and only when no limit is exceeded (see
 * {@link enforceShapeLimits}).
 *
 * @internal
 */
export function parseSecureDom(
  raw: string,
  limits: ResolvedLimits,
  emit: (warning: CcdaWarning) => void,
): Document {
  const read = parseSecureEditable(raw, limits, emit);
  return read.dom === undefined ? domOfTree(read.tree) : read.dom;
}

/**
 * What {@link parseSecureEditable} read: the compact tree and the text it was read from, when that
 * text is already written as the writer writes it, else the `@xmldom/xmldom` document
 * {@link parseSecureDom} returns.
 *
 * @internal
 */
export type SecureEditable =
  | { readonly dom: undefined; readonly tree: TreeDocument; readonly text: string }
  | { readonly dom: Document; readonly tree: undefined; readonly text: undefined };

/**
 * {@link parseSecureDom}, for an edit that can be made on the text: the same gate, limits, fatals
 * and warnings, and for a text the compact reader finds already written in the writer's form
 * (`TreeDocument.writtenEnd`), its tree and the text (line endings normalized) instead of a DOM.
 *
 * @internal
 */
export function parseSecureEditable(
  raw: string,
  limits: ResolvedLimits,
  emit: (warning: CcdaWarning) => void,
): SecureEditable {
  const { source, lineBreaksToNormalize } = acceptSource(raw, limits, emit);
  const text = lineBreaksToNormalize ? normalizeLineEndings(source) : source;
  const tree = readDocument(text);
  if (tree === undefined) {
    const doc = buildDom(source, lineBreaksToNormalize);
    enforceStructureLimits(doc.documentElement, limits, emit);
    return { dom: doc, tree: undefined, text: undefined };
  }
  enforceShapeLimits(tree.shape, limits, emit);
  if (tree.writtenEnd === -1) return { dom: domOfTree(tree), tree: undefined, text: undefined };
  return { dom: undefined, tree, text };
}

/**
 * The text a tree was built from, and what the gate found in it: what {@link parseSecureSource}
 * returns beside the tree, so a caller can build the same tree again later instead of keeping it.
 *
 * @internal
 */
export interface SecureSource {
  /**
   * The root element, checked against every limit: an element of the compact tree
   * `./xml-tree.ts` reads, or of an `@xmldom/xmldom` document for a text that reader hands back.
   * The model reads the two alike.
   */
  readonly root: Element | null;
  /** The `@xmldom/xmldom` document the root belongs to, when it was built with `@xmldom/xmldom`. */
  readonly dom: Document | undefined;
  /** The text it was built from: the input with a leading byte order mark removed. */
  readonly source: string;
  /** Whether the text holds a character XML's end-of-line handling rewrites. */
  readonly lineBreaksToNormalize: boolean;
  /**
   * Where the written document ends in the text the compact reader read, when that text is already
   * written as the writer writes it (`TreeDocument.writtenEnd`); else -1, as for a text read with
   * `@xmldom/xmldom`.
   */
  readonly writtenEnd: number;
}

/**
 * {@link parseSecureXml} for `parseCcda`: the same gate, limits and namespace sweep, around the
 * compact tree of `./xml-tree.ts` rather than an `@xmldom/xmldom` document wherever that reader
 * vouches for the text (`@xmldom/xmldom` reads the rest, as it always did). Returns the cleaned
 * text and what its gate scan found beside the root, so `parseCcda` can keep the text and write the
 * document's XML when a caller asks for it, from a tree {@link rebuildDom} builds then, rather than
 * keeping a tree for the document's life.
 *
 * @internal
 */
export function parseSecureSource(
  raw: string,
  limits: ResolvedLimits,
  emit: (warning: CcdaWarning) => void,
  reportForeignNamespace: (warning: CcdaWarning) => void,
): SecureSource {
  const accepted = acceptSource(raw, limits, emit);
  const { source, lineBreaksToNormalize } = accepted;
  const tree = readDocument(lineBreaksToNormalize ? normalizeLineEndings(source) : source);
  if (tree !== undefined) {
    enforceShapeLimits(tree.shape, limits, reportForeignNamespace);
    // The model reads the members the two trees share; it is typed against the larger one.
    return {
      root: tree.root as unknown as Element,
      dom: undefined,
      source,
      lineBreaksToNormalize,
      writtenEnd: tree.writtenEnd,
    };
  }
  const dom = buildDom(source, lineBreaksToNormalize);
  enforceStructureLimits(dom.documentElement, limits, reportForeignNamespace);
  return { root: dom.documentElement, dom, source, lineBreaksToNormalize, writtenEnd: -1 };
}

/**
 * XML's end-of-line handling as `@xmldom/xmldom` applies it before it parses (its
 * `normalizeLineEndings`, transcribed): a carriage return followed by a line feed or NEL, then any
 * carriage return, NEL, LINE SEPARATOR or PARAGRAPH SEPARATOR left, becomes one line feed.
 *
 * @internal
 */
export function normalizeLineEndings(source: string): string {
  return source.replace(LINE_BREAK_PAIR_RE, "\n").replace(LINE_BREAK_RE, "\n");
}

/**
 * Strip a leading byte order mark (emitting `ENCODING_BOM_STRIPPED`), refuse an input over the
 * size cap, and run the gate scan. Returns the text a tree is built from and what the scan found.
 * `editCcda` runs it alone on a text it already knows is written and within the other limits.
 *
 * @internal
 */
export function acceptSource(
  raw: string,
  limits: ResolvedLimits,
  emit: (warning: CcdaWarning) => void,
): Pick<SecureSource, "source" | "lineBreaksToNormalize"> {
  let source = raw;
  if (source.charCodeAt(0) === BYTE_ORDER_MARK) {
    source = source.slice(1);
    emit(encodingBomStripped({}));
  }

  const byteLength = Buffer.byteLength(source, "utf8");
  if (byteLength > limits.maxInputBytes) {
    throw new CcdaParseError(
      FATAL_CODES.INPUT_SIZE_LIMIT_EXCEEDED,
      FATAL_MESSAGES.INPUT_SIZE_LIMIT_EXCEEDED,
      {},
    );
  }

  const lineBreaksToNormalize = gateScan(source, limits);
  return { source, lineBreaksToNormalize };
}

/**
 * Build the DOM of a text {@link parseSecureSource} accepted, again, for writing it out. The same
 * parser reads the same text to the same tree, so the limits, the gate and the namespace sweep
 * that passed on it the first time are not repeated. Its elements carry no line or column: this
 * tree is serialized, never read for a position.
 *
 * @internal
 */
export function rebuildDom(
  accepted: Pick<SecureSource, "source" | "lineBreaksToNormalize">,
): Document {
  // Without the locator: a line and column are read only by a warning or an error, and the parse
  // that raised those has run. xmldom's tracking of them is most of what a parse of a long text
  // node costs, and nothing else in the tree depends on it.
  return buildDom(accepted.source, accepted.lineBreaksToNormalize, false);
}

/**
 * The gate, in one scan of the text ({@link GATE_RE}): throw `XXE_OR_DTD_PRESENT` for a declared
 * DTD or entity anywhere, else `ENTITY_EXPANSION_LIMIT` when the custom entity references exceed
 * the cap, else `NOT_WELL_FORMED_XML` when the text holds a character XML 1.0 forbids, written
 * raw or as a character reference; return whether the text holds a character the end-of-line
 * handling rewrites.
 *
 * Such a character is refused rather than read with a warning: XML 1.0 makes it a well-formedness
 * error (section 2.2, and the Legal Character constraint of section 4.1), so the text is not XML,
 * every conforming parser rejects it, and a document read from it would carry the character into
 * any XML written back out. The fatal names no character and no place, like every other
 * `NOT_WELL_FORMED_XML`. A forbidden character written raw is refused wherever it sits, comments,
 * CDATA sections and processing instructions included, since none of them may hold one. A
 * character reference is refused only where XML expands it, in text content and attribute values:
 * inside a comment, a CDATA section or a processing instruction `&#1;` is plain text, not a
 * reference (XML 1.0 productions [15], [16] and [20], and section 4.4), and the document is
 * well-formed ({@link anyExpanded}).
 *
 * A declared DTD outranks the entity cap wherever it sits, as it did when the two were separate
 * passes with the DTD check first: a count over the cap does not throw until the scan has
 * finished without finding one. Predefined (`&amp;` and the rest) and numeric (`&#...;`)
 * references are never counted. With DTDs rejected these references could only be undefined
 * anyway; the cap is billion-laughs defense-in-depth.
 *
 * @internal
 */
function gateScan(source: string, limits: ResolvedLimits): boolean {
  let count = 0;
  let over = false;
  let lineBreaks = false;
  let forbidden = false;
  // Where each character reference naming a forbidden code point starts, in text order: one in a
  // comment, a CDATA section or a processing instruction is not a reference, so whether it makes the
  // text ill-formed is decided after the scan, and only when there is one.
  let forbiddenReferences: number[] | undefined;
  GATE_RE.lastIndex = 0;
  for (let match = GATE_RE.exec(source); match !== null; match = GATE_RE.exec(source)) {
    const token = match[0];
    const first = token.charCodeAt(0);
    if (first === LESS_THAN) {
      GATE_RE.lastIndex = 0;
      throw new CcdaParseError(
        FATAL_CODES.XXE_OR_DTD_PRESENT,
        FATAL_MESSAGES.XXE_OR_DTD_PRESENT,
        {},
      );
    }
    if (first !== AMPERSAND) {
      if (
        first === CARRIAGE_RETURN ||
        first === NEXT_LINE ||
        first === LINE_SEPARATOR ||
        first === PARAGRAPH_SEPARATOR
      ) {
        lineBreaks = true;
      } else {
        forbidden = true;
      }
    } else if (token.charCodeAt(1) === HASH) {
      if (!forbidden && namesForbiddenCharacter(token)) {
        (forbiddenReferences ??= []).push(match.index);
      }
    } else if (!over && !PREDEFINED_ENTITIES.has(token.slice(1, -1).toLowerCase())) {
      // Compared at each custom reference, as the separate pass did, so a cap a caller set below
      // zero is exceeded by the first custom reference and never by a text with none.
      count += 1;
      over = count > limits.maxEntityExpansions;
    }
  }
  if (over) {
    throw new CcdaParseError(
      FATAL_CODES.ENTITY_EXPANSION_LIMIT,
      FATAL_MESSAGES.ENTITY_EXPANSION_LIMIT,
      {},
    );
  }
  if (
    forbidden ||
    (forbiddenReferences !== undefined && anyExpanded(source, forbiddenReferences))
  ) {
    throw new CcdaParseError(
      FATAL_CODES.NOT_WELL_FORMED_XML,
      FATAL_MESSAGES.NOT_WELL_FORMED_XML,
      {},
    );
  }
  return lineBreaks;
}

/**
 * Whether a character reference `&#...;` or `&#x...;` (as {@link GATE_RE} matched it) names a code
 * point XML 1.0 forbids. `&#X...;` (an upper-case X) and decimal digits mixed with letters are
 * not character references at all; the gate leaves those to the parser, as before.
 *
 * @internal
 */
function namesForbiddenCharacter(token: string): boolean {
  const third = token.charCodeAt(2);
  if (third === UPPER_X) return false;
  const hex = third === LOWER_X;
  const digits = token.slice(hex ? 3 : 2, -1);
  if (!hex && !/^[0-9]+$/u.test(digits)) return false;
  // Nine or more digits name a number past 0x10FFFF unless they start with zeros, so leading
  // zeros are dropped first and a longer run is past the last code point without being summed.
  const significant = digits.replace(/^0+/u, "");
  if (significant.length > 8) return true;
  return !isXmlChar(significant === "" ? 0 : Number.parseInt(significant, hex ? 16 : 10));
}

/**
 * A comment, a CDATA section and a processing instruction, each by how it opens and closes: the
 * three places XML does not expand a character reference. @internal
 */
const UNEXPANDED: readonly { readonly open: string; readonly close: string }[] = [
  { open: "<!--", close: "-->" },
  { open: "<![CDATA[", close: "]]>" },
  { open: "<?", close: "?>" },
];

/**
 * Whether any of these offsets (each the start of a character reference, in ascending order) lies
 * outside every comment, CDATA section and processing instruction, where XML expands it. Run only
 * when the gate found a reference to a forbidden code point, so a text without one pays nothing.
 *
 * One walk from the start of the text, `<` by `<`, never revisiting a character: a construct opened
 * at a `<` is skipped whole to its close, so a `<!--` inside a CDATA section or a `]]>` inside a
 * comment is read as the text it is. An attribute value cannot hold a `<`, so no construct starts
 * inside one. A construct that never closes ends the walk with a refusal: such a text is not
 * well-formed either way, and stopping there keeps a text of many unclosed openers linear (a lazy
 * regular expression over the same three spans retries from each opener, quadratic in them).
 *
 * @internal
 */
function anyExpanded(source: string, offsets: readonly number[]): boolean {
  let at = 0;
  for (const offset of offsets) {
    // Past `at`, nothing is read yet; an offset before it sits inside the construct last skipped.
    while (at <= offset) {
      const lt = source.indexOf("<", at);
      if (lt === -1 || lt > offset) return true;
      const construct = UNEXPANDED.find(({ open }) => source.startsWith(open, lt));
      if (construct === undefined) {
        at = lt + 1;
        continue;
      }
      const close = source.indexOf(construct.close, lt + construct.open.length);
      if (close === -1) return true;
      at = close + construct.close.length;
    }
  }
  return false;
}

/**
 * Whether a report from `@xmldom/xmldom` is one a strict build (`parseXml`) reads past, as either
 * can come from a text `parseXml` reads: the warning on U+FFFD REPLACEMENT CHARACTER, which XML
 * 1.0 allows, and the error on an entity reference with no declaration (`&name;`), which is never
 * expanded and counts toward `maxEntityExpansions`. Each is matched whole, by xmldom's own words
 * and, for the entity, the reference xmldom names in them (`&`, a name of ASCII letters, digits and
 * `_` not starting with a digit, `;`, the only names its entity pattern reads whole), so a report
 * reworded in another xmldom release, or with anything after the reference, is fatal, not read
 * past.
 *
 * @internal
 */
export function isToleratedReport(level: "warning" | "error", message: string): boolean {
  return level === "warning"
    ? message === "Unicode replacement character detected, source encoding issues?"
    : /^entity not found:&[A-Z_a-z]\w*;$/u.test(message);
}

/** The end-of-line handling for a text with no line break to rewrite: the text itself. @internal */
function keepLineEndings(source: string): string {
  return source;
}

/**
 * Construct the DOM with a hardened parser. The `onError` handler tolerates
 * `warning`/`error` levels (Postel's Law, the lenient parser recovers what it
 * can) but converts any `fatalError` into a PHI-safe `NOT_WELL_FORMED_XML`
 * fatal. `@xmldom/xmldom` also throws directly for some malformed inputs; those
 * are caught and normalized to the same fatal. A null document element is left
 * for the caller's root gate to reject.
 *
 * With `strict` set (`parseXml` only), every report is fatal but the two
 * {@link isToleratedReport} names, which a well-formed text can draw.
 *
 * @internal
 */
function buildDom(
  source: string,
  lineBreaksToNormalize: boolean,
  locate = true,
  strict = false,
): Document {
  const { DOMParser, normalizeLineEndings: xmldomLineEndings } = xmldom();
  const parser = new DOMParser({
    locator: locate,
    // XML's end-of-line handling, which xmldom applies to the whole text before it parses. On a
    // text with none of the characters it rewrites, both of its replacements are the identity, so
    // the text is passed through as it is instead of being scanned twice more.
    normalizeLineEndings: lineBreaksToNormalize ? xmldomLineEndings : keepLineEndings,
    onError: (level: "warning" | "error" | "fatalError", message: string): void => {
      if (level === "fatalError") {
        throw new CcdaParseError(
          FATAL_CODES.NOT_WELL_FORMED_XML,
          FATAL_MESSAGES.NOT_WELL_FORMED_XML,
          {},
        );
      }
      // xmldom throws its own ParseError in place of whatever a report throws, and the catch below
      // turns that into NOT_WELL_FORMED_XML, so no message is needed and none could leak.
      if (strict && !isToleratedReport(level, message)) throw new Error();
    },
  });

  try {
    return parser.parseFromString(source, "application/xml");
  } catch (err) {
    /* v8 ignore next -- @xmldom/xmldom wraps an error thrown from onError in its own ParseError, so no CcdaParseError reaches this catch; kept so one would pass through unchanged */
    if (err instanceof CcdaParseError) throw err;
    throw new CcdaParseError(
      FATAL_CODES.NOT_WELL_FORMED_XML,
      FATAL_MESSAGES.NOT_WELL_FORMED_XML,
      {},
    );
  }
}

/**
 * {@link enforceStructureLimits} for the compact tree, from the shape its reader counted rather than
 * a walk: the same fatal, at the same element, and the same namespace warnings in the same order,
 * with one difference no caller sees: the warnings are reported only when no limit is exceeded
 * (the one caller drops what was reported when a fatal is thrown).
 *
 * The walk visits elements level by level, each level in document order, and at each element
 * checks the depth, then the count. So the first element deeper than `maxDepth` is the first, in
 * document order, of the first level past it, at place 1 + the elements above that level; the
 * first past `maxNodeCount` is at the first place greater than it; whichever comes first throws,
 * the depth when both fall on one element. A limit that is not a number never throws, as no
 * comparison with it holds. A namespace is reported at its first element in that order: its
 * shallowest, the first in document order among those; the namespaces in the order of those
 * elements.
 *
 * @internal
 */
function enforceShapeLimits(
  shape: TreeShape,
  limits: ResolvedLimits,
  reportForeignNamespace: (warning: CcdaWarning) => void,
): void {
  const { perDepth, firstAtDepth } = shape;
  let total = 0;
  let tooDeepAt = Number.POSITIVE_INFINITY;
  let tooDeep: Element | undefined;
  for (let level = 0; level < perDepth.length; level++) {
    if (tooDeep === undefined && level + 1 > limits.maxDepth) {
      tooDeepAt = total + 1;
      tooDeep = firstAtDepth[level] as unknown as Element;
    }
    total += perDepth[level] as number;
  }
  const max = limits.maxNodeCount;
  const overCountAt =
    total > max ? (Number.isFinite(max) ? Math.max(1, Math.floor(max) + 1) : 1) : Infinity;
  if (tooDeep !== undefined && tooDeepAt <= overCountAt) {
    throw new CcdaParseError(
      FATAL_CODES.ELEMENT_DEPTH_LIMIT_EXCEEDED,
      FATAL_MESSAGES.ELEMENT_DEPTH_LIMIT_EXCEEDED,
      positionOf(tooDeep),
    );
  }
  if (overCountAt !== Infinity) {
    throw new CcdaParseError(
      FATAL_CODES.NODE_COUNT_LIMIT_EXCEEDED,
      FATAL_MESSAGES.NODE_COUNT_LIMIT_EXCEEDED,
      {},
    );
  }
  const { namespaceElements, namespaceDepths, namespaceIndexes } = shape;
  const foreign: number[] = [];
  for (let slot = 0; slot < namespaceElements.length; slot++) {
    const el = namespaceElements[slot] as TreeShape["namespaceElements"][number];
    if (!isRecognizedNamespace(el.namespaceURI)) foreign.push(slot);
  }
  foreign.sort(
    (a, b) =>
      (namespaceDepths[a] as number) - (namespaceDepths[b] as number) ||
      (namespaceIndexes[a] as number) - (namespaceIndexes[b] as number),
  );
  for (const slot of foreign) {
    const el = namespaceElements[slot] as unknown as Element;
    reportForeignNamespace(unknownNamespacePrefix(positionOf(el)));
  }
}

/**
 * Walk the constructed DOM iteratively (no recursion, itself a depth-attack
 * surface) to enforce `maxDepth` and `maxNodeCount`, and to sweep for elements
 * outside the recognized namespace set. Counts element nodes only; throws
 * `ELEMENT_DEPTH_LIMIT_EXCEEDED` for over-deep nesting and
 * `NODE_COUNT_LIMIT_EXCEEDED` for excessive fan-out.
 *
 * **The namespace sweep reports once per distinct foreign namespace**, not once
 * per foreign element: a vendor extension block is one deviation however many
 * nodes it spans. **That bounds the benign case, not a hostile one, and it must
 * not be described as a defence.** A document declaring a distinct namespace on
 * every element still produces one warning per element, bounded only by
 * `maxNodeCount`, exactly as every other per-element warning in this parser is.
 * An element with no namespace at all counts as foreign, matching
 * {@link isRecognizedNamespace}, which treats a `null` URI that way; it is
 * tracked by its own flag rather than by a sentinel key, so no namespace URI a
 * document could carry can collide with it.
 *
 * **The position is the shallowest use of that namespace, and the leftmost
 * among those, NOT the first in document order.** This walk is level-order: it
 * has to be, because it enforces a depth cap, and a depth-first version of it
 * would be the recursion this function exists to avoid. So a namespace used
 * deep inside the body and again on a shallow header sibling is reported at the
 * shallow one. `line` and `column` still locate the element the warning names
 * exactly; they simply do not name the earliest such element.
 *
 * Neither the namespace URI nor the prefix reaches the warning: the message
 * comes whole from the frozen registry and the position carries the bounded
 * element **local name**. The URIs held in `seenNamespaces` are a loop-local
 * dedup key and are never read out.
 *
 * @internal
 */
function enforceStructureLimits(
  root: Element | null,
  limits: ResolvedLimits,
  reportForeignNamespace: (warning: CcdaWarning) => void,
): void {
  /* v8 ignore next -- buildDom has already thrown NOT_WELL_FORMED_XML for a source with no root element, and readTree returns none */
  if (root === null) return;

  let nodeCount = 0;
  const seenNamespaces = new Set<string>();
  let seenNoNamespace = false;
  // Every element of a level is at the same depth, so the level carries the depth once rather
  // than a record per element.
  let level: Element[] = [root];
  let depth = 1;

  while (level.length > 0) {
    const next: Element[] = [];
    for (const node of level) {
      nodeCount += 1;
      if (depth > limits.maxDepth) {
        throw new CcdaParseError(
          FATAL_CODES.ELEMENT_DEPTH_LIMIT_EXCEEDED,
          FATAL_MESSAGES.ELEMENT_DEPTH_LIMIT_EXCEEDED,
          positionOf(node),
        );
      }
      if (nodeCount > limits.maxNodeCount) {
        throw new CcdaParseError(
          FATAL_CODES.NODE_COUNT_LIMIT_EXCEEDED,
          FATAL_MESSAGES.NODE_COUNT_LIMIT_EXCEEDED,
          {},
        );
      }
      const namespaceUri = node.namespaceURI;
      if (!isRecognizedNamespace(namespaceUri)) {
        if (namespaceUri === null) {
          if (!seenNoNamespace) {
            seenNoNamespace = true;
            reportForeignNamespace(unknownNamespacePrefix(positionOf(node)));
          }
        } else if (!seenNamespaces.has(namespaceUri)) {
          seenNamespaces.add(namespaceUri);
          reportForeignNamespace(unknownNamespacePrefix(positionOf(node)));
        }
      }
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (child.nodeType === ELEMENT_NODE) next.push(child as Element);
      }
    }
    level = next;
    depth += 1;
  }
}
