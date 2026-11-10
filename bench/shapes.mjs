// The C-CDA inputs the benchmarks, the profile and the scaling gate run on, built in code from an
// index.
//
// Each shape is one kind of traffic a C-CDA consumer handles every day:
// - `referralNote(i)`: a Referral Note of about 23 KiB, the small document a referral feed carries
//   all day: a reason for referral, a few problems, medications and allergies, and one result panel;
// - `ccd(i, entries)`: a Continuity of Care Document whose entries are spread evenly over Problems,
//   Medications, Results and Encounters, each section with the narrative table a sender writes
//   beside its entries, the shape a full chart export or a records request returns;
// - `unstructuredDocument(i, pdfBytes)`: an Unstructured Document whose `nonXMLBody` carries a
//   base64 PDF, the large opaque payload: one text node that is most of the document.
//
// Every name, identifier, code value and date is made up: the patient is the placeholder Jane Doe
// this repository's PHI scan allows, every identifier is under the documentation OID
// 2.16.840.1.113883.19, and the PDF is bytes from a fixed formula, not a document. No file is read.

const KIB = 1024;

const V3 = "urn:hl7-org:v3";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const R21 = "2015-08-01";
const DOC_OID = "2.16.840.1.113883.10.20.22.1";
const LOINC = "2.16.840.1.113883.6.1";
const SNOMED = "2.16.840.1.113883.6.96";
const RXNORM = "2.16.840.1.113883.6.88";
const CPT = "2.16.840.1.113883.6.12";
const ROOT = "2.16.840.1.113883.19.5";

/** A zero-padded index, so every entry of a shape has the same length whatever its index. */
function pad(i, width = 6) {
  return String(i % 10 ** width).padStart(width, "0");
}

/** A date in 2020 to 2025 from an index, as a C-CDA `TS` (YYYYMMDD). */
function date(k) {
  const year = 2020 + (k % 6);
  const month = 1 + (k % 12);
  const day = 1 + (k % 28);
  return `${String(year)}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

// Small code tables the entries cycle through. Real codes from the published code systems, chosen
// for nothing but being common.
const PROBLEMS = [
  ["59621000", "Essential hypertension"],
  ["44054006", "Diabetes mellitus type 2"],
  ["55822004", "Hyperlipidemia"],
  ["195967001", "Asthma"],
  ["35489007", "Depressive disorder"],
  ["69896004", "Rheumatoid arthritis"],
];
const MEDICATIONS = [
  ["314076", "Lisinopril 10 MG Oral Tablet"],
  ["860975", "Metformin hydrochloride 500 MG Oral Tablet"],
  ["617312", "Atorvastatin 10 MG Oral Tablet"],
  ["197361", "Amlodipine 5 MG Oral Tablet"],
  ["310965", "Ibuprofen 200 MG Oral Tablet"],
];
const RESULTS = [
  ["718-7", "Hemoglobin", "13.5", "g/dL", "12", "16"],
  ["2345-7", "Glucose", "98", "mg/dL", "70", "110"],
  ["2160-0", "Creatinine", "0.9", "mg/dL", "0.6", "1.2"],
  ["2951-2", "Sodium", "140", "mmol/L", "135", "145"],
  ["2823-3", "Potassium", "4.2", "mmol/L", "3.5", "5.1"],
  ["6690-2", "Leukocytes", "6.8", "10*3/uL", "4.5", "11"],
];
const ENCOUNTERS = [
  ["99213", "Office outpatient visit 15 minutes"],
  ["99214", "Office outpatient visit 25 minutes"],
  ["99203", "Office outpatient new 30 minutes"],
  ["99395", "Periodic preventive medicine 18-39 years"],
];
const ALLERGENS = [
  ["7980", "Penicillin G"],
  ["2670", "Codeine"],
  ["10831", "Sulfamethoxazole"],
];

/** The US Realm Header every shape shares, for document type `type`. */
function header(i, type) {
  const id = pad(i);
  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="${V3}" xmlns:xsi="${XSI}">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="${DOC_OID}.1" extension="${R21}"/>
  <templateId root="${DOC_OID}.1"/>
  <templateId root="${type.oid}" extension="${R21}"/>
  <templateId root="${type.oid}"/>
  <id root="${ROOT}.99999.1" extension="DOC-${id}"/>
  <code code="${type.code}" codeSystem="${LOINC}" codeSystemName="LOINC" displayName="${type.title}"/>
  <title>${type.title}</title>
  <effectiveTime value="20250101120000-0500"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en-US"/>
  <setId root="${ROOT}.99999.19" extension="SET-${id}"/>
  <versionNumber value="1"/>
  <recordTarget>
    <patientRole>
      <id root="${ROOT}" extension="MRN-${id}" assigningAuthorityName="Synthetic Health Organization"/>
      <patient>
        <name use="L"><given>Jane</given><family>Doe</family></name>
        <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1" displayName="Female"/>
        <birthTime value="19800101"/>
        <maritalStatusCode code="M" codeSystem="2.16.840.1.113883.5.2"/>
        <raceCode code="2106-3" codeSystem="2.16.840.1.113883.6.238"/>
        <ethnicGroupCode code="2186-5" codeSystem="2.16.840.1.113883.6.238"/>
        <languageCommunication><languageCode code="en"/></languageCommunication>
      </patient>
    </patientRole>
  </recordTarget>
  <author>
    <time value="20250101120000-0500"/>
    <assignedAuthor>
      <id root="${ROOT}.99999.10" extension="PROV-000001"/>
      <assignedPerson><name><given>Avery</given><family>Okonkwo</family></name></assignedPerson>
      <representedOrganization>
        <id root="${ROOT}.99999.2"/>
        <name>Synthetic Health Organization</name>
      </representedOrganization>
    </assignedAuthor>
  </author>
  <custodian>
    <assignedCustodian>
      <representedCustodianOrganization>
        <id root="${ROOT}.99999.2"/>
        <name>Synthetic Health Organization</name>
      </representedCustodianOrganization>
    </assignedCustodian>
  </custodian>
  <documentationOf>
    <serviceEvent classCode="PCPR">
      <effectiveTime><low value="20200101"/><high value="20250101"/></effectiveTime>
    </serviceEvent>
  </documentationOf>`;
}

