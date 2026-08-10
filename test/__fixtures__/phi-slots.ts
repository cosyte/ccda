import type { DiagnosticSlot } from "@cosyte/test-utils";

import {
  parseCcda,
  FATAL_CODES,
  WARNING_CODES,
  type CcdaDocument,
  type CcdaSection,
  type II,
  type TerminologyAdapter,
} from "../../src/index.js";

/**
 * The PHI gate for `@cosyte/ccda`'s diagnostic surfaces, driven by the shared
 * `assertNoDiagnosticPhiLeak` runner from `@cosyte/test-utils`.
 *
 * **The slot table is the deliverable.** It names every position a *sender*
 * controls in a C-CDA document, not the ones that look like PHI: template OIDs,
 * section codes, code-system OIDs, `nullFlavor` tokens, `xsi:type` names, unit
 * strings, `moodCode`s, narrative anchors and `<reference>` targets, XML
 * element names and namespace prefixes. The previous guard
 * (`test/phi-guard.test.ts`) planted sentinels in patient name, MRN, narrative
 * and birthdate, and handed a **clean** value to every slot that actually
 * reached a message, so it could not fail. This one was run against the unfixed
 * parser first and was red on eleven slots.
 *
 * `expectCode` is declared per slot so the runner proves the marker reached the
 * branch it names. The slots carrying `null` are the ones whose value drives no
 * diagnostic at all, and each says why. No count is given for them on purpose:
 * this comment said "four" while there were seven, and a stale count is exactly
 * what a reader trusts. Derive it if you need it.
 */

/** Adapter that rejects any coding in the `9.9.*` arc, so a planted OID reaches the semantic tier. */
const terminology: TerminologyAdapter = {
  validateCode: (coding) =>
    coding.system !== undefined && coding.system.startsWith("9.9.") ? { result: false } : undefined,
};

const V3_ATTRS = `xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`;

/** A document type whose required-section (SHALL) table is empty: Progress Note. */
const QUIET_DOC_OID = "2.16.840.1.113883.10.20.22.1.9";

const LOINC = "2.16.840.1.113883.6.1";
const SNOMED = "2.16.840.1.113883.6.96";

/**
 * Assemble a `ClinicalDocument` around the given body parts. Everything not
 * named by a slot stays spec-clean, so a marker is the only deviation the
 * document carries beyond the one its slot needs.
 */
function doc(
  opts: {
    readonly rootName?: string;
    readonly docTemplateRoot?: string;
    readonly docTemplateExtension?: string;
    readonly docTemplateAuthority?: string;
    readonly docTemplateNullFlavor?: string;
    readonly patientIdRoot?: string;
    readonly patientIdExtension?: string;
    readonly assigningAuthority?: string;
    readonly genderNullFlavor?: string;
    readonly extraNamespace?: string;
    readonly sections?: string;
  } = {},
): string {
  const rootName = opts.rootName ?? "ClinicalDocument";
  const root = opts.docTemplateRoot ?? QUIET_DOC_OID;
  const ext = opts.docTemplateExtension ?? "2015-08-01";
  const tidExtras =
    (opts.docTemplateAuthority === undefined
      ? ""
      : ` assigningAuthorityName="${opts.docTemplateAuthority}"`) +
    (opts.docTemplateNullFlavor === undefined ? "" : ` nullFlavor="${opts.docTemplateNullFlavor}"`);
  const idRoot = opts.patientIdRoot ?? "2.16.840.1.113883.19.5";
  const idExt = opts.patientIdExtension ?? "MRN001";
  const authority =
    opts.assigningAuthority === undefined
      ? ""
      : ` assigningAuthorityName="${opts.assigningAuthority}"`;
  const gender =
    opts.genderNullFlavor === undefined
      ? `<administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>`
      : `<administrativeGenderCode nullFlavor="${opts.genderNullFlavor}"/>`;
  const foreign =
    opts.extraNamespace === undefined
      ? ""
      : `<${opts.extraNamespace}:note xmlns:${opts.extraNamespace}="urn:example:vendor"/>`;
  const sections = opts.sections ?? NARRATIVE_ONLY_SECTION;
  return `<?xml version="1.0" encoding="UTF-8"?>
<${rootName} ${V3_ATTRS}>
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="${root}" extension="${ext}"${tidExtras}/>
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC123"/>
  <code code="34133-9" codeSystem="${LOINC}"/>
  <title>Synthetic Test Document</title>
  <effectiveTime value="20240101120000-0500"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en-US"/>${foreign}
  <recordTarget>
    <patientRole>
      <id root="${idRoot}" extension="${idExt}"${authority}/>
      <patient>
        <name><given>Jane</given><family>Doe</family></name>
        ${gender}
        <birthTime value="19800101"/>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>${sections}
    </structuredBody>
  </component>
</${rootName}>`;
}

