---
id: performance
title: Performance
sidebar_label: Performance
description: "What we measure on @cosyte/ccda and how: the benchmark suite and scaling gate, the limits that bound what a document can cost, and the guards against slow hostile input."
---

# Performance

This page describes what we measure on `@cosyte/ccda` and how we measure it. The shared method every
Cosyte package follows (throughput, latency percentiles, memory, import time and bundle size, and
how a pull request is compared with `main`) is written down in the performance standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

## What is measured today

**A benchmark suite and a scaling gate.** `bench/ccda.bench.mjs` runs on
[`@cosyte/bench`](https://www.npmjs.com/package/@cosyte/bench) against the built package, the way a
consumer loads it. Its inputs are synthetic documents built in code by `bench/shapes.mjs`, in three
shapes real traffic has:

- **a Referral Note** of about 23 KiB, the small document a referral feed carries all day;
- **a Continuity of Care Document** of 100, 1,000 and 4,000 entries spread over Problems,
  Medications, Results and Encounters, each section with its narrative table, the shape a full chart
  export returns;
- **an Unstructured Document** whose `nonXMLBody` carries a base64 PDF of 64 KiB or 4 MiB, the large
  opaque payload.

Each shape is measured four ways: `parseCcda`; `parseCcda` with a terminology adapter and a value set
source, both answering from memory; `parseCcda`, then `toString`, the parse and the first write of a
caller that passes a document on; and `editCcda` replacing a section, then `toString`. A reading
reports throughput, latency p50, p95 and p99, allocations per call, the peak heap of one call, whether
the heap stays flat over a long run, and the cold import time with every file it loads and its gzip
size. `@cosyte/bench` cannot finish warming up a case of about 1 MiB or more, so a reading skips the
timings of those cases and still reports their peak heap; `bench/profile.mjs` times every size the
simpler way and profiles the hottest paths.

`bench/profile.mjs` also shows which way each edit the bench makes went. `editCcda` makes an edit on
the source's XML text when that text is in the form our writer gives it, which is nearly always, and
falls back to a DOM of the whole document otherwise, at several times the memory. It reports which
on the `cosyte:ccda:edit` channel of `node:diagnostics_channel`, as `{ path: "text" }` or
`{ path: "dom" }`, and only while something subscribes. The profile's "Edit path" table counts them
for every shape and size, so an edit that has started falling back is seen before its memory is.

`test/perf/scaling-gate.perf.ts` is the scaling gate from `@cosyte/test-utils/perf`: it fails when
parse cost grows faster than its input, on 4 times the referral notes and on documents with 4 times
the entries, and its self-check proves those sizes are large enough to catch a parse that has become
quadratic.

On a pull request, CI runs the scaling gate, and times the referral note and the 100 entry CCD on the
base build against the head build, interleaved on one runner. That comparison is advisory: it posts
its numbers and fails nothing. The `Bench reading` workflow takes a full reading, the budgets and a
profile on a GitHub-hosted runner when the bench changes, or when it is run by hand.

It also runs a set of guards against the slow paths that matter most for a parser of untrusted XML:

- **Hostile input stays linear.** Three tests in the suite parse inputs built from published
  denial-of-service advisories against the XML parser this package uses (an unterminated processing
  instruction, an element with tens of thousands of distinct attributes, and a long run of `<` inside
  a malformed tag) and fail when one of them takes longer than a fixed time budget. The budget sits
  well above what a healthy parse takes and well below what a parser that is quadratic on those
  inputs takes, so a loaded runner does not trip it and a quadratic regression cannot pass it.
- **Every parse is bounded.** `parseCcda` refuses input over a byte
  cap, element nesting over a depth cap, documents over a node-count cap, and entity references over
  an expansion cap, each with its own fatal code. The defaults are in
  [`DEFAULT_LIMITS`](./api/README.md#default_limits), and a caller can tighten or loosen them through
  the `limits` option ([`CcdaParseLimits`](./api/README.md#ccdaparselimits)). This bounds the work a
  single document can cost; it is not a speed measurement.

## What these guards are not

- **Not a throughput figure.** A test that passes under its budget says the parse is not
  pathologically slow on that input, not how fast it is.
- **Not a comparison with other libraries.** That is a separate suite with its own written method.
- **Not a behavior contract.** Nothing here changes how a document parses.

## Run them yourself

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm bench:reading --out bench-results/reading.json --summary bench-results/reading.md
node bench/budgets.mjs bench-results/reading.json
node --enable-source-maps bench/profile.mjs dist/index.mjs --out bench-results/profiles
pnpm test:perf
pnpm exec vitest run test/security.test.ts test/parse.test.ts
```

A full reading takes many minutes; `--only <benchmark>` narrows it. `test/security.test.ts` holds the
hostile-input guards and the depth and entity-expansion caps; `test/parse.test.ts` holds the byte,
depth and node-count caps among the parser's other tests.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
