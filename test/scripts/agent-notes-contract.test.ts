/**
 * Tests for scripts/check-agent-notes-contract.mjs, the gate on this repo's
 * `CLAUDE.md` <-> `documentation/agent-notes.md` two-file contract.
 *
 * WHAT THESE PIN, AND WHY EACH ONE IS HERE:
 *
 *  1. THAT THE REAL TREE IS GREEN. This is not decoration. Every fixture below writes
 *     pointer-shaped text, and the gate scans every tracked file in this repository,
 *     including this one. A literal pointer left in this file would be a pointer in the
 *     real corpus. Every such string here is therefore built by concatenation, and this
 *     case is what proves it worked.
 *  2. THE PRIMARY CLASS, RED. A heading reworded in `agent-notes.md` strands the
 *     pointers at it, in both live pointer forms.
 *  3. THE BYPASS, REPRODUCED END TO END. A guard matching only the path form is GREEN
 *     while a bare `` `#anchor` `` pointer is broken. That is demonstrated rather than
 *     argued: the same fixture is run twice, and the only difference between the red
 *     run and the green one is the bare pointer. This is the shape that got `ncpdp#64`:
 *     a guard that fails to catch something is an overclaim, not merely a gap.
 *  4. THE HEADING RECOGNISER, IN BOTH DIRECTIONS. Three leading spaces and a setext
 *     underline are real headings that a `/^#{1,6} /` test misses, which would be a
 *     FALSE RED on a pointer that is fine. A `#` inside a fenced code block is NOT a
 *     heading, and counting it would be a FALSE GREEN on a pointer that resolves to
 *     nothing. Both directions are pinned because they fail in opposite ways.
 *  5. THE EMPTINESS RULE, WITH ITS NEGATIVE CONTROL. An empty targeted section reds; a
 *     container heading whose body is its subsections does not. A gate that only ever
 *     fails is not a gate.
 *  6. THE CORPUS IS NOT A DECLARED ROOT. A broken pointer in a source file, far from
 *     `CLAUDE.md`, still reds. A check can print green over a corpus it never opened,
 *     and no denominator detects that, so the corpus is `git ls-files` and the run
 *     reconciles against it.
 *  7. FOUR CONTROLS THAT MUST REFUSE RATHER THAN PASS: pointed at an empty repository,
 *     at a tree with no `agent-notes.md`, at a tree with a tracked file missing from the
 *     worktree, and at a directory that is not a git repository at all. Each is a state
 *     where the gate cannot make a claim, and each must exit non-zero. "Existence is not
 *     observation": a file the run could not open must never pass for a file that was
 *     clean.
 *  8. THAT ZERO POINTERS REFUSES. An empty result set is indistinguishable from a clean
 *     run by any count, so it cannot be allowed to read as one.
 *
 * The fixtures are throwaway git repositories in a temp dir. They are real repositories
 * because the gate enumerates its corpus with `git ls-files`, and a tree with no index
 * would exercise a code path no real run takes.
 *
 * SECURITY: every subprocess call uses spawnSync with array args. No exec, no shell
 * form. Nothing here writes outside the temp dir it created.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const REPO_ROOT = process.cwd();
const GATE = join(REPO_ROOT, "scripts", "check-agent-notes-contract.mjs");

/**
 * Built by concatenation, never written as one literal. See case 1 in the header: a
 * literal pointer in this file would be a live pointer in this repository's own corpus.
 */
const NOTES_PATH = "documentation/agent-notes.md";
const ptr = (anchor: string): string => `${NOTES_PATH}#${anchor}`;

interface RunResult {
  code: number;
  out: string;
}

