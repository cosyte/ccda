/**
 * Property-test code you build on the package with the fast-check generators at
 * `@cosyte/ccda/arbitraries`.
 *
 * `problemSummary` below stands for your own code: it turns a document into one line per problem
 * for a summary screen, and `readType` reads the document type off an inbound message without ever
 * crashing the listener. Each is checked against a stated rule on generated input rather than on
 * the few documents its author thought of:
 *
 * - `documentInit()` generates the input `buildCcda` takes, so the rule "every problem that went in
 *   comes out as a line, in order" is checked against what was built.
 * - `documentText()` generates messy document text a real sender might produce, which the parser
 *   always accepts, and `hostileInput()` generates text it may refuse, which must never crash the
 *   reader.
 * - A rule that is wrong ("every patient has a family name") is caught, and fast-check reports the
 *   seed that replays it and a counterexample that prints as the `buildCcda` call that rebuilds it.
 *
 * Every generated value is synthetic and random: names and identifiers start with `Z`, and codes
 * name no real concept. Each run uses a fixed seed so its output is the same every time.
 *
 * `fast-check` is an optional peer dependency: install it beside `@cosyte/ccda` to use this entry
 * point. Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/property-test-your-code.ts
 */

import assert from "node:assert/strict";

import { buildCcda, CcdaParseError, type CcdaDocument, parseCcda } from "@cosyte/ccda";
import { document, documentInit, documentText, hostileInput } from "@cosyte/ccda/arbitraries";
import fc from "fast-check";

// Your code: one line per problem observation, for a summary screen.
function problemSummary(doc: CcdaDocument): string[] {
  return doc
    .getProblems()
    .flatMap((concern) => concern.problems)
    .map((p) => `${p.value?.code ?? "?"} ${p.value?.displayName ?? "(no name)"}`);
}

// Your code: read the type off an inbound message, or undefined when the parser refuses it.
function readType(raw: string): string | undefined {
  try {
    return parseCcda(raw).documentType;
  } catch (error) {
    if (error instanceof CcdaParseError) return undefined;
    throw error;
  }
}

const SEED = 20260101;

// Rule 1: nothing that went in goes missing, and nothing comes out of order.
const keepsEveryProblem = fc.check(
  fc.property(documentInit(), (init) => {
    const lines = problemSummary(parseCcda(buildCcda(init).toString()));
    const wanted = (init.problems ?? []).map((p) => p.problem.code);
    return JSON.stringify(lines.map((line) => line.split(" ")[0])) === JSON.stringify(wanted);
  }),
  { numRuns: 25, seed: SEED },
);
console.log(
  `Every problem kept: ${keepsEveryProblem.failed ? "failed" : "held"} on ${String(keepsEveryProblem.numRuns)} inputs`,
);

// Rule 2: messy text a real sender produces always parses, so its type is always read.
const readsMessyText = fc.check(
  fc.property(documentText(), (raw) => readType(raw) !== undefined),
  { numRuns: 25, seed: SEED },
);
console.log(
  `Messy text read: ${readsMessyText.failed ? "failed" : "held"} on ${String(readsMessyText.numRuns)} inputs`,
);

// Rule 3: hostile input may be refused, but never crashes the reader.
const refusedCount = { refused: 0 };
const survivesHostileInput = fc.check(
  fc.property(hostileInput(), (raw) => {
    if (readType(raw) === undefined) refusedCount.refused += 1;
  }),
  { numRuns: 50, seed: SEED },
);
console.log(
  `Hostile input survived: ${survivesHostileInput.failed ? "failed" : "held"} on ` +
    `${String(survivesHostileInput.numRuns)} inputs, ${String(refusedCount.refused)} refused`,
);

// A rule that is wrong: a document may leave the patient's family name out.
const wrongRule = fc.check(
  fc.property(document(), (doc) => doc.getPatient()?.name?.family !== undefined),
  { seed: SEED },
);
const counterexample =
  wrongRule.counterexample === null ? "" : fc.stringify(wrongRule.counterexample);
const path = wrongRule.counterexamplePath ?? "";
console.log(
  `Wrong rule caught: seed ${String(wrongRule.seed)}, path of ${String(path.split(":").length)} steps`,
);
console.log(`Counterexample starts: ${counterexample.slice(0, 40)}`);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(keepsEveryProblem.failed, false);
assert.equal(keepsEveryProblem.numRuns, 25);
assert.equal(readsMessyText.failed, false);
assert.equal(survivesHostileInput.failed, false);
assert.ok(refusedCount.refused > 0);
assert.equal(readType("not a document"), undefined);
assert.equal(wrongRule.failed, true);
assert.equal(wrongRule.seed, SEED);
assert.ok(counterexample.startsWith("[buildCcda({"));
// The reported seed and path replay the same, already shrunk, failure.
const replay = fc.check(
  fc.property(document(), (doc) => doc.getPatient()?.name?.family !== undefined),
  { seed: wrongRule.seed, path, endOnFailure: true },
);
assert.equal(replay.failed, true);
assert.equal(fc.stringify(replay.counterexample), counterexample);
