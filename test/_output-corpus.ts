/**
 * The corpus the output-equivalence test runs over, and the record it takes of one document.
 *
 * Shared by the capture script (`scripts/capture-output-digests.ts`, which runs it against a base
 * ref) and by the test that asserts head against the captured digests
 * (`test/output-equivalence.test.ts`), so the two can never come to disagree about what a document
 * is or what "the outputs" are. Neither carries its own copy.
 *
 * The record is everything a caller can observe of a parse, an edit and a write for one document:
 * the parsed model (every field, `undefined` kept apart from absent), its warnings in order and as
 * the `onWarning` handler saw them, its `toString()`, the same under strict mode, a validating
 * parse, a profile, tight limits and a parse of its own output, three edits and a second edit of
 * an edit, and every error any of them throws (its class, code, message and position). A change
 * that is meant to make these faster and nothing else must leave every record byte-identical,
 * which is what the digests pin.
 *
 * The corpus is built in code and is the same on every run: this package's own fixtures, the
 * benchmark shapes at small sizes, documents written here for the paths a performance change
 * touches (entity references, line endings, XML syntax a reader may take or refuse: quoting,
 * comments, CDATA, processing instructions, character references, namespaces, repeated attributes,
 * malformed tags; subject declarations; limits), and documents drawn
 * from `@cosyte/ccda/arbitraries` on fixed seeds, clean, messy and hostile. Every document is
 * synthetic: the patient is the placeholder Jane Doe and every identifier is made up.
 */

import { createHash } from "node:crypto";

import fc from "fast-check";

import { documentText, hostileInput } from "../src/arbitraries/text.js";
import {
  ccd,
  editOptions,
  referralNote,
  unstructuredDocument,
  validationOptions,
} from "../bench/shapes.mjs";
import { QUICKSTART_CCD } from "./__fixtures__/first-use.js";
import {
  ALLERGIES_SECTION,
  ALLERGY_ENTRY_SECTION,
  DISCHARGE_MEDICATIONS_SECTION,
  ENCOUNTERS_SECTION,
  FAMILY_HISTORY_SECTION,
  FUNCTIONAL_STATUS_ASSESSMENT_SCALE_SECTION,
  FUNCTIONAL_STATUS_SECTION,
  GOALS_SECTION,
  HEALTH_CONCERNS_SECTION,
  HISTORY_OF_PRESENT_ILLNESS_SECTION,
  HOSPITAL_DISCHARGE_DIAGNOSIS_SECTION,
  IMMUNIZATIONS_SECTION,
  LOINC_ONLY_SECTION,
  MEDICATIONS_SECTION,
  MENTAL_STATUS_ASSESSMENT_SCALE_SECTION,
  MENTAL_STATUS_SECTION,
  NKA_SECTION,
  PAST_MEDICAL_HISTORY_SECTION,
  PLANNED_PROCEDURE_SECTION,
  PLAN_OF_TREATMENT_SECTION,
  PROBLEMS_SECTION,
  PROCEDURES_SECTION,
  REASON_FOR_REFERRAL_SECTION,
  RESULTS_SECTION,
  SMOKING_UNKNOWN_SECTION,
  SOCIAL_HISTORY_SECTION,
  TRIAD_SECTIONS,
  UNKNOWN_SECTION,
  VITALS_SECTION,
  buildCcda as fixtureDocument,
  stampFixtures,
} from "./__fixtures__/ccda.js";
import {
  TIER1_AUTHORED,
  TIER1_DISCHARGE,
  TIER2_BARE_AUTHOR,
  TIER2_CONTRADICTORY_ENTRY_ID,
  TIER2_MALFORMED,
  TIER2_NO_AUTHOR,
  TIER2_NO_COMPONENT_OF,
  TIER2_UNCLAIMED_ENTRY_ID,
  TIER2_UNIDENTIFIED,
  TIER2_UNREADABLE_TIMES,
  TIER3_ROUND_TRIP,
} from "./__fixtures__/header-participations.js";

