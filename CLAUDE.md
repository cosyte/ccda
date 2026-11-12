# @cosyte/ccda

Our parser, builder, and editor for C-CDA clinical documents in Node.js and TypeScript, published
on npm as `@cosyte/ccda` under MIT. It keeps the shape of `@cosyte/hl7`'s API. Parsing is lenient:
vendor quirks become coded warnings, not errors.

@AGENTS.md

## Gate

Required on `main`: `ci / verify (22, ubuntu-latest)`, `ci / verify (24, ubuntu-latest)`,
`ci / actionlint` and `no-emdash / tracked-files`. CI also runs `ci / verify` on Node 26, the
`conformance`, `examples` and `standards` jobs, and `no-internal-refs / public-surface`, `verify` on
Windows and macOS, `bun`, `deno`, `coverage-ratchet` and `mutation` (the changed files, held to
`quality-floor.json`). The full mutation run is `weekly-mutation.yml`; the properties at 10,000
cases are `nightly-properties.yml`. From the
repo root, with pnpm 10.34.5 first on PATH (pnpm 12 refuses the frozen install; a test runs a bare
`pnpm build`):

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm phi-scan
pnpm test && pnpm test:coverage && pnpm build && pnpm attw
pnpm conformance # fetches its pinned artifacts, so it needs the network
pnpm typecheck:examples && pnpm lint:examples && pnpm examples
pnpm check:readme && pnpm check:claude-card && pnpm check:catalog && pnpm check:process
pnpm check:no-emdash && pnpm check:no-internal-refs && pnpm exec cosyte-docs-content
```

## Hazard

A C-CDA document is a patient record by design. Any change to parsing, emitting or fixtures can
carry a real patient's data into a warning message, a model field, a fixture, a doc or a log.

## Rules that bind here

Each names the failure that proved it.

- No document text in a warning, a fatal message or an unbounded model field: 0.0.4 returned a
  500,000-byte `templateId` root in a `.message` (#77).
- Refuse a narrative label when the coded entry has no `displayName`; never render a default:
  0.0.11 shipped "No known allergies" beside a positive allergy (#100).
- Transcribe code systems, value sets and SHALL tables from the published source, never from
  memory: `NULL_FLAVORS` held 8 of the 17 v3 concepts (#78).
- `pnpm attw` runs `cosyte-attw`, never the bare `attw` CLI, which exits 0 on a tarball with no
  type declarations (#82).
- Count dashes with `pnpm check:no-emdash`, not grep: NUL bytes in `src/profiles/merge.ts` make
  grep skip it as binary, and #52 left one there.
- Add no path or file-type exemption to `scripts/phi-scan.ts`: it printed OK while 44 of 140
  tracked files went unread (#103).
- Keep a test that writes into the tree or spawns a build from racing the others: Vitest runs
  files in parallel, and the release Verify on `d906bda` went red that way (#146).
- Every `@example` import resolves, and one on a public export imports only `@cosyte/ccda`:
  0.1.3 carried 65 imports in 61 examples naming it for symbols it does not export.
  `test/example-imports.test.ts` checks it with the TypeScript parser; never swap in a regex.
- Never hand-edit `CHANGELOG.md`: a release writes it from the changesets, and a hand-kept
  `[Unreleased]` heading shipped in every tarball until #94.
- Every changeset is `patch` (D56, 2026-11-07): one that adds an export or a warning or fatal code
  would be `minor`, which waits for the operator's okay. All-`patch` changesets computed 0.0.16
  where 0.1.0 was meant (#125).
