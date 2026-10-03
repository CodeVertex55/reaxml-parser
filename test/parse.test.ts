import { describe, expect, it } from "vitest";
import { ReaxmlError, parseReaxml } from "../src/index.js";
import { feed, fixture, residential, shapes } from "./helpers.js";

describe("identity", () => {
  it("builds the id from agentID and uniqueID", () => {
    const result = parseReaxml(feed(residential("TEST0001")));
    const listing = result.listings[0];
    expect(listing?.id).toBe("XNWTEST:TEST0001");
    expect(listing?.agentId).toBe("XNWTEST");
    expect(listing?.uniqueId).toBe("TEST0001");
  });

  it("trims identity text", () => {
    const xml = feed(
      "<residential><agentID> XNWTEST </agentID><uniqueID>\n TEST0001 \n</uniqueID></residential>",
    );
    expect(parseReaxml(xml).listings[0]?.id).toBe("XNWTEST:TEST0001");
  });

  it.each([
    ["no agentID", "<residential><uniqueID>TEST0001</uniqueID></residential>"],
    ["no uniqueID", "<residential><agentID>XNWTEST</agentID></residential>"],
    [
      "empty agentID",
      "<residential><agentID> </agentID><uniqueID>TEST0001</uniqueID></residential>",
    ],
    ["empty uniqueID", "<residential><agentID>XNWTEST</agentID><uniqueID/></residential>"],
    ["neither", "<residential/>"],
  ])("skips a listing with %s", (_name, inner) => {
    const result = parseReaxml(feed(inner));
    expect(result.listings).toEqual([]);
    expect(shapes(result.warnings)).toEqual([
      {
        code: "missing-identity",
        severity: "error",
        listingId: null,
        path: "propertyList/residential",
      },
    ]);
  });

  it("does not let a skipped listing's diagnostics carry an id", () => {
    const result = parseReaxml(
      feed(`<residential><price display="no">1</price></residential>${residential("TEST0002")}`),
    );
    expect(result.warnings.every((w) => w.listingId === null)).toBe(true);
  });
});

describe("kinds", () => {
  it.each([
    "residential",
    "rental",
    "land",
    "rural",
    "commercial",
    "commercialLand",
    "business",
    "holidayRental",
  ] as const)("reads a %s element", (kind) => {
    const xml = feed(`<${kind}><agentID>XNWTEST</agentID><uniqueID>TEST0001</uniqueID></${kind}>`);
    const result = parseReaxml(xml);
    expect(result.warnings).toEqual([]);
    expect(result.listings[0]?.kind).toBe(kind);
  });

  it("only gives rental listings rent, bond and availableAt", () => {
    const rental = parseReaxml(feed("<rental><agentID>A</agentID><uniqueID>1</uniqueID></rental>"))
      .listings[0];
    expect(rental).toMatchObject({ rent: null, bond: null, availableAt: null, price: null });
    const house = parseReaxml(feed(residential("TEST0001"))).listings[0];
    expect(house).not.toHaveProperty("rent");
    expect(house).not.toHaveProperty("commercial");
    expect(house).not.toHaveProperty("business");
  });

  it("gives a rental a price only when a price element exists", () => {
    const withPrice = parseReaxml(
      feed(
        "<rental><agentID>A</agentID><uniqueID>1</uniqueID><price>500</price><rent>450</rent></rental>",
      ),
    ).listings[0];
    expect(withPrice?.price).toEqual({
      amount: 500,
      hidden: false,
      view: null,
      range: null,
      tax: "unknown",
    });
  });

  it("falls back through category element names", () => {
    const category = (inner: string) =>
      parseReaxml(feed(residential("TEST0001", inner))).listings[0]?.category;
    expect(category("")).toBeNull();
    expect(category('<holidayCategory name="H"/>')).toBe("H");
    expect(category('<landCategory name="L"/><holidayCategory name="H"/>')).toBe("L");
    expect(category('<ruralCategory name="R"/><landCategory name="L"/>')).toBe("R");
    expect(category('<category name="C"/><ruralCategory name="R"/>')).toBe("C");
  });

  it("takes the first commercial and business category", () => {
    const commercial = parseReaxml(
      feed(
        '<commercial><agentID>A</agentID><uniqueID>1</uniqueID><commercialCategory name="First"/><commercialCategory name="Second"/></commercial>',
      ),
    ).listings[0];
    expect(commercial?.category).toBe("First");
    const business = parseReaxml(
      feed(
        "<business><agentID>A</agentID><uniqueID>1</uniqueID><businessCategory><name>Top</name><businessSubCategory><name>Sub</name></businessSubCategory></businessCategory></business>",
      ),
    ).listings[0];
    expect(business?.category).toBe("Top");
  });
});

