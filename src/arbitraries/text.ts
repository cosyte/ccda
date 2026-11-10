import { buildCcda } from "@cosyte/ccda";
import fc from "fast-check";
import type { Arbitrary } from "fast-check";

import { documentInit, type DocumentOptions } from "./document.js";

/**
 * A change a real sender makes to a document that the parser still reads: the name of each is the
 * key {@link applyQuirk} takes.
 *
 * @internal
 */
export type DocumentQuirk =
  | "noDeclaration"
  | "byteOrderMark"
  | "stylesheet"
  | "comments"
  | "indentHeader"
  | "crlf"
  | "singleQuotes"
  | "explicitClose"
  | "characterReferences"
  | "cdataTitles"
  | "carriageReturnInText"
  | "sdtcNamespace"
  | "vendorExtension"
  | "unknownTemplate"
  | "unstampedDocument"
  | "loincOnlySections";

/** Every quirk, in the order {@link applyQuirks} applies them. @internal */
export const QUIRKS: readonly DocumentQuirk[] = [
  "loincOnlySections",
  "unstampedDocument",
  "unknownTemplate",
  "vendorExtension",
  "sdtcNamespace",
  "cdataTitles",
  "characterReferences",
  "carriageReturnInText",
  "explicitClose",
  "singleQuotes",
  "indentHeader",
  "crlf",
  "comments",
  "stylesheet",
  "noDeclaration",
  "byteOrderMark",
];

/** The XML declaration the serializer writes, and the line break after it. @internal */
const DECLARATION = /^<\?xml [^<>]*\?>\r?\n/u;

/** A stylesheet processing instruction, as many senders write after the declaration. @internal */
const STYLESHEET = '<?xml-stylesheet type="text/xsl" href="CDA.xsl"?>';

/** Every tag, declaration, comment or processing instruction: text escapes `<` and `>`. @internal */
const TAG = /<[^<>]*>/gu;

/** Each run of text between two tags. @internal */
const TEXT_RUN = />([^<>]+)</gu;

/** The root's start tag. @internal */
const ROOT_START = /<ClinicalDocument\b[^<>]*>/u;

/**
 * Apply one quirk to spec-clean document text, as the serializer writes it.
 *
 * @internal
 */
export function applyQuirk(xml: string, quirk: DocumentQuirk): string {
  switch (quirk) {
    case "noDeclaration":
      return xml.replace(DECLARATION, "");
    case "byteOrderMark":
      return `\uFEFF${xml}`;
    case "stylesheet":
      return DECLARATION.test(xml)
        ? xml.replace(DECLARATION, (decl) => `${decl}${STYLESHEET}\n`)
        : `${STYLESHEET}\n${xml}`;
    case "comments":
      return xml
        .replace(ROOT_START, (tag) => `<!-- synthetic document -->\n${tag}<!-- generated -->`)
        .replace(/<\/ClinicalDocument>$/u, "<!-- end --></ClinicalDocument>\n<!-- after -->");
    case "indentHeader": {
      // Whitespace between header elements, which carry no mixed content.
      const body = xml.indexOf("<component><structuredBody>");
      const head = body === -1 ? xml : xml.slice(0, body);
      return head.replace(/\/></gu, "/>\n    <") + (body === -1 ? "" : xml.slice(body));
    }
    case "crlf":
      return xml.replace(/\n/gu, "\r\n");
    case "singleQuotes":
      return xml.replace(TAG, (tag) =>
        tag.startsWith("<?") || tag.startsWith("<!")
          ? tag
          : tag.replace(/="([^"]*)"/gu, (whole, value: string) =>
              value.includes("'") ? whole : `='${value}'`,
            ),
      );
    case "explicitClose":
      return xml.replace(/<([A-Za-z][\w:.-]*)((?:\s[^<>]*?)?)\/>/gu, "<$1$2></$1>");
    case "characterReferences": {
      // Write some characters of the text inside the root as numeric character references.
      const root = xml.search(ROOT_START);
      return (
        xml.slice(0, root) +
        xml
          .slice(root)
          .replace(
            TEXT_RUN,
            (_whole, run: string) =>
              `>${run.replace(/e/gu, "&#101;").replace(/n/gu, "&#x6E;").replace(/\n/gu, "&#10;")}<`,
          )
      );
    }
    case "carriageReturnInText":
      // A carriage return written as a character reference survives line-end normalization.
      return xml.replace(/<title>([^<>]*)<\/title>/gu, "<title>$1&#13;</title>");
    case "cdataTitles":
      return xml.replace(/<title>([^<>&\]]*)<\/title>/gu, "<title><![CDATA[$1]]></title>");
    case "sdtcNamespace":
      return xml.replace(ROOT_START, (tag) =>
        tag.replace(/>$/u, ' xmlns:sdtc="urn:hl7-org:sdtc">'),
      );
    case "vendorExtension":
      return xml.replace(
        /(<languageCode\b[^<>]*\/>)/u,
        '$1<zv:extension xmlns:zv="urn:example:synthetic-vendor" zv:kind="note">synthetic</zv:extension>',
      );
    case "unknownTemplate":
      return xml.replace(
        /(<typeId\b[^<>]*\/>)/u,
        '$1<templateId root="2.16.840.1.113883.19.5.99999.77"/>',
      );
    case "unstampedDocument":
      return xml.replace(
        /(<templateId root="2\.16\.840\.1\.113883\.10\.20\.22\.1\.[\d.]+") extension="[^"]*"/gu,
        "$1",
      );
    case "loincOnlySections":
      return xml.replace(/(<section\b[^<>]*>)(?:<templateId\b[^<>]*\/>)+/gu, "$1");
  }
}

