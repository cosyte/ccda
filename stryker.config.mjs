import { cosyteStryker } from "@cosyte/vitest-config/stryker";

// Mutation testing for @cosyte/ccda, on the shared StrykerJS config.
//
//   pnpm mutate:full                           every source file; its score is the floor's
//   pnpm mutate changed --base origin/main     only the source files a change touched
//   pnpm quality:mutation [--base origin/main] the score against quality-floor.json
//
// The files mutated are the shared default: every `.ts` file under `src/` but tests, declarations,
// fixtures, `generated/` folders and the barrels the shared config finds by reading `src/` (a file
// of nothing but re-exports). Static mutants (code that runs once, when a module loads: the warning
// registry, the template and code-system tables) are left out by the shared default, since no test
// can be traced to them and each one reruns the whole suite; coverage still holds every such line to
// having run. A file left out of this list is a file no mutant ever tests.
export default cosyteStryker({
  // The suite without the tests that build the package, spawn a process or test this repository's
  // own tooling (see that file).
  vitestConfig: "vitest.mutation.config.ts",
  stryker: {
    // A mutant times out when a test takes longer than timeoutFactor times its first, unmutated
    // run plus timeoutMS. At StrykerJS's defaults (1.5 and 5,000 ms) a mutant near that line can be
    // a timeout on one run and a survivor on the next, which moves a full score the ratchet
    // compares exactly. A wider margin lets a slow mutant that still finishes finish every time, so
    // only a mutant that never ends times out.
    timeoutFactor: 3,
    timeoutMS: 10_000,
  },
});
