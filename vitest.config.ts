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
 * **per-test, never global**: a test whose work is genuinely slow declares its own budget next to
 * the work, where the number can be argued from what that test does.
 *
 * `hookTimeout: 10_000` was pure noise. Vitest 4.1.4's default hook timeout is **exactly** 10,000 ms
 * and its default test timeout is 5,000 ms, both measured here by over-running a real test and a
 * real hook, not read from the documentation. The shared `@cosyte/vitest-config` sets neither, so
 * removing them returns this repo to the shared standard instead of inventing a second one.
 *
 * **THE TRIM WAS THE WIN, NOT THE CEILING.** `test/scripts/phi-scan.test.ts` spawns the scanner 48
 * times and was paying a `tsx` start-up at every one, ~521 ms against ~147 ms for `node` with native
 * type stripping. Spawning `node` took that file from ~24.6 s to ~9.0 s while **gaining** a test:
 * one case still pays the `tsx` cold start and asserts the two runners agree, because
 * `pnpm phi-scan` is what the commit gate really runs.
 *
 * **WHAT MEASUREMENT CORRECTED, AGAINST INSTINCT, AND THE METHOD IS THE CLAIM.** Twenty-two runs on
 * 2026-08-03 on a 12-CPU cgroup quota with a worker fleet loading the box: four `vitest run`, six
 * `vitest run --coverage`, and twelve under **four concurrent `--coverage` suites**, harsher than
 * anything CI does. Including the coverage runs is not optional: CI gates on `pnpm test` **and**
 * `pnpm test:coverage`, and the instrumented run roughly doubled every peak.
 *
 *   - **The old 10 s global was itself the false red.** `test/property/immutability.property.test.ts`
 *     ran 10,395-12,299 ms under concurrent coverage on **correct** code, and failed **6 of 8** such
 *     runs against that ceiling.
 *   - **The repo's slowest test already exceeded that global and passed**, because it carries its own
 *     budget: an `attw` case peaked at 12,414 ms under the 120 s per-test budget it has had all
 *     along. The global was never what stood between this suite and a false red, in either direction.
 *
 * Every test whose cost is not fixed now declares its own budget, at 30 s, with the peak it covers
 * recorded beside it: the two suites in `test/property/`, the three fuzz cases in
 * `test/security.test.ts` (fast-check draws a fresh seed every run, none pinned, by design), the
 * corpus sweep in `test/phi-diagnostic-surface.test.ts`, and the `tsx` parity case in
 * `test/scripts/phi-scan.test.ts`. `test/scripts/attw-gate.test.ts` keeps its 120 s, and
 * `test/docs-content.test.ts` keeps the 180 s on the hook that runs a real `pnpm build`.
 *
 * With those declared, **every remaining test peaked at 2,608 ms** across all twenty-two runs, a
 * ~1.9x margin under the 5 s default this file now inherits. Note the ratio the change really moves,
 * which is the durable part: base was a 10 s ceiling over a ~521 ms spawn (~19x), head is a 5 s
 * ceiling over a ~147 ms spawn (~34x). Halving the ceiling still bought headroom, because the trim
 * shrank the measured thing faster than the ceiling shrank.
 *
 * These figures describe one box on one day. They are written down so the next reader **re-measures
 * rather than inherits them**. If a test here starts failing on time, look for its repeated fixed
 * cost first and only then give that one test its own budget. Do not put a number back in this file.
 *
 * **Disclosed, not fixed:** `engines.node` says `>=22.0.0`, but spawning the scanner with `node`
 * needs **>=22.18** for unflagged type stripping. CI's 22 + 24 matrix resolves above it; a developer
 * on 22.0-22.17 would meet a failure findable only in this prose. Narrowing `engines` is
 * consumer-facing and belongs in its own slice.
 */
export default cosyteVitest({
  coverageDirs: ["parser", "model", "model/types", "helpers", "serialize", "profiles", "builder", "edit"],
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
