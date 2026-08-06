#!/usr/bin/env node
/**
 * scripts/check-agent-notes-contract.mjs: the two-file contract between this repo's
 * `CLAUDE.md` and its `documentation/agent-notes.md`, checked.
 *
 * WHAT THE CONTRACT IS. `CLAUDE-MD-AUDIT` (2026-08-04) split this repo's always-read
 * `CLAUDE.md` into a short file of one-line imperatives and a long-form record that is
 * read on demand. Both halves of that split state the same promise in their own words:
 * `CLAUDE.md` says "Every trap below is a one-line imperative with a pointer into it",
 * and `agent-notes.md` says "Every trap still has a one-line imperative in `CLAUDE.md`
 * pointing at the section below that carries its reasoning."
 *
 * Nothing checked it. A worker following a pointer that no longer resolves gets the
 * one-line imperative and none of the reasoning, which is the exact failure the split
 * was supposed to be safe against: the imperatives here are clinical-safety lessons,
 * and `agent-notes.md` says in its own preamble that a summary of one is not a
 * substitute for it. A heading reworded in `agent-notes.md` silently strands every
 * pointer at it, and neither file gets a compile error.
 *
 * THIS GATE IS SCOPED TO THIS REPO, DELIBERATELY, AND IS NAMED FOR WHAT IT CHECKS.
 * The split landed across the fleet, but the contract is NOT universal and this gate
 * must not claim it is: measured 2026-08-06 over the meta-repo's submodules,
 * `config`, `hl7` and `workflow` have no `documentation/agent-notes.md` at all (nor do
 * the non-package repos `crew` and `knowledgebase`). A gate asserting "every cosyte
 * repo carries one" would be an overclaim that three package repos already break. What
 * this file asserts is what `ccda` itself promises, in `ccda`'s own CI, which is also
 * why it costs the meta-repo's capped automation plane nothing.
 *
 * WHERE THE TEETH ARE. This script is invocable as `pnpm check:agent-notes`, but the
 * blocking path is `test/scripts/agent-notes-contract.test.ts`, which runs it. That is
 * a choice, not an accident: the org ruleset `parser-ci-required-checks` requires
 * `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)` and
 * `ci / actionlint` (read from the GitHub API, 2026-08-06), so a check that runs inside
 * the test suite blocks a merge. This repo already has a gate that reports and blocks
 * nothing, `no-internal-refs`, because it lives in its own workflow whose context is in
 * no ruleset. Adding a second of those would have been reporting, not gating. The
 * em-dash gate is NOT an example of it: `no-emdash` is required via its own
 * repository-level ruleset, whatever `CLAUDE.md` used to say. Re-read the rulesets.
 *
 * WHAT IT REFUSES TO GUESS.
 *
 *  - A CHECK CAN PRINT GREEN OVER A CORPUS IT NEVER OPENED, and a denominator does not
 *    detect it: a count counts the files that DID exist. So the corpus is enumerated
 *    from `git ls-files` and RECONCILED: every tracked path is opened, skipped as
 *    binary, or the run refuses. A tracked file missing from the worktree is a refusal,
 *    not a silent skip, because a gate cannot claim to cover a file it could not read.
 *  - Both files the contract is about must be present in what was actually opened. A
 *    phantom path cannot yield green here, because green requires having read them.
 *  - Finding ZERO pointers is a refusal. If the scanner stops matching (a pointer
 *    style changes, the path moves), an empty result set is indistinguishable from a
 *    clean run by any count. This is the same net `scripts/attw.mjs` carries for a tool
 *    that exits 0 having printed nothing.
 *  - A heading carrying a non-ASCII character is a refusal rather than a guess. The
 *    slugifier below reproduces GitHub's ASCII behaviour; on anything else it would
 *    silently compute the wrong anchor, and a wrong anchor here reads as a broken
 *    pointer or, worse, resolves to the wrong section.
 *
 * THE POINTER FORMS ARE MEASURED, NOT ASSUMED, AND THE SHAPE-BASED ONE IS HELD NARROW.
 * Two forms are live in this tree:
 *
 *   1. The path form: the NOTES path below, then a `#`, then the anchor. 30 occurrences,
 *      all in `CLAUDE.md`. Scanned in EVERY tracked text file, so a pointer written into
 *      `README.md` or a source comment is covered without this file declaring a root.
 *      Spelled out in words rather than shown, because writing one here would BE one:
 *      this gate caught exactly that in this comment, on the first run after the file
 *      became tracked. Which is also the limit worth knowing locally: the corpus is
 *      `git ls-files`, so an unstaged new file is not in it and a green run before
 *      `git add` says less than the same run in CI.
 *   2. A bare backticked anchor, `` `#anchor` ``. One occurrence, in `CLAUDE.md`, on
 *      the line that cross-references the planned-templates section. A guard matching
 *      only form 1 is GREEN while that pointer is broken, and that bypass is
 *      reproduced end to end in the test file rather than argued.
 *
 * Form 2 is keyed on shape, so it is cut narrowly and only in `CLAUDE.md`. Measured
 * over every tracked text file, a bare `` `#...` `` also matches `` `#id` `` in
 * TypeScript sources and `` `#62` `` in tests and in `agent-notes.md` itself: those are
 * C-CDA narrative `<reference value="#62"/>` targets and XML id references, which is
 * exactly the reference material this parser exists to talk about. Requiring three
 * hyphen-joined lowercase runs excludes both by shape, and confining form 2 to
 * `CLAUDE.md` excludes them by scope. A bare anchor in any other file is NOT read as a
 * pointer, and that is a stated limit, not a claim.
 *
 * WHAT THIS GATE DOES NOT ASSERT, said plainly so nobody reads more into a green run:
 *
 *  - Not that any other repo has an `agent-notes.md`. See the scope note above.
 *  - Not that every trap in `CLAUDE.md` has a pointer. Recognising "a trap" is a
 *    judgement about prose; a guard that tried would be the universal-shaped overclaim
 *    this file is written to avoid.
 *  - Not that a section's prose is accurate, current, or that the trap it describes is
 *    closed. `CLAUDE.md` says it directly: a pointer is not a closure.
 *  - Not that every heading is pointed at. An unreferenced section is legitimate.
 *  - Not GitHub's duplicate-anchor suffixing beyond the `-1`, `-2` sequence below, and
 *    no other link target in the repo. This is not a link checker.
 *
 * THERE IS NO EXCLUSION LIST, so no skip can quietly go phantom. One hazard follows:
 * DO NOT WRITE A POINTER INTO A CHANGESET SUMMARY. The summary becomes the `CHANGELOG.md`
 * entry, that file is tracked, and a pointer archived there freezes the heading it names
 * forever, because renaming the section would red this gate on a published record nobody
 * may hand-edit. Reference a section by title in a changeset, never by anchor.
 *
 * This script needs no self-exemption. It never writes the path and a `#` adjacently:
 * the pointer pattern is built from the path constant at run time. The em-dash gate
 * next door has to exempt itself and that exemption has cost this repo a real escape,
 * so not needing one was worth the two lines.
 *
 * SECURITY: the one subprocess call uses execFileSync with array args. No shell form.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** The always-read file that carries the one-line imperatives. */
