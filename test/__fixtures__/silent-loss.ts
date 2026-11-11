/**
 * Synthetic fixtures for the no-silent-loss regression suite
 * (`test/silent-loss.test.ts`). Each one is a single `<component>` carrying one
 * section, written by hand for one failure class that users have reported
 * against other C-CDA libraries: a value the document carries that a parser
 * dropped without saying so.
 *
 * Nothing here is copied from another project's fixtures or issue tracker, and
 * nothing describes a real person. The patient is the canonical synthetic Jane
 * Doe that `buildCcda` supplies; every identifier sits under the fake
 * `2.16.840.1.113883.19.5.99999` arc; every code value starts with `SYN` or is
 * a run of nines, and every `displayName` starts with "Synthetic", so none of
 * them can be mistaken for a real clinical code. The code SYSTEMS are the real
 * OIDs (SNOMED CT, LOINC, RxNorm) on purpose: the parser checks the system each
 * slot expects, and a fixture on a made-up system would test that check instead
 * of the class it is about.
 */

const SNOMED = "2.16.840.1.113883.6.96";
const LOINC = "2.16.840.1.113883.6.1";
const RXNORM = "2.16.840.1.113883.6.88";
const IDS = "2.16.840.1.113883.19.5.99999.61";

/** A Medication Activity body shared by the medication fixtures. @internal */
function medicationBody(drugCode: string, drugName: string): string {
  return `
              <routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1" displayName="Oral"/>
              <doseQuantity value="1" unit="1"/>
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
                  <manufacturedMaterial>
                    <code code="${drugCode}" codeSystem="${RXNORM}" displayName="${drugName}"/>
                  </manufacturedMaterial>
                </manufacturedProduct>
              </consumable>`;
}

/** Wrap entries in a Medications section. @internal */
function medicationsSection(entries: string): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.1.1" extension="2014-06-09"/>
          <code code="10160-0" codeSystem="${LOINC}"/>
          <title>Medications</title>
          <text>Synthetic medication list.</text>${entries}
        </section>
      </component>`;
}

/** Wrap one Result Observation in a Results section and Result Organizer. @internal */
function resultsSection(observation: string): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.3.1" extension="2015-08-01"/>
          <code code="30954-2" codeSystem="${LOINC}"/>
          <title>Results</title>
          <text>Synthetic results.</text>
          <entry>
            <organizer classCode="BATTERY" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="2015-08-01"/>
              <id root="${IDS}" extension="res-org-1"/>
              <code code="SYN-PANEL-1" codeSystem="${LOINC}" displayName="Synthetic panel"/>
              <statusCode code="completed"/>
              <component>${observation}
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;
}

/** One Result Observation with the given `effectiveTime` and `value` markup. @internal */
function resultObservation(id: string, effectiveTime: string, value: string): string {
  return `
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="2015-08-01"/>
                  <id root="${IDS}" extension="${id}"/>
                  <code code="SYN-LAB-1" codeSystem="${LOINC}" displayName="Synthetic lab test"/>
                  <statusCode code="completed"/>
                  ${effectiveTime}
                  ${value}
                </observation>`;
}

/** Wrap one Allergy-Intolerance Observation in an Allergies section and concern act. @internal */
function allergiesSection(observation: string): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
          <code code="48765-2" codeSystem="${LOINC}"/>
          <title>Allergies</title>
          <text>Synthetic allergy list.</text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="2015-08-01"/>
              <id root="${IDS}" extension="alg-act-1"/>
              <statusCode code="active"/>
              <effectiveTime><low value="20200101"/></effectiveTime>
              <entryRelationship typeCode="SUBJ">${observation}
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>`;
}

/**
 * An allergy whose propensity type is an environmental (not a food) allergy,
 * with a single `participant` naming the allergen. Food is the category some
 * parsers model and the rest fall through; this one must come back with its
 * type and its allergen intact.
 */
export const ALLERGY_NON_FOOD = allergiesSection(`
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <id root="${IDS}" extension="alg-obs-1"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="SYN-ENV-ALLERGY" codeSystem="${SNOMED}" displayName="Synthetic environmental allergy"/>
                  <participant typeCode="CSM">
                    <participantRole classCode="MANU">
                      <playingEntity classCode="MMAT">
                        <code code="SYN-POLLEN-1" codeSystem="${SNOMED}" displayName="Synthetic pollen"/>
                      </playingEntity>
                    </participantRole>
                  </participant>
                </observation>`);

