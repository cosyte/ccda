#!/usr/bin/env tsx
/**
 * `@cosyte/ccda` PHI scanner, the CI / pre-commit half of the PHI commit-gate.
 *
 * Pure Node. Zero runtime deps (it does NOT import the package's `@xmldom/xmldom`
 * runtime dependency, a commit gate must run without a build and must tolerate
 * the malformed / fragmentary XML a real leaked document arrives as, which a
 * strict DOM parser would reject). Walks the ENTIRE working tree (CI) / every
 * staged file (pre-commit), enumeration is not scoped by directory or extension,
 * so a real document cannot dodge the scanner by its file name, then decides per
 * file whether to run the full structured C-CDA scan (a document) or the
 * conservative dashed-SSN + email text pass (everything else), and REFUSES
 * anything that looks like real PHI, so a developer cannot commit a real-looking
 * C-CDA document by accident.
 *
 * ---------------------------------------------------------------------------
 * WHAT ALL THREE ROUTES SCANNED BY NEITHER, AND WHAT CLOSED IT
 * (`PHI-SCAN-WALK-ROOT-SCOPE`). This repo's walk was already rooted at the REPO
 * ROOT rather than at `src/` + `test/fixtures/`, so the sibling form of this
 * defect (tracked files under `test/` reached by neither route) DID NOT EXIST
 * here and is not what was fixed. Measured on this repo rather than ported: of
 * 140 tracked files at `941afff`, 96 were reached by a detector on the sweeping
 * routes and 44 by neither, of which exactly 4 were under `test/` and all 4 were
 * the `test/scripts/` exclusion. The 44 were three causes, each closed on its own
 * terms:
 *
 *   1. 16 `.md` were dropped BY THE WALK, before a byte was read, and dropped
 *      again by `--staged`. They are enumerated now and scanned like any other
 *      target, structured scan included.
 *   2. 24 were READ and then scanned by nothing, because the shape pass was
 *      bounded to `src/` + `scripts/` JS/TS. Among them the three `scripts/*.sh`
 *      gates, which this docblock already described as covered. See `scanTarget`.
 *   3. 4 were the `test/scripts/` PREFIX exclusion, whose stated reason covers
 *      exactly one file. See `EXCLUDED_PATHS`.
 *
 * Head, on the same 140-file corpus: 139 reached by a detector, 1 by neither
 * (`test/scripts/phi-scan.test.ts`, the pre-existing exclusion, narrowed from the
 * four files a directory prefix covered to the one its reason names), and that 1
 * is the only remaining file under `test/` in neither. 43 files newly opened.
 * Both counts are of the tree each was measured on; the `.changeset/` entry that
 * ships this raises the tracked and the reached figure by one each until a
 * release consumes it, which is why the numbers are dated to their commits rather
 * than asserted as current.
 *
 * 🛑 COUNT THE ROUTES. THERE ARE THREE, AND A DRAFT OF THIS CHANGE WAS REFUTED
 * `INTRODUCED` FOR REASONING ABOUT TWO. `all` and `--staged` are the sweeping
 * ones; `paths` (`pnpm phi-scan <file>`) is the third, it is wired in
 * `package.json`, and `looksLikeCda` governs it too. That draft exempted markdown
 * from the structured scan, arguing the exemption was purely additive because no
 * route read a `.md`. On `paths` the base scanner DID read `.md` and DID run the
 * structured detectors over one carrying a marker, so a real C-CDA saved as
 * `notes.md` went from NINE hits and exit 1 to `OK, no hits` and exit 0. Markdown
 * is now scanned like anything else, and the grid below covers all three routes.
 *
 * THE GRID, base tree and head tree, a dashed-SSN payload and then a `<family>`
 * name payload planted in every tracked file, three routes each. Shape payload:
 * `all` 96 -> 140, `--staged` 96 -> 140, `paths` 140 -> 141, no regression in any
 * cell. Name payload: `all` 26 -> 39, `--staged` 26 -> 39, `paths` 42 -> 40.
 * Non-vacuity: exactly one file is still undetected at head, the one literal
 * exclusion, so the clean cells are decisions about a named file rather than a
 * sweep that stopped running.
 *
 * 🔴 TWO CELLS GO `1 -> 0` AND BOTH ARE NAMED RATHER THAN CLAIMED AWAY. Both are
 * on `paths`, and neither is a route that stopped looking:
 *
 *   - `CHANGELOG.md` loses the STRUCTURED detectors, and this is the only name
 *     detection this change gives up. See `STRUCTURED_EXEMPT_PATHS` for the
 *     argument, the upstream bound, and what it costs. The shape pass still runs
 *     over it, so it is never an unread file.
 *   - `package.json` stops hitting on its own `author` mailbox, because that one
 *     address is now DECLARED in the allow-list. Every allow-list entry ever
 *     added has this shape; that is what a positive synthetic declaration IS. The
 *     refused alternatives were `EMAILDOMAIN cosyte.com`, which would excuse every
 *     mailbox at that domain including one carrying a patient name, and a
 *     path exemption, which would have left the whole manifest unscanned.
 *
 * A THIRD FILE, `docs-content/quickstart.md`, ALSO STOPS HITTING, AND IT IS NOT
 * THE SCANNER THAT CHANGED. Its second worked example used a placeholder person
 * name that is not in the allow-list; the example now reuses the corpus's declared
 * synthetic patient. Measured: the HEAD scanner over the BASE bytes still reports
 * both tokens. Fixing the corpus was preferred to exempting the page, which is
 * this repo's most example-dense documentation and must stay fully scanned.
 *
 * Every one of the 43 newly-opened files was hand-read before this shipped; none
 * carried patient-identifying content, and the `author` address above is the only
 * realistic-shaped token in the whole set. It is NAMED here, not scrubbed: it is
 * public, non-patient and org-owned, and deleting it would destroy the evidence
 * that the widened scan opened the file.
 * ---------------------------------------------------------------------------
 *
 * C-CDA (HL7 CDA R2.1, an XML clinical document) carries PHI by design: patient
 * (and guardian / informant / related-person / provider) names, dates of birth,
 * SSNs, MRNs / other identifiers, addresses, and telecoms. Unlike a JSON fixture
 * there is no natural place for an inline `<!-- synthetic: true -->` marker that
 * every parser test would agree to ignore, and `@cosyte/ccda` keeps its fixtures
 * as embedded XML inside `test/__fixtures__/*.ts` (plus any committed `.xml`), so
 * we use the same proven approach the byte-strict siblings (`@cosyte/hl7`,
 * `@cosyte/dicom`, `@cosyte/x12`) use: a **synthetic allow-list**
 * (`scripts/phi-allow-list.txt`) is the positive declaration that a fixture's
 * identifiers are fake. Any realistic-PHI-shaped token not covered by the
 * allow-list is a hit. Adding a new synthetic fixture therefore means either
 * reusing known-synthetic tokens or consciously extending the allow-list, a
 * reviewed act, never silent.
 *
 * Detection is CDA-shape-aware, NOT a blind text regex: the scanner reads the
 * text of the person-name elements (`given` / `family`, plus a bare `name`),
 * the `birthTime@value` date, `id@root`/`@extension` identifiers, the address
 * elements (`streetAddressLine` / `city` / `postalCode`), and `telecom@value`,
 * and ONLY those. That is deliberate, a naive scan for `<code code="…">` or a
 * `templateId root="2.16.840…"` OID would trip on coded clinical values and
 * template identifiers, giving false confidence, not safety. The detectors are
 * namespace-prefix tolerant (`<given>` == `<v3:given>`), case tolerant, quote
 * tolerant (`"` or `'`), and decode XML entities + CDATA before matching, so a
 * `<family>&#x53;mith</family>` or `<![CDATA[Smith]]>` bypass is caught. See
 * `phi-scan-overrides.md` for the locus → rule map and the documented limits.
 *
 * SECURITY: every subprocess is `git`, invoked via `execFileSync` with array
 * args only. Never shell-form spawn.
 *
 * A scan that could not read what it enumerated REFUSES (exit 2) rather than
 * reporting a clean tree it never observed; that is the property that makes the
 * gate worth having and it is not negotiable. The one bounded exception is the
 * enumeration's own TOCTOU window, documented on `Target.tolerateVanish`: an
 * UNTRACKED file the walk listed itself and that is gone by the time we read it
 * (a build tool's transient) is reported as skipped instead of refusing. A
 * tracked file, a non-`ENOENT` failure, and a file that reappears all still
 * refuse, and `all` mode refuses outright if it ended up observing nothing.
 *
 * Modes:
 *   --staged                 - scan only files staged in `git diff --cached`
 *   --allow-fixture <path>   - bypass one path; rejected unless logged in
 *                              phi-scan-overrides.md
 *   <path> [<path>...]       - scan specific paths
 *   (no args)                - scan all in-scope working-tree files
 *
 * Exit codes: 0 (clean), 1 (hits found), 2 (invocation error, OR a scan that
 * refused, OR one that could not run at all). Read the 2 as the whole class,
 * not as `InvocationError`: an `EACCES` off `readdirSync` is a plain system
 * error and exits 2 as well, deliberately. See the net at the bottom.
 *
 * ---------------------------------------------------------------------------
 * AN IN-SCOPE ENTRY THAT IS NOT A REGULAR FILE REFUSES THE SCAN (exit 2). This
 * paragraph is the ONE authoritative statement of that rule; everything else
 * (changeset, changelog, phi-scan-overrides.md) points here rather than
 * restating it, because a remedy described in four places is a remedy that gets
 * corrected in three.
 *
 * Such an entry is never silently skipped, because BOTH enumerating routes were
 * blind to it in a way that read as CLEAN, and this repo's walk is rooted at the
 * REPO ROOT, so its exposure is the whole tree:
 *
 *   - the walk enumerates `Dirent.isFile()`, which is an lstat answer, so a
 *     symbolic link is neither a file nor a directory and fell out of the loop
 *     silently, whatever it pointed at. A linked DIRECTORY took a whole subtree
 *     with it;
 *   - `--staged` reads content with `git show :<path>`, and git stores a
 *     symbolic link as its TARGET PATH under mode `120000`, so that route was
 *     handed the path text and never the target's bytes.
 *
 * The `--staged` half is worse than blind, and this was measured here rather
 * than reasoned about: the target text is scanned AS IF IT WERE THE FILE'S
 * CONTENT, so a target path of the shape `<dir>/<ddd>-<dd>-<dddd>.xml` is
 * reported as a dashed-SSN hit under the LINK'S name. That is a diagnostic
 * quoting working-tree text that no commit contains. Refusing before the read
 * closes the blind spot and that echo in one move.
 *
 * Neither route is made to FOLLOW a link. Following would read bytes the
 * enumeration does not control (outside the repo, a loop, a device, a FIFO that
 * blocks the gate forever), and git does not carry those bytes anyway, so a hit
 * on them would be a claim about something no commit contains. Refusing states
 * the only true thing available: there is an entry here the scan cannot account
 * for, so the scan is not clean.
 *
 * A refusal names the entry's own repo-relative path (the same locus every hit
 * already carries) and an engine-owned token for its kind. IT NEVER REPORTS THE
 * LINK TARGET, which is working-tree text that can itself carry PHI: a target
 * path of the shape `../patients/<surname>-<given>-<dob>.xml` is the whole
 * reason. The shape is written out rather than an example, because a diagnostic
 * ABOUT a PHI leak is itself a PHI surface, and that applies to the prose
 * explaining it too.
 *
 * "In scope" is each route's OWN existing boundary, not a new one. This narrows
 * what those scopes ADMIT; it does not widen the scopes:
 *
 *   - the walk still skips `WALK_SKIP_DIRS` BY NAME, still drops a gitignored
 *     entry, and still drops `EXCLUDED_PATHS`;
 *   - `--staged` still drops `EXCLUDED_PATHS`. It no longer exempts markdown:
 *     that exemption was one of the three causes above and is gone from both
 *     sweeping routes, including from the unmerged-`U` refusal, which carried a
 *     carve-out whose whole argument was that this route never read a `.md`.
 *
 * TWO DIVERGENCES FROM THE SIBLING SCANNERS, BOTH MEASURED ON THIS REPO RATHER
 * THAN INHERITED, because a remedy's prose does not port with its code:
 *
 *   1. `WALK_SKIP_DIRS` IS APPLIED TO A NON-REGULAR ENTRY TOO, and leaning on
 *      the gitignore filter alone (which is all a sibling whose walk is rooted
 *      at `test/fixtures` + `src` needs) would be wrong here. A trailing-slash
 *      pattern does NOT match a symbolic link of the same name: `git
 *      check-ignore` answers "not ignored" for a LINK named `node_modules`
 *      against `node_modules/`, and "ignored" for a real directory. So a
 *      checkout whose `node_modules` or `dist` is a link would refuse every
 *      scan. This opens no hole: a real `dist/` directory's contents are
 *      already out of scope, so a link named `dist` is the same boundary.
 *   2. THE `.md` EXEMPTION WAS DELIBERATELY NOT EXTENDED TO ONE, on either
 *      sweeping route, and the exemption itself is now gone: markdown is
 *      scanned. The argument outlived it and still binds any future exemption.
 *      A carve-out is a judgement about a file whose bytes the scan COULD have
 *      read; a link's NAME is no evidence at all about what is on the other
 *      side.
 *
 * `--diff-filter=AMTU` INCLUDES `T`, AND LEAVING IT OUT MAKES THE MODE CHECK
 * UNREACHABLE FOR A TYPECHANGE. Be precise about which files: a tracked file
 * that is merely MODIFIED is `M` and carries its mode
 * (`:100644 100644 <sha> <sha> M`), so the check is reached and passes. It is
 * the TYPE change that had no record at all. Replacing a TRACKED regular file
 * with a link is neither an add nor a modify. Git raises it as `T`
 * (`:100644 120000 <sha> <sha> T`), so the `--diff-filter=AM` this route used to
 * carry deleted the record before any mode could be read, and the hook passed a
 * mode-`120000` blob green. Measured here, not inherited. Admitting `T` also
 * closes the reverse typechange, a link replaced by a real file bearing PHI.
 *
 * `--no-renames` IS WHAT MAKES THE TWO-FIELD STRIDE STRUCTURAL, AND THE FILTER
 * ALONE DID NOT CLOSE WHAT IT LOOKS LIKE IT CLOSED. Rename detection is ON by
 * default (and `diff.renames=copies` turns copy detection on too), so
 * `git mv <link> <name>` stages as `:120000 120000 <sha> <sha> R100` carrying
 * TWO paths, and `--diff-filter=AMT` then deleted that record outright: an
 * ordinary `git mv` put a mode-`120000` entry under the scan root and this
 * route printed "OK, no hits" and exited 0, with the mode check never reached.
 * A `git mv` that ALSO substitutes a real name into the destination reports
 * `R<score>` and passed the identical way, which is the worse half, because
 * that is PHI newly written into a file the COMMIT gate never read. Both shapes
 * were measured on this repo, red before the flag and green after it.
 *
 * With detection off the destination arrives as an ordinary single-path `A`
 * (`:000000 120000 0000000 <sha> A`) and the source as a `D` the filter drops,
 * so the enumeration is a strict SUPERSET of the previous one and no `R`/`C`
 * record can be produced whatever the caller's `diff.renames` says. Verified
 * under `diff.renames=true|copies|false|1` and `diff.renameLimit=1`: every one
 * yields that same single-path `A`. It needs no two-path record shape and no
 * stride work, which is exactly what this residual's old "they carry a second
 * path, so admitting them is a scope decision" framing got wrong.
 *
 * WHAT IT COSTS IS ENUMERATION, AND ON THIS REPO THAT IS WIDER THAN ON A
 * SIBLING, SO SAY THE NUMBER. `--staged` here is scoped by NO path prefix (a
 * sibling's staged route is bounded to its fixture root), so every rename
 * DESTINATION anywhere in the tree is now read. Measured: `git mv
 * src/model/entries src/model/clinical` stages 17 records, which this route
 * enumerated as 0 targets before and 17 after. The upper bound is the number of
 * paths in the commit, each read out of the index and scoped by content exactly
 * as an `A` already is. The all-mode WALK is untouched by this flag.
 *
 * `U` (UNMERGED) IS IN THE FILTER TOO, AND IT BUYS AN HONEST DIAGNOSTIC RATHER
 * THAN A CLOSED COMMIT HOLE. Be exact, because the bound is real and was
 * measured rather than reasoned about: `git commit` refuses an unmerged path
 * BEFORE it runs the pre-commit hook (the hook does not run at all), so this
 * route was never the thing that could let one through. What it DID do was
 * report "OK, no hits" over a path it had not read, which is the one answer
 * this scanner must never give. An unmerged record has no stage-0 blob
 * (`git show :<path>` fatals: "in the index, but not at stage 0"), so it is
 * refused under its OWN message rather than folded into the mode check: its
 * destination mode is `000000`, which is not a statement about a link or a
 * gitlink and must not be reported as one.
 *
 * RESIDUALS, DISCLOSED RATHER THAN CLOSED. This list is not asserted to be
 * exhaustive, and a numeral was deliberately removed from its heading after one
 * was measured missing:
 *
 *   - `D` (deletion) is not enumerated: there is no staged blob to scan, and
 *     what a deletion removes cannot be what a commit leaks.
 *   - `git show` runs through `execFileSync`, whose `maxBuffer` is 1 MiB, so a
 *     staged blob larger than that fails the read with `ENOBUFS` and REFUSES
 *     (exit 2) rather than reporting a truncated scan clean. PRE-EXISTING and
 *     fail-safe, disclosed here because `--no-renames` widens what flows
 *     through that call: a `git mv` of a >1 MiB tracked file now refuses where
 *     it used to exit 0. No tracked file in this repo is close (largest ~222
 *     KB). Raising the bound is a decision, not a tidy-up: it trades an opaque
 *     refusal for holding a whole blob in memory.
 *   - `paths` mode (`phi-scan <path>`) uses `statSync`, which FOLLOWS a link, so
 *     an explicitly-named link is scanned through to its target's bytes. It is
 *     left alone because it is not this hole: it never reads CLEAN over a link
 *     (a link to a directory fails `isFile()`, a dangling one fails
 *     `existsSync`), and it is reached only from an argv a human typed, never
 *     from the pre-commit hook or CI.
 *   - A non-regular entry is refused with NO tolerance, including one that is
 *     transient. That is a new refusal class in the same enumeration window the
 *     `ENOENT` tolerance on `Target.tolerateVanish` covers, and it is stated
 *     rather than folded into that tolerance: nothing in this repo produces one,
 *     and a build tool that did would be refused rather than skipped.
 * ---------------------------------------------------------------------------
 */

