# @cosyte/ccda — Project Guide for Claude

This repository is managed with the GSD (Get Shit Done) workflow. All planning artifacts live under `.planning/`.

## Start here

1. Read `.planning/PROJECT.md` for context, core value, constraints, and key decisions.
2. Read `.planning/REQUIREMENTS.md` for the full v1 REQ-ID catalog.
3. Read `.planning/ROADMAP.md` for the phased execution plan.
4. Read `.planning/STATE.md` for current position and session continuity.

## Ground truth

- **North star:** A developer can parse a real-world, vendor-quirky C-CDA document and pull useful sections out of it in one line — without having read the C-CDA IG.
- **Sibling package:** `@cosyte/hl7` (lives at `../hl7-parser`). This project mirrors its style, tooling, guardrails, and artifact discipline. When in doubt, do what `@cosyte/hl7` did.
- **The one deliberate divergence:** runtime dependencies are allowed here (for XML parsing), but each one requires an ADR under `.planning/adr/`. Target ≤ 3 runtime deps.

## Workflow

- **Mode:** yolo. Auto-approve planning artifacts and advance automatically.
- **Granularity:** standard (5–8 phases, 3–5 plans each).
- **Parallelization:** enabled. Plans within a phase may run in parallel where they touch disjoint modules.
- **Agents enabled:** plan-check, verifier, Nyquist validation.
- **Commit docs:** yes. `.planning/` is tracked in git.

Run `/gsd-progress` at any time to see where the project stands. Run `/gsd-next` to advance.

## Hard gates

- **No Phase-2 parser code** until `.planning/adr/0001-xml-parser.md` is committed (the XML-parser choice among `fast-xml-parser`, `sax`, `@xmldom/xmldom`, `libxmljs2` is a Phase-1 discuss-phase deliverable).
- **≥ 90% line coverage** on `src/parser/`, `src/model/`, `src/templates/`, `src/helpers/` before v1 ships.
- **No `console.*` in library code.** Throw typed errors or return results.
- **TypeScript strict + `noUncheckedIndexedAccess`.** No `any`, no unjustified `as` casts.

## Commit style

Atomic, phase-aware. One plan per commit unless the plan itself is atomic-wave. Mirror the commit-message style from `@cosyte/hl7`'s `git log`.
