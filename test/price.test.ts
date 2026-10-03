import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parsePrice, parseRent, parseSold } from "../src/normalise/price.js";
import { parseXml } from "../src/xml.js";

const HIDDEN = "987654";

function listing(inner: string) {
  const root = parseXml(`<residential>${inner}</residential>`);
  if (root === null) throw new Error("test xml has no root");
  return root;
}

function price(inner: string, includeHiddenPrices = false) {
  const c = new Collector({ tolerant: true });
  const result = parsePrice(listing(inner), c, { includeHiddenPrices });
  return { result, diagnostics: c.all };
}

function rent(inner: string, includeHiddenPrices = false) {
  const c = new Collector({ tolerant: true });
  const result = parseRent(listing(inner), c, { includeHiddenPrices });
  return { result, diagnostics: c.all };
}

function sold(inner: string, includeHiddenPrices = false, timeZone?: string) {
  const c = new Collector({ tolerant: true });
  const opts = timeZone === undefined ? { includeHiddenPrices } : { includeHiddenPrices, timeZone };
  const result = parseSold(listing(inner), c, opts);
  return { result, diagnostics: c.all };
}

/** Asserts that neither the result nor any diagnostic message carries the amount. */
function expectNoLeak({
  result,
  diagnostics,
}: {
  result: unknown;
  diagnostics: { message: string }[];
}) {
  expect(JSON.stringify(result)).not.toContain(HIDDEN);
  for (const d of diagnostics) expect(d.message).not.toContain(HIDDEN);
}

