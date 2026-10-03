import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parseBusiness } from "../src/normalise/business.js";
import { parseXml } from "../src/xml.js";

const HIDDEN = "987654";

function run(inner: string, includeHiddenPrices?: boolean) {
  const root = parseXml(`<business>${inner}</business>`);
  if (root === null) throw new Error("test xml has no root");
  const c = new Collector({ tolerant: true });
  const result =
    includeHiddenPrices === undefined
      ? parseBusiness(root, c)
      : parseBusiness(root, c, { includeHiddenPrices });
  return { result, diagnostics: c.all };
}

const DEFAULTS = { categories: [], takings: null, franchise: null, terms: null, rent: null };

describe("parseBusiness defaults", () => {
  it("returns nulls and empty arrays when no element is present", () => {
    const { result, diagnostics } = run("");
    expect(result).toEqual(DEFAULTS);
    expect(diagnostics).toEqual([]);
  });
});

describe("parseBusiness categories", () => {
  it("reads a name child", () => {
    const { result } = run("<businessCategory><name>Cafe</name></businessCategory>");
    expect(result).toEqual({ ...DEFAULTS, categories: ["Cafe"] });
  });

  it("reads a name attribute", () => {
    const { result } = run('<businessCategory name="Bakery"/>');
    expect(result.categories).toEqual(["Bakery"]);
  });

  it("adds sub-category names after their category", () => {
    const { result } = run(`
      <businessCategory>
        <name>Food</name>
        <businessSubCategory><name>Takeaway</name></businessSubCategory>
        <businessSubCategory name="Restaurant"/>
      </businessCategory>
      <businessCategory name="Retail"><businessSubCategory><name>Newsagent</name></businessSubCategory></businessCategory>`);
    expect(result.categories).toEqual(["Food", "Takeaway", "Restaurant", "Retail", "Newsagent"]);
  });

  it("prefers the name child over the attribute", () => {
    const { result } = run('<businessCategory name="Attr"><name>Child</name></businessCategory>');
    expect(result.categories).toEqual(["Child"]);
  });

  it("deduplicates in order and skips empty names", () => {
    const { result } = run(`
      <businessCategory><name> Cafe </name></businessCategory>
      <businessCategory name="Cafe"><businessSubCategory><name>Cafe</name></businessSubCategory></businessCategory>
      <businessCategory><name/></businessCategory>
      <businessCategory/>`);
    expect(result.categories).toEqual(["Cafe"]);
  });
});

describe("parseBusiness text fields", () => {
  it("reads takings and terms", () => {
    const { result } = run("<takings> $12,000 per week </takings><terms>Walk in walk out</terms>");
    expect(result).toEqual({
      ...DEFAULTS,
      takings: "$12,000 per week",
      terms: "Walk in walk out",
    });
  });

  it("gives null for empty elements", () => {
    expect(run("<takings/><terms> </terms>").result).toEqual(DEFAULTS);
  });
});

describe("parseBusiness franchise", () => {
  it("is null when the element is absent", () => {
    expect(run("").result.franchise).toBeNull();
  });

  it.each([
    ['<franchise value="yes"/>', true],
    ['<franchise value="no"/>', false],
    ["<franchise>true</franchise>", true],
    ["<franchise>no</franchise>", false],
    ["<franchise/>", false],
    ['<franchise value="no">yes</franchise>', false],
  ] as const)("reads %s as %s", (xml, expected) => {
    expect(run(xml).result.franchise).toBe(expected);
  });
});

describe("parseBusiness rent", () => {
  it("reads a businessLease with a period", () => {
    const { result, diagnostics } = run('<businessLease period="month">3,500</businessLease>');
    expect(result.rent).toEqual({ amount: 3500, period: "month" });
    expect(diagnostics).toEqual([]);
  });

  it("falls back to a rent child", () => {
    expect(run('<rent period="week">800</rent>').result.rent).toEqual({
      amount: 800,
      period: "week",
    });
  });

  it("prefers businessLease over rent", () => {
    const { result } = run("<rent>1</rent><businessLease>2</businessLease>");
    expect(result.rent).toEqual({ amount: 2, period: "annual" });
  });

  it("uses the first of several rent elements", () => {
    const { result } = run('<rent period="week">10</rent><rent period="month">20</rent>');
    expect(result.rent).toEqual({ amount: 10, period: "week" });
  });

  it.each([
    ["annually", "annual"],
    ["pa", "annual"],
    ["Monthly", "month"],
    ["WEEKLY", "week"],
    ["decade", "annual"],
  ] as const)("maps period %s to %s", (period, expected) => {
    expect(run(`<rent period="${period}">1</rent>`).result.rent?.period).toBe(expected);
  });

  it("withholds a hidden amount without leaking it", () => {
    const { result, diagnostics } = run(
      `<businessLease display="no" period="month">${HIDDEN}</businessLease>`,
    );
    expect(result.rent).toEqual({ amount: null, period: "month" });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "hidden-price-withheld",
        message: expect.stringContaining("businessLease"),
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(HIDDEN);
    expect(JSON.stringify(diagnostics)).not.toContain(HIDDEN);
  });

  it("returns a hidden amount when includeHiddenPrices is set", () => {
    const { result, diagnostics } = run(
      `<businessLease display="no" period="month">${HIDDEN}</businessLease>`,
      true,
    );
    expect(result.rent).toEqual({ amount: 987654, period: "month" });
    expect(diagnostics).toEqual([]);
  });

  it("still withholds a hidden amount when includeHiddenPrices is false", () => {
    const { result } = run(`<businessLease display="no">${HIDDEN}</businessLease>`, false);
    expect(result.rent).toEqual({ amount: null, period: "annual" });
  });

  it("gives a null amount and the default period for an empty businessLease", () => {
    const { result, diagnostics } = run("<businessLease/>");
    expect(result.rent).toEqual({ amount: null, period: "annual" });
    expect(diagnostics).toEqual([]);
  });

  it("does not echo unparseable rent text into the diagnostic", () => {
    const { diagnostics } = run("<businessLease>secret-text-SENTINEL</businessLease>");
    expect(diagnostics).toEqual([expect.objectContaining({ code: "unparseable-number" })]);
    expect(JSON.stringify(diagnostics)).not.toContain("SENTINEL");
  });

  it("gives a null amount and a diagnostic for text that is not a number", () => {
    const { result, diagnostics } = run("<rent>negotiable</rent>");
    expect(result.rent).toEqual({ amount: null, period: "annual" });
    expect(diagnostics).toEqual([expect.objectContaining({ code: "unparseable-number" })]);
  });
});

describe("parseBusiness full listing", () => {
  it("reads every field at once", () => {
    const { result, diagnostics } = run(`
      <businessCategory><name>Food</name><businessSubCategory><name>Cafe</name></businessSubCategory></businessCategory>
      <takings>$9,000 per week</takings>
      <franchise value="yes"/>
      <terms>Lease to 2031</terms>
      <businessLease period="annual">60000</businessLease>`);
    expect(result).toEqual({
      categories: ["Food", "Cafe"],
      takings: "$9,000 per week",
      franchise: true,
      terms: "Lease to 2031",
      rent: { amount: 60000, period: "annual" },
    });
    expect(diagnostics).toEqual([]);
  });
});
