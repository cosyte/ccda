/**
 * The way `editCcda` makes an edit, and what it does not build on the way. An edit of a source
 * whose XML is written in the writer's form reads that text without a tree of it, builds the new
 * section and header elements without `@xmldom/xmldom`, and says on the `cosyte:ccda:edit`
 * diagnostics channel that it was made on the text; an edit that falls back to a DOM says so too.
 * The bench reads that channel to show which way each of its edits went.
 *
 * Every document here is synthetic: the bench's own shapes, and small documents written here.
 */

import { subscribe, unsubscribe } from "node:diagnostics_channel";

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as xmlTree from "../src/parser/xml-tree.js";
import * as loader from "../src/parser/xmldom.js";
import { writeEdit } from "../src/edit/edit-ccda.js";
import { editCcda, parseCcda } from "../src/index.js";
import { documentWithXml, type CcdaDocumentInit } from "../src/model/document.js";
import { ccd, editOptions, referralNote, unstructuredDocument } from "../bench/shapes.mjs";

vi.mock("../src/parser/xml-tree.js", async (importOriginal) => {
  const actual = await importOriginal<typeof xmlTree>();
  return { ...actual, readDocument: vi.fn(actual.readDocument) };
});

vi.mock("../src/parser/xmldom.js", async (importOriginal) => {
  const actual = await importOriginal<typeof loader>();
  return { ...actual, xmldom: vi.fn(actual.xmldom) };
});

const readDocument = vi.mocked(xmlTree.readDocument);
const xmldom = vi.mocked(loader.xmldom);

/** The channel an edit reports its way on. */
const CHANNEL = "cosyte:ccda:edit";

const V3 = "urn:hl7-org:v3";

/** What the channel said while `fn` ran. */
function pathsOf(fn: () => unknown): unknown[] {
  const seen: unknown[] = [];
  const listener = (message: unknown): void => {
    seen.push(message);
  };
  subscribe(CHANNEL, listener);
  try {
    fn();
  } finally {
    unsubscribe(CHANNEL, listener);
  }
  return seen;
}

/** A small Progress Note, with `body` inside its `structuredBody`, written with `\r\n` line ends. */
function progressNote(body: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ClinicalDocument xmlns="${V3}">`,
    `<realmCode code="US"/>`,
    `<typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>`,
    `<templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>`,
    `<templateId root="2.16.840.1.113883.10.20.22.1.9" extension="2015-08-01"/>`,
    `<id root="2.16.840.1.113883.19.5.99999.1" extension="SYNTH-DOC-1"/>`,
    `<code code="11506-3" codeSystem="2.16.840.1.113883.6.1" displayName="Progress note"/>`,
    `<title>Synthetic progress note</title>`,
    `<effectiveTime value="20260101"/>`,
    `<confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>`,
    `<component><structuredBody>${body}</structuredBody></component>`,
    `</ClinicalDocument>`,
  ].join("\r\n");
}

/** The bench's edit: the allergies section replaced. */
const ALLERGY = editOptions(true);

/** An allergies section added, or replaced where there is one. */
const ADD_ALLERGY = {
  sections: [
    {
      kind: "allergies" as const,
      content: [
        {
          allergen: {
            code: "7980",
            codeSystem: "2.16.840.1.113883.6.88",
            displayName: "Penicillin G",
          },
          status: "active" as const,
        },
      ],
    },
  ],
};

beforeEach(() => {
  readDocument.mockClear();
  xmldom.mockClear();
});

describe("an edit of a written source", () => {
  it("reads its text without a tree of it", () => {
    const source = parseCcda(referralNote(0));
    source.toString();
    readDocument.mockClear();
    writeEdit(source, ALLERGY);
    expect(readDocument).not.toHaveBeenCalled();
  });

  it("builds what it adds without @xmldom/xmldom", () => {
    const source = parseCcda(referralNote(1));
    const edited = editCcda(source, ALLERGY);
    expect(xmldom).not.toHaveBeenCalled();
    expect(edited.allergies).toHaveLength(1);
  });

  it("says it was made on the text", () => {
    const source = parseCcda(referralNote(2));
    expect(pathsOf(() => editCcda(source, ALLERGY))).toEqual([{ path: "text" }]);
  });

  it("is made on the text for every shape the bench edits", () => {
    const shapes = [
      { xml: referralNote(3), structured: true },
      { xml: ccd(0, 8), structured: true },
      { xml: unstructuredDocument(0, 1024), structured: false },
    ];
    for (const { xml, structured } of shapes) {
      const source = parseCcda(xml);
      expect(pathsOf(() => editCcda(source, editOptions(structured)))).toEqual([{ path: "text" }]);
    }
  });
});

describe("an edit of a source its parse did not find written", () => {
  it("reads it whole once, then remembers it is written", () => {
    // Line ends a parse rewrites, so the parse cannot say its XML is the text it read.
    const source = parseCcda(progressNote(""));
    source.toString();
    readDocument.mockClear();
    const first = pathsOf(() => writeEdit(source, ADD_ALLERGY));
    expect(readDocument).toHaveBeenCalledTimes(1);
    readDocument.mockClear();
    const second = pathsOf(() => writeEdit(source, ADD_ALLERGY));
    expect(readDocument).not.toHaveBeenCalled();
    expect([first, second]).toEqual([[{ path: "text" }], [{ path: "text" }]]);
  });

  it("says when it falls back to a DOM", () => {
    // An empty XHTML element is written with an end tag, a form the reader does not count as
    // written, so this source is edited on a DOM.
    const source = parseCcda(progressNote(`<br xmlns="http://www.w3.org/1999/xhtml"/>`));
    expect(pathsOf(() => editCcda(source, ADD_ALLERGY))).toEqual([{ path: "dom" }]);
  });

  it("makes an edit on a DOM when the text it was told is written is not", () => {
    // A document that records its XML as written when it is not (single quotes), which no parse
    // makes: the read of the text hands it back, and the edit is the DOM edit.
    const raw = progressNote("").replaceAll('"', "'").replaceAll("\r\n", "\n");
    const source = documentWithXml(parseCcda(raw) as unknown as CcdaDocumentInit, raw, true);
    let onText: unknown;
    expect(pathsOf(() => (onText = writeEdit(source, ADD_ALLERGY)))).toEqual([{ path: "dom" }]);
    expect(onText).toEqual(writeEdit(source, ADD_ALLERGY, false));
  });
});