import type * as Ccda from "../src/index.js";

/** The surface a record reads, the same on the base tree and on head. */
export type OutputApi = typeof Ccda;

/** One document, named so a difference can be attributed. */
export interface OutputDocument {
  readonly name: string;
  readonly text: string;
}

/** Draw `count` values from `arbitrary` on a fixed seed. */
function draw(arbitrary: fc.Arbitrary<string>, seed: number, count: number): string[] {
  return fc.sample(arbitrary, { seed, numRuns: count });
}

const SNOMED = "2.16.840.1.113883.6.96";

/** A readable subject declaration naming a relative. */
const RELATIVE_SUBJECT = `<subject><relatedSubject classCode="PRS"><code code="MTH" codeSystem="2.16.840.1.113883.5.111"/><subject><name><given>Jane</given><family>Doe</family></name></subject></relatedSubject></subject>`;

/** A Problem Concern Act entry, with an optional subject on the act and on its observation. */
function problemEntry(n: number, actSubject = "", obsSubject = ""): string {
  return `
          <entry>
            <act classCode="ACT" moodCode="EVN">
              <templateId root="2.16.840.1.113883.10.20.22.4.3" extension="2015-08-01"/>
              <id root="2.16.840.1.113883.19.5.99999.3" extension="pca-${String(n)}"/>
              <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
              <statusCode code="active"/>
              <effectiveTime><low value="20200101"/></effectiveTime>${actSubject}
              <entryRelationship typeCode="SUBJ">
                <observation classCode="OBS" moodCode="EVN">
                  <templateId root="2.16.840.1.113883.10.20.22.4.4" extension="2015-08-01"/>
                  <id root="2.16.840.1.113883.19.5.99999.4" extension="po-${String(n)}"/>
                  <code code="55607006" codeSystem="${SNOMED}"/>
                  <statusCode code="completed"/>
                  <effectiveTime><low value="20200101"/></effectiveTime>
                  <value xsi:type="CD" code="59621000" codeSystem="${SNOMED}" displayName="Essential hypertension"/>${obsSubject}
                </observation>
              </entryRelationship>
            </act>
          </entry>`;
}

/** A Problems section with optional subject, entries and nested subsections. */
function problemsSection(subject: string, entries: string, subsections = ""): string {
  return `
      <component>
        <section>
          <templateId root="2.16.840.1.113883.10.20.22.2.5.1" extension="2015-08-01"/>
          <code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>
          <title>Problems</title>
          <text><paragraph>Problems.</paragraph></text>${subject}${entries}${subsections}
        </section>
      </component>`;
}

