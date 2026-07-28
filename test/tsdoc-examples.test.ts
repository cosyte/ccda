import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * TSDoc `@example` import gate: **never tell a reader where something lives unless it is there.**
 *
 * An example that writes `import { X } from "@cosyte/ccda"` for a symbol the package entry point
 * does not export hands a consumer an import error. It is the same defect class as pointing at a
 * coding that is not on the model, aimed at the module graph instead. 64 examples did exactly that.
 *
 * **Be precise about which of them a consumer could ever have seen, because the loose claim is
 * false.** `tsup` rolls the declarations up, and a declaration the entry point does not reach is
 * dropped from `dist/index.d.ts` **with its TSDoc**. Measured against the previous release: of the
 * 64, **four** reached the published `.d.ts` and **60 never shipped at all** (of every `export
 * function` in `parser/warnings.ts` and `model/entries/shared.ts`, exactly two survive the rollup).
 * The 60 were wrong in the repo rather than wrong on npm. So this file gates two different things:
 *
 * 1. **Source truth, for every example.** Each import is resolved **for real**, through the
 *    TypeScript checker, against the module its specifier names: `"@cosyte/ccda"` against
 *    `src/index.ts`, a relative specifier (`"./shared.js"`) against that module. A stale symbol
 *    fails either way. Type-only and value imports are both covered, because
 *    `getExportsOfModule` is the checker's own answer.
 *
 * 2. **Published truth, for what actually ships.** A relative specifier is meaningless inside the
 *    rolled-up `.d.ts`, so no example carrying one may survive into it. This is the half that
 *    catches the move this very slice made twice: **exporting a previously internal symbol drags
 *    its TSDoc into the published surface**, and if that TSDoc still said `"./shared.js"` the defect
 *    would reopen silently. Check 1 cannot see that, because it is a statement about the bundle.
 *    Note the predicate is "reaches `dist`", not "is on the entry point": both
 *    `BuildCcdaAssessmentScale` types shipped while unexported, because `BuildCcdaInit` references
 *    them, and they were two of the four that reached consumers.
 */

const root = join(import.meta.dirname, "..");
const srcDir = join(root, "src");
const entry = join(srcDir, "index.ts");

/** One `import { … } from "…"` written inside a TSDoc comment. */
interface ExampleImport {
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly symbols: readonly string[];
}

const program = ts.createProgram({
  rootNames: [entry],
  options: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  },
});
const checker = program.getTypeChecker();

/** The names a module exports, per the checker (values and types alike). */
function exportsOf(filePath: string): ReadonlySet<string> {
  const source = program.getSourceFile(filePath);
  if (source === undefined) throw new Error(`not in program: ${filePath}`);
  const symbol = checker.getSymbolAtLocation(source);
  if (symbol === undefined) throw new Error(`not a module: ${filePath}`);
  return new Set(checker.getExportsOfModule(symbol).map((s) => s.getName()));
}

/** Every `import { … } from "…"` appearing in a TSDoc comment under `src/`. */
function collectExampleImports(): readonly ExampleImport[] {
  const out: ExampleImport[] = [];
  // `import { a, b } from "spec";` written as a TSDoc continuation line (` * import …`).
  const pattern = /^\s*\*\s*import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)";/;
  for (const source of program.getSourceFiles()) {
    const file = source.fileName;
    if (!file.startsWith(srcDir) || file.endsWith(".d.ts")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      const match = pattern.exec(text);
      if (match === null) return;
      const symbols = (match[1] ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^type\s+/, ""))
        .filter((s) => s.length > 0);
      if (symbols.length === 0) return;
      out.push({ file, line: index + 1, specifier: match[2] ?? "", symbols });
    });
  }
  return out;
}

/** Resolve an example's specifier to the source file it names, or `undefined` when unresolvable. */
function moduleFor(imp: ExampleImport): string | undefined {
  if (imp.specifier === "@cosyte/ccda") return entry;
  if (!imp.specifier.startsWith(".")) return undefined;
  const asTs = resolve(dirname(imp.file), imp.specifier.replace(/\.js$/, ".ts"));
  return program.getSourceFile(asTs) === undefined ? undefined : asTs;
}

describe("TSDoc @example imports", () => {
  const imports = collectExampleImports();

  it("finds the examples it is meant to guard", () => {
    // A guard that silently matched nothing would pass forever. Both halves must be non-empty.
    expect(imports.length).toBeGreaterThan(200);
    expect(imports.filter((i) => i.specifier === "@cosyte/ccda").length).toBeGreaterThan(150);
    // 60 module-relative examples exist by construction (the internal helpers whose declarations
    // the rollup drops), so a bound of "> 0" would survive losing almost all of them.
    expect(imports.filter((i) => i.specifier.startsWith(".")).length).toBeGreaterThan(50);
  });

  it("names only symbols the module it cites actually exports", () => {
    const cache = new Map<string, ReadonlySet<string>>();
    const broken: string[] = [];

    for (const imp of imports) {
      const modulePath = moduleFor(imp);
      if (modulePath === undefined) {
        broken.push(
          `${relative(root, imp.file)}:${imp.line} imports from unresolvable "${imp.specifier}"`,
        );
        continue;
      }
      let names = cache.get(modulePath);
      if (names === undefined) {
        names = exportsOf(modulePath);
        cache.set(modulePath, names);
      }
      const missing = imp.symbols.filter((s) => !names.has(s));
      if (missing.length > 0) {
        broken.push(
          `${relative(root, imp.file)}:${imp.line} imports ${missing.join(", ")} from ` +
            `"${imp.specifier}", which does not export ${missing.length === 1 ? "it" : "them"}`,
        );
      }
    }

    expect(broken).toEqual([]);
  });

  describe("the published .d.ts", () => {
    // The shared CI gate runs `test` before `build`, so provision `dist/` on demand here rather
    // than assuming order, exactly as the docs-content snippet gate does.
    beforeAll(() => {
      execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
    }, 300_000);

    it("carries no documented import a consumer cannot resolve", () => {
      // A relative specifier is meaningless once the declarations are rolled up into one file:
      // there is no `./shared.js` next to an installed `dist/index.d.ts`. Only the package's own
      // name can appear. This is what fails if a future slice exports an internal symbol and drags
      // its module-relative example onto the published surface with it.
      const dts = readFileSync(join(root, "dist", "index.d.ts"), "utf8").split("\n");
      const offenders = dts
        .map((text, index) => ({ text, line: index + 1 }))
        .filter(({ text }) => /^\s*\*\s*import\s+(?:type\s+)?\{[^}]*\}\s+from\s+"/.test(text))
        .filter(({ text }) => !/from\s+"@cosyte\/ccda";/.test(text))
        .map(({ text, line }) => `dist/index.d.ts:${line} ${text.trim()}`);

      expect(offenders).toEqual([]);
    });

    it("still carries the examples this is meant to guard", () => {
      // Guards the guard: if the rollup ever stopped emitting TSDoc, the check above would pass
      // vacuously forever.
      const dts = readFileSync(join(root, "dist", "index.d.ts"), "utf8");
      const shipped = dts.match(/^\s*\*\s*import\s+(?:type\s+)?\{[^}]*\}\s+from\s+"/gm) ?? [];
      expect(shipped.length).toBeGreaterThan(100);
    });
  });
});
