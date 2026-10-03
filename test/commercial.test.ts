import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parseCommercial } from "../src/normalise/commercial.js";
import { parseXml } from "../src/xml.js";

const HIDDEN = "987654";

function run(inner: string, includeHiddenPrices = false, timeZone?: string) {
  const root = parseXml(`<commercial>${inner}</commercial>`);
  if (root === null) throw new Error("test xml has no root");
  const c = new Collector({ tolerant: true });
  const opts = timeZone === undefined ? { includeHiddenPrices } : { includeHiddenPrices, timeZone };
  const result = parseCommercial(root, c, opts);
  return { result, diagnostics: c.all };
}

const DEFAULTS = {
  listingType: null,
  categories: [],
  rent: null,
  rentPerSquareMeter: null,
  outgoings: null,
  returnPercent: null,
  tenancy: null,
  zone: null,
  carSpaces: null,
  currentLeaseEndAt: null,
};

describe("parseCommercial defaults", () => {
  it("returns nulls and empty arrays when no element is present", () => {
    const { result, diagnostics } = run("");
    expect(result).toEqual(DEFAULTS);
    expect(diagnostics).toEqual([]);
  });

  it("ignores unrelated children", () => {
    expect(run("<headline>Shop</headline>").result).toEqual(DEFAULTS);
  });
});

describe("parseCommercial listing type", () => {
  it.each(["sale", "lease", "both"] as const)("reads %s", (value) => {
    const { result } = run(`<commercialListingType value="${value}"/>`);
    expect(result).toEqual({ ...DEFAULTS, listingType: value });
  });

  it("is case-insensitive", () => {
    expect(run('<commercialListingType value="LEASE"/>').result.listingType).toBe("lease");
  });

  it("gives null for an unknown value", () => {
    expect(run('<commercialListingType value="auction"/>').result.listingType).toBeNull();
  });

  it("gives null when the value attribute is missing", () => {
    expect(run("<commercialListingType/>").result.listingType).toBeNull();
  });
});

describe("parseCommercial categories", () => {
  it("collects names in order and deduplicates", () => {
    const { result } = run(
      '<commercialCategory name="Retail"/><commercialCategory name="Office"/><commercialCategory name="Retail"/>',
    );
    expect(result).toEqual({ ...DEFAULTS, categories: ["Retail", "Office"] });
  });

  it("falls back to element text and trims", () => {
    const { result } = run(
      '<commercialCategory name="  Warehouse "/><commercialCategory> Showroom </commercialCategory>',
    );
    expect(result.categories).toEqual(["Warehouse", "Showroom"]);
  });

  it("skips empty names", () => {
    const { result } = run('<commercialCategory name=" "/><commercialCategory/>');
    expect(result.categories).toEqual([]);
  });
});

describe("parseCommercial rent", () => {
  it("reads amount, period, outgoings flag and tax", () => {
    const { result, diagnostics } = run(
      '<commercialRent period="annual" plusOutgoings="yes" tax="exclusive">48,000</commercialRent>',
    );
    expect(result.rent).toEqual({
      amount: 48000,
      period: "annual",
      plusOutgoings: true,
      tax: "exclusive",
      hidden: false,
    });
    expect(diagnostics).toEqual([]);
  });

  it("defaults to annual, no outgoings and unknown tax", () => {
    expect(run("<commercialRent>1200</commercialRent>").result.rent).toEqual({
      amount: 1200,
      period: "annual",
      plusOutgoings: false,
      tax: "unknown",
      hidden: false,
    });
  });

  it.each([
    ["annual", "annual"],
    ["Annually", "annual"],
    ["year", "annual"],
    ["YEARLY", "annual"],
    ["pa", "annual"],
    ["month", "month"],
    ["Monthly", "month"],
    ["week", "week"],
    ["WEEKLY", "week"],
    ["fortnight", "annual"],
  ] as const)("maps period %s to %s", (period, expected) => {
    const { result } = run(`<commercialRent period="${period}">100</commercialRent>`);
    expect(result.rent?.period).toBe(expected);
  });

  it.each([
    ["inclusive", "inclusive"],
    ["EXEMPT", "exempt"],
    ["bogus", "unknown"],
  ] as const)("maps tax %s to %s", (tax, expected) => {
    const { result } = run(`<commercialRent tax="${tax}">100</commercialRent>`);
    expect(result.rent?.tax).toBe(expected);
  });

  it("reads plusOutgoings with yesNo", () => {
    expect(
      run('<commercialRent plusOutgoings="true">1</commercialRent>').result.rent?.plusOutgoings,
    ).toBe(true);
    expect(
      run('<commercialRent plusOutgoings="no">1</commercialRent>').result.rent?.plusOutgoings,
    ).toBe(false);
  });

  it("gives a null amount and a diagnostic for text that is not a number", () => {
    const { result, diagnostics } = run("<commercialRent>on application</commercialRent>");
    expect(result.rent?.amount).toBeNull();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "unparseable-number",
        message: expect.stringContaining("commercialRent"),
      }),
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain("on application");
  });
});

