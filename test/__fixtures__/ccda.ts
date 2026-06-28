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

/**
 * A document-type OID whose required-section (SHALL) table is empty (Progress
 * Note). Use it when a test asserts *clean extraction* (zero warnings) for a
 * single section, so the per-document-type required-section validation does not
 * add unrelated `REQUIRED_SECTION_MISSING` noise.
 */
export const NO_REQUIRED_SECTIONS_DOC_OID = `${DOC_OID}.9`;

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

/**
 * A Results section (`…22.2.3.1`) carrying one Result Organizer (`…22.4.1`) →
 * Result Observation (`…22.4.2`): LOINC Hemoglobin with a `PQ` value in `g/dL`
 * (valid UCUM), a structured `IVL_PQ` reference range, and a `N` interpretation.
 */
export const RESULTS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"/>
          <code code="30954-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Results</title>
          <text><content ID="res1">Hemoglobin 13.5 g/dL</content></text>
          <entry>
            <organizer classCode="BATTERY" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.6" extension="res-org-1"/>
              <code code="58410-2" codeSystem="2.16.840.1.113883.6.1" displayName="CBC panel"/>
              <statusCode code="completed"/>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5.99999.6" extension="res-obs-1"/>
                  <code code="718-7" codeSystem="2.16.840.1.113883.6.1" displayName="Hemoglobin"/>
                  <statusCode code="completed"/>
                  <effectiveTime value="20240101"/>
                  <value xsi:type="PQ" value="13.5" unit="g/dL"/>
                  <interpretationCode code="N" codeSystem="2.16.840.1.113883.5.83"/>
                  <referenceRange>
                    <observationRange>
                      <value xsi:type="IVL_PQ">
                        <low value="12" unit="g/dL"/>
                        <high value="16" unit="g/dL"/>
                      </value>
                    </observationRange>
                  </referenceRange>
                  <text><reference value="#res1"/></text>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;

/**
 * A Vital Signs section (`…22.2.4.1`) carrying one Vital Signs Organizer
 * (`…22.4.26`) → Vital Sign Observation (`…22.4.27`): LOINC systolic BP with a
 * `PQ` value in `mm[Hg]` (valid UCUM) and an effective time.
 */
export const VITALS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.4.1" extension="2015-08-01"/>
          <code code="8716-3" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Vital Signs</title>
          <text><content ID="vit1">Systolic BP 120 mm[Hg]</content></text>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.26" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.7" extension="vit-org-1"/>
              <statusCode code="completed"/>
              <effectiveTime value="20240101"/>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.27" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5.99999.7" extension="vit-obs-1"/>
                  <code code="8480-6" codeSystem="2.16.840.1.113883.6.1" displayName="Systolic blood pressure"/>
                  <statusCode code="completed"/>
                  <effectiveTime value="20240101"/>
                  <value xsi:type="PQ" value="120" unit="mm[Hg]"/>
                  <text><reference value="#vit1"/></text>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;

/**
 * An Immunizations section (`…22.2.2.1`) carrying one Immunization Activity
 * (`…22.4.52`): a CVX vaccine via `manufacturedMaterial/code`, a `doseQuantity`,
 * an NCI `routeCode`, and an administration date.
 */
export const IMMUNIZATIONS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.2.1" extension="2015-08-01"/>
          <code code="11369-6" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Immunizations</title>
          <text><content ID="imm1">Influenza, seasonal, injectable</content></text>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.52" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.8" extension="imm-1"/>
              <statusCode code="completed"/>
              <effectiveTime value="20240101"/>
              <routeCode code="C28161" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Intramuscular"/>
              <doseQuantity value="0.5" unit="mL"/>
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <templateId root="2.16.840.1.113883.10.20.22.4.54" extension="2014-06-09"/>
                  <manufacturedMaterial>
                    <code code="140" codeSystem="2.16.840.1.113883.12.292" displayName="Influenza, seasonal, injectable"/>
                  </manufacturedMaterial>
                </manufacturedProduct>
              </consumable>
              <text><reference value="#imm1"/></text>
            </substanceAdministration>
          </entry>
        </section>
      </component>`;

/**
 * A Procedures section (`…22.2.7.1`) carrying one performed Procedure Activity
 * Procedure (`…22.4.14`, `moodCode="EVN"`): a SNOMED CT appendectomy `code`,
 * `completed` status, and an effective time. The narrative agrees.
 */
export const PROCEDURES_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.7.1" extension="2014-06-09"/>
          <code code="47519-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Procedures</title>
          <text><content ID="proc1">Appendectomy</content></text>
          <entry>
            <procedure classCode="PROC" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.9" extension="proc-1"/>
              <code code="80146002" codeSystem="2.16.840.1.113883.6.96" displayName="Appendectomy"/>
              <statusCode code="completed"/>
              <effectiveTime value="20230615"/>
              <text><reference value="#proc1"/></text>
            </procedure>
          </entry>
        </section>
      </component>`;

