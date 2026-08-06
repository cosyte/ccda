---
"@cosyte/ccda": patch
---

`README.md` named an accessor that does not exist, and the split between `CLAUDE.md` and its long-form record is now checked in CI.

`README.md` said an Unstructured Document exposes its `nonXMLBody`. That is the correct name for
the CDA element, which is why the line survived every reading of it, but the accessor on the parsed
document is `doc.nonXmlBody`, and `README.md` ships inside the tarball. A reader copying the name
out of it got `undefined` with no error. The accessor's real name was read back off the published
type surface, not off the prose, and the sentence now names both: the element it comes from and the
property that carries it. **No code changed.** The other two places this is documented already had
it right.

The second half closes an ungated contract rather than a defect. A relocation on 2026-08-04 split
this repo's always-read `CLAUDE.md` into short one-line imperatives plus a long-form record at
`documentation/agent-notes.md`, and both files state the same promise in their own words: every
trap has a one-line imperative pointing at the section that carries its reasoning. Nothing checked
it. A heading reworded in the long-form record silently strands every pointer at it, neither file
gets a compile error, and a worker who follows a dead pointer is left with a clinical-safety
imperative and none of the reasoning behind it. `scripts/check-agent-notes-contract.mjs` and
`test/scripts/agent-notes-contract.test.ts` close that, and `pnpm check:agent-notes` runs it by
hand.

**It asserts what this repo promises, and deliberately not a fleet universal.** The relocation
landed across many repos but the contract did not: measured over the sibling repos on the day this
was written, three package repos carry no such file at all. A gate claiming every repo has one
would be an overclaim that three of them already break, so this one is scoped to `ccda`, lives in
`ccda`'s own CI, and is not proposed as a shared script.

**It blocks, which the gate beside it does not.** The public-surface check lives in its own
workflow whose context is in none of this repository's rulesets, so it is visible on every pull
request and stops nothing. This one runs inside the test suite, which is inside a required context,
so the placement was the point rather than an implementation detail.

Measuring that turned up a stale trap and it is corrected here. `CLAUDE.md` recorded the em-dash
gate as "present and reporting, but NOT yet blocking", with the settings change it needed still
outstanding. That change had landed: `no-emdash` is a required status check via its own
repository-level ruleset, active on the default branch. The line is now accurate, and says to
re-read the rulesets rather than trust a prose line about them.

Three properties are worth knowing before changing it. The corpus is `git ls-files` and is
**reconciled**, not merely counted: every tracked path is opened or the run refuses, with no
exclusion of any kind, so `read` equals `tracked` on a clean run. A check can print green over a
corpus it never opened and no denominator detects that. A tracked file missing from the worktree is a refusal rather than a silent skip, and refusals
exit `2` where a contract violation exits `1`. Finding zero pointers is also a refusal, on the same
reasoning the `attw` wrapper already uses for a tool that exits `0` having printed nothing: an
empty result set is indistinguishable from a clean run.

Two pointer forms are live here and both are checked, which was measured rather than assumed. The
path form is scanned in **every tracked file, with no exclusion list at all**, so no root is
declared and a pointer written into a source comment is covered. A bare backticked anchor occurs once, in `CLAUDE.md`; a guard matching
only the path form is green while that pointer is broken, and that bypass is reproduced end to end
in the test rather than argued. The bare form is keyed on shape, so it is cut narrowly: measured
over this tree, a bare backticked anchor also matches `#id` in sources and `#62` in tests, which
are XML id references and C-CDA narrative reference targets, so the rule requires three
hyphen-joined lowercase runs and is confined to `CLAUDE.md`. A bare anchor anywhere else is
deliberately not read as a pointer.

The one exclusion this gate briefly had was deleted rather than documented, and it is worth knowing
why. The first cut skipped any file containing a NUL byte as "binary", reported only as an anonymous
count. On this repository that was exactly one file: `src/profiles/merge.ts`, a linted,
type-checked, Prettier-formatted TypeScript source that embeds NULs in a join separator. This repo
already records that same file as its measured silent-exemption escape, because an earlier em-dash
sweep skipped it and left a live banned character behind. A broken pointer planted there was
reproduced passing this gate green, byte-identically to a clean run, while the same pointer in a
NUL-free sibling reds. Every tracked file is now decoded and scanned, so the read count equals the
tracked count on a clean run and no anonymous residue is left for a reader to interpret. That is
safe and was measured rather than assumed: the pointer patterns are pure ASCII, and UTF-8 decoding
replaces only invalid sequences and resyncs at the next valid byte, so a pointer planted directly
against a real NUL still matches. A genuinely binary file can now only cost a false red, which is
cheap, and never the silent exemption.

Nineteen cases pin it. The heading recogniser is pinned in both directions because it fails in
both: an indented heading and a setext underline are real headings that a naive test misses, which
is a false red, and a `#` inside a fenced code block is not a heading, which counting would make a
false green. The emptiness rule carries its negative control, since a heading whose body is its own
subsections is legitimate. Four controls cover the states where the gate must refuse rather than
pass: an empty repository, a tree with no long-form record, a tracked file missing from the
worktree, and a directory that is not a repository. The contract was already intact when this was
written, so **it closed no pre-existing break**: the evidence is each defect class reproduced
against a real fixture, not a count of existing failures. It did red twice for real. Once on the
first run after its own script was staged, against a literal pointer written into that script's
header comment. Once against the planted pointer above, after the NUL skip came out. That is also the limit worth knowing locally: the corpus is the tracked tree, so a green
run before `git add` says less than the same run in CI.

One thing CI found in the new script and it is fixed here rather than waived. The helper that
escapes the notes path into a pattern escaped `.` only, which is every character this repo's value
actually contains; CodeQL flagged it as incomplete sanitization and was right to. A constant input
makes it unexploitable today and does not make it correct, because the helper's contract is "escape
a string for a regex" while its body handled one character, so the first caller passing anything
else would get a silently wrong pattern. It now escapes the full metacharacter set, backslash
first. Behaviour is unchanged and it is exercised by every pointer match the nineteen cases make,
but it has no unit test of its own.

No runtime code, no public API, no warning code and no parse behaviour changed.