/** A section with its templateId, code, title, a narrative table of `rows`, and `entries`. */
function section(templateId, extension, code, title, head, rows, entries) {
  return `
      <component>
        <section>
          <templateId root="${templateId}" extension="${extension}"/>
          <templateId root="${templateId}"/>
          <code code="${code}" codeSystem="${LOINC}" codeSystemName="LOINC" displayName="${title}"/>
          <title>${title}</title>
          <text>
            <table border="1" width="100%">
              <thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
              <tbody>${rows.join("")}
              </tbody>
            </table>
          </text>${entries.join("")}
        </section>
      </component>`;
}

/** A narrative table row whose first cell carries the content ID an entry references. */
function row(id, cells) {
  const [first, ...rest] = cells;
  return `
                <tr><td><content ID="${id}">${first}</content></td>${rest.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

/** A Problem Concern Act holding one Problem Observation. */
function problemEntry(i, k) {
  const [code, name] = PROBLEMS[k % PROBLEMS.length];
  const id = `${pad(i, 4)}-${pad(k)}`;
  const status = k % 5 === 0 ? "completed" : "active";
  const ref = `prob-${pad(k)}`;
  return {
    row: row(ref, [name, status, date(k)]),
    entry: `
          <entry typeCode="DRIV">
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="${R21}"/>
              <templateId root="2.16.840.1.113883.10.20.22.4.3"/>
              <id root="${ROOT}.99999.3" extension="pc-${id}"/>
              <code code="CONC" codeSystem="2.16.840.1.113883.5.6" displayName="Concern"/>
              <statusCode code="${status}"/>
              <effectiveTime><low value="${date(k)}"/></effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="${R21}"/>
                  <templateId root="2.16.840.1.113883.10.20.22.4.4"/>
                  <id root="${ROOT}.99999.3" extension="po-${id}"/>
                  <code code="55607006" codeSystem="${SNOMED}" codeSystemName="SNOMED CT" displayName="Problem"/>
                  <text><reference value="#${ref}"/></text>
                  <statusCode code="completed"/>
                  <effectiveTime><low value="${date(k)}"/></effectiveTime>
                  <value xsi:type="CD" code="${code}" codeSystem="${SNOMED}" codeSystemName="SNOMED CT" displayName="${name}"/>
                </observation>
              </entryRelationship>
            </act>
          </entry>`,
  };
}

/** A Medication Activity with a dose, a route and a frequency. */
function medicationEntry(i, k) {
  const [code, name] = MEDICATIONS[k % MEDICATIONS.length];
  const id = `${pad(i, 4)}-${pad(k)}`;
  const ref = `med-${pad(k)}`;
  return {
    row: row(ref, [name, "1 tablet by mouth daily", date(k)]),
    entry: `
          <entry typeCode="DRIV">
            <substanceAdministration classCode="SBADM" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.16" extension="2014-06-09"/>
              <templateId root="2.16.840.1.113883.10.20.22.4.16"/>
              <id root="${ROOT}.99999.4" extension="ma-${id}"/>
              <text><reference value="#${ref}"/></text>
              <statusCode code="active"/>
              <effectiveTime xsi:type="IVL_TS"><low value="${date(k)}"/></effectiveTime>
              <effectiveTime xsi:type="PIVL_TS" institutionSpecified="true" operator="A">
                <period value="24" unit="h"/>
              </effectiveTime>
              <routeCode code="C38288" codeSystem="2.16.840.1.113883.3.26.1.1" codeSystemName="NCI Thesaurus" displayName="Oral"/>
              <doseQuantity value="1"/>
              <consumable>
                <manufacturedProduct classCode="MANU">
                  <templateId root="2.16.840.1.113883.10.20.22.4.23" extension="2014-06-09"/>
                  <templateId root="2.16.840.1.113883.10.20.22.4.23"/>
                  <manufacturedMaterial>
                    <code code="${code}" codeSystem="${RXNORM}" codeSystemName="RxNorm" displayName="${name}"/>
                  </manufacturedMaterial>
                </manufacturedProduct>
              </consumable>
            </substanceAdministration>
          </entry>`,
  };
}

/** A Result Organizer holding three Result Observations with reference ranges. */
function resultEntry(i, k) {
  const id = `${pad(i, 4)}-${pad(k)}`;
  const rows = [];
  const observations = [];
  for (let j = 0; j < 3; j++) {
    const [code, name, value, unit, low, high] = RESULTS[(k * 3 + j) % RESULTS.length];
    const ref = `res-${pad(k)}-${String(j)}`;
    rows.push(row(ref, [name, `${value} ${unit}`, `${low}-${high}`, date(k)]));
    observations.push(`
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.2" extension="${R21}"/>
                  <templateId root="2.16.840.1.113883.10.20.22.4.2"/>
                  <id root="${ROOT}.99999.5" extension="ro-${id}-${String(j)}"/>
                  <code code="${code}" codeSystem="${LOINC}" codeSystemName="LOINC" displayName="${name}"/>
                  <text><reference value="#${ref}"/></text>
                  <statusCode code="completed"/>
                  <effectiveTime value="${date(k)}"/>
                  <value xsi:type="PQ" value="${value}" unit="${unit}"/>
                  <interpretationCode code="N" codeSystem="2.16.840.1.113883.5.83"/>
                  <referenceRange>
                    <observationRange>
                      <value xsi:type="IVL_PQ"><low value="${low}" unit="${unit}"/><high value="${high}" unit="${unit}"/></value>
                    </observationRange>
                  </referenceRange>
                </observation>
              </component>`);
  }
  return {
    row: rows.join(""),
    entry: `
          <entry typeCode="DRIV">
            <organizer classCode="BATTERY" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.1" extension="${R21}"/>
              <templateId root="2.16.840.1.113883.10.20.22.4.1"/>
              <id root="${ROOT}.99999.5" extension="rp-${id}"/>
              <code code="24323-8" codeSystem="${LOINC}" codeSystemName="LOINC" displayName="Comprehensive metabolic panel"/>
              <statusCode code="completed"/>
              <effectiveTime value="${date(k)}"/>${observations.join("")}
            </organizer>
          </entry>`,
  };
}

/** An Encounter Activity. */
function encounterEntry(i, k) {
  const [code, name] = ENCOUNTERS[k % ENCOUNTERS.length];
  const id = `${pad(i, 4)}-${pad(k)}`;
  const ref = `enc-${pad(k)}`;
  return {
    row: row(ref, [name, date(k)]),
    entry: `
          <entry typeCode="DRIV">
            <encounter classCode="ENC" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.49" extension="${R21}"/>
              <templateId root="2.16.840.1.113883.10.20.22.4.49"/>
              <id root="${ROOT}.99999.6" extension="en-${id}"/>
              <code code="${code}" codeSystem="${CPT}" codeSystemName="CPT-4" displayName="${name}"/>
              <text><reference value="#${ref}"/></text>
              <statusCode code="completed"/>
              <effectiveTime><low value="${date(k)}"/><high value="${date(k)}"/></effectiveTime>
            </encounter>
          </entry>`,
  };
}

/** An Allergy Concern Act holding one Allergy-Intolerance Observation with a reaction. */
function allergyEntry(i, k) {
  const [code, name] = ALLERGENS[k % ALLERGENS.length];
  const id = `${pad(i, 4)}-${pad(k)}`;
  const ref = `alg-${pad(k)}`;
  return {
    row: row(ref, [name, "Hives", "Moderate"]),
    entry: `
          <entry typeCode="DRIV">
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.30" extension="${R21}"/>
              <templateId root="2.16.840.1.113883.10.20.22.4.30"/>
              <id root="${ROOT}.99999.7" extension="ac-${id}"/>
              <code code="CONC" codeSystem="2.16.840.1.113883.5.6" displayName="Concern"/>
              <statusCode code="active"/>
              <effectiveTime><low value="${date(k)}"/></effectiveTime>
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.7" extension="2014-06-09"/>
                  <templateId root="2.16.840.1.113883.10.20.22.4.7"/>
                  <id root="${ROOT}.99999.7" extension="ao-${id}"/>
                  <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                  <text><reference value="#${ref}"/></text>
                  <statusCode code="completed"/>
                  <effectiveTime><low value="${date(k)}"/></effectiveTime>
                  <value xsi:type="CD" code="416098002" codeSystem="${SNOMED}" displayName="Drug allergy"/>
                  <participant typeCode="CSM">
                    <participantRole classCode="MANU">
                      <playingEntity classCode="MMAT">
                        <code code="${code}" codeSystem="${RXNORM}" displayName="${name}"/>
                      </playingEntity>
                    </participantRole>
                  </participant>
                  <entryRelationship typeCode="MFST" inversionInd="true">
                    <observation classCode="OBS" moodCode="EVN">
                      <templateId root="2.16.840.1.113883.10.20.22.4.9" extension="2014-06-09"/>
                      <templateId root="2.16.840.1.113883.10.20.22.4.9"/>
                      <id root="${ROOT}.99999.7" extension="ar-${id}"/>
                      <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                      <statusCode code="completed"/>
                      <value xsi:type="CD" code="247472004" codeSystem="${SNOMED}" displayName="Hives"/>
                    </observation>
                  </entryRelationship>
                </observation>
              </entryRelationship>
            </act>
          </entry>`,
  };
}

/** A Vital Signs Organizer with a blood pressure pair. */
function vitalsEntry(i, k) {
  const id = `${pad(i, 4)}-${pad(k)}`;
  const vital = (code, name, value, j) => `
              <component>
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.27" extension="2014-06-09"/>
                  <templateId root="2.16.840.1.113883.10.20.22.4.27"/>
                  <id root="${ROOT}.99999.8" extension="vo-${id}-${String(j)}"/>
                  <code code="${code}" codeSystem="${LOINC}" displayName="${name}"/>
                  <statusCode code="completed"/>
                  <effectiveTime value="${date(k)}"/>
                  <value xsi:type="PQ" value="${value}" unit="mm[Hg]"/>
                </observation>
              </component>`;
  return {
    row: row(`vit-${pad(k)}`, ["Blood pressure", "120/80 mm[Hg]", date(k)]),
    entry: `
          <entry typeCode="DRIV">
            <organizer classCode="CLUSTER" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.26" extension="${R21}"/>
              <templateId root="2.16.840.1.113883.10.20.22.4.26"/>
              <id root="${ROOT}.99999.8" extension="vg-${id}"/>
              <code code="46680005" codeSystem="${SNOMED}" displayName="Vital signs"/>
              <statusCode code="completed"/>
              <effectiveTime value="${date(k)}"/>${vital("8480-6", "Systolic blood pressure", "120", 0)}${vital("8462-4", "Diastolic blood pressure", "80", 1)}
            </organizer>
          </entry>`,
  };
}

/** A Smoking Status observation in a Social History section. */
function socialHistory(i) {
  return section(
    "2.16.840.1.113883.10.20.22.2.17",
    R21,
    "29762-2",
    "Social History",
    ["Observation", "Value", "Date"],
    [row("smk-1", ["Tobacco smoking status", "Former smoker", "20240101"])],
    [
      `
          <entry typeCode="DRIV">
            <observation classCode="OBS" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.78" extension="2014-06-09"/>
              <templateId root="2.16.840.1.113883.10.20.22.4.78"/>
              <id root="${ROOT}.99999.9" extension="sm-${pad(i)}"/>
              <code code="72166-2" codeSystem="${LOINC}" displayName="Tobacco smoking status"/>
              <statusCode code="completed"/>
              <effectiveTime value="20240101"/>
              <value xsi:type="CD" code="8517006" codeSystem="${SNOMED}" displayName="Former smoker"/>
            </observation>
          </entry>`,
    ],
  );
}

/** `count` entries of `make`, as one section's rows and entries. */
function many(i, count, make) {
  const rows = [];
  const entries = [];
  for (let k = 0; k < count; k++) {
    const e = make(i, k);
    rows.push(e.row);
    entries.push(e.entry);
  }
  return { rows, entries };
}

function problemsSection(i, count) {
  const { rows, entries } = many(i, count, problemEntry);
  return section(
    "2.16.840.1.113883.10.20.22.2.5.1",
    R21,
    "11450-4",
    "Problems",
    ["Problem", "Status", "Onset"],
    rows,
    entries,
  );
}

function medicationsSection(i, count) {
  const { rows, entries } = many(i, count, medicationEntry);
  return section(
    "2.16.840.1.113883.10.20.22.2.1.1",
    "2014-06-09",
    "10160-0",
    "Medications",
    ["Medication", "Directions", "Start"],
    rows,
    entries,
  );
}

function resultsSection(i, count) {
  const { rows, entries } = many(i, count, resultEntry);
  return section(
    "2.16.840.1.113883.10.20.22.2.3.1",
    R21,
    "30954-2",
    "Results",
    ["Test", "Value", "Range", "Date"],
    rows,
    entries,
  );
}

function encountersSection(i, count) {
  const { rows, entries } = many(i, count, encounterEntry);
  return section(
    "2.16.840.1.113883.10.20.22.2.22.1",
    R21,
    "46240-8",
    "Encounters",
    ["Encounter", "Date"],
    rows,
    entries,
  );
}

function allergiesSection(i, count) {
  const { rows, entries } = many(i, count, allergyEntry);
  return section(
    "2.16.840.1.113883.10.20.22.2.6.1",
    R21,
    "48765-2",
    "Allergies",
    ["Substance", "Reaction", "Severity"],
    rows,
    entries,
  );
}

function vitalsSection(i, count) {
  const { rows, entries } = many(i, count, vitalsEntry);
  return section(
    "2.16.840.1.113883.10.20.22.2.4.1",
    R21,
    "8716-3",
    "Vital Signs",
    ["Vital", "Value", "Date"],
    rows,
    entries,
  );
}

const CCD = { oid: `${DOC_OID}.2`, code: "34133-9", title: "Continuity of Care Document" };
const REFERRAL = { oid: `${DOC_OID}.14`, code: "57133-1", title: "Referral Note" };
const UNSTRUCTURED = { oid: `${DOC_OID}.10`, code: "34109-9", title: "Unstructured Document" };

/**
 * A Continuity of Care Document of `entries` entries, a quarter each in Problems, Medications,
 * Results (a panel of three observations each) and Encounters, plus the Allergies, Vital Signs and
 * Social History sections a CCD requires.
 */
function ccd(i, entries) {
  const quarter = Math.max(1, Math.floor(entries / 4));
  return `${header(i, CCD)}
  <component>
    <structuredBody>${allergiesSection(i, 3)}${problemsSection(i, quarter)}${medicationsSection(i, quarter)}${resultsSection(i, quarter)}${encountersSection(i, quarter)}${vitalsSection(i, 2)}${socialHistory(i)}
    </structuredBody>
  </component>
</ClinicalDocument>
`;
}

/** A Referral Note: a reason, three problems, four medications, one allergy, one result panel. */
function referralNote(i) {
  return `${header(i, REFERRAL)}
  <component>
    <structuredBody>
      <component>
        <section>
          <templateId root="1.3.6.1.4.1.19376.1.5.3.1.3.1" extension="2014-06-09"/>
          <templateId root="1.3.6.1.4.1.19376.1.5.3.1.3.1"/>
          <code code="42349-1" codeSystem="${LOINC}" displayName="Reason for referral"/>
          <title>Reason for Referral</title>
          <text>Referred to cardiology for evaluation of elevated blood pressure readings.</text>
        </section>
      </component>${problemsSection(i, 3)}${medicationsSection(i, 4)}${allergiesSection(i, 1)}${resultsSection(i, 1)}
    </structuredBody>
  </component>
</ClinicalDocument>
`;
}

/**
 * `bytes` bytes of a stand-in PDF: a real PDF header and trailer around bytes from a fixed formula.
 * It is not a document anyone could open, and nothing reads it as one: the parser keeps it as text.
 */
function pdfBytes(i, bytes) {
  const head = Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1");
  const tail = Buffer.from("\n%%EOF\n", "latin1");
  const body = Buffer.alloc(Math.max(0, bytes - head.length - tail.length));
  let x = (i + 1) * 2654435761;
  for (let k = 0; k < body.length; k++) {
    // A 32-bit xorshift, so the bytes look like compressed streams and base64 cannot shrink them.
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    body[k] = x & 0xff;
  }
  return Buffer.concat([head, body, tail]);
}

/** Base64 with a line break every 76 characters, as most senders wrap it. */
function wrappedBase64(buffer) {
  const flat = buffer.toString("base64");
  const lines = [];
  for (let at = 0; at < flat.length; at += 76) lines.push(flat.slice(at, at + 76));
  return lines.join("\n");
}

/** An Unstructured Document whose `nonXMLBody` carries a base64 PDF of `bytes` bytes. */
function unstructuredDocument(i, bytes) {
  return `${header(i, UNSTRUCTURED)}
  <component>
    <nonXMLBody>
      <text mediaType="application/pdf" representation="B64">
${wrappedBase64(pdfBytes(i, bytes))}
      </text>
    </nonXMLBody>
  </component>
</ClinicalDocument>
`;
}

/**
 * The edit the edit benchmarks make: on a structured document, the Allergies section replaced with
 * one allergy, the change a reconciliation step writes back; on an unstructured one, which has no
 * section to replace, a new revision of the same content. Either way `editCcda` stamps a revision.
 */
function editOptions(structured) {
  if (!structured) return {};
  return {
    sections: [
      {
        kind: "allergies",
        mode: "replace",
        content: [
          {
            allergen: { code: "7980", codeSystem: RXNORM, displayName: "Penicillin G" },
            reaction: { code: "247472004", codeSystem: SNOMED, displayName: "Hives" },
            status: "active",
          },
        ],
      },
    ],
  };
}

/**
 * Every code the shapes use, for the in-memory terminology adapter and value set source the
 * validation benchmarks pass: each code is known, so a check runs its whole path and flags nothing.
 */
const KNOWN_CODES = new Set(
  [
    ...PROBLEMS,
    ...MEDICATIONS,
    ...RESULTS,
    ...ENCOUNTERS,
    ...ALLERGENS,
    ["55607006"],
    ["416098002"],
    ["247472004"],
    ["8517006"],
    ["72166-2"],
    ["8480-6"],
    ["8462-4"],
    ["46680005"],
    ["24323-8"],
    ["C38288"],
  ].map(([code]) => code),
);

/** The `terminology` and `valueSets` options of `parseCcda`, answering from `KNOWN_CODES`. */
function validationOptions() {
  return {
    terminology: {
      validateCode: (coding) => ({ result: KNOWN_CODES.has(coding.code) }),
    },
    valueSets: {
      release: "bench-synthetic",
      isMember: (query) => ({
        membership: KNOWN_CODES.has(query.coding.code) ? "member" : "not-a-member",
      }),
    },
  };
}

export { KIB, ccd, editOptions, referralNote, unstructuredDocument, validationOptions };
