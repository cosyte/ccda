/**
 * The arithmetic bench/long-run.mjs reads memory with: the settled heap, the slope of a long run,
 * the bytes a call allocated across collections, and a heap snapshot summed and diffed by what
 * each object is. The last is checked on real snapshots of a small process that keeps a known
 * number of objects, so the field layout it reads is V8's, not one written here.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getHeapSpaceStatistics } from "node:v8";

import { afterAll, describe, expect, it } from "vitest";

import {
  SETTLE_BYTES,
  allocatedBytes,
  codeBytes,
  diffSummaries,
  fitGrowth,
  median,
  nodeKey,
  settle,
  summarizeSnapshot,
  theilSenSlope,
  type HeapSnapshot,
} from "../bench/memory.mjs";

describe("median and theilSenSlope", () => {
  it("takes the middle value, or the mean of the middle two", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("fits a line exactly and is not moved by one outlier", () => {
    const xs = [0, 1, 2, 3, 4, 5, 6];
    expect(theilSenSlope(xs, [10, 12, 14, 16, 18, 20, 22])).toBe(2);
    expect(theilSenSlope(xs, [10, 12, 14, 1_000, 18, 20, 22])).toBe(2);
  });

  it("is 0 with no pair of distinct points", () => {
    expect(theilSenSlope([1], [5])).toBe(0);
    expect(theilSenSlope([1, 1], [5, 9])).toBe(0);
  });
});

describe("settle", () => {
  it("stops after two quiet collections in a row", () => {
    const heaps = [1_000_000, 500_000, 400_000, 399_000, 398_000];
    let at = 0;
    const s = settle(
      () => {
        at++;
      },
      () => heaps[at] ?? 0,
    );
    // 500 KB and 100 KB freed are not quiet; 1 KB and 1 KB are.
    expect(s).toEqual({ settled: true, rounds: 4, heap: 398_000 });
  });

  it("gives up after seven collections that keep freeing", () => {
    let heap = 10_000_000;
    const s = settle(
      () => {
        heap -= SETTLE_BYTES;
      },
      () => heap,
    );
    expect(s.settled).toBe(false);
    expect(s.rounds).toBe(7);
  });
});

describe("fitGrowth", () => {
  it("calls 64 KiB over the span growing and less flat", () => {
    const rounds = (perOp: number) =>
      Array.from({ length: 25 }, (_v, i) => ({ ops: i * 100, heap: 1_000_000 + i * 100 * perOp }));
    const growing = fitGrowth(rounds(28));
    expect(growing.ops).toBe(2_400);
    expect(growing.slopeBytesPerOp).toBe(28);
    expect(growing.growthBytes).toBe(28 * 2_400);
    expect(growing.verdict).toBe("growing");
    expect(growing.detectableBytesPerOp).toBeCloseTo(65_536 / 2_400, 10);
    expect(fitGrowth(rounds(27)).verdict).toBe("flat");
  });

  it("calls a heap that steps up once and stays there flat", () => {
    const rounds = Array.from({ length: 300 }, (_v, i) => ({
      ops: i * 100,
      heap: i < 3 ? 1_000_000 : 1_200_000,
    }));
    expect(fitGrowth(rounds).slopeBytesPerOp).toBe(0);
    expect(fitGrowth(rounds).verdict).toBe("flat");
  });

  it("detects nothing over a window of one round", () => {
    const f = fitGrowth([{ ops: 0, heap: 1 }]);
    expect(f.ops).toBe(0);
    expect(f.detectableBytesPerOp).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("codeBytes", () => {
  it("sums the code and trusted spaces and nothing else", () => {
    const stats = [
      { space_name: "new_space", space_used_size: 1_000 },
      { space_name: "old_space", space_used_size: 2_000 },
      { space_name: "code_space", space_used_size: 300 },
      { space_name: "code_large_object_space", space_used_size: 40 },
      { space_name: "trusted_space", space_used_size: 5 },
      { space_name: "large_object_space", space_used_size: 60_000 },
    ];
    expect(codeBytes(stats)).toBe(345);
  });

  it("finds the code spaces this Node names", () => {
    const stats = getHeapSpaceStatistics();
    expect(stats.some((s) => s.space_name === "code_space")).toBe(true);
    expect(codeBytes(stats)).toBeGreaterThan(0);
  });
});

describe("allocatedBytes", () => {
  const gc = (before: number, after: number) => ({
    beforeGC: { heapStatistics: { usedHeapSize: before } },
    afterGC: { heapStatistics: { usedHeapSize: after } },
  });

  it("is the growth when nothing was collected", () => {
    expect(allocatedBytes(1_000, [], 1_500)).toBe(500);
  });

  it("adds what the heap grew by before each collection and after the last", () => {
    // 1,000 to 9,000 (8,000), collected to 2,000; to 7,000 (5,000), collected to 3,000; to 3,500.
    expect(allocatedBytes(1_000, [gc(9_000, 2_000), gc(7_000, 3_000)], 3_500)).toBe(13_500);
  });
});

describe("nodeKey", () => {
  it("sums a value by its type alone, so no text of a document is shown", () => {
    expect(nodeKey("string", "Synthetic Patient Doe")).toBe("(string)");
    expect(nodeKey("concatenated string", "a")).toBe("(concatenated string)");
    expect(nodeKey("number", "42")).toBe("(number)");
  });

  it("names an object by its constructor, cut at 80 characters", () => {
    expect(nodeKey("object", "Map")).toBe("object: Map");
    expect(nodeKey("closure", "x".repeat(100))).toBe(`closure: ${"x".repeat(80)}...`);
  });
});

describe("summarizeSnapshot and diffSummaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "ccda-bench-memory-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // A small process that keeps 1,000 objects of a class, writes a snapshot, keeps 500 more and
  // writes another.
  const script = `
    const { writeHeapSnapshot } = require("node:v8");
    const { join } = require("node:path");
    class SyntheticKept { constructor(i) { this.i = i; } }
    globalThis.kept = Array.from({ length: 1000 }, (_v, i) => new SyntheticKept(i));
    writeHeapSnapshot(join(process.argv[1], "a.heapsnapshot"));
    for (let i = 0; i < 500; i++) globalThis.kept.push(new SyntheticKept(i));
    writeHeapSnapshot(join(process.argv[1], "b.heapsnapshot"));
  `;

  it("counts the objects a process keeps, by constructor, and names what grew", () => {
    const run = spawnSync(process.execPath, ["-e", script, dir], { encoding: "utf8" });
    expect(run.status).toBe(0);
    const read = (name: string) =>
      summarizeSnapshot(JSON.parse(readFileSync(join(dir, name), "utf8")) as HeapSnapshot);
    const a = read("a.heapsnapshot");
    const b = read("b.heapsnapshot");
    expect(a.get("object: SyntheticKept")?.count).toBe(1_000);
    expect(b.get("object: SyntheticKept")?.count).toBe(1_500);

    const diff = diffSummaries(a, b);
    const kept = diff.rows.find((r) => r.key === "object: SyntheticKept");
    expect(kept?.count).toBe(500);
    expect(kept?.bytes).toBeGreaterThan(0);
    expect(diff.after.count).toBeGreaterThan(diff.before.count);
  }, 30_000); // of a few megabytes, well under a second on an idle machine and several under load. // Two snapshots of a bare Node process, in a process of its own: its start-up and two writes

  it("puts the largest growth first and leaves out what did not change", () => {
    const before = new Map([
      ["object: A", { count: 1, bytes: 10 }],
      ["object: Same", { count: 2, bytes: 20 }],
      ["object: Gone", { count: 3, bytes: 30 }],
    ]);
    const after = new Map([
      ["object: A", { count: 5, bytes: 50 }],
      ["object: Same", { count: 2, bytes: 20 }],
      ["object: New", { count: 1, bytes: 100 }],
    ]);
    const diff = diffSummaries(before, after);
    expect(diff.rows).toEqual([
      { key: "object: New", count: 1, bytes: 100 },
      { key: "object: A", count: 4, bytes: 40 },
      { key: "object: Gone", count: -3, bytes: -30 },
    ]);
    expect(diff.before).toEqual({ count: 6, bytes: 60 });
    expect(diff.after).toEqual({ count: 8, bytes: 170 });
  });
});
