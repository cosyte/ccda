---
gsd_state_version: 1.0
milestone: v1
milestone_name: milestone
status: "Project initialized 2026-04-22. PROJECT.md, REQUIREMENTS.md (116 v1 REQ-IDs across 17 categories), ROADMAP.md (8 phases mirroring @cosyte/hl7 shape), and STATE.md committed. No code written. Next step: /gsd-plan-phase 1 — Project Foundation & XML Parser ADR. Phase 1 has a hard gating constraint: no Phase-2 (parser) source code may be written before .planning/adr/0001-xml-parser.md is committed (DOC-16d / SETUP-03). Candidate XML parsers under evaluation: fast-xml-parser, sax, @xmldom/xmldom, libxmljs2."
last_updated: "2026-04-22T12:00:00Z"
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 37
  completed_plans: 0
  percent: 0
---

# @cosyte/ccda — STATE

Project memory for session-to-session continuity. Updated at phase/plan boundaries.

---

## Project Reference

- **Name:** `@cosyte/ccda`
- **Core value:** A developer can parse a real-world, vendor-quirky C-CDA document and pull useful sections out of it in one line — without having read the C-CDA Implementation Guide.
- **Current focus:** Project initialized 2026-04-22. PROJECT.md + REQUIREMENTS.md + ROADMAP.md + STATE.md committed. Repo is empty (no `src/`, no `package.json`). Next step: `/gsd-plan-phase 1` — Project Foundation & XML Parser ADR. The XML-parser runtime-dep choice (fast-xml-parser / sax / @xmldom/xmldom / libxmljs2) is a discuss-phase deliverable in Phase 1 and must be locked as `.planning/adr/0001-xml-parser.md` BEFORE any parser code is written in Phase 2.
- **Workflow config:** standard granularity, yolo mode, parallelization enabled, plan-check + verifier + Nyquist validation on, auto-advance on.

## Current Position

Phase: Pre-Phase-1 (project initialized; planning artifacts committed; no code).
Next Step: Run `/gsd-plan-phase 1` to decompose Phase 1 (Project Foundation & XML Parser ADR) into plans.

- **Milestone:** v1
- **Phase:** 1 of 8 (Project Foundation & XML Parser ADR) — pending
- **Plans (milestone total):** 0 / 37 anticipated (4 + 5 + 5 + 4 + 5 + 4 + 5 + 5)
- **Status:** Not started
- **Progress:** 0/8 phases complete

```
[░░░░░░░░░░░░░░░░░░░░] 0%   (0 / 8 phases shipped)
```

## Performance Metrics

- **Phases completed:** 0 / 8.
- **Plans completed:** 0.
- **REQ-IDs validated:** 0 / 116.
- **Known coverage:** Repo empty. No tests yet.

## Accumulated Context

### Roadmap Evolution

- 2026-04-22: Initial roadmap committed. 8 phases derived from REQUIREMENTS.md categories. Notable structural choice: XML-parser ADR is a Phase 1 discuss-phase gating deliverable — non-negotiable per the user — so that Phase 2 begins with a single, justified runtime-dep choice rather than re-litigating it mid-build.

### Key Decisions (carry-forward from PROJECT.md)

- Lenient parsing is the default; strict mode is opt-in.
- Warnings carry stable string codes + XPath-ish positional context.
- Built-in templates use the same `defineTemplate()` / `defineProfile()` API developers use — built-ins and developer-authored templates are equal citizens of the same API.
- Section access is template-first (templateId), code-second (LOINC fallback). Vendors get LOINC codes wrong more often than templateIds.
- Narrative is preserved verbatim and reconciled against entries; conflicts expose both and fire `CCDA_NARRATIVE_ENTRY_MISMATCH`.
- Serializer always emits spec-clean canonical C-CDA R2.1 regardless of what was parsed (Postel's Law).
- Runtime dependencies are allowed (deliberate divergence from `@cosyte/hl7`'s zero-dep stance) but each one requires an ADR. Target ≤ 3 runtime deps.
- Built-in OID registry is opt-in extensible via `defineProfile`.
- Fatal errors only for unrecoverable structural corruption (Tier 3): `NOT_XML`, `NO_CLINICAL_DOCUMENT_ROOT`, `INVALID_NAMESPACE`, `EMPTY_INPUT`. Everything else is a warning.
- Profile starter kit is a first-class deliverable — the growth loop depends on frictionless publishing.

### Open Decisions (to be resolved in upcoming phases)

- **Phase 1 discuss step:** Which XML parser? (fast-xml-parser / sax / @xmldom/xmldom / libxmljs2.) Output: `.planning/adr/0001-xml-parser.md`. Gates Phase 2.
- **Phase 3 discuss step:** Mutation contract — return-new-document (structural sharing) vs in-place mutation with `markDirty` semantic. Either contract satisfies MODEL-07; pick one and document.

### Todos / Blockers

- None yet (pre-Phase-1).

## Session Continuity

- **Last session:** 2026-04-22 — orchestrator ran `/gsd-new-project`. Roadmapper produced ROADMAP.md (8 phases, 116/116 REQ-ID coverage) + STATE.md. User reviews; orchestrator commits.
- **Next session:** Run `/gsd-plan-phase 1`.

---

*Last updated: 2026-04-22 (project initialization).*