describe("listing fields", () => {
  it("reads links, video, authority and underOffer", () => {
    const listing = parseReaxml(
      feed(
        residential(
          "TEST0001",
          '<authority value="auction"/><underOffer value="yes"/>' +
            '<videoLink href="https://video.example.com/a"/>' +
            '<externalLink href="https://tour.example.com/a"/><externalLink href=""/><externalLink/>' +
            '<externalLink href="https://tour.example.com/b"/>',
        ),
      ),
    ).listings[0];
    expect(listing?.authority).toBe("auction");
    expect(listing?.underOffer).toBe(true);
    expect(listing?.videoUrl).toBe("https://video.example.com/a");
    expect(listing?.externalLinks).toEqual([
      "https://tour.example.com/a",
      "https://tour.example.com/b",
    ]);
  });

  it("reads rental extras", () => {
    const listing = parseReaxml(
      feed(
        '<rental><agentID>A</agentID><uniqueID>1</uniqueID><rent period="month">2000</rent><bond>x</bond><dateAvailable>20261101</dateAvailable></rental>',
      ),
    ).listings[0];
    expect(listing).toMatchObject({
      rent: { amount: 2000, period: "month", hidden: false, view: null },
      bond: null,
      availableAt: "2026-11-01",
    });
  });

  it("reads an energy rating that is not a number as null with a diagnostic", () => {
    const result = parseReaxml(
      feed(
        residential(
          "TEST0001",
          "<buildingDetails><energyRating>high</energyRating></buildingDetails>",
        ),
      ),
    );
    expect(result.listings[0]?.building).toEqual({ area: null, energyRating: null });
    expect(shapes(result.warnings)).toEqual([
      {
        code: "unparseable-number",
        severity: "warning",
        listingId: "XNWTEST:TEST0001",
        path: "propertyList/residential/buildingDetails/energyRating",
      },
    ]);
  });

  it("keeps line breaks in the description", () => {
    const listing = parseReaxml(
      feed(residential("TEST0001", "<description>\n  One\n  Two\n</description>")),
    ).listings[0];
    expect(listing?.description).toBe("One\n  Two");
  });
});

describe("status", () => {
  it.each(["current", "sold", "leased", "withdrawn", "offmarket", "deleted"] as const)(
    "accepts %s",
    (status) => {
      const result = parseReaxml(feed(residential("TEST0001", "", `status="${status}"`)));
      expect(result.listings[0]?.status).toBe(status);
      expect(result.warnings).toEqual([]);
    },
  );

  it("lower-cases and trims the status", () => {
    const result = parseReaxml(feed(residential("TEST0001", "", 'status=" SOLD "')));
    expect(result.listings[0]?.status).toBe("sold");
    expect(result.warnings).toEqual([]);
  });

  it("treats an absent status as current without a diagnostic", () => {
    const result = parseReaxml(feed(residential("TEST0001", "", "")));
    expect(result.listings[0]?.status).toBe("current");
    expect(result.warnings).toEqual([]);
  });

  it("treats an empty status as current without a diagnostic", () => {
    const result = parseReaxml(feed(residential("TEST0001", "", 'status=""')));
    expect(result.listings[0]?.status).toBe("current");
    expect(result.warnings).toEqual([]);
  });

  it("warns about an unknown status and truncates a long value", () => {
    const result = parseReaxml(feed(residential("TEST0001", "", `status="${"x".repeat(200)}"`)));
    expect(result.listings[0]?.status).toBe("current");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message.length).toBeLessThan(200);
    expect(result.warnings[0]?.message).toContain("x".repeat(80));
    expect(result.warnings[0]?.message).not.toContain("x".repeat(81));
  });
});

