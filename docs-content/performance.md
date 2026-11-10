---
id: performance
title: Performance
sidebar_label: Performance
description: "What we measure on @cosyte/ccda and how: the limits that bound what a document can cost, the guards against slow hostile input, and what is not yet measured."
---

# Performance

This page describes what we measure on `@cosyte/ccda`, how we measure it, and what is not measured
yet. The shared method every Cosyte package follows (throughput, latency percentiles, memory, import
time and bundle size, and how a pull request is compared with `main`) is written down in the
performance standard in
[cosyte/config's decision records](https://github.com/cosyte/config/tree/main/documentation/decisions).
The numbers for the current release are in [Current numbers](#current-numbers) below.

## What is measured today

**No throughput or memory benchmark runs on this package yet.** Throughput by document size,
latency percentiles, peak heap, import time and bundle size are what the performance standard asks
for, and until a benchmark is added the numbers below say "not measured" for each of them, with the
reason.

What runs today is a set of guards against the slow paths that matter most for a parser of
untrusted XML:

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
pnpm test test/security.test.ts   # the hostile-input guards and the parse limits
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