import { readFileSync, statSync, existsSync, readdirSync, type Dirent } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, sep, isAbsolute } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();
const ALLOW_LIST_PATH = join(REPO_ROOT, "scripts", "phi-allow-list.txt");
const OVERRIDE_LOG_PATH = join(REPO_ROOT, "phi-scan-overrides.md");

// "all" mode walks the ENTIRE working tree (gitignored paths filtered out), not
// just `test/` + `src/`. Enumeration must not be directory- or extension-scoped:
// a real C-CDA document can land anywhere (a `.cda` fixture, an `examples/`
// sample, a repo-root file) and detection follows the file's CONTENT, so the
// walk has to reach every candidate. `scanTarget` then decides per file whether
// it gets the full structured scan (a C-CDA document) on top of the conservative
// shape pass every target gets. A manifest's incidental non-PHI address (the
// `author` field in package.json) is declared in the allow-list by value rather
// than exempted by path, so the file is still scanned.
const WALK_SKIP_DIRS = new Set<string>([
  ".git",
  "node_modules",
  "dist",
  "dist-artifacts",
  "coverage",
  ".turbo",
  ".cache",
  ".vitest-cache",
]);

// The scanner's OWN test is excluded from every route: it necessarily embeds
// real-looking violator strings ("Anderson", a fake SSN, a non-555 phone) as
// adversarial inputs, and its runtime violators are written to a throwaway temp
// dir, never the repo. Scanning it would flag the gate's own negative-control
// literals.
//
// LITERAL PATHS, NOT A DIRECTORY PREFIX. This was `test/scripts/`, which excluded
// FOUR files where the reason above covers exactly one: the other three
// (`agent-notes-contract`, `attw-gate`, `changelog-generation`) embed no violator
// at all, and were unscanned by every route for no stated reason. An exemption
// written as a predicate always covers more than its argument does; write it as
// the paths it is actually about, so adding a neighbouring test file does not
// silently exempt it too.
const EXCLUDED_PATHS = new Set<string>(["test/scripts/phi-scan.test.ts"]);

