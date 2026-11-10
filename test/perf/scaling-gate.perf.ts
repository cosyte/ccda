/**
 * The scaling gate for `parseCcda`, from `@cosyte/test-utils/perf`, run by `pnpm test:perf` and
 * never under coverage (see `vitest.perf.config.ts`).
 *
 * It asks one question: does parsing cost grow faster than the input? On the count axis, 4 times
 * the referral notes; on the size axis, continuity of care documents with 4 times the entries. Each
 * ratio must stay inside the band the shared contract fixes. It does not see a constant-factor
 * slowdown: a parser 10% slower everywhere passes, and always will. The base against head
 * comparison on a pull request (`bench/ccda.bench.mjs`) is the instrument for that.
 *
 * The self-check proves these fixtures are large enough for the gate to fail: the same parse
 * reached quadratically (every entry found by scanning from the start of the document) must clear
 * the ceiling at exactly these sizes. Every input is synthetic, built in code by the bench's own
 * `bench/shapes.mjs`.
 */

import {
  assertScalingGateFires,
  scalingGate,
  type ScalingGateOptions,
} from "@cosyte/test-utils/perf";
import { describe, expect, it } from "vitest";

import { ccd, referralNote } from "../../bench/shapes.mjs";
import { parseCcda, type CcdaDocument } from "../../src/index.js";

const ENTRY = "<entry ";

/**
 * The start of the `k`-th entry, found by reading the text from its first character, one character
 * at a time. Done for every entry, that is quadratic in the entry count.
 */
function entryStart(raw: string, k: number): number {
  let seen = -1;
  for (let at = 0; at < raw.length; at++) {
    if (raw.charCodeAt(at) === 60 && raw.startsWith(ENTRY, at)) {
      seen++;
      if (seen === k) return at;
    }
  }
  return -1;
}

/**
 * The same parse, reached the wrong way: the text is cut at every entry, each found by scanning from
 * the start, and put back together before it is parsed. It parses exactly what `parseCcda` parses,
 * which the self-check confirms before it times anything.
 */
function parseQuadratic(raw: string): CcdaDocument {
  const pieces: string[] = [];
  let from = 0;
  for (let k = 0; ; k++) {
    const at = entryStart(raw, k);
    if (at === -1) break;
    pieces.push(raw.slice(from, at));
    from = at;
  }
  pieces.push(raw.slice(from));
  return parseCcda(pieces.join(""));
}

/** Both phases, and the self-check, use exactly these fixtures. */
const options: ScalingGateOptions<string, CcdaDocument> = {
  name: "@cosyte/ccda parseCcda",
  parse: (raw) => parseCcda(raw),
  weigh: (doc) => doc.warnings.length + doc.problems.length + 1,
  count: { n: 50, generate: (i) => referralNote(i) },
  size: { inputs: 4, size: 100, generate: (i, size) => ccd(i, size) },
};

describe("the scaling gate: parseCcda", () => {
  it("has not acquired a complexity regression on either axis", () => {
    const report = scalingGate(options);
    // A skip is not a pass: a gate that could not measure says so here, rather than reading green.
    expect(report.count.status, report.count.diagnostic).toBe("measured");
    expect(report.size.status, report.size.diagnostic).toBe("measured");
  });

  it("has fixtures large enough for that gate to fail", () => {
    const report = assertScalingGateFires(options, {
      regressedParse: parseQuadratic,
      equals: (a, b) => a.toString() === b.toString(),
    });
    expect(report.margin).toBeGreaterThan(1);
  });
});
