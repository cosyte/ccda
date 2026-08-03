import { assertNoDiagnosticPhiLeak, PHI_MARKER_UNIT } from "@cosyte/test-utils";
import { describe, expect, it, vi } from "vitest";

import { ALL_WARNING_MESSAGES } from "../src/parser/warnings.js";
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
});
