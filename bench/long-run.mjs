// Whether the heap a long run settles to keeps growing, read for longer than a reading reads it,
// and what a call allocates at sizes a reading cannot read:
//   pnpm build && node bench/long-run.mjs dist/index.mjs [--rounds <n>] [--out <dir>] [--summary <file.md>]
//
// A reading (`pnpm bench:reading`) runs a long run of 30 rounds of about 100 ms each, collects
// fully between rounds, fits a slope through the settled heap of the last 25 and calls the case
// growing when that slope makes 64 KiB or more over them: about 2.5 seconds of work, read at the
// smallest size of every benchmark. This repeats those 30 rounds the same way for each of those
// cases, then runs a long window after them: rounds enough for 12,000 operations, at least 300
// and at most 1,000 (or `--rounds` of them), so the same slope is read over ten to forty times
// the work. Each window is fitted twice: on the whole heap, as the reading fits it, and on the
// heap outside the spaces V8 keeps compiled code in. A heap snapshot is written before the
// reading's window, after it and at the end; each pair is summed by what each object is and
// diffed, and the rows that grew name what the run kept.
//
// Then allocations, for every operation the bench times at every size, the 2 MiB, 5.4 MiB and
// 8 MiB inputs among them: a reading counts a call's allocations only in a window with no
// collection in it, which no call on a few megabytes finishes. This reads them across collections
// instead (memory.mjs, `allocatedBytes`), and reads the small sizes too, to check it against the
// reading's own numbers.
//
// Each case runs in a fresh process with `--expose-gc`. The inputs are the bench's own, from
// bench/shapes.mjs: synthetic, built in code. No value from a document is printed: a snapshot is
// summed by constructor and function names, and strings and numbers only by their type. `--out`
// keeps the results as long-run.json; the snapshots are deleted once read unless
// `--keep-snapshots` is given (each is several megabytes).

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GCProfiler, getHeapSpaceStatistics, getHeapStatistics, writeHeapSnapshot } from "node:v8";

import {
  allocatedBytes,
  codeBytes,
  diffSummaries,
  fitGrowth,
  median,
  settle,
  summarizeSnapshot,
} from "./memory.mjs";
import {
  KIB,
  ccd,
  editOptions,
  referralNote,
  unstructuredDocument,
  validationOptions,
} from "./shapes.mjs";

/** The reading's long run: 30 rounds of about 100 ms, the first 5 left out of the fit. */
const READING_ROUNDS = 30;
const READING_SKIP = 5;
const ROUND_MS = 100;
/** The long window: rounds enough for this many operations, within the bounds below. */
const LONG_OPS = 12_000;
const LONG_MIN_ROUNDS = 300;
const LONG_MAX_ROUNDS = 1_000;
const WARMUP_MS = 1_000;
/** Snapshot rows kept for each window. */
const TOP = 8;
/** Allocation windows read for each case, each one pass over its inputs. */
const WINDOWS = 7;
const CHILD_TIMEOUT_MS = 15 * 60 * 1_000;

const OPERATIONS = [
  {
    name: "parseCcda",
    bind: (ccda) => (text) => ccda.parseCcda(text).warnings.length + 1,
  },
  {
    name: "parseCcda, validating",
    bind: (ccda) => {
      const options = validationOptions();
      return (text) => ccda.parseCcda(text, options).warnings.length + 1;
    },
  },
  {
    name: "parseCcda, then toString",
    bind: (ccda) => (text) => ccda.parseCcda(text).toString().length,
  },
  {
    // As the bench edits: the source parsed once and kept, so only the edit and its write count.
    name: "editCcda, then toString",
    bind: (ccda, structured) => {
      const edit = editOptions(structured);
      const docs = new Map();
      return (text) => {
        let doc = docs.get(text);
        if (doc === undefined) {
          doc = ccda.parseCcda(text);
          docs.set(text, doc);
        }
        return ccda.editCcda(doc, edit).toString().length;
      };
    },
  },
];

