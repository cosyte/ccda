---
"@cosyte/ccda": patch
---

fix(phi-scan): enumerate a staged rename, and an unmerged path, at pre-commit

Tooling only. No runtime code changed and the published surface is unaffected.

`R`/`C` were returned by neither `--diff-filter=AM` nor `AMT`, so an ordinary `git mv` of a link
into the scan root staged as `R100` at mode `120000` and `--staged` exited 0 over it, and a rename
that also substituted a real name passed the same way. `--no-renames` closes both: the destination
arrives as an ordinary single-path `A`, the enumeration is a strict superset of the old one, and the
two-field stride stops depending on the caller's `diff.renames`.

The measurements, the enumeration cost this repo pays that a sibling does not, the unmerged bound,
and the exit-code correction are stated once in the `CHANGELOG.md` entry for
`PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT` and once in the scanner's own docblock. This file deliberately
copies neither, and its body is discarded unread at the next version bump anyway (`changelog` is
`false` in `.changeset/config.json`).