// The one path that is READ AND SHAPE-SCANNED but not run through the STRUCTURED
// C-CDA detectors, for the same reason as the entry above and written the same
// way: a LITERAL PATH, never a predicate.
//
// `CHANGELOG.md` is generated output that must not be hand-edited, and it quotes
// this scanner's own negative-control literals verbatim, including the
// entity-encoded `<family>&#x53;mith</family>` that exists to prove the decoder
// works. Decoding it and reporting `Smith` is the gate flagging its own
// documentation of itself, on a file whose content cannot be edited to fix it.
//
// WHAT THIS COSTS, STATED RATHER THAN WAVED AT: a person name written into a
// changeset summary reaches this file unscanned by the name detector. It is
// bounded upstream rather than here, and the bound is real: `.changeset/*.md` is
// itself structurally scanned now, on every route, so the text has to pass the
// full gate before a release can copy it in. The shape pass (dashed SSN,
// non-test email) still runs over this file.
//
// A predicate ("any generated file", "any changelog") was refused. The exemption
// is one path because one file has the argument.
const STRUCTURED_EXEMPT_PATHS = new Set<string>(["CHANGELOG.md"]);

// The HL7 v3 OID that identifies a United States Social Security Number. An
// `<id root="2.16.840.1.113883.4.1" extension="…"/>` is an SSN by declaration.
const SSN_ROOT_OID = "2.16.840.1.113883.4.1";

// Person-name tokens that are honorific / degree / suffix words, never an
// identifying name, skipped when they appear inside a bare `<name>` element.
const NAME_NOISE_TOKENS = new Set<string>([
  "MD",
  "DO",
  "DR",
  "MR",
  "MRS",
  "MS",
  "MISS",
  "JR",
  "SR",
  "II",
  "III",
  "IV",
  "RN",
  "NP",
  "PA",
  "PHD",
  "DDS",
  "DMD",
  "ESQ",
  "PROF",
  "FNP",
  "APRN",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  path: string;
  locus: string; // element/attribute locus (e.g. "patient/name/given") or "(ssn)"
  value: string;
  reason: string;
}

interface AllowList {
  /** Uppercase synthetic person-name tokens (`given` / `family` / bare `name`). */
  names: Set<string>;
  /** Synthetic dates of birth, normalized (YYYYMMDD / YYYYMM / YYYY). */
  dobs: Set<string>;
  /** Synthetic street-address lines (`streetAddressLine`), lower-cased. */
  addresses: Set<string>;
  /** Synthetic city names (`city`), upper-cased. */
  cities: Set<string>;
  /** Synthetic postal codes (`postalCode`). */
  zips: Set<string>;
  /** Synthetic id values that legitimately match an SSN / bare-MRN shape. */
  ids: Set<string>;
  /** Allowed email domains (anything else is a hit). */
  emailDomains: Set<string>;
  /**
   * Individually declared full addresses, lower-cased. Narrower than a domain:
   * `EMAILDOMAIN cosyte.com` would excuse `<any-patient-name>@cosyte.com`
   * everywhere in the corpus, `EMAIL hello@cosyte.com` excuses one mailbox.
   * This exists so a non-PHI address that a manifest legitimately carries is a
   * reviewed, value-level declaration rather than a whole-file path exemption.
   */
  emails: Set<string>;
}

interface Args {
  mode: "all" | "staged" | "paths";
  paths: string[];
  allowFixtures: string[];
}

class InvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvocationError";
  }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  let staged = false;
  const paths: string[] = [];
  const allowFixtures: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      for (let j = i + 1; j < argv.length; j += 1) {
        const v = argv[j];
        if (v !== undefined) paths.push(v);
      }
      break;
    } else if (a === "--staged") {
      staged = true;
      i += 1;
    } else if (a === "--allow-fixture") {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new InvocationError("--allow-fixture requires a path argument");
      }
      allowFixtures.push(next);
      i += 2;
    } else if (a !== undefined && a.startsWith("--")) {
      throw new InvocationError(`Unknown flag: ${a}`);
    } else if (a !== undefined) {
      paths.push(a);
      i += 1;
    } else {
      i += 1;
    }
  }

  if (staged && paths.length > 0) {
    throw new InvocationError("--staged cannot be combined with positional paths");
  }

  // An `--allow-fixture` path is a *subtractive* acknowledgement on a broader
  // scan, never a scan target on its own, so it also seeds the positional path
  // set. That makes `--allow-fixture X` mean "scan X, but allow it" (proving the
  // override gate actually subtracts a scanned target) instead of a silent no-op.
  const scanPaths = paths.length > 0 ? paths : [...allowFixtures];

  let mode: Args["mode"];
  if (staged) {
    mode = "staged";
  } else if (scanPaths.length > 0) {
    mode = "paths";
  } else {
    mode = "all";
  }
  return { mode, paths: scanPaths, allowFixtures };
}

