#!/usr/bin/env node
/**
 * scripts/attw.mjs: the `attw` publish gate, made to report its own failure.
 *
 * WHY THIS WRAPPER EXISTS. `attw` PRINTS "This package does not contain types."
 * AND EXITS 0. That is not a bug in `attw`: an untyped package is a legitimate
 * npm package, so the CLI treats "no types at all" as a *description*, not a
 * problem. From this repo's own pinned `@arethetypeswrong/cli@0.18.4`, in
 * `node_modules/@arethetypeswrong/cli/dist/getExitCode.js`, first statement:
 *
 *     export function getExitCode(analysis, opts) {
 *         if (!analysis.types) {
 *             return 0;
 *         }
 *
 * The problem list is consulted only *after* that early return, so no
 * `--profile`, `--ignore-rules` or config setting can reach it. For a package
 * that ships types, "does not contain types" does not mean "fine, untyped": it
 * means THE TYPES WERE NOT IN THE TARBALL, which is a broken publish. The gate
 * says nothing, and its caller reads the 0.
 *
 * A false red costs an hour. A FALSE GREEN MERGES.
 *
 * WHAT WAS MEASURED HERE, on this package, rather than inherited from the
 * sibling this script is ported from. `@cosyte/terminology` recorded a live
 * false green on 2026-08-01, where its `verify.sh` printed "verify green" on a
 * run whose `attw` step reported "does not contain types". No such run is on
 * record for this repo. What IS on record is that the same false green is
 * reproducible here on demand, against this repo's own `dist/`, with ZERO
 * concurrency, in both states:
 *
 *     rm -rf dist && attw --pack .                  -> "does not contain types", exit 0
 *     rm -f dist/index.d.ts dist/index.d.cts && attw --pack .
 *                                                   -> "does not contain types", exit 0
 *
 * THE RACE ONLY SUPPLIES THE CONDITION; IT IS NOT THE DEFECT. The second state
 * above is the realistic one. `tsup` emits JS in one pass and the declaration
 * files in a later pass, so there is a window in every build of this package
 * where `dist/` holds `index.mjs`/`index.cjs` and no `index.d.ts`. Measured on
 * three consecutive `pnpm build` runs of THIS package by polling for the two
 * files: 1.7 s, 2.4 s and 3.1 s. Quote it as seconds that move with box load,
 * not as a figure: the three runs differed by 80%, and a single number here
 * would be re-measured false by the next reader. A concurrent build or
 * `pnpm clean` in the same working tree lands `attw` in that window. Which is
 * why this is NOT answered with a lock or a build queue: the gate is supposed
 * to be able to tell you its own inputs were missing, whatever removed them.
 *
 * TWO NETS, and they catch different things. Keep both:
 *
 *   1. PREFLIGHT (structural, no string matching). Every relative artifact path
 *      `package.json` promises (`main`, `module`, `types`, `typings`, and every
 *      string leaf of `exports`) must exist and be non-empty before `attw` runs.
 *      On this package that is four paths: `./dist/index.cjs`, `./dist/index.mjs`,
 *      `./dist/index.d.ts` and `./dist/index.d.cts`. This is the net that catches
 *      the window above, and it names the missing file instead of leaving the
 *      reader to infer it.
 *
 *   2. POST-CHECK. If `attw` still reports an untyped package, fail. The
 *      preflight cannot see this case: the declaration files can be present on
 *      disk and still be absent from the tarball, because `files` left them out.
 *      That is the case `attw --pack` exists to catch, and the whole point here
 *      is that it catches it silently. Demonstrated on this package rather than
 *      assumed: with the declarations on disk (so the preflight passes) and
 *      `files` narrowed to the two JS entry points, bare `attw --pack .` prints
 *      the untyped sentence and exits 0, and this script exits 1.
 *
 *      TWO ROUTES REACH IT HERE, AND THE DIFFERENCE IS THE .npmignore's DEPTH,
 *      NOT ITS EXISTENCE. Both measured on this manifest with `npm pack`:
 *        - a ROOT `.npmignore` naming `dist/index.d.ts` / `dist/index.d.cts`
 *          changes nothing. `files` is present and npm gives it precedence, so
 *          the declarations still ship and `attw` still finds types.
 *        - a `dist/.npmignore` naming `index.d.ts` / `index.d.cts` DOES strip
 *          them, because a `.npmignore` inside a directory `files` selected
 *          still filters that directory's contents.
 *      An earlier draft of this header said `files` was the only route and told
 *      the reader not to restore the parenthetical. That was measured false by
 *      the conformance gate on the subdirectory case. Net 2 catches both, since
 *      it reads what `attw` says about the packed tarball rather than reasoning
 *      about how the tarball was assembled.
 *
 *   The post-check matches `attw`'s untyped sentence, which is a plain,
 *   un-chalked string in `dist/render/untyped.js`. That makes it blindable, so
 *   the arguments and config that would blind it are REFUSED rather than
 *   tolerated. See BLINDING below. `test/scripts/attw-gate.test.ts` pins both
 *   nets against the real binary, so if an `attw` upgrade reworks the wording or
 *   fixes the exit code, the suite reds and tells you to revisit this file
 *   rather than letting the net go quietly slack.
 *
 * BLINDING. Nine routes were measured against this repo's pinned `attw`, on an
 * isolated untyped fixture, each restoring the exact false green by making the
 * untyped sentence absent from what this script can read: `--quiet`, `-q`,
 * `--format json`, `--format=json`, `-f json`, `-fjson`, `-Pq`, and a `.attw.json`
 * setting either `quiet` or `format`, which `readConfig()` applies after argv.
 * Every one of the nine printed no untyped sentence and exited 0. All are
 * refused below, along with two that are NOT blinding routes and are refused
 * anyway, because the rule is by option name rather than by value:
 * `--config-path`, which would move the config file out of view (refused by
 * inference, not measurement), and `-f=json`, on which bare `attw` exits 1 with
 * `argument '=json' is invalid`. Bare `attw` exits 0 in the nine measured cases,
 * so refusing is not a regression against the old script: it is the difference
 * between a gate and a gate-shaped thing.
 *
 * `-fjson` IS THE ONE THE SIBLING'S GUARD MISSED, and it is why the refusal
 * below reads a short cluster's letters rather than comparing whole tokens. A
 * first cut of this port carried the sibling's `split("=")[0]` token test over
 * unchanged while claiming refusal "by option name, wholesale"; the conformance
 * gate measured `-fjson` through it, back to exit 0 on this repo's real manifest.
 * The claim was true of the sentence and false of the code. Both are fixed here,
 * rather than the claim being softened to match the hole.
 *
 * The refusal is BY OPTION NAME, WHOLESALE, not by value. `--format table-flipped`
 * still prints the sentence and blinds nothing, and is refused anyway. That is
 * the deliberate trade: value-parsing these would be a third moving part in the
 * guard, and being over-strict about an argument nobody passes to a repo's own
 * publish gate costs less than a route back to a false green.
 *
 * Other arguments are forwarded, so `--profile node16` and friends still work.
 *
 * A THIRD GUARD SITS BEHIND THE TWO NETS, and calling it a net would overstate
 * it: if `attw` exits 0 having printed nothing at all, this script fails rather
 * than passing, because the post-check read nothing and cannot vouch for what it
 * did not see. It is the backstop for a blinding route nobody has enumerated.
 * Do not describe this file as "two nets" without it, and do not illustrate it
 * with `-Pq`: that one IS enumerated, by letter, and a test pins it. The guard's
 * value is precisely that it does not depend on the enumeration being complete.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ATTW_BIN = fileURLToPath(new URL("../node_modules/.bin/attw", import.meta.url));
const UNTYPED = "This package does not contain types.";
const DECLARATION = /\.d\.[cm]?ts$/;
const args = process.argv.slice(2);

const die = (msg) => {
  process.stderr.write(`\n✗ attw gate: ${msg}\n`);
  process.exit(1);
};

// ---- Refuse what would blind the post-check --------------------------------
// BY OPTION NAME, WHOLESALE, AND THAT HAS TO INCLUDE THE ATTACHED-VALUE SHORT
// FORM. Token equality after splitting on `=` catches `--format=json` and
// `-f=json` and MISSES `-fjson`, which commander parses as `-f json` and which
// was measured to restore the exact false green this file exists to close. A
// short option is a CLUSTER (`-Pq` is `-P -q`) and may carry its value attached,
// so the test is over the cluster's letters rather than over the whole token.
//
// Over-strict by construction, and bounded rather than hand-waved: of attw
// 0.18.4's six short options (`-V`, `-P`, `-p`, `-f`, `-q`, `-h`) only `-f`
// takes a value at all, so a `q` or an `f` inside a single-dash token is either
// one of these options or part of `-f`'s own value. There is no third thing for
// it to be, which is why this cannot false-refuse a legitimate short form.
// Long options are still matched by exact name, so `--profile node16` and
// `--from-npm` are untouched.
const BLINDING_LONG = new Set(["--quiet", "--format", "--config-path"]);
const BLINDING_SHORT = new Set(["q", "f"]);
const isBlinding = (a) => {
  const head = a.split("=")[0];
  if (head.startsWith("--")) return BLINDING_LONG.has(head);
  if (head.startsWith("-") && head.length > 1) {
    return [...head.slice(1)].some((c) => BLINDING_SHORT.has(c));
  }
  return false;
};
const blinding = args.filter(isBlinding);
if (blinding.length > 0) {
  die(
    `${blinding.join(", ")} is refused wholesale, by option name and not by value.\n` +
      `  This gate reads attw's printed output, attw exits 0 on an untyped package,\n` +
      `  and some values of these options hide that output. Run it without them.`,
  );
}
try {
  const config = JSON.parse(readFileSync(".attw.json", "utf8"));
  const set = ["quiet", "format"].filter((k) => k in config);
  if (set.length > 0) {
    die(
      `.attw.json sets ${set.join(", ")}. These keys are refused wholesale, by name and\n` +
        `  not by value: readConfig() applies them after argv, this gate reads attw's\n` +
        `  printed output, and attw exits 0 on an untyped package.`,
    );
  }
} catch {
  // No .attw.json, or unreadable/invalid. attw itself reports the latter.
}

/** Every relative path `package.json` promises to ship, deduped. */
function declaredArtifacts(pkg) {
  const found = new Set();
  const add = (v) => {
    if (typeof v !== "string") return;
    // Skip wildcard subpath patterns (they name a set, not a file) and the
    // manifest itself, which is always in the tarball by definition.
    if (!v.startsWith(".") || v.includes("*") || v === "./package.json") return;
    found.add(v);
  };
  for (const key of ["main", "module", "types", "typings"]) add(pkg[key]);
  const walk = (node) => {
    if (typeof node === "string") add(node);
    else if (node && typeof node === "object") for (const v of Object.values(node)) walk(v);
  };
  walk(pkg.exports);
  return [...found];
}

