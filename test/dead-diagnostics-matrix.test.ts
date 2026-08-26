import { describe, expect, it } from "vitest";

import { parseCcda, CcdaParseError, WARNING_CODES } from "../src/index.js";

/**
 * The behaviour matrix for the three diagnostics that were declared but not
 * produced: `UNKNOWN_NAMESPACE_PREFIX`, `CcdaPosition.templateId`, and the
 * `NULL_FLAVORS` set. It exists because measuring these by hand once is not the
 * same as pinning them, and because the first measurement was taken over a
 * **lenient-mode projection** and therefore could not see the two real defects
 * in the change: a foreign vendor block taking the place of the
 * `NOT_A_CLINICAL_DOCUMENT` fatal, and taking the place of a safety-critical
 * per-element code, both under `{ strict: true }`.
 *
 * **So every row is run in BOTH modes and the snapshot filters nothing.** A
 * projection cannot support a monotonicity claim; that lesson is already
 * written down in this repo and was learned again here. If you change any of
 * the three, re-run this against the previous tree first and diff, rather than
 * updating the snapshot to whatever the new code says.
 */

const V3 = `xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`;
const LOINC = "2.16.840.1.113883.6.1";
/** Progress Note: a recognized document type whose required-section SHALL table is empty, so
 * every row below is quiet except for the deviation it plants. */
const QUIET_DOC = "2.16.840.1.113883.10.20.22.1.9";

