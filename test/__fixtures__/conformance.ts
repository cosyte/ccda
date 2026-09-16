/**
 * Synthetic, PHI-free fixtures for the conformance harness. Every value here is invented: the
 * canonical synthetic patient "Jane Q Doe" and the prefixed, non-MRN-shaped identifiers the
 * rest of this corpus already uses, declared in `scripts/phi-allow-list.txt`. No realistic PHI
 * ever lands in a fixture, per the repo's PHI-by-default rule, and nothing here was derived
 * from a real document.
 *
 * TWO GROUPS, SERVING DIFFERENT HALVES OF THE HARNESS.
 *
 *   1. {@link BUILT_DOCUMENT_CASES} are the `buildCcda` inits the harness validates against the
 *      normative artifacts. They cover both document types the builder emits and both ends of
 *      its input range: an init carrying nothing but a patient, and one populating every
 *      section the builder knows how to emit. The populated shapes mirror the inits the
 *      existing builder suite already exercises, so the harness measures the same emit paths
 *      the rest of the tests do rather than a set invented for it.
 *   2. The self-test Schematron, vocabulary and documents below are what `test/conformance/*`
 *      runs the harness against with the network boundary doubled. They are SMALL ON PURPOSE:
 *      the ordinary suite must stay runnable with no network, so it cannot fetch the real
 *      1 MB Schematron or its 65 MB vocabulary file. The small artifact still exercises every
 *      construct the real one leans on, because a driver that cannot do these cannot do that
 *      one: two phases, an abstract rule reached through `sch:extends`, a template-keyed rule
 *      context, first-rule-wins inside a pattern, and a value-set lookup through
 *      `document('voc.xml')`.
 */

import { gzipSync } from "node:zlib";

import type { BuildCcdaInit } from "../../src/index.js";

/**
 * A `buildCcda` init and the name the conformance report files its results under.
 */
export interface BuiltDocumentCase {
  /** Stable name, used as the report key. Never derived from content. */
  readonly name: string;
  /** The document type `buildCcda` emits for this init. */
  readonly documentType: "ccd" | "referralNote";
  /** The init itself. */
  readonly init: BuildCcdaInit;
}

/** The fully-populated init, shared by the CCD and Referral Note cases. */
const POPULATED: BuildCcdaInit = {
  patient: {
    mrn: "MRN001",
    given: ["Jane", "Q"],
    family: "Doe",
    gender: "F",
    birthTime: "19800101",
  },
  problems: [
    {
      problem: { code: "59621000", displayName: "Essential hypertension" },
      status: "active",
      onset: "20210101",
    },
    { problem: { code: "44054006", displayName: "Type 2 diabetes mellitus" }, status: "resolved" },
  ],
  allergies: [
    {
      allergen: { code: "7980", displayName: "Penicillin G" },
      reaction: { code: "247472004", displayName: "Hives" },
      severity: { code: "6736007", displayName: "Moderate" },
      criticality: { code: "CRITH", displayName: "High criticality" },
    },
    { noKnownAllergy: true },
  ],
  medications: [
    {
      drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" },
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" },
      frequency: { value: 24, unit: "h" },
      duration: { low: "20210101", high: "20211231" },
    },
    {
      drug: { code: "860975", displayName: "Metformin 500 MG Oral Tablet" },
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" },
      status: "resolved",
    },
  ],
  results: [
    {
      code: { code: "24323-8", displayName: "Comprehensive metabolic panel" },
      results: [
        {
          test: { code: "2345-7", displayName: "Glucose" },
          quantity: { value: 95, unit: "mg/dL" },
          referenceRange: {
            low: { value: 70, unit: "mg/dL" },
            high: { value: 100, unit: "mg/dL" },
          },
          interpretation: { code: "N", displayName: "Normal" },
          effectiveTime: "20240102",
        },
        {
          test: { code: "2951-2", displayName: "Sodium" },
          quantity: { value: 140, unit: "mmol/L" },
        },
      ],
    },
  ],
  vitalSigns: [
    {
      vitals: [
        {
          code: { code: "8480-6", displayName: "Systolic blood pressure" },
          quantity: { value: 120, unit: "mm[Hg]" },
          effectiveTime: "20240102",
        },
        {
          code: { code: "8462-4", displayName: "Diastolic blood pressure" },
          quantity: { value: 80, unit: "mm[Hg]" },
        },
      ],
    },
  ],
  immunizations: [
    {
      vaccine: {
        code: "140",
        displayName: "Influenza, split virus, trivalent, injectable, preservative free",
      },
      dose: { value: 0.5, unit: "mL" },
      route: { code: "C28161", displayName: "Intramuscular" },
      effectiveTime: "20240101",
    },
  ],
  procedures: [
    {
      code: { code: "80146002", displayName: "Appendectomy" },
      disposition: "performed",
      effectiveTime: "20230615",
    },
    { kind: "act", code: { code: "34896006", displayName: "Wound dressing change" } },
  ],
  encounters: [
    {
      type: { code: "99213", displayName: "Office outpatient visit 15 minutes" },
      status: "completed",
      period: { low: "20230615", high: "20230615" },
    },
  ],
  smokingStatus: [
    { value: { code: "8517006", displayName: "Former smoker" }, effectiveTime: "20240101" },
  ],
  functionalStatus: [
    { value: { code: "165245003", displayName: "Able to walk" }, effectiveTime: "20240101" },
  ],
};

