/**
 * How every property in this repository runs: through the shared runners of `@cosyte/test-utils`,
 * at the shared depth, from a seed it prints first.
 *
 * - **Depth.** The kit reads `COSYTE_PROPERTY_RUNS`: unset, a property runs 100 cases (a pull
 *   request); the nightly workflow (`nightly-properties.yml`) sets 10,000. The environment wins
 *   over a test's own `numRuns`.
 * - **Seed.** `COSYTE_PROPERTY_SEED` replays one seed, and `COSYTE_PROPERTY_PATH` one failing case
 *   of it, already shrunk. Unset, a fresh seed is drawn. Either way {@link propertyRun} prints the
 *   seed and the depth before the property runs, so a run that passes, hangs or dies still names
 *   the seed it ran, and a failure prints the seed and the path again beside fast-check's report
 *   (the kit's `assertProperty`).
 *
 * The three standard properties and immutability run through the kit's own runners
 * (`roundTripProperty`, `idempotentNormalizeProperty`, `lenientNeverThrowsProperty`,
 * `immutabilityProperty`); a property of another shape runs through {@link checkProperty}, the
 * kit's `assertProperty` with the printed seed.
 */

import { PROPERTY_ENV, assertProperty, resolvePropertyRun } from "@cosyte/test-utils";
import type { PropertyRunOptions } from "@cosyte/test-utils";
import type fc from "fast-check";

/** The environment a run reads. */
type Env = Readonly<Record<string, string | undefined>>;

/** Where the seed line goes: standard output, which the nightly job keeps. */
type Write = (line: string) => void;

const stdout: Write = (line) => {
  process.stdout.write(line);
};

/** A fresh 32-bit seed, the range fast-check draws its own from. */
function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

/**
 * The run options a property passes to a kit runner: the depth, and a seed that is always set,
 * printed with the depth before the run.
 *
 * @param name - The property's name, which leads the printed line.
 * @param options - A depth, seed or path of the test's own; the environment wins over each.
 * @param env - The environment, `process.env` by default.
 * @param write - Where the line goes, standard output by default.
 * @returns The options to spread into the kit runner's own.
 * @throws {RangeError} When a value in the environment is malformed (the kit refuses it).
 */
export function propertyRun(
  name: string,
  options: PropertyRunOptions = {},
  env: Env = process.env,
  write: Write = stdout,
): PropertyRunOptions & { readonly seed: number; readonly numRuns: number } {
  const run = resolvePropertyRun(options, env);
  const seed = run.seed ?? freshSeed();
  write(
    `[property] ${name}: ${PROPERTY_ENV.seed}=${String(seed)} ${PROPERTY_ENV.runs}=${String(run.numRuns)}\n`,
  );
  return { ...run, seed };
}

/**
 * Run a fast-check property through the kit's `assertProperty` at the shared depth, from a printed
 * seed, and throw a replayable error naming the seed and the path when it fails.
 *
 * @param name - The property's name.
 * @param property - The property.
 * @param options - A depth of its own, documented at the call, if any.
 * @param env - The environment, `process.env` by default.
 * @throws {Error} When the property fails, with the seed and path in the message.
 */
export function checkProperty<Ts>(
  name: string,
  property: fc.IProperty<Ts>,
  options: PropertyRunOptions = {},
  env: Env = process.env,
): void {
  assertProperty(name, property, propertyRun(name, options, env), env);
}

/**
 * A test's time budget for a property at the resolved depth: 60 s, or 100 ms a case, whichever is
 * longer. A case here builds, serializes and parses whole documents: the slowest standard property
 * took 13 ms a case at 1,000 cases and 16 ms at 10,000, on a 16-core machine running other work, so
 * a 100-case run needs a few seconds and a deep run (`COSYTE_PROPERTY_RUNS=10000`) is not cut off by
 * the budget a 100-case run needs. This repository sets no global test timeout (see
 * `vitest.config.ts`).
 *
 * @param env - The environment, `process.env` by default.
 * @returns The budget in milliseconds.
 */
export function propertyTimeout(env: Env = process.env): number {
  return Math.max(60_000, resolvePropertyRun({}, env).numRuns * 100);
}
