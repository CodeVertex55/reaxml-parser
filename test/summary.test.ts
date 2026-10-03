import { describe, expect, it } from "vitest";
import { parseReaxml, summarise } from "../src/index.js";
import type { ParseResult } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("summarise", () => {
  it("counts the mixed feed by kind and status with no diagnostics", () => {
    const summary = summarise(parseReaxml(fixture("mixed")));
    expect(summary).toEqual({
      listings: 12,
      byKind: {
        residential: 2,
        rental: 2,
        land: 2,
        rural: 1,
        commercial: 2,
        commercialLand: 1,
        business: 1,
        holidayRental: 1,
      },
      byStatus: { current: 7, sold: 2, leased: 1, withdrawn: 1, offmarket: 1 },
      diagnostics: { error: 0, warning: 0, info: 0, byCode: {} },
    });
  });

  it("lists kinds and statuses in their declared order, not first-seen order", () => {
    const summary = summarise(parseReaxml(fixture("mixed")));
    expect(Object.keys(summary.byKind)).toEqual([
      "residential",
      "rental",
      "land",
      "rural",
      "commercial",
      "commercialLand",
      "business",
      "holidayRental",
    ]);
    expect(Object.keys(summary.byStatus)).toEqual([
      "current",
      "sold",
      "leased",
      "withdrawn",
      "offmarket",
    ]);
  });

  it("counts diagnostics by severity and by code, with codes in alphabetical order", () => {
    const summary = summarise(parseReaxml(fixture("image-placeholders")));
    expect(summary.listings).toBe(1);
    expect(summary.diagnostics.error).toBe(0);
    expect(summary.diagnostics.warning).toBe(1);
    expect(summary.diagnostics.info).toBe(2);
    expect(summary.diagnostics.byCode).toEqual({
      "empty-media-placeholder": 2,
      "media-without-url": 1,
    });
    expect(Object.keys(summary.diagnostics.byCode)).toEqual([
      "empty-media-placeholder",
      "media-without-url",
    ]);
  });

  it("counts error-severity diagnostics", () => {
    const summary = summarise(parseReaxml(fixture("missing-identity")));
    expect(summary.listings).toBe(1);
    expect(summary.diagnostics).toEqual({
      error: 1,
      warning: 0,
      info: 0,
      byCode: { "missing-identity": 1 },
    });
  });

  it("summarises an empty result", () => {
    const empty: ParseResult = {
      meta: { generatedAt: null, listingCount: 0, hadCredentials: false },
      listings: [],
      warnings: [],
    };
    expect(summarise(empty)).toEqual({
      listings: 0,
      byKind: {},
      byStatus: {},
      diagnostics: { error: 0, warning: 0, info: 0, byCode: {} },
    });
  });

  it("does not mutate its input", () => {
    const result = parseReaxml(fixture("zero-dates"));
    const before = JSON.stringify(result);
    summarise(result);
    expect(JSON.stringify(result)).toBe(before);
  });
});
