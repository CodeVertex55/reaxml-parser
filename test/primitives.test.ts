import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { intField, numberField, parseNumber, yesNo } from "../src/normalise/primitives.js";
import { parseXml } from "../src/xml.js";

function node(xml: string) {
  const parsed = parseXml(xml);
  if (parsed === null) throw new Error("test xml has no root");
  return parsed;
}

describe("yesNo", () => {
  it.each([
    ["yes", true],
    ["Yes", true],
    ["YES", true],
    ["true", true],
    ["TRUE", true],
    ["1", true],
    [" yes ", true],
    ["no", false],
    ["No", false],
    ["false", false],
    ["0", false],
    ["", false],
    [null, false],
    ["maybe", false],
    ["2", false],
  ])("yesNo(%j) is %j", (input, expected) => {
    expect(yesNo(input)).toBe(expected);
  });
});

describe("parseNumber", () => {
  it.each([
    ["$1,250,000", 1250000],
    ["1,250,000.50", 1250000.5],
    [" 450 ", 450],
    ["450", 450],
    ["0", 0],
    ["-5", -5],
    ["-5.25", -5.25],
    ["$ 450", 450],
    ["$450.5", 450.5],
    ["2.0", 2],
    ["0.5", 0.5],
    [".5", 0.5],
    ["POA", null],
    ["12abc", null],
    ["1.2.3", null],
    ["  ", null],
    ["", null],
    [null, null],
    ["-", null],
    ["$", null],
    [",", null],
    ["1e5", null],
    ["Infinity", null],
    ["NaN", null],
    ["12 34", null],
    ["--5", null],
    ["5-", null],
  ])("parseNumber(%j) is %j", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe("numberField", () => {
  it.each([
    ["<price>$1,250,000</price>", 1250000, []],
    ["<price> 450 </price>", 450, []],
    ["<price>POA</price>", null, ["unparseable-number"]],
    ["<price></price>", null, []],
    ["<price>   </price>", null, []],
    ["<price>12abc</price>", null, ["unparseable-number"]],
  ])("numberField(%s) is %j with codes %j", (xml, expected, codes) => {
    const c = new Collector({ tolerant: true });
    expect(numberField(node(xml), c)).toBe(expected);
    expect(c.all.map((d) => d.code)).toEqual(codes);
  });

  it("returns null with no diagnostic for a missing node", () => {
    const c = new Collector({ tolerant: true });
    expect(numberField(undefined, c)).toBeNull();
    expect(c.all).toEqual([]);
  });

  it("reports the element name and path but never the raw value", () => {
    const c = new Collector({ tolerant: true });
    const root = node("<listing><price display='no'>SECRET 999</price></listing>");
    numberField(root.children[0], c);
    expect(c.all).toHaveLength(1);
    expect(c.all[0]?.path).toBe("listing/price");
    expect(c.all[0]?.message).toContain("price");
    expect(c.all[0]?.message).not.toContain("SECRET");
    expect(c.all[0]?.message).not.toContain("999");
  });
});

describe("intField", () => {
  it.each([
    ["<bedrooms>3</bedrooms>", 3, []],
    ["<bedrooms>2.0</bedrooms>", 2, []],
    ["<bedrooms>2.9</bedrooms>", 2, []],
    ["<bedrooms>-2.5</bedrooms>", -2, []],
    ["<bedrooms>1,200</bedrooms>", 1200, []],
    ["<bedrooms>many</bedrooms>", null, ["unparseable-number"]],
    ["<bedrooms></bedrooms>", null, []],
  ])("intField(%s) is %j with codes %j", (xml, expected, codes) => {
    const c = new Collector({ tolerant: true });
    expect(intField(node(xml), c)).toBe(expected);
    expect(c.all.map((d) => d.code)).toEqual(codes);
  });

  it("returns null with no diagnostic for a missing node", () => {
    const c = new Collector({ tolerant: true });
    expect(intField(undefined, c)).toBeNull();
    expect(c.all).toEqual([]);
  });
});
