import { cosyteVitest } from "@cosyte/vitest-config";

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
 * `@cosyte/vitest-config` sets neither, so removing both returns this repo to the shared standard
 * rather than inventing a second one. Both defaults were measured here by over-running a real test
 * and a real hook, not read from the documentation.
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
 */
export default cosyteVitest({
  coverageDirs: ["parser", "model", "model/types", "helpers", "serialize", "profiles", "builder", "edit"],
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
