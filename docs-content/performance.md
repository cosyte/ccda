---
id: performance
title: Performance
sidebar_label: Performance
description: "What we measure on @cosyte/ccda and how: the benchmarks, the scaling gate, the limits on what a document can cost, and the guards against slow hostile input."
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
its numbers and fails nothing. The `Bench reading` workflow takes a full reading, the long run read
longer (`bench/long-run.mjs`, below), the budgets and a profile on a GitHub-hosted runner when the
bench changes, or when it is run by hand.

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

## The long-run memory budget

A reading's long run asks whether the heap keeps growing while one operation repeats. It runs 30
rounds of about 100 ms, collects fully between rounds, fits a slope through the settled heap of the
last 25 and calls the case growing when that slope makes 64 KiB or more over them. That is about 2.5
seconds of work just after warm-up, while V8 is still adding optimized code and the feedback it
optimizes from, and that growth is of the same order as the 64 KiB line.

`bench/long-run.mjs` reads it longer. For every operation at each shape's smallest size, 12 cases,
each in a fresh process with `--expose-gc`, it repeats the reading's 30 rounds and then runs a long
window of rounds enough for 12,000 operations, at least 300 rounds and at most 1,000. It fits each
window twice: on the whole heap, as the reading does, and outside the heap spaces V8 keeps compiled
code in (every space whose name holds `code` or `trusted`). It writes a heap snapshot before the
reading's window, after it and at the end, sums each by constructor and diffs them, so a growth
names what grew. No value from a document is printed.

The long-run budget in `bench/budgets.mjs` is under 64 KiB of growth over that long window, outside
compiled code, with the reading's own verdict shown beside it. Like every budget there, it is
advisory: it reports a finding and fails no check.

### What we measured

Four runs of the `Bench reading` workflow on Node 22.23.4 on a GitHub-hosted runner, on the four
commits of the pull request that added `bench/long-run.mjs`:

| Run | Commit  | Run id      | What it read                                                             |
| --- | ------- | ----------- | ------------------------------------------------------------------------ |
| 1   | 7580331 | 43081933071 | the two cases below, the whole heap only, the edit over 3,600 operations |
| 2   | b55fbb5 | 43085829656 | the two cases below, the edit over 3,600 operations                      |
| 3   | 9548808 | 43088420249 | all 12 cases, the long window at 12,000 operations                       |
| 4   | 6cc96b1 | 43093553147 | all 12 cases, the long window at 12,000 operations                       |

Run 1 kept its own record of the run in the heap it read, and run 3 kept its snapshot summaries
there. Both were fixed before run 4, so run 4 is the clean one; every run is given below.

- **`parseCcda` on the Referral Note**, 128 operations a round, 38,400 in the long window. The
  reading's own long run called it growing in all four runs, at 77.9 to 246.9 KiB. Over the long
  window the whole heap was flat in all four, at -0.2 to 25.1 KiB, and the heap outside compiled
  code was flat in runs 2 to 4, at -0.2 to 7.3 KiB.
- **`editCcda`, then `toString`, on the CCD of 100 entries**, 12 operations a round. The reading's
  own long run called it growing in all four runs, at 86.7 to 141.2 KiB, and so did the long window
  on the whole heap, at 100.5 to 128.2 KiB. Outside compiled code it was flat in runs 2 to 4: 57.7
  KiB over 3,600 operations in run 2, 55.1 KiB over 12,000 in run 3, and 49.8 KiB over 12,000 in run
  4 (4.2 bytes an operation). In run 4 the snapshots name what grew over the long window: compiled
  code gained 297.0 KiB and everything else 8.5 KiB, and the row outside code that grew most was
  V8's own `system / WeakArrayList`, at 10.1 KiB. No object type the package creates grew.
- **All 12 cases.** Outside compiled code, the long window was flat in 12 of 12 in run 3, at -3.6 to
  55.1 KiB, and in 12 of 12 in run 4, at -2.7 to 49.8 KiB. In run 4 the reading's own long run, in the
  same job, called 9 of the 12 growing.

So the growth a reading's long run reports is V8's compiled code settling, not data the package
keeps.

### What the budget cannot see

- **A leak of compiled code.** The budget leaves out the spaces compiled code lives in, so code that
  keeps compiled functions alive, one for each document for example, grows where the budget does
  not look. `bench/long-run.mjs` still prints the whole-heap fit and the code column of the snapshot
  diff, but the budget reads neither.
- **Growth too slow to make 64 KiB over the long window.** The line is fixed in bytes, so what it can
  detect depends on how many operations the window holds: about 1.7 bytes an operation for the
  Referral Note parse over 38,400 operations, and about 5.5 bytes an operation for the edit of the
  100 entry CCD over 12,000. A leak below that reads flat. The `Detectable, long` column of the long
  run's table gives the figure for every case.
- **A clean verdict on the edit, with little room to spare.** Its growth outside compiled code read
  49.8 to 57.7 KiB against the 64 KiB line, 6.3 to 14.2 KiB under it. Its last half alone read 44.1,
  4.8 and 3.3 KiB in runs 2 to 4, so in the runs of 12,000 operations nearly all of it came in the
  first half. A small real leak or a noisier runner can tip that case to growing, so we read a
  growing verdict there with its snapshot diff before we call it a leak. We keep the line where it
  is rather than loosen it to make room.

### The length of the job

The `Bench reading` job has a bound of 60 minutes. Runs 1 and 2, which read two cases, took 11
minutes 56 seconds and 11 minutes 45 seconds. Runs 3 and 4, which read all twelve, took 30 minutes 54
seconds and 39 minutes 8 seconds:

| Step            | Run 3       | Run 4       |
| --------------- | ----------- | ----------- |
| Reading         | 7 min 30 s  | 7 min 5 s   |
| Long run        | 22 min 3 s  | 20 min 3 s  |
| Profile         | 54 s        | 52 s        |
| Artifact upload | 2 s         | 10 min 50 s |
| The job, in all | 30 min 54 s | 39 min 8 s  |

The artifact was about 0.9 MB both times, so the 10 minutes of run 4 was a slow upload, not more
work: without it the job took 31 minutes in run 3 and 28 in run 4. We do not split the job now. Its bound is there for
a case that hangs, and each case of the long run also stops at 15 minutes on its own. If the
reading, the long run and the profile together pass about 45 minutes, the long run moves to a job
of its own.

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
node bench/long-run.mjs dist/index.mjs --out bench-results/long-run --summary bench-results/long-run.md
node bench/budgets.mjs bench-results/reading.json --long-run bench-results/long-run/long-run.json
node --enable-source-maps bench/profile.mjs dist/index.mjs --out bench-results/profiles
pnpm test:perf
pnpm exec vitest run test/security.test.ts test/parse.test.ts
```

A full reading takes many minutes; `--only <benchmark>` narrows it. The long run took 20 to 22
minutes on a GitHub-hosted runner, and `--rounds <n>` sets the rounds of its long window. `test/security.test.ts` holds the
hostile-input guards and the depth and entity-expansion caps; `test/parse.test.ts` holds the byte,
depth and node-count caps among the parser's other tests.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
