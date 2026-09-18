/**
 * AC-6: a conformance result carries the rule, the assertion's own static text, the structural
 * location and counts, and nothing read out of the document under validation.
 *
 * THE GRADER IS A SEEDED DOCUMENT, NOT A READING OF THE CODE. `SELF_TEST_MARKER_DOCUMENT`
 * carries the same marker token in element text, in attribute values and in narrative at once,
 * and it is non-conformant in three ways, so every finding it produces is one a leaking report
 * would have carried the marker into. The assertion is then a search for that token across the
 * whole report and across every string the harness would write to a stream.
 *
 * BOTH ENGINES ARE EXERCISED, because they leak differently. The Schematron half is safe by
 * construction on this artifact family (no assertion message interpolates anything), so the
 * risk there is the LOCATION carrying an attribute or a text node. The XSD half is the real
 * hazard: libxml2 writes the offending value into several of its messages, so
 * `classifySchemaMessage` has to drop what it does not recognise rather than pass it through.
 */

import { describe, expect, it } from "vitest";

import {
  MARKER_TOKEN,
  SELF_TEST_MARKER_DOCUMENT,
  SELF_TEST_SCHEMA,
  SELF_TEST_SCHEMATRON,
  SELF_TEST_VOCABULARY,
} from "../__fixtures__/conformance.js";
import { CONFORMANCE_CODES, type ConformanceError } from "../../scripts/conformance/errors.js";
import { renderReport, type RunResult } from "../../scripts/conformance/report.js";
import { assertClean } from "../../scripts/conformance/run.js";
import { compileSchematron, evaluate } from "../../scripts/conformance/schematron.js";
import { classifySchemaMessage, validateAgainstSchema } from "../../scripts/conformance/xsd.js";
import { DOMParser } from "@xmldom/xmldom";

const parse = (xml: string): ReturnType<DOMParser["parseFromString"]> =>
  new DOMParser({ onError: () => undefined }).parseFromString(xml, "text/xml");

const schema = compileSchematron(SELF_TEST_SCHEMATRON);
const vocabulary = parse(SELF_TEST_VOCABULARY);

describe("AC-6: a conformance result carries no content from the document under validation", () => {
  it("produces findings on the marker document, so the check has something to leak", () => {
    const findings = evaluate(schema, parse(SELF_TEST_MARKER_DOCUMENT), "errors", vocabulary);
    expect(findings.length).toBeGreaterThan(0);
  });

  it("carries the assertion id, its own static text and a structural location, and no marker", () => {
    const findings = evaluate(schema, parse(SELF_TEST_MARKER_DOCUMENT), "errors", vocabulary);
    for (const finding of findings) {
      expect(finding.assertionId).toMatch(/^a-self-\d$/);
      expect(finding.message).toContain("CONF:self-");
      expect(finding.location).toMatch(/^(\/[A-Za-z_][\w.:-]*\[\d+\])+$/);
      expect(JSON.stringify(finding)).not.toContain(MARKER_TOKEN);
    }
  });

  it("carries no marker through the XSD half, where the engine puts values in its messages", async () => {
    const findings = await validateAgainstSchema(
      [{ fileName: "self-test.xsd", contents: SELF_TEST_SCHEMA }],
      SELF_TEST_MARKER_DOCUMENT,
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(findings)).not.toContain(MARKER_TOKEN);
  });

  it("drops an unrecognised message wholesale rather than passing it through", () => {
    // The fail-closed direction, stated as a test so it cannot be softened into a pass-through
    // default. An engine message this repository has never seen costs a less informative
    // report; passing it through would cost a patient value in a file a consumer reads.
    const finding = classifySchemaMessage(
      `Element '{urn:hl7-org:v3}given': something new about '${MARKER_TOKEN}' nobody has classified.`,
      12,
    );
    expect(finding.code).toBe("XSD_UNCLASSIFIED");
    expect(finding.element).toBe("{urn:hl7-org:v3}given");
    expect(finding.expected).toEqual([]);
    expect(JSON.stringify(finding)).not.toContain(MARKER_TOKEN);
  });

  it("drops the offending value out of a message shape it DOES recognise", () => {
    const finding = classifySchemaMessage(
      `Element '{urn:hl7-org:v3}birthTime', attribute 'value': '${MARKER_TOKEN}' is not a valid value of the atomic type 'ts'.`,
      7,
    );
    expect(finding.code).toBe("XSD_VALUE_NOT_VALID_FOR_TYPE");
    expect(finding.attribute).toBe("value");
    expect(finding.expected).toContain("ts");
    expect(JSON.stringify(finding)).not.toContain(MARKER_TOKEN);
  });

  it("renders a whole report over the marker document with no marker anywhere in it", async () => {
    const result: RunResult = {
      artifactRevision: "0000000000000000000000000000000000000001",
      artifacts: { schematron: "0000000000000000000000000000000000000001" },
      assertionCount: schema.assertionCount,
      built: [
        {
          name: "marker-document",
          documentType: "ccd",
          schema: await validateAgainstSchema(
            [{ fileName: "self-test.xsd", contents: SELF_TEST_SCHEMA }],
            SELF_TEST_MARKER_DOCUMENT,
          ),
          schematron: evaluate(schema, parse(SELF_TEST_MARKER_DOCUMENT), "errors", vocabulary),
        },
      ],
      roundTripDocuments: 1,
      roundTripDivergences: [],
    };
    const rendered = renderReport(result);
    expect(rendered).toContain("a-self-");
    expect(rendered).not.toContain(MARKER_TOKEN);
  });

  it("writes no marker to either output stream, which is where the refusal goes", async () => {
    // The harness writes exactly two run-derived things to a stream: the summary counts, and
    // the code, context and remedy of whatever it refused with. The refusal is the one that
    // could carry a finding, so it is the one asserted.
    const result: RunResult = {
      artifactRevision: "0000000000000000000000000000000000000001",
      artifacts: { schematron: "0000000000000000000000000000000000000001" },
      assertionCount: schema.assertionCount,
      built: [
        {
          name: "marker-document",
          documentType: "ccd",
          schema: await validateAgainstSchema(
            [{ fileName: "self-test.xsd", contents: SELF_TEST_SCHEMA }],
            SELF_TEST_MARKER_DOCUMENT,
          ),
          schematron: evaluate(schema, parse(SELF_TEST_MARKER_DOCUMENT), "errors", vocabulary),
        },
      ],
      roundTripDocuments: 1,
      roundTripDivergences: [],
    };
    let refused: ConformanceError | null = null;
    try {
      assertClean(result);
    } catch (error) {
      refused = error as ConformanceError;
    }
    expect(refused?.code).toBe(CONFORMANCE_CODES.ERRORS_FOUND);
    expect(refused?.message).not.toContain(MARKER_TOKEN);
  });
});
