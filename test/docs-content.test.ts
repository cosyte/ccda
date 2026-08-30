import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, test } from "vitest";

import { docSnippetSuite } from "@cosyte/vitest-config/snippets";

/**
 * Doc/code-agreement gate. Every ```` ```ts runnable ```` block in `docs-content/` **and in
 * `README.md`** is extracted, compiled, and executed, and its inline `// =>` assertions are checked,
 * so a documented example can never silently drift from the shipped code (the documentation analog of
 * the parser conformance runners). Blocks tagged ` ```ts runnable throws ` must throw; plain
 * ` ```ts ` blocks are illustrative and are not executed.
 *
 * `README.md` is covered **here rather than in a file of its own** on purpose. The hook below spawns
 * `pnpm build` to provision `dist/`, Vitest runs test FILES in parallel, and two files each spawning
 * a `tsup` build would race on the same output directory. One file, one build, one temp directory.
 * The README's `## Usage` block is the one an npm reader and an agent both lift verbatim, so it is
 * held to the same standard as a docs page and `requireSnippet` refuses a green run in which that
 * block has gone missing or lost its `runnable` tag.
 *
 * `@cosyte/ccda` ships a single top-level entry, so every snippet imports `@cosyte/ccda` and resolves
 * against the **built** ESM artifact, exactly what an installer loads, not the source tree. The
 * runnable blocks stay on the deterministic, in-process reader/serializer (`parseCcda`,
 * `serializeCcda`, the UCUM validators); nothing here opens a socket or reads a real feed, and every
 * C-CDA document in the docs is synthetic (an invented patient, fake OIDs).
 *
 * The shared CI gate runs `test` before `build`, so we provision `dist/` on demand here rather than
 * assuming order.
 */
const root = join(import.meta.dirname, "..");

/** Map the published entry point to its built ESM artifact. */
const ENTRY = join(root, "dist", "index.mjs");

/** The published README, which ships inside the npm tarball and is the npm package page. */
const README = join(root, "README.md");

beforeAll(() => {
  execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}, 180_000);

docSnippetSuite({
  docsDir: join(root, "docs-content"),
  resolve: (specifier) => (specifier === "@cosyte/ccda" ? ENTRY : undefined),
});

docSnippetSuite({
  name: "doc/code agreement (README)",
  files: [README],
  requireSnippet: true,
  resolve: (specifier) => (specifier === "@cosyte/ccda" ? ENTRY : undefined),
});

/**
 * The README's `## Status` section states the version this package declares, and a version stated in
 * prose is exactly the fact that goes stale without anyone noticing: the section it replaced claimed
 * `0.0.3` while `package.json` was already twelve patches past it. The number is therefore checked
 * against `package.json` rather than trusted, so a release that moves the version and forgets the
 * page fails here instead of on npm, where a README is frozen at publish.
 */
describe("README status section", () => {
  test("states the version package.json declares", () => {
    const pkg: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const version =
      typeof pkg === "object" && pkg !== null && "version" in pkg && typeof pkg.version === "string"
        ? pkg.version
        : undefined;
    expect(version, "package.json declares no string version").toBeDefined();

    const status = /^## Status\n([\s\S]*?)\n## /m.exec(readFileSync(README, "utf8"))?.[1];
    expect(status, "no `## Status` section found in README.md").toBeDefined();
    expect(status).toContain(`\`${version ?? ""}\``);
  });
});
