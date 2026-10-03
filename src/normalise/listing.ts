import type { Collector } from "../diagnostics.js";
import type { Listing, ListingBase, ListingKind, ListingStatus } from "../types.js";
import { attr, child, children, text, type XmlNode } from "../xml.js";
import { parseAddress } from "./address.js";
import { parseAgents } from "./agents.js";
import { parseBusiness } from "./business.js";
import { parseCommercial } from "./commercial.js";
import { parseDate, type DateOptions } from "./dates.js";
import { parseExtension } from "./extension.js";
import { parseFeatures } from "./features.js";
import { parseInspections } from "./inspections.js";
import { parseMeasure } from "./measures.js";
import { parseMedia } from "./media.js";
import { parsePrice, parseRent, parseSold, type MoneyOptions } from "./price.js";
import { numberField, yesNo } from "./primitives.js";

/** Options after defaults have been applied. */
export type ResolvedOptions = {
  /** A zone that has already been validated, or undefined for local times. */
  timeZone?: string;
  includeHiddenPrices: boolean;
};

/** The eight listing element names and the kinds they produce. */
export const LISTING_KINDS: ReadonlyMap<string, ListingKind> = new Map<string, ListingKind>([
  ["residential", "residential"],
  ["rental", "rental"],
  ["land", "land"],
  ["rural", "rural"],
  ["commercial", "commercial"],
  ["commercialLand", "commercialLand"],
  ["business", "business"],
  ["holidayRental", "holidayRental"],
]);

const STATUSES: ReadonlySet<string> = new Set<ListingStatus>([
  "current",
  "sold",
  "leased",
  "withdrawn",
  "offmarket",
  "deleted",
]);

/** Longest status value echoed into an unknown-status diagnostic. */
const MAX_STATUS_DETAIL = 40;

function statusOf(node: XmlNode, c: Collector): ListingStatus {
  const raw = attr(node, "status");
  if (raw === null) return "current";
  const status = raw.toLowerCase();
  if (STATUSES.has(status)) return status as ListingStatus;
  c.add("unknown-status", node.path, raw.slice(0, MAX_STATUS_DETAIL));
  return "current";
}

function landOf(node: XmlNode, c: Collector): ListingBase["land"] {
  const details = child(node, "landDetails");
  return {
    area: parseMeasure(child(details, "area"), c),
    frontage: parseMeasure(child(details, "frontage"), c),
    depth: parseMeasure(child(details, "depth"), c),
  };
}

function buildingOf(node: XmlNode, c: Collector): ListingBase["building"] {
  const details = child(node, "buildingDetails");
  return {
    area: parseMeasure(child(details, "area"), c),
    energyRating: numberField(child(details, "energyRating"), c),
  };
}

function externalLinksOf(node: XmlNode): string[] {
  const links: string[] = [];
  for (const link of children(node, "externalLink")) {
    const href = attr(link, "href");
    if (href !== null) links.push(href);
  }
  return links;
}

/**
 * Turns one listing element into a `Listing`. The kind comes from the element name; an element
 * with any other name gives null with no diagnostic. Returns null, after adding
 * `missing-identity` at feed level, when `agentID` or `uniqueID` is missing or empty.
 *
 * The collector's listing context is set to the listing id for the duration of the call and
 * cleared afterwards, so a diagnostic added later never carries a stale id.
 */
export function normaliseListing(node: XmlNode, c: Collector, o: ResolvedOptions): Listing | null {
  const kind = LISTING_KINDS.get(node.name);
  if (kind === undefined) return null;

  c.withListing(null);
  const agentId = text(child(node, "agentID"));
  const uniqueId = text(child(node, "uniqueID"));
  if (agentId === null || uniqueId === null) {
    c.add("missing-identity", node.path);
    return null;
  }

  const id = `${agentId}:${uniqueId}`;
  c.withListing(id);
  try {
    return assemble(node, kind, id, agentId, uniqueId, c, o);
  } finally {
    c.withListing(null);
  }
}

function assemble(
  node: XmlNode,
  kind: ListingKind,
  id: string,
  agentId: string,
  uniqueId: string,
  c: Collector,
  o: ResolvedOptions,
): Listing {
  const dates: DateOptions = o.timeZone === undefined ? {} : { timeZone: o.timeZone };
  const money: MoneyOptions = { includeHiddenPrices: o.includeHiddenPrices };
  const moneyAndDates = { ...money, ...dates };

  const status = statusOf(node, c);
  const modifiedAt = parseDate(attr(node, "modTime"), node.path, c, dates);
  const address = parseAddress(node, c);
  const { extra, location } = parseExtension(node, c);
  const media = parseMedia(node, c, dates);
  const auction = child(node, "auction");
  const auctionAt =
    auction === undefined ? null : parseDate(attr(auction, "date"), auction.path, c, dates);

  const category =
    attr(child(node, "category"), "name") ??
    attr(child(node, "ruralCategory"), "name") ??
    attr(child(node, "landCategory"), "name") ??
    attr(child(node, "holidayCategory"), "name");

  const base: Omit<ListingBase, "kind" | "category"> = {
    id,
    agentId,
    uniqueId,
    status,
    modifiedAt,
    underOffer: yesNo(attr(child(node, "underOffer"), "value")),
    authority: attr(child(node, "authority"), "value"),
    headline: text(child(node, "headline")),
    description: text(child(node, "description")),
    address,
    location,
    price:
      kind === "rental" && child(node, "price") === undefined ? null : parsePrice(node, c, money),
    features: parseFeatures(node, c),
    land: landOf(node, c),
    building: buildingOf(node, c),
    images: media.images,
    floorplans: media.floorplans,
    documents: media.documents,
    videoUrl: attr(child(node, "videoLink"), "href"),
    externalLinks: externalLinksOf(node),
    inspections: parseInspections(node, c, dates),
    auctionAt,
    agents: parseAgents(node),
    sold: parseSold(node, c, moneyAndDates),
    extra,
  };

  switch (kind) {
    case "rental":
      return {
        ...base,
        kind,
        category: category ?? null,
        rent: parseRent(node, c, money),
        bond: numberField(child(node, "bond"), c),
        availableAt: parseDate(text(child(node, "dateAvailable")), node.path, c, dates),
      };
    case "commercial":
    case "commercialLand": {
      const commercial = parseCommercial(node, c, moneyAndDates);
      return {
        ...base,
        kind,
        category: category ?? commercial.categories[0] ?? null,
        commercial,
      };
    }
    case "business": {
      const business = parseBusiness(node, c, money);
      return { ...base, kind, category: category ?? business.categories[0] ?? null, business };
    }
    default:
      return { ...base, kind, category: category ?? null };
  }
}
