#!/usr/bin/env bash
# scripts/check-no-internal-refs.sh
#
# Founder directive, 2026-07-27: NO INTERNAL PROJECT BOOKKEEPING ON A PUBLIC SURFACE.
# Anything a consumer reads (a GitHub release body, README.md, docs-content/, the npm
# package description, a warning message, the JSDoc their editor renders) describes what
# the software does and what changed. It must never carry our internal bookkeeping: item
# identifiers (`CCDA-P7`, `CCDA-PLANNED-CODE-SLOT`), "Phase 1" / "roadmap Phase K", sweep
# and programme names, ADR numbers, internal repo paths, or process commentary about how
# the artifact came to exist. Source of truth: the meta-repo's
# `documentation/conventions.md`, "No internal project bookkeeping on a public surface".
# The founder's words: "The releases should also not speak on anything regarding phases,
# etc. That has no relevance to the user consuming it. This goes for readmes and
# documentation as well."
#
# WHY THIS IS A GATE AND NOT A MEMORY NOTE. Founder, same day: "it needs to not just be
# a memory note, but something that is addressed in the workflow accordingly. This needs
# to not happen again." A one-time sweep regresses the first time someone writes
# `(CCDA-P8)` into a README. A documented rule governs whoever reads it; a gate governs
# everyone.
#
# WHERE THE IDENTIFIERS DO BELONG, and therefore what this gate deliberately does NOT
# scan: the changeset, CHANGELOG.md, commit messages, the PR title and body, CLAUDE.md,
# `docs/adr/`, source `//` comments, and the meta-repo. The traceability is real and worth
# keeping; it just belongs on the inside. So this is a translation at the boundary, not a
# deletion, and the boundary is what SCAN SURFACE below defines.
#
# ---------------------------------------------------------------------------
# WHAT IS LIFTED FROM WHERE, AND WHAT IS DELIBERATELY NOT.
#
#   * THE SHAPE IS `ncpdp`'s COPY, NOT `hl7`'s, and that choice is deliberate rather than
#     alphabetical. `hl7`'s `scripts/check-no-internal-refs.sh` is the original the siblings
#     copy, but it is missing three things that were added downstream and that this repo
#     needs: the `src/` STRING-LITERAL fourth pass (a warning message reaches a consumer's
#     terminal, and this package has one carrying "a later phase" today), the PLURAL phase
#     stem (`phases?`), and `/` in the ADR separator class (this repo cites its own ADR by
#     PATH, `docs/adr/0001-xml-parser.md`, which a space-or-hyphen class walks past).
#     Porting `hl7` would have shipped a gate blind to all three. What `hl7` carries and
#     this does NOT: its `CSP`/`PKG` guards, its `HL7-\d{3,4}` exclusion and its
#     standards-designation list are HL7 v2 vocabulary with no C-CDA counterpart.
#
#     RULE 7 IS TAKEN FROM `cli`'s COPY, which is the only sibling that has it. See its own
#     note below; it is the rule that catches a PROSE citation of the roadmap, which the
#     path-keyed rule 5 structurally cannot see, and it is not decoration here: this repo
#     carries live instances of exactly that form.
#
#     What is carried across verbatim because it is genuinely cross-repo: the prefix list,
#     the paragraph-join second pass, the doc-comment third pass, the string-literal fourth
#     pass, the silent-green route closures, and the NEGATIVE self-tests. What is
#     RE-DERIVED FOR C-CDA and must not be assumed inherited: the scan surface, the
#     standards-designation exclusions, the phase rule's clinical guards and its
#     roman-numeral arm, the slice rule's noun exclusions, and every self-test sample.
#
#   * THE DETECTION RULES ultimately come from `cosyte/.github`
#     `scripts/release-notes.mjs` (its `CONTENT_RULES`), which is validated against every
#     published release body across the org. This file transcribes the prefix-keyed set to
#     PCRE. THE REASONING IS KEPT WITH THEM ON PURPOSE. Every one of the traps recorded
#     here shipped a public defect before it was caught, and a reader who has not hit them
#     will tidy the guard away as over-complication.
#
# ---------------------------------------------------------------------------
# THE FOUR TRAPS THAT BREAK A NAIVE DETECTOR. All four are why this file is not a
# one-line grep. Do not "simplify" past them.
#
#   (1) KEY ON KNOWN PROJECT PREFIXES, NEVER ON THE `WORD-N` SHAPE. MEASURED ON THIS TREE
#       rather than inherited, and ENUMERATED so a later reader can re-run it: a naive
#       `WORD-N` rule over README.md, LICENSE and docs-content/ matches exactly 21 distinct
#       tokens, and EVERY ONE OF THEM IS THE CONSUMER'S REFERENCE MATERIAL. All 21, in
#       full: `ICD-10-CM`, `ICD-9-CM`, `ICD-9`, `PHQ-9`, `UTF-8`, `W3C-DOM`, `MRN-00042`,
#       `MRN-00099`, `MRN-0001`, `DOC-1`, and `DOC-0001` through `DOC-0011`. ZERO of the 21
#       are ours. The same rule over `src/` adds `ICD-10-PCS`, `CPT-4`, `TOP-LEVEL` and the
#       synthetic `SYNTH-9` in `pickMrn`'s `@example` -- those four are `src/`-only and are
#       NOT on the markdown surface, which an earlier draft of this paragraph got wrong.
#       A shape rule here does not merely over-report; it instructs a remediator to corrupt
#       diagnosis codes.
#
#       THE COLLISION THAT MATTERS IN THIS REPO IS `CCDA-` ITSELF, and it resolves the
#       opposite way to `ncpdp`'s. There, `NCPDP-SCRIPT` and `NCPDP-TELECOM` are the
#       standard's own designations and had to be exempted by hand. Here the standard is
#       written `C-CDA` (or `CDA R2`), WHICH THIS RULE CANNOT MATCH AT ALL -- there is no
#       `CCDA` token in it -- while every `CCDA-` token measured in this tree is one of our
#       items (`CCDA-P7`, `CCDA-PLANNED-CODE-SLOT`,
#       `CCDA-PLANNED-MED-ARM-CONFLICT-UNREACHABLE`). So the exclusion list does almost no
#       work for this package's OWN standard, and `CCDA-R\d` is retained in it as the one
#       plausible future designation form rather than as a live need. Do not read the short
#       exclusion list as evidence the trap is absent; it is absent from the exclusion list
#       because it lands in the prefix list instead.
#
#       The cost of keying on prefixes is that a NEW PROGRAMME MEANS ADDING ITS PREFIX to
#       the list below, and nothing will catch it until someone does. That is the cheaper
#       of the two mistakes.
#
#   (2) DECAPITATION, which is a rule for the person REMEDIATING a hit, not for the
#       scanner, AND THIS REPO IS THE ONE THAT SHIPPED IT. Stripping an identifier off the
#       FRONT leaves the fragment behind: "Phase 7 (thirteenth slice): builder emits X
#       (CCDA-P7)" became "(thirteenth slice): builder emits X" across 17 lines of THIS
#       package's published release notes, which is worse than the text it replaced. Repair
#       the head: drop a leading orphan parenthetical, strip leading punctuation,
#       recapitalise. Same mid-sentence: "(of the v2.4 capability arc)" reads worse than no
#       parenthetical at all.
#
#   (3) CASE SENSITIVITY. The identifier rule is case-SENSITIVE and the segment after the
#       hyphen must start uppercase or with a digit, which is what lets `FHIR-bridge` and
#       `docs-content/` through. Leading digits are fine too, and they are load-bearing
#       here: C-CDA conformance statements are written `CONF:1098-30468`, LOINC codes
#       `62387-6`, and ONC criteria `170.315(b)(1)`. Nothing in this file keys on a leading
#       number.
#
#   (4) PHASE PATTERNS NEED A LETTER SUFFIX (`Phase 5b`) AND A LETTER-ONLY FORM
#       (`Phase W`): a digits-only pattern misses both. Ordinal `slice` and `wave` are
#       ours too ("thirteenth slice", "second wave"): "slice" is our word for a unit of
#       work and a reader does not have it. In prose it should read "change".
#       THE DETERMINER AND EXCLUSION CLASSES AROUND THIS RULE ARE RE-DERIVED FOR THIS REPO
#       AT RULE 2 AND MUST NOT BE INHERITED WHOLESALE FROM A SIBLING; the measurement that
#       sets them is written down there.
#
# ---------------------------------------------------------------------------
# SCAN SURFACE. This gate scans the PUBLIC surface only, which is the one substantive
# difference from check-no-emdash (that one scans every tracked file, because the em-dash
# ban has no inside/outside distinction: it covers commit messages too). Here the same
# identifier is REQUIRED on the inside and BANNED on the outside, so scanning every
# tracked file would red on CHANGELOG.md, `.changeset/`, CLAUDE.md and source comments,
# where the convention explicitly says the identifiers belong. A gate that reds on
# correct content is a gate someone deletes.
#
# In scope:
#   * README.md            the repo's front page, and shipped inside the npm tarball
#   * LICENSE              shipped inside the npm tarball
#   * docs-content/        every tracked file, including sidebars.json: this is the
#                          content published to docs.cosyte.com
#   * package.json         the npm-visible metadata ONLY (`description`, `keywords`),
#                          extracted and scanned as text. Named explicitly by the
#                          convention. The rest of package.json is not public prose, and
#                          scanning it whole would red on a future dependency or script
#                          name that happens to match.
#
# THIS REPO HAS NO `KNOWN-LIMITATIONS.md` AND NO `TRADEMARKS.md`, which ncpdp's copy of
# this list names. They are absent from SURFACE_PATHS rather than silently dropped: the
# tracked-path tripwire below refuses on a named path that is not tracked, so listing a
# file this repo does not have would red on every run. The boundary list that
# KNOWN-LIMITATIONS.md holds elsewhere lives inside README.md here, which IS scanned.
#
# Out of scope, each for a stated reason:
#   * CHANGELOG.md         SETTLED, NOT CONTESTED. It ships inside the npm tarball, which
#                          is why every repo running this sweep flagged it and why ncpdp's
#                          copy of this note records it as an open ecosystem-wide question.
#                          THAT QUESTION WAS DECIDED BY THE FOUNDER ON 2026-07-29:
#                          CHANGELOG.md is FORMALLY EXEMPT ORG-WIDE. An item reference in a
#                          changelog reads as PROVENANCE, which is ordinary open-source
#                          practice, not the company talking to itself. So this is a
#                          decision carried, not a contradiction deferred: no sweep, no
#                          strip, and do not re-litigate it here.
#                          THE EXEMPTION IS `CHANGELOG.md` AND NOTHING ELSE. It does not
#                          reach release bodies, README.md, docs-content/, the npm
#                          metadata, or any built `.d.ts`, all of which this gate covers.
#   * docs/adr/            THIS REPO'S OWN ARCHITECTURE DECISION RECORDS, and the one scan
#                          surface decision that differs from hl7 by more than a filename.
#                          `docs/adr/0001-xml-parser.md` records why `@xmldom/xmldom` is
#                          the one runtime dependency. It is not in package.json `files`,
#                          it is not published to docs.cosyte.com (only `docs-content/`
#                          is), and an ADR is BY DEFINITION a record of how the artifact
#                          came to exist -- which is the exact category the convention
#                          names as internal. Rule 3 below bans ADR numbers on the public
#                          surface; scanning the ADR itself would red on a file whose whole
#                          job is to carry one.
#   * phi-scan-overrides.md
#                          the audit log for fixture-level PHI-scan bypasses. Internal
#                          compliance bookkeeping, not consumer documentation.
#   * CLAUDE.md, .github/, .changeset/, scripts/, test/
#                          internal by definition, or code rather than prose.
#   * src/ DOC COMMENTS    IN SCOPE, as a THIRD PASS at the bottom of this file, with its
#                          own rule array (SRC_RULE_PATTERN), its own self-tests, and its
#                          own extractor. `src/` JSDoc IS public: it is compiled into
#                          `dist/index.d.ts` and `dist/index.d.cts`, `dist` is the first
#                          entry in package.json's `files`, and it is what a consumer's
#                          editor shows on hover.
#   * src/ `//` COMMENTS   OUT of scope, because THE CONVENTION SAYS SO: it names source
#                          comments as one of the places identifiers BELONG. That is the
#                          whole reason, and it is deliberately the only one.
#                          DO NOT REASON ABOUT THIS BOUNDARY FROM WHAT REACHES `dist/`.
#                          Two drafts of ncpdp's copy tried and both were false, each
#                          caught by a refuter: "`//` comments do not reach `dist`" and
#                          then "they do not reach `dist/*.d.ts` or `dist/*.js`, checked"
#                          (`dist` contains no `*.js` at all; tsup emits `.mjs`/`.cjs`, so
#                          that glob matched nothing and the check could not see its
#                          subject). RE-MEASURED HERE rather than inherited, on the built
#                          tree of this package: `dist/index.mjs` carries 305 whole-line
#                          `//` comments verbatim, and `dist` contains no `*.js`.
#                          `dist` is `files[0]`, there is no `.npmignore`, the
#                          bundles carry source comments and `dist/*.map` carries every
#                          tracked source byte in `sourcesContent`. SO EVERYTHING IN `src/`
#                          IS IN THE TARBALL. This gate's line is therefore not "what
#                          reaches the consumer's disk" -- everything does -- but WHAT THE
#                          CONSUMER IS SHOWN: JSDoc their editor renders on hover, and
#                          message text their log prints. Those are passes three and four.
#                          A comment they would have to go digging for is not.
#   * dist/                NOT SCANNED, and this is the gate's stated ceiling rather than a
#                          hole that has been closed. `dist/` is untracked build output:
#                          neither this script nor CI can read it without building first,
#                          and this script does not build. What the third pass gates is
#                          dist's SOURCE, which is a proxy that holds only because the dts
#                          build copies doc text verbatim. A build that began transforming
#                          comments would decouple the two silently.
#
# ---------------------------------------------------------------------------
# NO STDIN / PR-TEXT MODE, deliberately, and this is the other difference from
# check-no-emdash. That gate scans the PR title, body and commit messages because the
# brand rule names commit messages explicitly. This rule says the opposite: identifiers
# BELONG in the commit, the PR and the changeset. A PR-text half here would red on correct
# work. If you are looking for the half that keeps identifiers out of a published RELEASE
# BODY, it exists and it is not here: `cosyte/.github` `scripts/release-notes.mjs assert`
# runs inside the shared release pipeline and refuses to publish a violating body.
#
# ---------------------------------------------------------------------------
# DISCLOSED RESIDUALS. Known and stated rather than discovered later.
#
#   (i)   THE PREFIX LIST IS DUPLICATED across every copy of this gate and against
#         release-notes.mjs, because a bash gate inside a parser repo cannot import from
#         `cosyte/.github` and vendoring a 900-line Node script into 11 repos is worse. So
#         the copies can drift: a prefix added there does not appear here. The cross-repo
#         fix is one shared list (published as data by `cosyte/.github`, or as a
#         `@cosyte/*` package), and it is ONE fix across every copy rather than one per
#         repo. Do not patch this copy alone; a divergent variant is worse than a known
#         shared limit. THE DELIBERATE DIVERGENCES IN THIS COPY, each with its reason at
#         the line itself: `SYNTH` absent from the prefix list; the two digit-shaped `X12`
#         arms dropped from the designation list; the phase rule's clinical lookbehinds
#         narrowed and its roman-numeral arm widened; rule 7 added from `cli`; and the
#         wrapped-hit de-duplication made per-rule instead of cumulative.
#   (ii)  The scan reads file CONTENTS, never file NAMES. A tracked path that itself
#         carries an identifier passes green. Shared with check-no-emdash.
#   (iii) An identifier inside a fenced code block, a URL, or a link target is treated
#         exactly like prose. That is deliberate (a reader sees it either way), but it
#         means a legitimate quotation of an internal path in an example would have to be
#         rewritten rather than escaped.
#   (iv)  This gate does not check the em dash. `scripts/check-no-emdash.sh` owns that
#         rule and scans a wider surface; duplicating it here would put the same red in
#         two places with two wordings.
#   (v)   IT CATCHES IDENTIFIERS, NOT PROSE ABOUT OUR PROCESS. The founder's rule bans
#         both, and on this tree the by-hand half found SEVEN things no pattern here would
#         ever have matched, every one of them live on a surface a consumer reads:
#           * "There are no phase numbers here on purpose: a version you can install should
#             tell you what it does, not which milestone it stopped at."
#             (docs-content/troubleshooting.md, a page explaining OUR release bookkeeping
#             to a consumer. It reds only because rule 2's `number` exemption was dropped;
#             it would have survived hl7's copy untouched.)
#           * "every claim was checked against the shipped source before it was written"
#             (same page: a claim about our authoring process, not about the software).
#           * "**Residual (not yet closed):**" (README.md, our work-tracking vocabulary as
#             a consumer-facing heading; now "**Limitation:**").
#           * "(no external C-CDA/Schematron IG validator was reachable in the build
#             environment)" (README.md, a fact about OUR machine).
#           * "ratified by an ADR" and "adds none without an ADR"
#             (docs-content/installation.md: BARE `ADR`, no number, so rule 3's `\d{3,4}`
#             floor cannot see either).
#           * "belongs in its own slice" (a doc comment on a PUBLISHED builder type:
#             `its` is not in rule 4's determiner class).
#           * "which is what this docblock claimed until the claim was checked" and
#             "this said \"SHOULD [0..1]\" flatly until the claim was checked" (published
#             builder types again, narrating our own editing history to a consumer).
#         THE BY-HAND HALF IS NOT CLAIMED COMPLETE, and should not be. What was
#         DELIBERATELY LEFT STANDING, so a later reader does not mistake it for a miss:
#         the "this repo cannot settle X without the normative R2.1 Schematron" clauses in
#         `src/parser/warnings.ts` and `src/model/entries/plan-of-treatment.ts`. They read
#         like process commentary and are not: each BOUNDS a safety-critical claim, and
#         deleting one would silently promote "this may be a template violation" into "this
#         is a template violation". Cutting the qualifier that bounds a claim is not the
#         same act as cutting the claim, and only the second is what this rule asks for.
#         The gate raises the floor; it does not replace the reviewer.
#   (vi)  `phase` AT THE END OF A CLAUSE IS NOT CAUGHT. Measured rather than assumed:
#         rule 2 DOES catch the running-prose forms, because it keys on `phase` plus a
#         following word, so `phase models`, `phase recognizes` and `phase opens` all red.
#         What escapes is `phase` with nothing after it but punctuation or a line end,
#         which is the shape of "the sections decoded this phase." and of a markdown
#         heading ending in the word. MEASURED HERE RATHER THAN INHERITED: of this tree's
#         77 occurrences of the stem, 70 are followed by a word and only 7 end a clause, so
#         unlike in ncpdp this residual is the MINORITY shape. It still cost the one
#         runtime message this gate's fourth pass exists for. A rule for the determiner form was
#         written, measured and REMOVED in the hl7 copy because of what it cost in clinical
#         phrasing ("the phase of the clinical study", "the phase of illness"), and that
#         verdict is inherited rather than re-litigated. It is a reviewer's catch. The
#         paragraph-joined second pass narrows it: `phase` at a line end that is followed
#         by more prose in the same paragraph DOES red, because the join makes the next
#         word adjacent.
#   (vii) `D-NN`-STYLE SINGLE-LETTER INTERNAL LABELS ARE NOT CAUGHT, deliberately, and the
#         reason is clinical rather than stylistic. Catching them needs a single-letter
#         prefix, and that is trap (1) with a sharp edge in a clinical-document package:
#         legacy SNOMED RT codes are axis-prefixed in exactly that shape (`D-13000`
#         topography, `T-32000`, `M-80003`) and a C-CDA carried forward from an R1.1-era
#         system can still hold them, which is the exact corpus the `legacyR11` profile
#         exists for. `P00-P96` (an ICD-10-CM range) sits in the same neighbourhood. This
#         repo does not use `D-NN` labels today; the non-catch is stated so a future one is
#         a known gap rather than a surprise.
#  (viii) A VIOLATION SPLIT BY INLINE MARKUP REJOINS IN NEITHER PASS. `phase **8**` and
#         `phase [8](...)` put markup between the two tokens, and neither the line scan nor
#         the paragraph join strips it, so a multi-token rule does not match. Closing it
#         needs a markdown renderer, not a bigger regex. Stated because a reader of the
#         second pass could otherwise assume it normalises markup as well as whitespace.
#         REACHABLE HERE: this repo's docs bold their emphasis heavily.
#   (ix)  THE THIRD PASS CANNOT SEE `dist/`, only its source. Stated at length in the pass
#         itself and in SCAN SURFACE above, and repeated here because it is the single most
#         important thing to know about what this gate does and does not prove.
#   (x)   RULE 4 (`slice`) FALSE-POSITIVES ON "the slice of Y" IN CODE PROSE, where `slice`
#         means portion and is nobody's jargon. ncpdp found two such instances; this tree
#         found ZERO -- all 22 of its `slice` hits were our unit-of-work sense, 11 of them
#         the literal phrase "**This slice adds ...**" opening a paragraph of the PUBLISHED
#         `buildCcda` docblock. So the residual is carried from the sibling rather than
#         observed here. If an instance appears where no rewrite reads well, that is the
#         signal to narrow the rule and assert the phrasing in SRC_NEGATIVE[3], not to
#         widen an exclusion quietly. "portion" and "substring" are the clearer words.
#  (xiii) `//` LINE COMMENTS ARE NOT SWEPT AND FIVE ARE LIVE, which is a boundary rather
#         than a backlog. `src/parser/templates.ts` cites "the roadmap's root-primary
#         contract", `src/model/code-systems.ts` twice says "this slice", and
#         `src/builder/build-ccda.ts` twice says "a later slice". Rule 7 and rule 4 would
#         all match them; the extractor skips them on purpose, because the convention names
#         source comments as a place the traceability BELONGS and pass four skips
#         whole-line comments for the same reason. Named here so a reader who greps `src/`
#         and finds them knows the gate saw them and declined, rather than assuming a hole.
#   (xi)  A DOC COMMENT THAT DOES NOT OPEN ITS OWN LINE IS INVISIBLE TO THE THIRD PASS. The
#         extractor enters a block only on `^[[:space:]]*/**`, so `const x = 1; /** ... */`
#         is scanned by neither pass 3 (never entered) nor pass 4 (not a string literal).
#         Checked: a seeded violation in that position prints OK. It is not fixed because
#         entering mid-line means tracking whether the `/**` is itself inside a string or a
#         regex, which is a tokenizer. Prettier puts a doc comment on its own line and
#         `format:check` runs ahead of this gate on the ladder, so the construct does not
#         occur in this repo today. Found by a refuter, stated rather than left implicit.
#  (xii)  MEASURE ON THE REFLOWED TEXT, NOT LINE BY LINE, when you sweep by hand. hl7's
#         `Plan N` sweep was done with a line scan and reported itself complete while one
#         instance survived where `Plan` ended a line and `04` began the next; it shipped
#         into `dist/`. That is the same wrap blindness this gate's second and third passes
#         exist for, arriving in the REMEDIATION rather than in the detection. Also: QUOTE
#         A COUNT WITH THE TREE IT WAS TAKEN ON, OR NOT AT ALL.
#
# Run it locally with `pnpm check:no-internal-refs`.
set -euo pipefail

