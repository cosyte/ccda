/**
 * Build the multi-line `describe()` output for a {@link CcdaProfile}. Omits
 * lines for absent fields; lineage renders as `a → b → c`. Guaranteed non-empty
 * and always starts with `Profile '<name>'` so the "contains the profile name"
 * contract holds regardless of which lines are omitted.
 *
 * @internal
 */

import type { CcdaProfile } from "./types.js";

/**
 * Format a {@link CcdaProfile} as a human-readable multi-line description.
 *
 * @internal
 */
export function buildDescribe(p: CcdaProfile): string {
  const lines: string[] = [`Profile '${p.name}'`];
  if (p.description !== undefined) {
    lines.push(`  description: ${p.description}`);
  }
  // `describe()` is only ever attached by the factory, which always fills
  // `lineage` with at least the profile's own name — so it is non-empty here.
  lines.push(`  lineage: ${p.lineage.join(" → ")}`);
  if (p.provenance !== undefined) {
    lines.push(`  grounded in: ${p.provenance.source} (${p.provenance.reference})`);
  }
  if (p.tolerate.length === 0) {
    lines.push("  tolerates: nothing (conservative baseline)");
  } else {
    lines.push(`  tolerates ${String(p.tolerate.length)} quirk(s):`);
    for (const t of p.tolerate) {
      const scope =
        t.match?.sectionCode !== undefined
          ? ` @section ${t.match.sectionCode}`
          : t.match?.templateId !== undefined
            ? ` @template ${t.match.templateId}`
            : "";
      lines.push(`    - ${t.code}${scope}: ${t.rationale}`);
    }
  }
  return lines.join("\n");
}
