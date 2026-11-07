# AGENTS.md

`@cosyte/ccda` parses, serializes, builds and edits C-CDA R2.1 clinical documents in Node.js and
TypeScript: lenient on parse, spec-clean on emit. We publish it to npm under MIT from this
repository.

## Build and test

Use Node.js 22 or later and the pnpm that `packageManager` in `package.json` pins (10.34.5). If
`pnpm --version` prints another version, run `corepack enable --install-directory <dir> pnpm` and
put `<dir>` first on PATH.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## The gate

Run these from the repo root, in this order, before you push. CI runs steps 1 to 9 on Node 22 and 24.

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

## Data

Synthetic data only: real patient data never enters this repository, in a fixture, a test, an
example, an issue, or a log.

## Contributing

Read the [contributing guide](https://github.com/cosyte/.github/blob/main/CONTRIBUTING.md) before
you open a pull request.
