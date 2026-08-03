---
"@cosyte/ccda": patch
---

test: trim the scanner suite's fixed cost and drop the global test timeout

`test/scripts/phi-scan.test.ts` spawns the scanner 48 times and was paying a
`tsx` start-up at every one (~521 ms, against ~147 ms for `node` with native type
stripping). That file went from ~24.6 s to ~9.0 s while gaining a test: one case
still pays the `tsx` cold start and asserts the two runners agree on exit code,
stdout and stderr, because `pnpm phi-scan` is what the commit gate really runs.

`vitest.config.ts` then lost `testTimeout: 10_000` and `hookTimeout: 10_000`. The
first was itself the false red the item was filed for; the second restated Vitest's
own default verbatim. Every test whose cost is not fixed now carries its own
budget next to the work.

The rule, the twenty-two-run measurement it rests on, and the two findings that
corrected instinct are stated once, in the docblock of `vitest.config.ts`, and
this file deliberately does not copy them. The changeset body is also deleted
unread at the next version bump (`changelog` is `false` in
`.changeset/config.json`), so length here buys nothing.

No runtime code changed, and the published surface is unaffected.
