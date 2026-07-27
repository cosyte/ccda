#!/usr/bin/env bash
# scripts/check-no-emdash.sh
# Brand rule (founder directive, 2026-07-24): cosyte never uses the em dash.
# The em dash (U+2014) reads as an AI tell, so it is banned outright across
# every cosyte surface. Source of truth: `knowledgebase/06-brand/voice-and-tone.md`
# ("No em dashes. Ever."), which names commit messages explicitly.
#
# Ported into ccda on 2026-07-27 from ncpdp (PR #34, `39212bb`), NOT from the older
# knowledgebase copy (PR #12, `f4b42f5`). ncpdp's is knowledgebase's TEXT-ONLY shape
# plus fixes for two routes by which the older copies still print OK without reading
# their input: the bare `-` operand, and `-d skip`. Both are described in the pipeline
# notes below. Starting from knowledgebase, hl7, fhir or x12 would have inherited both.
#
# Measured byte-level over all 161 tracked files before the port, not inferred from
# an extension list:
#   * ONE file holds a NUL byte, `src/profiles/merge.ts` (two of them). See the
#     section below; the byte is load-bearing and is not touched.
#   * ZERO tracked files fail to decode as UTF-8.
#   * Exactly ONE literal em dash existed in the whole tree, in that same
#     `src/profiles/merge.ts`, in a JSDoc comment. This slice replaced that one
#     character with a colon, which is the entire content remediation.
#   * No encoded form (`%E2%80%94`, the JS escape, or the three HTML entities)
#     appears anywhere, in any case, and no lone CP1252 `0x97` either.
#
# ---------------------------------------------------------------------------
# WHY THAT ONE CHARACTER SURVIVED, which is the reason this gate is worth having in
# a repo that was otherwise clean. State it plainly, because it is this repo's own
# evidence for a limit that is usually argued in the abstract.
#
# ccda already ran a "remove em dashes from source + config" sweep, PR #52 (`03d6f5d`),
# on 2026-07-24. It did not touch `src/profiles/merge.ts` AT ALL. The two NULs made
# grep classify the file as binary, so the sweep's scan skipped it and the sweep
# recorded the tree as done. The character had been sitting there since the file was
# introduced on 2026-07-18 in PR #24 (`6b2ad92`), and it outlived a remediation pass
# aimed straight at it.
# A markdown-only measurement agreed the repo was clean, and it was: 0 of 50 markdown
# files. The miss was in TypeScript.
#
# So the residual filed against the shared shape is not hypothetical here. It is the
# reason this port had content to change, and stopping the recurrence is the point.
# ---------------------------------------------------------------------------
# THE NUL-BEARING SOURCE FILE, and what this gate actually does with it.
#
# `src/profiles/merge.ts` uses a raw NUL as the separator in the composite key built
# by `toleranceKey`. The byte IS the feature: it is chosen precisely because it cannot
# occur in any of the code, section-code, or template-id fragments it joins, so it
# cannot be removed or re-encoded. GNU grep therefore classifies that file as binary.
#
# It was believed for a day that this BLOCKED the port, on the reading that
# knowledgebase's shape "reds with no fix available" on a NUL-bearing file. That does
# not follow, and it is worth writing down because it parked the work: the red comes
# from the MATCH, never from the NUL. A NUL-bearing file with no em dash in it scans
# clean and this gate is green over it, which is the state of this repo today.
#
# What happens when it does match, MEASURED with GNU grep 3.8 on this repo's real file
# rather than reasoned about: grep exits 0 (it did match), writes NOTHING to stdout,
# and writes `grep: ./src/profiles/merge.ts: binary file matches` to STDERR. The hit
# never reaches `$HITS` and `fail_with_hits` never fires. `refuse_if_incomplete`
# catches it off the stderr capture instead, and THE GATE GOES RED. That is exactly
# what happened on the first run of this script in this repo, before the one-character
# fix landed, and it is how the file PR #52 missed was found.
#
# Two properties of that to keep in mind:
#   * It fails closed by a DIFFERENT route than an ordinary hit, so the message a
#     reader gets is the generic "the scan reported errors, so it did not read all of
#     its input" rather than a quoted line. That is a true statement about an
#     incomplete scan and a misleading one about this cause: it sends a reader hunting
#     an I/O failure that never happened. dicom's parallel port of this same script
#     added a message-only branch naming the case. It is NOT adopted here, because it
#     is a wording improvement rather than a hole (the run reds either way), and the
#     rule for this shape is that only outright-wrong behaviour gets patched in one
#     copy. It belongs in the cross-repo carry-back with the rest.
#   * On GNU grep older than 3.5 the same diagnostic went to STDOUT instead. That
#     lands in `$HITS` and reds through `fail_with_hits`. Both vintages red; only the
#     message differs.
#
# Do NOT swap in the website copy. That one partitions on the NUL byte to tolerate
# tracked rasters, and here it would be actively wrong rather than merely dead weight:
# it would silently exempt `src/profiles/merge.ts`, first-party TypeScript, from a ban
# the brand doc says has no exceptions. That is not a thought experiment either. It is
# precisely the exemption PR #52 made by accident, and re-making it on purpose would
# have left this slice with nothing to find. pathways' preferred `git check-attr binary`
# partition is also unavailable: this repo declares nothing in `.gitattributes`, and
# adding a declaration is deferred to the cross-repo "what is a text file" rule and is
# deliberately not done here.
#
# This repo tracks no binary assets at all, so nothing needs excluding today. The
# ambiguity the shape cannot resolve (a binary asset versus a text file that gained a
# NUL) therefore costs it nothing right now. A future vendored raster would make it
# bite, and the answer then is the `.gitattributes` declaration, not a byte heuristic.
#
# There are no `.xml` fixtures to worry about: ccda's C-CDA fixtures are inline
# TypeScript under `test/__fixtures__/`, so they are ordinary scanned source. That the
# scan really reads them, and reads the `.snap`, `.txt`, `.yml` and `.md` files too,
# was proved by seeding one of each with a live character and watching the gate red.
# ---------------------------------------------------------------------------
#
# The fix is never to re-encode the character: rewrite the sentence with a
# period, a colon, a comma, or parentheses.
#
# Two modes:
#   check-no-emdash.sh                 scan every tracked file
#   check-no-emdash.sh --stdin LABEL   scan text on stdin (CI feeds it the PR
#                                      title, body, and commit messages: the
#                                      voice rule names commit messages, and a
#                                      commit-message em dash is the near-miss
#                                      that prompted the gate in knowledgebase)
#
# Note: this script itself is excluded from the tracked-file scan (it necessarily
# names the encodings it bans). It matches by codepoint and by encoding, so it
# never contains the literal character.
#
# ---------------------------------------------------------------------------
# DISCLOSED RESIDUALS. These are inherited from the shared shape knowingly. They are
# ONE cross-repo fix, not one fix per repo, so they are not fixed here. Count the copies
# properly before carrying anything back, because the usual list is short by two. On main
# there are NINE: the seven same-shape copies (knowledgebase, hl7, fhir, pathways, x12,
# ncpdp, dicom, plus this one makes eight of that family) and website's NUL-partition
# variant, and `docs`, which is routinely left out and is the weakest in the fleet. Its
# whole scan is one line with no -z / -0 / -r / -- / -e, and with BOTH -I and -d skip:
#   git ls-files | grep -vxF 'scripts/…' | xargs grep -Ind skip -nP "$PATTERN" || true
# That is every fail-open route this header names, in one place. Do not
# patch them in this copy alone: a divergent variant is worse than a known shared
# limit, EXCEPT where the shape is outright wrong rather than merely bounded.
# (Two things ARE already fixed in the shape this copy was taken from, because each
# defeats this gate's central promise, and they defeat it in different ways: the `-`
# operand let a LIVE CHARACTER through green, while `-d skip` let an UNREAD ENTRY pass
# green, which is a missed read rather than a missed match. `-H` arrived alongside them
# but is cosmetic: it only makes an already-RED report unattributable. All three came
# from ncpdp and are shape bugs rather than repo-local ones, so knowledgebase, hl7,
# fhir and x12 still need them, with one check first: `pathways` already refuses
# directories by another route and so does not need the `-d skip` half. That carry-back
# is tracked as one cross-repo unit and is deliberately not attempted from here.)
#
#   (i)  A tracked TEXT file holding a NUL byte is classified binary by grep and,
#        if it also carries an em dash, reported on stderr rather than skipped, so
#        here it goes RED rather than silently missed. That is fail-closed, and it is
#        why this shape rather than website's is the right one for THIS repo, which
#        does have such a file: `src/profiles/merge.ts`. Under website's NUL-partition
#        the same file is silently exempt, which is the accident PR #52 already made
#        once (see the section above).
#        The property that remains unsolved across the whole ecosystem: the shape
#        cannot tell "binary asset" from "text file that gained a NUL", and this repo
#        cannot either, because it declares nothing in `.gitattributes`. ccda tracks no
#        binary assets today, so the ambiguity costs it nothing. A future vendored
#        raster would make it bite, and the answer then is the `.gitattributes`
#        declaration, not website's byte heuristic.
#        Note what this residual is NOT. It is not a reason this port was blocked. The
#        claim that it was rested on reading "classified binary" as "reds unremediably",
#        and a NUL-bearing file reds only if it MATCHES.
#   (ii) Encoded-form matching is LITERAL: case-sensitive, and the HTML entities
#        require the semicolon. So `%e2%80%94` (lowercase), `&#X2014;` (capital X),
#        `&#x2014` (no semicolon) and `&#08212;` (zero-padded) all pass this gate.
#        The literal UTF-8 character, the canonical URL encoding, the JS escape, and
#        the three canonical entities are what is caught. Widening the pattern is the
#        cross-repo fix, not a local one.
#  (iii) Stderr capture binds only to the LAST stage of the pipeline, the scanning
#        grep. It does NOT bind to the `grep -zvxF` self-exclusion filter or the
#        `sed -z` prefixer ahead of it. Say the consequence plainly rather than in
#        terms of the helper, because it is exactly the failure this gate exists to
#        refuse: if either earlier stage dies, its stderr is not routed to ERRLOG,
#        refuse_if_incomplete does not fire, and THE GATE PRINTS OK AND EXITS 0 over a
#        tree that may hold a live character. Both halves are inherited here: the
#        `grep -zvxF` stage from every sibling copy, and the `sed -z` stage from ncpdp,
#        which added it and measured both with stub binaries. Nothing about it is new
#        in ccda, so this whole residual waits on the cross-repo fix.
#        Unlike `grep -P`, whose ability to match is proved by the self-test above,
#        `sed -z` has no self-test, and it is GNU-only. Neither point bites on
#        `ubuntu-latest`, nor in the standard dev container (GNU sed and GNU grep 3.8
#        both present, checked here). On a STOCK BSD or macOS toolchain the run fails
#        closed earlier at the `grep -qP` self-test, but do not read that as general
#        cover: with GNU grep on PATH and BSD sed (the documented Homebrew `gnubin`
#        setup), the self-test PASSES, `sed -z` is then rejected, and the gate prints
#        OK over a live character. That is a real invocation site, since
#        `pnpm check:no-emdash` and the meta-repo `verify.sh` ladder both run this
#        locally. The shared fix is to bind the stderr capture to the whole pipeline,
#        or to self-test `sed -z` the way `grep -P` is self-tested.
#   (iv) The scan reads file CONTENTS only, never file NAMES. A tracked path that
#        itself carries an em dash (`notes<U+2014>draft.md`) passes green as long as
#        its contents are clean. Measured, not assumed. A filename is a cosyte surface
#        and the ban says "ever", so this is a real gap rather than a scoping choice,
#        but closing it widens what every copy of this gate covers and so belongs in
#        the same cross-repo pass as (i) to (iii), not in this one repo.
#
#   Also worth knowing: GNU grep 3.8 classifies a file as binary on ANY encoding
#   error, not only on a NUL byte. See the KNOWN LIMIT note further down for what
#   that means for a fixture deliberately encoded in a legacy charset.
# ---------------------------------------------------------------------------
set -euo pipefail

