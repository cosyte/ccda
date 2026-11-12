/**
 * Check coded values against the value sets C-CDA binds them to, with expansions you hold.
 *
 * `valueSetBindings()` is the package's declaration of which value set each checked slot is bound
 * to and how strongly. Member codes are licensed data, so you supply a `ValueSetSource`: a
 * `release` naming your expansion package and an `isMember` that answers `member`, `not-a-member`
 * or `no-expansion`. The source here holds one expansion, the medication route value set, as an
 * in-process `Set` standing in for your own package.
 *
 * Read with that source, a route outside the expansion at a Required binding raises
 * `VALUE_SET_BINDING_VIOLATED`, naming the value set and your release, and the document's own code
 * is kept as sent. A Required binding whose value set you do not hold raises
 * `VALUE_SET_BINDING_NOT_EVALUATED` rather than passing in silence.
 *
 * The input is the synthetic CCD from `examples/data/ccd.ts`, once as written and once with its
 * route swapped for another NCI Thesaurus route code.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/check-value-set-membership.ts
 */

import assert from "node:assert/strict";

import {
  parseCcda,
  type ValueSetSource,
  valueSetBinding,
  valueSetBindings,
  WARNING_CODES,
} from "@cosyte/ccda";

import { SYNTHETIC_CCD } from "./data/ccd.js";

const ROUTE_VALUE_SET = valueSetBinding("route").valueSet;
const RELEASE = "example-value-set-package-2026.1";

for (const b of valueSetBindings()) {
  console.log(`Slot ${b.slot}: ${b.strength} binding to ${b.valueSet} (${b.conformanceId})`);
}

// Your value-set package, reduced to one expansion. Every other value set: not held.
const routeExpansion = new Set(["C38288"]);
const valueSets: ValueSetSource = {
  release: RELEASE,
  isMember: ({ valueSet, coding }) => {
    if (valueSet !== ROUTE_VALUE_SET) return { membership: "no-expansion" };
    return { membership: routeExpansion.has(coding.code) ? "member" : "not-a-member" };
  },
};

const codesOf = (doc: ReturnType<typeof parseCcda>): string[] => doc.warnings.map((w) => w.code);

// No source supplied: nothing is asked and nothing is inferred.
const unchecked = parseCcda(SYNTHETIC_CCD);
console.log(`Without a source: ${String(unchecked.warnings.length)} warnings`);

// The document as written: its oral route is in the expansion.
const asWritten = parseCcda(SYNTHETIC_CCD, { valueSets });
console.log(`As written: ${codesOf(asWritten).join(", ")}`);

// The same document with a route the expansion does not contain.
const swapped = SYNTHETIC_CCD.replace('code="C38288"', 'code="C38276"');
assert.notEqual(swapped, SYNTHETIC_CCD);
const flagged = parseCcda(swapped, { valueSets });
const violation = flagged.warnings.find((w) => w.code === WARNING_CODES.VALUE_SET_BINDING_VIOLATED);
console.log(
  `Route swapped: ${String(violation?.code)} for ${String(violation?.valueSet)}, ` +
    `release ${String(violation?.valueSetRelease)}`,
);
const keptRoute = flagged.getMedications()[0]?.route?.code;
console.log(`Route as the document sent it: ${String(keptRoute)}`);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(valueSetBinding("route").strength, "required");
assert.equal(valueSetBinding("problem").strength, "preferred");
assert.equal(unchecked.warnings.length, 0);
// The route passed. The medication and vaccine value sets are not held, so each is reported,
// never assumed fine.
assert.deepEqual(codesOf(asWritten), [
  WARNING_CODES.VALUE_SET_BINDING_NOT_EVALUATED,
  WARNING_CODES.VALUE_SET_BINDING_NOT_EVALUATED,
]);
assert.equal(violation?.valueSet, ROUTE_VALUE_SET);
assert.equal(violation?.valueSetRelease, RELEASE);
assert.equal(keptRoute, "C38276");
assert.equal(
  codesOf(flagged).filter((c) => c === WARNING_CODES.VALUE_SET_BINDING_VIOLATED).length,
  1,
);
