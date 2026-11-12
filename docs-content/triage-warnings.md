---
id: triage-warnings
title: Triage warnings
sidebar_label: Triage warnings
description: "Collect every tolerated deviation as a coded warning, stream them as they happen, and log them without leaking document content."
---

# Triage warnings

You want to log or triage every tolerated deviation without your pipeline throwing on a vendor
quirk. `@cosyte/ccda` is liberal on input: only the seven Tier-3 structural/security errors
ever throw; everything else is a warning carrying a stable code and a bounded structural position.

Every warning collects on `doc.warnings`; you can also stream them live via `onWarning`:

```ts runnable
import { parseCcda, WARNING_CODES, type CcdaWarning } from "@cosyte/ccda";

// A section with an unrecognized LOINC code: tolerated, retained as narrative-only.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0010"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient><name><given>Jane</given><family>Doe</family></name>
    <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/></patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <code code="99999-9" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Vendor-specific</title>
      <text>Local content.</text>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

const streamed: CcdaWarning[] = [];
const doc = parseCcda(xml, {
  onWarning: (w) => {
    streamed.push(w);
    // w.code: a stable string from WARNING_CODES
    // w.message: a frozen registry string; it interpolates nothing at all
    // w.position: where in the document it occurred (bounded element path, LOINC, line/column)
  },
});

// Or read them after the fact:
doc.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_SECTION_CODE); // => true
streamed.length > 0; // => true

// Every message is safe to log: no PHI by construction.
doc.warnings.every((w) => typeof w.message === "string"); // => true
```

**Escalate when you want strictness.** Pass `{ strict: true }` to turn the first tolerated deviation
into a thrown `CcdaParseError` carrying the same code: a spec-conformance gate for a trusted sender.

## Reference

- [`parseCcda`](./api/README.md#parseccda) and its [`ParseCcdaOptions`](./api/README.md#parseccdaoptions)
  (`onWarning`, `strict`).
- [`CcdaWarning`](./api/README.md#ccdawarning) and [`CcdaPosition`](./api/README.md#ccdaposition):
  what each warning carries.
- [Warning and error codes](./warning-codes.md): what every code means, and which a profile may
  never quiet.
- [`WARNING_CODES`](./api/README.md#warning_codes) and [`FATAL_CODES`](./api/README.md#fatal_codes).

## Related

- [Apply a vendor profile](./apply-a-vendor-profile.md), to quiet the benign deviations one sender is
  known for.
- [Tolerance and the warning model](./spec-notes-tolerance.md) explains the tiers and the codes.
- [Troubleshooting](./troubleshooting.md#keeping-phi-out-of-logs) says what is safe to log.
