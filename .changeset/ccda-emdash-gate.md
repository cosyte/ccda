---
"@cosyte/ccda": patch
---

Wire the em-dash gate into CI, and remove the one live character it found
(`EMDASH-CONFORMANCE`).

Adds `scripts/check-no-emdash.sh` (`pnpm check:no-emdash`) and a dedicated
`.github/workflows/no-emdash.yml` job enforcing the brand ban on `U+2014` over both halves
the rule covers: the tracked files, and the PR title, body, and commit messages. The
workflow carries the non-default `edited` pull-request trigger, so retitling a PR
re-checks it, which matters because this repo squash-merges.

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
tracked symlink to a directory). Its pipeline code is byte-identical to `ncpdp`'s: known
limits are one cross-repo fix across every copy, and a divergent variant is worse than a
shared known limit. Dropping `grep -I` is deliberate and is the load-bearing choice here,
since `-I` (and `website`'s NUL-partition variant) would silently exempt `merge.ts` from a
ban that has no exceptions, which is exactly the accident PR #52 made once already.

Tooling and a comment only: no runtime, public-API, warning-code, or parse-behavior change.