# LOCALE PIN, load-bearing, and inherited from check-no-emdash for the same measured
# reason: `grep -P` compiles PCRE in UTF-8 mode only when the locale says so. Under
# LC_CTYPE=POSIX (a bare container, cron, `sh -c`) GNU grep's handling of non-ASCII in the
# input and of `\w` in the pattern changes, and the docs scanned here contain non-ASCII
# (the en dash in "Phases 6-7", `§`, curly quotes). A gate whose matching depends on an
# inherited environment is a gate that reports green somewhere and red elsewhere.
export LC_ALL=C.UTF-8

# ---------------------------------------------------------------------------
# THE BANNED SET, transcribed from release-notes.mjs CONTENT_RULES
# ---------------------------------------------------------------------------

# Known project and programme prefixes. THE KEYING IS ON THESE, NEVER ON THE `WORD-N`
# SHAPE: see trap (1) above. Order matters only for readability. Kept in the same order as
# the source list so a diff between the copies is legible.
#
# TWO PREFIXES ARE DELIBERATELY ABSENT and are present in the source list.
#
#   * `SYNTH` -- absent in ncpdp's copy for a reason that holds here too, re-measured
#     rather than assumed. This package's `@example` blocks and docs use SYNTHETIC
#     identifiers that say so in their value (`SYNTH-9` in `pickMrn`'s example, alongside
#     `MRN-00042` and `DOC-0001`). That naming is not decoration, it is the PHI discipline
#     made visible in the sample a consumer copy-pastes. With `SYNTH` in the list this gate
#     reds on correct example data and tells the remediator to rename it, which is trap (1)
#     arriving through the LIST rather than through the pattern. Dropping it costs one
#     meta-repo prefix that has never been minted as a ccda item. Asserted in NEGATIVE[0]
#     and SRC_NEGATIVE[0] so a later "resync with hl7" cannot quietly delete it.
#   * `PKG` -- absent for hl7's reason rather than one of ours (`PKG-1` and `PKG-4` are
#     HL7 v2 Chapter 17 Item Packaging segment-field references). Kept absent here so the
#     copies stay diffable, and because it has never been minted as an item anywhere.
#
# `DOC` AND `MRN` ARE NOT ADDED, and that is worth saying because this tree contains
# `DOC-0001`..`DOC-0011`, `DOC-1`, `DOC-2` and `MRN-00042`. They are synthetic document and
# record identifiers in runnable examples, not programme prefixes. `DOCS` (the sibling
# repo) IS in the list and does not reach them: it requires the literal `DOCS-`.
PROJECT_PREFIXES='PARSERS-PUBLIC|DOCS-CONTENT|KNOWLEDGEBASE|TERMINOLOGY|PATHWAYS|TRANSFORM|WEBSITE|STAGING|SUPPLY|NCPDP|ASSETS|EMDASH|README|CONFIG|DICOM|DEID|CCDA|ASTM|MLLP|FHIR|CREW|DOCS|PERF|SYNC|VERSION|PUBLIC|HL7|X12|IAC|CLI|KB|PW|PUB|CI|REAL|TERM|WF|VERIFY'

