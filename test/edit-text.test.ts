/**
 * `editCcda` on the text of a written document (`src/edit/text-surface.ts`): an edit of a source
 * whose XML is already in the writer's form builds no `@xmldom/xmldom` DOM of that document, and
 * writes exactly the XML the same edit made on a DOM writes. The DOM edit is the reference: it is
 * the edit `editCcda` made before, and `writeEdit(..., false)` still makes it.
 *
 * The documents here are synthetic, written for the places a splice can go wrong: a prefixed root
 * with no `xsi` declaration, an empty `structuredBody`, a header with nothing after `id`, comments,
 * CDATA and processing instructions inside what is replaced, a source carrying a `setId`, a
 * `versionNumber` and two `relatedDocument`s, and two edits of one section in one call.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as treeDom from "../src/parser/tree-dom.js";
import { writeEdit, type EditCcdaOptions } from "../src/edit/edit-ccda.js";
import { readText } from "../src/edit/text-read.js";
import { TextSurface } from "../src/edit/text-surface.js";
import { DEFAULT_LIMITS, parseSecureDom } from "../src/parser/secure-xml.js";
import { serializeDocument } from "../src/serialize/serialize-dom.js";
import { editCcda, parseCcda, type CcdaDocument } from "../src/index.js";
import { editOptions } from "../bench/shapes.mjs";
import { outputCorpus } from "./_output-corpus.js";

vi.mock("../src/parser/tree-dom.js", async (importOriginal) => {
  const actual = await importOriginal<typeof treeDom>();
  return { ...actual, domOfTree: vi.fn(actual.domOfTree) };
});

const V3 = "urn:hl7-org:v3";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";
const PROGRESS_NOTE = "2.16.840.1.113883.10.20.22.1.9";
const PROBLEMS = "2.16.840.1.113883.10.20.22.2.5.1";

/** A header with every element the revision reads, and `rest` after it. */
function header(prefix = "", rest = ""): string {
  const p = prefix === "" ? "" : `${prefix}:`;
  return (
    `<${p}realmCode code="US"/>` +
    `<${p}typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>` +
    `<${p}templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>` +
    `<${p}templateId root="${PROGRESS_NOTE}" extension="2015-08-01"/>` +
    `<${p}id root="2.16.840.1.113883.19.5.99999.1" extension="SYNTH-DOC-1"/>` +
    `<${p}code code="11506-3" codeSystem="2.16.840.1.113883.6.1" displayName="Progress note"/>` +
    `<${p}title>Synthetic progress note</${p}title>` +
    `<${p}effectiveTime value="20260101"/>` +
    `<${p}confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>` +
    rest
  );
}

/** A problems section with what a splice has to step over inside it. */
const MARKED_PROBLEMS =
  `<component><section>` +
  `<templateId root="${PROBLEMS}" extension="2015-08-01"/>` +
  `<code code="11450-4" codeSystem="2.16.840.1.113883.6.1"/>` +
  `<title>Problems</title>` +
  `<!-- a <comment> with > in it -->` +
  `<?synthetic-instruction data <here>?>` +
  `<text><![CDATA[a <cdata> section ]] > here]]><paragraph ID="problem-e1">x &lt; y</paragraph></text>` +
  `</section></component>`;

