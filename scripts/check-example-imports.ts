/**
 * Checks that every import an `@example` block writes resolves to a real export.
 *
 * Each `@example` is read with the TypeScript compiler's own JSDoc parser, and its code is parsed
 * with the TypeScript parser, never matched with a regular expression. So every import form is
 * seen: a named import on one line or across several, `import X from`, `import * as X from`,
 * `import type`, a side-effect import, `export ... from`, `import X = require(...)`, and a dynamic
 * `import(...)` or `require(...)` call.
 *
 * A specifier resolves when it names this package (`@cosyte/ccda`, which is checked against the
 * entry point `src/index.ts`, the module a consumer's import reaches), a path relative to the file
 * the example sits in, or a module TypeScript itself can resolve (`node:fs`, a dependency). Every
 * named binding must then be an export of that module, and a default import needs a default
 * export. An example whose import does not resolve is a finding, and any finding fails the run.
 *
 * One more rule follows from where a consumer reads an example. The doc comment of a declaration
 * the entry point exports is copied into the published `dist/index.d.ts`, where a path relative to
 * a source file means nothing, so an example on a public declaration may not import a relative
 * path: it has to reach what it uses through `@cosyte/ccda`. An example on an internal helper,
 * which only a reader of this repository sees, imports it from its own module by relative path.
 *
 *     pnpm check:example-imports
 *
 * `test/example-imports.test.ts` runs the same check over `src/` inside `pnpm test`, and proves it
 * fails on a fixture that cites an import that does not resolve.
 */

import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/** One `@example` import that does not resolve. */
export interface ExampleImportFinding {
  /** The source file the `@example` sits in, relative to the root the check was given. */
  readonly file: string;
  /** The 1-based line of the doc comment that holds the `@example`. */
  readonly line: number;
  /** The module specifier the example imports from. */
  readonly specifier: string;
  /** The binding that is not exported, or `undefined` when the module itself does not resolve. */
  readonly name: string | undefined;
  /** What is wrong, in one sentence. */
  readonly message: string;
}

/** What {@link checkExampleImports} reads. */
export interface ExampleImportOptions {
  /** The directory paths in findings are relative to. */
  readonly root: string;
  /** The `.ts` files whose doc comments are checked. */
  readonly files: readonly string[];
  /** The package name examples import this package by, and the entry point it resolves to. */
  readonly selfName: string;
  readonly selfEntry: string;
}

/** The result of one check. */
export interface ExampleImportReport {
  /** How many `@example` blocks were read. */
  readonly examples: number;
  /** How many import specifiers were checked across them. */
  readonly imports: number;
  readonly findings: readonly ExampleImportFinding[];
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  esModuleInterop: true,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  types: ["node"],
};

/** Every `/** ... *\/` comment in a source file, with its start offset. */
function docComments(source: ts.SourceFile): { pos: number; text: string }[] {
  const seen = new Set<number>();
  const out: { pos: number; text: string }[] = [];
  const text = source.getFullText();
  const collect = (ranges: readonly ts.CommentRange[] | undefined): void => {
    for (const range of ranges ?? []) {
      if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia || seen.has(range.pos)) continue;
      const body = text.slice(range.pos, range.end);
      if (!body.startsWith("/**") || body.startsWith("/**/")) continue;
      seen.add(range.pos);
      out.push({ pos: range.pos, text: body });
    }
  };
  // Every comment is leading or trailing trivia of some token, so visiting every token, the
  // end-of-file token included, finds every comment however the file is laid out.
  const visit = (node: ts.Node): void => {
    collect(ts.getLeadingCommentRanges(text, node.pos));
    collect(ts.getTrailingCommentRanges(text, node.end));
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return out.sort((a, b) => a.pos - b.pos);
}

/**
 * The text of each `@example` tag in one doc comment, read by the compiler's JSDoc parser: the
 * comment is attached to a probe declaration and its tags are read back off that declaration.
 */
function exampleBlocks(comment: string): string[] {
  const probe = ts.createSourceFile(
    "probe.ts",
    `${comment}\nexport const __probe = 0;\n`,
    ts.ScriptTarget.Latest,
    true,
  );
  const statement = probe.statements[0];
  if (statement === undefined) return [];
  return ts
    .getJSDocTags(statement)
    .filter((tag) => tag.tagName.text === "example")
    .map((tag) => ts.getTextOfJSDocComment(tag.comment) ?? "");
}

/** An example's code with its Markdown fence lines blanked, so line numbers are kept. */
function exampleCode(block: string): string {
  return block
    .split("\n")
    .map((line) => (line.trimStart().startsWith("```") ? "" : line))
    .join("\n");
}

interface CitedImport {
  readonly specifier: string;
  /** Named bindings (`default` for a default import); empty for a namespace or side-effect form. */
  readonly names: readonly string[];
}

/**
 * The offsets of the doc comments attached to a declaration the entry point exports, directly or
 * through a re-export: the comments that reach the published type declarations.
 */
function publicDocComments(checker: ts.TypeChecker, entry: ts.Symbol): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const exported of checker.getExportsOfModule(entry)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    for (const decl of symbol.declarations ?? []) {
      const file = decl.getSourceFile().fileName;
      const hosts: ts.Node[] = [decl];
      // A `const` carries its doc comment on the enclosing statement.
      if (ts.isVariableDeclaration(decl)) hosts.push(decl.parent.parent);
      for (const host of hosts) {
        for (const doc of ts.getJSDocCommentsAndTags(host)) {
          if (!ts.isJSDoc(doc)) continue;
          const set = out.get(file) ?? new Set<number>();
          set.add(doc.pos);
          out.set(file, set);
        }
      }
    }
  }
  return out;
}

