import { describe, expect, expectTypeOf, it } from "vitest";
import * as api from "../src/index.js";
import type {
  Address,
  Agent,
  BusinessDetails,
  BusinessListing,
  CommercialDetails,
  CommercialListing,
  Diagnostic,
  DiagnosticCode,
  Features,
  FeedMeta,
  Inspection,
  Listing,
  ListingBase,
  ListingKind,
  ListingStatus,
  Measure,
  MediaItem,
  ParseOptions,
  ParseResult,
  Price,
  Rent,
  RentalListing,
  ResidentialListing,
  Severity,
  Summary,
} from "../src/index.js";

describe("public export surface", () => {
  it("exports exactly the runtime values of the public API", () => {
    expect(Object.keys(api).sort()).toEqual([
      "DIAGNOSTIC_CODES",
      "ReaxmlError",
      "VERSION",
      "parseReaxml",
      "summarise",
    ]);
  });

  it("exports working values", () => {
    expect(typeof api.parseReaxml).toBe("function");
    expect(typeof api.summarise).toBe("function");
    expect(typeof api.VERSION).toBe("string");
    expect(api.DIAGNOSTIC_CODES["xml-malformed"].severity).toBe("error");
    expect(new api.ReaxmlError("empty-document", null, "x", "m")).toBeInstanceOf(Error);
  });

  it("does not export the collector or anything from the XML wrapper", () => {
    for (const name of [
      "Collector",
      "parseXml",
      "XmlParseError",
      "child",
      "children",
      "text",
      "attr",
    ]) {
      expect(api).not.toHaveProperty(name);
    }
  });
});

describe("public type surface", () => {
  it("exports the listing variants, and Listing is exactly their union", () => {
    expectTypeOf<Extract<Listing, { kind: "rental" }>>().toEqualTypeOf<RentalListing>();
    expectTypeOf<Extract<Listing, { kind: "business" }>>().toEqualTypeOf<BusinessListing>();
    expectTypeOf<
      Extract<Listing, { kind: "commercial" | "commercialLand" }>
    >().toEqualTypeOf<CommercialListing>();
    expectTypeOf<
      Extract<Listing, { kind: ResidentialListing["kind"] }>
    >().toEqualTypeOf<ResidentialListing>();
    expectTypeOf<Listing>().toEqualTypeOf<
      ResidentialListing | RentalListing | CommercialListing | BusinessListing
    >();
  });

  it("gives every variant the base fields", () => {
    expectTypeOf<ResidentialListing>().toExtend<ListingBase>();
    expectTypeOf<RentalListing>().toExtend<ListingBase>();
    expectTypeOf<CommercialListing>().toExtend<ListingBase>();
    expectTypeOf<BusinessListing>().toExtend<ListingBase>();
    expectTypeOf<RentalListing["rent"]>().toEqualTypeOf<Rent | null>();
    expectTypeOf<CommercialListing["commercial"]>().toEqualTypeOf<CommercialDetails>();
    expectTypeOf<BusinessListing["business"]>().toEqualTypeOf<BusinessDetails>();
  });

  it("exports the remaining public types", () => {
    expectTypeOf<ParseResult["listings"]>().toEqualTypeOf<Listing[]>();
    expectTypeOf<ParseResult["warnings"]>().toEqualTypeOf<Diagnostic[]>();
    expectTypeOf<ParseResult["meta"]>().toEqualTypeOf<FeedMeta>();
    expectTypeOf<Diagnostic["code"]>().toEqualTypeOf<DiagnosticCode>();
    expectTypeOf<Diagnostic["severity"]>().toEqualTypeOf<Severity>();
    expectTypeOf<ListingBase["kind"]>().toEqualTypeOf<ListingKind>();
    expectTypeOf<ListingBase["status"]>().toEqualTypeOf<ListingStatus>();
    expectTypeOf<ListingBase["address"]>().toEqualTypeOf<Address>();
    expectTypeOf<ListingBase["agents"]>().toEqualTypeOf<Agent[]>();
    expectTypeOf<ListingBase["features"]>().toEqualTypeOf<Features>();
    expectTypeOf<ListingBase["inspections"]>().toEqualTypeOf<Inspection[]>();
    expectTypeOf<ListingBase["images"]>().toEqualTypeOf<MediaItem[]>();
    expectTypeOf<ListingBase["price"]>().toEqualTypeOf<Price | null>();
    expectTypeOf<NonNullable<ListingBase["land"]["area"]>>().toEqualTypeOf<Measure>();
    expectTypeOf<ParseOptions["tolerant"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<Summary["listings"]>().toEqualTypeOf<number>();
  });
});