# STANDARDS DESIGNATIONS THAT COLLIDE WITH THE PREFIX LIST, excluded explicitly. Nine of
# the prefixes above (`NCPDP`, `HL7`, `X12`, `DICOM`, `FHIR`, `CCDA`, `ASTM`, `MLLP`,
# `TERM`) are the names of standards this ecosystem parses as well as the names of our
# projects. There is no shape that separates a designation from an item, so the separation
# is an explicit, reviewable exclusion list, which is the same bargain as keying on
# prefixes in the first place: it must be extended by hand, and that is the cheaper
# mistake. Every entry here is asserted in this rule's NEGATIVE sample.
#
# THIS PACKAGE'S OWN STANDARD DOES NOT NEED THE LIST, WHICH IS THE OPPOSITE OF `ncpdp`,
# and the difference is typographic rather than philosophical. There, `NCPDP-SCRIPT` and
# `NCPDP-TELECOM` are the designations a consumer came to read about and had to be
# exempted one by one. Here the standard is written `C-CDA`, `CDA R2` or `C-CDA R2.1`, and
# NONE of those contains a `CCDA` token, so the identifier rule cannot reach them and no
# exclusion is required. Measured on this tree: every `CCDA-` occurrence in tracked
# `src/`, README.md, LICENSE and docs-content/ is one of our item identifiers, and
# `CCDA-R` appears zero times. `CCDA-R\d(?:\.\d)?` is kept anyway as the one plausible
# FUTURE designation form -- if someone writes `CCDA-R2.1` in a docs page it must survive
# -- and is asserted in NEGATIVE[0] so it cannot be dropped without the self-test noticing.
#
# THE SIBLING ARMS ARE KEPT DESPITE MEASURING ZERO, and that is a deliberate divergence
# from the reasoning ncpdp used to drop hl7's `HL7-\d{3,4}`. That drop was sound because a
# bare-digits-after-prefix arm shelters the exact shape of an item identifier. These arms
# do not: every one of them requires a LETTER or a version marker after the hyphen
# (`HL7-V3`, `FHIR-R4`, `DICOM-SR`, `NCPDP-SCRIPT`), so none can shelter a `<PREFIX>-<n>`
# item. A C-CDA package is the one most likely in the suite to cite a neighbouring
# standard in prose -- CDA sits under HL7, and C-CDA-to-FHIR mapping is the question this
# package's readers arrive with -- so a false red there is the likelier failure than a
# sheltered identifier. THE TWO DIGIT-SHAPED ARMS ARE DROPPED for ncpdp's reason:
# `X12-\d{3}[A-Z]?` and `X12-\d{6}` would exempt `X12-123`, which is exactly an item
# identifier's shape, and both measure zero here.
STANDARDS_DESIGNATION='NCPDP-(?:SCRIPT|TELECOM|D\.\d|F\d)|HL7-(?:V2|V3|CDA|FHIR|OMG)|FHIR-R\d[A-Z]?|DICOM-(?:SR|RT|SEG|DIR|PS\d)|CCDA-R\d(?:\.\d)?|ASTM-E\d+'

# Rule 1: internal project identifier. CASE SENSITIVE, and the segment after the hyphen
# must start with an uppercase letter or a digit, which is what lets `FHIR-bridge`,
# `NCPDP-copyrighted` and `HL7-defined` through (trap 3). The second alternative is our
# internal priority label, and it matches its own trailing word rather than looking ahead
# for one: an earlier version keyed on `P\d+` followed by end-of-string or a comma, which
# is the shape rule this file exists to avoid. It deleted the ICD-10-CM code in "Map
# ICD-10 P07, P22 and P29 to SNOMED CT" and truncated the code range "P00-P96". Corrupting
# a diagnosis code to remove an internal label is not a trade worth making.
#
# The collisions this rule has to survive in a CLINICAL-DOCUMENT package are not
# hypothetical, and they were counted rather than imagined. C-CDA conformance statements
# are written `CONF:1098-30468` and `CONF:81-14450`; LOINC section codes are `62387-6`;
# ONC certification criteria are `170.315(b)(1)`; and the code systems this parser binds
# are `ICD-10-CM`, `ICD-10-PCS`, `ICD-9-CM`, `CPT-4` and `PHQ-9`. Every one of those is
# `WORD-N` or `N-WORD` shaped and every one is what a reader came for. They are why
# nothing here keys on a leading number and why nothing here keys on the shape at all.
# The load-bearing ones are asserted in NEGATIVE[0] and SRC_NEGATIVE[0] so a later
# "simplification" cannot quietly drop them.
RULE_NAME[0]='internal project identifier'
RULE_PATTERN[0]='\b(?!(?:'"$STANDARDS_DESIGNATION"')\b)(?:'"$PROJECT_PREFIXES"')(?:-[A-Z0-9][A-Z0-9.]*)+\b|\bP\d+ (?:safety|documentation)\b'

# Rule 2: phase and wave language. CASE INSENSITIVE via the inline `(?i)`, because the
# rules do not share a case policy and one `grep -i` for all of them would break trap (3).
# `Phase 5b` and `Phase W` are both covered (trap 4). The negative lookahead keeps ordinary
# English off the list, so "in phase with the source system" and "out of phase" survive.
#
# THE DETERMINER CLASSES ARE RE-DERIVED FOR THIS REPO, NOT INHERITED, which trap (4) says
# in the abstract and which this note makes concrete. THE MEASUREMENT, taken over EVERY
# tracked file including CHANGELOG.md and test/: `phase` and `phases` occur 77 times and
# EVERY SINGLE ONE IS INTERNAL BOOKKEEPING. 70 are followed by a word, and that word is a
# bare arabic digit 56 times (`Phase 7` x26, `Phase 1` x14, and `Phase 2`..`Phase 6`), `5b`
# nine times, and `n`/`log`/`extends`/`can`/`adds` once each. The remaining 7 end a clause,
# which is residual (vi). THE CLINICAL SENSES MEASURE EXACTLY ZERO: no `phase of`, no
# `acute|chronic|study|clinical|trial|luteal|follicular|liquid|gas phase`, nowhere.
#
#   KEPT: `study|clinical|trial|acute|chronic`. Each is REACHABLE in a package that parses
#   clinical documents even though none is present today: an acute-phase reactant is an
#   ordinary Results-section observation, chronic-phase CML is an ordinary problem-list
#   diagnosis, and a Clinical Trial document is one of the document types C-CDA covers. The
#   guard costs nothing (a lookbehind only ever EXCLUDES) and buys a future page.
#
#   DROPPED: `luteal|follicular|liquid|gas`. Those are ncpdp's, and they are ncpdp-shaped:
#   hormone dosing against the menstrual phases and the liquid phase of a compounded
#   preparation are a PHARMACY package's vocabulary. This package neither compounds nor
#   doses; it reads documents. Dropping them makes the rule STRICTER, never blinder, so the
#   failure mode is a loud red a maintainer resolves by adding the word back with its
#   reason -- which is the direction this file wants to fail in.
#
#   DROPPED: `identifier|start|end|evaluability|number` from the lookahead, which in hl7
#   exempt the field names of the Chapter 7 `CSP` Clinical Study Phase segment. That is
#   HL7 v2 vocabulary with no C-CDA counterpart and it measures zero here. Carrying it
#   would exempt a construction this repo cannot write while widening residual (vi).
#   NOTE WHAT DROPPING `number` COSTS AND WHY IT IS PAID: this repo's own troubleshooting
#   page carried the sentence "There are no phase numbers here on purpose", which now reds.
#   That is CORRECT rather than collateral -- a page explaining our release bookkeeping to
#   a consumer is precisely the process commentary the directive bans -- and the sentence
#   was removed rather than exempted.
#
#   RE-DERIVED, AND THE ONE ARM THAT IS NOT A SIBLING'S: the roman-numeral exemption is
#   `(?:I{1,3}|IV)\b` ALONE, where every sibling requires trial vocabulary to follow it
#   (`(?:I{1,3}|IV)\s+(?:trial|stud|clinical|oncolog)`). The measurement above is what
#   licenses it: every internal phase reference in this tree is `Phase <arabic digit>`, so
#   in THIS repo a roman numeral after `phase` is never ours and needs no second signal.
#   That both widens the exemption (a bare `Phase III` at the end of a clause now survives,
#   where the siblings red on it) and is safe HERE and only here. If this repo ever mints
#   `Phase IV` as an internal label the arm must go; the self-test will not catch that,
#   because it is a change in what the words MEAN rather than in what the rule matches.
#
# `phase[ -]` rather than `phase ` is kept: `Phase-L` was live in hl7's docs and slipped a
# space-only rule, and `Phase-5` WAS live in this repo's source (`model/entries/extract.ts`,
# removed by the change that added this file) and slipped it too. Asserted on its own in the
# per-arm block below, because the compound POSITIVE sample cannot see that arm disappear.
#
# `phases?` RATHER THAN `phase` IS ONE OF THE THREE FIXES THAT MADE ncpdp's COPY THE ONE TO
# PORT. hl7's matches the singular only. It is carried rather than re-derived: the plural
# measures zero on this tree today, and a stem that covers both costs nothing because the
# clinical lookbehinds and the ordinary-English lookahead apply to the plural too.
ORDINAL='(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first|twenty-second|twenty-third|twenty-fourth|\d+(?:st|nd|rd|th))'
PHASE_NOT_CLINICAL='(?<!study )(?<!clinical )(?<!trial )(?<!acute )(?<!chronic )'
PHASE_NOT_ENGLISH='(?!of\b|with\b|in\b|out\b|the\b|and\b|is\b|for\b|to\b|(?:I{1,3}|IV)\b)'
RULE_NAME[1]='phase or wave language'
RULE_PATTERN[1]='(?i)\b(?:roadmap phases?\b[ ]?[A-Za-z0-9]*|'"$PHASE_NOT_CLINICAL"'phases?[ -]'"$PHASE_NOT_ENGLISH"'[A-Za-z0-9]+[a-z]?\b|wave \d+\b|the \w+ and final phase\b|documentation residual\b|'"$ORDINAL"' (?:slice|wave)\b)'

# Rule 3: ADR references. An ADR number is a pointer into a decision record the reader did
# not come here for. This repo HAS one of its own (`docs/adr/0001-xml-parser.md`, why
# `fast-xml-parser` is the single runtime dependency), which is exactly why the rule is
# kept rather than dropped as hl7-shaped: the temptation to cite it by number from the
# README is live. Cite what the decision WAS, not the number it has.
#
# `/` IN THE SEPARATOR CLASS IS THE SECOND OF THE THREE FIXES THAT MADE ncpdp's COPY THE
# ONE TO PORT, and hl7's does not have it. hl7 cites ADRs in prose ("Decided in ADR 0015"),
# so a space-or-hyphen class covers it; a repo that cites its own ADR by PATH
# (`docs/adr/0001-xml-parser.md`) slips a space-or-hyphen rule entirely, and three live
# citations survived a whole gate run in ncpdp because of that gap. THIS REPO WRITES BOTH
# FORMS: `docs/adr/0001-xml-parser.md` appears in CLAUDE.md and `(ADR 0018)` was live on
# README.md, which ships inside the npm tarball while `docs/` does not -- so the reader got
# a pointer to a decision record they cannot open. The separator class is the whole change;
# `adr/0001` has no legitimate reading in a C-CDA parser's docs, and the NEGATIVE sample
# keeps `0015` alone and a bare `ADR` off the rule.
#
# A BARE `ADR` WITH NO NUMBER IS NOT CAUGHT, and this repo had two of them
# ("ratified by an ADR", "adds none without an ADR" on docs-content/installation.md). They
# were fixed BY HAND. Do not close this by matching a bare `ADR`: it is a three-letter
# uppercase token and in a clinical package it is also an HL7 v2 segment name and an
# abbreviation a reader may legitimately meet. The by-hand catch is the cheaper mistake.
#
# THE `\d{3,4}` FLOOR IS INHERITED AND IS A KNOWN GAP: `ADR 7` and `ADR-12` are not
# caught. Left as hl7 has it rather than fixed here, because every ADR in this ecosystem is
# written four-digit and lowering the floor to `\d{1,4}` would start matching ordinary
# two-digit numbers after any three letters that happen to spell `adr`.
RULE_NAME[2]='ADR reference'
RULE_PATTERN[2]='(?i)\bADR[ \-/]?\d{3,4}\b'

# Rule 4: `slice`, our internal word for a unit of work. It is ALSO real clinical
# vocabulary elsewhere in this ecosystem: a DICOM study has slices, with a slice thickness,
# a slice location and slice spacing. So this keys on the determiner forms that are
# unambiguously ours ("this slice", "the final slice") and excludes the imaging nouns. A
# bare `slice` is deliberately NOT flagged: across this corpus that word is more often the
# reader's than ours.
#
# THE IMAGING-NOUN EXCLUSION IS KEPT VERBATIM even though this package parses clinical
# documents rather than images. It only ever EXCLUDES, so it cannot cause a miss of our
# jargon; diverging from the sibling copies to delete an unused alternation would make the
# copies harder to diff for no safety gained (residual (i)). It is grounded in
# @cosyte/dicom's generated tag dictionary (SliceThickness, SliceLocation,
# SpacingBetweenSlices, NumberOfSlices), and it is MORE reachable here than the pharmacy
# argument ncpdp made for it: a C-CDA Diagnostic Imaging Report is one of the twelve
# document types this package recognizes, so a docs page describing one can legitimately
# say "slice thickness". A modifier may sit between the determiner and the noun ("the
# misfiling-prevention slice") but a preposition may not: "the Number of Slices" is a DICOM
# attribute, not one of our units of work.
#
# `phase` IS DELIBERATELY NOT MATCHED HERE. A refuter pass on the hl7 copy added it to
# catch "non-goals of this phase"; the next pass measured what it cost and the answer was
# ordinary clinical English: "the phase of the clinical study", "the phase of illness" and
# "each phase of the trial". No modifier exclusion list rescues that, because the collision
# is with the HEAD noun rather than the modifier. That verdict is inherited, not
# re-litigated: rule 2 still catches `phase X`, and "of this phase" with no following
# identifier is the reviewer's catch recorded in residual (vi).
IMAGING_NOUNS='thickness|location|spacing|position|interval|order|number|index|gap|count|data|pixel|orientation|plane|direction|width|vector|sensitivity|progression|factor'
RULE_NAME[3]='internal jargon ("slice")'
RULE_PATTERN[3]='(?i)\b(?:this|that|the|each|another|previous|next|final|current)\s+(?:(?!(?:of|in|on|between|per|for|to|with|at)\s)[\w-]+\s+){0,2}slices?\b(?!\s+(?:'"$IMAGING_NOUNS"'))'

# Rule 5: internal repo paths. A docs page carries citations, and a reader who installs
# @cosyte/ccda has no meta-repo and no such file. Keyed on the known meta-repo paths, not
# on a `dir/file.md` shape, for exactly the reason trap (1) gives -- this package's own
# pages legitimately cite `docs-content/spec-notes-clinical.md` and
# `docs/adr/0001-xml-parser.md`, which a shape rule would take with them.
RULE_NAME[4]='internal repo path'
RULE_PATTERN[4]='\boperations/(?:BACKLOG\.md|roadmaps/|plans/)|\bdocumentation/(?:decisions/|ecosystem-map\.md|conventions\.md)|\bBACKLOG\.md\b'