describe("parseCommercial hidden rent", () => {
  const xml = `<commercialRent display="no" period="month" plusOutgoings="yes" tax="inclusive">${HIDDEN}</commercialRent>`;

  it("withholds the amount and says so without leaking it", () => {
    const { result, diagnostics } = run(xml);
    expect(result.rent).toEqual({
      amount: null,
      period: "month",
      plusOutgoings: true,
      tax: "inclusive",
      hidden: true,
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "hidden-price-withheld",
        message: expect.stringContaining("commercialRent"),
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(HIDDEN);
    expect(JSON.stringify(diagnostics)).not.toContain(HIDDEN);
  });

  it("keeps the amount when hidden prices are included", () => {
    const { result, diagnostics } = run(xml, true);
    expect(result.rent).toEqual({
      amount: Number(HIDDEN),
      period: "month",
      plusOutgoings: true,
      tax: "inclusive",
      hidden: true,
    });
    expect(diagnostics).toEqual([]);
  });

  it("adds no note for an empty hidden rent", () => {
    const { result, diagnostics } = run('<commercialRent display="no"/>');
    expect(result.rent).toEqual({
      amount: null,
      period: "annual",
      plusOutgoings: false,
      tax: "unknown",
      hidden: true,
    });
    expect(diagnostics).toEqual([]);
  });
});

describe("parseCommercial rent per square metre", () => {
  it("reads a range", () => {
    const { result, diagnostics } = run(
      "<rentPerSquareMeter><range><min>250</min><max>300</max></range></rentPerSquareMeter>",
    );
    expect(result.rentPerSquareMeter).toEqual({ min: 250, max: 300 });
    expect(diagnostics).toEqual([]);
  });

  it("accepts the British spelling", () => {
    const { result } = run(
      "<rentPerSquareMetre><range><min>250</min><max>300</max></range></rentPerSquareMetre>",
    );
    expect(result.rentPerSquareMeter).toEqual({ min: 250, max: 300 });
  });

  it("uses plain text as both min and max", () => {
    expect(run("<rentPerSquareMeter>275</rentPerSquareMeter>").result.rentPerSquareMeter).toEqual({
      min: 275,
      max: 275,
    });
    expect(
      run("<rentPerSquareMetre>$1,275.50</rentPerSquareMetre>").result.rentPerSquareMeter,
    ).toEqual({ min: 1275.5, max: 1275.5 });
  });

  it("swaps a reversed range", () => {
    const { result } = run(
      "<rentPerSquareMeter><range><min>300</min><max>250</max></range></rentPerSquareMeter>",
    );
    expect(result.rentPerSquareMeter).toEqual({ min: 250, max: 300 });
  });

  it("keeps a single bound and leaves the other null", () => {
    const { result, diagnostics } = run(
      "<rentPerSquareMeter><range><min>250</min></range></rentPerSquareMeter>",
    );
    expect(result.rentPerSquareMeter).toEqual({ min: 250, max: null });
    expect(diagnostics).toEqual([]);
  });

  it("nulls an unparseable bound and names the element", () => {
    const { result, diagnostics } = run(
      "<rentPerSquareMeter><range><min>cheap</min><max>300</max></range></rentPerSquareMeter>",
    );
    expect(result.rentPerSquareMeter).toEqual({ min: null, max: 300 });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "unparseable-number",
        message: expect.stringContaining("min"),
      }),
    ]);
  });

  it("nulls both bounds for unparseable plain text", () => {
    const { result, diagnostics } = run("<rentPerSquareMeter>n/a</rentPerSquareMeter>");
    expect(result.rentPerSquareMeter).toEqual({ min: null, max: null });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "unparseable-number",
        message: expect.stringContaining("rentPerSquareMeter"),
      }),
    ]);
  });

  it("is null for an empty element", () => {
    expect(run("<rentPerSquareMeter/>").result.rentPerSquareMeter).toBeNull();
  });

  it("is null for an empty range", () => {
    const { result, diagnostics } = run("<rentPerSquareMeter><range/></rentPerSquareMeter>");
    expect(result.rentPerSquareMeter).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("is null for a range whose bounds are empty", () => {
    const { result, diagnostics } = run(
      "<rentPerSquareMeter><range><min/><max> </max></range></rentPerSquareMeter>",
    );
    expect(result.rentPerSquareMeter).toBeNull();
    expect(diagnostics).toEqual([]);
  });
});

