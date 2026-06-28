/**
 * Synthetic, PHI-free C-CDA fixtures for `@cosyte/ccda` tests. Every value here
 * is invented (the canonical synthetic patient "Jane Doe", fake OIDs/IDs) — no
 * realistic PHI ever lands in a fixture, per the repo's PHI-by-default rule.
 *
 * `buildCcda` assembles a minimal-but-valid US Realm `ClinicalDocument` from
 * options so individual tests can flip one signal (document templateId, R2.1
 * stamp, record-target count, section shape) without hand-writing XML.
 */

const V3 = "urn:hl7-org:v3";
const R21 = "2015-08-01";

/** Document-template OID prefix shared by every C-CDA R2.1 document type. */
const DOC_OID = "2.16.840.1.113883.10.20.22.1";

/** The twelve recognized document types keyed to their template OID + machine key. */
export const DOC_TYPES: ReadonlyArray<{ readonly key: string; readonly oid: string }> = [
  { key: "ccd", oid: `${DOC_OID}.2` },
  { key: "dischargeSummary", oid: `${DOC_OID}.8` },
  { key: "referralNote", oid: `${DOC_OID}.14` },
  { key: "consultationNote", oid: `${DOC_OID}.4` },
  { key: "historyAndPhysical", oid: `${DOC_OID}.3` },
  { key: "progressNote", oid: `${DOC_OID}.9` },
  { key: "procedureNote", oid: `${DOC_OID}.6` },
  { key: "operativeNote", oid: `${DOC_OID}.7` },
  { key: "carePlan", oid: `${DOC_OID}.15` },
  { key: "diagnosticImagingReport", oid: `${DOC_OID}.5` },
  { key: "unstructuredDocument", oid: `${DOC_OID}.10` },
  { key: "transferSummary", oid: `${DOC_OID}.13` },
];

/** A single allergies section (recognized by templateId root) as a `<component>`. */
export const ALLERGIES_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.6.1"/>
          <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Allergies</title>
          <text>No known allergies. <content ID="a1">penicillin note</content></text>
          <component>
            <section>
              <templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>
              <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
              <title>Problems</title>
              <text>No active problems.</text>
            </section>
          </component>
        </section>
      </component>`;

/**
 * A Problems section (`…22.2.5.1`) carrying one Problem Concern Act
 * (`…22.4.3`) → Problem Observation (`…22.4.4`). The coded problem is SNOMED CT
 * "Essential hypertension"; the narrative agrees, the concern is `active`.
 */
export const PROBLEMS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Problems</title>
          <text><content ID="prob1">Essential hypertension</content></text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.2" extension="prob-act-1"/>
              <statusCode code="active"/>
              <effectiveTime><low value="20210101"/></effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5.99999.2" extension="prob-obs-1"/>
                  <code code="55607006" codeSystem="2.16.840.1.113883.6.96" displayName="Problem"/>
                  <statusCode code="completed"/>
                  <effectiveTime><low value="20210101"/></effectiveTime>
                  <value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96" displayName="Essential hypertension"/>
                  <text><reference value="#prob1"/></text>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>`;

/**
 * A Medications section (`…22.2.1.1`) carrying one Medication Activity
 * (`…22.4.16`): RxNorm Lisinopril via `manufacturedMaterial/code`, a scalar
 * `doseQuantity`, an NCI `routeCode`, and the two `effectiveTime` siblings —
 * `IVL_TS` duration + `PIVL_TS` frequency.
 */
