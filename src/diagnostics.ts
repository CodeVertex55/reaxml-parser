import type { Diagnostic, DiagnosticCode, Severity } from "./types.js";
import { replaceUnsafe, truncateCodePoints } from "./unsafe-text.js";

type CodeEntry = Readonly<{ severity: Severity; description: string }>;

const CODES = {
  "credentials-in-feed": {
    severity: "warning",
    description: "Root element has username or password attributes",
  },
  "empty-document": {
    severity: "error",
    description: "No propertyList root, or zero listings and no parseable content",
  },
  "xml-malformed": {
    severity: "error",
    description: "The XML parser rejected the document",
  },
  "unknown-listing-element": {
    severity: "warning",
    description: "Child of the root that is not one of the eight listing kinds",
  },
  "missing-identity": {
    severity: "error",
    description: "Listing without a usable agentID or uniqueID, so it was skipped",
  },
  "duplicate-listing": {
    severity: "warning",
    description: "The same listing identity appears twice, so the last one wins",
  },
  "unknown-status": {
    severity: "warning",
    description: "Status attribute not in the enum, treated as current",
  },
  "invalid-date": {
    severity: "warning",
    description: "Date that cannot be parsed, so the value became null",
  },
  "empty-media-placeholder": {
    severity: "info",
    description: "Media element with no url and no file was skipped",
  },
  "media-without-url": {
    severity: "warning",
    description: "Media with a file attribute only was skipped",
  },
  "hidden-price-withheld": {
    severity: "info",
    description: "Price hidden by its display attribute had its amount withheld",
  },
  "unparseable-number": {
    severity: "warning",
    description: "Numeric field with non-numeric content, so the value became null",
  },
  "empty-measure": {
    severity: "info",
    description: "Measure with a unit but no value was left null",
  },
  "unknown-unit": {
    severity: "warning",
    description: "Measure unit outside the known set, so the measure became null",
  },
  "address-hidden": {
    severity: "info",
    description: "Address is marked display=no",
  },
  "street-number-composite": {
    severity: "info",
    description: "Street number already contains a unit separator while subNumber is empty",
  },
  "extension-fields-present": {
    severity: "info",
    description: "Vendor extension fields were found",
  },
  "invalid-coordinates": {
    severity: "warning",
    description: "Extension latitude or longitude is not a valid number in range",
  },
  "unparseable-inspection": {
    severity: "warning",
    description: "Inspection time string does not match a known pattern",
  },
} as const satisfies Record<DiagnosticCode, CodeEntry>;

for (const entry of Object.values(CODES)) Object.freeze(entry);

/** Every diagnostic code with its severity and a short description. */
export const DIAGNOSTIC_CODES: Readonly<Record<DiagnosticCode, CodeEntry>> = Object.freeze(CODES);

/** Thrown in place of returning an error-severity diagnostic when `tolerant` is false. */
export class ReaxmlError extends Error {
  code: DiagnosticCode;
  listingId: string | null;
  path: string;

  constructor(code: DiagnosticCode, listingId: string | null, path: string, message: string) {
    super(message);
    this.name = "ReaxmlError";
    this.code = code;
    this.listingId = listingId;
    this.path = path;
  }
}

/** Longest detail kept in a diagnostic message, in code points. */
const MAX_DETAIL = 80;

/**
 * Makes a detail safe to log: control characters (C0, DEL, C1, and the line and paragraph
 * separators) and bidirectional controls become spaces, runs of whitespace collapse, the ends
 * are trimmed and the result is cut to 80 code points, so a surrogate pair is never split.
 * Details can come from the document, so this stops a value from adding lines to a log,
 * reordering what it shows, or filling it. Callers pass the raw value and rely on this cap.
 */
function sanitiseDetail(detail: string): string {
  return truncateCodePoints(replaceUnsafe(detail, " ").replace(/\s+/g, " ").trim(), MAX_DETAIL);
}

/** Internal accumulator for diagnostics. Not part of the public API. */
export class Collector {
  readonly all: Diagnostic[] = [];
  private readonly tolerant: boolean;
  private listingId: string | null = null;

  constructor(opts: { tolerant: boolean }) {
    this.tolerant = opts.tolerant;
  }

  /** Sets the listing context for subsequent add() calls; null for feed level. */
  withListing(listingId: string | null): void {
    this.listingId = listingId;
  }

  /**
   * Records a diagnostic with the severity from DIAGNOSTIC_CODES. Throws a ReaxmlError
   * when the collector is not tolerant and the severity is "error".
   *
   * `detail` must never contain credential values or hidden price amounts. Diagnostics
   * are returned to callers and are likely to be logged.
   */
  add(code: DiagnosticCode, path: string, detail?: string): void {
    const { severity, description } = DIAGNOSTIC_CODES[code];
    const clean = detail === undefined ? "" : sanitiseDetail(detail);
    const message = clean === "" ? description : `${description}: ${clean}`;
    if (!this.tolerant && severity === "error") {
      throw new ReaxmlError(code, this.listingId, path, message);
    }
    this.all.push({ code, severity, message, listingId: this.listingId, path });
  }
}
