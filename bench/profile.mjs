// The time a pass of each operation takes at each shape's smallest and largest size, then a CPU
// profile and a sampled heap profile of the hottest paths, with the top functions of each:
//   pnpm build && node --enable-source-maps bench/profile.mjs dist/index.mjs [--out <dir>] [--summary <file.md>]
//
// Each workload is warmed, then profiled on its own for about two seconds through the inspector
// (node:inspector/promises), so a function's share is a share of that workload alone. With
// --enable-source-maps and the build's source map beside it, a function is named by its src/ file
// and line; without, by the built file. `--out` keeps every .cpuprofile and .heapprofile for a
// profiler's own view (Chrome DevTools, speedscope). The inputs are the bench's own, from
// bench/shapes.mjs: synthetic, built in code.

import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { findSourceMap } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  KIB,
  ccd,
  editOptions,
  referralNote,
  unstructuredDocument,
  validationOptions,
} from "./shapes.mjs";

const PROFILE_MS = 2_000;
const WARMUP_MS = 500;
const TOP = 12;

function args(argv) {
  const out = { target: argv[0], dir: undefined, summary: undefined };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--out") out.dir = argv[++i];
    else if (argv[i] === "--summary") out.summary = argv[++i];
  }
  return out;
}

/** Run `pass` until `ms` have gone by; returns how many passes ran. */
function runFor(pass, ms) {
  const end = performance.now() + ms;
  let passes = 0;
  let sink = 0;
  while (performance.now() < end) {
    sink += pass();
    passes++;
  }
  if (sink < 0) throw new Error("unreachable");
  return passes;
}

/** Each shape of the bench at its smallest and largest size, as bench/ccda.bench.mjs has them. */
const PAIRS = [
  {
    shape: "CCD",
    structured: true,
    smallLabel: "100 entries",
    largeLabel: "4,000 entries",
    small: () => ccd(0, 100),
    large: () => ccd(0, 4_000),
  },
  {
    shape: "Unstructured, base64 PDF",
    structured: false,
    smallLabel: "64 KiB PDF",
    largeLabel: "4 MiB PDF",
    small: () => unstructuredDocument(0, 64 * KIB),
    large: () => unstructuredDocument(0, 4096 * KIB),
  },
];

const SAMPLES = 9;
const SAMPLE_MS = 100;

/** Milliseconds a pass, one sample: whole passes until at least `SAMPLE_MS` have gone by. */
function sample(pass) {
  const start = performance.now();
  let passes = 0;
  let sink = 0;
  while (performance.now() - start < SAMPLE_MS) {
    sink += pass();
    passes++;
  }
  if (sink < 0) throw new Error("unreachable");
  return (performance.now() - start) / passes;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The median milliseconds a pass of `pass`, warmed. One workload at a time: alternating a small
 * input with a large one charged the small one for collecting the large one's garbage.
 */
function msPerPass(pass) {
  runFor(pass, WARMUP_MS);
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) samples.push(sample(pass));
  return median(samples);
}

function mib(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/** Where a call frame is: its src/ file and line through the source map when there is one. */
function locate(frame) {
  const line = frame.lineNumber;
  if (frame.url === "") return "(native)";
  let where = frame.url;
  try {
    const path = frame.url.startsWith("file:") ? fileURLToPath(frame.url) : frame.url;
    const map = findSourceMap(path);
    const entry = map?.findEntry(line, frame.columnNumber);
    if (entry !== undefined && entry.originalSource !== undefined) {
      const source = entry.originalSource.replace(/^.*?(src\/)/, "$1");
      return `${source}:${String(entry.originalLine + 1)}`;
    }
    where = path.replace(/^.*?(dist\/|bench\/|node_modules\/)/, "$1");
  } catch {
    // An unparseable URL keeps its own text.
  }
  return `${where}:${String(line + 1)}`;
}

function key(frame) {
  return `${frame.functionName === "" ? "(anonymous)" : frame.functionName} ${locate(frame)}`;
}

function isProfilerFrame(frame) {
  return (
    frame.url.startsWith("node:inspector") ||
    frame.functionName === "(program)" ||
    frame.functionName === "(idle)"
  );
}

/** Self time by function, from a CPU profile: the share of samples each one was on top. */
function topSelfTime(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    // The profiler's own start and stop, and time the process spent outside JavaScript, are not
    // the workload's.
    if (isProfilerFrame(node.callFrame)) continue;
    const dt = profile.timeDeltas[i] ?? 0;
    total += dt;
    const k = key(node.callFrame);
    self.set(k, (self.get(k) ?? 0) + dt);
  }
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, us]) => ({ name, share: us / total }));
}