/**
 * A Procedures section carrying one *planned* Procedure Activity Procedure
 * (`moodCode="INT"`) — exercises the planned-vs-performed disposition split so a
 * planned procedure is never read as performed.
 */
export const PLANNED_PROCEDURE_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.7.1" extension="2014-06-09"/>
          <code code="47519-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Procedures</title>
          <text><content ID="proc2">Planned colonoscopy</content></text>
          <entry>
            <procedure classCode="PROC" moodCode="INT">
              <templateId root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.9" extension="proc-2"/>
              <code code="73761001" codeSystem="2.16.840.1.113883.6.96" displayName="Colonoscopy"/>
              <statusCode code="active"/>
              <effectiveTime value="20240701"/>
              <text><reference value="#proc2"/></text>
            </procedure>
          </entry>
        </section>
      </component>`;

/**
 * An Encounters section (`…22.2.22.1`) carrying one Encounter Activity
 * (`…22.4.49`): an ambulatory-visit `code` (HL7 ActEncounterCode), `completed`
 * status, and a visit-period `effectiveTime`.
 */
export const ENCOUNTERS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.22.1" extension="2015-08-01"/>
          <code code="46240-8" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Encounters</title>
          <text><content ID="enc1">Office outpatient visit</content></text>
          <entry>
            <encounter classCode="ENC" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.49" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.10" extension="enc-1"/>
              <code code="99213" codeSystem="2.16.840.1.113883.6.12" displayName="Office outpatient visit 15 minutes"/>
              <statusCode code="completed"/>
              <effectiveTime><low value="20230615"/><high value="20230615"/></effectiveTime>
              <text><reference value="#enc1"/></text>
            </encounter>
          </entry>
        </section>
      </component>`;

/**
 * A Social History section (`…22.2.17`) carrying one Smoking Status — Meaningful
 * Use observation (`…22.4.78`): LOINC `72166-2` `code`, a SNOMED CT "Former
 * smoker" `value` from the Current Smoking Status value set, and an effective
 * time.
 */
export const SOCIAL_HISTORY_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.17"/>
          <code code="29762-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Social History</title>
          <text><content ID="smk1">Former smoker</content></text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.78" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.11" extension="smk-1"/>
              <code code="72166-2" codeSystem="2.16.840.1.113883.6.1" displayName="Tobacco smoking status"/>
              <statusCode code="completed"/>
              <effectiveTime value="20230615"/>
              <value xsi:type="CD" code="8517006" codeSystem="2.16.840.1.113883.6.96" displayName="Former smoker"/>
              <text><reference value="#smk1"/></text>
            </observation>
          </entry>
        </section>
      </component>`;

/**
 * A Social History section asserting an **explicitly unknown** smoking status —
 * the value is the SNOMED CT "Unknown if ever smoked" concept (`266927001`),
 * the safety-critical "unknown, not never-smoked" form.
 */
export const SMOKING_UNKNOWN_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.17"/>
          <code code="29762-2" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Social History</title>
          <text>Smoking status unknown.</text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.78" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.11" extension="smk-2"/>
              <code code="72166-2" codeSystem="2.16.840.1.113883.6.1" displayName="Tobacco smoking status"/>
              <statusCode code="completed"/>
              <value xsi:type="CD" code="266927001" codeSystem="2.16.840.1.113883.6.96" displayName="Unknown if ever smoked"/>
            </observation>
          </entry>
        </section>
      </component>`;

/**
 * A Plan of Treatment section (`…22.2.10`, LOINC `18776-5`) carrying one of each
 * planned-entry template — Planned Observation (`…4.44`, `RQO`), Planned Act
 * (`…4.39`, `INT`), Planned Encounter (`…4.40`, `APT`), Planned Procedure
 * (`…4.41`, `INT`), Planned Medication Activity (`…4.42`, `INT`, drug in the
 * consumable), and Planned Supply (`…4.43`, `INT`). Every item is future/ordered,
 * never performed.
 */
