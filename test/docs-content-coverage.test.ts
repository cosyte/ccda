import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, test } from "vitest";

import { DOCS_CONTENT_EXEMPTIONS, EXEMPTION_GROUPS } from "./docs-content-exemptions.js";

/**
 * The `docs-content/` bundle guard: the release artifact `pnpm pack:docs` ships to the docs site is
 * checked for **surface coverage**, **page-shape consistency** and **agreement with the shipped
 * package**, the three things the sibling `test/docs-content.test.ts` deliberately does not look at.
 *
 * THE DIVISION OF LABOUR BETWEEN THE TWO FILES IS THE POINT. `docs-content.test.ts` asks "do the
 * examples still RUN", which it answers by compiling and executing every runnable block against the
 * built ESM artifact. That gate cannot see a symbol nobody wrote an example for, a page nobody put in
 * the sidebar, or a version number that was true when it was typed. This file asks "is the surface
 * still COVERED and do the pages still AGREE with each other", which needs no build at all.
 *
 * **NOTHING HERE SPAWNS A BUILD, AND THAT IS A CONSTRAINT RATHER THAN A PREFERENCE.**
 * `docs-content.test.ts` provisions `dist/` by spawning `pnpm build` in a `beforeAll`. Vitest runs
 * test FILES in parallel, so a second file spawning `tsup` would race on the same output directory,
 * which is the exact reason that file also carries the README suite instead of a file of its own. The
 * export inventory below is therefore read from `src/index.ts` through the TypeScript compiler API,
 * not from `dist/index.d.ts`. That is not a weaker proxy: it was verified to yield the identical set
 * of 226 symbols the dts rollup exports, and it resolves the `export * from "./model/types/index.js"`
 * barrel exactly rather than by regex.
 *
 * **WHY THE SYMBOL LIST IS COMPUTED AND NEVER SNAPSHOTTED.** A committed list of expected exports
 * would be a second thing to update, and the failure mode of forgetting is silence: the guard would
 * keep checking yesterday's surface and report green over a new undocumented export. Computing it
 * means a new export is visible here the moment it is added, which is the whole reason this file
 * exists.
 *
 * **EVERY FAILURE MODE HAS A NEGATIVE CONTROL** (`describe("negative controls")` at the bottom). The
 * live assertions above them all pass on a healthy tree, so on their own they cannot distinguish a
 * guard that works from a guard that cannot fail. Each check is a pure function over its inputs
 * precisely so the controls can feed it a broken bundle without touching the real one.
 */
const root = join(import.meta.dirname, "..");
const DOCS_DIR = join(root, "docs-content");
const ENTRY = "src/index.ts";

/** The frontmatter keys every page in the bundle must carry. */
const REQUIRED_FRONTMATTER_KEYS = ["id", "title", "sidebar_label", "sidebar_position"] as const;

/**
 * The historical versions the bundle dates a real behaviour change to, and the total number of such
 * mentions on the tree this guard was written against.
 *
 * THESE ARE A RETENTION FLOOR, NOT A CEILING, and they are the counterweight to the version rule
 * below. "Remove every version literal" and "keep the change record" pull in opposite directions, and
 * a sweep that satisfies the first by deleting the second is a coverage regression dressed as a
 * consistency fix: a reader pinned to an old version loses the sentence that tells them what their
 * version does differently. So the rule is narrow on purpose. It targets a claim about the PRESENT
 * ("published on npm at `0.0.3`"), never a note about the PAST ("fixed in `0.0.3`").
 */
const HISTORICAL_VERSIONS = ["0.0.2", "0.0.3", "0.0.4", "0.0.11"] as const;
const HISTORICAL_MENTION_FLOOR = 15;

