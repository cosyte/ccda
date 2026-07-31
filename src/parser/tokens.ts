/**
 * Bounded rendering of tokens **derived from the document**.
 *
 * Shared by the position builder and by the parsed model, and that sharing is
 * the point. `@cosyte/hl7` bounded its warning messages, verified green, and
 * `@cosyte/deid` still leaked, because `Segment.type` stayed unbounded on the
 * *model* and the downstream package interpolated it into a manifest. **A
 * diagnostic-surface fix protects this package's diagnostics; it does not
 * protect a consumer that reads the model and builds its own diagnostics from
 * it.** So the primitive lives here rather than inside the warning layer.
 *
 * Warning and fatal *messages* do not use this module at all: they interpolate
 * nothing, coming whole from the frozen registries in `./warnings.ts` and
 * `./errors.ts`. What is left to bound after that is the two surfaces a message
 * registry cannot reach, the structural fields of a {@link CcdaPosition} and
 * the structural identifiers on the model.
 *
 * ## Why a shape or membership test rather than a length cap
 *
 * Truncating to N characters still emits the first N characters of a patient
 * name, and C-CDA has no length below which a fragment stops being clinical.
 * A shape test refuses the whole token instead, and it can do that because
 * every token bounded here has a narrow, spec-defined form: an HL7 v3 `II.root`
 * is a UID (ISO OID or UUID), a `templateId/@extension` is a C-CDA version
 * stamp (`2015-08-01`), a section `<code>` is a LOINC part number. Conforming
 * tokens are returned unchanged, so a well-formed document sees no change at
 * all.
 *
 * ## Where a shape test is the wrong instrument, stated rather than papered over
 *
 * A shape test is only safe where the shape is narrow enough that a forged
 * match carries little. Two of these tokens fail that test and are bounded on
 * **membership** instead:
 *
 * - an **element local name** is an XML NCName, so a forged name is any word,
 *   and the depth-limit walk in `./secure-xml.ts` positions on arbitrary
 *   elements. Bounded against the CDA R2 vocabulary this parser navigates.
 * - an **`xsi:type`** name is an NCName too, and `RESULT_VALUE_TYPE_UNHANDLED`
 *   fires exactly when the type is one the model does not specialize, so at the
 *   moment it is reported there is no shape left that distinguishes a real
 *   datatype name from a word. Bounded against the HL7 v3 datatype names.
 * - a **media type** looks narrow until it is measured. The first cut here used
 *   `/^[a-zA-Z]{1,20}\/[a-zA-Z0-9.+-]{1,40}$/`, which admits
 *   `text/Doe-Jane-1980.01.01-MRN0012345`: 61 characters of legible identifier
 *   past a shape test that looked tight. Bounded on membership instead.
 *
 * Membership over-withholds rather than under-withholds: a name missing from a
 * list below costs diagnostic detail, never safety. **These lists are
 * hand-assembled and are therefore incomplete**, so state their effect that way
 * rather than as "a conforming document is untouched": a legitimate but unlisted
 * `xsi:type` or media type does read `<withheld>` on the model, with the
 * document's own text still beside it and `doc.toString()` unchanged.
 */

/**
 * What a bounded field carries in place of a token it may not echo.
 *
 * Deliberately carries **no length**. Reporting the character count would put
 * back a derivable measurement of the withheld value, which is the same
 * information leak one size smaller.
 */
export const WITHHELD = "<withheld>";

/**
 * ISO OID: the HL7 v3 `II.root` form C-CDA uses everywhere (template roots,
 * code-system OIDs, assigning authorities). Bounded arc count so a pathological
 * digit run cannot be echoed whole.
 */
const OID_RE = /^[0-2](?:\.(?:0|[1-9][0-9]{0,17})){1,24}$/u;

/** The other legal HL7 v3 UID form, a DCE UUID. */
const UUID_RE = /^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/u;

/** A C-CDA template version stamp, e.g. `2015-08-01`. */
const TEMPLATE_VERSION_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;

