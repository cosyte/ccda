/**
 * AC-1: the conformance run validates EVERY document `buildCcda` emits, which starts with the
 * set it is asked to build.
 *
 * WHY THIS FILE EXISTS. Every other check in this directory grades what the harness does with
 * the documents it was given. None of them can see a document it was never given, and that is
 * the one failure this criterion cannot tolerate: a run over a subset is green, writes "Error-
 * severity results: 0" into the tracked report, and the README publishes that as the builder's
 * measured conformance. It happened. The harness mirrored one of the builder suite's init
 * shapes, four of the shapes it omitted emitted error-severity results, and nothing anywhere
 * could say so.
 *
 * THE SUBJECT IS THE INPUT TYPE, NOT A LIST SOMEBODY MAINTAINS. `BuildCcdaInit` is read through
 * the TypeScript checker, so a field added to the builder is visible here the moment it is
 * added rather than when someone remembers to widen a fixture. A committed list of expected
 * fields would fail the same way the fixture did.
 *
 * NO NETWORK (`testing` T3, and the offline rule the whole harness is split around). This reads
 * a type and an array of object literals. What those documents measure against is `pnpm
 * conformance`'s job.
 */

import { join } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

import { BUILT_DOCUMENT_CASES } from "../__fixtures__/conformance.js";

const ENTRY = join(import.meta.dirname, "..", "..", "src", "index.ts");

/**
 * The fields of `BuildCcdaInit` a case does not have to set, and why each is exempt. Three
 * fields, all of them present in every case by construction rather than by choice: a case
 * without a patient or an effective time is not a document, and `documentType` is the selector
 * the case list is partitioned by (both of its values have cases of their own).
 */
const ALWAYS_SET = new Set(["patient", "effectiveTime", "documentType"]);

/** Every property `BuildCcdaInit` declares, resolved through the checker. */
function initFields(): readonly string[] {
  const program = ts.createProgram([ENTRY], {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
  });
  const source = program.getSourceFile(ENTRY);
  expect(source, `TypeScript could not load the public entry point ${ENTRY}`).toBeDefined();
  const checker = program.getTypeChecker();
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  expect(moduleSymbol, `${ENTRY} did not resolve as a module symbol`).toBeDefined();
  if (moduleSymbol === undefined) return [];
  const init = checker
    .getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.getName() === "BuildCcdaInit");
  expect(init, "BuildCcdaInit is not exported from the package entry point").toBeDefined();
  if (init === undefined) return [];
  return checker
    .getDeclaredTypeOfSymbol(init)
    .getProperties()
    .map((symbol) => symbol.getName())
    .sort();
}

/** Which fields of the input type no built case sets. Pure, so the control below can feed it. */
export function unmeasuredFields(
  fields: readonly string[],
  cases: readonly { readonly init: Readonly<Record<string, unknown>> }[],
  exempt: ReadonlySet<string>,
): readonly string[] {
  const set = new Set<string>();
  for (const entry of cases) {
    for (const [key, value] of Object.entries(entry.init)) {
      if (value !== undefined) set.add(key);
    }
  }
  return fields.filter((field) => !exempt.has(field) && !set.has(field));
}

describe("AC-1: the built-document set covers the whole emit surface", () => {
  it("every field of BuildCcdaInit is set by at least one built case", () => {
    const fields = initFields();
    expect(fields.length).toBeGreaterThan(20);
    expect(
      unmeasuredFields(fields, BUILT_DOCUMENT_CASES, ALWAYS_SET),
      "a field nothing builds is a section nothing measures",
    ).toStrictEqual([]);
  }, 60_000);

  it("both document types the builder emits are built", () => {
    const types = new Set(BUILT_DOCUMENT_CASES.map((entry) => entry.documentType));
    expect([...types].sort()).toStrictEqual(["ccd", "referralNote"]);
  });

  it("every exempt field is a real field of the input type", () => {
    // An exemption that outlives its field is a claim nobody checks. Stated as a test so a
    // renamed field cannot leave a stale excuse behind.
    const fields = new Set(initFields());
    expect([...ALWAYS_SET].filter((field) => !fields.has(field))).toStrictEqual([]);
  }, 60_000);

  it("case names are unique, so the report can be read by document", () => {
    const names = BUILT_DOCUMENT_CASES.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  describe("negative control", () => {
    it("names a field no case sets", () => {
      // The assertion above passes on a healthy tree, so on its own it cannot distinguish a
      // guard that works from one that cannot fail.
      expect(
        unmeasuredFields(["problems", "dischargeInstructions"], BUILT_DOCUMENT_CASES, ALWAYS_SET),
      ).toStrictEqual(["dischargeInstructions"]);
    });

    it("does not count a field whose value is undefined", () => {
      expect(
        unmeasuredFields(["problems"], [{ init: { problems: undefined } }], new Set()),
      ).toStrictEqual(["problems"]);
    });
  });
});
