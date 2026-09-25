# Examples

Small runnable programs, one per job the package does. Each one imports `@cosyte/ccda` by its
published name, so it runs against the built package exactly as a consumer installs it, prints what
it read or built, and checks its own output: a mismatch exits non-zero. Every document in them is
synthetic, with an invented patient and fake OIDs.

Build once, then run them all:

```bash
pnpm install
pnpm build
pnpm examples
```

| File                                                 | What it shows                                                                                                                                  | Run                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [`read-a-ccd.ts`](read-a-ccd.ts)                     | Read a CCD: the document type, the patient and MRN, and the problems, medications and allergies with their code systems.                       | `pnpm tsx examples/read-a-ccd.ts`           |
| [`build-and-round-trip.ts`](build-and-round-trip.ts) | Build a spec-clean CCD from typed input, read back a UCUM-checked vital sign, and see the re-serialized output match byte for byte.            | `pnpm tsx examples/build-and-round-trip.ts` |
| [`lenient-and-strict.ts`](lenient-and-strict.ts)     | Read a document with a missing medication route: lenient parsing keeps the data and reports a stable warning code, and strict mode refuses it. | `pnpm tsx examples/lenient-and-strict.ts`   |
| [`edit-a-section.ts`](edit-a-section.ts)             | Replace one section and add another with `editCcda`, getting back a CDA R2 revision of the source.                                             | `pnpm tsx examples/edit-a-section.ts`       |

`data/ccd.ts` exports the synthetic CCD three of the examples read. It is a copy of the fixture the
quickstart parses, kept in a module because this repository never tracks an XML document as a file.

CI runs `pnpm typecheck:examples`, `pnpm lint:examples` and `pnpm examples` after `pnpm build` on
every pull request, so an example that drifts from the package fails the build. The repository's
PHI scan walks the whole tree, `examples/` included.
