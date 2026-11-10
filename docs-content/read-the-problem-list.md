---
id: read-the-problem-list
title: Read the active problem list
sidebar_label: Read the problem list
description: "Pull a patient's active conditions and their codes out of a CCD, leaving resolved and inactive problems aside."
---

# Read the active problem list

You have a CCD and want the patient's **active** conditions with their coded values, not the
resolved or inactive ones.

The concern act's `status` is the safety-relevant field: an inactive or resolved problem must never
read as active, so filter on it. The coded condition lives on each problem's `value` (SNOMED CT or
ICD-10-CM).

```ts runnable
import { parseCcda } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0008"/>
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
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
      <title>Problems</title>
      <text><content ID="p1">Essential hypertension</content><content ID="p2">Appendicitis</content></text>
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
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <statusCode code="completed"/>
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
          <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
          <value xsi:type="CD" code="74400008" codeSystem="2.16.840.1.113883.6.96" displayName="Appendicitis"/>
          <text><reference value="#p2"/></text>
        </observation></entryRelationship>
      </act></entry>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;

const doc = parseCcda(xml);

const active = doc.getProblems().filter((c) => c.status === "active");
active.length; // => 1
active[0]?.problems[0]?.value?.code; // => "59621000"

// The resolved concern is still present. It is just not "active".
doc.getProblems().length; // => 2
doc.getProblems().map((c) => c.status); // => ["active", "resolved"]
```

A concern whose act says `completed` reads back as `resolved`, as the last line shows: the concern
act's status is mapped to the problem's state, and the problem itself is still there to read.

## Reference

- [`parseCcda`](./api/README.md#parseccda) and [`CcdaDocument`](./api/README.md#ccdadocument), whose
  `getProblems()` returns the concerns.
- [`ProblemConcern`](./api/README.md#problemconcern): the concern's `status`, and the problems it
  holds, each with its coded `value`.

## Related

- [Handle a code that disagrees with its narrative](./handle-code-narrative-conflicts.md), for the
  case where a problem's code and its text say different things.
- [The clinical entry layer](./spec-notes-clinical.md) explains every distinction the entry
  accessors keep apart.
