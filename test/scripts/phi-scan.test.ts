/**
 * Unit tests for scripts/phi-scan.ts — the C-CDA PHI commit-gate.
 *
 * Positive tests prove the scanner CATCHES real-looking PHI (a weak scanner is
 * worse than none); negative tests prove it PASSES genuinely synthetic,
 * allow-listed content and does NOT trip on coded clinical values or template
 * OIDs. Each fixture exercises one branch of the CDA-aware scanner:
 *   - a clean synthetic document (allow-listed name + DOB + MRN)
 *   - a patient-name violator (`family`)
 *   - a related/assigned-person name violator (`given`/`family` under a non-patient parent)
 *   - a date-of-birth violator (`birthTime@value`)
 *   - an SSN violator (`id@root` = US SSN OID)
 *   - a bare-numeric MRN violator (`id@extension`)
 *   - a street-address / city / postal-code violator
 *   - a non-555 telecom phone violator
 *   - a dashed-SSN and a non-test email in narrative
 *   - three bypass vectors the refuter hunts: XML entity encoding, CDATA, and a
 *     namespace-prefixed / mixed-case element name
 *   - the committed corpus (all-mode) is clean
 *   - coded values + a template OID matching the SSN OID do NOT trip
 *   - the --allow-fixture override-log gate
 *
 * Violator fixtures are written to a throwaway temp dir so they never pollute
 * the committed corpus that `pnpm phi-scan` sweeps. The scanner is invoked via
 * spawnSync (array args, no shell) so the full CLI path (argv parse, exit code,
 * stderr) is exercised.
 *
 * SECURITY: every subprocess call here uses spawnSync with array args. No exec,
 * no shell-form.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, readFileSync, appendFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = process.cwd();
const SCANNER_PATH = join(REPO_ROOT, "scripts", "phi-scan.ts");
const OVERRIDES_PATH = join(REPO_ROOT, "phi-scan-overrides.md");
const TSX_BIN = join(REPO_ROOT, "node_modules", ".bin", "tsx");

/** Wrap section/patient XML in a minimal synthetic US-Realm ClinicalDocument. */
function doc(inner: string): string {
  return `<?xml version="1.0"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <recordTarget><patientRole>
    <id root="2.16.840.1.113883.19.5" extension="MRN001"/>
    <patient>
      <name><given>Jane</given><given>Q</given><family>Doe</family></name>
      <birthTime value="19800101"/>
    </patient>
  </patientRole></recordTarget>
  <component><structuredBody>${inner}</structuredBody></component>
</ClinicalDocument>`;
}