/** An unstructured document whose `nonXMLBody` carries the given `@mediaType`. */
function nonXmlBodyDoc(mediaType: string, nullFlavor?: string): string {
  const nf = nullFlavor === undefined ? "" : ` nullFlavor="${nullFlavor}"`;
  return doc()
    .replace("2.16.840.1.113883.10.20.22.1.9", "2.16.840.1.113883.10.20.22.1.10")
    .replace(
      /<component>\s*<structuredBody>[\s\S]*<\/structuredBody>\s*<\/component>/u,
      `<component><nonXMLBody><text mediaType="${mediaType}" representation="B64"${nf}>SGVsbG8=</text></nonXMLBody></component>`,
    );
}

/** A recognized, entry-free Problems section: the quiet baseline body. */
const NARRATIVE_ONLY_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
          <code code="11450-4" codeSystem="${LOINC}"/>
          <title>Problems</title>
          <text>No active problems.</text>
        </section>
      </component>`;

/** A Problems section wrapping one Problem Concern Act around the given observation body. */
function problemsSection(
  observationBody: string,
  narrative = `<content ID="p1">Hypertension</content>`,
): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
          <code code="11450-4" codeSystem="${LOINC}"/>
          <title>Problems</title>
          <text>${narrative}</text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
              <statusCode code="active"/>
              <effectiveTime><low value="20210101"/></effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
                  <code code="55607006" codeSystem="${SNOMED}"/>
                  <statusCode code="completed"/>
                  ${observationBody}
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>`;
}

/** A Results section wrapping one Result Observation around the given `<value>`. */
function resultsSection(valueXml: string): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"/>
          <code code="30954-2" codeSystem="${LOINC}"/>
          <title>Results</title>
          <text>Results.</text>
          <entry>
            <organizer classCode="BATTERY" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>
              <code code="24323-8" codeSystem="${LOINC}"/>
              <statusCode code="completed"/>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
                  <code code="2345-7" codeSystem="${LOINC}"/>
                  <statusCode code="completed"/>
                  <effectiveTime value="20240101"/>
                  ${valueXml}
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;
}

/** A Medications section carrying one Medication Activity with the given dose element. */
function medicationsSection(doseXml: string): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"/>
          <code code="10160-0" codeSystem="${LOINC}"/>
          <title>Medications</title>
          <text>Medications.</text>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <statusCode code="active"/>
              <effectiveTime xsi:type="IVL_TS"><low value="20210101"/></effectiveTime>
              <routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1"/>
              ${doseXml}
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
                  <manufacturedMaterial>
                    <code code="314076" codeSystem="2.16.840.1.113883.6.88"/>
                  </manufacturedMaterial>
                </manufacturedProduct>
              </consumable>
            </substanceAdministration>
          </entry>
        </section>
      </component>`;
}

/** A Procedures section carrying one Procedure Activity with the given `@moodCode`. */
function proceduresSection(moodCode: string): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.7.1" extension="2014-06-09"/>
          <code code="47519-4" codeSystem="${LOINC}"/>
          <title>Procedures</title>
          <text>Procedures.</text>
          <entry>
            <procedure classCode="PROC" moodCode="${moodCode}">
              <templateId root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"/>
              <code code="80146002" codeSystem="${SNOMED}"/>
              <statusCode code="completed"/>
              <effectiveTime value="20200101"/>
            </procedure>
          </entry>
        </section>
      </component>`;
}

