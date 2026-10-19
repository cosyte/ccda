import { cosyteVitest } from "@cosyte/vitest-config";
import { configDefaults } from "vitest/config";

/**
 * Vitest config for @cosyte/ccda from the shared @cosyte/vitest-config standard.
 *
 * Per-directory >= 90 coverage gates on the core dir(s). Add directories to `coverageDirs` as the
 * parser grows (e.g. "model", "serialize", "helpers", "builder"), mirror @cosyte/hl7's layout once
 * the corresponding source lands.
 *
 * **THERE IS DELIBERATELY NO GLOBAL `testTimeout` HERE, AND PUTTING ONE BACK IS A REGRESSION.**
 * This file set `testTimeout: 10_000` and `hookTimeout: 10_000` until 2026-08-03. A global timeout
 * asserts something about the **machine**, not about the code: it is sized for the slowest test in
 * the repo and every other test then inherits that ceiling, so a genuinely hung fast test reads as
 * merely slow. Raising it to clear a false red buys the red back as a false green. The rule is
 * **per-test, never global** -- a test whose work is genuinely slow declares its own budget beside
 * the work, where the number can be argued from what that test does.
 *
 * `hookTimeout: 10_000` restated Vitest's own default verbatim, and the shared
 * `@cosyte/vitest-config` sets neither, so removing both leaves this repo on Vitest's defaults
 * instead of carrying a literal of its own. Both defaults were measured here by over-running a real
 * test and a real hook, not read from the documentation.
 *
 * **THIS IS A MEASURED DECISION ABOUT THIS REPO, NOT A FLEET RULE, AND IT DOES NOT PORT.** Sibling
 * parsers worked the same item on the same day, measured, and KEPT their global, because tests the
 * global still governs there crossed 5,000 ms under load and had no repeated fixed cost to trim
 * first. The reason it goes here is that this suite's load-sensitive cases were subprocess starts
 * with a cheaper runner available. Re-measure before deleting a sibling's line.
 *
 * **TRIM BEFORE BOUNDING.** The ceiling was never this repo's problem; a repeated fixed cost was.
 * If a test starts failing on time, look for that first -- `test/scripts/phi-scan.test.ts` was
 * paying a `tsx` start-up at every one of its spawns and now spawns `node` -- and only then give
 * that one test its own budget.
 *
 * Which tests carry a budget, and why each one's cost is not fixed, is stated at each of them.
 * The measurement that sized them is in the `CHANGELOG.md` entry for
 * `PARSER-TESTTIMEOUT-ASSERTS-AN-IDLE-BOX`, dated, where it cannot drift out from under this file.
 * Re-measure rather than inherit it, and do not put a number back here.
 *
 * **THE WORKING-TREE SNAPSHOT RUNS ALONE, AFTER EVERY OTHER FILE, AND THAT IS WHAT MAKES IT A
 * MEASUREMENT.** `test/conformance/working-tree-is-clean.test.ts` takes `git status` of the real
 * working tree before and after a conformance run and requires the two sets to be equal. Vitest runs
 * test files in parallel, and other files write into that same tree for a moment: the README usage
 * case in `test/docs-content.test.ts` writes `.cosyte-usage-stdout/` and removes it in `afterAll`, the
 * `pnpm build` it spawns has `tsup` write and delete `tsup.config.bundled_<hash>.mjs` at the root, and
 * the override-gate case in `test/scripts/phi-scan.test.ts` appends to the tracked
 * `phi-scan-overrides.md` and restores it. A snapshot taken inside one of those windows compares
 * another file's leftovers, not the run's. The release Verify step on `d906bda` went red that way,
 * with `.cosyte-usage-stdout/` in the "before" set and gone from the "after" one. So the file has a
 * project of its own, with a later `sequence.groupOrder`: Vitest starts that group only after the
 * group before it has finished, so nothing else is writing while the snapshot is taken. The
 * assertion itself is unchanged. Do not answer a red from it by loosening the comparison or by
 * moving the run into a temporary directory. A new test that has to see the tree while nothing
 * else writes to it joins the second project; every other file stays in the first, which still
 * runs in parallel.
 */
const WORKING_TREE_SNAPSHOT = "test/conformance/working-tree-is-clean.test.ts";

export default cosyteVitest({
  coverageDirs: ["parser", "model", "model/types", "helpers", "serialize", "profiles", "builder", "edit"],
  test: {
    globals: false,
    environment: "node",
    // `extends: true` CONCATENATES `include` rather than replacing it, so the globs live on the
    // first project only: set at the root, they would pull the whole suite into the second one.
    projects: [
      {
        extends: true,
        test: {
          name: "suite",
          include: ["test/**/*.test.ts", "src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, WORKING_TREE_SNAPSHOT],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "working-tree",
          include: [WORKING_TREE_SNAPSHOT],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
