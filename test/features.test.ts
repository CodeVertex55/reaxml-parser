import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parseFeatures } from "../src/normalise/features.js";
import { parseXml } from "../src/xml.js";

function run(inner: string) {
  const root = parseXml(`<residential>${inner}</residential>`);
  if (root === null) throw new Error("test xml has no root");
  const c = new Collector({ tolerant: true });
  return { result: parseFeatures(root, c), diagnostics: c.all };
}

const EMPTY = {
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

describe("parseFeatures", () => {
  it("returns all null and no flags when there is no features element", () => {
    const { result, diagnostics } = run("<headline>Sample</headline>");
    expect(result).toEqual(EMPTY);
    expect(diagnostics).toEqual([]);
  });

  it("returns all null for an empty features element", () => {
    expect(run("<features/>").result).toEqual(EMPTY);
  });

  it("reads every numeric feature", () => {
    const { result, diagnostics } = run(`
      <features>
        <bedrooms>4</bedrooms>
        <bathrooms>2</bathrooms>
        <ensuite>1</ensuite>
        <garages>2</garages>
        <carports>1</carports>
        <openSpaces>3</openSpaces>
        <toilets>2</toilets>
        <livingAreas>2</livingAreas>
        <otherFeatures>Solar panels and a water tank</otherFeatures>
      </features>`);
    expect(result).toEqual({
      bedrooms: 4,
      bathrooms: 2,
      ensuites: 1,
      garages: 2,
      carports: 1,
      openSpaces: 3,
      toilets: 2,
      livingAreas: 2,
      flags: [],
      other: "Solar panels and a water tank",
    });
    expect(diagnostics).toEqual([]);
  });

  it("accepts the plural ensuites element", () => {
    expect(run("<features><ensuites>2</ensuites></features>").result.ensuites).toBe(2);
  });

  it("falls back to ensuites when ensuite is empty", () => {
    expect(run("<features><ensuite/><ensuites>2</ensuites></features>").result.ensuites).toBe(2);
  });

  it("keeps ensuite and ensuites out of the flags", () => {
    const { result } = run("<features><ensuite>1</ensuite><ensuites>1</ensuites></features>");
    expect(result.flags).toEqual([]);
  });

  it.each([["studio"], ["Studio"], ["STUDIO"], ["  studio  "]])(
    "maps bedrooms %j to 0 with no diagnostic",
    (value) => {
      const { result, diagnostics } = run(`<features><bedrooms>${value}</bedrooms></features>`);
      expect(result.bedrooms).toBe(0);
      expect(diagnostics).toEqual([]);
    },
  );

  it("does not treat studio as a number for other fields", () => {
    const { result, diagnostics } = run("<features><bathrooms>studio</bathrooms></features>");
    expect(result.bathrooms).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(["unparseable-number"]);
  });

  it("gives null and unparseable-number naming the element for non-numeric text", () => {
    const { result, diagnostics } = run(
      "<features><bedrooms>many</bedrooms><garages>2</garages></features>",
    );
    expect(result.bedrooms).toBeNull();
    expect(result.garages).toBe(2);
    expect(diagnostics.map((d) => d.code)).toEqual(["unparseable-number"]);
    expect(diagnostics[0]?.message).toContain("bedrooms");
    expect(diagnostics[0]?.message).not.toContain("many");
    expect(diagnostics[0]?.path).toBe("residential/features/bedrooms");
  });

  it("keeps the integer part of a decimal count", () => {
    expect(run("<features><bathrooms>2.0</bathrooms></features>").result.bathrooms).toBe(2);
  });

  it("returns null with no diagnostic for an empty numeric element", () => {
    const { result, diagnostics } = run(
      "<features><bedrooms/><bathrooms>  </bathrooms></features>",
    );
    expect(result.bedrooms).toBeNull();
    expect(result.bathrooms).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("lists true flags in document order exactly as written", () => {
    const { result } = run(`
      <features>
        <pool>yes</pool>
        <bedrooms>3</bedrooms>
        <airConditioning>1</airConditioning>
        <alarmSystem>true</alarmSystem>
        <balcony>YES</balcony>
      </features>`);
    expect(result.flags).toEqual(["pool", "airConditioning", "alarmSystem", "balcony"]);
  });

  it("leaves out flags that are not yes", () => {
    const { result, diagnostics } = run(`
      <features>
        <pool>no</pool>
        <deck>0</deck>
        <spa>false</spa>
        <study></study>
        <fireplace>maybe</fireplace>
        <gym>yes</gym>
      </features>`);
    expect(result.flags).toEqual(["gym"]);
    expect(diagnostics).toEqual([]);
  });

  it("deduplicates repeated flags, keeping the first position", () => {
    const { result } = run(
      "<features><pool>yes</pool><deck>yes</deck><pool>true</pool></features>",
    );
    expect(result.flags).toEqual(["pool", "deck"]);
  });

  it("keeps element names case-sensitive in the flags", () => {
    const { result } = run("<features><Pool>yes</Pool><pool>yes</pool></features>");
    expect(result.flags).toEqual(["Pool", "pool"]);
  });

  it("never lists the numeric names or otherFeatures as flags", () => {
    const { result } = run(`
      <features>
        <bedrooms>yes</bedrooms>
        <bathrooms>1</bathrooms>
        <garages>true</garages>
        <otherFeatures>yes</otherFeatures>
        <pool>yes</pool>
      </features>`);
    expect(result.flags).toEqual(["pool"]);
    expect(result.other).toBe("yes");
  });

  it("trims otherFeatures and treats an empty one as null", () => {
    const padded = run("<features><otherFeatures>  Bore water  </otherFeatures></features>");
    expect(padded.result.other).toBe("Bore water");
    expect(run("<features><otherFeatures/></features>").result.other).toBeNull();
  });

  it("copes with element names that match Object.prototype members", () => {
    // The XML layer renames such elements, so only the shape of the result is checked here.
    const { result } = run("<features><valueOf>yes</valueOf><toString>yes</toString></features>");
    expect(result.flags).toHaveLength(2);
    expect(result.bedrooms).toBeNull();
  });
});
