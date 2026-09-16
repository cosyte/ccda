# Engineering standards for this repo

The toolchain this repo inherits, the guardrails every change clears, and the disciplines
every change follows. Moved out of `CLAUDE.md` so the always-read file stays cheap, and kept
whole: the headings and the prose below are the ones `CLAUDE.md` carried, and `CLAUDE.md`
keeps each heading above a pointer here. The traps themselves stay where they were, in
`CLAUDE.md` and in `documentation/agent-notes.md`; a pointer is still not a closure.

## Tech Stack (the shared `@cosyte/*` standard)

This repo inherits the canonical toolchain by depending on the published `@cosyte/*` config packages,
not by copying files. The source of truth is the meta-repo's `documentation/conventions.md`. This is
a summary.

- **Language:** TypeScript (strict, full rigor set incl. `noUncheckedIndexedAccess`) via
  `@cosyte/tsconfig`. **Target ES2023**, `NodeNext`. TypeScript 5.9.x, exact-pinned.
- **Build:** dual ESM + CJS + `.d.ts` via `tsup` (`@cosyte/tsup-config`); `attw` is a publish gate
  (per-condition types: `.d.ts` for `import`, `.d.cts` for `require`). The `attw` script is
  **`node scripts/attw.mjs`, not the bare CLI**: see the guardrail below.
- **Node:** **>= 22** (CI matrix 22 + 24).
- **Package manager:** `pnpm@10`.
- **Lint/format:** **ESLint 10** + unified `typescript-eslint` (type-checked) via
  `@cosyte/eslint-config`; Prettier via `@cosyte/prettier-config`. Lint at `--max-warnings=0`.
- **Testing:** **Vitest 4** + v8 coverage (`@cosyte/vitest-config`), per-directory >= 90 gates; the
  property-based conformance invariants come from `@cosyte/test-utils` (round-trip, lenient-mode,
  immutability, warning-code stability); the format-specific arbitraries stay in this repo.
- **CI/CD:** thin callers of the reusable `cosyte/.github` workflows.
- **Runtime deps:** **One**: `@xmldom/xmldom` (exact-pinned), ratified by
  `docs/adr/0001-xml-parser.md` for C-CDA's XML parse + spec-clean serialize. The standard caps `ccda`
  at **≤ 3** justified runtime deps; this is **1 of 3**. No other runtime dep without an ADR.
- **License:** MIT.

## Engineering Guardrails

- No `any`. No unjustified `as` casts. Use `unknown` and narrow.
- JSDoc (with `@example`) on every public export: the JSDoc lint rule is an **error** on public
  exports, so this is enforced, not optional.
- Immutable by default. Mutation only via explicit methods.
- No `console.*` in library code. Throw typed errors or return results.
- Short, testable functions over big parsing blobs.
- **Commit style:** atomic and reviewable. Mirror the commit-message style from `@cosyte/hl7`'s
  `git log`.
- Postel's Law: parser is liberal (lenient default + warnings), serializer is conservative (always
  emits spec-clean output).
- Fatal errors only for unrecoverable structural corruption (Tier-3 codes). Everything else is a
  warning with a stable code + positional context.
- Coverage: per-directory >= 90% (lines/branches/functions/statements), enforced by
  `pnpm test:coverage`; the gated directories are declared in `vitest.config.ts` (`coverageDirs`)
  and you **add one there when you add one under `src/`**.
- **`attw` SAYS "does not contain types" AND EXITS 0, SO THE `attw` SCRIPT IS A WRAPPER, NOT THE
  BARE CLI** (`ATTW-FALSE-GREEN-PORT`). **A false red costs an hour; a false green merges.**
  `scripts/attw.mjs` carries **THREE guards, not two**. **Blinding options are refused BY OPTION
  NAME, wholesale, not by value, and short options BY LETTER ANYWHERE IN THE CLUSTER, not by whole
  token.** **`.npmignore` versus `files` is about the file's DEPTH, not its existence.**
  `test/scripts/attw-gate.test.ts` pins two of the three, the upstream exit-0 itself, a real failure
  and a negative control; **the printed-nothing backstop is pinned by NO test, a stated gap rather
  than an oversight. Do not carry the test file's "16 of 21" figure forward, re-measure it.**
  **Per-repo script**; a sibling still on the bare CLI still has the defect. Write no repo count,
  derive it. The meta-repo's `scripts/verify.sh` **must not be touched** for this. **The guard is
  described in four committed files and three corrections have landed in some copies and not
  others: prefer CUTTING a copy to adding a more careful one.**
  Why: `documentation/agent-notes.md#the-attw-wrapper-script`

## Standing disciplines (every change)

Mirrors the three disciplines in the meta-repo's `documentation/conventions.md`. They bind here too:

1. **Documentation follows code**: a change to the public surface/stack/status isn't done until the
   docs are: this repo's docs content (`README.md`, `docs-content/`), the meta-repo
   `documentation/repos/ccda.md` (bump its "last verified" date), and the `ecosystem-map.md`
   status table.
2. **Version + changelog**: a Changeset per meaningful change, and **the bump is classified from
   what the change does, never defaulted**: `minor` when it adds a symbol to the package entry
   point or adds a warning or fatal code, `patch` when it moves no published surface. Writing
   `patch` on a changeset that names a new export is how a release computes a number its own
   release notes contradict.
   **The changeset summary IS the changelog entry** and `CHANGELOG.md` is generated output above
   `## Released before this file was generated`: `.changeset/config.json` sets a `changelog`
   generator, so the release writes the version heading and the entry itself. **Do not hand-edit
   `CHANGELOG.md`**, and do not reintroduce a hand-maintained `[Unreleased]` heading: one stood
   there unrolled for the whole published history of this package, which is how a shipped tarball
   came to describe its own contents as unreleased. **The Prettier pass stays ON here** (no
   `"prettier"` key), which is derived from this repo having no `.prettierignore` and a
   `format:check` that globs root markdown, **not copied from a sibling**: with it off the
   generator's raw output reds this repo's own `format:check` on every Version PR.
   `test/scripts/changelog-generation.test.ts` pins all of it. Renaming a stable warning code is a
   **breaking change**.
3. **Crew + knowledgebase loop**: if this parser's public API or warning codes change, flag/update
   the matching `crew` healthcare skill + the KB product doc.
