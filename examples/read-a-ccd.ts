/**
 * Read a C-CDA a sending system handed you: the document type, the patient, and the reconciliation
 * triad (problems, medications, allergies) as typed values.
 *
 * `examples/data/ccd.ts` holds a synthetic Continuity of Care Document (an invented patient, fake
 * OIDs), copied from the repository's test fixtures. Every coded value keeps the code system it was
 * sent with, and nothing absent is defaulted.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/read-a-ccd.ts
 */

import assert from "node:assert/strict";

import { parseCcda } from "@cosyte/ccda";

import { SYNTHETIC_CCD } from "./data/ccd.js";

const doc = parseCcda(SYNTHETIC_CCD);
const patient = doc.getPatient();

console.log(`Document type: ${String(doc.documentType)}`);
console.log(`Patient: ${patient?.name?.given?.join(" ") ?? ""} ${String(patient?.name?.family)}`);
console.log(`MRN: ${String(doc.getMrn())}`);

for (const concern of doc.getProblems()) {
  for (const problem of concern.problems) {
    console.log(
      `Problem: ${String(problem.value?.displayName)} (${String(problem.value?.code)}), concern ${String(concern.status)}`,
    );
  }
}
for (const med of doc.getMedications()) {
  console.log(
    `Medication: ${String(med.drug?.displayName)} (RxNorm ${String(med.drug?.code)}),`,
    `${String(med.dose?.raw)} ${String(med.dose?.unit)} ${String(med.route?.displayName)}`,
  );
}
for (const concern of doc.getAllergies()) {
  for (const allergy of concern.allergies) {
    console.log(
      allergy.noKnownAllergy === true
        ? "Allergies: none known (a negated entry, not an empty list)"
        : `Allergy: ${String(allergy.allergen?.displayName)}`,
    );
  }
}
console.log("Warnings:", doc.warnings.length);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(doc.documentType, "ccd");
assert.equal(doc.getMrn(), "MRN-00042");
assert.equal(patient?.name?.family, "Doe");
assert.deepEqual(
  doc.getProblems().flatMap((c) => c.problems.map((p) => p.value?.code)),
  ["59621000"],
);
assert.deepEqual(
  doc.getMedications().map((m) => [m.drug?.code, m.route?.code]),
  [["314076", "C38288"]],
);
assert.equal(doc.getAllergies()[0]?.allergies[0]?.noKnownAllergy, true);
assert.equal(doc.warnings.length, 0);
