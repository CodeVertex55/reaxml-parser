import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parseDate } from "../src/normalise/dates.js";

function run(value: string | null, timeZone?: string) {
  const c = new Collector({ tolerant: true });
  const result = parseDate(value, "listing/modTime", c, timeZone === undefined ? {} : { timeZone });
  return { result, diagnostics: c.all };
}

describe("parseDate accepted formats", () => {
  it.each([
    ["2026-01-14-12:30:45", "2026-01-14T12:30:45"],
    ["2026-01-14-12:30", "2026-01-14T12:30:00"],
    ["2026-01-14T12:30:45", "2026-01-14T12:30:45"],
    ["2026-01-14 12:30:45", "2026-01-14T12:30:45"],
    ["20260114-123045", "2026-01-14T12:30:45"],
    ["20260114123045", "2026-01-14T12:30:45"],
    ["2026-01-14", "2026-01-14"],
    ["20260114", "2026-01-14"],
    ["  2026-01-14  ", "2026-01-14"],
    ["2026-01-14-00:00:00", "2026-01-14T00:00:00"],
    ["2026-12-31-23:59:59", "2026-12-31T23:59:59"],
    ["2028-02-29", "2028-02-29"],
    ["2028-02-29-10:00:00", "2028-02-29T10:00:00"],
    ["2000-02-29", "2000-02-29"],
  ])("parses %j to %j", (input, expected) => {
    const { result, diagnostics } = run(input);
    expect(result).toBe(expected);
    expect(diagnostics).toEqual([]);
  });
});

describe("parseDate empty input", () => {
  it.each([[null], [""], ["   "]])("returns null with no diagnostic for %j", (input) => {
    const { result, diagnostics } = run(input);
    expect(result).toBeNull();
    expect(diagnostics).toEqual([]);
  });
});

describe("parseDate invalid input", () => {
  it.each([
    ["0000-00-00"],
    ["0000-00-00-00:00:00"],
    ["00000000"],
    ["2026-02-30"],
    ["2026-02-29"],
    ["1900-02-29"],
    ["2026-04-31"],
    ["2026-13-01"],
    ["2026-00-10"],
    ["2026-01-00"],
    ["0000-01-01"],
    ["garbage"],
    ["2026-01-01-25:00:00"],
    ["2026-01-01-24:00:00"],
    ["2026-01-01-12:60:00"],
    ["2026-01-01-12:00:60"],
    ["2026-1-1"],
    ["2026-01-14-12"],
    ["20260114-1230"],
    ["2026-01-14T12:30:45Z"],
  ])("rejects %j with an invalid-date diagnostic", (input) => {
    const { result, diagnostics } = run(input);
    expect(result).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(["invalid-date"]);
    expect(diagnostics[0]?.path).toBe("listing/modTime");
  });

  it("includes the raw value in the detail", () => {
    const { diagnostics } = run("garbage");
    expect(diagnostics[0]?.message).toContain("garbage");
  });

  it("truncates a long raw value to 40 characters", () => {
    const long = "x".repeat(100);
    const { diagnostics } = run(long);
    expect(diagnostics[0]?.message).toContain("x".repeat(40));
    expect(diagnostics[0]?.message).not.toContain("x".repeat(41));
  });
});

describe("parseDate with a time zone", () => {
  it.each([
    ["Australia/Perth", "2026-01-14-12:30:00", "2026-01-14T04:30:00Z"],
    ["Australia/Perth", "2026-01-14-12:30", "2026-01-14T04:30:00Z"],
    ["Australia/Sydney", "2026-01-14-12:30:00", "2026-01-14T01:30:00Z"],
    ["Australia/Sydney", "2026-07-14-12:30:00", "2026-07-14T02:30:00Z"],
    ["Australia/Sydney", "20260114123000", "2026-01-14T01:30:00Z"],
    ["Australia/Sydney", "2026-01-01-05:00:00", "2025-12-31T18:00:00Z"],
    ["America/New_York", "2026-07-04T12:00:00", "2026-07-04T16:00:00Z"],
    ["Asia/Kolkata", "2026-01-14T12:00:00", "2026-01-14T06:30:00Z"],
    ["UTC", "2026-01-14T12:00:00", "2026-01-14T12:00:00Z"],
  ])("%s: %j becomes %j", (zone, input, expected) => {
    const { result, diagnostics } = run(input, zone);
    expect(result).toBe(expected);
    expect(diagnostics).toEqual([]);
  });

  it.each([
    ["2026-01-14", "2026-01-14"],
    ["20260114", "2026-01-14"],
  ])("leaves date-only %j unchanged", (input, expected) => {
    const { result } = run(input, "Australia/Sydney");
    expect(result).toBe(expected);
  });

  it("still rejects invalid values under a zone", () => {
    const { result, diagnostics } = run("2026-02-30-10:00:00", "Australia/Sydney");
    expect(result).toBeNull();
    expect(diagnostics.map((d) => d.code)).toEqual(["invalid-date"]);
  });

  it("returns null with no diagnostic for empty input under a zone", () => {
    expect(run(null, "Australia/Sydney")).toEqual({ result: null, diagnostics: [] });
  });

  it("returns the earlier instant for a wall time skipped by spring forward", () => {
    // Sydney clocks go from 02:00 to 03:00 on Sunday 4 October 2026, so 02:30 never happens.
    // The two candidate instants are 15:30Z (at +11) and 16:30Z (at +10); the earlier wins.
    expect(run("2026-10-04T02:30:00", "Australia/Sydney").result).toBe("2026-10-03T15:30:00Z");
  });

  it("returns the earlier instant for an ambiguous wall time on fall back", () => {
    // Sydney clocks go from 03:00 back to 02:00 on Sunday 5 April 2026, so 02:30 happens twice:
    // at +11 (15:30Z) and again at +10 (16:30Z). The first occurrence wins.
    expect(run("2026-04-05T02:30:00", "Australia/Sydney").result).toBe("2026-04-04T15:30:00Z");
  });

  it("resolves wall times either side of the transitions normally", () => {
    expect(run("2026-10-04T01:59:00", "Australia/Sydney").result).toBe("2026-10-03T15:59:00Z");
    expect(run("2026-10-04T03:00:00", "Australia/Sydney").result).toBe("2026-10-03T16:00:00Z");
    expect(run("2026-04-05T01:59:00", "Australia/Sydney").result).toBe("2026-04-04T14:59:00Z");
    expect(run("2026-04-05T03:00:00", "Australia/Sydney").result).toBe("2026-04-04T17:00:00Z");
  });

  it("throws RangeError for an invalid zone", () => {
    expect(() => run("2026-01-14-12:30:00", "Not/AZone")).toThrow(RangeError);
  });

  it("throws RangeError for an invalid zone even when the input is date-only or empty", () => {
    expect(() => run("2026-01-14", "Not/AZone")).toThrow(RangeError);
    expect(() => run(null, "Not/AZone")).toThrow(RangeError);
  });
});
