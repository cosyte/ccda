/**
 * The runnable examples under `examples/` and the table in `examples/README.md` that lists them
 * stay in step, and the examples cover the read-side controls and the generators, not only reading
 * and building.
 *
 * `pnpm examples` runs every `examples/*.ts` file and each one asserts its own output, so an example
 * that drifts from the package already fails CI. What that runner cannot see is a README that names
 * a file that is gone, or leaves a new one out, and a guide whose only code is a doc sample. This
 * test reads the directory and the README's links and holds both.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const EXAMPLES_DIR = join(import.meta.dirname, "..", "examples");

/** The files `scripts/run-examples.ts` runs: depth one, `.ts`, not starting with `_`. */
function runnableExamples(): string[] {
  return readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".ts") && !d.name.startsWith("_"))
    .map((d) => d.name)
    .sort();
}

/** Every example file the README's table links to, in the form `[`name.ts`](name.ts)`. */
function listedExamples(): string[] {
  const readme = readFileSync(join(EXAMPLES_DIR, "README.md"), "utf8");
  const listed = [...readme.matchAll(/\[`([\w-]+\.ts)`\]\(\1\)/g)].map((m) => m[1] ?? "");
  return listed.sort();
}

describe("examples/", () => {
  it("lists every runnable example in its README exactly once", () => {
    expect(listedExamples()).toEqual(runnableExamples());
  });

  it.each([
    ["apply-a-vendor-profile.ts", "a vendor profile"],
    ["check-codes-with-your-terminology.ts", "the terminology adapter"],
    ["check-value-set-membership.ts", "a value-set source"],
    ["property-test-your-code.ts", "the fast-check generators"],
  ])("carries %s, a runnable program for %s", (file) => {
    expect(runnableExamples()).toContain(file);
  });
});
