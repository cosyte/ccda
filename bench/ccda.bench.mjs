// Benchmarks for @cosyte/ccda, on @cosyte/bench, against the built entry a consumer imports.
//
// A reading of this build (throughput, latency p50/p95/p99, allocations, peak heap, a long run for
// leaks, and the cold import with every file it loads and its gzip size):
//   pnpm build && pnpm bench:reading --out bench-results/reading.json
// One benchmark or one case only (as `<benchmark> / <size>` in the results):
//   pnpm bench:reading --only "parseCcda: Referral Note"
// A base against head comparison, the base built in another checkout:
//   pnpm bench:compare --base <base checkout>/dist/index.mjs --head dist/index.mjs
// The budgets, and the single-run numbers and CPU and heap profile of the hottest paths:
//   node bench/budgets.mjs bench-results/reading.json
//   node --enable-source-maps bench/profile.mjs dist/index.mjs
// On a pull request CI runs the comparison in its bench-compare job, and the bench-reading workflow
// takes a reading and a profile on a GitHub-hosted runner. Both are advisory: they post their numbers
// and fail nothing.
//
// The suite is handed the module under test rather than importing it, so one file measures both
// builds. Every input is synthetic and built in code by bench/shapes.mjs: no file is read.
//
// Serializing is not a benchmark of its own: `parseCcda` writes the document's XML while it parses
// and `serializeCcda` returns that string, so its cost is inside every parse. The write path that
// does work is `editCcda`, which re-reads the XML, grafts the change, writes it and parses the result.

import { defineBenchmark, defineSuite } from "@cosyte/bench";

import {
  KIB,
  ccd,
  editOptions,
  referralNote,
  unstructuredDocument,
  validationOptions,
} from "./shapes.mjs";

// Three shapes, each at the size real traffic has and at a size well past it. The pull request
// comparison runs only the referral note and the 100 entry CCD, for each operation: a comparison
// runs every case 24 times in fresh processes, and its budget is 600 seconds. A reading measures
// every size, and cannot finish warming up a case of about 1 MiB or more, so it skips that case's
// timings (`warmup-unstable`) and still reports its peak heap; bench/profile.mjs times those sizes
// the simpler way.
const SHAPES = [
  {
    name: "Referral Note",
    structured: true,
    sizes: [
      // The document a referral feed carries all day. 64 of them, so a pass is not one string
      // repeated.
      { label: "23 KiB", inputs: 64, build: (i) => referralNote(i), compare: true },
    ],
  },
  {
    name: "CCD",
    structured: true,
    sizes: [
      { label: "100 entries, 0.2 MiB", inputs: 4, build: (i) => ccd(i, 100), compare: true },
      { label: "1,000 entries, 2 MiB", inputs: 1, build: (i) => ccd(i, 1_000) },
      { label: "4,000 entries, 8 MiB", inputs: 1, build: (i) => ccd(i, 4_000) },
    ],
  },
  {
    name: "Unstructured, base64 PDF",
    structured: false,
    sizes: [
      { label: "64 KiB PDF, 89 KiB", inputs: 4, build: (i) => unstructuredDocument(i, 64 * KIB) },
      {
        label: "4 MiB PDF, 5.4 MiB",
        inputs: 1,
        build: (i) => unstructuredDocument(i, 4096 * KIB),
      },
    ],
  },
];

/**
 * One input: its XML, the edit the edit benchmark makes to it, and a slot that benchmark keeps the
 * parsed document in. Each is an object, so a document is cached against the input, never against
 * a string.
 */
function input(text, structured) {
  return { text, edit: editOptions(structured) };
}

/** The sizes of a shape as @cosyte/bench takes them: each corpus built in code, with its bytes. */
function sizes(shape) {
  return shape.sizes.map((size) => ({
    label: size.label,
    compare: size.compare ?? false,
    build: () => {
      const inputs = Array.from({ length: size.inputs }, (_v, i) =>
        input(size.build(i), shape.structured),
      );
      return { inputs, bytes: inputs.reduce((n, x) => n + Buffer.byteLength(x.text), 0) };
    },
  }));
}

/**
 * The parsed document of an input, read once and kept, so the edit benchmark times only the edit.
 * The first call on each input also parses it; the warmup runs every input many times before any
 * sample is taken, so no sample includes that parse.
 */
function documentOf(ccda, documents) {
  return (x) => {
    let doc = documents.get(x);
    if (doc === undefined) {
      doc = ccda.parseCcda(x.text);
      documents.set(x, doc);
    }
    return doc;
  };
}

const benchmarks = [];
for (const shape of SHAPES) {
  benchmarks.push(
    defineBenchmark({
      // The lenient read every caller starts with: XML to the document model, its clinical entries,
      // its warnings, and its re-serialized XML.
      name: `parseCcda: ${shape.name}`,
      sizes: sizes(shape),
      bind: (ccda) => (x) => ccda.parseCcda(x.text),
      weigh: (doc) => doc.warnings.length + 1,
    }),
    defineBenchmark({
      // The same read with semantic validation on: every coded slot checked against a terminology
      // adapter and every bound slot against a value set source, both answering from memory, so
      // the time is the package's and not a terminology server's.
      name: `parseCcda, validating: ${shape.name}`,
      sizes: sizes(shape),
      bind: (ccda) => {
        const options = validationOptions();
        return (x) => ccda.parseCcda(x.text, options);
      },
      weigh: (doc) => doc.warnings.length + 1,
    }),
    defineBenchmark({
      // The read, edit, write loop: a section replaced (or, with no structured body, a revision
      // stamped), then the revised document's XML.
      name: `editCcda, then toString: ${shape.name}`,
      sizes: sizes(shape),
      bind: (ccda) => {
        const doc = documentOf(ccda, new WeakMap());
        return (x) => ccda.editCcda(doc(x), x.edit).toString();
      },
      weigh: (text) => text.length,
    }),
  );
}

export default defineSuite({ name: "@cosyte/ccda", benchmarks });