/** Documents written here for the code paths a performance change touches. */
function writtenDocuments(): OutputDocument[] {
  const docs: OutputDocument[] = [];
  const add = (name: string, text: string): void => {
    docs.push({ name: `written:${name}`, text });
  };
  const titled = (title: string): string =>
    fixtureDocument().replace("<title>Synthetic Test Document</title>", `<title>${title}</title>`);

  // Entity references: predefined in any case, numeric, custom, and the two non-ASCII letters a
  // case-insensitive Unicode pattern folds onto ASCII ones.
  for (const [name, title] of [
    ["predefined", "a &amp; b &lt; c &gt; d &quot; e &apos; f"],
    ["predefined-upper", "&AMP; &Lt; &GT; &Quot; &APOS;"],
    ["numeric", "&#65; &#x42; &#8232; &#x2029; &#133; &#13;"],
    ["custom-one", "&custom;"],
    ["custom-many", "&a; &b.c; &d-e; &_f; &g1;"],
    ["custom-unicode", "&\u017Fx; &\u212Ay; &x\u017F; &\u00E9t\u00E9;"],
    ["broken-refs", "& amp; &amp &a b; &&a; &;"],
  ] as const) {
    add(`entities-${name}`, titled(title));
  }
  add(
    "entities-at-limit",
    titled(Array.from({ length: 1000 }, (_v, i) => `&e${String(i)};`).join("")),
  );
  add(
    "entities-over-limit",
    titled(Array.from({ length: 1001 }, (_v, i) => `&e${String(i)};`).join("")),
  );
  add(
    "entities-in-attribute",
    fixtureDocument().replace('extension="DOC123"', 'extension="&x;&y;"'),
  );

  // Line endings: every form the XML end-of-line rule folds, in text and between tags.
  const base = fixtureDocument();
  add("crlf", base.replace(/\n/gu, "\r\n"));
  add("cr", base.replace(/\n/gu, "\r"));
  add("nel", base.replace(/\n/gu, "\u0085"));
  add("ls", base.replace(/\n/gu, "\u2028"));
  add("ps", base.replace(/\n/gu, "\u2029"));
  add("cr-nel", base.replace(/\n/gu, "\r\u0085"));
  // NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR are line breaks in XML 1.1 only: in XML 1.0 they
  // are kept where character data is, and the four documents above, which hold them outside the
  // root, are not XML. These hold them only where XML 1.0 allows them.
  const rootStart = base.indexOf("<ClinicalDocument");
  const rootEnd = base.lastIndexOf("</ClinicalDocument>");
  for (const [name, ch] of [
    ["nel", "\u0085"],
    ["ls", "\u2028"],
    ["ps", "\u2029"],
  ] as const) {
    add(
      `${name}-between-elements`,
      base.slice(0, rootStart) +
        base.slice(rootStart, rootEnd).replace(/>\n/gu, `>${ch}`) +
        base.slice(rootEnd),
    );
    add(
      `${name}-in-every-place`,
      base
        .replace(
          "<title>Synthetic Test Document</title>",
          `<title>x${ch}y</title><!--x${ch}y--><?synthetic x${ch}y?><![CDATA[x${ch}y]]>`,
        )
        .replace('extension="DOC123"', `extension="x${ch}y"`),
    );
  }
  add("mixed-endings", titled("a\r\nb\rc\u0085d\u2028e\u2029f"));
  add(
    "line-endings-in-attribute",
    base.replace('extension="DOC123"', 'extension="a\r\nb\tc\u2028d"'),
  );
  add("bom", `\uFEFF${base}`);
  add("bom-only", "\uFEFF");
  add("empty", "");
  add("long-line", titled("x".repeat(20_000)));

  // Structure limits and hostile shapes.
  add("dtd", `<!DOCTYPE ClinicalDocument>${base}`);
  add("entity-decl", `<!ENTITY x "y">${base}`);
  add("deep", base.replace("<title>", `${"<a>".repeat(30)}${"</a>".repeat(30)}<title>`));
  add("wide", base.replace("<title>", `${"<b/>".repeat(400)}<title>`));
  add(
    "foreign-namespace",
    base.replace("<title>", '<v:ext xmlns:v="urn:example:vendor"><v:x/></v:ext><title>'),
  );
  add("no-namespace", base.replace("<title>", '<plain xmlns=""/><title>'));
  add("not-clinical", '<?xml version="1.0"?><Other xmlns="urn:hl7-org:v3"/>');
  add("wrong-namespace", '<ClinicalDocument xmlns="urn:example:other"/>');
  add("malformed", `${base.slice(0, Math.floor(base.length / 2))}`);
  add("cdata-and-comment", titled("<![CDATA[a ]]> b]]><!-- c -->"));
  add("processing-instruction", base.replace("<title>", "<?vendor data?><title>"));

  // XML syntax, as a parse path reads it. Each construct sits before the title, followed by an
  // element in a foreign namespace whose warning carries a line and column read after it; most
  // are refused or recovered from, which pins the error or the recovery as well.
  const marked = (construct: string): string =>
    base.replace("<title>", `${construct}<v:mark xmlns:v="urn:example:vendor"/><title>`);
  const manyAttributes = Array.from({ length: 12 }, (_v, i) => `a${String(i)}="${String(i)}"`);
  for (const [name, construct] of [
    ["single-quotes", `<a b='1' c = "2"\n d\t=\t'3'/>`],
    ["attribute-white-space", `<a b="x\ty\nz" c="&#9;&#10;&#13;&#x20;"/>`],
    ["attribute-references", `<a b="&amp;&lt;&gt;&quot;&apos;" c="a>b" d='"' e="'"/>`],
    ["attribute-entity", `<a b="&custom;"/>`],
    ["comment", "<!-- a - b -->\n<!---->"],
    ["comment-double-dash", "<!-- a -- b -->"],
    ["comment-trailing-dash", "<!-- a --->"],
    ["comment-unterminated", "<!-- a"],
    ["cdata", "<c><![CDATA[a<b&c]]]]></c>"],
    ["cdata-empty", "<c>a<![CDATA[]]>b</c>"],
    ["cdata-unterminated", "<c><![CDATA[a</c>"],
    ["instructions", "<?pi?><?pi data ?><?pi  two  spaces ?>"],
    ["instruction-xml-inside", '<?xml version="1.0"?>'],
    ["instruction-xml-upper", "<?XML x?>"],
    ["instruction-colon-target", "<?a:b c?>"],
    ["instruction-unterminated", "<?pi a"],
    ["numeric-references", "<c>&#65;&#x41;&#x1F600;&#0065;&#xd7ff;</c>"],
    ["numeric-upper-x", "<c>&#X41;</c>"],
    ["numeric-zero", "<c>&#0;</c>"],
    ["numeric-surrogate", "<c>&#xD800;</c>"],
    ["numeric-out-of-range", "<c>&#x110000;</c>"],
    ["numeric-fffe", "<c>&#xFFFE;</c>"],
    ["numeric-leading-zeros", "<c>&#00000000065;</c>"],
    ["numeric-letters", "<c>&#6a;</c>"],
    ["stray-ampersand", "<c>AT&T &amp T & T</c>"],
    ["non-ascii-text", "<c>caf\u00e9 \ud83d\ude00</c><d/>"],
    ["non-ascii-name", "<caf\u00e9/>"],
    ["control-in-text", "<c>a\u0001b</c>"],
    ["fffe-in-text", "<c>a\uFFFEb</c>"],
    ["lone-surrogate-in-text", "<c>a\ud800b</c>"],
    ["lone-surrogate-in-comment", "<!-- \ud800 -->"],
    ["nel-in-tag", "<a\u0085b='1'/>"],
    ["c1-in-tag", "<a\u0080b='1'/>"],
    ["nbsp-in-tag", "<a\u00a0b='1'/>"],
    ["control-in-tag", "<a\u0001b='1'/>"],
    ["no-space-between-attributes", `<a b="1"c="2"/>`],
    ["unquoted-attribute", "<a b=1/>"],
    ["attribute-without-value", "<a b/>"],
    ["less-than-in-attribute", `<a b="<"/>`],
    ["repeated-attribute", `<a b="1" b="2"/>`],
    ["same-expanded-name", `<a xmlns:p="urn:x" xmlns:q="urn:x" p:b="1" q:b="2"/>`],
    ["many-attributes", `<a ${manyAttributes.join(" ")}/>`],
    ["many-attributes-repeated", `<a ${manyAttributes.join(" ")} a3="x"/>`],
    [
      "many-attributes-same-expanded-name",
      `<a xmlns:p="urn:x" xmlns:q="urn:x" ${manyAttributes.join(" ")} p:b="1" q:b="2"/>`,
    ],
    ["unbound-element-prefix", "<p:a/>"],
    ["unbound-attribute-prefix", `<a p:b="1"/>`],
    ["prefix-bound-to-nothing", `<a xmlns:p=""/>`],
    ["xml-prefix-declared", `<a xmlns:xml="http://www.w3.org/XML/1998/namespace"/>`],
    ["xmlns-prefix-declared", `<a xmlns:xmlns="urn:x"/>`],
    ["xml-namespace-bound", `<a xmlns:p="http://www.w3.org/XML/1998/namespace"/>`],
    ["xmlns-namespace-bound", `<a xmlns:p="http://www.w3.org/2000/xmlns/"/>`],
    ["xml-lang", `<a xml:lang="en"/>`],
    ["xml-prefixed-element", "<xml:a/>"],
    ["xmlns-element", "<xmlns/>"],
    ["xmlns-prefixed-element", "<xmlns:a/>"],
    ["default-namespace-undeclared", `<a xmlns=""><b/></a>`],
    ["default-namespace-other", `<a xmlns="urn:example:other"><b xmlns="urn:hl7-org:v3"/></a>`],
    ["prefix-rebound", `<p:a xmlns:p="urn:x"><p:b xmlns:p="urn:y"/><p:c/></p:a>`],
    ["prefix-out-of-scope", `<a xmlns:p="urn:x"/><p:b/>`],
    [
      "xsi-other-prefix",
      `<value xmlns:x="http://www.w3.org/2001/XMLSchema-instance" x:type="CD"/>`,
    ],
    ["end-tag-space", "<a></a >"],
    ["end-tag-line-feed", "<a></a\n>"],
    ["end-tag-trailing-content", "<a></a\nb>"],
    ["end-tag-mismatch", "<a></b>"],
    ["end-tag-longer", "<a></ab>"],
    ["end-tag-prefixed", `<a xmlns:p="urn:x"></a:p>`],
    ["end-tag-unopened", "</a>"],
    ["self-close-space", "<a/ >"],
    ["self-close-after-attribute", `<a b="1" />`],
    ["bare-less-than", "<c>a < b</c>"],
    ["less-than-digit", "<c>a <1 b</c>"],
    ["bang-element", "<!ELEMENT a>"],
    ["bang-other", "<!-x>"],
    ["tabs-before", "\t\t<a/>\t"],
  ] as const) {
    add(`xml-${name}`, marked(construct));
  }
  add(
    "declaration-single-quotes",
    base.replace(/^<\?xml[^>]*\?>/u, "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"),
  );
  add("declaration-version-only", base.replace(/^<\?xml[^>]*\?>/u, '<?xml version="1.0"?>'));
  add("declaration-bad-version", base.replace(/^<\?xml[^>]*\?>/u, '<?xml version="2.0"?>'));
  add("declaration-upper", base.replace(/^<\?xml/u, "<?XML"));
  add("declaration-spaced", base.replace(/^<\?xml[^>]*\?>/u, '<?xml   version = "1.0"   ?>'));
  add("space-before-declaration", ` ${base}`);
  add("prolog", base.replace("<ClinicalDocument", "<!-- c -->\n<?pi x?>\n<ClinicalDocument"));
  add("after-root", `${base}\n<!-- c -->\n<?pi x?>\n`);
  add("text-after-root", `${base}x`);
  add("cdata-after-root", `${base}<![CDATA[x]]>`);
  add("second-root", `${base}<ClinicalDocument xmlns="urn:hl7-org:v3"/>`);
  add("text-before-root", base.replace("<ClinicalDocument", "x<ClinicalDocument"));
  add("unclosed-root", base.replace("</ClinicalDocument>", ""));
  add(
    "prefixed-root",
    base
      .replace("<ClinicalDocument", '<cda:ClinicalDocument xmlns:cda="urn:hl7-org:v3"')
      .replace("</ClinicalDocument>", "</cda:ClinicalDocument>"),
  );

  // Subject declarations: on a section, an act, a nested observation, a subsection and the Family
  // History Organizer's own slot.
  const subjects: [string, string][] = [
    ["subject-none", problemsSection("", problemEntry(1) + problemEntry(2))],
    ["subject-section", problemsSection(RELATIVE_SUBJECT, problemEntry(1) + problemEntry(2))],
    ["subject-section-empty", problemsSection(RELATIVE_SUBJECT, "")],
    ["subject-act", problemsSection("", problemEntry(1, RELATIVE_SUBJECT) + problemEntry(2))],
    [
      "subject-observation",
      problemsSection("", problemEntry(1) + problemEntry(2, "", RELATIVE_SUBJECT)),
    ],
    ["subject-null", problemsSection("", problemEntry(1, '<subject nullFlavor="UNK"/>'))],
    [
      "subject-subsection",
      problemsSection(RELATIVE_SUBJECT, "", problemsSection("", problemEntry(3))),
    ],
    ["subject-subsection-empty", problemsSection(RELATIVE_SUBJECT, "", problemsSection("", ""))],
    [
      "subject-inner-subsection",
      problemsSection("", problemEntry(1), problemsSection(RELATIVE_SUBJECT, problemEntry(2))),
    ],
    ["subject-family-history", FAMILY_HISTORY_SECTION],
    [
      "subject-family-history-under-section",
      FAMILY_HISTORY_SECTION.replace("<entry>", `${RELATIVE_SUBJECT}<entry>`),
    ],
    [
      "subject-family-history-stamped",
      FAMILY_HISTORY_SECTION.replace(
        '<templateId root="2.16.840.1.113883.10.20.22.4.45" extension="2015-08-01"/>',
        '<templateId root="2.16.840.1.113883.10.20.22.4.45" extension="2015-08-01"/><templateId root="2.16.840.1.113883.10.20.22.4.1"/>',
      ),
    ],
  ];
  for (const [name, sections] of subjects) add(name, fixtureDocument({ sections }));
  return docs;
}