export const PLAN_OF_TREATMENT_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.10" extension="2014-06-09"/>
          <code code="18776-5" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Plan of Treatment</title>
          <text><content ID="plan1">Order CBC</content></text>
          <entry>
            <observation classCode="OBS" moodCode="RQO">
              <templateId root="2.16.840.1.113883.10.20.22.4.44" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.20" extension="plan-obs-1"/>
              <code code="58410-2" codeSystem="2.16.840.1.113883.6.1" displayName="CBC panel"/>
              <statusCode code="active"/>
              <effectiveTime value="20240801"/>
              <text><reference value="#plan1"/></text>
            </observation>
          </entry>
          <entry>
            <act classCode="ACT" moodCode="INT">
              <templateId root="2.16.840.1.113883.10.20.22.4.39" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.20" extension="plan-act-1"/>
              <code code="409073007" codeSystem="2.16.840.1.113883.6.96" displayName="Education"/>
              <statusCode code="active"/>
            </act>
          </entry>
          <entry>
            <encounter classCode="ENC" moodCode="APT">
              <templateId root="2.16.840.1.113883.10.20.22.4.40" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.20" extension="plan-enc-1"/>
              <code code="99213" codeSystem="2.16.840.1.113883.6.12" displayName="Office visit"/>
              <statusCode code="active"/>
            </encounter>
          </entry>
          <entry>
            <procedure classCode="PROC" moodCode="INT">
              <templateId root="2.16.840.1.113883.10.20.22.4.41" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.20" extension="plan-proc-1"/>
              <code code="73761001" codeSystem="2.16.840.1.113883.6.96" displayName="Colonoscopy"/>
              <statusCode code="active"/>
            </procedure>
          </entry>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="INT">
              <templateId root="2.16.840.1.113883.10.20.22.4.42" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.20" extension="plan-med-1"/>
              <statusCode code="active"/>
              <consumable>
                <manufacturedProduct>
                  <manufacturedMaterial>
                    <code code="314076" codeSystem="2.16.840.1.113883.6.88" displayName="Lisinopril 10 MG Oral Tablet"/>
                  </manufacturedMaterial>
                </manufacturedProduct>
              </consumable>
            </substanceAdministration>
          </entry>
          <entry>
            <supply classCode="SPLY" moodCode="INT">
              <templateId root="2.16.840.1.113883.10.20.22.4.43" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.20" extension="plan-sup-1"/>
              <code code="58938008" codeSystem="2.16.840.1.113883.6.96" displayName="Wheelchair"/>
              <statusCode code="active"/>
            </supply>
          </entry>
        </section>
      </component>`;

/**
 * A Functional Status section (`…22.2.14`, LOINC `47420-5`) carrying a Functional
 * Status Organizer (`…4.66`) whose components are a Functional Status Observation
 * (`…4.67`) and an Assessment Scale Observation (`…4.69`), plus a standalone
 * Functional Status Observation directly under a second `<entry>`.
 */
export const FUNCTIONAL_STATUS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.14"/>
          <code code="47420-5" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Functional Status</title>
          <text><content ID="func1">Ambulation</content></text>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.66" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.21" extension="func-org-1"/>
              <statusCode code="completed"/>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.67" extension="2014-06-09"/>
                  <id root="2.16.840.1.113883.19.5.99999.21" extension="func-obs-1"/>
                  <code code="54522-8" codeSystem="2.16.840.1.113883.6.1" displayName="Functional status"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="165245003" codeSystem="2.16.840.1.113883.6.96" displayName="Able to walk"/>
                  <text><reference value="#func1"/></text>
                </observation>
              </component>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.69" extension="2014-06-09"/>
                  <id root="2.16.840.1.113883.19.5.99999.21" extension="func-scale-1"/>
                  <code code="75275-8" codeSystem="2.16.840.1.113883.6.1" displayName="Barthel index total"/>
                  <statusCode code="completed"/>
                  <value xsi:type="PQ" value="85" unit="1"/>
                </observation>
              </component>
            </organizer>
          </entry>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.67" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.21" extension="func-obs-2"/>
              <code code="54522-8" codeSystem="2.16.840.1.113883.6.1" displayName="Functional status"/>
              <statusCode code="completed"/>
              <value xsi:type="CD" code="129019007" codeSystem="2.16.840.1.113883.6.96" displayName="Self-care"/>
            </observation>
          </entry>
        </section>
      </component>`;

