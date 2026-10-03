import { describe, expect, it } from "vitest";
import { ReaxmlError, parseReaxml } from "../src/index.js";
import { feed, fixture, residential } from "./helpers.js";

const SENTINELS = ["feeduser-SENTINEL", "feedpass-SENTINEL", "SENTINEL"];
const HIDDEN_AMOUNT = "987654";

function expectClean(text: string, forbidden: readonly string[]): void {
  for (const value of forbidden) expect(text).not.toContain(value);
}

function capture(run: () => unknown): ReaxmlError {
  try {
    run();
  } catch (error) {
    if (error instanceof ReaxmlError) return error;
    throw error;
  }
  throw new Error("expected parseReaxml to throw");
}

describe("credentials", () => {
  it("never appear in the result", () => {
    const result = parseReaxml(fixture("credentials"));
    expect(result.meta.hadCredentials).toBe(true);
    expectClean(JSON.stringify(result), SENTINELS);
  });

  it("never appear in the result with hidden prices included", () => {
    const result = parseReaxml(fixture("credentials"), { includeHiddenPrices: true });
    expectClean(JSON.stringify(result), SENTINELS);
  });

  it("never appear in the result with a time zone", () => {
    const result = parseReaxml(fixture("credentials"), { timeZone: "Australia/Perth" });
    expectClean(JSON.stringify(result), SENTINELS);
  });

  it("never appear in a tolerant:false error message, path or stack", () => {
    const xml = feed(
      "<residential><agentID>XNWTEST</agentID></residential>",
      'username="feeduser-SENTINEL" password="feedpass-SENTINEL"',
    );
    const error = capture(() => parseReaxml(xml, { tolerant: false }));
    expect(error.code).toBe("missing-identity");
    expectClean(JSON.stringify({ ...error, message: error.message }), SENTINELS);
    expectClean(`${error.stack ?? ""} ${String(error)}`, SENTINELS);
  });

  it("never appear when the document is malformed", () => {
    const result = parseReaxml(fixture("malformed"));
    expect(result.warnings[0]?.code).toBe("xml-malformed");
    expectClean(JSON.stringify(result), SENTINELS);
  });

  it("never appear in a tolerant:false error for a malformed document", () => {
    const error = capture(() => parseReaxml(fixture("malformed"), { tolerant: false }));
    expect(error.code).toBe("xml-malformed");
    expectClean(`${error.message} ${error.path} ${error.stack ?? ""}`, SENTINELS);
  });

  it("never appear when the root is not a propertyList", () => {
    const xml = '<catalog username="feeduser-SENTINEL" password="feedpass-SENTINEL"/>';
    expectClean(JSON.stringify(parseReaxml(xml)), SENTINELS);
    const error = capture(() => parseReaxml(xml, { tolerant: false }));
    expectClean(`${error.message} ${error.path}`, SENTINELS);
  });

  it("never appear when the credential attributes are on a listing instead", () => {
    const xml = feed(residential("TEST0001", "", 'status="current" username="feeduser-SENTINEL"'));
    expectClean(JSON.stringify(parseReaxml(xml)), SENTINELS);
  });

  it("are not reported through extra fields", () => {
    const result = parseReaxml(fixture("credentials"));
    for (const listing of result.listings) expect(listing.extra).toEqual({});
  });
});

describe("hidden prices", () => {
  it("are absent by default", () => {
    const result = parseReaxml(fixture("hidden-price"));
    expectClean(JSON.stringify(result), [HIDDEN_AMOUNT]);
  });

  it("are absent from tolerant:false runs", () => {
    const result = parseReaxml(fixture("hidden-price"), { tolerant: false });
    expectClean(JSON.stringify(result), [HIDDEN_AMOUNT]);
  });

  it("are present only with includeHiddenPrices", () => {
    const result = parseReaxml(fixture("hidden-price"), { includeHiddenPrices: true });
    expect(JSON.stringify(result.listings)).toContain(HIDDEN_AMOUNT);
    expectClean(JSON.stringify(result.warnings), [HIDDEN_AMOUNT]);
  });

  it("stay out of diagnostics for rent, commercial rent, business rent and unparseable text", () => {
    const xml = feed(
      `<rental><agentID>A</agentID><uniqueID>1</uniqueID><rent display="no">${HIDDEN_AMOUNT}</rent></rental>` +
        `<commercial><agentID>A</agentID><uniqueID>2</uniqueID><commercialRent display="no">${HIDDEN_AMOUNT}</commercialRent></commercial>` +
        `<business><agentID>A</agentID><uniqueID>3</uniqueID><businessLease display="no">${HIDDEN_AMOUNT}</businessLease></business>` +
        `<residential><agentID>A</agentID><uniqueID>4</uniqueID><price display="no">about ${HIDDEN_AMOUNT} dollars</price></residential>`,
    );
    const result = parseReaxml(xml);
    expectClean(JSON.stringify(result), [HIDDEN_AMOUNT]);
    const included = parseReaxml(xml, { includeHiddenPrices: true });
    expectClean(JSON.stringify(included.warnings), [HIDDEN_AMOUNT]);
  });
});

describe("hostile input", () => {
  it("keeps prototype-like extension keys as plain data", () => {
    const xml = feed(
      residential(
        "TEST0001",
        "<extraFields><extraField name='__proto__' value='polluted'/><constructor_note>x</constructor_note></extraFields>",
      ),
    );
    const listing = parseReaxml(xml).listings[0];
    expect(Object.getPrototypeOf(listing?.extra)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(Object.hasOwn(listing?.extra ?? {}, "__proto__")).toBe(true);
  });

  it("does not keep script or file addresses as media", () => {
    const xml = feed(
      residential(
        "TEST0001",
        '<objects><img id="a" url="javascript:alert(1)"/><img id="b" url="file:///etc/passwd"/></objects>',
      ),
    );
    expect(parseReaxml(xml).listings[0]?.images).toEqual([]);
  });

  it("does not expand DOCTYPE entities", () => {
    const xml =
      '<?xml version="1.0"?><!DOCTYPE propertyList [<!ENTITY secret "LEAKED-VALUE">]>' +
      feed(residential("TEST0001", "<headline>&secret;</headline>")).replace(/^<\?xml[^>]*>\n/, "");
    const text = JSON.stringify(parseReaxml(xml));
    expectClean(text, ["LEAKED-VALUE"]);
  });
});
