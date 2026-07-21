---
"@cosyte/ccda": patch
---

Docs — correct publish-status + capability drift in `docs-content/` (README-ORG-SWEEP, wave 2). The
user-facing docs pages still read "not yet published to npm" / "gated on the coordinated public launch",
and `intro.md` still described the builder as through **Phase 5b** (a CCD with header + Problems +
Allergies only). Both are stale: `@cosyte/ccda` is **published on npm at `0.0.1`** and **public**, and
the builder is through Phase 7 (`buildCcda` emits a CCD or Referral Note, `editCcda` edits a parsed
document, plus a bring-your-own terminology adapter). The status banners in `intro.md` / `installation.md`
and the "Scope (non-goals)" note in `troubleshooting.md` now state published on npm at `0.0.1`, public,
still pre-alpha on the cosyte `0.0.x` ladder, with the install command live and the builder capability
mirroring the corrected README. Documentation only — no code, public-API, or warning-code change.
</content>
</invoke>