/**
 * A Mental Status section (`…22.2.56`, LOINC `10190-7`) carrying a standalone
 * Mental Status Observation (`…4.74`) — a coded cognition finding.
 */
export const MENTAL_STATUS_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.56"/>
          <code code="10190-7" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Mental Status</title>
          <text><content ID="ment1">Oriented</content></text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.74" extension="2014-06-09"/>
              <id root="2.16.840.1.113883.19.5.99999.22" extension="ment-obs-1"/>
              <code code="8693-4" codeSystem="2.16.840.1.113883.6.1" displayName="Mental status"/>
              <statusCode code="completed"/>
              <value xsi:type="CD" code="247663003" codeSystem="2.16.840.1.113883.6.96" displayName="Orientation finding"/>
              <text><reference value="#ment1"/></text>
            </observation>
          </entry>
        </section>
      </component>`;

/**
 * A Family History section (`…22.2.15`, LOINC `10157-6`) carrying one Family
 * History Organizer (`…4.45`): the relative (father, male, born 1950, deceased)
 * via `relatedSubject`, plus a Family History Observation (`…4.46`) whose
 * condition (myocardial infarction) carries a nested Age Observation (`…4.31`,
 * age 57) and a Family History Death Observation (`…4.47`, cause of death).
 */
export const FAMILY_HISTORY_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.15"/>
          <code code="10157-6" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Family History</title>
          <text><content ID="fhx1">Father — heart attack</content></text>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN" xmlns:sdtc="urn:hl7-org:sdtc">
              <templateId root="2.16.840.1.113883.10.20.22.4.45" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.23" extension="fhx-org-1"/>
              <statusCode code="completed"/>
              <subject>
                <relatedSubject classCode="PRS">
                  <code code="FTH" codeSystem="2.16.840.1.113883.5.111" displayName="Father"/>
                  <subject>
                    <administrativeGenderCode code="M" codeSystem="2.16.840.1.113883.5.1" displayName="Male"/>
                    <birthTime value="19500101"/>
                    <sdtc:deceasedInd value="true"/>
                  </subject>
                </relatedSubject>
              </subject>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.46" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5.99999.23" extension="fhx-obs-1"/>
                  <code code="64572001" codeSystem="2.16.840.1.113883.6.96" displayName="Condition"/>
                  <statusCode code="completed"/>
                  <effectiveTime><low value="20070101"/></effectiveTime>
                  <value xsi:type="CD" code="22298006" codeSystem="2.16.840.1.113883.6.96" displayName="Myocardial infarction"/>
                  <text><reference value="#fhx1"/></text>
                  <entryRelationship typeCode="SUBJ">
                    <observation classCode="OBS" moodCode="EVN">
                      <templateId root="2.16.840.1.113883.10.20.22.4.31"/>
                      <code code="397659008" codeSystem="2.16.840.1.113883.6.96" displayName="Age"/>
                      <statusCode code="completed"/>
                      <value xsi:type="PQ" value="57" unit="a"/>
                    </observation>
                  </entryRelationship>
                  <entryRelationship typeCode="CAUS">
                    <observation classCode="OBS" moodCode="EVN">
                      <templateId root="2.16.840.1.113883.10.20.22.4.47"/>
                      <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                      <statusCode code="completed"/>
                      <value xsi:type="CD" code="419620001" codeSystem="2.16.840.1.113883.6.96" displayName="Death"/>
                    </observation>
                  </entryRelationship>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;

/**
 * A Past Medical History section (`…22.2.20`, LOINC `11348-0`) carrying a **bare**
 * Problem Observation (`…4.4`) directly under the `<entry>` — historical, not
 * wrapped in a Problem Concern Act (so it never double-counts with Problems).
 */
export const PAST_MEDICAL_HISTORY_SECTION = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.20"/>
          <code code="11348-0" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Past Medical History</title>
          <text><content ID="pmh1">Appendectomy history</content></text>
          <entry>
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.24" extension="pmh-obs-1"/>
              <code code="55607006" codeSystem="2.16.840.1.113883.6.96" displayName="Problem"/>
              <statusCode code="completed"/>
              <effectiveTime><low value="20050101"/></effectiveTime>
              <value xsi:type="CD" code="74400008" codeSystem="2.16.840.1.113883.6.96" displayName="Appendicitis"/>
              <text><reference value="#pmh1"/></text>
            </observation>
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