describe("parseCommercial scalar fields", () => {
  it("reads outgoings, return, zone and car spaces", () => {
    const { result, diagnostics } = run(
      "<outgoings>12,500</outgoings><return>7.25</return><zone> B4 Mixed Use </zone><carSpaces>3</carSpaces>",
    );
    expect(result).toEqual({
      ...DEFAULTS,
      outgoings: 12500,
      returnPercent: 7.25,
      zone: "B4 Mixed Use",
      carSpaces: 3,
    });
    expect(diagnostics).toEqual([]);
  });

  it("truncates car spaces to an integer", () => {
    expect(run("<carSpaces>2.0</carSpaces>").result.carSpaces).toBe(2);
  });

  it("nulls non-numeric values with diagnostics that name the element", () => {
    const { result, diagnostics } = run(
      "<outgoings>tbc</outgoings><return>high</return><carSpaces>many</carSpaces>",
    );
    expect(result).toEqual(DEFAULTS);
    expect(diagnostics.map((d) => d.code)).toEqual([
      "unparseable-number",
      "unparseable-number",
      "unparseable-number",
    ]);
    expect(diagnostics[0]?.message).toContain("outgoings");
    expect(diagnostics[1]?.message).toContain("return");
    expect(diagnostics[2]?.message).toContain("carSpaces");
  });
});

describe("parseCommercial tenancy", () => {
  it.each(["unknown", "vacant", "tenanted"] as const)("reads %s from the value attribute", (v) => {
    expect(run(`<tenancy value="${v}"/>`).result.tenancy).toBe(v);
  });

  it("falls back to text and lower-cases", () => {
    expect(run("<tenancy> Tenanted </tenancy>").result.tenancy).toBe("tenanted");
    expect(run('<tenancy value="VACANT"/>').result.tenancy).toBe("vacant");
  });

  it("prefers the value attribute over text", () => {
    expect(run('<tenancy value="vacant">tenanted</tenancy>').result.tenancy).toBe("vacant");
  });

  it("gives null for other values and for an empty element", () => {
    expect(run('<tenancy value="owner-occupied"/>').result.tenancy).toBeNull();
    expect(run("<tenancy/>").result.tenancy).toBeNull();
  });
});

describe("parseCommercial lease end date", () => {
  it("normalises a date-only value", () => {
    const { result, diagnostics } = run("<currentLeaseEndDate>2028-06-30</currentLeaseEndDate>");
    expect(result.currentLeaseEndAt).toBe("2028-06-30");
    expect(diagnostics).toEqual([]);
  });

  it("normalises a date-time, applying the time zone", () => {
    const { result } = run(
      "<currentLeaseEndDate>2028-06-30-17:00:00</currentLeaseEndDate>",
      false,
      "Australia/Sydney",
    );
    expect(result.currentLeaseEndAt).toBe("2028-06-30T07:00:00Z");
  });

  it("gives null and an invalid-date diagnostic for junk", () => {
    const { result, diagnostics } = run("<currentLeaseEndDate>someday</currentLeaseEndDate>");
    expect(result.currentLeaseEndAt).toBeNull();
    expect(diagnostics).toEqual([expect.objectContaining({ code: "invalid-date" })]);
  });
});

describe("parseCommercial full listing", () => {
  it("reads every field at once", () => {
    const { result, diagnostics } = run(`
      <commercialListingType value="both"/>
      <commercialCategory name="Retail"/>
      <commercialCategory name="Showroom"/>
      <commercialRent period="week" plusOutgoings="yes" tax="exclusive">900</commercialRent>
      <rentPerSquareMeter>275</rentPerSquareMeter>
      <outgoings>15000</outgoings>
      <return>6.5</return>
      <tenancy value="tenanted"/>
      <zone>IN1</zone>
      <carSpaces>4</carSpaces>
      <currentLeaseEndDate>2029-01-31</currentLeaseEndDate>`);
    expect(result).toEqual({
      listingType: "both",
      categories: ["Retail", "Showroom"],
      rent: { amount: 900, period: "week", plusOutgoings: true, tax: "exclusive", hidden: false },
      rentPerSquareMeter: { min: 275, max: 275 },
      outgoings: 15000,
      returnPercent: 6.5,
      tenancy: "tenanted",
      zone: "IN1",
      carSpaces: 4,
      currentLeaseEndAt: "2029-01-31",
    });
    expect(diagnostics).toEqual([]);
  });
});