# LOCALE PIN, load-bearing. `grep -P` compiles `\x{NNNN}` as a Unicode codepoint only
# in PCRE's UTF-8 mode, which GNU grep enables from the locale. Under LC_CTYPE=POSIX
# (a bare container, cron, `sh -c`, any shell that inherits no locale) GNU grep 3.8
# instead ABORTS with "character code point value in \x{} or \o{} is too large".
# An earlier version of this gate discarded that on stderr and `|| true`d the
# pipeline, so it printed OK having scanned nothing. Do not remove the pin, and do
# not restore the stderr redirect.
#
# The pin cannot be traded for a raw-byte pattern: `\xe2\x80\x94` matches the em dash
# under POSIX but NOT under a UTF-8 locale, where PCRE reads it as three characters.
# One pattern cannot cover both, so the locale is fixed and the pattern follows it.
export LC_ALL=C.UTF-8

# Matches U+2014 as the literal character and as its encodings: %E2%80%94 (URL),
# the JS backslash-u escape, and the &mdash; / &#8212; / &#x2014; HTML entities.
# See residual (ii) above for exactly which near-misses this does NOT catch.
PATTERN='\x{2014}|%E2%80%94|\\u2014|&mdash;|&#8212;|&#x2014;'

# SELF-TEST: prove the scanner can still see what it is meant to catch before any
# clean result is believed. `printf` emits U+2014 as its UTF-8 bytes, so this file
# still never contains the literal character.
if ! printf 'a\xe2\x80\x94b\n' | grep -qP "$PATTERN"; then
  echo "ERROR: check-no-emdash - the scanner cannot match a known em dash." >&2
  echo "       grep -P is unavailable or not in UTF-8 mode (LC_ALL=${LC_ALL})." >&2
  echo "       Refusing to report a clean tree on a scanner that cannot see." >&2
  exit 1
