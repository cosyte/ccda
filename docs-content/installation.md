---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

`@cosyte/ccda` is a TypeScript C-CDA toolkit for Node.js. It ships dual **ESM + CJS** builds with
per-condition type declarations, so it works from either module system without configuration, and it
has a **single** exact-pinned runtime dependency — the hardened W3C-DOM substrate `@xmldom/xmldom`
(ratified by an ADR for C-CDA's XML; C-CDA is XML, so a DOM is unavoidable).

> **Status:** pre-alpha (`0.0.x`), not yet published to npm. The command below is the shape it will
> take at first publish; until then, consume it from source or a workspace link.

## Prerequisites

- **Node.js >= 22.** The whole `@cosyte/*` suite targets ES2023 / Node 22+.
- A package manager — `pnpm`, `npm`, or `yarn`.
- **One runtime dependency.** `@xmldom/xmldom` (exact-pinned) is the only runtime dep; the parser
  caps itself at **≤ 3** justified deps and adds none without an ADR. There is no native build and no
  post-install script.

## Install

```bash
npm install @cosyte/ccda
```

## Smoke test

Confirm the package resolves and a real entry point is callable — parse the smallest valid US Realm
`ClinicalDocument` and read its recognized document type back:

```ts runnable
import { parseCcda } from "@cosyte/ccda";

// Synthetic header-only CCD — invented patient, fake OIDs. No real PHI.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC-0003"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1"/>
  <title>Synthetic CCD</title>
  <effectiveTime value="20240101"/>
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN-0001" assigningAuthorityName="Sample Hospital"/>
    <patient>
      <name><given>Jane</given><family>Doe</family></name>
      <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>
    </patient>
  </patientRole></recordTarget>
</ClinicalDocument>`;

const doc = parseCcda(xml);

doc.documentType; // => "ccd"
doc.header.title; // => "Synthetic CCD"
doc.getPatient()?.name?.family; // => "Doe"
Array.isArray(doc.warnings); // => true
```

If that resolves and returns, the install is good — head to the [Quickstart](./quickstart).

## Module systems

`@cosyte/ccda` is `"type": "module"` and exposes both conditions, so both of these resolve to the
right build without extra configuration:

```ts
// ESM / TypeScript
import { parseCcda, serializeCcda } from "@cosyte/ccda";
```

```js
// CommonJS
const { parseCcda, serializeCcda } = require("@cosyte/ccda");
```

The single top-level entry point (`@cosyte/ccda`) publishes per-condition types (`.d.ts` for `import`,
`.d.cts` for `require`), gated by `attw` on every release. Editor IntelliSense matches the build you
actually load.

## PHI discipline

Every example in this documentation uses **synthetic** fixtures — an invented patient, obviously-fake
OIDs and MRNs. Do the same in your own tests: a C-CDA document is a clinical record, and a real one
committed to a repository is a PHI leak the moment it publishes. The parser helps: every warning and
error message is **PHI-free by construction** — it carries only structural locators (element names,
OIDs, LOINC codes, positions), never a patient name, an identifier, or narrative text. See
[Troubleshooting](./troubleshooting) for the redaction posture.
