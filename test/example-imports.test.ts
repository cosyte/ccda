/**
 * Every `@example` import under `src/` resolves to a real export, and the check that says so fails
 * when one does not.
 *
 * 0.1.3 shipped 65 imports in 61 `@example` blocks that named `@cosyte/ccda` for helpers the entry
 * point never exported. The check is `scripts/check-example-imports.ts`, which reads each
 * `@example` with the TypeScript compiler's JSDoc parser and its code with the TypeScript parser,
 * so a multi-line named import, a default import and a namespace import are all seen. The fixture
 * under `test/__fixtures__/example-imports/` carries one unresolved import per form, and a clean
 * file beside it, so a check that stopped reading any one form would go red here.
 */

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SELF_SUBPATHS,
  checkExampleImports,
  sourceFiles,
} from "../scripts/check-example-imports.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const FIXTURE = join(REPO_ROOT, "test", "__fixtures__", "example-imports");

const fixture = (file: string): ReturnType<typeof checkExampleImports> =>
  checkExampleImports({
    root: FIXTURE,
    files: [join(FIXTURE, file)],
    selfName: "@cosyte/ccda",
    selfEntry: join(FIXTURE, "index.ts"),
  });

describe("the @example import check", () => {
  it("passes every example under src/", { timeout: 30_000 }, () => {
    // A full program over src/ is type-checked, which takes a few seconds on a loaded runner.
    const report = checkExampleImports({
      root: REPO_ROOT,
      files: sourceFiles(join(REPO_ROOT, "src")),
      selfName: "@cosyte/ccda",
      selfEntry: join(REPO_ROOT, "src", "index.ts"),
      selfSubpaths: SELF_SUBPATHS,
    });
    expect(report.findings).toEqual([]);
    expect(report.examples).toBeGreaterThan(300);
    expect(report.imports).toBeGreaterThan(300);
  });

  it("passes a fixture whose imports all resolve, in every form", () => {
    const report = fixture("clean.ts");
    expect(report.findings).toEqual([]);
    expect(report.examples).toBe(2);
    expect(report.imports).toBe(4);
  });

  it(
    "reads a subpath entry point as public, and checks imports of it against its exports",
    {
      timeout: 30_000,
    },
    () => {
      // Two programs are type-checked, each a few seconds on a loaded runner under coverage.
      const options = {
        root: FIXTURE,
        files: [join(FIXTURE, "subpath.ts")],
        selfName: "@cosyte/ccda",
        selfEntry: join(FIXTURE, "index.ts"),
      };
      const withSubpath = checkExampleImports({
        ...options,
        selfSubpaths: { "@cosyte/ccda/extra": join(FIXTURE, "subpath.ts") },
      });
      expect(withSubpath.findings.map((f) => [f.line, f.specifier, f.name ?? null])).toEqual([
        [6, "@cosyte/ccda/extra", "notOnTheSubpath"],
        [19, "./subpath.js", null],
      ]);
      // Without the subpath named, the package's own subpath is not a module the check can read.
      expect(checkExampleImports(options).findings.map((f) => [f.line, f.specifier])).toEqual([
        [6, "@cosyte/ccda/extra"],
      ]);
    },
  );

  it("fails on each form of an import that does not resolve", () => {
    const report = fixture("broken.ts");
    expect(report.examples).toBe(5);
    expect(report.findings.map((f) => [f.line, f.specifier, f.name ?? null])).toEqual([
      [7, "@cosyte/ccda", "internalHelper"],
      [17, "@cosyte/ccda", "notExportedAnywhere"],
      [30, "@cosyte/ccda", "default"],
      [30, "./clean.js", "MissingType"],
      [41, "./gone.js", null],
      [41, "@cosyte/not-a-package", null],
      [41, "./nowhere.js", null],
      [53, "./broken.js", null],
    ]);
    expect(report.findings.at(-1)?.message).toContain("public export");
  });
});