fi

fail_with_hits() {
  local what="$1" hits="$2"
  echo "$hits" >&2
  echo "" >&2
  echo "ERROR: check-no-emdash - em dash (U+2014, or an encoded form) found in ${what}." >&2
  echo "       cosyte never uses em dashes (founder directive; 06-brand/voice-and-tone.md)." >&2
  echo "       Rewrite with a period, colon, comma, or parentheses." >&2
  exit 1
}

# Anything the scanner writes to stderr means it did not read everything it was
# given, and an incomplete scan must never print OK. Both modes route grep's stderr
# here and refuse to continue if it is non-empty, because exit status cannot carry
# that signal: grep exits 1 on "no match", which xargs in turn reports as 123, so
# "clean" and "died part way through the batch" are indistinguishable by code.
ERRLOG=$(mktemp)
FILELIST=$(mktemp)
trap 'rm -f "$ERRLOG" "$FILELIST"' EXIT

refuse_if_incomplete() {
  [ -s "$ERRLOG" ] || return 0
  cat "$ERRLOG" >&2
  echo "" >&2
  echo "ERROR: check-no-emdash - the scan reported errors, so it did not read all of" >&2
  echo "       its input. Refusing to report green from an incomplete scan." >&2
  exit 1
}

# ---- stdin mode: text that is not a file (commit messages, PR title and body) ----
if [ "${1:-}" = "--stdin" ]; then
  LABEL="${2:-stdin}"
  HITS=$(grep -nP -e "$PATTERN" - 2>>"$ERRLOG" || true)
  refuse_if_incomplete
  [ -n "$HITS" ] && fail_with_hits "$LABEL" "$HITS"
  echo "check-no-emdash: OK (no em dashes in ${LABEL})"
  exit 0
