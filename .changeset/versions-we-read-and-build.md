---
"@cosyte/ccda": patch
---

Docs: say which C-CDA and USCDI versions we read and build. Our conformance target is C-CDA R2.1 with Companion Guide R4.1 (USCDI v3); we build R2.1, read documents stamped for 3.0.0 to 5.0.0 leniently, and do not trace the Companion Guide yet. A new page lists the USCDI to C-CDA version table, the stamps we recognize, and the templates added after R2.1 with whether each is modeled (none is yet). The README and the overview say the same in one line each, and Diagnostic Imaging Report is marked R2.1-only. No code changes, so callers change nothing.
