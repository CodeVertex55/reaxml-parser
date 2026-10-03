import { describe, expect, it } from "vitest";
import { parseReaxml } from "../src/index.js";
import { fixture, shapes } from "./helpers.js";

const NO_FEATURES = {
  bedrooms: null,
  bathrooms: null,
  ensuites: null,
  garages: null,
  carports: null,
  openSpaces: null,
  toilets: null,
  livingAreas: null,
  flags: [],
  other: null,
};
const NO_LAND = { area: null, frontage: null, depth: null };
const NO_BUILDING = { area: null, energyRating: null };
const NO_ADDRESS = {
  display: true,
  subNumber: null,
  lotNumber: null,
  streetNumber: null,
  street: null,
  streetLine: null,
  suburb: null,
  suburbDisplay: true,
  state: null,
  postcode: null,
  country: null,
};

function only(name: string) {
  const result = parseReaxml(fixture(name));
  expect(result.listings).toHaveLength(1);
  return result;
}

describe("kind fixtures", () => {
  it("residential.xml", () => {
    const result = only("residential");
    expect(result.warnings).toEqual([]);
    expect(result.meta).toEqual({
      generatedAt: "2026-10-01T08:00:00",
      listingCount: 1,
      hadCredentials: false,
    });
    expect(result.listings[0]).toEqual({
      kind: "residential",
      id: "XNWTEST:TEST0001",
      agentId: "XNWTEST",
      uniqueId: "TEST0001",
      status: "current",
      modifiedAt: "2026-09-30T14:05:10",
      underOffer: false,
      authority: "exclusive",
      category: "House",
      headline: "Family home close to parks and schools",
      description:
        "Light filled family home with a generous backyard.\n" +
        "Open plan living flows to a covered deck.\n" +
        "Walk to the Testville village & station.",
      address: {
        display: true,
        subNumber: null,
        lotNumber: null,
        streetNumber: "12",
        street: "Example Street",
        streetLine: "12 Example Street",
        suburb: "Testville",
        suburbDisplay: true,
        state: "WA",
        postcode: "0001",
        country: "AU",
      },
      location: null,
      price: {
        amount: 650000,
        hidden: false,
        view: "Offers over $650,000",
        range: null,
        tax: "inclusive",
      },
      features: {
        bedrooms: 4,
        bathrooms: 2,
        ensuites: 1,
        garages: 2,
        carports: 1,
        openSpaces: null,
        toilets: null,
        livingAreas: null,
        flags: ["airConditioning", "balcony"],
        other: "Solar panels and a rainwater tank",
      },
      land: {
        area: { value: 650, unit: "squareMeter" },
        frontage: { value: 18, unit: "meter" },
        depth: { value: 36, unit: "meter" },
      },
      building: { area: { value: 210, unit: "squareMeter" }, energyRating: 6.5 },
      images: [
        {
          id: "m",
          url: "https://img.example.com/TEST0001/front.jpg",
          format: "jpg",
          modifiedAt: "2026-09-01T09:00:00",
        },
        {
          id: "a",
          url: "https://img.example.com/TEST0001/kitchen.jpg",
          format: "jpg",
          modifiedAt: null,
        },
      ],
      floorplans: [
        {
          id: "1",
          url: "https://img.example.com/TEST0001/plan.jpg",
          format: "jpg",
          modifiedAt: null,
        },
      ],
      documents: [
        {
          id: "1",
          url: "https://img.example.com/TEST0001/brochure.pdf",
          format: "pdf",
          modifiedAt: null,
        },
      ],
      videoUrl: "https://video.example.com/TEST0001",
      externalLinks: ["https://tour.example.com/TEST0001"],
      inspections: [
        {
          start: "2026-12-21T11:00:00",
          end: "2026-12-21T11:30:00",
          raw: "21-Dec-2026 11:00am to 11:30am",
        },
      ],
      auctionAt: null,
      agents: [
        {
          name: "Alex Sample",
          email: "alex.sample@example.com",
          phones: [
            { type: "bh", number: "0491 570 006" },
            { type: "mobile", number: "0491 570 156" },
          ],
          id: "1",
        },
        { name: "Jordan Example", email: "jordan.example@example.com", phones: [], id: "2" },
      ],
      sold: null,
      extra: {},
    });
  });

  it("rental.xml", () => {
    const result = only("rental");
    expect(result.warnings).toEqual([]);
    expect(result.listings[0]).toEqual({
      kind: "rental",
      id: "XNWTEST:TEST0002",
      agentId: "XNWTEST",
      uniqueId: "TEST0002",
      status: "current",
      modifiedAt: "2026-09-28T16:45:00",
      underOffer: false,
      authority: null,
      category: "Unit",
      headline: "Bright two bedroom unit near the Mockford shops",
      description: "Secure unit with a sunny balcony and a single lock-up garage.",
      address: {
        display: true,
        subNumber: "4",
        lotNumber: null,
        streetNumber: "80",
        street: "Sample Road",
        streetLine: "4/80 Sample Road",
        suburb: "Mockford",
        suburbDisplay: true,
        state: "NSW",
        postcode: "0002",
        country: null,
      },
      location: null,
      price: null,
      rent: { amount: 785, period: "week", hidden: false, view: "$785 per week" },
      bond: 3140,
      availableAt: "2026-11-01",
      features: {
        bedrooms: 2,
        bathrooms: 1,
        ensuites: null,
        garages: 1,
        carports: null,
        openSpaces: null,
        toilets: null,
        livingAreas: null,
        flags: ["airConditioning"],
        other: null,
      },
      land: NO_LAND,
      building: NO_BUILDING,
      images: [
        {
          id: "m",
          url: "https://img.example.com/TEST0002/lounge.jpg",
          format: "jpg",
          modifiedAt: null,
        },
      ],
      floorplans: [],
      documents: [],
      videoUrl: null,
      externalLinks: [],
      inspections: [
        {
          start: "2026-11-07T10:00:00",
          end: "2026-11-07T10:15:00",
          raw: "2026-11-07 10:00 to 10:15",
        },
      ],
      auctionAt: null,
      agents: [
        {
          name: "Jordan Example",
          email: "jordan.example@example.com",
          phones: [{ type: "mobile", number: "0491 570 156" }],
          id: "1",
        },
      ],
      sold: null,
      extra: {},
    });
  });

  it("land.xml", () => {
    const result = only("land");
    expect(result.warnings).toEqual([]);
    expect(result.meta.generatedAt).toBeNull();
    expect(result.listings[0]).toEqual({
      kind: "land",
      id: "XNWTEST:TEST0003",
      agentId: "XNWTEST",
      uniqueId: "TEST0003",
      status: "current",
      modifiedAt: "2026-09-20T09:00:00",
      underOffer: true,
      authority: "auction",
      category: "Residential",
      headline: "Cleared building block in a growing estate",
      description: "Level block with services at the boundary.",
      address: {
        ...NO_ADDRESS,
        lotNumber: "5",
        street: "Sample Road",
        streetLine: "Lot 5 Sample Road",
        suburb: "Sampleton",
        state: "WA",
        postcode: "0003",
      },
      location: null,
      price: { amount: 220000, hidden: false, view: null, range: null, tax: "unknown" },
      features: NO_FEATURES,
      land: {
        area: { value: 800, unit: "squareMeter" },
        frontage: { value: 20, unit: "meter" },
        depth: { value: 40, unit: "meter" },
      },
      building: NO_BUILDING,
      images: [
        {
          id: "m",
          url: "https://img.example.com/TEST0003/block.jpg",
          format: "jpg",
          modifiedAt: null,
        },
      ],
      floorplans: [],
      documents: [],
      videoUrl: null,
      externalLinks: [],
      inspections: [],
      auctionAt: "2026-11-14T11:00:00",
      agents: [],
      sold: null,
      extra: {},
    });
  });

  it("rural.xml", () => {
    const result = only("rural");
    expect(result.warnings).toEqual([]);
    expect(result.listings[0]).toEqual({
      kind: "rural",
      id: "XNWDEMO:TEST0004",
      agentId: "XNWDEMO",
      uniqueId: "TEST0004",
      status: "current",
      modifiedAt: "2026-09-18T12:30:00",
      underOffer: false,
      authority: "exclusive",
      category: "Cropping",
      headline: "Productive cropping farm with a solid homestead",
      description: "Open paddocks, two dams and a machinery shed.",
      address: {
        ...NO_ADDRESS,
        streetNumber: "1450",
        street: "Placeholder Avenue",
        streetLine: "1450 Placeholder Avenue",
        suburb: "Sampleton",
        state: "WA",
        postcode: "0004",
      },
      location: null,
      price: {
        amount: 1450000,
        hidden: false,
        view: null,
        range: { min: 1400000, max: 1500000 },
        tax: "unknown",
      },
      features: { ...NO_FEATURES, bedrooms: 3, bathrooms: 1 },
      land: { area: { value: 120, unit: "hectare" }, frontage: null, depth: null },
      building: NO_BUILDING,
      images: [],
      floorplans: [],
      documents: [],
      videoUrl: null,
      externalLinks: [],
      inspections: [],
      auctionAt: null,
      agents: [],
      sold: null,
      extra: {},
    });
  });

  it("commercial.xml", () => {
    const result = only("commercial");
    expect(result.warnings).toEqual([]);
    expect(result.listings[0]).toEqual({
      kind: "commercial",
      id: "XNWTEST:TEST0005",
      agentId: "XNWTEST",
      uniqueId: "TEST0005",
      status: "current",
      modifiedAt: "2026-09-15T08:15:00",
      underOffer: false,
      authority: "exclusive",
      category: "Offices",
      headline: "Two level office and retail building",
      description: "Corner position with street frontage and on-site parking.",
      address: {
        ...NO_ADDRESS,
        streetNumber: "3",
        street: "Placeholder Avenue",
        streetLine: "3 Placeholder Avenue",
        suburb: "Mockford",
        state: "NSW",
        postcode: "0005",
      },
      location: null,
      price: { amount: 1200000, hidden: false, view: null, range: null, tax: "exclusive" },
      features: NO_FEATURES,
      land: { area: { value: 610, unit: "squareMeter" }, frontage: null, depth: null },
      building: { area: { value: 240, unit: "squareMeter" }, energyRating: null },
      images: [],
      floorplans: [],
      documents: [],
      videoUrl: null,
      externalLinks: [],
      inspections: [],
      auctionAt: null,
      agents: [],
      sold: null,
      extra: {},
      commercial: {
        listingType: "both",
        categories: ["Offices", "Retail"],
        rent: {
          amount: 96000,
          period: "annual",
          plusOutgoings: true,
          tax: "exclusive",
          hidden: false,
        },
        rentPerSquareMeter: { min: 300, max: 380 },
        outgoings: 18500,
        returnPercent: 8.1,
        tenancy: "tenanted",
        zone: "Commercial 2",
        carSpaces: 6,
        currentLeaseEndAt: "2028-06-30",
      },
    });
  });

  it("commercial-land.xml", () => {
    const result = only("commercial-land");
    expect(result.warnings).toEqual([]);
    expect(result.listings[0]).toEqual({
      kind: "commercialLand",
      id: "XNWTEST:TEST0006",
      agentId: "XNWTEST",
      uniqueId: "TEST0006",
      status: "current",
      modifiedAt: "2026-09-12T10:00:00",
      underOffer: false,
      authority: null,
      category: "Development Site",
      headline: "Flat industrial site with sealed access",
      description: "Fully fenced yard, power connected and a wide road frontage.",
      address: {
        ...NO_ADDRESS,
        street: "Example Street",
        streetLine: "Example Street",
        suburb: "Testville",
        state: "WA",
        postcode: "0006",
      },
      location: null,
      price: { amount: 2100000, hidden: false, view: null, range: null, tax: "unknown" },
      features: NO_FEATURES,
      land: { area: { value: 2.4, unit: "hectare" }, frontage: null, depth: null },
      building: NO_BUILDING,
      images: [],
      floorplans: [],
      documents: [],
      videoUrl: null,
      externalLinks: [],
      inspections: [],
      auctionAt: null,
      agents: [],
      sold: null,
      extra: {},
      commercial: {
        listingType: "sale",
        categories: ["Development Site"],
        rent: null,
        rentPerSquareMeter: null,
        outgoings: null,
        returnPercent: null,
        tenancy: null,
        zone: "Industrial 1",
        carSpaces: null,
        currentLeaseEndAt: null,
      },
    });
  });

  it("business.xml", () => {
    const result = only("business");
    expect(result.warnings).toEqual([]);
    expect(result.listings[0]).toEqual({
      kind: "business",
      id: "XNWDEMO:TEST0007",
      agentId: "XNWDEMO",
      uniqueId: "TEST0007",
      status: "current",
      modifiedAt: "2026-09-10T13:20:00",
      underOffer: false,
      authority: null,
      category: "Food and Beverage",
      headline: "Busy corner cafe with loyal local trade",
      description: "Fully equipped kitchen, outdoor seating and a long lease.",
      address: {
        ...NO_ADDRESS,
        streetNumber: "7",
        street: "Sample Road",
        streetLine: "7 Sample Road",
        suburb: "Sampleton",
        state: "WA",
        postcode: "0007",
      },
      location: null,
      price: { amount: 285000, hidden: false, view: null, range: null, tax: "unknown" },
      features: NO_FEATURES,
      land: NO_LAND,
      building: NO_BUILDING,
      images: [],
      floorplans: [],
      documents: [],
      videoUrl: null,
      externalLinks: [],
      inspections: [],
      auctionAt: null,
      agents: [],
      sold: null,
      extra: {},
      business: {
        categories: ["Food and Beverage", "Cafe"],
        takings: "$14,000 per week",
        franchise: false,
        terms: "Lease to 2031 plus option",
        rent: { amount: 64000, period: "annual" },
      },
    });
  });

  it("holiday-rental.xml", () => {
    const result = only("holiday-rental");
    expect(result.warnings).toEqual([]);
    expect(result.listings[0]).toEqual({
      kind: "holidayRental",
      id: "XNWDEMO:TEST0008",
      agentId: "XNWDEMO",
      uniqueId: "TEST0008",
      status: "current",
      modifiedAt: "2026-09-05T11:00:00",
      underOffer: false,
      authority: null,
      category: "Beach House",
      headline: "Relaxed beach house with room for the whole family",
      description: "Short walk to the sand, with a large deck and outdoor shower.",
      address: {
        ...NO_ADDRESS,
        streetNumber: "22",
        street: "Placeholder Avenue",
        streetLine: "22 Placeholder Avenue",
        suburb: "Mockford",
        state: "NSW",
        postcode: "0008",
      },
      location: null,
      price: {
        amount: null,
        hidden: false,
        view: "From $2,100 per week",
        range: null,
        tax: "unknown",
      },
      features: { ...NO_FEATURES, bedrooms: 3, bathrooms: 2, flags: ["pool", "petFriendly"] },
      land: NO_LAND,
      building: NO_BUILDING,
      images: [
        {
          id: "m",
          url: "https://img.example.com/TEST0008/deck.jpg",
          format: "jpg",
          modifiedAt: null,
        },
      ],
      floorplans: [],
      documents: [],
      videoUrl: null,
      externalLinks: [],
      inspections: [],
      auctionAt: null,
      agents: [],
      sold: null,
      extra: {},
    });
  });
});

