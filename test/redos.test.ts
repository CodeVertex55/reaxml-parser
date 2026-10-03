import { describe, expect, it } from "vitest";
import { run, type Io } from "../src/cli.js";
import { Collector } from "../src/diagnostics.js";
import { parseReaxml } from "../src/index.js";
import { parseAddress } from "../src/normalise/address.js";
import { parseDate } from "../src/normalise/dates.js";
import { parseInspections } from "../src/normalise/inspections.js";
import { parseMeasure } from "../src/normalise/measures.js";
import { isWebUrl } from "../src/normalise/media.js";
import { parsePrice } from "../src/normalise/price.js";
import { parseNumber, yesNo } from "../src/normalise/primitives.js";
import { parseXml, type XmlNode } from "../src/xml.js";
import { feed, residential } from "./helpers.js";

/**
 * Every place that runs a pattern or a scan over text from the feed gets a 100,000-character
 * hostile string here. A pattern with overlapping unbounded runs takes seconds or minutes on
 * input this size, so a generous bound still catches it while leaving room for a slow machine.
 */
const SIZE = 100_000;
const BOUND_MS = 500;

/** `prefix`, then `fill` repeated, then `suffix`, exactly SIZE characters long. */
function hostile(prefix: string, fill: string, suffix = ""): string {
  const room = SIZE - prefix.length - suffix.length;
  const body = fill.repeat(Math.ceil(room / fill.length)).slice(0, room);
  return `${prefix}${body}${suffix}`;
}

/** The spaces of a hostile string split into two runs around a middle part. */
function twoRuns(prefix: string, middle: string, suffix: string): string {
  const room = SIZE - prefix.length - middle.length - suffix.length;
  const half = Math.floor(room / 2);
  return `${prefix}${" ".repeat(half)}${middle}${" ".repeat(room - half)}${suffix}`;
}

function timed(work: () => unknown): number {
  const started = performance.now();
  work();
  return performance.now() - started;
}

function element(xml: string): XmlNode {
  const root = parseXml(xml);
  if (root === null) throw new Error("test xml has no root");
  return root;
}

function collector(): Collector {
  return new Collector({ tolerant: true });
}

/** Escapes text for use inside an XML attribute or element. */
function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function cliOutput(xml: string): string {
  let out = "";
  const io: Io = {
    stdout: (s) => {
      out += s;
    },
    stderr: (s) => {
      out += s;
    },
    readFile: () => xml,
  };
  run(["validate", "feed.xml"], io);
  return out;
}

describe("parseNumber regression", () => {
  it("parses a <bedrooms> holding a minus, 200,000 spaces and a letter in under 500 ms", () => {
    const xml = feed(
      residential("TEST0001", `<features><bedrooms>-${" ".repeat(200_000)}x</bedrooms></features>`),
    );
    let bedrooms: number | null | undefined;
    const ms = timed(() => {
      bedrooms = parseReaxml(xml).listings[0]?.features.bedrooms;
    });
    expect(bedrooms).toBeNull();
    expect(ms).toBeLessThan(500);
  });
});

type Case = readonly [name: string, work: () => unknown];

const numbers: readonly string[] = [
  hostile("-", " ", "x"),
  hostile("$", " ", "x"),
  hostile("-$", " ", "x"),
  hostile("", "1", "x"),
  hostile("1", ",111", "x"),
  hostile("1", " 111", "x"),
  hostile("1", "\u00a0111", "x"),
  hostile("", "1 ", "x"),
  hostile("", "1,", "x"),
  hostile(".", "1", "x"),
  hostile("1.", "1", "x"),
];

const dates: readonly string[] = [
  hostile("2026-01-01-", "1"),
  hostile("", "1", "x"),
  hostile("2026-01-01", " ", "x"),
  hostile("20260101", "-", "x"),
];

const inspections: readonly string[] = [
  twoRuns("17-Oct-2026", "10", "x"),
  twoRuns("17-Oct-2026 10am", "to", "x"),
  twoRuns("17-Oct-2026 10:00am to", "10", "x"),
  twoRuns("2026-10-17", "10:00", "x"),
  twoRuns("2026-10-17 10:00", "to", "x"),
  hostile("17-Oct-2026 ", "1", "x"),
  hostile("", "17-Oct-2026 ", "x"),
];

