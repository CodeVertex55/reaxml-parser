import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { normaliseListing } from "../src/normalise/listing.js";
import { parseXml } from "../src/xml.js";

function run(xml: string, c = new Collector({ tolerant: true })) {
  const node = parseXml(xml);
  if (node === null) throw new Error("test xml has no root");
  return { listing: normaliseListing(node, c, { includeHiddenPrices: false }), c };
}

describe("normaliseListing", () => {
  it("returns null for an element that is not a listing kind, with no diagnostic", () => {
    const { listing, c } = run(
      "<agencyNotice><agentID>A</agentID><uniqueID>1</uniqueID></agencyNotice>",
    );
    expect(listing).toBeNull();
    expect(c.all).toEqual([]);
  });

  it("is case sensitive about kind names", () => {
    expect(
      run("<Residential><agentID>A</agentID><uniqueID>1</uniqueID></Residential>").listing,
    ).toBeNull();
  });

  it("clears the listing context afterwards", () => {
    const c = new Collector({ tolerant: true });
    run(
      '<residential><agentID>A</agentID><uniqueID>1</uniqueID><price display="no">5</price></residential>',
      c,
    );
    expect(c.all.map((d) => d.listingId)).toEqual(["A:1"]);
    c.add("credentials-in-feed", "propertyList");
    expect(c.all[1]?.listingId).toBeNull();
  });

  it("clears a stale listing context before reporting a missing identity", () => {
    const c = new Collector({ tolerant: true });
    c.withListing("STALE:ID");
    run("<residential><agentID>A</agentID></residential>", c);
    expect(c.all).toHaveLength(1);
    expect(c.all[0]).toMatchObject({ code: "missing-identity", listingId: null });
  });
});
