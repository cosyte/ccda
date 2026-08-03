/**
 * Tests for scripts/attw.mjs, the wrapper that makes the `attw` publish gate
 * report its own failure.
 *
 * WHAT THESE PIN, AND WHY EACH ONE IS HERE:
 *
 *  1. THE UPSTREAM BEHAVIOUR THE WRAPPER EXISTS FOR. `attw` prints "This package
 *     does not contain types." and exits **0**. If a future `attw` upgrade fixes
 *     that exit code or rewords the sentence, this test reds, which is the point.
 *     A guard that silently stops matching is worse than no guard, and this is
 *     the one net in `attw.mjs` that depends on a string.
 *  2. That the wrapper turns that exit 0 into a failure.
 *  3. That the preflight catches a declared-but-missing artifact. That is the
 *     shape reachable in this repo on every build: `tsup` writes JS before
 *     declarations, so `dist/` holds `index.mjs` and no `index.d.ts` for a
 *     measurable interval.
 *  4. A NEGATIVE CONTROL. On a package whose tarball really does carry types,
 *     the wrapper is transparent: same exit status as `attw` itself, and green.
 *     A gate that only ever fails is not a gate, and a false red here would cost
 *     every later run an hour.
 *  5. THE GATE'S MOST BASIC OBLIGATION, that a real `attw` failure still fails.
 *     Without this, every other test here would pass on a wrapper that swallowed
 *     attw's own exit status, because net 2 reds the untyped fixture regardless.
 *  6. The refusals that keep net 2 readable. Each of these argument and config
 *     routes was measured against this repo's pinned `attw` to make the untyped
 *     sentence unreadable and hand back exit 0, which is the exact false green
 *     this file exists to close.
 *
 * A TEST THAT ONLY SHOWS GREEN-ON-A-GOOD-PACK PROVES NOTHING, so cases 1, 2 and
 * 3 each run the OLD behaviour and the NEW one against the same fixture and
 * assert they differ. Case 1 is bare `attw` on a tarball with no types (exit 0,
 * the false green); case 2 is the wrapper on that same fixture (non-zero).
 *
 * The fixtures are minimal throwaway packages in a temp dir. Nothing about this
 * repo's own build, so the test does not need one and cannot race one. That
 * isolation is load-bearing rather than tidy: this repo's `dist/` is shared
 * mutable state that a parallel worker or a concurrent `pnpm build` can empty
 * underneath a running test, which is the very condition the wrapper exists to
 * report. `attw` is invoked with `--no-definitely-typed` so the runs stay
 * offline; the wrapper forwards arguments, which is what makes that possible.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no
 * shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const WRAPPER = join(REPO_ROOT, "scripts", "attw.mjs");
const ATTW_BIN = join(REPO_ROOT, "node_modules", ".bin", "attw");
const UNTYPED = "This package does not contain types.";
const OFFLINE = ["--no-definitely-typed"];
// Each case shells out to `attw --pack`, which runs a real `npm pack`; two of
// those in one test comfortably exceeds this suite's 10s default.
const SPAWN_TIMEOUT = 120_000;

interface RunResult {
  code: number;
  out: string;
}

function run(bin: string, args: string[], cwd: string): RunResult {
  const r = spawnSync(bin, args, { cwd, encoding: "utf8", timeout: 100_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const runAttw = (cwd: string, extra: string[] = []): RunResult =>
  run(ATTW_BIN, ["--pack", ".", ...OFFLINE, ...extra], cwd);
const runWrapper = (cwd: string, args: string[] = OFFLINE): RunResult =>
  run(process.execPath, [WRAPPER, ...args], cwd);

let root: string;

/** A package whose declaration file exists on disk but is left out of `files`. */
let typesNotPacked: string;
/** A package whose `package.json` points at a `dist/` that was never built. */
let noBuild: string;
/** A well-formed dual ESM/CJS package: the negative control. */
let wellFormed: string;
/** A package with a real attw problem: `require` resolves to ESM. */
let attwFails: string;
/** Declarations present, JS entry point missing. attw itself is green on this. */
let jsMissing: string;
/** A declaration file that exists and is zero bytes. attw is green on this too. */
let emptyDecl: string;

