import type { DiagnosticCode, ListingKind, ListingStatus, ParseResult } from "./types.js";

export type Summary = {
  /** Number of listings in the result. */
  listings: number;
  /** Listing counts by kind. Kinds with no listings are absent. */
  byKind: Partial<Record<ListingKind, number>>;
  /** Listing counts by status. Statuses with no listings are absent. */
  byStatus: Partial<Record<ListingStatus, number>>;
  diagnostics: {
    error: number;
    warning: number;
    info: number;
    /** Counts by code, in alphabetical order of code. */
    byCode: Partial<Record<DiagnosticCode, number>>;
  };
};

/** Kinds in the order the `ListingKind` type declares them. */
const KIND_ORDER: readonly ListingKind[] = [
  "residential",
  "rental",
  "land",
  "rural",
  "commercial",
  "commercialLand",
  "business",
  "holidayRental",
];

/** Statuses in the order the `ListingStatus` type declares them. */
const STATUS_ORDER: readonly ListingStatus[] = [
  "current",
  "sold",
  "leased",
  "withdrawn",
  "offmarket",
  "deleted",
];

/** Copies the entries of `counts` into a record, in the key order given by `order`. */
function inOrder<K extends string>(
  order: readonly K[],
  counts: ReadonlyMap<K, number>,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const key of order) {
    const count = counts.get(key);
    if (count !== undefined) out[key] = count;
  }
  return out;
}

function increment<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Counts listings by kind and status and diagnostics by severity and code.
 *
 * The result is plain data with stable key order: kinds and statuses in their declared order,
 * codes alphabetically. It carries nothing from the listings beyond those counts.
 */
export function summarise(result: ParseResult): Summary {
  const kinds = new Map<ListingKind, number>();
  const statuses = new Map<ListingStatus, number>();
  for (const listing of result.listings) {
    increment(kinds, listing.kind);
    increment(statuses, listing.status);
  }

  const codes = new Map<DiagnosticCode, number>();
  const severities = { error: 0, warning: 0, info: 0 };
  for (const diagnostic of result.warnings) {
    severities[diagnostic.severity] += 1;
    increment(codes, diagnostic.code);
  }
  const sortedCodes = [...codes.keys()].sort();

  return {
    listings: result.listings.length,
    byKind: inOrder(KIND_ORDER, kinds),
    byStatus: inOrder(STATUS_ORDER, statuses),
    diagnostics: { ...severities, byCode: inOrder(sortedCodes, codes) },
  };
}
