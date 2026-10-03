import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parseInspections } from "../src/normalise/inspections.js";
import { parseXml } from "../src/xml.js";

function run(inner: string, timeZone?: string) {
  const root = parseXml(`<residential><inspectionTimes>${inner}</inspectionTimes></residential>`);
  if (root === null) throw new Error("test xml has no root");
  const c = new Collector({ tolerant: true });
  const result = parseInspections(root, c, timeZone === undefined ? {} : { timeZone });
  return { result, diagnostics: c.all };
}

function one(text: string, timeZone?: string) {
  return run(`<inspection>${text}</inspection>`, timeZone);
}

describe("parseInspections day-month-year pattern", () => {
  it("parses a start and end with minutes", () => {
    const { result, diagnostics } = one("17-Oct-2026 10:00am to 10:30am");
    expect(result).toEqual([
      {
        start: "2026-10-17T10:00:00",
        end: "2026-10-17T10:30:00",
        raw: "17-Oct-2026 10:00am to 10:30am",
      },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("parses times without minutes", () => {
    expect(one("17-Oct-2026 11am to 12pm").result).toMatchObject([
      { start: "2026-10-17T11:00:00", end: "2026-10-17T12:00:00" },
    ]);
  });

  it("parses a start only", () => {
    const { result, diagnostics } = one("17-Oct-2026 10:15am");
    expect(result).toEqual([
      { start: "2026-10-17T10:15:00", end: null, raw: "17-Oct-2026 10:15am" },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("parses a start only without minutes", () => {
    expect(one("17-Oct-2026 3pm").result).toMatchObject([
      { start: "2026-10-17T15:00:00", end: null },
    ]);
  });

  it("is case-insensitive and tolerates flexible whitespace", () => {
    const { result, diagnostics } = one("  17-OCT-2026    10:00 AM   TO   10:30 Am ");
    expect(result).toEqual([
      {
        start: "2026-10-17T10:00:00",
        end: "2026-10-17T10:30:00",
        raw: "17-OCT-2026    10:00 AM   TO   10:30 Am",
      },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("accepts a one digit day", () => {
    expect(one("5-nov-2026 9:05am").result).toMatchObject([{ start: "2026-11-05T09:05:00" }]);
  });

  it.each([
    ["Jan", "01"],
    ["Feb", "02"],
    ["Mar", "03"],
    ["Apr", "04"],
    ["May", "05"],
    ["Jun", "06"],
    ["Jul", "07"],
    ["Aug", "08"],
    ["Sep", "09"],
    ["Oct", "10"],
    ["Nov", "11"],
    ["Dec", "12"],
  ])("reads the month %s", (name, number) => {
    expect(one(`10-${name}-2026 9am`).result[0]?.start).toBe(`2026-${number}-10T09:00:00`);
  });

  it("reads 12:00pm as noon", () => {
    expect(one("17-Oct-2026 12:00pm to 1:00pm").result[0]).toMatchObject({
      start: "2026-10-17T12:00:00",
      end: "2026-10-17T13:00:00",
    });
  });

  it("reads 12:15am as 00:15", () => {
    expect(one("17-Oct-2026 12:15am to 1:15am").result[0]).toMatchObject({
      start: "2026-10-17T00:15:00",
      end: "2026-10-17T01:15:00",
    });
  });

  it("reads 12am as midnight and 12pm as noon", () => {
    expect(one("17-Oct-2026 12am").result[0]?.start).toBe("2026-10-17T00:00:00");
    expect(one("17-Oct-2026 12pm").result[0]?.start).toBe("2026-10-17T12:00:00");
  });

  it("reads 11:59pm as the last minute of the day", () => {
    expect(one("17-Oct-2026 11:59pm").result[0]?.start).toBe("2026-10-17T23:59:00");
  });

  it("rolls an end before the start to the next day", () => {
    const { result } = one("17-Oct-2026 11:30pm to 12:30am");
    expect(result[0]).toMatchObject({ start: "2026-10-17T23:30:00", end: "2026-10-18T00:30:00" });
  });

  it("rolls over a month and a year end", () => {
    expect(one("31-Dec-2026 11:30pm to 12:30am").result[0]).toMatchObject({
      start: "2026-12-31T23:30:00",
      end: "2027-01-01T00:30:00",
    });
    expect(one("28-Feb-2027 11:30pm to 12:30am").result[0]?.end).toBe("2027-03-01T00:30:00");
    expect(one("29-Feb-2028 11:30pm to 12:30am").result[0]?.end).toBe("2028-03-01T00:30:00");
  });

  it("keeps an end equal to the start on the same day", () => {
    expect(one("17-Oct-2026 10:00am to 10:00am").result[0]?.end).toBe("2026-10-17T10:00:00");
  });

  it("gives no end when a roll would pass the last supported year", () => {
    expect(one("31-Dec-9999 11:30pm to 12:30am").result[0]).toMatchObject({
      start: "9999-12-31T23:30:00",
      end: null,
    });
  });
});

describe("parseInspections ISO pattern", () => {
  it("parses a start and end", () => {
    const { result, diagnostics } = one("2026-10-17 10:00 to 10:30");
    expect(result).toEqual([
      {
        start: "2026-10-17T10:00:00",
        end: "2026-10-17T10:30:00",
        raw: "2026-10-17 10:00 to 10:30",
      },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("parses a start only", () => {
    expect(one("2026-10-17 14:45").result).toEqual([
      { start: "2026-10-17T14:45:00", end: null, raw: "2026-10-17 14:45" },
    ]);
  });

  it("tolerates flexible whitespace and upper-case TO", () => {
    expect(one("2026-10-17   09:00   TO   09:30").result[0]).toMatchObject({
      start: "2026-10-17T09:00:00",
      end: "2026-10-17T09:30:00",
    });
  });

  it("rolls an end before the start to the next day", () => {
    expect(one("2026-10-17 23:30 to 00:30").result[0]).toMatchObject({
      start: "2026-10-17T23:30:00",
      end: "2026-10-18T00:30:00",
    });
  });

  it("reads midnight and the last minute", () => {
    expect(one("2026-10-17 00:00 to 23:59").result[0]).toMatchObject({
      start: "2026-10-17T00:00:00",
      end: "2026-10-17T23:59:00",
    });
  });
});

describe("parseInspections time zones", () => {
  it("converts start and end to UTC with a zone", () => {
    // Sydney is on +11 from 4 October 2026.
    const { result, diagnostics } = one("17-Oct-2026 10:00am to 10:30am", "Australia/Sydney");
    expect(result).toEqual([
      {
        start: "2026-10-16T23:00:00Z",
        end: "2026-10-16T23:30:00Z",
        raw: "17-Oct-2026 10:00am to 10:30am",
      },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it("converts the ISO pattern too", () => {
    expect(one("2026-07-17 10:00 to 10:30", "Australia/Perth").result[0]).toMatchObject({
      start: "2026-07-17T02:00:00Z",
      end: "2026-07-17T02:30:00Z",
    });
  });

  it("rolls the end over before converting", () => {
    expect(one("2026-10-17 23:30 to 00:30", "Australia/Perth").result[0]).toMatchObject({
      start: "2026-10-17T15:30:00Z",
      end: "2026-10-17T16:30:00Z",
    });
  });

  it("shifts a start inside a daylight saving gap forward, like parseDate", () => {
    expect(one("2026-10-04 02:30", "Australia/Sydney").result[0]?.start).toBe(
      "2026-10-03T16:30:00Z",
    );
  });

  it("throws RangeError for an invalid zone", () => {
    expect(() => one("17-Oct-2026 10:00am", "Not/AZone")).toThrow(RangeError);
  });
});

describe("parseInspections unparseable text", () => {
  it.each([
    ["By appointment"],
    ["Saturday 10am"],
    ["17-Oct-2026"],
    ["17-Oct-2026 10:00"],
    ["17-Oct-2026 10:00am until 10:30am"],
    ["17-Oct-2026 10:00am to"],
    ["17-Oct-2026 10:00am to 10:30"],
    ["17-Foo-2026 10:00am"],
    ["17-October-2026 10:00am"],
    ["32-Oct-2026 10:00am"],
    ["31-Nov-2026 10:00am"],
    ["29-Feb-2027 10:00am"],
    ["0-Oct-2026 10:00am"],
    ["17-Oct-2026 13:00pm"],
    ["17-Oct-2026 0:30am"],
    ["17-Oct-2026 10:60am"],
    ["17-Oct-2026 10:00am to 13:00pm"],
    ["2026-13-01 10:00"],
    ["2026-02-30 10:00"],
    ["2026-10-17 24:00"],
    ["2026-10-17 10:60"],
    ["2026-10-17 10:00 to 25:00"],
    ["2026-10-17"],
    ["2026-10-17T10:00"],
    ["10:00am"],
  ])("rejects %j", (text) => {
    const { result, diagnostics } = one(text);
    expect(result).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(["unparseable-inspection"]);
    expect(diagnostics[0]?.path).toBe("residential/inspectionTimes/inspection");
    expect(diagnostics[0]?.message).toContain(text);
  });

  it("truncates the raw text in the diagnostic to the shared 80-character cap", () => {
    const long = "x".repeat(90);
    const { diagnostics } = one(long);
    expect(diagnostics[0]?.message).toContain("x".repeat(80));
    expect(diagnostics[0]?.message).not.toContain("x".repeat(81));
  });

  it("omits the unparseable inspection and keeps the others in order", () => {
    const { result, diagnostics } = run(`
      <inspection>17-Oct-2026 10:00am to 10:30am</inspection>
      <inspection>By appointment</inspection>
      <inspection>2026-10-18 09:00</inspection>`);
    expect(result.map((i) => i.start)).toEqual(["2026-10-17T10:00:00", "2026-10-18T09:00:00"]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.path).toBe("residential/inspectionTimes/inspection[2]");
  });
});

describe("parseInspections structure", () => {
  it("ignores empty inspection elements silently", () => {
    const { result, diagnostics } = run(
      "<inspection/><inspection>   </inspection><inspection></inspection>",
    );
    expect(result).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it("returns an empty list when there is no inspectionTimes element", () => {
    const root = parseXml("<residential><headline>Sample</headline></residential>");
    if (root === null) throw new Error("no root");
    const c = new Collector({ tolerant: true });
    expect(parseInspections(root, c, {})).toEqual([]);
    expect(c.all).toEqual([]);
  });

  it("keeps the original trimmed text as raw", () => {
    expect(one("\n   17-Oct-2026 10:00am   \n").result[0]?.raw).toBe("17-Oct-2026 10:00am");
  });

  it("ignores other children of inspectionTimes", () => {
    const { result, diagnostics } = run(
      "<note>Open home</note><inspection>2026-10-17 10:00</inspection>",
    );
    expect(result).toHaveLength(1);
    expect(diagnostics).toEqual([]);
  });
});
