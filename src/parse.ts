import { Collector } from "./diagnostics.js";
import { LISTING_KINDS, normaliseListing, type ResolvedOptions } from "./normalise/listing.js";
import { parseDate } from "./normalise/dates.js";
import type { FeedMeta, Listing, ParseOptions, ParseResult } from "./types.js";
import { attr, parseXml, XmlParseError, type XmlNode } from "./xml.js";

/** Path used for diagnostics about the document as a whole, when there is no root element. */
const DOCUMENT_PATH = "(document)";

/**
 * Checks that a time zone name is one the runtime knows.
 *
 * @throws RangeError when it is not.
 */
function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new RangeError(`Invalid timeZone: ${timeZone}`);
  }
}

function result(meta: Partial<FeedMeta>, listings: Listing[], collector: Collector): ParseResult {
  return {
    meta: { generatedAt: null, listingCount: listings.length, hadCredentials: false, ...meta },
    listings,
    warnings: collector.all,
  };
}

/** What to say about where a parse failure happened. Never includes any document text. */
function positionOf(error: XmlParseError): string {
  return error.line > 0 ? `line ${error.line}, column ${error.column}` : "position unknown";
}

/**
 * Parses a REAXML document into normalised listings and diagnostics.
 *
 * By default nothing is thrown for problems in the document: they come back in `warnings`.
 * With `tolerant: false` the first error-severity diagnostic throws a `ReaxmlError`.
 *
 * @throws TypeError when `xml` is not a string, before anything else and whatever `tolerant` is
 * set to.
 * @throws RangeError when `options.timeZone` is not a valid IANA zone name, whatever `tolerant`
 * is set to.
 * @throws ReaxmlError when `options.tolerant` is false and an error-severity diagnostic occurs.
 */
export function parseReaxml(xml: string, options: ParseOptions = {}): ParseResult {
  // Callers in plain JavaScript can pass a Buffer or null. Decoding is theirs to choose.
  if (typeof xml !== "string") throw new TypeError("xml must be a string");
  const { timeZone } = options;
  if (timeZone !== undefined) assertTimeZone(timeZone);

  const c = new Collector({ tolerant: options.tolerant ?? true });
  const resolved: ResolvedOptions = {
    includeHiddenPrices: options.includeHiddenPrices ?? false,
    ...(timeZone === undefined ? {} : { timeZone }),
  };

  let root: XmlNode | null;
  try {
    root = parseXml(xml);
  } catch (error) {
    if (!(error instanceof XmlParseError)) throw error;
    c.add("xml-malformed", DOCUMENT_PATH, positionOf(error));
    return result({}, [], c);
  }

  if (root === null) {
    c.add("empty-document", DOCUMENT_PATH);
    return result({}, [], c);
  }
  if (root.name !== "propertyList") {
    c.add("empty-document", root.path);
    return result({}, [], c);
  }

  // Only whether a credential is present is recorded. The values are never kept.
  const hadCredentials = attr(root, "username") !== null || attr(root, "password") !== null;
  if (hadCredentials) c.add("credentials-in-feed", root.path);

  const generatedAt = parseDate(
    attr(root, "date"),
    root.path,
    c,
    resolved.timeZone === undefined ? {} : { timeZone: resolved.timeZone },
  );

  if (root.children.length === 0) {
    c.add("empty-document", root.path);
    return result({ generatedAt, hadCredentials }, [], c);
  }

  // A Map keeps insertion order. Deleting before setting moves a repeated listing to the
  // position of its last occurrence, so the last one wins in both data and order.
  const listings = new Map<string, Listing>();
  for (const element of root.children) {
    c.withListing(null);
    if (!LISTING_KINDS.has(element.name)) {
      c.add("unknown-listing-element", element.path);
      continue;
    }
    const listing = normaliseListing(element, c, resolved);
    if (listing === null) continue;
    if (listings.has(listing.id)) {
      c.withListing(listing.id);
      c.add("duplicate-listing", element.path);
      c.withListing(null);
      listings.delete(listing.id);
    }
    listings.set(listing.id, listing);
  }

  c.withListing(null);
  return result({ generatedAt, hadCredentials }, [...listings.values()], c);
}
