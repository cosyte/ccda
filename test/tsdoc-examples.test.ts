import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * TSDoc `@example` import gate: **never tell a reader where something lives unless it is there.**
 *
 * Every `@example` block in `src/` ships in the published `.d.ts`, where it is copy-pasteable. An
 * example that writes `import { X } from "@cosyte/ccda"` for a symbol the package entry point does
 * not export hands a consumer an import error, and it is the same defect class as pointing at a
 * coding that is not on the model, aimed at the module graph instead.
 *
 * `docs-content/` snippets are already compiled and executed against the built artifact
 * (`docs-content.test.ts`), but TSDoc examples were ungated, which is how 63 of them shipped naming
 * symbols that are not on the entry point. This resolves each example's import **for real**, through
 * the TypeScript checker, against the same module the specifier names:
 *
 * - `"@cosyte/ccda"` resolves to `src/index.ts`, the package entry point.
 * - a relative specifier (`"./shared.js"`) resolves to that module, so an internal helper documented
 *   with a module-relative import is checked too, and a stale symbol name there fails just as loudly.
 *
 * Type-only and value imports are both covered: `getExportsOfModule` is the checker's own answer, so
 * a `export type { ... }` re-export counts exactly as the consumer experiences it.
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
    expect(imports.filter((i) => i.specifier.startsWith(".")).length).toBeGreaterThan(0);
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
});