/**
 * The `errno` string of a Node system error (`ENOENT`, `EACCES`, ...), or
 * `undefined` for anything else. Narrowed with `in` rather than cast, so a
 * thrown non-error cannot masquerade as a system error.
 */
function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const { code } = err;
  return typeof code === "string" ? code : undefined;
}

// ---------------------------------------------------------------------------
// Allow-list + override log
// ---------------------------------------------------------------------------

function loadAllowList(): AllowList {
  if (!existsSync(ALLOW_LIST_PATH)) {
    throw new InvocationError(`allow-list not found at ${ALLOW_LIST_PATH}`);
  }
  const raw = readFileSync(ALLOW_LIST_PATH, "utf8");
  const names = new Set<string>();
  const dobs = new Set<string>();
  const addresses = new Set<string>();
  const cities = new Set<string>();
  const zips = new Set<string>();
  const ids = new Set<string>();
  const emailDomains = new Set<string>();
  const emails = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const tag = line.slice(0, sp);
    const value = line.slice(sp + 1).trim();
    if (value.length === 0) continue;
    switch (tag) {
      case "NAME":
        names.add(value.toUpperCase());
        break;
      case "DOB":
        dobs.add(value);
        break;
      case "ADDR":
        addresses.add(value.toLowerCase());
        break;
      case "CITY":
        cities.add(value.toUpperCase());
        break;
      case "ZIP":
        zips.add(value);
        break;
      case "ID":
        ids.add(value.toUpperCase());
        break;
      case "EMAILDOMAIN":
        emailDomains.add(value.toLowerCase());
        break;
      case "EMAIL":
        emails.add(value.toLowerCase());
        break;
      default:
        break;
    }
  }
  return { names, dobs, addresses, cities, zips, ids, emailDomains, emails };
}

function normalizePath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  const rel = relative(REPO_ROOT, abs);
  return rel.split(sep).join("/");
}

function loadOverrideLog(): Set<string> {
  if (!existsSync(OVERRIDE_LOG_PATH)) return new Set();
  const raw = readFileSync(OVERRIDE_LOG_PATH, "utf8");
  const out = new Set<string>();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*$/.exec(lineRaw);
    if (m && m[1] !== undefined) out.add(normalizePath(m[1]));
  }
  return out;
}