/** Every shape and size of bench/ccda.bench.mjs, with as many inputs as it builds. */
const SIZES = [
  {
    shape: "Referral Note",
    size: "23 KiB",
    structured: true,
    inputs: 64,
    build: (i) => referralNote(i),
  },
  {
    shape: "CCD",
    size: "100 entries, 0.2 MiB",
    structured: true,
    inputs: 4,
    build: (i) => ccd(i, 100),
  },
  {
    shape: "CCD",
    size: "1,000 entries, 2 MiB",
    structured: true,
    inputs: 1,
    build: (i) => ccd(i, 1_000),
  },
  {
    shape: "CCD",
    size: "4,000 entries, 8 MiB",
    structured: true,
    inputs: 1,
    build: (i) => ccd(i, 4_000),
  },
  {
    shape: "Unstructured, base64 PDF",
    size: "64 KiB PDF, 89 KiB",
    structured: false,
    inputs: 4,
    build: (i) => unstructuredDocument(i, 64 * KIB),
  },
  {
    shape: "Unstructured, base64 PDF",
    size: "4 MiB PDF, 5.4 MiB",
    structured: false,
    inputs: 1,
    build: (i) => unstructuredDocument(i, 4096 * KIB),
  },
];

/**
 * The cases a reading reads a long run for: every operation at each shape's smallest size, in the
 * reading's order.
 */
const LONG_RUNS = SIZES.filter((_s, i) => i === 0 || SIZES[i - 1].shape !== SIZES[i].shape).flatMap(
  (size) => OPERATIONS.map((op) => ({ op, size })),
);

function args(argv) {
  const out = {
    target: argv[0],
    rounds: undefined,
    keep: false,
    dir: undefined,
    summary: undefined,
    child: undefined,
  };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--rounds") out.rounds = Number(argv[++i]);
    else if (argv[i] === "--out") out.dir = argv[++i];
    else if (argv[i] === "--summary") out.summary = argv[++i];
    else if (argv[i] === "--child") out.child = argv[++i];
    else if (argv[i] === "--keep-snapshots") out.keep = true;
  }
  return out;
}

/** The probe a child reads the heap with; it needs `--expose-gc`. */
function probe() {
  const gc = globalThis.gc;
  if (typeof gc !== "function") throw new Error("run with --expose-gc");
  const usedHeap = () => getHeapStatistics().used_heap_size;
  return { gc: () => gc(), usedHeap, settle: () => settle(() => gc(), usedHeap) };
}

/** A pass over every input, as @cosyte/bench makes one; returns a sum the caller keeps. */
function passOf(call, texts) {
  return () => {
    let sink = 0;
    for (const text of texts) sink += call(text);
    return sink;
  };
}

function runFor(pass, ms) {
  const end = performance.now() + ms;
  let passes = 0;
  let sink = 0;
  do {
    sink += pass();
    passes++;
  } while (performance.now() < end);
  return { passes, sink };
}

function spaces() {
  return Object.fromEntries(getHeapSpaceStatistics().map((s) => [s.space_name, s.space_used_size]));
}

/** How each heap space changed between two `spaces()` readings, the spaces that moved only. */
function spaceChange(from, to) {
  return Object.keys(to)
    .map((name) => ({ name, bytes: to[name] - (from[name] ?? 0) }))
    .filter((x) => x.bytes !== 0);
}

/** A snapshot written now, summed, and deleted unless it is to be kept. */
function snapshot(dir, name, keep) {
  const file = writeHeapSnapshot(join(dir, `${name}.heapsnapshot`));
  const summary = summarizeSnapshot(JSON.parse(readFileSync(file, "utf8")));
  if (!keep) rmSync(file, { force: true });
  return summary;
}

/** What changed between two snapshot summaries: compiled code apart from everything else. */
function snapshotChange(before, after) {
  const diff = diffSummaries(before, after);
  const isCode = (row) => row.key.startsWith("code: ");
  const sum = (rows) => rows.reduce((n, row) => n + row.bytes, 0);
  return {
    before: diff.before,
    after: diff.after,
    codeBytes: sum(diff.rows.filter(isCode)),
    otherBytes: sum(diff.rows.filter((row) => !isCode(row))),
    rows: diff.rows.slice(0, TOP),
    rowsOutsideCode: diff.rows.filter((row) => !isCode(row)).slice(0, TOP),
  };
}

/** Rounds `from` to `to` of a long run's readings, as `fitGrowth` takes them, on one series. */
function series(readings, field, from, to) {
  const out = [];
  for (let r = from; r < to; r++) out.push({ ops: readings[r * 3], heap: readings[r * 3 + field] });
  return out;
}

