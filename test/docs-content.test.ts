import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  docSnippetSuite,
  extractRunnableSnippets,
  runSnippet,
} from "@cosyte/vitest-config/snippets";

import {
  compileEach,
  compileErrors,
  documentLiterals,
  fences,
  pageBlocks,
  runnableTaggedFences,
  section,
} from "./_helpers/first-use.js";
import * as firstUseFixtures from "./__fixtures__/first-use.js";

/**
 * Doc/code-agreement gate. Every TypeScript and JavaScript sample on a hand-written page of
 * `docs-content/` **and** every ```` ```ts runnable ```` block in `README.md` is extracted and
 * executed, and its inline `// =>` assertions are checked, so a documented example can never
 * silently drift from the shipped code (the documentation analog of the parser conformance
 * runners). Blocks tagged ` ```ts runnable throws ` must throw. A sample that cannot run says why in
 * its fence (` ```ts no-run <reason> `), and a test below refuses a sample that does neither. The
 * harness strips types without checking them, so a second test below compiles every TypeScript
 * sample against the package's types.
 *
 * The pages under `docs-content/api/` are generated from the TSDoc comments in `src/`, and their
 * `@example` blocks are fragments written for an editor's tooltip, so only the top-level pages are
 * passed to the sweep.
 *
 * `README.md` is covered **here rather than in a file of its own** on purpose. The hook below spawns
 * `pnpm build` to provision `dist/`, Vitest runs test FILES in parallel, and two files each spawning
 * a `tsup` build would race on the same output directory. One file, one build, one temp directory.
 * The README's `## Usage` block is the one an npm reader and an agent both lift verbatim, so it is
 * held to the same standard as a docs page and `requireSnippet` refuses a green run in which that
 * block has gone missing or lost its `runnable` tag.
 *
 * Every snippet imports `@cosyte/ccda`, or its optional `@cosyte/ccda/arbitraries` subpath, and
 * resolves against the **built** ESM artifact, exactly what an installer loads, not the source tree.
 * The built subpath imports `@cosyte/ccda` by name, which resolves to the same built entry point, so
 * a sample never mixes two copies of a class. The runnable blocks stay on the deterministic,
 * in-process reader/serializer (`parseCcda`, `serializeCcda`, the UCUM validators) and the
 * generators; nothing here opens a socket or reads a real feed, and every C-CDA document in the
 * docs is synthetic (an invented patient, fake OIDs).
 *
 * The shared CI gate runs `test` before `build`, so we provision `dist/` on demand here rather than
 * assuming order.
 */
const root = join(import.meta.dirname, "..");

/** Map the published entry point to its built ESM artifact. */
const ENTRY = join(root, "dist", "index.mjs");

/** Map the optional `@cosyte/ccda/arbitraries` subpath to its built ESM artifact. */
const ARBITRARIES = join(root, "dist", "arbitraries.mjs");

/** The published README, which ships inside the npm tarball and is the npm package page. */
const README = join(root, "README.md");

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 180_000);

const DOCS_DIR = join(root, "docs-content");

/** The hand-written pages: every `.md` file at the top of `docs-content/`, not the generated `api/`. */
const PAGES = readdirSync(DOCS_DIR)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => join(DOCS_DIR, name));

/**
 * `every` runs each TypeScript and JavaScript sample whether or not it is tagged `runnable`, and
 * lists a `no-run` sample as skipped with its reason. It reaches the runner as a variable rather
 * than a literal so the line compiles against a `@cosyte/vitest-config` that predates the option;
 * such a runner ignores it and runs the `runnable` blocks, which is every sample here that can run,
 * as the test below holds.
 */
const pageSuite = {
  files: PAGES,
  every: true,
  resolve: (specifier: string) =>
    specifier === "@cosyte/ccda"
      ? ENTRY
      : specifier === "@cosyte/ccda/arbitraries"
        ? ARBITRARIES
        : undefined,
};
docSnippetSuite(pageSuite);

docSnippetSuite({
  name: "doc/code agreement (README)",
  files: [README],
  requireSnippet: true,
  resolve: (specifier) => (specifier === "@cosyte/ccda" ? ENTRY : undefined),
});