# Rule 6: internal traceability markers. Bracketed spec-trace tags that key into a roadmap
# traceability table, and "Open-question #12" pointers into a decision log the reader
# cannot open. Zero instances measured on this tree; the rule is carried because the
# convention that produces them is shared across the parsers and a page copied from a
# sibling would bring them along. Both are DELIMITER-ANCHORED rather than shape-keyed,
# which is the only reason they are safe: the tag rule requires a literal `[S-` opening
# bracket and at least two characters after it, so a documented character range like
# `[S-Z]` does not match, and neither does a value set written `[SNOMED]`.
RULE_NAME[5]='internal traceability marker'
RULE_PATTERN[5]='\[S-[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*\]|(?i:\bopen[- ]question #?\d+\b)'

# Rule 7: A PROSE CITATION OF THE ROADMAP. IT EXISTS IN ONLY ONE SIBLING COPY (`cli`), and
# it is ported here because measurement said to, not because the file was longer with it.
# `hl7` and `ncpdp` cite the roadmap by PATH (`operations/roadmaps/<repo>.md`), which rule
# 5 already catches. THIS REPO CITES IT IN PROSE and never once by path: measured on the
# base commit, `operations/roadmaps/` appears ZERO times in tracked `src/` and on the whole
# public surface, while "the roadmap's section-framing contract", "the roadmap's
# root-primary contract", "the roadmap §5 licensing matrix" and "the roadmap's §4
# harm-ordered list" are live in exported symbols' doc comments, compiled into
# `dist/index.d.ts`, and rendered in a consumer's editor on hover. RULE 5 IS STRUCTURALLY
# BLIND TO ALL OF THEM. A port that copied `hl7` or `ncpdp` alone would have reported this
# repo clean over its largest remaining class, which is what "a gate that misses its own
# repo's dominant class is decoration" means in practice.
#
# WHAT IT KEYS ON, and why each arm is drawn where it is:
#   * `<repo> roadmap`, keyed on the KNOWN REPO NAMES rather than on a `<word> roadmap`
#     shape. Same bargain as trap (1): a new repo means adding its name here, and nothing
#     catches it until someone does. That is the cheaper mistake, and it keeps "a product
#     roadmap", "the vendor's roadmap" and any consumer-facing use of the ordinary English
#     word out of scope.
#   * `the|this|our roadmap`, and IN THIS REPO THAT ARM CARRIES THE WHOLE RULE: all four
#     live instances are written "the roadmap" or "the roadmap's", none names the repo. A
#     rule keyed on repo names alone would have found nothing here and reported green.
#   * `roadmap §`, the section-pointer form, which survives even if the qualifier changes.
#
# THE ACCEPTED FALSE POSITIVE, stated rather than discovered: a README section headed
# "Roadmap" describing upcoming capability in consumer terms is legitimate content, and a
# sentence pointing at it ("see the roadmap below") would red here. Measured on this tree,
# `roadmap` appears on the public markdown surface ZERO times, so the trade costs nothing
# today. A BARE HEADING IS NOT MATCHED (no qualifier, no `§`), which is what keeps that
# section writable if someone ever wants one.
#
# THE RESIDUAL, AND IT IS LARGER HERE THAN IN `cli`: a BARE `§4` with the word `roadmap`
# removed is NOT caught, deliberately. `§` is also how a real standard's section is cited,
# and THIS package cites ONC 2015 Edition `§170.315(b)(1)` three times in `src/profiles/`,
# so a blanket `§` rule is trap (1) aimed straight at the profile system's grounding
# citations. That makes the split here genuinely mixed rather than empty as it was in
# `cli`: of the five `§` occurrences in the gated surface, three are standards citations
# that MUST survive and two are roadmap pointers that must not. Only the second pair
# carries the word `roadmap`, which is exactly why the rule keys on the word and the
# section sign is left to the reviewer. WHEN REMEDIATING, DROP THE WHOLE PARENTHETICAL:
# stripping "the roadmap" and leaving "(§4)" is trap (2), a fragment pointing at nothing.
ROADMAP_OWNERS='ccda|hl7|fhir|mllp|dicom|x12|ncpdp|astm|cli|transform|terminology|synth|deid|pathways|docs|website|iac|crew|knowledgebase|config|the|this|our'
RULE_NAME[6]='internal roadmap citation'
RULE_PATTERN[6]='(?i)\b(?:'"$ROADMAP_OWNERS"') roadmap(?:'"'"'s)?\b|\broadmaps?(?:'"'"'s)?[ ]?§'

RULE_COUNT=7

# TRIPWIRE ON THE RULE COUNT ITSELF. A future "resync this file with hl7 or ncpdp" that
# restores `RULE_COUNT=6` deletes THIS REPO'S HIGHEST-YIELD RULE and leaves every self-test
# green, because the loops below iterate to RULE_COUNT and simply stop asking about rule 7.
# Silent-green through a shrunken rule set is the same failure class as silent-green through
# a shrunken file list, so it is refused in the same way.
if [ "$RULE_COUNT" -lt 7 ] || [ -z "${RULE_PATTERN[6]:-}" ]; then
  echo "ERROR: check-no-internal-refs - the roadmap-citation rule (rule 7) is missing or" >&2
  echo "       RULE_COUNT has been lowered below it. That rule is not optional here: it is" >&2
  echo "       the only one that sees this repo's prose roadmap citations, which rule 5's" >&2
  echo "       path keying cannot. Refusing to report from a shrunken rule set." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# THE `src/` DOC-COMMENT RULE SET, deliberately a SEPARATE ARRAY
# ---------------------------------------------------------------------------
#
# WHY A SECOND SURFACE EXISTS AT ALL. The block above scans markdown a reader browses.
# This one scans the JSDoc a consumer's EDITOR renders: `src/` doc comments are compiled
# into `dist/index.d.ts` and `dist/index.d.cts` by tsup, `dist` is the first entry in
# package.json's `files`, and every `npm i @cosyte/ccda` receives them.
#
# IN THIS REPO IT IS NOT THE SECOND SURFACE, IT IS ESSENTIALLY THE WHOLE JOB, and the
# ratio is the single most important number in this file. Measured by running THIS script
# against commit `2a32309`, the base of the change that added it, over 65 tracked source
# files and 8,022 extracted doc-comment lines: the public markdown surface carried TWO
# violations and `src/` doc comments carried SIXTY-FIVE hit records over SIXTY-ONE distinct
# locations (41 found by the line pass, 24 more by the paragraph-reflowed pass). The
# string-literal pass found zero. So roughly 30:1, and quoting it as a ratio hides that the
# numerator has two defensible definitions; both are given above for that reason. The work
# item that produced this gate recorded an expected count of ONE. Anyone who ports this
# file to another sibling and measures only the markdown will under-count by the same
# order; measure the doc comments first.
#
# What was in them was not incidental either: exported symbols documented as "Phase 1
# frames identity + narrative only; clinical entry extraction is Phase 2+" and "BL is
# modelled as a first-class datatype even though Phase 1 does not yet extract clinical
# entries" -- sentences that tell a consumer nothing except that we build in phases, AND
# THAT WERE BOTH FALSE by the time they were read, because entry extraction had shipped.
# Stale bookkeeping does not merely leak process; it misdescribes the software.
#
# WHY A SEPARATE ARRAY RATHER THAN REUSING RULE_PATTERN. Code comments are not markdown.
# The two surfaces have different collision profiles (TypeScript prose says `.slice()` and
# "the slice after the fixed header"; markdown says "the thirteenth slice"), different wrap
# shapes, and different self-test material. Sharing one array would mean a fix for one
# surface silently retunes the other, and the negative self-test that caught it would be in
# the wrong file's language. They START identical. They are ALLOWED to diverge, and when
# they do, each side's NEGATIVE sample is what stops the divergence from being a widening.
#
# WHAT IS SCANNED, precisely: only text inside `/** ... */` blocks. NOT `//` line comments
# and NOT `/* */` block comments, and that boundary is the whole point rather than a
# convenience. `/** */` is what the dts build carries into `dist`; `//` is not. The
# convention names source comments as a place identifiers BELONG. So the line this draws is
# exactly the founder's line: what a CONSUMER receives is public and is swept; what only a
# maintainer reads stays internal.
#
# REMOVING A DOC COMMENT TO SATISFY THIS PASS IS A REGRESSION, NOT A FIX. JSDoc with an
# `@example` on every public export is a hard guardrail in CLAUDE.md and the JSDoc lint
# rule is an error, but neither lint nor coverage notices prose deleted from the middle of
# a block. Rewrite the sentence to say what the software does.
SRC_RULE_NAME[0]="${RULE_NAME[0]}"; SRC_RULE_PATTERN[0]="${RULE_PATTERN[0]}"
SRC_RULE_NAME[1]="${RULE_NAME[1]}"; SRC_RULE_PATTERN[1]="${RULE_PATTERN[1]}"
SRC_RULE_NAME[2]="${RULE_NAME[2]}"; SRC_RULE_PATTERN[2]="${RULE_PATTERN[2]}"
SRC_RULE_NAME[3]="${RULE_NAME[3]}"; SRC_RULE_PATTERN[3]="${RULE_PATTERN[3]}"
SRC_RULE_NAME[4]="${RULE_NAME[4]}"; SRC_RULE_PATTERN[4]="${RULE_PATTERN[4]}"
SRC_RULE_NAME[5]="${RULE_NAME[5]}"; SRC_RULE_PATTERN[5]="${RULE_PATTERN[5]}"
SRC_RULE_NAME[6]="${RULE_NAME[6]}"; SRC_RULE_PATTERN[6]="${RULE_PATTERN[6]}"
SRC_RULE_COUNT=7

# Same tripwire as RULE_COUNT's, and it is a SEPARATE variable so it needs a separate
# guard: lowering this one alone leaves the markdown pass covering seven rules and the
# doc-comment pass covering six, which is the surface where 65 of this repo's 67 base
# violations were. A refuter found this count unguarded while RULE_COUNT was guarded.
if [ "$SRC_RULE_COUNT" -ne "$RULE_COUNT" ] || [ -z "${SRC_RULE_PATTERN[6]:-}" ]; then
  echo "ERROR: check-no-internal-refs - the src doc-comment pass covers fewer rules than" >&2
  echo "       the public-surface pass. That surface carried 65 of this repo's 67 base" >&2
  echo "       violations, so a rule dropped only here is a hole where the mass is." >&2
  echo "       Refusing to report from a shrunken rule set." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# THE `src/` STRING-LITERAL RULE SET: the fourth pass, and the one hl7 does not have
# ---------------------------------------------------------------------------
#
# WHY IT EXISTS, AND WHY IT IS NOT IN THE COPY THIS FILE WAS PORTED FROM. A parser's most
# widely read text is not its README and not its JSDoc: it is its WARNING MESSAGES. Every
# quirk this library tolerates surfaces as a `message` string that a consumer prints to a
# log, shows in a UI, or pastes into a support ticket. Those strings are neither markdown
# nor doc comments, so the three passes above walk straight past them.
#
# MEASURED ON THIS TREE, not inherited from ncpdp's measurement: ONE runtime message
# carried release bookkeeping into a consumer's terminal --
#   "CcdaDocument.toString: no source document retained. Only documents produced by
#    parseCcda can be serialized; a document builder API lands in a later phase."
# It is gone, and it was WRONG as well as internal: `buildCcda` had shipped, so the message
# a consumer read told them to wait for something they already had.
#
# THAT ONE WAS NOT FOUND BY A RULE, AND THIS PASS WOULD NOT HAVE FOUND IT. Say that
# plainly. It ends its clause at `phase` (`phase.`), which is residual (vi), the shape rule
# 2 deliberately does not cover because the determiner-plus-`phase` form collides with
# ordinary clinical English. It was a reviewer's catch. ncpdp measured SIX of the identical
# shape, so this is a class rather than an accident of one repo.
#
# SO WHAT IS THIS PASS WORTH? It closes the SURFACE, not that one shape. An item identifier
# (`(CCDA-P7)`), an ADR number, a meta-repo path, a `Phase 9` with a following token, a
# prose roadmap citation, or a traceability tag written into a warning message is caught
# here and is caught nowhere else. Rule 1 is the highest-value rule in this file and it had
# no reach into a string at all. A surface with no gate on it regresses silently; a surface
# with a gate that shares one stated residual regresses loudly for everything except that
# residual. Both halves of that sentence are true and neither is the whole story.
#
# THE FALSE-POSITIVE RISK WAS MEASURED BEFORE THE PASS WAS KEPT, because a rule over code
# strings is the obvious place for one. All seven rules over all 2,350 double-quoted and
# backtick literals on non-comment lines in tracked `src/`, on the remediated tree: ZERO
# matches. Import specifiers, the underscored warning-code constants (`MISSING_CODE_VALUE`,
# `MEDICATION_PRODUCT_ARM_CONFLICT`; underscored, so rule 1's hyphen requirement never
# fires), the template OIDs, the LOINC and CVX codes and the `urn:oid:` roots all pass
# cleanly. The rules are therefore reused whole rather than trimmed: a narrowed copy would
# have no measurement behind it.
#
# WHAT IS SCANNED, precisely: double-quoted and backtick literals on lines that are NOT
# whole-line comments. Three boundaries, each deliberate:
#   * WHOLE-LINE COMMENTS ARE SKIPPED (`//`, `/*`, `/**`, and a continuation ` *`). Pass
#     three owns doc comments, and `//` comments are deliberately out of scope for the
#     whole gate: the convention names source comments as a place identifiers BELONG.
#     Without this skip, a `//` comment that happens to contain a backticked
#     symbol would be scanned as a string and the stated boundary would quietly move.
#   * A TRAILING COMMENT ON A CODE LINE IS STILL SCANNED. Accepted rather than solved:
#     splitting a trailing comment off needs a tokenizer, and the failure mode is an
#     over-report on a line a maintainer can read in one second.
#   * SINGLE-QUOTED LITERALS ARE NOT SCANNED. Prettier (`@cosyte/prettier-config`) emits
#     double quotes, `format:check` runs ahead of this gate on the verify ladder, and
#     tracked `src/` contains no single-quoted string. Including `'` would instead capture
#     comment prose between two apostrophes, which would drag `//` comments into scope
#     through the back door.
#   * A MULTI-LINE TEMPLATE LITERAL IS SCANNED PER LINE, so a violation split across its
#     line breaks is missed. Under-reports rather than over-reports. There is no reflow
#     pass here because a reflow would have to model template continuation, and the fix
#     for a missed one is the same as for any residual: the reviewer.
STR_RULE_NAME[0]="${RULE_NAME[0]}"; STR_RULE_PATTERN[0]="${RULE_PATTERN[0]}"
STR_RULE_NAME[1]="${RULE_NAME[1]}"; STR_RULE_PATTERN[1]="${RULE_PATTERN[1]}"
STR_RULE_NAME[2]="${RULE_NAME[2]}"; STR_RULE_PATTERN[2]="${RULE_PATTERN[2]}"
STR_RULE_NAME[3]="${RULE_NAME[3]}"; STR_RULE_PATTERN[3]="${RULE_PATTERN[3]}"
STR_RULE_NAME[4]="${RULE_NAME[4]}"; STR_RULE_PATTERN[4]="${RULE_PATTERN[4]}"
STR_RULE_NAME[5]="${RULE_NAME[5]}"; STR_RULE_PATTERN[5]="${RULE_PATTERN[5]}"
STR_RULE_NAME[6]="${RULE_NAME[6]}"; STR_RULE_PATTERN[6]="${RULE_PATTERN[6]}"
STR_RULE_COUNT=7