const cases: readonly Case[] = [
  ...numbers.map((value, i): Case => [`parseNumber, string ${i + 1}`, () => parseNumber(value)]),
  ...dates.map((value, i): Case => [
    `parseDate, string ${i + 1}`,
    () => parseDate(value, "p", collector(), { timeZone: "Australia/Perth" }),
  ]),
  ...inspections.map((value, i): Case => [
    `parseInspections, string ${i + 1}`,
    () =>
      parseInspections(
        element(
          `<residential><inspectionTimes><inspection>${escape(value)}</inspection></inspectionTimes></residential>`,
        ),
        collector(),
        {},
      ),
  ]),
  [
    "price range",
    () =>
      parsePrice(
        element(
          `<residential><price display="range" range="${twoRuns("1", "-", "x")}"/></residential>`,
        ),
        collector(),
        { includeHiddenPrices: false },
      ),
  ],
  [
    "price range made of separators",
    () =>
      parsePrice(
        element(`<residential><price display="range" range="${hostile("", "-")}"/></residential>`),
        collector(),
        { includeHiddenPrices: false },
      ),
  ],
  ["web URL check, slashes", () => isWebUrl(hostile("https:", "/"))],
  ["web URL check, spaces", () => isWebUrl(hostile("https://", " ", "x"))],
  [
    "measure unit",
    () => parseMeasure(element(`<area unit="${hostile("sq", "m ")}">450</area>`), collector()),
  ],
  [
    "measure value",
    () => parseMeasure(element(`<area>${hostile("-", " ", "x")}</area>`), collector()),
  ],
  [
    "street number with a letter suffix",
    () =>
      parseAddress(
        element(
          `<residential><address><streetNumber>${hostile("", "1", "ab")}</streetNumber><street>Example Street</street></address></residential>`,
        ),
        collector(),
      ),
  ],
  [
    "lot number",
    () =>
      parseAddress(
        element(
          `<residential><address><lotNumber>${hostile("lot", " ")}x</lotNumber></address></residential>`,
        ),
        collector(),
      ),
  ],
  ["yes or no flag", () => yesNo(hostile("", " ", "x"))],
  [
    "status",
    () => parseReaxml(feed(residential("TEST0001", "", `status="${hostile("", "pend&#10;")}"`))),
  ],
  [
    "extension coordinates",
    () =>
      parseReaxml(
        feed(
          residential(
            "TEST0001",
            `<extraFields><geoLat>${hostile("-", " ", "x")}</geoLat><geoLong>${hostile("$", " ", "x")}</geoLong></extraFields>`,
          ),
        ),
      ),
  ],
  [
    "entity decoder, unterminated hex references",
    () => parseReaxml(feed(residential("TEST0001", "", `status="${hostile("", "&#x1234567")}"`))),
  ],
  [
    "entity decoder, bare ampersand and hash",
    () => parseReaxml(feed(residential("TEST0001", "", `status="${hostile("", "&#")}"`))),
  ],
  [
    "entity decoder, unterminated names",
    () => parseReaxml(feed(residential("TEST0001", "", `status="${hostile("", "&amp")}"`))),
  ],
  [
    "entity decoder, valid references",
    () =>
      parseReaxml(
        feed(residential("TEST0001", `<headline>${hostile("", "&#65;&lt;")}</headline>`)),
      ),
  ],
  ["XML pre-scan, unterminated DOCTYPE", () => parseReaxml(hostile("<!DOCTYPE", " "))],
  ["XML pre-scan, unterminated internal subset", () => parseReaxml(hostile("<!DOCTYPE x [", "<"))],
  ["XML pre-scan, unterminated declaration", () => parseReaxml(hostile("<?xml", " "))],
  ["XML pre-scan, unterminated comment", () => parseReaxml(hostile("<!--", "-"))],
  ["XML pre-scan, repeated comments", () => parseReaxml(hostile("", "<!-- -->"))],
  ["XML pre-scan, repeated declarations", () => parseReaxml(hostile("", "<?x?>"))],
  ["XML, open angle brackets", () => parseReaxml(hostile("", "<"))],
  ["XML, spaces inside a start tag", () => parseReaxml(hostile("<propertyList", " ", "x"))],
  ["XML, unterminated attribute value", () => parseReaxml(hostile('<propertyList a="', " "))],
  ["XML, deep nesting", () => parseReaxml(hostile("<propertyList>", "<a>"))],
  [
    "diagnostic detail sanitiser, controls and spaces",
    () => collector().add("unknown-status", "p", hostile("", " \u0001\t")),
  ],
  [
    "diagnostic detail sanitiser, surrogate pairs",
    () => collector().add("unknown-status", "p", hostile("", "\u{1F600}")),
  ],
  [
    "command-line output",
    () =>
      cliOutput(
        feed(
          residential(
            hostile("", "TEST"),
            `<inspectionTimes><inspection>${hostile("", "x&#10;")}</inspection></inspectionTimes>`,
            `status="${hostile("", "x&#9;")}"`,
          ),
        ),
      ),
  ],
];

describe("feed text is processed in linear time", () => {
  it.each(cases)("%s finishes within the bound", (_name, work) => {
    expect(timed(work)).toBeLessThan(BOUND_MS);
  });
});