/**
 * Apply quirks in the fixed order of {@link QUIRKS}, whatever order they were drawn in.
 *
 * @internal
 */
export function applyQuirks(xml: string, quirks: readonly DocumentQuirk[]): string {
  return QUIRKS.filter((q) => quirks.includes(q)).reduce(applyQuirk, xml);
}

/**
 * Generate messy document text a real sender might produce, which the parser always accepts: a
 * document from {@link documentInit}, written by the serializer, then changed by any of these: no
 * XML declaration, a byte order mark, a stylesheet instruction, comments, indented header lines,
 * CRLF line endings, single-quoted attributes, explicit end tags on empty elements, numeric
 * character references and a carriage return in text, CDATA titles, the `sdtc` namespace declared,
 * a vendor extension element in a namespace of its own, an unknown template, document templates
 * with no version stamp, and sections recognized only by their LOINC code. The parser may warn
 * about what it found, but it never refuses this text.
 *
 * @param options - The document types and list sizes; see {@link DocumentOptions}.
 * @returns An arbitrary of document text.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { parseCcda } from "@cosyte/ccda";
 * import { documentText } from "@cosyte/ccda/arbitraries";
 *
 * fc.assert(fc.property(documentText(), (xml) => parseCcda(xml).documentType !== undefined));
 * ```
 */
export function documentText(options: DocumentOptions = {}): Arbitrary<string> {
  return fc
    .tuple(documentInit(options), fc.subarray([...QUIRKS]))
    .map(([init, quirks]) => applyQuirks(buildCcda(init).toString(), quirks));
}

/** One edit {@link hostileInput} makes to document text. @internal */
export type Edit =
  | { readonly kind: "cut"; readonly at: number }
  | { readonly kind: "delete"; readonly at: number; readonly length: number }
  | { readonly kind: "insert"; readonly at: number; readonly text: string };

/**
 * Apply edits to text in order, each at its offset modulo the text's length then.
 *
 * @internal
 */
export function applyEdits(text: string, edits: readonly Edit[]): string {
  return edits.reduce((out, edit) => {
    const at = out.length === 0 ? 0 : edit.at % out.length;
    switch (edit.kind) {
      case "cut":
        return out.slice(0, at);
      case "delete":
        return out.slice(0, at) + out.slice(at + edit.length);
      case "insert":
        return out.slice(0, at) + edit.text + out.slice(at);
    }
  }, text);
}

/** The pieces random markup is built from. @internal */
const MARKUP_UNITS: readonly string[] = [
  "<",
  ">",
  "</",
  "/>",
  "=",
  '"',
  "'",
  " ",
  "&",
  ";",
  "&amp;",
  "&#",
  "&#x",
  "&lt;",
  "a",
  "1",
  "\u00e9",
  "ClinicalDocument",
  "component",
  "section",
  'xmlns="urn:hl7-org:v3"',
  "xmlns:",
  "<!DOCTYPE",
  "<!ENTITY",
  "<![CDATA[",
  "]]>",
  "<?",
  "?>",
  "<!--",
  "-->",
  "\n",
];

