# Changelog

## 0.0.13

### Patch Changes

- 89c8ec2: phi-scan: scan the tracked corpus every route used to read past

  `PHI-SCAN-WALK-ROOT-SCOPE`. A PHI gate can print `OK, no hits` and exit 0 over files no route ever opened. The sibling form of that defect (a walk rooted at `src/` + `test/fixtures/`, leaving everything else under `test/` unscanned) did not exist here, because this walk is rooted at the repo root; the census was re-derived from this repo's own tree rather than ported, and it found a different shape with the same effect. Base `941afff`: **140 tracked, 96 reached by some detector on the sweeping routes, 44 by neither, 4 of those under `test/`.** Head, same corpus: **139 reached, 1 by neither.** 43 files newly opened.

  Three causes, closed on their own terms. Markdown was dropped by the walk before a byte was read, and dropped again by `--staged`; it is enumerated now and scanned like any other target. The conservative dashed-SSN + email pass was bounded to `src/` + `scripts/` JS/TS, so the three `scripts/*.sh` gates the scanner's own docblock claimed to cover, the root build configs, every workflow, `LICENSE` and the JSON manifests were read and then scanned by nothing; it now runs on every observed target with no path exemption at all. And the `test/scripts/` prefix exclusion covered four files where its stated reason names one, so it is a literal path now, excluded from the two sweeping routes rather than from every route.

  There are **three** routes, not two. `all` and `--staged` sweep; `paths` (`pnpm phi-scan <file>`) is the third and `looksLikeCda` governs it too. A first draft exempted markdown from the structured scan on the argument that no route read a `.md`, and that was false on the route it forgot: a real C-CDA saved as `notes.md` went from nine hits to `OK, no hits` there, and the shape floor offered as mitigation is empty for a C-CDA, which carries its SSN as an undashed `id@extension` and carries no email. That term is gone.

  `isSourceCode` is deliberately untouched for the same class of reason. It is read with opposite polarity in two places, adding the shape pass in one and subtracting the structured scan in the other, so adding `.sh` to it would have downgraded any `scripts/*.sh` carrying a C-CDA marker to shape-only. The widening goes in an additive branch instead, and both guards are written into the source.

  Proved by grid on all three routes, base tree and head tree, with a dashed-SSN payload and then a `<family>` name payload planted in every tracked file. Shape payload: `all` 96 to 140, `--staged` 96 to 140, `paths` 140 to 141, no regression in any cell. Name payload: `all` 26 to 39, `--staged` 26 to 39, `paths` 42 to 40. Exactly one file is still undetected at head, the one literal exclusion, so the clean cells are decisions about a named file rather than a sweep that stopped running. All 43 newly-opened files were hand-read; none carries patient-identifying content.

  Two cells go from detected to undetected, both on `paths`, both named rather than claimed away. `CHANGELOG.md` loses the structured detectors: it is generated output that must not be hand-edited and it quotes this scanner's own negative-control literals, so the gate was flagging its own documentation of itself. That costs the whole structured scan on that file, all five detectors, not just the name one. No locus count is quoted anywhere: the file is regenerated on every release, and two drafts wrote a count that was wrong. The upstream bound is real but narrower than a first draft claimed: `.changeset/*.md` gets the structured detectors when it carries a C-CDA marker, and gets the dashed-SSN + email shape pass whatever it carries, but a marker-free changeset carrying a bare `<given>` / `<family>`, a `<birthTime>`, a bare-numeric `<id>` or an address exits 0 (an SSN-rooted `<id>` with a dashed extension still exits 1, via the shape pass). That last case is pre-existing and identical at base on all three routes. And `package.json` stops hitting on its own `author` mailbox, because that one address is now declared in the allow-list.

  Two things this makes newly possible, stated rather than discovered later. Writing documentation is now inside the gate: markdown, the ADR, the agent notes and the changesets became structurally scanned, so a worked example or an incident write-up carrying a non-allow-listed name, DOB, bare-numeric identifier, address or non-`555` telecom reds a blocking gate at pre-commit. The predicate is a C-CDA marker rather than the extension, and no file list is quoted, because a marker-free page such as `docs-content/troubleshooting.md` is shape-pass only. The remedies are to reuse the declared synthetic tokens or to describe the locus without reproducing it, never to delete the write-up. And the `CHANGELOG.md` exemption is case-sensitive, so on a case-insensitive filesystem `phi-scan changelog.md` misses it and reds: a false red, which is the safe direction, and matching case-insensitively was refused because it would exempt a genuinely distinct file elsewhere.

  Adds an `EMAIL <address>` allow-list tag, which declares one mailbox where `EMAILDOMAIN` would declare every mailbox at a domain. It replaces a draft that exempted `package.json` by path.

  `docs-content/quickstart.md`'s second worked example now reuses the corpus's declared synthetic patient, keeping the distinct MRN that was the example's point. The scanner lost nothing there: it still reports the old tokens when pointed at the old bytes. Fixing the corpus was preferred to exempting the page.

## 0.0.12

### Patch Changes

- a29202d: Report three plan-surface facts that were previously silent, without changing what the library returns or accepts.

  **A Planned Medication Activity emitted with no `effectiveTime` is now reported.** The template makes it `[1..1]` (CONF:1098-30468) and `BuildCcdaPlannedOrder` types it optional, so a planned drug order carrying no timing at all could be emitted with nothing said about it. The field **stays optional**, because requiring it would be a breaking change to a published input type; instead the returned document carries the new `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, appended after the re-parse's warnings. The emitted XML is byte-identical to what it was: no date is fabricated and no `nullFlavor` is invented. It is an **emit-side** diagnostic: `parseCcda` does not raise it. (This entry originally shipped it as `buildCcda`-only, with the `editCcda` gap stated as a residual; that residual is closed in the same release, see the entry below.) The Planned Immunization Activity is deliberately not checked, because its input type already requires the field.

  **Instruction (`2.16.840.1.113883.10.20.22.4.20`), Handoff Communication Participants (`...22.4.141`) and Nutrition Recommendation (`...22.4.130`) are now reported rather than excluded in silence**, with the new `PLAN_ENTRY_NOT_MODELED`, once per matching root. They are three of the four templates a Plan of Treatment Section admits that `getPlannedItems()` does not return. **Reporting is not modelling**: nothing about the returned list changed, and each act still reaches no model field and survives only in `doc.toString()`. A direct `<entry>` is reported in a section recognized as Plan of Treatment (and, per the entry below, the Interventions Section), so an Instruction in the Instructions Section, where it is that section's own required entry, draws nothing; an act nested in a Planned Intervention Act is reported wherever the container sits. **Where it fires is a bound this library chose, not a statement about which sections C-CDA admits these templates in: they appear in more places than the report covers, and an occurrence outside it is still dropped in silence.** **Goal Observation, the fourth, is deliberately not reported**, because the decision taken on it was to model it.

  **A `setId` minted by `editCcda` is now labelled as synthetic.** CDA R2 requires a replacement and its `parentDocument` to share a version-series `setId`, so one is minted when the source has none, and that mint invents an identifier. The invention is now recognisable: the new `SYNTHETIC_SETID_PREFIX` export documents the scheme (a `SYNTHETIC-SETID-` extension under the synthetic assigning-authority root) and the new `isSyntheticSetId` export checks for both halves together. A `setId` the source asserted, or one supplied through `revision.setId`, is never relabelled. **The residual is stated rather than implied: nothing forces a receiving system to read the label**, and a `false` from `isSyntheticSetId` says only that this library did not mint the id under this scheme, never that the id is real.

  The CCD SHALL-section disagreement between the builder and the parser is untouched and still open; settling it needs the normative R2.1 Schematron, and this change deliberately did not let either side pick a set.

- 9f1ce33: Refuse a build whose narrative label is missing, instead of fabricating one. Until this release a positively-asserted allergy could be emitted with the narrative "No known allergies".

  **The defect, stated plainly, because it is a patient-safety one and it shipped.** Every populated section regenerates its `<text>` narrative from the same `BuildCode.displayName` the coded entry carries, and links the two with a `<reference>`, so the narrative is the attested restatement a clinician actually reads. The Allergies section computed that narrative with a fallback: with an allergen carrying no `displayName`, `buildCcda` emitted `<content>No known allergies</content>`, **byte-identical to the negated no-known-allergies form**, beside an entry that was **positively asserted**: `<value code="419199007">` with **no `negationInd`**, the allergen on the `<participant>`, and the manifestation observation present. The `<reference>` linkage was intact and the returned document carried **zero warnings**, so the attested half asserted the clinical opposite of its own entry with nothing anywhere saying so. The same root cause wrote the literal string `undefined` into seven other narrative slots, `"undefined: 1 kg"` / `"undefined: x"` into five more where a label is interpolated into a value line, and a fabricated "unknown" (or "Relative" / "unknown condition") into seven more. Twenty slots in total, one cause.

  **`displayName` is a required field, so none of this is reachable from a TypeScript caller. That is not the guard**, because the package ships JavaScript and does its input validation at runtime, which is why this is a real defect rather than a theoretical one. Tightening the type would have closed nothing.

  **The remedy is a refusal, and that was a deliberate choice over a warning.** `buildCcda` and `editCcda` now throw a `TypeError` naming the field path (for example `allergies[].allergen.displayName`) and the offending `@code`, and the fallback that produced the inverted sentence is **deleted rather than repointed**: the no-known-allergies narrative is now reachable from the negated branch and no other. Substituting any other confident string, an empty one, a placeholder, the code rendered as English, would have reproduced the same defect one word smaller, so no substitute was chosen. A build-time warning was weighed and rejected: a warning is fail-open, the document still exists and can be transmitted, and nothing forces a downstream reader to consult it, which is not an acceptable disposition for a narrative that states the opposite of its entry. The builder is the conservative-on-emit half of this library and already refuses seven other unsatisfiable inputs the same way, one of them purely as a runtime guard for untyped callers.

  **The cost, stated rather than elided.** This is a behaviour change on a published package: input that previously produced a document now throws. Every such input produced a document whose narrative the entry did not support, so nothing that was correct stops working, but a caller relying on the old output will now see an error. No warning code was added, renamed or reworded, and no existing message moved. The empty-string and whitespace-only cases are refused as well and those **are** reachable from TypeScript, on the argument that an empty attested narrative beside a coded entry loses the clinical fact rather than stating it.

  **The bound, so a green build is not read as more than it is.** Only labels that reach the **narrative** are guarded. A `BuildCode` that reaches the entry alone, an allergy `type`, a result `interpretation`, a medication or vaccine `route`, a reaction, a severity, a criticality, is deliberately untouched: `@displayName` is optional on a v3 `CD`, so omitting the attribute states nothing false and refusing it would reject conformant input. An **absent** optional object keeps its existing fallback, because "no smoking status recorded" really is unknown; only an object supplied **without** a label is refused.

  Versions up to and including `0.0.11` carry the inverted narrative permanently: a published version never moves backwards, so this is a fix going forward. Anyone who built allergy documents through an untyped caller on those versions should re-check the emitted narrative against the entry.

  The CCD SHALL-section disagreement between the builder and the parser is untouched and still open; settling it needs the normative R2.1 Schematron.

- 0c4d67f: Close the two silent plan drops left stated but unfixed: an edited document short a SHALL element, and a dropped Handoff in the Interventions Section.

  **`editCcda` now reports a Planned Medication Activity it emits short its SHALL `effectiveTime`.** The template makes it `[1..1]` (CONF:1098-30468) while the builder input types the field optional, so an edit could graft a planned drug order with no timing at all and say nothing. It now raises `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`, the same code `buildCcda` raises for the same document, appended after the re-parse's warnings. The emitted XML is unchanged: no date is fabricated and no `nullFlavor` is invented.

  **The check reads the emitted DOM, and its scope is narrow in both directions on purpose.** `editCcda` takes an **ordered** list of edits where a later one discards an earlier one's content, so a check reading that list reports a SHALL violation against a document that carries the element; only reading what survived into the output is correct on both writers. And it covers only what **that call grafted**: an offending act the source brought with it is never re-reported, because an edit is not a validator of a document its caller did not write. Both emitters now share one implementation rather than a claim beside it.

  **The warning's message no longer names `buildCcda`.** It opened with that emitter's name while that was the only writer raising it, which made it false the moment a second one did, and a warning that misdescribes its own document is a defect this library treats as seriously as a warning pointing at a coding that is not there. The stable `code` is unchanged and is still the thing to key on; only the human-readable `message` text moved.

  **`PLAN_ENTRY_NOT_MODELED` now also fires on a direct `<entry>` of the Interventions Section (V3).** C-CDA R2.1 admits a Handoff Communication Participants act there in as many words (CONF:1198-32402 / 1198-32403), and this library already reported all three unmodelled templates nested in a Planned Intervention Act with no section condition, whose conformant home is that same section. So a Handoff moved one level up, out of the container and into a direct entry of its own section, used to go from reported to silent. Instruction and Nutrition Recommendation are covered there too: the warning is about a **modelling gap, not conformance**, and both are still recognized and still dropped. The citation is V3's; the section is matched by this library's usual recognition (templateId root, then the LOINC `62387-6` fallback, no `@extension` check), which is wider than the citation and unchanged from how every other section is matched.

  **Nothing about what is returned changed.** `getPlannedItems()` returns the same seven templates, no `PlannedItemKind` was added, and every reported act still reaches no model field. **The residual is still stated rather than implied**: a Handoff nested in an Intervention Act (`2.16.840.1.113883.10.20.22.4.131`) stays silent, because that container is not descended into, and a direct entry of an unrecognized section stays silent because there is no section key to match. An Instruction in the Instructions Section, where it is that section's own required entry, still draws nothing.

  The CCD SHALL-section disagreement between the builder and the parser is untouched and still open; settling it needs the normative R2.1 Schematron.

## 0.0.11

### Patch Changes

- 43d6f7a: `CHANGELOG.md`, which ships inside the tarball, is now written by the release instead of by hand, so it stops describing already-published code as unreleased.

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

- 1fc7a08: `README.md` named an accessor that does not exist, and the split between `CLAUDE.md` and its long-form record is now checked in CI.

  `README.md` said an Unstructured Document exposes its `nonXMLBody`. That is the correct name for
  the CDA element, which is why the line survived every reading of it, but the accessor on the parsed
  document is `doc.nonXmlBody`, and `README.md` ships inside the tarball. A reader copying the name
  out of it got `undefined` with no error. The accessor's real name was read back off the published
  type surface, not off the prose, and the sentence now names both: the element it comes from and the
  property that carries it. **No code changed.** The other two places this is documented already had
  it right.

  The second half closes an ungated contract rather than a defect. A relocation on 2026-08-04 split
  this repo's always-read `CLAUDE.md` into short one-line imperatives plus a long-form record at
  `documentation/agent-notes.md`, and both files state the same promise in their own words: every
  trap has a one-line imperative pointing at the section that carries its reasoning. Nothing checked
  it. A heading reworded in the long-form record silently strands every pointer at it, neither file
  gets a compile error, and a worker who follows a dead pointer is left with a clinical-safety
  imperative and none of the reasoning behind it. `scripts/check-agent-notes-contract.mjs` and
  `test/scripts/agent-notes-contract.test.ts` close that, and `pnpm check:agent-notes` runs it by
  hand.

  **It asserts what this repo promises, and deliberately not a fleet universal.** The relocation
  landed across many repos but the contract did not: measured over the sibling repos on the day this
  was written, three package repos carry no such file at all. A gate claiming every repo has one
  would be an overclaim that three of them already break, so this one is scoped to `ccda`, lives in
  `ccda`'s own CI, and is not proposed as a shared script.

  **It blocks, which the gate beside it does not.** The public-surface check lives in its own
  workflow whose context is in none of this repository's rulesets, so it is visible on every pull
  request and stops nothing. This one runs inside the test suite, which is inside a required context,
  so the placement was the point rather than an implementation detail.

  Measuring that turned up a stale trap and it is corrected here. `CLAUDE.md` recorded the em-dash
  gate as "present and reporting, but NOT yet blocking", with the settings change it needed still
  outstanding. That change had landed: `no-emdash` is a required status check via its own
  repository-level ruleset, active on the default branch. The line is now accurate, and says to
  re-read the rulesets rather than trust a prose line about them.

  Three properties are worth knowing before changing it. The corpus is `git ls-files` and is
  **reconciled**, not merely counted: every tracked path is opened or the run refuses, with no
  exclusion of any kind, so `read` equals `tracked` on a clean run. A check can print green over a
  corpus it never opened and no denominator detects that. A tracked file missing from the worktree is a refusal rather than a silent skip, and refusals
  exit `2` where a contract violation exits `1`. Finding zero pointers is also a refusal, on the same
  reasoning the `attw` wrapper already uses for a tool that exits `0` having printed nothing: an
  empty result set is indistinguishable from a clean run.

  Two pointer forms are live here and both are checked, which was measured rather than assumed. The
  path form is scanned in **every tracked file, with no exclusion list at all**, so no root is
  declared and a pointer written into a source comment is covered. A bare backticked anchor occurs once, in `CLAUDE.md`; a guard matching
  only the path form is green while that pointer is broken, and that bypass is reproduced end to end
  in the test rather than argued. The bare form is keyed on shape, so it is cut narrowly: measured
  over this tree, a bare backticked anchor also matches `#id` in sources and `#62` in tests, which
  are XML id references and C-CDA narrative reference targets, so the rule requires three
  hyphen-joined lowercase runs and is confined to `CLAUDE.md`. A bare anchor anywhere else is
  deliberately not read as a pointer.

  The one exclusion this gate briefly had was deleted rather than documented, and it is worth knowing
  why. The first cut skipped any file containing a NUL byte as "binary", reported only as an anonymous
  count. On this repository that was exactly one file: `src/profiles/merge.ts`, a linted,
  type-checked, Prettier-formatted TypeScript source that embeds NULs in a join separator. This repo
  already records that same file as its measured silent-exemption escape, because an earlier em-dash
  sweep skipped it and left a live banned character behind. A broken pointer planted there was
  reproduced passing this gate green, byte-identically to a clean run, while the same pointer in a
  NUL-free sibling reds. Every tracked file is now decoded and scanned, so the read count equals the
  tracked count on a clean run and no anonymous residue is left for a reader to interpret. That is
  safe and was measured rather than assumed: the pointer patterns are pure ASCII, and UTF-8 decoding
  replaces only invalid sequences and resyncs at the next valid byte, so a pointer planted directly
  against a real NUL still matches. A genuinely binary file can now only cost a false red, which is
  cheap, and never the silent exemption.

  Nineteen cases pin it. The heading recogniser is pinned in both directions because it fails in
  both: an indented heading and a setext underline are real headings that a naive test misses, which
  is a false red, and a `#` inside a fenced code block is not a heading, which counting would make a
  false green. The emptiness rule carries its negative control, since a heading whose body is its own
  subsections is legitimate. Four controls cover the states where the gate must refuse rather than
  pass: an empty repository, a tree with no long-form record, a tracked file missing from the
  worktree, and a directory that is not a repository. The contract was already intact when this was
  written, so **it closed no pre-existing break**: the evidence is each defect class reproduced
  against a real fixture, not a count of existing failures. It did red twice for real. Once on the
  first run after its own script was staged, against a literal pointer written into that script's
  header comment. Once against the planted pointer above, after the NUL skip came out. That is also the limit worth knowing locally: the corpus is the tracked tree, so a green
  run before `git add` says less than the same run in CI.

  One thing CI found in the new script and it is fixed here rather than waived. The helper that
  escapes the notes path into a pattern escaped `.` only, which is every character this repo's value
  actually contains; CodeQL flagged it as incomplete sanitization and was right to. A constant input
  makes it unexploitable today and does not make it correct, because the helper's contract is "escape
  a string for a regex" while its body handled one character, so the first caller passing anything
  else would get a silently wrong pattern. It now escapes the full metacharacter set, backslash
  first. Behaviour is unchanged and it is exercised by every pointer match the nineteen cases make,
  but it has no unit test of its own.

  No runtime code, no public API, no warning code and no parse behaviour changed.

- 8b5b737: The README lockup now links to cosyte.com (`ASSETS`).

  The `<picture>` block above the H1 is wrapped in an anchor to https://cosyte.com, per the founder
  requirement of 2026-08-06. Nothing inside the block moved: the `<source>`, the `<img>`, the alt text
  and both tile URLs are byte-identical.

  What the anchor does was measured on both surfaces by `fhir`, not assumed, because fourteen READMEs
  carry this shape. On GitHub the anchor works and the colour-scheme switch keeps working, because the
  `<img>` stays a direct child of `<picture>`, which is the condition the HTML spec puts on `<source>`
  applying at all. On an npm package page the anchor is lost: npm wraps a README image in its own
  anchor to the image file, a nested anchor is not representable, so the parser closes ours early and
  the image ends up linked to the image file rather than to cosyte.com. Shipped anyway by founder
  decision of 2026-08-07: on npm that is no worse than the unlinked lockup it replaces, and GitHub is
  where these READMEs are read.

## Released before this file was generated

