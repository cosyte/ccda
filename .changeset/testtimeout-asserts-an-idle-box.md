---
"@cosyte/ccda": patch
---

test: drop the global test timeout and trim the scanner suite's fixed cost

Test-only. No runtime code changed and the published surface is unaffected. The rule is
stated once in the docblock of `vitest.config.ts` and the measurement once in the
`CHANGELOG.md` entry for `PARSER-TESTTIMEOUT-ASSERTS-AN-IDLE-BOX`; this file deliberately
copies neither, and its body is discarded unread at the next version bump anyway
(`changelog` is `false` in `.changeset/config.json`).
