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
