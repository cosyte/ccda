---
id: cookbook
title: Cookbook
sidebar_position: 2
---

# Cookbook

Task-oriented recipes for the C-CDA jobs you actually get handed. Each one is: here's the problem,
here's the code, here's what you get back. Every symbol below is a real `@cosyte/ccda` export — no
pseudo-API. All sample XML is **synthetic** (an invented patient, obviously-fake OIDs); never paste a
real clinical document into a doc or a test.

Read [Getting started](./intro) first for the parse model; the recipes here assume you can already get
a parsed `CcdaDocument`.

---

## 1. Read the active problem list

**The problem:** you have a CCD and want the patient's **active** conditions with their coded values —
not the resolved or inactive ones.

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

// The resolved concern is still present — it is just not "active".
doc.getProblems().length; // => 2
doc.getProblems().map((c) => c.status); // => ["active", "resolved"]
```

---

## 2. Respect the code/narrative fail-safe

**The problem:** the structured code and the human-readable narrative can disagree — a real and
dangerous vendor defect. You must never silently trust one over the other.

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

// Both views are preserved — the parser picks no winner.
problem?.value?.displayName; // => "Essential hypertension"
problem?.narrative; // => "Type 2 diabetes mellitus"

const conflicted = doc.warnings.some((w) => w.code === WARNING_CODES.CODE_NARRATIVE_MISMATCH);
conflicted; // => true
// if (conflicted) routeToHumanReview(doc);
```

---

## 3. Triage warnings — the lenient, never-throw contract

**The problem:** you want to log or triage every tolerated deviation without your pipeline throwing on
a vendor quirk. `@cosyte/ccda` is liberal on input: only the seven Tier-3 structural/security errors
ever throw; everything else is a warning carrying a stable code and PHI-free position.

Every warning collects on `doc.warnings`; you can also stream them live via `onWarning`:

```ts runnable
import { parseCcda, WARNING_CODES, type CcdaWarning } from "@cosyte/ccda";

// A section with an unrecognized LOINC code — tolerated, retained as narrative-only.
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
    // w.code — a stable string from WARNING_CODES
    // w.message — bounded, PHI-free (never echoes names/ids/dates/narrative)
    // w.position — where in the document it occurred (element path, OID, LOINC)
  },
});

// Or read them after the fact:
doc.warnings.some((w) => w.code === WARNING_CODES.UNKNOWN_SECTION_CODE); // => true
streamed.length > 0; // => true

// Every message is safe to log — no PHI by construction.
doc.warnings.every((w) => typeof w.message === "string"); // => true
```

**Escalate when you want strictness.** Pass `{ strict: true }` to turn the first tolerated deviation
into a thrown `CcdaParseError` carrying the same code — a spec-conformance gate for a trusted sender.

---

## 4. Round-trip a document through the serializer

**The problem:** you parsed a document, and now need spec-clean XML back out — for storage, forwarding,
or a diff — with a guarantee that nothing was silently lost.

`serializeCcda(doc)` (or `doc.toString()`) re-emits the **parsed** document faithfully: every attribute,
namespace, `templateId`, and unmodeled element survives, and the result is a fixed point.

```ts runnable
import { parseCcda, serializeCcda } from "@cosyte/ccda";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0011"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-00042" assigningAuthorityName="Sample Hospital"/>
    <patient><name><given>Jane</given><family>Doe</family></name>
    <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/></patient>
  </patientRole></recordTarget>
</ClinicalDocument>`;

const doc = parseCcda(xml);
const out = serializeCcda(doc);

out === doc.toString(); // => true
// Re-parsing and re-serializing yields the identical bytes (a fixed point).
serializeCcda(parseCcda(out)) === out; // => true
```

> `serializeCcda` re-emits a **parsed** document. To construct one from scratch, use `buildCcda`
> (below). Editing an existing document, and section/document-type coverage beyond the builder's first
> slice, are a later increment — see [Troubleshooting](./troubleshooting#whats-not-yet-parsed).

---

## 5. Build a spec-clean CCD from scratch

**The problem:** you have structured clinical data (a patient, some problems, some allergies) and need
a valid C-CDA document to send — without hand-writing XML or memorizing templateIds.

`buildCcda(init)` is the emit _factory_ symmetric with `parseCcda`. It emits through the same DOM the
parser reads, so a built document round-trips by construction and a clean build carries zero warnings.

```ts runnable
import { buildCcda, serializeCcda, parseCcda } from "@cosyte/ccda";

const doc = buildCcda({
  patient: { mrn: "MRN-00042", given: ["Jane"], family: "Doe", gender: "F", birthTime: "19800101" },
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" }, status: "active" }],
  allergies: [
    { allergen: { code: "7980", displayName: "Penicillin G" }, reaction: { code: "247472004", displayName: "Hives" } },
    { noKnownAllergy: true }, // a negation, never an "unknown"
  ],
});

doc.getMrn(); // => "MRN-00042"
doc.getProblems().length; // => 1
doc.warnings.length; // => 0

// Round-trips by construction: re-parsing the emitted XML is a fixed point.
const out = serializeCcda(doc);
parseCcda(out).toString() === out; // => true
```

> First slice: `buildCcda` emits a CCD with the US Realm header + Problems + Allergies (the other CCD
> SHALL sections are emitted empty, `nullFlavor="NI"`). Richer sections, the other document types, and a
> bring-your-own-credentials terminology adapter are a later increment.
