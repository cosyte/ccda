# @cosyte/ccda — Project Guide for Claude

A TypeScript library for the HL7 Consolidated CDA R2.1 standard.

## Ground truth

- **North star:** A developer can parse a real-world, vendor-quirky C-CDA document and pull useful sections out of it in one line — without having read the C-CDA IG.
- **Sibling package:** `@cosyte/hl7` (lives at `../hl7-parser`). This project mirrors its style, tooling, and guardrails. When in doubt, do what `@cosyte/hl7` did.
- **Deliberate divergence from the sibling:** runtime dependencies are allowed here (for XML parsing). Target ≤ 3 runtime deps, each justified.

## Hard gates

- **≥ 90% line coverage** on `src/parser/`, `src/model/`, `src/templates/`, `src/helpers/` before v1 ships.
- **No `console.*` in library code.** Throw typed errors or return results.
- **TypeScript strict + `noUncheckedIndexedAccess`.** No `any`, no unjustified `as` casts.

## Commit style

Atomic and reviewable. Mirror the commit-message style from `@cosyte/hl7`'s `git log`.