/** A Social History section carrying one Smoking Status observation with the given `<value>`. */
function smokingSection(valueXml: string): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.17" extension="2015-08-01"/>
          <code code="29762-2" codeSystem="${LOINC}"/>
          <title>Social History</title>
          <text>Social history.</text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.78" extension="2014-06-09"/>
              <code code="72166-2" codeSystem="${LOINC}"/>
              <statusCode code="completed"/>
              <effectiveTime value="20240101"/>
              ${valueXml}
            </observation>
          </entry>
        </section>
      </component>`;
}

/** Every structural identifier on the parsed model: the fields that name a template, a
 * catalog section, a datatype or a media type. Values the model exists to carry (a patient
 * identifier's `@extension`, a clinical `@code`, a narrative string, a `PQ`'s raw text) are
 * deliberately absent: they are data, not a locator a downstream package would interpolate. */
function modelIdentifiers(parsed: CcdaDocument): readonly string[] {
  const out: string[] = [];
  // EVERY field, not the two that look like locators. The first cut of this swept
  // `root` and `extension` only, which is how the model kept carrying an unbounded
  // `assigningAuthorityName` while the suite reported green: the swept set and the
  // leaking set were disjoint, exactly the defect that made the guard this replaced
  // unable to fail.
  const pushIds = (ids: readonly II[]): void => {
    for (const id of ids) {
      if (id.root !== undefined) out.push(id.root);
      if (id.extension !== undefined) out.push(id.extension);
      if (id.assigningAuthorityName !== undefined) out.push(id.assigningAuthorityName);
      if (id.nullFlavor !== undefined) out.push(id.nullFlavor);
    }
  };
  pushIds(parsed.templateIds);
  const visit = (section: CcdaSection): void => {
    pushIds(section.templateIds);
    if (section.key !== undefined) out.push(section.key);
    if (section.recognizedBy !== undefined) out.push(section.recognizedBy);
    for (const sub of section.subsections) visit(sub);
  };
  for (const section of parsed.sections) visit(section);
  if (parsed.nonXmlBody !== undefined) {
    if (parsed.nonXmlBody.mediaType !== undefined) out.push(parsed.nonXmlBody.mediaType);
    if (parsed.nonXmlBody.representation !== undefined) out.push(parsed.nonXmlBody.representation);
    if (parsed.nonXmlBody.nullFlavor !== undefined) out.push(parsed.nonXmlBody.nullFlavor);
  }
  collectXsiTypes(parsed, out);
  return out;
}

/** Walk the clinical entry model for every `xsiType` an unsupported observation value kept. */
function collectXsiTypes(root: unknown, out: string[]): void {
  const seen = new Set<object>();
  const visit = (node: unknown, depth: number): void => {
    if (depth > 12 || typeof node !== "object" || node === null) return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "xsiType" && typeof value === "string") out.push(value);
      else visit(value, depth + 1);
    }
  };
  for (const key of [
    "problems",
    "results",
    "vitals",
    "functionalStatus",
    "mentalStatus",
    "familyHistory",
    "pastMedicalHistory",
    "allergies",
    "medications",
    "immunizations",
    "procedures",
    "encounters",
    "smokingStatus",
    "plannedItems",
  ] as const) {
    visit((root as Record<string, unknown>)[key], 0);
  }
}

export const PHI_RUNNER = {
  parse: (raw: string) => parseCcda(raw, { terminology, profile: null }),
  parseStrict: (raw: string) => parseCcda(raw, { terminology, profile: null, strict: true }),
  getDiagnostics: (parsed: CcdaDocument) => parsed.warnings,
  getModelIdentifiers: modelIdentifiers,
} as const;

export const PHI_SLOTS: readonly DiagnosticSlot<string>[] = [
  // ---- document identity -------------------------------------------------
  {
    name: "ClinicalDocument/templateId/@root",
    plant: (m) => doc({ docTemplateRoot: m }),
    expectCode: WARNING_CODES.UNKNOWN_DOCUMENT_TEMPLATE,
  },
  {
    name: "ClinicalDocument/templateId/@extension",
    plant: (m) => doc({ docTemplateExtension: m }),
    expectCode: WARNING_CODES.TEMPLATE_EXTENSION_ABSENT,
  },
  {
    name: "ClinicalDocument (root element local name)",
    plant: (m) => doc({ rootName: m }),
    expectCode: FATAL_CODES.NOT_A_CLINICAL_DOCUMENT,
  },
  {
    name: "ClinicalDocument (foreign namespace prefix)",
    plant: (m) => doc({ extraNamespace: m }),
    // A live probe since CCDA-DEAD-DIAGNOSTICS: the DOM walk in `secure-xml.ts`
    // emits UNKNOWN_NAMESPACE_PREFIX for the foreign element, so the marker
    // (planted as the prefix) now reaches the branch that reports it. It carried
    // `expectCode: null` while nothing in `src/` constructed the warning.
    expectCode: WARNING_CODES.UNKNOWN_NAMESPACE_PREFIX,
  },
  // ---- section identity --------------------------------------------------
  {
    name: "section/templateId/@root",
    plant: (m) =>
      `${doc({
        sections: `
      <component>
        <section>
          <templateId root="${m}"/>
          <code code="11450-4" codeSystem="${LOINC}"/>
          <title>Problems</title>
          <text>No active problems.</text>
        </section>
      </component>`,
      })}`,
    expectCode: WARNING_CODES.SECTION_MATCHED_BY_LOINC_FALLBACK,
  },
  {
    name: "section/code/@code",
    plant: (m) =>
      doc({
        sections: `
      <component>
        <section>
          <code code="${m}" codeSystem="${LOINC}"/>
          <title>Mystery</title>
          <text>Unknown content.</text>
        </section>
      </component>`,
      }),
    expectCode: WARNING_CODES.UNKNOWN_SECTION_CODE,
  },
  {
    name: "section/code/@codeSystem",
    plant: (m) =>
      doc({
        sections: `
      <component>
        <section>
          <code code="99999-9" codeSystem="${m}"/>
          <title>Mystery</title>
          <text>Unknown content.</text>
        </section>
      </component>`,
      }),
    expectCode: WARNING_CODES.UNKNOWN_SECTION_CODE,
  },
  // ---- HL7 v3 datatype attributes ---------------------------------------
  {
    name: "*/@nullFlavor",
    plant: (m) => doc({ genderNullFlavor: m }),
    expectCode: WARNING_CODES.INVALID_NULL_FLAVOR,
  },
  {
    name: "doseQuantity/@nullFlavor beside a value",
    plant: (m) =>
      doc({
        sections: medicationsSection(`<doseQuantity nullFlavor="${m}" value="10" unit="mg"/>`),
      }),
    expectCode: WARNING_CODES.CONTRADICTORY_NULL_FLAVOR,
  },
  {
    name: "observation/@nullFlavor beside negationInd",
    plant: (m) =>
      doc({
        sections: `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
          <code code="48765-2" codeSystem="${LOINC}"/>
          <title>Allergies</title>
          <text>Allergies.</text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="2015-08-01"/>
              <statusCode code="active"/>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN" negationInd="true" nullFlavor="${m}">
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="416098002" codeSystem="${SNOMED}"/>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>`,
      }),
    expectCode: WARNING_CODES.NEGATION_VS_NULLFLAVOR_AMBIGUOUS,
  },
  {
    name: "observation/value/@xsi:type",
    plant: (m) => doc({ sections: resultsSection(`<value xsi:type="${m}" value="4.9"/>`) }),
    expectCode: WARNING_CODES.RESULT_VALUE_TYPE_UNHANDLED,
  },
  {
    name: "PQ/@unit",
    plant: (m) =>
      doc({ sections: resultsSection(`<value xsi:type="PQ" value="4.9" unit="${m}"/>`) }),
    expectCode: WARNING_CODES.NON_UCUM_UNIT,
  },
  {
    name: "effectiveTime/@value",
    plant: (m) =>
      doc({
        sections: resultsSection(
          `<value xsi:type="PQ" value="4.9" unit="mg/dL"/></observation></component><component><observation classCode="OBS" moodCode="EVN"><templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/><code code="2345-7" codeSystem="${LOINC}"/><statusCode code="completed"/><effectiveTime value="${m}"/><value xsi:type="PQ" value="1" unit="mg/dL"/>`,
        ),
      }),
    expectCode: WARNING_CODES.MALFORMED_DATETIME,
  },
  // ---- coded slots -------------------------------------------------------
  {
    name: "value/@codeSystem at a bound CodeSlot",
    plant: (m) =>
      doc({
        sections: problemsSection(`<value xsi:type="CD" code="59621000" codeSystem="${m}"/>`),
      }),
    expectCode: WARNING_CODES.UNEXPECTED_CODE_SYSTEM,
  },
  {
    name: "value/@code at a bound CodeSlot (no @codeSystem)",
    plant: (m) => doc({ sections: problemsSection(`<value xsi:type="CD" code="${m}"/>`) }),
    expectCode: WARNING_CODES.MISSING_CODE_SYSTEM,
  },
  {
    name: "value/@codeSystem with no @code and no @nullFlavor",
    plant: (m) => doc({ sections: problemsSection(`<value xsi:type="CD" codeSystem="${m}"/>`) }),
    expectCode: WARNING_CODES.MISSING_CODE_VALUE,
  },
  {
    name: "value/@codeSystem reaching a TerminologyAdapter",
    plant: (m) =>
      doc({
        sections: problemsSection(`<value xsi:type="CD" code="59621000" codeSystem="9.9.${m}"/>`),
      }),
    expectCode: WARNING_CODES.SEMANTIC_CODE_INVALID,
  },
  {
    name: "value/@displayName contradicting the narrative",
    plant: (m) =>
      doc({
        sections: problemsSection(
          `<value xsi:type="CD" code="59621000" codeSystem="${SNOMED}" displayName="${m}"/><text><reference value="#p1"/></text>`,
        ),
      }),
    expectCode: WARNING_CODES.CODE_NARRATIVE_MISMATCH,
  },
  {
    name: "procedure/@moodCode",
    plant: (m) => doc({ sections: proceduresSection(m) }),
    expectCode: WARNING_CODES.PROCEDURE_MOOD_UNEXPECTED,
  },
  {
    name: "smoking status value/@code",
    plant: (m) =>
      doc({
        sections: smokingSection(`<value xsi:type="CD" code="${m}" codeSystem="${SNOMED}"/>`),
      }),
    expectCode: WARNING_CODES.SMOKING_STATUS_CODE_UNRECOGNIZED,
  },
  // ---- narrative linkage -------------------------------------------------
  {
    name: "entry//text/reference/@value",
    plant: (m) =>
      doc({
        sections: problemsSection(
          `<value xsi:type="CD" code="59621000" codeSystem="${SNOMED}"/><text><reference value="#${m}"/></text>`,
        ),
      }),
    expectCode: WARNING_CODES.NARRATIVE_REFERENCE_BROKEN,
  },
  {
    name: "section/text//@ID (narrative anchor)",
    plant: (m) =>
      doc({
        sections: problemsSection(
          `<value xsi:type="CD" code="59621000" codeSystem="${SNOMED}"/><text><reference value="#absent"/></text>`,
          `<content ID="${m}">Hypertension</content>`,
        ),
      }),
    expectCode: WARNING_CODES.NARRATIVE_REFERENCE_BROKEN,
  },
  // ---- identifier slots the model exists to carry -------------------------
  // These drive no diagnostic: they are patient data the model reports in full and
  // must never be echoed onto a warning. `expectCode` is `null` because there is no
  // branch the value itself reaches, not because the reach is unknown.
  {
    name: "patientRole/id/@extension (MRN)",
    plant: (m) => doc({ patientIdExtension: m }),
    expectCode: null,
  },
  {
    name: "patientRole/id/@root (assigning authority OID)",
    plant: (m) => doc({ patientIdRoot: m }),
    expectCode: null,
  },
  {
    name: "patientRole/id/@assigningAuthorityName",
    plant: (m) => doc({ assigningAuthority: m }),
    expectCode: null,
  },
  {
    name: "nonXMLBody/text/@mediaType",
    // The unstructured-document body. `mediaType` and `representation` describe the
    // shape of the content rather than being it, so they are locators on the model
    // and are swept; neither drives a diagnostic.
    //
    // **The marker is planted as `text/<marker>`, not bare**, and that matters: the
    // shared marker carries no `/`, so a bare plant only ever probes the branch that
    // rejects on a missing separator. It left a `type/subtype` shape test looking
    // proven while `text/Doe-Jane-1980.01.01-MRN0012345` sailed through it.
    plant: (m) => nonXmlBodyDoc(`text/${m}`),
    expectCode: null,
  },
  {
    name: "nonXMLBody/text/@nullFlavor",
    plant: (m) => nonXmlBodyDoc("application/pdf", m),
    expectCode: WARNING_CODES.INVALID_NULL_FLAVOR,
  },
  {
    name: "ClinicalDocument/templateId/@assigningAuthorityName",
    // Meaningless on a templateId, and free text with no shape at all, which is why
    // it survived the first cut of the bound: it does not look like a locator, but it
    // rides on the element the model presents as one.
    plant: (m) => doc({ docTemplateAuthority: m }),
    expectCode: null,
  },
  {
    name: "ClinicalDocument/templateId/@nullFlavor",
    plant: (m) => doc({ docTemplateNullFlavor: m }),
    expectCode: null,
  },
];
