import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parseMeasure } from "../src/normalise/measures.js";
import { parseXml } from "../src/xml.js";

function run(xml: string) {
  const root = parseXml(xml);
  if (root === null) throw new Error("test xml has no root");
  const c = new Collector({ tolerant: true });
  return { result: parseMeasure(root, c), diagnostics: c.all };
}

describe("parseMeasure unit aliases", () => {
  it.each([
    ["squareMeter", "squareMeter"],
    ["squareMetre", "squareMeter"],
    ["SquareMeter", "squareMeter"],
    ["sqm", "squareMeter"],
    ["SQM", "squareMeter"],
    ["m2", "squareMeter"],
    ["m²", "squareMeter"],
    ["M²", "squareMeter"],
    ["hectare", "hectare"],
    ["hectares", "hectare"],
    ["ha", "hectare"],
    ["HA", "hectare"],
    ["acre", "acre"],
    ["acres", "acre"],
    ["Acres", "acre"],
    ["square", "square"],
    ["squares", "square"],
    ["meter", "meter"],
    ["metre", "meter"],
    ["meters", "meter"],
    ["metres", "meter"],
    ["m", "meter"],
    ["M", "meter"],
    [" sqm ", "squareMeter"],
  ])("unit %j maps to %j", (unit, expected) => {
    const { result, diagnostics } = run(`<area unit="${unit}">450</area>`);
    expect(result).toEqual({ value: 450, unit: expected });
    expect(diagnostics).toEqual([]);
  });
});

describe("parseMeasure values", () => {
  it.each([
    ["<area unit='sqm'>450</area>", { value: 450, unit: "squareMeter" }],
    ["<area unit='ha'>1.5</area>", { value: 1.5, unit: "hectare" }],
    ["<area unit='sqm'>1,250.5</area>", { value: 1250.5, unit: "squareMeter" }],
    ["<area unit='sqm'> 450 </area>", { value: 450, unit: "squareMeter" }],
  ])("%s", (xml, expected) => {
    const { result, diagnostics } = run(xml);
    expect(result).toEqual(expected);
    expect(diagnostics).toEqual([]);
  });

  it("keeps a stated zero", () => {
    const { result, diagnostics } = run("<area unit='sqm'>0</area>");
    expect(result).toEqual({ value: 0, unit: "squareMeter" });
    expect(diagnostics).toEqual([]);
  });
});

describe("parseMeasure default units", () => {
  it.each([
    ["<area>450</area>", "squareMeter"],
    ["<frontage>20</frontage>", "meter"],
    ["<depth>40</depth>", "meter"],
    ["<area unit=''>450</area>", "squareMeter"],
    ["<frontage unit=' '>20</frontage>", "meter"],
  ])("%s defaults to %s", (xml, unit) => {
    const { result, diagnostics } = run(xml);
    expect(result?.unit).toBe(unit);
    expect(diagnostics).toEqual([]);
  });
});

describe("parseMeasure problems", () => {
  it("returns null with no diagnostic for a missing node", () => {
    const c = new Collector({ tolerant: true });
    expect(parseMeasure(undefined, c)).toBeNull();
    expect(c.all).toEqual([]);
  });

  it.each([
    ["<area unit='sqm'></area>"],
    ["<area unit='sqm'>   </area>"],
    ["<area unit='sqm'/>"],
    ["<area/>"],
  ])("%s gives empty-measure", (xml) => {
    const { result, diagnostics } = run(xml);
    expect(result).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(["empty-measure"]);
  });

  it.each([["<area unit='sqm'>abc</area>"], ["<area>1.2.3</area>"], ["<frontage>wide</frontage>"]])(
    "%s gives unparseable-number",
    (xml) => {
      const { result, diagnostics } = run(xml);
      expect(result).toBeNull();
      expect(diagnostics.map((d) => d.code)).toEqual(["unparseable-number"]);
    },
  );

  it("does not put the raw text in the unparseable-number detail", () => {
    const { diagnostics } = run("<area unit='sqm'>HIDDEN 123</area>");
    expect(diagnostics[0]?.message).toContain("area");
    expect(diagnostics[0]?.message).not.toContain("HIDDEN");
  });

  it.each([["furlong"], ["sqft"], ["constructor"], ["__proto__"]])(
    "unit %j gives unknown-unit",
    (unit) => {
      const { result, diagnostics } = run(`<area unit="${unit}">450</area>`);
      expect(result).toBeNull();
      expect(diagnostics.map((d) => d.code)).toEqual(["unknown-unit"]);
      expect(diagnostics[0]?.message).toContain(unit);
    },
  );

  it("reports diagnostics at the node path", () => {
    const root = parseXml("<land><area unit='furlong'>1</area></land>");
    const c = new Collector({ tolerant: true });
    parseMeasure(root?.children[0], c);
    expect(c.all[0]?.path).toBe("land/area");
  });
});
