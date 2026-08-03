/**
 * Unit tests for scripts/phi-scan.ts, the C-CDA PHI commit-gate.
 *
 * Positive tests prove the scanner CATCHES real-looking PHI (a weak scanner is
 * worse than none); negative tests prove it PASSES genuinely synthetic,
 * allow-listed content and does NOT trip on coded clinical values or template
 * OIDs. Each fixture exercises one branch of the CDA-aware scanner:
 *   - a clean synthetic document (allow-listed name + DOB + MRN)
 *   - a patient-name violator (`family`)
 *   - a related/assigned-person name violator (`given`/`family` under a non-patient parent)
 *   - a date-of-birth violator (`birthTime@value`)
 *   - an SSN violator (`id@root` = US SSN OID)
 *   - a bare-numeric MRN violator (`id@extension`)
 *   - a street-address / city / postal-code violator
 *   - a non-555 telecom phone violator
 *   - a dashed-SSN and a non-test email in narrative
 *   - three bypass vectors the refuter hunts: XML entity encoding, CDATA, and a
 *     namespace-prefixed / mixed-case element name
 *   - the committed corpus (all-mode) is clean
 *   - coded values + a template OID matching the SSN OID do NOT trip
 *   - the --allow-fixture override-log gate
 *   - the enumeration TOCTOU window: what a vanished file is allowed to do to a
 *     sweep, and five of the six ways it still refuses (the sixth, a tolerated
 *     file written back before the post-sweep re-check, is not reachable from a
 *     deterministic harness; see the block's own note)
 *
 * Violator fixtures are written to a throwaway temp dir so they never pollute
 * the committed corpus that `pnpm phi-scan` sweeps. The scanner is invoked via
 * spawnSync (array args, no shell) so the full CLI path (argv parse, exit code,
 * stderr) is exercised.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
 *
 * RUNNER: the scanner is a `.ts` file and this suite spawns it 48 times, so the
 * runner's fixed start-up cost is this file's dominant expense. It is spawned
 * with `node` (native type stripping, Node >= 22.18), which measured ~147 ms per
 * start here against ~521 ms for `tsx`. `pnpm phi-scan` -- what the pre-commit
 * hook and CI actually run -- still uses `tsx`, so ONE case below spawns `tsx`
 * and asserts the two runners AGREE; see its comment. Stripping is erasure-only
 * and `scripts/phi-scan.ts` imports nothing but `node:` builtins, which is what
 * makes the cheap runner sound, and the parity case is what reds if that stops
 * being true.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  rmSync,
  readFileSync,
  appendFileSync,
  symlinkSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const OVERRIDES_PATH = join(REPO_ROOT, "phi-scan-overrides.md");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const NODE_BIN = process.execPath;

/**
 * Budget for the one case that deliberately pays a `tsx` cold start, twice, and for
 * that case only. See its comment. Measured at 8,877 ms under four concurrent
 * `--coverage` suites. Every other case here inherits the Vitest default.
 */
const TSX_PARITY_TIMEOUT = 30_000;

/** Wrap section/patient XML in a minimal synthetic US-Realm ClinicalDocument. */
function doc(inner: string): string {
  return `<?xml version="1.0"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN001"/>
    <patient>
      <name><given>Jane</given><given>Q</given><family>Doe</family></name>
      <birthTime value="19800101"/>
    </patient>
  </patientRole></recordTarget>
  <component><structuredBody>${inner}</structuredBody></component>
</ClinicalDocument>`;
}

