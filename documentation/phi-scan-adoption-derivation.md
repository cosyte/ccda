# `phi-scan` adoption: `ccda`'s parameters, derived

> **🛑 THIS BRANCH IS A DERIVATION, NOT AN ADOPTION. DO NOT MERGE IT.**
> `scripts/phi-scan.ts` is untouched here and still carries its own machinery. The adoption is
> blocked on `@cosyte/script-utils` changes that do not exist yet, listed under
> "What the engine must parameterize". Founder directive, 2026-08-11: _"all updates go to
> script-utils to parameterize the process"_, and _"if there needs to be changes to the config repo
> state that. do not try to hand maintain another file."_ So this repo does not adapt around a gap;
> it writes the gap down.
>
> Everything below was MEASURED against a working draft of the adopted scanner, run on this
> repository, and the draft was then reverted. Nothing here is reasoned from reading the engine.

## 1. The seventh root spelling, which is what this repo was asked to classify

**`ccda` declares no scan roots at all.** There is no `SCAN_ROOTS`, no array, no per-root record,
and no root literal of any kind. `scripts/phi-scan.ts` calls its walk exactly once:

```
const REPO_ROOT = process.cwd();
walk(REPO_ROOT, files, unscannable);
```

So the root is the repository itself, **implicit, singular, and spelled as an absolute path derived
at runtime**. It is not a rename of the `string[]` spelling (there is no list to rename), not the
`{ abs, rel }[]` spelling (there is no record), and not `{ rel, shape }` (nothing declares a kind).
It is the **degenerate case: the root list collapsed to nothing because the answer is "everything"**.

### Verdict: it is expressible today, and it needs NO engine change

`scanRoots: ["."]` is an exact transcription. Measured against the installed engine `0.0.2`:
`normalizeConfig` maps `"."` onto `"."` (via `relative(repoRoot, repoRoot) === ""`), `PhiScan`
sets `wholeRepo = true`, and `isUnderScanRoot` then short-circuits `true` for every path. A draft
scanner configured this way swept this repository, and its **index-keyed half fired** (a hit
reported at `package.json (as git carries it)`), which is the positive control that the union is
populated rather than silently empty.

**So the seventh spelling is not the thing that needs a new parameter.** The parameterization work
this item needs is in the detector surface, not in roots. That is stated plainly because it is the
useful answer: a `config` worker should not spend a slice generalising `scanRoots`.

### The general root type: every spelling already collapses to one

Every spelling in the fleet is, semantically, **a set of repo-relative path prefixes**, and the
engine's `readonly string[]` plus its normalization already expresses all of them:

| spelling                                             | how it collapses                                   |
| ---------------------------------------------------- | -------------------------------------------------- |
| `string[]` named `SCAN_ROOTS`                        | itself                                             |
| `{ abs, rel }[]`                                     | take `rel`; `abs` is derivable from `repoRoot`     |
| `{ rel, shape: "directory" \| "file" }[]`            | take `rel`; the engine derives the kind by `lstat` |
| a renamed constant                                   | itself                                             |
| `["."]` (whole repository, declared)                 | itself                                             |
| **no declaration, walk `process.cwd()` (this repo)** | **`["."]`**                                        |
| a narrower prefix list                               | itself                                             |

The only thing a richer type would buy is the ability to notice that a root is not the KIND it was
meant to be, which the engine already documents as the cost of deriving. That is a real cost and it
is not worth a new parameter for it.

**Recommendation for the `config` worker: do not add a root parameter. Keep `scanRoots: readonly
string[]`.**

### `ccda` and `mllp` are NOT one shape, and the evidence doc grouping them is the thing to correct

Read out of `mllp/scripts/phi-scan.ts` (read-only, no writes to that repo): it declares **two named
absolute-path constants**, `TEST_ROOT = join(REPO_ROOT, "test")` and
`SRC_ROOT = join(REPO_ROOT, "src")`, and walks each. That is a fixed pair of constants, not a list
and not an absent declaration. `ccda` has neither: one call on `process.cwd()` and no constant at
all.

**So the "seventh spelling" is two spellings, and what actually unites them is something else:
BOTH express their roots as ABSOLUTE paths built from `REPO_ROOT`, rather than as repo-relative
declarations.** That is the property worth naming, because it is exactly what the `./`-prefix
pre-check is about: an absolute path is one of the spellings the engine's normalization maps
correctly (`relative(repoRoot, abs)`), so neither repo carries the silently-empty-union defect.
Both still collapse to `readonly string[]` (`["."]` here, `["test", "src"]` there), so this remains
one non-change rather than two changes.