export const MEDICATIONS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2015-08-01"/>
          <code code="10160-0" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Medications</title>
          <text><content ID="med1">Lisinopril 10 MG Oral Tablet</content></text>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.3" extension="med-1"/>
              <statusCode code="active"/>
              <effectiveTime xsi:type="IVL_TS"><low value="20210101"/><high value="20211231"/></effectiveTime>
              <effectiveTime xsi:type="PIVL_TS" institutionSpecified="true" operator="A">
                <period value="24" unit="h"/>
              </effectiveTime>
              <routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Oral"/>
              <doseQuantity value="10" unit="mg"/>
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
                  <manufacturedMaterial>
                    <code code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"/>
                  </manufacturedMaterial>
                </manufacturedProduct>
              </consumable>
              <text><reference value="#med1"/></text>
            </substanceAdministration>
          </entry>
        </section>
      </component>`;

/**
 * An Allergies section (`…22.2.6.1`) carrying one Allergy Concern Act
 * (`…22.4.30`) → Allergy-Intolerance Observation (`…22.4.7`): an RxNorm
 * allergen at `participant/.../playingEntity/code`, a Reaction (`…22.4.9`) with
 * a nested Severity (`…22.4.8`), and a propensity Criticality (`…22.4.145`).
 */
export const ALLERGY_ENTRY_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
          <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Allergies</title>
          <text><content ID="alg1">Penicillin G</content></text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.4" extension="alg-act-1"/>
              <statusCode code="active"/>
              <effectiveTime><low value="20200101"/></effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <id root="2.16.840.1.113883.19.5.99999.4" extension="alg-obs-1"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="416098002" codeSystem="2.16.840.1.113883.6.96" displayName="Drug allergy"/>
                  <participant typeCode="CSM">
                    <participantRole classCode="MANU">
                      <playingEntity classCode="MMAT">
                        <code code="7980" codeSystem="2.16.840.1.113883.6.88" displayName="Penicillin G"/>
                      </playingEntity>
                    </participantRole>
                  </participant>
                  <entryRelationship typeCode="MFST" inversionInd="true">
                    <observation classCode="OBS" moodCode="EVN">
                      <templateId root="2.16.840.1.113883.10.20.22.4.9" extension="2014-06-09"/>
                      <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                      <statusCode code="completed"/>
                      <value xsi:type="CD" code="247472004" codeSystem="2.16.840.1.113883.6.96" displayName="Hives"/>
                      <entryRelationship typeCode="SUBJ" inversionInd="true">
                        <observation classCode="OBS" moodCode="EVN">
                          <templateId root="2.16.840.1.113883.10.20.22.4.8" extension="2014-06-09"/>
                          <code code="SEV" codeSystem="2.16.840.1.113883.5.4"/>
                          <statusCode code="completed"/>
                          <value xsi:type="CD" code="6736007" codeSystem="2.16.840.1.113883.6.96" displayName="Moderate"/>
                        </observation>
                      </entryRelationship>
                    </observation>
                  </entryRelationship>
                  <entryRelationship typeCode="SUBJ" inversionInd="true">
                    <observation classCode="OBS" moodCode="EVN">
                      <templateId root="2.16.840.1.113883.10.20.22.4.145"/>
                      <code code="82606-5" codeSystem="2.16.840.1.113883.6.1"/>
                      <statusCode code="completed"/>
                      <value xsi:type="CD" code="CRITH" codeSystem="2.16.840.1.113883.5.1063" displayName="High criticality"/>
                    </observation>
                  </entryRelationship>
                  <text><reference value="#alg1"/></text>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>`;

/**
 * An Allergies section asserting **No Known Allergies** — the Allergy-
 * Intolerance Observation carries `negationInd="true"` (and no `nullFlavor`),
 * the safety-critical "negated, not unknown" form.
 */