let dir: string;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScanner(args: string[]): RunResult {
  const r = spawnSync(NODE_BIN, [SCANNER_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** The `tsx` invocation `pnpm phi-scan` really uses, for the one case that pins it. */
function runScannerViaTsx(args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Write a violator/clean document to the temp dir (as .xml) and scan it. */
function scan(name: string, content: string): RunResult {
  const path = join(dir, name);
  writeFileSync(path, content);
  return runScanner([path]);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ccda-phi-scan-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Negative tests, genuinely synthetic, allow-listed content PASSES
// ---------------------------------------------------------------------------

describe("phi-scan: synthetic / allow-listed content passes (exit 0)", () => {
  it("a clean synthetic document exits 0", () => {
    const r = scan("clean.xml", doc(""));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("the committed corpus (all-mode) is clean", () => {
    const r = runScanner([]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK, no hits/);
  });

  it("does not flag a coded value or a template OID equal to the SSN OID", () => {
    // The SSN OID as a templateId root, and a bare-numeric-looking clinical code,
    // must NOT be read as PHI, the detectors are element-scoped to <id>/names.
    const r = scan(
      "coded.xml",
      doc(`<section>
        <templateId root="2.16.840.1.113883.4.1"/>
        <code code="55607006" codeSystem="2.16.840.1.113883.6.96" displayName="Problem"/>
        <id root="2.16.840.1.113883.19.5.99999.2" extension="prob-act-1"/>
      </section>`),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

describe("phi-scan: the `tsx` entry point `pnpm phi-scan` uses is the same scanner", () => {
  // THE ONE CASE THAT STILL PAYS THE tsx COLD START, and it is the backstop for every
  // other case in this file. The other 47 spawns run `node` (see NODE_BIN), which is
  // ~374 ms cheaper per start, but `pnpm phi-scan` -- the script the pre-commit hook
  // and CI invoke -- runs `tsx scripts/phi-scan.ts`. Without this case a breakage on
  // the real entry point (a tsx upgrade, a TypeScript construct node's erasure-only
  // stripping rejects but tsx compiles, a loader difference) would ship green.
  //
  // It asserts EQUIVALENCE, not merely that tsx works: the two runners must agree on
  // exit code, stdout and stderr. That is what makes the cheap runner trustworthy --
  // if they ever diverge this reds, instead of 47 cases silently exercising a loader
  // the gate does not use.
  //
  // BOTH OUTCOMES ARE RUN, BECAUSE THE SCANNER USES A DIFFERENT CHANNEL FOR EACH, and
  // comparing an empty channel to an empty channel proves nothing. A violator writes
  // its hits to stderr and nothing to stdout; a clean file writes `OK, no hits` to
  // stdout and nothing to stderr. Each channel is asserted non-empty on the run that
  // populates it, so neither comparison can pass by both sides being absent.
  it(
    "agrees with the `node` runner on exit code, stdout and stderr, on a hit and on a miss",
    () => {
      const hit = join(dir, "parity-hit.xml");
      writeFileSync(hit, doc(`<section><text><family>Anderson</family></text></section>`));
      const nodeHit = runScanner([hit]);
      const tsxHit = runScannerViaTsx([hit]);
      expect(nodeHit.code).toBe(1);
      expect(nodeHit.stderr.length).toBeGreaterThan(0);
      expect(tsxHit.code).toBe(nodeHit.code);
      expect(tsxHit.stderr).toBe(nodeHit.stderr);
      expect(tsxHit.stdout).toBe(nodeHit.stdout);

      const miss = join(dir, "parity-miss.xml");
      writeFileSync(miss, doc(""));
      const nodeMiss = runScanner([miss]);
      const tsxMiss = runScannerViaTsx([miss]);
      expect(nodeMiss.code, `stderr: ${nodeMiss.stderr}`).toBe(0);
      expect(nodeMiss.stdout.length).toBeGreaterThan(0);
      expect(tsxMiss.code).toBe(nodeMiss.code);
      expect(tsxMiss.stdout).toBe(nodeMiss.stdout);
      expect(tsxMiss.stderr).toBe(nodeMiss.stderr);
    },
    TSX_PARITY_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// Positive tests, real-looking PHI is CAUGHT
// ---------------------------------------------------------------------------

describe("phi-scan: names", () => {
  it("catches a real patient family name", () => {
    const r = scan("name.xml", doc(`<section><text><family>Anderson</family></text></section>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/name\/family/);
    expect(r.stderr).toMatch(/Anderson/);
  });

  it("skips a single-letter middle initial (not identifying)", () => {
    // Family + given are allow-listed; the `Q` middle initial must not trip.
    const r = scan("initial.xml", doc(""));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("catches a name under a non-patient parent (assignedPerson)", () => {
    const r = scan(
      "provider.xml",
      doc(`<author><assignedAuthor><assignedPerson><name>
        <given>Ewa</given><family>Kowalski</family>
      </name></assignedPerson></assignedAuthor></author>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Kowalski/);
    expect(r.stderr).toMatch(/Ewa/);
  });

  it("catches a bare (unstructured) name element", () => {
    const r = scan(
      "barename.xml",
      doc(`<informant><relatedEntity><name>Chidi Okafor</name></relatedEntity></informant>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Okafor/);
  });
});

describe("phi-scan: date of birth (birthTime@value)", () => {
  it("catches a DOB not in the allow-list", () => {
    const r = scan("dob.xml", doc(`<observation><birthTime value="19770707"/></observation>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/birthTime@value/);
    expect(r.stderr).toMatch(/19770707/);
  });

  it("catches a partial (YYYYMM) DOB", () => {
    const r = scan("dob6.xml", doc(`<subject><birthTime value="197711"/></subject>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/197711/);
  });
});

describe("phi-scan: identifiers", () => {
  it("catches an SSN under the US SSN OID root", () => {
    // Built from parts so no literal 9-digit SSN string lives in this source.
    const ssn = ["123", "45", "6789"].join("");
    const r = scan(
      "ssn.xml",
      doc(`<patientRole><id root="2.16.840.1.113883.4.1" extension="${ssn}"/></patientRole>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/id@extension/);
    expect(r.stderr).toMatch(/SSN/);
  });

  it("catches a bare-numeric MRN in id@extension", () => {
    const r = scan(
      "mrn.xml",
      doc(`<patientRole><id root="2.16.840.1.113883.19.5" extension="48291043"/></patientRole>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/48291043/);
    expect(r.stderr).toMatch(/MRN/);
  });

  it("catches a 10-digit MRN (modern EHR width, not just 6-9)", () => {
    const r = scan(
      "mrn10.xml",
      doc(`<patientRole><id root="2.16.840.1.113883.19.5" extension="1234509876"/></patientRole>`),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/1234509876/);
  });
});

// ---------------------------------------------------------------------------
// File selection, detection must follow content, not the file name / location
// (the two MAJOR refuter findings: a real document must not dodge the scanner by
// its extension or directory)
// ---------------------------------------------------------------------------

describe("phi-scan: a real document is caught regardless of extension", () => {
  it("catches PHI in a native .cda document", () => {
    const r = scan("record.cda", doc(`<section><family>Anderson</family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Anderson/);
  });

  it("catches PHI in a native .ccda document", () => {
    const r = scan("record.ccda", doc(`<observation><birthTime value="19770707"/></observation>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/19770707/);
  });

  it("catches a document by content marker even under a non-CDA extension", () => {
    // A real ClinicalDocument saved as .txt (or any name) must still be parsed,
    // detection follows the bytes, not the file name.
    const r = scan("pasted.txt", doc(`<section><family>Kowalski</family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Kowalski/);
  });
});

describe("phi-scan: address", () => {
  it("catches a real street address, city, and postal code", () => {
    const r = scan(
      "addr.xml",
      doc(`<addr>
        <streetAddressLine>742 Evergreen Terrace</streetAddressLine>
        <city>Springfield</city>
        <postalCode>62704</postalCode>
      </addr>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/streetAddressLine/);
    expect(r.stderr).toMatch(/Evergreen/);
    expect(r.stderr).toMatch(/Springfield/);
    expect(r.stderr).toMatch(/62704/);
  });
});

describe("phi-scan: telecom", () => {
  it("catches a phone without the 555 fake-exchange convention", () => {
    const r = scan("tel.xml", doc(`<telecom use="HP" value="tel:+13128675309"/>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/telecom@value/);
  });
});

describe("phi-scan: free-text shape checks", () => {
  it("catches a dashed SSN in narrative text", () => {
    // Synthetic sentinel built from parts + an anchored regex so no literal
    // SSN-shaped string lives in this source (a 9xx area + all-zero serial is
    // never a real SSN).
    const fakeSsn = ["9", "00", "55", "00", "00"]
      .join("")
      .replace(/^(\d{3})(\d{2})(\d{4})$/, "$1-$2-$3");
    const r = scan("ssn-text.xml", doc(`<section><text>SSN on file ${fakeSsn}</text></section>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/dashed SSN pattern/);
  });

  it("catches a non-test email in narrative text", () => {
    const r = scan("email.xml", doc(`<section><text>reach jane@realhospital.org</text></section>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/email with non-test domain/);
  });
});

// ---------------------------------------------------------------------------
// Bypass vectors the conformance-refuter hunts
// ---------------------------------------------------------------------------

describe("phi-scan: structured scan is not silently bypassed (refuter regressions)", () => {
  it("decodes XML character references before matching a name", () => {
    // <family>&#x53;mith</family> -> "Smith"
    const r = scan("entity.xml", doc(`<section><family>&#x53;mith</family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Smith/);
  });

  it("reads a name wrapped in a CDATA section", () => {
    const r = scan("cdata.xml", doc(`<section><family><![CDATA[Nakamura]]></family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Nakamura/);
  });

  it("matches a namespace-prefixed element name", () => {
    const r = scan("prefixed.xml", doc(`<section><v3:family>Petrov</v3:family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Petrov/);
  });

  it("matches an element name case-insensitively", () => {
    const r = scan("case.xml", doc(`<section><FAMILY>Ivanova</FAMILY></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Ivanova/);
  });

  it("keeps hand-written src-style .ts (no CDA marker) on the text-only pass", () => {
    // A non-fixture file with no CDA marker must not be parsed as CDA even if it
    // has a <family> literal, only the shape pass (SSN / email) applies.
    const path = join(dir, "helper.ts");
    writeFileSync(path, 'export const label = "family: Anderson";\n');
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// --allow-fixture override gate
// ---------------------------------------------------------------------------

describe("phi-scan: --allow-fixture override gate", () => {
  it("rejects --allow-fixture without an override-log entry (exit 2)", () => {
    const r = scan("gated.xml", doc(`<section><family>Anderson</family></section>`));
    expect(r.code).toBe(1); // sanity: it is a violator
    const path = join(dir, "gated.xml");
    const r2 = runScanner(["--allow-fixture", path]);
    expect(r2.code).toBe(2);
    expect(r2.stderr).toMatch(/phi-scan-overrides\.md/);
  });

  it("honors --allow-fixture WITH an override-log entry (exit 0)", () => {
    const path = join(dir, "override-me.xml");
    writeFileSync(path, doc(`<section><family>Anderson</family></section>`));
    const rel = relative(REPO_ROOT, path).split(sep).join("/");
    // Sanity: scanned on its own it is a genuine violator, so the override, not
    // an empty target set, is what flips the next run to clean.
    expect(runScanner([path]).code).toBe(1);

    const original = readFileSync(OVERRIDES_PATH, "utf8");
    try {
      appendFileSync(
        OVERRIDES_PATH,
        `\n### ${rel}\n\n- **Date:** 2026-07-18\n- **Reason:** unit test\n- **Approved by:** vitest\n- **Expires:** permanent\n`,
      );
      const r = runScanner(["--allow-fixture", path]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    } finally {
      writeFileSync(OVERRIDES_PATH, original);
    }
  });
});

// ---------------------------------------------------------------------------
// Enumeration TOCTOU (PHI-SCAN-ENUMERATION-TOCTOU)
// ---------------------------------------------------------------------------

/**
 * `all` mode lists the whole tree, then reads each file. `tsup` deletes its
 * transient `tsup.config.bundled_<hash>.mjs` inside that window, the read threw
 * `ENOENT`, and the scanner refused a whole publish-time sweep (`ccda@0.0.5`).
 *
 * These tests hit that window WITHOUT a sleep or a real build. The scanner runs
 * `git check-ignore` (and now `git ls-files`) after the walk and before the
 * first read, so a `git` shim placed first on `PATH` is a deterministic hook
 * into exactly the gap: it deletes the decoy, then execs the real git. The shim
 * is a file we exec through PATH, not a shell-form spawn from this suite.
 *
 * Everything runs against a throwaway git repo (`cwd`, which is the scanner's
 * `REPO_ROOT`), so no decoy is ever written into this repo and a parallel
 * worker cannot see one.
 *
 * The one branch not reachable this way is a tolerated file that is written
 * BACK before the post-sweep re-check: nothing in the scanner calls git after
 * the reads, so there is no second deterministic hook, and reaching it needs a
 * timed re-create against a deliberately slowed sweep. It is UNPINNED here, and
 * that is a deliberate trade rather than an oversight: the alternative is a
 * load-sensitive sleep in the suite that guards this very defect, whose whole
 * lesson is that a timing-dependent gate reads as a flake. The branch can only
 * turn a tolerated skip back into the refusal this suite already pins, so an
 * unnoticed regression in it loses the re-check, never the tolerance's bounds.
 */

const tempRoots: string[] = [];

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(d);
  return d;
}

/** Absolute path of the real `git`, resolved from PATH without a subprocess. */
function realGit(): string {
  for (const entry of (process.env["PATH"] ?? "").split(":")) {
    if (entry.length === 0) continue;
    const candidate = join(entry, "git");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("git not found on PATH");
}

/** A throwaway repo the scanner can treat as REPO_ROOT (git init is optional). */
function makeScanRepo(opts: { git: boolean; track?: boolean }): string {
  const d = tempDir("ccda-phi-toctou-");
  if (opts.git) {
    const init = spawnSync("git", ["init", "-q"], { cwd: d, encoding: "utf8", shell: false });
    expect(init.status, init.stderr).toBe(0);
  }
  mkdirSync(join(d, "scripts"), { recursive: true });
  // The scanner needs its allow-list + override log relative to REPO_ROOT. The
  // allow-list is also the tracked file every sweep here observes, so "observed
  // nothing" cannot fire by accident.
  const allowList = join("scripts", "phi-allow-list.txt");
  copyFileSync(join(REPO_ROOT, allowList), join(d, allowList));
  copyFileSync(OVERRIDES_PATH, join(d, "phi-scan-overrides.md"));
  if (opts.git && opts.track !== false) gitIn(d, ["add", "scripts/phi-allow-list.txt"]);
  return d;
}

function gitIn(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  expect(r.status, r.stderr).toBe(0);
}

/** A `git` that runs `pre` (a line of `sh`) before delegating to the real git. */
function gitShim(pre: string): string {
  const shimDir = tempDir("ccda-phi-shim-");
  writeFileSync(join(shimDir, "git"), `#!/bin/sh\n${pre}\nexec '${realGit()}' "$@"\n`, {
    mode: 0o755,
  });
  return shimDir;
}

function runScannerIn(
  cwd: string,
  shimDir: string | null,
  extraEnv?: NodeJS.ProcessEnv,
): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  if (shimDir !== null) env["PATH"] = `${shimDir}:${process.env["PATH"] ?? ""}`;
  const r = spawnSync(NODE_BIN, [SCANNER_PATH], { cwd, encoding: "utf8", shell: false, env });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Run the scanner in `cwd` with explicit argv (no shim, no env overrides). */
function runScannerArgsIn(cwd: string, args: string[]): RunResult {
  const r = spawnSync(NODE_BIN, [SCANNER_PATH, ...args], { cwd, encoding: "utf8", shell: false });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const BUNDLED = "tsup.config.bundled_1a2b3c4d.mjs";

afterAll(() => {
  for (const d of tempRoots) rmSync(d, { recursive: true, force: true });
});

describe("phi-scan: enumeration TOCTOU", () => {
  it("tolerates an UNTRACKED file gone between enumeration and read, and reports it", () => {
    const repo = makeScanRepo({ git: true });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, 'export default { entry: ["src/index.ts"] };\n');
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK, no hits/);
    // Never silent: the skip is named, with the file that went away.
    expect(r.stderr).toMatch(/skipped 1 untracked file\(s\) gone between enumeration and read/);
    expect(r.stderr).toContain(BUNDLED);
  });

  it("still REFUSES when a TRACKED file vanishes in the same window", () => {
    // The committed corpus is what the gate promises to have observed, so a
    // tracked file that cannot be read is an incomplete scan, not a transient.
    const repo = makeScanRepo({ git: true });
    const doomed = join(repo, "committed.xml");
    writeFileSync(doomed, doc(""));
    gitIn(repo, ["add", "committed.xml"]);
    const r = runScannerIn(repo, gitShim(`rm -f '${doomed}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read committed\.xml/);
    expect(r.stderr).toMatch(/ENOENT/);
  });

  it("still REFUSES a non-ENOENT read failure on an untracked file", () => {
    // Replaced by a directory rather than deleted: EISDIR is a scan that failed,
    // not a file that went away, so the tolerance must not swallow it.
    const repo = makeScanRepo({ git: true });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'\nmkdir -p '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read/);
    expect(r.stderr).toMatch(/EISDIR/);
  });

  it("REFUSES the tolerance outright when git cannot say what is tracked", () => {
    // Fail closed: with no tracked set there is no way to tell a build transient
    // from committed content, so nothing is tolerated.
    const repo = makeScanRepo({ git: false });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`), {
      GIT_CEILING_DIRECTORIES: tmpdir(),
    });
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read/);
  });

  it("REFUSES the tolerance when git answers with an EMPTY tracked set", () => {
    // An empty index would make every file untracked, which is the one state in
    // which the tracked-file bound stops existing, so it counts as no answer.
    const repo = makeScanRepo({ git: true, track: false });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not read/);
  });

  it("REFUSES an all-mode sweep that observed no files", () => {
    // The refuse-a-scan-that-observes-nothing rule, now explicit: tolerating a
    // vanished file must never be able to decay into a clean report of nothing.
    // Nothing tracked and everything ignored, so the walk finds files and the
    // filters leave zero targets. (`git check-ignore` never reports a TRACKED
    // path as ignored, which is why the allow-list is left unstaged here.)
    const repo = makeScanRepo({ git: true, track: false });
    writeFileSync(join(repo, ".gitignore"), "*\n");
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/observed no files/);
  });

  it("still CATCHES a violator in an untracked file that does not vanish", () => {
    // The tolerance is about a file that is gone, never about untracked files.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "leak.xml"), doc(`<section><family>Anderson</family></section>`));
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Anderson/);
  });
});

/**
 * A non-regular entry (a symbolic link above all) read CLEAN on BOTH enumerating
 * routes, and this repo's walk is rooted at the REPO ROOT, so the exposure was
 * the whole tree. The rule and its two measured divergences from the sibling
 * scanners are stated once, in `scripts/phi-scan.ts`'s docblock; these cases pin
 * it rather than re-describing it.
 *
 * Every case plants a NAME-BEARING synthetic payload OUTSIDE the scan repo and
 * proves the same bytes are still caught when they are a regular file, so a pass
 * cannot come from a fixture that carries nothing (the failure mode where a link
 * test is green because the target was empty).
 */
describe("phi-scan: a non-regular entry refuses the scan", () => {
  /** A synthetic, name-bearing C-CDA written outside any scan repo. */
  function plantPayload(fileName = "record.xml"): { dir: string; file: string } {
    const d = tempDir("ccda-phi-target-");
    const file = join(d, fileName);
    writeFileSync(
      file,
      doc(`<section><text/></section>`).replace(
        "<family>Doe</family>",
        "<family>Anderson</family>",
      ),
    );
    return { dir: d, file };
  }

  it("the payload IS caught as a regular file (the fixture is not vacuous)", () => {
    const repo = makeScanRepo({ git: true });
    const { file } = plantPayload();
    writeFileSync(join(repo, "copy.xml"), readFileSync(file, "utf8"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Anderson/);
  });

  it("all-mode REFUSES a symlink to a PHI-bearing file (base read it as clean)", () => {
    const repo = makeScanRepo({ git: true });
    const { file } = plantPayload();
    symlinkSync(file, join(repo, "linked.xml"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/refusing the scan/);
    expect(r.stderr).toMatch(/linked\.xml \(a symbolic link\)/);
    // The refusal must never hand back what is on the other side.
    expect(r.stderr).not.toContain(file);
    expect(r.stderr).not.toMatch(/Anderson/);
  });

  it("all-mode REFUSES a symlink to a DIRECTORY (it would take a whole subtree)", () => {
    const repo = makeScanRepo({ git: true });
    const { dir } = plantPayload();
    symlinkSync(dir, join(repo, "linked-dir"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/linked-dir \(a symbolic link\)/);
    expect(r.stderr).not.toContain(dir);
  });

  it("--staged REFUSES a staged symlink and never echoes its target", () => {
    // The target PATH is the leak this closes: `git show :<path>` hands the path
    // text back as if it were content, so an SSN-shaped target name was reported
    // as a dashed-SSN hit under the LINK's name. Built from parts so no literal
    // SSN-shaped string lives in this source (a 9xx area is never a real SSN).
    const marker = ["9", "00", "55", "00", "01"]
      .join("")
      .replace(/^(\d{3})(\d{2})(\d{4})$/, "$1-$2-$3");
    const repo = makeScanRepo({ git: true });
    const { file } = plantPayload(`${marker}.xml`);
    symlinkSync(file, join(repo, "fixture.xml"));
    gitIn(repo, ["add", "fixture.xml"]);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/fixture\.xml \(a symbolic link\)/);
    expect(r.stderr).not.toContain(marker);
    expect(r.stderr).not.toMatch(/dashed SSN pattern/);
  });

  it("--staged REFUSES a TYPECHANGE from a tracked regular file to a symlink", () => {
    // The one-letter blocker: replacing a TRACKED file with a link is neither an
    // add nor a modify, so `--diff-filter=AM` dropped the record before any mode
    // could be read and the hook passed a mode-120000 blob green.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "fixture.xml"), doc(""));
    gitIn(repo, ["add", "fixture.xml"]);
    gitIn(repo, ["-c", "user.email=t@t.t", "-c", "user.name=T", "commit", "-qm", "base"]);
    const { file } = plantPayload();
    rmSync(join(repo, "fixture.xml"));
    symlinkSync(file, join(repo, "fixture.xml"));
    gitIn(repo, ["add", "fixture.xml"]);
    // Guard the guard: this really is status T, not an add or a modify.
    const raw = spawnSync("git", ["diff", "--cached", "--raw"], {
      cwd: repo,
      encoding: "utf8",
      shell: false,
    });
    expect(raw.stdout).toMatch(/:100644 120000 [0-9a-f]+ [0-9a-f]+ T\tfixture\.xml/);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/fixture\.xml \(a symbolic link\)/);
  });

  it("--staged REFUSES a staged gitlink (a nested repository)", () => {
    const repo = makeScanRepo({ git: true });
    const nested = join(repo, "nested");
    mkdirSync(nested, { recursive: true });
    gitIn(nested, ["init", "-q"]);
    writeFileSync(join(nested, "f.txt"), "x\n");
    gitIn(nested, ["add", "f.txt"]);
    gitIn(nested, ["-c", "user.email=t@t.t", "-c", "user.name=T", "commit", "-qm", "x"]);
    gitIn(repo, ["add", "nested"]);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/nested \(a gitlink \(a nested repository\)\)/);
  });

  it("names EVERY offender, not just the first", () => {
    // A developer who has to re-run the gate once per link learns to distrust it.
    const repo = makeScanRepo({ git: true });
    const { file } = plantPayload();
    symlinkSync(file, join(repo, "a.xml"));
    symlinkSync(file, join(repo, "b.xml"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/2 entries are not regular files/);
    expect(r.stderr).toMatch(/a\.xml \(a symbolic link\)/);
    expect(r.stderr).toMatch(/b\.xml \(a symbolic link\)/);
  });

  it("REFUSES a link named *.md (the markdown exemption is NOT extended to one)", () => {
    // That exemption is a judgement about bytes the walk could have read; a
    // link's NAME is no evidence at all about what is on the other side.
    const repo = makeScanRepo({ git: true });
    const { file } = plantPayload();
    symlinkSync(file, join(repo, "notes.md"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/notes\.md \(a symbolic link\)/);
  });

  it("--staged REFUSES a link named *.md too (the exemption is not extended on EITHER route)", () => {
    const repo = makeScanRepo({ git: true });
    const { file } = plantPayload();
    symlinkSync(file, join(repo, "notes.md"));
    gitIn(repo, ["add", "notes.md"]);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/notes\.md \(a symbolic link\)/);
  });

  it("does NOT refuse a link whose name is a skipped tooling directory", () => {
    // A trailing-slash gitignore pattern does not match a LINK of that name, so
    // leaning on the ignore filter alone would refuse every scan in a checkout
    // whose node_modules is a link. A real dist/ directory's contents are
    // already out of scope, so a link named dist is the same boundary.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, ".gitignore"), "node_modules/\ndist/\n");
    const { dir } = plantPayload();
    symlinkSync(dir, join(repo, "node_modules"));
    symlinkSync(dir, join(repo, "dist"));
    // The premise, asserted rather than assumed: git really does say "not ignored".
    const ci = spawnSync("git", ["check-ignore", "node_modules", "dist"], {
      cwd: repo,
      encoding: "utf8",
      shell: false,
    });
    expect(ci.status).toBe(1);
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("does NOT refuse a gitignored link (one boundary, not a stricter second one)", () => {
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, ".gitignore"), "scratch-link\n");
    const { file } = plantPayload();
    symlinkSync(file, join(repo, "scratch-link"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("does NOT refuse a link under the scanner's own excluded test prefix", () => {
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "test", "scripts"), { recursive: true });
    const { file } = plantPayload();
    symlinkSync(file, join(repo, "test", "scripts", "probe.xml"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("still scans a normal staged regular file (the gate did not become a refusal)", () => {
    const repo = makeScanRepo({ git: true });
    writeFileSync(
      join(repo, "leak.xml"),
      doc("").replace("<family>Doe</family>", "<family>Anderson</family>"),
    );
    gitIn(repo, ["add", "leak.xml"]);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(1);
    expect(r.stderr).toMatch(/Anderson/);
  });
});