One thing the `mllp` worker should be asked about rather than assumed: that scanner carries a
PER-ROOT reconciliation (a `badRoots` list, an `lstat` that tells an absent root from a dangling
symbolic link, and an `observed` guard that refuses per root rather than only when every root came
back empty). This repo has no equivalent, because with a single whole-repository root there is
nothing to reconcile across. Whether the engine expresses that is an `mllp` question, not a `ccda`
one, and it does not change the root TYPE either way.

### The two mandated pre-checks, re-derived rather than inherited

1. **Is any scan root `./`-prefixed? No, and it cannot be here**, because there is no root literal
   in the base scanner to be prefixed. The literal the adoption introduces is `"."`, which
   normalises to `"."` rather than to `""` or `"./"`. Verified by observation rather than by
   reading: the union half produced a hit under the `(as git carries it)` label, and that is one of
   the index-keyed rules the `./` defect empties in silence.
2. **Does `isStagedReadable` admit anything outside `scanRoots`? No.** This repo's `--staged` route
   applies **no read filter at all** (every `--diff-filter=AMTU` record minus `EXCLUDED_PATHS`
   becomes a target), so the transcription is `() => true`. With `scanRoots` at `["."]`,
   `isUnderScanRoot` is true for every path, so the engine's "readable but outside every scan root"
   refusal cannot fire and nothing is admitted that the root half does not cover. This is derived
   from the two keys independently rather than assumed from one, because they are two independent
   keys and a reviewer has already measured a staged mode-`120000` entry read as content at exit 0
   where they disagreed.

## 2. `ccda`'s parameters, as data

### The five axes

| axis            | parameter          | value                                   | derived from                                                                                                                                                                                                                                          |
| --------------- | ------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. exit codes   | `exitCodes`        | `{ clean: 0, hits: 1, refuse: 2 }`      | the base scanner's stated contract; `1` is reserved for HITS, not exclusive                                                                                                                                                                           |
| 2. roots        | `scanRoots`        | `["."]`                                 | `walk(process.cwd(), ...)`, see above                                                                                                                                                                                                                 |
| 2. exclusions   | `excludedPaths`    | `{ "test/scripts/phi-scan.test.ts" }`   | a LITERAL path, narrowed from a `test/scripts/` prefix that covered four files where the reason covers one                                                                                                                                            |
| 2. read filter  | `isWalkReadable`   | `() => true`                            | **overrides the engine default.** This repo already closed the tracked-markdown escape: sixteen `.md` files were dropped by the walk before a byte was read and dropped again by `--staged`. The engine's default (`exemptsMarkdown`) would REOPEN it |
| 3. staged scope | `isStagedReadable` | `() => true`                            | the base route filters staged records by nothing                                                                                                                                                                                                      |
| 4. gitlinks     | `regularBlobModes` | engine default `{ "100644", "100755" }` | the base scanner refuses a tracked gitlink and a tracked link on exactly those two modes                                                                                                                                                              |
| 5. EOL          | none               | n/a                                     | CHECKED, not skipped: no `.gitattributes`, no `core.autocrlf`, and the engine dedupes by CONTENT, so where the two copies ever differ both are scanned                                                                                                |

### The five detector kinds, and C-CDA's vocabulary for each

The coordinator's framing holds for this repo exactly: the five kinds are universal and only the
vocabulary differs. C-CDA's vocabulary is **element local-names and attribute names**, matched
namespace-prefix tolerant, case tolerant and quote tolerant, with XML entities and CDATA decoded
before comparison.

| kind    | extraction                                                                   | judgement                                                                                                                                                                                        | declaration that answers it                                                                                                     |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| NAME    | leaf text of `<given>`, `<family>`, and a bare `<name>` carrying DIRECT text | Unicode token split; drop single Latin letters (middle initials), keep single CJK; drop a closed set of honorific / degree / suffix tokens                                                       | `NAME <token>` (engine: `allow.names`)                                                                                          |
| DOB     | `<birthTime value=...>`                                                      | normalise to `YYYYMMDD` / `YYYYMM` / `YYYY`, reject impossible month / day                                                                                                                       | `DOB <value>` (engine: `allow.dobs`)                                                                                            |
| ID      | `<id root=... extension=...>`                                                | `root` equal to the US SSN OID `2.16.840.1.113883.4.1` plus a 9-digit extension is an SSN; otherwise a bare-numeric extension of 6 or more digits is an MRN or account number, not upper-bounded | `ID <value>` (engine: `allow.ids`)                                                                                              |
| ADDRESS | leaf text of `<streetAddressLine>`, `<city>`, `<postalCode>`                 | a street line is a house number followed by a word; a postal code is 5 digits with an optional plus-four; a city is name-tokenised                                                               | `ADDR` / `CITY` / `ZIP` **(NO ENGINE EQUIVALENT, gap G2)**                                                                      |
| PHONE   | `<telecom value=...>`, skipping `mailto:`                                    | 10 or more digits and no `555` fake-exchange marker                                                                                                                                              | none, and that is a disclosed pre-existing residual: this detector consults nothing, so its only remedy is the `555` convention |

