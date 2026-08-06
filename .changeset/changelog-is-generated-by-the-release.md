---
"@cosyte/ccda": patch
---

`CHANGELOG.md`, which ships inside the tarball, is now written by the release instead of by hand, so it stops describing already-published code as unreleased.

`.changeset/config.json` set `"changelog": false`, so no release ever wrote a version heading
into `CHANGELOG.md` and nothing ever rolled `[Unreleased]` over. Every published version of this
package therefore carried a changelog with **no version headings at all**: one `[Unreleased]`
heading over the whole history, and a preamble stating that the first pre-alpha release "will
ship" the API surface listed below it, in a tarball that had shipped that surface several
versions earlier. `CHANGELOG.md` is listed in `package.json` `files`, so this was text on the
disk of everyone who installed the package, not internal bookkeeping.

**The flag is what changed, not the prose.** Correcting the sentence by hand would have left the
mechanism that wrote it, and the next release would have drifted the same way. `changelog` now
names the generator that ships with Changesets, so a release writes its own version heading and
its own entry from the changesets it consumed, and **the changeset summary is now the changelog
entry**. Nothing new is depended on: the generator is an entry point of `@changesets/cli`, which
was already a dev dependency.

**The file's shape changed with it, deliberately.** Changesets prepends a release by replacing
the first newline in the file, so exactly one line can sit above generated output. The
hand-written preamble sat on line 3, which means a release would have inserted itself between the
heading and the preamble and split the header in two. The hand-maintained history has therefore
moved under a `## Released before this file was generated` heading, with the false preamble
replaced by an accurate one. Three pieces of hand-workflow scaffolding were dropped and no entry
was reworded: the `[Unreleased]` heading, its link definition at the foot of the file, and the
four empty section stubs waiting for the next hand-written entry. The history itself is left as
it was written rather than re-sorted into version sections, because the file never recorded which
release each entry went out in and the text is already on disk in published copies.

**Changesets' Prettier pass is deliberately left ON here, and that was derived from this repo
rather than copied from a sibling.** This repo has no `.prettierignore` at all and its
`format:check` globs root markdown, so `CHANGELOG.md` is inside the repo's own formatting gate
and its archived history is already Prettier-canonical. Both directions were measured. With the
pass on, the archived history comes through a release byte identical, so leaving it on costs
nothing. With the pass off, the generator's raw output is not Prettier-canonical even for the
simplest possible summary, because it writes the version heading and `### Patch Changes` on
adjacent lines with no blank line between them, so every Version PR this repo opened would be red
on a file no human had touched. A sibling whose `.prettierignore` lists `*.md` needs the opposite
setting, and resyncing the value between repos is how a release starts rewriting already
published text.

Pinned by `test/scripts/changelog-generation.test.ts`, which runs the real `changeset version`
against the real `CHANGELOG.md` and the real config in a throwaway package rather than
reimplementing where the tool inserts text. Nine of its fourteen cases are red against the
previous state, measured on the tree this change was written against rather than recalled. The
throwaway package is a real git repository, because the generator prefixes each entry with the
short commit sha that added the changeset and a tree with no history would exercise a line shape
no release writes. **The rule it enforces is that nothing but the H1 sits above the first
heading, and it is asserted on the released document as well as the committed one**: a rule
phrased as "the archive heading comes second" holds only until the first release writes its own
version heading there, which would have redded the first Version PR this configuration ever
opened. Every version-heading comparison is a whole-heading match rather than a substring,
demonstrated on real generator output, because this package sits past the point where `## 0.0.1`
is a prefix of a heading it does not have. Three further controls: the same inputs with
`"changelog": false` must write no version heading at all, so the flag is proved load-bearing
rather than incidental; the same inputs with the Prettier pass off must produce a document this
repo's own formatting gate rejects; and the old file shape must reproduce the split header, so
the shape rule is demonstrated rather than asserted.

One upstream behaviour is worth knowing before debugging a release, and is recorded in that
file: Changesets wraps the changelog write in a try/catch that only warns. A tree whose declared
Prettier config cannot be resolved bumps the version, consumes the changeset, and writes no
changelog at all. A release that publishes with an unchanged changelog is that failure, not a
setting that quietly reverted.

`.changeset/README.md` and `CLAUDE.md` said to add the entry to `CHANGELOG.md` by hand and now
say to write it in the changeset. No runtime code, no public API, no warning code and no parse
behaviour changed.
