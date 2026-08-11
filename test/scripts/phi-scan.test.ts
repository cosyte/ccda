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
 *   - a staged RENAME, in both shapes `--diff-filter=AMT` used to delete: a link
 *     `git mv`'d into the scan root, and a rename that substitutes a real name
 *   - a staged UNMERGED path, which used to report clean over a path with no
 *     staged blob to read
 *   - a scan that could not RUN exits 2 (invocation error), never 1 (hits found)
 *
 * Violator fixtures are written to a throwaway temp dir so they never pollute
 * the committed corpus that `pnpm phi-scan` sweeps. The scanner is invoked via
 * spawnSync (array args, no shell) so the full CLI path (argv parse, exit code,
 * stderr) is exercised.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
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
  readdirSync,
  appendFileSync,
  symlinkSync,
  chmodSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const OVERRIDES_PATH = join(REPO_ROOT, "phi-scan-overrides.md");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

/**
 * RUNNER. Nearly every case here spawns the scanner, so the runner's fixed start-up is
 * this file's dominant cost, not the scanning. It spawns `node` (native type stripping,
 * Node >= 22.18), which measured ~183 ms per start against ~646 ms for `tsx` on the box
 * this was written on, interleaved.
 *
 * Two things make the cheaper runner sound, and neither is assumed:
 *   - `scripts/phi-scan.ts` imports nothing but `node:` builtins and uses no construct
 *     that needs emit, so erasure-only stripping is enough;
 *   - `pnpm phi-scan` -- what the pre-commit hook and CI really run -- is still `tsx`,
 *     so ONE case below spawns `tsx` and asserts the two runners AGREE. That case reds
 *     if either premise stops holding. Delete it and a tsx-only breakage ships green.
 *
 * `engines.node` is `>=22.0.0` while stripping is unflagged only from 22.18. CI's 22 + 24
 * matrix resolves above that; a developer on 22.0-22.17 gets a loud runner error here
 * rather than a wrong result, and the fix is a newer 22.
 */
const NODE_BIN = process.execPath;

/**
 * Budget for the one case that deliberately pays a `tsx` cold start, twice, and for that
 * case alone: it is the only case here whose cost is a compiler start rather than a
 * process start. Every other case inherits the Vitest default. See its comment, and
 * `vitest.config.ts` for why the budget is here rather than global.
 */
