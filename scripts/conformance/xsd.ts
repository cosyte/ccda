/**
 * XML schema validation against the normative CDA R2 schema, and the redaction seam that keeps
 * its diagnostics free of document content.
 *
 * ORDER MATTERS AND IT IS THE ARTIFACT'S OWN. The HL7 `CDA-ccda-2.1` README states that an
 * instance is validated against the core CDA R2 XML schema BEFORE it is validated against the
 * Schematron, and the harness does exactly that. A document that is not schema-valid has a
 * structural problem the Schematron's rule contexts were never written to describe.
 *
 * THE ENGINE IS libxml2, COMPILED TO WEB ASSEMBLY. `xmllint-wasm` is the whole dependency:
 * MIT, zero dependencies of its own, no install-time execution, and no native build step, which
 * matters in a repository whose package manager runs with install scripts off. The alternatives
 * were a native binding (a node-gyp build that install hardening switches off), a Java wrapper
 * (a JVM in the toolchain of a TypeScript library), or a hosted validator (refused outright:
 * this harness must be pointable at a real record without that record leaving the machine).
 *
 * THE REDACTION SEAM IS THE POINT OF THIS FILE. libxml2 writes the offending VALUE into some of
 * its messages ("'12345' is not a valid value of the atomic type '..."), so the raw message can
 * never reach the report (`phi-safety` P4, `observability` B1). `classify` keeps the schema's
 * own vocabulary (element and attribute names, expected particles, type names) and the line
 * number, and drops everything else. A message shape it does not recognise degrades to
 * `XSD_UNCLASSIFIED` carrying NOTHING of the message, which is the fail-closed direction: the
 * cost is a less informative report on an unusual failure, and the alternative cost is a
 * patient value in a file a consumer reads.
 */

import { validateXML, memoryPages } from "xmllint-wasm";

import { CONFORMANCE_CODES, ConformanceError } from "./errors.js";
import type { SchemaFile } from "./fetch.js";

/** A schema violation, reduced to schema vocabulary and a structural location. */
export interface SchemaFinding {
  /** Stable classification of the violation. */
  readonly code: string;
  /** The element the validator was positioned on, as a QName. Markup vocabulary, never content. */
  readonly element: string;
  /** The attribute involved, where the message named one. */
  readonly attribute: string | null;
  /** Schema vocabulary the message named: expected particles, or the type that rejected a value. */
  readonly expected: readonly string[];
  /** Line number in the document as serialized for validation. */
  readonly line: number | null;
}

/** The recognised libxml2 schema-error shapes, and the stable code each maps to. */
const MESSAGE_SHAPES: readonly { readonly code: string; readonly pattern: RegExp }[] = [
  { code: "XSD_ELEMENT_NOT_EXPECTED", pattern: /^This element is not expected\./ },
  { code: "XSD_MISSING_CHILD_ELEMENT", pattern: /^Missing child element\(s\)\./ },
  {
    code: "XSD_CHARACTER_CONTENT_NOT_ALLOWED",
    pattern: /^Character content (is not allowed|other than whitespace)/,
  },
  {
    code: "XSD_REQUIRED_ATTRIBUTE_MISSING",
    pattern: /^The attribute '[^']*' is required but missing\.?$/,
  },
  { code: "XSD_ATTRIBUTE_NOT_ALLOWED", pattern: /^The attribute '[^']*' is not allowed\.?$/ },
  {
    code: "XSD_VALUE_NOT_VALID_FOR_TYPE",
    pattern: /is not a valid value of the (atomic|local atomic|union) type/,
  },
  { code: "XSD_VALUE_NOT_FACET_VALID", pattern: /is not (accepted by the pattern|facet-valid)/ },
  { code: "XSD_VALUE_NOT_IN_ENUMERATION", pattern: /^\[facet 'enumeration'\]/ },
  { code: "XSD_NO_MATCHING_DECLARATION", pattern: /^No matching global declaration available/ },
  { code: "XSD_TYPE_NOT_RESOLVED", pattern: /^The QName value '[^']*' of the xsi:type attribute/ },
];

