import { assertNoDiagnosticPhiLeak, PHI_MARKER_UNIT } from "@cosyte/test-utils";
import { describe, expect, it, vi } from "vitest";

import { CCDA_RELEASE_STAMPS, R30_EXTENSION, WARNING_CODES } from "../src/index.js";
import { ALL_WARNING_MESSAGES, templateExtensionUnmodeledRelease } from "../src/parser/warnings.js";
import { buildCcda } from "./__fixtures__/ccda.js";
import { PHI_RUNNER, PHI_SLOTS } from "./__fixtures__/phi-slots.js";

// Both tests in this file sweep the whole PHI slot corpus, so their cost tracks the size
// of the slot table rather than being fixed, and that table is meant to grow. See
// `vitest.config.ts` for why the budget is here rather than global.
vi.setConfig({ testTimeout: 60_000 });

describe("PHI: no consumer-controlled input reaches a diagnostic surface", () => {
  it("holds for every consumer-controlled slot in C-CDA", () => {
    assertNoDiagnosticPhiLeak({ ...PHI_RUNNER, slots: PHI_SLOTS });
  });

  /**
   * The structural half of the same claim, and the half that survives a slot
   * table nobody remembers to extend: whatever a document says, an emitted
   * `message` is a member of the frozen registry. A factory that started
   * interpolating again would fail this without anyone having to think of the
   * slot it leaked through.
   */
  it("emits only messages that are members of the frozen registry", () => {
    const seen = new Set<string>();
    for (const slot of PHI_SLOTS) {
      for (const marker of [PHI_MARKER_UNIT, PHI_MARKER_UNIT.repeat(3)]) {
        let warnings;
        try {
          warnings = PHI_RUNNER.parse(slot.plant(marker)).warnings;
        } catch {
          continue; // a fatal carries no warnings; the runner above sweeps it
        }
        for (const w of warnings) {
          seen.add(w.code);
          expect(
            ALL_WARNING_MESSAGES.has(w.message),
            `${slot.name} produced a ${w.code} message outside the registry: ${w.message}`,
          ).toBe(true);
        }
      }
    }
    // Guard against the corpus going quiet: the assertion above means nothing if
    // the slot table stops producing warnings.
    expect(seen.size).toBeGreaterThan(10);
  });

  /**
   * AC13, and the half the slot table above structurally cannot reach.
   *
   * CCDA-5 added the first message in this package that may NAME a version
   * stamp, so it added the first place a document's own `@extension` could be
   * echoed. Two layers stop it and they are probed separately here, because
   * either one alone would look green while the other was gone:
   *
   * 1. `boundTemplateId` withholds an `@extension` that is not shaped like a
   *    C-CDA version stamp, so most sender values never reach the comparison.
   *    That is what the shared marker probes, and it means the marker cannot
   *    reach the second layer at all.
   * 2. The message is SELECTED from this package's closed stamp table by
   *    membership. A value that passes layer 1 (it really is `YYYY-MM-DD`) but
   *    is not a member yields the generic registry wording, which names no
   *    stamp. That is what the values below probe: each is stamp-shaped, so it
   *    survives layer 1 intact and arrives at the table as itself.
   */
  it("never echoes a stamp-shaped @extension the closed table does not own", () => {
    const planted = ["1999-12-31", "2024-05-02", "0000-00-00", "9999-99-99", "2015-08-02"];
    for (const value of planted) {
      const doc = PHI_RUNNER.parse(buildCcda({ extension: value }));
      const stamp = doc.warnings.find(
        (w) => w.code === WARNING_CODES.TEMPLATE_EXTENSION_UNMODELED_RELEASE,
      );
      // The probe reached the branch that could leak, rather than proving
      // nothing about a path never taken.
      expect(stamp, value).toBeDefined();
      for (const w of doc.warnings) {
        expect(ALL_WARNING_MESSAGES.has(w.message), `${value}: ${w.message}`).toBe(true);
        expect(w.message, value).not.toContain(value);
        // Not even a fragment: the sweep the shared runner uses is four bytes,
        // so match its granularity rather than only the whole token.
        for (let i = 0; i + 4 <= value.length; i += 1) {
          expect(w.message, `${value} @${String(i)}`).not.toContain(value.slice(i, i + 4));
        }
      }
      // The value IS still on the model and in the re-serialized document, which
      // is the point of the bound: nothing is dropped, it just never becomes a
      // diagnostic string.
      expect(doc.templateIds.some((t) => t.extension === value)).toBe(true);
      expect(doc.toString()).toContain(value);
    }
  });

  /**
   * The positive control for the test above. A member of the closed table IS
   * named in the message, and it has to be, or "the message names no stamp"
   * would be trivially true and the test would prove nothing about selection.
   */
  it("does name a stamp the closed table owns", () => {
    const doc = PHI_RUNNER.parse(buildCcda({ extension: R30_EXTENSION }));
    const stamp = doc.warnings.find(
      (w) => w.code === WARNING_CODES.TEMPLATE_EXTENSION_UNMODELED_RELEASE,
    );
    expect(stamp?.message).toContain(R30_EXTENSION);
    expect(ALL_WARNING_MESSAGES.has(stamp?.message ?? "")).toBe(true);
    // It names the release beside the stamp, and both come from the same closed
    // table: the message is one this module could produce with no document at
    // all, which is what "selected, not interpolated" means here.
    const entry = CCDA_RELEASE_STAMPS.find((e) => e.stamp === R30_EXTENSION);
    expect(entry).toBeDefined();
    expect(stamp?.message).toContain(entry?.release ?? "");
    expect(stamp?.message).toBe(templateExtensionUnmodeledRelease({}, entry?.stamp ?? "").message);
  });
});