export const NKA_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
          <code code="48765-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Allergies</title>
          <text>No known allergies.</text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.5" extension="nka-act-1"/>
              <statusCode code="active"/>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN" negationInd="true">
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <id root="2.16.840.1.113883.19.5.99999.5" extension="nka-obs-1"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="419199007" codeSystem="2.16.840.1.113883.6.96" displayName="Allergy to substance"/>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>`;

/** All three triad sections concatenated, for the end-to-end extraction test. */
export const TRIAD_SECTIONS = `${PROBLEMS_SECTION}${MEDICATIONS_SECTION}${ALLERGY_ENTRY_SECTION}`;

/** A problems section recognized only by LOINC code (no recognized templateId). */
export const LOINC_ONLY_SECTION = `
      <component>
        <section>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Problems</title>
          <text>Hypertension.</text>
        </section>
      </component>`;

/** A section with an unrecognized LOINC code (and no recognized templateId). */
export const UNKNOWN_SECTION = `
      <component>
        <section>
          <code code="99999-9" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Mystery</title>
          <text>Unknown content.</text>
        </section>
      </component>`;

interface BuildOptions {
  readonly docTypeOid?: string | undefined;
  readonly extension?: string | undefined;
  readonly includeDocTemplate?: boolean;
  readonly includeHeaderTemplate?: boolean;
  readonly recordTargets?: number;
  readonly birthTime?: string;
  readonly genderNullFlavor?: string;
  readonly mrnExtension?: string | undefined;
  readonly mrnAssigningAuthority?: boolean;
  readonly sections?: string;
  readonly nonXmlBody?: boolean;
  readonly withBom?: boolean;
  readonly xmlDecl?: boolean;
}

/** Build one `recordTarget/patientRole` block. */
function recordTarget(opts: BuildOptions): string {
  const idAttrs = [`root="2.16.840.1.113883.19.5"`];
  if (opts.mrnExtension !== undefined) idAttrs.push(`extension="${opts.mrnExtension}"`);
  if (opts.mrnAssigningAuthority === true) idAttrs.push(`assigningAuthorityName="Test Hospital"`);
  const gender =
    opts.genderNullFlavor !== undefined
      ? `<administrativeGenderCode nullFlavor="${opts.genderNullFlavor}"/>`
      : `<administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1" displayName="Female"/>`;
  return `
  <recordTarget>
    <patientRole>
      <id ${idAttrs.join(" ")}/>
      <patient>
        <name><prefix>Ms</prefix><given>Jane</given><given>Q</given><family>Doe</family><suffix>Jr</suffix></name>
        ${gender}
        <birthTime value="${opts.birthTime ?? "19800101"}"/>
        <maritalStatusCode code="M" codeSystem="2.16.840.1.113883.5.2"/>
        <raceCode code="2106-3" codeSystem="2.16.840.1.113883.6.238"/>
        <ethnicGroupCode code="2186-5" codeSystem="2.16.840.1.113883.6.238"/>
      </patient>
    </patientRole>
  </recordTarget>`;
}

/**
 * Assemble a synthetic US Realm `ClinicalDocument`. Defaults produce a clean,
 * recognized R2.1 CCD with one record target, one MRN, and an allergies
 * section. Override any option to exercise a specific parse path.
 */
export function buildCcda(opts: BuildOptions = {}): string {
  const {
    docTypeOid = `${DOC_OID}.2`,
    includeDocTemplate = true,
    includeHeaderTemplate = true,
    recordTargets = 1,
    sections = ALLERGIES_SECTION,
    nonXmlBody = false,
    withBom = false,
    xmlDecl = true,
  } = opts;
  // `in` checks so an explicit `undefined` (omit the value) is distinct from an
  // absent key (use the default) — destructuring defaults can't tell them apart.
  const extension = "extension" in opts ? opts.extension : R21;
  const mrnExtension = "mrnExtension" in opts ? opts.mrnExtension : "MRN001";

  const templateIds: string[] = [];
  if (includeHeaderTemplate) {
    templateIds.push(`<templateId root="${DOC_OID}.1" extension="${R21}"/>`);
  }
  if (includeDocTemplate && docTypeOid !== undefined) {
    const ext = extension === undefined ? "" : ` extension="${extension}"`;
    templateIds.push(`<templateId root="${docTypeOid}"${ext}/>`);
  }

  const targets = Array.from({ length: recordTargets }, () =>
    recordTarget({ ...opts, mrnExtension }),
  ).join("");

  const body = nonXmlBody
    ? `
  <component>
    <nonXMLBody>
      <text mediaType="text/plain" representation="B64">SGVsbG8gV29ybGQ=</text>
    </nonXMLBody>
  </component>`
    : `
  <component>
    <structuredBody>${sections}
    </structuredBody>
  </component>`;

  const decl = xmlDecl ? `<?xml version="1.0" encoding="UTF-8"?>\n` : "";
  const bom = withBom ? "﻿" : "";

  return `${bom}${decl}<ClinicalDocument xmlns="${V3}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  ${templateIds.join("\n  ")}
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC123"/>
  <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" displayName="Summarization of Episode Note"/>
  <title>Synthetic Test Document</title>
  <effectiveTime value="20240101120000-0500"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en-US"/>${targets}${body}
</ClinicalDocument>`;
}