/**
 * Every document `buildCcda` emits, across the init shapes the existing fixtures cover.
 *
 * The `effectiveTime` is fixed rather than defaulted to the clock: the conformance report is
 * compared byte for byte against its committed copy, so a document that carries "now" would
 * make every run disagree with the last one for a reason that has nothing to do with
 * conformance.
 */
export const BUILT_DOCUMENT_CASES: readonly BuiltDocumentCase[] = [
  {
    name: "ccd-minimal",
    documentType: "ccd",
    init: { patient: { mrn: "MRN002" }, effectiveTime: "20240102030405+0000" },
  },
  {
    name: "ccd-populated",
    documentType: "ccd",
    init: { ...POPULATED, effectiveTime: "20240102030405+0000" },
  },
  {
    name: "referral-note-minimal",
    documentType: "referralNote",
    init: {
      patient: { mrn: "MRN002" },
      documentType: "referralNote",
      effectiveTime: "20240102030405+0000",
    },
  },
  {
    name: "referral-note-populated",
    documentType: "referralNote",
    init: {
      ...POPULATED,
      documentType: "referralNote",
      effectiveTime: "20240102030405+0000",
      reasonForReferral: "Referred for evaluation of blood pressure control.",
      assessment: "Stable. Follow up in three months.",
    },
  },
];

/** The token seeded into the marker document's text, attributes and narrative. */
export const MARKER_TOKEN = "ZZCONFORMANCEMARKERZZ";

/** Template root the self-test Schematron keys its rules on. Invented, not a real C-CDA OID. */
const SELF_TEST_ROOT = "9.9.9.1";

/**
 * A small ISO Schematron exercising every construct the real artifact leans on.
 *
 * Two phases, an abstract rule spliced in through `sch:extends`, a template-keyed rule context,
 * two rules in one pattern so first-rule-wins is observable, and a value-set lookup through
 * `document('voc.xml')`.
 */
