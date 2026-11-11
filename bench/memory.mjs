// The arithmetic bench/long-run.mjs reads memory with, kept apart from the driver so a test can
// check it on numbers it chooses: the settled heap, the fitted slope of a long run, the bytes a
// call allocated read from the collections it caused, and a heap snapshot summed by what each
// object is.

/** The median of `values`, the mean of the middle two for an even count. */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The Theil-Sen slope of `ys` over `xs`: the median of the slopes between every pair of points. A
 * few rounds a collection left high or low move it little, which a least squares line does not
 * promise. The same estimator @cosyte/bench fits its long run with.
 */
export function theilSenSlope(xs, ys) {
  const slopes = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[j] - xs[i];
      if (dx !== 0) slopes.push((ys[j] - ys[i]) / dx);
    }
  }
  return slopes.length === 0 ? 0 : median(slopes);
}

/** A collection is quiet when it frees less than this; two quiet ones in a row settle the heap. */
export const SETTLE_BYTES = 64 * 1024;
const SETTLE_QUIET = 2;
const SETTLE_MAX = 7;

/**
 * Forced full collections until two in a row free less than 64 KiB, at most seven: the rule
 * @cosyte/bench settles the heap by before it reads it. `gc` collects and `usedHeap` reads the
 * heap in use.
 */
export function settle(gc, usedHeap) {
  let quiet = 0;
  let before = usedHeap();
  for (let round = 1; round <= SETTLE_MAX; round++) {
    gc();
    const after = usedHeap();
    quiet = before - after < SETTLE_BYTES ? quiet + 1 : 0;
    before = after;
    if (quiet >= SETTLE_QUIET) return { settled: true, rounds: round, heap: after };
  }
  return { settled: false, rounds: SETTLE_MAX, heap: before };
}

/**
 * The heap growth a long run's settled readings show, fitted over `rounds` (each `{ ops, heap }`):
 * the slope in bytes an operation, the growth that slope makes over the span of the rounds, and
 * the verdict @cosyte/bench gives, growing at 64 KiB over the span or more.
 */
export function fitGrowth(rounds, growingBytes = SETTLE_BYTES) {
  const slope = theilSenSlope(
    rounds.map((r) => r.ops),
    rounds.map((r) => r.heap),
  );
  const span = rounds.length < 2 ? 0 : rounds[rounds.length - 1].ops - rounds[0].ops;
  const growth = slope * span;
  return {
    rounds: rounds.length,
    ops: span,
    slopeBytesPerOp: slope,
    growthBytes: growth,
    detectableBytesPerOp: span === 0 ? Number.POSITIVE_INFINITY : growingBytes / span,
    verdict: growth >= growingBytes ? "growing" : "flat",
  };
}

/**
 * The bytes in the heap spaces V8 keeps compiled code and its metadata in: every space whose name
 * holds `code` or `trusted` (`code_space`, `code_large_object_space`, `trusted_space`,
 * `trusted_large_object_space` on Node 22). They grow while the compiler optimizes a hot path and
 * shrink when it flushes code, which is warm-up, not data a caller's documents left behind.
 * `stats` is what `v8.getHeapSpaceStatistics()` returns.
 */
export function codeBytes(stats) {
  let total = 0;
  for (const s of stats) {
    if (s.space_name.includes("code") || s.space_name.includes("trusted")) total += s.space_used_size;
  }
  return total;
}

/**
 * The bytes allocated on the JavaScript heap between two readings, across any collections in
 * between: what the heap grew by up to each collection, from where the last one left it, then from
 * the last one to the end. `gcs` is the statistics a `v8.GCProfiler` returned, in order.
 */
export function allocatedBytes(startHeap, gcs, endHeap) {
  let total = 0;
  let from = startHeap;
  for (const gc of gcs) {
    total += gc.beforeGC.heapStatistics.usedHeapSize - from;
    from = gc.afterGC.heapStatistics.usedHeapSize;
  }
  return total + (endHeap - from);
}

/**
 * Snapshot node types whose name is the value itself (a string's text, a number). They are summed
 * under the type alone, so no text of a document reaches the table.
 */
const VALUE_TYPES = new Set([
  "string",
  "concatenated string",
  "sliced string",
  "number",
  "bigint",
  "regexp",
  "symbol",
]);
const NAME_LIMIT = 80;

/** The key a snapshot node is summed under: its type, and its constructor or function name. */
export function nodeKey(type, name) {
  if (VALUE_TYPES.has(type)) return `(${type})`;
  const shown = name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT)}...` : name;
  return `${type}: ${shown}`;
}

/**
 * A V8 heap snapshot (the JSON `v8.writeHeapSnapshot` writes) summed by `nodeKey`: how many nodes
 * of each, and their self size.
 */
export function summarizeSnapshot(snapshot) {
  const fields = snapshot.snapshot.meta.node_fields;
  const types = snapshot.snapshot.meta.node_types[0];
  const width = fields.length;
  const typeAt = fields.indexOf("type");
  const nameAt = fields.indexOf("name");
  const sizeAt = fields.indexOf("self_size");
  const { nodes, strings } = snapshot;
  const sums = new Map();
  for (let i = 0; i < nodes.length; i += width) {
    const key = nodeKey(types[nodes[i + typeAt]], strings[nodes[i + nameAt]]);
    const sum = sums.get(key) ?? { count: 0, bytes: 0 };
    sum.count += 1;
    sum.bytes += nodes[i + sizeAt];
    sums.set(key, sum);
  }
  return sums;
}

/**
 * What grew between two snapshot summaries: every key whose self size or count changed, largest
 * growth in bytes first, with the totals of each side.
 */
export function diffSummaries(before, after) {
  const keys = new Set([...before.keys(), ...after.keys()]);
  const rows = [];
  for (const key of keys) {
    const a = before.get(key) ?? { count: 0, bytes: 0 };
    const b = after.get(key) ?? { count: 0, bytes: 0 };
    const bytes = b.bytes - a.bytes;
    const count = b.count - a.count;
    if (bytes !== 0 || count !== 0) rows.push({ key, count, bytes });
  }
  rows.sort((x, y) => y.bytes - x.bytes || y.count - x.count || (x.key < y.key ? -1 : 1));
  const total = (m) =>
    [...m.values()].reduce((t, s) => ({ count: t.count + s.count, bytes: t.bytes + s.bytes }), {
      count: 0,
      bytes: 0,
    });
  return { rows, before: total(before), after: total(after) };
}
