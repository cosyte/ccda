# phi-scan bypass log

This file logs every `--allow-fixture <path>` bypass invocation of
`scripts/phi-scan.ts`. The scanner refuses to honor a `--allow-fixture <path>`
flag UNLESS this file contains an entry referencing the same path. The committed
log is intentionally annoying: it discourages bypass and creates an audit
trail. Prefer extending `scripts/phi-allow-list.txt` (a token-level, reviewed
declaration) over a whole-file bypass.

## How the scanner detects PHI

`scripts/phi-scan.ts` is C-CDA-shape-aware. It does NOT blind-regex the file: it
reads only the element text and attributes that actually carry each PHI category,
so a coded clinical value (`<code code="55607006" …/>`) or a template OID
(`<templateId root="2.16.840…"/>`) never trips it. Detection is
namespace-prefix tolerant (`<given>` == `<v3:given>`), case tolerant, quote
tolerant (`"` or `'`), and decodes XML character references + `<![CDATA[…]]>`
before comparing, so a `<family>&#x53;mith</family>` or a CDATA-wrapped name is
still caught.

Enumeration + scope keep the scan honest and un-dodgeable:

- **The walk covers the whole working tree, not a fixtures folder.** In CI /
  all-mode the scanner walks the entire repo (gitignored paths excluded); at
  pre-commit it takes every staged file. Enumeration is NOT scoped by directory
  or extension: a real C-CDA document cannot dodge the scanner by its file name
  (`patient.cda`, a root-level `record.xml`, an `examples/` sample, `notes.md`)
  or by living outside `test/`. **Scope is then decided per file by content.**
- **What each file gets.** A file is treated as a C-CDA _document_ (→ full
  structured scan **on top of** the shape pass) when it has a native extension
  (`.xml` / `.cda` / `.ccda`), lives under `test/` (this repo embeds its synthetic
  C-CDA in `test/__fixtures__/*.ts` and inline in the suites, there is no separate
  `test/fixtures/*.xml` tree), or carries a C-CDA content marker while being
  neither hand-written `src/` / `scripts/` source nor markdown. **Every other
  target gets the conservative dashed-SSN + email pass, with no path exemption at
  all.** The two carve-outs from the _structured_ scan exist so that a C-CDA
  marker inside a JSDoc `@example`, a comment or a documentation page does not
  turn prose into a "document" and flag its illustrative tokens (this scanner's
  own doc comment is one, and the published docs work through real examples).
- **Markdown is a document like any other, and a draft that exempted it was
  refused.** That draft gave `.md` the shape floor only, arguing it could
  subtract nothing because no route read a `.md`. **There are three routes, not
  two:** `paths` (`pnpm phi-scan <file>`) already ran the structured scan over a
  marker-bearing `.md`, so a real C-CDA saved as `notes.md` went from nine hits
  to `OK, no hits` on it. The floor is also empty for that document class, which
  carries its SSN as an undashed `id@extension` and carries no email. Full
  measurement:
  `documentation/agent-notes.md#the-corpus-every-phi-scan-route-read-past`.
- **The scanner's own test is excluded, and the exclusion is a LITERAL PATH.**
  `test/scripts/phi-scan.test.ts` necessarily embeds real-looking violator
  strings as adversarial inputs (and writes its runtime violators to a throwaway
  temp dir), so scanning the gate's negative controls would flag them. It was
  the prefix `test/scripts/`, which covered four files where that reason covers
  one; the other three are scanned now. **It is excluded from the two SWEEPING
  routes, not from every route**: naming it on the command line still scans it.
  There is exactly one other exemption and it is narrower: `CHANGELOG.md` is read
  and shape-scanned but not run through the structured detectors, because it is
  generated output that must not be hand-edited and it quotes this scanner's own
  negative-control literals verbatim. That costs the whole of the structured scan
  on that file (**five detectors, nine loci on its own content**, not just the
  name one), and the upstream bound is real but narrower than it first reads:
  `.changeset/*.md` is structurally scanned **when it carries a C-CDA marker**,
  and gets the dashed-SSN + email shape pass whatever it carries, but a
  **marker-free** changeset carrying a bare `<given>` / `<family>`,
  `<birthTime>`, an SSN-rooted `<id>` or an address exits 0. That last case is
  pre-existing and identical at base on all three routes, and it is **not** the
  "Free-text names" limitation below: the predicate that gates it is
  `hasCdaMarker`, not prose-versus-markup.