const CLAUDE_MD = "CLAUDE.md";
/** The on-demand file that carries the reasoning behind them. */
const NOTES = "documentation/agent-notes.md";

/**
 * Escape every RegExp metacharacter, with the backslash FIRST so its own escape is not
 * re-escaped by a later rule. An earlier cut here escaped only `.`, which is all this
 * repo's `NOTES` value actually needs; CodeQL flagged it as incomplete sanitization on
 * this branch and was right to. The value being a constant makes it unexploitable today
 * and does not make it correct: the defect is that the helper's contract is "escape a
 * string for a regex" while its body handled one character, so the first caller who
 * passes something else gets a silently wrong pattern.
 */
const escapeForRegExp = (text) => text.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");

/** Built at run time so this file never contains a literal pointer of its own. */
const POINTER_RE = new RegExp(`${escapeForRegExp(NOTES)}#([A-Za-z0-9._-]+)`, "g");
/** Three or more hyphen-joined lowercase runs, backticked. See the header. */
const BARE_RE = /`#([a-z0-9]+(?:-[a-z0-9]+){2,})`/g;

const args = process.argv.slice(2);
const rootFlag = args.indexOf("--root");
const ROOT = rootFlag === -1 ? process.cwd() : args[rootFlag + 1];
if (ROOT === undefined) refuse("--root was given with no directory after it.");

