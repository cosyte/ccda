import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract gate over `.github/workflows/release.yml`.
 *
 * The release workflow in this repository is a thin caller of a shared, org-wide release pipeline.
 * A called workflow may only downgrade the calling job's `GITHUB_TOKEN`, never escalate it, so
 * every permission the shared pipeline asks for has to be granted by the calling job here, at that
 * level or wider. When it is not, GitHub refuses the whole workflow at startup: the run ends in
 * about a second, with no jobs, no logs and no printed refusal. That is a silent outage of this
 * package's only publish path, and it happened: a caller granting `contents`, `id-token` and
 * `pull-requests` and nothing else was granting `actions: none`, against a pipeline that asks for
 * `actions: read`, and every release run was refused for months before anyone noticed.
 *
 * `actionlint`, which the shared CI pipeline runs, does not model reusable-workflow permission
 * elevation, so it did not catch that and will not catch the next one. This file is the cheap
 * repo-local replacement: it turns the same regression into a red pull request instead of a
 * silence.
 *
 * The workflow is read and asserted as TEXT. This package declares no YAML parser and does not want
 * one for a fifteen-line file of fixed shape, so the scanning below is deliberately small: it
 * understands indentation, `key: value` pairs and trailing comments, and nothing else.
 */

/** Path of the workflow under contract, relative to the repository root. Named in every message. */
const WORKFLOW_PATH = ".github/workflows/release.yml";

/** The shared release pipeline this caller exists to invoke. */
const SHARED_RELEASE_WORKFLOW = "cosyte/.github/.github/workflows/release.yml@main";

const ROOT = join(import.meta.dirname, "..");

interface RequiredGrant {
  /** The permission key as spelled in a `permissions:` block. */
  readonly key: string;
  /** Levels that satisfy the requirement. A wider grant satisfies a narrower request. */
  readonly accepts: readonly string[];
  /** How the requirement is spelled in a failure message. */
  readonly stated: string;
}

/**
 * What the shared release pipeline requests at its own top level. The caller must grant each of
 * these, at that level or wider, or the call is an escalation.
 */
const REQUIRED_GRANTS: readonly RequiredGrant[] = [
  { key: "actions", accepts: ["read", "write"], stated: "actions: read" },
  { key: "contents", accepts: ["write"], stated: "contents: write" },
  { key: "id-token", accepts: ["write"], stated: "id-token: write" },
  { key: "pull-requests", accepts: ["write"], stated: "pull-requests: write" },
];

// ---- Messages -----------------------------------------------------------------------------
//
// Every message names the file to change and what is missing from it. The `actions` one also says
// why the symptom is silence, because that is the fact a reader cannot recover from a run page:
// there is no failed job to open and no log to read.

/** Why a missing `actions: read` is invisible rather than merely broken. */
const SILENT_STARTUP_REFUSAL =
  "GitHub refuses the whole workflow at startup, before any job or step runs, so the run ends in " +
  "about a second with no jobs and no logs, and nothing is printed to say why.";

function missingActionsMessage(): string {
  return (
    `\`${WORKFLOW_PATH}\`: the release job does not grant \`actions: read\`. The shared release ` +
    `workflow declares \`actions: read\` at its own top level, and a called workflow may only ` +
    `downgrade the calling job's token, never escalate it, so a caller that grants ` +
    `contents/id-token/pull-requests and nothing else is granting \`actions: none\` and the call ` +
    `is an escalation. ${SILENT_STARTUP_REFUSAL} Add \`actions: read\` to the \`permissions:\` ` +
    `block of the release job in \`${WORKFLOW_PATH}\`.`
  );
}

function missingGrantMessage(grant: RequiredGrant): string {
  return (
    `\`${WORKFLOW_PATH}\`: the release job does not grant \`${grant.stated}\`, which the shared ` +
    `release workflow requests at its own top level. A called workflow may only downgrade the ` +
    `calling job's token, so every permission it requests must be granted here at that level or ` +
    `wider. Add \`${grant.stated}\` to the \`permissions:\` block of the release job in ` +
    `\`${WORKFLOW_PATH}\`.`
  );
}

function noPermissionsBlockMessage(): string {
  return (
    `\`${WORKFLOW_PATH}\`: the release job declares no \`permissions:\` block at all, so it ` +
    `inherits the repository default for the workflow token. Where that default is the ` +
    `restricted one the job holds \`actions: none\` and \`contents: read\`, so the shared release ` +
    `workflow's request for \`actions: read\`, \`contents: write\`, \`id-token: write\` and ` +
    `\`pull-requests: write\` is an escalation. ${SILENT_STARTUP_REFUSAL} Declare the ` +
    `\`permissions:\` block on the release job in \`${WORKFLOW_PATH}\`.`
  );
}

