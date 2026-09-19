/**
 * Synthetic, PHI-free C-CDA fixtures for the US Realm header PARTICIPATIONS:
 * `author`, `custodian` and `componentOf/encompassingEncounter`, plus the
 * conduction of an author reading down to a section and to a top-level entry
 * act.
 *
 * **Every value here is invented.** The patient is the corpus's canonical
 * synthetic "Jane Doe"; the three clinicians (Avery Lirio, Bryn Okonkwo, Cass
 * Revel) and the two organizations (Synthetic Cardiology Practice, Synthetic
 * Health Organization) were made up for this file and every one of their name
 * tokens is declared in `scripts/phi-allow-list.txt`, which is what declares
 * this fixture synthetic to the commit gate. Identifiers are prefixed
 * alphanumeric shapes, never a bare numeric MRN or SSN. No real patient record,
 * no real clinician and no real organization is represented here, and none was
 * anonymised into it: these documents were written by hand from the C-CDA R2.1
 * shapes the parser reads.
 *
 * Three clinicians rather than one is the point of the file: an inherited author
 * reading is only observable when the document, the section and the entry can
 * name DIFFERENT authors, so a reading that fell through to the wrong level
 * would be indistinguishable from a correct one with a single name.
 */

/** Progress Note: a recognized type whose required-section SHALL table is empty, so these
 * documents are quiet except for the deviation each one plants. */
const PROGRESS_NOTE_OID = "2.16.840.1.113883.10.20.22.1.9";
/** Discharge Summary, the type whose template carries componentOf/encompassingEncounter. */
const DISCHARGE_SUMMARY_OID = "2.16.840.1.113883.10.20.22.1.8";
const LOINC = "2.16.840.1.113883.6.1";
const NPI_ROOT = "2.16.840.1.113883.4.6";
const SYNTH_ROOT = "2.16.840.1.113883.19.5.99999";

/** The document-level author: Avery Lirio, acting for Synthetic Cardiology Practice. */
export const DOCUMENT_AUTHOR = `
  <author>
    <time value="20240301103000-0500"/>
    <assignedAuthor>
      <id root="${NPI_ROOT}" extension="NPI-SYNTH-1"/>
      <assignedPerson><name><given>Avery</given><family>Lirio</family></name></assignedPerson>
      <representedOrganization>
        <id root="${SYNTH_ROOT}.3"/>
        <name>Synthetic Cardiology Practice</name>
      </representedOrganization>
    </assignedAuthor>
  </author>`;

/** A second document-level author, a DEVICE rather than a person (the other arm of the choice). */
export const DEVICE_AUTHOR = `
  <author>
    <time value="20240301"/>
    <assignedAuthor>
      <id root="${SYNTH_ROOT}.5" extension="DEVICE-1"/>
      <assignedAuthoringDevice>
        <manufacturerModelName>cosyte</manufacturerModelName>
        <softwareName>@cosyte/ccda</softwareName>
      </assignedAuthoringDevice>
      <representedOrganization>
        <id root="${SYNTH_ROOT}.3"/>
        <name>Synthetic Cardiology Practice</name>
      </representedOrganization>
    </assignedAuthor>
  </author>`;

/** The section-level author: Bryn Okonkwo. */
export const SECTION_AUTHOR = `
      <author>
        <time value="20240302"/>
        <assignedAuthor>
          <id root="${NPI_ROOT}" extension="NPI-SYNTH-2"/>
          <assignedPerson><name><given>Bryn</given><family>Okonkwo</family></name></assignedPerson>
        </assignedAuthor>
      </author>`;

/** The entry-level author: Cass Revel. */
export const ENTRY_AUTHOR = `
          <author>
            <time value="20240303"/>
            <assignedAuthor>
              <id root="${NPI_ROOT}" extension="NPI-SYNTH-3"/>
              <assignedPerson><name><given>Cass</given><family>Revel</family></name></assignedPerson>
            </assignedAuthor>
          </author>`;

/** A conforming custodian: Synthetic Health Organization. */
export const CUSTODIAN = `
  <custodian><assignedCustodian><representedCustodianOrganization>
    <id root="${SYNTH_ROOT}.4" extension="ORG-1"/>
    <name>Synthetic Health Organization</name>
  </representedCustodianOrganization></assignedCustodian></custodian>`;

/** An `encompassingEncounter` with both bounds and a discharge disposition code. */
export const ENCOMPASSING_ENCOUNTER = `
  <componentOf><encompassingEncounter>
    <id root="${SYNTH_ROOT}.6" extension="ENC-1"/>
    <effectiveTime>
      <low value="20240228080000-0500"/>
      <high value="20240302"/>
    </effectiveTime>
    <dischargeDispositionCode code="01" codeSystem="2.16.840.1.113883.12.112"
      codeSystemName="HL7 Discharge Disposition" displayName="Discharged to home care or self care"/>
  </encompassingEncounter></componentOf>`;

