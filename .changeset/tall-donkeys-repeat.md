---
"@cosyte/ccda": patch
---

phi-scan: scan the tracked corpus every route used to read past

`PHI-SCAN-WALK-ROOT-SCOPE`. A PHI gate can print `OK, no hits` and exit 0 over files no route ever opened. The sibling form of that defect (a walk rooted at `src/` + `test/fixtures/`, leaving everything else under `test/` unscanned) did not exist here, because this walk is rooted at the repo root; the census was re-derived from this repo's own tree rather than ported, and it found a different shape with the same effect. Base `941afff`: **140 tracked, 96 reached by some detector on the sweeping routes, 44 by neither, 4 of those under `test/`.** Head, same corpus: **139 reached, 1 by neither.** 43 files newly opened.

Three causes, closed on their own terms. Markdown was dropped by the walk before a byte was read, and dropped again by `--staged`; it is enumerated now and scanned like any other target. The conservative dashed-SSN + email pass was bounded to `src/` + `scripts/` JS/TS, so the three `scripts/*.sh` gates the scanner's own docblock claimed to cover, the root build configs, every workflow, `LICENSE` and the JSON manifests were read and then scanned by nothing; it now runs on every observed target with no path exemption at all. And the `test/scripts/` prefix exclusion covered four files where its stated reason names one, so it is a literal path now.

There are **three** routes, not two. `all` and `--staged` sweep; `paths` (`pnpm phi-scan <file>`) is the third and `looksLikeCda` governs it too. A first draft exempted markdown from the structured scan on the argument that no route read a `.md`, and that was false on the route it forgot: a real C-CDA saved as `notes.md` went from nine hits to `OK, no hits` there, and the shape floor offered as mitigation is empty for a C-CDA, which carries its SSN as an undashed `id@extension` and carries no email. That term is gone.

`isSourceCode` is deliberately untouched for the same class of reason. It is read with opposite polarity in two places, adding the shape pass in one and subtracting the structured scan in the other, so adding `.sh` to it would have downgraded any `scripts/*.sh` carrying a C-CDA marker to shape-only. The widening goes in an additive branch instead, and both guards are written into the source.

Proved by grid on all three routes, base tree and head tree, with a dashed-SSN payload and then a `<family>` name payload planted in every tracked file. Shape payload: `all` 96 to 140, `--staged` 96 to 140, `paths` 140 to 141, no regression in any cell. Name payload: `all` 26 to 39, `--staged` 26 to 39, `paths` 42 to 40. Exactly one file is still undetected at head, the one literal exclusion, so the clean cells are decisions about a named file rather than a sweep that stopped running. All 43 newly-opened files were hand-read; none carries patient-identifying content.

Two cells go from detected to undetected, both on `paths`, both named rather than claimed away. `CHANGELOG.md` loses the structured detectors: it is generated output that must not be hand-edited and it quotes this scanner's own negative-control literals, so the gate was flagging its own documentation of itself. That is the only name detection this change gives up, and it is bounded upstream, because `.changeset/*.md` is structurally scanned on every route now, so changelog text passes the full gate before a release copies it in. And `package.json` stops hitting on its own `author` mailbox, because that one address is now declared in the allow-list.

Adds an `EMAIL <address>` allow-list tag, which declares one mailbox where `EMAILDOMAIN` would declare every mailbox at a domain. It replaces a draft that exempted `package.json` by path.

`docs-content/quickstart.md`'s second worked example now reuses the corpus's declared synthetic patient, keeping the distinct MRN that was the example's point. The scanner lost nothing there: it still reports the old tokens when pointed at the old bytes. Fixing the corpus was preferred to exempting the page.