export const SELF_TEST_SCHEMATRON = `<?xml version="1.0" encoding="utf-8"?>
<sch:schema xmlns:sch="http://purl.oclc.org/dsdl/schematron" xmlns:cda="urn:hl7-org:v3" xmlns:voc="http://www.lantanagroup.com/voc">
  <sch:ns prefix="cda" uri="urn:hl7-org:v3"/>
  <sch:ns prefix="voc" uri="http://www.lantanagroup.com/voc"/>
  <sch:phase id="errors">
    <sch:active pattern="p-self-test-errors"/>
    <sch:active pattern="p-self-test-order"/>
  </sch:phase>
  <sch:phase id="warnings">
    <sch:active pattern="p-self-test-warnings"/>
  </sch:phase>
  <sch:pattern id="p-self-test-errors">
    <sch:rule id="r-self-test-abstract" abstract="true">
      <sch:assert id="a-self-1" test="count(cda:id) > 0">SHALL contain at least one [1..*] id (CONF:self-1).</sch:assert>
      <sch:assert id="a-self-2" test="cda:statusCode[@code and @code=document('voc.xml')/voc:systems/voc:system[@valueSetOid='9.9.9.100']/voc:code/@value]">This statusCode SHALL be selected from ValueSet SelfTestStatus (CONF:self-2).</sch:assert>
    </sch:rule>
    <sch:rule id="r-self-test" context="cda:observation[cda:templateId[@root='${SELF_TEST_ROOT}']]">
      <sch:extends rule="r-self-test-abstract"/>
      <sch:assert id="a-self-3" test="count(cda:code)=1">SHALL contain exactly one [1..1] code (CONF:self-3).</sch:assert>
    </sch:rule>
  </sch:pattern>
  <sch:pattern id="p-self-test-order">
    <sch:rule id="r-self-test-first" context="cda:observation[cda:templateId[@root='${SELF_TEST_ROOT}']]">
      <sch:assert id="a-self-4" test="@classCode='OBS'">SHALL contain exactly one [1..1] @classCode="OBS" (CONF:self-4).</sch:assert>
    </sch:rule>
    <sch:rule id="r-self-test-second" context="cda:observation">
      <sch:assert id="a-self-5" test="false()">This rule is shadowed by the one before it for a self-test observation (CONF:self-5).</sch:assert>
    </sch:rule>
  </sch:pattern>
  <sch:pattern id="p-self-test-warnings">
    <sch:rule id="r-self-test-warning" context="cda:observation[cda:templateId[@root='${SELF_TEST_ROOT}']]">
      <sch:assert id="a-self-6" test="count(cda:code)=1">SHOULD contain exactly one [1..1] code (CONF:self-6).</sch:assert>
    </sch:rule>
  </sch:pattern>
</sch:schema>
`;

/** The vocabulary file the self-test Schematron's `document('voc.xml')` call resolves to. */
export const SELF_TEST_VOCABULARY = `<?xml version="1.0" encoding="utf-8"?>
<systems xmlns="http://www.lantanagroup.com/voc">
  <system valueSetOid="9.9.9.100" valueSetName="SelfTestStatus">
    <code value="completed" displayName="Completed" codeSystem="2.16.840.1.113883.5.14"/>
  </system>
</systems>
`;

/**
 * A schema that accepts any `ClinicalDocument`, for the tests that drive a WHOLE run rather
 * than one layer.
 *
 * A full run validates the documents `buildCcda` emits against whatever schema the network
 * served it, and those tests are about the run's plumbing (what it fetches, what it refuses,
 * what it leaves on disk) rather than about C-CDA's schema. Serving the strict self-test
 * schema there would bury the property under a hundred irrelevant findings; serving the real
 * CDA R2 schema is not available to a suite that takes no network. The strict schema below is
 * used where the schema IS the subject.
 */
export const PERMISSIVE_SCHEMA = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:hl7-org:v3"
           xmlns="urn:hl7-org:v3" elementFormDefault="qualified">
  <xs:element name="ClinicalDocument">
    <xs:complexType>
      <xs:sequence>
        <xs:any minOccurs="0" maxOccurs="unbounded" processContents="skip"/>
      </xs:sequence>
      <xs:anyAttribute processContents="skip"/>
    </xs:complexType>
  </xs:element>
</xs:schema>
`;

/** An XML schema for the self-test documents, standing in for the CDA R2 schema set. */
export const SELF_TEST_SCHEMA = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:hl7-org:v3"
           xmlns="urn:hl7-org:v3" elementFormDefault="qualified">
  <xs:element name="ClinicalDocument">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="templateId" minOccurs="0" maxOccurs="unbounded">
          <xs:complexType><xs:attribute name="root" type="xs:string"/></xs:complexType>
        </xs:element>
        <xs:element name="title" minOccurs="0"/>
        <xs:element ref="observation" minOccurs="0" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
  <xs:element name="observation">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="templateId" minOccurs="0" maxOccurs="unbounded">
          <xs:complexType><xs:attribute name="root" type="xs:string"/></xs:complexType>
        </xs:element>
        <xs:element name="id" minOccurs="0" maxOccurs="unbounded">
          <xs:complexType><xs:attribute name="extension" type="xs:string"/></xs:complexType>
        </xs:element>
        <xs:element name="code" minOccurs="0">
          <xs:complexType>
            <xs:attribute name="code" type="xs:string"/>
            <xs:attribute name="displayName" type="xs:string"/>
          </xs:complexType>
        </xs:element>
        <xs:element name="text" minOccurs="0"/>
        <xs:element name="statusCode" minOccurs="0">
          <xs:complexType><xs:attribute name="code" type="ActStatusCode"/></xs:complexType>
        </xs:element>
      </xs:sequence>
      <xs:attribute name="classCode" type="ActClassCode"/>
    </xs:complexType>
  </xs:element>
  <!-- Two enumerated attribute types, so the marker document produces a real schema
       violation whose engine message quotes the offending VALUE. That is the message shape
       the redaction seam exists for, and a schema with no such type could not grade it. -->
  <xs:simpleType name="ActClassCode">
    <xs:restriction base="xs:string"><xs:enumeration value="OBS"/></xs:restriction>
  </xs:simpleType>
  <xs:simpleType name="ActStatusCode">
    <xs:restriction base="xs:string"><xs:enumeration value="completed"/></xs:restriction>
  </xs:simpleType>
</xs:schema>
`;