/** A structural problem: the gate cannot make a claim either way. Never green. */
function refuse(message) {
  process.stderr.write(`agent-notes contract: CANNOT CHECK\n  ${message}\n`);
  process.exit(2);
}

/** GitHub's ASCII anchor slug. Callers must have rejected non-ASCII headings first. */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/ /g, "-");
}

/**
 * Headings of a markdown document, fence-aware.
 *
 * Every relaxation here is one of the bypasses a `/^#{1,6} /` guard lets through: up to
 * three leading spaces is a valid ATX heading, a setext underline is a heading with no
 * `#` at all, and trailing `#`s are a closing sequence rather than part of the text.
 * The fence tracking runs the other way: a `#` inside a code block is NOT a heading, and
 * counting it would let a pointer resolve to a section that does not exist.
 */
function parseHeadings(lines) {
  const heads = [];
  let fenceChar = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      if (fenceChar === null) fenceChar = fence[1][0];
      else if (line.trimStart()[0] === fenceChar) fenceChar = null;
      continue;
    }
    if (fenceChar !== null) continue;
    const atx = /^ {0,3}(#{1,6}) +(.*?)(?: +#+)? *$/.exec(line);
    if (atx !== null) {
      heads.push({ line: i, level: atx[1].length, text: atx[2].trim(), bodyStart: i + 1 });
      continue;
    }
    const under = /^ {0,3}(=+|-+) *$/.exec(line);
    const prev = i > 0 ? lines[i - 1] : "";
    if (
      under !== null &&
      prev.trim() !== "" &&
      !/^ {0,3}#/.test(prev) &&
      !/^ {0,3}[-=*_] *$/.test(prev)
    ) {
      heads.push({
        line: i - 1,
        level: under[1][0] === "=" ? 1 : 2,
        text: prev.trim(),
        bodyStart: i + 1,
      });
    }
  }
  return heads;
}