- **Writing documentation is now inside the gate, and this is a real authoring
  constraint.** Eleven files became structurally scanned that were not before
  (`docs-content/*.md`, `docs/adr/*.md`, `documentation/agent-notes.md`, and any
  marker-bearing `.changeset/*.md`). A worked example or an incident write-up
  carrying a non-allow-listed `<given>` / `<family>` / `<name>`, a
  `birthTime@value`, a bare-numeric 6+ digit `id@extension`, a
  `streetAddressLine` / `city` / `postalCode`, or a telecom without the `555`
  convention will now red a **blocking** gate at pre-commit. That is the gate
  working, and it collides with the `agent-notes.md` contract, which requires
  write-ups. **The two remedies, in order: reuse the declared synthetic tokens,
  or describe the locus without reproducing it.** Never delete the write-up to
  get green. This is not hypothetical: the note for this very change was drafted
  quoting an entity-encoded name literal, and the gate caught it.
- **A non-PHI address is declared by VALUE, never by exempting its file.** The
  `EMAIL <address>` tag declares one mailbox; `EMAILDOMAIN` declares every
  mailbox at a domain and is the wrong instrument for a single known address.
  `package.json`'s author field is the case this exists for, and the file is
  still scanned.
- **A scan that could not read what it enumerated REFUSES (exit 2).** All-mode
  lists the tree first and reads each file afterwards, so a file can be deleted
  inside that window: `tsup` writes `tsup.config.bundled_<hash>.mjs` at the repo
  root and removes it when a build ends, which refused a whole publish-time
  sweep once (`ccda@0.0.5`). The refusal was right and the enumeration was
  wrong, so exactly one case is tolerated: a file the walk enumerated **itself**
  that git does **not track** and that fails with `ENOENT`. It is reported on
  stderr as skipped, never dropped silently. A **tracked** file (the committed
  corpus is what the gate promises to have observed), any non-`ENOENT` failure
  (`EACCES`, `EISDIR`: a scan that failed, not a file that went away), a file
  that is back on disk when the sweep ends, a `git` that cannot say what is
  tracked, and a tracked set that comes back empty all still refuse. All-mode
  also refuses outright if it ended up observing no files at all. Pre-commit
  (`--staged`) reads blobs from the git index, so it never depends on any of
  this. **Residual:** the post-sweep re-check is keyed on the enumerated path,
  not on content, so an untracked file _renamed_ inside the window is not read.
  Committing it means `git add`, after which it is tracked and untolerable.
- **An in-scope entry that is not a regular file REFUSES the scan (exit 2), on
  both routes.** A symbolic link read as CLEAN on both until
  `PHI-SCAN-SYMLINK-BLIND-ON-BOTH-ROUTES`. **The rule, what "in scope" means for
  each route, the divergences from the sibling scanners and the residuals are
  stated once, in the docblock of `scripts/phi-scan.ts`. Read it there; this
  list deliberately does not carry a second copy.** The residuals that are
  genuinely _limitations_, one line each, because that is what this list is
  for: `D` (deletion) is not enumerated by `--staged`, because a deletion has no
  staged blob to scan; and `paths` mode follows a link through to its target's
  bytes, which is not this hole because it never reads clean over one.
- **A staged RENAME is enumerated, and used to be invisible to the commit gate**
  (`PHI-SCAN-RENAME-BLIND-AT-PRECOMMIT`); so is an unmerged path, which is
  refused rather than scanned. **The record shapes, the `--no-renames` argument,
  what the widened enumeration costs on this repo specifically, and the bound on
  the unmerged case are stated once, in the docblock of `scripts/phi-scan.ts`.**
  This list carries no second copy of them, for the same reason it carries no
  second copy of the non-regular-entry rule.
- **A scan that could not RUN exits 2, never 1.** `1` means hits found, and node
  exits 1 on an uncaught throw, so a missing allow-list and a directory the walk
  cannot read (`EACCES`) both reported themselves to CI as findings. Both exit 2
  now. Read the 2 as the whole "did not run, or refused" class rather than as
  `InvocationError`: an `EACCES` is a plain system error and is deliberately not
  one.