### Scope decisions that sit inside `detect`, and are data rather than machinery

- **`STRUCTURED_EXEMPT_PATHS = { "CHANGELOG.md" }`.** Read and floor-scanned, never structurally
  scanned. It is generated output that cannot be hand-edited and it quotes this scanner's own
  negative-control literals verbatim, so decoding them is the gate flagging its own documentation.
- **`looksLikeCda(text, path)`**: a native extension (`.xml` / `.cda` / `.ccda`), OR a path under
  `test/`, OR a C-CDA content marker (`<ClinicalDocument`, `urn:hl7-org:v3`, `<recordTarget`,
  `<patientRole`) while NOT hand-written source. The content sniff closes the "rename the document
  to dodge the scanner" bypass.
- **`isSourceCode(path)`**: a `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs` file under `src/` or `scripts/`.
  It SUBTRACTS the structured scan, so widening it silently downgrades any file of that shape
  carrying a marker to floor-only detection.

**All three key on the target's own path, and that is exactly what gap G3 below breaks.**

## 3. What the engine must parameterize

Ordered by whether the adoption can proceed without it.

### G1. A per-address email allowance. BLOCKING.

- **What the engine lacks.** `AllowList` carries `emailDomains` and nothing narrower, and
  `scanCommonShapes` is not overridable, so the only way to quiet an address is to declare its whole
  DOMAIN.
- **Measured.** A draft adopted scanner reported **8 hits across 5 files** on this repository's own
  clean corpus, at exit 1: `package.json`'s `author` mailbox, the same mailbox as the index copy of
  that file, this repository's own allow-list line declaring it, and two mentions in
  `documentation/agent-notes.md`. The gate is red on adoption, in every mode.
- **Why the three local remedies are all refused.** Declaring `EMAILDOMAIN cosyte.com` excuses every
  mailbox at that domain including one carrying a patient name, and the `<telecom>` detector defers
  `mailto:` values to the email floor, so that widening is reachable by a real document. Scrubbing
  the manifest field removes a public, non-patient, org-owned address and destroys the evidence that
  the widened scan opens the manifest. A path exemption leaves the whole manifest unscanned.
- **Minimal API.** Parse the tag `EMAIL <address>` into `AllowList.emails: ReadonlySet<string>`,
  lower-cased, and have the floor's email branch skip a match whose full address is in it.
- **Default.** None to choose: the set is empty unless a repo declares one, and the change is
  strictly narrowing (it can only suppress an address a reviewer wrote down).
- **Why a default cannot cover it.** The value is a specific repository's own mailbox. There is no
  default that is right for anyone else.

### G2. Per-standard allow-list vocabulary. BLOCKING for the address detector's answerability.

- **What the engine lacks.** The shared parser understands four tags (`NAME`, `DOB`, `ID`,
  `EMAILDOMAIN`) and drops every other tag silently. C-CDA declares `ADDR`, `CITY` and `ZIP`.
- **Measured.** Not a live regression today, because this repository currently declares zero entries
  under all three tags, so the adopted draft's address detector behaves identically. What is lost is
  the MECHANISM: adding an `ADDR` line would have no effect, and a developer meeting an address hit
  would have no remedy at all, which is precisely the state the template forbids.
- **Minimal API.** `AllowList.byTag: ReadonlyMap<string, ReadonlySet<string>>`, carrying every tag
  the engine does not itself consume, with values verbatim (no case folding: the caller owns the
  comparison semantics, and `CITY` is compared upper-cased while `ADDR` is compared lower-cased).
- **Default.** Always populated; no configuration key.
- **Why a default cannot cover it.** The categories are per healthcare standard. One generic map
  covers all thirteen and every tag anyone adds later, which is the point of putting it in the
  engine rather than teaching the engine C-CDA's vocabulary.

### G3. `DetectContext` carries the reported LOCUS and nothing else. BLOCKING (measured defect).