let pkg;
try {
  pkg = JSON.parse(readFileSync("package.json", "utf8"));
} catch (err) {
  die(`cannot read ./package.json from ${process.cwd()}: ${err.message}`);
}

// ---- Net 1: preflight -------------------------------------------------------
const broken = [];
for (const rel of declaredArtifacts(pkg)) {
  let size;
  try {
    size = statSync(rel).size;
  } catch {
    broken.push({ rel, why: "missing" });
    continue;
  }
  if (size === 0) broken.push({ rel, why: "empty" });
}
if (broken.length > 0) {
  // Only claim the exit-0 counterfactual when a DECLARATION file is among the
  // casualties. With the declarations intact and only JS missing, attw reports
  // no problems at all and still exits 0: a different silence, not this one.
  const declarationsHit = broken.some(({ rel }) => DECLARATION.test(rel));
  die(
    `package.json promises files the build has not produced:\n` +
      broken.map(({ rel, why }) => `    ${rel} (${why})\n`).join("") +
      `\n  Run the build first. If you DID build, something removed or truncated the\n` +
      `  output underneath this run. A concurrent build or \`clean\` in the same\n` +
      `  working tree will do it, and \`tsup\` writes JS before declarations, so there\n` +
      `  is a window where the .d.ts files do not exist yet.\n` +
      (declarationsHit
        ? `  attw would have reported "${UNTYPED}" and EXITED 0 on this tree.\n`
        : `  attw does not gate these: it analyses types, and exits 0 here.\n`),
  );
}