const TSX_PARITY_TIMEOUT = 60_000;

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
  // other case in this file. The rest spawn `node` (see NODE_BIN above), but the gate a
  // developer and CI actually run is `pnpm phi-scan`, which is `tsx scripts/phi-scan.ts`.
  // Without this case a tsx-only breakage (a tsx upgrade, a construct node's erasure-only
  // stripping rejects but tsx compiles, a loader difference) would ship green.
  //
  // It asserts EQUIVALENCE, not merely that tsx works: the two runners must agree on exit
  // code, stdout and stderr. That is what makes the cheap runner trustworthy.
  //
  // TWO OF THE SCANNER'S THREE OUTCOMES ARE RUN, BECAUSE EACH USES A DIFFERENT CHANNEL and
  // comparing an empty channel to an empty channel proves nothing. A violator (exit 1)
  // writes its hits to stderr and nothing to stdout; a clean file (exit 0) writes its OK
  // line to stdout and nothing to stderr. Each channel is asserted non-empty on the run
  // that populates it, so neither comparison can pass by both sides being absent. The
  // third, the exit-2 REFUSAL, is deliberately not pinned here: it would cost a further
  // `tsx` cold start and it shares the stderr channel with exit 1, so it adds a spawn
  // rather than a channel. It was hand-checked at parity when this case was written.
  it(
    "agrees with the `node` runner on exit code, stdout and stderr, on a hit and on a miss",
    () => {
      // The case is only a backstop if `pnpm phi-scan` really is the tsx invocation it
      // pins. TSX_BIN is a hardcoded path, so assert the manifest still agrees with it;
      // otherwise rewriting the script silently leaves this pinning a runner nobody runs.
      const script = (
        JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
          scripts: Record<string, string>;
        }
      ).scripts["phi-scan"];
      expect(script).toMatch(/(^|\s)tsx\s/);
      expect(script).toMatch(/scripts\/phi-scan\.ts/);

      const hit = join(dir, "parity-hit.xml");
      writeFileSync(hit, doc(`<section><text><family>Anderson</family></text></section>`));
      const nodeHit = runScanner([hit]);
      const tsxHit = runScannerViaTsx([hit]);
      expect(nodeHit.code, `stderr: ${nodeHit.stderr}`).toBe(1);
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

  it("REFUSES the whole sweep when git cannot say what is tracked", () => {
    // Fail closed. The bound this case has always been about is unchanged: with
    // no tracked set there is no way to tell a build transient from committed
    // content. WHERE IT IS ENFORCED MOVED, and the assertion moved with it
    // rather than being widened to accept both: `all` mode now also needs the
    // index for its union half, so a missing index refuses the SWEEP before any
    // byte is read instead of refusing the TOLERANCE at the first bad read. The
    // outcome a developer sees is the same exit 2, earlier and with a message
    // that names the real cause.
    const repo = makeScanRepo({ git: false });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`), {
      GIT_CEILING_DIRECTORIES: tmpdir(),
    });
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not name this repository's index/);
  });

  it("REFUSES the whole sweep when git answers with an EMPTY index", () => {
    // An empty index would make every file untracked, which is the one state in
    // which the tracked-file bound stops existing AND the one that makes a
    // reconciliation vacuous rather than wrong, so it counts as no answer.
    // `scripts/check-agent-notes-contract.mjs` refuses the same state.
    const repo = makeScanRepo({ git: true, track: false });
    const decoy = join(repo, BUNDLED);
    writeFileSync(decoy, "export default {};\n");
    const r = runScannerIn(repo, gitShim(`rm -f '${decoy}'`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/could not name this repository's index/);
  });

  it("REFUSES an all-mode sweep that observed no files", () => {
    // The refuse-a-scan-that-observes-nothing rule: tolerating a vanished file
    // must never be able to decay into a clean report of nothing.
    //
    // THE STATE HAD TO BE REBUILT, AND THE REASON IS THE POINT OF THE UNION.
    // This case used to reach the floor with an EMPTY index, which is now
    // refused one step earlier and for a stronger reason. With a NON-EMPTY index
    // the floor is much harder to reach, because every tracked path the walk
    // misses becomes a union target: it needs the index to hold nothing but the
    // one literally EXCLUDED path, and everything else in the tree to be
    // untracked and ignored. The branch is kept, and pinned, rather than deleted
    // as unreachable. (`git check-ignore` never reports a TRACKED path as
    // ignored, which is why the excluded file is the only thing staged here.)
    const repo = makeScanRepo({ git: true, track: false });
    writeFileSync(join(repo, ".gitignore"), "*\n");
    mkdirSync(join(repo, "test", "scripts"), { recursive: true });
    writeFileSync(
      join(repo, "test", "scripts", "phi-scan.test.ts"),
      "// excluded by literal path\n",
    );
    gitIn(repo, ["add", "-f", "test/scripts/phi-scan.test.ts"]);
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

  it("does NOT refuse a link at the scanner's own excluded LITERAL path", () => {
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "test", "scripts"), { recursive: true });
    const { file } = plantPayload();
    symlinkSync(file, join(repo, "test", "scripts", "phi-scan.test.ts"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("DOES refuse a link elsewhere under test/scripts/ (the exclusion is a path, not a prefix)", () => {
    // The exemption used to be the PREFIX `test/scripts/`, which covered four
    // files where its stated reason (the gate's own negative-control literals)
    // covers exactly one. Pinned as its own case beside the accepting one above,
    // so a clean answer there is a decision about one named file rather than a
    // whole directory nobody re-examined.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, "test", "scripts"), { recursive: true });
    const { file } = plantPayload();
    symlinkSync(file, join(repo, "test", "scripts", "probe.xml"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/test\/scripts\/probe\.xml \(a symbolic link\)/);
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

// ---------------------------------------------------------------------------
// A staged RENAME is enumerated (PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT)
// ---------------------------------------------------------------------------

/**
 * `R`/`C` are returned by neither `--diff-filter=AM` nor `AMT`, so an ordinary
 * `git mv` deleted the record before any mode or any content could be read and
 * `--staged` exited 0 over it. Two shapes, both measured red on the base tree:
 * a `git mv` of a LINK into the scan root (staged as `R100` at mode `120000`,
 * so the mode check was never reached), and a `git mv` that also substitutes a
 * real name (staged as `R<score>`, so PHI newly written into the destination was
 * never scanned by the COMMIT gate).
 *
 * The remedy is `--no-renames`, which makes the destination arrive as an
 * ordinary single-path `A` and the source as a `D` the filter drops. The cases
 * below assert what the index really holds BEFORE asserting the scanner's
 * answer, because the whole defect lives in the record shape: a fixture whose
 * `git mv` was too dissimilar to score as a rename would pass against the base
 * tree too, and prove nothing.
 */
describe("phi-scan: a staged rename is enumerated", () => {
  /** A synthetic, name-bearing C-CDA written outside any scan repo. */
  function plantLinkTarget(): string {
    const d = tempDir("ccda-phi-rename-target-");
    const file = join(d, "record.xml");
    writeFileSync(file, doc("").replace("<family>Doe</family>", "<family>Anderson</family>"));
    return file;
  }

  function stagedRaw(repo: string): string {
    const r = spawnSync("git", ["diff", "--cached", "--raw"], {
      cwd: repo,
      encoding: "utf8",
      shell: false,
    });
    return r.stdout ?? "";
  }

  /** A committed link, then `git mv`'d to another name inside the scan root. */
  function repoWithRenamedLink(config?: [string, string]): string {
    const repo = makeScanRepo({ git: true });
    if (config) gitIn(repo, ["config", config[0], config[1]]);
    symlinkSync(plantLinkTarget(), join(repo, "linked.xml"));
    gitIn(repo, ["add", "linked.xml"]);
    gitIn(repo, ["-c", "user.email=t@t.t", "-c", "user.name=T", "commit", "-qm", "base"]);
    gitIn(repo, ["mv", "linked.xml", "fixture.xml"]);
    return repo;
  }

  it("--staged REFUSES a link `git mv`'d into the scan root (base read R100 as clean)", () => {
    const repo = repoWithRenamedLink();
    // Guard the guard: rename detection really does collapse this to ONE
    // two-path record at mode 120000, which is the record `AMT` deleted.
    expect(stagedRaw(repo)).toMatch(
      /:120000 120000 [0-9a-f]+ [0-9a-f]+ R100\tlinked\.xml\tfixture\.xml/,
    );
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/fixture\.xml \(a symbolic link\)/);
    // Same bound as every other refusal: never hand back the other side.
    expect(r.stderr).not.toMatch(/Anderson/);
    expect(r.stderr).not.toMatch(/ccda-phi-rename-target-/);
  });

  it("--staged CATCHES a name substituted by the same commit that renamed the file", () => {
    // The worse half: the destination is PHI the commit gate never read.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "old.xml"), doc(""));
    gitIn(repo, ["add", "old.xml"]);
    gitIn(repo, ["-c", "user.email=t@t.t", "-c", "user.name=T", "commit", "-qm", "base"]);
    gitIn(repo, ["mv", "old.xml", "renamed.xml"]);
    writeFileSync(
      join(repo, "renamed.xml"),
      doc("").replace("<family>Doe</family>", "<family>Anderson</family>"),
    );
    gitIn(repo, ["add", "renamed.xml"]);
    // Guard the guard: still similar enough to score as a rename, so this is
    // the R<score> record and not two independent A/D records.
    expect(stagedRaw(repo)).toMatch(/ R\d{3}\told\.xml\trenamed\.xml/);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(1);
    expect(r.stderr).toMatch(/renamed\.xml/);
    expect(r.stderr).toMatch(/Anderson/);
  });

  it.each([
    ["diff.renames", "true", /R100\tlinked\.xml\tfixture\.xml/],
    ["diff.renames", "copies", /R100\tlinked\.xml\tfixture\.xml/],
    // The one row whose index does NOT hold a rename. It is the control: the
    // base tree already refused this one, which is what proves the answer used
    // to be the caller's git config rather than the scanner's.
    ["diff.renames", "false", /:000000 120000 [0-9a-f]+ [0-9a-f]+ A\tfixture\.xml/],
    ["diff.renames", "1", /R100\tlinked\.xml\tfixture\.xml/],
    ["diff.renameLimit", "1", /R100\tlinked\.xml\tfixture\.xml/],
  ])("refuses whatever the caller's %s=%s says", (key, value, indexHolds) => {
    // The filter alone left this to the caller's git config: with detection off
    // the base tree already refused, with it on the base tree exited 0. The flag
    // is what makes the answer structural rather than configured.
    const repo = repoWithRenamedLink([key, value]);
    // Guard the guard, PER ROW. Without it, a fixture that stopped scoring as a
    // rename would collapse all four detection-on rows into duplicates of the
    // `false` control and they would stay green: the exact vacuity this block
    // exists to rule out.
    expect(stagedRaw(repo)).toMatch(indexHolds);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/fixture\.xml \(a symbolic link\)/);
  });

  it("--staged still exits 0 over an ordinary rename of a clean synthetic file", () => {
    // The enumeration widened; the SCOPE did not. Read with the case above,
    // which proves the destination really is read: same shape, name-bearing.
    const repo = makeScanRepo({ git: true });
    writeFileSync(join(repo, "old.xml"), doc(""));
    gitIn(repo, ["add", "old.xml"]);
    gitIn(repo, ["-c", "user.email=t@t.t", "-c", "user.name=T", "commit", "-qm", "base"]);
    gitIn(repo, ["mv", "old.xml", "renamed.xml"]);
    expect(stagedRaw(repo)).toMatch(/ R100\told\.xml\trenamed\.xml/);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// An unmerged path is enumerated, and refused under its own sentence
// ---------------------------------------------------------------------------

describe("phi-scan: an unmerged path refuses the scan", () => {
  /** Leave `name` unmerged in a throwaway repo, with `body(variant)` as content. */
  function repoWithConflict(name: string, body: (variant: string) => string): string {
    const repo = makeScanRepo({ git: true });
    const commit = (msg: string): void =>
      gitIn(repo, ["-c", "user.email=t@t.t", "-c", "user.name=T", "commit", "-qm", msg]);
    writeFileSync(join(repo, name), body("base"));
    gitIn(repo, ["add", name]);
    commit("base");
    gitIn(repo, ["checkout", "-q", "-b", "side"]);
    writeFileSync(join(repo, name), body("side"));
    gitIn(repo, ["add", name]);
    commit("side");
    gitIn(repo, ["checkout", "-q", "-"]);
    writeFileSync(join(repo, name), body("trunk"));
    gitIn(repo, ["add", name]);
    commit("trunk");
    // The merge is EXPECTED to fail, so it does not go through `gitIn`. It
    // carries the identity explicitly like every commit above: a merge with no
    // resolvable `user.name` fails BEFORE it touches the index, which is
    // non-zero without a conflict, and CI (whose runner has no global identity)
    // is where that difference shows up. Assert the CONFLICT, not just the
    // status, so the premise fails loudly instead of an index assertion later.
    const merge = spawnSync(
      "git",
      ["-c", "user.email=t@t.t", "-c", "user.name=T", "merge", "side"],
      { cwd: repo, encoding: "utf8", shell: false },
    );
    expect(merge.status, `merge unexpectedly clean: ${merge.stdout ?? ""}`).not.toBe(0);
    expect(`${merge.stdout ?? ""}${merge.stderr ?? ""}`).toMatch(/CONFLICT/);
    return repo;
  }

  it("REFUSES an unmerged markdown file too, now that this route reads markdown", () => {
    // This asserted 0 until markdown became a scan target. The carve-out's own
    // argument was that an unmerged `.md` is a class the route never reads
    // conflict or no conflict, so refusing announced a failure to read something
    // it was never going to read. That premise is gone. The cost is real and
    // stated: a conflict in CHANGELOG.md refuses this route. `git commit`
    // rejects an unmerged path before the pre-commit hook runs, so no commit
    // path reaches it, and the alternative was the generic could-not-read
    // refusal off `git show`, which fatals on an unmerged path anyway.
    const repo = repoWithConflict("notes.md", (v) => `# notes\n\n${v}\n`);
    const raw = spawnSync("git", ["diff", "--cached", "--raw"], {
      cwd: repo,
      encoding: "utf8",
      shell: false,
    });
    expect(raw.stdout).toMatch(/ U\tnotes\.md/);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/notes\.md \(no stage-0 blob\)/);
    expect(r.stderr).toMatch(/path is unmerged/);
  });

  it("--staged REFUSES an unmerged path and does not call it a non-regular file", () => {
    // `git commit` refuses an unmerged path before the pre-commit hook runs, so
    // this is not a commit hole. It is a false CLEAN report over a path the
    // scan never read, which is the answer this gate must never give.
    const repo = repoWithConflict("conflict.xml", (v) =>
      doc(`<section><text>${v}</text></section>`),
    );
    // Guard the guard: the index really holds a `U` record, at mode 000000.
    const raw = spawnSync("git", ["diff", "--cached", "--raw"], {
      cwd: repo,
      encoding: "utf8",
      shell: false,
    });
    expect(raw.stdout).toMatch(/:100644 000000 [0-9a-f]+ [0-9a-f]+ U\tconflict\.xml/);
    const r = runScannerArgsIn(repo, ["--staged"]);
    expect(r.code, `stdout: ${r.stdout}`).toBe(2);
    expect(r.stderr).toMatch(/1 path is unmerged/);
    expect(r.stderr).toMatch(/conflict\.xml \(no stage-0 blob\)/);
    // Its mode is 000000, which says nothing about a link or a gitlink.
    expect(r.stderr).not.toMatch(/not a regular file/);
    expect(r.stderr).not.toMatch(/mode-000000/);
  });
});