/** A LOINC part number, e.g. `11450-4`. */
const LOINC_RE = /^[0-9]{1,7}-[0-9]$/u;

/** Which spec-defined shape a derived token is required to match. */
export type DerivedTokenKind = "uid" | "templateVersion" | "loinc";

const SHAPES: Readonly<Record<DerivedTokenKind, (value: string) => boolean>> = {
  uid: (v) => OID_RE.test(v) || UUID_RE.test(v),
  templateVersion: (v) => TEMPLATE_VERSION_RE.test(v),
  loinc: (v) => LOINC_RE.test(v),
};

/**
 * Render a token derived from the document, for a position field or a model
 * field. Returns the token unchanged when it matches the shape its `kind`
 * promises, and {@link WITHHELD} otherwise.
 *
 * @internal
 */
export function safeDerivedToken(value: string, kind: DerivedTokenKind): string {
  return SHAPES[kind](value) ? value : WITHHELD;
}

/**
 * The CDA R2 / C-CDA element names this parser navigates or walks past. A
 * `position.path` is a member of this set or it is {@link WITHHELD}: nothing
 * else can reach it, which is what stops a vendor's `<PatientNameHere>` (or a
 * forged element carrying narrative) from becoming a diagnostic string.
 *
 * @internal
 */
const KNOWN_ELEMENT_NAMES: ReadonlySet<string> = new Set([
  // document skeleton
  "ClinicalDocument",
  "realmCode",
  "typeId",
  "templateId",
  "id",
  "setId",
  "versionNumber",
  "code",
  "title",
  "effectiveTime",
  "confidentialityCode",
  "languageCode",
  "component",
  "structuredBody",
  "nonXMLBody",
  "section",
  "text",
  "entry",
  "entryRelationship",
  "relatedDocument",
  "parentDocument",
  // participations
  "recordTarget",
  "patientRole",
  "patient",
  "name",
  "prefix",
  "given",
  "family",
  "suffix",
  "administrativeGenderCode",
  "birthTime",
  "maritalStatusCode",
  "raceCode",
  "ethnicGroupCode",
  "deceasedInd",
  "addr",
  "telecom",
  "guardian",
  "languageCommunication",
  "author",
  "assignedAuthor",
  "assignedPerson",
  "custodian",
  "assignedCustodian",
  "representedCustodianOrganization",
  "informant",
  "authenticator",
  "legalAuthenticator",
  "documentationOf",
  "serviceEvent",
  "componentOf",
  "encompassingEncounter",
  "participant",
  "participantRole",
  "playingEntity",
  "relatedSubject",
  "subject",
  // clinical acts
  "act",
  "substanceAdministration",
  "observation",
  "organizer",
  "procedure",
  "encounter",
  "supply",
  "statusCode",
  "value",
  "interpretationCode",
  "methodCode",
  "targetSiteCode",
  "priorityCode",
  "routeCode",
  "approachSiteCode",
  "doseQuantity",
  "rateQuantity",
  "maxDoseQuantity",
  "administrationUnitCode",
  "consumable",
  "manufacturedProduct",
  "manufacturedMaterial",
  "manufacturedLabeledDrug",
  "referenceRange",
  "observationRange",
  "performer",
  "reference",
  "originalText",
  "translation",
  "qualifier",
  "low",
  "high",
  "center",
  "width",
  "period",
  "phase",
  "comp",
  // narrative block
  "content",
  "paragraph",
  "list",
  "item",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "br",
  "linkHtml",
  "footnote",
  "footnoteRef",
  "renderMultiMedia",
  "sub",
  "sup",
]);

/**
 * Bound an element local name for a `position.path`. Membership, not shape:
 * see the module docblock.
 *
 * @internal
 */
export function safeElementName(value: string): string {
  return KNOWN_ELEMENT_NAMES.has(value) ? value : WITHHELD;
}

