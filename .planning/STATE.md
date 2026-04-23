---
gsd_state_version: 1.0
milestone: v1
milestone_name: milestone
status: "Project initialized 2026-04-22. PROJECT.md, REQUIREMENTS.md (130 v1 REQ-IDs across 17 categories — revised post-research from 116), ROADMAP.md (8 phases, mirroring @cosyte/hl7 shape with C-CDA-specific phase ordering), STATE.md, and .planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS}.md committed. No code written. Next step: /gsd-plan-phase 1 — Project Foundation & XML Parser ADR. Phase 1 has a hard gating constraint: no Phase-2 (parser) source code may be written before .planning/adr/0001-xml-parser.md is committed (DOC-16d / SETUP-03). Research has pre-recommended @xmldom/xmldom ^0.9.10 as the ADR outcome (HIGH confidence); discuss-phase ratifies or diverges."
last_updated: "2026-04-22T22:00:00Z"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 36
  completed_plans: 0
  percent: 0
---

# @cosyte/ccda — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/ccda`
- **Core value:** A developer can parse a real-world, vendor-quirky C-CDA document and pull useful sections out of it in one line — without having read the C-CDA Implementation Guide.
- **Current focus:** Project initialized 2026-04-22. PROJECT.md + REQUIREMENTS.md (130 REQs) + ROADMAP.md + STATE.md + 4 research documents committed. Research-pass revision applied (15 REQs added, 9 modified, 1 deferred). Repo is empty (no `src/`, no `package.json`). Next step: `/gsd-plan-phase 1` — Project Foundation & XML Parser ADR. The XML-parser runtime-dep choice is a discuss-phase deliverable in Phase 1 and must be locked as `.planning/adr/0001-xml-parser.md` BEFORE any parser code is written in Phase 2. Research recommends `@xmldom/xmldom ^0.9.10` (HIGH confidence; ratified or diverged at the discuss step).
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on.

## Current Position

Phase: Pre-Phase-1 (project initialized; planning artifacts + research committed; no code).
Next Step: Run `/gsd-plan-phase 1` to decompose Phase 1 (Project Foundation & XML Parser ADR) into plans.

- **Milestone:** v1
- **Phase:** 1 of 8 (Project Foundation & XML Parser ADR) — pending
- **Plans (milestone total):** 0 / 36 anticipated (4 + 5 + 5 + 3 + 5 + 4 + 5 + 5)
- **Status:** Not started
- **Progress:** 0/8 phases complete

```
[░░░░░░░░░░░░░░░░░░░░] 0%   (0 / 8 phases shipped)
```

## Performance Metrics

- **Phases completed:** 0 / 8.
- **Plans completed:** 0.
- **REQ-IDs validated:** 0 / 130.
- **Known coverage:** Repo empty. No tests yet.

## Accumulated Context

### Roadmap Evolution

- 2026-04-22 (initial): Roadmap committed. 8 phases derived from REQUIREMENTS.md categories. Notable structural choice: XML-parser ADR is a Phase 1 discuss-phase gating deliverable — non-negotiable per the user — so that Phase 2 begins with a single, justified runtime-dep choice rather than re-litigating it mid-build.
- 2026-04-22 (research-pass revision): 4 parallel research agents (stack / features / architecture / pitfalls) completed; 15 REQs added, 9 modified, 1 deferred to v2 (MODEL-05 — half-XPath replaced by `section.rawXml` escape hatch). Phase ordering tweaked: CODE-01 + CODE-02 moved from Phase 4 into Phase 3 (so `CodedValue.codeSystemName` resolves from day one); CODE-03 moved to Phase 7 alongside the profile system; Phase 4 narrowed to templates only. Two new built-in profiles added: BIP-07 `profiles.carequality` and BIP-08 `profiles.commonwell` for national HIE traffic. Security-by-default REQs added (PARSE-09, TOL-07, TOL-08, TEST-10, DOC-17d, DOC-18d). USCDI v3 helpers added (HELPERS-11..15). Filter helpers added (HELPERS-16). `doc.summary()` rollup added (HELPERS-17). Total: 130 REQs across 8 phases, 36 plans anticipated.

### Key Decisions (carry-forward from PROJECT.md)

- Lenient parsing is the default; strict mode is opt-in.
- Warnings carry stable string codes + XPath-ish positional context.
- Built-in templates use the same `defineTemplate()` / `defineProfile()` API developers use — built-ins and developer-authored templates are equal citizens of the same API.
- Section access is template-first (templateId), code-second (LOINC fallback). Vendors get LOINC codes wrong more often than templateIds.
- Narrative is preserved verbatim and reconciled against entries lazily on access; conflicts expose both and fire `CCDA_NARRATIVE_ENTRY_MISMATCH` (scoped to medication-dose / problem-displayName / result-numeric).
- Serializer always emits spec-clean canonical C-CDA R2.1 regardless of what was parsed (Postel's Law).
- Runtime dependencies are allowed (deliberate divergence from `@cosyte/hl7`'s zero-dep stance) but each one requires an ADR. Target ≤ 3 runtime deps. Pinned floors above all known CVEs.
- Built-in OID registry is opt-in extensible via `defineProfile`.
- Fatal errors only for unrecoverable structural corruption (Tier 3): `NOT_XML`, `NO_CLINICAL_DOCUMENT_ROOT`, `INVALID_NAMESPACE`, `EMPTY_INPUT`. Everything else is a warning. (DTD presence: warning + reject, not fatal.)
- Profile starter kit is a first-class deliverable — the growth loop depends on frictionless publishing.
- **(NEW) XML parser: `@xmldom/xmldom ^0.9.10`** (research-recommended; ratified at Phase 1 discuss step or diverged with rationale). Adapter boundary in `src/xml/adapter.ts`.
- **(NEW) Mutation contract: structural-sharing-with-new-instance** — mutators return a new `CCDADocument`; the original is never modified. Diverges from `@cosyte/hl7`'s `markDirty`.
- **(NEW) Composite types carry `nullFlavor` first-class** (TYPES-01/02). The semantic distinction between absent and `nullFlavor="UNK"` matters clinically.
- **(NEW) Profile `extends` merge order: leftmost-ancestral, rightmost-layered, `defineProfile` body wins last word.** Type as `Profile | readonly Profile[]`, never `any[]`.
- **(NEW) Security posture: DTD disabled, billion-laughs bounded, decode caps, PHI-redacted snippets — no Tier-3 bypass.** Healthcare library; first CISO review must find safe defaults.

### Open Decisions (to be resolved in upcoming phases)

- **Phase 1 discuss step:** Ratify or diverge from the research recommendation `@xmldom/xmldom ^0.9.10`. Output: `.planning/adr/0001-xml-parser.md`. Gates Phase 2.
- **Phase 3 discuss step:** Ratify the structural-sharing mutation contract (research recommendation; expected to be ratified). MODEL-07 spec language already reflects the recommendation.

### Todos / Blockers

- None yet (pre-Phase-1). Research-pass revision complete; all assumptions stress-tested; ready for `/gsd-plan-phase 1`.

## Session Continuity

- **Last session:** 2026-04-22 — orchestrator ran `/gsd-new-project`, then a research-pass revision (4 parallel research agents → 15 REQ additions / 9 modifications / 1 deferral / phase-ordering tweak). Three commits pushed to `origin/main` at `git@github.com:cosyte/ccda.git` (private): `fedaeff` initialize, `a721637` roadmap, `7990ff3` research, plus a fourth commit landing the revision pass.
- **Next session:** Run `/gsd-plan-phase 1`.

---

*Last updated: 2026-04-22 (research-pass revision).*
