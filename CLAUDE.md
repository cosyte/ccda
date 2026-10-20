# @cosyte/ccda

A parser, builder and editor for C-CDA clinical documents in Node.js and TypeScript, published on
npm as `@cosyte/ccda` under MIT. It is one of the Cosyte standard parsers and keeps the shape of
`@cosyte/hl7`'s API. Parsing is lenient: vendor quirks become coded warnings, not errors.

## Gate

Run these from the repo root, in this order, with the pinned pnpm 10.34.5 first on PATH: pnpm 12
ignores `pnpm.overrides` and refuses the frozen install, and `test/docs-content.test.ts` runs a bare
`pnpm build`. If `pnpm --version` prints another version, run
`corepack enable --install-directory <dir> pnpm` and put `<dir>` first on PATH.

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm format:check`
5. `pnpm phi-scan`
6. `pnpm test`
7. `pnpm test:coverage`
8. `pnpm build`
9. `pnpm attw`
10. `pnpm typecheck:examples`, `pnpm lint:examples`, `pnpm examples`
11. `pnpm check:no-emdash`, `pnpm check:no-internal-refs`
12. `pnpm conformance` (fetches its pinned artifacts, so it needs the network)

Steps 1 to 9 are the shared `ci / verify` job (Node 22 and 24), 10 and 12 are jobs in
`.github/workflows/ci.yml`, and 11 runs in two workflows of its own. CI alone also runs actionlint
(installed by its action), an ESM/CJS import smoke of the build and a pack-and-install check.

## Hazard

A C-CDA document is a patient record by design. Any change to parsing, emitting or fixtures can
carry a real patient's data into a warning message, a model field, a fixture, a doc or a log.

## Rules that bind here

Each names the failure that proved it. The pointers resolve into `documentation/agent-notes.md`, and
`pnpm test` fails if one stops resolving (`pnpm check:agent-notes` runs that check alone).

- Never put document text in a warning or fatal message, or in an unbounded model field: a 500,000-byte `templateId` root came back in a `.message` in the published 0.0.4 (#77).
  `documentation/agent-notes.md#no-warning-or-fatal-factory-takes-a-value-parameter`
- Refuse a narrative label when the coded entry has no `displayName`; never render a default: 0.0.11 shipped "No known allergies" beside a positive allergy (#100).
  `documentation/agent-notes.md#a-narrative-label-is-refused-never-fabricated`
- Transcribe code systems, value sets and SHALL tables from the published source, never from memory: `NULL_FLAVORS` held 8 of the 17 v3 concepts (#78).
  `documentation/agent-notes.md#the-v3-nullflavor-code-system-has-seventeen-concepts`
- Keep `pnpm attw` on its wrapper script: `@arethetypeswrong/cli` alone exits 0 on a tarball with no type declarations (#82).
  `documentation/agent-notes.md#the-attw-wrapper-script`
- Check for em dashes with `pnpm check:no-emdash`, not grep: NUL bytes in `src/profiles/merge.ts` make grep skip it as binary, and #52 left one there.
  `documentation/agent-notes.md#the-em-dash-gate`
- Add no path or file-type exemption to `scripts/phi-scan.ts`: it printed OK while 44 of 140 tracked files were read by no detector (#103).
  `documentation/agent-notes.md#the-corpus-every-phi-scan-route-read-past`
- Keep a test that writes into the working tree or spawns a build from racing the others: Vitest runs files in parallel, and the release Verify on `d906bda` went red that way (#146).
  `documentation/agent-notes.md#the-conformance-harness-fetches-its-artifacts-and-vendors-none-of-them`
- Never hand-edit `CHANGELOG.md`; a release writes it from the changeset summaries. A hand-kept `[Unreleased]` heading shipped in every published tarball until #94.
- Classify a changeset's bump (`pnpm changeset`) from what it does: `minor` adds an export or a warning or fatal code, else `patch`. All-`patch` changesets computed 0.0.16, not 0.1.0 (#125).
