import { describe, expect, it } from "vitest";
import { parseReaxml } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("tolerant mode never throws", () => {
  it.each(["malformed", "empty", "not-reaxml"])("for %s.xml", (name) => {
    const result = parseReaxml(fixture(name));
    expect(result.listings).toEqual([]);
    expect(result.meta.listingCount).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.severity).toBe("error");
  });

  it.each([
    "",
    " ",
    "not xml at all",
    "<",
    "<propertyList>",
    "<propertyList><residential></propertyList>",
    "<propertyList/><propertyList/>",
    "<a><b><c></a>",
    "\u0000",
    "<propertyList><__proto__/></propertyList>",
    "<propertyList>" + "<a>".repeat(5000) + "</propertyList>",
  ])("for %j", (input) => {
    expect(() => parseReaxml(input)).not.toThrow();
    const result = parseReaxml(input);
    expect(result.listings).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns a result with the documented shape", () => {
    const result = parseReaxml("<broken");
    expect(Object.keys(result).sort()).toEqual(["listings", "meta", "warnings"]);
    expect(result.meta).toEqual({ generatedAt: null, listingCount: 0, hadCredentials: false });
  });
});

describe("large feeds", () => {
  it("parses 3,000 listings (about 5 MB) in under 10 seconds", { timeout: 30_000 }, () => {
    const description = "Spacious family home close to shops, parks and transport. ".repeat(8);
    const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>\n<propertyList>'];
    for (let i = 1; i <= 3000; i++) {
      const id = `TEST${String(i).padStart(5, "0")}`;
      parts.push(
        `<residential modTime="2026-09-30-14:05:10" status="current">` +
          `<agentID>XNWTEST</agentID><uniqueID>${id}</uniqueID>` +
          `<authority value="exclusive"/><underOffer value="no"/>` +
          `<listingAgent id="1"><name>Alex Sample</name><telephone type="BH">0491 570 006</telephone>` +
          `<email>alex.sample@example.com</email></listingAgent>` +
          `<price display="yes">${600000 + i}</price><priceView>Offers over $600,000</priceView>` +
          `<address display="yes"><streetNumber>${i}</streetNumber><street>Example Street</street>` +
          `<suburb display="yes">Testville</suburb><state>WA</state><postcode>0001</postcode></address>` +
          `<category name="House"/><headline>Family home number ${i}</headline>` +
          `<description>${description}</description>` +
          `<features><bedrooms>3</bedrooms><bathrooms>2</bathrooms><garages>2</garages>` +
          `<airConditioning>yes</airConditioning></features>` +
          `<landDetails><area unit="squareMeter">650</area></landDetails>` +
          `<inspectionTimes><inspection>21-Dec-2026 11:00am to 11:30am</inspection></inspectionTimes>` +
          `<objects>` +
          [1, 2, 3, 4]
            .map(
              (n) =>
                `<img id="${n}" modTime="2026-09-01-09:00:00" url="https://img.example.com/${id}/${n}.jpg" format="jpg"/>`,
            )
            .join("") +
          `</objects></residential>`,
      );
    }
    parts.push("</propertyList>");
    const xml = parts.join("\n");
    expect(xml.length).toBeGreaterThan(4_500_000);

    const started = performance.now();
    const result = parseReaxml(xml, { timeZone: "Australia/Perth" });
    const seconds = (performance.now() - started) / 1000;

    expect(result.listings).toHaveLength(3000);
    expect(result.meta.listingCount).toBe(3000);
    expect(result.warnings).toEqual([]);
    expect(seconds).toBeLessThan(10);
    console.info(`parsed ${(xml.length / 1e6).toFixed(1)} MB in ${seconds.toFixed(2)} s`);
  });
});
