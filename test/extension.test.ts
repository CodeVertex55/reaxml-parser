import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parseExtension } from "../src/normalise/extension.js";
import { parseXml } from "../src/xml.js";

function run(inner: string) {
  const root = parseXml(`<residential>${inner}</residential>`);
  if (root === null) throw new Error("test xml has no root");
  const c = new Collector({ tolerant: true });
  return { result: parseExtension(root, c), diagnostics: c.all };
}

function fields(inner: string) {
  return run(`<extraFields>${inner}</extraFields>`);
}

describe("parseExtension shapes", () => {
  it("returns empty extra and null location when there is no extraFields element", () => {
    const { result, diagnostics } = run("<headline>Sample</headline>");
    expect(result).toEqual({ extra: {}, location: null });
    expect(diagnostics).toEqual([]);
  });

  it("returns empty extra for an empty extraFields element with no diagnostic", () => {
    const { result, diagnostics } = run("<extraFields/>");
    expect(result).toEqual({ extra: {}, location: null });
    expect(diagnostics).toEqual([]);
  });

  it("shape a: children named by key with text values", () => {
    const { result, diagnostics } = fields(
      "<virtualTourUrl>https://tour.example.com/1</virtualTourUrl><councilRates>1800</councilRates>",
    );
    expect(result.extra).toEqual({
      virtualTourUrl: "https://tour.example.com/1",
      councilRates: "1800",
    });
    expect(diagnostics.map((d) => d.code)).toEqual(["extension-fields-present"]);
    expect(diagnostics[0]?.path).toBe("residential/extraFields");
  });

  it("shape b: extraField children with a name and a text value", () => {
    const { result } = fields(
      '<extraField name="councilRates">1800</extraField><extraField name="zoning">R2</extraField>',
    );
    expect(result.extra).toEqual({ councilRates: "1800", zoning: "R2" });
  });

  it("shape b: field children with a name and a value attribute", () => {
    const { result } = fields(
      '<field name="councilRates" value="1800"/><field name="zoning" value="R2"/>',
    );
    expect(result.extra).toEqual({ councilRates: "1800", zoning: "R2" });
  });

  it("shape b: a value attribute wins over text", () => {
    const { result } = fields('<extraField name="a" value="from-attr">from-text</extraField>');
    expect(result.extra).toEqual({ a: "from-attr" });
  });

  it("shape b: falls back to text when the value attribute is empty", () => {
    const { result } = fields('<extraField name="a" value="">from-text</extraField>');
    expect(result.extra).toEqual({ a: "from-text" });
  });

  it("merges mixed shapes", () => {
    const { result, diagnostics } = fields(`
      <virtualTourUrl>https://tour.example.com/1</virtualTourUrl>
      <extraField name="councilRates">1800</extraField>
      <field name="zoning" value="R2"/>`);
    expect(result.extra).toEqual({
      virtualTourUrl: "https://tour.example.com/1",
      councilRates: "1800",
      zoning: "R2",
    });
    expect(diagnostics.map((d) => d.code)).toEqual(["extension-fields-present"]);
  });

  it("lets later duplicates win across shapes", () => {
    const { result } = fields(`
      <zoning>R1</zoning>
      <extraField name="zoning">R2</extraField>
      <field name="zoning" value="R3"/>
      <zoning>R4</zoning>`);
    expect(result.extra).toEqual({ zoning: "R4" });
  });

  it("treats a field element with no name as a plain key", () => {
    const { result } = fields("<field>orphan</field>");
    expect(result.extra).toEqual({ field: "orphan" });
  });

  it("skips a shape b element whose name is blank", () => {
    const { result } = fields('<extraField name="  ">x</extraField><extraField>y</extraField>');
    expect(result.extra).toEqual({ extraField: "y" });
  });

  it("keeps keys verbatim and trims values", () => {
    const { result } = fields("<MixedCaseKey>  padded value \n</MixedCaseKey>");
    expect(result.extra).toEqual({ MixedCaseKey: "padded value" });
  });

  it("drops empty values", () => {
    const { result, diagnostics } = fields(
      '<a/><b>   </b><extraField name="c"/><field name="d" value="  "/><e>kept</e>',
    );
    expect(result.extra).toEqual({ e: "kept" });
    expect(diagnostics.map((d) => d.code)).toEqual(["extension-fields-present"]);
  });

  it("adds no diagnostic when every value is empty", () => {
    const { result, diagnostics } = fields("<a/><b> </b>");
    expect(result.extra).toEqual({});
    expect(diagnostics).toEqual([]);
  });

  it("adds extension-fields-present once for many fields", () => {
    const { diagnostics } = fields("<a>1</a><b>2</b><extraField name='c'>3</extraField>");
    expect(diagnostics.filter((d) => d.code === "extension-fields-present")).toHaveLength(1);
  });

  it("adds extension-fields-present once for several extraFields elements", () => {
    const { result, diagnostics } = run(
      "<extraFields><a>1</a></extraFields><extraFields><b>2</b></extraFields>",
    );
    expect(result.extra).toEqual({ a: "1", b: "2" });
    expect(diagnostics.filter((d) => d.code === "extension-fields-present")).toHaveLength(1);
  });

  it("returns a plain object", () => {
    const { result } = fields("<a>1</a>");
    expect(Object.getPrototypeOf(result.extra)).toBe(Object.prototype);
  });
});