function wrongTargetMessage(actual: string): string {
  return (
    `\`${WORKFLOW_PATH}\`: the release job calls \`${actual}\`, but the permission contract this ` +
    `test asserts is only meaningful against \`${SHARED_RELEASE_WORKFLOW}\`, whose own top-level ` +
    `\`permissions:\` request is what the grants above have to cover. If the shared release ` +
    `workflow really did move, update \`${WORKFLOW_PATH}\` and this test together.`
  );
}

function noCallingJobMessage(): string {
  return (
    `\`${WORKFLOW_PATH}\`: no job in this workflow carries a \`uses:\` key, so there is no call ` +
    `to \`${SHARED_RELEASE_WORKFLOW}\` left to hold to the permission contract. Restore the ` +
    `calling job in \`${WORKFLOW_PATH}\`.`
  );
}

function unreadableMessage(reason: string): string {
  return (
    `\`${WORKFLOW_PATH}\` could not be read (${reason}). That workflow is this package's only ` +
    `publish path, so this contract fails loudly rather than pass on a file it never inspected.`
  );
}

function emptyMessage(): string {
  return (
    `\`${WORKFLOW_PATH}\` is empty. That workflow is this package's only publish path, so this ` +
    `contract fails loudly rather than pass on a file with nothing in it to inspect.`
  );
}

// ---- The smallest scanner that can answer the question ------------------------------------

/** A non-blank workflow line, its comment removed, paired with its indentation depth. */
interface WorkflowLine {
  readonly indent: number;
  readonly text: string;
}

/** A `key:` entry: its inline value where it has one, and the lines indented beneath it. */
interface WorkflowEntry {
  readonly key: string;
  readonly value: string;
  readonly children: readonly WorkflowLine[];
}

/**
 * Drop a trailing `#` comment. Quotes are honoured so a `#` inside a value survives, and a `#`
 * has to start a token, so `foo#bar` is left alone.
 */
function stripComment(line: string): string {
  let quote: string | undefined;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === undefined) break;
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (i === 0 || /\s/.test(line[i - 1] ?? ""))) return line.slice(0, i);
  }
  return line;
}

/** Comment-free, blank-free lines, each carrying the indentation it was found at. */
function workflowLines(source: string): WorkflowLine[] {
  return source
    .split("\n")
    .map((raw) => stripComment(raw).replace(/\s+$/, ""))
    .filter((text) => text.trim() !== "")
    .map((text) => ({ indent: text.length - text.trimStart().length, text: text.trim() }));
}

/** The lines indented under `lines[start]`, which is that entry's block. */
function blockAfter(lines: readonly WorkflowLine[], start: number): WorkflowLine[] {
  const parent = lines[start];
  if (parent === undefined) return [];
  const block: WorkflowLine[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.indent <= parent.indent) break;
    block.push(line);
  }
  return block;
}

/** The direct `key: value` children of a block, i.e. every entry at its outermost indentation. */
function entriesOf(lines: readonly WorkflowLine[]): WorkflowEntry[] {
  if (lines.length === 0) return [];
  const outermost = Math.min(...lines.map((line) => line.indent));
  const entries: WorkflowEntry[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.indent !== outermost) continue;
    const match = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(line.text);
    if (match === null) continue;
    entries.push({
      key: match[1] ?? "",
      value: unquote((match[2] ?? "").trim()),
      children: blockAfter(lines, i),
    });
  }
  return entries;
}