function validateAllowFixtures(allowFixtures: string[]): void {
  if (allowFixtures.length === 0) return;
  const overrides = loadOverrideLog();
  const missing = allowFixtures.map(normalizePath).filter((p) => !overrides.has(p));
  if (missing.length > 0) {
    const lines = missing.map((p) => `  - ${p}`).join("\n");
    throw new InvocationError(
      `--allow-fixture rejected: no matching entry in phi-scan-overrides.md for:\n${lines}\n` +
        `Add a "### <path>" subsection to phi-scan-overrides.md and commit it.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Target enumeration
// ---------------------------------------------------------------------------

interface Target {
  path: string; // forward-slash repo-relative path for reporting
  read: () => Buffer;
  /**
   * Absolute path, set only for a target the walk enumerated itself, so a
   * vanished file can be re-checked once the sweep has finished.
   */
  absPath?: string;
  /**
   * TOCTOU: true only for a file the scanner ENUMERATED ITSELF in `all` mode
   * AND that git does not track. `all` mode lists the whole tree first and
   * reads each file afterwards, so a transient build artifact can be deleted
   * inside that window: `tsup` writes `tsup.config.bundled_<hash>.mjs` at the
   * repo root and removes it when the build ends, which made a read throw
   * `ENOENT` and refused an entire publish-time sweep (`ccda@0.0.5`).
   *
   * Only the ENUMERATION was unsound there, never the refusal, so the fix is
   * scoped hard rather than by relaxing what a failed read means:
   *   - a TRACKED file is never tolerated. The committed corpus is what the
   *     gate promises to have observed, so if a tracked file cannot be read
   *     the scan is incomplete and still refuses (exit 2);
   *   - only `ENOENT` is tolerated. `EACCES`, `EISDIR` and friends are not a
   *     file that went away, they are a scan that failed;
   *   - a tolerated file is re-checked after the sweep and reported. If it is
   *     back on disk, the sweep did not observe a file that exists now, so the
   *     run refuses;
   *   - `staged` mode reads blobs out of the git index (`git show :path`), so
   *     the pre-commit gate never depends on this at all.
   *
   * RESIDUAL, stated rather than hidden: the re-check is keyed on the PATH the
   * walk enumerated, not on content. An untracked file RENAMED inside the window
   * is `ENOENT` at the old path and was never enumerated under the new one, so
   * its bytes go unscanned under a clean report. It is bounded: the file has to
   * be untracked, so committing it means `git add`, after which it is tracked
   * and untolerable, and pre-commit reads the index either way. Closing it needs
   * a content-addressed sweep, which is a different design, not a wider bound.
   */
  tolerateVanish?: boolean;
}

/**
 * An entry the enumeration reached but cannot scan. Both fields are safe to
 * print: `path` is the entry's own repo-relative path (the same locus every hit
 * already carries) and `kind` is a token from the closed set below. Nothing off
 * the other side of a link is ever recorded here.
 */
interface Unscannable {
  path: string;
  /** An engine-owned token from one of the closed sets below, never input. */
  kind: string;
}

/** Closed-set, engine-owned description of a directory entry's kind. */
function direntKind(e: Dirent): string {
  if (e.isSymbolicLink()) return "a symbolic link";
  if (e.isFIFO()) return "a FIFO";
  if (e.isSocket()) return "a socket";
  if (e.isBlockDevice()) return "a block device";
  if (e.isCharacterDevice()) return "a character device";
  return "not a regular file";
}

/**
 * Enumerate a scan root. `Dirent`'s predicates are lstat answers and are not
 * exhaustive: an entry that is neither a directory nor a regular file is
 * collected into `unscannable` rather than dropped, so the caller can refuse
 * instead of reporting clean over it. See the docblock for why the two
 * name-keyed rules here are treated differently.
 */
function walk(dir: string, out: string[], unscannable: Unscannable[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (WALK_SKIP_DIRS.has(e.name)) continue;
      walk(join(dir, e.name), out, unscannable);
    } else if (e.isFile()) {
      // Markdown is enumerated like everything else. It used to be dropped HERE,
      // before any byte was read, which made every tracked `.md` unscanned by
      // both sweeping routes. Scope is decided per file in `scanTarget`.
      out.push(join(dir, e.name));
    } else {
      // A tooling directory is out of scope whatever kind of entry occupies its
      // name, because a gitignore pattern written `node_modules/` does not match
      // a LINK of that name. Deliberately NOT subject to the `.md` exemption
      // above: that one is about bytes the walk could have read.
      if (WALK_SKIP_DIRS.has(e.name)) continue;
      unscannable.push({ path: normalizePath(join(dir, e.name)), kind: direntKind(e) });
    }
  }
}

/**
 * Refuse (exit 2) over entries the enumeration reached and cannot scan. EVERY
 * offender IN THE GROUP is named, not just the first: a developer who has to
 * re-run the gate once per link learns to distrust it. **Be precise about the
 * qualifier, which the `--staged` route made necessary:** that route now calls
 * this twice, unmerged paths first, and the first call throws, so a tree
 * holding both an unmerged path and a staged link names only the unmerged one
 * and costs a second run. Two groups is the ceiling and each is complete;
 * merging them would mean one message that is false about half its entries,
 * which is the worse trade.
 *
 * `noun` is overridable because the refusal must say something TRUE about what
 * it refused: an unmerged path is not a non-regular file, it is a path with no
 * single staged blob, and reporting it as the former is a diagnostic that sends
 * a developer looking for a symlink that is not there.
 */
function refuseUnscannable(
  entries: Unscannable[],
  why: string,
  remedy: string,
  noun: { one: string; many: string } = {
    one: "entry is not a regular file",
    many: "entries are not regular files",
  },
): void {
  if (entries.length === 0) return;
  const lines = entries.map((u) => `  - ${u.path} (${u.kind})`).join("\n");
  const phrase = entries.length === 1 ? noun.one : noun.many;
  throw new InvocationError(
    `refusing the scan: ${String(entries.length)} ${phrase}:\n${lines}\n${why} ${remedy}`,
  );
}

function gitIgnored(paths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (paths.length === 0) return ignored;
  try {
    // SECURITY: array-form execFileSync, no shell. Default (Buffer) encoding,
    // `encoding: "buffer"` with `input` is rejected by Node.
    const out = execFileSync("git", ["check-ignore", "--stdin", "-z"], {
      input: paths.map(normalizePath).join("\0"),
      stdio: ["pipe", "pipe", "ignore"],
    });
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) ignored.add(p);
    }
  } catch {
    // `git check-ignore` exits 1 when nothing matches, treat as none ignored.
  }
  return ignored;
}

/**
 * Every path git tracks, or `null` when git could not answer. `null` means the
 * tolerance below is switched off entirely (fail closed): without the tracked
 * set we cannot tell a build transient from committed content.
 *
 * An EMPTY answer counts as no answer for the same reason. `git ls-files` exits
 * 0 with no output for a repo whose index is empty (or unreadable in a way that
 * does not raise), and an empty set would make EVERY file untracked, which is
 * the one state in which the tracked-file bound below silently stops existing.
 * This repo always tracks files, so there is no legitimate empty case here.
 */
function gitTracked(): Set<string> | null {
  try {
    // SECURITY: array-form execFileSync, no shell. `-z` is NUL-separated and
    // unquoted, so it matches the walk's forward-slash relative paths exactly.
    const out = execFileSync("git", ["ls-files", "-z"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const tracked = new Set<string>();
    for (const p of out.toString("utf8").split("\0")) {
      if (p.length > 0) tracked.add(p);
    }
    return tracked.size > 0 ? tracked : null;
  } catch {
    return null;
  }
}

function buildTargetsForAll(): Target[] {
  const files: string[] = [];
  const unscannable: Unscannable[] = [];
  walk(REPO_ROOT, files, unscannable);

  // One `git check-ignore` over both lists. An ignored entry is already out of
  // scope for the file route, so applying the same rule to a link keeps a single
  // boundary rather than inventing a second, stricter one for links alone.
  const ignored = gitIgnored([...files, ...unscannable.map((u) => u.path)]);

  refuseUnscannable(
    unscannable.filter((u) => !ignored.has(u.path) && !EXCLUDED_PATHS.has(u.path)),
    "The walk can neither read such an entry nor vouch for what is on the other side of it.",
    "Remove it, replace it with a regular file, or (if it is genuinely not part of the " +
      "corpus) untrack it and add it to .gitignore.",
  );

  const tracked = gitTracked();
  return files
    .map((abs) => ({ abs, rel: normalizePath(abs) }))
    .filter(({ rel }) => !ignored.has(rel))
    .filter(({ rel }) => !EXCLUDED_PATHS.has(rel))
    .map(({ abs, rel }) => ({
      path: rel,
      read: () => readFileSync(abs),
      absPath: abs,
      tolerateVanish: tracked !== null && !tracked.has(rel),
    }));
}

function buildTargetsForPaths(paths: string[]): Target[] {
  return paths.map((p) => {
    const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
    if (!existsSync(abs)) throw new InvocationError(`File not found: ${p}`);
    if (!statSync(abs).isFile()) throw new InvocationError(`Not a regular file: ${p}`);
    return { path: normalizePath(abs), read: () => readFileSync(abs) };
  });
}

/** git's file modes for a regular blob. Every other mode is not a file to read. */
const REGULAR_BLOB_MODES = new Set(["100644", "100755"]);

/** Closed-set, engine-owned description of a git file mode. */
function gitModeKind(mode: string): string {
  if (mode === "120000") return "a symbolic link";
  if (mode === "160000") return "a gitlink (a nested repository)";
  return `a git mode-${mode} entry`;
}

/** `:<srcmode> <dstmode> <srcsha> <dstsha> <status>`, the info half of a `--raw -z` record. */
const RAW_RECORD = /^:(?:\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])\d*$/;

function buildTargetsForStaged(): Target[] {
  let listBuf: Buffer;
  try {
    // SECURITY: array-form execFileSync, no shell. `--raw` rather than
    // `--name-only` because the DESTINATION MODE is the only thing that
    // distinguishes a staged regular file from a staged symlink or gitlink, and
    // `git show :<path>` answers all three without complaint. `--no-renames`,
    // `T` and `U` are each in there for a measured reason; see the docblock for
    // what leaving each of them out cost.
    listBuf = execFileSync(
      "git",
      ["diff", "--cached", "--raw", "-z", "--no-renames", "--diff-filter=AMTU"],
      {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (err) {
    throw new InvocationError(
      `git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // `--raw -z` emits `<info>\0<path>\0` per record. `R` (rename) and `C` (copy)
  // are the only statuses carrying a SECOND path, and `--no-renames` above means
  // git cannot emit either, so the stride is two fields STRUCTURALLY rather than
  // by the filter's grace: it no longer depends on the caller's `diff.renames`.
  // The regex still admits a score-suffixed status, so if one ever reached here
  // the stride would desync and the next record would fail to parse, which
  // REFUSES: the same outcome as any other unparseable record, and the safe one.
  // A record that does not parse refuses rather than being skipped, because a
  // silently shortened list is exactly what this scan must never report clean
  // over.
  const fields = listBuf.toString("utf8").split("\0");
  const staged: { path: string; mode: string; status: string }[] = [];
  let i = 0;
  while (i < fields.length) {
    const info = fields[i];
    if (info === undefined || info.length === 0) {
      i += 1;
      continue;
    }
    const m = RAW_RECORD.exec(info);
    const mode = m?.[1];
    const status = m?.[2];
    const path = fields[i + 1];
    if (mode === undefined || status === undefined || path === undefined || path.length === 0) {
      throw new InvocationError(
        "could not read the output of `git diff --cached --raw -z`: unrecognized record. " +
          "Refusing rather than scanning a list that may be short.",
      );
    }
    staged.push({ path, mode, status });
    i += 2;
  }

  // The scanner's own test embeds real-looking violator strings as adversarial
  // inputs, so it is out of scope for this route however it is staged.
  const inScope = staged.filter((s) => !EXCLUDED_PATHS.has(s.path));

  // Unmerged first, and under its own sentence. Its destination mode is `000000`
  // rather than a blob mode, so the mode check below would otherwise report a
  // conflict as "a git mode-000000 entry": true of the bytes, and useless to the
  // developer holding a merge conflict.
  //
  // THE `.md` CARVE-OUT THIS FILTER USED TO CARRY IS GONE, AND ITS OWN ARGUMENT
  // IS WHY. It read: an unmerged `notes.md` is a file class this route
  // "deliberately never reads AT ALL, conflict or no conflict", so refusing over
  // one would announce that a scan could not read something it was never going
  // to read. That premise stopped being true the moment markdown became a scan
  // target on the sweeping routes. Leaving the carve-out in place would have sent an
  // unmerged `.md` on to `git show :<path>`, which fatals ("in the index, but
  // not at stage 0") and refuses anyway, under the generic could-not-read
  // message instead of the one that names the conflict. The cost is real and
  // bounded: a conflict in `CHANGELOG.md` now refuses this route. `git commit`
  // rejects an unmerged path BEFORE the pre-commit hook runs, so no commit path
  // reaches it; only a hand-run `--staged` during a conflict does.
  refuseUnscannable(
    inScope.filter((s) => s.status === "U").map((s) => ({ path: s.path, kind: "no stage-0 blob" })),
    "An unmerged path has no single staged blob, so `git show :<path>` fails outright and there " +
      "is nothing here for the scan to read.",
    "Resolve the conflict and stage the result, then re-run.",
    { one: "path is unmerged", many: "paths are unmerged" },
  );

  refuseUnscannable(
    inScope
      .filter((s) => s.status !== "U" && !REGULAR_BLOB_MODES.has(s.mode))
      .map((s) => ({ path: s.path, kind: gitModeKind(s.mode) })),
    "For such an entry `git show :<path>` hands back its target path rather than any content, " +
      "so scanning it would prove nothing about what it points at.",
    "Unstage it, or replace it with a regular file.",
  );

  // EVERY staged (added / modified / typechanged) file is a candidate, markdown
  // included: `scanTarget` decides scope by content, so a real C-CDA document
  // staged under ANY name / directory (`patient.cda`, a root `.xml`, an
  // `examples/` sample, `notes.md`) is caught, not just `test/` / `.xml` /
  // `src/*.ts`. This route used to drop `.md` here, which is what made every
  // tracked markdown file unscanned by BOTH routes.
  const list = inScope.map((s) => s.path);
  return list.map((relPath) => ({
    path: relPath,
    // SECURITY: array-form execFileSync, no shell. `:<path>` is a git pathspec.
    read: (): Buffer =>
      execFileSync("git", ["show", `:${relPath}`], {
        encoding: "buffer",
        stdio: ["ignore", "pipe", "pipe"],
      }),
  }));
}

// ---------------------------------------------------------------------------
// XML structural helpers (tolerant, fragments, malformed input, no DOM)
// ---------------------------------------------------------------------------

/** Best-effort code-point from an entity, guarding invalid values. */
function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

/**
 * Decode XML character references + the five predefined entities. Runs before
 * every name / value comparison so a `&#x53;mith` or `&amp;` cannot smuggle a
 * real token past the token comparison. `&amp;` is decoded LAST so an already
 * literal `&` is not double-interpreted.
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** Replace every `<![CDATA[ … ]]>` section with its literal inner text. */
function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, (_m, inner: string) => inner);
}

