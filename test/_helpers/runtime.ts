/**
 * Where the suite is running, for the few tests that cannot run on every system and runtime CI
 * covers (Linux, Windows and macOS on Node.js, and Linux under Bun and Deno). Every test skipped
 * with these names its reason beside the skip. The library itself is tested everywhere: what is
 * skipped measures V8 itself, starts Node.js with Node's own flags, or tests this repository's
 * own tooling.
 *
 * @module
 */

/** Bun, which runs JavaScriptCore rather than V8. */
export const ON_BUN: boolean = "Bun" in globalThis;

/** Deno, whose `process.execPath` is the `deno` binary, which takes none of Node's flags. */
export const ON_DENO: boolean = "Deno" in globalThis;

/** Node.js itself: V8's heap statistics and snapshots, and `process.execPath` taking Node's flags. */
export const ON_NODE: boolean = !ON_BUN && !ON_DENO;

/**
 * A mutation run: `vitest.mutation.config.ts` sets `CCDA_MUTATION_RUN`. StrykerJS rewrites the files
 * under `src/` in its sandbox to switch mutants on, so a test that reads their text skips there; it
 * checks what the source says, and runs in `pnpm test` on every pull request.
 */
export const UNDER_MUTATION: boolean = process.env["CCDA_MUTATION_RUN"] === "1";

/** Windows, where `node_modules/.bin/*` and `pnpm` are `.cmd` shims and paths use backslashes. */
export const ON_WINDOWS: boolean = process.platform === "win32";