- **What the engine lacks.** `ctx.path` is the locus, already decorated with an origin label. A
  detector whose SCOPE is path-keyed cannot key on it.
- **Measured, and this one produced a live false positive.** The adopted draft reported
  `segment=name/family value="Smith"` against `scripts/phi-scan.ts (as git carries it)`. Cause:
  `isSourceCode` tests `/\.(?:ts|tsx|js|mjs|cjs)$/`, the decorated string does not end in `.ts`, so
  the scanner's own docblock example was promoted from source code to a C-CDA document and
  structurally scanned. The same defect silently re-scopes `looksLikeCda`'s extension test and
  `STRUCTURED_EXEMPT_PATHS` for every union-half target.
- **Minimal API.** Add `relPath: string` to `DetectContext`: the target's undecorated,
  repo-relative, forward-slashed path. `ctx.path` keeps its current meaning and `ctx.hit` keeps
  raising against the locus, so nothing existing changes.
- **Default.** Always present; no configuration key.
- **Why a default cannot cover it.** The engine cannot know which of a caller's decisions are scope
  decisions and which are reporting decisions. Only the caller can.
- **It generalises.** The evidence doc already records `terminology` needing the run MODE and
  `dicom` needing an `unread` tally with a `HaltReason` in the same callback. Those are the same
  family: **`DetectContext` is too thin**, and one widening slice should settle all three rather
  than three slices settling one each.

### G4. No outer net: a plain system error takes node's exit 1, this contract's HITS code.

- **What the engine lacks.** `runPhiScan` has no top-level `catch`, and the shipped template calls
  it as a bare `process.exit(runPhiScan({...}))`, so nothing turns an unexpected throw into a
  refusal.
- **Measured, twice.** Two of this repo's pinned cases regressed from exit 2 to exit 1 under the
  adopted draft: a system error thrown past every handler, and `readdirSync` refusing a directory
  (`EACCES`) from inside the walk. Both printed a raw node stack.
- **Minimal API.** `run()` wraps its body; anything that is not an `InvocationError` prints the
  stack under the engine's own refusal line and returns `exitCodes.refuse`.
- **Default.** No key. It is the current default that is wrong.
- **Why this matters beyond this repo.** The template has the same shape, so every repo that adopts
  inherits it, and the failure mode is a scan that could not run being reported to CI as PHI found.

### G5. No floor for an `all`-mode sweep that observed nothing.

- **Measured.** A sweep that read no files reported **exit 0, clean**, under the adopted draft. The
  base scanner refuses.
- **Minimal API.** In `all` mode, refuse when the `read` set is empty.
- **Default.** No key.
- **Note on reachability, stated rather than claimed away.** The engine already refuses an index it
  cannot name or that is empty, which makes this floor hard to reach, and the base scanner kept it
  for exactly that reason: a floor that only fires in a state nobody expects is the one worth
  keeping. It fired in a pinned case here, so it is reachable.

### G6. A non-regular entry NAMED after a tooling directory. Absorbable in this repo.

- **What the engine lacks.** It has no name-keyed skip set; it prunes gitignored directories and
  skips `.git`. `git check-ignore` answers "not ignored" for a LINK named `dist` against the pattern
  `dist/`, so a checkout whose `node_modules` or `dist` is a symbolic link refuses every scan.
- **Measured.** The adopted draft refused with `2 entries are not regular files` where the base
  scanner scanned clean.
- **Recommendation: do NOT parameterize this.** This repo can absorb it as data by dropping the
  trailing slashes from those `.gitignore` patterns, so they match an entry of that name whatever
  kind it is. That is a `.gitignore` change, not machinery. Recorded here so the adoption slice does
  it deliberately rather than discovering it.

### G7. The TOCTOU vanish tolerance. Absorbable in this repo.

- **What the engine lacks.** `Target.tolerateVanish`: an `ENOENT` on an UNTRACKED file the walk
  enumerated itself is reported as skipped rather than refusing. `hl7` is already recorded as
  needing this; **`ccda` has it too, and the evidence doc does not list this repo for it.**
- **Why this repo has it.** `tsup` writes `tsup.config.bundled_<hash>.mjs` at the repository root
  during a build and removes it at the end, which refused a whole sweep at `ccda@0.0.5`.
- **Recommendation: do NOT parameterize this either.** The engine's refusal is the safe direction (a
  false RED), and this repo can restore the property by SCOPE rather than by tolerance: gitignoring
  that one measured producer keeps it out of the walk entirely. Any other untracked file that
  vanishes mid-sweep then refuses, which is the cost every sibling pays and is worth paying.