/** One page of the bundle, parsed into its frontmatter and its body. */
interface DocPage {
  /** File name within `docs-content/`, e.g. `intro.md`. */
  readonly file: string;
  /** File name without the `.md` extension, which must equal the frontmatter `id`. */
  readonly stem: string;
  /** Frontmatter keys in declaration order, mapped to their raw string values. */
  readonly frontmatter: ReadonlyMap<string, string>;
  /** Everything after the frontmatter block. */
  readonly body: string;
}

/**
 * Split a page into its frontmatter map and its body. Deliberately a line scan rather than a YAML
 * parse: the bundle's frontmatter is flat `key: value` and adding a YAML dependency to read four
 * keys would be a runtime dependency argument this repo does not want to have.
 */
function parsePage(file: string, raw: string): DocPage {
  const stem = file.replace(/\.md$/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const frontmatter = new Map<string, string>();
  if (match === null) return { file, stem, frontmatter, body: raw };

  const [, block = "", body = ""] = match;
  for (const line of block.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    frontmatter.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return { file, stem, frontmatter, body };
}

/** Read every `.md` page of the bundle, in file-name order. */
function readBundle(): readonly DocPage[] {
  return readdirSync(DOCS_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => parsePage(file, readFileSync(join(DOCS_DIR, file), "utf8")));
}

/** `JSON.parse` that hands back `unknown` rather than `any`, so callers must narrow. */
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/** Narrow an `unknown` to a plain object, or `undefined` when it is not one. */
function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

/**
 * Every symbol `src/index.ts` exports, values and types alike, resolved through the TypeScript
 * checker so re-export barrels and `export *` are followed exactly.
 *
 * A TYPE IS PART OF THE PUBLIC SURFACE. Reading the runtime namespace of the built ESM artifact
 * would report 108 of the 226 names a consumer can import and call the other 118 covered by saying
 * nothing about them, which is the reading this guard exists to refuse: `TerminologyAdapter` is the
 * contract a caller implements and it has no runtime existence at all.
 */
function publicExports(): readonly string[] {
  const program = ts.createProgram([ENTRY], {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
  });
  const source = program.getSourceFile(ENTRY);
  expect(source, `TypeScript could not load the public entry point ${ENTRY}`).toBeDefined();
  const checker = program.getTypeChecker();
  const moduleSymbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  expect(moduleSymbol, `${ENTRY} did not resolve as a module symbol`).toBeDefined();
  if (moduleSymbol === undefined) return [];
  return checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => symbol.getName())
    .sort();
}

/** Every ` ```ts runnable ` block in the bundle, with the page it came from. */
interface RunnableBlock {
  readonly file: string;
  readonly code: string;
}

/**
 * Extract the executable examples. Matches the tag the sibling snippet runner executes
 * (` ```ts runnable ` and ` ```ts runnable throws `) and deliberately NOT plain ` ```ts `, which is
 * illustrative and is never run: an illustrative block is exactly the kind of "example" that can
 * describe an API the package does not have.
 */
function runnableBlocks(pages: readonly DocPage[]): readonly RunnableBlock[] {
  const blocks: RunnableBlock[] = [];
  for (const page of pages) {
    const pattern = /^```ts runnable(?: throws)?\r?\n([\s\S]*?)^```/gm;
    let hit = pattern.exec(page.body);
    while (hit !== null) {
      blocks.push({ file: page.file, code: hit[1] ?? "" });
      hit = pattern.exec(page.body);
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// THE CHECKS. Each is a pure function over its inputs returning human-readable failures, so the
// negative controls below can drive it with a broken bundle the real tree never contains.
// ---------------------------------------------------------------------------

/**
 * Every page carries the required keys, every page is shaped identically, `id` equals the filename
 * stem, and `title` / `sidebar_label` are present and non-empty.
 */
export function frontmatterFailures(
  pages: readonly DocPage[],
  requiredKeys: readonly string[],
): readonly string[] {
  const failures: string[] = [];
  const shapes = new Map<string, string[]>();

  for (const page of pages) {
    const keys = [...page.frontmatter.keys()].sort();
    const shape = keys.join(",");
    shapes.set(shape, [...(shapes.get(shape) ?? []), page.file]);

    for (const key of requiredKeys) {
      if (!page.frontmatter.has(key))
        failures.push(`${page.file}: frontmatter is missing \`${key}\``);
    }
    const id = page.frontmatter.get("id");
    if (id !== undefined && id !== page.stem) {
      failures.push(
        `${page.file}: frontmatter \`id\` is "${id}" but the filename stem is "${page.stem}"`,
      );
    }
    for (const key of ["title", "sidebar_label"]) {
      const value = page.frontmatter.get(key);
      if (value !== undefined && value.trim() === "") {
        failures.push(`${page.file}: frontmatter \`${key}\` is present but empty`);
      }
    }
  }

  if (shapes.size > 1) {
    const shown = [...shapes.entries()]
      .map(([shape, files]) => `  [${shape}] <- ${files.join(", ")}`)
      .join("\n");
    failures.push(`pages do not share one frontmatter shape:\n${shown}`);
  }
  return failures;
}

/**
 * Walk `sidebars.json` and collect the doc ids it references, in document order. An unrecognized
 * node shape is reported rather than skipped: a sidebar entry this walker cannot read is an entry it
 * cannot prove reachable, and silently passing over one is how an unreachable page ships.
 */
export function collectSidebarIds(
  node: unknown,
  path: string,
): {
  readonly ids: readonly string[];
  readonly failures: readonly string[];
} {
  const ids: string[] = [];
  const failures: string[] = [];

  const walk = (value: unknown, where: string): void => {
    if (typeof value === "string") {
      ids.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        walk(child, `${where}[${index}]`);
      });
      return;
    }
    const record = asRecord(value);
    if (record === undefined) {
      failures.push(`${where}: unrecognized sidebar node (${typeof value})`);
      return;
    }
    const type = record["type"];
    if (type === "category") {
      walk(record["items"], `${where}.items`);
      return;
    }
    if (type === "doc") {
      const id = record["id"];
      if (typeof id === "string") ids.push(id);
      else failures.push(`${where}: a "doc" entry carries no string \`id\``);
      return;
    }
    failures.push(`${where}: unrecognized sidebar node type ${JSON.stringify(type)}`);
  };

  walk(node, path);
  return { ids, failures };
}

/**
 * The bijection: every page is referenced exactly once, and every referenced id resolves to a page
 * that exists. A page added or renamed without a matching sidebar entry is named by file, because
 * the remedy is to edit `sidebars.json` and the file name is what the editor needs.
 */
export function sidebarFailures(
  stems: readonly string[],
  sidebarIds: readonly string[],
): readonly string[] {
  const failures: string[] = [];
  const counts = new Map<string, number>();
  for (const id of sidebarIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  for (const stem of stems) {
    const count = counts.get(stem) ?? 0;
    if (count === 0) {
      failures.push(
        `${stem}.md is in the bundle but no sidebars.json entry references it: the page would ship unreachable`,
      );
    } else if (count > 1) {
      failures.push(
        `${stem}.md is referenced ${String(count)} times in sidebars.json; expected exactly once`,
      );
    }
  }
  for (const id of new Set(sidebarIds)) {
    if (!stems.includes(id)) {
      failures.push(`sidebars.json references "${id}" but docs-content/${id}.md does not exist`);
    }
  }
  return failures;
}

/**
 * `sidebar_position` is a positive integer, unique across the bundle, and equal to the page's 1-based
 * place in the sidebar's own order.
 *
 * TYING THE TWO TOGETHER IS THE FIX FOR THE COLLISION, not merely detecting it. Requiring only
 * uniqueness would let the two orderings disagree, which is a slower version of the same defect: the
 * bundle would carry two answers to "what comes after this page". `sidebars.json` is the authority
 * because it is what the site renders; the frontmatter number has to agree with it.
 */
export function positionFailures(
  pages: readonly DocPage[],
  sidebarOrder: readonly string[],
): readonly string[] {
  const failures: string[] = [];
  const seen = new Map<string, string>();

  for (const page of pages) {
    const raw = page.frontmatter.get("sidebar_position");
    if (raw === undefined) continue;
    if (!/^[1-9]\d*$/.test(raw)) {
      failures.push(`${page.file}: sidebar_position "${raw}" is not a positive integer`);
      continue;
    }
    const previous = seen.get(raw);
    if (previous !== undefined) {
      failures.push(`${page.file}: sidebar_position ${raw} collides with ${previous}`);
    }
    seen.set(raw, page.file);

    const index = sidebarOrder.indexOf(page.stem);
    if (index === -1) continue;
    const expected = index + 1;
    if (Number(raw) !== expected) {
      failures.push(
        `${page.file}: sidebar_position is ${raw} but the page is #${String(expected)} in sidebars.json order`,
      );
    }
  }
  return failures;
}

/**
 * Every exported symbol is named by at least one page, or carries a non-empty reason in the
 * exemption record. The failure names the symbol, because the remedy is per symbol: write about it
 * or exempt it.
 */
export function coverageFailures(
  symbols: readonly string[],
  bundleText: string,
  exemptions: Readonly<Record<string, string>>,
): readonly string[] {
  const failures: string[] = [];
  for (const symbol of symbols) {
    const reason = Object.prototype.hasOwnProperty.call(exemptions, symbol)
      ? exemptions[symbol]
      : undefined;
    if (reason !== undefined) {
      if (reason.trim() === "") {
        failures.push(`${symbol}: exempted with an empty reason; an exemption must state one`);
      }
      continue;
    }
    if (!new RegExp(`\\b${symbol}\\b`).test(bundleText)) {
      failures.push(
        `${symbol}: exported by src/index.ts but named by no page in docs-content/ and carrying no exemption`,
      );
    }
  }
  return failures;
}

/**
 * An exemption may not outlive its reason: every name in the record must still be exported. An empty
 * record is the healthy end state and never a failure on its own.
 */
export function staleExemptionFailures(
  symbols: readonly string[],
  exemptions: Readonly<Record<string, string>>,
): readonly string[] {
  const exported = new Set(symbols);
  return Object.keys(exemptions)
    .filter((symbol) => !exported.has(symbol))
    .map(
      (symbol) =>
        `${symbol}: the exemption record is stale, src/index.ts no longer exports this symbol`,
    );
}

/**
 * The bundle asserts no CURRENTLY PUBLISHED version as a literal, while every historical change note
 * survives. Both halves are checked here on purpose: they are the two ways this rule is got wrong,
 * and a guard that enforced only the first would reward deleting the change record.
 */
export function versionFailures(
  pages: readonly DocPage[],
  currentVersion: string,
  historical: readonly string[],
  mentionFloor: number,
): readonly string[] {
  const failures: string[] = [];
  const escaped = currentVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const currentLiteral = new RegExp(`\\b${escaped}(?!\\d)`);

  for (const page of pages) {
    if (currentLiteral.test(page.body)) {
      failures.push(
        `${page.file}: names the currently published version ${currentVersion} as a literal; say what the software does, or point at \`npm view\``,
      );
    }
    if (/published on npm at/i.test(page.body)) {
      failures.push(
        `${page.file}: carries a "published on npm at <version>" claim about the present, which is stale by the next release`,
      );
    }
  }

  const bundleText = pages.map((page) => page.body).join("\n");
  let mentions = 0;
  for (const version of historical) {
    const escapedHistorical = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hits = bundleText.match(new RegExp(`\\b${escapedHistorical}(?!\\d)`, "g"));
    if (hits === null) {
      failures.push(
        `the change note dating a behaviour change to ${version} is gone; historical notes are the change record, not staleness`,
      );
      continue;
    }
    mentions += hits.length;
  }
  if (mentions < mentionFloor) {
    failures.push(
      `historical version mentions dropped to ${String(mentions)}, below the retention floor of ${String(mentionFloor)}`,
    );
  }
  return failures;
}

// ---------------------------------------------------------------------------
// LIVE ASSERTIONS over the real bundle.
// ---------------------------------------------------------------------------

const pages = readBundle();
const stems = pages.map((page) => page.stem);
const bundleText = pages.map((page) => page.body).join("\n");
const sidebarsJson = readJson(join(DOCS_DIR, "sidebars.json"));
const sidebar = collectSidebarIds(asRecord(sidebarsJson)?.["docs"], "sidebars.json#docs");

describe("docs-content bundle: export coverage", () => {
  test("every exported symbol is documented or carries a reasoned exemption", () => {
    const symbols = publicExports();
    expect(symbols.length).toBeGreaterThan(100);
    expect(coverageFailures(symbols, bundleText, DOCS_CONTENT_EXEMPTIONS)).toStrictEqual([]);
  }, 30_000);

  test("no exemption outlives the symbol it excuses", () => {
    expect(staleExemptionFailures(publicExports(), DOCS_CONTENT_EXEMPTIONS)).toStrictEqual([]);
  }, 30_000);

  test("every exemption states a non-empty reason and no symbol is grouped twice", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const group of EXEMPTION_GROUPS) {
      expect(group.reason.trim(), "an exemption group carries an empty reason").not.toBe("");
      for (const symbol of group.symbols) {
        if (seen.has(symbol)) duplicates.push(symbol);
        seen.add(symbol);
      }
    }
    expect(
      duplicates,
      "a symbol appears in two exemption groups, so one reason is unreachable",
    ).toStrictEqual([]);
  });
});

describe("docs-content bundle: the three task surfaces have executable examples", () => {
  const blocks = runnableBlocks(pages);

  /**
   * Each surface names the symbol whose ABSENCE from every executable example is the defect: a prose
   * mention is what this bundle already had for all three, and prose cannot be executed against the
   * shipped package the way `test/docs-content.test.ts` executes these.
   */
  const surfaces = [
    { task: "apply a vendor profile", symbol: "defineCcdaProfile" },
    { task: "supply a bring-your-own terminology adapter", symbol: "TerminologyAdapter" },
    {
      task: "read a document type's required-section conformance status",
      symbol: "requiredSectionStatus",
    },
  ] as const;

  for (const { task, symbol } of surfaces) {
    test(`"${task}" has its own executable example`, () => {
      const hosting = blocks.filter(
        (block) =>
          block.file !== "troubleshooting.md" && new RegExp(`\\b${symbol}\\b`).test(block.code),
      );
      expect(
        hosting.map((block) => block.file),
        `no runnable example outside the limitations page uses ${symbol}`,
      ).not.toStrictEqual([]);
    });
  }

  test("no runnable example reaches the network or a licensed terminology service", () => {
    const offenders = blocks
      .filter((block) =>
        /\b(?:fetch|XMLHttpRequest|https?:\/\/(?!www\.w3\.org|schemas\.)|node:https?\b)/.test(
          block.code,
        ),
      )
      .map((block) => block.file);
    expect(offenders, "a runnable example looks like it performs I/O").toStrictEqual([]);
  });
});

describe("docs-content bundle: page shape", () => {
  test("every page carries the same frontmatter key set", () => {
    expect(frontmatterFailures(pages, REQUIRED_FRONTMATTER_KEYS)).toStrictEqual([]);
  });

  test("sidebars.json is fully readable", () => {
    expect(sidebar.failures).toStrictEqual([]);
  });

  test("every page is reachable from sidebars.json exactly once", () => {
    expect(sidebarFailures(stems, sidebar.ids)).toStrictEqual([]);
  });

  test("sidebar_position is unique and agrees with sidebars.json order", () => {
    expect(positionFailures(pages, sidebar.ids)).toStrictEqual([]);
  });

  test("the release bundle's two required members are present", () => {
    expect(stems).toContain("intro");
    expect(readdirSync(DOCS_DIR)).toContain("sidebars.json");
  });
});

describe("docs-content bundle: agreement with the shipped package", () => {
  const pkg = asRecord(readJson(join(root, "package.json")));
  const version = pkg?.["version"];
  const scripts = asRecord(pkg?.["scripts"]);

  test("no page asserts the currently published version, and the change record survives", () => {
    expect(typeof version, "package.json declares no string version").toBe("string");
    expect(
      versionFailures(
        pages,
        typeof version === "string" ? version : "",
        HISTORICAL_VERSIONS,
        HISTORICAL_MENTION_FLOOR,
      ),
    ).toStrictEqual([]);
  });

  test("the repository formatter checks every docs-content page", () => {
    for (const name of ["format", "format:check"]) {
      const script = scripts?.[name];
      expect(typeof script, `package.json has no \`${name}\` script`).toBe("string");
      expect(
        typeof script === "string" ? script : "",
        `\`${name}\` does not cover docs-content/**/*.md, so the bundle can drift out of format`,
      ).toContain("docs-content/**/*.md");
    }
  });
});

// ---------------------------------------------------------------------------
// NEGATIVE CONTROLS. A guard that cannot fail is caught here rather than believed. Every unhappy
// path the spec names is driven through the same pure function the live assertion above uses.
// ---------------------------------------------------------------------------

describe("negative controls", () => {
  /** Build a page without touching the real bundle. */
  const page = (stem: string, frontmatter: Record<string, string>, body = ""): DocPage => ({
    file: `${stem}.md`,
    stem,
    frontmatter: new Map(Object.entries(frontmatter)),
    body,
  });

  const healthy = (stem: string, position: number): DocPage =>
    page(stem, {
      id: stem,
      title: stem,
      sidebar_label: stem,
      sidebar_position: String(position),
    });

  test("a page with no sidebars.json entry fails, naming the file", () => {
    const failures = sidebarFailures(["intro", "orphan"], ["intro"]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("orphan.md");
    expect(failures[0]).toContain("unreachable");
  });

  test("a sidebar entry pointing at no page fails, naming the id", () => {
    const failures = sidebarFailures(["intro"], ["intro", "renamed-away"]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("renamed-away");
  });

  test("a page referenced twice fails", () => {
    const failures = sidebarFailures(["intro"], ["intro", "intro"]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("referenced 2 times");
  });

  test("an undocumented, unexempted symbol fails, naming the symbol", () => {
    const failures = coverageFailures(
      ["parseCcda", "brandNewExport"],
      "parseCcda is documented.",
      {},
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("brandNewExport");
  });

  test("an exemption with an empty reason fails, naming the symbol", () => {
    const failures = coverageFailures(["hiddenExport"], "", { hiddenExport: "   " });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("hiddenExport");
    expect(failures[0]).toContain("empty reason");
  });

  test("a substring of a documented symbol is not counted as documented", () => {
    // `parseCcda` must not satisfy `parse`, or coverage would be reported on a prefix match.
    expect(coverageFailures(["parse"], "Call parseCcda to read a document.", {})).toHaveLength(1);
  });

  test("an exemption for a symbol no longer exported fails and says it is stale", () => {
    const failures = staleExemptionFailures(["parseCcda"], {
      parseCcda: "documented",
      removedYesterday: "was internal",
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("removedYesterday");
    expect(failures[0]).toContain("stale");
  });

  test("an EMPTY exemption record passes on that account alone", () => {
    // The healthy end state: nothing to excuse. It must not read as a missing input.
    expect(staleExemptionFailures(["parseCcda", "serializeCcda"], {})).toStrictEqual([]);
    expect(coverageFailures(["parseCcda"], "parseCcda reads a document.", {})).toStrictEqual([]);
  });

  test("a missing or empty frontmatter key fails, naming the file and the key", () => {
    const missing = frontmatterFailures(
      [page("intro", { id: "intro", title: "Intro", sidebar_position: "1" })],
      REQUIRED_FRONTMATTER_KEYS,
    );
    expect(missing.some((f) => f.includes("intro.md") && f.includes("sidebar_label"))).toBe(true);

    const empty = frontmatterFailures(
      [page("intro", { id: "intro", title: "Intro", sidebar_label: "  ", sidebar_position: "1" })],
      REQUIRED_FRONTMATTER_KEYS,
    );
    expect(empty.some((f) => f.includes("present but empty"))).toBe(true);
  });

  test("an id that disagrees with the filename stem fails", () => {
    const failures = frontmatterFailures(
      [
        page("installation", {
          id: "install",
          title: "T",
          sidebar_label: "L",
          sidebar_position: "1",
        }),
      ],
      REQUIRED_FRONTMATTER_KEYS,
    );
    expect(failures.some((f) => f.includes('"install"') && f.includes('"installation"'))).toBe(
      true,
    );
  });

  test("pages with differently shaped frontmatter fail", () => {
    const failures = frontmatterFailures(
      [
        healthy("a", 1),
        page("b", {
          id: "b",
          title: "B",
          sidebar_label: "B",
          sidebar_position: "2",
          draft: "true",
        }),
      ],
      REQUIRED_FRONTMATTER_KEYS,
    );
    expect(failures.some((f) => f.includes("do not share one frontmatter shape"))).toBe(true);
  });

  test("colliding and out-of-order sidebar_position values fail", () => {
    const collide = positionFailures([healthy("a", 1), healthy("b", 1)], ["a", "b"]);
    expect(collide.some((f) => f.includes("collides"))).toBe(true);

    const disagree = positionFailures([healthy("a", 1), healthy("b", 5)], ["a", "b"]);
    expect(disagree.some((f) => f.includes("#2 in sidebars.json order"))).toBe(true);
  });

  test("an unreadable sidebar node is reported rather than skipped", () => {
    const { ids, failures } = collectSidebarIds({ type: "link", href: "/x" }, "root");
    expect(ids).toStrictEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("unrecognized sidebar node type");
  });

  test("a page asserting the currently published version fails", () => {
    const failures = versionFailures(
      [page("intro", { id: "intro" }, "Published on npm at `0.0.15` today.")],
      "0.0.15",
      [],
      0,
    );
    expect(failures.some((f) => f.includes("intro.md") && f.includes("0.0.15"))).toBe(true);
    expect(failures.some((f) => f.includes("published on npm at"))).toBe(true);
  });

  test("a historical note is NOT read as a current-version assertion", () => {
    // The whole point of the narrow rule: `0.0.3` in a change note must survive a `0.0.15` tree.
    expect(
      versionFailures(
        [page("troubleshooting", { id: "troubleshooting" }, "This was fixed in `0.0.3`.")],
        "0.0.15",
        ["0.0.3"],
        1,
      ),
    ).toStrictEqual([]);
  });

  test("a longer version is not matched by a shorter current version", () => {
    // `0.0.1` must not match inside `0.0.15`, or every tree past 0.0.9 reds on its own history.
    expect(
      versionFailures([page("intro", { id: "intro" }, "Changed in `0.0.15`.")], "0.0.1", [], 0),
    ).toStrictEqual([]);
  });

  test("deleting the change record fails, even with no current-version literal", () => {
    const failures = versionFailures(
      [page("intro", { id: "intro" }, "No versions here.")],
      "0.0.15",
      ["0.0.3"],
      1,
    );
    expect(failures.some((f) => f.includes("0.0.3") && f.includes("change record"))).toBe(true);
  });
});