const DOCUMENTS: readonly { readonly name: string; readonly xml: string }[] = [
  {
    name: "a default-namespace document with sections and comments around them",
    xml:
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- before -->\n` +
      `<ClinicalDocument xmlns="${V3}" xmlns:xsi="${XSI}">\n` +
      `  ${header()}\n  <component>\n    <structuredBody>\n      ${MARKED_PROBLEMS}\n` +
      `      <!-- between -->\n    </structuredBody>\n  </component>\n</ClinicalDocument>\n<!-- after -->\n`,
  },
  {
    name: "a prefixed root that declares no xsi namespace",
    xml:
      `<cda:ClinicalDocument xmlns:cda="${V3}">` +
      header("cda") +
      `<cda:component><cda:structuredBody>` +
      MARKED_PROBLEMS.replaceAll("<", "<cda:")
        .replaceAll("<cda:/", "</cda:")
        .replaceAll("<cda:!", "<!")
        .replaceAll("<cda:?", "<?") +
      `</cda:structuredBody></cda:component></cda:ClinicalDocument>`,
  },
  {
    name: "an empty structuredBody",
    xml:
      `<ClinicalDocument xmlns="${V3}">${header()}` +
      `<component><structuredBody/></component></ClinicalDocument>`,
  },
  {
    name: "a header with nothing after its id, and a revision already stamped",
    xml:
      `<ClinicalDocument xmlns="${V3}">` +
      `<id root="2.16.840.1.113883.19.5.99999.1" extension="SYNTH-DOC-2"/>` +
      `<setId root="2.16.840.1.113883.19.5.99999.2" extension="SYNTH-SET-1"/>` +
      `<versionNumber value="3"/>` +
      `<relatedDocument typeCode="RPLC"><parentDocument><id root="2.16.840.1.113883.19.5.99999.1" extension="SYNTH-DOC-0"/></parentDocument></relatedDocument>` +
      `<relatedDocument typeCode="APND"><parentDocument><id root="2.16.840.1.113883.19.5.99999.1" extension="SYNTH-DOC-00"/></parentDocument></relatedDocument>` +
      `</ClinicalDocument>`,
  },
];

const ALLERGY: EditCcdaOptions["sections"] = [
  {
    kind: "allergies",
    content: [
      {
        allergen: {
          code: "7980",
          codeSystem: "2.16.840.1.113883.6.88",
          displayName: "Penicillin G",
        },
        reaction: { code: "247472004", displayName: "Hives" },
        status: "active",
      },
    ],
  },
];

const PROBLEM: EditCcdaOptions["sections"] = [
  {
    kind: "problems",
    content: [{ problem: { code: "38341003", displayName: "Hypertension" }, status: "active" }],
  },
];

const EDITS: readonly { readonly name: string; readonly options: EditCcdaOptions }[] = [
  { name: "a revision", options: {} },
  { name: "a section added in place", options: { sections: ALLERGY, revision: false } },
  { name: "a section replaced, with a revision", options: { sections: PROBLEM } },
  {
    name: "one section edited twice and another added",
    options: { sections: [...PROBLEM, ...ALLERGY, ...PROBLEM], revision: { versionNumber: 9 } },
  },
];

/** What an edit writes, or the error it throws. */
function outcome(fn: () => unknown): unknown {
  try {
    return { ok: fn() };
  } catch (error) {
    return { error: error instanceof Error ? `${error.name}: ${error.message}` : error };
  }
}

const domOfTree = vi.mocked(treeDom.domOfTree);

beforeEach(() => {
  domOfTree.mockClear();
});

describe("editCcda on a written document", () => {
  it("builds no DOM of the document it edits", () => {
    const source = parseCcda(DOCUMENTS[0]?.xml as string);
    const edited = editCcda(source, { sections: ALLERGY });
    expect(domOfTree).not.toHaveBeenCalled();
    expect(edited.sections.map((s) => s.key)).toContain("allergies");
  });

  it.each(DOCUMENTS)("writes what the DOM edit writes: $name", ({ xml }) => {
    const source = parseCcda(xml);
    for (const { options } of EDITS) {
      const onDom = outcome(() => writeEdit(source, options, false));
      domOfTree.mockClear();
      const onText = outcome(() => writeEdit(source, options));
      expect(onText).toEqual(onDom);
      expect(domOfTree).not.toHaveBeenCalled();
    }
  });

  it("edits a source not in the writer's form on a DOM, and writes the same", () => {
    // An empty XHTML element is written with an end tag, a form the reader does not count as
    // written, so this source is edited on a DOM.
    const xml = DOCUMENTS[0]?.xml.replace(
      "<title>Problems</title>",
      `<title>Problems</title><br xmlns="http://www.w3.org/1999/xhtml"/>`,
    ) as string;
    const source = parseCcda(xml);
    const onText = writeEdit(source, { sections: ALLERGY });
    expect(domOfTree).toHaveBeenCalled();
    expect(onText).toEqual(writeEdit(source, { sections: ALLERGY }, false));
  });

  it(
    "writes what the DOM edit writes over the output-equivalence corpus",
    { timeout: 180_000 },
    () => {
      const differing: string[] = [];
      for (const doc of outputCorpus()) {
        let source: CcdaDocument;
        try {
          source = parseCcda(doc.text);
        } catch {
          continue;
        }
        const options = editOptions(source.sections.length > 0);
        for (const edit of [options, { ...options, revision: false as const }, {}]) {
          const onText = outcome(() => writeEdit(source, edit));
          const onDom = outcome(() => writeEdit(source, edit, false));
          if (JSON.stringify(onText) !== JSON.stringify(onDom)) differing.push(doc.name);
        }
      }
      expect(differing).toEqual([]);
    },
  );
});

describe("TextSurface", () => {
  const written = (xml: string): TextSurface => {
    const read = readText(xml);
    if (read === undefined) throw new Error("expected a written text");
    return new TextSurface(read, xml, xml.length);
  };

  it("reads the IDs left after a header change, and those of what it adds", () => {
    const surface = written(
      `<ClinicalDocument xmlns="${V3}"><id ID="gone-1"/><title ID="kept-1"/></ClinicalDocument>`,
    );
    const root = surface.root;
    const old = root.firstChild as unknown as Parameters<TextSurface["remove"]>[1];
    const added = surface.doc.createElementNS(V3, "id");
    added.setAttribute("ID", "added-1");
    surface.replace(root, added, old);
    const inserted = surface.doc.createElementNS(V3, "code");
    inserted.setAttribute("ID", "added-2");
    surface.insertBefore(root, [inserted], undefined);
    expect([...surface.ids()].sort()).toEqual(["added-1", "added-2", "kept-1"]);
  });
});

describe("parseSecureDom", () => {
  it("builds the DOM of a written text from its tree, as xmldom reads it", () => {
    const xml = parseCcda(DOCUMENTS[0]?.xml as string).toString();
    expect(serializeDocument(parseSecureDom(xml, DEFAULT_LIMITS, () => undefined))).toBe(xml);
  });
});