describe("parsePrice shown prices", () => {
  it("returns null when there is no price and no priceView", () => {
    const { result, diagnostics } = price("<headline>Nothing</headline>");
    expect(result).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("parses a plain amount", () => {
    const { result, diagnostics } = price('<price display="yes">500000</price>');
    expect(result).toEqual({
      amount: 500000,
      hidden: false,
      view: null,
      range: null,
      tax: "unknown",
    });
    expect(diagnostics).toEqual([]);
  });

  it("parses dollar signs and commas", () => {
    expect(price("<price>$1,250,000</price>").result?.amount).toBe(1250000);
    expect(price("<price> $ 450,000.50 </price>").result?.amount).toBe(450000.5);
  });

  it("treats an absent display attribute as shown", () => {
    const { result } = price("<price>500000</price>");
    expect(result?.hidden).toBe(false);
    expect(result?.amount).toBe(500000);
  });

  it.each([["yes"], ["YES"], ["maybe"], [""], ["1"]])("treats display=%j as shown", (value) => {
    const { result, diagnostics } = price(`<price display="${value}">500000</price>`);
    expect(result?.hidden).toBe(false);
    expect(result?.amount).toBe(500000);
    expect(diagnostics).toEqual([]);
  });

  it("returns the amount null with no diagnostic for an empty price element", () => {
    const { result, diagnostics } = price('<price display="yes"></price>');
    expect(result?.amount).toBeNull();
    expect(diagnostics).toEqual([]);
  });
});

describe("parsePrice view", () => {
  it("takes the view from priceView", () => {
    const { result } = price("<price>500000</price><priceView>Offers over $500,000</priceView>");
    expect(result?.view).toBe("Offers over $500,000");
    expect(result?.amount).toBe(500000);
  });

  it("returns an amount-less price for a priceView with no price element", () => {
    const { result, diagnostics } = price("<priceView>Contact agent</priceView>");
    expect(result).toEqual({
      amount: null,
      hidden: false,
      view: "Contact agent",
      range: null,
      tax: "unknown",
    });
    expect(diagnostics).toEqual([]);
  });

  it("keeps the view when the price is hidden", () => {
    const { result } = price(
      `<price display="no">${HIDDEN}</price><priceView>Contact agent</priceView>`,
    );
    expect(result?.view).toBe("Contact agent");
    expect(result?.hidden).toBe(true);
    expect(result?.amount).toBeNull();
  });

  it("ignores an empty priceView", () => {
    expect(price("<priceView>  </priceView>").result).toBeNull();
    expect(price("<price>5</price><priceView/>").result?.view).toBeNull();
  });
});

describe("parsePrice hidden prices", () => {
  it("withholds the amount and adds hidden-price-withheld", () => {
    const out = price(`<price display="no">${HIDDEN}</price>`);
    expect(out.result).toEqual({
      amount: null,
      hidden: true,
      view: null,
      range: null,
      tax: "unknown",
    });
    expect(out.diagnostics.map((d) => d.code)).toEqual(["hidden-price-withheld"]);
    expect(out.diagnostics[0]?.path).toBe("residential/price");
    expect(out.diagnostics[0]?.message).toContain("price");
    expectNoLeak(out);
  });

  it("matches display=no case-insensitively", () => {
    const out = price(`<price display=" NO ">${HIDDEN}</price>`);
    expect(out.result?.hidden).toBe(true);
    expect(out.result?.amount).toBeNull();
    expectNoLeak(out);
  });

  it("withholds a hidden price that carries a dollar sign and commas", () => {
    const out = price('<price display="no">$987,654</price>');
    expect(out.result?.amount).toBeNull();
    expect(JSON.stringify(out.result)).not.toContain("987");
    for (const d of out.diagnostics) expect(d.message).not.toContain("987");
  });

  it("includes the amount with hidden true and no diagnostic when includeHiddenPrices is set", () => {
    const { result, diagnostics } = price(`<price display="no">${HIDDEN}</price>`, true);
    expect(result).toEqual({
      amount: 987654,
      hidden: true,
      view: null,
      range: null,
      tax: "unknown",
    });
    expect(diagnostics).toEqual([]);
  });

  it("does not leak the raw text of a hidden price that is not numeric", () => {
    const out = price(`<price display="no">Call ${HIDDEN}</price>`);
    expect(out.result?.amount).toBeNull();
    expectNoLeak(out);
  });

  it("does not leak the raw text of a hidden non-numeric price when hidden prices are included", () => {
    const out = price(`<price display="no">Call ${HIDDEN}</price>`, true);
    expect(out.result?.amount).toBeNull();
    expect(out.diagnostics.map((d) => d.code)).toEqual(["unparseable-number"]);
    expectNoLeak(out);
  });
});

describe("parsePrice range", () => {
  it("returns the range for display=range", () => {
    const { result, diagnostics } = price(
      '<price display="range" range="400000-450000">425000</price>',
    );
    expect(result?.range).toEqual({ min: 400000, max: 450000 });
    expect(result?.hidden).toBe(false);
    expect(diagnostics).toEqual([]);
  });

  it("returns the range even when includeHiddenPrices is false", () => {
    const out = price('<price display="range" range="400000-450000"/>', false);
    expect(out.result?.range).toEqual({ min: 400000, max: 450000 });
    expect(out.result?.hidden).toBe(false);
    expect(out.diagnostics).toEqual([]);
  });

  it("matches display=range case-insensitively", () => {
    expect(price('<price display="RANGE" range="1-2"/>').result?.range).toEqual({ min: 1, max: 2 });
  });

  it("accepts dollar signs, commas and spaces in the range", () => {
    const { result } = price('<price display="range" range="$400,000 - $450,000"/>');
    expect(result?.range).toEqual({ min: 400000, max: 450000 });
  });

  it("accepts decimals in the range", () => {
    const { result } = price('<price display="range" range="400000.50-450000.75"/>');
    expect(result?.range).toEqual({ min: 400000.5, max: 450000.75 });
  });

  it.each([
    ["400000"],
    ["400000-"],
    ["-450000"],
    ["abc-def"],
    ["1-2-3"],
    ["400000 to 450000"],
    [""],
  ])("gives a null range for the malformed range %j", (value) => {
    const { result } = price(`<price display="range" range="${value}"/>`);
    expect(result?.range).toBeNull();
    expect(result?.hidden).toBe(false);
  });

  it("gives a null range when display=range has no range attribute", () => {
    expect(price('<price display="range">500000</price>').result?.range).toBeNull();
  });

  it("ignores a range attribute when display is not range", () => {
    expect(price('<price display="yes" range="1-2">500000</price>').result?.range).toBeNull();
  });
});

describe("parsePrice unparseable", () => {
  it("gives amount null and unparseable-number naming the element only", () => {
    const { result, diagnostics } = price("<price>Contact agent</price>");
    expect(result?.amount).toBeNull();
    expect(result?.hidden).toBe(false);
    expect(diagnostics.map((d) => d.code)).toEqual(["unparseable-number"]);
    expect(diagnostics[0]?.path).toBe("residential/price");
    expect(diagnostics[0]?.message).toContain("price");
    expect(diagnostics[0]?.message).not.toContain("Contact");
  });

  it("does not echo a number embedded in unparseable text", () => {
    const out = price(`<price>From ${HIDDEN} up</price>`);
    expect(out.result?.amount).toBeNull();
    expectNoLeak(out);
  });
});

describe("parsePrice tax", () => {
  it.each([
    ["inclusive", "inclusive"],
    ["exclusive", "exclusive"],
    ["exempt", "exempt"],
    ["Inclusive", "inclusive"],
    ["EXEMPT", "exempt"],
    ["other", "unknown"],
    ["", "unknown"],
  ])("tax=%j maps to %j", (value, expected) => {
    expect(price(`<price tax="${value}">500000</price>`).result?.tax).toBe(expected);
  });

  it("maps an absent tax attribute to unknown", () => {
    expect(price("<price>500000</price>").result?.tax).toBe("unknown");
  });
});

describe("parseRent", () => {
  it("returns null when there is no rent element", () => {
    const { result, diagnostics } = rent("<price>500000</price>");
    expect(result).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("returns null for a priceView with no rent element", () => {
    expect(rent("<priceView>Contact agent</priceView>").result).toBeNull();
  });

  it("parses a weekly rent", () => {
    const { result, diagnostics } = rent('<rent period="weekly">$650</rent>');
    expect(result).toEqual({ amount: 650, period: "week", hidden: false, view: null });
    expect(diagnostics).toEqual([]);
  });

  it.each([
    ["week", "week"],
    ["weekly", "week"],
    ["Weekly", "week"],
    ["month", "month"],
    ["monthly", "month"],
    ["MONTHLY", "month"],
    ["year", "year"],
    ["yearly", "year"],
    ["annual", "year"],
    ["annually", "year"],
    ["Annually", "year"],
    ["fortnight", "week"],
    ["", "week"],
  ])("period %j maps to %j", (value, expected) => {
    expect(rent(`<rent period="${value}">1000</rent>`).result?.period).toBe(expected);
  });

  it("maps an absent period to week", () => {
    expect(rent("<rent>650</rent>").result?.period).toBe("week");
  });

  it("prefers the weekly rent when weekly and monthly are both present", () => {
    const { result } = rent('<rent period="monthly">2800</rent><rent period="weekly">650</rent>');
    expect(result).toEqual({ amount: 650, period: "week", hidden: false, view: null });
  });

  it("prefers the first weekly rent when several are weekly", () => {
    const { result } = rent('<rent period="week">650</rent><rent period="weekly">700</rent>');
    expect(result?.amount).toBe(650);
  });

  it("falls back to the first rent when none is weekly", () => {
    const { result } = rent('<rent period="yearly">33800</rent><rent period="monthly">2800</rent>');
    expect(result).toEqual({ amount: 33800, period: "year", hidden: false, view: null });
  });

  it("takes the view from priceView", () => {
    const { result } = rent('<rent period="weekly">650</rent><priceView>$650 per week</priceView>');
    expect(result?.view).toBe("$650 per week");
  });

  it("gives amount null and unparseable-number for non-numeric text", () => {
    const { result, diagnostics } = rent('<rent period="weekly">Enquire</rent>');
    expect(result?.amount).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(["unparseable-number"]);
    expect(diagnostics[0]?.message).toContain("rent");
    expect(diagnostics[0]?.message).not.toContain("Enquire");
  });

  it("withholds a hidden rent", () => {
    const out = rent(`<rent period="weekly" display="no">${HIDDEN}</rent>`);
    expect(out.result).toEqual({ amount: null, period: "week", hidden: true, view: null });
    expect(out.diagnostics.map((d) => d.code)).toEqual(["hidden-price-withheld"]);
    expect(out.diagnostics[0]?.message).toContain("rent");
    expect(out.diagnostics[0]?.path).toBe("residential/rent");
    expectNoLeak(out);
  });

  it("includes a hidden rent when includeHiddenPrices is set", () => {
    const { result, diagnostics } = rent(
      `<rent period="monthly" display="no">${HIDDEN}</rent>`,
      true,
    );
    expect(result).toEqual({ amount: 987654, period: "month", hidden: true, view: null });
    expect(diagnostics).toEqual([]);
  });

  it("withholds only the hidden element and keeps the chosen weekly rent separate", () => {
    const out = rent(
      `<rent period="monthly" display="no">${HIDDEN}</rent><rent period="weekly">650</rent>`,
    );
    expect(out.result).toEqual({ amount: 650, period: "week", hidden: false, view: null });
    expect(out.diagnostics).toEqual([]);
    expectNoLeak(out);
  });
});

describe("parseSold", () => {
  it("returns null when there is no soldDetails element", () => {
    const { result, diagnostics } = sold("<price>500000</price>");
    expect(result).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("reads soldPrice and soldDate", () => {
    const { result, diagnostics } = sold(`
      <soldDetails>
        <soldPrice display="yes">$750,000</soldPrice>
        <soldDate>2026-03-04</soldDate>
      </soldDetails>`);
    expect(result).toEqual({ price: 750000, priceHidden: false, date: "2026-03-04" });
    expect(diagnostics).toEqual([]);
  });

  it("reads the price and date element name variants", () => {
    const { result, diagnostics } = sold(`
      <soldDetails>
        <price>750000</price>
        <date>2026-03-04-10:15:00</date>
      </soldDetails>`);
    expect(result).toEqual({ price: 750000, priceHidden: false, date: "2026-03-04T10:15:00" });
    expect(diagnostics).toEqual([]);
  });

  it("prefers soldPrice over price", () => {
    const { result } = sold(`
      <soldDetails><price>1</price><soldPrice>750000</soldPrice></soldDetails>`);
    expect(result?.price).toBe(750000);
  });

  it("converts the sold date with a time zone", () => {
    const { result } = sold(
      "<soldDetails><soldDate>2026-01-14-12:30:00</soldDate></soldDetails>",
      false,
      "Australia/Perth",
    );
    expect(result?.date).toBe("2026-01-14T04:30:00Z");
  });

  it("returns empty fields for an empty soldDetails", () => {
    const { result, diagnostics } = sold("<soldDetails/>");
    expect(result).toEqual({ price: null, priceHidden: false, date: null });
    expect(diagnostics).toEqual([]);
  });

  it("gives a null date and invalid-date for an invalid sold date", () => {
    const { result, diagnostics } = sold(`
      <soldDetails><soldPrice>750000</soldPrice><soldDate>2026-02-30</soldDate></soldDetails>`);
    expect(result).toEqual({ price: 750000, priceHidden: false, date: null });
    expect(diagnostics.map((d) => d.code)).toEqual(["invalid-date"]);
    expect(diagnostics[0]?.path).toBe("residential/soldDetails/soldDate");
  });

  it("gives a null price and unparseable-number for a non-numeric sold price", () => {
    const { result, diagnostics } = sold(
      "<soldDetails><soldPrice>Undisclosed</soldPrice></soldDetails>",
    );
    expect(result?.price).toBeNull();
    expect(result?.priceHidden).toBe(false);
    expect(diagnostics.map((d) => d.code)).toEqual(["unparseable-number"]);
    expect(diagnostics[0]?.message).toContain("soldPrice");
    expect(diagnostics[0]?.message).not.toContain("Undisclosed");
  });

  it.each([["soldPrice"], ["price"]])("withholds a hidden %s", (name) => {
    const out = sold(
      `<soldDetails><${name} display="no">${HIDDEN}</${name}><soldDate>2026-03-04</soldDate></soldDetails>`,
    );
    expect(out.result).toEqual({ price: null, priceHidden: true, date: "2026-03-04" });
    expect(out.diagnostics.map((d) => d.code)).toEqual(["hidden-price-withheld"]);
    expect(out.diagnostics[0]?.message).toContain(name);
    expectNoLeak(out);
  });

  it("includes a hidden sold price when includeHiddenPrices is set", () => {
    const { result, diagnostics } = sold(
      `<soldDetails><soldPrice display="no">${HIDDEN}</soldPrice></soldDetails>`,
      true,
    );
    expect(result).toEqual({ price: 987654, priceHidden: true, date: null });
    expect(diagnostics).toEqual([]);
  });
});
