import { describe, expect, it } from "vitest";
import { Collector, DIAGNOSTIC_CODES, ReaxmlError } from "../src/diagnostics.js";

describe("DIAGNOSTIC_CODES", () => {
  it("has exactly the 19 codes with their severities", () => {
    const severities = Object.fromEntries(
      Object.entries(DIAGNOSTIC_CODES).map(([code, entry]) => [code, entry.severity]),
    );
    expect(severities).toEqual({
      "credentials-in-feed": "warning",
      "empty-document": "error",
      "xml-malformed": "error",
      "unknown-listing-element": "warning",
      "missing-identity": "error",
      "duplicate-listing": "warning",
      "unknown-status": "warning",
      "invalid-date": "warning",
      "empty-media-placeholder": "info",
      "media-without-url": "warning",
      "hidden-price-withheld": "info",
      "unparseable-number": "warning",
      "empty-measure": "info",
      "unknown-unit": "warning",
      "address-hidden": "info",
      "street-number-composite": "info",
      "extension-fields-present": "info",
      "invalid-coordinates": "warning",
      "unparseable-inspection": "warning",
    });
    expect(Object.keys(DIAGNOSTIC_CODES)).toHaveLength(19);
  });

  it("gives every code a non-empty description and is frozen", () => {
    for (const entry of Object.values(DIAGNOSTIC_CODES)) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(DIAGNOSTIC_CODES)).toBe(true);
  });

  it("freezes every entry so a severity cannot be changed at runtime", () => {
    expect(Object.isFrozen(DIAGNOSTIC_CODES["xml-malformed"])).toBe(true);
    for (const entry of Object.values(DIAGNOSTIC_CODES)) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
  });
});

describe("Collector", () => {
  it("records code, severity, message, listingId and path with the current listing context", () => {
    const collector = new Collector({ tolerant: true });
    collector.add("credentials-in-feed", "propertyList");
    collector.withListing("AGENT:123");
    collector.add("invalid-date", "propertyList/residential[1]", "modTime");

    expect(collector.all).toEqual([
      {
        code: "credentials-in-feed",
        severity: "warning",
        message: DIAGNOSTIC_CODES["credentials-in-feed"].description,
        listingId: null,
        path: "propertyList",
      },
      {
        code: "invalid-date",
        severity: "warning",
        message: `${DIAGNOSTIC_CODES["invalid-date"].description}: modTime`,
        listingId: "AGENT:123",
        path: "propertyList/residential[1]",
      },
    ]);
  });

  it("resets the listing context with withListing(null)", () => {
    const collector = new Collector({ tolerant: true });
    collector.withListing("A:1");
    collector.add("address-hidden", "p1");
    collector.withListing(null);
    collector.add("address-hidden", "p2");

    expect(collector.all.map((d) => d.listingId)).toEqual(["A:1", null]);
  });

  it("never throws when tolerant, even for error-severity codes", () => {
    const collector = new Collector({ tolerant: true });
    expect(() => collector.add("xml-malformed", "propertyList")).not.toThrow();
    expect(collector.all).toHaveLength(1);
    expect(collector.all[0]?.severity).toBe("error");
  });

  it("throws ReaxmlError with code, listingId and path on an error code when not tolerant", () => {
    const collector = new Collector({ tolerant: false });
    collector.withListing("A:1");
    let caught: unknown;
    try {
      collector.add("missing-identity", "propertyList/rental[2]", "no uniqueID");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReaxmlError);
    expect(caught).toBeInstanceOf(Error);
    const error = caught as ReaxmlError;
    expect(error.code).toBe("missing-identity");
    expect(error.listingId).toBe("A:1");
    expect(error.path).toBe("propertyList/rental[2]");
    expect(error.message).toBe(`${DIAGNOSTIC_CODES["missing-identity"].description}: no uniqueID`);
    expect(error.name).toBe("ReaxmlError");
  });

  it("does not throw on warning or info codes when not tolerant", () => {
    const collector = new Collector({ tolerant: false });
    expect(() => collector.add("invalid-date", "p")).not.toThrow();
    expect(() => collector.add("address-hidden", "p")).not.toThrow();
    expect(collector.all.map((d) => d.severity)).toEqual(["warning", "info"]);
  });
});

describe("Collector detail sanitising", () => {
  const messageFor = (detail: string): string => {
    const collector = new Collector({ tolerant: true });
    collector.add("unknown-status", "p", detail);
    return collector.all[0]?.message ?? "";
  };
  const prefix = `${DIAGNOSTIC_CODES["unknown-status"].description}: `;

  it("replaces control characters with spaces and collapses whitespace", () => {
    expect(messageFor("a\nb\r\nc\td\u0000e\u007ff   g")).toBe(`${prefix}a b c d e f g`);
  });

  it("trims the detail", () => {
    expect(messageFor("  \n padded \t ")).toBe(`${prefix}padded`);
  });

  it("truncates to 80 characters", () => {
    expect(messageFor("y".repeat(500))).toBe(`${prefix}${"y".repeat(80)}`);
  });

  it("replaces C1 controls, bidirectional controls and line separators with spaces", () => {
    const unsafe = [
      0x80, 0x85, 0x9b, 0x9f, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066,
      0x2067, 0x2068, 0x2069, 0x2028, 0x2029,
    ];
    for (const codePoint of unsafe) {
      const detail = `a${String.fromCodePoint(codePoint)}b`;
      expect(messageFor(detail), codePoint.toString(16)).toBe(`${prefix}a b`);
    }
  });

  it("keeps characters next to the unsafe ranges", () => {
    const safe = [0xa1, 0xe9, 0x200d, 0x2010, 0x2027, 0x2030, 0x2065, 0x206a];
    for (const codePoint of safe) {
      const char = String.fromCodePoint(codePoint);
      expect(messageFor(`a${char}b`), codePoint.toString(16)).toBe(`${prefix}a${char}b`);
    }
  });

  it("truncates by code point and never splits a surrogate pair", () => {
    const face = String.fromCodePoint(0x1f600);
    const message = messageFor(`a${face.repeat(100)}`);
    expect(message).toBe(`${prefix}a${face.repeat(79)}`);
    const last = message.charCodeAt(message.length - 1);
    expect(last >= 0xdc00 && last <= 0xdfff).toBe(true);
    expect(() => encodeURIComponent(message)).not.toThrow();
  });

  it("leaves out the separator when nothing is left of the detail", () => {
    expect(messageFor(" \n\t ")).toBe(DIAGNOSTIC_CODES["unknown-status"].description);
    expect(messageFor("")).toBe(DIAGNOSTIC_CODES["unknown-status"].description);
  });

  it("sanitises the message of a thrown error too", () => {
    const collector = new Collector({ tolerant: false });
    expect(() => collector.add("xml-malformed", "p", "a\nb")).toThrow(/: a b$/);
  });
});
