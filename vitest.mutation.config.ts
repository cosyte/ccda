import type { ViteUserConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

import base from "./vitest.config.js";

const config = base as ViteUserConfig;

/**
 * The Vitest run StrykerJS uses for mutation testing (`stryker.config.mjs`): the suite of
 * `vitest.config.ts` as one project, without the files that cannot judge a mutant.
 *
 * StrykerJS mutates `src/` inside a sandbox and switches each mutant on in the test process, so a
 * test only kills a mutant when it runs the source in that process. The files left out below do
 * not, or would make a mutant's verdict depend on something other than the mutant:
 *
 * - `test/conformance/`: the conformance harness in `scripts/conformance/`, its pins, its cache and
 *   its report, and the working-tree snapshot, which needs the tree to itself;
 * - `test/scripts/`: this repository's own tooling in `scripts/` (the PHI scan, the changelog and
 *   the README version), each in a child process;
 * - `test/docs-content.test.ts` and `test/docs-content-coverage.test.ts`: they run `pnpm build`
 *   and the docs samples against `dist/`, which is built from the plain sources;
 * - `test/bench-memory.test.ts`: it spawns Node to measure memory, which measures the
 *   instrumentation;
 * - `test/example-imports.test.ts`, `test/install-specifier.test.ts` and
 *   `test/release-workflow-contract.test.ts`: they read source, docs and workflow files as text,
 *   and StrykerJS rewrites the source files in its sandbox.
 *
 * What they prove is proved by `pnpm test` on every pull request. `CCDA_MUTATION_RUN` (read as
 * `UNDER_MUTATION` in `test/_helpers/runtime.ts`) skips the few tests elsewhere that read a file
 * under `src/` as text, while the rest of their files run: StrykerJS rewrites those files to switch
 * mutants on, so their text is not the committed text.
 *
 * The working-tree project of `vitest.config.ts` is left out with the rest of `test/conformance/`,
 * so this run has one project and the globs live here.
 *
 * Every property runs from one fixed seed here (`COSYTE_PROPERTY_SEED`), at the pull request depth
 * of 100 cases: a property draws a fresh seed on every other run, and in a mutation run a fresh seed
 * would let a mutant that only some cases reach be killed on one run and survive the next, which
 * moves a full score the ratchet compares exactly.
 *
 * The instrumented code runs several times slower than the plain build, so a test's budget here is
 * 60 s. StrykerJS sets each mutant's own timeout from the time the test took in its first run
 * (`stryker.config.mjs`), so this budget does not slow the mutant runs.
 */
const { projects: _projects, ...suite } = config.test ?? {};

const mutation: ViteUserConfig = {
  ...config,
  test: {
    ...suite,
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    exclude: [
      ...configDefaults.exclude,
      "test/conformance/**",
      "test/scripts/**",
      "test/docs-content.test.ts",
      "test/docs-content-coverage.test.ts",
      "test/bench-memory.test.ts",
      "test/example-imports.test.ts",
      "test/install-specifier.test.ts",
      "test/release-workflow-contract.test.ts",
    ],
    env: {
      ...suite.env,
      COSYTE_PROPERTY_SEED: "424242",
      COSYTE_PROPERTY_RUNS: "100",
      CCDA_MUTATION_RUN: "1",
    },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
};

export default mutation;