# And the same guard again, for the same reason. This is the only pass that sees a
# consumer's terminal.
if [ "$STR_RULE_COUNT" -ne "$RULE_COUNT" ] || [ -z "${STR_RULE_PATTERN[6]:-}" ]; then
  echo "ERROR: check-no-internal-refs - the src string-literal pass covers fewer rules" >&2
  echo "       than the public-surface pass. That is the only pass that sees warning and" >&2
  echo "       error text a consumer reads in their logs." >&2
  echo "       Refusing to report from a shrunken rule set." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# SELF-TESTS. A gate is believed only after it has shown it can still see.
# ---------------------------------------------------------------------------
#
# Two halves, and the second is the one that is unusual. POSITIVE samples prove each rule
# still matches what it bans (the check-no-emdash property: refuse to report a clean tree
# from a scanner that cannot see). NEGATIVE samples prove each rule still lets through the
# reference material it was most likely to destroy, which is trap (1) turned into an
# assertion: if someone "simplifies" the identifier rule to a `WORD-N` shape, the negative
# self-test reds here instead of silently deleting `NCPDP-SCRIPT` and `439-E4` from a
# pharmacy parser's docs on the next sweep. Both halves run on every invocation, local and
# CI, and both refuse rather than warn.

self_test_fail() {
  echo "ERROR: check-no-internal-refs - SELF-TEST FAILED: $1" >&2
  echo "       The scanner is not behaving as specified, so no result from it can be" >&2
  echo "       believed. Refusing to report on the tree." >&2
  exit 1
}

# rule index -> text that MUST match. Every sample is written in THIS repo's own
# vocabulary, so a reader can tell what the rule is for without opening another package.
POSITIVE[0]='Item CCDA-P7 is done, and CCDA-PLANNED-CODE-SLOT with it'
POSITIVE[1]='Phase 5b closes it (Phase W, Phase-5 and the thirteenth slice landed earlier, in wave 2), and Phases 6 and 7 preceded it'
POSITIVE[2]='Decided in ADR 0018, restated in ADR-0001, and recorded in docs/adr/0001-xml-parser.md'
POSITIVE[3]='This slice adds the consumable helper and the final slice removes it'
POSITIVE[4]='Roadmap operations/roadmaps/ccda.md and documentation/decisions/0015-x.md'
POSITIVE[5]='Repeating [S-SIG], and Open-question #12 resolves the direction'
POSITIVE[6]='Grounded in the ccda roadmap §5, refined from the roadmap sketch, and the roadmap forbids it'

# rule index -> text that must NOT match. Every entry is real reference material from a
# C-CDA, CDA R2, HL7 or FHIR context, real example data from this package's own docs, or
# ordinary English that collides with our jargon.
NEGATIVE[0]='C-CDA R2.1 and CDA R2 and the CCDA-R2.1 designation, C-CDA-Examples published by HL7, the code systems ICD-10-CM and ICD-10-PCS and ICD-9-CM and ICD-9 and CPT-4 and PHQ-9, conformance statements CONF:1098-30468 and CONF:81-14450, LOINC 62387-6, ONC 170.315(b)(1), the W3C-DOM substrate, UTF-8 encoding, the TOP-LEVEL element, the synthetic example ids MRN-00042 and MRN-0001 and DOC-0001 and DOC-1 and SYNTH-9, FHIR-bridge stability, docs-content/ layout, HL7-V3 and HL7-CDA, FHIR-R4, DICOM-SR'
NEGATIVE[1]='A Phase III oncology trial and a Phase II study; the clinical phases of a drug programme; the acute phase reactant; chronic phase disease; the phase of illness; the reader stays in phase with the source system and is out of phase'
NEGATIVE[2]='ADR is not a section identifier, and 0015 alone is a value'
NEGATIVE[3]='The slice thickness and the number of slices are imaging attributes, each slice location is too, and the phase of the clinical study, the phase of illness and each phase of the trial are the reader words this rule must not touch'
NEGATIVE[4]='Parser operations are documented in the README, and documentation for the API is generated'
NEGATIVE[5]='A character range like [S-Z], a value set written [SNOMED], and open questions about the feed'
NEGATIVE[6]='## Roadmap; a product roadmap and the vendor roadmap; roadmapping the migration; the roadmaps of other projects'

# RULE 3'S `/` ARM GETS ITS OWN ASSERTION, separate from the array loop, and this is the
# only rule that needs one. The array samples all carry BOTH the prose form ("ADR 0015")
# and the path form, so every one of them still matches under the narrower hl7 pattern the
# widening replaced: they prove the rule works, they do NOT prove it still has the arm this
# repo added. A "resync with hl7" that reverts RULE_PATTERN[2] would leave the whole suite
# green and silently reopen the exact hole the widening exists to close -- three live ADR
# citations that a refuter found after this gate had reported OK over them. So the path
# form is asserted ALONE, with nothing else in the sample for the rule to match on.
ADR_PATH_SAMPLE='Ratified in docs/adr/0001-xml-parser.md'
if ! printf '%s\n' "$ADR_PATH_SAMPLE" | grep -qP -e "${RULE_PATTERN[2]}"; then
  self_test_fail "rule 'ADR reference' no longer matches an ADR cited as a PATH ('docs/adr/0001-...'), which is the form this repo writes and the form hl7's narrower pattern misses. Three live citations survived a whole gate because of that gap. Do not drop '/' from the separator class."
fi

# PER-ARM ASSERTIONS. THIS BLOCK EXISTS BECAUSE THE POSITIVE SAMPLES ABOVE CANNOT SEE THE
# LOSS OF AN ARM, and a refuter proved it on this very file rather than in the abstract.
# Each `POSITIVE[i]` is one compound sentence tested with a single `grep -q`, so it proves
# only that SOMETHING in the rule still matched. Three mutations were applied to the
# staged tree and the gate printed OK and exited 0 for all three:
#   * deleting `wave \d+\b` from rule 2
#   * narrowing `phases?[ -]` to `phases? `, which kills `Phase-5` and `Phase-L`
#   * deleting `the|this|our` from ROADMAP_OWNERS
# The third is the one that matters most here, because the note at rule 7 says that arm
# "CARRIES THE WHOLE RULE" in this repo: all four live roadmap citations are written "the
# roadmap", so a copy without it finds nothing and reports green. The file had already
# diagnosed this exact failure class for rule 3 and fixed it with the standalone
# ADR_PATH_SAMPLE below, then did not extend the treatment. This does.
#
# THE RULE FOR A SAMPLE HERE: it must contain the construction under test AND NOTHING ELSE
# the same rule can match on, so the assertion fails when that one arm is removed. A
# compound sentence belongs in POSITIVE, not here. TWO SAMPLES FAILED THAT TEST IN THE
# FIRST DRAFT and were caught by a refuter: `roadmap Phase K` did not isolate the
# `roadmap phase` arm, because the generic `phases?[ -]` arm matches `Phase K` as well (the
# fix is a clause-terminal sample, which only the `roadmap phase` arm reaches); and
# `this roadmap's` isolated neither `(?:'s)?` group, because `roadmap\b` already matches
# before an apostrophe and `this` sits in the same alternation as `the`. If you add a
# sample, DELETE ITS ARM AND WATCH THIS RED before believing it.
#
# ONE GROUP HAS NO ISOLATING SAMPLE AND CANNOT HAVE ONE, stated rather than papered over:
# rule 7 arm 1's `(?:'s)?` is redundant, since `roadmap(?:'s)?\b` already matches "the
# roadmap's" on the `\b` before the apostrophe. It is unasserted because deleting it
# changes no behaviour, not because it was overlooked. Arm 2's `(?:'s)?` is load-bearing
# and IS asserted.
ARM_RULE=();  ARM_SAMPLE=();  ARM_WHY=()
arm() { ARM_RULE+=("$1"); ARM_SAMPLE+=("$2"); ARM_WHY+=("$3"); }

arm 0 'CCDA-P7'                        'the prefix-keyed identifier arm, the highest-value rule in this file'
arm 0 'P7 safety'                      'the internal priority-label arm'
arm 1 'roadmap phases'                 'the `roadmap phase` arm, whose unique reach is the CLAUSE-TERMINAL form'
arm 1 'Phase 5b'                       'the letter-suffixed phase form, which a digits-only pattern misses (trap 4)'
arm 1 'Phase W'                        'the letter-only phase form (trap 4)'
arm 1 'Phase-5'                        'the HYPHEN separator, which a space-only rule misses; this form was live in this repo'
arm 1 'Phases 6'                       'the PLURAL stem, one of the three fixes that made ncpdp the copy to port'
arm 1 'wave 2'                         'the `wave N` arm'
arm 1 'the third and final phase'      'the final-phase arm'
arm 1 'documentation residual'         'the documentation-residual arm'
arm 1 'thirteenth slice'               'the ordinal-slice arm'
arm 1 'second wave'                    'the ordinal-wave arm'
arm 2 'ADR 0018'                       'the space-separated ADR form'
arm 2 'ADR-0001'                       'the hyphen-separated ADR form'
arm 3 'this slice'                     'the bare determiner form of our unit-of-work jargon'
arm 3 'the final slice'                'the determiner-plus-modifier form'
arm 3 'another compatibility slice'    'a modifier BETWEEN the determiner and the noun'
arm 4 'operations/roadmaps/ccda.md'    'the meta-repo roadmap path'
arm 4 'operations/plans/one.md'        'the meta-repo plans path'
arm 4 'documentation/decisions/0015-x.md' 'the meta-repo decisions path'
arm 4 'documentation/conventions.md'   'the meta-repo conventions path'
arm 4 'documentation/ecosystem-map.md' 'the meta-repo ecosystem-map path'
arm 4 'BACKLOG.md'                     'a bare BACKLOG.md reference'
arm 5 '[S-SIG]'                        'the bracketed spec-trace tag'
arm 5 'Open-question #12'              'the open-question pointer'
arm 6 'ccda roadmap'                   'the REPO-NAME arm of the roadmap rule'
arm 6 'the roadmap'                    'the DETERMINER arm, which carries this whole rule in this repo'
arm 6 'roadmap'"'"'s §4'                'the POSSESSIVE branch of the section-pointer arm'
arm 6 'roadmap §5'                     'the section-pointer form, which survives a change of qualifier'

a=0
while [ "$a" -lt "${#ARM_RULE[@]}" ]; do
  r="${ARM_RULE[$a]}"
  if ! printf '%s\n' "${ARM_SAMPLE[$a]}" | grep -qP -e "${RULE_PATTERN[$r]}"; then
    self_test_fail "rule '${RULE_NAME[$r]}' no longer matches '${ARM_SAMPLE[$a]}' ALONE, so it has lost ${ARM_WHY[$a]}. The compound POSITIVE sample for this rule may still pass; that is exactly why this assertion exists. Restore the arm, or delete this line deliberately and say why."
  fi
  a=$((a + 1))
done

i=0
while [ "$i" -lt "$RULE_COUNT" ]; do
  if ! printf '%s\n' "${POSITIVE[$i]}" | grep -qP -e "${RULE_PATTERN[$i]}"; then
    self_test_fail "rule '${RULE_NAME[$i]}' no longer matches its own positive sample."
  fi
  if printf '%s\n' "${NEGATIVE[$i]}" | grep -qP -e "${RULE_PATTERN[$i]}"; then
    hit=$(printf '%s\n' "${NEGATIVE[$i]}" | grep -oP -e "${RULE_PATTERN[$i]}" | head -1)
    self_test_fail "rule '${RULE_NAME[$i]}' now matches legitimate reference material (matched: '${hit}'). This is the WORD-N trap: it destroys the standards designations and field references a pharmacy parser's docs exist to provide."
  fi
  i=$((i + 1))
done