/** The benchmark shapes, at small sizes. */
function benchDocuments(): OutputDocument[] {
  const docs: OutputDocument[] = [];
  const add = (name: string, text: string): void => {
    docs.push({ name: `bench:${name}`, text });
  };
  for (let i = 0; i < 3; i++) add(`referral-${String(i)}`, referralNote(i));
  add("ccd-12", ccd(0, 12));
  add("ccd-60", ccd(1, 60));
  add("pdf-2k", unstructuredDocument(0, 2048));
  add("pdf-40k", unstructuredDocument(1, 40 * 1024));
  return docs;
}

/** This package's own fixtures: every section the fixture builder has, and the header shapes. */
function fixtureDocuments(): OutputDocument[] {
  const docs: OutputDocument[] = [];
  const add = (name: string, text: string): void => {
    docs.push({ name: `fixture:${name}`, text });
  };
  const sections: Record<string, string> = {
    ALLERGIES_SECTION,
    ALLERGY_ENTRY_SECTION,
    DISCHARGE_MEDICATIONS_SECTION,
    ENCOUNTERS_SECTION,
    FAMILY_HISTORY_SECTION,
    FUNCTIONAL_STATUS_ASSESSMENT_SCALE_SECTION,
    FUNCTIONAL_STATUS_SECTION,
    GOALS_SECTION,
    HEALTH_CONCERNS_SECTION,
    HISTORY_OF_PRESENT_ILLNESS_SECTION,
    HOSPITAL_DISCHARGE_DIAGNOSIS_SECTION,
    IMMUNIZATIONS_SECTION,
    LOINC_ONLY_SECTION,
    MEDICATIONS_SECTION,
    MENTAL_STATUS_ASSESSMENT_SCALE_SECTION,
    MENTAL_STATUS_SECTION,
    NKA_SECTION,
    PAST_MEDICAL_HISTORY_SECTION,
    PLANNED_PROCEDURE_SECTION,
    PLAN_OF_TREATMENT_SECTION,
    PROBLEMS_SECTION,
    PROCEDURES_SECTION,
    REASON_FOR_REFERRAL_SECTION,
    RESULTS_SECTION,
    SMOKING_UNKNOWN_SECTION,
    SOCIAL_HISTORY_SECTION,
    TRIAD_SECTIONS,
    UNKNOWN_SECTION,
    VITALS_SECTION,
  };
  for (const [name, section] of Object.entries(sections)) {
    add(name, fixtureDocument({ sections: section }));
  }
  add("all-sections", fixtureDocument({ sections: Object.values(sections).join("") }));
  add("default", fixtureDocument());
  add("no-declaration", fixtureDocument({ xmlDecl: false }));
  add("with-bom", fixtureDocument({ withBom: true }));
  add("non-xml-body", fixtureDocument({ nonXmlBody: true }));
  add("two-record-targets", fixtureDocument({ recordTargets: 2 }));
  add("no-doc-template", fixtureDocument({ includeDocTemplate: false }));
  add("referral", fixtureDocument({ docTypeOid: "2.16.840.1.113883.10.20.22.1.14" }));
  const stamps = stampFixtures(TRIAD_SECTIONS);
  add("stamp-r11", stamps.r11Origin);
  add("stamp-r21", stamps.r21);
  add("stamp-post-r21", stamps.postR21);
  add("quickstart", QUICKSTART_CCD);
  const header: Record<string, string> = {
    TIER1_AUTHORED,
    TIER1_DISCHARGE,
    TIER2_BARE_AUTHOR,
    TIER2_CONTRADICTORY_ENTRY_ID,
    TIER2_MALFORMED,
    TIER2_NO_AUTHOR,
    TIER2_NO_COMPONENT_OF,
    TIER2_UNCLAIMED_ENTRY_ID,
    TIER2_UNIDENTIFIED,
    TIER2_UNREADABLE_TIMES,
    TIER3_ROUND_TRIP,
  };
  for (const [name, text] of Object.entries(header)) add(name, text);
  return docs;
}