let dir: string;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runScanner(args: string[]): RunResult {
  const r = spawnSync(TSX_BIN, [SCANNER_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: false,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Write a violator/clean document to the temp dir (as .xml) and scan it. */
function scan(name: string, content: string): RunResult {
  const path = join(dir, name);
  writeFileSync(path, content);
  return runScanner([path]);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ccda-phi-scan-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Negative tests — genuinely synthetic, allow-listed content PASSES
// ---------------------------------------------------------------------------

describe("phi-scan: synthetic / allow-listed content passes (exit 0)", () => {
  it("a clean synthetic document exits 0", () => {
    const r = scan("clean.xml", doc(""));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("the committed corpus (all-mode) is clean", () => {
    const r = runScanner([]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/OK — no hits/);
  });

  it("does not flag a coded value or a template OID equal to the SSN OID", () => {
    // The SSN OID as a templateId root, and a bare-numeric-looking clinical code,
    // must NOT be read as PHI — the detectors are element-scoped to <id>/names.
    const r = scan(
      "coded.xml",
      doc(`<section>
        <templateId root="2.16.840.1.113883.4.1"/>
        <code code="55607006" codeSystem="2.16.840.1.113883.6.96" displayName="Problem"/>
        <id root="2.16.840.1.113883.19.5.99999.2" extension="prob-act-1"/>
      </section>`),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Positive tests — real-looking PHI is CAUGHT
// ---------------------------------------------------------------------------

describe("phi-scan: names", () => {
  it("catches a real patient family name", () => {
    const r = scan("name.xml", doc(`<section><text><family>Anderson</family></text></section>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/name\/family/);
    expect(r.stderr).toMatch(/Anderson/);
  });

  it("skips a single-letter middle initial (not identifying)", () => {
    // Family + given are allow-listed; the `Q` middle initial must not trip.
    const r = scan("initial.xml", doc(""));
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });

  it("catches a name under a non-patient parent (assignedPerson)", () => {
    const r = scan(
      "provider.xml",
      doc(`<author><assignedAuthor><assignedPerson><name>
        <given>Ewa</given><family>Kowalski</family>
      </name></assignedPerson></assignedAuthor></author>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Kowalski/);
    expect(r.stderr).toMatch(/Ewa/);
  });

  it("catches a bare (unstructured) name element", () => {
    const r = scan(
      "barename.xml",
      doc(`<informant><relatedEntity><name>Chidi Okafor</name></relatedEntity></informant>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Okafor/);
  });
});

describe("phi-scan: date of birth (birthTime@value)", () => {
  it("catches a DOB not in the allow-list", () => {
    const r = scan("dob.xml", doc(`<observation><birthTime value="19770707"/></observation>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/birthTime@value/);
    expect(r.stderr).toMatch(/19770707/);
  });

  it("catches a partial (YYYYMM) DOB", () => {
    const r = scan("dob6.xml", doc(`<subject><birthTime value="197711"/></subject>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/197711/);
  });
});

describe("phi-scan: identifiers", () => {
  it("catches an SSN under the US SSN OID root", () => {
    // Built from parts so no literal 9-digit SSN string lives in this source.
    const ssn = ["123", "45", "6789"].join("");
    const r = scan(
      "ssn.xml",
      doc(`<patientRole><id root="2.16.840.1.113883.4.1" extension="${ssn}"/></patientRole>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/id@extension/);
    expect(r.stderr).toMatch(/SSN/);
  });

  it("catches a bare-numeric MRN in id@extension", () => {
    const r = scan(
      "mrn.xml",
      doc(`<patientRole><id root="2.16.840.1.113883.19.5" extension="48291043"/></patientRole>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/48291043/);
    expect(r.stderr).toMatch(/MRN/);
  });

  it("catches a 10-digit MRN (modern EHR width, not just 6-9)", () => {
    const r = scan(
      "mrn10.xml",
      doc(`<patientRole><id root="2.16.840.1.113883.19.5" extension="1234509876"/></patientRole>`),
    );
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/1234509876/);
  });
});

// ---------------------------------------------------------------------------
// File selection — detection must follow content, not the file name / location
// (the two MAJOR refuter findings: a real document must not dodge the scanner by
// its extension or directory)
// ---------------------------------------------------------------------------

describe("phi-scan: a real document is caught regardless of extension", () => {
  it("catches PHI in a native .cda document", () => {
    const r = scan("record.cda", doc(`<section><family>Anderson</family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Anderson/);
  });

  it("catches PHI in a native .ccda document", () => {
    const r = scan("record.ccda", doc(`<observation><birthTime value="19770707"/></observation>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/19770707/);
  });

  it("catches a document by content marker even under a non-CDA extension", () => {
    // A real ClinicalDocument saved as .txt (or any name) must still be parsed —
    // detection follows the bytes, not the file name.
    const r = scan("pasted.txt", doc(`<section><family>Kowalski</family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Kowalski/);
  });
});

describe("phi-scan: address", () => {
  it("catches a real street address, city, and postal code", () => {
    const r = scan(
      "addr.xml",
      doc(`<addr>
        <streetAddressLine>742 Evergreen Terrace</streetAddressLine>
        <city>Springfield</city>
        <postalCode>62704</postalCode>
      </addr>`),
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/streetAddressLine/);
    expect(r.stderr).toMatch(/Evergreen/);
    expect(r.stderr).toMatch(/Springfield/);
    expect(r.stderr).toMatch(/62704/);
  });
});

describe("phi-scan: telecom", () => {
  it("catches a phone without the 555 fake-exchange convention", () => {
    const r = scan("tel.xml", doc(`<telecom use="HP" value="tel:+13128675309"/>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/telecom@value/);
  });
});

describe("phi-scan: free-text shape checks", () => {
  it("catches a dashed SSN in narrative text", () => {
    // Synthetic sentinel built from parts + an anchored regex so no literal
    // SSN-shaped string lives in this source (a 9xx area + all-zero serial is
    // never a real SSN).
    const fakeSsn = ["9", "00", "55", "00", "00"]
      .join("")
      .replace(/^(\d{3})(\d{2})(\d{4})$/, "$1-$2-$3");
    const r = scan("ssn-text.xml", doc(`<section><text>SSN on file ${fakeSsn}</text></section>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/dashed SSN pattern/);
  });

  it("catches a non-test email in narrative text", () => {
    const r = scan("email.xml", doc(`<section><text>reach jane@realhospital.org</text></section>`));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/email with non-test domain/);
  });
});

// ---------------------------------------------------------------------------
// Bypass vectors the conformance-refuter hunts
// ---------------------------------------------------------------------------

describe("phi-scan: structured scan is not silently bypassed (refuter regressions)", () => {
  it("decodes XML character references before matching a name", () => {
    // <family>&#x53;mith</family> -> "Smith"
    const r = scan("entity.xml", doc(`<section><family>&#x53;mith</family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Smith/);
  });

  it("reads a name wrapped in a CDATA section", () => {
    const r = scan("cdata.xml", doc(`<section><family><![CDATA[Nakamura]]></family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Nakamura/);
  });

  it("matches a namespace-prefixed element name", () => {
    const r = scan("prefixed.xml", doc(`<section><v3:family>Petrov</v3:family></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Petrov/);
  });

  it("matches an element name case-insensitively", () => {
    const r = scan("case.xml", doc(`<section><FAMILY>Ivanova</FAMILY></section>`));
    expect(r.code, `stderr: ${r.stderr}`).toBe(1);
    expect(r.stderr).toMatch(/Ivanova/);
  });

  it("keeps hand-written src-style .ts (no CDA marker) on the text-only pass", () => {
    // A non-fixture file with no CDA marker must not be parsed as CDA even if it
    // has a <family> literal — only the shape pass (SSN / email) applies.
    const path = join(dir, "helper.ts");
    writeFileSync(path, 'export const label = "family: Anderson";\n');
    const r = runScanner([path]);
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// --allow-fixture override gate
// ---------------------------------------------------------------------------

describe("phi-scan: --allow-fixture override gate", () => {
  it("rejects --allow-fixture without an override-log entry (exit 2)", () => {
    const r = scan("gated.xml", doc(`<section><family>Anderson</family></section>`));
    expect(r.code).toBe(1); // sanity: it is a violator
    const path = join(dir, "gated.xml");
    const r2 = runScanner(["--allow-fixture", path]);
    expect(r2.code).toBe(2);
    expect(r2.stderr).toMatch(/phi-scan-overrides\.md/);
  });

  it("honors --allow-fixture WITH an override-log entry (exit 0)", () => {
    const path = join(dir, "override-me.xml");
    writeFileSync(path, doc(`<section><family>Anderson</family></section>`));
    const rel = relative(REPO_ROOT, path).split(sep).join("/");
    // Sanity: scanned on its own it is a genuine violator — so the override, not
    // an empty target set, is what flips the next run to clean.
    expect(runScanner([path]).code).toBe(1);

    const original = readFileSync(OVERRIDES_PATH, "utf8");
    try {
      appendFileSync(
        OVERRIDES_PATH,
        `\n### ${rel}\n\n- **Date:** 2026-07-18\n- **Reason:** unit test\n- **Approved by:** vitest\n- **Expires:** permanent\n`,
      );
      const r = runScanner(["--allow-fixture", path]);
      expect(r.code, `stderr: ${r.stderr}`).toBe(0);
    } finally {
      writeFileSync(OVERRIDES_PATH, original);
    }
  });
});