describe("duplicates", () => {
  it("replaces earlier data and moves the listing to its last position", () => {
    const xml = feed(
      residential("A", "<headline>A1</headline>") +
        residential("B", "<headline>B1</headline>") +
        residential("C", "<headline>C1</headline>") +
        residential("A", "<headline>A2</headline>") +
        residential("B", "<headline>B2</headline>"),
    );
    const result = parseReaxml(xml);
    expect(result.listings.map((l) => [l.uniqueId, l.headline])).toEqual([
      ["C", "C1"],
      ["A", "A2"],
      ["B", "B2"],
    ]);
    expect(result.meta.listingCount).toBe(3);
    expect(shapes(result.warnings)).toEqual([
      {
        code: "duplicate-listing",
        severity: "warning",
        listingId: "XNWTEST:A",
        path: "propertyList/residential[4]",
      },
      {
        code: "duplicate-listing",
        severity: "warning",
        listingId: "XNWTEST:B",
        path: "propertyList/residential[5]",
      },
    ]);
  });

  it("treats the same uniqueID under another agent as a different listing", () => {
    const xml = feed(residential("A") + residential("A", "", 'status="current"', "XNWDEMO"));
    const result = parseReaxml(xml);
    expect(result.listings.map((l) => l.id)).toEqual(["XNWTEST:A", "XNWDEMO:A"]);
    expect(result.warnings).toEqual([]);
  });

  it("does not let a later duplicate keep data from the earlier one", () => {
    const xml = feed(
      residential("A", "<headline>Old</headline><videoLink href='https://v.example.com/'/>") +
        residential("A"),
    );
    const listing = parseReaxml(xml).listings[0];
    expect(listing?.headline).toBeNull();
    expect(listing?.videoUrl).toBeNull();
  });
});