describe("diagnostic fixtures", () => {
  it("credentials.xml reports credentials once and keeps the listing", () => {
    const result = parseReaxml(fixture("credentials"));
    expect(shapes(result.warnings)).toEqual([
      { code: "credentials-in-feed", severity: "warning", listingId: null, path: "propertyList" },
    ]);
    expect(result.meta).toEqual({
      generatedAt: "2026-10-01T08:00:00",
      listingCount: 1,
      hadCredentials: true,
    });
    expect(result.listings.map((l) => l.id)).toEqual(["XNWTEST:TEST0001"]);
  });

  it("unknown-element.xml skips the unknown element and keeps the listing", () => {
    const result = parseReaxml(fixture("unknown-element"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "unknown-listing-element",
        severity: "warning",
        listingId: null,
        path: "propertyList/agencyNotice",
      },
    ]);
    expect(result.warnings[0]?.message).toContain("agencyNotice");
    expect(result.listings.map((l) => l.id)).toEqual(["XNWTEST:TEST0001"]);
  });

  it("missing-identity.xml skips the listing and reports it at feed level", () => {
    const result = parseReaxml(fixture("missing-identity"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "missing-identity",
        severity: "error",
        listingId: null,
        path: "propertyList/residential[1]",
      },
    ]);
    expect(result.listings.map((l) => l.id)).toEqual(["XNWTEST:TEST0002"]);
    expect(result.meta.listingCount).toBe(1);
  });

  it("duplicate.xml keeps the last version at the position of its last occurrence", () => {
    const result = parseReaxml(fixture("duplicate"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "duplicate-listing",
        severity: "warning",
        listingId: "XNWTEST:TEST0001",
        path: "propertyList/residential[3]",
      },
    ]);
    expect(result.listings.map((l) => [l.id, l.headline])).toEqual([
      ["XNWTEST:TEST0002", "A different listing"],
      ["XNWTEST:TEST0001", "Second version of the listing"],
    ]);
  });

  it("unknown-status.xml treats the listing as current", () => {
    const result = parseReaxml(fixture("unknown-status"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "unknown-status",
        severity: "warning",
        listingId: "XNWTEST:TEST0001",
        path: "propertyList/residential",
      },
    ]);
    expect(result.listings[0]?.status).toBe("current");
  });

  it("zero-dates.xml nulls every zero date", () => {
    const result = parseReaxml(fixture("zero-dates"));
    const id = "XNWTEST:TEST0001";
    expect(shapes(result.warnings)).toEqual([
      { code: "invalid-date", severity: "warning", listingId: null, path: "propertyList" },
      {
        code: "invalid-date",
        severity: "warning",
        listingId: id,
        path: "propertyList/residential",
      },
      {
        code: "invalid-date",
        severity: "warning",
        listingId: id,
        path: "propertyList/residential/objects/img",
      },
      {
        code: "invalid-date",
        severity: "warning",
        listingId: id,
        path: "propertyList/residential/auction",
      },
    ]);
    expect(result.meta.generatedAt).toBeNull();
    const listing = result.listings[0];
    expect(listing?.modifiedAt).toBeNull();
    expect(listing?.auctionAt).toBeNull();
    expect(listing?.images).toEqual([
      {
        id: "m",
        url: "https://img.example.com/TEST0001/front.jpg",
        format: "jpg",
        modifiedAt: null,
      },
    ]);
  });

  it("image-placeholders.xml skips empty media", () => {
    const result = parseReaxml(fixture("image-placeholders"));
    const id = "XNWTEST:TEST0001";
    expect(shapes(result.warnings)).toEqual([
      {
        code: "empty-media-placeholder",
        severity: "info",
        listingId: id,
        path: "propertyList/residential/objects/img[2]",
      },
      {
        code: "media-without-url",
        severity: "warning",
        listingId: id,
        path: "propertyList/residential/objects/img[3]",
      },
      {
        code: "empty-media-placeholder",
        severity: "info",
        listingId: id,
        path: "propertyList/residential/objects/floorplan",
      },
    ]);
    const listing = result.listings[0];
    expect(listing?.images.map((i) => i.id)).toEqual(["m"]);
    expect(listing?.floorplans).toEqual([]);
  });

  it("hidden-price.xml withholds both prices by default", () => {
    const result = parseReaxml(fixture("hidden-price"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "hidden-price-withheld",
        severity: "info",
        listingId: "XNWTEST:TEST0001",
        path: "propertyList/residential[1]/price",
      },
      {
        code: "hidden-price-withheld",
        severity: "info",
        listingId: "XNWTEST:TEST0002",
        path: "propertyList/residential[2]/soldDetails/soldPrice",
      },
    ]);
    expect(result.listings[0]?.price).toEqual({
      amount: null,
      hidden: true,
      view: "Contact agent",
      range: null,
      tax: "unknown",
    });
    expect(result.listings[1]?.status).toBe("sold");
    expect(result.listings[1]?.sold).toEqual({
      price: null,
      priceHidden: true,
      date: "2026-08-01",
    });
  });

  it("hidden-price.xml includes both prices with includeHiddenPrices", () => {
    const result = parseReaxml(fixture("hidden-price"), { includeHiddenPrices: true });
    expect(result.warnings).toEqual([]);
    expect(result.listings[0]?.price).toEqual({
      amount: 987654,
      hidden: true,
      view: "Contact agent",
      range: null,
      tax: "unknown",
    });
    expect(result.listings[1]?.sold).toEqual({
      price: 987654,
      priceHidden: true,
      date: "2026-08-01",
    });
  });

  it("empty-measures.xml leaves the empty area null", () => {
    const result = parseReaxml(fixture("empty-measures"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "empty-measure",
        severity: "info",
        listingId: "XNWTEST:TEST0001",
        path: "propertyList/residential/landDetails/area",
      },
    ]);
    expect(result.listings[0]?.land).toEqual({
      area: null,
      frontage: { value: 15, unit: "meter" },
      depth: null,
    });
  });

  it("composite-street-number.xml passes the number through", () => {
    const result = parseReaxml(fixture("composite-street-number"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "street-number-composite",
        severity: "info",
        listingId: "XNWTEST:TEST0001",
        path: "propertyList/residential/address",
      },
    ]);
    const address = result.listings[0]?.address;
    expect(address?.streetNumber).toBe("2/80");
    expect(address?.subNumber).toBeNull();
    expect(address?.streetLine).toBe("2/80 Example Street");
  });

  it("extension-fields.xml collects fields and derives the location", () => {
    const result = parseReaxml(fixture("extension-fields"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "extension-fields-present",
        severity: "info",
        listingId: "XNWTEST:TEST0001",
        path: "propertyList/residential[1]/extraFields",
      },
      {
        code: "extension-fields-present",
        severity: "info",
        listingId: "XNWTEST:TEST0002",
        path: "propertyList/residential[2]/extraFields",
      },
    ]);
    const [keyed, named] = result.listings;
    expect(keyed?.extra).toEqual({
      geoLat: "-30.1234",
      geoLong: "140.5678",
      vendorRef: "REF-0001",
      featureTag: "Corner block",
    });
    expect(keyed?.location).toEqual({ lat: -30.1234, lng: 140.5678 });
    expect(named?.extra).toEqual({
      vendorRef: "REF-0002",
      latitude: "-30.2",
      longitude: "140.6",
    });
    expect(named?.location).toEqual({ lat: -30.2, lng: 140.6 });
  });

  it("bad-coordinates.xml drops the location", () => {
    const result = parseReaxml(fixture("bad-coordinates"));
    const id = "XNWTEST:TEST0001";
    const path = "propertyList/residential/extraFields";
    expect(shapes(result.warnings)).toEqual([
      { code: "extension-fields-present", severity: "info", listingId: id, path },
      { code: "invalid-coordinates", severity: "warning", listingId: id, path },
    ]);
    expect(result.listings[0]?.location).toBeNull();
    expect(JSON.stringify(result.warnings)).not.toContain("not-a-number");
  });

  it("bad-inspection.xml keeps the readable inspection only", () => {
    const result = parseReaxml(fixture("bad-inspection"));
    expect(shapes(result.warnings)).toEqual([
      {
        code: "unparseable-inspection",
        severity: "warning",
        listingId: "XNWTEST:TEST0001",
        path: "propertyList/residential/inspectionTimes/inspection[2]",
      },
    ]);
    expect(result.listings[0]?.inspections).toEqual([
      {
        start: "2026-12-12T10:00:00",
        end: "2026-12-12T10:30:00",
        raw: "2026-12-12 10:00 to 10:30",
      },
    ]);
  });

  it("malformed.xml returns xml-malformed with a position only", () => {
    const result = parseReaxml(fixture("malformed"));
    expect(result.listings).toEqual([]);
    expect(shapes(result.warnings)).toEqual([
      { code: "xml-malformed", severity: "error", listingId: null, path: "(document)" },
    ]);
    expect(result.warnings[0]?.message).toMatch(/: line \d+, column \d+$/);
    expect(result.meta).toEqual({ generatedAt: null, listingCount: 0, hadCredentials: false });
  });

  it("empty.xml returns empty-document", () => {
    const result = parseReaxml(fixture("empty"));
    expect(result.listings).toEqual([]);
    expect(shapes(result.warnings)).toEqual([
      { code: "empty-document", severity: "error", listingId: null, path: "propertyList" },
    ]);
    expect(result.meta.generatedAt).toBe("2026-10-01T08:00:00");
  });

  it("not-reaxml.xml returns empty-document", () => {
    const result = parseReaxml(fixture("not-reaxml"));
    expect(result.listings).toEqual([]);
    expect(shapes(result.warnings)).toEqual([
      { code: "empty-document", severity: "error", listingId: null, path: "catalog" },
    ]);
    expect(result.meta).toEqual({ generatedAt: null, listingCount: 0, hadCredentials: false });
  });
});