// ---------------------------------------------------------------------------
// A scan that could not RUN exits 2, never 1
// ---------------------------------------------------------------------------

/**
 * 1 is this gate's code for HITS FOUND and node exits 1 on an uncaught throw,
 * so a scanner that fell over reported itself to CI as a finding. Both routes
 * below were measured at exit 1 on the base tree.
 */
describe("phi-scan: a scan that could not run exits 2", () => {
  it("a missing allow-list exits 2, not 1", () => {
    const repo = makeScanRepo({ git: true });
    rmSync(join(repo, "scripts", "phi-allow-list.txt"));
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/allow-list not found/);
    // A stack trace on stderr is what exiting 1 looked like.
    expect(r.stderr).not.toMatch(/InvocationError:/);
  });

  it("a system error thrown past every handler exits 2, not 1", () => {
    // The PROCESS-LEVEL net, probed without depending on file permissions: the
    // `EACCES` case below is the more realistic shape but is skipped for root,
    // and a net whose only probe can be skipped is a net that ships unpinned.
    // A DIRECTORY where the allow-list should be passes `existsSync` and then
    // fails `readFileSync` with `EISDIR`, which is a plain system error, not an
    // InvocationError, so it flies past the handler in `main` exactly as
    // `readdirSync` does.
    const repo = makeScanRepo({ git: true });
    const allowList = join(repo, "scripts", "phi-allow-list.txt");
    rmSync(allowList);
    mkdirSync(allowList);
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/refusing the scan/);
    expect(r.stderr).toMatch(/EISDIR/);
  });

  it.skipIf(process.getuid?.() === 0)("a directory the walk cannot read exits 2, not 1", () => {
    // `readdirSync` raising `EACCES` is a plain system error, not an
    // InvocationError, so it flew past every handler in `main`.
    const repo = makeScanRepo({ git: true });
    const locked = join(repo, "locked");
    mkdirSync(locked, { recursive: true });
    writeFileSync(join(locked, "x.xml"), doc(""));
    chmodSync(locked, 0o000);
    try {
      // The premise, asserted rather than assumed: this really is unreadable
      // for the user running the suite (root would read it happily, which is
      // what the skip above is for).
      expect(() => readdirSync(locked)).toThrow(/EACCES/);
      const r = runScannerIn(repo, null);
      expect(r.code, `stderr: ${r.stderr}`).toBe(2);
      expect(r.stderr).toMatch(/refusing the scan/);
      expect(r.stderr).toMatch(/EACCES/);
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});

/**
 * `PHI-SCAN-WALK-ROOT-SCOPE`: the tracked corpus that BOTH routes read past.
 *
 * This repo's walk was already rooted at the repo root, so the sibling form of
 * the defect (tracked files under `test/` reached by neither route) did not
 * exist here. Three other causes did, and each case below pins one of them with
 * a payload the base scanner demonstrably did not act on. The measured census
 * and the base/head grid live in `documentation/agent-notes.md`; what is pinned
 * here is the behaviour, so a later "simplification" of the scope rules reds.
 *
 * Every clean expectation in this block is paired with a positive the detector
 * DOES catch, in the same case. A `0` on its own proves nothing about whether
 * the file was opened.
 */
describe("phi-scan: the corpus both routes used to skip", () => {
  const SSN = "123-45-6789";

  /** Payload + a control proving the same payload is caught somewhere. */
  function expectCaught(repo: string, rel: string, body: string): void {
    const dirOf = join(repo, rel).slice(0, join(repo, rel).lastIndexOf(sep));
    mkdirSync(dirOf, { recursive: true });
    writeFileSync(join(repo, rel), body);
    gitIn(repo, ["add", rel]);
    const all = runScannerIn(repo, null);
    expect(all.code, `all-mode stderr: ${all.stderr}`).toBe(1);
    expect(all.stderr).toContain(rel);
    const staged = runScannerArgsIn(repo, ["--staged"]);
    expect(staged.code, `staged stderr: ${staged.stderr}`).toBe(1);
    expect(staged.stderr).toContain(rel);
  }

  it("scans a markdown file, which the walk used to drop before reading a byte", () => {
    const repo = makeScanRepo({ git: true });
    expectCaught(repo, "docs/notes.md", `# notes\n\nreference: ${SSN}\n`);
  });

  it("scans a shell script under scripts/, which the extension test never reached", () => {
    // The docblock already claimed `scripts/` code was covered; `isSourceCode`
    // is extension-keyed, so the three real `scripts/*.sh` gates were not.
    const repo = makeScanRepo({ git: true });
    expectCaught(repo, "scripts/check-thing.sh", `#!/bin/sh\n# ref ${SSN}\necho hi\n`);
  });

  it("scans hand-written build config outside src/ and scripts/", () => {
    const repo = makeScanRepo({ git: true });
    expectCaught(repo, "tsup.config.ts", `export default { note: "${SSN}" };\n`);
  });

  it("scans a workflow, a manifest and a licence, none of which had a route", () => {
    const repo = makeScanRepo({ git: true });
    expectCaught(repo, ".github/workflows/ci.yml", `name: ci\n# ${SSN}\n`);
    expectCaught(repo, "package.json", `{ "name": "x", "author": "a@realclinic.example" }\n`);
    expectCaught(repo, "LICENSE", `MIT\n${SSN}\n`);
  });

  it("excludes ONE literal path, not the whole test/scripts/ directory", () => {
    // The accepting half and the refusing half in one case, deliberately: the
    // clean answer is only meaningful next to a positive proving the payload is
    // caught when it is not the one excluded file.
    const repo = makeScanRepo({ git: true });
    const violator = doc("").replace("<family>Doe</family>", "<family>Anderson</family>");
    mkdirSync(join(repo, "test", "scripts"), { recursive: true });

    writeFileSync(join(repo, "test", "scripts", "phi-scan.test.ts"), violator);
    gitIn(repo, ["add", "test/scripts/phi-scan.test.ts"]);
    const excluded = runScannerIn(repo, null);
    expect(excluded.code, `stderr: ${excluded.stderr}`).toBe(0);

    writeFileSync(join(repo, "test", "scripts", "attw-gate.test.ts"), violator);
    gitIn(repo, ["add", "test/scripts/attw-gate.test.ts"]);
    const neighbour = runScannerIn(repo, null);
    expect(neighbour.code, `stderr: ${neighbour.stderr}`).toBe(1);
    expect(neighbour.stderr).toContain("test/scripts/attw-gate.test.ts");
    expect(neighbour.stderr).not.toContain("test/scripts/phi-scan.test.ts");
  });

  it("structurally scans a real C-CDA saved as .md, on ALL THREE routes", () => {
    // A draft of this slice exempted markdown from the structured scan and was
    // refuted as INTRODUCED. It reasoned that the exemption could subtract
    // nothing because no route read a `.md`; there are THREE routes, and the
    // `paths` one did. A real document saved as `notes.md` went from nine hits
    // to `OK, no hits` on it. The shape floor offered as mitigation is EMPTY for
    // this document class: a C-CDA carries its SSN as an undashed
    // `id@extension` and carries no email, so the floor found nothing. This case
    // asserts all three routes, on a payload with no dashed SSN and no email, so
    // it can only pass if the STRUCTURED detectors ran.
    const repo = makeScanRepo({ git: true });
    const violator = doc("").replace("<family>Doe</family>", "<family>Anderson</family>");
    expect(violator, "premise: the payload has no shape-pass token at all").not.toMatch(
      /\d{3}-\d{2}-\d{4}|@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    );

    writeFileSync(join(repo, "notes.md"), violator);
    gitIn(repo, ["add", "notes.md"]);

    const all = runScannerIn(repo, null);
    expect(all.code, `all stderr: ${all.stderr}`).toBe(1);
    expect(all.stderr).toMatch(/Anderson/);

    const staged = runScannerArgsIn(repo, ["--staged"]);
    expect(staged.code, `staged stderr: ${staged.stderr}`).toBe(1);
    expect(staged.stderr).toMatch(/Anderson/);

    const paths = runScannerArgsIn(repo, ["notes.md"]);
    expect(paths.code, `paths stderr: ${paths.stderr}`).toBe(1);
    expect(paths.stderr).toMatch(/Anderson/);
  });

  it("exempts CHANGELOG.md from the STRUCTURED scan only, and keeps the shape pass on it", () => {
    // The one structured exemption, and the only file whose name detection this
    // slice gives up. It is a literal path, not a predicate: a neighbouring
    // generated markdown file is still fully scanned. Both halves are asserted
    // in one case so the clean cell is a decision about a named file.
    const repo = makeScanRepo({ git: true });
    const violator = doc("").replace("<family>Doe</family>", "<family>Anderson</family>");

    writeFileSync(join(repo, "CHANGELOG.md"), violator);
    gitIn(repo, ["add", "CHANGELOG.md"]);
    const exempted = runScannerIn(repo, null);
    expect(exempted.code, `stderr: ${exempted.stderr}`).toBe(0);

    // ...but the shape pass still runs over it, so it is never an unread file.
    writeFileSync(join(repo, "CHANGELOG.md"), `${violator}\n${SSN}\n`);
    gitIn(repo, ["add", "CHANGELOG.md"]);
    const shaped = runScannerIn(repo, null);
    expect(shaped.code, `stderr: ${shaped.stderr}`).toBe(1);
    expect(shaped.stderr).toContain("CHANGELOG.md");
    expect(shaped.stderr).not.toMatch(/Anderson/);

    // ...and the exemption does not leak to a neighbour.
    writeFileSync(join(repo, "CHANGELOG.md"), "# changelog\n");
    writeFileSync(join(repo, "HISTORY.md"), violator);
    gitIn(repo, ["add", "CHANGELOG.md", "HISTORY.md"]);
    const neighbour = runScannerIn(repo, null);
    expect(neighbour.code, `stderr: ${neighbour.stderr}`).toBe(1);
    expect(neighbour.stderr).toMatch(/Anderson/);
    expect(neighbour.stderr).toContain("HISTORY.md");
  });

  it("upstream bound on that exemption: a MARKER-BEARING changeset is caught, a marker-free one is NOT", () => {
    // The bound on giving up `scanCda` for CHANGELOG.md: its content originates
    // in `.changeset/*.md`, which this slice newly opened.
    //
    // THE NEGATIVE HALF IS HERE ON PURPOSE, AND IT IS WHY THIS CASE WAS RENAMED.
    // It was called "a changeset carrying a name is still caught", which its own
    // fixture could not falsify: `doc()` is a whole `<ClinicalDocument
    // xmlns="urn:hl7-org:v3">`, and `looksLikeCda` keys on `hasCdaMarker` for a
    // `.md`, so the case only ever proved the marker-bearing half. A real
    // changeset summary is prose. The marker-free half exits 0, it exits 0 at
    // base too on all three routes, and it must be pinned rather than implied.
    const repo = makeScanRepo({ git: true });
    mkdirSync(join(repo, ".changeset"), { recursive: true });
    const cs = join(repo, ".changeset", "sour-pandas-clap.md");

    // (a) marker-bearing: every structured detector runs.
    writeFileSync(cs, doc("").replace("<family>Doe</family>", "<family>Anderson</family>"));
    gitIn(repo, ["add", ".changeset/sour-pandas-clap.md"]);
    const withMarker = runScannerIn(repo, null);
    expect(withMarker.code, `stderr: ${withMarker.stderr}`).toBe(1);
    expect(withMarker.stderr).toMatch(/Anderson/);

    // (b) marker-free: the structured detectors do NOT run. The bound stops here.
    writeFileSync(cs, '---\n"@cosyte/ccda": patch\n---\n\n<family>Anderson</family>\n');
    gitIn(repo, ["add", ".changeset/sour-pandas-clap.md"]);
    const noMarker = runScannerIn(repo, null);
    expect(noMarker.code, `stderr: ${noMarker.stderr}`).toBe(0);

    // (c) ...but the shape pass still covers any text, marker or not, so the 0
    // above is a bound on WHICH detectors ran and never on whether it was read.
    writeFileSync(cs, `---\n"@cosyte/ccda": patch\n---\n\nref ${SSN}\n`);
    gitIn(repo, ["add", ".changeset/sour-pandas-clap.md"]);
    const shaped = runScannerIn(repo, null);
    expect(shaped.code, `stderr: ${shaped.stderr}`).toBe(1);
    expect(shaped.stderr).toContain(".changeset/sour-pandas-clap.md");
  });

  it("EMAIL declares one mailbox, EMAILDOMAIN would declare every mailbox at it", () => {
    // Why `package.json` needs no path exemption. The allow-list ships
    // `EMAIL hello@cosyte.com`; a different mailbox at the same domain is still
    // a hit, which is the whole difference from an `EMAILDOMAIN` entry.
    const repo = makeScanRepo({ git: true });
    const allowList = readFileSync(join(repo, "scripts", "phi-allow-list.txt"), "utf8");
    expect(allowList, "premise: the shipped allow-list declares the address").toMatch(
      /^EMAIL hello@cosyte\.com$/m,
    );

    writeFileSync(join(repo, "package.json"), `{ "author": "Cosyte <hello@cosyte.com>" }\n`);
    gitIn(repo, ["add", "package.json"]);
    const declared = runScannerIn(repo, null);
    expect(declared.code, `stderr: ${declared.stderr}`).toBe(0);

    writeFileSync(join(repo, "package.json"), `{ "author": "Cosyte <j.doe@cosyte.com>" }\n`);
    gitIn(repo, ["add", "package.json"]);
    const sibling = runScannerIn(repo, null);
    expect(sibling.code, `stderr: ${sibling.stderr}`).toBe(1);
    expect(sibling.stderr).toMatch(/j\.doe@cosyte\.com/);
  });
});

/**
 * `all` MODE READS THE BYTES GIT CARRIES AS A UNION WITH THE WALK.
 *
 * The rule, what it costs and why deduplication is by content are stated once,
 * in `scripts/phi-scan.ts`'s docblock. These cases pin it rather than restate it.
 *
 * EVERY CASE HERE WAS REPRODUCED ON THE BASE COMMIT FIRST, at `exit 0` with
 * `OK, no hits`, over a TRACKED file carrying a whole synthetic patient identity.
 * The identity is wholly invented and lives nowhere but this file's fixture
 * builder; it is not in the allow-list, which is what makes it detectable.
 *
 * THE STATES ARE NOT A SIBLING'S LIST. `hl7`, `mllp`, `astm` and `deid` each
 * closed this half against a different weakness, and this repo's walk has been
 * rooted at the REPO ROOT throughout, so the "tracked files outside every walk
 * root" shape those notes describe DOES NOT EXIST here. What does exist is the
 * set below: the walk answers a question about the disk, and four ways the disk
 * and the index disagree while the walk still had the only voice.
 */
describe("phi-scan: the all-mode sweep reads the bytes git carries", () => {
  /**
   * A synthetic C-CDA carrying one token for every structured detector: a
   * person name, a date of birth, an SSN by OID, a bare-numeric MRN, a street
   * address, a city, a postal code and a non-555 telecom. The SSN is built from
   * parts so no literal nine-digit run lives in this source, matching the
   * identifier cases above.
   */
  function payload(): string {
    const ssn = ["529", "44", "7311"].join("");
    return `<?xml version="1.0"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.4.1" extension="${ssn}"/>
    <id root="1.2.3.4" extension="4471902238"/>
    <addr>
      <streetAddressLine>4417 Kestrel Hollow Way</streetAddressLine>
      <city>Marlingford</city>
      <postalCode>44107</postalCode>
    </addr>
    <telecom value="tel:+1-216-448-7712"/>
    <patient>
      <name><given>Corvin</given><family>Ashgrove</family></name>
      <birthTime value="19731105"/>
    </patient>
  </patientRole></recordTarget>
</ClinicalDocument>
`;
  }

  /** Every locus the payload above is meant to trip, asserted together. */
  function expectWholeIdentityCaught(r: RunResult): void {
    expect(r.stderr).toMatch(/Corvin/);
    expect(r.stderr).toMatch(/Ashgrove/);
    expect(r.stderr).toMatch(/19731105/);
    expect(r.stderr).toMatch(/name\/given/);
    expect(r.stderr).toMatch(/birthTime@value/);
    expect(r.stderr).toMatch(/id@extension/);
    expect(r.stderr).toMatch(/streetAddressLine/);
    expect(r.stderr).toMatch(/postalCode/);
    expect(r.stderr).toMatch(/telecom@value/);
  }

  /** Commit `content` at `rel` in a throwaway repo, then hand the repo back. */
  function repoTracking(rel: string, content: string): string {
    const repo = makeScanRepo({ git: true });
    const abs = join(repo, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
    gitIn(repo, ["add", "-f", rel]);
    return repo;
  }

  it("catches a tracked blob whose PATH is occupied by a DIRECTORY", () => {
    // The decoy-contents shape, and the one a path-set reconciliation cannot
    // see: `git ls-files` still names the path, so the path IS present. Only
    // reading the OBJECT distinguishes it from a file that was scanned.
    const repo = repoTracking("corpus.xml", payload());
    rmSync(join(repo, "corpus.xml"), { force: true });
    mkdirSync(join(repo, "corpus.xml"), { recursive: true });
    writeFileSync(join(repo, "corpus.xml", "readme.txt"), "nothing to see here\n");

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expectWholeIdentityCaught(r);
    // The locus says WHICH copy leaked, so a reader who opens the path and finds
    // a directory is not left thinking the diagnostic was wrong.
    expect(r.stderr).toMatch(/corpus\.xml \(as git carries it\)/);
  });

  it("catches a tracked blob under a WALK_SKIP_DIRS name", () => {
    // `WALK_SKIP_DIRS` is matched by NAME at any depth, so the walk drops the
    // whole subtree before a byte is read. Nothing in this repo tracks such a
    // path today; nothing stops one being added, and the skip is silent.
    const repo = repoTracking("dist/corpus.xml", payload());
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expectWholeIdentityCaught(r);
    expect(r.stderr).toMatch(/dist\/corpus\.xml \(as git carries it\)/);
  });

  it("catches a tracked blob that is ABSENT from the working tree", () => {
    // The short-working-tree shape. A floor-of-one does not detect it and a
    // denominator does not either: a count counts the files that DID exist.
    const repo = repoTracking("corpus.xml", payload());
    rmSync(join(repo, "corpus.xml"), { force: true });
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expectWholeIdentityCaught(r);
  });

  it("catches a tracked blob that is BOTH gitignored and absent from the working tree", () => {
    // Scanned by nothing at base: the walk never saw the file, and the ignore
    // filter would have dropped it if it had. `git check-ignore` does not report
    // a TRACKED path as ignored, so the premise is asserted rather than assumed.
    const repo = repoTracking("corpus.xml", payload());
    writeFileSync(join(repo, ".gitignore"), "corpus.xml\n");
    const ci = spawnSync("git", ["check-ignore", "corpus.xml"], {
      cwd: repo,
      encoding: "utf8",
      shell: false,
    });
    expect(ci.status, "premise: git says a tracked path is not ignored").not.toBe(0);
    rmSync(join(repo, "corpus.xml"), { force: true });
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expectWholeIdentityCaught(r);
  });

  it("REFUSES a tracked GITLINK, whose working tree may not exist at all", () => {
    // A gitlink carries a commit id and no bytes at this path, so there is
    // nothing to scan and nothing that may be reported clean. Same rule and the
    // same closed-set token as the `--staged` route.
    const repo = makeScanRepo({ git: true });
    const nested = join(repo, "nested");
    mkdirSync(nested, { recursive: true });
    gitIn(nested, ["init", "-q"]);
    writeFileSync(join(nested, "doc.xml"), payload());
    gitIn(nested, ["add", "-A"]);
    gitIn(nested, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "n"]);
    gitIn(repo, ["add", "nested"]);
    // The working tree is removed, which is exactly the state the walk cannot
    // report on and used to pass green over.
    rmSync(nested, { recursive: true, force: true });

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/index entry is not a regular blob/);
    expect(r.stderr).toMatch(/nested \(a gitlink \(a nested repository\)\)/);
  });

  it("REFUSES a tracked SYMBOLIC LINK without ever printing its target", () => {
    // A link's blob IS its target path, which is working-tree text that can
    // itself carry PHI, so the refusal names the entry and an engine-owned token
    // for the mode and nothing else.
    const repo = makeScanRepo({ git: true });
    symlinkSync("../patients/record.xml", join(repo, "link.xml"));
    gitIn(repo, ["add", "link.xml"]);
    rmSync(join(repo, "link.xml"), { force: true });

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/link\.xml \(a symbolic link\)/);
    expect(r.stderr).not.toContain("patients/record.xml");
  });

  it("scans BOTH copies when the working tree and the index disagree (the EOL axis)", () => {
    // Deduplication is by CONTENT, so a path whose two copies differ is scanned
    // twice rather than once, and the union is a superset by construction. This
    // is the property that makes it correct under EOL normalization, where the
    // index carries LF and the working tree CRLF: a leak present in either form
    // is found, and neither form stands in for the other.
    const repo = repoTracking("corpus.xml", payload());
    // The working copy is scrubbed; the committed blob is not.
    writeFileSync(join(repo, "corpus.xml"), "<ClinicalDocument/>\n");
    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expectWholeIdentityCaught(r);
    expect(r.stderr).toMatch(/corpus\.xml \(as git carries it\)/);

    // And the reverse: a clean blob with a leaking working copy is still caught
    // by the walk, under the UNdecorated locus.
    const repo2 = repoTracking("corpus.xml", "<ClinicalDocument/>\n");
    writeFileSync(join(repo2, "corpus.xml"), payload());
    const r2 = runScannerIn(repo2, null);
    expect(r2.code, `stderr: ${r2.stderr}`).toBe(1);
    expectWholeIdentityCaught(r2);
    expect(r2.stderr).toMatch(/HIT: corpus\.xml\n/);
  });

  it("reads nothing twice, and its ONLY fixed cost is one `rev-parse`, when the tree matches", () => {
    // The cost claim, asserted rather than reasoned about, and asserted at the
    // width the prose claims rather than narrower. An earlier draft of this case
    // was titled "no subprocess" and checked only that `cat-file` was absent,
    // which is a measurement narrower than its own title: the union DOES add one
    // `git rev-parse --show-object-format` per run, because the deduplication
    // needs the algorithm before it can compare anything. The whole call list is
    // pinned, so a fourth call cannot appear unremarked. A shim that LOGS each
    // git call is the measurement; it delegates to the real git so the run is
    // otherwise identical.
    const repo = repoTracking("corpus.xml", "<ClinicalDocument/>\n");
    const logDir = tempDir("ccda-phi-gitlog-");
    const log = join(logDir, "calls.log");
    const shim = tempDir("ccda-phi-countshim-");
    writeFileSync(
      join(shim, "git"),
      `#!/bin/sh\nprintf '%s\\n' "$1" >> '${log}'\nexec '${realGit()}' "$@"\n`,
      { mode: 0o755 },
    );

    const r = runScannerIn(repo, shim);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK, no hits/);
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
    // Sorted, because the ORDER is pinned by the TOCTOU cases and asserting it
    // twice would make this case fail for their reason rather than its own.
    expect([...calls].sort(), `git calls: ${calls.join(", ")}`).toEqual([
      "check-ignore",
      "ls-files",
      "rev-parse",
    ]);
  });

  it("REFUSES an UNMERGED path, which has no single blob for the sweep to read", () => {
    // THE AXIS THAT DID NOT PORT. `--staged` spots this state from `--raw`'s
    // status `U` and a destination mode of `000000`; `git ls-files -s` reports
    // the same path only at stages 1, 2 and/or 3 and NEVER at stage 0, its
    // records normally at ordinary blob modes. A draft that took the first
    // record per path and never read the stage scanned stage 1, THE MERGE BASE,
    // and reported it as the bytes git carries; the same draft printed
    // `OK, no hits` at exit 0 over a marker living only in stage 3. Both were
    // measured before this case existed.
    //
    // THE FIXTURE IS ONE SHAPE AND THE RULE IS NOT. This writes the three-record
    // modify/modify shape; add/add and modify/delete carry two, and a
    // symlink-versus-file conflict carries a `120000` one. The code keys on the
    // ABSENCE OF STAGE 0, which holds for all of them, so the premise asserted
    // below is about THIS fixture and is deliberately not written as a rule. A
    // draft wrote it as one and a refuter falsified it.
    //
    // THE STAGES ARE WRITTEN WITH `update-index`, NOT PRODUCED BY A REAL MERGE,
    // AND THAT IS A CORRECTNESS FIX RATHER THAN A SHORTCUT. A draft built them
    // by branching and merging; it passed here and went RED IN CI, where
    // `ls-files -s` came back with no records for the path at all, so the case
    // was grading the fixture's environment rather than the scanner. What the
    // scanner is about is an INDEX HOLDING NO STAGE-0 RECORD FOR A PATH, and
    // that state is what this writes, directly and identically everywhere. It is
    // the same index a real `git merge` produces, verified by hand against one.
    const repo = makeScanRepo({ git: true });
    const blob = (content: string): string => {
      const r = spawnSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: repo,
        input: content,
        encoding: "utf8",
        shell: false,
      });
      expect(r.status, r.stderr).toBe(0);
      return r.stdout.trim();
    };
    const base = blob(payload()); // stage 1: the merge BASE carries the identity
    const ours = blob("<ClinicalDocument><!-- ours --></ClinicalDocument>\n");
    const theirs = blob("<ClinicalDocument/>\n");
    const written = spawnSync("git", ["update-index", "--index-info"], {
      cwd: repo,
      input:
        `100644 ${base} 1\tc.xml\n` + `100644 ${ours} 2\tc.xml\n` + `100644 ${theirs} 3\tc.xml\n`,
      encoding: "utf8",
      shell: false,
    });
    expect(written.status, written.stderr).toBe(0);
    // The working tree gets the conflicted-looking file, so the WALK has
    // something clean to read and the refusal cannot come from the walk instead.
    writeFileSync(
      join(repo, "c.xml"),
      "<ClinicalDocument><!-- conflicted --></ClinicalDocument>\n",
    );

    // THIS FIXTURE'S premise, asserted rather than assumed: three records, none
    // at stage 0, all at a mode the non-blob rule would happily accept.
    const listed = spawnSync("git", ["ls-files", "-s", "c.xml"], {
      cwd: repo,
      encoding: "utf8",
      shell: false,
    });
    const stages = listed.stdout.trim().split("\n");
    expect(stages, `ls-files -s said: ${JSON.stringify(listed.stdout)}`).toHaveLength(3);
    for (const line of stages) expect(line).toMatch(/^100644 [0-9a-f]+ [123]\t/);

    const r = runScannerIn(repo, null);
    expect(r.code, `stderr: ${r.stderr}`).toBe(2);
    expect(r.stderr).toMatch(/path is unmerged/);
    expect(r.stderr).toMatch(/c\.xml \(no stage-0 blob\)/);
    // It must NOT be reported as a link or a gitlink, and it must NOT be scanned
    // as if the merge base were what git carries.
    expect(r.stderr).not.toMatch(/regular blob/);
    expect(r.stderr).not.toMatch(/as git carries it/);
  });
});

