---
"@cosyte/ccda": patch
---

Bring this repo to the shared package baseline: install hardening, the required
js-yaml override, and a CLAUDE.md under its line ceiling

Three drifts the meta-repo's `config/drift-manifest.json` measures against this
repo are closed, and nothing else changes.

`pnpm-workspace.yaml` is new and carries `minimumReleaseAge: 1440` and
`trustPolicy: no-downgrade`, the publication cooldown and trust policy the
standard requires of every `@cosyte/*` package repo. Both keys are switched off
by default in pnpm 10, and both are ignored outright by a pnpm older than
10.16.0 and 10.21.0 respectively, so `packageManager` is raised from `pnpm@10.0.0`
to `pnpm@10.34.5`: a settings file the pinned package manager ignores decorates
rather than defends. A cold-store `pnpm install --frozen-lockfile` was measured
against the new policy and raised no `ERR_PNPM_TRUST_DOWNGRADE`, so no
`trustPolicyExclude` entry is carried and the exemption lists are absent rather
than empty.

`pnpm.overrides` gains the required `js-yaml@>=4.0.0 <4.3.0` entry. It is listed
BEFORE this repo's own `js-yaml@>=4.0.0 <4.3.2` entry on purpose: pnpm applies
the LAST matching override, measured on this tree, and the other order resolved
js-yaml 4.x down from 4.3.2 to 4.3.0, which would have been an advisory
remediation quietly undone by a compliance edit. The lockfile still resolves
js-yaml at 4.3.2, and no existing override was removed, narrowed or repointed.

`CLAUDE.md` goes from 459 lines to 232, under the ceiling of 300 the standard
declares, entirely by RELOCATION. Every block of prose that left it is
reproduced verbatim in `documentation/agent-notes.md`, under the very heading
the imperative's `Why:` pointer already resolved to, and what is left in
`CLAUDE.md` is the rule plus that pointer. Nothing was deleted, no imperative
lost its file, and no claim was reworded, softened or strengthened.

No published API, warning code, parser behaviour or emitted XML changes.