/**
 * The README's `## Status` section names the release line this package is on (`The 0.1 line` for any
 * 0.1.x), and a version stated in prose is exactly the fact that goes stale without anyone noticing:
 * the section it replaced claimed `0.0.3` while `package.json` was already twelve patches past it.
 * The line is therefore checked against `package.json` rather than trusted, so a release that moves
 * to a new minor line and forgets the page fails here instead of on npm, where a README is frozen at
 * publish.
 */
describe("README status section", () => {
  test("names the release line package.json is on", () => {
    const pkg: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const version =
      typeof pkg === "object" && pkg !== null && "version" in pkg && typeof pkg.version === "string"
        ? pkg.version
        : undefined;
    expect(version, "package.json declares no string version").toBeDefined();

    const status = /^## Status\n([\s\S]*?)\n## /m.exec(readFileSync(README, "utf8"))?.[1];
    expect(status, "no `## Status` section found in README.md").toBeDefined();
    const line = (version ?? "").split(".").slice(0, 2).join(".");
    expect(status).toContain(`**The \`${line}\` line.**`);
  });
});

/**
 * The two FIRST-USE examples, the quickstart's first block and the first block under the README's
 * `## Usage`, are the ones a reader runs first. Each must be the block a sweep above executes, each
 * is run again here with a changed value to prove the run can go red, and every C-CDA document
 * literal either one prints must be a byte-for-byte copy of a fixture embedded in
 * `test/__fixtures__/first-use.ts`, whose XML `pnpm phi-scan` reads. Temp modules for these runs live
 * in their own directory inside the root, as the harness requires, and are removed when the file is
 * done.
 */
const resolveEntry = (specifier: string): string | undefined =>
  specifier === "@cosyte/ccda" ? ENTRY : undefined;
const FIRST_USE_TMP = join(root, ".cosyte-first-use-snippets");
/**
 * The snippet harness strips types without checking them, so compiling is checked separately, the
 * way a reader's new TypeScript project compiles the block, against the source entry point the
 * bundler compiles into the published types. A program over the source takes seconds to check, so
 * these cases state their own budget.
 */
const SOURCE_PATHS = {
  "@cosyte/ccda": join(root, "src", "index.ts"),
  "@cosyte/ccda/arbitraries": join(root, "src", "arbitraries", "index.ts"),
};
const COMPILE_TIMEOUT = 60_000;
/** The embedded first-use fixtures, by value: a document literal must be exactly one of them. */
const FIRST_USE_FIXTURES: ReadonlySet<string> = new Set(Object.values(firstUseFixtures));
const QUICKSTART_TEXT = readFileSync(join(root, "docs-content", "quickstart.md"), "utf8");
const README_TEXT = readFileSync(README, "utf8");
const FIRST_USE = [
  {
    doc: "docs-content/quickstart.md",
    fence: fences(QUICKSTART_TEXT)[0],
    snippets: extractRunnableSnippets(QUICKSTART_TEXT),
    claim: 'doc.getMrn(); // => "MRN-00042"',
    claimMutated: 'doc.getMrn(); // => "MRN-00043"',
  },
  {
    doc: "README.md",
    fence: fences(section(README_TEXT, "## Usage"))[0],
    snippets: extractRunnableSnippets(README_TEXT),
    claim: 'doc.getMrn(); // => "MRN001"',
    claimMutated: 'doc.getMrn(); // => "MRN002"',
  },
] as const;

afterAll(() => {
  rmSync(FIRST_USE_TMP, { recursive: true, force: true });
});