fi

# ---- default mode: every tracked file ----
#
# `git ls-files` is relative to the working directory, so from a subdirectory it
# lists a subtree and the scan would report OK having skipped the rest of the repo.
# Anchor at the top level, which also keeps the self-exclusion path below correct.
cd "$(git rev-parse --show-toplevel)"

# The choices below each close a route by which the scan could report green without
# having actually read its input, because a gate that prints OK when it did not read
# its input is worse than no gate at all. Each was checked RED in this repo, with a
# seeded fixture per route, before the port landed.
#
# This list is NOT a claim of exhaustiveness, and an earlier draft of this comment
# wrongly read as one. A refuter pass found a route the draft's own wording implied
# was closed (the `-` operand, below). Treat it as the routes that are known and
# closed, not as proof that no other exists.
#
#   -0 -r on xargs, fed by `git ls-files -z`: -r drops the grep invocation entirely
#   when the file list is empty (without it, grep falls back to reading stdin and
#   prints OK), and the NUL separator is what makes the list verbatim. Unseparated,
#   `git ls-files` C-quotes any path holding a space, a quote, or a non-ASCII byte,
#   and grep is then handed a name no file has. Every tracked path in this repo is
#   ASCII today, but a C-quoted path is one `git add` away.
#
#   the file list is built as its own command, not as the head of the pipeline, so a
#   `git ls-files` that fails (an unreadable or corrupt index) stops the run. Piped,
#   its status is erased by the `|| true` the no-match case needs, and the scan would
#   report OK over an empty list. An empty list is refused for the same reason.
#
#   -e before the pattern and -- after the file list, so neither a pattern nor a
#   tracked filename that starts with a dash is read as a grep option. A file named
#   `-q` would otherwise silence the whole batch and the gate would print OK.
#
#   `sed -z 's|^|./|'` prefixes every path, which is what actually closes the dash
#   family. `--` alone does NOT: it stops `-` being parsed as an OPTION, but grep then
#   reads the bare operand `-` as STANDARD INPUT, and xargs points its child's stdin at
#   /dev/null. A tracked file literally named `-` (a `cmd > -` typo, which `git add -A`
#   stages without complaint) was therefore never opened, and the gate printed OK and
#   exited 0 over a live em dash. Measured, not theorised: it is why this line exists.
#   The prefix is applied AFTER the self-exclusion filter below, so that filter still
#   compares against the plain repo-relative path.
#
#   -H so every hit carries its filename. grep omits the name when it is handed exactly
#   one file, which an xargs batch boundary can produce, and an unattributable hit in a
#   red build is a worse report for no saving.
#
#   NO -d skip. It was in the shape this was ported from, and it is the one fail-OPEN
#   flag in the pipeline: with it, a tracked symlink to a directory is skipped silently
#   (no stderr, so refuse_if_incomplete never fires and the gate goes green). Without
#   it grep says "Is a directory" on stderr and the run goes red. git tracks no plain
#   directories, so dropping it costs nothing here and fails closed instead of open,
#   which is this script's stated posture. One caveat for whoever carries this back: a
#   tracked GITLINK (mode 160000, a submodule) also presents as a directory, so without
#   `-d skip` a repo with a submodule goes hard red. ccda has none (checked: `git ls-files
#   -s` reports no mode 160000 entry), and neither does ncpdp, knowledgebase, hl7, fhir,
#   or pathways, so the carry-back is safe as written. A consumer that does have one needs
#   the gitlinks filtered out of the list, not `-d skip` restored, which would reopen the
#   symlink hole.
#
#   no -I, and here that is the load-bearing choice rather than a precaution. -I skips
#   any file grep reads as binary, which is not only true binaries: it covers a text file
#   holding invalid UTF-8, AND it covers `src/profiles/merge.ts`, whose functional NULs
#   make grep classify first-party TypeScript as binary. With -I the em dash in that file
#   would have been skipped silently, which is exactly what PR #52's sweep did. Without
#   it, the file is a LOUD red (grep prints "binary file matches" on stderr and
#   refuse_if_incomplete fires). This repo tracks NO binary assets at all: as measured
#   2026-07-27, BEFORE this port added its own files, 161 tracked files, exactly one
#   holding a NUL, all 161 decoding as UTF-8. Do not read that count as current. It is a
#   snapshot, it moves with every commit, and this header deliberately does not restate it
#   in the present tense: a gate whose thesis is that a scan must not claim more than it
#   read has no business carrying a census that goes stale on arrival. Re-measure if you
#   need a number. What is durable is the shape of the tree, not its size: TypeScript,
#   markdown, JSON, YAML, shell, one Vitest snapshot, and assorted dotfiles and
#   extensionless config, every one of which the scan reads. Fail closed, not open.
#
#   KNOWN LIMIT, stated because ccda is a parser repo where it is plausible. The
#   pattern matches U+2014 as UTF-8 and as the five textual encodings listed with it. It
#   does NOT match an em dash encoded in some other charset, and a C-CDA fixture with an
#   `encoding="ISO-8859-1"` XML declaration carrying CP1252 0x97 is a plausible future
#   artifact here: real vendor CDA in a Windows codepage is common, and the day one is
#   checked in as a byte-faithful fixture this limit is live. Measured, not assumed: such
#   a file scans clean and this gate stays GREEN. There was none at the time of the port.
#   Every C-CDA fixture was inline TypeScript then, every tracked file decoded as UTF-8,
#   and the one `0x97` byte in the tree was the second byte of a valid `\xc3\x97` (a
#   multiplication sign in a test comment) rather than a legacy-charset em dash. Re-measure
#   rather than trusting that sentence. The -I discussion above does
#   not rescue the case either: GNU grep 3.8 DOES
#   classify such a file as binary (any encoding error is enough, a NUL is not required),
#   but it only surfaces that as the "binary file matches" diagnostic when the pattern
#   actually matches, and a pattern written in UTF-8 never matches a bare CP1252 0x97. So
#   nothing reaches refuse_if_incomplete and the run stays quiet. This is not a wholesale
#   skip of mixed-encoding files, though: a UTF-8 em dash on another line of the same file
#   is still caught normally, and that case DOES go red.
#   This is accepted rather than fixed: the ban is a rule about prose that people write,
#   and fixture bytes are grounded data, not brand copy. If a legacy-charset fixture ever
#   lands, a reviewer covers it, not this script. Do not widen the pattern to chase it,
#   and do not re-add -I.
#
#   stderr is captured and any of it fails the run (see refuse_if_incomplete above).
#
# The one file the scan does not cover is this script, which has to name the encodings
# it bans. Nothing checks the checker, so keep it free of the literal character: it
# matches by codepoint and by encoding and never spells one out.
git ls-files -z > "$FILELIST"

if [ ! -s "$FILELIST" ]; then
  echo "ERROR: check-no-emdash - no tracked files to scan. Refusing to report green" >&2
  echo "       from a scan that read nothing." >&2
  exit 1
fi

HITS=$(grep -zvxF 'scripts/check-no-emdash.sh' < "$FILELIST" |
  sed -z 's|^|./|' |
  xargs -0 -r grep -H -nP -e "$PATTERN" -- 2>>"$ERRLOG" || true)

refuse_if_incomplete

[ -n "$HITS" ] && fail_with_hits "the tracked files listed above" "$HITS"

echo "check-no-emdash: OK (no em dashes in the tracked files; this script is excluded)"