/** Bytes allocated by function, from a sampled heap profile (sampled, so an estimate). */
function topAllocations(profile) {
  const self = new Map();
  let total = 0;
  const walk = (node) => {
    if (!isProfilerFrame(node.callFrame) && node.selfSize > 0) {
      const k = key(node.callFrame);
      self.set(k, (self.get(k) ?? 0) + node.selfSize);
      total += node.selfSize;
    }
    for (const child of node.children) walk(child);
  };
  walk(profile.head);
  return [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP)
    .map(([name, bytes]) => ({ name, share: total === 0 ? 0 : bytes / total }));
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.target === undefined) {
    process.stderr.write(
      "usage: node bench/profile.mjs <dist/index.mjs> [--out <dir>] [--summary <file.md>]\n",
    );
    return 2;
  }
  const ccda = await import(pathToFileURL(resolve(options.target)).href);
  const validating = validationOptions();
  const operations = [
    { name: "parseCcda", pass: (text) => () => ccda.parseCcda(text).warnings.length + 1 },
    {
      name: "parseCcda, validating",
      pass: (text) => () => ccda.parseCcda(text, validating).warnings.length + 1,
    },
    {
      // A parse whose XML is asked for: what a pass-through caller pays, the parse and the write
      // its `toString` makes the first time.
      name: "parseCcda, then toString",
      pass: (text) => () => ccda.parseCcda(text).toString().length,
    },
    {
      name: "editCcda, then toString",
      pass: (text, structured) => {
        const doc = ccda.parseCcda(text);
        const edit = editOptions(structured);
        return () => ccda.editCcda(doc, edit).toString().length;
      },
    },
  ];

  // First, before the profiles' inputs and documents are built and held: a heap already holding
  // them makes every collection dearer, and a parse that allocates as much as these do pays for it.
  const lines = [
    "### Throughput, smallest size against largest",
    "",
    "A reading cannot time a case of a megabyte or more when its warmup never settles, and skips it. This times every size the same simpler way: warmed, then the median of 9 samples of at least 100 ms of whole passes (a single pass when one takes longer), one size at a time, in one process.",
    "",
    "| Operation | Shape | Smallest | Largest | ms a pass, smallest | ms a pass, largest | Bytes/s, smallest | Bytes/s, largest | Kept |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const pair of PAIRS) {
    const small = pair.small();
    const large = pair.large();
    for (const op of operations) {
      const msSmall = msPerPass(op.pass(small, pair.structured));
      const msLarge = msPerPass(op.pass(large, pair.structured));
      const rateSmall = Buffer.byteLength(small) / (msSmall / 1000);
      const rateLarge = Buffer.byteLength(large) / (msLarge / 1000);
      lines.push(
        `| ${op.name} | ${pair.shape} | ${pair.smallLabel} | ${pair.largeLabel} | ${msSmall.toFixed(2)} | ${msLarge.toFixed(2)} | ${mib(rateSmall)}/s | ${mib(rateLarge)}/s | ${((rateLarge / rateSmall) * 100).toFixed(0)}% |`,
      );
    }
  }

  const ccd4000 = ccd(0, 4_000);
  const ccd1000 = ccd(0, 1_000);
  const ccd1000Doc = ccda.parseCcda(ccd1000);
  const feed = Array.from({ length: 64 }, (_v, i) => referralNote(i));
  const feedDocs = feed.map((text) => ccda.parseCcda(text));
  const structuredEdit = editOptions(true);
  const pdf = unstructuredDocument(0, 4096 * KIB);

  const workloads = [
    {
      name: "parseCcda: CCD, 4,000 entries",
      pass: () => ccda.parseCcda(ccd4000).warnings.length + 1,
    },
    {
      name: "parseCcda, validating: CCD, 1,000 entries",
      pass: () => ccda.parseCcda(ccd1000, validating).warnings.length + 1,
    },
    {
      name: "editCcda, then toString: CCD, 1,000 entries",
      pass: () => ccda.editCcda(ccd1000Doc, structuredEdit).toString().length,
    },
    {
      name: "parseCcda: 64 Referral Notes",
      pass: () => feed.reduce((n, text) => n + ccda.parseCcda(text).warnings.length + 1, 0),
    },
    {
      name: "editCcda, then toString: 64 Referral Notes",
      pass: () =>
        feedDocs.reduce((n, doc) => n + ccda.editCcda(doc, structuredEdit).toString().length, 0),
    },
    {
      name: "parseCcda: Unstructured, 4 MiB base64 PDF",
      pass: () => ccda.parseCcda(pdf).warnings.length + 1,
    },
  ];

  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 100 });
  await session.post("HeapProfiler.enable");
  if (options.dir !== undefined) mkdirSync(options.dir, { recursive: true });

  lines.push(
    "",
    "### CPU and heap profile of the hottest paths",
    "",
    `Node ${process.version}. Each workload warmed for ${String(WARMUP_MS)} ms, then profiled alone for ${String(PROFILE_MS)} ms: self time from a CPU profile sampled every 100 us, and allocation from a sampled heap profile (an estimate).`,
  );
  for (const [index, w] of workloads.entries()) {
    runFor(w.pass, WARMUP_MS);
    // The heap sampler starts first and stops last, so the CPU profile holds the workload and not
    // the sampler's own start and stop. It keeps what a collection freed, so a function is charged
    // for everything it allocated, not only for what was still alive at the end.
    await session.post("HeapProfiler.startSampling", {
      samplingInterval: 16_384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    await session.post("Profiler.start");
    const passes = runFor(w.pass, PROFILE_MS);
    const { profile: cpu } = await session.post("Profiler.stop");
    const { profile: heap } = await session.post("HeapProfiler.stopSampling");
    if (options.dir !== undefined) {
      writeFileSync(resolve(options.dir, `${String(index + 1)}.cpuprofile`), JSON.stringify(cpu));
      writeFileSync(resolve(options.dir, `${String(index + 1)}.heapprofile`), JSON.stringify(heap));
    }
    lines.push(
      "",
      `#### ${String(index + 1)}. ${w.name}`,
      "",
      `${String(passes)} passes in ${String(PROFILE_MS)} ms, ${(PROFILE_MS / passes).toFixed(2)} ms a pass.`,
      "",
      "| Self time | Function | Allocated | Function |",
      "| --- | --- | --- | --- |",
    );
    const cpuTop = topSelfTime(cpu);
    const heapTop = topAllocations(heap);
    for (let i = 0; i < TOP; i++) {
      const c = cpuTop[i];
      const h = heapTop[i];
      lines.push(
        `| ${c === undefined ? "" : `${(c.share * 100).toFixed(1)}%`} | ${c === undefined ? "" : `\`${c.name}\``} | ${h === undefined ? "" : `${(h.share * 100).toFixed(1)}%`} | ${h === undefined ? "" : `\`${h.name}\``} |`,
      );
    }
  }
  session.disconnect();
  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  if (options.summary !== undefined) writeFileSync(options.summary, text);
  return 0;
}

process.exitCode = await main();