# The `src/` set gets its OWN self-tests, in the language of the surface it guards. The
# NEGATIVE samples are built from material that is actually present in this package's
# source: the C-CDA conformance ids and template OIDs its doc comments cite, the code
# systems its slot bindings name, the synthetic `@example` identifiers, and TypeScript that
# reads like our jargon (`raw.slice(0, 56)`, `ids.slice(1)`). If someone widens the `src`
# rules into the WORD-N shape, this reds instead of deleting `ICD-10-CM` and
# `CONF:1098-30468` from an exported function's IntelliSense on the next sweep.
SRC_POSITIVE[0]='Item CCDA-P7 is done, and CCDA-PLANNED-CODE-SLOT with it'
SRC_POSITIVE[1]='Phase 5b closes it (Phase W, Phase-5 and the thirteenth slice landed earlier, in wave 2), and Phases 6 and 7 preceded it'
SRC_POSITIVE[2]='Decided in ADR 0018, restated in ADR-0001, and recorded in docs/adr/0001-xml-parser.md'
SRC_POSITIVE[3]='This slice adds the consumable helper and the final slice removes it'
SRC_POSITIVE[4]='Roadmap operations/roadmaps/ccda.md and documentation/decisions/0015-x.md'
SRC_POSITIVE[5]='Repeating [S-SIG], and Open-question #12 resolves the direction'
SRC_POSITIVE[6]='Grounded in the ccda roadmap §5, refined from the roadmap sketch, and the roadmap forbids it'

SRC_NEGATIVE[0]='C-CDA R2.1 and CDA R2 and the CCDA-R2.1 designation, CONF:1098-30468 and CONF:1198-30925 and CONF:81-14450, LOINC 62387-6, ONC 2015 Edition 170.315(b)(1), the code systems ICD-10-CM and ICD-10-PCS and ICD-9-CM and CPT-4 and PHQ-9, the W3C-DOM substrate, UTF-8 encoding, the TOP-LEVEL element, the example ids MRN-00042 and DOC-2 and SYNTH-9, FHIR-bridge stability, HL7-V3 and HL7-CDA, FHIR-R4, DICOM-SR'
SRC_NEGATIVE[1]='A Phase III oncology trial and a Phase II study; the clinical phases of a drug programme; the acute phase reactant; chronic phase disease; the phase of illness; the reader stays in phase with the source system and is out of phase'
SRC_NEGATIVE[2]='ADR is not a section identifier, and 0015 alone is a value'
SRC_NEGATIVE[3]='The slice thickness and the number of slices are imaging attributes, each slice location is too; raw.slice(0, 56) and ids.slice(1) are TypeScript; and the phase of the clinical study, the phase of illness and each phase of the trial are the reader words this rule must not touch'
SRC_NEGATIVE[4]='Parser operations are documented in the README, and documentation for the API is generated'
SRC_NEGATIVE[5]='A character range like [S-Z], a value set written [SNOMED], and open questions about the feed'
SRC_NEGATIVE[6]='## Roadmap; a product roadmap and the vendor roadmap; roadmapping the migration; the roadmaps of other projects'

# The STRING-LITERAL set gets its own samples too, in the language of a runtime warning
# message. The POSITIVE ones are what the rules DO catch in a message string; the rule-2
# sample is deliberately NOT one of the six real messages this change removed, because
# none of those matched (see the residual note at STR_RULE_NAME) and asserting a sample
# the rule cannot match is how a gate ends up believed for the wrong reason. The NEGATIVE
# ones are real strings from this package's source: the underscored warning codes (which
# must never look like an identifier), an import specifier, the field tables, and a
# REMEDIATED warning message, so a widening that starts flagging correct messages reds
# here instead of on the next pull request.
STR_POSITIVE[0]='CCDA-P7 shipped this reader'
STR_POSITIVE[1]='Added in Phase 9 and reworked in phase 10b'
STR_POSITIVE[2]='Behaviour fixed by ADR 0018, recorded in docs/adr/0001-xml-parser.md'
STR_POSITIVE[3]='Added by the final slice of the reader'
STR_POSITIVE[4]='See operations/roadmaps/ccda.md'
STR_POSITIVE[5]='Traced as [S-SIG]'
STR_POSITIVE[6]='Not supported for this document type; see the ccda roadmap for when it lands'

STR_NEGATIVE[0]='MEDICATION_PRODUCT_ARM_CONFLICT and MISSING_CODE_SYSTEM and UNEXPECTED_CODE_SYSTEM and REQUIRED_SECTION_MISSING, ./dom.js and ../model/code-systems.js, C-CDA R2.1 and CDA R2, CONF:1098-30468, LOINC 62387-6, ICD-10-CM and ICD-9-CM and CPT-4, urn:oid:2.16.840.1.113883.4.1, MRN-00042 and SYNTH-9, UTF-8'
STR_NEGATIVE[1]='CcdaDocument.toString: no source document retained. Only documents produced by parseCcda can be serialized. A Phase III trial and the acute phase reactant are out of scope, and the reader stays in phase with the source system.'
STR_NEGATIVE[2]='ADR is not a section identifier, and 0001 alone is a value'
STR_NEGATIVE[3]='Document carries 3 sections; only the first is decoded. The slice thickness and the number of slices are imaging attributes.'
STR_NEGATIVE[4]='Parser operations are documented in the README, and documentation for the API is generated'
STR_NEGATIVE[5]='A character range like [S-Z], a value set written [SNOMED], and open questions about the feed'
STR_NEGATIVE[6]='## Roadmap; a product roadmap and the vendor roadmap; roadmapping the migration; the roadmaps of other projects'

i=0
while [ "$i" -lt "$STR_RULE_COUNT" ]; do
  if ! printf '%s\n' "${STR_POSITIVE[$i]}" | grep -qP -e "${STR_RULE_PATTERN[$i]}"; then
    self_test_fail "string-literal rule '${STR_RULE_NAME[$i]}' no longer matches its own positive sample."
  fi
  if printf '%s\n' "${STR_NEGATIVE[$i]}" | grep -qP -e "${STR_RULE_PATTERN[$i]}"; then
    hit=$(printf '%s\n' "${STR_NEGATIVE[$i]}" | grep -oP -e "${STR_RULE_PATTERN[$i]}" | head -1)
    self_test_fail "string-literal rule '${STR_RULE_NAME[$i]}' now matches a legitimate runtime string (matched: '${hit}'). A warning message a consumer reads must survive this gate; only our bookkeeping must not."
  fi
  i=$((i + 1))
done

i=0
while [ "$i" -lt "$SRC_RULE_COUNT" ]; do
  if ! printf '%s\n' "${SRC_POSITIVE[$i]}" | grep -qP -e "${SRC_RULE_PATTERN[$i]}"; then
    self_test_fail "src rule '${SRC_RULE_NAME[$i]}' no longer matches its own positive sample."
  fi
  if printf '%s\n' "${SRC_NEGATIVE[$i]}" | grep -qP -e "${SRC_RULE_PATTERN[$i]}"; then
    hit=$(printf '%s\n' "${SRC_NEGATIVE[$i]}" | grep -oP -e "${SRC_RULE_PATTERN[$i]}" | head -1)
    self_test_fail "src rule '${SRC_RULE_NAME[$i]}' now matches legitimate reference material (matched: '${hit}'). This is the WORD-N trap, arriving through the source-comment surface: it destroys the field references a pharmacy parser's IntelliSense exists to provide."
  fi
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
# Refusals. Anything the scanner writes to stderr means it did not read everything it was
# given, and an incomplete scan must never print OK. Exit status cannot carry that signal:
# grep exits 1 on "no match", which xargs reports as 123, so "clean" and "died part way
# through the batch" are indistinguishable by code. A match inside input grep classifies
# as binary also arrives on stderr with empty stdout.
# ---------------------------------------------------------------------------
ERRLOG=$(mktemp)
FILELIST=$(mktemp)
SCANLIST=$(mktemp)
NPMBUF=$(mktemp)
REFLOWBUF=$(mktemp)
RAWBUF=$(mktemp)
SRCLIST=$(mktemp)
SRCSCAN=$(mktemp)
DOCLINES=$(mktemp)
DOCMAP=$(mktemp)
DOCFLOW=$(mktemp)
DOCFLOWMAP=$(mktemp)
STRLINES=$(mktemp)
STRMAP=$(mktemp)
trap 'rm -f "$ERRLOG" "$FILELIST" "$SCANLIST" "$NPMBUF" "$REFLOWBUF" "$RAWBUF" \
      "$SRCLIST" "$SRCSCAN" "$DOCLINES" "$DOCMAP" "$DOCFLOW" "$DOCFLOWMAP" \
      "$STRLINES" "$STRMAP"' EXIT

refuse_if_incomplete() {
  [ -s "$ERRLOG" ] || return 0
  cat "$ERRLOG" >&2
  echo "" >&2
  # GNU grep >= 3.5 prints "grep: FILE: binary file matches" on STDERR with nothing on
  # stdout, so a match in input it cannot read as text arrives here rather than in the hit
  # list. Name that case, or the run reds blaming an I/O failure that never happened and
  # sends a reader hunting it. This branch only chooses the wording; every path exits 1.
  if grep -qi 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-internal-refs - the input named above MATCHED a banned pattern," >&2
    echo "       but grep classifies it as binary, so the hit has no line number. Treat it" >&2
    echo "       as a real violation, and repair the file's encoding (it should be UTF-8)." >&2
  fi
  if grep -qiv 'binary file' "$ERRLOG"; then
    echo "ERROR: check-no-internal-refs - the scan reported errors, so it did not read all" >&2
    echo "       of its input. Refusing to report green from an incomplete scan." >&2
  fi
  exit 1
}

