// Types for bench/shapes.mjs, so the TypeScript scaling gate (test/perf/scaling-gate.perf.ts) can
// import the bench's own shapes.

import type { EditCcdaOptions, ParseCcdaOptions } from "../src/index.js";

export declare const KIB: number;

/** A Continuity of Care Document of `entries` entries across Problems, Medications, Results and Encounters. */
export declare function ccd(i: number, entries: number): string;

/** A Referral Note of about 23 KiB. */
export declare function referralNote(i: number): string;

/** An Unstructured Document whose `nonXMLBody` carries a base64 PDF of `bytes` bytes. */
export declare function unstructuredDocument(i: number, bytes: number): string;

/** The edit the edit benchmarks make to a structured or an unstructured document. */
export declare function editOptions(structured: boolean): EditCcdaOptions;

/** The `terminology` and `valueSets` options the validating benchmarks pass to `parseCcda`. */
export declare function validationOptions(): Pick<ParseCcdaOptions, "terminology" | "valueSets">;
