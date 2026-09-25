/**
 * Read a vendor-quirky document leniently, then refuse the same document in strict mode.
 *
 * The input is the synthetic CCD from `examples/data/ccd.ts` with the medication's `routeCode`
 * removed, which is how some sending systems emit it. The lenient default still reads the
 * medication, leaves the route absent rather than defaulting it, and reports the deviation as a
 * stable warning code with its position. `{ strict: true }` turns the same deviation into a thrown
 * `CcdaParseError` carrying the same code.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/lenient-and-strict.ts
 */

import assert from "node:assert/strict";

import { CcdaParseError, parseCcda } from "@cosyte/ccda";

import { SYNTHETIC_CCD } from "./data/ccd.js";

// The same document as a sender that leaves out the medication route transmits it.
const withoutRoute = SYNTHETIC_CCD.replace(/\s*<routeCode [^>]*\/>/, "");
assert.notEqual(withoutRoute, SYNTHETIC_CCD);

const lenient = parseCcda(withoutRoute);
const medication = lenient.getMedications()[0];
const route = medication?.route === undefined ? "absent, never defaulted" : "present";
console.log(`Medication still read: ${String(medication?.drug?.code)}, route ${route}`);
for (const w of lenient.warnings) {
  console.log(`Warning ${w.code} at line ${String(w.position?.line)}: ${w.message}`);
}

let refusedWith = "";
try {
  parseCcda(withoutRoute, { strict: true });
} catch (error) {
  if (!(error instanceof CcdaParseError)) throw error;
  refusedWith = error.code;
}
console.log(`Strict mode refused it with ${refusedWith}`);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(medication?.drug?.code, "314076");
assert.equal(medication?.route, undefined);
assert.deepEqual(
  lenient.warnings.map((w) => w.code),
  ["MISSING_ROUTE_CODE"],
);
assert.equal(refusedWith, "MISSING_ROUTE_CODE");
assert.equal(parseCcda(SYNTHETIC_CCD).warnings.length, 0);
