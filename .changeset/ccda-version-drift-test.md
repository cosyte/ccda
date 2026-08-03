---
"@cosyte/ccda": patch
---

test: pin the `VERSION` export to `package.json` in the sanity suite

Test-only. No runtime code changed and the published surface is unaffected. This repo was not
defective: the `version` script already runs `scripts/sync-version.mjs`, so the constant is
structurally synced at release. What was missing was the guard on that guard.

The measurement, the ported narrowing property, and the argument for adding no wiring check are
stated once in the `CHANGELOG.md` entry for `CCDA-VERSION-DRIFT-TEST`; this file deliberately copies
none of it, and its body is discarded unread at the next version bump anyway (`changelog` is `false`
in `.changeset/config.json`).