fail_with_hits() {
  local what="$1" hits="$2"
  echo "$hits" >&2
  echo "" >&2
  echo "ERROR: check-no-internal-refs - internal project bookkeeping found in ${what}." >&2
  echo "       A consumer reads this surface. Item identifiers, phase and wave language," >&2
  echo "       ADR numbers and meta-repo paths belong in the changeset, CHANGELOG.md, the" >&2
  echo "       commit, the PR and the roadmap. Translate at the boundary: say what the" >&2
  echo "       software does and what changed." >&2
  echo "       When you strip an identifier off the FRONT of a line, repair the head too:" >&2
  echo "       drop a leading orphan parenthetical, strip leading punctuation, recapitalise." >&2
  echo "       Leaving the fragment behind is worse than the text it replaced." >&2
  echo "       Rule: documentation/conventions.md, 'No internal project bookkeeping on a" >&2
  echo "       public surface'." >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Build the scan list
# ---------------------------------------------------------------------------
#
# `git ls-files` is relative to the working directory, so from a subdirectory it lists a
# subtree and the scan would report OK having skipped the rest of the surface. Anchor at
# the top level.
cd "$(git rev-parse --show-toplevel)"

# The public surface, as paths. Each is justified in the SCAN SURFACE note at the top.
SURFACE_PATHS=(README.md LICENSE docs-content)

# Every named surface path must still be tracked. Without this, renaming or deleting
# README.md makes the gate scan less and still print OK, which is the same silent-green
# failure the routes below close, arriving through the file list instead of through grep.
for p in "${SURFACE_PATHS[@]}"; do
  if [ -z "$(git ls-files -- "$p")" ]; then
    echo "ERROR: check-no-internal-refs - the public surface path '$p' is not tracked." >&2
    echo "       Either it was renamed or removed (update SURFACE_PATHS in this script," >&2
    echo "       deliberately), or the scan is about to cover less than it claims." >&2
    echo "       Refusing to report green from a shrunken surface." >&2
    exit 1
  fi
done

# DRIFT TRIPWIRE on the npm tarball. `files` in package.json decides what a consumer
# actually receives, so anything added there is new public surface this gate would not know
# about. Rather than let that pass silently, refuse until someone puts it in SURFACE_PATHS
# or names it below as deliberately excluded.
#
# EVERY entry is checked, not just the prose-looking ones. Filtering `files` down to
# `*.md`/`LICENSE` first would discard `dist` before checking, and so structurally could
# not see the tarball's largest prose payload: the compiled JSDoc in `dist/index.d.ts`. A
# tripwire that cannot see the thing it was built to catch is not a tripwire. The two
# standing exclusions are named with their reasons in SCAN SURFACE above: `CHANGELOG.md`
# (SETTLED: exempt org-wide by founder decision, 2026-07-29) and `dist` (untracked build
# output this script cannot read; its
# SOURCE is gated by the third pass instead).
command -v node >/dev/null || {
  echo "ERROR: check-no-internal-refs - node is required (to read package.json) and is not" >&2
  echo "       on PATH. Refusing to skip the npm-surface half of this gate." >&2
  exit 1
}

# AND THE TRIPWIRE COVERS `files` DISAPPEARING, NOT ONLY `files` GROWING. Found by a
# refuter, reproduced rather than argued: deleting the `files` key entirely made the gate
# print OK, while npm with no `files` and no `.npmignore` ships essentially the whole
# repo -- `docs-content/`, `CLAUDE.md`, `.changeset/`, `src/`, `test/`. That is the
# largest possible widening of the public surface and the version that only diffed the
# ARRAY CONTENTS could not see it, because there was no array left to diff. An empty
# array is the same failure with one more character.
FILES_MISSING=$(node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  const f = pkg.files;
  process.stdout.write(Array.isArray(f) && f.length > 0 ? "" : "yes");
')
if [ -n "$FILES_MISSING" ]; then
  echo "ERROR: check-no-internal-refs - package.json has no non-empty 'files' array." >&2
  echo "       npm then publishes almost the whole repository, so docs-content/," >&2
  echo "       CLAUDE.md and .changeset/ all become tarball contents this gate scans" >&2
  echo "       under different assumptions (or, for CLAUDE.md and .changeset/, does not" >&2
  echo "       scan at all, because they are internal by definition)." >&2
  echo "       Refusing to report green over an unbounded tarball." >&2
  exit 1
fi
UNKNOWN_TARBALL_DOCS=$(node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  // Scanned by this gate:            README.md, LICENSE
  // Excluded deliberately, reasons in SCAN SURFACE: CHANGELOG.md, dist
  const known = new Set(["README.md", "LICENSE", "CHANGELOG.md", "dist"]);
  process.stdout.write((pkg.files ?? []).filter((f) => !known.has(f)).join(" "));
')
if [ -n "$UNKNOWN_TARBALL_DOCS" ]; then
  echo "ERROR: check-no-internal-refs - package.json 'files' ships something this gate does" >&2
  echo "       not cover: $UNKNOWN_TARBALL_DOCS" >&2
  echo "       That is public surface a consumer receives in the tarball. Add it to" >&2
  echo "       SURFACE_PATHS, or record it as a deliberate exclusion in this script." >&2
  exit 1
fi

git ls-files -z -- "${SURFACE_PATHS[@]}" > "$FILELIST"

if [ ! -s "$FILELIST" ]; then
  echo "ERROR: check-no-internal-refs - no tracked public-surface files to scan. Refusing" >&2
  echo "       to report green from a scan that read nothing." >&2
  exit 1
fi

# THE SILENT-GREEN ROUTES, all closed here. This list is NOT a claim of exhaustiveness:
# route (9) was found by a refuter against an hl7 copy whose own comment implied it was
# already complete.
#
#   (1) THE SCANNER CANNOT SEE. Closed by the locale pin and the positive self-tests
#       above, plus the negative self-tests, which are stronger than the em-dash gate's
#       single sample: they also catch a rule widened into the trap (1) shape.
#   (2) AN EMPTY FILE LIST. `xargs` without `-r` runs grep anyway, and grep with no file
#       operand reads STDIN, finds nothing, and exits 0. Closed by `-r` AND by refusing an
#       empty list outright, above and again after the loop.
#   (3) `git ls-files` FAILS (unreadable or corrupt index) AND ITS STATUS IS ERASED. The
#       list is built as its OWN command, not as the head of the pipeline: piped, its
#       status is swallowed by the `|| true` the no-match case needs, and the scan reports
#       OK over an empty list.
#   (4) A PATH THE SCANNER NEVER RECEIVES. `git ls-files` C-quotes any path holding a
#       space, a quote or a non-ASCII byte, so unseparated, grep is handed a name no file
#       has. Closed by `-z` here and `-0` on xargs.
#   (5) A FILENAME PARSED AS AN OPTION. A tracked file named `-q` would silence the whole
#       batch and the gate would print OK. Closed by `-e` before the pattern and `--`
#       after it.
#   (6) A FILENAME READ AS STANDARD INPUT, which `--` does NOT close. `--` stops `-` being
#       parsed as an OPTION; grep then reads the bare operand `-` as STDIN, and xargs
#       points its child's stdin at /dev/null, so a tracked file literally named `-` (a
#       `cmd > -` typo, which `git add -A` stages without complaint) is NEVER OPENED and
#       the gate prints OK and exits 0 over a live violation. Closed by `./`-prefixing
#       every path AS THE LIST IS BUILT, in the loop below rather than through `sed -z`, so
#       the scan stays a single command with the stderr capture bound to all of it and
#       there is no GNU-only stage that has no self-test of its own.
#       BE PRECISE ABOUT REACHABILITY: grep treats only a BARE `-` operand as stdin, and
#       every path this gate scans is emitted by `git ls-files` under a listed surface
#       path. None of those is the repo root today, so the worst a file named `-` can
#       produce is `docs-content/-`, which grep opens normally. The route becomes live the
#       moment SURFACE_PATHS gains a root-level glob or `.`. The prefix is therefore kept
#       as the thing that makes widening the surface safe, not as decoration.
#   (7) AN UNREAD ENTRY THAT IS NOT A MISSED MATCH. `-d skip` silently skips a tracked
#       symlink to a directory: no stderr, so nothing refuses, and the gate goes green
#       having never opened it. `-d skip` is NOT used. The loop refuses a tracked entry
#       that is not a regular file BY NAME instead, which is louder. The `! -L` guard
#       matters: `-d` follows symlinks, so a symlink to a directory tests true and would
#       be skipped as if it were a gitlink.
#   (8) A SCAN THAT DIED PART WAY THROUGH AND REPORTED CLEAN. grep's exit status cannot
#       distinguish that from no-match. Closed by capturing stderr and refusing on any of
#       it; see refuse_if_incomplete.
#   (9) A VIOLATION THAT STRADDLES A LINE WRAP. Not inherited from the em-dash family at
#       all: that gate matches a single character, so line anchoring costs it nothing.
#       Every rule here except the bare identifier is multi-token, and this repo hard-wraps
#       its markdown, so a phase sentence broken across two lines reads perfectly on the
#       rendered page and is invisible to a line scan. Closed by the paragraph-joined
#       second pass at the bottom of this file.
#
# Also, and not a route so much as a standing choice: NO `-I`. `-I` skips anything grep's
# heuristic calls binary, which includes a genuine TEXT file with a broken encoding, so a
# violation inside one would be skipped in silence. This repo's public surface is markdown
# and JSON with no binaries (checked: no tracked file under it holds a NUL byte), so losing
# `-I` makes a future binary a loud red instead of a silent miss. Fail closed, not open.
# `-H` is set so every hit carries its filename: grep omits the name when handed exactly
# one file, which an xargs batch boundary can produce.
: > "$SCANLIST"
gitlinks=0
scanned=0
while IFS= read -r -d '' f; do
  if [ -d "$f" ] && [ ! -L "$f" ]; then
    gitlinks=$((gitlinks + 1))
    continue
  fi
  if [ ! -r "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked file is not readable: $f" >&2
    echo "       Refusing to report green from a scan that could not open its input." >&2
    exit 1
  fi
  if [ ! -f "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked entry is not a regular file: $f" >&2
    echo "       Refusing to report green from a scan that skipped one of its inputs." >&2
    exit 1
  fi
  printf './%s\0' "$f" >> "$SCANLIST"
  scanned=$((scanned + 1))
done < "$FILELIST"

if [ ! -s "$SCANLIST" ]; then
  echo "ERROR: check-no-internal-refs - no public-surface files survived list building." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# The npm metadata is public surface that is not a file of its own. Extract the two fields
# the convention names and scan them as text. Written with a real newline between fields so
# a hit reports a usable line number.
node -e '
  const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8"));
  const lines = ["description: " + (pkg.description ?? ""), "keywords: " + (pkg.keywords ?? []).join(", ")];
  process.stdout.write(lines.join("\n") + "\n");
' > "$NPMBUF"
if [ ! -s "$NPMBUF" ]; then
  echo "ERROR: check-no-internal-refs - could not read the npm metadata from package.json." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Scan, one rule at a time so a hit can name the rule it broke
# ---------------------------------------------------------------------------
#
# Each rule is its own single command with its own stderr capture, rather than one merged
# pattern: a merged pattern cannot report WHICH rule fired, and "phase language" and
# "internal identifier" want different remediation advice. The cost is N passes over a
# handful of markdown files, which is nothing.
ALL_HITS=""
i=0
while [ "$i" -lt "$RULE_COUNT" ]; do
  : > "$ERRLOG"
  HITS=$(xargs -0 -r grep -H -nP -e "${RULE_PATTERN[$i]}" -- < "$SCANLIST" 2>>"$ERRLOG" || true)
  refuse_if_incomplete

  : > "$ERRLOG"
  NPM_HITS=$(grep -H -nP -e "${RULE_PATTERN[$i]}" -- "$NPMBUF" 2>>"$ERRLOG" || true)
  refuse_if_incomplete
  # Report the npm metadata under a name a reader can act on, not a temp path.
  [ -n "$NPM_HITS" ] && NPM_HITS=$(printf '%s\n' "$NPM_HITS" | sed "s|^${NPMBUF}|package.json (npm metadata)|")

  for block in "$HITS" "$NPM_HITS"; do
    [ -n "$block" ] || continue
    ALL_HITS="${ALL_HITS}[${RULE_NAME[$i]}]"$'\n'"${block}"$'\n'
  done
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
# Second pass: the same rules over PARAGRAPH-JOINED text
# ---------------------------------------------------------------------------
#
# WHY THIS EXISTS. Every rule above except the bare identifier is MULTI-TOKEN (`phase X`,
# `wave N`, `this slice`, `roadmap phase K`), grep matches within a line, and this repo
# hard-wraps its markdown by house style. So a violation that happens to straddle a wrap is
# invisible to the line scan, while a reader of the rendered page sees it plainly, because
# markdown folds a soft line break into a space. In the hl7 copy this was not hypothetical:
# a spec-notes page read "... A future phase" / "may add opt-in decode ...", and the gate
# printed OK over it.
#
# So the file is joined the way markdown renders it (consecutive non-blank lines in a
# paragraph become one line, blank lines stay blank) and scanned again. Line numbers are
# lost by construction, so this pass reports the FILE and the MATCHED TEXT, and it reports
# only matches the line pass did not already produce, which keeps a wrapped hit from being
# printed twice in the same run.
#
# It cannot replace the line pass: that one gives line numbers, which is what a remediator
# actually needs. It is additive, and its cost is a second grep per file per rule over a
# handful of markdown files.
while IFS= read -r -d '' f; do
  # WHITESPACE IS SQUEEZED, and that is the whole difference between this pass working and
  # this pass looking as though it works. Joining lines verbatim leaves the continuation
  # line's own indentation in the joined text: an indented wrap produces `phase   may`, and
  # every rule here is written with single spaces, so it does not match. Indented
  # continuations are the DOMINANT wrap shape in this corpus, because the pages are mostly
  # bulleted, so the pass would miss the very case it was added for while reporting that it
  # had run. Squeezing runs of whitespace to one space is also what markdown itself does to
  # a paragraph, so this models the rendered page rather than approximating it.
  : > "$ERRLOG"
  awk '
    /^[[:space:]]*$/ { print ""; next }
    { line = $0; gsub(/[[:space:]]+/, " ", line); sub(/^ /, "", line); printf "%s ", line }
    END { print "" }
  ' "$f" > "$REFLOWBUF" 2>>"$ERRLOG"
  refuse_if_incomplete

  i=0
  while [ "$i" -lt "$RULE_COUNT" ]; do
    : > "$ERRLOG"
    grep -oP -e "${RULE_PATTERN[$i]}" -- "$f" > "$RAWBUF" 2>>"$ERRLOG" || true
    refuse_if_incomplete

    : > "$ERRLOG"
    FLOW_HITS=$(grep -oP -e "${RULE_PATTERN[$i]}" -- "$REFLOWBUF" 2>>"$ERRLOG" || true)
    refuse_if_incomplete

    if [ -n "$FLOW_HITS" ]; then
      # Only what the line pass could not see. An empty RAWBUF means no line-pass match, and
      # `grep -f` with no patterns selects nothing, so -v then keeps every wrapped hit.
      EXTRA=$(printf '%s\n' "$FLOW_HITS" | grep -Fxv -f "$RAWBUF" | sort -u || true)
      if [ -n "$EXTRA" ]; then
        while IFS= read -r m; do
          [ -n "$m" ] || continue
          ALL_HITS="${ALL_HITS}[${RULE_NAME[$i]} / wrapped across lines]"$'\n'"${f}: ${m}"$'\n'
        done <<< "$EXTRA"
      fi
    fi
    i=$((i + 1))
  done
done < "$SCANLIST"

# ---------------------------------------------------------------------------
# THIRD PASS: `src/` DOC COMMENTS, the prose that compiles into `dist/`
# ---------------------------------------------------------------------------
#
# THE CEILING, STATED FIRST, because it is the honest frame for everything below.
# `dist/` is UNTRACKED BUILD OUTPUT. No checked-in gate can scan it without building
# first, and this script deliberately does not build. So the thing a consumer actually
# receives is NOT what is checked here. What is checked is its SOURCE: the `/** */`
# blocks the dts build copies verbatim. That is a PROXY, and it is a good one only
# because the copy is verbatim -- tsup rewrites declarations, not doc text. A rewrite of
# the build that started transforming comments would silently decouple the two, and
# nothing here would notice. This pass therefore raises the floor on `dist/`; it does not
# observe `dist/`.
#
# Two consequences worth naming rather than discovering:
#   * A doc comment that never reaches an exported declaration is swept anyway. That is
#     deliberate: which comments survive the dts rollup is a property of the BUILD, not of
#     the source, and gating on it would make the gate's answer depend on tsup's inlining
#     decisions. RE-DERIVED FOR THIS PACKAGE, because ncpdp's copy of this bullet argues
#     from a fact that is not true here: it has several entry points, so "does it reach a
#     declaration file" is one question per entry there. THIS PACKAGE HAS EXACTLY ONE
#     (`tsup.config.ts` `entry: ["src/index.ts"]`; `exports` is `.` plus
#     `./package.json`), so it is one question -- and the answer is still "sweep it
#     anyway", now for a measured reason rather than an arithmetic one: this repo's
#     CLAUDE.md records 64 `@example` blocks whose imports do not resolve, of which FOUR
#     reached the published `.d.ts` while unexported, because an exported type referenced
#     them. "Is it on the entry point" is the wrong predicate; "does it reach `dist`" is
#     the right one, and neither is knowable from the source alone.
#   * `dist/*.d.cts` is the same text as `dist/*.d.ts`, so one clean source covers both
#     conditions.

# The `src/` surface must still be tracked, for the same reason SURFACE_PATHS is checked:
# a rename that empties this list must red, not shrink the scan in silence.
git ls-files -z -- 'src/*.ts' 'src/**/*.ts' > "$SRCLIST"
if [ ! -s "$SRCLIST" ]; then
  echo "ERROR: check-no-internal-refs - no tracked src/*.ts files to scan for doc" >&2
  echo "       comments. Either the source moved (update this pass, deliberately) or the" >&2
  echo "       scan is about to cover less than it claims. Refusing to report green." >&2
  exit 1
fi

# Same list-building discipline as the public-surface pass: `./`-prefixed as the list is
# built (route 6), a non-regular-file entry refused by name rather than skipped (route 7),
# an unreadable entry refused (not silently missed).
: > "$SRCSCAN"
src_scanned=0
while IFS= read -r -d '' f; do
  if [ -d "$f" ] && [ ! -L "$f" ]; then continue; fi
  if [ ! -r "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked source file is not readable: $f" >&2
    echo "       Refusing to report green from a scan that could not open its input." >&2
    exit 1
  fi
  if [ ! -f "$f" ]; then
    echo "ERROR: check-no-internal-refs - tracked source entry is not a regular file: $f" >&2
    echo "       Refusing to report green from a scan that skipped one of its inputs." >&2
    exit 1
  fi
  printf './%s\0' "$f" >> "$SRCSCAN"
  src_scanned=$((src_scanned + 1))
done < "$SRCLIST"

if [ ! -s "$SRCSCAN" ]; then
  echo "ERROR: check-no-internal-refs - no source files survived list building." >&2
  echo "       Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# EXTRACT THE DOC COMMENTS. Two buffers per pass, and the reason for the second one is
# line numbers: the rules must run over doc text ALONE (so a rule cannot match a line
# number, a path, or the code on the far side of a `*/`), which means the location has to
# travel beside the text rather than inside it. DOCLINES holds one doc line of text per
# line; DOCMAP holds `file:lineno` at the SAME line index. A hit at index N in one is
# located by index N in the other.
#
# The leaders are stripped the way an IDE strips them: `/**`, a leading `*`, and `*/`
# disappear, because none of them is part of what the reader sees on hover. `//` and
# plain `/* */` are NOT extracted -- see the boundary argument at SRC_RULE_NAME above.
: > "$DOCLINES"; : > "$DOCMAP"; : > "$DOCFLOW"; : > "$DOCFLOWMAP"
: > "$ERRLOG"
while IFS= read -r -d '' f; do
  awk -v file="$f" -v dl="$DOCLINES" -v dm="$DOCMAP" -v df="$DOCFLOW" -v dfm="$DOCFLOWMAP" '
    function emit() {
      gsub(/[[:space:]]+/, " ", joined); sub(/^ /, "", joined); sub(/ $/, "", joined)
      if (joined != "") { print joined >> df; print file ":" blockstart >> dfm }
      joined = ""
    }
    # End of a paragraph inside a block: emit it, keep the block open, keep reporting the
    # location as the block start (a paragraph index would be a number no reader can use).
    function flush2() { if (blockstart > 0) emit() }
    # End of the block.
    function flush() { if (blockstart > 0) emit(); blockstart = 0 }
    {
      line = $0
      if (!indoc) {
        if (line !~ /^[[:space:]]*\/\*\*/) { next }
        indoc = 1; blockstart = FNR; joined = ""
        sub(/^[[:space:]]*\/\*\*/, "", line)
      }
      # THE TERMINATOR IS TESTED BEFORE THE LEADER IS STRIPPED, and that ordering is the
      # whole correctness of this extractor. Stripping first turns a closing " */" into
      # "/" (the leader pattern eats the asterisk of the terminator), the block never
      # closes, and every `//` comment and line of CODE after it is scanned as doc text.
      # That is not hypothetical: it is what the first draft of the hl7 pass did, and it
      # reported 60 violations that were all real bookkeeping sitting in `//` comments
      # this surface deliberately does not cover. A gate that over-reports is not "safe":
      # it would have forced a sweep of the wrong lines.
      # TESTING THE TERMINATOR AGAINST DOC TEXT IS CORRECT, NOT A SHORTCUT: a doc comment
      # whose prose contains `*/` (a glob like `src/**/*.ts`, a regex ending `*/`) would
      # close the block early and drop the rest of it from the scan. THE CONSTRUCT IS
      # UNREACHABLE IN VALID TYPESCRIPT: block comments do not nest and cannot contain
      # `*/`, so the compiler ends the comment at exactly the same character this does,
      # and `typecheck` runs ahead of this gate on the ladder. The extractor mirrors the
      # language; it does not approximate it.
      closed = 0
      if (line ~ /\*\//) { closed = 1; sub(/\*\/.*$/, "", line) }
      # Exactly ONE leading asterisk, never `\*+`: a greedy leader would swallow the
      # opening `**` of markdown bold ("* **Fail-safe:**") and alter the scanned text.
      sub(/^[[:space:]]*\*[[:space:]]?/, "", line)
      sub(/^[[:space:]]+/, "", line)
      # The LINE pass sees the doc text with its location beside it.
      print line >> dl; print file ":" FNR >> dm
      # The FLOW pass accumulates a PARAGRAPH, not the whole block, and squeezes it the way
      # a tooltip reflows one. A BLANK doc line is a paragraph break and ends the run, for
      # the same reason the markdown pass above prints an empty line rather than joining
      # through it: a list item ending "(this module)" followed by a blank line and a new
      # sentence starting "The ..." is not the text "(this module) The ...", and joining
      # through the break invents adjacencies that no reader ever sees. Left unbroken, a
      # doc line ending in "phase" followed by a blank line and a paragraph opening with a
      # capital letter would red as "phase X". That is an over-report rather than a silent
      # green, but a gate that reds on correct content is a gate someone deletes.
      if (line ~ /^[[:space:]]*$/) { flush2() } else { joined = joined " " line }
      if (closed) { flush(); indoc = 0 }
    }
    END { if (indoc) flush() }
  ' "$f" 2>>"$ERRLOG"
done < "$SRCSCAN"
refuse_if_incomplete

# An extraction that produced nothing from a non-empty, JSDoc-heavy source tree means the
# extractor broke, not that the tree is clean. Same class as the empty-file-list refusal.
if [ ! -s "$DOCLINES" ]; then
  echo "ERROR: check-no-internal-refs - extracted no doc-comment text from ${src_scanned}" >&2
  echo "       tracked source file(s). Every public export in this package carries JSDoc," >&2
  echo "       so an empty extraction means the extractor is broken, not that the source" >&2
  echo "       is clean. Refusing to report green from a scan that read nothing." >&2
  exit 1
fi

# SCAN. Line pass first (it can name a file and a line), then the reflowed pass for
# violations that straddle a wrap. Wraps are not hypothetical here either: this package's
# doc comments are wrapped at the same column as its markdown, and a sentence ending
# "... this" / "phase models" is exactly as invisible to a line scan in JSDoc as it is in
# markdown. The reflow models a hover tooltip: whitespace squeezed, `*` leaders already
# gone.
SRC_HITS=""
i=0
while [ "$i" -lt "$SRC_RULE_COUNT" ]; do
  # PER-RULE, NOT CUMULATIVE. `RULE_HITS` holds only what THIS rule has already reported,
  # and it is what the wrapped pass below de-duplicates against. See the note there.
  RULE_HITS=""
  : > "$ERRLOG"
  LINE_IDX=$(grep -nP -e "${SRC_RULE_PATTERN[$i]}" -- "$DOCLINES" 2>>"$ERRLOG" | cut -d: -f1 || true)
  refuse_if_incomplete
  if [ -n "$LINE_IDX" ]; then
    while IFS= read -r n; do
      [ -n "$n" ] || continue
      loc=$(sed -n "${n}p" "$DOCMAP")
      txt=$(sed -n "${n}p" "$DOCLINES")
      SRC_HITS="${SRC_HITS}[${SRC_RULE_NAME[$i]} / src doc comment]"$'\n'"${loc}: ${txt}"$'\n'
      RULE_HITS="${RULE_HITS}${loc}: ${txt}"$'\n'
    done <<< "$LINE_IDX"
  fi

  : > "$ERRLOG"
  FLOW_IDX=$(grep -nP -e "${SRC_RULE_PATTERN[$i]}" -- "$DOCFLOW" 2>>"$ERRLOG" | cut -d: -f1 || true)
  refuse_if_incomplete
  if [ -n "$FLOW_IDX" ]; then
    while IFS= read -r n; do
      [ -n "$n" ] || continue
      # Report only what the line pass could not see, so a wrapped hit is not printed
      # twice. A block whose violation is on one line is already reported above.
      blockloc=$(sed -n "${n}p" "$DOCFLOWMAP")
      # DELIMITED, not a bare substring. An unanchored `*"$blockloc"*` makes
      # `./src/x.ts:1` a substring of an existing hit at `./src/x.ts:12`, so a real wrapped
      # violation in the block starting at line 1 is suppressed by an unrelated hit at
      # line 12. It never loses the RED (SRC_HITS is non-empty either way) but it loses the
      # REPORT, which is the line a remediator needs. The trailing ':' is what a location
      # is always followed by in SRC_HITS.
      #
      # AND IT IS MATCHED AGAINST THIS RULE'S HITS ONLY, WHICH IS A FIX TO THE PORTED CODE
      # RATHER THAN A COPY OF IT. The sibling copies test the CUMULATIVE hit list, so a
      # block that already carries a hit from an EARLIER rule silently swallows every later
      # rule's wrapped hit in the same block. Measured on this tree, not theorised: the doc
      # block at `src/model/section.ts:1` carries `Phase 1` on its own opening line (rule
      # 2, line pass) AND a wrapped `the roadmap's section-framing contract` (rule 7,
      # paragraph pass). Under the cumulative test the roadmap citation was suppressed
      # outright and the sweep would have shipped it. Same failure class as the substring
      # bug above, one level up: the red survives, the report does not.
      case "$RULE_HITS" in
        *"${blockloc}: "*|*"${blockloc} (block): "*) continue ;;
      esac
      m=$(sed -n "${n}p" "$DOCFLOW" | grep -oP -e "${SRC_RULE_PATTERN[$i]}" | head -1)
      SRC_HITS="${SRC_HITS}[${SRC_RULE_NAME[$i]} / src doc comment, wrapped across lines]"$'\n'"${blockloc} (block): ${m}"$'\n'
      RULE_HITS="${RULE_HITS}${blockloc} (block): ${m}"$'\n'
    done <<< "$FLOW_IDX"
  fi
  i=$((i + 1))
done

# ---------------------------------------------------------------------------
# FOURTH PASS: `src/` STRING LITERALS, the prose that reaches a consumer's LOG
# ---------------------------------------------------------------------------
#
# The argument for this pass, the measurement behind it, and its four stated boundaries
# are at STR_RULE_NAME above. In short: a parser's warning messages are read more often
# than its README, they are neither markdown nor doc comments, and ONE of them carried
# "this phase" into a consumer's log until this pass was written (six in `ncpdp`; that
# number is theirs, not this tree's, and is why it is named with its repo here).
#
# The extractor keeps text ONLY, never the quotes, and records `file:line` beside each
# extracted line in the same index-aligned way the doc-comment pass does. Several literals
# on one source line are joined with a space, which is safe because a rule that matched
# across the join would have to span two adjacent literals in one expression; measured
# zero such matches, and an over-report there is a maintainer reading one line.
: > "$STRLINES"; : > "$STRMAP"
: > "$ERRLOG"
while IFS= read -r -d '' f; do
  awk -v file="$f" -v sl="$STRLINES" -v sm="$STRMAP" '
    # Whole-line comments are skipped: the doc-comment pass owns `/** */`, and `//` is
    # deliberately out of scope for this gate. Matches `//`, `/*`, `/**` and a ` *`
    # continuation line.
    /^[[:space:]]*(\/\/|\/\*|\*)/ { next }
    {
      line = $0
      out = ""
      while (match(line, /"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/)) {
        out = out " " substr(line, RSTART + 1, RLENGTH - 2)
        line = substr(line, RSTART + RLENGTH)
      }
      if (out != "") { print out >> sl; print file ":" FNR >> sm }
    }
  ' "$f" 2>>"$ERRLOG"
done < "$SRCSCAN"
refuse_if_incomplete

# A source tree this size cannot contain zero string literals. An empty extraction means
# the extractor broke, not that the tree is clean; same class as every other refusal here.
if [ ! -s "$STRLINES" ]; then
  echo "ERROR: check-no-internal-refs - extracted no string literals from ${src_scanned}" >&2
  echo "       tracked source file(s). This package's warning messages, warning codes and" >&2
  echo "       import specifiers are all string literals, so an empty extraction means the" >&2
  echo "       extractor is broken, not that the source is clean. Refusing to report green" >&2
  echo "       from a scan that read nothing." >&2
  exit 1
fi

STR_HITS=""
i=0
while [ "$i" -lt "$STR_RULE_COUNT" ]; do
  : > "$ERRLOG"
  STR_IDX=$(grep -nP -e "${STR_RULE_PATTERN[$i]}" -- "$STRLINES" 2>>"$ERRLOG" | cut -d: -f1 || true)
  refuse_if_incomplete
  if [ -n "$STR_IDX" ]; then
    while IFS= read -r n; do
      [ -n "$n" ] || continue
      loc=$(sed -n "${n}p" "$STRMAP")
      txt=$(sed -n "${n}p" "$STRLINES")
      STR_HITS="${STR_HITS}[${STR_RULE_NAME[$i]} / src string literal]"$'\n'"${loc}:${txt}"$'\n'
    done <<< "$STR_IDX"
  fi
  i=$((i + 1))
done

[ -n "$ALL_HITS" ] && fail_with_hits "the public surface listed above" "$ALL_HITS"
[ -n "$SRC_HITS" ] && fail_with_hits "src/ doc comments, which compile into dist/ and render in every consumer's editor" "$SRC_HITS"
[ -n "$STR_HITS" ] && fail_with_hits "src/ string literals, which reach a consumer as warning and error message text" "$STR_HITS"

echo "check-no-internal-refs: OK (${scanned} public-surface file(s) and the npm metadata scanned against ${RULE_COUNT} rules, line by line and paragraph-joined; ${src_scanned} source file(s) scanned against ${SRC_RULE_COUNT} rules for doc-comment bookkeeping, line by line and paragraph-reflowed, and against ${STR_RULE_COUNT} rules for string-literal bookkeeping; ${gitlinks} gitlink(s) skipped)"
