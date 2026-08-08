---
"@cosyte/ccda": patch
---

phi-scan: scan the tracked corpus both routes used to read past

`PHI-SCAN-WALK-ROOT-SCOPE`. A PHI gate can print `OK, no hits` and exit 0 over files no route ever opened. The sibling form of that defect (a walk rooted at `src/` + `test/fixtures/`, leaving everything else under `test/` unscanned) did not exist here, because this walk is rooted at the repo root; the census was re-derived from this repo's own tree rather than ported, and it found a different shape with the same effect. Base: **140 tracked, 96 reached by some detector, 44 by neither.** Head: **140 tracked, 139 reached, 1 by neither.** 43 files newly opened, 0 downgraded.

Three causes, closed on their own terms. Markdown was dropped by the walk before a byte was read, and dropped again by `--staged`; it is enumerated and shape-scanned now. The conservative dashed-SSN + email pass was bounded to `src/` + `scripts/` JS/TS, so the three `scripts/*.sh` gates the scanner's own docblock claimed to cover, the root build configs, every workflow, `LICENSE` and the JSON manifests were read and then scanned by nothing; it now runs on every observed target with no path exemption at all. And the `test/scripts/` prefix exclusion covered four files where its stated reason names one, so it is a literal path now.

`isSourceCode` is deliberately untouched. It is read with opposite polarity in two places, adding the shape pass in one and subtracting the structured scan in the other, so adding `.sh` to it (the obvious fix) would have downgraded any `scripts/*.sh` carrying a C-CDA marker from the full document scan to shape-only. The widening goes in an additive branch instead, and the guard is written into that predicate's docblock.

Proved by grid on both routes, base tree and head tree, with a dashed-SSN payload and then a `<family>` name payload planted in every tracked file: nothing goes from detected to undetected on either route, including the commit-blocking `--staged` one, and exactly one file is still undetected at head, so the clean cells are a decision about a named file rather than a sweep that stopped running. All 43 newly-opened files were hand-read; none carries patient-identifying content.

Two things are disclosed rather than closed. Markdown gets the shape floor and not the structured detectors, because 11 of the 16 tracked `.md` carry a C-CDA marker and scanning them structurally draws three name hits that are documentation rather than leakage; quieting those meant allow-listing three of the commonest English name words corpus-wide. And `--staged` no longer exempts an unmerged `.md` from its refusal, on that carve-out's own argument, so a merge conflict in `CHANGELOG.md` now refuses that route.

Adds an `EMAIL <address>` allow-list tag, which declares one mailbox where `EMAILDOMAIN` would declare every mailbox at a domain. It replaces a first draft that exempted `package.json` by path, so this change ships no path exemption at all.
