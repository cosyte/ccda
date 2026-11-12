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

| File                                                                           | What it shows                                                                                                                                                                                               | Run                                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`read-a-ccd.ts`](read-a-ccd.ts)                                               | Read a CCD: the document type, the patient and MRN, and the problems, medications and allergies with their code systems.                                                                                    | `pnpm tsx examples/read-a-ccd.ts`                        |
| [`build-and-round-trip.ts`](build-and-round-trip.ts)                           | Build a spec-clean CCD from typed input, read back a UCUM-checked vital sign, and see the re-serialized output match byte for byte.                                                                         | `pnpm tsx examples/build-and-round-trip.ts`              |
| [`lenient-and-strict.ts`](lenient-and-strict.ts)                               | Read a document with a missing medication route: lenient parsing keeps the data and reports a stable warning code, and strict mode refuses it.                                                              | `pnpm tsx examples/lenient-and-strict.ts`                |
| [`edit-a-section.ts`](edit-a-section.ts)                                       | Replace one section and add another with `editCcda`, getting back a CDA R2 revision of the source.                                                                                                          | `pnpm tsx examples/edit-a-section.ts`                    |
| [`apply-a-vendor-profile.ts`](apply-a-vendor-profile.ts)                       | Read a document with no R2.1 version stamps under the built-in `legacyR11` profile, so the expected deviation comes back marked as tolerated; extend it for one sender; see a safety-critical code refused. | `pnpm tsx examples/apply-a-vendor-profile.ts`            |
| [`check-codes-with-your-terminology.ts`](check-codes-with-your-terminology.ts) | Plug an in-process `TerminologyAdapter` into `parseCcda`, so a code it does not know is flagged and kept verbatim, and into `buildCcda`, so a mapped code is written as a `<translation>`.                  | `pnpm tsx examples/check-codes-with-your-terminology.ts` |
| [`check-value-set-membership.ts`](check-value-set-membership.ts)               | Read the declared value-set bindings and supply a `ValueSetSource`: a route outside your expansion is a violation naming your release, and a value set you do not hold is reported as not evaluated.        | `pnpm tsx examples/check-value-set-membership.ts`        |
| [`property-test-your-code.ts`](property-test-your-code.ts)                     | Property-test your own code with the fast-check generators at `@cosyte/ccda/arbitraries`: generated build input, messy and hostile text, and a wrong rule caught with a replayable seed.                    | `pnpm tsx examples/property-test-your-code.ts`           |

`data/ccd.ts` exports the synthetic CCD six of the examples read. It is a copy of the fixture the
quickstart parses, kept in a module because this repository never tracks an XML document as a file.

CI runs `pnpm typecheck:examples`, `pnpm lint:examples` and `pnpm examples` after `pnpm build` on
every pull request, so an example that drifts from the package fails the build. The repository's
PHI scan walks the whole tree, `examples/` included.

`property-test-your-code.ts` imports `fast-check`, an optional peer dependency of `@cosyte/ccda`:
install it beside the package to use `@cosyte/ccda/arbitraries` in your own project.