/**
 * A `documentationOf` service event carrying dates of its own. It is here so a
 * test can prove the encounter frame is not derived from it: a document with no
 * `componentOf` but with these dates must still report no encounter frame.
 */
export const DOCUMENTATION_OF = `
  <documentationOf><serviceEvent classCode="PCPR">
    <effectiveTime><low value="20200101"/><high value="20241231"/></effectiveTime>
  </serviceEvent></documentationOf>`;

/**
 * A `legalAuthenticator` and an `informant`, both naming a person. They are here
 * so a test can prove that a document carrying no `author` anywhere reports no
 * author, rather than falling through to one of these.
 */
export const OTHER_PARTICIPATIONS = `
  <legalAuthenticator>
    <time value="20240304"/>
    <signatureCode code="S"/>
    <assignedEntity>
      <id root="${NPI_ROOT}" extension="NPI-SYNTH-2"/>
      <assignedPerson><name><given>Bryn</given><family>Okonkwo</family></name></assignedPerson>
    </assignedEntity>
  </legalAuthenticator>
  <informant>
    <assignedEntity>
      <id root="${NPI_ROOT}" extension="NPI-SYNTH-3"/>
      <assignedPerson><name><given>Cass</given><family>Revel</family></name></assignedPerson>
    </assignedEntity>
  </informant>`;

/** Options for {@link participationDoc}. Every part defaults to absent. */
export interface ParticipationDocOptions {
  /** Document-type template OID; defaults to the Progress Note. */
  readonly docOid?: string;
  /** Raw XML inserted between `languageCode` and `recordTarget` (header participations). */
  readonly beforeRecordTarget?: string;
  /** Raw XML inserted after `recordTarget` (author, custodian, componentOf, ...). */
  readonly afterRecordTarget?: string;
  /** Raw `<component><section>` markup for the structured body. */
  readonly sections?: string;
}

/**
 * Assemble a minimal US Realm `ClinicalDocument` around the participation markup
 * a test is exercising. The record target, id, code, title and effectiveTime are
 * constant so a diff between two documents from this builder is exactly the
 * participation under test.
 */