describe("the first-use examples", () => {
  for (const example of FIRST_USE) {
    const acRun = example.doc === "README.md" ? "AC-CC2" : "AC-CC1";

    test(`${acRun}: the first block of ${example.doc} is one the sweep executes, and it runs`, async () => {
      expect(example.fence?.lang).toBe("ts");
      expect(example.fence?.tags).toContain("runnable");
      expect(example.fence?.tags).not.toContain("throws");
      const executed = example.snippets.find((s) => s.code === example.fence?.body);
      expect(
        executed,
        `${example.doc}: the first block is not among the executed ones`,
      ).toBeDefined();
      if (executed === undefined) return;
      await runSnippet(executed, { resolve: resolveEntry, tmpDir: FIRST_USE_TMP });
    });

    test(
      `${acRun}: the first block of ${example.doc} compiles in a new TypeScript project`,
      () => {
        expect(compileErrors(root, SOURCE_PATHS, example.fence?.body ?? "")).toEqual([]);
      },
      COMPILE_TIMEOUT,
    );

    test(
      `${acRun}: a first block of ${example.doc} that does not compile is reported, so it turns this suite red`,
      () => {
        const code = example.fence?.body ?? "";
        expect(code.split(example.claim).length - 1).toBe(1);
        const broken = example.claim.replace("doc.getMrn()", "doc.getMrnn()");
        expect(compileErrors(root, SOURCE_PATHS, code.replace(example.claim, broken))).toEqual([
          expect.stringMatching(/TS2551|TS2339/),
        ]);
      },
      COMPILE_TIMEOUT,
    );

    test(`AC-CC4: a changed claimed value in the first block of ${example.doc} turns it red`, async () => {
      const code = example.fence?.body ?? "";
      expect(code.split(example.claim).length - 1).toBe(1);
      const mutated = code.replace(example.claim, example.claimMutated);
      await expect(
        runSnippet(mutated, { resolve: resolveEntry, tmpDir: FIRST_USE_TMP }),
      ).rejects.toThrow();
    });

    test(`AC-CC5: every document literal in the first block of ${example.doc} is a committed fixture`, () => {
      for (const literal of documentLiterals(example.fence?.body ?? "")) {
        expect(
          FIRST_USE_FIXTURES.has(literal),
          `${example.doc}: a document literal is no fixture`,
        ).toBe(true);
      }
    });
  }

  test("AC-CC4: a changed input value in the first block of README.md turns it red", async () => {
    const code = FIRST_USE[1].fence?.body ?? "";
    expect(code.split('mrn: "MRN001"').length - 1).toBe(1);
    const mutated = code.replace('mrn: "MRN001"', 'mrn: "MRN002"');
    await expect(
      runSnippet(mutated, { resolve: resolveEntry, tmpDir: FIRST_USE_TMP }),
    ).rejects.toThrow();
  });

  test("AC-CC5: the quickstart's first block reads exactly one document, and a changed value leaves the corpus", async () => {
    const code = FIRST_USE[0].fence?.body ?? "";
    expect(documentLiterals(code)).toHaveLength(1);
    expect(code.split('extension="MRN-00042"').length - 1).toBe(1);
    const mutated = code.replace('extension="MRN-00042"', 'extension="MRN-00043"');
    expect(FIRST_USE_FIXTURES.has(documentLiterals(mutated)[0] ?? "")).toBe(false);
    await expect(
      runSnippet(mutated, { resolve: resolveEntry, tmpDir: FIRST_USE_TMP }),
    ).rejects.toThrow();
  });
});

/**
 * A fence tagged `runnable` is a claim that something executes it. The two sweeps above execute
 * every TypeScript block so tagged in `docs-content/` and `README.md`; a block tagged `runnable` in
 * any other language is extracted by nothing, so it is named here instead of passing silently.
 */
function markdownUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownUnder(full));
    else if (/\.mdx?$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/** `file:line` for every runnable-tagged fence in `markdown` that the snippet harness does not extract. */
function unexecutedRunnableFences(file: string, markdown: string): string[] {
  const tagged = runnableTaggedFences(markdown);
  const unexecuted = tagged
    .filter((f) => !["ts", "typescript", "tsx"].includes(f.lang.toLowerCase()))
    .map((f) => `${file}:${String(f.line)}`);
  if (unexecuted.length === 0 && tagged.length !== extractRunnableSnippets(markdown).length) {
    unexecuted.push(
      `${file}: tagged ${String(tagged.length)}, extracted ${String(extractRunnableSnippets(markdown).length)}`,
    );
  }
  return unexecuted;
}

describe("a runnable tag is an execution that happens", () => {
  test("AC-CC3: every runnable-tagged block in README.md and docs-content/ is executed", () => {
    const files = [README, ...markdownUnder(join(root, "docs-content"))];
    const unexecuted = files.flatMap((file) =>
      unexecutedRunnableFences(relative(root, file), readFileSync(file, "utf8")),
    );
    expect(unexecuted).toEqual([]);
  });

  test("AC-CC3: a runnable-tagged block no sweep executes is named by file and line", () => {
    const fence = "```";
    const planted = `# Page\n\n${fence}js runnable\nconst x = 1;\n${fence}\n\n${fence}ts runnable\nconst y = 2;\n${fence}\n`;
    expect(unexecutedRunnableFences("planted.md", planted)).toEqual(["planted.md:3"]);
  });
});

/**
 * The README's `## Usage` block PRINTS its key results, and the page shows what it prints in a
 * `text` block right after it. That output block is a claim too, so it is checked the way a reader
 * would check it: the block is run as a program, as-is apart from the one specifier rewritten to
 * the built entry point, and its stdout must be the output block byte for byte. A negative control
 * changes the input MRN and the printed output has to change with it, so a runner that executed
 * nothing could not pass.
 */
describe("the README usage example prints exactly what the page says it prints", () => {
  const TSX = join(root, "node_modules", ".bin", "tsx");
  const SPECIFIER = '"@cosyte/ccda"';
  const USAGE_TMP = join(root, ".cosyte-usage-stdout");

  afterAll(() => {
    rmSync(USAGE_TMP, { recursive: true, force: true });
  });

  function runAsProgram(
    code: string,
    name: string,
  ): { status: number | null; stdout: string; stderr: string } {
    expect(code.split(SPECIFIER).length - 1, "the block imports @cosyte/ccda exactly once").toBe(1);
    mkdirSync(USAGE_TMP, { recursive: true });
    const file = join(USAGE_TMP, name);
    writeFileSync(file, code.replace(SPECIFIER, JSON.stringify(pathToFileURL(ENTRY).href)), "utf8");
    const run = spawnSync(TSX, [file], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      timeout: 60_000,
    });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  }

  test("is followed by the text block holding its output", () => {
    const blocks = fences(section(README_TEXT, "## Usage"));
    expect(blocks.map((block) => block.lang).slice(0, 2)).toEqual(["ts", "text"]);
  });

  test("runs as a program and prints the text block byte for byte", () => {
    const [code, shown] = fences(section(README_TEXT, "## Usage"));
    const run = runAsProgram(code?.body ?? "", "usage-stdout.mts");
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`${shown?.body ?? ""}\n`);
  }, 60_000);

  test("CONTROL: a changed input value changes what it prints", () => {
    const [code, shown] = fences(section(README_TEXT, "## Usage"));
    const body = code?.body ?? "";
    expect(body.split('mrn: "MRN001"').length - 1).toBe(1);
    const run = runAsProgram(body.replace('mrn: "MRN001"', 'mrn: "MRN002"'), "usage-control.mts");
    expect(run.status).toBe(0);
    expect(run.stdout).not.toBe(`${shown?.body ?? ""}\n`);
    expect(run.stdout).toContain("ccd MRN002 Doe");
  }, 60_000);
});

/** The fence languages that make a block a code sample. */
const SAMPLE_LANGS = new Set(["ts", "typescript", "tsx", "js", "javascript", "mjs"]);

/** Every code sample on the hand-written pages, labelled `page.md:line`. */
const PAGE_SAMPLES = PAGES.flatMap((path) =>
  pageBlocks(readFileSync(path, "utf8"))
    .filter((block) => SAMPLE_LANGS.has(block.lang))
    .map((block) => ({ ...block, label: `${relative(DOCS_DIR, path)}:${String(block.line)}` })),
);

/** The words after `no-run` in a fence, or undefined when the fence carries no `no-run`. */
function noRunReason(tags: readonly string[]): string | undefined {
  const at = tags.indexOf("no-run");
  return at === -1 ? undefined : tags.slice(at + 1).join(" ");
}

/**
 * A sample that runs and a sample that says why it cannot are the only two kinds. Each label names
 * a sample that is neither: untagged (so today's runner skips it), tagged `runnable` and `no-run`
 * at once, or `no-run` with no reason.
 */
