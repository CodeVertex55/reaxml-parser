export type ParseOptions = {
  /** IANA zone, e.g. "Australia/Perth". When set, dates are returned as UTC ISO strings with Z. */
  timeZone?: string;
  /** Default false. When true, prices marked display="no" are included with `hidden: true`. */
  includeHiddenPrices?: boolean;
  /** Default true. When false, the first error-severity diagnostic throws ReaxmlError. */
  tolerant?: boolean;
};

export type ParseResult = {
  meta: FeedMeta;
  listings: Listing[];
  warnings: Diagnostic[];
};

export type FeedMeta = {
  /** propertyList@date, normalised like every other date. null when absent or invalid. */
  generatedAt: string | null;
  listingCount: number;
  /** True when the root element carried username or password attributes. Values are never exposed. */
  hadCredentials: boolean;
};

export type ListingKind =
  | "residential"
  | "rental"
  | "land"
  | "rural"
  | "commercial"
  | "commercialLand"
  | "business"
  | "holidayRental";

export type ListingStatus = "current" | "sold" | "leased" | "withdrawn" | "offmarket" | "deleted";

export type ListingBase = {
  kind: ListingKind;
  /** `${agentId}:${uniqueId}`, the stable identity to upsert on. */
  id: string;
  agentId: string;
  uniqueId: string;
  status: ListingStatus;
  modifiedAt: string | null;
  underOffer: boolean;
  /** auction | exclusive | multilist | conjunctional | open | sale | setsale ... */
  authority: string | null;
  /** category@name, ruralCategory@name, commercialCategory@name (first), businessCategory name */
  category: string | null;
  headline: string | null;
  /** Text as given; entity-decoded; line breaks preserved. */
  description: string | null;
  address: Address;
  location: { lat: number; lng: number } | null;
  price: Price | null;
  features: Features;
  land: { area: Measure | null; frontage: Measure | null; depth: Measure | null };
  building: { area: Measure | null; energyRating: number | null };
  images: MediaItem[];
  floorplans: MediaItem[];
  documents: MediaItem[];
  /** An http or https address only; any other kind of link is dropped. */
  videoUrl: string | null;
  /** http and https addresses only; any other kind of link is dropped. */
  externalLinks: string[];
  inspections: Inspection[];
  auctionAt: string | null;
  agents: Agent[];
  sold: { price: number | null; priceHidden: boolean; date: string | null } | null;
  /** Vendor extension fields, verbatim, name to value. */
  extra: Record<string, string>;
};

export type Listing =
  | (ListingBase & { kind: "residential" | "land" | "rural" | "holidayRental" })
  | (ListingBase & {
      kind: "rental";
      rent: Rent | null;
      bond: number | null;
      availableAt: string | null;
    })
  | (ListingBase & { kind: "commercial" | "commercialLand"; commercial: CommercialDetails })
  | (ListingBase & { kind: "business"; business: BusinessDetails });

export type Address = {
  /** address@display; false means do not show the street address publicly */
  display: boolean;
  subNumber: string | null;
  lotNumber: string | null;
  streetNumber: string | null;
  street: string | null;
  /** Composed line, e.g. "2/80 Example Street" or "Lot 5 Sample Road". null when nothing to compose. */
  streetLine: string | null;
  suburb: string | null;
  suburbDisplay: boolean;
  /** Upper-cased. */
  state: string | null;
  postcode: string | null;
  country: string | null;
};

export type Price = {
  /** null when hidden and includeHiddenPrices is false, or when unparseable */
  amount: number | null;
  /** price@display="no" */
  hidden: boolean;
  /** priceView text the agent wants shown, e.g. "Offers over $500,000". */
  view: string | null;
  /** price@display="range" with a range attribute */
  range: { min: number; max: number } | null;
  tax: "inclusive" | "exclusive" | "exempt" | "unknown";
};

export type Rent = {
  amount: number | null;
  period: "week" | "month" | "year";
  hidden: boolean;
  view: string | null;
};

export type Measure = {
  value: number;
  unit: "squareMeter" | "hectare" | "acre" | "square" | "meter";
};

export type Features = {
  /** "studio" maps to 0 with a warning-free note in docs */
  bedrooms: number | null;
  bathrooms: number | null;
  ensuites: number | null;
  garages: number | null;
  carports: number | null;
  openSpaces: number | null;
  toilets: number | null;
  livingAreas: number | null;
  /** Boolean features that were present and true, e.g. ["airConditioning","pool","balcony"]. */
  flags: string[];
  /** otherFeatures text */
  other: string | null;
};

export type MediaItem = {
  id: string;
  url: string;
  format: string | null;
  modifiedAt: string | null;
};

export type Inspection = { start: string; end: string | null; raw: string };

export type Agent = {
  name: string | null;
  email: string | null;
  phones: { type: string | null; number: string }[];
  id: string | null;
};

export type CommercialDetails = {
  listingType: "sale" | "lease" | "both" | null;
  categories: string[];
  rent: {
    amount: number | null;
    period: "annual" | "month" | "week";
    plusOutgoings: boolean;
    tax: Price["tax"];
    hidden: boolean;
  } | null;
  rentPerSquareMeter: { min: number | null; max: number | null } | null;
  outgoings: number | null;
  returnPercent: number | null;
  tenancy: "unknown" | "vacant" | "tenanted" | null;
  zone: string | null;
  carSpaces: number | null;
  currentLeaseEndAt: string | null;
};

export type BusinessDetails = {
  categories: string[];
  takings: string | null;
  franchise: boolean | null;
  terms: string | null;
  rent: { amount: number | null; period: "annual" | "month" | "week" } | null;
};

export type Severity = "info" | "warning" | "error";

export type DiagnosticCode =
  | "credentials-in-feed"
  | "empty-document"
  | "xml-malformed"
  | "unknown-listing-element"
  | "missing-identity"
  | "duplicate-listing"
  | "unknown-status"
  | "invalid-date"
  | "empty-media-placeholder"
  | "media-without-url"
  | "hidden-price-withheld"
  | "unparseable-number"
  | "empty-measure"
  | "unknown-unit"
  | "address-hidden"
  | "street-number-composite"
  | "extension-fields-present"
  | "invalid-coordinates"
  | "unparseable-inspection";

export type Diagnostic = {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  /** `${agentId}:${uniqueId}` or null for feed-level diagnostics. */
  listingId: string | null;
  /** Human-readable location, e.g. "propertyList/residential[3]/objects/img[5]". */
  path: string;
};