function writePkg(dir: string, pkg: Record<string, unknown>, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "attw-gate-"));

  typesNotPacked = join(root, "types-not-packed");
  writePkg(
    typesNotPacked,
    {
      name: "attw-gate-fixture-unpacked",
      version: "1.0.0",
      main: "./index.js",
      types: "./index.d.ts",
      files: ["index.js"],
    },
    { "index.js": "module.exports = {};\n", "index.d.ts": "export declare const a: number;\n" },
  );

  // Shaped like this package: dual ESM/CJS with per-condition types, pointing at
  // a `dist/` that does not exist. This is the tsup window, frozen.
  noBuild = join(root, "no-build");
  writePkg(
    noBuild,
    {
      name: "attw-gate-fixture-nobuild",
      version: "1.0.0",
      type: "module",
      main: "./dist/index.cjs",
      module: "./dist/index.mjs",
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          import: { types: "./dist/index.d.ts", default: "./dist/index.mjs" },
          require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
        },
        "./package.json": "./package.json",
      },
      files: ["dist"],
    },
    {},
  );

  wellFormed = join(root, "well-formed");
  writePkg(
    wellFormed,
    {
      name: "attw-gate-fixture-wellformed",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": {
          import: { types: "./index.d.ts", default: "./index.js" },
          require: { types: "./index.d.cts", default: "./index.cjs" },
        },
      },
      files: ["index.js", "index.d.ts", "index.cjs", "index.d.cts"],
    },
    {
      "index.js": "export const a = 1;\n",
      "index.d.ts": "export declare const a: number;\n",
      "index.cjs": "module.exports.a = 1;\n",
      "index.d.cts": "export declare const a: number;\n",
    },
  );

  // ESM-only, with no `require` condition: attw's strict profile reports
  // CJSResolvesToESM and exits non-zero of its own accord.
  attwFails = join(root, "attw-fails");
  writePkg(
    attwFails,
    {
      name: "attw-gate-fixture-problem",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
      files: ["index.js", "index.d.ts"],
    },
    { "index.js": "export const a = 1;\n", "index.d.ts": "export declare const a: number;\n" },
  );

  jsMissing = join(root, "js-missing");
  writePkg(
    jsMissing,
    {
      name: "attw-gate-fixture-jsmissing",
      version: "1.0.0",
      main: "./dist/index.js",
      types: "./index.d.ts",
      files: ["index.d.ts"],
    },
    { "index.d.ts": "export declare const a: number;\n" },
  );

  emptyDecl = join(root, "empty-decl");
  writePkg(
    emptyDecl,
    {
      name: "attw-gate-fixture-emptydecl",
      version: "1.0.0",
      main: "./index.js",
      types: "./index.d.ts",
      files: ["index.js", "index.d.ts"],
    },
    { "index.js": "module.exports = {};\n", "index.d.ts": "" },
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("attw's own exit code (the reason this wrapper exists)", () => {
  it(
    "reports an untyped pack and still exits 0",
    () => {
      const r = runAttw(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      // If this ever fails because the status is now non-zero, attw has fixed
      // the early return in getExitCode() and net 2 of scripts/attw.mjs is
      // redundant. Read that file's header before deleting anything.
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "reports an unbuilt dual ESM/CJS package as untyped and still exits 0",
    () => {
      // The old `attw --pack .` invocation, against this package's own shape,
      // in the state every build passes through. This is the false green.
      const r = runAttw(noBuild);
      expect(r.out).toContain(UNTYPED);
      expect(r.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("scripts/attw.mjs", () => {
  it(
    "fails when the tarball carries no types, where attw exits 0",
    () => {
      const r = runWrapper(typesNotPacked);
      expect(r.out).toContain(UNTYPED);
      expect(r.code).not.toBe(0);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails, naming the file, when a declared artifact was never built",
    () => {
      const r = runWrapper(noBuild);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.d.ts");
      expect(r.out).toContain("missing");
      // The preflight must name every promised path, not just the first: on
      // this package that is all four artifacts.
      for (const rel of [
        "./dist/index.cjs",
        "./dist/index.mjs",
        "./dist/index.d.ts",
        "./dist/index.d.cts",
      ]) {
        expect(r.out).toContain(rel);
      }
      // `./package.json` is in the tarball by definition and must not be
      // reported as a missing artifact.
      expect(r.out).not.toContain("./package.json (missing)");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "fails on a declaration file that exists and is zero bytes",
    () => {
      // The preflight checks non-emptiness as well as existence, and this is the
      // case that makes the second half worth having. Measured: a truncated
      // declaration is a SECOND false green, and a quieter one than the missing
      // file, because attw finds a types entry point, reports "No problems
      // found" and exits 0 over a package that declares nothing at all.
      const bare = runAttw(emptyDecl);
      expect(bare.out).toContain("No problems found");
      expect(bare.code).toBe(0);

      const r = runWrapper(emptyDecl);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./index.d.ts");
      expect(r.out).toContain("empty");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "does not claim attw would have said 'untyped' when only JS is missing",
    () => {
      // Measured: with the declarations intact, bare attw reports no problems
      // and exits 0 on this fixture. The preflight still reds it, but must not
      // tell the reader something about attw's behaviour that is false here.
      const bare = runAttw(jsMissing);
      expect(bare.out).toContain("No problems found");
      expect(bare.code).toBe(0);
      const r = runWrapper(jsMissing);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("./dist/index.js");
      expect(r.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "still fails when attw itself fails, with attw's own status",
    () => {
      const bare = runAttw(attwFails);
      expect(bare.code).not.toBe(0);
      expect(bare.out).not.toContain(UNTYPED);
      const wrapped = runWrapper(attwFails);
      expect(wrapped.code).toBe(bare.code);
    },
    SPAWN_TIMEOUT,
  );

  it(
    "is transparent on a package that really does ship types",
    () => {
      const bare = runAttw(wellFormed);
      const wrapped = runWrapper(wellFormed);
      expect(bare.out).not.toContain(UNTYPED);
      expect(wrapped.code).toBe(bare.code);
      expect(wrapped.code).toBe(0);
    },
    SPAWN_TIMEOUT,
  );
});

describe("the refusals that keep the post-check readable", () => {
  // MOST of these were measured against this repo's pinned attw to make bare
  // attw exit 0 with the untyped sentence unreadable, on the very fixture whose
  // tarball carries no types: `--quiet`, `-q`, `--format json`, `--format=json`,
  // `-f json`, `-fjson` and `-Pq` all do. Two are refused without being blinding
  // routes, and saying so matters more than a tidy sentence:
  //   * `--config-path` by inference. It would move the config file out of view.
  //   * `-f=json` is a USAGE ERROR, not a blinding route. Measured: bare attw
  //     exits 1 with "argument '=json' is invalid", because commander treats the
  //     `=` as part of the value for an attached short form. It is refused here
  //     anyway, because the refusal is by option name and not by value, which is
  //     the whole point of that design. Do not promote it to a measured route.
  it.each([
    ["--quiet", ["--quiet"]],
    ["-q", ["-q"]],
    ["--format json", ["--format", "json"]],
    ["-f json", ["-f", "json"]],
    ["--format=json", ["--format=json"]],
    ["--config-path", ["--config-path", "other.json"]],
    // THE ATTACHED-VALUE SHORT FORM. commander reads `-fjson` as `-f json`, so
    // it blinds the post-check exactly as `-f json` does. A whole-token test
    // (`split("=")[0]`) misses it, which is how it reached exit 0 on this repo's
    // real manifest before the guard was widened to read the cluster's letters.
    ["-fjson", ["-fjson"]],
    ["-f=json", ["-f=json"]],
    // A short cluster: `-Pq` is `-P -q`, so the `q` still has to be seen.
    ["-Pq", ["-Pq"]],
  ])("refuses %s", (_name, extra) => {
    const r = runWrapper(typesNotPacked, [...OFFLINE, ...extra]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("attw gate");
    expect(r.out).not.toContain("🌟");
  });

  it(
    "leaves a legitimate short option alone",
    () => {
      // The refusal reads a single-dash token's letters, so it must not swallow
      // the short forms that blind nothing. `-P` is `--pack`, which this script
      // passes anyway; the run should reach attw and behave as the unadorned
      // wrapper does on this fixture (net 2 fires, not the argument refusal).
      const r = runWrapper(typesNotPacked, [...OFFLINE, "-P"]);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(UNTYPED);
      expect(r.out).not.toContain("refused wholesale");
    },
    SPAWN_TIMEOUT,
  );

  it(
    "measures that -fjson really does blind bare attw",
    () => {
      // The refusal above is only worth having if this is true. Without it the
      // new case would be pinning an arbitrary string.
      const bare = runAttw(typesNotPacked, ["-fjson"]);
      expect(bare.code).toBe(0);
      expect(bare.out).not.toContain(UNTYPED);
    },
    SPAWN_TIMEOUT,
  );

  it.each([
    ["quiet", { quiet: true }],
    ["format", { format: "json" }],
  ])(
    "refuses a .attw.json that sets %s, which bare attw obeys into a false green",
    (key, config) => {
      const dir = join(root, `config-blinded-${key}`);
      writePkg(
        dir,
        {
          name: `attw-gate-fixture-configblind-${key}`,
          version: "1.0.0",
          main: "./index.js",
          types: "./index.d.ts",
          files: ["index.js"],
        },
        {
          "index.js": "module.exports = {};\n",
          "index.d.ts": "export declare const a: number;\n",
          ".attw.json": JSON.stringify(config),
        },
      );
      // Bare attw takes the config and goes silent: exit 0 over an untyped pack.
      const bare = runAttw(dir);
      expect(bare.code).toBe(0);
      expect(bare.out).not.toContain(UNTYPED);

      const r = runWrapper(dir);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(".attw.json");
    },
    SPAWN_TIMEOUT,
  );
});
