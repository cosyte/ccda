// Types for bench/memory.mjs, so test/bench-memory.test.ts can check its arithmetic.

/** The median of `values`. */
export declare function median(values: readonly number[]): number;

/** The Theil-Sen slope of `ys` over `xs`, 0 with no pair to fit. */
export declare function theilSenSlope(xs: readonly number[], ys: readonly number[]): number;

/** Below this a forced collection is quiet. */
export declare const SETTLE_BYTES: number;

export interface Settled {
  settled: boolean;
  rounds: number;
  heap: number;
}

/** Forced full collections until two in a row free less than 64 KiB, at most seven. */
export declare function settle(gc: () => void, usedHeap: () => number): Settled;

export interface Growth {
  rounds: number;
  ops: number;
  slopeBytesPerOp: number;
  growthBytes: number;
  detectableBytesPerOp: number;
  verdict: "flat" | "growing";
}

/** The growth a long run's settled readings show over their span. */
export declare function fitGrowth(
  rounds: readonly { ops: number; heap: number }[],
  growingBytes?: number,
): Growth;

export interface GcStatistic {
  beforeGC: { heapStatistics: { usedHeapSize: number } };
  afterGC: { heapStatistics: { usedHeapSize: number } };
}

/** The bytes allocated between two heap readings, across the collections in between. */
export declare function allocatedBytes(
  startHeap: number,
  gcs: readonly GcStatistic[],
  endHeap: number,
): number;

/** The key a snapshot node is summed under. */
export declare function nodeKey(type: string, name: string): string;

export interface Sum {
  count: number;
  bytes: number;
}

export interface HeapSnapshot {
  snapshot: { meta: { node_fields: string[]; node_types: [string[], ...unknown[]] } };
  nodes: number[];
  strings: string[];
}

/** A heap snapshot summed by `nodeKey`. */
export declare function summarizeSnapshot(snapshot: HeapSnapshot): Map<string, Sum>;

/** What changed between two snapshot summaries, largest growth first. */
export declare function diffSummaries(
  before: ReadonlyMap<string, Sum>,
  after: ReadonlyMap<string, Sum>,
): { rows: { key: string; count: number; bytes: number }[]; before: Sum; after: Sum };