export function unaccountedSamples(
  samples: readonly { label: string; tags: readonly string[] }[],
): string[] {
  return samples
    .filter((sample) => {
      const reason = noRunReason(sample.tags);
      return sample.tags.includes("runnable") ? reason !== undefined : !reason;
    })
    .map((sample) => sample.label);
}

describe("every sample on a hand-written page", () => {
  test("there are samples to check", () => {
    expect(PAGE_SAMPLES.length).toBeGreaterThan(40);
  });

  test("runs, or names in its fence why it cannot", () => {
    expect(unaccountedSamples(PAGE_SAMPLES)).toEqual([]);
  });

  test("an untagged sample, a runnable no-run and a no-run with no reason are each named", () => {
    expect(
      unaccountedSamples([
        { label: "a.md:1", tags: [] },
        { label: "b.md:1", tags: ["runnable"] },
        { label: "c.md:1", tags: ["runnable", "no-run", "why"] },
        { label: "d.md:1", tags: ["no-run"] },
        { label: "e.md:1", tags: ["no-run", "it", "opens", "a", "socket"] },
        { label: "f.md:1", tags: ["runnable", "throws"] },
      ]),
    ).toEqual(["a.md:1", "c.md:1", "d.md:1"]);
  });

  test(
    "compiles in a new TypeScript project against the package's types, when it runs",
    () => {
      const typed = PAGE_SAMPLES.filter(
        (sample) =>
          ["ts", "typescript", "tsx"].includes(sample.lang) &&
          noRunReason(sample.tags) === undefined,
      );
      expect(typed.length).toBeGreaterThan(40);
      const errors = compileEach(
        root,
        SOURCE_PATHS,
        typed.map((_, index) => `docs-sample-${String(index)}`),
        typed.map((sample) => sample.body),
      );
      const failing = typed.flatMap((sample, index) =>
        (errors[index] ?? []).map((error) => `${sample.label}: ${error}`),
      );
      expect(failing).toEqual([]);
    },
    COMPILE_TIMEOUT,
  );

  test(
    "a sample that does not compile is named with its error",
    () => {
      const errors = compileEach(
        root,
        SOURCE_PATHS,
        ["docs-sample-good", "docs-sample-bad"],
        [
          'import { parseCcda } from "@cosyte/ccda";\nparseCcda("<x/>").documentType;',
          'import { parseCcda } from "@cosyte/ccda";\nparseCcda("<x/>").documentTypo;',
        ],
      );
      expect(errors[0]).toEqual([]);
      expect(errors[1]).toEqual([expect.stringMatching(/^line 2: TS(2551|2339)/)]);
    },
    COMPILE_TIMEOUT,
  );
});

/**
 * The built package loads `@xmldom/xmldom` the first time something needs it, not when it is
 * imported: a parse of a document the compact reader reads never loads it, nor does writing that
 * document's XML, nor an edit of it, which is made on that XML's text. Checked here because this file is the one that builds `dist/`,
 * in both built entry points and in a fresh process for each, since a module once loaded stays
 * loaded for the life of its process. The CommonJS loader's cache holds `@xmldom/xmldom` once
 * anything has required it, from either build.
 */
describe("the built package loads @xmldom/xmldom on first use", () => {
  const probe = [
    'import { createRequire } from "node:module";',
    "const [entry, xml] = process.argv.slice(1);",
    "const require = createRequire(entry);",
    'const loaded = () => Object.keys(require.cache).some((key) => key.includes("@xmldom"));',
    'const ccda = entry.endsWith(".cjs") ? require(entry) : await import(entry);',
    "const afterImport = loaded();",
    "const doc = ccda.parseCcda(xml);",
    "const afterParse = loaded();",
    "doc.toString();",
    "const afterWrite = loaded();",
    "ccda.editCcda(doc);",
    "console.log(JSON.stringify({ afterImport, afterParse, afterWrite, afterEdit: loaded() }));",
  ].join("\n");

  test.each(["index.mjs", "index.cjs"])("dist/%s", (entry) => {
    const out = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        probe,
        join(root, "dist", entry),
        firstUseFixtures.QUICKSTART_CCD,
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(out)).toEqual({
      afterImport: false,
      afterParse: false,
      afterWrite: false,
      afterEdit: false,
    });
  });
});
