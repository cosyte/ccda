---
id: handle-code-narrative-conflicts
title: Handle a code that disagrees with its narrative
sidebar_label: Handle code and narrative conflicts
description: "Detect an entry whose coded value and narrative text disagree, read both, and route the record to human review."
---

# Handle a code that disagrees with its narrative

The structured code and the human-readable narrative of an entry can disagree, a real and
dangerous vendor defect. This guide shows how to detect it and route the record to a person
instead of silently trusting either one.

When a coded value's label disagrees with the narrative it references, the parser surfaces **both** and
raises `CODE_NARRATIVE_MISMATCH`, picking no winner. Gate on it and route the record to a human.

```ts runnable
import { parseCcda, WARNING_CODES } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.9" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0009"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic Progress Note</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient><name><given>Jane</given><family>Doe</family></name>
    <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/></patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Problems</title>
      <text><content ID="p1">Type 2 diabetes mellitus</content></text>
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <statusCode code="active"/>
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
          <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
          <value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>
          <text><reference value="#p1"/></text>
        </observation></entryRelationship>
      </act></entry>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

const doc = parseCcda(xml);
const problem = doc.getProblems()[0]?.problems[0];

// Both views are preserved. The parser picks no winner.
problem?.value?.displayName; // => "Essential hypertension"
problem?.narrative; // => "Type 2 diabetes mellitus"

const conflicted = doc.warnings.some((w) => w.code === WARNING_CODES.CODE_NARRATIVE_MISMATCH);
conflicted; // => true
// if (conflicted) routeToHumanReview(doc);
```

## Reference

- [`WARNING_CODES`](./api/README.md#warning_codes) holds `CODE_NARRATIVE_MISMATCH` beside every other
  warning code.
- [`ProblemConcern`](./api/README.md#problemconcern): each problem it holds carries the coded `value`
  and the `narrative` it references.

## Related

- [Triage warnings](./triage-warnings.md), for routing every warning code, not only this one.
- [Tolerance and the warning model](./spec-notes-tolerance.md) explains why a disagreement is a
  warning and not an error.
