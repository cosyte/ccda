---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
description: "How we test @cosyte/ccda: unit tests, the conformance run, property-based tests, fuzzing, coverage, doc samples and the PHI scan, and what each misses."
---

# Testing and quality

This page describes how we test `@cosyte/ccda`, what each technique catches, and what it cannot.
The shared rules every Cosyte package follows (the coverage and mutation floors, the property-based
runners, what a pull request must prove) are written down in the testing standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

The failure we test hardest against is the quiet one. A coded value read wrong but plausible, an
allergy that reads as absent, or a planned procedure that reads as performed travels downstream and
nothing flags it. So most of what follows checks values, not only that the parser did not throw.

## What we run, and what each technique catches

| Technique            | What it catches                                                                                                                                                                                                                                                                                                                                                                                                    | What it cannot catch                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests           | each documented behavior and each failure path of every module, run against the source: the warning and fatal codes, the entry families, the builder and the editor                                                                                                                                                                                                                                                | an input nobody thought to write down                                                                                                                                                                                     |
| Conformance run      | a document `buildCcda` emits that breaks the CDA R2 XML schema or the error-severity phase of the C-CDA R2.1 Schematron, and a public sample whose Schematron errors change when it is parsed and written back                                                                                                                                                                                                     | the nine document types the builder does not emit; the Schematron's warning phase; value-set membership beyond the Schematron's own vocabulary file. It is an assessment against published artifacts, not a certification |
| Property-based tests | a whole class of input breaking a stated rule: a spec-clean document survives `toString()` and parsing again, normalizing twice changes nothing a first pass did not, lenient mode never throws except on the fatal codes and every warning it raises carries a registered code, and a parsed document cannot be changed by accident                                                                               | a rule nobody stated; a case outside the cases run; a gap in what the generators produce                                                                                                                                  |
| Fuzzing              | a crash or an unexpected throw on hostile input: arbitrary strings, a document cut off at a random point and a document with a short random string inserted at a random point, alongside fixed attack inputs (an external entity, an entity-expansion bomb, deep nesting)                                                                                                                                          | a wrong but plausible result, unless a property states what right is                                                                                                                                                      |
| Coverage gate        | code no test runs: lines, branches, functions and statements, held at a floor of 100% for the whole package                                                                                                                                                                                                                                                                                                        | a test that runs code without checking what it returns                                                                                                                                                                    |
| Mutation testing     | a test that runs code but would not notice it changing                                                                                                                                                                                                                                                                                                                                                             | not yet run on this package; the numbers below say "not measured" until it is                                                                                                                                             |
| Doc samples          | a documentation sample that no longer matches the code: every TypeScript and JavaScript sample on these pages runs against the built package and its `// =>` values are checked, and each TypeScript one also compiles against the package's types. A sample that cannot run says why in its fence and is neither run nor compiled: today, the samples that import `@cosyte/hl7` and the CommonJS `require` sample | prose that is wrong beside a sample that is right                                                                                                                                                                         |
| PHI scan             | a realistic patient identifier in any tracked file: a C-CDA-aware scan of every C-CDA document in the repository, and a scan for dashed Social Security numbers and email addresses in every other file                                                                                                                                                                                                            | anything outside the fields and formats it knows; it detects after a write, it does not prevent one                                                                                                                       |

## How each one runs

- **Unit tests, properties, fuzzing and doc samples** run in one Vitest suite on every pull request,
  on `main` and nightly, on Node.js 22, 24 and 26. The property and fuzz checks run a fixed number
  of cases each (from 80 to 500 today) and pin no seed, so each run draws new cases; a failure
  prints the seed that reproduces it. Twelve of them prove the three properties every Cosyte parser
  proves (round trip, idempotent normalize, and never throws in lenient mode) on the generators we
  publish at `@cosyte/ccda/arbitraries`; they run 100 cases each, `COSYTE_PROPERTY_RUNS` sets a
  deeper run, and a failure prints the seed and path that replay it.
  [Property-test your code](./property-test-your-code.md) shows those generators on code of your
  own.
- **The coverage gate** runs with the suite. A floor that is not met fails the pull request.
- **The conformance run** fetches the C-CDA R2.1 Schematron, its vocabulary file and the CDA R2 XML
  schema from pinned, digest-checked references, and runs on every pull request in a job of its
  own, named `conformance`. It writes
  [a report](https://github.com/cosyte/ccda/blob/main/documentation/conformance-report.md) and fails
  when the committed report differs from what the run produced. The fetched artifacts are cached
  between runs, and every cached file is checked against its pin again before it is used, so a run
  with a warm cache needs no network and a cached file that fails the check is fetched again. See
  [When an upstream artifact is unreachable](#when-an-upstream-artifact-is-unreachable).
- **The PHI scan** runs on every commit (a pre-commit hook) and in CI.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm test               # unit tests, properties, fuzzing and doc samples
pnpm test:coverage      # the same suite with the coverage gate
pnpm conformance        # the conformance run; it needs the network
pnpm phi-scan           # the PHI scan over the repository
```

## When an upstream artifact is unreachable

The conformance run reaches the network by design, and an artifact it cannot fetch fails the run
rather than passing it: an artifact nobody could fetch is one nothing was validated against. It
reaches the network only when its cache does not hold an artifact as pinned: the first run after a
pin moves, or after the cache is evicted. When that fetch fails, the run stops with
`CONFORMANCE_ARTIFACT_UNREACHABLE` and names the URL. Then:

1. Check that the host in the URL is up. Every pinned artifact comes from GitHub
   (`raw.githubusercontent.com` or `codeload.github.com`).
2. Re-run the failed job once the host answers. A re-run fetches only what the cache lacks.
3. If your change moved a pin, the new artifact has to come from upstream once. Wait for the host;
   do not move the pin back to get a green.
4. Do not skip the run or let it pass on failure to get past an outage.

`CONFORMANCE_ARTIFACT_DIGEST_MISMATCH` is a different fault: the host served bytes other than the
pinned commit's, and a re-run does not fix it. Read the diff between the two commits before moving
a pin in `scripts/conformance/artifacts.json`.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