/** Escape a fixed local-name for embedding in a dynamic RegExp. */
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Yield the direct text of every leaf `<localName>…</localName>` element,
 * namespace-prefix + case tolerant, entities decoded. The `[^<]*` body captures
 * only DIRECT text, so an element with child elements (`<name><given>…`) yields
 * an empty (skipped) body, its children are matched on their own.
 */
function* leafTexts(text: string, localName: string): Generator<string> {
  const n = reEscape(localName);
  const re = new RegExp(`<(?:[\\w.-]+:)?${n}\\b[^>]*>([^<]*)</(?:[\\w.-]+:)?${n}\\s*>`, "gi");
  for (const m of text.matchAll(re)) {
    const body = m[1];
    if (body !== undefined && body.length > 0) yield decodeXmlEntities(body);
  }
}

/** Parse the attributes of a single start-tag body into a lower-cased map. */
function parseAttrs(tagBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const m of tagBody.matchAll(re)) {
    const rawName = m[1] ?? "";
    const name = rawName.toLowerCase().replace(/^[\w.-]+:/, "");
    const val = m[2] ?? m[3] ?? "";
    if (name.length > 0) out[name] = decodeXmlEntities(val);
  }
  return out;
}

/** Yield the attribute map of every `<localName …>` start tag. */
function* elementTags(text: string, localName: string): Generator<Record<string, string>> {
  const n = reEscape(localName);
  const re = new RegExp(`<(?:[\\w.-]+:)?${n}\\b([^>]*?)/?>`, "gi");
  for (const m of text.matchAll(re)) {
    yield parseAttrs(m[1] ?? "");
  }
}

/** Unicode-aware name tokenizer (drops single Latin initials, keeps single CJK). */
function nameTokens(value: string): string[] {
  const out: string[] = [];
  for (const raw of value.split(/[^\p{L}]+/u)) {
    if (raw.length === 0) continue;
    if (!/\p{L}/u.test(raw)) continue;
    // A single Latin letter is a middle initial, not identifying. A single CJK
    // ideograph / kana / hangul IS a name (Chinese/Korean surnames are 1 char).
    const isCjk = /[぀-ヿ㐀-鿿가-힯]/u.test(raw);
    if (raw.length < 2 && !isCjk) continue;
    out.push(raw);
  }
  return out;
}

function isNameToken(tok: string): boolean {
  return !NAME_NOISE_TOKENS.has(tok.toUpperCase());
}

function normalizeDob(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8) {
    const d = digits.slice(0, 8);
    const month = Number(d.slice(4, 6));
    const day = Number(d.slice(6, 8));
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return d;
  }
  if (/^\d{6}$/.test(digits)) {
    const month = Number(digits.slice(4, 6));
    if (month < 1 || month > 12) return null;
    return digits; // YYYYMM month-precision
  }
  if (/^\d{4}$/.test(digits)) return digits; // year-only precision
  return null;
}

// ---------------------------------------------------------------------------
// Category detectors (element / attribute aware)
// ---------------------------------------------------------------------------

function checkNames(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  // Structured PN parts, `<given>` / `<family>` wherever they appear (patient,
  // guardian, assignedPerson, informant, relatedSubject, provider). The element
  // name alone identifies a person-name part in CDA, so no ancestor path needed.
  for (const loc of ["given", "family"] as const) {
    for (const body of leafTexts(text, loc)) {
      for (const tok of nameTokens(body)) {
        if (!isNameToken(tok)) continue;
        if (!allow.names.has(tok.toUpperCase())) {
          hits.push({
            path,
            locus: `name/${loc}`,
            value: tok,
            reason: "person-name token not in synthetic allow-list",
          });
        }
      }
    }
  }
  // A bare `<name>` carrying DIRECT text (`<name>Jane Doe</name>`), an
  // unstructured person / organization name. `leafTexts` captures only direct
  // text (`[^<]*`), so a structured name (with `<given>` / `<family>` children)
  // yields an empty body and is handled by the part detectors above. Direct-text
  // capture is deliberate: a span-to-next-`</name>` regex would run away across
  // source files that merely mention `<name>` in a comment. The loose-text half
  // of a mixed-content name (`<name>John <family>Doe</family></name>`) is a
  // documented MINOR limitation (see phi-scan-overrides.md); its structured
  // `<family>` child is still caught above.
  for (const body of leafTexts(text, "name")) {
    for (const tok of nameTokens(body)) {
      if (!isNameToken(tok)) continue;
      if (!allow.names.has(tok.toUpperCase())) {
        hits.push({
          path,
          locus: "name",
          value: tok,
          reason: "unstructured name token not in synthetic allow-list",
        });
      }
    }
  }
}

