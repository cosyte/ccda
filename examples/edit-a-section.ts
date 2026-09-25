/**
 * Edit a document: replace one section and add another, and get back a CDA R2 revision of the
 * source.
 *
 * `editCcda` rebuilds only the sections you name and carries every other section through byte for
 * byte. By default the result is a new version of the source document: a new id, the same
 * version-series `setId`, `versionNumber` incremented, and a `relatedDocument` of type `RPLC`
 * naming the version it replaces. The input is the synthetic CCD from `examples/data/ccd.ts`.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/edit-a-section.ts
 */

import assert from "node:assert/strict";

import { editCcda, parseCcda } from "@cosyte/ccda";

import { SYNTHETIC_CCD } from "./data/ccd.js";

const source = parseCcda(SYNTHETIC_CCD);

const revised = editCcda(source, {
  sections: [
    // Replace the whole Medications section.
    {
      kind: "medications",
      mode: "replace",
      content: [
        {
          drug: { code: "197361", displayName: "Amlodipine 5 MG Oral Tablet" }, // RxNorm
          dose: { value: 1, unit: "{tablet}" },
          route: { code: "C38288", displayName: "Oral" }, // NCI Thesaurus
        },
      ],
    },
    // Add a section the source did not carry.
    {
      kind: "familyHistory",
      content: [
        {
          relative: { relationship: { code: "72705000", displayName: "Mother" } },
          observations: [{ condition: { code: "73211009", displayName: "Diabetes mellitus" } }],
        },
      ],
    },
  ],
});

console.log(
  `Version ${String(revised.header.versionNumber)}, replaces the source:`,
  revised.header.relatedDocuments[0]?.typeCode,
);
console.log(
  "Medications now:",
  revised.getMedications().map((m) => m.drug?.displayName),
);
console.log(
  "Problems carried through:",
  revised.getProblems().flatMap((c) => c.problems.map((p) => p.value?.code)),
);
console.log("Family history entries:", revised.getFamilyHistory().length);
console.log("Warnings:", revised.warnings.length);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(revised.header.versionNumber, 2);
assert.equal(revised.header.relatedDocuments[0]?.typeCode, "RPLC");
assert.deepEqual(
  revised.getMedications().map((m) => m.drug?.code),
  ["197361"],
);
assert.deepEqual(
  revised.getProblems().flatMap((c) => c.problems.map((p) => p.value?.code)),
  ["59621000"],
);
assert.equal(revised.getFamilyHistory().length, 1);
assert.equal(revised.warnings.length, 0);