/** Assemble a spec-clean CCD around one deliberate deviation. */
function doc(
  o: {
    readonly docRoot?: string;
    readonly ext?: string | null;
    readonly headerTemplate?: boolean;
    readonly extra?: string;
    readonly sectionRoot?: string;
    readonly genderNullFlavor?: string;
    readonly problemCodeSystem?: boolean;
  } = {},
): string {
  const ext = o.ext === null ? "" : ` extension="${o.ext ?? "2015-08-01"}"`;
  const header =
    o.headerTemplate === false
      ? ""
      : `<templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>`;
  const docRoot = o.docRoot ?? QUIET_DOC;
  const docTid = docRoot === "" ? "" : `<templateId root="${docRoot}"${ext}/>`;
  const gender =
    o.genderNullFlavor === undefined
      ? `<administrativeGenderCode code="F" codeSystem="2.16.840.1.113883.5.1"/>`
      : `<administrativeGenderCode nullFlavor="${o.genderNullFlavor}"/>`;
  const problemSystem = o.problemCodeSystem === false ? "" : ` codeSystem="2.16.840.1.113883.6.96"`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument ${V3}>
  <realmCode code="US"/>
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  ${header}${docTid}
  <id root="2.16.840.1.113883.19.5.99999.1" extension="DOC123"/>
  <code code="34133-9" codeSystem="${LOINC}"/>
  <title>Synthetic Test Document</title>
  <effectiveTime value="20240101120000-0500"/>
  <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
  <languageCode code="en-US"/>${o.extra ?? ""}
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN001" assigningAuthorityName="Sample Hospital"/>
    <patient><name><given>Jane</given><family>Doe</family></name>${gender}<birthTime value="19800101"/></patient>
  </patientRole></recordTarget>
  <component><structuredBody>
    <component><section>
      <templateId root="${o.sectionRoot ?? "2.16.840.1.113883.10.20.22.2.5.1"}" extension="2015-08-01"/>
      <code code="11450-4" codeSystem="${LOINC}"/>
      <title>Problems</title>
      <text><content ID="p1">Essential hypertension</content></text>
      <entry><act classCode="ACT" moodCode="EVN">
        <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
        <statusCode code="active"/>
        <effectiveTime><low value="20210101"/></effectiveTime>
        <entryRelationship typeCode="SUBJ"><observation classCode="OBS" moodCode="EVN">
          <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
          <code code="55607006" codeSystem="2.16.840.1.113883.6.96"/>
          <statusCode code="completed"/>
          <value xsi:type="CD" code="59621000"${problemSystem}/>
        </observation></entryRelationship>
      </act></entry>
    </section></component>
  </structuredBody></component>
</ClinicalDocument>`;
}

/** Every concept of the v3 NullFlavor code system, plus two non-members as controls. */
const NULL_FLAVOR_TOKENS = [
  "NI",
  "INV",
  "DER",
  "OTH",
  "NINF",
  "PINF",
  "UNC",
  "MSK",
  "NA",
  "UNK",
  "ASKU",
  "NAV",
  "NASK",
  "NAVU",
  "QS",
  "TRC",
  "NP",
  "NOPE",
  "unk",
] as const;

const ROWS: readonly { readonly name: string; readonly xml: string }[] = [
  { name: "clean CCD", xml: doc() },
  { name: "no R2.1 version stamp", xml: doc({ ext: null }) },
  // CCDA-5 added a fourth code carrying `position.templateId`, so these rows are
  // here for the same reason the row above is: the codes that name a template
  // root are the ones a profile `match` can be keyed on, and the matrix is where
  // that set is measured rather than asserted from memory. Both are on the QUIET
  // document type, so the only other diagnostic either draws is the
  // non-evaluation the stamp itself causes.
  { name: "post-R2.1 version stamp", xml: doc({ ext: "2024-05-01" }) },
  { name: "unrecognized version stamp", xml: doc({ ext: "1999-12-31" }) },
  { name: "version stamp not shaped like one", xml: doc({ ext: "Doe^Jane^1980" }) },
  { name: "unknown document template", xml: doc({ docRoot: "2.16.840.1.113883.3.9999.9" }) },
  { name: "no templateId at all", xml: doc({ docRoot: "", headerTemplate: false }) },
  { name: "vendor-stamped section", xml: doc({ sectionRoot: "2.16.840.1.113883.3.9999.1.1" }) },
  { name: "section root not shaped like a UID", xml: doc({ sectionRoot: "Doe^Jane^1980" }) },
  { name: "sdtc element", xml: doc({ extra: `<sdtc:x xmlns:sdtc="urn:hl7-org:sdtc"/>` }) },
  { name: "one foreign element", xml: doc({ extra: `<v:n xmlns:v="urn:example:vendor"/>` }) },
  {
    name: "four foreign elements, one namespace",
    xml: doc({ extra: `<v:a xmlns:v="urn:example:vendor"><v:b/><v:c><v:d/></v:c></v:a>` }),
  },
  {
    name: "two foreign namespaces",
    xml: doc({ extra: `<v:a xmlns:v="urn:example:vendor"/><o:b xmlns:o="urn:example:other"/>` }),
  },
  { name: "element with no namespace", xml: doc({ extra: `<bare xmlns=""/>` }) },
  {
    name: "foreign block + safety-critical code",
    xml: doc({ extra: `<v:a xmlns:v="urn:example:vendor"><v:b/></v:a>`, problemCodeSystem: false }),
  },
  {
    name: "foreign root, with children",
    xml: `<?xml version="1.0" encoding="UTF-8"?><Bundle xmlns="http://hl7.org/fhir"><id value="a"/><entry><resource/></entry></Bundle>`,
  },
  ...NULL_FLAVOR_TOKENS.map((t) => ({
    name: `gender nullFlavor=${t}`,
    xml: doc({ genderNullFlavor: t }),
  })),
];

/** Lenient reading: every code in emission order, no filtering. */
function lenient(xml: string): string {
  try {
    return (
      parseCcda(xml, { profile: null })
        .warnings.map(
          (w) =>
            w.code +
            (w.position.templateId === undefined ? "" : `@tid=${w.position.templateId}`) +
            (w.position.sectionCode === undefined ? "" : `@sec=${w.position.sectionCode}`),
        )
        .join(", ") || "silent"
    );
  } catch (err) {
    return `THREW ${err instanceof CcdaParseError ? err.code : "?"}`;
  }
}

/** Strict reading: which diagnostic wins the race to throw. This is the half a lenient-only projection cannot see. */
function strict(xml: string): string {
  try {
    parseCcda(xml, { profile: null, strict: true });
    return "no throw";
  } catch (err) {
    return err instanceof CcdaParseError ? err.code : "?";
  }
}

describe("dead-diagnostics behaviour matrix", () => {
  it("reads every shape the same way in lenient and strict mode", () => {
    const table = ROWS.map(
      (r) => `${r.name.padEnd(36)} | ${strict(r.xml).padEnd(24)} | ${lenient(r.xml)}`,
    );
    expect(table.join("\n")).toMatchInlineSnapshot(`
      "clean CCD                            | no throw                 | silent
      no R2.1 version stamp                | TEMPLATE_EXTENSION_ABSENT | TEMPLATE_EXTENSION_ABSENT@tid=2.16.840.1.113883.10.20.22.1.9
      post-R2.1 version stamp              | TEMPLATE_EXTENSION_UNMODELED_RELEASE | TEMPLATE_EXTENSION_UNMODELED_RELEASE@tid=2.16.840.1.113883.10.20.22.1.9, REQUIRED_SECTIONS_NOT_EVALUATED
      unrecognized version stamp           | TEMPLATE_EXTENSION_UNMODELED_RELEASE | TEMPLATE_EXTENSION_UNMODELED_RELEASE@tid=2.16.840.1.113883.10.20.22.1.9, REQUIRED_SECTIONS_NOT_EVALUATED
      version stamp not shaped like one    | TEMPLATE_EXTENSION_UNMODELED_RELEASE | TEMPLATE_EXTENSION_UNMODELED_RELEASE@tid=2.16.840.1.113883.10.20.22.1.9, REQUIRED_SECTIONS_NOT_EVALUATED
      unknown document template            | UNKNOWN_DOCUMENT_TEMPLATE | UNKNOWN_DOCUMENT_TEMPLATE
      no templateId at all                 | MISSING_TEMPLATE_ID      | MISSING_TEMPLATE_ID
      vendor-stamped section               | SECTION_MATCHED_BY_LOINC_FALLBACK | SECTION_MATCHED_BY_LOINC_FALLBACK@tid=2.16.840.1.113883.3.9999.1.1@sec=11450-4
      section root not shaped like a UID   | SECTION_MATCHED_BY_LOINC_FALLBACK | SECTION_MATCHED_BY_LOINC_FALLBACK@tid=<withheld>@sec=11450-4
      sdtc element                         | no throw                 | silent
      one foreign element                  | UNKNOWN_NAMESPACE_PREFIX | UNKNOWN_NAMESPACE_PREFIX
      four foreign elements, one namespace | UNKNOWN_NAMESPACE_PREFIX | UNKNOWN_NAMESPACE_PREFIX
      two foreign namespaces               | UNKNOWN_NAMESPACE_PREFIX | UNKNOWN_NAMESPACE_PREFIX, UNKNOWN_NAMESPACE_PREFIX
      element with no namespace            | UNKNOWN_NAMESPACE_PREFIX | UNKNOWN_NAMESPACE_PREFIX
      foreign block + safety-critical code | MISSING_CODE_SYSTEM      | MISSING_CODE_SYSTEM, UNKNOWN_NAMESPACE_PREFIX
      foreign root, with children          | NOT_A_CLINICAL_DOCUMENT  | THREW NOT_A_CLINICAL_DOCUMENT
      gender nullFlavor=NI                 | no throw                 | silent
      gender nullFlavor=INV                | no throw                 | silent
      gender nullFlavor=DER                | no throw                 | silent
      gender nullFlavor=OTH                | no throw                 | silent
      gender nullFlavor=NINF               | no throw                 | silent
      gender nullFlavor=PINF               | no throw                 | silent
      gender nullFlavor=UNC                | no throw                 | silent
      gender nullFlavor=MSK                | no throw                 | silent
      gender nullFlavor=NA                 | no throw                 | silent
      gender nullFlavor=UNK                | no throw                 | silent
      gender nullFlavor=ASKU               | no throw                 | silent
      gender nullFlavor=NAV                | no throw                 | silent
      gender nullFlavor=NASK               | no throw                 | silent
      gender nullFlavor=NAVU               | no throw                 | silent
      gender nullFlavor=QS                 | no throw                 | silent
      gender nullFlavor=TRC                | no throw                 | silent
      gender nullFlavor=NP                 | no throw                 | silent
      gender nullFlavor=NOPE               | INVALID_NULL_FLAVOR      | INVALID_NULL_FLAVOR
      gender nullFlavor=unk                | INVALID_NULL_FLAVOR      | INVALID_NULL_FLAVOR"
    `);
  });

  it("never lets a namespace deviation outrank a fatal or a safety-critical code", () => {
    // The two rows above that carry both, stated as an assertion rather than
    // left to be read out of a snapshot a future edit could simply re-record.
    const withFatal = ROWS.find((r) => r.name === "foreign root, with children");
    const withSafetyCritical = ROWS.find((r) => r.name === "foreign block + safety-critical code");
    expect(strict(withFatal?.xml ?? "")).toBe("NOT_A_CLINICAL_DOCUMENT");
    expect(strict(withSafetyCritical?.xml ?? "")).toBe(WARNING_CODES.MISSING_CODE_SYSTEM);
  });

  it("never lets the two stamp codes fire for the same templateId", () => {
    // CCDA-5 split one code into two, so the failure mode it introduces is
    // BOTH, or neither, rather than the wrong one. Stated as an assertion
    // instead of left to be read out of the snapshot, which a later edit could
    // simply re-record.
    const stampCodes: readonly string[] = [
      WARNING_CODES.TEMPLATE_EXTENSION_ABSENT,
      WARNING_CODES.TEMPLATE_EXTENSION_UNMODELED_RELEASE,
    ];
    for (const ext of [null, "2015-08-01", "2024-05-01", "1999-12-31", "Doe^Jane^1980"]) {
      const emitted = parseCcda(doc({ ext }), { profile: null }).warnings.filter((w) =>
        stampCodes.includes(w.code),
      );
      expect(emitted.length, String(ext)).toBeLessThanOrEqual(1);
      // And the R2.1 stamp is the only value that draws neither.
      expect(emitted.length, String(ext)).toBe(ext === "2015-08-01" ? 0 : 1);
    }
  });
});