function checkBirthTime(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  for (const attrs of elementTags(text, "birthTime")) {
    const v = attrs["value"];
    if (v === undefined) continue;
    const dob = normalizeDob(v);
    if (dob === null) continue;
    if (!allow.dobs.has(dob)) {
      hits.push({
        path,
        locus: "birthTime@value",
        value: dob,
        reason: "date of birth not in synthetic allow-list",
      });
    }
  }
}

function checkIds(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  for (const attrs of elementTags(text, "id")) {
    const root = (attrs["root"] ?? "").trim();
    const ext = (attrs["extension"] ?? "").trim();
    if (ext.length === 0) continue;
    const extUpper = ext.toUpperCase();
    const digits = ext.replace(/\D/g, "");
    if (root === SSN_ROOT_OID) {
      // SSN by OID declaration, a 9-digit extension is an SSN.
      if (/^\d{9}$/.test(digits) && !allow.ids.has(extUpper) && !allow.ids.has(digits)) {
        hits.push({
          path,
          locus: "id@extension",
          value: ext,
          reason: "SSN (id@root is the US SSN OID) not in synthetic allow-list",
        });
      }
      continue;
    }
    // A bare all-numeric extension of 6+ digits is a real-looking MRN / account
    // number (or a 9-digit SSN dropped in the wrong slot). Synthetic fixtures use
    // prefixed / alphanumeric shapes (MRN001, DOC123, prob-act-1), so a bare
    // numeric id is suspect. A `code`/`templateId`/OID never reaches here, only
    // `<id>`. Not upper-bounded: a real MRN / account is commonly 10+ digits.
    if (/^\d{6,}$/.test(ext) && !allow.ids.has(extUpper)) {
      hits.push({
        path,
        locus: "id@extension",
        value: ext,
        reason: "bare-numeric MRN / account identifier not in synthetic allow-list",
      });
    }
  }
}

function checkAddress(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  for (const body of leafTexts(text, "streetAddressLine")) {
    const street = body.trim();
    // A street line: house number + at least one word (`123 Main St`).
    if (!/^\d+\s+\p{L}/u.test(street)) continue;
    if (!allow.addresses.has(street.toLowerCase())) {
      hits.push({
        path,
        locus: "streetAddressLine",
        value: street,
        reason: "street address not in synthetic allow-list",
      });
    }
  }
  for (const body of leafTexts(text, "city")) {
    for (const tok of nameTokens(body)) {
      if (!allow.cities.has(tok.toUpperCase())) {
        hits.push({
          path,
          locus: "city",
          value: tok,
          reason: "city not in synthetic allow-list",
        });
      }
    }
  }
  for (const body of leafTexts(text, "postalCode")) {
    const zip = body.trim();
    if (!/^\d{5}(?:-\d{4})?$/.test(zip)) continue;
    if (!allow.zips.has(zip)) {
      hits.push({
        path,
        locus: "postalCode",
        value: zip,
        reason: "postal code not in synthetic allow-list",
      });
    }
  }
}

