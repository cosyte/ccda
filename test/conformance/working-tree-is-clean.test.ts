/**
 * AC-9: a conformance run leaves no fetched artifact or corpus document visible to this
 * repository's own gates.
 *
 * TWO GATES, AND THEY ASK DIFFERENT QUESTIONS. `git status --porcelain` answers "would any of
 * this be committed", and `pnpm phi-scan` answers "would any of this be READ", which is the
 * one that matters for a third-party clinical document: the scanner walks the whole working
 * tree, decides scope per file by content rather than by path, and refuses a run over a file
 * it enumerated and could not read. A fetched corpus document that merely sat uncommitted
 * would still be in its read set; only a gitignored path is out of both.
 *
 * THE RUN WRITES INTO THE REAL WORKING DIRECTORY, ON PURPOSE. Pointing this test at a
 * temporary directory would prove nothing about the path the harness actually uses, which is
 * the whole claim. The report goes to a temporary path instead, because the tracked report is
 * AC-8's subject and rewriting it from a self-test run would be a lie about what was measured.
 *
 * THE SNAPSHOT IS A SET DIFFERENCE, NOT AN EMPTINESS CHECK. This suite has to pass in a
 * working tree that already carries the implementer's own edits.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BUILT_DOCUMENT_CASES, writeTarGz } from "../__fixtures__/conformance.js";
import { WORKING_DIRECTORY } from "../../scripts/conformance/fetch.js";
import { runConformance, writeReport } from "../../scripts/conformance/run.js";
import { buildCcda, serializeCcda } from "../../src/index.js";
import { fullyServingFetcher, selfTestPins } from "./_self-test-pins.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCANNER = join(REPO_ROOT, "scripts", "phi-scan.ts");

const ARCHIVE = writeTarGz([
  {
    path: "Self Test/document.xml",
    text: serializeCcda(
      buildCcda({ patient: { mrn: "MRN002" }, effectiveTime: "20240102030405+0000" }),
    ),
  },
]);

function statusPaths(): Set<string> {
  return new Set(
    execFileSync("git", ["status", "--porcelain", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
      .split("\0")
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.slice(3)),
  );
}

/**
 * Per-test budget for the run case, argued from what that test DOES rather than from a machine.
 * It fetches four artifacts through the doubled network, compiles a Schematron, builds and
 * validates four documents through libxml2 in WebAssembly, and round-trips a corpus document.
 * The WASM module is instantiated once per validated document and is the dominant cost;
 * measured on this suite the whole case runs in well under a second, and the ceiling is set an
 * order of magnitude above that so a loaded box turns a pass into a slow pass rather than a
 * false red. `vitest.config.ts` deliberately sets no global `testTimeout` and this number does
 * not belong there: a global asserts something about the machine, not about the code.
 */
const RUN_BUDGET_MS = 20_000;

/**
 * Per-test budget for the scanner case. One process start plus a full-tree scan of a few
 * hundred files. This repository's own scanner suite sizes a `node` start at roughly 200 ms
 * and this adds the walk; the same order-of-magnitude headroom as above, for the same reason.
 */
const SCAN_BUDGET_MS = 20_000;

describe("AC-9: a run leaves no fetched artifact visible to this repository's own gates", () => {
  it(
    "reports the same set of paths from git status after the run as before it",
    async () => {
      const before = statusPaths();
      const reportDirectory = mkdtempSync(join(tmpdir(), "ccda-conformance-report-"));
      try {
        const result = await runConformance({
          fetcher: fullyServingFetcher(ARCHIVE).fetcher,
          // The real working directory, because the gitignore entry covering it is the claim.
          directory: join(REPO_ROOT, WORKING_DIRECTORY),
          pins: selfTestPins(ARCHIVE),
          builtDocuments: BUILT_DOCUMENT_CASES,
        });
        // A report has to be written somewhere for the run to be a run; a temporary path keeps
        // AC-8's tracked report out of a self-test's hands.
        expect(() => {
          writeReport(result, join(reportDirectory, "conformance-report.md"));
        }).toThrow();
      } finally {
        rmSync(reportDirectory, { recursive: true, force: true });
      }
      expect(statusPaths()).toEqual(before);

      // The set comparison above is necessary and NOT sufficient, and saying so is the point
      // of this second half. A working directory that is merely untracked appears in both
      // snapshots and the difference is empty while every fetched artifact sits in the read
      // set of every gate that walks the tree. So ask git directly, about a file the run just
      // wrote: every one of them has to be IGNORED, not merely uncommitted.
      const written = readdirSync(join(REPO_ROOT, WORKING_DIRECTORY));
      expect(written.length).toBeGreaterThan(0);
      for (const name of written) {
        const check = spawnSync("git", ["check-ignore", "-q", join(WORKING_DIRECTORY, name)], {
          cwd: REPO_ROOT,
        });
        expect(check.status).toBe(0);
      }
    },
    RUN_BUDGET_MS,
  );

  it(
    "leaves pnpm phi-scan green over the whole working tree after the run",
    () => {
      // The scanner is spawned as `node`, not `tsx`: `scripts/phi-scan.ts` imports nothing but
      // node builtins, native type stripping runs it directly, and the repository's own
      // phi-scan suite measured that as roughly a quarter of the cost of a tsx start. What CI
      // runs is still `tsx`, and test/scripts/phi-scan.test.ts is what pins the two together.
      const run = spawnSync(process.execPath, [SCANNER], { cwd: REPO_ROOT, encoding: "utf8" });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("no hits");
    },
    SCAN_BUDGET_MS,
  );
});