/** Strip one layer of matching quotes from a scalar value. */
function unquote(value: string): string {
  const match = /^(["'])(.*)\1$/.exec(value);
  return match?.[2] ?? value;
}

/**
 * Every way the workflow text breaks the caller-side contract, one message each. An empty array
 * means the file satisfies it.
 */
export function releaseWorkflowViolations(source: string): string[] {
  const problems: string[] = [];
  const lines = workflowLines(source);
  if (lines.length === 0) return [emptyMessage()];

  const jobs = entriesOf(lines).find((entry) => entry.key === "jobs");
  if (jobs === undefined) return [noCallingJobMessage()];

  const caller = entriesOf(jobs.children)
    .map((job) => entriesOf(job.children))
    .find((properties) => properties.some((property) => property.key === "uses"));
  if (caller === undefined) return [noCallingJobMessage()];

  const uses = caller.find((property) => property.key === "uses");
  if (uses === undefined || uses.value !== SHARED_RELEASE_WORKFLOW) {
    problems.push(wrongTargetMessage(uses?.value ?? ""));
  }

  const permissions = caller.find((property) => property.key === "permissions");
  const granted = new Map<string, string>();
  if (permissions === undefined) {
    problems.push(noPermissionsBlockMessage());
  } else if (permissions.value === "write-all") {
    for (const grant of REQUIRED_GRANTS) granted.set(grant.key, "write");
  } else if (permissions.value === "read-all") {
    granted.set("actions", "read");
  } else {
    for (const entry of entriesOf(permissions.children)) granted.set(entry.key, entry.value);
  }

  for (const grant of REQUIRED_GRANTS) {
    const level = granted.get(grant.key);
    if (level !== undefined && grant.accepts.includes(level)) continue;
    problems.push(grant.key === "actions" ? missingActionsMessage() : missingGrantMessage(grant));
  }

  return problems;
}

/** The workflow text, or a throw whose message names the path rather than passing vacuously. */
function readWorkflow(path: string = join(ROOT, WORKFLOW_PATH)): string {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(unreadableMessage(cause instanceof Error ? cause.message : String(cause)), {
      cause,
    });
  }
  if (source.trim() === "") throw new Error(emptyMessage());
  return source;
}

// ---- Fixtures: the real file, minus one thing at a time ------------------------------------

/**
 * Remove a `key:` line and everything indented beneath it from raw workflow text. Used to build
 * each rejected variant out of the real file, so a fixture cannot drift away from what ships.
 */
function withoutKey(source: string, key: string): string {
  const raw = source.split("\n");
  const start = raw.findIndex((line) => new RegExp(`^\\s*${key}:`).test(line));
  if (start === -1) throw new Error(`fixture is stale: no \`${key}:\` line in ${WORKFLOW_PATH}`);
  const indent = (raw[start] ?? "").length - (raw[start] ?? "").trimStart().length;
  let end = start + 1;
  while (end < raw.length) {
    const line = raw[end] ?? "";
    if (line.trim() !== "" && line.length - line.trimStart().length <= indent) break;
    end += 1;
  }
  return [...raw.slice(0, start), ...raw.slice(end)].join("\n");
}

describe("release workflow contract", () => {
  it("finds the release workflow present, readable and non-empty", () => {
    expect(readWorkflow()).toContain("jobs:");
  });

  it("accepts the release workflow exactly as it stands", () => {
    expect(releaseWorkflowViolations(readWorkflow())).toStrictEqual([]);
  });

  it("rejects a calling job that does not grant actions: read, and says why the failure is silent", () => {
    const problems = releaseWorkflowViolations(withoutKey(readWorkflow(), "actions"));
    const message = problems.find((problem) => problem.includes("`actions: read`"));
    expect(message).toBeDefined();
    expect(message).toContain("refuses the whole workflow at startup");
    expect(message).toContain("no jobs and no logs");
    expect(message).toContain(WORKFLOW_PATH);
  });

  it("rejects a calling job with no permissions block at all", () => {
    const problems = releaseWorkflowViolations(withoutKey(readWorkflow(), "permissions"));
    const message = problems.find((problem) => problem.includes("no `permissions:` block"));
    expect(message).toBeDefined();
    expect(message).toContain("`actions: read`");
    expect(message).toContain("refuses the whole workflow at startup");
    expect(message).toContain("no jobs and no logs");
    // The per-key messages still fire, so the report names every grant that has gone missing.
    for (const grant of REQUIRED_GRANTS) {
      expect(problems.some((problem) => problem.includes(`\`${grant.stated}\``))).toBe(true);
    }
  });

  it.each([{ key: "contents" }, { key: "id-token" }, { key: "pull-requests" }])(
    "rejects a calling job missing $key, naming that key",
    ({ key }) => {
      const grant = REQUIRED_GRANTS.find((candidate) => candidate.key === key);
      expect(grant).toBeDefined();
      const problems = releaseWorkflowViolations(withoutKey(readWorkflow(), key));
      const message = problems.find((problem) => problem.includes(`\`${grant?.stated ?? ""}\``));
      expect(message).toBeDefined();
      expect(message).toContain(WORKFLOW_PATH);
    },
  );

  it("rejects a uses: target other than the shared release workflow", () => {
    const retargeted = readWorkflow().replace(
      SHARED_RELEASE_WORKFLOW,
      "cosyte/.github/.github/workflows/release.yml@v9",
    );
    const problems = releaseWorkflowViolations(retargeted);
    const message = problems.find((problem) => problem.includes("release.yml@v9"));
    expect(message).toBeDefined();
    expect(message).toContain(SHARED_RELEASE_WORKFLOW);
    expect(message).toContain(WORKFLOW_PATH);
  });

  it("names the path when the workflow is absent", () => {
    expect(() => readWorkflow(join(ROOT, ".github", "workflows", "release.yml.absent"))).toThrow(
      WORKFLOW_PATH,
    );
  });

  it("names the path when the workflow is empty", () => {
    const empty = join(mkdtempSync(join(tmpdir(), "release-workflow-")), "release.yml");
    writeFileSync(empty, "", "utf8");
    expect(() => readWorkflow(empty)).toThrow(WORKFLOW_PATH);
  });

  it("accepts a grant wider than the one requested", () => {
    const wider = readWorkflow().replace(/^(\s*)actions: read\b.*$/m, "$1actions: write");
    expect(wider).toContain("actions: write");
    expect(releaseWorkflowViolations(wider)).toStrictEqual([]);

    const shorthand = withoutKey(readWorkflow(), "permissions").replace(
      /^(\s*)uses:/m,
      "$1permissions: write-all\n$1uses:",
    );
    expect(releaseWorkflowViolations(shorthand)).toStrictEqual([]);
  });
});