/** Every module an example's code reaches, with the names it takes from each. */
function citedImports(code: string): CitedImport[] {
  const source = ts.createSourceFile("example.ts", code, ts.ScriptTarget.Latest, true);
  const out: CitedImport[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: string[] = [];
      const clause = node.importClause;
      if (clause?.name !== undefined) names.push("default");
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text);
      }
      out.push({ specifier: node.moduleSpecifier.text, names });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const names: string[] = [];
      const clause = node.exportClause;
      if (clause !== undefined && ts.isNamedExports(clause)) {
        for (const el of clause.elements) names.push((el.propertyName ?? el.name).text);
      }
      out.push({ specifier: node.moduleSpecifier.text, names });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      out.push({ specifier: node.moduleReference.expression.text, names: [] });
    } else if (ts.isCallExpression(node)) {
      const arg = node.arguments[0];
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if ((isImport || isRequire) && arg !== undefined && ts.isStringLiteralLike(arg)) {
        out.push({ specifier: arg.text, names: [] });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Checks every `@example` import in `files`. */
export function checkExampleImports(options: ExampleImportOptions): ExampleImportReport {
  const selfEntry = resolve(options.selfEntry);
  const files = options.files.map((f) => resolve(f));
  const program = ts.createProgram({
    rootNames: [...new Set([selfEntry, ...files])],
    options: COMPILER_OPTIONS,
  });
  const checker = program.getTypeChecker();
  const ambient = new Map(
    checker.getAmbientModules().map((s) => [s.getName().replace(/^"|"$/g, ""), s]),
  );

  const moduleSymbol = (specifier: string, fromFile: string): ts.Symbol | undefined => {
    let target: string | undefined;
    if (specifier === options.selfName) {
      target = selfEntry;
    } else {
      const resolved = ts.resolveModuleName(specifier, fromFile, COMPILER_OPTIONS, ts.sys);
      target = resolved.resolvedModule?.resolvedFileName;
    }
    if (target === undefined) return ambient.get(specifier);
    const sf = program.getSourceFile(target);
    return sf === undefined ? undefined : checker.getSymbolAtLocation(sf);
  };

  const entrySymbol = program.getSourceFile(selfEntry);
  const entryModule = entrySymbol && checker.getSymbolAtLocation(entrySymbol);
  if (entryModule === undefined) throw new Error(`could not read the entry point ${selfEntry}`);
  const publicComments = publicDocComments(checker, entryModule);

  let examples = 0;
  let imports = 0;
  const findings: ExampleImportFinding[] = [];
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`could not read ${file}`);
    const rel = relative(options.root, file);
    const publicHere = publicComments.get(source.fileName) ?? new Set<number>();
    for (const comment of docComments(source)) {
      const line = source.getLineAndCharacterOfPosition(comment.pos).line + 1;
      const isPublic = publicHere.has(comment.pos);
      for (const block of exampleBlocks(comment.text)) {
        examples += 1;
        for (const cited of citedImports(exampleCode(block))) {
          imports += 1;
          if (isPublic && cited.specifier.startsWith(".")) {
            findings.push({
              file: rel,
              line,
              specifier: cited.specifier,
              name: undefined,
              message: `"${cited.specifier}" is a relative path in the example of a public export, which ships in the type declarations: import from "${options.selfName}"`,
            });
            continue;
          }
          const symbol = moduleSymbol(cited.specifier, file);
          if (symbol === undefined) {
            findings.push({
              file: rel,
              line,
              specifier: cited.specifier,
              name: undefined,
              message: `"${cited.specifier}" does not resolve to a module`,
            });
            continue;
          }
          const exported = new Set(checker.getExportsOfModule(symbol).map((s) => s.getName()));
          // A CommonJS `export =` module takes any binding under esModuleInterop.
          if (exported.has("export=")) continue;
          for (const name of cited.names) {
            if (exported.has(name)) continue;
            findings.push({
              file: rel,
              line,
              specifier: cited.specifier,
              name,
              message:
                name === "default"
                  ? `"${cited.specifier}" has no default export`
                  : `"${cited.specifier}" does not export ${name}`,
            });
          }
        }
      }
    }
  }
  return { examples, imports, findings };
}

/** Every `.ts` file under `dir`, test files excluded, sorted. */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".ts") && !d.name.endsWith(".test.ts"))
    .map((d) => join(d.parentPath, d.name))
    .sort();
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = checkExampleImports({
    root: REPO_ROOT,
    files: sourceFiles(join(REPO_ROOT, "src")),
    selfName: "@cosyte/ccda",
    selfEntry: join(REPO_ROOT, "src", "index.ts"),
  });
  for (const f of report.findings) console.error(`${f.file}:${String(f.line)}: ${f.message}`);
  if (report.examples === 0) {
    console.error("No @example blocks found under src/: refusing to report a pass.");
    process.exit(1);
  }
  if (report.findings.length > 0) {
    console.error(
      `${String(report.findings.length)} unresolved @example import(s) in ${String(report.examples)} examples`,
    );
    process.exit(1);
  }
  console.log(
    `ok: ${String(report.imports)} imports in ${String(report.examples)} @example blocks all resolve`,
  );
}
