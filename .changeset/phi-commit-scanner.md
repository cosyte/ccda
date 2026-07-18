---
"@cosyte/ccda": patch
---

Add a repo-side PHI commit-scanner (`scripts/phi-scan.ts`, `pnpm phi-scan`).

A zero-dependency, C-CDA-shape-aware scanner refuses fixtures (and any `src/` file that embeds a
document in a JSDoc `@example`) that carry real-looking PHI, so a developer cannot commit a real
clinical document by accident. It does NOT import the package's `@xmldom/xmldom` runtime dependency —
a commit gate must run without a build and must tolerate the malformed / fragmentary XML a real leaked
document arrives as. Detection is element-scoped, not a blind text regex, so a coded clinical value
(`<code code="55607006"/>`) or a template OID (`<templateId root="2.16.840…"/>`) never trips it: it
reads person-name parts (`given` / `family` wherever they appear — patient, `guardian`,
`assignedPerson`, `informant`, `relatedSubject`, providers — plus a bare `name`), the
`birthTime@value` date of birth, `id@root` / `@extension` identifiers (SSN under the US SSN OID
`2.16.840.1.113883.4.1`, bare-numeric MRN / account, dashed SSN anywhere), addresses
(`streetAddressLine` / `city` / `postalCode`), `telecom@value` phones (the `555` fake-exchange
convention passes), and emails (non-test domains). The detectors are namespace-prefix tolerant
(`<given>` == `<v3:given>`), case tolerant, and decode XML character references + `<![CDATA[…]]>`
before matching, so a `<family>&#x53;mith</family>` or CDATA-wrapped name is still caught.

Synthetic fixtures are positively declared in `scripts/phi-allow-list.txt` (C-CDA is XML with no
natural inline `synthetic: true` marker, and this repo keeps its fixtures as embedded XML — the same
allow-list model the byte-strict siblings `@cosyte/hl7` / `@cosyte/dicom` / `@cosyte/x12` use); a
whole-file bypass requires `--allow-fixture` plus an audit entry in `phi-scan-overrides.md`. Runs at
pre-commit (`simple-git-hooks --staged`) and in CI (`run-phi-scan: true`). Dev-tooling only — no change
to the published package surface or warning codes.