export function participationDoc(opts: ParticipationDocOptions = {}): string {
  const docOid = opts.docOid ?? PROGRESS_NOTE_OID;
  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
  <templateId root="${docOid}" extension="2015-08-01"/>
  <id root="${SYNTH_ROOT}.1" extension="DOC-0007"/>
  <code code="11506-3" codeSystem="${LOINC}"/>
  <title>Synthetic Participation Document</title>
  <effectiveTime value="20240305"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en-US"/>${opts.beforeRecordTarget ?? ""}
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN001" assigningAuthorityName="Sample Hospital"/>
    <patient>
      <name><given>Jane</given><family>Doe</family></name>
      <administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>
      <birthTime value="19800101"/>
    </patient>
  </patientRole></recordTarget>${opts.afterRecordTarget ?? ""}
  <component><structuredBody>${opts.sections ?? EMPTY_SECTION}
  </structuredBody></component>
</ClinicalDocument>`;
}

/** A single narrative-only Allergies section carrying no author of its own. */
export const EMPTY_SECTION = `
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
      <code code="48765-2" codeSystem="${LOINC}"/>
      <title>Allergies</title>
      <text>No known allergies.</text>
    </section></component>`;

/**
 * A Problems section carrying `authoredEntry` (a Problem Concern Act with its
 * own `<author>`) followed by `plainEntry` (one with none), so a test can read
 * both entry readings out of one section in document order.
 */
export function problemsSection(
  opts: { readonly sectionAuthor?: string; readonly entryAuthor?: string } = {},
): string {
  const entryAuthor = opts.entryAuthor ?? ENTRY_AUTHOR;
  return `
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="${LOINC}"/>
      <title>Problems</title>
      <text><content ID="p1">Essential hypertension</content></text>${opts.sectionAuthor ?? ""}
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <id root="${SYNTH_ROOT}.2" extension="prob-act-authored"/>
        <statusCode code="active"/>${entryAuthor}
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
          <id root="${SYNTH_ROOT}.2" extension="prob-obs-authored"/>
          <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
          <statusCode code="completed"/>
          <effectiveTime><low value="20210101"/></effectiveTime>
          <value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96"
            displayName="Essential hypertension"><originalText><reference value="#p1"/></originalText></value>
        </observation></entryRelationship>
      </act></entry>
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <id root="${SYNTH_ROOT}.2" extension="prob-act-plain"/>
        <statusCode code="active"/>
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
          <id root="${SYNTH_ROOT}.2" extension="prob-obs-plain"/>
          <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
          <statusCode code="completed"/>
          <effectiveTime><low value="20210101"/></effectiveTime>
          <value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96"
            displayName="Essential hypertension"><originalText><reference value="#p1"/></originalText></value>
        </observation></entryRelationship>
      </act></entry>
    </section></component>`;
}

/**
 * TIER 1, spec-clean. A document that states its author and its custodian, with
 * an Allergies section stating its OWN author and a Problems section stating
 * none; the Problems section holds an entry with its own author and an entry
 * with none. Every one of the six author readings AC-1 and AC-2 grade is
 * observable on this one document.
 */
export const TIER1_AUTHORED = participationDoc({
  afterRecordTarget: `${DOCUMENT_AUTHOR}${DEVICE_AUTHOR}${CUSTODIAN}`,
  sections: `
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
      <code code="48765-2" codeSystem="${LOINC}"/>
      <title>Allergies</title>
      <text>No known allergies.</text>${SECTION_AUTHOR}
    </section></component>${problemsSection()}`,
});

/**
 * TIER 1, spec-clean. A Discharge Summary shaped document carrying
 * `componentOf/encompassingEncounter` with both bounds and a discharge
 * disposition code, beside the author and custodian.
 */
export const TIER1_DISCHARGE = participationDoc({
  docOid: DISCHARGE_SUMMARY_OID,
  afterRecordTarget: `${DOCUMENT_AUTHOR}${CUSTODIAN}${ENCOMPASSING_ENCOUNTER}`,
});

/**
 * TIER 2, vendor quirk. An `author` whose `assignedAuthor` carries neither arm
 * of the choice: no `assignedPerson`, no `assignedAuthoringDevice`. The shape is
 * reproduced from what such a sender emits, an `assignedAuthor` with an id and a
 * `representedOrganization` and nothing that names a person or a device.
 */
export const TIER2_UNIDENTIFIED = participationDoc({
  afterRecordTarget: `
  <author>
    <time value="20240301"/>
    <assignedAuthor>
      <id root="${NPI_ROOT}" extension="NPI-SYNTH-9"/>
      <representedOrganization>
        <id root="${SYNTH_ROOT}.3"/>
        <name>Synthetic Cardiology Practice</name>
      </representedOrganization>
    </assignedAuthor>
  </author>${CUSTODIAN}`,
  sections: problemsSection(),
});

/**
 * TIER 2, vendor quirk. An `<author>` carrying no `assignedAuthor` element at
 * all: a `time` and nothing else. It is the emptier sibling of
 * {@link TIER2_UNIDENTIFIED}, and it reads the same way, because nothing in it
 * identifies anybody either.
 */
export const TIER2_BARE_AUTHOR = participationDoc({
  afterRecordTarget: `
  <author><time value="20240301"/></author>${CUSTODIAN}`,
});

/**
 * TIER 2. A Problems section holding ONE Problem Concern Act whose `<id>`
 * declares a `nullFlavor` beside an `@extension`: the act says both "this
 * identifier is unknown" and "this identifier is prob-act-plain". The
 * extraction walk reads that `<id>`, so `CONTRADICTORY_NULL_FLAVOR` is its
 * deviation to report, and one deviation is reported once.
 */
export const TIER2_CONTRADICTORY_ENTRY_ID = participationDoc({
  sections: `
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="${LOINC}"/>
      <title>Problems</title>
      <text><content ID="p1">Essential hypertension</content></text>
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <id root="${SYNTH_ROOT}.2" extension="prob-act-plain" nullFlavor="UNK"/>
        <statusCode code="active"/>
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
          <id root="${SYNTH_ROOT}.2" extension="prob-obs-plain"/>
          <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
          <statusCode code="completed"/>
          <effectiveTime><low value="20210101"/></effectiveTime>
          <value xsi:type="CD" code="59621000" codeSystem="2.16.840.1.113883.6.96"
            displayName="Essential hypertension"><originalText><reference value="#p1"/></originalText></value>
        </observation></entryRelationship>
      </act></entry>
    </section></component>`,
});

/**
 * TIER 2. A section holding a top-level entry act NO extractor family claims
 * (its `templateId` root names no C-CDA template), whose `<id>` carries a token
 * outside the v3 NullFlavor code system and asserts no `@extension`. Nothing
 * reads that `<id>`, so the document parses silently and carries no author of
 * any kind: a reader that reached the act while framing the section would
 * report a deviation on a document that had none.
 */
export const TIER2_UNCLAIMED_ENTRY_ID = participationDoc({
  sections: `
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="${LOINC}"/>
      <title>Problems</title>
      <text>Essential hypertension</text>
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="1.2.3.4.5.6.7.8.9" extension="2015-08-01"/>
        <id root="${SYNTH_ROOT}.2" nullFlavor="NOT-A-NULL-FLAVOR"/>
        <statusCode code="active"/>
      </act></entry>
    </section></component>`,
});

/**
 * TIER 2, vendor quirk. A document carrying NO `author` at any level, but
 * carrying a record target, a custodian, a legal authenticator and an informant,
 * every one of which names an entity a lenient reader might be tempted to report
 * as the author.
 */
export const TIER2_NO_AUTHOR = participationDoc({
  afterRecordTarget: `${CUSTODIAN}${OTHER_PARTICIPATIONS}`,
  sections: problemsSection({ entryAuthor: "" }),
});

/**
 * TIER 2, vendor quirk. Author times that cannot be read as stated: one at bare
 * year precision (legal, and must stay partial), one that is not a v3 timestamp
 * at all, and an encounter whose low bound declares a `nullFlavor` while its
 * high bound is a real date.
 */
export const TIER2_UNREADABLE_TIMES = participationDoc({
  docOid: DISCHARGE_SUMMARY_OID,
  afterRecordTarget: `
  <author>
    <time value="2024"/>
    <assignedAuthor>
      <id root="${NPI_ROOT}" extension="NPI-SYNTH-1"/>
      <assignedPerson><name><given>Avery</given><family>Lirio</family></name></assignedPerson>
    </assignedAuthor>
  </author>
  <author>
    <time value="03/01/2024"/>
    <assignedAuthor>
      <id root="${NPI_ROOT}" extension="NPI-SYNTH-2"/>
      <assignedPerson><name><given>Bryn</given><family>Okonkwo</family></name></assignedPerson>
    </assignedAuthor>
  </author>${CUSTODIAN}
  <componentOf><encompassingEncounter>
    <effectiveTime>
      <low nullFlavor="UNK"/>
      <high value="20240302"/>
    </effectiveTime>
  </encompassingEncounter></componentOf>`,
});

/**
 * TIER 2, vendor quirk. Four malformed participation subtrees in one document: a
 * `custodian` with no `assignedCustodian`, an `author` whose children are in an
 * order CDA R2 does not use (`assignedAuthor` before `time`, and the person after
 * the organization inside it), a SECOND `author` at the same level, and an
 * `encompassingEncounter` with no `effectiveTime`.
 */
export const TIER2_MALFORMED = participationDoc({
  docOid: DISCHARGE_SUMMARY_OID,
  afterRecordTarget: `
  <author>
    <assignedAuthor>
      <representedOrganization>
        <id root="${SYNTH_ROOT}.3"/>
        <name>Synthetic Cardiology Practice</name>
      </representedOrganization>
      <assignedPerson><name><given>Avery</given><family>Lirio</family></name></assignedPerson>
      <id root="${NPI_ROOT}" extension="NPI-SYNTH-1"/>
    </assignedAuthor>
    <time value="20240301"/>
  </author>
  <author>
    <time value="20240302"/>
    <assignedAuthor>
      <id root="${NPI_ROOT}" extension="NPI-SYNTH-2"/>
      <assignedPerson><name><given>Bryn</given><family>Okonkwo</family></name></assignedPerson>
    </assignedAuthor>
  </author>
  <custodian/>
  <componentOf><encompassingEncounter>
    <id root="${SYNTH_ROOT}.6" extension="ENC-2"/>
  </encompassingEncounter></componentOf>`,
});

/**
 * TIER 2, vendor quirk. No `componentOf` at all, but a `documentationOf` service
 * event and a document `effectiveTime` that both carry dates. Reading an
 * encounter frame off either of them is exactly the fabrication AC-8 forbids.
 */
export const TIER2_NO_COMPONENT_OF = participationDoc({
  docOid: DISCHARGE_SUMMARY_OID,
  afterRecordTarget: `${DOCUMENT_AUTHOR}${CUSTODIAN}${DOCUMENTATION_OF}`,
});

/**
 * TIER 3, round trip. One document carrying all three participations, a section
 * with its own author and entries with and without one, so re-serialization is
 * proved over the whole participation surface rather than over a fragment of it.
 */
export const TIER3_ROUND_TRIP = participationDoc({
  docOid: DISCHARGE_SUMMARY_OID,
  afterRecordTarget: `${DOCUMENT_AUTHOR}${DEVICE_AUTHOR}${CUSTODIAN}${ENCOMPASSING_ENCOUNTER}`,
  sections: `
    <component><section>
      <templateId root="2.16.840.1.113883.10.20.22.2.6.1" extension="2015-08-01"/>
      <code code="48765-2" codeSystem="${LOINC}"/>
      <title>Allergies</title>
      <text>No known allergies.</text>${SECTION_AUTHOR}
    </section></component>${problemsSection({ sectionAuthor: SECTION_AUTHOR })}`,
});