### G8. The unmerged-path diagnostic on the `--staged` route. Not blocking.

- **Measured.** Two pinned cases changed message: the engine refuses an unmerged staged record under
  the mode rule (its destination mode is `000000`) rather than under a sentence naming the conflict.
  `all` mode still names it, because the engine keys that half on the absence of stage 0.
- **Minimal API.** Key the staged route on `--raw` status `U` and give it its own noun, the way
  `all` mode already does. Same code, better sentence.

## 4. Adoption notes that are not engine changes, measured here

- The engine prints `[phi-scan] OK: no hits`; this repo's scanner printed `[phi-scan] OK, no hits`.
  Any assertion on that line has to be updated. One pinned case failed on exactly this.
- A repo's anti-vacuity control that MUTATES the completeness rule out of its own scanner source
  stops working on adoption, because the rule is no longer in that file. It has to be re-pointed at
  the installed `node_modules/@cosyte/script-utils/phi-scan.js`. One pinned case failed on this.
- The engine's `--staged` route uses `--diff-filter=d`, which is WIDER than the `AMTU` this repo
  passed. More records are enumerated. No case regressed on it.
- A tracked blob under a `dist`-style name is still caught, but under the WORKING TREE locus rather
  than `(as git carries it)`: `git check-ignore` is index-aware, so a directory holding a tracked
  file is not pruned and the walk reads it directly. One pinned case asserts the label.
- **Fallout size, measured: 19 of 90 cases in `test/scripts/phi-scan.test.ts` failed under the
  adopted draft.** Ten of the nineteen fail for G1 alone (they copy this repo's own corpus into a
  throwaway repository, so the mailbox travels with it). The rest are named above. This is written
  down so the adoption slice budgets for the suite rather than discovering it.

## 5. How to verify an adoption, which is the only known-good method on record

**`pnpm drift` grades the WORKING TREE, not `origin/main`.** A repository with an unmerged branch
checked out reports as PASSING; it read 4 of 13 passing on 2026-08-11 when only 2 had landed. Call
the probe DIRECTLY against each version's scanner instead:

```js
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { probePhiScanCompleteness, phiScanProbeSpec } from "<config>/scripts/drift-check.js";

const at = (rev, p) =>
  rev === "WORKTREE"
    ? readFileSync(`${REPO}/${p}`, "utf8")
    : execFileSync("git", ["-C", REPO, "show", `${rev}:${p}`], { encoding: "utf8" });

probePhiScanCompleteness({
  scannerSource: at(rev, "scripts/phi-scan.ts"),
  allowList: at(rev, "scripts/phi-allow-list.txt"),
  spec: phiScanProbeSpec(name),
  sharedPackageDir: `${REPO}/node_modules/@cosyte/script-utils`,
});
```

Three properties make it trustworthy, and each is why a shortcut fails:

1. **It reads the scanner and the allow-list out of a NAMED REVISION**, so `origin/main`, `HEAD` and
   the working tree are three separate answers from one command. This is the whole fix for the
   working-tree footgun.
2. **`sharedPackageDir` points at the TARGET REPO'S OWN installed engine**, never at `config`'s
   working copy, which is what makes the probe an ADOPTION check: a repo pinned behind a fix is
   graded on the version it actually has, and a repo that has not adopted carries a self-contained
   scanner and needs nothing planted.
3. **It is a capability probe, not a regex over source.** It plants a corpus, learns the repo's HITS
   code from a control run rather than assuming it, checks the decoy scans clean on its own, and
   only then grades the withdrawal. Six defects in this lineage lived in a prose carrier while the
   code was right, so matching prose grades the comment.

Result for this repository, run this way:

```
ccda @ origin/main: ok
ccda @ HEAD:        ok
ccda @ WORKTREE:    ok
```

So **`ccda` already passes the completeness probe on `origin/main` by hand-port.** Adoption here is
about making the NEXT escape one fix rather than a pull request in this repo; it is not about
closing an open probe failure.

### A measurement hazard found while doing this, worth more than the reading it invalidated

**The parallel workers share one scratchpad directory, and they clobber each other's harnesses.** A
probe script written at a shared path was overwritten mid-slice by another repo's worker, and the
same command then answered confidently about a DIFFERENT repository (reporting `drift` for a scanner
that measures `ok`). The reading was caught only because the output format did not match the script
that was supposed to have produced it. Write a measurement harness under a worker-unique path, and
treat a result whose shape you do not recognise as a tooling failure rather than as a finding. This
is the same class as the `grep -c` that returned NO MATCH on a file `rg` read fine.
