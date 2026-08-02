---
"@cosyte/ccda": patch
---

A race in the PHI gate's own enumeration no longer refuses a publish: a file the scanner enumerated
itself, that git does not track, and that vanishes before the read is skipped and reported.

The scanner lists the whole tree in all-mode and reads each file afterwards. `tsup` writes
`tsup.config.bundled_<hash>.mjs` at the repo root and deletes it when a build ends, inside that
window, so the read threw `ENOENT` and the scan refused with exit 2. That failed `prepublishOnly`
and blocked a real publish. Both halves race inside the test run itself, which is what made it look
like one thing: the suite provisions `dist/` by running a build in one worker while another sweeps
the live checkout in all-mode. It is load-dependent, so a plain re-run went through and it reads
like a flake rather than a defect.

**The refusal was correct; the enumeration was unsound.** Refusing a scan it could not complete is
the property that makes the gate worth having, and it is untouched. What changed is that the
enumeration no longer admits a file that may not survive to the read. Exactly one case is tolerated,
and it is reported on stderr as skipped rather than dropped silently.

Everything else still refuses. Five of the six bounds are pinned by a test, and which five is
measured rather than asserted:

- a **tracked** file that cannot be read, because the committed corpus is what the gate promises to
  have observed (pinned);
- any **non-`ENOENT`** failure, because `EACCES` or `EISDIR` is a scan that failed, not a file that
  went away (pinned);
- a `git` that cannot report the tracked set, which switches the tolerance off entirely rather than
  guessing (pinned);
- a tracked set that comes back **empty**, which would make every file untracked and is the one
  state in which the tracked-file bound stops existing (pinned);
- an all-mode sweep that **observed no files at all**, so the tolerance can never decay into a clean
  report of a tree nothing was read from (pinned);
- a tolerated file that is **back on disk** when the sweep ends, because then the sweep skipped
  something that exists. This is the unpinned one: reaching it needs a timed re-create against a
  deliberately slowed sweep, and a load-sensitive sleep in the suite that guards this very defect is
  the failure that defect teaches. Losing it would cost the re-check, not the tolerance's bounds.

The other tests reach that window without a sleep and without a real build: the scanner runs `git`
between the walk and the first read, so a `git` shim placed first on `PATH` is a deterministic hook
into exactly the gap. Each case runs against a throwaway git repo, so no decoy file is ever written
into this one. The pre-commit path (`--staged`) reads blobs from the git index and never depended on
any of this.

One residual, stated rather than hidden: the post-sweep re-check is keyed on the enumerated path,
not on content, so an untracked file **renamed** inside the window goes unscanned under a clean
report. It is bounded, since committing such a file means `git add`, after which it is tracked and
untolerable, and pre-commit reads the index either way. Closing it needs a content-addressed sweep,
which is a different design rather than a wider bound.
