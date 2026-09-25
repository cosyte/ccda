/**
 * Build a spec-clean CCD from typed input, read it back, and show that the emit half is a fixed
 * point: re-parsing and re-serializing the output changes nothing.
 *
 * `buildCcda` emits the six sections a CCD requires, each with the template the specification asks
 * for, so the result reads back with no warning. Every value here is synthetic.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/build-and-round-trip.ts
 */

import assert from "node:assert/strict";

import { buildCcda, parseCcda, requiredSectionKeys } from "@cosyte/ccda";

const xml = buildCcda({
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F", birthTime: "19800101" },
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
  medications: [
    {
      drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" }, // RxNorm
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" }, // NCI Thesaurus
    },
  ],
  allergies: [
    {
      allergen: { code: "7980", displayName: "Penicillin G" }, // RxNorm
      reaction: { code: "247472004", displayName: "Hives" }, // SNOMED CT
    },
  ],
  vitalSigns: [
    {
      vitals: [
        {
          code: { code: "8480-6", displayName: "Systolic blood pressure" }, // LOINC
          quantity: { value: 120, unit: "mm[Hg]" }, // UCUM
        },
      ],
    },
  ],
}).toString();

const doc = parseCcda(xml);
console.log(`Built ${String(doc.documentType)}: ${String(xml.length)} characters of XML`);
console.log("Sections:", doc.sections.map((s) => s.key ?? "(unrecognized)").join(", "));

// An observation value is a discriminated union: switch on `kind` to reach the UCUM quantity.
const systolic = doc.getVitals()[0]?.vitals[0]?.value;
if (systolic?.kind === "physicalQuantity") {
  console.log(`Systolic: ${String(systolic.quantity?.value)} ${String(systolic.quantity?.unit)}`);
}

const fixedPoint = parseCcda(doc.toString()).toString() === xml;
console.log("Re-serialized unchanged:", fixedPoint);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.equal(doc.documentType, "ccd");
assert.equal(doc.getMrn(), "MRN001");
assert.equal(systolic?.kind, "physicalQuantity");
assert.ok(fixedPoint);
// Every section a CCD requires is present, whatever order the builder writes them in.
assert.deepEqual(doc.sections.map((s) => s.key).sort(), [...requiredSectionKeys("ccd")].sort());
assert.equal(doc.warnings.length, 0);
