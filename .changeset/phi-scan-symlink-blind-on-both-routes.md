---
"@cosyte/ccda": patch
---

phi-scan: refuse an in-scope entry that is not a regular file, on both routes

An in-scope symbolic link read as CLEAN on both enumerating routes: the walk
enumerates `Dirent.isFile()`, an lstat answer, and `--staged` reads content with
`git show :<path>`, which hands back a link's target path rather than any bytes.
Such an entry now refuses the scan (exit 2), named by its own repo-relative path
and an engine-owned kind token, never by its target. `--staged` reads
`git diff --cached --raw -z --diff-filter=AMT`.

The rule, its bounds, its two measured repo-specific divergences from the sibling
scanners and its residuals are stated once, in the docblock of
`scripts/phi-scan.ts`, and this file deliberately does not copy them: a guard
described in four committed files is a guard that gets corrected in three. The
changeset body is also deleted unread at the next version bump (`changelog` is
`false` in `.changeset/config.json`), so length here buys nothing.