function run(args: string[]): RunResult {
  const r = spawnSync(process.execPath, [GATE, ...args], { encoding: "utf8", timeout: 60_000 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const gateOn = (root: string): RunResult => run(["--root", root]);

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr ?? ""}`);
}

let root: string;

/**
 * Write a throwaway repository and track exactly the paths given. Paths are staged
 * explicitly, one at a time, rather than with a catch-all, so a case that deliberately
 * leaves a file untracked gets what it asked for.
 */
function makeRepo(name: string, files: Record<string, string>): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--quiet"]);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
    git(dir, ["add", "--", rel]);
  }
  return dir;
}

/** A minimal but structurally real pair of files, from which each case deviates once. */
function notes(sections: string): string {
  return `# Fixture agent notes\n\nThe long-form record.\n${sections}`;
}

const SECTION_A = `\n## The first trap\n\nThe reasoning behind the first trap.\n`;
const SECTION_B = `\n## The second trap\n\nThe reasoning behind the second trap.\n`;

function claudeMd(body: string): string {
  return `# Fixture project guide\n\n> The long-form record is \`${NOTES_PATH}\`.\n\n${body}\n`;
}

/** The healthy baseline every deviation is measured against. */
const HEALTHY = {
  "CLAUDE.md": claudeMd(
    `- Do the first thing.\n  Why: \`${ptr("the-first-trap")}\`\n- Do the second thing.\n  Why: \`${ptr("the-second-trap")}\`\n`,
  ),
  [NOTES_PATH]: notes(SECTION_A + SECTION_B),
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ccda-agent-notes-gate-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("agent-notes contract gate", () => {
  it("is green on this repository, and on a healthy fixture", () => {
    const real = gateOn(REPO_ROOT);
    expect(real.out).toContain("agent-notes contract: OK");
    expect(real.code).toBe(0);

    const healthy = gateOn(makeRepo("healthy", HEALTHY));
    expect(healthy.out).toContain("agent-notes contract: OK");
    expect(healthy.code).toBe(0);
  });

  it("reports the corpus it actually opened, reconciled against git", () => {
    const r = gateOn(REPO_ROOT);
    const tracked = spawnSync("git", ["-C", REPO_ROOT, "ls-files"], { encoding: "utf8" })
      .stdout.split("\n")
      .filter((l) => l !== "").length;
    // The number in the report is the number git gives, not a number the gate chose.
    expect(r.out).toContain(`${tracked} tracked`);
    expect(r.out).toContain("0 unreadable");
  });

  it("reds when a path-form pointer names a heading that was reworded", () => {
    const dir = makeRepo("reworded", {
      ...HEALTHY,
      [NOTES_PATH]: notes(
        `\n## The first trap, renamed\n\nThe reasoning behind the first trap.\n` + SECTION_B,
      ),
    });
    const r = gateOn(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("#the-first-trap");
    expect(r.out).toContain("matches no heading");
  });

  // Case 3 in the header. The bypass, not the argument for it.
  it("reds on a broken BARE pointer that a path-form-only guard would pass", () => {
    const brokenBare = `- Do the first thing.\n  Why: \`${ptr("the-first-trap")}\`\n- Also see \`#the-second-trap-renamed-away\` one section down.\n`;
    const withBare = makeRepo("bare-broken", { ...HEALTHY, "CLAUDE.md": claudeMd(brokenBare) });
    const red = gateOn(withBare);
    expect(red.code).toBe(1);
    expect(red.out).toContain("#the-second-trap-renamed-away");
    expect(red.out).toContain("bare form");

    // The control that makes the bypass a measurement: the SAME tree with the bare
    // pointer deleted and nothing else changed is green. So every path-form pointer in
    // the red tree resolved, and a guard reading only the path form would have printed
    // clean over a pointer that goes nowhere.
    const withoutBare = makeRepo("bare-removed", {
      ...HEALTHY,
      "CLAUDE.md": claudeMd(
        `- Do the first thing.\n  Why: \`${ptr("the-first-trap")}\`\n- Also see one section down.\n`,
      ),
    });
    const green = gateOn(withoutBare);
    expect(green.code).toBe(0);
    expect(green.out).toContain("agent-notes contract: OK");
  });

  it("does not read a bare anchor outside CLAUDE.md as a pointer", () => {
    // Measured over this repository: `#id` and `#62` occur in sources and tests as XML
    // id and C-CDA narrative reference targets. Requiring three hyphen-joined runs
    // excludes those by shape; this pins the scope half of the same cut.
    const anchor = "not-a-real-anchor-here";
    const elsewhere = makeRepo("bare-elsewhere", {
      ...HEALTHY,
      "src/narrative.ts": `// The narrative reference target is \`#${anchor}\`.\n`,
    });
    const ignored = gateOn(elsewhere);
    expect(ignored.code).toBe(0);
    expect(ignored.out).toContain("0 bare form");
    expect(ignored.out).not.toContain(anchor);

    // The other side of the same cut, so the scope is a demonstration and not a claim:
    // the identical string in CLAUDE.md IS a pointer, and reds.
    const inClaudeMd = makeRepo("bare-in-claude-md", {
      ...HEALTHY,
      "CLAUDE.md": claudeMd(`- One.\n  Why: \`${ptr("the-first-trap")}\`\n- See \`#${anchor}\`.\n`),
    });
    const red = gateOn(inClaudeMd);
    expect(red.code).toBe(1);
    expect(red.out).toContain(anchor);
  });

  it("accepts an indented ATX heading and a setext heading", () => {
    // Both are real headings that a `/^#{1,6} /` test misses. Missing them is a false
    // red on a pointer that is fine.
    const dir = makeRepo("heading-shapes", {
      "CLAUDE.md": claudeMd(
        `- One.\n  Why: \`${ptr("indented-heading")}\`\n- Two.\n  Why: \`${ptr("setext-heading")}\`\n`,
      ),
      [NOTES_PATH]: notes(
        `\n   ## Indented heading\n\nBody.\n\nSetext heading\n--------------\n\nBody.\n`,
      ),
    });
    const r = gateOn(dir);
    expect(r.out).toContain("agent-notes contract: OK");
    expect(r.code).toBe(0);
  });

  it("does not count a hash inside a fenced code block as a heading", () => {
    // The false-green direction: counting it would let this pointer resolve to a
    // section that does not exist.
    const dir = makeRepo("fenced", {
      "CLAUDE.md": claudeMd(`- One.\n  Why: \`${ptr("fenced-not-a-heading")}\`\n`),
      [NOTES_PATH]: notes(
        `\n## A real heading\n\nBody.\n\n\`\`\`sh\n## Fenced not a heading\n\`\`\`\n`,
      ),
    });
    const r = gateOn(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("#fenced-not-a-heading");
  });

  it("reds when a pointer resolves to an empty section", () => {
    const dir = makeRepo("empty-section", {
      ...HEALTHY,
      [NOTES_PATH]: notes(
        `\n## The first trap\n\n## The second trap\n\nThe reasoning behind the second trap.\n`,
      ),
    });
    const r = gateOn(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("is empty");
    expect(r.out).toContain("a pointer resolves to it");
  });

  it("accepts a container heading whose body is its own subsections", () => {
    const dir = makeRepo("container", {
      "CLAUDE.md": claudeMd(`- One.\n  Why: \`${ptr("a-container")}\`\n`),
      [NOTES_PATH]: notes(`\n## A container\n\n### A subsection\n\nBody.\n`),
    });
    const r = gateOn(dir);
    expect(r.out).toContain("agent-notes contract: OK");
    expect(r.code).toBe(0);
  });

  it("reproduces GitHub's duplicate-anchor suffixing", () => {
    const dir = makeRepo("duplicates", {
      "CLAUDE.md": claudeMd(
        `- One.\n  Why: \`${ptr("same-title")}\`\n- Two.\n  Why: \`${ptr("same-title-1")}\`\n`,
      ),
      [NOTES_PATH]: notes(`\n## Same title\n\nFirst body.\n\n## Same title\n\nSecond body.\n`),
    });
    const r = gateOn(dir);
    expect(r.out).toContain("agent-notes contract: OK");
    expect(r.code).toBe(0);
  });

  it("checks pointers in files far from CLAUDE.md, because the corpus is git's", () => {
    const dir = makeRepo("far-pointer", {
      ...HEALTHY,
      "src/parser/thing.ts": `/** See \`${ptr("a-trap-that-was-deleted")}\` before changing this. */\n`,
    });
    const r = gateOn(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("src/parser/thing.ts");
    expect(r.out).toContain("#a-trap-that-was-deleted");
  });

  it("skips a tracked binary file without failing, and counts it", () => {
    const dir = makeRepo("binary", HEALTHY);
    writeFileSync(join(dir, "fixture.bin"), Buffer.from([0x00, 0x01, 0x02, 0x00]));
    git(dir, ["add", "--", "fixture.bin"]);
    const r = gateOn(dir);
    expect(r.code).toBe(0);
    expect(r.out).toContain("1 binary (skipped)");
  });

  it("refuses a heading whose anchor it would have to guess", () => {
    const dir = makeRepo("non-ascii", {
      ...HEALTHY,
      [NOTES_PATH]: notes(`\n## The first trap\n\nBody.\n\n## Café section\n\nBody.\n`),
    });
    const r = gateOn(dir);
    expect(r.code).toBe(2);
    expect(r.out).toContain("CANNOT CHECK");
    expect(r.out).toContain("non-ASCII");
  });

  describe("controls: states where the gate must refuse rather than pass", () => {
    it("refuses an empty repository instead of printing green over nothing", () => {
      const dir = makeRepo("empty-repo", {});
      const r = gateOn(dir);
      expect(r.code).toBe(2);
      expect(r.out).toContain("no tracked files");
      expect(r.out).not.toContain("OK");
    });

    it("refuses a tree with no agent-notes.md", () => {
      const dir = makeRepo("no-notes", { "CLAUDE.md": claudeMd("- One.\n") });
      const r = gateOn(dir);
      expect(r.code).toBe(2);
      expect(r.out).toContain(NOTES_PATH);
      expect(r.out).not.toContain("OK");
    });

    it("refuses when a tracked file is missing from the worktree", () => {
      // Existence is not observation. A file the run could not open must not pass for a
      // file that was clean, and no count of the files that DID open detects it.
      const dir = makeRepo("missing-file", { ...HEALTHY, "docs/extra.md": "Some prose.\n" });
      unlinkSync(join(dir, "docs/extra.md"));
      const r = gateOn(dir);
      expect(r.code).toBe(2);
      expect(r.out).toContain("could not be read");
      expect(r.out).toContain("docs/extra.md");
    });

    it("refuses when no pointer is found at all", () => {
      const dir = makeRepo("no-pointers", {
        "CLAUDE.md": claudeMd("- One thing, with no pointer.\n"),
        [NOTES_PATH]: notes(SECTION_A),
      });
      const r = gateOn(dir);
      expect(r.code).toBe(2);
      expect(r.out).toContain("no pointer into");
      expect(r.out).not.toContain("OK");
    });

    it("refuses a directory that is not a git repository", () => {
      const dir = join(root, "not-a-repo");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "CLAUDE.md"), claudeMd("- One.\n"));
      const r = gateOn(dir);
      expect(r.code).toBe(2);
      expect(r.out).toContain("CANNOT CHECK");
    });
  });
});