describe("meta", () => {
  it("normalises the feed date", () => {
    expect(parseReaxml(feed(residential("A"), 'date="2026-10-01-08:00:00"')).meta).toEqual({
      generatedAt: "2026-10-01T08:00:00",
      listingCount: 1,
      hadCredentials: false,
    });
  });

  it("has a null generatedAt without a date", () => {
    expect(parseReaxml(feed(residential("A"))).meta.generatedAt).toBeNull();
  });

  it("counts only the final listings", () => {
    expect(
      parseReaxml(feed(residential("A") + residential("A") + "<other/>" + "<residential/>")).meta
        .listingCount,
    ).toBe(1);
  });

  it("ignores empty credential attributes", () => {
    const result = parseReaxml(feed(residential("A"), 'username="" password=" "'));
    expect(result.meta.hadCredentials).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it.each(['username="u"', 'password="p"', 'username="u" password="p"'])(
    "detects credentials from %s",
    (attributes) => {
      const result = parseReaxml(feed(residential("A"), attributes));
      expect(result.meta.hadCredentials).toBe(true);
      expect(shapes(result.warnings)).toEqual([
        { code: "credentials-in-feed", severity: "warning", listingId: null, path: "propertyList" },
      ]);
    },
  );

  it("gives feed-level diagnostics no listing id even after a listing", () => {
    const xml = feed(residential("A", '<price display="no">5</price>') + "<notAListing/>");
    const result = parseReaxml(xml);
    const feedLevel = result.warnings.find((w) => w.code === "unknown-listing-element");
    expect(feedLevel?.listingId).toBeNull();
    expect(result.warnings.find((w) => w.code === "hidden-price-withheld")?.listingId).toBe(
      "XNWTEST:A",
    );
  });

  it("reports an empty feed element", () => {
    const result = parseReaxml(feed(""));
    expect(shapes(result.warnings)).toEqual([
      { code: "empty-document", severity: "error", listingId: null, path: "propertyList" },
    ]);
  });

  it("does not call a feed of only unknown elements empty", () => {
    const result = parseReaxml(feed("<other/>"));
    expect(result.warnings.map((w) => w.code)).toEqual(["unknown-listing-element"]);
  });

  it.each(["", "   \n", '<?xml version="1.0"?>', "<!-- nothing -->"])(
    "reports %j as empty-document at the document level",
    (input) => {
      const result = parseReaxml(input);
      expect(result.listings).toEqual([]);
      expect(shapes(result.warnings)).toEqual([
        { code: "empty-document", severity: "error", listingId: null, path: "(document)" },
      ]);
    },
  );

  it("reports a wrong root element", () => {
    const result = parseReaxml("<PropertyList/>");
    expect(shapes(result.warnings)).toEqual([
      { code: "empty-document", severity: "error", listingId: null, path: "PropertyList" },
    ]);
  });
});

describe("options", () => {
  const stamped = feed(
    residential(
      "A",
      '<auction date="2026-11-14-11:00:00"/>',
      'status="current" modTime="2026-09-30-14:05:10"',
    ),
    'date="2026-10-01-08:00:00"',
  );

  it("returns local times without a timeZone", () => {
    const result = parseReaxml(stamped);
    expect(result.meta.generatedAt).toBe("2026-10-01T08:00:00");
    expect(result.listings[0]?.modifiedAt).toBe("2026-09-30T14:05:10");
  });

  it("converts every date to UTC with a timeZone", () => {
    const result = parseReaxml(stamped, { timeZone: "Australia/Perth" });
    expect(result.meta.generatedAt).toBe("2026-10-01T00:00:00Z");
    expect(result.listings[0]?.modifiedAt).toBe("2026-09-30T06:05:10Z");
    expect(result.listings[0]?.auctionAt).toBe("2026-11-14T03:00:00Z");
  });

  it("converts sold dates, inspections and commercial lease ends", () => {
    const xml = feed(
      '<commercial modTime="2026-09-30-14:05:10"><agentID>A</agentID><uniqueID>1</uniqueID>' +
        "<currentLeaseEndDate>2028-06-30-10:00:00</currentLeaseEndDate>" +
        "<soldDetails><soldDate>2026-08-01-09:00:00</soldDate></soldDetails>" +
        "<inspectionTimes><inspection>2026-12-12 10:00 to 10:30</inspection></inspectionTimes>" +
        "</commercial>",
    );
    const listing = parseReaxml(xml, { timeZone: "Australia/Perth" }).listings[0];
    expect(listing).toMatchObject({
      commercial: { currentLeaseEndAt: "2028-06-30T02:00:00Z" },
      sold: { date: "2026-08-01T01:00:00Z" },
      inspections: [{ start: "2026-12-12T02:00:00Z", end: "2026-12-12T02:30:00Z" }],
    });
  });

  it("withholds hidden prices by default and includes them on request", () => {
    const xml = feed(residential("A", '<price display="no">987654</price>'));
    expect(parseReaxml(xml).listings[0]?.price).toMatchObject({ amount: null, hidden: true });
    expect(parseReaxml(xml, { includeHiddenPrices: true }).listings[0]?.price).toMatchObject({
      amount: 987654,
      hidden: true,
    });
    expect(parseReaxml(xml, { includeHiddenPrices: false }).listings[0]?.price).toMatchObject({
      amount: null,
    });
  });

  it("applies includeHiddenPrices to rent, commercial rent and business rent", () => {
    const xml = feed(
      '<rental><agentID>A</agentID><uniqueID>1</uniqueID><rent display="no">987654</rent></rental>' +
        '<commercial><agentID>A</agentID><uniqueID>2</uniqueID><commercialRent display="no">987654</commercialRent></commercial>' +
        '<business><agentID>A</agentID><uniqueID>3</uniqueID><businessLease display="no">987654</businessLease></business>',
    );
    const withheld = JSON.stringify(parseReaxml(xml).listings);
    expect(withheld).not.toContain("987654");
    const included = parseReaxml(xml, { includeHiddenPrices: true }).listings;
    expect(included[0]).toMatchObject({ rent: { amount: 987654, hidden: true } });
    expect(included[1]).toMatchObject({ commercial: { rent: { amount: 987654, hidden: true } } });
    expect(included[2]).toMatchObject({ business: { rent: { amount: 987654 } } });
  });

  it.each([
    ["Not/AZone", true],
    ["Not/AZone", false],
    ["", true],
  ])("throws RangeError for the invalid timeZone %j (tolerant %s)", (timeZone, tolerant) => {
    const run = () => parseReaxml(feed(residential("A")), { timeZone, tolerant });
    expect(run).toThrow(RangeError);
    expect(run).toThrow(`Invalid timeZone: ${timeZone}`);
  });

  it("validates the timeZone before looking at the document", () => {
    expect(() => parseReaxml("", { timeZone: "Not/AZone" })).toThrow(RangeError);
    expect(() => parseReaxml("<broken", { timeZone: "Not/AZone" })).toThrow(RangeError);
    expect(() => parseReaxml(feed(""), { timeZone: "Not/AZone" })).toThrow(RangeError);
    expect(() => parseReaxml(feed(residential("A")), { timeZone: "Not/AZone" })).toThrow(
      RangeError,
    );
  });

  it("accepts a valid timeZone for a document with no dates", () => {
    const result = parseReaxml(feed(residential("A")), { timeZone: "Australia/Sydney" });
    expect(result.listings).toHaveLength(1);
  });
});

describe("tolerant false", () => {
  it("throws ReaxmlError on missing-identity", () => {
    const xml = feed("<residential><agentID>XNWTEST</agentID></residential>");
    let caught: unknown;
    try {
      parseReaxml(xml, { tolerant: false });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReaxmlError);
    expect(caught).toMatchObject({
      code: "missing-identity",
      listingId: null,
      path: "propertyList/residential",
    });
  });

  it("does not throw on warnings and info diagnostics", () => {
    const result = parseReaxml(fixture("hidden-price") + "", { tolerant: false });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(() => parseReaxml(fixture("unknown-status"), { tolerant: false })).not.toThrow();
    expect(() => parseReaxml(fixture("duplicate"), { tolerant: false })).not.toThrow();
    expect(() => parseReaxml(fixture("credentials"), { tolerant: false })).not.toThrow();
    expect(() => parseReaxml(fixture("zero-dates"), { tolerant: false })).not.toThrow();
  });

  it("throws ReaxmlError, not XmlParseError, for malformed XML", () => {
    let caught: unknown;
    try {
      parseReaxml(fixture("malformed"), { tolerant: false });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReaxmlError);
    expect((caught as ReaxmlError).code).toBe("xml-malformed");
    expect((caught as ReaxmlError).message).toMatch(/: line \d+, column \d+$/);
    expect((caught as ReaxmlError).message).not.toContain("TEST0001");
  });

  it.each(["empty", "not-reaxml"])("throws ReaxmlError for %s.xml", (name) => {
    let caught: unknown;
    try {
      parseReaxml(fixture(name), { tolerant: false });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReaxmlError);
    expect((caught as ReaxmlError).code).toBe("empty-document");
  });

  it("throws on an empty string", () => {
    expect(() => parseReaxml("", { tolerant: false })).toThrow(ReaxmlError);
  });

  it("describes an unknown position without numbers", () => {
    // A tag name the XML library rejects after validation gives an XmlParseError with line 0.
    let message = "";
    try {
      parseReaxml("<propertyList><__proto__/></propertyList>", { tolerant: false });
    } catch (error) {
      message = (error as ReaxmlError).message;
    }
    expect(message).toMatch(/: position unknown$/);
  });
});

describe("mixed.xml", () => {
  it("summarises by kind and status", () => {
    const result = parseReaxml(fixture("mixed"));
    expect(result.warnings).toEqual([]);
    expect(result.meta.listingCount).toBe(12);

    const count = (key: "kind" | "status") => {
      const counts: Record<string, number> = {};
      for (const listing of result.listings) {
        counts[listing[key]] = (counts[listing[key]] ?? 0) + 1;
      }
      return counts;
    };
    expect(count("kind")).toEqual({
      residential: 2,
      rental: 2,
      land: 2,
      rural: 1,
      commercial: 2,
      commercialLand: 1,
      business: 1,
      holidayRental: 1,
    });
    expect(count("status")).toEqual({
      current: 7,
      sold: 2,
      leased: 1,
      withdrawn: 1,
      offmarket: 1,
    });
    expect(result.listings.map((l) => l.uniqueId)).toEqual(
      Array.from({ length: 12 }, (_, i) => `TEST01${String(i + 1).padStart(2, "0")}`),
    );
  });
});