/** The three fits of one series: the reading's window, the long window, its last half. */
function fits(readings, field, count) {
  const half = READING_ROUNDS + Math.floor((count - READING_ROUNDS) / 2);
  return {
    reading: fitGrowth(series(readings, field, READING_SKIP, READING_ROUNDS)),
    long: fitGrowth(series(readings, field, READING_ROUNDS, count)),
    lastHalf: fitGrowth(series(readings, field, half, count)),
  };
}

/** One long run, in this process. */
function longRun(ccda, c, options) {
  const p = probe();
  const texts = Array.from({ length: c.size.inputs }, (_v, i) => c.size.build(i));
  const pass = passOf(c.op.bind(ccda, c.size.structured), texts);
  let sink = runFor(pass, WARMUP_MS).sink;
  // Passes to a round: as many as fill about 100 ms, measured as the reading measures them.
  const calibration = runFor(pass, ROUND_MS);
  sink += calibration.sink;
  const passesPerRound = calibration.passes;
  const opsPerRound = passesPerRound * c.size.inputs;
  const rounds =
    options.rounds ??
    Math.min(LONG_MAX_ROUNDS, Math.max(LONG_MIN_ROUNDS, Math.ceil(LONG_OPS / opsPerRound)));

  // Each round's operations so far, settled heap, and settled heap outside the spaces that hold
  // compiled code, kept in one array allocated before the run, so the record of the run is not
  // itself a growth the run reads.
  const count = READING_ROUNDS + rounds + 1;
  const readings = new Float64Array(count * 3);
  const snapshots = [];
  const spacesAt = {};
  let unsettled = 0;
  let ops = 0;
  for (let r = 0; r < count; r++) {
    let s = p.settle();
    if (r === READING_ROUNDS) {
      // The end of the reading's window, then its snapshot, then the heap settled again: writing
      // a snapshot leaves the heap higher, a step the long window starts after.
      spacesAt.readingEnd = spaces();
      snapshots.push(snapshot(options.dir, "2-after-reading-window", options.keep));
      s = p.settle();
      spacesAt.longStart = spaces();
    }
    const now = getHeapSpaceStatistics();
    if (r === READING_SKIP) spacesAt.readingStart = spaces();
    if (!s.settled) unsettled++;
    readings[r * 3] = ops;
    readings[r * 3 + 1] = s.heap;
    readings[r * 3 + 2] = s.heap - codeBytes(now);
    if (r === count - 1) break;
    // The first snapshot, before the round the reading's fit starts at, so its step falls
    // outside that fit.
    if (r === READING_SKIP - 1) {
      snapshots.push(snapshot(options.dir, "1-before-reading-window", options.keep));
      p.settle();
    }
    for (let i = 0; i < passesPerRound; i++) sink += pass();
    ops += opsPerRound;
  }
  spacesAt.end = spaces();
  snapshots.push(snapshot(options.dir, "3-end", options.keep));
  if (sink < 0) throw new Error("unreachable");
  const heapAt = (r) => readings[r * 3 + 1];
  const dataAt = (r) => readings[r * 3 + 2];
  return {
    opsPerRound,
    rounds,
    unsettled,
    heap: {
      atReadingStart: heapAt(READING_SKIP),
      atLongStart: heapAt(READING_ROUNDS),
      atEnd: heapAt(count - 1),
    },
    total: fits(readings, 1, count),
    outsideCode: fits(readings, 2, count),
    spaces: {
      readingWindow: spaceChange(spacesAt.readingStart, spacesAt.readingEnd),
      longWindow: spaceChange(spacesAt.longStart, spacesAt.end),
    },
    snapshots: {
      readingWindow: snapshotChange(snapshots[0], snapshots[1]),
      longWindow: snapshotChange(snapshots[1], snapshots[2]),
    },
    settledHeap: Array.from({ length: count }, (_v, r) => heapAt(r)),
    settledHeapOutsideCode: Array.from({ length: count }, (_v, r) => dataAt(r)),
  };
}