/** Documents drawn from the arbitraries, on fixed seeds. */
function drawnDocuments(): OutputDocument[] {
  const docs: OutputDocument[] = [];
  const add = (family: string, texts: readonly string[]): void => {
    texts.forEach((text, i) => {
      docs.push({ name: `${family}:${String(i)}`, text });
    });
  };
  // The three document types the digests were first captured over, named rather than left to
  // the generator's default: the default grows when the builder learns a type, and a drawn
  // corpus that moves with it would turn every builder addition into a digest re-capture.
  add(
    "document",
    draw(
      documentText({ maxEntries: 3, documentTypes: ["ccd", "referralNote", "dischargeSummary"] }),
      101,
      60,
    ),
  );
  add("hostile", draw(hostileInput(), 202, 150));
  return docs;
}

/** Every document in the corpus, in a stable order. */
export function outputCorpus(): OutputDocument[] {
  return [...writtenDocuments(), ...benchDocuments(), ...fixtureDocuments(), ...drawnDocuments()];
}

/**
 * A value as plain data, every own enumerable key in order. `undefined` is written as a marker so
 * a key set to `undefined` is told apart from a key left out; a `Map` and a `Set` by their
 * entries.
 */
function plain(value: unknown, seen: Set<object> = new Set()): unknown {
  if (value === undefined) return { $undefined: true };
  if (value === null || typeof value !== "object") {
    if (typeof value === "function") return { $function: true };
    if (typeof value === "number" && !Number.isFinite(value)) return { $number: String(value) };
    return value;
  }
  if (seen.has(value)) return { $cycle: true };
  seen.add(value);
  let out: unknown;
  if (value instanceof Map) {
    out = { $map: [...value.entries()].map(([k, v]) => [plain(k, seen), plain(v, seen)]) };
  } else if (value instanceof Set) {
    out = { $set: [...value].map((v) => plain(v, seen)) };
  } else if (Array.isArray(value)) {
    out = { $frozen: Object.isFrozen(value), items: value.map((v) => plain(v, seen)) };
  } else {
    const obj: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      obj[key] = plain((value as Record<string, unknown>)[key], seen);
    }
    out = obj;
  }
  seen.delete(value);
  return out;
}