/** A self-test document that satisfies every error-phase assertion above. */
export const SELF_TEST_GOOD_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <title>Self-test, conformant</title>
  <observation classCode="OBS">
    <templateId root="${SELF_TEST_ROOT}"/>
    <id extension="self-obs-1"/>
    <code code="55607006" displayName="Problem"/>
    <text>Self-test observation</text>
    <statusCode code="completed"/>
  </observation>
</ClinicalDocument>
`;

/**
 * A self-test document that fails three error-phase assertions: no `id`, a `statusCode` outside
 * the value set, and a missing `code`.
 */
export const SELF_TEST_BAD_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <title>Self-test, non-conformant</title>
  <observation classCode="OBS">
    <templateId root="${SELF_TEST_ROOT}"/>
    <text>Self-test observation</text>
    <statusCode code="suspended"/>
  </observation>
</ClinicalDocument>
`;

/**
 * A non-conformant self-test document whose element text, attribute values and narrative all
 * carry {@link MARKER_TOKEN}. Every assertion it trips is one whose finding a leaking report
 * would carry the marker into.
 */
export const SELF_TEST_MARKER_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <title>${MARKER_TOKEN}</title>
  <observation classCode="${MARKER_TOKEN}">
    <templateId root="${SELF_TEST_ROOT}"/>
    <text>${MARKER_TOKEN}</text>
    <statusCode code="${MARKER_TOKEN}"/>
  </observation>
</ClinicalDocument>
`;

/** One member of a synthetic corpus archive. */
export interface ArchiveEntry {
  /** Path inside the archive, without the top-level directory the writer adds. */
  readonly path: string;
  /** The member's text. */
  readonly text: string;
}

/**
 * Build a gzipped tar archive the fetch layer's own reader unpacks.
 *
 * This produces BYTES FOR THE NETWORK BOUNDARY, it is not a double: the tests that use it
 * drive the real archive reader, the real content digest and the real emptiness refusal over
 * an archive whose content they chose. A `tar` binary is not reachable from every platform
 * this suite runs on, and shelling out to one would make the corpus the shell's product
 * rather than the test's.
 *
 * @param entries - The members to write. A top-level directory is prefixed, as the host's own
 *   generated tarballs carry one, so the reader's prefix stripping is exercised too.
 * @returns The gzipped archive.
 * @example
 * ```ts
 * const archive = writeTarGz([{ path: "a.xml", text: "<x/>" }]);
 * ```
 */
export function writeTarGz(entries: readonly ArchiveEntry[]): Uint8Array {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.text, "utf8");
    const header = Buffer.alloc(512);
    header.write(`self-test-corpus/${entry.path}`, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "utf8");
    header.write("0000000\0", 108, 8, "utf8");
    header.write("0000000\0", 116, 8, "utf8");
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
    header.write("00000000000\0", 136, 12, "utf8");
    // The checksum field is computed over a header whose own checksum field is spaces.
    header.write("        ", 148, 8, "utf8");
    header.write("0", 156, 1, "utf8");
    header.write("ustar\0", 257, 6, "utf8");
    header.write("00", 263, 2, "utf8");
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return new Uint8Array(gzipSync(Buffer.concat(blocks)));
}
