---
id: parser-archetype
title: The Cosyte parser archetype
sidebar_label: The parser archetype
sidebar_position: 12
description: The API shape every Cosyte parser shares, and how @cosyte/ccda follows it.
---

# The Cosyte parser archetype

`@cosyte/ccda` is a near-zero-dependency TypeScript toolkit that follows the Cosyte parser archetype: a
lenient parser that turns real-world, vendor-quirky input into **warnings** rather than failures
(Postel's Law). It mirrors the API shape of the reference parser,
[`@cosyte/hl7`](https://github.com/cosyte/hl7). Its single runtime dependency is
[`@xmldom/xmldom`](https://www.npmjs.com/package/@xmldom/xmldom) (exact-pinned), the W3C-DOM substrate
for C-CDA's XML.

- **Postel's Law**: liberal parser (lenient default + warnings), conservative serializer (always
  spec-clean), so quirks don't propagate downstream on round-trip.
- **Tiered tolerance**: Tier 0/1 silent, Tier 2 warning + recovery (escalates in strict mode),
  Tier 3 fatal always.
- **Stable warning codes**: warnings carry stable string codes + positional context; consumers
  branch on `w.code`, so renaming a code is a breaking change.
- **Near-zero dependencies**: one exact-pinned runtime dep (`@xmldom/xmldom`) for the XML substrate;
  healthcare integrations vet every dependency, so the cap is **≤ 3** justified deps.
- **PHI-safe diagnostics**: warning and fatal messages come whole from a frozen registry and
  interpolate nothing, so no value from your document reaches one; positions carry bounded
  structural identifiers only (element path, section LOINC code, template OID) plus line/column.
- **Dual ESM + CJS**: built with `tsup`, validated with `attw`.
- **Immutability**: parsed models are immutable; mutation is via explicit methods.
- **Profile system**: a `defineCcdaProfile()` API for vendor/conformance quirks, with a
  provenance-backed registry (`ccdaProfiles`) of built-ins authored through the same public API. A
  safety gate refuses any profile that tries to tolerate a safety-critical warning code.