/** The allocations of one case, in this process: `WINDOWS` passes, each read on its own. */
function allocations(ccda, c) {
  const p = probe();
  const texts = Array.from({ length: c.size.inputs }, (_v, i) => c.size.build(i));
  const bytes = texts.reduce((n, t) => n + Buffer.byteLength(t), 0);
  const pass = passOf(c.op.bind(ccda, c.size.structured), texts);
  let sink = 0;
  // Warm: at least three passes and half a second, so the first pass's parse of an edit's source
  // and the compiler's first tiers are behind the windows.
  const warm = performance.now() + 500;
  for (let i = 0; i < 3 || performance.now() < warm; i++) sink += pass();
  const perOp = [];
  const gcs = [];
  const external = [];
  for (let w = 0; w < WINDOWS; w++) {
    const s = p.settle();
    const e0 = process.memoryUsage().external;
    const profiler = new GCProfiler();
    profiler.start();
    sink += pass();
    const stats = profiler.stop().statistics;
    const end = p.usedHeap();
    perOp.push(allocatedBytes(s.heap, stats, end) / c.size.inputs);
    gcs.push(stats.length);
    external.push((process.memoryUsage().external - e0) / c.size.inputs);
  }
  if (sink < 0) throw new Error("unreachable");
  return {
    inputBytes: bytes / c.size.inputs,
    bytesPerOp: median(perOp),
    minBytesPerOp: Math.min(...perOp),
    maxBytesPerOp: Math.max(...perOp),
    gcsPerWindow: median(gcs),
    externalBytesPerOp: median(external),
  };
}

async function child(options) {
  const ccda = await import(pathToFileURL(resolve(options.target)).href);
  const [kind, index] = options.child.split(":");
  let result;
  if (kind === "long") {
    result = longRun(ccda, LONG_RUNS[Number(index)], options);
  } else {
    const n = Number(index);
    const op = OPERATIONS[n % OPERATIONS.length];
    const size = SIZES[Math.floor(n / OPERATIONS.length)];
    result = allocations(ccda, { op, size });
  }
  process.stdout.write(JSON.stringify(result));
  return 0;
}

