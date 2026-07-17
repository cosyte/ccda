---
"@cosyte/ccda": patch
---

Bring `docs-content/` to the full canonical Diátaxis spine (DOCS-CONTENT-P5).

The sidebar was Overview-only. This authors the rest of the spine every `@cosyte/*` package shares,
gated hard to `ccda`'s **actually shipped** parse surface (through Phase 5b) — deliberately honest
about what is not yet parsed:

- **Core Concepts** — four Explanation pages: the document model (recognition, header, section
  framing), the tolerance tiers + warning-code model (with the seven Tier-3 fatals), the clinical entry
  layer (the 14 extracted families and their safety-critical distinctions), and datatypes / code
  systems / computable UCUM / the round-trip serializer.
- **Installation** and **Quickstart** tutorials (parse a CCD; read demographics + the Problem /
  Medication / Allergy triad, a Result, and an Immunization).
- **Guides** — a task-oriented cookbook (active-problem filtering, the code/narrative fail-safe, warning
  triage, the round-trip serializer).
- **Troubleshooting & known limitations** — the fatal-vs-warn model, a symptom→cause table, PHI-in-logs
  discipline, and an explicit **"what's not yet parsed"** list (no builder API; entry families beyond
  the 14; recognition-not-membership code checks; curated-UCUM; inert `nonXMLBody`).
- Refreshed the stale `intro.md` status banner (it read "Phase 3 / six families") to the current
  shipped reality (Phase 5b + serializer), with an honest status banner; no unshipped API is documented.
- Every runnable snippet is gated by the shared doc/code-agreement harness
  (`test/docs-content.test.ts`, `docSnippetSuite()` over the built ESM artifact), so a documented
  example cannot silently drift from the code.
- Bump the `@cosyte/vitest-config` devDependency to `^0.0.2` for its `/snippets` export.

Synthetic-only fixtures throughout (an invented patient, fake OIDs). Docs and tests only — no runtime
or public-API change.
