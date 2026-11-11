/**
 * The depth and node-count limits and the namespace sweep, read from the shape the compact reader
 * counts (`enforceShapeLimits` in `src/parser/secure-xml.ts`), against the walk of the
 * `@xmldom/xmldom` tree that `parseSecureXml` still runs.
 *
 * For every document the reader reads and every pair of limits, the two must refuse with the same
 * fatal at the same position, or both accept and report the same foreign namespaces at the same
 * positions in the same order. The limits include the values a caller can pass that are not
 * whole numbers: fractions, zero, negatives, infinities and NaN.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CcdaParseError } from "../src/parser/errors.js";
import { parseSecureSource, parseSecureXml, resolveLimits } from "../src/parser/secure-xml.js";
import type { CcdaWarning } from "../src/parser/warnings.js";
import { readTree } from "../src/parser/xml-tree.js";
import { assertProperty, propertyTimeout } from "./property/_runner.js";

/** What a limit check ended in: the fatal and its position, or the warnings it reported. */
function outcome(run: (report: (w: CcdaWarning) => void) => unknown): unknown {
  const reported: CcdaWarning[] = [];
  try {
    run((w) => reported.push(w));
  } catch (error) {
    if (!(error instanceof CcdaParseError)) throw error;
    return { fatal: error.code, position: error.position };
  }
  return { reported: reported.map((w) => ({ code: w.code, position: w.position })) };
}

/** The two outcomes for `xml` under `maxDepth` and `maxNodeCount`. */
function both(xml: string, maxDepth: number, maxNodeCount: number): [unknown, unknown] {
  const limits = resolveLimits({ maxDepth, maxNodeCount });
  const noop = (): void => undefined;
  return [
    outcome((report) => parseSecureSource(xml, limits, noop, report)),
    outcome((report) => parseSecureXml(xml, limits, noop, report)),
  ];
}

const LIMITS = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  0,
  0.5,
  1,
  2,
  2.5,
  3,
  4,
  6,
  9,
  20,
];

/** Elements in the HL7 v3 namespace, in two foreign ones and in none, nested a few levels. */
const NAME = fc.constantFrom("a", "f:b", "g:c", "h:d", "e");

/** The start of an element named `name`: `h:` is bound here, and `e` undeclares the default. */
function open(name: string): string {
  const decl = name === "h:d" ? ' xmlns:h="urn:h"' : name === "e" ? ' xmlns=""' : "";
  return `<${name}${decl}`;
}

// At the deepest level the first choice, an empty element, is the one taken, so the nesting ends.
const element = fc.letrec<{ element: string }>((tie) => ({
  element: fc.oneof(
    { maxDepth: 6, depthSize: "small" },
    NAME.map((name) => `${open(name)}/>`),
    fc
      .tuple(NAME, fc.array(tie("element"), { maxLength: 3 }))
      .map(([name, kids]) => `${open(name)}>${kids.join("\n")}</${name}>`),
  ),
}));

/** A document around generated content, with the prefixes it uses declared on the root. */
const documents = fc
  .array(element.element, { maxLength: 4 })
  .map(
    (kids) =>
      `<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:f="urn:f" xmlns:g="urn:g">\n${kids.join("\n")}\n</ClinicalDocument>`,
  );

describe("limits and the namespace sweep from the reader's shape", () => {
  it("agree with the walk of the @xmldom/xmldom tree", { timeout: propertyTimeout() }, () => {
    assertProperty(
      "shape limits agree with the tree walk",
      fc.property(
        documents,
        fc.constantFrom(...LIMITS),
        fc.constantFrom(...LIMITS),
        (xml, maxDepth, maxNodeCount) => {
          // Every generated document is one the reader reads, so the shape is what is tested.
          expect(readTree(xml)).toBeDefined();
          const [ours, theirs] = both(xml, maxDepth, maxNodeCount);
          expect(ours).toEqual(theirs);
        },
      ),
      { numRuns: 300 },
    );
  });

  it.each([
    ["a fatal for depth and count on one element, which is the depth", 3, 3],
    ["the count before a deeper level", 9, 3],
    ["the depth before the count runs out", 2, 9],
    ["a namespace met deep first and shallow later, reported at the shallow one", 99, 99],
  ])("%s", (_label, maxDepth, maxNodeCount) => {
    // `f` is met first, deep; `g` next, shallow; `f` again at `g`'s depth, after it: reported
    // `g` then `f`, the order of their shallowest elements, not the order they were first met.
    const xml = `<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:f="urn:f" xmlns:g="urn:g">
  <a><b><f:x/></b></a>
  <c/>
  <g:w/>
  <f:y/>
  <e xmlns=""/>
</ClinicalDocument>`;
    const [ours, theirs] = both(xml, maxDepth, maxNodeCount);
    expect(ours).toEqual(theirs);
  });
});