/**
 * The HL7 v3 datatype names an `xsi:type` may legitimately carry in a CDA R2
 * document. Bounded on membership because the warning that reports one fires
 * exactly when the model does not specialize it, so no shape distinguishes an
 * unmodelled datatype from a word.
 *
 * **Stated, not traced.** This repo does not hold `datatypes-base.xsd`, so the
 * list is written from the v3 ITS naming convention rather than checked against
 * the schema, and it is therefore incomplete. Two candidates were dropped rather
 * than guessed: `THUMBNAIL` (the `ED.thumbnail` type is lower case in the ITS)
 * and `EIVL_event` (the ITS spells property-flavoured types with a dot, and it
 * would have been the only entry here mixing the two conventions). Adding a
 * name is cheap and safe; inventing one is the invented-precision failure this
 * repo has been burned by, and a missing name only costs a `<withheld>`.
 *
 * @internal
 */
const V3_DATATYPE_NAMES: ReadonlySet<string> = new Set([
  "ANY",
  "BIN",
  "BL",
  "BN",
  "CD",
  "CE",
  "CO",
  "CR",
  "CS",
  "CV",
  "ED",
  "EIVL_TS",
  "EN",
  "ENXP",
  "II",
  "INT",
  "IVL_INT",
  "IVL_MO",
  "IVL_PQ",
  "IVL_REAL",
  "IVL_TS",
  "IVXB_INT",
  "IVXB_PQ",
  "IVXB_REAL",
  "IVXB_TS",
  "MO",
  "NPPD_TS",
  "ON",
  "PIVL_TS",
  "PN",
  "PQ",
  "PQR",
  "REAL",
  "RTO",
  "RTO_PQ_PQ",
  "RTO_QTY_QTY",
  "RTO_MO_PQ",
  "SC",
  "SD_TEXT",
  "ST",
  "SXCM_INT",
  "SXCM_PQ",
  "SXCM_REAL",
  "SXCM_TS",
  "SXPR_TS",
  "TEL",
  "TN",
  "TS",
  "URG_PQ",
  "URG_TS",
  "URL",
  "AD",
  "ADXP",
  "GLIST_PQ",
  "GLIST_TS",
  "HXIT_CE",
  "PPD_PQ",
  "PPD_TS",
  "SLIST_PQ",
  "SLIST_TS",
  "UVP_TS",
]);

/**
 * Bound an `xsi:type` name kept on the model as `unsupported.xsiType`.
 *
 * @internal
 */
export function safeDatatypeName(value: string): string {
  return V3_DATATYPE_NAMES.has(value) ? value : WITHHELD;
}

/**
 * The media types a CDA R2 `nonXMLBody` or `ED` legitimately carries. Membership
 * rather than shape, because `type/subtype` is a shape a forged identifier meets
 * comfortably: `text/Doe-Jane-1980.01.01-MRN0012345` passed the regex this
 * replaced.
 *
 * @internal
 */
const MEDIA_TYPES: ReadonlySet<string> = new Set([
  "text/plain",
  "text/html",
  "text/rtf",
  "text/xml",
  "application/pdf",
  "application/msword",
  "application/xml",
  "application/x-hl7-cda-level-one+xml",
  "image/gif",
  "image/tiff",
  "image/jpeg",
  "image/png",
  "audio/basic",
  "audio/mpeg",
  "audio/k32adpcm",
  "video/mpeg",
  "multipart/related",
]);

/**
 * Bound an `ED.mediaType` kept on the model.
 *
 * @internal
 */
export function safeMediaType(value: string): string {
  return MEDIA_TYPES.has(value) ? value : WITHHELD;
}

/** The two `ED.representation` tokens the HL7 v3 datatype defines. @internal */
const ED_REPRESENTATIONS: ReadonlySet<string> = new Set(["B64", "TXT"]);

/**
 * Bound an `ED.representation` token kept on the model.
 *
 * @internal
 */
export function safeRepresentation(value: string): string {
  return ED_REPRESENTATIONS.has(value) ? value : WITHHELD;
}