/** Options for {@link hostileInput}. */
export interface HostileInputOptions {
  /** The most characters of random text or markup. Defaults to 200. */
  readonly maxLength?: number;
}

/**
 * Generate hostile input: random strings, random markup, document text cut short or with text
 * inserted and deleted, a document type declaration with internal or external entities, an
 * entity expansion bomb, nesting deeper than the parser's limit, and roots that are not an HL7 v3
 * `ClinicalDocument`. The parser may refuse any of it with one of its documented fatal errors,
 * but it throws nothing else.
 *
 * @param options - The length of random text; see {@link HostileInputOptions}.
 * @returns An arbitrary of a string.
 * @example
 * ```ts
 * import fc from "fast-check";
 * import { CcdaParseError, parseCcda } from "@cosyte/ccda";
 * import { hostileInput } from "@cosyte/ccda/arbitraries";
 *
 * fc.assert(
 *   fc.property(hostileInput(), (raw) => {
 *     try {
 *       parseCcda(raw);
 *     } catch (err) {
 *       if (!(err instanceof CcdaParseError)) throw err;
 *     }
 *   }),
 * );
 * ```
 */
export function hostileInput(options: HostileInputOptions = {}): Arbitrary<string> {
  const maxLength = options.maxLength ?? 200;
  const randomText = fc.string({ unit: "binary", maxLength });
  const edit: Arbitrary<Edit> = fc.oneof(
    fc.nat().map((at) => ({ kind: "cut" as const, at })),
    fc.tuple(fc.nat(), fc.integer({ min: 1, max: 40 })).map(([at, length]) => ({
      kind: "delete" as const,
      at,
      length,
    })),
    fc
      .tuple(
        fc.nat(),
        fc.oneof(
          fc.string({ unit: "binary", minLength: 1, maxLength: 8 }),
          fc.constantFrom(...MARKUP_UNITS),
        ),
      )
      .map(([at, text]) => ({ kind: "insert" as const, at, text })),
  );
  const small = { maxEntries: 1 };
  return fc.oneof(
    randomText,
    fc.string({ unit: fc.constantFrom(...MARKUP_UNITS), maxLength: Math.ceil(maxLength / 4) }),
    fc
      .tuple(documentText(small), fc.array(edit, { minLength: 1, maxLength: 4 }))
      .map(([text, edits]) => applyEdits(text, edits)),
    fc
      .tuple(documentText(small), fc.constantFrom(...DECLARATIONS))
      .map(([text, dtd]) => text.replace(/<ClinicalDocument\b/u, `${dtd}<ClinicalDocument`)),
    fc.integer({ min: 1001, max: 1100 }).map((depth) => nested(depth)),
    fc
      .tuple(documentText(small), fc.constantFrom(...ROOT_SWAPS))
      .map(([text, [from, to]]) => text.replace(from, to)),
  );
}

/** Document type declarations the parser refuses. @internal */
const DECLARATIONS: readonly string[] = [
  "<!DOCTYPE ClinicalDocument>",
  '<!DOCTYPE ClinicalDocument [<!ENTITY z "synthetic">]>',
  '<!DOCTYPE ClinicalDocument [<!ENTITY z SYSTEM "file:///dev/null">]>',
  '<!DOCTYPE ClinicalDocument [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>',
];

/** Root changes that leave a document that is not an HL7 v3 `ClinicalDocument`. @internal */
const ROOT_SWAPS: readonly (readonly [RegExp, string])[] = [
  [/xmlns="urn:hl7-org:v3"/u, 'xmlns="urn:example:not-v3"'],
  [/<ClinicalDocument\b/u, "<ClinicalDocumentZ"],
  [/<\/ClinicalDocument>/u, "</ClinicalDocumentZ>"],
];

/** A `ClinicalDocument` with `depth` nested elements inside. @internal */
function nested(depth: number): string {
  return `<ClinicalDocument xmlns="urn:hl7-org:v3">${"<z>".repeat(depth)}${"</z>".repeat(depth)}</ClinicalDocument>`;
}