/** Assign each heading its anchor, reproducing GitHub's `-1`, `-2` duplicate suffixing. */
function assignSlugs(heads) {
  const seen = new Map();
  for (const h of heads) {
    const base = slugify(h.text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    h.slug = n === 0 ? base : `${base}-${n}`;
  }
  return heads;
}

// ---- Enumerate the corpus, from git, and reconcile it -------------------------------

let tracked;
try {
  tracked = execFileSync("git", ["-C", ROOT, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter((p) => p !== "");
} catch (error) {
  refuse(`could not list tracked files under ${ROOT}: ${error.message}`);
}
if (tracked.length === 0) refuse(`${ROOT} has no tracked files, so there is nothing to check.`);

const opened = new Map();
const binary = [];
const unreadable = [];
for (const rel of tracked) {
  let buf;
  try {
    buf = readFileSync(join(ROOT, rel));
  } catch (error) {
    unreadable.push(`${rel} (${error.code ?? error.message})`);
    continue;
  }
  if (buf.includes(0)) binary.push(rel);
  else opened.set(rel, buf.toString("utf8"));
}

// The reconciliation. Not a count of what was found: an equality against what git says
// exists, so a path that silently went missing cannot pass for a path that was clean.
if (opened.size + binary.length + unreadable.length !== tracked.length) {
  refuse(
    `corpus reconciliation failed: ${tracked.length} tracked, ${opened.size} read, ` +
      `${binary.length} binary, ${unreadable.length} unreadable.`,
  );
}
if (unreadable.length > 0) {
  refuse(
    `${unreadable.length} tracked file(s) could not be read, so this run covers less than it claims:\n  ` +
      unreadable.join("\n  "),
  );
}
for (const required of [CLAUDE_MD, NOTES]) {
  if (!opened.has(required)) {
    refuse(
      `${required} is not among the tracked files that were read. This is the contract's ` +
        `own half of the corpus: without it there is nothing to check and nothing to check against.`,
    );
  }
}

// ---- The anchors that exist ---------------------------------------------------------

const notesLines = opened.get(NOTES).split("\n");
const headings = assignSlugs(parseHeadings(notesLines));
if (headings.length === 0) refuse(`${NOTES} has no headings, so no pointer into it could resolve.`);

const nonAscii = headings.filter((h) => /[^\x20-\x7e]/.test(h.text));
if (nonAscii.length > 0) {
  refuse(
    `${NOTES} has heading(s) with non-ASCII characters, whose anchors this gate would have ` +
      `to guess:\n  ` +
      nonAscii.map((h) => `line ${h.line + 1}: ${h.text}`).join("\n  "),
  );
}

const bySlug = new Map(headings.map((h) => [h.slug, h]));

// ---- The pointers that claim to reach them ------------------------------------------

const pointers = [];
for (const [rel, text] of opened) {
  for (const m of text.matchAll(POINTER_RE)) {
    pointers.push({ file: rel, anchor: m[1], form: "path", line: lineOf(text, m.index) });
  }
  if (rel !== CLAUDE_MD) continue;
  for (const m of text.matchAll(BARE_RE)) {
    pointers.push({ file: rel, anchor: m[1], form: "bare", line: lineOf(text, m.index) });
  }
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") n++;
  return n;
}

// Zero pointers is indistinguishable from a clean run by any count, so it is a refusal.
// This repo's contract is that the imperatives point into the long-form record; none
// found means either the contract was abandoned or this scanner stopped matching.
if (pointers.length === 0) {
  refuse(
    `no pointer into ${NOTES} was found in any of the ${opened.size} tracked text files read. ` +
      `Either the two-file contract is gone, or this gate stopped matching the pointers it is about.`,
  );
}

// ---- The three assertions -----------------------------------------------------------

const problems = [];

// 1. Every pointer resolves to a heading that exists.
const targeted = new Set();
for (const p of pointers) {
  if (bySlug.has(p.anchor)) targeted.add(p.anchor);
  else
    problems.push(
      `${p.file}:${p.line}: pointer #${p.anchor} (${p.form} form) matches no heading in ${NOTES}.`,
    );
}

// 2. No section is empty. A heading with no body of its own is legitimate ONLY when the
//    next heading is deeper, i.e. it is a container for its subsections. Anything else is
//    a pointer that resolves to nothing, which is the failure this gate is named for.
for (let i = 0; i < headings.length; i++) {
  const h = headings[i];
  const next = headings[i + 1];
  const body = notesLines
    .slice(h.bodyStart, next === undefined ? notesLines.length : next.line)
    .join("\n");
  if (body.trim() !== "") continue;
  if (next !== undefined && next.level > h.level) continue;
  const why = targeted.has(h.slug)
    ? "and a pointer resolves to it"
    : "and it is not a container for subsections";
  problems.push(`${NOTES}:${h.line + 1}: section "${h.text}" is empty ${why}.`);
}

// 3. The record is reachable from the always-read file. If `CLAUDE.md` stops pointing
//    into it, the split has quietly become a deletion for every worker that only reads
//    `CLAUDE.md`, which is every worker.
if (!pointers.some((p) => p.file === CLAUDE_MD)) {
  problems.push(
    `${CLAUDE_MD} carries no pointer into ${NOTES}. The long-form record is unreachable ` +
      `from the file every worker reads.`,
  );
}

// ---- Report -------------------------------------------------------------------------

const summary =
  `  corpus:   ${tracked.length} tracked, ${opened.size} read, ${binary.length} binary (skipped), 0 unreadable\n` +
  `  anchors:  ${headings.length} headings in ${NOTES}, ${targeted.size} of them pointed at\n` +
  `  pointers: ${pointers.length} (${pointers.filter((p) => p.form === "path").length} path form, ` +
  `${pointers.filter((p) => p.form === "bare").length} bare form in ${CLAUDE_MD})\n`;

if (problems.length > 0) {
  process.stderr.write(
    `agent-notes contract: ${problems.length} problem(s)\n${summary}\n` +
      problems.map((p) => `  ${p}\n`).join("") +
      `\n  Fix the pointer or restore the section. Do not delete the imperative to get green:\n` +
      `  the reasoning behind it is a clinical-safety lesson this repo paid for.\n`,
  );
  process.exit(1);
}

process.stdout.write(`agent-notes contract: OK\n${summary}`);