function runChild(options, child, dir) {
  const self = fileURLToPath(import.meta.url);
  const argv = ["--expose-gc", self, options.target, "--child", child, "--out", dir];
  if (options.rounds !== undefined) argv.push("--rounds", String(options.rounds));
  if (options.keep) argv.push("--keep-snapshots");
  const out = spawnSync(process.execPath, argv, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: CHILD_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (out.status !== 0) throw new Error(`case ${child} exited ${String(out.status)}`);
  return JSON.parse(out.stdout);
}

function kib(bytes) {
  const sign = bytes < 0 ? "-" : "";
  const b = Math.abs(bytes);
  if (b >= 1024 * 1024) return `${sign}${(b / (1024 * 1024)).toFixed(2)} MiB`;
  return `${sign}${(b / 1024).toFixed(1)} KiB`;
}

function perOp(bytes) {
  return `${bytes.toFixed(1)} B/op`;
}

/** One fit as a table cell: the growth over its window, the slope, the verdict. */
function fitCell(f) {
  const verdict = f.verdict === "growing" ? "**growing**" : "flat";
  return `${kib(f.growthBytes)}, ${perOp(f.slopeBytesPerOp)}, ${verdict}`;
}

function signed(bytes) {
  return `${bytes > 0 ? "+" : ""}${kib(bytes)}`;
}

/** The rows of a snapshot diff that grew, as a short list. */
function grew(rows, n) {
  const up = rows.filter((row) => row.bytes > 0).slice(0, n);
  if (up.length === 0) return "nothing";
  return up
    .map((row) => `\`${row.key.replaceAll("|", "\\|")}\` ${signed(row.bytes)} (${row.count > 0 ? "+" : ""}${String(row.count)})`)
    .join(", ");
}

async function main() {
  const options = args(process.argv.slice(2));
  const roundsOk = options.rounds === undefined || options.rounds >= 2;
  if (options.target === undefined || !roundsOk) {
    process.stderr.write(
      "usage: node bench/long-run.mjs <dist/index.mjs> [--rounds <n>] [--out <dir>] [--summary <file.md>] [--keep-snapshots]\n",
    );
    return 2;
  }
  if (options.child !== undefined) return child(options);

  const scratch = options.dir === undefined ? mkdtempSync(join(tmpdir(), "ccda-long-run-")) : null;
  const root = options.dir ?? scratch;
  mkdirSync(root, { recursive: true });
  const results = { node: process.version, longRuns: [], allocations: [] };
  const fitsTable = [
    "| Benchmark | Size | Ops a round | Rounds after | The reading's window | Long window | Long window, outside code | Last half, outside code | Detectable, long |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const snapshotsTable = [
    "| Benchmark | Size | Reading's window: code, other | Long window: code, other | Grew most outside code, long window |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const [index, c] of LONG_RUNS.entries()) {
    const dir = join(root, `long-run-${String(index + 1)}`);
    mkdirSync(dir, { recursive: true });
    const r = runChild(options, `long:${String(index)}`, dir);
    const benchmark = `${c.op.name}: ${c.size.shape}`;
    results.longRuns.push({ benchmark, size: c.size.size, ...r });
    const unsettled = r.unsettled === 0 ? "" : ` (${String(r.unsettled)} unsettled)`;
    fitsTable.push(
      `| ${benchmark} | ${c.size.size} | ${String(r.opsPerRound)} | ${String(r.rounds)}${unsettled} | ${fitCell(r.total.reading)} | ${fitCell(r.total.long)} | ${fitCell(r.outsideCode.long)} | ${fitCell(r.outsideCode.lastHalf)} | ${perOp(r.outsideCode.long.detectableBytesPerOp)} |`,
    );
    const rw = r.snapshots.readingWindow;
    const lw = r.snapshots.longWindow;
    snapshotsTable.push(
      `| ${benchmark} | ${c.size.size} | ${signed(rw.codeBytes)}, ${signed(rw.otherBytes)} | ${signed(lw.codeBytes)}, ${signed(lw.otherBytes)} | ${grew(lw.rowsOutsideCode, 3)} |`,
    );
  }
  const lines = [
    "### Long run, read longer",
    "",
    `Node ${process.version}. Each case in a fresh process: warmed for ${String(WARMUP_MS)} ms, then rounds of about ${String(ROUND_MS)} ms of passes, every round after full collections until two in a row free less than 64 KiB. The reading's window is rounds ${String(READING_SKIP)} to ${String(READING_ROUNDS - 1)}, as a reading fits it; the long window is the rounds after them, enough for ${String(LONG_OPS)} operations, at least ${String(LONG_MIN_ROUNDS)} and at most ${String(LONG_MAX_ROUNDS)}; the last half is that window's second half. Each cell is a Theil-Sen slope through the settled heap and the growth it makes over its window, growing at 64 KiB or more, as @cosyte/bench decides. "Outside code" leaves out the spaces V8 keeps compiled code in (every space named \`code\` or \`trusted\`), which grow while the compiler optimizes and shrink when it flushes.`,
    "",
    ...fitsTable,
    "",
    "Heap snapshots, written before the reading's window, after it, and at the end, summed by constructor and diffed: what compiled code (every snapshot node of type `code`: machine code, bytecode, feedback, deoptimization data) and everything else gained over each window, then the rows outside code that grew most over the long window, with how many objects.",
    "",
    ...snapshotsTable,
  ];

  lines.push(
    "",
    "### Allocations at every size",
    "",
    `Bytes allocated on the JavaScript heap by one operation, read across collections: from a settled heap, what the heap grew by up to each collection a pass caused, then to the end. The median of ${String(WINDOWS)} passes, with their range; external memory is the change in \`process.memoryUsage().external\` over a pass. Each case in a fresh process, warmed for at least 3 passes and 500 ms.`,
    "",
    "| Operation | Shape | Size | Input | Allocated | Range | Multiple | Collections a pass | External |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (let s = 0; s < SIZES.length; s++) {
    for (let o = 0; o < OPERATIONS.length; o++) {
      const size = SIZES[s];
      const op = OPERATIONS[o];
      const r = runChild(options, `alloc:${String(s * OPERATIONS.length + o)}`, root);
      results.allocations.push({ operation: op.name, shape: size.shape, size: size.size, ...r });
      lines.push(
        `| ${op.name} | ${size.shape} | ${size.size} | ${kib(r.inputBytes)} | ${kib(r.bytesPerOp)} | ${kib(r.minBytesPerOp)} to ${kib(r.maxBytesPerOp)} | ${(r.bytesPerOp / r.inputBytes).toFixed(1)}x | ${String(r.gcsPerWindow)} | ${kib(r.externalBytesPerOp)} |`,
      );
    }
  }

  const text = `${lines.join("\n")}\n`;
  process.stdout.write(text);
  if (options.summary !== undefined) writeFileSync(options.summary, text);
  if (options.dir !== undefined) {
    writeFileSync(join(options.dir, "long-run.json"), `${JSON.stringify(results, null, 2)}\n`);
  }
  if (scratch !== null) rmSync(scratch, { recursive: true, force: true });
  return 0;
}

process.exitCode = await main();
