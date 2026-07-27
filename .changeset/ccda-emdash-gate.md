---
"@cosyte/ccda": patch
---

Wire the em-dash gate into CI, and remove the one live character it found
(`EMDASH-CONFORMANCE`).

Adds `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) and a dedicated
`.github/workflows/no-emdash.yml` job checking the brand ban on `U+2014` over both halves
the rule covers: the tracked files (all but the self-excluded script, which has to name the
encodings it bans), and the PR title, body, and commit messages. The workflow carries the
non-default `edited` pull-request trigger, so retitling a PR re-checks it, which matters
because only squash merge is allowed here and the subject comes from the PR title
(`COMMIT_OR_PR_TITLE`). The body that lands is the branch commit messages
(`COMMIT_MESSAGES`), not the PR body, which is scanned anyway as a surface in its own right.

**It reports; it does not yet block.** The job is not a required status check. `cosyte/ccda`
is governed by org-level rulesets requiring exactly `ci / verify (22, ubuntu-latest)`,
`ci / verify (24, ubuntu-latest)` and `ci / actionlint`, and `Em-dash gate / no-emdash` is
not among them, so with auto-merge on and zero required approvals a PR carrying a live
character can still merge with this job red. Closing that is a GitHub settings change, not
a file change: add the context to the org ruleset `parser-ci-required-checks`, or add a
repository-level ruleset here as `pathways`, `docs`, `website` and `iac` already do. Out of
scope for a slice that ships files. `hl7`, `x12`, `ncpdp`, `dicom` and `mllp` sit behind the
same gap, and `fhir` has no ruleset at all. Stated rather than implied, because a gate
described as enforcing something it does not enforce is worse than no gate.

**One character of content changed.** `src/profiles/merge.ts` held the only em dash in the
tree, in a JSDoc sentence about caller responsibility for safety-critical codes; it is now
a colon, which keeps the sentence's explanatory force and its meaning exactly. Nothing else
in that file moved, and in particular the two raw NUL bytes it uses as the separator in
`toleranceKey`'s composite key are untouched: that byte is chosen because it cannot occur in
any fragment it joins, so it is load-bearing, not incidental.

**That file is also why this gate is worth having in a repo that had already been swept.**
PR #52 ("remove em dashes from source + config") did not touch `src/profiles/merge.ts` at
all, because those NULs make grep classify it as binary and skip it. The character had been
there since PR #24 and outlived a remediation pass aimed straight at it. A markdown-only
measurement read the repo as clean, and for markdown it was (0 of 50 files). The miss was in
TypeScript. This gate reds on that file loudly, which is how it was found.

The script is the text-only variant, taken from `ncpdp` (PR #34, `39212bb`) rather than the
older `knowledgebase` copy, so it carries `ncpdp`'s two fixes for routes that printed OK
without reading their input (a tracked file named `-` read as stdin, and `-d skip` passing a
tracked symlink to a directory). Its pipeline code is byte-identical to `ncpdp`'s: the known
limits are one cross-repo fix across the nine copies on `main` (seven of this shape, plus
`website`'s NUL-partition variant and `docs`), and a divergent variant is worse than a
shared known limit. Dropping `grep -I` is deliberate and is the load-bearing choice here,
since `-I` (and `website`'s NUL-partition variant) would silently exempt `merge.ts` from a
ban that has no exceptions, which is exactly the accident PR #52 made once already.

Tooling and a comment only: no runtime, public-API, warning-code, or parse-behavior change.
