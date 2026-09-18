/**
 * AC-1's second clause, graded offline: the suite fails on any error-severity result and does
 * not fail without one.
 *
 * AC-1's first clause (validating what `buildCcda` emits against the NORMATIVE artifacts) is
 * graded by `pnpm conformance`, which needs the network. What is gradeable here, with no
 * network, is the part a false green would hide: that the engine really does raise a finding
 * on a document that violates an assertion, really does raise none on one that does not, and
 * that the verdict step turns the first into a refusal.
 *
 * The self-test Schematron exercises the constructs the normative artifact is built out of:
 * an abstract rule reached through `sch:extends`, a phase that selects which patterns run,
 * first-rule-wins inside a pattern, and a value-set lookup through `document('voc.xml')`.
 * A driver that could not do these could not run the real artifact either.
 */

import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";

import {
  SELF_TEST_BAD_DOCUMENT,
  SELF_TEST_GOOD_DOCUMENT,
  SELF_TEST_SCHEMATRON,
  SELF_TEST_VOCABULARY,
} from "../__fixtures__/conformance.js";
import { CONFORMANCE_CODES, ConformanceError } from "../../scripts/conformance/errors.js";
import type { RunResult } from "../../scripts/conformance/report.js";
import { assertClean } from "../../scripts/conformance/run.js";
import {
  closeFunctionNameGap,
  compileSchematron,
  evaluate,
  splitContextAlternatives,
} from "../../scripts/conformance/schematron.js";

const parse = (xml: string): ReturnType<DOMParser["parseFromString"]> =>
  new DOMParser({ onError: () => undefined }).parseFromString(xml, "text/xml");

const schema = compileSchematron(SELF_TEST_SCHEMATRON);
const vocabulary = parse(SELF_TEST_VOCABULARY);

function resultWith(schematron: RunResult["built"][number]["schematron"]): RunResult {
  return {
    artifactRevision: "0000000000000000000000000000000000000001",
    artifacts: { schematron: "0000000000000000000000000000000000000001" },
    assertionCount: schema.assertionCount,
    built: [{ name: "self-test", documentType: "ccd", schema: [], schematron }],
    roundTripDocuments: 1,
    roundTripDivergences: [],
  };
}

describe("AC-1: the suite fails on an error-severity result and not otherwise", () => {
  it("raises no error-phase finding on the known-good document", () => {
    expect(evaluate(schema, parse(SELF_TEST_GOOD_DOCUMENT), "errors", vocabulary)).toEqual([]);
  });

  it("raises one finding per violated assertion on the known-bad document", () => {
    const findings = evaluate(schema, parse(SELF_TEST_BAD_DOCUMENT), "errors", vocabulary);
    expect(findings.map((finding) => finding.assertionId).sort()).toEqual([
      "a-self-1",
      "a-self-2",
      "a-self-3",
    ]);
  });

  it("refuses the run when a built document carries an error-severity result", () => {
    const findings = evaluate(schema, parse(SELF_TEST_BAD_DOCUMENT), "errors", vocabulary);
    try {
      assertClean(resultWith(findings));
      throw new Error("expected the verdict step to refuse");
    } catch (error) {
      expect(error).toBeInstanceOf(ConformanceError);
      expect((error as ConformanceError).code).toBe(CONFORMANCE_CODES.ERRORS_FOUND);
    }
  });

  it("does not refuse the run when no built document carries one", () => {
    expect(() => {
      assertClean(resultWith([]));
    }).not.toThrow();
  });

  it("splices an abstract rule's assertions in through sch:extends", () => {
    // `a-self-1` and `a-self-2` exist only on the abstract rule. A driver that read @context
    // off every rule, as the published JS implementations do, cannot reach them at all, and the
    // normative artifact carries 505 abstract rules.
    const findings = evaluate(schema, parse(SELF_TEST_BAD_DOCUMENT), "errors", vocabulary);
    expect(findings.map((finding) => finding.assertionId)).toContain("a-self-1");
  });

  it("resolves document('voc.xml') against the fetched vocabulary file", () => {
    // `a-self-2` fails on the bad document only because the vocabulary says so. Run the same
    // document against a vocabulary that admits its statusCode and the finding has to go away,
    // which is what distinguishes a real lookup from an assertion that always fails.
    const permissive = parse(
      '<systems xmlns="http://www.lantanagroup.com/voc">' +
        '<system valueSetOid="9.9.9.100"><code value="suspended"/></system></systems>',
    );
    const findings = evaluate(schema, parse(SELF_TEST_BAD_DOCUMENT), "errors", permissive);
    expect(findings.map((finding) => finding.assertionId)).not.toContain("a-self-2");
  });

  it("evaluates a node by the first matching rule in a pattern and by no later one", () => {
    // `a-self-5` is `false()` under a rule whose context selects every observation, sitting
    // after a rule that selects the self-test observation. ISO Schematron gives the node to the
    // first rule only, so a conformant document raises nothing from the second.
    expect(
      evaluate(schema, parse(SELF_TEST_GOOD_DOCUMENT), "errors", vocabulary).map(
        (f) => f.assertionId,
      ),
    ).not.toContain("a-self-5");
  });

  it("runs only the patterns the requested phase activates", () => {
    // The same document, two phases, two disjoint result sets. The error phase is what fails a
    // run; the warning phase's assertions must never reach it, which is the whole reason the
    // harness names a phase rather than evaluating every pattern in the artifact.
    const errors = evaluate(schema, parse(SELF_TEST_BAD_DOCUMENT), "errors", vocabulary);
    const warnings = evaluate(schema, parse(SELF_TEST_BAD_DOCUMENT), "warnings", vocabulary);
    expect(warnings.map((finding) => finding.assertionId)).toEqual(["a-self-6"]);
    expect(errors.map((finding) => finding.assertionId)).not.toContain("a-self-6");
  });

  it("refuses to compile an expression rather than skipping the assertion it belongs to", () => {
    // The false green this whole harness exists to refuse, at its own level: a validator that
    // silently drops what it could not read reports a pass it did not earn.
    expect(() =>
      compileSchematron(
        '<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron">' +
          '<sch:pattern id="p"><sch:rule id="r" context="cda:x">' +
          '<sch:assert id="a" test="count(">broken</sch:assert>' +
          "</sch:rule></sch:pattern></sch:schema>",
      ),
    ).toThrow(expect.objectContaining({ code: CONFORMANCE_CODES.SCHEMATRON_UNCOMPILABLE }));
  });

  it("closes a core function's name gap without touching an operator or a string literal", () => {
    // XPath 1.0 allows `not (x)`; the engine's parser does not, and one assertion of the
    // normative artifact is written that way. The rewrite is held to core function names only,
    // so `div` keeps its operator reading and a literal keeps its bytes.
    expect(closeFunctionNameGap("a and not (b)")).toBe("a and not(b)");
    expect(closeFunctionNameGap("a div (b) + count (c)")).toBe("a div (b) + count(c)");
    expect(closeFunctionNameGap("contains(x, 'not (y)')")).toBe("contains(x, 'not (y)')");
    expect(closeFunctionNameGap("cda:not-a-fn (x)")).toBe("cda:not-a-fn (x)");
  });

  it("splits a union context on top-level bars only", () => {
    expect(splitContextAlternatives("cda:a | cda:b[@x='p|q']")).toEqual([
      "cda:a",
      "cda:b[@x='p|q']",
    ]);
  });
});
