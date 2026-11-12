/**
 * Check coded values against a terminology service you supply, through the `TerminologyAdapter`
 * contract, on read and on build.
 *
 * The package bundles no licensed terminology, so you hand `parseCcda` an adapter. The one here is
 * an in-process `Set` of known codes per code system, standing in for your own service: it opens no
 * socket. On read, a code the adapter says is not a member raises `SEMANTIC_CODE_INVALID` and the
 * document's own code is kept exactly as sent, never corrected. A code system the adapter does not
 * cover gets `undefined`, "no opinion", and stays silent.
 *
 * On build, the optional `translate` method lets `buildCcda` write the codings your map declares as
 * `<translation>` alternates beside the primary code, never in place of it, and they read back on
 * `CD.translation`.
 *
 * The input is the synthetic CCD from `examples/data/ccd.ts`, once as written and once with its
 * problem code swapped for an invented one.
 *
 * Run from the repository root after `pnpm build`:
 *
 *     pnpm tsx examples/check-codes-with-your-terminology.ts
 */

import assert from "node:assert/strict";

import {
  buildCcda,
  parseCcda,
  type TerminologyAdapter,
  type TerminologyCoding,
  WARNING_CODES,
} from "@cosyte/ccda";

import { SYNTHETIC_CCD } from "./data/ccd.js";

const SNOMED_CT = "2.16.840.1.113883.6.96";
const RXNORM = "2.16.840.1.113883.6.88";
const ICD_10_CM = "2.16.840.1.113883.6.90";

// Your terminology service, reduced to the codes this example needs. Each key is the code system
// OID exactly as a C-CDA `@codeSystem` carries it.
const known = new Map<string, ReadonlySet<string>>([
  [SNOMED_CT, new Set(["59621000"])],
  [RXNORM, new Set(["314076"])],
]);

// One declared mapping, for the build half: a SNOMED CT problem to its ICD-10-CM code.
const toIcd10: Record<string, TerminologyCoding> = {
  "59621000": { system: ICD_10_CM, code: "I10", display: "Essential (primary) hypertension" },
};

const asked: string[] = [];
const adapter: TerminologyAdapter = {
  validateCode: (coding) => {
    asked.push(coding.code);
    const codes = coding.system === undefined ? undefined : known.get(coding.system);
    if (codes === undefined) return undefined; // not a system we cover: no opinion
    return { result: codes.has(coding.code) };
  },
  translate: (coding) => {
    const target = coding.system === SNOMED_CT ? toIcd10[coding.code] : undefined;
    return { matches: target === undefined ? [] : [target] }; // unmapped: nothing, never a guess
  },
};

const isSemanticWarning = (code: string): boolean => code === WARNING_CODES.SEMANTIC_CODE_INVALID;

// Read 1: every code the adapter covers is known, and the route's NCI Thesaurus code is outside
// what it covers, so nothing is raised.
const clean = parseCcda(SYNTHETIC_CCD, { terminology: adapter });
console.log(`Codes the parser asked the adapter about: ${asked.join(", ")}`);
console.log(`Clean document warnings: ${String(clean.warnings.length)}`);

// Read 2: the same document with an invented problem code the adapter does not know.
const invented = "99999999";
const withUnknownCode = SYNTHETIC_CCD.replace('code="59621000"', `code="${invented}"`);
assert.notEqual(withUnknownCode, SYNTHETIC_CCD);
const flagged = parseCcda(withUnknownCode, { terminology: adapter });
const semantic = flagged.warnings.filter((w) => isSemanticWarning(w.code));
for (const w of semantic) console.log(`Warning ${w.code}: ${w.message}`);
const keptCode = flagged.getProblems()[0]?.problems[0]?.value?.code;
console.log(`Problem code as the document sent it: ${String(keptCode)}`);

// Build: the mapped ICD-10-CM code is written beside the SNOMED CT one, and reads back.
const built = parseCcda(
  buildCcda(
    {
      patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F" },
      effectiveTime: "20240101",
      problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
    },
    { terminology: adapter },
  ).toString(),
);
const builtValue = built.getProblems()[0]?.problems[0]?.value;
const translations = builtValue?.translation ?? [];
console.log(
  `Built problem: ${String(builtValue?.code)}, with translation ${translations
    .map((t) => `${String(t.code)} (${String(t.codeSystem)})`)
    .join(", ")}`,
);

// The checks that make this file a test: `pnpm examples` fails if any of them does not hold.
assert.ok(asked.includes("59621000"));
assert.ok(asked.includes("314076"));
assert.ok(asked.includes("C38288")); // asked, answered "no opinion", and silent
assert.equal(clean.warnings.length, 0);
assert.equal(semantic.length, 1);
assert.equal(keptCode, invented);
// Only the swapped code was flagged: the medication beside it still passed.
assert.equal(flagged.getMedications()[0]?.drug?.code, "314076");
assert.equal(builtValue?.code, "59621000");
assert.deepEqual(
  translations.map((t) => [t.code, t.codeSystem]),
  [["I10", ICD_10_CM]],
);