Every release section above this heading is written by
[Changesets](https://github.com/changesets/changesets) from the changesets in `.changeset/`, newest
release first. The release writes its own version heading, so nothing above this line is maintained
by hand: a change is recorded by adding a changeset, and that changeset's summary is the entry a
reader sees here.

Everything below this heading was maintained by hand. It sat under a single `[Unreleased]` heading
that no release ever rolled over, so it went on describing already-published code as unreleased,
inside the published tarball, for the whole of this package's public history. It is left as it was
written rather than re-sorted into version sections: the file never recorded which release each
entry went out in, and this is the text that installed copies already carry on disk. Only three
things were dropped, all of them scaffolding for the hand-written workflow that no longer runs: the
`[Unreleased]` heading itself, its link definition at the foot of the file, and the four empty
section stubs that existed to receive the next hand-written entry. No entry was reworded.

The entries below follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the generated
sections above use the format Changesets writes, which is a version heading and a list of the
changes that release consumed. Versions follow the cosyte pre-alpha ladder, `0.0.x` until first
alpha, rather than [Semantic Versioning](https://semver.org/spec/v2.0.0.html) alone.

### Fixed

- **A staged RENAME is scanned by the commit gate (`PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT`).**
  Tooling only. No runtime code changed and the published surface is unaffected. `R`/`C` are
  returned by neither `--diff-filter=AM` nor `AMT`, so `git mv <link> <name>` staged as
  `:120000 120000 <sha> <sha> R100` and `--staged` exited **0** over it, with the mode check that
  refuses a non-regular entry never reached. **The worse half is the second shape:** a `git mv` that
  also substitutes a real name reports `R<score>` and passed identically, so PHI newly written into
  a renamed file was never read by the COMMIT gate. The all-mode sweep CI runs did catch it, but
  only after the fact. Both shapes were measured red before and green after.
  - **The remedy is `--no-renames`, and the framing this item carried ("needs the two-path record
    shape, a scope decision") was FALSE.** With detection off the destination arrives as an ordinary
    single-path `A` (`:000000 120000 0000000 <sha> A`) and the source as a `D` the filter drops, so
    the enumeration is a strict **superset** of the previous one and there is no stride work at all.
    Verified under `diff.renames=true|copies|false|1` and `diff.renameLimit=1`: every one yields the
    same single-path `A`. It also makes the two-field stride **structural** rather than the filter's
    grace, so the answer no longer depends on the caller's git config. That dependence was real and
    measured: with `diff.renames=false` the base tree already refused this fixture, with the default
    it exited 0.
  - **What it costs is enumeration, and this repo pays more than a sibling does, so the number is
    stated.** `--staged` here is scoped by NO path prefix (a sibling's staged route is bounded to
    its fixture root), so every rename DESTINATION anywhere in the tree is now read. Measured:
    `git mv src/model/entries src/model/clinical` stages 17 records, which this route enumerated as
    **0 targets before and 17 after**. The upper bound is the number of paths in the commit. Scope
    is still decided per file by content, so the same 17 rename destinations, and an ordinary rename
    of a synthetic fixture, still exit 0. **The all-mode walk is untouched by this flag** (137
    tracked files, 121 non-markdown walk candidates, before and after): the wide blast radius here
    is on the STAGED route, not on the repo-root walk.
  - **`U` (unmerged) is enumerated in the same change and REFUSED, and it is not a closed commit
    hole.** Be exact, because the bound is real and was measured rather than reasoned about: `git
commit` refuses an unmerged path BEFORE it runs the pre-commit hook (the hook does not run at
    all), so this route was never the thing that could let one through. What it DID do was report
    "OK, no hits" over a path it had not read, which is the one answer this gate must never give. An
    unmerged record has no stage-0 blob (`git show :<path>` fatals), so it is refused under its
    **own** message: its destination mode is `000000`, and reporting a merge conflict as "a git
    mode-000000 entry" sends a developer looking for a symlink that is not there.
  - **A scan that could not RUN now exits 2, never 1.** `1` is this gate's code for HITS FOUND and
    node exits 1 on an uncaught throw, so every failure that was not an `InvocationError` reported
    itself to CI and to the developer as a finding. Two measured instances: `loadAllowList()` sat
    outside every handler in `main`, and `readdirSync` refusing a directory (`EACCES`) is a plain
    system error raised from inside the walk. The net is at the process boundary rather than a
    `catch` per call site, deliberately: the property wanted is about the exit code, and a per-site
    list is what goes stale the next time a call is added.
  - **Twelve tests, nine of them red against the base scanner.** The controls that are green on base
    are deliberate: the `diff.renames=false` variant (which base already refused, and which is what
    proves the answer used to be configured rather than structural) and an ordinary rename of a
    clean synthetic file (which proves the enumeration widened without the scope widening). **Every**
    rename case asserts what the INDEX really holds before asserting the scanner's answer, the
    parameterised ones per row, because the whole defect lives in the record shape: a `git mv` too
    dissimilar to score as a rename would pass against the base tree too and prove nothing, and
    would silently collapse the four detection-on rows into duplicates of the control. The refusal
    still never echoes the link target.
  - **Three diagnostics were narrowed by the conformance gate rather than the guards widened.**
    "EVERY offender is named" is true per GROUP and no longer across them, since the route now
    refuses in two phases and the unmerged one throws first; an unmerged `.md` is exempted, because
    that is a file class this route never reads at all, so refusing over one would announce a
    failure to read something it was never going to read (a conflict in `CHANGELOG.md` would refuse
    the whole gate); and the process net's probe no longer depends on file permissions, since the
    `EACCES` case is skipped for root and a net whose only probe can be skipped ships unpinned.
  - **One residual disclosed rather than closed:** `git show` runs through `execFileSync`, whose
    `maxBuffer` is 1 MiB, so a larger staged blob refuses with `ENOBUFS`. PRE-EXISTING and
    fail-safe, named here because `--no-renames` widens what reaches that call. No tracked file in
    this repo is close (largest ~222 KB).
  - **The rule and the residuals are stated once, in the scanner's docblock**, and
    `phi-scan-overrides.md` points there rather than restating them. This entry is the release
    record and necessarily carries the measurements; it is not a third home for the rule.
- **The test suite no longer asserts an idle box (`PARSER-TESTTIMEOUT-ASSERTS-AN-IDLE-BOX`).**
  `vitest.config.ts` set a global `testTimeout: 10_000`, which is an assertion about the machine
  rather than about the code. It is gone, `hookTimeout: 10_000` went with it (it restated Vitest's
  own default verbatim, measured), and the tests whose cost is genuinely not fixed now declare their
  own budget beside the work. **The rule, and why a global is the wrong shape, is stated once, in the
  docblock of `vitest.config.ts`.** No runtime code changed and the published surface is unaffected.
  - **The trim was the win, not the ceiling.** `test/scripts/phi-scan.test.ts` spawns the scanner in
    nearly every case and paid a `tsx` start-up at each one. It spawns `node` instead (native type
    stripping), measured at ~183 ms per start against ~646 ms for `tsx`, interleaved. That file's
    summed test time fell by about **2.8x** (median of interleaved single-suite coverage runs) while
    the file **gained** a test: one case still pays the `tsx` cold start and asserts the two runners
    agree on exit code, stdout and stderr, because `pnpm phi-scan` is what the pre-commit hook and CI
    really run. **Read the ratio, not an absolute:** the same file summed anywhere from 12.7 s to
    98.3 s on the head tree alone depending on what else the box was doing, which is why an absolute
    from one run is worthless here and why base and head were interleaved.
  - **THE MEASUREMENT, because on this item the method is the claim.** Twenty-two `vitest run
--coverage` runs on 2026-08-03, on a 12-CPU cgroup quota with sibling workers loading the box.
    Base and head were **interleaved**, never compared across an hour, because a quiet box reads as a
    speed-up. Six runs were a single suite at a time; sixteen were **four concurrent coverage suites
    in one working tree**, harsher than anything CI does. The coverage runs were included because CI
    gates on `pnpm test` **and** `pnpm test:coverage`. **Do not carry over the sibling finding that
    instrumentation roughly doubles the peaks: it is false here, and the reason is worth knowing.**
    This suite's slowest cases are subprocess-bound (`attw`, `npm pack`, the scanner), and v8
    coverage does not instrument a child process, so they barely move. The two in-process property
    suites do, by about 1.7x, and both carry a budget.
  - **What the 10 s global actually did, on correct code.** Across the eight concurrent base runs it
    produced **20 timeout failures in 8 of 8 runs**, every one of them green when run alone, in
    `test/property/immutability.property.test.ts` (8), `test/property/round-trip.property.test.ts`
    (4), `test/phi-diagnostic-surface.test.ts` (3), `test/scripts/phi-scan.test.ts` (3) and
    `test/security.test.ts` (2). Across the eight concurrent head runs, against the 5 s default this
    repo now inherits, **2**, both in the single most starved run, both at about 1.3x the ceiling and
    both in files base also failed. Note the ratio that moved, which is the durable part: base was a
    10 s ceiling over a ~646 ms spawn, head is a 5 s ceiling over a ~183 ms spawn. Halving the
    ceiling still bought headroom, because the trim shrank the measured thing faster than the ceiling
    shrank.
  - **The two changes moved together and the third arm was not run.** Trim-with-the-global-kept was
    never measured, and on these numbers it would have produced zero failures too. That arm is not
    what settles this: the argument for removing the global is that it asserts the machine, and the
    measurement's job was to show the removal does not make the suite worse. It does not.
  - **The tests furthest past the old ceiling already carried their own budget**, so the global was
    never what stood between this suite and a red: on the base tree `test/scripts/attw-gate.test.ts`,
    which runs a real `npm pack` through `attw`, peaked at 16.2 s in a single-suite run and 24.2 s
    under four concurrent suites, both far past the 10 s global and both green, because that file has
    carried a 120 s budget all along.
  - **Two tests were measured and deliberately NOT given a budget**, and that is a result rather than
    an omission. `test/scripts/phi-scan.test.ts`'s sweep and `test/dead-diagnostics-matrix.test.ts`
    each crossed 5 s exactly once, in the worst of those sixteen runs, at ~6.3 s; sequentially they
    peak at 894 ms and 803 ms. Budgeting them would be sizing for a four-times-oversubscribed box,
    which is the error this item exists to remove. With the declared budgets in place **every
    remaining test peaked at 894 ms in a single-suite coverage run on a warm tree**. Quote no margin
    from that: an independent re-measurement on a **cold** tree, which is what CI does every run
    (`test/docs-content.test.ts` builds `dist/` in a hook, concurrently with the suite), put the same
    peak at 2,097 ms.
  - **Two limits, disclosed rather than fixed.** `engines.node` says `>=22.0.0` while unflagged type
    stripping starts at Node 22.18, so the `node` runner needs a newer 22 than the manifest demands;
    CI's 22 + 24 matrix resolves above it, and narrowing `engines` is consumer-facing and belongs in
    its own change. And the four-concurrent condition is not clean for this repo: two suites write to
    a shared `dist/` and one appends to the tracked `phi-scan-overrides.md`, so a handful of
    same-tree collisions appeared on both trees and are excluded from the counts above as artifacts
    of the harness, not of either tree.
- **The PHI scanner no longer reads an IN-SCOPE symbolic link as a clean file, on either enumerating
  route (`PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`).** An in-scope entry that is not a regular file
  now refuses the scan (exit 2), naming every offender by its own repo-relative path and an
  engine-owned kind token, **never the link target**. `--staged` reads
  `git diff --cached --raw -z --diff-filter=AMT`; the walk collects non-regular entries instead of
  dropping them.
  - **"In scope" is each route's own pre-existing boundary, and the qualifier is load-bearing.** A
    gitignored link, and a link occupying the name of a skipped tooling directory, still pass. That
    is unchanged from before and is argued in the docblock; an unqualified "no link reads clean"
    would be false, which is why this headline carries the word.
  - **The rule, its bounds, its two measured repo-specific divergences and its residuals live in one
    place: the docblock of `scripts/phi-scan.ts`.** Read it there. Restating a guard in four
    committed files is how three of them end up stale, which this package has already paid for.
  - The cases that pin it live in `test/scripts/phi-scan.test.ts`; some are red against the previous
    scanner and the rest are green against it on purpose, asserting behaviour that must **not** move.
    No tally is quoted here on purpose: a test count is derivable in one command, it is the most
    drift-prone sentence in a slice like this, and this one was already stale once. The committed
    tree carries no non-regular entry, so `pnpm phi-scan` is unchanged on it.
- **The `attw` publish gate no longer passes an untyped pack (`ATTW-FALSE-GREEN-PORT`).** `pnpm attw`
  ran the bare CLI, and `@arethetypeswrong/cli@0.18.4`'s `getExitCode.js` opens with
  `if (!analysis.types) return 0`, returning before the problem list is read. An untyped package is a
  legitimate npm package, so the CLI treats "no types at all" as a description rather than a problem.
  For a package that ships types it means the declarations were not in the tarball, which is a broken
  publish reported as a pass. A false red costs an hour; a false green merges. The script is now
  `node scripts/attw.mjs`.
  - **Reproduced here with zero concurrency, against this package's own `dist/`.** Both
    `rm -rf dist && attw --pack .` and `rm -f dist/index.d.ts dist/index.d.cts && attw --pack .`
    print "This package does not contain types." and exit 0. The race only supplies the condition and
    is not the defect: `tsup` emits JS in one pass and declarations in a later one, so every build
    here has an interval where `dist/` holds `.mjs`/`.cjs` and no `.d.ts` (measured at 1.7 s, 2.4 s
    and 3.1 s across three `pnpm build` runs, moving with box load). A concurrent build or `clean` in
    the same working tree lands `attw` in it. Deliberately **not** answered with a lock, a lease or a
    build queue: the gate must be able to report that its own inputs were missing, whatever removed
    them.
  - **Two nets, catching different things.** A preflight that every relative path `package.json`
    promises (`main`, `module`, `types`, `typings`, every string leaf of `exports`, four files here)
    exists and is non-empty, which catches the window and names the missing file; and a post-check
    that promotes `attw`'s untyped sentence to a failure, which catches declarations present on disk
    but excluded from the tarball. Demonstrated on this package: with the declarations on disk and
    `files` narrowed to the two JS entry points, the bare CLI prints the untyped sentence and exits 0
    while the wrapper exits 1. The non-emptiness half closes a second, quieter false green the
    post-check cannot see: a zero-byte declaration, on which `attw` reports "No problems found" and
    exits 0 over a package that declares nothing. Which route emptied the tarball depends on an
    `.npmignore`'s depth rather than on whether one exists: a root one is overridden by `files`, a
    `dist/.npmignore` is not. Both measured with `npm pack`.
  - **The post-check reads a string, so the arguments and config that hide it are refused by option
    name, wholesale.** `--quiet`, `-q`, `--format json`, `--format=json`, `-f json`, `-fjson`, `-Pq`
    and a `.attw.json` setting `quiet` or `format` were each measured to hand back exit 0 with the
    sentence absent. `--config-path` and `-f=json` are refused without being blinding routes, the
    first by inference and the second because bare `attw` rejects it as a usage error. The refusal
    reads a
    short cluster's letters rather than comparing whole tokens, because commander parses `-fjson` as
    `-f json` and a token test lets it through. A third guard sits behind the two nets: `attw`
    exiting 0 having printed nothing at all is a failure, not a pass.
  - **No behaviour change to the published package**, and no source file was touched: this is the
    release gate only.

- **A race in the PHI gate's own enumeration no longer refuses a publish (`PHI-SCAN-ENUMERATION-TOCTOU`).**
  `scripts/phi-scan.ts` lists the whole tree in all-mode and reads each file afterwards. `tsup` writes
  `tsup.config.bundled_<hash>.mjs` at the repo root and deletes it when a build ends, inside that window,
  so the read threw `ENOENT` and the scanner refused the entire sweep with exit 2. That failed
  `prepublishOnly` and blocked the real `ccda@0.0.5` publish on 2026-08-02. It is load-dependent and
  intermittent, so a plain re-run published cleanly and it reads like a flake.
  - **The two halves race inside `pnpm test`, which is what made it look like one.** `prepublishOnly` runs
    the suite before `build`, and inside the suite `test/docs-content.test.ts` provisions `dist/` by running
    `pnpm build` while `test/scripts/phi-scan.test.ts` sweeps the live checkout in all-mode from another
    worker. Under load the build's transient config is born and deleted inside the sweep's window.
  - **The refusal was correct; the enumeration was unsound.** Refusing a scan it could not complete is the
    property that makes the gate worth having, so it is untouched. What changed is that the enumeration no
    longer admits a file that may not survive to the read: exactly one case is tolerated, a file the walk
    enumerated **itself** that **git does not track** and that fails with **`ENOENT`**. It is reported on
    stderr as skipped, never dropped silently.
  - **Everything else still refuses.** A **tracked** file that cannot be read (the committed corpus is what
    the gate promises to have observed), any non-`ENOENT` failure (`EACCES` / `EISDIR` is a scan that
    failed, not a file that went away), a `git` that cannot report the tracked set, and a tracked set that
    comes back **empty** (which would make every file untracked, the one state in which that bound stops
    existing) all tolerate nothing. **All-mode also refuses outright when it observed no files**, so the
    tolerance can never decay into a clean report of a tree nothing was read from.
  - **Which of those are pinned by a test, measured rather than asserted: five of six.** A tolerated file
    that is **back on disk** when the sweep ends still refuses, and that branch is the one with no test:
    reaching it needs a timed re-create against a deliberately slowed sweep, and a load-sensitive sleep in
    the suite guarding this very defect is the failure it exists to stop. Stated as a known gap rather than
    papered over; losing it would cost the re-check, not the tolerance's bounds.
  - **The other tests hit the window without a sleep or a real build.** The scanner runs `git` between the
    walk and the first read, so a `git` shim first on `PATH` is a deterministic hook into exactly that gap.
    Every case runs against a throwaway git repo, so no decoy is ever written into this repo. The pre-commit
    path (`--staged`) reads blobs from the git index and never depended on any of this.
  - **One residual, stated rather than hidden:** the post-sweep re-check is keyed on the enumerated **path**,
    not on content, so an untracked file **renamed** inside the window goes unscanned under a clean report.
    It is bounded (committing such a file means `git add`, after which it is tracked and untolerable, and
    pre-commit reads the index either way); closing it needs a content-addressed sweep, a different design.
- **Two declared diagnostics that nothing could ever produce now work, and `NULL_FLAVORS` is the
  whole HL7 v3 NullFlavor code system (`CCDA-DEAD-DIAGNOSTICS`).** All three were found by review
  during `PHI-WARNING-MESSAGE-LEAK` and correctly left out of it.
  - **`UNKNOWN_NAMESPACE_PREFIX` has a call site.** It was in `WARNING_CODES`, exported with a
    factory, and constructed by no site in `src/`, so a foreign namespace was reported nowhere while
    a consumer could narrow on a code that never fired. **The reason it stayed invisible is
    structural, not an oversight:** every child lookup in `src/model/dom.ts` is scoped to
    `urn:hl7-org:v3`, so no navigation step in the model layer can ever meet a foreign element. It
    is raised from `enforceStructureLimits` in `src/parser/secure-xml.ts`, the depth / node-count
    walk, because that is the package's only exhaustive traversal and the sweep therefore costs no
    second pass.
  - **It is replayed after the model is built, never emitted where it is found, and that ordering is
    the load-bearing part.** The walk runs before `parseCcda`'s root gate and before any clinical
    parsing, and under `{ strict: true }` the emitter escalates the **first** warning it is handed.
    Emitting in place therefore let a foreign vendor block throw `UNKNOWN_NAMESPACE_PREFIX` where a
    non-C-CDA payload should have thrown `NOT_A_CLINICAL_DOCUMENT`, and where a C-CDA carrying a
    real defect should have thrown a **safety-critical** code such as `MISSING_CODE_SYSTEM`. Both
    were caught by the conformance gate on this slice and are pinned by
    `test/dead-diagnostics-matrix.test.ts`. A namespace deviation is a statement about the whole
    document and must never take a fatal's or a safety-critical code's place. The cost, stated
    rather than hidden: in lenient mode these land last on `doc.warnings` instead of in discovery
    order, so `OnWarningCallback` documents emission order now.
  - **The sweep reports once per distinct foreign namespace, not once per node.** A vendor extension
    block is one deviation however many elements it spans. **That bounds the benign case and is not
    a defence:** a document declaring a distinct namespace on every element still produces one
    warning per element, bounded only by `maxNodeCount`, exactly as every other per-element warning
    in this parser is. An element carrying no namespace at all counts as foreign, matching
    `isRecognizedNamespace`, which reads a `null` URI that way; it is tracked by its own flag rather
    than a sentinel string key, so nothing a document can carry collides with it.
  - **The position is the shallowest use of the namespace, not the first in document order.** The
    walk is level-order, because it enforces a depth cap and a depth-first version would be the
    recursion it exists to avoid. `line` and `column` locate the element the warning names exactly;
    they simply do not name the earliest such element.
  - **Attributes are deliberately not swept.** An unprefixed C-CDA attribute (`root`, `code`,
    `nullFlavor`) carries no namespace at all and an `xmlns:` declaration lives in the namespace
    reserved for declarations, so an attribute sweep against the recognized set would flag every
    attribute in a conforming document. The factory's docblock said "an element or attribute" and now
    says what the code does.
  - **The message text changed, because the code name is historical.** The code says `PREFIX` but
    what is tested is the element's **namespace**, and an element in no namespace at all raises it
    with no prefix in sight. Renaming a stable code is a breaking change, so the frozen message says
    what the code does instead: "An element outside the recognized v3/xsi/sdtc namespaces, or in no
    namespace at all, was found; the node is retained and reported once per distinct namespace.
  - **Neither the prefix nor the namespace URI reaches the warning.** The message comes whole from
    the frozen registry and the position carries the bounded element **local name**, so a foreign
    `<vnd:note>` positions as `<withheld>`. This closes the `expectCode: null` on the
    `ClinicalDocument (foreign namespace prefix)` slot of `test/phi-diagnostic-surface.test.ts`: the
    slot plants its marker as the prefix and was unchecked while no branch existed to reach. It is a
    live probe now, and it was **confirmed able to go red** by injecting the prefix into the position
    and watching the runner fail before the injection was reverted.
  - **`CcdaPosition.templateId` is populated.** It was declared and set by nothing, so
    `toleranceApplies` could never satisfy a `QuirkTolerance` keyed on a template OID: such a profile
    entry silently tolerated nothing and the author got no signal. **Three** codes carry it now, and
    only those: `TEMPLATE_EXTENSION_ABSENT` (the matched document-type root) and
    `UNKNOWN_SECTION_CODE` / `SECTION_MATCHED_BY_LOINC_FALLBACK` (the section's first rooted
    `templateId`).
  - **Two document-level codes carry none on purpose, and the second is the interesting one.**
    `MISSING_TEMPLATE_ID` has no template to name. `UNKNOWN_DOCUMENT_TEMPLATE` has too many: its
    subject is the templateId **set** naming no type, and the obvious pick, the first root in
    document order, is the US Realm Header stamp carried by essentially every real C-CDA. Populating
    it with a near-constant would let a profile author write a `match` that reads like narrowing and
    in practice tolerates the code on every document, which is a worse failure than the empty field
    it replaced. Filling a field because it can be filled is not the same as populating it.
  - **It is bounded at the site that sets it**, on the HL7 v3 UID shape, reading `<withheld>`
    otherwise, exactly as `position.sectionCode` is bounded on the LOINC shape. The roots reaching
    those sites have already been through `boundTemplateId`; re-bounding is idempotent and keeps the
    bound visible where the field is written rather than one call away.
  - **`QuirkMatch` documents which codes carry which field, because the old wording implied a
    breadth it never had.** Its docblock offered "deprecated LOINC only within Vital Signs" as the
    example, and that has never worked: `DEPRECATED_LOINC` carries no `sectionCode` either, so the
    narrowing matched nothing rather than narrowing anything. A `match` on a field the warning does
    not carry is inert, not broad. `sectionCode` is carried by the two section-recognition codes;
    `templateId` by those two plus the two document-type codes. No profile in `ccdaProfiles` uses
    `match` at all, so nothing shipped changes behaviour.
  - **`NULL_FLAVORS` is the whole code system**: all seventeen concepts of
    `2.16.840.1.113883.5.1008`, transcribed from the published HL7 Terminology `v3-NullFlavor`
    code system (`content: complete`, `caseSensitive: true`). It held eight, so a **conforming**
    `nullFlavor="PINF"` on a `PQ` and the `nullFlavor="NP"` a real Plan of Treatment carries on a
    `<code>` both drew a false `INVALID_NULL_FLAVOR`, and both read `<withheld>` wherever the
    `templateId` and `ED` bounds test membership. The nine added tokens are `INV`, `DER`, `NINF`,
    `PINF`, `UNC`, `NAVU`, `QS`, `TRC`, `NP`. **Nine, not the seven this was first written down as:**
    `UNC` and `NAVU` were missing from that count, which is the reason the set is transcribed from
    the published code system rather than from a remembered list.
  - **Widening does not weaken the PHI bound it carries**, and that was the thing to get right.
    `boundTemplateId` and `parseEd` decide whether to echo a `nullFlavor` or write `<withheld>` by
    membership in `NULL_FLAVORS`. The bound is "a member of a closed set of literals this package
    owns", never a shape test, and it still is: the set is larger and is now the same closed set the
    standard defines, and every entry is a fixed token, so nothing sender-controlled gained a path
    through. What changes is that a conforming token is echoed where it used to be withheld.
  - **`NP` is retired in the published code system and is admitted anyway.** It **is** a concept of
    the code system, and `INVALID_NULL_FLAVOR` asserts that a token is not one; saying that about a
    real code is the false positive. This package has no deprecation signal for `nullFlavor` to say
    anything narrower with, and inventing one was out of scope here.
  - **`smartScorecard`'s `INVALID_NULL_FLAVOR` rationale stopped citing `"UNC" for "UNK"` as a
    malformed token**, because `UNC` ("un-encoded") is a real concept of the code system and no
    longer draws the warning at all. The tolerance itself is unchanged and still covers tokens
    genuinely outside the system.
  - **Deliberately not done here.** `defineCcdaProfile` still accepts a `match` on a code that cannot
    carry the field, so an inert tolerance is documented rather than refused. Turning that into a
    definition-time throw needs a code-to-position-field registry, which is exactly the kind of
    stated claim that outlives the code it describes, so it is filed rather than smuggled in.
  - **Monotonicity, measured against base `src/` in BOTH modes rather than argued.** A 51-row matrix
    (recognition shapes, namespace shapes including a foreign root and a foreign block beside a
    safety-critical defect, and all seventeen NullFlavor concepts plus two controls, each planted on
    a header `<administrativeGenderCode>` and on a medication `<doseQuantity>`) was run against the
    previous tree and against this one and the two outputs diffed. **25 rows are byte-identical**,
    including the clean CCD, the `sdtc` element, `MISSING_TEMPLATE_ID`, the foreign root, and every
    one of the eight tokens the old list already held. **Eight rows are pure gain**: five add
    `UNKNOWN_NAMESPACE_PREFIX` (the two-namespace row adds two of it), and three add a
    `position.templateId` to a warning whose code is unchanged. **Eighteen rows go from
    `INVALID_NULL_FLAVOR` to silent on that code**, and that is a false positive being withdrawn
    rather than a signal lost: each names a real concept of `2.16.840.1.113883.5.1008`. No row loses
    a **safety-critical** code (`INVALID_NULL_FLAVOR` is not one, which is why `smartScorecard` is
    allowed to tolerate it) and no row stops reporting anything else. The two controls hold: `NOPE`
    still draws the warning, and so does lower-case `unk`, because the code system is
    `caseSensitive`.
  - **The strict-mode column moves on 22 of the 51 rows, and every one of those moves is this
    change's intended effect.** Four rows go from throwing nothing to throwing
    `UNKNOWN_NAMESPACE_PREFIX`, and eighteen stop throwing a false `INVALID_NULL_FLAVOR`. They are
    the same rows already counted in the eight-gain and eighteen-withdrawn buckets above, not
    movement beyond them. What holds across all 51 rows is the narrower pair the test asserts: **no
    row's strict outcome moved independently of its lenient one**, and **no row's strict outcome is
    a namespace code where base threw a fatal or a safety-critical one**.
  - **The first measurement had no strict column at all.** It was taken over a lenient-mode
    projection, which structurally could not see either of the two real defects in the first cut of
    this change, both of which lived only in strict mode. This repo already records that a filtered
    projection cannot support a monotonicity claim; it was learned again here.
    `test/dead-diagnostics-matrix.test.ts` pins both modes and filters nothing.
  - **What is committed is the 32-row subset of that matrix, not all 51 rows.**
    `test/dead-diagnostics-matrix.test.ts` holds the thirteen recognition and namespace shapes plus
    the nineteen NullFlavor tokens planted on `<administrativeGenderCode>`; the `<doseQuantity>`
    half of the planting was measured by hand and is not in the file. Re-run **the file** against
    the previous tree and the diff is **32 rows, 15 identical, 8 pure gain, 9 withdrawing a false
    `INVALID_NULL_FLAVOR`**, with the strict column moving on 13 of them. Those are the numbers to
    expect from it. They differ from the 51-row totals above only in the NullFlavor counts, which
    the `<doseQuantity>` planting doubles, because each of those rows moved identically to its
    `<administrativeGenderCode>` twin.

### Changed

- **Warning and fatal messages no longer echo anything from the parsed document
  (`PHI-WARNING-MESSAGE-LEAK`).** Every message now comes whole from a frozen registry
  (`WARNING_MESSAGES`, `FATAL_MESSAGES`) and no factory takes a value parameter, so a template OID, a
  section `@code`, a `nullFlavor` token, a unit string, an `xsi:type`, a `@moodCode`, a `<reference>`
  target or an XML element name can no longer reach `.message`, `err.message` or `err.stack`.
  - **What was wrong.** Thirteen warning factories and the `NOT_A_CLINICAL_DOCUMENT` fatal
    interpolated a value taken straight from the document. Reproduced against the published
    `0.0.4`: a 500,000-byte `templateId` root produced a 500,106-byte `.message`, unbounded, against
    a 30 MB input ceiling, and under `{ strict: true }` it reached `err.stack` as well. There is no
    `snippet` field on a `CcdaWarning`, so `.message` was the only surface and every leak landed on
    it. `README.md`, `docs-content/installation.md`, `docs-content/spec-notes-tolerance.md` and
    `docs-content/troubleshooting.md` all told consumers the opposite, and
    `docs-content/troubleshooting.md` explicitly green-lit logging the whole `.warnings` array. All
    four are corrected here, in this commit rather than ahead of it.
  - **Exactly one exported signature changed**, and it is worth stating narrowly rather than as
    "the factories changed": `semanticCodeInvalid(position, slot, observedOid)` is now
    `semanticCodeInvalid(position, slot)`. It and `profileQuirkApplied` are the only two warning
    factories on the public surface. Internally every factory lost its value parameter; the six
    code-system ones now take only a `CodeSlot`, `codeNarrativeMismatch` a `NarrativeSlot`, and
    `sectionPlacementSuspect` / `requiredSectionMissing` a catalog section key. Each such key selects
    a frozen variant generated from the parser's own tables, so the complete set of strings this
    package can emit is finite and enumerable. Every warning **code** is unchanged, so a consumer
    branching on `w.code` sees no difference.
  - **`PROFILE_QUIRK_APPLIED` stopped restating the tolerated warning's message and stopped naming
    the profile in its text.** It was the one factory whose output was assembled rather than looked
    up. Both facts are still carried, as the typed `toleratedCode` and `profile` fields.
  - **Counts left the messages, and one of them is a real loss.** `MULTIPLE_RECORD_TARGETS` and
    `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED` no longer print how many. A count cannot carry PHI, but it
    is still input-derived, and keeping it would have cost the property that an emitted `message` is
    a registry member, which is what a tripwire can actually check. For the first the number is on
    `header.recordTargets`; for the second **nothing on the model counts them**, so it is only in the
    source. Likewise a `PROFILE_QUIRK_APPLIED` keeps the tolerated `code` and `position` but not its
    text, so a per-slot wording (which `CodeSlot` an `UNEXPECTED_CODE_SYSTEM` was about) is not
    recoverable from the re-badged warning. Stated rather than dressed up as "nothing is lost".
  - **`CcdaPosition` is bounded rather than copied**, because a message registry cannot reach it.
    `path` (an element local name, which a sender may make anything, and on which
    `enforceStructureLimits` positions for arbitrary hostile elements) is echoed only for a name in
    the CDA vocabulary this parser navigates; `sectionCode` is echoed only for a LOINC-shaped code,
    which matters because `UNKNOWN_SECTION_CODE` fires exactly when the code is unrecognized.
    Anything else reads `<withheld>`. `line` and `column` are unchanged.
  - **The model is bounded too, which is the half `@cosyte/hl7` got wrong.** `hl7` bounded its
    messages, went green, and `@cosyte/deid` still leaked because `Segment.type` stayed unbounded on
    the model. So `CcdaDocument.templateIds` and `CcdaSection.templateIds` now carry a `root` that
    must have the shape of a UID and an `extension` that must have the shape of a version stamp; an
    unsupported observation value's `xsiType` must be a name in a list of HL7 v3 datatypes; an `ED`'s
    `mediaType` must be a member of a list of media types, its `representation` one of `B64` /
    `TXT` and its `nullFlavor` a member of this package's `NULL_FLAVORS`; and a `templateId`'s `assigningAuthorityName` (free text, meaningless on a template) is
    withheld outright while its `nullFlavor` must be in the v3 NullFlavor table. A root that fails
    the shape could not have matched the template catalog either, so **recognition cannot move**:
    every OID in `SECTION_CATALOG`, every document-type OID including the IHE PCC arc
    `1.3.6.1.4.1.19376.1.5.3.1.3.1`, and `R21_EXTENSION` all pass their shapes.
  - **"A conforming document is untouched" is NOT true as an absolute, and the two membership lists
    are where it breaks.** They are hand-assembled, so a legitimate but unlisted `xsi:type`
    (`RTO_MO_PQ`, `IVXB_TS`, `BIN`, `ENXP` and the `SXCM_*` / `URG_*` family were all missing from the
    first cut and have been added) or an unlisted media type now reads `<withheld>` on the model
    where `0.0.4` read the document's own token. The datatype list is **stated, not traced**: this
    repo does not hold `datatypes-base.xsd`, so two further candidates were dropped rather than
    guessed at (`THUMBNAIL`, whose ITS type is lower case, and `EIVL_event`, which would have been
    the only entry mixing the dot and underscore conventions). No clinical value moves with it: the value's `raw` text is still there and
    `doc.toString()` re-emits the DOM. Membership over-withholds by design, and the honest statement
    is that it costs diagnostic detail rather than that it costs nothing.
  - **A `type/subtype` shape test was not a bound and has been replaced.** The first cut bounded
    `ED.mediaType` with `/^[a-zA-Z]{1,20}\/[a-zA-Z0-9.+-]{1,40}$/`, which admits
    `text/Doe-Jane-1980.01.01-MRN0012345`: 61 characters of legible identifier through a regex that
    looked tight. The slot probing it planted a marker with no `/`, so it only ever exercised the
    reject branch and could not have caught this.
  - **Patient identifiers are deliberately NOT bounded.** An `II.extension` outside a `templateId` is
    an MRN or an accession number: the identifier the model exists to report, not a locator a
    downstream package interpolates. Withholding it would delete clinical data rather than decline to
    echo a locator. The narrative index (`CcdaSection.narrativeById`) is likewise unbounded, and for a
    sharper reason: its keys are what `<reference value="#id">` resolves against, so collapsing two
    unrecognized anchors to one `<withheld>` key would resolve a broken reference onto unrelated
    narrative. That is a clinical-safety regression worse than the leak, so the reference warning
    stopped naming the id instead.
  - **`test/phi-guard.test.ts` is replaced, not extended, by `test/phi-diagnostic-surface.test.ts`.**
    The old guard planted sentinels in patient name, MRN, narrative and birthdate while handing a
    clean `1.2.3.4.5` to the document-template slot that actually leaked: its sentinel set and its
    leaking set were disjoint, so it could not fail. The new suite drives
    `assertNoDiagnosticPhiLeak` from `@cosyte/test-utils` over a 26-slot table covering every position
    a sender controls, and was run against the unfixed parser first, where **20 of the 29 slots
    failed**: five model-identifier leaks, one `err.message` (and `err.stack`) leak on the fatal,
    and fourteen warning-message leaks. A second test asserts every emitted message is a member of the frozen registry, so a
    factory that starts interpolating again fails without anyone having to think of the slot.
  - **Two residuals were stated here rather than papered over, and both are CLOSED in the same
    unreleased version, above.** `UNKNOWN_NAMESPACE_PREFIX` was in `WARNING_CODES` with a factory
    and no call site, so a foreign namespace was reported nowhere and the slot covering it carried
    `expectCode: null`; and `CcdaPosition.templateId` was declared and populated by nothing, so a
    `QuirkTolerance` keyed on a template OID silently tolerated nothing. Both were pre-existing gaps
    this work found rather than introduced. Read the `Fixed` entry above for what they do now; this
    paragraph is kept because it records where they were found, not because either is still open.

- **Public-surface hygiene (`PUBLIC-SURFACE-HYGIENE`, founder directive 2026-07-27).** Internal
  project bookkeeping is gone from every surface a consumer reads: `README.md`, `docs-content/`, the
  JSDoc compiled into `dist/index.d.ts` and `dist/index.d.cts`, and one runtime error message. No
  API, type, or parsing behaviour changed.
  - **`CcdaDocument.toString()`'s error text changed.** It ended "; a document builder API lands in
    a later phase", which was stale as well as internal: `buildCcda` had already shipped. The
    stable part a caller might match on, `no source document retained`, is unchanged, and
    `test/serialize.test.ts` asserts on that substring rather than on the sentence.
  - **Two published JSDoc claims were false, not merely noisy, and were deleted rather than
    reworded.** `CcdaDocument` claimed it framed "identity + narrative only" with clinical entry
    extraction still to come (`Phase 2+`), and `model/types/bl.ts` claimed BL was modelled "even
    though Phase 1 does not yet extract clinical entries". Fourteen entry families are extracted.
    Stale bookkeeping does not just leak process; it misdescribes the software, and a consumer's
    editor was rendering both on hover.
  - **`docs-content/installation.md` said the package was published at `0.0.1`.** Re-derived from
    the registry: `0.0.2`.
  - Removed with them: 11 `**This slice adds ...**` paragraph openers in the `buildCcda` docblock,
    `CCDA-P7` / `CCDA-PLANNED-CODE-SLOT` /
    `CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE` item identifiers, six `ADR 0018` and
    `docs/adr/0001-xml-parser.md` citations, four prose citations of the roadmap, and the
    "no phase numbers here on purpose" paragraph on the troubleshooting page, which explained our
    release bookkeeping to a consumer.
  - **What was deliberately kept.** The "this repo cannot settle X without the normative R2.1
    Schematron" clauses in `parser/warnings.ts` and `model/entries/plan-of-treatment.ts` read like
    process commentary and are not: each bounds a safety-critical claim, and deleting one would
    silently promote "this may be a template violation" into "this is one". Cutting a qualifier is
    not the same act as cutting a claim.

### Tooling

- **`test/sanity.test.ts` pins the `VERSION` export to `package.json` (`CCDA-VERSION-DRIFT-TEST`).**
  Test-only. No runtime code changed and the published surface is unaffected. The suite asserted
  only `typeof VERSION === "string"` and a semver-shaped regex, under a comment reading "At this
  stage VERSION is `0.0.0`" that had been false since the first publish and made the weak assertion
  look deliberate. Both the comment and the gap are gone: `expect(VERSION).toBe(manifestVersion(pkg))`
  reads the manifest at test time and compares, never against a hardcoded literal, so a bump needs no
  edit here.
  - **This repo was NOT defective, and that is the point of the item.** The `version` script is
    `changeset version && node scripts/sync-version.mjs && prettier --write package.json src/index.ts`,
    so the constant is structurally synced at release; verified rather than assumed, twice, against
    the `0.0.8` release commit (which moves `package.json` and `src/index.ts` in one commit) and
    against the published `0.0.8` tarball (whose `dist` carries `VERSION = "0.0.8"`). What was
    missing was the guard on the guard: if that step is ever removed, reordered, or silently fails,
    nothing else in this repo catches it.
  - **Ported from `@cosyte/transform`, which is the worked example rather than a hypothetical.**
    It published `VERSION = "0.0.0"` on `0.0.2`, `0.0.3` **and** `0.0.4` while its manifest said
    otherwise, verified here by unpacking all three tarballs from the registry; `astm@0.0.1` and
    `terminology@0.0.1` were earlier instances of the same class. The two assertions this repo
    already had are exactly the two that stayed green through all three of those releases, which is
    measured rather than argued: with the constant desynced to `0.0.0` against a `0.0.8` manifest the
    new assertion fails with `expected '0.0.0' to be '0.0.8'` while **both** pre-existing assertions
    still pass.
  - **`manifestVersion()` narrows the parsed manifest without an `as` cast, and that property was
    ported deliberately rather than just the assertion line.** A cast would let the sanity test lie
    about its own input, which is the failure mode it exists to detect one layer down.
  - **No wiring check was added, deliberately.** Asserting that `scripts.version` still mentions
    `sync-version.mjs` would be a string match on a config file: it guards assembly rather than
    correctness, it fails on a legitimate refactor that preserves the invariant, and it detects
    nothing this assertion misses. The drift test already catches every failure mode of **that
    mechanism**, whose whole outcome is that the constant and the manifest agree, because it compares
    those two artifacts regardless of how they came to agree. Stated that narrowly on purpose: it is
    an assertion about `src/`, so a divergence introduced after it (a `tsup` `define` rewriting the
    constant, or a stale `dist`) is outside it. Unreachable today (`tsup.config.ts` defines nothing,
    and `prepublishOnly` cleans and rebuilds from the just-tested `src/`) and named rather than
    implied. It gates on two independent routes (`ci / verify (22|24, ubuntu-latest)` are
    required status checks and run `pnpm test`; `prepublishOnly` runs `pnpm test` again). A
    "Version Packages" PR produced by a broken `version` script arrives desynced and is blocked.

- **Public-surface gate (`scripts/check-no-internal-refs.sh`, `pnpm check:no-internal-refs`, plus
  `.github/workflows/no-internal-refs.yml`).** Enforces the founder directive above so the sweep
  cannot regress ("it needs to not just be a memory note, but something that is addressed in the
  workflow accordingly"). Seven rules over four passes: the public markdown surface plus the npm
  metadata, line by line and paragraph-joined; `src/` doc comments, which tsup compiles into both
  declaration files; and `src/` string literals, which reach a consumer's terminal. Ported from
  `ncpdp`'s copy rather than `hl7`'s, because `ncpdp`'s carries the string-literal pass, the plural
  `phases?` stem and `/` in the ADR separator class, and this repo needed all three. Rule 7, the
  prose roadmap citation, is taken from `cli`'s copy and is the highest-yield rule here: this repo
  cites the roadmap in prose and never by path, so the path-keyed rule is structurally blind to it.
  - **The scan surface, the standards-designation exclusions, the phase rule's clinical guards and
    its roman-numeral arm, and every self-test sample are re-derived for C-CDA, not inherited.** A
    naive `WORD-N` identifier rule matches 21 distinct tokens on the scanned markdown surface and
    all 21 are the reader's reference material (`ICD-10-CM`, `ICD-9-CM`, `PHQ-9`, `UTF-8`,
    `W3C-DOM`, `MRN-00042`, `DOC-0001`). `CPT-4`, `ICD-10-PCS`, `TOP-LEVEL` and `SYNTH-9` are
    `src/`-only and are not among those 21.
  - **The wrapped-hit de-duplication is per-rule, which is a fix to the ported code.** The sibling
    copies test the cumulative hit list, so a doc block already carrying an earlier rule's hit
    swallowed every later rule's wrapped hit in the same block. Measured, not theorised:
    the doc block opening at `src/model/section.ts:1` carried `Phase 1` on its line 3, which rule 2
    reported against the block, and a roadmap citation wrapped across its lines 5 and 6, which rule 7
    could then not report at all. The red survived; the report did not, and the citation would have
    shipped.
  - **It reports; it does not yet block.** `Public-surface gate / no-internal-refs` is not among the
    required contexts on `cosyte/ccda`, exactly as with the em-dash gate next door. Closing that is
    a GitHub ruleset change, not a file change.
  - **`CHANGELOG.md` is exempt org-wide** (founder, 2026-07-29): an item reference in a changelog
    reads as provenance. The exemption is this file and nothing else.
  - **Known residual, stated rather than discovered later.** `//` line comments are not swept, and
    five are live (one roadmap citation, four `slice` references). They reach `dist/index.mjs`
    verbatim but are not what a consumer is _shown_, and the convention names source comments as a
    place the traceability belongs.

- **Em-dash brand gate (`scripts/check-no-emdash.sh`, `pnpm check:no-emdash`, plus
  `.github/workflows/no-emdash.yml`).** Checks the founder directive banning `U+2014` outright
  (`knowledgebase/06-brand/voice-and-tone.md`, "No em dashes. Ever.") over both halves the rule
  names: every tracked file except the self-excluded script itself (which has to name the encodings
  it bans, so nothing checks the checker), and the PR title, body, and commit messages. The workflow
  carries the non-default `edited` pull-request activity type, so retitling a PR re-checks it, which
  matters because this repo allows only squash merge and takes its subject from the PR title
  (`squash_merge_commit_title: COMMIT_OR_PR_TITLE`). The body that lands is the branch commit
  messages (`COMMIT_MESSAGES`), not the PR body; the PR body is scanned anyway, as a cosyte surface
  in its own right. Its own workflow rather than a job in `ci.yml`, so a PR-description typo does
  not re-run the Node 22 + 24 matrix. **It reports; it does not yet block.** The job is not a
  required status check: `cosyte/ccda` is governed by org-level rulesets whose required contexts are
  `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)` and `ci / actionlint`, and
  `Em-dash gate / no-emdash` is not among them, so a PR carrying a live character can still
  auto-merge. Making it blocking is a GitHub **settings** change rather than a file change (no repo
  defines these rulesets): either add the context to the org ruleset `parser-ci-required-checks`,
  or add a repository-level ruleset here as `pathways`, `docs`, `website` and `iac` already do.
  Ported from `ncpdp` (PR #34, `39212bb`), the text-only variant, with the pipeline
  code kept byte-identical: the known limits are one cross-repo fix across the whole fleet of
  copies, not one fix per repo. Enumerate them at carry-back time rather than trusting a count.
  **One character of content changed**, in a JSDoc comment in `src/profiles/merge.ts`, where an em
  dash became a colon. That file had survived PR #52's remediation sweep because two functional NUL
  bytes (the separator in `toleranceKey`'s composite key, which cannot be removed) make grep
  classify first-party TypeScript as binary and skip it. Dropping `grep -I` is what makes the file a
  loud red instead of a silent exemption, and is why `website`'s NUL-partition variant would be
  wrong here. No runtime, public-API, warning-code, or parse-behavior change; the two NUL bytes are
  untouched.
- **PHI commit-scanner (`scripts/phi-scan.ts`, `pnpm phi-scan`).** A zero-dependency, C-CDA-shape-aware
  scanner refuses any committed/staged file carrying real-looking PHI in a C-CDA document, recognized
  by a native extension (`.cda`/`.ccda`/`.xml`) or a C-CDA marker, so a real clinical document can
  never be committed by accident. Hand-written `src/` / `scripts/` code gets a conservative
  dashed-SSN + email shape pass only (structurally scanning source would flag illustrative `@example`
  snippets); it is not a fixture location. It does NOT
  import the package's `@xmldom/xmldom` runtime dep: a commit gate must run without a build and must
  tolerate the malformed / fragmentary XML a real leaked document arrives as. Detection is
  element-scoped, not a blind text regex, so a coded value (`<code code="55607006"/>`) or a template
  OID (`<templateId root="2.16.840…"/>`) never trips it: it reads person-name parts (`given` / `family`
  wherever they appear: patient, `guardian`, `assignedPerson`, `informant`, `relatedSubject`,
  providers, plus a bare `name`), the `birthTime@value` DOB, `id@root` / `@extension` identifiers
  (SSN under the US SSN OID `2.16.840.1.113883.4.1`, bare-numeric MRN / account, dashed SSN anywhere),
  addresses (`streetAddressLine` / `city` / `postalCode`), `telecom@value` phones (the `555`
  fake-exchange convention passes), and non-test-domain emails. The detectors are namespace-prefix
  tolerant (`<given>` == `<v3:given>`), case tolerant, and decode XML character references +
  `<![CDATA[…]]>` before matching, so a `<family>&#x53;mith</family>` or CDATA-wrapped name is still
  caught. Synthetic fixtures are positively declared in `scripts/phi-allow-list.txt` (the same
  allow-list model the byte-strict siblings use); a whole-file bypass requires `--allow-fixture` plus
  an audit entry in `phi-scan-overrides.md`. Runs at pre-commit (`simple-git-hooks --staged`) and in
  CI (`run-phi-scan: true`). Dev-tooling only: no change to the published package surface or warning
  codes.

### Documentation

- **The Cosyte mark heads `README.md`, and follows the reader's colour scheme (`ASSETS-P8`, the
  consuming half).** A `<picture>` block on the first lines of the file, above the H1: the
  dark-ground org tile behind a `prefers-color-scheme: dark` media query, with the light-ground tile
  as the inner `<img>` (`https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png` and
  `.../cosyte-lockup-tile-on-light-1200x300.png`). Both re-verified `200 image/png`, 10513 and 10455
  bytes, immediately before the push. No width or height attributes. **PNG only** is a deliberate
  bounded policy (the format we are willing to assert renders on every README surface), not a
  demonstrated impossibility for others. The **alt text is content, not decoration**: it describes
  the mark itself, a plus set in two overlapping rounded squares beside the Cosyte wordmark, rather
  than the package, because it is what a screen reader on the npm page reads out and what a reader
  gets when the image fails. The shared lockup reads "Cosyte" while the H1 reads `@cosyte/ccda`, so
  the strings differ and the heading stays.
  - **A per-package banner (`cosyte-banner-ccda-1200x300.png`) landed here first and was superseded
    before release, and one stated reason with it.** That banner was deliberately a plain markdown
    image and **not** `<img>` or `<picture>`, on the grounds that whether npm's markdown sanitizer
    preserves a `<picture>` element was **unverified**. It has since been **measured**: `astm` and
    `hl7` carry the block on their published pages, GitHub honors the switch, and npm hoists the
    inner `<img>` out of the `<picture>` so the light cut renders there, which is the correct one
    because npmjs.com has no dark mode. The premise that made the plain image safer no longer holds.
    Recorded rather than reversed quietly: it was a technical judgement, not a preference.

- **Four stale claims on the package page, corrected against the registry and the source.**
  1. **The status line said `0.0.2`.** Re-derived with `npm view @cosyte/ccda version`: **`0.0.3`**.
     The same claim was stale on three docs pages at two different wrong values
     (`docs-content/installation.md` said `0.0.2`; `docs-content/intro.md` and
     `docs-content/troubleshooting.md` said `0.0.1`). All four now read `0.0.3`. The page's
     historical references ("until `0.0.3` the act `<code>` was preferred", and the rest) are
     legitimate and untouched: a stale **current-version** claim and a dated **historical** one are
     different sentences and only the first was wrong.
  2. **"The three `consumable` call sites" is four.** A performed Medication Activity, a performed
     Immunization Activity, a Planned Medication Activity, and a **Planned Immunization Activity**.
     The fourth arrived with the Planned Immunization Activity and the enumeration was not updated
     with it, so the README told a consumer that `MEDICATION_PRODUCT_ARM_CONFLICT`,
     `MISSING_PRODUCT_CODE` and the rest of the `MEDICATION_PRODUCT_*` family could not reach a
     scheduled vaccination, when they do. `docs-content/troubleshooting.md` already said four, so
     the two public surfaces disagreed with each other as well as with the code.
  3. **The terminology-adapter note named only the planned medication as the exception.** A planned
     immunization's `code` is the vaccine from the same `consumable` and is slot-checked at the
     `vaccine` binding, exactly as its performed twin is. All three copies of the note now say so
     (the callout under "Code systems & provenance", the "Known limitations" bullet, and the one on
     `docs-content/troubleshooting.md`), which is what makes the "five variants whose `code` is the
     planned act" arithmetic hold where it is written rather than three sections away. Correcting
     two of the three copies would leave the public surfaces disagreeing, which is the same defect
     as leaving all three wrong, one degree quieter.
  4. **The `ObservationValue` union was enumerated one arm short.** The Results bullet listed
     `physicalQuantity` / `coded` / `string` / `range` / `unsupported`. There are **six**; the
     missing one is `integer`, the arm that carries integer lab values and assessment-scale scores
     (a PHQ-9 or Glasgow Coma total), so a consumer writing an exhaustive `switch` on the documented
     five would silently drop them. This is the one place the README enumerates a discriminated
     union a consumer is meant to branch on, and the page already documented the `integer` arm
     correctly in three other places, so the enumeration disagreed with its own page as well as with
     `src/model/entries/observation.ts`. It now names all six, and says that it is all six.

- **Two published bounds that were misstated, corrected without a behaviour change.**
  `BuildCcdaPlannedItemBase.effectiveTime` documented itself as `SHOULD [0..1]` flatly. That is the
  cardinality on five of the seven planned templates: **both** `substanceAdministration` variants
  SHALL carry exactly one (Planned Medication Activity `…22.4.42`, CONF:1098-30468, and Planned
  Immunization Activity `…22.4.120`). `BuildCcdaPlannedImmunization` already redeclares the field as
  required; `BuildCcdaPlannedOrder` does not, so `buildCcda` can still emit a Planned Medication
  Activity short that SHALL element. The field's own docblock now says so instead of leaving the
  correction to sit only on the sibling type. **Closing the gap is a breaking change to a published
  input type and is deliberately not taken here.** And `CcdaDocument.getPlannedItems()` carried
  **neither** of the accessor's two bounds: that it returns seven of the section's eleven admissible
  entry templates, and how deep it reads. Both are on it now, at the surface a consumer actually
  reads, rather than only in the extractor that implements them.

- **`CLAUDE.md` Status section and `README.md` headings corrected (CCDA-P7 stale-status residual).**
  These were the last two files still misdescribing the package. `CLAUDE.md` governs every agent
  session in this repo, so a wrong claim there propagates into work rather than just into a reader's
  head, and its Status section was false twice over: it said the package was "not yet published to
  npm" (it is published at `0.0.1`, and `package.json` agreed all along) and that `src/index.ts`
  carried archetype **stubs** with "the real parser lands in subsequent phases". `src/index.ts`
  exports a working `parseCcda` / `serializeCcda` / `buildCcda` / `editCcda`, the `CcdaDocument`
  model, the HL7 v3 datatype layer, fourteen entry-family extractors, the recognition and
  required-section tables, the code-system OIDs, the computable UCUM grammar, the
  `TerminologyAdapter` contract, and the vendor-profile system. The section now says so and states
  five boundaries **under-warning**: `buildCcda` covers two of twelve document types (parsing
  recognizes all twelve); a `TerminologyAdapter` is consulted at the five `CodeSlot`s only, so a
  clean run is not a verified document; six of twelve required-section SHALL tables assert nothing;
  Functional and Mental Status are buildable but not editable; and a built document is
  expected-but-not-proven to pass an external IG validator. The repo's stale hard gate ("≥ 90% line
  coverage … before v1 ships", over a directory list including a `src/templates/` that does not
  exist) is replaced by the gate that actually runs today, pointing at `vitest.config.ts` as its
  source of truth. `README.md` is the npm front page, and its five `## What it extracts (Phase N)`
  headings are restated as the capability each one describes: an installer of `0.0.1` cannot resolve
  "Phase 5b" to anything. The accuracy defects around those headings are fixed in the same pass: the
  status banner's closing "the other document types land in a later increment" read as a parser
  limitation when only building is limited; the terminology section claimed `buildCcda` consults the
  adapter "at each clinical coded slot" when five are wired, so the unwired ones (Results/Vital
  Signs LOINC, procedure, encounter, planned-item, family-history, the status observation values,
  the propensity type, and the reaction/severity/criticality observations) are now named; the Edit
  section gained a "what editing does not cover" paragraph carrying the buildable-but-not-editable
  boundary; and required-section validation now states that six of twelve tables assert nothing and
  that a quiet parse is not a conformance result. The open question of which sections the CCD SHALL
  set contains is left open on purpose: settling it needs the normative R2.1 Schematron, so the docs
  describe what the code asserts and say the set is deliberately conservative, rather than implying
  either candidate set is the correct one.
- **`docs-content/` capability claims rewritten as a capability doc, not a phase log (CCDA-P7
  documentation residual).** `troubleshooting.md` opened its boundary list with "As of **Phase 5b**",
  a stamp no installer of `0.0.1` can resolve, and the list under it had drifted three slices behind
  the code: it described the builder as emitting "a CCD with five discrete-data sections", and named
  "editing an existing document" and "a bring-your-own-credentials terminology adapter" as future
  work when `editCcda` and `TerminologyAdapter` both ship. That section is now **"What it does, and
  does not do, today"**, split into Reading / Building / Editing, with every claim checked against
  the shipped source: all twelve document types recognized and fourteen entry families decoded;
  `buildCcda` emitting a CCD **or** a Referral Note (two of twelve) with its exact always-emitted and
  populated-only section sets; `<translation>` alternates wired at the problem, allergen, medication
  drug + route, and vaccine + route slots and nowhere else; `editCcda` limited to whole-section
  add/replace across twelve kinds, with no entry-level append, no section removal, `RPLC` only, and
  validation-but-not-translation on that path (Functional/Mental Status are buildable but **not**
  editable, a boundary the docs had never stated). The boundaries that are genuinely open are stated
  as open rather than resolved in the reader's favor: a built document is expected-but-not-proven to
  pass an external IG validator, six of twelve required-section (SHALL) tables assert nothing pending
  per-type verification, and the UCUM atom set is curated rather than complete. The same drift is
  corrected across the rest of `docs-content/`:
  `cookbook.md` claimed editing was future work 130 lines above its own `editCcda` recipe and
  undercounted the remaining document types as eleven; `spec-notes-datatypes.md` still described the
  builder's "first slice" as header + Problems + Allergies and omitted the shipped adapter hook;
  `spec-notes-model.md` called content editing a later increment; `intro.md` labeled five shipped
  extractors "deferred"; and `README.md`, the npm front page, still said "the remaining ten document
  types **and editing an existing document** are a later increment" roughly 200 lines below its own
  "Edit a document" section, while listing only eight of the builder's fourteen CCD sections. The
  rewrite also states three boundaries the page had never stated: the terminology adapter is
  consulted at five coded slots **only**, so a clean run is not a verified document; six of the
  twelve required-section (SHALL) tables assert nothing, so those types under-warn; and
  Functional/Mental Status are buildable but not editable. Two public JSDoc comments carrying the
  same stale claim are fixed with them (`serializeCcda`'s "a builder API lands in a later phase",
  `BuildCcdaInit`'s "`documentType` is `"ccd"` in this slice"), since the generated API reference is
  user-facing too. Also strips leaked
  tool-call markup (`</content></invoke>`) from the tail of a prior changeset, which would otherwise
  have landed in a published changelog. No code, public-API, or warning-code change.
- **`docs-content/` publish-status + capability drift corrected (README-ORG-SWEEP, wave 2).** The
  user-facing docs pages (rendered on docs.cosyte.com) still claimed `@cosyte/ccda` was "not yet
  published to npm" / "gated on the coordinated public launch", and `intro.md` still described the
  builder as through **Phase 5b** ("`buildCcda` ships its first slice: a CCD with the US Realm header +
  Problems + Allergies"). Both are stale: the package is **published on npm at `0.0.1`** and **public**,
  and the builder is through Phase 7 (`buildCcda` emits a CCD **or** Referral Note, `editCcda` edits a
  parsed document, and a bring-your-own terminology adapter validates coded values). The status banners
  in `intro.md` / `installation.md` and the "Scope (non-goals)" note in `troubleshooting.md` now state
  published on npm at `0.0.1`, public, still pre-alpha on the cosyte `0.0.x` ladder; the install command
  is live; and `intro.md`'s builder capability now mirrors the corrected README. No code, public-API, or
  warning-code change.
- **README status banner refreshed to current reality (README-ORG-SWEEP).** The banner still read
  "pre-alpha (`0.0.x`), not yet published to npm. Through **Phase 5b** the parser ships …". Both halves
  stale: `@cosyte/ccda` is **published on npm at `0.0.1`** and **public**, and the package is well past
  Phase 5b (the Phase 7 builder / editor / terminology-adapter surface the same paragraph already
  describes). The banner now states published on npm at `0.0.1`, public, still pre-alpha on the cosyte
  `0.0.x` ladder, with the parse → serialize → build → edit → BYO-terminology capability intact. No code,
  public-API, or warning-code change.
- **`docs-content/` now ships the full canonical Diátaxis spine (DOCS-CONTENT-P5), gated hard to the
  shipped Phase-5b parse surface.** The sidebar was Overview-only. This authors the rest of the spine
  every `@cosyte/*` package shares: four **Core Concepts** pages (the document model: recognition,
  header, section framing; the tolerance tiers + warning-code model with the seven Tier-3 fatals; the
  clinical entry layer: the 14 extracted families and their safety-critical distinctions; and
  datatypes / code systems / computable UCUM / the round-trip serializer), **Installation** and
  **Quickstart** tutorials (parse a CCD, read demographics + the Problem/Medication/Allergy triad, a
  Result, and an Immunization), a task-oriented **Guides** cookbook, and a **Troubleshooting & known
  limitations** page with an explicit **"what's not yet parsed"** list (no builder API; entry families
  beyond the 14; recognition-not-membership code checks; curated-UCUM; inert `nonXMLBody`). The stale
  `intro.md` status banner (it read "Phase 3 / six families") is refreshed to the current shipped
  reality (Phase 5b + serializer) with an honest status banner; **no unshipped API is documented**.
- **A doc/code-agreement gate: every runnable docs snippet is executed against the built package.**
  `test/docs-content.test.ts` runs `docSnippetSuite()` (from `@cosyte/vitest-config/snippets`) over
  `docs-content/`, extracting each ` ```ts runnable ` block, compiling it, executing it against the
  **built** ESM artifact, and asserting its inline `// =>` results, so a documented example can never
  silently drift from the shipped code. Bumps the `@cosyte/vitest-config` devDependency to `^0.0.2`
  for its `/snippets` export. Synthetic-only fixtures throughout (an invented patient, fake OIDs).
  Docs and tests only: no runtime or public-API change.

### Security

- **Dev-dependency advisory remediation (no runtime impact: both overridden
  packages are dev/build-time only and never enter the published artifact; the
  sole runtime dep, `@xmldom/xmldom`, is untouched).** Added scoped
  `pnpm.overrides` pinning two transitive packages to their patched releases:
  `esbuild` (`>=0.27.3 <0.28.1` → `0.28.1`; GHSA dev-server path-traversal,
  not reachable here: the library builds via `tsup`/`vitest` and never runs
  `esbuild serve`) and the `@changesets/parse` copy of `js-yaml`
  (`>=4.0.0 <4.2.0` → `4.2.0`; GHSA-h67p-54hq-rp68 merge-key DoS). The
  `js-yaml@3.14.2` pulled by `read-yaml-file@1.1.0` (via
  `@manypkg/get-packages` → `@changesets/cli`) is **intentionally left**: it
  calls `yaml.safeLoad`, removed/throwing in js-yaml 4, so it cannot be
  force-upgraded without breaking the release tooling, and it only parses
  trusted local repo YAML at release time. This is the shared canonical
  override block, enforced suite-wide by the `@cosyte/config` drift check.

### Added

- **Phase 7 (twenty-fourth slice): `buildCcda` consumes the terminology adapter's `translate`
  (`$translate`) to emit `<translation>` alternate codings.** Closes the "translate-emit" boundary the
  twenty-first (terminology-adapter) slice deferred ("emitting `<translation>` alternates from an adapter is
  a later increment"). When a caller supplies an adapter whose optional `translate` returns an alternate
  coding for a clinical coded slot, `buildCcda` emits a spec-clean CDA R2 `<translation>` child on the
  relevant CD/CE element (`<value xsi:type="CD">`, `<code>`, `<routeCode>`) **beside** the primary code.
  `@cosyte/ccda` still imports no terminology library and only calls the adapter you supply.
  - **Additive, never a coercion.** A `<translation>` is only ever an _additional_ alternate coding
    alongside the original `@code`/`@codeSystem`; the primary code is emitted verbatim and never replaced:
    the same discipline the validation path follows (the adapter can add to a coded slot, never change it).
  - **Never fabricated.** `translate` returning `undefined` (no opinion) or an empty `matches` (unmapped)
    emits **no** `<translation>` and leaves output byte-identical; only a concrete adapter-supplied coding
    produces one, and a match missing a `system` (not an unambiguous CD) is dropped, conservative on emit.
  - **Opt-in, non-breaking.** No adapter, a validation-only adapter, or a `translate` with no opinions all
    yield byte-identical output to the pre-adapter build. `translate` stays optional on the interface.
  - **Scoped to the recognized clinical slots.** Emitted for the coded slots the parser recognizes via
    `checkCodeSlot`: problem value, allergen, medication drug + route, vaccine + route. Structural
    act/section codes (`ASSERTION`, section LOINC) are never handed to `translate`, mirroring the validation
    path's slot discipline. Results/vitals LOINC, reaction/severity/criticality values, and the
    `buildSectionComponent` edit/append path are out of this slice's scope.
  - **Round-trips.** Emitted at the correct CD/CE `xs:sequence` position (`translation` follows
    `originalText`/`qualifier`, neither of which these emitters produce); the parser reads the primary code
    unchanged and surfaces each alternate in `CD.translation` (`parseCd` already reads `<translation>`), so a
    translated build round-trips through `parseCcda` with zero new warnings. A match's `version` is emitted
    as the spec `@codeSystemVersion` (the parser's shallow translation read does not currently surface it, a
    pre-existing read scope, not a regression).
  - **Public surface:** no change: the existing optional `TerminologyAdapter.translate` is now consumed on
    the `buildCcda` / `BuildCcdaOptions.terminology` path; no new export, no warning-code change. Slice
    verified NOT REFUTED by the conformance-refuter gate.

- **Phase 7 (twenty-third slice): `editCcda` threads a bring-your-own terminology adapter into its
  final re-parse.** Closes the "editCcda-adapter-threading" boundary the twenty-first (terminology-adapter)
  slice deferred ("wiring the adapter into `editCcda`'s final re-parse is likewise deferred"). `parseCcda`
  and `buildCcda` already reach the semantic-validation tier: calling a consumer's
  `TerminologyAdapter.validateCode` on each recognized coded slot (problem, medication, allergen, route,
  vaccine) and raising `SEMANTIC_CODE_INVALID` on a negative verdict. But `editCcda` re-parsed its edited
  output with **no options**, so an edited document never reached that tier even when the caller held an
  adapter. This threads it through, mirroring the `buildCcda` pattern exactly.
  - **Opt-in, non-breaking.** `EditCcdaOptions` gains an optional `terminology?: TerminologyAdapter`;
    `editCcda`'s closing `parseCcda(serializeDocument(dom))` forwards it (`{ terminology }`) only when
    supplied. With no adapter the behavior is unchanged. The adapter is honored on both a stamped revision
    and an in-place (`revision: false`) edit.
  - **Surfaced, never coerced.** As on the parse and build paths, the adapter can only ever add a flag:
    `editCcda` emits every code **verbatim** (byte-faithful on untouched sections, spec-clean on the one it
    rebuilds), and a `{ result: false }` verdict raises `SEMANTIC_CODE_INVALID` with the code preserved and
    never rewritten. Validation runs over the **whole** edited document: a rejected code in an untouched
    section is flagged too, not only one in a grafted section. The flag stays PHI-free (slot name + code
    system OID, never the clinical code).
  - **Scope note.** The intermediate `parseSecureXml(...)` that recovers the DOM for surgery is
    deliberately left adapter-free: it re-reads the library's own already-clean source XML only to mutate
    it; semantic validation belongs on the **final** re-parse of the edited output, where `buildCcda` runs
    it too.
  - **Public surface:** additive optional `terminology` field on `EditCcdaOptions`. No warning-code change
    (`SEMANTIC_CODE_INVALID` already exists), no new type.
  - **Deferred (unchanged):** the adapter's optional `translate` (`$translate`) method remains defined but
    not consumed (emitting `<translation>` alternates is a later increment); entry-level append into a
    populated section, section removal, and subsection edits stay out of `editCcda`'s scope.

- **Phase 7 (twenty-first slice): bring-your-own terminology adapter (semantic-validation path).** A
  small, dependency-free `TerminologyAdapter` interface a consumer implements over their own **licensed**
  terminology service, wired into the parser's code-system recognition so `parseCcda(xml, { terminology })`
  and `buildCcda(init, { terminology })` reach the semantic-validation tier that structural recognition
  (`checkCodeSlot`) deliberately cannot: confirming a code is a real member of its system. `@cosyte/ccda`
  **imports no terminology library** (it stays a zero-dep-beyond-`@xmldom/xmldom` sibling); it only calls
  the adapter you supply, and only when supplied. The shape mirrors the FHIR Terminology Module
  (`$validate-code`, `$translate`) and the sibling `@cosyte/terminology` engine, so that engine (or a
  UMLS / VSAC service) can be wired in behind it.
  - **Opt-in, non-breaking.** With no adapter the behavior is unchanged (structural recognize-only, no new
    warning). `validateCode` runs for each recognized coded slot (problem, medication, allergen, route,
    vaccine) that carries both a `@code` and a `@codeSystem`.
  - **Fail-safe: surfaced, never coerced.** A verdict of `{ result: false }` raises the new stable
    warning `SEMANTIC_CODE_INVALID` with the code **preserved verbatim**: the value is never rewritten to
    a "corrected" code, and the adapter's advisory `display` is never applied back onto the document. An
    adapter can therefore never silently change a safety-critical code; it can only add a flag. A verdict
    of `undefined` ("no opinion", e.g. the system is outside the adapter's coverage) is silent, so a
    partial-coverage adapter adds no noise. The builder still emits every code verbatim and surfaces the
    flag on the re-parsed document: validation _on build_, never mutation.
  - **PHI-free.** The `SEMANTIC_CODE_INVALID` message carries only the slot name and the code-system OID
    (structural identifiers, as the existing `UNEXPECTED_CODE_SYSTEM` / `DEPRECATED_CODE_SYSTEM` factories
    do), never the specific clinical code, nor the adapter's free-text `message` / `display`.
  - **Public surface:** `TerminologyAdapter`, `TerminologyCoding`, `CodeValidationResult`,
    `CodeTranslationResult`, `BuildCcdaOptions`, the `SEMANTIC_CODE_INVALID` warning code + its
    `semanticCodeInvalid` factory, and the new optional `terminology` field on `ParseCcdaOptions` /
    `BuildCcdaOptions`.
  - **Deferred (stated):** the interface's optional `translate` (`$translate`) method is **defined but not
    yet consumed**: emitting `<translation>` alternates from an adapter is a later increment; wiring the
    adapter into `editCcda`'s final re-parse is likewise deferred. `TerminologyCoding.system` is the C-CDA
    `@codeSystem` OID (not a canonical URI); a consumer bridges OID→URI inside their adapter (e.g. via
    `@cosyte/terminology`'s `resolveSystem`). Slice verified NOT REFUTED by the conformance-refuter gate.

- **Phase 7 (twentieth slice): `editCcda`: the read→edit→write loop (C-CDA document editing).** A
  third emit-side primitive alongside `parseCcda` (read) and `buildCcda` (construct): it takes a
  document already produced by `parseCcda` and re-emits it with a section **added** or **replaced**,
  returning the re-parsed `CcdaDocument`, so `parseCcda(editCcda(parseCcda(xml), …).toString())`
  round-trips. Grounded firsthand against CDA R2 (the `ClinicalDocument` XSD sequence in
  `HL7/CDA-core-2.0 POCD_MT000040.xsd`) and the HL7 C-CDA-Examples "Parent Document Replace
  Relationship" sample.
  - **Byte-faithful on untouched sections.** The edit is DOM surgery on the document the parser
    actually read (recovered from the serialized snapshot every parsed document retains), not a
    reconstruction from the lossy read-model, so every section, entry, attribute, namespace
    declaration, and even content this library never models survives an edit verbatim; only the one
    targeted section is rebuilt. The replacement section is emitted through the **same per-section
    emitters `buildCcda` uses** (a new internal `buildSectionComponent` dispatcher over the twelve
    single-list section kinds), so it carries identical templateIds, LOINC code, SHALL
    `effectiveTime`, and narrative/entry agreement, and re-parses with zero new warnings. Narrative
    `ID`s in a grafted section are renumbered to never collide with an existing `ID` (which would make
    a `<reference value="#id">` ambiguous).
  - **Fail-safe.** An edit never silently drops or corrupts an unedited section; an empty content
    list yields that section's spec-clean `nullFlavor="NI"` shell, never fabricated entries; and an
    edit that would drop a per-document-type SHALL required section throws a typed `CcdaEditError`
    (`REQUIRED_SECTION_MISSING`) instead of emitting an invalid document. `add`/`replace`/`upsert`
    modes throw `SECTION_ALREADY_PRESENT` / `SECTION_ABSENT` on a precondition violation rather than a
    silent no-op or duplicate section; every builder guard (an invalid HL7 timestamp, a resolved
    problem without a resolution date) still throws.
  - **CDA R2 revision provenance.** By default an edit produces a _revision_: a new
    `ClinicalDocument.id`, the **same** `setId` that identifies the version series (minted when the
    source has none), an incremented `versionNumber`, and a `relatedDocument typeCode="RPLC"` whose
    `parentDocument` names the prior version (with the same `setId` and the prior `versionNumber`),
    the replacement relationship shown in the HL7 sample. New header elements are inserted at their
    CDA R2 XSD sequence positions (`setId`/`versionNumber` after `languageCode`, before
    `recordTarget`; `relatedDocument` after `documentationOf`, before `componentOf`/`component`).
    Chained edits keep the series `setId`, bump the version, and point at the immediate parent (the
    source's own parent link is superseded, not accumulated). Pass `revision: false` to edit in place.
  - **Parser surfaces the revision chain.** The header model now reads `setId`, `versionNumber`, and
    `relatedDocuments` (`RelatedDocument` → `ParentDocument`), so a revision is observable through the
    public parse API, not just written.
  - **Public surface:** `editCcda`, `CcdaEditError`, and the types `EditCcdaOptions`, `SectionEdit`,
    `SectionEditMode`, `RevisionInit`, `DocumentIdInit`, `CcdaEditErrorCode`, `EditableSectionKind`,
    plus `RelatedDocument` / `ParentDocument` on `CcdaHeader`.
  - **Deferred (stated boundaries):** entry-level append into an existing populated section while
    byte-preserving its other entries (needs DOM entry splicing the lossy read-model can't drive:
    supply the full new entry set via a section `replace` instead); the compound Functional/Mental
    Status sections (three content arrays each) and narrative-only sections as edit targets; section
    _removal_; subsection-level edits; and the addendum (`APND`) / transform (`XFRM`) relationships.
- **Phase 7 (nineteenth slice): the v3 `TS` datetime grammar now requires a time-of-day before a
  fractional-second or timezone offset, closing a dropped-dash misparse.** `parseV3DateTime` /
  `TS_RE` (`src/model/types/_shared.ts`) previously let a `.fraction` or a `±ZZZZ` offset hang on a
  bare year/month/day value with no intervening time components. The effect was a **silent
  misparse**: a dropped-dash ISO date like `"2026-0721"` (one dash removed from `"2026-07-21"`) was
  read as year `2026` carrying a `-07:21` offset (i.e. `2026-01-01T07:21Z`) instead of being
  rejected; likewise `"2026+0500"`, `"202607.5"`, `"20260721.5"`, and `"20260721-0500"`. The grammar
  is tightened to the canonical CDA R2 / HL7 v3 `TS` literal `YYYYMMDDHHMMSS.UUUU[±ZZzz]` (and the
  ISO 8601 it derives from, where a decimal fraction and a zone designator attach to a **time**
  component, never to a bare date): a fraction/offset is accepted only once the **hour** is present.
  Such inputs now surface `MALFORMED_DATETIME` on parse (raw preserved, `date` left `undefined`) and
  **throw a `TypeError` at build time**: because the builder's `assertHl7Ts` (eighteenth slice)
  delegates to this one grammar, the fix tightens both the parser and the builder from a single edit.
  - **Every legitimate value is preserved byte-for-byte**: valid partial-precision dates (`YYYY`,
    `YYYYMM`, `YYYYMMDD`), full timestamps, real `±ZZZZ` offsets on a time-of-day, and fractional
    seconds on a full timestamp all parse exactly as before; only the "offset/fraction on a value
    missing its time components" case changes, from silent-misparse to a surfaced rejection.
  - No warning-code change and no public-surface change; the capture-group layout is unchanged, so no
    call site is affected. Regression tests cover the `"2026-0721"`-class input on both the parse
    (`parseV3DateTime`, `parseTs` → `MALFORMED_DATETIME`) and build (`assertHl7Ts` → `TypeError`) paths.
- **Phase 7 (eighteenth slice): a shared HL7 v3 TS date-format validator guards every builder date
  input.** Until now the builder emitted every caller-supplied date string _verbatim_ into
  `<effectiveTime>`/`low`/`high`/`value`/`birthTime`, so a malformed input (`"2026-07-21"` with dashes,
  `"July 2026"`, or a calendar-invalid `"20260230"`) would silently serialize a schema-invalid,
  potentially clinically-misread timestamp. A new single-source guard (`src/builder/hl7-ts.ts`,
  `assertHl7Ts`) now validates every date the builder emits: it accepts the HL7 v3 TS literal
  `YYYY[MM[DD[HHMMSS[.S][±ZZZZ]]]]`, including legitimate **partial precision** (`YYYY`, `YYYYMM`,
  `YYYYMMDD`) and an optional fractional-second and `±ZZZZ` offset, and on a malformed input **throws
  a `TypeError` at build time** rather than emit, guess, or coerce an invalid date (fail loud).
  - **Single source of truth = the parser's grammar.** Acceptance is delegated to the parser's existing
    `parseV3DateTime` (`src/model/types/_shared.ts`, the sole v3 TS grammar in the library), so the
    builder emits _exactly_ the set of timestamps `parseCcda` reads back cleanly: every date it accepts
    round-trips without a `MALFORMED_DATETIME` warning, and no second, drift-prone grammar is introduced.
  - **Wired through every date-emission site**, enumerated so none is missed: patient + family-member
    `birthTime`; the document `effectiveTime`; problem/allergy concern `low` (onset) + `high` (resolution);
    the Medication Activity `IVL_TS` duration `low`/`high`; result & vitals organizers + observations;
    immunization; procedure; encounter period `low`/`high`; smoking/social history; functional & mental
    status observations + organizers; assessment scale; past medical history; plan of treatment; and the
    family-history observation `effectiveTime`. Physical-quantity fields (age, dosing-frequency `PIVL_TS`
    period, reference ranges) are deliberately untouched: they are `PQ`, not `TS`.
  - No warning-code change and no public-surface change; the guard is internal and rejects only inputs
    that were already schema-invalid to emit.
- **Phase 7 (seventeenth slice): the builder accepts caller-supplied problem/allergy resolution +
  onset dates.** A resolved Problem or Allergy concern can now carry a _real_ resolution date on its
  `effectiveTime/high` instead of only `nullFlavor="UNK"`. `BuildCcdaProblem` gains a `resolution`
  field (it already had `onset`); `BuildCcdaAllergy` gains **both** `onset` and `resolution` (it
  previously had neither, so every emitted allergy concern was forced to a `nullFlavor="UNK"` `low`).
  When supplied, `onset` fills the SHALL `effectiveTime/low` and `resolution` fills the `effectiveTime/high`
  on both the Concern Act and its nested observation; both round-trip through `parseCcda` as the concern's
  (and the Problem Observation's) `effectiveTime` `low`/`high`.
  - **The `high` is emitted only for a `status: "resolved"` concern**, because its mere presence asserts
    resolution. Traced firsthand to the C-CDA R2.1 Problem Observation (`2.16.840.1.113883.10.20.22.4.4`)
    rule: _"the existence of a high element within a problem does indicate that the problem has been
    resolved"_ (`effectiveTime/high` [0..1], the "resolution date"; `effectiveTime/low` [1..1], the
    Concern Act `low` under CONF:1198-7504). Emitting a resolution date on a still-active problem would
    falsely signal resolution, so `buildCcda` **throws a `TypeError`** when a `resolution` is supplied
    without `status: "resolved"` rather than emit a self-inconsistent document.
  - **Never a fabricated date.** A resolved concern whose resolution date is unknown still emits the
    `nullFlavor="UNK"` `high` (the SHALL form, unchanged); an absent onset stays `nullFlavor="UNK"` `low`.
    An active concern emits no `high` at all. The Past Medical History section (bare Problem Observations)
    benefits automatically: a resolved historical problem now carries its resolution date.
  - No warning-code change; additive to `BuildCcdaProblem` / `BuildCcdaAllergy` only.
- **Phase 7 (fifteenth slice): the Referral Note SHALL set now asserts Reason for Referral.**
  Reconciles the parser's per-document-type required-section (SHALL) table with the section catalog the
  fourteenth slice expanded. That slice made the **Reason for Referral** Section a recognized catalog key
  but explicitly left the required-section table untouched; the Referral Note document
  (`2.16.840.1.113883.10.20.22.1.14`) SHALL contain a Reason for Referral Section, so a Referral Note that
  omits it is non-conformant. The `referralNote` SHALL set becomes
  `["allergies", "medications", "problems", "reasonForReferral"]`: a Referral Note missing that section now
  raises a `REQUIRED_SECTION_MISSING` **warning** (never a fatal; a missing section still never blocks
  reading the data that is present), while the builder's own Referral Note (which always emits the section)
  stays warning-free. Traced firsthand to the **normative C-CDA R2.1 Schematron** (the 1,010,531-byte
  `HL7/CDA-ccda-2.1` validation `.sch`): the Referral Note document pattern asserts Problem
  (CONF:1198-29087), Allergies (-30912), Medications (-30923), and Reason for Referral (-30925) as SHALL.
  Deliberately still omitted, per the table's conservative design: the **Assessment/Plan choice**
  (CONF:1198-29102, a choice constraint) and **Results** / **Plan of Treatment** (CONF:1198-29090 / -29066,
  SHOULD, not SHALL; the build.fhir.org StructureDefinition's `payers`/`plan` `min=1` was confirmed to be
  drift from the normative Schematron and is not encoded). No public-API or warning-code change; the
  `requiredSectionKeys("referralNote")` / `missingRequiredSections(...)` accessors reflect the new entry.
- **Phase 7 (fourteenth slice): builder emits a second C-CDA document type, the Referral Note.**
  Establishes the **multi-document-type pattern** in `buildCcda`: it now emits either a **CCD** (default) or
  a **Referral Note** (`documentType: "referralNote"`), each with its own US Realm Header specialization and
  document-type-specific SHALL section set. Previously the builder emitted only a CCD and threw for the
  other eleven types while `parseCcda` already read all twelve. This closes the first of that asymmetry.
  Confirmed firsthand against the C-CDA R2.1 IG document-level StructureDefinition
  (`2.16.840.1.113883.10.20.22.1.14`) and the **CC0** `onc-healthit/2015-certification-ccda-testdata` ToC
  Referral Note certification sample (`170.315_b1_toc_amb_rn_r21_sample1`). A clean Referral Note build
  carries **zero warnings** and round-trips through `parseCcda` fixed-point, exactly like a CCD.
  - **Header specialization.** The Referral Note carries the document `templateId` root
    `2.16.840.1.113883.10.20.22.1.14` (R2.1 `2015-08-01` stamp) and LOINC document `code` `57133-1`
    "Referral Note". A `DOC_TYPE_SPECS` table drives the header + SHALL section set per type, so the two
    document types share one emit path.
  - **Referral Note SHALL section set (always emitted).** The entries-required **Problems**, **Allergies**,
    and **Medications** (each an empty `nullFlavor="NI"` section when unpopulated, the entries-required
    `.X.1` templateId correctly dropped); the narrative **Reason for Referral** (V2,
    `1.3.6.1.4.1.19376.1.5.3.1.3.1`, `@extension 2014-06-09`, LOINC `42349-1`); the narrative **Assessment**
    (`…22.2.8`, LOINC `51848-0`), **unversioned** in R2.1, so emitted **root-only with no `@extension`**;
    and **Plan of Treatment** (`…22.2.10`, `@extension 2014-06-09`, LOINC `18776-5`). Assessment + Plan of
    Treatment satisfy the document's "Assessment and Plan (V2) OR (Assessment + Plan of Treatment)" SHALL
    choice via the two-section branch.
  - **Results and Vital Signs are not Referral Note SHALL sections** (`0..1` in the IG), unlike in a CCD,
    where the builder always emits them, a Referral Note emits them only when populated, never a fabricated
    empty one. Nothing clinical is fabricated: unpopulated SHALL sections are explicit empties, and the
    narrative sections carry only caller-supplied text.
  - **Parser (recognition).** The section catalog gains a `reasonForReferral` entry (LOINC `42349-1`,
    template root `1.3.6.1.4.1.19376.1.5.3.1.3.1`) so the emitted section is recognized (no
    `UNKNOWN_SECTION_CODE`) and the Referral Note round-trips warning-free. Purely additive: no change to
    any document type's required-section table; **CCD emit is byte-unchanged** (same SHALL sections, order,
    templateIds, codes).
  - **Public surface.** `BuildCcdaInit.documentType` widens to `"ccd" | "referralNote"`, and `BuildCcdaInit`
    gains optional `assessment` and `reasonForReferral` narrative strings (ignored for a CCD). No
    warning-code change. **Deferred:** the remaining ten document types; C-CDA document editing; the
    bring-your-own-credentials terminology adapter; the external-validator/Schematron differential gate.
- **Phase 7 (thirteenth slice): parser reads + builder emits direct-entry Assessment Scale Observations.**
  A **coordinated parser + builder increment** for the **Assessment Scale Observation** (`…22.4.69`) and its
  **Assessment Scale Supporting Observation** (`…22.4.86`), formal scored instruments (a PHQ-9 depression
  screen, a Glasgow Coma scale, a Barthel index) in the Functional Status and Mental Status sections.
  Verified firsthand against the C-CDA R2.1 Schematron (`HL7/cda-ccda-2.1`, CONF:81-14434…19088) and the two
  HL7 CC0 R2.1 examples (PHQ-9, Glasgow Coma): C-CDA R2.1 carries the Assessment Scale Observation as a
  **direct section entry**, **not** as a Functional/Mental Status Organizer member, the placement the
  twelfth slice deferred here. A clean build carries **zero warnings** and the serializer fixed point holds.
  - **Parser (read).** `extractFunctionalStatus` / `extractMentalStatus` now read a **direct-entry**
    Assessment Scale Observation (`…22.4.69`) as a `StatusObservation` flagged `assessmentScale: true`. Its
    **domain is the carrying section's**: gated on the section's own templateId root or LOINC section code,
    since the same OID appears in both sections, so a scale in one section is never pulled into the other
    domain; a scale in a section that is neither is not read (its domain is unknowable, never guessed). The
    lenient organizer-member reading is retained (Postel's Law). The scale's scored components
    (`…22.4.86`) are read into a new `SupportingObservation[]` on `StatusObservation.supporting`, so scale
    detail is never dropped.
  - **New `integer` observation-value kind.** `ObservationValue` gains
    `{ kind: "integer"; value?: number; nullFlavor?: string }` for `<value xsi:type="INT">`: the type
    C-CDA prefers for a questionnaire score (units are not allowed on an `INT`). `value` and `nullFlavor`
    are kept distinct: an explicit-unknown score is never collapsed into a real one.
  - **Builder (emit).** Two new optional `BuildCcdaInit` inputs, `functionalStatusScales` and
    `mentalStatusScales` (`BuildCcdaAssessmentScale[]`), emit direct-entry Assessment Scale Observations.
    Each carries the **bare-root** templateId `…22.4.69` (R2.1 SHALL: `@root` with **no** `@extension`,
    CONF:81-14436/14437), a SHALL `id`, the scale `code` (LOINC default), a SHALL `statusCode` (`completed`),
    the SHALL `effectiveTime` [1..1], and the SHALL `value` [1..1] as the total score `xsi:type="INT"`.
    Supporting components are optional Assessment Scale Supporting Observations (`…22.4.86`, bare root)
    grouped by `entryRelationship typeCode="COMP"`, each with its own SHALL `value` [1..*] INT score.
  - **The score is never fabricated (the safety rule).** An omitted total or item score is
    `value nullFlavor="UNK"`: an explicit unknown read back as an `integer` value with no number, never a
    guessed 0; an omitted `effectiveTime` is `nullFlavor="UNK"`; `interpretation` and `supporting` items are
    emitted only when supplied.
  - **The two domains are never conflated (the safety rule).** Only the carrying section's templates are
    emitted, so each scale reads back tagged `domain: "functional"` or `"mental"` from its section, proven
    by a both-sections round-trip. Emitted only when populated (the status sections are CCD `SHOULD`).
  - New public types: `BuildCcdaAssessmentScale`, `BuildCcdaAssessmentScaleItem`, `SupportingObservation`.
    No warning-code change; the round-trip-by-construction invariant and the serializer fixed point hold.
  - **Deferred:** the supporting observation's optional second `CO`/`CD` coded answer and `IVL_INT`
    reference range (both tolerated on parse, read without warning, but not yet modeled); the organizer's
    own `code`/`effectiveTime` on parse; the other eleven document types; C-CDA document editing; the
    bring-your-own-credentials terminology adapter; and the external-validator/Schematron differential gate.
- **Phase 7 (twelfth slice): builder emits Functional/Mental Status Organizers.** Extends `buildCcda`
  with two new optional inputs, `BuildCcdaInit.functionalStatusOrganizers`
  (`BuildCcdaFunctionalStatusOrganizer[]`) and `BuildCcdaInit.mentalStatusOrganizers`
  (`BuildCcdaMentalStatusOrganizer[]`), that **group** related status findings under one organizer, the
  complement to the standalone Functional/Mental Status Observations shipped in the seventh/eighth slices.
  Grouped members round-trip through `getFunctionalStatus()` / `getMentalStatus()` to the same structured,
  domain-tagged findings by construction; a clean build still carries **zero warnings**.
  - **Functional Status Organizer + Mental Status Organizer.** A Functional Status Organizer **`…22.4.66`**
    (the **`2014-06-09`** stamp) or Mental Status Organizer **`…22.4.75`** (the **`2015-08-01`** stamp) is
    emitted as `<organizer classCode="CLUSTER" moodCode="EVN">` in its status section, carrying a SHALL `id`,
    a `code` (SHOULD ICF `2.16.840.1.113883.6.254` or LOINC: SHALL [1..1] for the Functional Status
    Organizer, [0..1] for the Mental Status Organizer with its "at least one of code or effectiveTime" floor;
    caller-supplied, else an explicit `nullFlavor="UNK"` category), a SHALL `statusCode` (`completed`), an
    optional `effectiveTime` [0..1], and
    one or more `component` members. Each member is a Functional Status Observation **`…22.4.67`** or Mental
    Status Observation **`…22.4.74`**, byte-identical to the standalone builders (shared code path), so a
    grouped finding reads back with its fixed observation `code` (LOINC `54522-8` / SNOMED CT `373930000`)
    and coded finding `value` intact. Element order follows the CDA organizer schema (`templateId, id, code,
statusCode, effectiveTime, component+`).
  - **No clinical value, category, or date is ever fabricated (the safety rule).** An omitted organizer
    `code` is an explicit `nullFlavor="UNK"` (never a guessed categorization); an omitted organizer
    `effectiveTime` is simply not emitted (an optional element, never a fabricated date); an omitted finding
    `value` stays `nullFlavor="UNK"`. An organizer with zero findings is a `TypeError`: the template SHALL
    contain at least one member, so a zero-member organizer is never emitted.
  - **Functional and mental status are never conflated (the safety rule).** Only each domain's own organizer
    and observation templates are emitted, so a functional finding is never filed under mental status (or
    vice versa); grouped and standalone findings coexist in one section and all read back correctly
    domain-tagged.
  - **Emitted only when populated.** The status sections are CCD `SHOULD` (not `SHALL`) sections, emitted
    when either the standalone findings or the organizers are non-empty; an unpopulated section is not
    fabricated. The empty-build output is unchanged.
  - New public types: `BuildCcdaFunctionalStatusOrganizer` and `BuildCcdaMentalStatusOrganizer`. No parser
    change and no warning-code change; the round-trip-by-construction invariant and the serializer fixed
    point still hold.
  - **Deferred:** the **Assessment Scale Observation** (`…22.4.69`) and Assessment Scale Supporting
    Observation (`…22.4.86`): in C-CDA R2.1 the Assessment Scale Observation is a _direct section entry_ of
    the Functional/Mental Status Section, **not** a component of the organizer, and the current parser reads
    assessment scales only as organizer members; shipping it conformantly needs a coordinated parser
    increment (read a direct-entry assessment scale by its section's domain), so it is deferred. Also
    deferred: capturing the organizer's own `code`/`effectiveTime` on parse (members round-trip; the wrapper
    metadata does not yet), the Self-Care Activities organizer member (`…22.4.128`), the other eleven
    document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.

- **Phase 7 (eleventh slice): builder emits a Family History section.** Extends `buildCcda` with one new
  optional input, `BuildCcdaInit.familyHistory` (`BuildCcdaFamilyHistory[]`), that round-trips through
  `getFamilyHistory()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Family History section + organizer + observation.** A Family History Section (V3) **`…22.2.15`**
    (LOINC `10157-6`, the **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so only
    the base `templateId` is emitted) carries one or more Family History Organizers **`…22.4.45`**: one
    per relative (`<organizer classCode="CLUSTER">`), each with a SHALL `id`, SHALL `statusCode`
    (`completed`), and a SHALL `subject/relatedSubject` (`@classCode="PRS"`) naming the family member:
    a coded `relationship` (SNOMED CT by default, e.g. `72705000` mother / `9947008` father, overridable
    to HL7 RoleCode), plus the MAY `administrativeGenderCode`, `birthTime`, and `sdtc:deceasedInd` flag.
    Under it, each condition is a Family History Observation **`…22.4.46`** with the SHALL fixed `code`
    (SNOMED CT `64572001` "Condition"), a SHALL `statusCode`, the SHOULD [0..1] `effectiveTime`, and the
    SHALL coded `value` (the illness); a condition MAY nest an Age Observation **`…22.4.31`** (age at onset,
    a `PQ` in UCUM years) and a Family History Death Observation **`…22.4.47`** (cause of death).
  - **No clinical value, date, or relation is ever fabricated (the safety rule).** An unknown relationship
    is `relatedSubject/code nullFlavor="UNK"` and an unknown condition is `value nullFlavor="UNK"`: an
    explicit unknown, never guessed. The MAY demographics, the Age/Death sub-observations, and the SHOULD
    `effectiveTime` are each emitted only when supplied.
  - **Conditions are grouped by relative, never flattened.** Each relative's identity rides once on its
    organizer, so every condition reads back under its relative via `getFamilyHistory()`. The section
    narrative reads each condition's `relative: illness` label (`#id`-referenced), agreeing with the
    reconciled `value`, so no `CODE_NARRATIVE_MISMATCH` fires.
  - **Emitted only when populated.** Family History is a CCD `SHOULD` (not `SHALL`) section, so (like the
    other optional sections) an unpopulated section is **not** fabricated. The empty-build output is
    unchanged.
  - New public types: `BuildCcdaFamilyHistory` and its members `BuildCcdaFamilyMember` /
    `BuildCcdaFamilyHistoryObservation`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms in the builder, the other
    eleven document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and
    the external-validator/Schematron differential-testing gate.

- **Phase 7 (tenth slice): builder emits a Plan of Treatment section.** Extends `buildCcda` with one new
  optional input, `BuildCcdaInit.planOfTreatment` (`BuildCcdaPlannedItem[]`), that round-trips through
  `getPlannedItems()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Plan of Treatment section + the six planned-entry templates.** A Plan of Treatment Section (V2)
    **`…22.2.10`** (LOINC `18776-5`, the **`2014-06-09`** stamp, which has **no** entries-required `.1`
    variant, so only the base `templateId` is emitted) carries one or more of the six planned templates,
    each the **`2014-06-09`** stamp: Planned Act **`…22.4.39`** (`<act>`), Planned Encounter **`…22.4.40`**
    (`<encounter>`), Planned Procedure **`…22.4.41`** (`<procedure>`), Planned Medication Activity
    **`…22.4.42`** (`<substanceAdministration>`, drug in the `consumable`, no direct `<code>`), Planned
    Supply **`…22.4.43`** (`<supply>`), and Planned Observation **`…22.4.44`** (`<observation>`, carrying an
    optional expected `value`). Each emits a SHALL `id`, its coded order (default code system by kind:
    SNOMED CT for act/procedure/supply, CPT for encounter, LOINC for observation, RxNorm for medication), a
    planned `@moodCode`, and the SHALL `statusCode` fixed to `active`.
  - **Planned is never conflated with performed (the safety rule).** No variant admits the performed `EVN`
    mood, and `statusCode` is fixed to `active` (never a performed `completed`), so every entry reads back
    as `disposition: "planned"`, never mistaken for a performed Procedure/Encounter; a build carrying both
    a performed and a planned procedure keeps them in `getProcedures()` vs `getPlannedItems()`.
  - **The planned `@moodCode` domain is correct by construction.** `BuildCcdaPlannedItem` is a per-kind
    discriminated union: act/encounter/procedure accept the appointment moods `APT`/`ARQ`
    (`PlannedActMood`), while medication/supply/observation accept only `INT`/`RQO`/`PRMS`/`PRP`
    (`PlannedOrderMood`), because the base CDA R2 domains `x_DocumentSubstanceMood` /
    `x_ActMoodDocumentObservation` exclude `APT`/`ARQ`. A schema-invalid appointment mood on a drug order or
    a lab is not representable: the type prevents it, not merely discourages it.
  - **Optional data is never fabricated.** The planned `effectiveTime` (SHOULD [0..1]) and the Planned
    Observation's expected `value` [0..1] are emitted only when supplied: an undated plan carries no
    fabricated date and no invented result. The section narrative agrees with each item's reconciled `code`
    (`#id`-referenced), so no `CODE_NARRATIVE_MISMATCH` fires.
  - **Emitted only when populated.** Plan of Treatment is a CCD `SHOULD` (not `SHALL`) section, so (like
    the other optional sections) an unpopulated section is **not** fabricated. The empty-build output is
    unchanged.
  - New public types: `BuildCcdaPlannedItem` and its members `BuildCcdaPlannedAct` / `BuildCcdaPlannedOrder`
    / `BuildCcdaPlannedObservation`, plus `PlannedActMood` / `PlannedOrderMood`. No parser change and no
    warning-code change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms and the Family History
    section in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own-credentials terminology adapter, and the external-validator/Schematron
    differential-testing gate.

- **Phase 7 (ninth slice): builder emits a Past Medical History section.** Extends `buildCcda` with one
  new optional input, `BuildCcdaInit.pastMedicalHistory` (`BuildCcdaProblem[]`, reusing the Problems
  input shape), that round-trips through `getPastMedicalHistory()` to the same structured content by
  construction; a clean build still carries **zero warnings**.
  - **Past Medical History section + bare Problem Observation.** A Past Medical History section
    **`…22.2.20`** (LOINC `11348-0`, the V3 **`2015-08-01`** stamp, which has **no** entries-required `.1`
    variant, so only the base `templateId` is emitted) carries one or more historical problems as **bare**
    Problem Observations **`…22.4.4`** (the **`2015-08-01`** stamp) directly under each `<entry>`, **not**
    wrapped in a Problem Concern Act (`…22.4.3`) the way the Problems section nests them. The bare
    observation build is now shared verbatim with the Problems section, mirroring the parser's own reuse
    (`buildProblem` serves both `getProblems` and `getPastMedicalHistory`). Each observation emits the
    fixed SNOMED CT `code` (`55607006` "Problem"), a SHALL `statusCode` (fixed `completed`), a SHALL
    `effectiveTime` [1..1] (onset as `low`; a `nullFlavor="UNK"` `high` for a resolved problem), and the
    SHALL `value` [1..1] carrying the coded condition (SNOMED CT / ICD-10-CM).
  - **A past illness is never double-counted as an active problem concern (the safety rule).** The
    extractors route on structure: a bare observation to `getPastMedicalHistory`, a concern-act-wrapped
    one to `getProblems`, so a resolved past problem never reads back as an active concern (or vice
    versa); a build carrying both keeps them in their respective accessors.
  - **Onset/resolution are never fabricated.** A supplied onset is the `effectiveTime/low`; an absent
    onset is an explicit `nullFlavor="UNK"` `low`; a resolved-but-date-unknown problem adds a
    `nullFlavor="UNK"` `high`, never a guessed date.
  - **Emitted only when populated.** Past Medical History is not a CCD `SHALL` section, so (like the other
    optional sections) an unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - No new public type (reuses `BuildCcdaProblem`). No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms, and the remaining
    sections (Plan of Treatment / Family History) in the builder, the other eleven document types, C-CDA
    document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.

- **Phase 7 (eighth slice): builder emits a Mental Status section.** Extends `buildCcda` with one new
  optional input, `BuildCcdaInit.mentalStatus` (`BuildCcdaMentalStatus[]`), that round-trips through
  `getMentalStatus()` to the same structured content by construction; a clean build still carries **zero
  warnings**.
  - **Mental Status section + Mental Status Observation.** A Mental Status section **`…22.2.56`** (LOINC
    `10190-7`, the V2 **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so only the
    base `templateId` is emitted) carries one or more standalone Mental Status Observations **`…22.4.74`**
    (the **`2015-08-01`** stamp). Unlike Functional Status (`2014-06-09`), the Mental Status templates were
    **new in the R2.1 August 2015 errata**, split out of Functional Status, hence the later stamp. Each
    observation emits the R2.1 template-**fixed** SNOMED CT `code` (`373930000` "Cognitive function
    finding"), a SHALL `statusCode` (fixed `completed`), a SHALL `effectiveTime` [1..1] (the assessed time;
    `nullFlavor="UNK"` when unknown), and the SHALL **SNOMED CT** `value` [1..1] carrying the specific
    cognition/mood finding.
  - **Mental and functional status are never conflated (the safety rule).** Only Mental Status templates
    are emitted here, and the two extractors key off their distinct observation roots (`…22.4.67` vs
    `…22.4.74`), so the parser reads every finding back tagged **`domain: "mental"`**, a mental finding is
    never filed under Functional Status (or vice versa).
  - **Unknown is never defaulted to a finding.** When the caller supplies no `value`, the SHALL `value` is
    emitted as an **explicit `nullFlavor="UNK"`**: never invented as a real finding; the SHALL
    `effectiveTime` is likewise `nullFlavor="UNK"` when no assessed time is given, never a fabricated date.
  - **Emitted only when populated.** Mental Status is not a CCD `SHALL` section, so (like Functional Status
    / Immunizations / Procedures / Encounters / Social History) an unpopulated section is **not**
    fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaMentalStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the Functional/Mental Status Organizer + Assessment Scale forms, and the remaining
    sections (Plan of Treatment / Family History / Past Medical History) in the builder, the other eleven
    document types, C-CDA document _editing_, the bring-your-own-credentials terminology adapter, and the
    external-validator/Schematron differential-testing gate.
- **Phase 7 (seventh slice): builder emits a Functional Status section.** Extends `buildCcda` with
  one new optional input, `BuildCcdaInit.functionalStatus` (`BuildCcdaFunctionalStatus[]`), that
  round-trips through `getFunctionalStatus()` to the same structured content by construction; a clean
  build still carries **zero warnings**.
  - **Functional Status section + Functional Status Observation.** A Functional Status section
    **`…22.2.14`** (LOINC `47420-5`, the V2 **`2014-06-09`** stamp, which has **no** entries-required
    `.1` variant, so only the base `templateId` is emitted) carries one or more standalone Functional
    Status Observations **`…22.4.67`** (the **`2014-06-09`** stamp). Each observation emits the
    template-**fixed** LOINC `code` (`54522-8` "Functional status"), a SHALL `statusCode` (fixed
    `completed`), a SHALL `effectiveTime` [1..1] (the assessed time; `nullFlavor="UNK"` when unknown),
    and the SHALL **SNOMED CT** `value` [1..1] carrying the specific finding.
  - **Functional and mental status are never conflated (the safety rule).** Only Functional Status
    templates are emitted, so the parser reads every finding back tagged **`domain: "functional"`**, a
    functional finding is never filed under Mental Status (`getMentalStatus()` stays empty).
  - **Unknown is never defaulted to a finding.** When the caller supplies no `value`, the SHALL `value`
    is emitted as an **explicit `nullFlavor="UNK"`**: never invented as a real finding; the SHALL
    effectiveTime is likewise `nullFlavor="UNK"` when no assessed time is given, never a fabricated date.
  - **Emitted only when populated.** Functional Status is not a CCD `SHALL` section (the CCD required set
    is Allergies / Medications / Problems / Results), so (like Immunizations / Procedures / Encounters /
    Social History) an unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaFunctionalStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** Mental Status, the Functional/Mental Status Organizer + Assessment Scale forms, and the
    remaining sections (Plan of Treatment / Family History / Past Medical History / …) in the builder,
    the other eleven document types, C-CDA document _editing_, the bring-your-own-credentials
    terminology adapter, and the external-validator/Schematron differential-testing gate.

- **Phase 7 (sixth slice): builder emits a Social History (Smoking Status) section.** Extends
  `buildCcda` with one new optional input, `BuildCcdaInit.smokingStatus` (`BuildCcdaSmokingStatus[]`),
  that round-trips through `getSmokingStatus()` to the same structured content by construction; a
  clean build still carries **zero warnings**.
  - **Social History section + Smoking Status observation.** A Social History section **`…22.2.17`**
    (LOINC `29762-2`, the V3 **`2015-08-01`** stamp, which has **no** entries-required `.1` variant, so
    only the base `templateId` is emitted) carries one or more Smoking Status (Meaningful Use)
    observations **`…22.4.78`** (the **`2014-06-09`** stamp). Each observation emits the fixed LOINC
    `code` (`72166-2` "Tobacco smoking status"), a SHALL `statusCode`, a SHALL `effectiveTime` (the
    recorded time; `nullFlavor="UNK"` when unknown), and the SHALL **SNOMED CT** `value` from the
    Current Smoking Status value set.
  - **Unknown is never defaulted to a status (the safety rule).** When the caller supplies no `value`,
    the SHALL `value` is emitted as an **explicit `nullFlavor="UNK"`**, read back by the parser as
    `unknown: true` and flagged `SMOKING_STATUS_UNKNOWN`, **never** invented as a "never smoker" (or any
    other) reading. Absent status ≠ non-smoker; `nullFlavor` and a real coded value are never conflated.
  - **Emitted only when populated.** Social History is not a CCD `SHALL` section (the CCD required set is
    Allergies / Medications / Problems / Results), so (like Immunizations / Procedures / Encounters) an
    unpopulated section is **not** fabricated. The empty-build output is unchanged.
  - New public type `BuildCcdaSmokingStatus`. No parser change and no warning-code change; the
    round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Plan of Treatment / Functional Status / Family History / Past
    Medical History / …) in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own terminology adapter, and the external Schematron/XSD differential-validation gate.

- **Phase 7 (fifth slice): builder emits Procedures and Encounters sections.** Extends `buildCcda`
  beyond the header + reconciliation triad + Results/Vital Signs/Immunizations to emit the next two
  roadmap sections, added together because they share plumbing (a coded act with `statusCode` +
  `effectiveTime` + structured/narrative agreement). Two new optional inputs, `BuildCcdaInit.procedures`
  (`BuildCcdaProcedure[]`) and `BuildCcdaInit.encounters` (`BuildCcdaEncounter[]`), each round-trip
  through `getProcedures()` / `getEncounters()` to the same structured content by construction, and a
  clean build still carries **zero warnings**.
  - **Procedures.** One of the three Procedure Activity variants per entry: operative `<procedure>`
    **`…22.4.14`**, non-altering `<act>` **`…22.4.12`**, or assessment `<observation>` **`…22.4.13`**
    (`kind`, default `"procedure"`), inside a Procedures section **`…22.2.7.1`** (LOINC `47519-4`). The
    section and all three entry templates carry the R2.1 **`2014-06-09`** stamp (not the `2015-08-01`
    stamp the other sections use); a new per-section `extension` is threaded through the section-template
    helper for this. The coded procedure (**SNOMED CT** by default) is the SHALL `code`; the SHALL
    `statusCode` is always emitted.
  - **`moodCode` is the safety-critical axis.** `disposition: "performed"` → `moodCode="EVN"`,
    `"planned"` → `"INT"`; the parser reads it back as its performed-vs-planned disposition and the two
    are **never conflated**. `statusCode` defaults per disposition (performed → `completed`, planned →
    `active`). The Procedure `effectiveTime` is **SHOULD [0..1]** (CONF:1098-7662), so it is emitted
    **only when supplied**, never fabricated with a `nullFlavor` when unknown. An
    `"observation"`-variant procedure that omits its **SHALL `value` [1..1]** (`…22.4.13`) **throws** a
    `TypeError` rather than emit a non-conformant, value-less observation.
  - **Encounters.** An Encounter Activity **`…22.4.49`** (`@2015-08-01`) inside an Encounters section
    **`…22.2.22.1`** (LOINC `46240-8`). The encounter type is the **SHALL `code` [1..1]** (**CPT** by
    default) and is required on the input; the **SHALL `effectiveTime` [1..1]** visit period is always
    emitted as an `IVL_TS`: real `low`/`high` bounds when a `period` is supplied, else a
    `nullFlavor="UNK"` `low` that satisfies the cardinality without inventing a date (read back as
    absent). `statusCode` defaults to `completed`.
  - **Emitted only when populated.** Neither Procedures nor Encounters is a CCD `SHALL` section (the CCD
    required set is Allergies / Medications / Problems / Results), so (like Immunizations) an
    unpopulated section is **not** fabricated as an empty `nullFlavor="NI"` shell. The empty-build output
    is unchanged.
  - New public types `BuildCcdaProcedure` and `BuildCcdaEncounter`. No parser change and no warning-code
    change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Plan of Treatment / Social History / Functional Status / Family
    History / …) in the builder, the other eleven document types, C-CDA document _editing_, the
    bring-your-own terminology adapter, and the external Schematron/XSD differential-validation gate (the
    roadmap's still-unproven pure-JS-engine-capacity question, §10 Q10). A `buildCcda` document remains
    expected-but-not-proven against an external IG validator.

- **Phase 7 (fourth slice): builder emits an Immunizations section.** Extends `buildCcda` beyond the
  header + the reconciliation triad + Results/Vital Signs to emit **Immunizations**: the natural
  continuation that completes the Phase-3 discrete-data trio (Results / Vital Signs / Immunizations) in
  the emit path. A new optional `BuildCcdaInit.immunizations` (`BuildCcdaImmunization[]`) drives one
  **Immunization Activity `…22.4.52`** `substanceAdministration` per shot → **Immunization Medication
  Information `…22.4.54`**, the vaccine at `consumable/manufacturedProduct/manufacturedMaterial/code`
  (**CVX** by default). Each entry round-trips through `getImmunizations()` to the same structured
  content by construction, and a clean administered build still carries **zero warnings**.
  - **Safety-critical fail-safes, mirroring the existing sections.** `dose` (`doseQuantity`) and `route`
    (`routeCode`, **NCI Thesaurus** by default) are **never guessed**: an omitted one is simply left
    absent. A **refused / not-administered** shot (`refused: true`) is emitted as `negationInd="true"`,
    which the parser reads back as `refused` and flags `IMMUNIZATION_REFUSED`: the clinically
    load-bearing refusal is surfaced, **never conflated** with a `nullFlavor` "unknown" (opposite
    clinical meaning).
  - **SHALL `effectiveTime` [1..1]** on the Immunization Activity (the substantive cardinality grounded
    against the C-CDA R2.1 IG; the exact `CONF:` id is not re-verified and is intentionally not asserted):
    the administration date is emitted as an `@value` when supplied, else `nullFlavor="UNK"`, satisfying
    the cardinality without fabricating a clinical timestamp, read back as absent (never a real `Date`),
    consistent with the third slice's every-entry `effectiveTime` rule.
  - **Emitted only when populated.** Immunizations is **not** a CCD `SHALL` section (the CCD required set
    is Allergies / Medications / Problems / Results), so an unpopulated Immunizations section is **not**
    fabricated as an empty `nullFlavor="NI"` shell, unlike the five CCD sections the builder always
    emits. The empty-build output is therefore unchanged.
  - New public type `BuildCcdaImmunization`. No new required fields, no parser change, no warning-code
    change; the round-trip-by-construction invariant and the serializer fixed point still hold.
  - **Deferred:** the remaining sections (Procedures / Encounters / Plan of Treatment / Social History /
    …) in the builder, the other eleven document types, C-CDA document _editing_, the bring-your-own
    terminology adapter, and the external Schematron/XSD differential-validation gate (the roadmap's
    still-unproven pure-JS-engine-capacity question, §10 Q10). A `buildCcda` document remains
    expected-but-not-proven against an external IG validator.

- **Phase 7 (third slice): builder emits the `SHALL` `effectiveTime` on every entry.** Closes the
  conformance gap the previous slice flagged in the README known-limitations: `buildCcda` emitted each
  act/observation's `effectiveTime` **only when the caller supplied a time**, so a built document
  round-tripped but was not Schematron-complete (several R2.1 `SHALL`-cardinality `effectiveTime` slots
  could be absent). Every affected template now emits the element its IG constraint requires, across
  **all** sections: the Problems/Allergies concern acts + observations, the Medication Activity `IVL_TS`
  duration, and the Results/Vital Signs organizers + observations.
  - Where the caller supplied a time it is used; where a `SHALL` requires the element but no time is known
    the slot is `nullFlavor="UNK"`, satisfying the cardinality **without fabricating** a clinical
    timestamp, and read back as absent (`date === undefined`), never a real time. Mirrors the header's
    `SHALL` `addr`/`telecom` and the never-guessed `dose`/`route`.
  - Per-template cardinality, confirmed against the C-CDA R2.1 IG before emitting: Problem/Allergy
    **Concern Act** `effectiveTime` `SHALL` [1..1] under the shared Concern Act rule (active→`low`,
    completed→`high`: on the Problem Concern Act `…22.4.3` these are CONF:1198-7504 / CONF:1198-10085;
    the Allergy Concern Act `…22.4.30` carries the same rule under its own ids); Problem `…22.4.4` and
    Allergy-Intolerance `…22.4.7` **Observations** carry `low`
    (onset); **Medication Activity `…22.4.16`** `IVL_TS` duration `SHALL` [1..1] (CONF:1098-7495/-7496,
    -32890); Result `…22.4.2` and Vital Sign `…22.4.27` **Observations** `SHALL` [1..1]; Result `…22.4.1`
    and Vital Signs `…22.4.26` **Organizers** span the members.
  - New optional inputs `BuildCcdaResultPanel.effectiveTime` / `BuildCcdaVitalsPanel.effectiveTime` (the
    organizer span time). No new required fields, no parser change, no warning-code change. The
    round-trip-by-construction invariant and the zero-warning clean build still hold; a `nullFlavor="UNK"`
    time is explicitly tested not to re-parse into a fabricated `Date`.
  - **Deferred:** a caller-supplied allergy/problem resolution date; the reaction/severity/criticality
    optional `effectiveTime` (0..1, no `SHALL` gap); full XSD element-order + Schematron completeness: no
    external validator was reachable, so cardinality was grounded against the raw IG text, not asserted by
    a validator run.

- **Phase 7 (second slice): richer builder section emitters (Medications, Results, Vital Signs).**
  Extends `buildCcda` from the header + Problems + Allergies of the first slice to emit **populated,
  discrete-data** clinical sections that were previously empty `nullFlavor="NI"` placeholders. Each new
  section round-trips through `parseCcda` to the same structured content by construction, and a clean
  build still carries **zero warnings**.
  - **Medications**: Medication Activity `…22.4.16` `substanceAdministration` → Medication Information
    `…22.4.23`, the drug at `consumable/manufacturedProduct/manufacturedMaterial/code` (**RxNorm** by
    default), the periodic frequency (`PIVL_TS` period) and therapy window (`IVL_TS` low/high) emitted
    as **two distinct `effectiveTime` siblings** (never conflated). `dose` (`doseQuantity`) and `route`
    (`routeCode`, **NCI Thesaurus** by default) are **never defaulted**: an omitted one is left absent
    so the parser flags it (`MISSING_DOSE_QUANTITY` / `MISSING_ROUTE_CODE`), exactly the fail-safe the
    allergy `type` default established.
  - **Results**: Result Organizer `…22.4.1` → Result Observation `…22.4.2`, the LOINC test code, a
    typed `value` in **exactly one** form (a UCUM-checked `PQ` quantity, a `CD` coded value, or a `ST`
    string: the builder throws if none or more than one is set, so a result value is never dropped or
    invented), an optional structured `IVL_PQ` reference range, and an `interpretationCode`.
  - **Vital Signs**: Vital Signs Organizer `…22.4.26` → Vital Sign Observation `…22.4.27`, the LOINC
    vital code and a **UCUM** `PQ` reading; the organizer carries the SNOMED `46680005` "Vital signs"
    cluster code.
  - **Units are safety-critical.** Result/Vital `PQ` units are emitted verbatim and checked by the
    computable UCUM grammar on re-parse: a non-UCUM or case-slipped unit (`Kg` for `kg`) surfaces
    `NON_UCUM_UNIT` / `UCUM_CASE_SUSPECT` rather than being silently "corrected" to a confident-wrong
    value. Each populated section declares the entries-required `.1` templateId; a section with no
    supplied content stays a spec-clean empty `nullFlavor="NI"` section (entries-optional templateId
    only).
  - New public surface: the input types `BuildCcdaMedication`, `BuildCcdaResultPanel`, `BuildCcdaResult`,
    `BuildCcdaVitalsPanel`, `BuildCcdaVital`, and `BuildQuantity`. No parser change, no warning-code
    change. Synthetic-only fixtures throughout.
  - **Deferred to a later CCDA-P7 increment:** the remaining sections (Immunizations, Procedures,
    Encounters, Plan of Treatment, Social History, …), the other eleven document types, C-CDA document
    _editing_, and the bring-your-own-credentials semantic-terminology adapter.

- **Phase 7 (first slice): document builder `buildCcda`.** The conservative _emit_ factory, symmetric
  with `parseCcda` and mirroring the sibling `@cosyte/hl7`'s `buildMessage`: from a semantic
  `BuildCcdaInit` it assembles a **spec-clean C-CDA R2.1 CCD** and returns a real `CcdaDocument`.
  - **Round-trip by construction.** The builder emits through the _same DOM the parser reads_: it
    builds an `@xmldom/xmldom` document with `createElementNS` (the serializer does all XML escaping),
    serializes it with the shared `serializeDocument`, then parses that text with `parseCcda`. The
    returned document is the parse of the emitted XML, so a document `buildCcda` emits always parses
    back to the same structured content and `parseCcda(doc.toString()).toString() === doc.toString()`
    holds automatically. A clean build carries **zero warnings**.
  - **Emits** the full US Realm Header (US Realm Header `…22.1.1@2015-08-01` + CCD `…22.1.2@2015-08-01`
    templateIds, LOINC document code `34133-9`, `recordTarget` with the SHALL `addr`/`telecom`, a device
    `author`, and a `custodian`, no invented person, no PHI) plus the two safety-critical
    reconciliation sections: **Problems** (Problem Concern Act `…22.4.3` → Problem Observation `…22.4.4`,
    active/resolved/inactive → concern `statusCode`, code↔narrative agreement) and **Allergies** (Allergy
    Concern Act `…22.4.30` → Allergy-Intolerance Observation `…22.4.7`, allergen at
    `participant/…/playingEntity/code`, optional Reaction/Severity/Criticality kept as distinct axes, the
    propensity `type` defaulting to the neutral SNOMED `419199007` "Allergy to substance", never a
    guessed "Drug allergy", and the **`negationInd` "No Known Allergies"** form emitted as a negation
    with no `nullFlavor`). The other CCD SHALL sections (Medications, Results) are emitted as spec-clean
    **empty, entries-optional** `nullFlavor="NI"` sections (never the entries-required `.1` with zero
    entries), so the document is conformant with no `REQUIRED_SECTION_MISSING`.
  - New public surface: `buildCcda` and the input types `BuildCcdaInit`, `BuildCcdaPatient`,
    `BuildCcdaProblem`, `BuildCcdaAllergy`, `BuildCode`. No parser change, no warning-code change.
    Synthetic-only fixtures; omitted demographics emit `nullFlavor="UNK"` rather than invented values.
  - **Deferred to a later CCDA-P7 increment:** richer section builders (Medications, Results, Vital
    Signs, Immunizations, Procedures, …), the other eleven document types, and the
    bring-your-own-credentials semantic-terminology adapter + optional bundled redistributable data.

- **Phase 6: vendor / conformance profile system (registry with provenance).** A `defineCcdaProfile()`
  engine mirroring the sibling `@cosyte/hl7` profile shape (`name` / `lineage` / `describe()` /
  `extends`-merge), a provenance-backed built-in registry (`ccdaProfiles`, `getCcdaProfile`,
  `listCcdaProfiles`), and a process-scoped default (`set/getDefaultCcdaProfile`). `parseCcda(xml,
{ profile })` applies it: a profile downgrades the **non-safety-critical** deviations it _expects_
  to a `PROFILE_QUIRK_APPLIED` warning (flagged `expected: true`, carrying the original `toleratedCode`
  in a preserved `doc.warnings` entry, a tolerated deviation is **never dropped**), and never changes
  an extracted clinical value (it operates purely at the warning-emitter layer). `doc.profile` records
  the applied profile's name + lineage.
  - **Safety gate (the load-bearing rule).** A profile can **never** tolerate a safety-critical warning
    code: patient identity (`MISSING_ASSIGNING_AUTHORITY`, `MULTIPLE_RECORD_TARGETS`), allergy
    negation/granularity, dose/route/timing, UCUM units, code↔narrative mismatch, unhandled value
    types, active-vs-resolved / planned-vs-performed status, a wrong/unknown code system
    (`UNEXPECTED_CODE_SYSTEM`), a malformed datetime (`MALFORMED_DATETIME`), or a missing SHALL section.
    Attempting to tolerate one throws `CcdaProfileDefinitionError` at definition time (`SAFETY_CRITICAL_CODES`).
  - **Evidence-backed built-ins (no invented vendor quirks, per ADR 0018).** `ccdaProfiles.smartScorecard`:
    deprecated-terminology tolerance grounded in the public SMART C-CDA Scorecard rubric + D'Amore
    et al., _JAMIA_ 2014 (deprecated BMI LOINC 41909-3, ICD-9 in newer docs, malformed `nullFlavor`
    tokens). `ccdaProfiles.legacyR11`: R1.1-origin receive-tolerance (absent 2015-08-01 version stamp,
    LOINC-fallback section matching) grounded in ONC §170.315(b)(1)'s receive-both-R2.1-and-R1.1
    requirement + the CC0 HL7/C-CDA-Examples corpus. Plus the conservative `default` baseline
    (tolerates nothing). Named per-vendor (Epic/Cerner/…) profiles deliberately await a real
    vendor-attributed grounding document: the anti-invention rule stands.
  - New public surface: `defineCcdaProfile`, `ccdaProfiles`, `getCcdaProfile`, `listCcdaProfiles`,
    `setDefaultCcdaProfile`, `getDefaultCcdaProfile`, `applyProfile`, `wrapEmitterWithProfile`,
    `SAFETY_CRITICAL_CODES`, `isSafetyCriticalCode`, `profileQuirkApplied`, `CcdaProfileDefinitionError`,
    the `PROFILE_QUIRK_APPLIED` warning code, and the `CcdaProfile` / `DefineCcdaProfileOptions` /
    `QuirkTolerance` / `QuirkMatch` / `ProfileProvenance` / `ProfileAttribution` types. Synthetic-only
    test fixtures (reuse the existing `buildCcda` builder); no realistic PHI.

- **Phase 5b: deferred clinical sections (Plan of Treatment, Functional / Mental Status, Family /
  Past Medical History).** `parseCcda(xml)` now extracts five more entry families, surfaced on
  `CcdaDocument` via `getPlannedItems()`, `getFunctionalStatus()`, `getMentalStatus()`,
  `getFamilyHistory()`, `getPastMedicalHistory()` (and the matching `doc.plannedItems` /
  `doc.functionalStatus` / `doc.mentalStatus` / `doc.familyHistory` / `doc.pastMedicalHistory` arrays):
  - **Plan of Treatment**: the six planned-entry templates (`…22.4.39`–`…22.4.44`: Act, Encounter,
    Procedure, Medication Activity, Supply, Observation), kept apart by a `kind` discriminant.
    **Everything here is future/ordered, never performed:** each item's `moodCode` is read into the same
    performed-vs-planned `disposition` as Procedures (a planned mood → `"planned"`), **never conflated**;
    a missing/unrecognized mood leaves `disposition` undefined rather than guessing. A Planned Medication
    Activity's drug is read from its `consumable`.
  - **Functional Status** / **Mental Status**: the Functional/Mental Status Observations (`…22.4.67` /
    `…22.4.74`), read standalone or as members of a status Organizer (`…22.4.66` / `…22.4.75`), plus any
    Assessment Scale Observation (`…22.4.69`, flagged `assessmentScale`) inside such an organizer. Each
    finding is `domain`-tagged so the two are **never conflated**; a standalone assessment scale (domain
    indeterminable from its template) is deliberately not captured.
  - **Family History**: the Family History Organizer (`…22.4.45`) → Observation (`…22.4.46`) tree. The
    relative's identity (relationship, gender, birth time, `sdtc:deceasedInd`) is a structured `relative`
    (not flattened); each condition carries its coded `value`, an optional Age Observation (`…22.4.31`,
    age at onset), and a `causeOfDeath` flag from a Family History Death Observation (`…22.4.47`).
  - **Past Medical History**: the **bare** Problem Observations (`…22.4.4`) a Past Medical History
    section (`…22.2.20`) carries directly under each `<entry>` (not in a Problem Concern Act), reusing
    the Problems model, so a past problem never double-counts as an active one.
  - **No new warning codes**: the deferred sections reuse the existing Tier-2 registry (e.g.
    `CODE_NARRATIVE_MISMATCH`, `NEGATION_VS_NULLFLAVOR_AMBIGUOUS`), and the required-section table is
    unchanged. (The Care Plan document's SHALL sections, `healthConcerns` + `goals`, already landed in
    Phase 5; a Plan of Treatment Section stays **excluded** because a Care Plan SHALL NOT contain one.)
- **Phase 5: Procedures, Encounters, Social-History smoking status + required-section validation.**
  `parseCcda(xml)` now extracts three more entry families and validates a document's SHALL sections,
  surfaced on `CcdaDocument` via `getProcedures()`, `getEncounters()`, `getSmokingStatus()` (and the
  `doc.procedures` / `doc.encounters` / `doc.smokingStatus` arrays):
  - **Procedures**: the three Procedure Activity templates: an altering/operative `<procedure>`
    (`…22.4.14`), a non-altering `<act>` service (`…22.4.12`), and an assessment `<observation>`
    (`…22.4.13`), kept apart by a `kind` discriminant. **`moodCode` is safety-critical:** a performed
    procedure (`EVN`) and a planned/ordered one (`INT`/`RQO`/`PRMS`/`PRP`/`APT`/`ARQ`) become a
    `disposition` of `"performed"` vs `"planned"` and are **never conflated**: a missing mood is
    `PLANNED_VS_PERFORMED_AMBIGUOUS`, an unrecognized mood is `PROCEDURE_MOOD_UNEXPECTED`, both leaving
    `disposition` undefined rather than guessing. A `negationInd` stays distinct from a `nullFlavor`.
  - **Encounters**: the Encounter Activity (`…22.4.49`): the visit type `code`, `statusCode`, and
    visit-period `effectiveTime`.
  - **Social History: Smoking Status**. The Smoking Status (Meaningful Use) observation (`…22.4.78`):
    the SNOMED CT `value` from the Current Smoking Status value set (`…11.20.9.38`). An
    explicitly-unknown status (a `nullFlavor` or an "unknown" SNOMED concept) sets `unknown: true` and
    emits `SMOKING_STATUS_UNKNOWN`: never silently read as "never smoked"; a value outside the value
    set is preserved and flagged `SMOKING_STATUS_CODE_UNRECOGNIZED`.
  - **Required-section (SHALL) validation**: for a recognized `DocumentType`, an absent required
    catalog section emits `REQUIRED_SECTION_MISSING` (a **warning**, never a fatal). The table is
    **conservative**: only unconditional, in-catalog, high-confidence SHALL constraints; it omits
    choice constraints (`A OR B`), SHOULD/MAY sections, and SHALL sections outside the recognized
    catalog. New `requiredSectionKeys` / `missingRequiredSections` expose the table.
  - Five new Tier-2 warning codes: `REQUIRED_SECTION_MISSING`, `PROCEDURE_MOOD_UNEXPECTED`,
    `PLANNED_VS_PERFORMED_AMBIGUOUS`, `SMOKING_STATUS_UNKNOWN`, `SMOKING_STATUS_CODE_UNRECOGNIZED`.
- **Phase 4: spec-clean serializer + immutable copy-with.** The conservative _emit_ half of the
  Postel's-Law contract, symmetric with `parseCcda`:
  - **`serializeCcda(doc)` and `doc.toString()`** re-emit a parsed document as spec-clean C-CDA XML
    with a guaranteed UTF-8 declaration. Both return the same string. Serialization is a **fixed
    point**: `parseCcda(serializeCcda(doc))` re-serializes to the identical text, and
    `parse(serialize(x))` is canonically equal to `x`, backed by the `@cosyte/test-utils` round-trip
    property invariant.
  - **No silent loss.** The output is snapshotted from the parsed XML DOM at parse time rather than
    reconstructed from the lossy read-model, so every element, attribute, namespace declaration
    (`xmlns` / `xmlns:xsi` / `xmlns:sdtc`), `templateId`, and even content the read-model never models
    survives the round-trip. A `nonXMLBody` base64 payload stays inert. A hand-constructed document
    (one not produced by `parseCcda`) retains no source and so throws from `toString()` until a
    document builder API lands in a later phase.
  - **`doc.withWarnings(extra)`**: the sanctioned structural-sharing copy-with: returns a **new**
    `CcdaDocument` with `extra` warnings appended, sharing every parsed field (header, sections,
    entries, serialized snapshot) by reference; the original is never mutated. The immutability
    invariant is enforced by the `@cosyte/test-utils` immutability property.
- **Phase 3: discrete clinical data: Results, Vital Signs, Immunizations.** `parseCcda(xml)` now
  extracts the three discrete-data entry families, surfaced on `CcdaDocument` via `getResults()`,
  `getVitals()`, and `getImmunizations()` (and the `doc.results` / `doc.vitals` /
  `doc.immunizations` arrays):
  - **Results**: Result Organizer (`…22.4.1`) → Result Observation (`…22.4.2`); the LOINC-coded
    analyte, the polymorphic observation `value` read into a discriminated `ObservationValue` union
    (`physicalQuantity` / `coded` / `string` / `range` / `unsupported`, selected by `xsi:type`), the
    `referenceRange` (structured `IVL_PQ` bounds, else free-text), and the `interpretationCode`.
  - **Vital Signs**: Vital Signs Organizer (`…22.4.26`) → Vital Sign Observation (`…22.4.27`); same
    UCUM-checked `ObservationValue` machinery, no reference range.
  - **Immunizations**: Immunization Activity (`…22.4.52`); the CVX vaccine reached via
    `consumable/manufacturedProduct/manufacturedMaterial/code`, `dose`, `route`, `effectiveTime`, and
    `statusCode`. A `negationInd="true"` refusal is modeled as a distinct `refused` flag (emitting
    `IMMUNIZATION_REFUSED`), never conflated with a `nullFlavor`.
  - **Computable, zero-dep UCUM grammar**: a recursive-descent validator (`isValidUcumUnit`,
    `isUcumCaseSuspect`) runs on every physical quantity. A non-UCUM unit is flagged
    (`NON_UCUM_UNIT`) and a letter-case slip of a canonical unit (`UCUM_CASE_SUSPECT`) is caught, but
    the **raw unit string is always preserved: units are never normalized away**. Property-based
    invariants back the grammar (well-formed-by-construction always validates; a canonical unit is
    never reported case-suspect; an annotation suffix never changes validity).
  - **Code-system recognition**: CVX (`CVX`) for vaccines and the HL7 `INTERPRETATION` system, plus
    LOINC deprecation checking (`checkLoincDeprecation`) on result/vital analyte codes.
  - **Seven new Tier-2 warning codes** for the discrete-data layer: `NON_UCUM_UNIT`,
    `UCUM_CASE_SUSPECT`, `MISSING_UNIT_ON_PQ`, `FREE_TEXT_REFERENCE_RANGE`,
    `RESULT_VALUE_TYPE_UNHANDLED`, `IMMUNIZATION_REFUSED`, and `DEPRECATED_LOINC`. The lenient
    invariant holds throughout: an unrecognized `value xsi:type` is preserved as `unsupported`
    (nothing dropped), and a `PQ` with a non-UCUM unit keeps its raw unit.
- **Phase 2: the clinical reconciliation triad.** `parseCcda(xml)` now extracts the three
  reconciliation entries from a structured body, surfaced on `CcdaDocument` via `getProblems()`,
  `getMedications()`, and `getAllergies()` (and the `doc.problems` / `doc.medications` /
  `doc.allergies` arrays):
  - **Problems**: Problem Concern Act (`…22.4.3`) → Problem Observation (`…22.4.4`); the coded
    condition (`value xsi:type="CD"`, SNOMED CT / ICD-10-CM), the concern `status`
    (active / resolved / inactive / unknown), and `effectiveTime`.
  - **Medications**: Medication Activity (`…22.4.16`); the RxNorm drug reached via
    `consumable/manufacturedProduct/manufacturedMaterial/code`, `dose`/`doseRange`, `route`, and the
    two `effectiveTime` siblings split by `xsi:type` into an `IVL_TS` therapy window (`duration`) and
    a `PIVL_TS` periodic `frequency`. `moodCode` (administered vs planned) kept distinct.
  - **Allergies**: Allergy Concern Act (`…22.4.30`) → Allergy-Intolerance Observation (`…22.4.7`);
    the allergen at `participant/participantRole/playingEntity/code`, each Reaction (`…22.4.9`) with
    its nested Severity (`…22.4.8`), and the propensity-level Criticality (`…22.4.145`): severity and
    criticality never merged. The `negationInd="true"` "No Known Allergies" assertion is modeled as a
    distinct `noKnownAllergy` flag, never conflated with a `nullFlavor` (value unknown).
  - **Code-system recognition**: structural `@codeSystem` OID validation per coded slot
    (`checkCodeSlot`, exported OIDs `SNOMED_CT` / `RXNORM` / `ICD10_CM` / `NDC` / `UNII` /
    `NCI_ROUTE` / …), flagging a deprecated (ICD-9) or unexpected terminology. Recognition only: it
    never bundles licensed terminology content; see the README "Code systems & provenance" note.
  - **Eleven new Tier-2 warning codes** for the entry layer: `NEGATION_VS_NULLFLAVOR_AMBIGUOUS`,
    `CODE_NARRATIVE_MISMATCH`, `NARRATIVE_REFERENCE_BROKEN`, `UNEXPECTED_CODE_SYSTEM`,
    `DEPRECATED_CODE_SYSTEM`, `MISSING_DOSE_QUANTITY`, `MISSING_ROUTE_CODE`,
    `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED`, `PROBLEM_STATUS_INDETERMINATE`,
    `ALLERGEN_GRANULARITY_SUSPECT`, and `SECTION_PLACEMENT_SUSPECT`. The two safety-critical
    reconciliations are conservative: a code↔narrative disagreement surfaces **both** and picks no
    winner; a missing `doseQuantity`/`routeCode` is preserved-as-absent and flagged, never defaulted.
- **Phase 1: the working parser.** `parseCcda(xml)` turns a real C-CDA R2.1 document into an
  immutable `CcdaDocument`:
  - **Document recognition**: all 12 US Realm document types (CCD, Discharge Summary, Referral Note,
    Consultation Note, History & Physical, Progress Note, Procedure Note, Operative Note, Care Plan,
    Diagnostic Imaging Report, Unstructured Document, Transfer Summary) resolved from the root
    `templateId`; `MISSING_TEMPLATE_ID` / `UNKNOWN_DOCUMENT_TEMPLATE` / `TEMPLATE_EXTENSION_ABSENT`
    warnings cover the deviations.
  - **US Realm header**: document identity, `code`, `title`, `effectiveTime`, `confidentialityCode`,
    `languageCode`, and the `recordTarget`/patient demographics (name parts, gender, birth time,
    marital status, race, ethnic group) + identifiers. Convenience accessors `getPatient()` and
    `getMrn()` (MRN selection isolated in `pickMrn` for a future profile override).
  - **Section framing**: sections recognized by `templateId` with a LOINC-code fallback
    (`SECTION_MATCHED_BY_LOINC_FALLBACK`), nested subsections, narrative text, and a narrative
    `ID`→text index for Phase-2 reference resolution; `findSection()` / `allSections()`. Unstructured
    documents expose their `nonXMLBody` (base64 left inert).
  - **HL7 v3 datatype layer**: `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`,
    variable-precision v3 datetime parsing, and null-flavor handling, plus namespace-aware DOM read
    helpers (`attr`, `child`, `children`, `childElements`, `text`, `xsiType`, `positionOf`).
- **Tier-2 warning registry** (stable string codes; renaming one is a breaking change) surfaced on
  `doc.warnings` (frozen), forwarded to `options.onWarning` (a throwing handler is contained), or (with `{ strict: true }`) escalated to a thrown `CcdaParseError`.
- **Hardened XML substrate + Tier-3 fatals**: DTD/DOCTYPE & external-entity rejection
  (`XXE_OR_DTD_PRESENT`), billion-laughs entity-expansion cap (`ENTITY_EXPANSION_LIMIT`), input-size
  (`INPUT_SIZE_LIMIT_EXCEEDED`), nesting-depth (`ELEMENT_DEPTH_LIMIT_EXCEEDED`), node-count
  (`NODE_COUNT_LIMIT_EXCEEDED`), malformed-XML (`NOT_WELL_FORMED_XML`), and non-`ClinicalDocument`
  root (`NOT_A_CLINICAL_DOCUMENT`) guards, with BOM stripping and base64 quarantine. Tunable via
  `DEFAULT_LIMITS` / `resolveLimits`; the substrate is exported as `parseSecureXml`.
- **PHI discipline**: every warning/fatal message and `position` carries only structural locators
  (element names, OIDs, coded tokens, line/column); clinical values never reach a diagnostic. Guarded
  by a sentinel-leak test suite.
- Project scaffold from the shared `@cosyte/*` parser template: the canonical toolchain (TypeScript
  ES2023 + strict rigor via `@cosyte/tsconfig`, ESLint 10 + type-checked `typescript-eslint` via
  `@cosyte/eslint-config`, Prettier via `@cosyte/prettier-config`, Vitest 4 + v8 coverage via
  `@cosyte/vitest-config`, dual ESM + CJS build via `tsup` + `@cosyte/tsup-config`, `attw` publish
  gate), thin callers of the reusable `cosyte/.github` CI/release workflows, Changesets on the
  `0.0.x` ladder, and the property-based conformance harness from `@cosyte/test-utils`.
- `VERSION` export.
- Ratified the XML-parser ADR (`docs/adr/0001-xml-parser.md` → **Accepted**) and added the first
  runtime dependency: **`@xmldom/xmldom`** (exact-pinned), chosen for a faithful W3C-DOM round-trip
  (namespaces, attributes, mixed narrative content, `xsi:type`) and an XXE-safe, hardenable posture:
  **1 of the ≤ 3** runtime-dep cap, intended as the shared XML substrate with `@cosyte/ncpdp`. No
  parse-layer code yet; Phase 1 configures and consumes it.

### Fixed

- **The Interventions Section (`2.16.840.1.113883.10.20.21.2.3`, LOINC `62387-6`) is in the section
  catalog, so the container this package descends into is no longer framed as an unknown section.**
  The read path was taught to find the planned entries nested in a Planned Intervention Act while the
  section framing still called that act's home unrecognized, so a document placing the container
  exactly where C-CDA R2.1 puts it drew `UNKNOWN_SECTION_CODE`. It now resolves on the primary
  `templateId` path, through `sectionForTemplateRoot` and `sectionForLoinc`, and is reachable as
  `doc.findSection("interventions")`.
  **Its root sits in the `…10.20.21.2.*` arc, not the `…10.20.22.2.*` arc every other C-CDA section
  in this catalog uses**, which matters because `…10.20.22.2.3` (`22`, not `21`) is the **Results**
  section already in the table; a matrix row exists solely to fail if those two are ever confused.
  Matching is on the root alone, so all three version stamps in circulation are accepted (unversioned
  from R1.1, `2014-06-09`, and R2.1's `2015-08-01`); that is this catalog's uniform root-primary
  contract, not a tolerance granted specially to this entry. **There is no entries-required sibling
  root** for this section, unlike Allergies (`…22.2.6` entries-optional / `…22.2.6.1` entries-required)
  or Results (`…22.2.3` / `…22.2.3.1`); it has exactly one root, so `…21.2.3.1` stays unrecognized.
  `62387-6` is "Interventions Narrative" in LOINC's own long name, while the C-CDA IG labels the
  section "Interventions Provided"; nothing here matches on either string, and neither was "corrected"
  into the other. R3.0+ renamed the same root and extension to **Activities Section**, keeping the
  LOINC; this catalog is R2.1.
  **Measured against the previous release across thirteen section shapes, not argued: the same matrix
  was run before and after and the two readings diffed.** There are **four** classes of move, all
  confined to sections carrying this `templateId` or this LOINC.
  (1) `UNKNOWN_SECTION_CODE` is withdrawn where a section carrying `62387-6` previously resolved to
  nothing at all. Note the scope carefully, because a looser version of this sentence was wrong: this
  is **not** "every document carrying the code drew it". A section stamped with `…21.2.3` _alongside_
  another recognized root resolved on that other root and was already silent, since recognition
  returns on the first matching `templateId` and never reaches the code.
  (2) A section carrying the Interventions `templateId` under some **other** section's `<code>` was
  framed as that other section off the LOINC fallback and drew `SECTION_MATCHED_BY_LOINC_FALLBACK`; it
  is now framed as an Interventions Section on the `templateId` and that warning correctly stands
  down, because no fallback was taken and the sentence it asserts is false about the document. The
  reading it replaces was the worse one: an Interventions Section handed back as a patient's Problems
  list.
  (3) **That same document now raises `REQUIRED_SECTION_MISSING` for the section it used to be
  mistaken for.** Required-section validation is driven by the keys the catalog assigns, so a CCD
  whose only "Problems" section was really an Interventions Section is now correctly told its SHALL
  Problems section is absent. This is safety-critical and unquietable under every profile, so such a
  document gets **louder**, not quieter, and this is the signal that makes (2) safe rather than a
  trade.
  (4) **On a section double-stamped with `…21.2.3` and another recognized root, whichever root is
  listed first now wins.** Previously `…21.2.3` matched nothing so the other root always won. If you
  have documents stamped that way and you branch on `findSection(...)`, check them: the section is
  still framed and its narrative retained, and no clinical fact is lost (entry extraction does not
  depend on the section key), but the `key` can change.
  Additionally `SECTION_PLACEMENT_SUSPECT` can now fire on an entry inside an Interventions Section,
  because misplaced entries are only checked in sections that are recognized; a conformant one stays
  silent. No warning code was added, renamed or reclassified, no existing type changed, and nothing
  about how entries are read has changed.

- **Clinical safety: a planned entry nested in a Planned Intervention Act is no longer dropped from
  the model in silence, for any of the seven planned templates.** `getPlannedItems()` read an
  `<entry>`'s own act and went **no deeper**. C-CDA groups the interventions planned toward a goal in
  a **Planned Intervention Act** (`…22.4.146`), which carries an `entryRelationship` for each of the
  seven planned templates and holds the planned act **inline** in every one of them. So a planned
  drug order or a scheduled vaccination hanging off an intervention came back as **no item and no
  warning**: no `undefined` to test for, no code to filter on, and a document that round-tripped
  byte-for-byte through `serializeCcda`, which is exactly why nothing caught it. That is the same
  silence as the missing Planned Immunization Activity, one markup layer in and across all seven
  templates instead of one. A nested act now reads exactly as the same act reads as a direct
  `<entry>`: same `kind`, same `code`, same slot check, same product warnings.
  `MEDICATION_PRODUCT_ARM_CONFLICT` on a planned medication whose two `manufacturedProduct` arms name
  two different drugs is reachable there for the first time, as is the `vaccine` binding's
  `UNEXPECTED_CODE_SYSTEM` on a planned vaccination.
  - **It is the only container descended into, and R2.1 has others, so this does NOT solve nesting in
    general.** A Nutrition Recommendation (`…22.4.130`) inline-holds **six** of the seven (every
    planned template except `…22.4.120`) by the identical `entryRelationship` pattern, and an
    Intervention Act (`…22.4.131`), the performed sibling and the `SHOULD` entry of an Interventions
    Section, inline-holds a Planned Intervention Act. A planned entry in either still comes back as
    nothing with nothing said, unchanged from base, and a test pins **both** as unreached so the bound
    is measured rather than asserted. Widening to them is a decision with its own base-measured matrix.
    The container that **is** read is reached at all because `extractPlannedItems` runs on **every**
    `<section>` rather than on a recognized Plan of Treatment alone: the Plan of Treatment Section's
    eleven entry templates do not include it, and the Interventions Section (`…21.2.3`, LOINC
    `62387-6`) admits it as a direct entry.
  - **An `entryRelationship` is read for what it CONTAINS and never followed for what it REFERENCES.**
    The template's `[1..*]` `typeCode="RSON"` relationship holds an **Entry Reference** (`…22.4.122`)
    whose own SHALL names a Goal Observation recorded elsewhere. It carries an `<id>` and a
    `nullFlavor="NP"` `<code>` and no planned template, so it is stepped over rather than resolved:
    resolving it would hand back an item the container does not hold.
  - **Matching is on the `templateId` root alone**, which is what keeps the performed acts the same
    container also admits out of the result. A Medication Activity (`…22.4.16`) and a Planned
    Medication Activity (`…22.4.42`) are both `substanceAdministration`s, so an element-name or
    `@moodCode` test would either admit the performed one or start guessing at a mood the template
    already settles. `@moodCode` is still read onto `disposition`, so a planned template carrying a
    performed mood reports what it says rather than what its template promised.
  - **A returned item does not say whether it was direct or nested, deliberately.** The Planned
    Intervention Act is not modelled: no container type, no goal linkage, no flag, so the grouping
    toward the goal is available only from `doc.toString()`. What the accessor answers is which acts
    are planned, and a nested one is planned on the same terms as a direct one. Each item keeps its
    own `ids`, so a caller that needs the grouping can correlate.
  - **Still not returned, and still open.** Instruction (`…22.4.20`), Handoff Communication
    Participants (`…22.4.141`) and Nutrition Recommendation (`…22.4.130`) are admitted by the
    container exactly as by the section, and are still excluded without a warning at **both** levels.
    Whether they should be reported as dropped is left open rather than quietly decided, and a test
    pins the current answer instead of settling it. Goal Observation (`…22.4.121`) stays excluded on
    its own grounds: `moodCode="GOL"` is neither performed nor planned in this parser's mood model.
  - **Nothing a direct entry already returned changed.** The same act read as an `<entry>` reads
    identically before and after, across all seven templates.
  - **`buildCcda` cannot emit the container.** Emitting a conformant Planned Intervention Act means
    satisfying its `[1..*]` reference to a Goal Observation, which means modelling goals; that is not
    part of this change.
  - No warning code was added, renamed or reclassified, and no published type changed.

- **Clinical safety: a planned immunization is no longer dropped from the model in silence.** A Plan
  of Treatment entry carrying the Planned Immunization Activity template (`…22.4.120`) matched no
  template this parser recognized, so `getPlannedItems()` returned **no item for it at all** and
  raised **no warning**. A consumer reading that list to answer "what is this patient scheduled to
  receive" got a clean, warning-free answer with a scheduled vaccination missing from it: no
  `undefined` to test for, no code to filter on, and a document that round-tripped byte-for-byte
  through `serializeCcda`, which is exactly why nothing caught it. It comes back as
  `kind: "immunizationActivity"` now, one of seven planned-entry templates rather than six.
  - **Its `code` is the vaccine from the `consumable`, never the act's own `<code>`.** The template
    has the same shape as a Planned Medication Activity. `code` is base CDA R2's `[0..1]`
    `ActSubstanceAdministrationCode` (the _kind of administration act_) rather than a C-CDA
    constraint, since R2.1 constrains `code` on neither template; the substance participates through
    C-CDA's `consumable/manufacturedProduct` `[1..1]`, carrying Immunization Medication Information
    (`…22.4.54`). So every product warning applies to it, `MEDICATION_PRODUCT_ARM_CONFLICT`
    included, and the act `<code>` is not on the model (it round-trips through `doc.toString()`).
  - **Slot-checked at the `vaccine` binding, which is CVX only, not at the `medication` binding.**
    `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`, `UNEXPECTED_CODE_SYSTEM` and (with a
    `TerminologyAdapter`) `SEMANTIC_CODE_INVALID` fire on a planned vaccine code for code with its
    performed twin. **The two planned `substanceAdministration` variants do not match each other**:
    NDC is expected on a drug and unexpected on a vaccine, so an NDC-coded planned vaccine draws
    `UNEXPECTED_CODE_SYSTEM` and an NDC-coded planned drug does not. Parity is with each variant's own
    performed twin, which is the only binding either can cite.
  - **Seven is what `getPlannedItems()` returns; eleven is what the section admits.** The four
    templates a Plan of Treatment section may carry that are **not** returned are Instruction
    (`…22.4.20`), Handoff Communication Participants (`…22.4.141`), Nutrition Recommendation
    (`…22.4.130`) and Goal Observation (`…22.4.121`). A Goal Observation is `moodCode="GOL"`, which
    this parser classifies as neither performed nor planned, so returning it would contradict the
    package's own mood model. Their narrative and structure are preserved and they re-serialize
    faithfully; nothing is raised about them, and whether anything should be is left open rather than
    decided here.
  - **An act stacking `…22.4.42` and `…22.4.120` still reads as a `medicationActivity`.** Extraction
    takes the first matching template and stops, and the new one is appended rather than inserted, so
    such an act reads exactly as it did before this template was recognized at all. Both variants read
    the same `consumable`, so the returned `CD` is identical either way; what the order decides is the
    reported `kind` and with it the binding. Nothing in a document that stacks two templates ranks
    them, so the tie is broken by not moving.
  - **A Planned Immunization Activity as a direct entry of another recognized section now draws
    `SECTION_PLACEMENT_SUSPECT`** (tolerable by a profile), joining the six planned roots already
    mapped to the Plan of Treatment.
  - **Measured against the previous behaviour rather than argued.** A 26-row matrix, thirteen product
    shapes each parsed as a Planned Immunization Activity **and** as its performed Immunization
    Activity twin: all thirteen performed rows are byte-identical to before, and all thirteen planned
    rows move from the same prior reading, _no item and no warning_. No row loses a warning, because
    no row had one; no row stops handing back a product, because none handed one back. After the
    change the two columns of all thirteen shapes agree exactly, which is the acceptance bar.
  - **`buildCcda` emits the variant too**, so the shape has round-trip coverage rather than
    parse-only coverage. Two details are the template's rather than house style: its `templateId` is
    **root-only** (`…22.4.120` is unversioned, where the six `…22.4.39`-`…22.4.44` templates carry the
    R2.1 `2014-06-09` stamp), and `effectiveTime` is **required** on `BuildCcdaPlannedImmunization`,
    because the template makes it `[1..1]`. **That is not unique to it:** Planned Medication Activity
    (`…22.4.42`) SHALL carry exactly one too (CONF:1098-30468), and it is the other **five** that are
    `[0..1]`. `BuildCcdaPlannedOrder` still types the field optional, so `buildCcda` can emit a Planned
    Medication Activity short that element; that gap predates this entry and is not closed here,
    because requiring the field is a breaking change to a published input type. New exported type:
    `BuildCcdaPlannedImmunization`. `PlannedItemKind` gains `"immunizationActivity"`.
  - **What this does not reach:** a planned entry that is **nested** rather than a direct `<entry>`
    act, for any of the seven kinds. That is a standing limitation of the accessor rather than
    something this entry changed. **The Planned Intervention Act case is closed by the entry above,
    which ships in the same release; the rest of the nested surface is not.**
- **Documentation: the enumeration of unquietable companions behind the tolerable product-arm codes
  listed three and there are four.** `MEDICATION_PRODUCT_ARM_UNEXPECTED` and
  `MEDICATION_PRODUCT_ARM_REPEATED` are tolerable by a profile only because every state in which no
  product identity comes back carries a companion no profile can quiet. The published list named
  `MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE` and
  `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` and omitted `MISSING_CODE_VALUE`, the companion on the
  shape where an element **is** selected and asserts neither a symbol nor a `nullFlavor` (two
  empty-`<code/>` material arms is exactly that shape). It covered the states where _selection_
  failed rather than every state where _identity_ is absent. All four are safety-critical, so no
  classification changes; the argument was incomplete, and it was incomplete in the README, the
  troubleshooting guide, and both warning docblocks. `MEDICATION_PRODUCT_ARM_UNEXPECTED`'s warning
  **message** now names the third companion too.
- **Documentation: the five unchecked planned kinds were justified more strongly than the facts
  support.** The stated reason for not slot-checking a planned act/encounter/procedure/supply/
  observation `code` was that binding them would mean inventing a value set this package cannot cite.
  That is true of the **system** checks only: `MISSING_CODE_VALUE` and `MISSING_CODE_SYSTEM` are
  raised before any binding is read, so both could be raised there without citing a value set. Leaving
  those five unchecked is a **choice**, and the documentation now says so. The behaviour is unchanged:
  they are still not checked, and widening that is a separate decision.

- **Clinical safety: a planned medication's drug is now code-system checked, exactly as a performed
  one's is. Until now a planned medication with NO drug identity at all could reach a consumer
  carrying only a profile-quietable warning.** `checkCodeSlot` runs at the five wired `CodeSlot`s,
  and a `PlannedItem.code` was not one of them, so `MISSING_CODE_VALUE`, `MISSING_CODE_SYSTEM`,
  `UNEXPECTED_CODE_SYSTEM` and (with a caller-supplied `TerminologyAdapter`) `SEMANTIC_CODE_INVALID`
  could not fire on a planned drug where they all fire on a performed one. A planned drug asserting
  a `@code` with no `@codeSystem`, an empty `<code/>`, or an OID outside RxNorm/NDC was read and left
  unremarked. The `medicationActivity` variant's `code` **is** the drug, read from the same
  `consumable/manufacturedProduct` a performed Medication Activity reads, so it is the same coded
  value in the same terminology at the same slot; it now gets the same check. Entered as
  `PRE-EXISTING` and queued by the slice above rather than folded into it, because making four codes
  newly reachable at a call site needs its own base-measured matrix.
  - **The sharpest consequence, and the reason this is a fix rather than a tidy.**
    `MEDICATION_PRODUCT_ARM_UNEXPECTED` and `MEDICATION_PRODUCT_ARM_REPEATED` are deliberately
    tolerable, and that rests on a conditional argument: wherever they fire without a `<code>` having
    been selected and read normally, an **unquietable** companion fires beside them. On the shape
    where an arm's `<code>` asserts neither a symbol nor a `nullFlavor`, the companion that argument
    names is `MISSING_CODE_VALUE`, which could not fire here. So the argument was false at this call
    site and only at this call site: a planned medication whose single arm was
    `<manufacturedLabeledDrug><code/></manufacturedLabeledDrug>` had no drug identity at all and drew
    `MEDICATION_PRODUCT_ARM_UNEXPECTED` alone, and two empty-`<code/>` material arms drew
    `MEDICATION_PRODUCT_ARM_REPEATED` alone. Neither is in `SAFETY_CRITICAL_CODES`, so a vendor
    profile plus the documented filter-the-expected-noise pattern reduced both to silence, on the
    section that says what a patient is **about to be given**. Both shapes now carry
    `MISSING_CODE_VALUE`, which no profile can quiet.
  - **Four codes, not five, and the fifth is named rather than glossed.**
    `DEPRECATED_CODE_SYSTEM` is **not** newly reachable: the `medication` slot's binding declares no
    deprecated systems, so it cannot fire at that slot on a performed medication either. An ICD-9-CM
    OID on a drug draws `UNEXPECTED_CODE_SYSTEM` in both places, and the matrix has a row that says so.
  - **Scoped to the one variant whose `code` is a drug.** The other five planned kinds carry the
    planned act itself (a LOINC observation, a CPT encounter, SNOMED act/procedure/supply). None is
    one of the five bound `CodeSlot`s, and binding them would mean inventing a value set this
    package cannot cite, so they are deliberately left unchecked.
  - **Monotone whole, for the first time in this series, and measured rather than argued.** A new
    26-row matrix (thirteen arm shapes, each parsed as a planned medication **and** as its performed
    twin) run against base `src/`: all thirteen performed rows come back byte-identical, ten of the
    thirteen planned rows move, and every one of them moves by **gaining** the code its performed twin
    was already drawing. No row goes from warned to silent, no row trades a safety-critical code for
    a weaker one, and no row stops handing back a drug, because `checkCodeSlot` only emits: it
    selects nothing, withholds nothing, and never touches the `CD`. After, the two columns of all
    thirteen shapes agree exactly, which is the bar. The pre-existing 27-row planned-arm matrix moved
    three rows, each purely gaining `MISSING_CODE_VALUE`, and the performed-medication matrix is
    untouched.

- **Clinical safety: `MEDICATION_PRODUCT_ARM_CONFLICT` had NEVER been reachable on a Planned
  Medication Activity, so two `manufacturedProduct` arms naming two different drugs went completely
  unmentioned on the Plan of Treatment.** `plannedCodeElement` returned the planned act's direct
  `<code>` **before** it ever called `consumableProductCode`, so a planned medication carrying one
  (legal, `SubstanceAdministration.code` being `[0..1]` in CDA R2) never had its consumable looked
  at. **Every** warning that function raises
  was unreachable there, not merely the headline one: `MEDICATION_PRODUCT_ARM_CONFLICT`,
  `MISSING_PRODUCT_CODE`, `MEDICATION_PRODUCT_ARM_UNEXPECTED`, `MEDICATION_PRODUCT_ARM_REPEATED`,
  `MEDICATION_PRODUCT_CODE_REPEATED` and `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`. Same harm class
  as the rest of this area, a silent pick between two named drugs, on the section describing what a
  patient is **about to be given**. Reproduced on base before it was touched.
  - **The root cause is a semantic one: `SubstanceAdministration.code` is not the drug.** CDA R2
    types it as an `ActSubstanceAdministrationCode`, the _kind of administration act_ ("drug
    therapy"), while the substance participates through `consumable/manufacturedProduct`. So the
    direct `<code>` was never a weaker drug code to fall back on, and preferring it read an act type
    into the drug slot. The model was incoherent in the same way: `code` on a planned
    `medicationActivity` was the drug on a document with no act `<code>` and the act type on one with
    it, so a consumer could not rely on it being either. It is now always the drug, exactly as `drug`
    is on a performed Medication Activity and `vaccine` is on an Immunization Activity, the other two
    `consumable` call sites, both of which have always ignored the act's own `<code>`.
  - **The builder is what hid it.** `buildCcda` emits the drug in the `consumable` and **no** direct
    `<code>` for this variant, so no round-trip fixture could ever produce the shape, and every
    existing planned-medication test exercised the fall-through path.
  - **`CODE_NARRATIVE_MISMATCH` was reachable there and blind to its subject.** It reconciled the act
    code's `displayName` against a narrative that names the drug, so it fired on well-formed
    documents and could not see a structured drug contradicting the narrative. It now reads the drug.
  - **What is given up is stated rather than hidden**: the act `<code>`'s coding is not on the model
    for this variant, as it is not for the other two call sites. `serializeCcda` re-emits the parsed
    DOM, so it survives `doc.toString()` byte-for-byte. Promoting it into the drug slot is the
    manufactured reading this area refuses everywhere else. The other five planned kinds are
    untouched: their `<code>` _is_ the planned act, and they have no consumable to read.
  - **Monotonicity is measured, and this slice has one exception to it.** A 27-row matrix (three
    variants of nine arm shapes) run against the previous release's `src/`: the nine "no act
    `<code>`" rows come back byte-identical and the performed-medication matrix is untouched, so one
    call site moved and no other. The nine "act `<code>` present" rows are pure gain, base being
    silent on all nine while reading an act type as the drug. The nine "act `<code>` + narrative"
    rows move on `CODE_NARRATIVE_MISMATCH` alone, **eight losing it, two of those going warned to
    silent and two trading it for a tolerable code**. That is a false positive removed rather than a
    signal lost, and the matrix is what shows it: base fires that code on **nine of nine** rows,
    the clean document included, because an act type's label can never match a narrative naming a
    drug. It was a constant, not a predicate. After, it fires on **one of nine**, exactly the row
    whose structured drug contradicts the narrative. No row loses a product warning.

- **`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s message no longer asserts two things that are false
  on a repeated `<code>`.** It opened "No manufacturedProduct arm asserts a primary `@code`" and
  called the `<translation>` the _only_ place the product was named. Both are false on an arm whose
  **second** `<code>` asserts a primary: selection reads each arm's lead `<code>` and no other, so
  that document still has no selected product and still draws this code, with
  `MEDICATION_PRODUCT_CODE_REPEATED` beside it saying why. The message is narrowed to the lead
  `<code>`. Message text only, no code change and no behaviour change: a safety-critical warning that
  misdescribes the document it is about is the same defect as one that points at a coding that is not
  there.

- **Clinical safety: an arm carrying two `<code>` children no longer has the second silently
  dropped.** Arm selection read only the **first** `<code>` child of each `manufacturedMaterial` and
  `manufacturedLabeledDrug`. `Material.code` and `LabeledDrug.code` are each at most one in CDA R2,
  so a second `<code>` is already outside the model, but it was discarded before anything compared
  it: it never reached the conflict rule and drew no warning of any kind. A `manufacturedMaterial`
  writing an RxNorm code for Lisinopril and a second one for Aspirin returned Lisinopril as _the_
  product and dropped the other, in complete silence. That is the failure
  `MEDICATION_PRODUCT_ARM_CONFLICT` exists to refuse, a silent pick between two named drugs, on a
  shape that rule could not see: the same failure as the repeated **arm**, one markup layer further
  in. Every `<code>` on every arm now reaches the **comparison**, so that shape conflicts and no
  product is returned. `MEDICATION_PRODUCT_ARM_CONFLICT` therefore fires on strictly more documents
  than before, never fewer. Applies at every consumable call site, with one pre-existing limit
  this slice did not change: Medication Activity and Immunization Activity always, and Planned
  Medication Activity only when the planned act carried no `<code>` of its own, because a direct
  `<code>` short-circuited the consumable read before any arm was looked at. **That limit is closed
  by `CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE`, entered above; it now applies at every call
  site unconditionally.**
  - **Selection was deliberately not widened with it, and nothing about what is read changes**,
    except where the conflict rule now withholds a product it previously picked. "Disagreement is
    read across every arm, selection is not" is the split this area is built on, and a second
    `<code>` is a new _candidate_ rather than a new arm: every candidate it adds sits earlier in
    document order than a later arm's `<code>`, and selection ranks on "names a product" alone, which
    is completeness-blind on purpose. Admitting them would re-decide picks the document never
    re-decided, displacing an equally-symboled but richer sibling coding: a bare `<code code="X"/>`
    over a `<code code="X" displayName="..."/>`, taking `CODE_NARRATIVE_MISMATCH` (the only guard on
    the structured code contradicting the narrative) with it; over a `<code>` carrying the
    `<translation>` alternates; or over an empty `<code/>` that `MISSING_CODE_VALUE` fires on. All
    three are safety-critical signals, and all three would be traded for a symbol that was already
    identical, since only codings that **agree** survive the conflict check. Ranking the candidates by
    completeness instead would be the parser choosing between codings the document wrote as equals.
  - **`MEDICATION_PRODUCT_CODE_REPEATED` (new, safety-critical).** Reports the cardinality itself,
    whether or not the repeated `<code>`s agree, on the same split `MEDICATION_PRODUCT_ARM_REPEATED`
    already makes: cardinality and agreement are separate facts with separate codes. Reported **per
    arm** rather than per `manufacturedProduct`, because it states a fact about a particular arm and
    its `position` names which one, so a product with two offending arms draws two warnings at two
    positions rather than one pointing at only one of them. **It is safety-critical where the
    repeated-arm code is tolerable, and the difference is selection.** With two arms the one naming a
    product is the one read, so the repeated-arm code never fires alone over a lost drug; with two
    `<code>`s on one arm only the lead is selected, so there is a state where this code fires
    **alone** and a named drug is lost: the lead asserts a `nullFlavor` and the sibling names an
    RxNorm product, so `med.drug?.code` is `undefined` over a document that names the drug one
    element along. Nothing else can fire there, `MISSING_PRODUCT_CODE` cannot (a `<code>` exists), the
    conflict rule cannot (an exceptional value is not a rival drug, which is what lets a null-marked
    arm lose to a naming one everywhere else), and the code-system checks are quiet by design on a
    `nullFlavor`-only slot. That is `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`'s harm with a sibling
    `<code>` in place of a `<translation>`, classified the same way for the same reason. It therefore
    over-fires on the benign identical repeat, deliberately: splitting that shape off would let what
    the codings happen to _say_ decide whether a structural deviation is named, the exact inversion
    the repeated-arm code refuses one layer out, and over-firing costs a warning while under-firing
    costs a drug.
  - **Monotonicity is measured, not argued**, by running the arm-shape matrix in
    `test/entries.test.ts` against the previous release's `src/`. All nineteen pre-existing rows come
    back **byte-identical**; only the eight new rows move. Every one of the eight gains warnings, and
    every one reads exactly what the previous release read except the three the conflict rule now
    withholds outright. **Exactly one row's warning set is not a superset of its old one**, and it
    is the documented suppression rather than a lost signal:
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` stands down behind
    `MEDICATION_PRODUCT_ARM_CONFLICT`, as `MISSING_PRODUCT_CODE` already does, because the conflict
    is the stronger statement about the same slot; both are safety-critical, so no profile can quiet
    either. The invariant holds in the form that is actually true: **no row goes from warned to
    silent, and no row trades a safety-critical code for a weaker one.** "No product code stops being
    reported" remains a **false** way to state it. Nothing is lost in any of these states:
    `serializeCcda` re-emits the parsed DOM, so every arm and every `<code>` round-trips
    byte-for-byte.

- **Clinical safety: a product named only in a `<translation>` is no longer reported as no product
  at all, a repeated arm is no longer absorbed in silence, and two arms that both fall back to
  translations are compared under a rule that can see a disagreement inside one terminology.** Two
  new stable warning codes. `MEDICATION_PRODUCT_ARM_CONFLICT`'s predicate widens in exactly one
  shape, described below, and it moves in **one direction only**: it fires on strictly more
  documents than before, never fewer, and no document that was refused before is accepted now. The
  cost of that direction is stated rather than buried: **a document that used to yield a product
  code can now yield none.** Where a third arm asserts a primary and two other arms disagree only
  through their translations, the whole product is now withheld behind the conflict code, and
  `med.drug` goes from a coded `CD` to `undefined`. That is the deliberate trade, the same one the
  conflict code has always made: the parser refuses to pick when the document contradicts itself,
  and it says so loudly rather than answering from one arm.
  - **`MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY` (new, safety-critical).** When no
    `manufacturedProduct` arm asserts a primary `@code` and the product is named in a
    `<translation>` instead (the `nullFlavor="OTH"` plus `<translation>` idiom), the parser now says
    so. Nothing about the reading changes: `med.drug` still comes back as the selection rule always
    picked it, and `drug.code` is still `undefined`, because slot checks apply to a slot's
    **primary** coding and lifting a translation into the product position would hand
    `checkCodeSlot` a coding the document never wrote there. What changes is that the shape used to
    be **entirely silent**: `MISSING_PRODUCT_CODE` cannot fire (an arm did carry a `<code>`), and
    `checkCodeSlot` is quiet by design on a `nullFlavor`-only slot because a declared `nullFlavor`
    is a complete statement that the concept is unknown, which here it is not. So a consumer reading
    the drug off `med.drug?.code` saw a medication with a dose, a route and a timing and no drug,
    with no warning of any kind, over a document that names the drug one element down.
    **Where the coding is reachable depends on which arm holds it, and the warning's message and
    `position` say which.** Only one arm ever becomes `med.drug`: when that is the arm carrying the
    translation, the coding is somewhere on `drug.translation`, and you have to **search that list**
    rather than read `[0]`, since a `<code>` may carry several `<translation>`s and the first can be
    `nullFlavor`-marked or in a code system you did not want. When it is not (two arms, neither
    asserting a primary, the translation sitting on the one that was not selected), the returned
    `CD` is the other arm's and no product-naming coding is on it, so the coding is reachable only
    through `doc.toString()`. On the `nullFlavor`-marked idiom this is the lone signal, which is why no
    profile may quiet it; on the variant that asserts neither a symbol nor a `nullFlavor`,
    `MISSING_CODE_VALUE` fires beside it and is itself safety-critical. It stands down behind
    `MEDICATION_PRODUCT_ARM_CONFLICT`, which is the stronger statement about the same slot, exactly
    as `MISSING_PRODUCT_CODE` already does. Applies at every consumable call site (Medication
    Activity, Immunization Activity, Planned Medication Activity, and, from
    `CCDA-PLANNED-IMMUNIZATION-DROPPED`, Planned Immunization Activity).
  - **`MEDICATION_PRODUCT_ARM_REPEATED` (new, tolerable by a profile).** One
    `manufacturedProduct` carrying more than one arm of the **same kind** is now reported. Repeated
    arms that _disagreed_ were already refused; repeated arms that **agreed** were reduced to one
    with nothing said, so a document asserting the same product three times reported identically to
    one asserting it once, and cardinality was observable only when the codings happened to differ.
    It is keyed to the **arms**, not to their codings (an arm carrying no `<code>` counts), for the
    same reason `MEDICATION_PRODUCT_ARM_UNEXPECTED` is: whether the repeats agree is a separate
    question with a separate code, and letting agreement decide whether the repeat is reported would
    make markup content rather than markup shape decide whether a structural deviation is named. Its
    exclusion from `SAFETY_CRITICAL_CODES` carries the same conditional argument as the presence
    warning's: where it fires alone a `<code>` was selected and read exactly as a single-arm
    document's would have been, and each state where that would not be enough carries an unquietable
    companion (`MEDICATION_PRODUCT_ARM_CONFLICT`, `MISSING_PRODUCT_CODE`, or
    `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`).
  - **Where BOTH arms fall back to `<translation>`s, sharing one coding is no longer always enough
    to agree.** That is the one pairing where the shared-coarser-coding hazard survives, because
    neither arm asserts a primary to compare: two arms translating to a shared coarser concept plus
    two different strengths agree on the coarse coding while naming two products, and the "some
    coding agrees" test could not see it. Such arms now also conflict when each names a coding the
    other does not **and** two of those unshared codings are in the **same code system under
    different symbols**. An arm
    that merely offers an _extra_ alternate the other stayed quiet about (an NDC beside the RxNorm
    concept both share) is elaborating its own concept, which is what HL7 v3 says a `<translation>`
    does, and is deliberately **not** a conflict: a shorter list is not a denial. Codings in
    different code systems are never compared, because deciding whether an NDC and an RxNorm concept
    denote one product is terminology work rather than parsing. Two arms that both assert a primary
    `@code` are compared on those primaries alone, byte for byte as before, and an arm that falls
    back against one that asserts a primary still agrees on naming that primary's symbol. The new
    clause can only turn a non-conflict into a conflict, never the reverse; that direction is the
    safety property of the whole area and is pinned by a matrix snapshot and a table of
    disagreeing-primary shapes in the tests. **What a consumer sees on the newly-refused shapes:**
    `med.drug` is now `undefined` with the conflict code beside it. Where the two fallback arms are
    the only ones, it was previously the first arm's `nullFlavor` `CD` carrying that arm's
    translations, which showed one arm's codings as if they were the product's, and
    `med.drug?.code` was `undefined` before and after. Where a **third** arm asserts a primary the
    two fallback arms disagree behind, it was previously that arm's fully coded `CD`, so a product
    code that was reported does stop being reported: the document names one product in a primary and
    two others in translations, and the parser now declines to pick rather than answering from the
    arm that happens to assert a symbol.
    **That last test is a parser's reading rather than something the document asserts, and it
    deliberately over-fires.** Two different symbols in one code system usually are two products, but
    two NDC package codes can describe one drug, and an RxNorm branded drug and its clinical
    equivalent are one product at two granularities. Telling those apart is the terminology work this
    library refuses to guess at, so the only choice is which way to be wrong: over-firing costs a
    withheld product beside a loud safety-critical code, under-firing costs one of two strengths
    handed back in silence.
  - Nothing is lost in any of these states: `serializeCcda` re-emits the parsed DOM, so every arm and
    every `<translation>` round-trips byte-for-byte and a caller that needs them can read them off
    `doc.toString()`.

- **Clinical safety: arm selection now sees a `<translation>` and a repeated arm, and the docstring
  that justifies `MEDICATION_PRODUCT_ARM_UNEXPECTED`'s classification is no longer arguing from a
  premise the previous slice falsified.** No new warning code; `med.drug` / `immunization.vaccine`
  now withholds on documents whose arms disagree only through a `<translation>` or only through a
  repeated arm, and recovers a drug on a repeated arm whose first sibling names none.
  - **A `nullFlavor`-marked arm whose `<translation>` names a different drug is now a conflict.**
    `namesAProduct` / `namesConflictingProducts` keyed on the primary `@code` alone, so a
    `manufacturedLabeledDrug` carrying `<code nullFlavor="OTH"><translation code="…"/></code>` named
    no product as far as arm selection was concerned, and the `manufacturedMaterial` arm's drug was
    selected in silence. `nullFlavor="OTH"` beside a `<translation>` is the documented C-CDA idiom
    for "not codable in the bound value set, here is an alternate coding", which this package
    already treats as coherent rather than contradictory, so on that shape the arm's whole product
    identity is in the translation. It is the same "quietly picks between two drugs" failure the
    previous slice closed, one level down. An arm is now read as naming its `@code` when it asserts
    one, and **otherwise** the codings its `<translation>` alternates assert.
  - **The translations are a fallback, never an addition, and that asymmetry is the safety
    property.** Two arms that both assert a `@code` are compared on those and nothing else, exactly
    as before, so reading translations can only make the conflict fire **more**, never less. Adding
    them in would let a coding the two arms happen to share _withdraw_ a conflict their primaries
    assert, and a shared translation is routinely coarser than either primary (an RxNorm ingredient,
    a local formulary id, an NDC spanning presentations): two arms naming Lisinopril 10 MG and
    Lisinopril 20 MG that both translate to the lisinopril ingredient would agree, and one strength
    of a document naming two would be handed back. Reading `A = B` out of `A = Z` and `B = Z` is a
    transitive closure the document never wrote, and it is false exactly when `Z` is coarser. No
    terminology equivalence is inferred at all, deciding that two codings denote one concept is a
    `TerminologyAdapter`'s job.
  - **Selection is deliberately _not_ translation-aware.** Which `<code>` element is handed to
    `checkCodeSlot` is still decided by primary `@code` alone. The stated boundary of this package
    is that slot checks apply to a slot's primary coding and `<translation>` alternates are
    preserved but never slot-checked, so selecting an arm on the strength of a translation would
    hand `checkCodeSlot` a `nullFlavor` primary and validate nothing, or require synthesizing a
    coding the document never wrote in that position. Translations settle whether the arms
    _disagree_; they never manufacture a reading.
  - **Two sibling `manufacturedMaterial` arms with different codes no longer read the first
    silently.** The previous slice compared `manufacturedMaterial` against `manufacturedLabeledDrug`
    only, so one arm kind repeated slipped past it, and `ManufacturedProduct` models one participant
    so a repeat is already outside the model. The conflict check now runs over every
    `manufacturedMaterial/code` and every `manufacturedLabeledDrug/code` the product carries.
  - **Among repeated arms of one kind, the first that _names_ a product is the one read.** The first
    arm used to win unconditionally, so a null-marked first sibling beside one carrying a real
    RxNorm code dropped that drug with no warning of any kind: not a conflict (a `nullFlavor` names
    no competing product), not `MISSING_PRODUCT_CODE` (an element was selected), not
    `MISSING_CODE_VALUE` (the `nullFlavor` makes it a complete statement). This is the same rule
    already applied _across_ arm kinds, applied within one. When no sibling names a product the
    first is still read, so the empty-slot machinery sees exactly the element it always saw.
  - **`MEDICATION_PRODUCT_ARM_UNEXPECTED`'s exclusion from `SAFETY_CRITICAL_CODES` is unchanged; its
    justification is corrected.** The docstring asserted unconditionally that the alternate arm's
    code "is read, not refused" and that "every code-system and terminology check applies to it
    unchanged", and argued the classification from exactly that. That was true until
    `MEDICATION_PRODUCT_ARM_CONFLICT` existed: in the conflict state no code is selected at all, so
    nothing reaches `checkCodeSlot`. The claim is now stated conditionally everywhere it is made
    (`src/parser/warnings.ts` and its runtime message, `docs-content/troubleshooting.md`,
    `README.md`, `CLAUDE.md`), and the classification rests on the argument that actually holds:
    wherever this code fires alone an element was selected and read exactly as the same document
    would have been read with one arm, and wherever none was selected it is by construction not
    alone, because either `MEDICATION_PRODUCT_ARM_CONFLICT` (the arms disagreed) or
    `MISSING_PRODUCT_CODE` (no arm carried a `<code>` at all, the shape a name-only `LabeledDrug`
    produces) fires beside it, both safety-critical and neither quietable by a profile. Tolerating
    the presence warning can therefore never buy silence about an absent or withheld drug. The
    runtime message string, which carried the same too-narrow claim, is corrected with it.

- **Clinical safety: the two residuals the `nullFlavor` slice named and did not close, a patient
  identifier read out of a null-marked `<id>`, and a medication naming two different drugs.** One
  new stable warning code, safety-critical, and one behavioural change to `getMrn()` / `pickMrn`.
  - **`getMrn()` no longer hands back an MRN the document disowned.** The previous slice made
    `<id nullFlavor="UNK" extension="MRN001"/>` warn (`CONTRADICTORY_NULL_FLAVOR`), but `pickMrn`
    still returned `"MRN001"`, so `doc.getMrn()` produced a patient identifier out of a field the
    document had marked unknown. A misfiled patient record is the third harm this package's harm
    ordering names, alongside a wrong dose and a wrong code system, and it is the worst of the three
    to detect: silent, persistent, and it contaminates everything downstream. `pickMrn` now returns
    `undefined` when the **first** `patientRole/id` carries a `nullFlavor`.
  - **It withholds, it does not substitute.** Falling through to the next `<id>` is the tempting
    move and the worse one: CDA R2 makes `patientRole/id` `1..*` and nothing in the document ranks
    the entries, so the second id is whatever the sending system listed second, commonly a plan
    member number, an account number, or the SSN under `2.16.840.1.113883.4.1`. Answering the MRN
    question confidently from a different assigning authority, with no signal naming the
    substitution, trades one wrong-identifier failure for a quieter one. The rule declines a
    manufactured reading; it does not manufacture a replacement. Same slot, same position, reading
    withheld. A caller who knows their own authority OIDs can resolve it from
    `getPatient()?.identifiers`, which still reports every id in full.
  - **The datatype is unchanged, and that is the point.** `parseIi` still keeps `@extension` on a
    contradicted `<id>`: it **is** the document's own text, with no second copy the way `PQ.raw`
    sits beside `PQ.value`, so withholding it there would delete what the document said. The
    withholding moved to the layer that manufactures a reading instead. What `pickMrn` produces is a
    **selection**, one `<id>` chosen out of a list and flattened to a bare `string` that no longer
    carries the marking that qualified it, and that is exactly the shape `PQ.value` has relative to
    `PQ.raw`. So the same rule now buys both properties rather than trading one against the other:
    `doc.getMrn()` is `undefined`, and `doc.getPatient()?.identifiers[0]` still reports
    `{root, extension: "MRN001", nullFlavor: "UNK"}` verbatim.
  - **The other identity slots are left reporting the document verbatim, deliberately.**
    `ClinicalDocument.id`, `setId`, `relatedDocument/parentDocument/id` and every entry-level `<id>`
    (the practice-, lab- and act-assigned identifiers) are only ever handed back as the whole
    datatype with the `nullFlavor` attached and the warning in `doc.warnings`. There is no
    naked-string accessor over any of them, so there is no affordance to close and nothing that
    could be withheld without losing data.
  - **`templateId` is the stated exception rather than a member of that list.** Document- and
    section-type recognition _does_ derive a reading from `templateId.@root`, so a null-marked
    `templateId` still resolves the document type and its required-section SHALL set. Left unchanged
    on purpose: a `templateId` asserts a document _shape_, not an identity for a person or a record,
    so a mis-read costs a spurious or missing `REQUIRED_SECTION_MISSING` rather than a misattributed
    clinical fact, and declining would swap a working type for `UNKNOWN_DOCUMENT_TEMPLATE`.
  - **The one exception is the emit side: `editCcda` no longer launders a null-marked identifier
    into an asserted one.** Stamping a CDA R2 `RPLC` revision copies the source's `<id>` into the new
    `relatedDocument/parentDocument`, and it copied `root`/`extension` only, silently dropping a
    `@nullFlavor`. A revision of a source whose `ClinicalDocument.id` is null-marked now throws
    `CcdaEditError` `SOURCE_MISSING_ID`, the same refusal an id-less source already got and for the
    same reason: an `<id>` marked null names no prior version for the RPLC link to replace. A
    null-marked `setId` gets the milder remedy its optionality allows, it identifies no version
    series, so it is treated as absent and a fresh series id is minted.
  - **A `manufacturedProduct` carrying BOTH arms of the CDA R2 choice no longer silently drops one
    (`MEDICATION_PRODUCT_ARM_CONFLICT`, safety-critical).** The previous slice fixed the single-arm
    case but left `manufacturedMaterial` unconditionally preferred, so a document carrying
    `manufacturedMaterial` **and** `manufacturedLabeledDrug` with different codes had one of its two
    named drugs dropped without a word. Two drugs on one medication is a contradictory document and
    nothing in it ranks the arms, so preferring one is not reporting what the document said, it is
    manufacturing a choice the document declined to make. The parser now refuses when **both** arms
    name a product and they are different (a different `@code`, or one `@code` under two different
    `@codeSystem`s): no product code is selected, `drug` / `vaccine` is `undefined`, and the new
    warning is the signal. `MISSING_PRODUCT_CODE` is deliberately suppressed behind it, because "no
    arm yielded a code" would be false, and with no code selected the code-system and terminology
    checks have nothing to run on either, which is why the new code is safety-critical and why it is
    scoped this narrowly.
  - **An arm that asserts no symbol names no product, so it never conflicts with one that does.** A
    `nullFlavor`-only `<code>`, or an arm with no `<code>` at all, is an _exceptional value_ under
    HL7 v3 rather than a competing one, the same rule `contradictsAssertedValue` applies one layer
    down. Whichever arm names the drug is read, and when neither names one the
    `manufacturedMaterial` arm is read exactly as before, so the empty-slot and code-system checks
    keep seeing the element they always saw. This is also the direction the previous
    behaviour lost data in: a `nullFlavor`-only `manufacturedMaterial` used to win over a
    `manufacturedLabeledDrug` naming a real RxNorm concept, in silence. Arms naming the **same**
    product are redundant rather than contradictory, so the material arm is read as before.
  - **`MEDICATION_PRODUCT_ARM_UNEXPECTED` now keys off the arm rather than its `<code>`**, so a
    name-only `manufacturedLabeledDrug` is reported too, and markup shape no longer decides whether
    the deviation gets flagged. Every consumable call site is covered (Medication Activity,
    Immunization Activity, Planned Medication Activity, and, from
    `CCDA-PLANNED-IMMUNIZATION-DROPPED`, Planned Immunization Activity), and nothing is lost: `serializeCcda`
    re-emits the parsed DOM, so both arms round-trip byte-for-byte.
  - **Provenance, stated rather than invented.** No normative SHALL is cited for either change and
    none is fabricated. CDA R2 declares `@nullFlavor` and `@extension` on `II` independently, and
    neither CDA R2 nor C-CDA R2.1 states which `patientRole/id` is the MRN; that
    `ManufacturedProduct` models one participant rather than two is base CDA R2 structure, but
    whether the C-CDA template forbids both arms together needs the normative R2.1 Schematron this
    repo does not hold. Both rest on HL7 v3 datatype semantics (`nullFlavor` marks an _exceptional
    value_, one with no proper value) plus the harm ordering `SAFETY_CRITICAL_CODES` encodes.

- **Clinical safety: four instances of one defect class, the parser getting quieter the more broken
  the document was.** Four new stable warning codes, three of them safety-critical.
  - **A `nullFlavor` asserted beside a populated value no longer passes silently
    (`CONTRADICTORY_NULL_FLAVOR`), and on a dose the number is withheld.** `parsePq` read `value`,
    `unit` and `nullFlavor` independently, so `<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>`
    parsed to `{value: 10, unit: "mg", nullFlavor: "UNK"}` with **no warning of any kind**, and a
    consumer reading `med.dose.value` got `10 mg` for a dose the document explicitly declared unknown.
    `MISSING_DOSE_QUANTITY` could not fire, because the element _is_ present. The warning is
    class-wide: every v3 datatype (`PQ`, `TS`, `IVL_PQ`, `IVL_TS`, `CD`, `II`, `ST`, `ED`, `BL`) routes
    its `nullFlavor` through one check, **including the `INT` and `ST` arms of `readObservationValue`,
    which are parsed inline rather than through the datatype layer**. That slot carries lab values and
    assessment-scale scores, so it had the same defect: `<value xsi:type="INT" nullFlavor="UNK"
value="12"/>` returned a score of 12 with no warning. The `integer` observation value now carries
    `raw` (the verbatim `@value` token) beside `value`, mirroring `PQ` exactly, so the contradiction is
    resolved the same way: `value` withheld, `raw` kept. The `string` observation value now carries
    `nullFlavor`, which it previously dropped from the model outright. - **The design tension, resolved rather than skipped.** A warning alone would keep the house rule
    (never coerce, surface verbatim, flag) but leave the dangerous _affordance_ intact: `dose.value`
    would still hand back `10` to the many consumers who do not read `warnings` on a first
    integration, and of the two readings the reassuring one is the one that can hurt a patient. So
    the parser also **withholds the derived reading**: `PQ.value`, `TS.date` and an `integer`
    observation value's `value` are omitted, while `raw`, `unit` and the `nullFlavor` are preserved. Nothing the document said is lost, `value` is
    not the document's bytes but a `number` the parser manufactured by interpreting `raw`, and `raw`
    survives. This is exactly what `MALFORMED_DATETIME` already does to `TS.date`, so it is the
    existing rule applied to a second reason for distrusting an interpretation, not a new one. It
    reaches interval bounds too: a `doseQuantity nullFlavor="UNK"` wrapping `<low>`/`<high>`
    withholds each bound's number, the range harm being the scalar harm by another route. - **What a naive consumer sees afterwards.** `med.dose.value === undefined` (was `10`), with
    `med.dose.raw === "10"`, `med.dose.unit === "mg"`, `med.dose.nullFlavor === "UNK"`, and
    `CONTRADICTORY_NULL_FLAVOR` in `doc.warnings`. A caller reading only `.value` now reads "no
    dose", which is what the document asserted. - **The limit, stated rather than implied.** Withholding applies only where a verbatim copy
    survives beside a derived reading, which in this model is `PQ.value`, `TS.date` and the
    `integer` observation value's `value`, and nothing else. On `CD`, `II`, `ST`, `ED` and `BL` the
    value-bearing field **is** the document's own text
    (`@code`, `@extension`, the element's content) with no second copy, so withholding it would
    delete what the document said rather than decline to embellish it. Those warn and keep the
    field: a contradicted `allergy.allergen.code` still returns the code, with `nullFlavor` on the
    same object and the warning in `doc.warnings`. That residual affordance is deliberate and
    argued, not overlooked. - **Only a value-bearing assertion contradicts**, which is what keeps the check quiet on
    conforming documents. A `PQ` `@unit` with no `@value` (a dimension without a magnitude), an `II`
    `@root` with no `@extension` (a namespace without a local identifier), and a `CD`'s
    `originalText` / `<translation>` / `displayName` / bare `@codeSystem` (the documented C-CDA
    idiom for "not codable in the bound value set, here is the source text or an alternate coding")
    all describe a null value rather than contradicting it, and stay silent. - Two consequences, named rather than left to be discovered. A contradicted `PQ` no longer reaches
    `MISSING_UNIT_ON_PQ` and a contradicted `TS` no longer reaches `MALFORMED_DATETIME`, both of
    which key off the withheld field; that is not a new silence, the stronger
    `CONTRADICTORY_NULL_FLAVOR` fires in their place. And the structural code-system tier is
    **deliberately still run on a slot that asserts no symbol**: a `nullFlavor`-only `CD` still names
    a terminology, so naming a wrong or deprecated one still draws `UNEXPECTED_CODE_SYSTEM` /
    `DEPRECATED_CODE_SYSTEM` exactly as before. Short-circuiting there would have made the parser
    quieter than it was, which is the direction this whole entry exists to reverse. That is also why
    `CONTRADICTORY_NULL_FLAVOR` is **safety-critical**
    and no profile may tolerate it. **Provenance:** no normative SHALL is cited and none is
    invented, the CDA R2 schema declares `nullFlavor` and the value attributes independently, so the
    shape is schema-valid. The rule rests on v3 datatype semantics (`nullFlavor` is a property of
    `ANY` marking an _exceptional value_, one with no proper value) and on the harm ordering
    `SAFETY_CRITICAL_CODES` has always encoded.

  - **A medication under `manufacturedLabeledDrug` no longer loses its drug
    (`MEDICATION_PRODUCT_ARM_UNEXPECTED`, `MISSING_PRODUCT_CODE`).** The drug element was hard-coded
    to `consumable/manufacturedProduct/manufacturedMaterial/code`, but CDA R2's `ManufacturedProduct`
    is a **choice** and `manufacturedLabeledDrug` is equally valid. That shape yielded
    `drug: undefined` with zero warnings while dose and route survived, so the record read as a
    well-formed medication that simply had no drug, and `checkCodeSlot` could not catch it because
    there was no code to check. Both arms are now read, at every consumable call site (Medication
    Activity, Immunization Activity, Planned Medication Activity, and, from
    `CCDA-PLANNED-IMMUNIZATION-DROPPED`, Planned Immunization Activity), and the alternate arm is flagged;
    the code then flows through the ordinary `checkCodeSlot` path unchanged. Reading it beats
    warning-and-ignoring it, the arm carries the same `CE` and silence was strictly worse.
    `MEDICATION_PRODUCT_ARM_UNEXPECTED` is deliberately **not** safety-critical, and the reason is
    conditional rather than absolute: wherever it fires **alone** a `<code>` element was selected and
    read exactly as a single-arm document's would have been, so it flags known vendor shape rather
    than lost clinical data and a profile may defensibly tolerate it; and wherever **no** element was
    selected it is not alone, because a safety-critical companion (`MISSING_PRODUCT_CODE`, or one of
    the withheld-product codes below) fires beside it and no profile may quiet those. Do not read
    the unconditional form, "the drug is present and fully checked": there are states in which no
    product code is selected at all, and each of them carries its own untolerable code. Whether the C-CDA template _forbids_ the alternate arm is a normative
    question this repo cannot settle without the R2.1 Schematron, so no conformance verb is claimed.
    The new backstop **is** safety-critical: a `substanceAdministration` whose consumable yields no
    product code on any arm raises `MISSING_PRODUCT_CODE`, never a silent `undefined`
    (`MISSING_DOSE_QUANTITY` loses how much of a known drug; this loses _which drug_). It fires at all
    three sites, the planned one included, and a planned medication reaches it only after its direct
    `<code>` is absent too. The other planned kinds are left alone: their `code` is optional and an
    absence there is not a lost drug.
    `serializeCcda` re-emits the parsed DOM verbatim, so either arm round-trips byte-for-byte;
    `buildCcda` continues to emit `manufacturedMaterial`.

  - **A coded slot present but asserting no code is no longer silent (`MISSING_CODE_VALUE`).** The
    mirror of `MISSING_CODE_SYSTEM`, which the previous slice scoped out: a `CD` at a wired `CodeSlot`
    carrying no usable `@code` (absent, empty, or whitespace) **and** no `@nullFlavor`, e.g. a
    system-only `<value codeSystem="…6.96"/>`. A system without a symbol identifies a concept no
    better than a symbol without a system. The `nullFlavor` is what separates the shapes: a
    `nullFlavor`-only `CD` is a _complete_ statement ("this concept is unknown") and stays silent,
    while one that says nothing at all leaves a reader unable to tell an absent concept from one lost
    in transformation; an absent element stays silent too. Safety-critical for the same reason
    `MISSING_DOSE_QUANTITY` is, an undeclared absence at a safety-critical slot, and effectively the lone
    signal, since with no symbol there is nothing for a `TerminologyAdapter` to recognise and
    `SEMANTIC_CODE_INVALID` is not a signal that can be relied on behind it.

  - **`SAFETY_CRITICAL_CODES` is now genuinely immutable.** `Object.freeze(new Set(...))` seals own
    properties but leaves `Set.prototype.delete` free to mutate the internal slot, so
    `SAFETY_CRITICAL_CODES.delete(code)` succeeded and the `Object.isFrozen` assertion covering it
    proved nothing about the contents of the set that guards every safety-critical code. It is now a
    frozen read-only view over a `Set` reachable from nowhere else: `add` / `delete` / `clear` are not
    properties of it at all, so calling one throws `TypeError`, and the freeze stops anyone bolting
    one on. The full read surface (`has`, `size`, `keys`, `values`, `entries`, `forEach`, iteration)
    is unchanged, and the test now asserts the mutations are refused and the guarded codes survive.
    **The one behavioural difference, disclosed rather than glossed:** the exported value is no longer
    a `Set` _instance_, so `SAFETY_CRITICAL_CODES instanceof Set` is now `false`,
    `JSON.stringify(SAFETY_CRITICAL_CODES)` is `{"size":N}` rather than `{}`, and `Object.keys(...)`
    lists the view's read methods rather than being empty. Every read _operation_ behaves identically,
    including spread and set-like consumption.

  - Adding warning codes is a public-surface change on the `0.0.x` ladder: a consumer switching
    exhaustively on `WarningCode` will see four new members, and `PQ.value` / `TS.date` are now absent
    on a contradicted value where they were previously populated. Every positive regression test was
    proven to fail without the fix; the negatives pin the shapes that must stay silent.

- **Clinical safety: a `@code` asserted with no `@codeSystem` no longer passes silently
  (`MISSING_CODE_SYSTEM`).** `checkCodeSlot` opened with `if (code?.codeSystem === undefined) return;`,
  so a `CD` carrying a `@code` but no `@codeSystem` reached **neither** the structural tier
  (`SLOT_BINDINGS` deprecated / expected checks) **nor** the bring-your-own `TerminologyAdapter`, and
  emitted no warning of any kind. A document built with an adapter configured to reject everything
  produced zero warnings and never consulted the adapter. That is the dangerous direction: a code
  without its system is not a code (`250.00` is diabetes in ICD-9-CM and an unrelated concept
  elsewhere), and the parser got quieter the more broken the input was.
  - The new stable warning code **`MISSING_CODE_SYSTEM`** fires at all five wired `CodeSlot`s
    (`problem`, `medication`, `allergen`, `route`, `vaccine`, so at all **seven** call sites:
    medication and immunization each contribute a route, and the `medication` slot is reached from a
    performed Medication Activity's drug and from a planned one's alike).
  - **Nothing is inferred.** No system is guessed from the slot's expected list or from a
    `@codeSystemName` label (display text, not an identifier), and the value is preserved verbatim. The
    adapter is still not consulted, correctly: it validates a system + code pair, and there is no
    system, which is precisely why the structural warning is the only signal such a value can get.
  - **Absence stays silent.** An absent value, and a `CD` that asserts no `@code` at all (the
    `nullFlavor`-only shape), warn nothing, there is no concept being asserted. Within this check a
    `nullFlavor` alongside an asserted `@code` does **not** buy silence: the symbol is still
    unreadable, and an exceptional-value marker must not become the escape hatch that re-hides the
    deviation. (A `nullFlavor` beside a fully coded value is a separate shape, unchanged here and
    still unflagged.)
  - **`MISSING_CODE_SYSTEM` is safety-critical** (`SAFETY_CRITICAL_CODES`), so no vendor profile may
    tolerate it. It is strictly worse than `UNEXPECTED_CODE_SYSTEM` (already in the set): there the
    system is wrong but known, so a reader can still tell what was meant; here the symbol names no
    terminology at all. It is also the _lone_ signal, the `MALFORMED_DATETIME` argument, since
    `SEMANTIC_CODE_INVALID` can never fire behind it. Tolerating it would restore the exact silent
    pass this fixes. **Provenance:** no normative SHALL is cited and none is invented, the CD datatype
    leaves `@codeSystem` optional. Both the warning and its safety classification rest on the
    datatype's own semantics (a `@code` is a symbol defined _by_ a code system) and on the harm
    ordering `SAFETY_CRITICAL_CODES` has always encoded.
  - The shipped sentence "a clean run means those five slots passed" was **false** for this shape and
    is no longer, which is why the fix is upstream rather than a doc hedge. The docs are updated with
    it, and now also state the two remaining precisions rather than leaving them implied: within the
    five slots the checks cover the **primary** coding (alternate codings in `<translation>` are
    preserved and re-serialized but not themselves slot-checked), and a slot asserting no code at all
    is not judged, there is nothing there to check.
  - Adding a warning code is a public-surface change on the `0.0.x` ladder: a consumer switching
    exhaustively on `WarningCode` will see the new member.

- **Phase 7 (twenty-second slice): `editCcda` no longer emits an id-less RPLC `parentDocument` (CDA R2
  SHALL fix).** `stampRevision` appended the parent `<id>` only when the source `ClinicalDocument`
  carried one, while `deriveNewDocId` always minted the new document's id, so revising a source with no
  `<id>` produced a `<relatedDocument typeCode="RPLC"><parentDocument>` with `code`/`setId`/`versionNumber`
  but **no `<id>`**. That violates `POCD_MT000040.ParentDocument.id`, which is `1..*` SHALL: grounded
  firsthand against `HL7/CDA-core-2.0` `schema/normative/infrastructure/cda/POCD_MT000040.xsd`
  (`<xs:element name="id" type="II" maxOccurs="unbounded"/>`, no `minOccurs` ⇒ default `1`). The source
  itself was also invalid: `ClinicalDocument.id` is `1..1` SHALL there. `editCcda` now **refuses** to
  stamp a revision of an id-less source, throwing the new stable `CcdaEditError` code `SOURCE_MISSING_ID`
  rather than mint a fabricated parent identifier for a document that provably has none: the RPLC link
  exists to name the replaced version by its id, and a random id would make that clinical link look valid
  while pointing at nothing real (conservative-emit + never-fabricate). Refusal is scoped to the revision
  path: `revision: false` still edits an id-less source in place (no `parentDocument`, no id requirement).
  A source **with** an id is byte-unchanged. New `SOURCE_MISSING_ID` value on the `CcdaEditErrorCode`
  union (additive); regression tests cover the id-less parse path (throws), the in-place `revision: false`
  escape, and the build path (`buildCcda` always mints an id, so its RPLC parent always carries one).
- **Phase 7 (sixteenth slice): the builder emits `<text>` in CDA R2 element-sequence order for
  Problem, Allergy, and Smoking Status observations.** The base CDA R2 schema
  (`POCD_MT000040.Observation`) is an `xs:sequence` (`code`, `text`, `statusCode`, `effectiveTime`, …,
  `value`, …) so the narrative `<text><reference>` slot MUST precede `statusCode`/`effectiveTime`/`value`.
  Three builders emitted it out of order: `problemObservation` (`…22.4.4`) and `smokingStatusEntry`
  (`…22.4.78`) appended `<text>` **after** the `value`, and `allergyEntry` (`…22.4.7`) appended it **after
  every `entryRelationship`**: each an XSD-invalid document that would fail the core-CDA-R2 XSD stage
  before the R2.1 Schematron even runs. All three now emit `<text>` immediately after `<code>`, matching
  the position every other observation/act builder in the file already used (e.g. `resultObservation`,
  `plannedItemEntry`). Grounded firsthand against `POCD_MT000040.xsd` (`HL7/CDA-core-2.0`): `text` sits
  after `code`, before `statusCode`, in `Observation`/`Act`/`Procedure`/`SubstanceAdministration`/
  `Encounter`/`Supply` alike. Byte-order-only within each element's children: the lenient parser reads
  `<text>` regardless of position, so the round-trip model is unchanged and no warning code or public API
  moves. A new `test/builder.test.ts` block asserts the `text < statusCode`/`value` ordering per emitted
  observation (a genuine regression guard: it fails against the pre-fix emit).
- **The release can actually bump the version.** `package.json` had no `version` script, so the
  shared pipeline's `pnpm run version` failed with `Command "version" not found` and the release
  aborted before opening a "Version Packages" PR. Adds `scripts/sync-version.mjs` (the `hl7`
  reference, retargeted at `src/index.ts`) and the `version` script that runs it after
  `changeset version`, so the bump and the `VERSION` constant land in the same commit.
- **`VERSION` is no longer typed as a string literal.** It was declared `export const VERSION =
"0.0.0"`, giving it the literal type `"0.0.0"`, so the exported type would change on every
  release, making each version bump a breaking type change. Now annotated `: string`, matching the
  `hl7` reference. Type-only; the runtime value is unchanged. Done now because the package is
  unpublished: after the first publish this would itself be a breaking change.

- **The Release workflow can actually start.** `.github/workflows/release.yml` calls the shared
  `cosyte/.github` pipeline, which requests `contents`/`id-token`/`pull-requests: write`, but declared
  no `permissions:` of its own, so it inherited the repo default of `contents: read`. A called
  workflow may only downgrade the caller's `GITHUB_TOKEN`, never escalate it, so GitHub rejected the
  workflow at startup (~1s, no jobs, no logs). Every Release run from June 2026 until now failed this
  way, unnoticed, because a `startup_failure` produces no logs to read. The caller job now declares
  the three scopes explicitly. CI-only: no runtime or API change.
