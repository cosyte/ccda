---
"@cosyte/ccda": patch
---

phi-scan: a target enumerated and never read refuses the scan

`--allow-fixture` withdrew a path from the target list and the run reported on
whatever remained, so the withdrawal never showed up in the verdict: four argv
shapes printed `OK, no hits` at exit 0 over a corpus holding a live, detectable
violator, including a whole-run sweep whose only violator was the withdrawn file.
CI could print a clean verdict over a corpus it never opened.

The scanner now refuses (exit 2), in every mode, over any target this run
enumerated and never read, naming the paths. The comparison is a set difference
rather than a count, because a count counts the targets that did get read. A
bypass naming a path the run does not enumerate refuses too, under its own
message, since such a flag subtracts nothing. `--allow-fixture` no longer selects
the mode and is unioned into the target list in `paths` mode, so it means the
same thing in every argv.

What it costs, stated rather than left to be discovered: `--allow-fixture` can no
longer reach exit 0 in any mode. The flag, `phi-scan-overrides.md` and the log
gate all stay, so an attempt is recorded and then refused rather than silently
honored, and `scripts/phi-allow-list.txt` is now the only mechanism that reaches
a clean run. The hit footer no longer advertises the flag as a remedy.

No published API, warning code or parser behaviour changes; this is the commit
gate only. There was no real unread corpus in this repo: the all-mode sweep
enumerates and reads the same set, and the four states were reproduced with
planted fixtures rather than found.