describe("parseExtension prototype safety", () => {
  it("keeps a __proto__ key as an own data property without polluting anything", () => {
    const { result } = fields('<extraField name="__proto__">polluted</extraField>');
    expect(Object.hasOwn(result.extra, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(result.extra, "__proto__")?.value).toBe("polluted");
    expect(Object.getPrototypeOf(result.extra)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.keys(result.extra)).toEqual(["__proto__"]);
  });

  it("does not let a __proto__ value inject keys", () => {
    const { result } = fields(
      '<extraField name="__proto__">{"isAdmin":"yes"}</extraField><extraField name="a">1</extraField>',
    );
    expect((result.extra as Record<string, unknown>)["isAdmin"]).toBeUndefined();
    expect(({} as Record<string, unknown>)["isAdmin"]).toBeUndefined();
    expect(Object.keys(result.extra).sort()).toEqual(["__proto__", "a"]);
  });

  it("keeps constructor, toString and hasOwnProperty keys as data", () => {
    const { result } = fields(
      '<extraField name="constructor">c</extraField><field name="toString" value="t"/><extraField name="hasOwnProperty">h</extraField>',
    );
    expect(Object.hasOwn(result.extra, "constructor")).toBe(true);
    expect(result.extra["constructor"]).toBe("c");
    expect(result.extra["toString"]).toBe("t");
    expect(result.extra["hasOwnProperty"]).toBe("h");
    expect(Object.getPrototypeOf(result.extra)).toBe(Object.prototype);
  });

  it("lets a later duplicate of a prototype name win", () => {
    const { result } = fields(
      '<extraField name="toString">first</extraField><field name="toString" value="second"/>',
    );
    expect(result.extra["toString"]).toBe("second");
  });

  it("survives a JSON round trip", () => {
    const { result } = fields('<extraField name="__proto__">x</extraField>');
    const parsed: unknown = JSON.parse(JSON.stringify(result.extra));
    expect(Object.keys(parsed as object)).toEqual(["__proto__"]);
  });
});

describe("parseExtension coordinates", () => {
  it("reads geoLat and geoLong", () => {
    const { result, diagnostics } = fields(
      "<geoLat>-33.865143</geoLat><geoLong>151.2099</geoLong>",
    );
    expect(result.location).toEqual({ lat: -33.865143, lng: 151.2099 });
    expect(result.extra).toEqual({ geoLat: "-33.865143", geoLong: "151.2099" });
    expect(diagnostics.map((d) => d.code)).toEqual(["extension-fields-present"]);
  });

  it.each([
    ["latitude", "longitude"],
    ["lat", "lng"],
    ["lat", "lon"],
    ["lat", "long"],
    ["geoLat", "geoLng"],
    ["LATITUDE", "LONGITUDE"],
    ["GeoLat", "GeoLong"],
  ])("accepts the key pair %s and %s", (latKey, lngKey) => {
    const { result } = fields(`<${latKey}>-31.95</${latKey}><${lngKey}>115.86</${lngKey}>`);
    expect(result.location).toEqual({ lat: -31.95, lng: 115.86 });
  });

  it("reads coordinates from the name and value shapes", () => {
    const { result } = fields(
      '<extraField name="geoLat">-31.95</extraField><field name="geoLong" value="115.86"/>',
    );
    expect(result.location).toEqual({ lat: -31.95, lng: 115.86 });
  });

  it("prefers geoLat over latitude over lat", () => {
    const { result } = fields(
      "<lat>1</lat><latitude>2</latitude><geoLat>3</geoLat><lng>4</lng><longitude>5</longitude><geoLong>6</geoLong>",
    );
    expect(result.location).toEqual({ lat: 3, lng: 6 });
  });

  it("accepts the range limits", () => {
    expect(fields("<lat>90</lat><lng>180</lng>").result.location).toEqual({ lat: 90, lng: 180 });
    expect(fields("<lat>-90</lat><lng>-180</lng>").result.location).toEqual({
      lat: -90,
      lng: -180,
    });
  });

  it("accepts a zero on one axis", () => {
    expect(fields("<lat>0</lat><lng>115.86</lng>").result.location).toEqual({
      lat: 0,
      lng: 115.86,
    });
  });

  it("gives location null with no coordinate diagnostic when neither key is present", () => {
    const { result, diagnostics } = fields("<zoning>R2</zoning>");
    expect(result.location).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(["extension-fields-present"]);
  });

  it("rejects 0,0 as invalid", () => {
    const { result, diagnostics } = fields("<geoLat>0</geoLat><geoLong>0</geoLong>");
    expect(result.location).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual([
      "extension-fields-present",
      "invalid-coordinates",
    ]);
    expect(diagnostics[1]?.severity).toBe("warning");
    expect(diagnostics[1]?.path).toBe("residential/extraFields");
  });

  it("rejects 0.0,-0 as invalid", () => {
    const { result } = fields("<geoLat>0.0</geoLat><geoLong>-0</geoLong>");
    expect(result.location).toBeNull();
  });

  it.each([
    ["91", "10"],
    ["-91", "10"],
    ["10", "181"],
    ["10", "-181"],
    ["abc", "10"],
    ["10", "abc"],
    ["1e400", "10"],
    ["NaN", "10"],
    ["Infinity", "10"],
  ])("rejects lat %j, lng %j", (lat, lng) => {
    const { result, diagnostics } = fields(`<lat>${lat}</lat><lng>${lng}</lng>`);
    expect(result.location).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain("invalid-coordinates");
  });

  it("rejects a lone latitude or longitude", () => {
    for (const inner of ["<lat>-31.95</lat>", "<lng>115.86</lng>"]) {
      const { result, diagnostics } = fields(inner);
      expect(result.location).toBeNull();
      expect(diagnostics.map((d) => d.code)).toContain("invalid-coordinates");
    }
  });

  it("rejects when one coordinate key is present but empty", () => {
    const { result, diagnostics } = fields("<lat/><lng>115.86</lng>");
    expect(result.location).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual([
      "extension-fields-present",
      "invalid-coordinates",
    ]);
  });

  it("adds invalid-coordinates when only empty coordinate keys exist", () => {
    const { result, diagnostics } = fields("<lat/><lng/>");
    expect(result.location).toBeNull();
    expect(result.extra).toEqual({});
    expect(diagnostics.map((d) => d.code)).toEqual(["invalid-coordinates"]);
  });

  it("does not echo the raw coordinate text in the diagnostic", () => {
    const { diagnostics } = fields("<lat>not-a-number-xyz</lat><lng>10</lng>");
    for (const d of diagnostics) expect(d.message).not.toContain("xyz");
  });

  it("keeps the coordinate keys in extra even when the location is invalid", () => {
    const { result } = fields("<lat>999</lat><lng>10</lng>");
    expect(result.extra).toEqual({ lat: "999", lng: "10" });
  });
});