// ---- Run attw ---------------------------------------------------------------
const res = spawnSync(ATTW_BIN, ["--pack", ".", ...args], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});
if (res.error) die(`could not run ${ATTW_BIN}: ${res.error.message}`);
const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
process.stdout.write(res.stdout ?? "");
process.stderr.write(res.stderr ?? "");
if (res.status !== 0) process.exit(res.status ?? 1);

// ---- Net 2: post-check ------------------------------------------------------
// An empty transcript means the post-check read nothing, by some route not listed
// under BLINDING above. Treat that as a failure rather than as a pass: this gate
// is only as good as the output it got to see.
if (output.trim() === "") {
  die(`attw exited 0 but printed nothing, so nothing was checked.`);
}
if (output.includes(UNTYPED)) {
  die(
    `attw reported "${UNTYPED}" and exited 0.\n` +
      `  This package ships types, so that means the tarball did not carry them.\n` +
      `  Check the "files" field, and any .npmignore INSIDE a directory it selects\n` +
      `  (a root .npmignore is overridden by "files"; one in dist/ is not).\n` +
      `  Reported as a failure here because\n` +
      `  attw's own exit code cannot: getExitCode() returns 0 whenever the analysis\n` +
      `  found no types at all, before it ever looks at the problem list.`,
  );
}