/** An error as a record: its class, and every field a caller can read off it. */
function errorRecord(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { thrown: String(error) };
  const fields = error as unknown as Record<string, unknown>;
  return {
    thrown: error.name,
    message: error.message,
    code: plain(fields["code"]),
    position: plain(fields["position"]),
  };
}

/** A parsed document as a record: every field, the warnings, and the XML it writes. */
function documentRecord(api: OutputApi, doc: Ccda.CcdaDocument): Record<string, unknown> {
  let xml: unknown;
  try {
    xml = doc.toString();
  } catch (error) {
    xml = errorRecord(error);
  }
  let serialized: unknown;
  try {
    serialized = api.serializeCcda(doc) === xml ? "same" : api.serializeCcda(doc);
  } catch (error) {
    serialized = errorRecord(error);
  }
  return {
    model: plain(doc),
    patient: plain(doc.getPatient()),
    mrn: plain(doc.getMrn()),
    xml,
    serialized,
  };
}

/** Run `fn` and record what it returned or what it threw. */
function outcome<T>(fn: () => T, record: (value: T) => unknown): unknown {
  let value: T;
  try {
    value = fn();
  } catch (error) {
    return { error: errorRecord(error) };
  }
  return { ok: record(value) };
}

/** Everything a caller can observe of the read, the edits and the write for one document. */
export function recordOf(api: OutputApi, doc: OutputDocument): Record<string, unknown> {
  const text = doc.text;
  const seen: unknown[] = [];
  const asDoc = (d: Ccda.CcdaDocument): unknown => documentRecord(api, d);
  const out: Record<string, unknown> = {
    lenient: outcome(
      () =>
        api.parseCcda(text, {
          onWarning: (w) => {
            seen.push(plain(w));
          },
        }),
      asDoc,
    ),
    handlerSaw: seen,
    strict: outcome(() => api.parseCcda(text, { strict: true }), asDoc),
    validating: outcome(() => api.parseCcda(text, validationOptions()), asDoc),
    profiled: outcome(
      () => api.parseCcda(text, { profile: api.ccdaProfiles.smartScorecard }),
      asDoc,
    ),
    legacy: outcome(() => api.parseCcda(text, { profile: api.ccdaProfiles.legacyR11 }), asDoc),
    limited: outcome(
      () =>
        api.parseCcda(text, {
          limits: { maxEntityExpansions: 2, maxDepth: 12, maxNodeCount: 150 },
        }),
      asDoc,
    ),
    tinyInput: outcome(() => api.parseCcda(text, { limits: { maxInputBytes: 64 } }), asDoc),
  };
  let parsed: Ccda.CcdaDocument;
  try {
    parsed = api.parseCcda(text);
  } catch {
    return out;
  }
  const structured = parsed.sections.length > 0;
  out["reparse"] = outcome(() => api.parseCcda(parsed.toString()), asDoc);
  out["withWarnings"] = outcome(
    () => parsed.withWarnings([{ code: "SECTION_PLACEMENT_SUSPECT", message: "m", position: {} }]),
    asDoc,
  );
  out["revision"] = outcome(() => api.editCcda(parsed), asDoc);
  out["edit"] = outcome(() => api.editCcda(parsed, editOptions(structured)), asDoc);
  out["editInPlace"] = outcome(
    () => api.editCcda(parsed, { ...editOptions(structured), revision: false }),
    asDoc,
  );
  out["editValidating"] = outcome(
    () =>
      api.editCcda(parsed, {
        ...editOptions(structured),
        terminology: validationOptions().terminology as Ccda.TerminologyAdapter,
      }),
    asDoc,
  );
  out["editAppend"] = outcome(
    () =>
      api.editCcda(parsed, {
        sections: [
          {
            kind: "planOfTreatment",
            content: [
              {
                kind: "medicationActivity",
                code: {
                  code: "314076",
                  codeSystem: "2.16.840.1.113883.6.88",
                  displayName: "Lisinopril 10 MG Oral Tablet",
                },
              },
            ],
          },
        ],
      }),
    asDoc,
  );
  out["editTwice"] = outcome(
    () => api.editCcda(api.editCcda(parsed, editOptions(structured)), { revision: false }),
    asDoc,
  );
  return out;
}

/** The SHA-256 of a record's canonical JSON. */
export function digestOf(record: unknown): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}