| Category               | Where it looks                                                                                                                                  | Rule                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient / person names | `given` / `family` text **anywhere** (patient, `guardian`, `assignedPerson`, `informant`, `relatedSubject`, providers); bare `name` direct text | each significant name token must be in the `NAME` allow-list (case-insensitive). Single Latin initials are skipped; single CJK ideographs are kept; honorific / degree words (MD, JR, …) ignored.                                       |
| Date of birth          | `birthTime@value`                                                                                                                               | the normalized `YYYYMMDD` / `YYYYMM` / `YYYY` must be in the `DOB` allow-list. A DOB is indistinguishable from a real one by shape, so the allow-list is the only sound gate.                                                           |
| SSN                    | `id@extension` where `id@root` = `2.16.840.1.113883.4.1` (US SSN OID); dashed `\d{3}-\d{2}-\d{4}` anywhere                                      | a 9-digit SSN-shaped extension under the SSN OID must be in the `ID` allow-list; a dashed SSN anywhere is always a hit.                                                                                                                 |
| MRN / other id         | `id@extension`                                                                                                                                  | a bare all-numeric extension of 6+ digits is a real-looking MRN / account (or a misfiled SSN) and must be in the `ID` allow-list. Synthetic fixtures use prefixed / alphanumeric shapes (`MRN001`, `DOC123`, `prob-act-1`), which pass. |
| Address                | `streetAddressLine`, `city`, `postalCode`                                                                                                       | a `<number> <word>` street line, a city token, or a 5-digit / ZIP+4 postal code must be in the `ADDR` / `CITY` / `ZIP` allow-list.                                                                                                      |
| Telecom (phone)        | `telecom@value`                                                                                                                                 | a ≥10-digit number lacking the `555` fake-exchange convention is a hit. `mailto:` telecoms defer to the email rule.                                                                                                                     |
| Email                  | anywhere                                                                                                                                        | an email whose domain is not an `EMAILDOMAIN` (reserved / test) domain is a hit.                                                                                                                                                        |

## Documented limitations (shared with the sibling scanners)

- **Free-text names.** Section `<text>` narrative is scanned for identifier
  _shapes_ (dashed SSN, email) but NOT for free-text personal names: a name in
  prose is not reliably separable from clinical vocabulary without NLP. A
  reviewer still owns clinical narrative. The structured name loci above are the
  hard gate. (This is why the safety-critical rule is: never put a real name in
  narrative either.)
- **MRN heuristic is shape-based.** A synthetic MRN that happens to be a bare
  all-numeric (6+ digit) number will be flagged until allow-listed: intentional (bare numeric
  ids are the real-MRN shape). Prefer a prefixed / alphanumeric synthetic shape.
  Conversely, a real but alphanumeric MRN (e.g. `H0034521`) is not distinguishable
  from a synthetic prefixed id and is not flagged: the name / DOB / SSN gates are
  the backstop for a real document committed by mistake.
- **Phone `555` accept rule.** A ≥10-digit number containing `555` anywhere is
  treated as the fictional-exchange convention and accepted (mirrors the siblings).
  A real DID containing `555` would pass; the synthetic corpus uses `555` numbers.
- **Non-birthTime dates are not DOBs.** Only `birthTime@value` is gated as a DOB.
  Clinical `effectiveTime` / `time` dates are dates-of-service, not birth dates,
  and are left to the reviewer: gating every date would flag every fixture.
  (Dates of service can be PHI under HIPAA Safe Harbor; keep them synthetic.)
- **Common-name masking (residual, inherent).** The `NAME` allow-list contains
  the common synthetic surnames/givens the corpus uses (DOE, JANE). A real
  patient whose name is entirely common allow-listed tokens is invisible to the
  name detector: a structural consequence of a token allow-list, shared by the
  siblings. The DOB / SSN / MRN / address gates remain the backstop.
- **Element-text only.** Names are read from the standard PN part elements
  (`given` / `family`) and the DIRECT text of a bare `name`. A name stuffed into
  a non-name element (e.g. a `title` or a comment) is not gated by the name
  detector; the shape passes (SSN / email) still run over the whole payload.
- **Mixed-content name loose text (MINOR, accepted).** In the uncommon
  mixed-content form `<name>John <family>Doe</family></name>`, the structured
  `<family>` child is caught, but the loose given-name text (`John`) beside it is
  not: the bare-`name` reader captures direct text only. A span-to-next-`</name>`
  reader was rejected: it runs away across source files that merely mention
  `<name>` in a comment. Real C-CDA uses fully structured `<given>` / `<family>`,
  so this affects only hand-authored mixed content; put every name part in its own
  element.

## Format

Each entry is a markdown subsection:

```
### <path>

- **Date:** <YYYY-MM-DD>
- **Reason:** <one-line justification>
- **Approved by:** <committer name>
- **Expires:** <YYYY-MM-DD or "permanent">
```

## Entries

(none yet)