function checkTelecom(path: string, text: string, hits: Hit[]): void {
  for (const attrs of elementTags(text, "telecom")) {
    const v = attrs["value"];
    if (v === undefined || v.length === 0) continue;
    // Email telecoms (`mailto:`) are covered by the whole-payload email pass.
    if (/^mailto:/i.test(v)) continue;
    const digits = v.replace(/\D/g, "");
    // A real dialable number is >= 10 digits. The `555` fake-exchange convention
    // (555-01xx is reserved for fiction) marks a synthetic number.
    if (digits.length >= 10 && !digits.includes("555")) {
      hits.push({
        path,
        locus: "telecom@value",
        value: v,
        reason: "phone number without the 555 fake-exchange convention",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Shape checks shared by CDA and plain-text targets
// ---------------------------------------------------------------------------

function scanCommonShapes(path: string, content: string, allow: AllowList, hits: Hit[]): void {
  // Dashed SSN anywhere (covers narrative text and non-CDA targets).
  for (const m of content.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) {
    hits.push({ path, locus: "(ssn)", value: m[0], reason: "dashed SSN pattern" });
  }
  // Emails whose domain is not an allow-listed reserved / test domain (also
  // catches `mailto:` telecoms, which the telecom detector defers to here).
  for (const m of content.matchAll(/\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g)) {
    const domain = (m[1] ?? "").toLowerCase();
    if (allow.emails.has(m[0].toLowerCase())) continue;
    if (!allow.emailDomains.has(domain)) {
      hits.push({ path, locus: "(email)", value: m[0], reason: "email with non-test domain" });
    }
  }
}

// ---------------------------------------------------------------------------
// CDA dispatch
// ---------------------------------------------------------------------------

/** True when the text carries a C-CDA structural marker (namespace/root/loci). */
function hasCdaMarker(text: string): boolean {
  return (
    /<(?:[\w.-]+:)?ClinicalDocument\b/i.test(text) ||
    /urn:hl7-org:v3/i.test(text) ||
    /<(?:[\w.-]+:)?recordTarget\b/i.test(text) ||
    /<(?:[\w.-]+:)?patientRole\b/i.test(text)
  );
}

/**
 * Hand-written source code (src/ or scripts/), by extension + location.
 *
 * DO NOT WIDEN THIS PREDICATE TO REACH MORE FILES WITH THE SHAPE PASS. It is
 * read in TWO places with OPPOSITE polarity: it ADDS the shape pass in
 * `scanTarget`, and it SUBTRACTS the full structured scan in `looksLikeCda`
 * (`hasCdaMarker(text) && !isSourceCode(path)`). Adding an extension or dropping
 * the directory bound here would therefore silently DOWNGRADE any file of that
 * shape that carries a C-CDA marker from the full document scan to the shape
 * pass, losing the name / DOB / MRN / address / telecom detectors on it: a
 * detection the base had, removed by a change that looks like a widening.
 * Measured, not reasoned about: a `scripts/*.sh` carrying a marker is a
 * "document" at base, and adding `.sh` here turns it into shape-only. To reach
 * more files, extend the ADDITIVE branch in `scanTarget` instead.
 */
function isSourceCode(path: string): boolean {
  return (
    /\.(?:ts|tsx|js|mjs|cjs)$/i.test(path) &&
    (path.startsWith("src/") || path.startsWith("scripts/"))
  );
}

/**
 * A target is treated as an actual C-CDA DOCUMENT (→ full structured scan) when
 * it has a native C-CDA extension (`.xml` / `.cda` / `.ccda`), lives under
 * `test/` (this repo's fixtures + suites embed C-CDA there), or carries a C-CDA
 * content marker while NOT being hand-written source code. The content-sniff is
 * what closes the "rename the document to dodge the scanner" bypass, detection
 * follows the bytes, not the file name. The `!isSourceCode` guard keeps a marker
 * that appears in a `src/` or `scripts/` comment / example string (including this
 * scanner's own doc comment) from turning code into a "document" and flagging its
 * illustrative tokens; such files still get the conservative shape pass.
 *
 * 🛑 MARKDOWN IS A DOCUMENT LIKE ANY OTHER HERE, AND A DRAFT THAT EXEMPTED IT WAS
 * REFUTED AS `INTRODUCED`. That draft added a `!isMarkdown(path)` term, reasoning
 * that it could subtract nothing because no route read a `.md` at all. THE
 * PREMISE WAS FALSE AND IT WAS FALSE BECAUSE IT COUNTED TWO ROUTES WHEN THERE ARE
 * THREE: `paths` mode (`pnpm phi-scan <file>`) reaches this function too, and at
 * base it ran the STRUCTURED scan over a `.md` carrying a marker. Measured on the
 * draft: a real C-CDA saved as `notes.md`, carrying a name, a DOB, an SSN by OID,
 * an MRN, an address and a telecom, went from NINE hits and exit 1 to `OK, no
 * hits` and exit 0 on that route. The shape floor the draft offered as mitigation
 * is EMPTY for that document class: C-CDA carries its SSN as an undashed
 * `id@extension` and carries no email, so the floor found nothing at all.
 * **Count every route before calling an exemption additive, and never state a
 * scope claim about "both routes" in a scanner that has three.**
 */
function looksLikeCda(text: string, path: string): boolean {
  if (/\.(?:xml|cda|ccda)$/i.test(path)) return true;
  if (path.startsWith("test/")) return true;
  return hasCdaMarker(text) && !isSourceCode(path);
}

function scanCda(path: string, text: string, allow: AllowList, hits: Hit[]): void {
  checkNames(path, text, allow, hits);
  checkBirthTime(path, text, allow, hits);
  checkIds(path, text, allow, hits);
  checkAddress(path, text, allow, hits);
  checkTelecom(path, text, hits);
}

/**
 * Scope + scan one target.
 *
 * THERE IS NO `force` PARAMETER ANY MORE, AND ITS REMOVAL IS A NO-OP, NOT A
 * NARROWING. It existed so that `paths` mode (a file a human named on the CLI)
 * got the shape pass even when the file was out of scope for the sweeping
 * routes. Now every target gets that pass unconditionally, so the flag could
 * only ever have been true where the behaviour is already identical. It never
 * forced the STRUCTURED scan on either route: that has always been
 * `looksLikeCda`'s decision, and it still is.
 *
 * EVERY OBSERVED TARGET NOW GETS AT LEAST THE CONSERVATIVE SHAPE PASS. It used
 * to reach `src/` + `scripts/` JS/TS only, which left a large tracked corpus
 * read-but-never-scanned on the sweeping routes: the three `scripts/*.sh` gates (which
 * the prose already claimed were covered as `scripts/` code), the root build
 * configs (`tsup.config.ts`, `vitest.config.ts`, `eslint.config.js` are
 * hand-written by the same authors but live outside both prefixes), the
 * workflows, `LICENSE`, `.github/CODEOWNERS` and the JSON manifests.
 *
 * The two passes stay strictly additive and are NOT alternatives: a document
 * still gets `scanCda` AND the shapes, exactly as before.
 */
function scanTarget(target: Target, allow: AllowList, hits: Hit[]): boolean {
  let buf: Buffer;
  try {
    buf = target.read();
  } catch (err) {
    // TOCTOU, see `Target.tolerateVanish`: an untracked file the walk enumerated
    // itself may be a build transient that was deleted before we reached it.
    // Report it as unobserved instead of refusing; every other failure, and any
    // tracked file, still refuses the whole scan.
    if (target.tolerateVanish === true && errorCode(err) === "ENOENT") return false;
    throw new InvocationError(
      `could not read ${target.path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = stripCdata(buf.toString("utf8"));
  if (looksLikeCda(text, target.path) && !STRUCTURED_EXEMPT_PATHS.has(target.path)) {
    scanCda(target.path, text, allow, hits);
  }
  // The conservative shape pass (dashed SSN + non-test email) runs over EVERY
  // target, with no path exemption at all, and it is ADDITIVE rather than an
  // alternative: a document gets `scanCda` AND this, exactly as it always did.
  // `isSourceCode` is deliberately not consulted here any more; it bounded this
  // branch to `src/` + `scripts/` JS/TS, and nothing else read the bytes.
  scanCommonShapes(target.path, text, allow, hits);
  return true;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(hits: Hit[]): void {
  if (hits.length === 0) {
    process.stdout.write("[phi-scan] OK, no hits\n");
    return;
  }
  const byPath = new Map<string, Hit[]>();
  for (const h of hits) {
    const arr = byPath.get(h.path);
    if (arr) arr.push(h);
    else byPath.set(h.path, [h]);
  }
  for (const [path, group] of byPath) {
    process.stderr.write(`[phi-scan] HIT: ${path}\n`);
    for (const h of group) {
      process.stderr.write(`  locus=${h.locus} value=${JSON.stringify(h.value)} (${h.reason})\n`);
    }
  }
  process.stderr.write(
    `[phi-scan] ${String(hits.length)} hit(s) across ${String(byPath.size)} file(s). ` +
      `If a value is genuinely synthetic, declare it in scripts/phi-allow-list.txt OR ` +
      `run with --allow-fixture <path> AND log it in phi-scan-overrides.md.\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  let args: Args;
  let allow: AllowList;
  try {
    args = parseArgs(process.argv.slice(2));
    validateAllowFixtures(args.allowFixtures);
    // `loadAllowList` sat OUTSIDE this block and threw an InvocationError past
    // every handler, so a missing allow-list left node to exit 1: this gate's
    // code for HITS FOUND. A scan that never started must never be reported as
    // a scan that found something.
    allow = loadAllowList();
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  const allowed = new Set<string>(args.allowFixtures.map(normalizePath));

  let targets: Target[];
  try {
    if (args.mode === "staged") targets = buildTargetsForStaged();
    else if (args.mode === "paths") targets = buildTargetsForPaths(args.paths);
    else targets = buildTargetsForAll();
  } catch (err) {
    if (err instanceof InvocationError) {
      process.stderr.write(`[phi-scan] ${err.message}\n`);
      return 2;
    }
    throw err;
  }

  targets = targets.filter((t) => !allowed.has(t.path));

  const hits: Hit[] = [];
  const vanished: Target[] = [];
  let observed = 0;
  for (const t of targets) {
    try {
      if (scanTarget(t, allow, hits)) observed += 1;
      else vanished.push(t);
    } catch (err) {
      if (err instanceof InvocationError) {
        process.stderr.write(`[phi-scan] ${err.message}\n`);
        return 2;
      }
      throw err;
    }
  }

  // A tolerated file is never silent, and the tolerance is only good while the
  // file is still gone: if it is back on disk the sweep skipped something that
  // exists, which is an incomplete scan and refuses like any other.
  if (vanished.length > 0) {
    const back = vanished.filter((t) => t.absPath !== undefined && existsSync(t.absPath));
    if (back.length > 0) {
      process.stderr.write(
        `[phi-scan] could not read ${back.map((t) => t.path).join(", ")}: vanished mid-scan and is ` +
          `present again, so the sweep did not observe it. Re-run with the tree at rest.\n`,
      );
      return 2;
    }
    process.stderr.write(
      // "gone" rather than "deleted": a rename leaves the enumerated path just
      // as absent, and the residual on `Target.tolerateVanish` is about exactly
      // that case, so the line must not assert the file was removed.
      `[phi-scan] skipped ${String(vanished.length)} untracked file(s) gone between ` +
        `enumeration and read: ${vanished.map((t) => t.path).join(", ")}\n`,
    );
  }

  // Refuse a sweep that observed nothing. `all` mode always reaches at least the
  // allow-list itself, so zero reads means the enumeration or the tree is wrong,
  // never a clean repo. (`staged` legitimately has nothing to scan when a commit
  // touches only markdown, and `paths` is bounded by the caller's argv.)
  if (args.mode === "all" && observed === 0) {
    process.stderr.write(
      "[phi-scan] refusing: the all-mode sweep observed no files, so it proves nothing.\n",
    );
    return 2;
  }

  report(hits);
  return hits.length === 0 ? 0 : 1;
}

/**
 * A SCAN THAT COULD NOT RUN EXITS 2, NEVER 1. Node exits 1 on an uncaught
 * throw, and 1 is this gate's code for HITS FOUND, so every failure that is not
 * an `InvocationError` used to be reported to CI and to the developer as a
 * finding. It is not hypothetical: `readdirSync` refusing a directory (`EACCES`)
 * is a plain system error, raised from inside the walk, and it exited 1 with a
 * stack trace where the contract says 2.
 *
 * The net is here rather than a `catch` per call site deliberately: the property
 * wanted is about the PROCESS's exit code, and a per-site list is the thing that
 * goes stale the next time a call is added. The stack is printed because at this
 * point the scanner has no idea what went wrong, and a refusal a developer
 * cannot act on is the refusal they learn to bypass.
 */
let exitCode: number;
try {
  exitCode = main();
} catch (err) {
  process.stderr.write(
    `[phi-scan] refusing the scan: it failed with an unexpected error, so it observed less than ` +
      `it enumerated: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  exitCode = 2;
}
process.exit(exitCode);