/**
 * THE POSITIVE CONTROL. A detector zero can be a gap rather than a clearance,
 * and the only thing that tells them apart is watching the same sweep fire over
 * the same corpus.
 *
 * `pnpm phi-scan` reports `OK, no hits` over this repo's committed corpus, and
 * one case above already pins that clean result. On its own it is worth nothing:
 * a scanner that had silently stopped reading would print exactly the same line.
 * So these two cases run the REAL sweep over a byte-for-byte COPY of the real
 * corpus, first clean (reproducing the claim) and then with one synthetic marker
 * planted in it (proving the claim was a decision and not an absence). The copy
 * is used rather than the repo itself so a marker is never written into the tree
 * a parallel worker or a commit could see.
 *
 * BOTH HALVES OF THE ROUTE ARE CONTROLLED, because they can fail independently:
 * the walk half with the marker on disk, and the union half with the marker
 * reachable only through git.
 */
describe("phi-scan: positive control over the corpus this repo claims to clear", () => {
  /** A throwaway git repo holding a copy of every file THIS repo tracks. */
  function corpusClone(): string {
    const d = tempDir("ccda-phi-corpus-");
    const listed = spawnSync("git", ["ls-files", "-z"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      shell: false,
    });
    expect(listed.status, listed.stderr).toBe(0);
    const tracked = listed.stdout.split("\0").filter((p) => p !== "");
    expect(tracked.length, "premise: this repo tracks files").toBeGreaterThan(0);
    for (const rel of tracked) {
      const dest = join(d, rel);
      mkdirSync(join(dest, ".."), { recursive: true });
      copyFileSync(join(REPO_ROOT, rel), dest);
    }
    gitIn(d, ["init", "-q"]);
    gitIn(d, ["add", "-A"]);
    return d;
  }

  it("reproduces the clean result over the copied corpus, and then FIRES on it", () => {
    const clone = corpusClone();
    const clean = runScannerIn(clone, null);
    expect(clean.code, `stderr: ${clean.stderr}`).toBe(0);
    expect(clean.stdout).toMatch(/OK, no hits/);

    // The same sweep, the same corpus, one synthetic marker added. `.xml` is
    // enough for `looksLikeCda`; the token itself is what must be found.
    const planted = join(clone, "control-record.xml");
    writeFileSync(
      planted,
      `<ClinicalDocument xmlns="urn:hl7-org:v3"><recordTarget><patientRole><patient>` +
        `<name><family>Ashgrove</family></name></patient></patientRole></recordTarget>` +
        `</ClinicalDocument>\n`,
    );
    gitIn(clone, ["add", "-f", "control-record.xml"]);
    const fired = runScannerIn(clone, null);
    expect(fired.code, `stderr: ${fired.stderr}`).toBe(1);
    expect(fired.stderr).toMatch(/control-record\.xml/);
    expect(fired.stderr).toMatch(/Ashgrove/);
  });

  it("fires on the copied corpus when the marker is reachable ONLY through git", () => {
    // The union half of the same control. The marker is committed and then taken
    // off the disk, so the walk has nothing to find and only the index does.
    const clone = corpusClone();
    const planted = join(clone, "control-record.xml");
    writeFileSync(
      planted,
      `<ClinicalDocument xmlns="urn:hl7-org:v3"><recordTarget><patientRole><patient>` +
        `<name><family>Ashgrove</family></name></patient></patientRole></recordTarget>` +
        `</ClinicalDocument>\n`,
    );
    gitIn(clone, ["add", "-f", "control-record.xml"]);
    rmSync(planted, { force: true });
    expect(existsSync(planted), "premise: the walk has nothing to find").toBe(false);

    const fired = runScannerIn(clone, null);
    expect(fired.code, `stderr: ${fired.stderr}`).toBe(1);
    expect(fired.stderr).toMatch(/control-record\.xml \(as git carries it\)/);
    expect(fired.stderr).toMatch(/Ashgrove/);
  });
});