/**
 * Reduce one libxml2 schema-validity message to schema vocabulary and a location.
 *
 * Exported so `test/conformance/report-has-no-document-content.test.ts` can drive it directly
 * with a message carrying a marker token and prove the marker does not survive.
 *
 * @param rawMessage - The message libxml2 produced, without its file prefix.
 * @param line - The line number libxml2 reported, if it reported one.
 * @returns The finding, carrying no value read out of the document.
 * @example
 * ```ts
 * classifySchemaMessage("Element '{urn:hl7-org:v3}x': This element is not expected.", 12);
 * ```
 */
export function classifySchemaMessage(rawMessage: string, line: number | null): SchemaFinding {
  const stripped = rawMessage.replace(/^Schemas validity error\s*:\s*/, "").trim();
  const head = /^Element '([^']*)'(?:,\s*attribute '([^']*)')?\s*:\s*/.exec(stripped);
  const element = head?.[1] ?? "";
  const attribute = head?.[2] ?? null;
  const body = head ? stripped.slice(head[0].length) : stripped;

  const shape = MESSAGE_SHAPES.find((candidate) => candidate.pattern.test(body));
  if (!shape) return { code: "XSD_UNCLASSIFIED", element, attribute, expected: [], line };

  const expected: string[] = [];
  const particles = /Expected is (?:one of )?\(\s*([^)]*)\)/.exec(body);
  if (particles) {
    expected.push(
      ...(particles[1] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    );
  }
  // ANCHORED AT THE END OF THE MESSAGE, and that is load-bearing rather than tidy. The type
  // name is the last thing libxml2 writes in this shape ("'V' is not a valid value of the
  // atomic type 'T'."), and the offending value V comes BEFORE it. An unanchored match would
  // take the first `type '...'` in the message, which a document value carrying the words
  // `type 'x'` would supply, and the value would then travel into the report as a type name.
  const type = /type '([^']*)'\.?\s*$/.exec(body);
  if (type?.[1]) expected.push(type[1]);
  const required = /attribute '([^']*)' is (?:required but missing|not allowed)/.exec(body);
  if (required?.[1]) expected.push(required[1]);

  return { code: shape.code, element, attribute, expected, line };
}

/**
 * Validate one document against the pinned CDA R2 XML schema.
 *
 * @param schema - The schema set as fetched, entry point first.
 * @param documentXml - The document to validate.
 * @returns Every schema violation, redacted to schema vocabulary and a location.
 * @throws {ConformanceError} `SCHEMA_SET_EMPTY` when there is no schema to validate against.
 * @example
 * ```ts
 * const findings = await validateAgainstSchema(schemaFiles, serializeCcda(document));
 * ```
 */
export async function validateAgainstSchema(
  schema: readonly SchemaFile[],
  documentXml: string,
): Promise<readonly SchemaFinding[]> {
  const [entry, ...rest] = schema;
  // FAIL CLOSED ON AN EMPTY SCHEMA SET. Returning no findings would report "schema-valid" for a
  // document nothing validated, which is the false green this whole harness is built to refuse,
  // and it would do it silently. Nothing can reach it that way today, because `fetchSchema`
  // refuses a pin whose entry point is not in its own non-empty file list; this is the backstop
  // for the day that changes, not a live branch.
  if (!entry) {
    throw new ConformanceError(
      CONFORMANCE_CODES.SCHEMA_SET_EMPTY,
      "XML schema validation was handed an empty schema set, so nothing was validated",
      "A document validated against no schema is not a schema-valid document. Check that " +
        "artifacts.cdaSchema.files names the schema set and that the fetch layer returned it.",
    );
  }
  const result = await validateXML({
    xml: [{ fileName: "document.xml", contents: documentXml }],
    schema: [entry],
    preload: rest,
    initialMemoryPages: 256,
    maxMemoryPages: memoryPages.GiB,
  });
  return result.errors.map((error) =>
    classifySchemaMessage(error.message, error.loc?.lineNumber ?? null),
  );
}

/**
 * The comparable identity of a schema finding.
 *
 * @param finding - The finding to key.
 * @returns A stable key carrying no document content.
 * @example
 * ```ts
 * schemaFindingKey({ code: "XSD_UNCLASSIFIED", element: "x", attribute: null, expected: [], line: 1 });
 * ```
 */
export function schemaFindingKey(finding: SchemaFinding): string {
  return `${finding.code}@${finding.element}${finding.attribute ? `@${finding.attribute}` : ""}`;
}