/**
 * A drug allergy with exactly one `participant`. A parser that converts XML to
 * JSON reads a repeated element as an array and a lone one as an object, and the
 * reports against such parsers are of the lone one going missing.
 */
export const ALLERGY_SINGLE_PARTICIPANT = allergiesSection(`
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <id root="${IDS}" extension="alg-obs-single"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="SYN-DRUG-ALLERGY" codeSystem="${SNOMED}" displayName="Synthetic drug allergy"/>
                  <participant typeCode="CSM">
                    <participantRole classCode="MANU">
                      <playingEntity classCode="MMAT">
                        <code code="SYN-DRUG-1" codeSystem="${RXNORM}" displayName="Synthetic drug ingredient"/>
                      </playingEntity>
                    </participantRole>
                  </participant>
                </observation>`);

/**
 * A Medication Activity whose duration is an `IVL_TS` interval, and a Result
 * Observation whose `effectiveTime` is an interval (a timed collection) rather
 * than a single point.
 */
export const INTERVAL_EFFECTIVE_TIMES = `${medicationsSection(`
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <id root="${IDS}" extension="med-interval-1"/>
              <statusCode code="active"/>
              <effectiveTime xsi:type="IVL_TS"><low value="20230101"/><high value="20230331"/></effectiveTime>${medicationBody("SYN-RX-1", "Synthetic tablet one")}
            </substanceAdministration>
          </entry>`)}${resultsSection(
  resultObservation(
    "res-interval-1",
    `<effectiveTime><low value="20240101080000-0500"/><high value="20240102080000-0500"/></effectiveTime>`,
    `<value xsi:type="PQ" value="1.5" unit="L"/>`,
  ),
)}`;

/** A Result Observation whose value is a `REAL` (a unitless decimal). */
export const REAL_VALUE = resultsSection(
  resultObservation(
    "res-real-1",
    `<effectiveTime value="20240101"/>`,
    `<value xsi:type="REAL" value="7.25"/>`,
  ),
);

/** A Result Observation whose value is an `ED` (encapsulated text). */
export const ED_VALUE = resultsSection(
  resultObservation(
    "res-ed-1",
    `<effectiveTime value="20240101"/>`,
    `<value xsi:type="ED" mediaType="text/plain">Synthetic encapsulated report text</value>`,
  ),
);

/** A Family History section: one relative with one condition. */
export const FAMILY_HISTORY = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.15"/>
          <code code="10157-6" codeSystem="${LOINC}"/>
          <title>Family History</title>
          <text>Synthetic family history.</text>
          <entry>
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.45" extension="2015-08-01"/>
              <id root="${IDS}" extension="fhx-org-1"/>
              <statusCode code="completed"/>
              <subject>
                <relatedSubject classCode="PRS">
                  <code code="MTH" codeSystem="2.16.840.1.113883.5.111" displayName="Mother"/>
                </relatedSubject>
              </subject>
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.46" extension="2015-08-01"/>
                  <id root="${IDS}" extension="fhx-obs-1"/>
                  <code code="64572001" codeSystem="${SNOMED}" displayName="Condition"/>
                  <statusCode code="completed"/>
                  <value xsi:type="CD" code="SYN-FHX-1" codeSystem="${SNOMED}" displayName="Synthetic inherited condition"/>
                </observation>
              </component>
            </organizer>
          </entry>
        </section>
      </component>`;

/** A Problem Observation with `negationInd="true"`: the problem is asserted absent. */
export const NEGATED_PROBLEM = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
          <code code="11450-4" codeSystem="${LOINC}"/>
          <title>Problems</title>
          <text>Synthetic problem list.</text>
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
              <id root="${IDS}" extension="prob-act-1"/>
              <statusCode code="active"/>
              <effectiveTime><low value="20210101"/></effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN" negationInd="true">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
                  <id root="${IDS}" extension="prob-obs-negated"/>
                  <code code="55607006" codeSystem="${SNOMED}" displayName="Problem"/>
                  <statusCode code="completed"/>
                  <effectiveTime><low value="20210101"/></effectiveTime>
                  <value xsi:type="CD" code="SYN-PROB-1" codeSystem="${SNOMED}" displayName="Synthetic problem"/>
                </observation>
              </entryRelationship>
            </act>
          </entry>
        </section>
      </component>`;

