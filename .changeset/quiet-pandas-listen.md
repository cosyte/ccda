---
"@cosyte/ccda": patch
---

PHI scanner: the repository-wide sweep now reads the bytes git carries, as a union with the working-tree walk.

`pnpm phi-scan` with no arguments (the sweep CI runs) enumerated the working tree and nothing else. Where the working tree and the index disagree, the walk was the only voice, so the gate could print `OK, no hits` and exit 0 over tracked content it never opened. Four such states were reproduced on the previous release, each over a tracked file holding a whole synthetic patient identity: the path occupied by a directory, the path under a name the walk skips wholesale (`dist`, `coverage`, `.cache` and the rest), the working tree missing almost every tracked file, and a submodule whose working tree is absent. No such content existed in this package; the states were reproduced rather than found.

The sweep now also scans the stage-0 blob of every tracked path whose bytes the walk did not already read. Deduplication is by content rather than by path, so a clean checkout reads nothing twice, and a path whose two copies differ (end-of-line normalization, a scrubbed working copy) has both scanned rather than one standing in for the other. A hit found this way names its locus as `<path> (as git carries it)`.

Three new refusals, all exit 2. A tracked path git records as a symbolic link or as a submodule carries no content to scan there; an unmerged path has no single merged blob, only two sides and their base, and is refused under its own message; and a sweep cannot run at all when git will not name the index or names it empty. No refusal ever prints a link target.

The suite now carries a positive control: it copies every tracked file into a throwaway repository, reproduces the clean result over it, and then proves the same sweep fires on that corpus with one synthetic marker planted, once on disk and once reachable only through git. A clean report is a decision, not an absence.