/** A Medication Activity with `negationInd="true"`: the drug was not taken. */
export const NEGATED_MEDICATION = medicationsSection(`
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN" negationInd="true">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <id root="${IDS}" extension="med-negated-1"/>
              <statusCode code="completed"/>
              <effectiveTime xsi:type="IVL_TS"><low value="20230101"/></effectiveTime>${medicationBody("SYN-RX-2", "Synthetic tablet two")}
            </substanceAdministration>
          </entry>`);

/**
 * A Medication Activity whose FIRST `templateId` is a vendor's own root and
 * whose Medication Activity root comes second. A parser that routes on
 * `templateId[0]` alone drops it.
 */
export const MEDICATION_SECOND_TEMPLATE = medicationsSection(`
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="${IDS}.7"/>
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <id root="${IDS}" extension="med-second-template-1"/>
              <statusCode code="active"/>
              <effectiveTime xsi:type="IVL_TS"><low value="20230101"/></effectiveTime>${medicationBody("SYN-RX-3", "Synthetic tablet three")}
            </substanceAdministration>
          </entry>`);

/**
 * A Result Observation timed with a zoneless timestamp: hour, minute and second
 * but no UTC offset, so the instant it names is unknown.
 */
export const ZONELESS_TIMESTAMP = resultsSection(
  resultObservation(
    "res-zoneless-1",
    `<effectiveTime value="20240315083000"/>`,
    `<value xsi:type="PQ" value="2" unit="L"/>`,
  ),
);

/**
 * A Medications section whose `substanceAdministration` carries no `templateId`
 * at all, beside a stamped one. The unstamped entry is the class.
 */
export const MEDICATION_MISSING_TEMPLATE = medicationsSection(`
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <id root="${IDS}" extension="med-stamped-1"/>
              <statusCode code="active"/>
              <effectiveTime xsi:type="IVL_TS"><low value="20230101"/></effectiveTime>${medicationBody("SYN-RX-4", "Synthetic tablet four")}
            </substanceAdministration>
          </entry>
          <entry>
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <id root="${IDS}" extension="med-unstamped-1"/>
              <statusCode code="active"/>
              <effectiveTime xsi:type="IVL_TS"><low value="20230101"/></effectiveTime>${medicationBody("SYN-RX-5", "Synthetic tablet five")}
            </substanceAdministration>
          </entry>`);

/**
 * A Goals section carrying one Goal Observation (`...22.4.121`): a coded goal
 * with a target quantity.
 */
export const GOALS_WITH_ENTRY = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.60"/>
          <code code="61146-7" codeSystem="${LOINC}"/>
          <title>Goals</title>
          <text>Synthetic goal.</text>
          <entry>
            <observation classCode="OBS" moodCode="GOL">
              <templateId root="2.16.840.1.113883.10.20.22.4.121"/>
              <id root="${IDS}" extension="goal-1"/>
              <code code="SYN-GOAL-1" codeSystem="${LOINC}" displayName="Synthetic goal measure"/>
              <statusCode code="active"/>
              <effectiveTime value="20240601"/>
              <value xsi:type="PQ" value="99" unit="kg"/>
            </observation>
          </entry>
        </section>
      </component>`;

/**
 * A Medical Equipment section recording an implant: a Procedure Activity
 * Procedure whose device participant is a Product Instance (`...22.4.37`)
 * carrying a synthetic UDI as its `id`.
 */
export const IMPLANTS = `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.23" extension="2014-06-09"/>
          <code code="46264-8" codeSystem="${LOINC}"/>
          <title>Medical Equipment</title>
          <text>Synthetic implant.</text>
          <entry>
            <procedure classCode="PROC" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.14" extension="2014-06-09"/>
              <id root="${IDS}" extension="implant-proc-1"/>
              <code code="SYN-IMPLANT-PROC" codeSystem="${SNOMED}" displayName="Synthetic implant procedure"/>
              <statusCode code="completed"/>
              <effectiveTime value="20220101"/>
              <participant typeCode="DEV">
                <participantRole classCode="MANU">
                  <templateId root="2.16.840.1.113883.10.20.22.4.37"/>
                  <id root="2.16.840.1.113883.3.3719" extension="(01)99999999999999(17)991231(10)SYN1(21)SYN2"/>
                  <playingDevice>
                    <code code="SYN-DEVICE-1" codeSystem="${SNOMED}" displayName="Synthetic implanted device"/>
                  </playingDevice>
                  <scopingEntity>
                    <id root="2.16.840.1.113883.3.3719"/>
                  </scopingEntity>
                </participantRole>
              </participant>
            </procedure>
          </entry>
        </section>
      </component>`;
