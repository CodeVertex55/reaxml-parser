import { describe, expect, it } from "vitest";
import { Collector } from "../src/diagnostics.js";
import { parseAddress } from "../src/normalise/address.js";
import { parseXml } from "../src/xml.js";

function run(inner: string) {
  const root = parseXml(`<residential>${inner}</residential>`);
  if (root === null) throw new Error("test xml has no root");
  const c = new Collector({ tolerant: true });
  return { result: parseAddress(root, c), diagnostics: c.all };
}

function streetLine(fields: string) {
  return run(`<address display="yes">${fields}</address>`);
}

describe("parseAddress basics", () => {
  it("reads every field of a full address", () => {
    const { result, diagnostics } = run(`
      <address display="yes">
        <subNumber>2</subNumber>
        <lotNumber>7</lotNumber>
        <streetNumber>80</streetNumber>
        <street>Example Street</street>
        <suburb display="yes">Testville</suburb>
        <state>WA</state>
        <postcode>0001</postcode>
        <country>Australia</country>
      </address>`);
    expect(result).toEqual({
      display: true,
      subNumber: "2",
      lotNumber: "7",
      streetNumber: "80",
      street: "Example Street",
      streetLine: "2/80 Example Street",
      suburb: "Testville",
      suburbDisplay: true,
      state: "WA",
      postcode: "0001",
      country: "Australia",
    });
    expect(diagnostics).toEqual([]);
  });

  it("gives an all-null address with display true when there is no address element", () => {
    const { result, diagnostics } = run("<headline>Nothing here</headline>");
    expect(result).toEqual({
      display: true,
      subNumber: null,
      lotNumber: null,
      streetNumber: null,
      street: null,
      streetLine: null,
      suburb: null,
      suburbDisplay: true,
      state: null,
      postcode: null,
      country: null,
    });
    expect(diagnostics).toEqual([]);
  });

  it("upper-cases the state", () => {
    expect(run("<address><state>nsw</state></address>").result.state).toBe("NSW");
    expect(run("<address><state> wa </state></address>").result.state).toBe("WA");
  });

  it("keeps the postcode as a string with leading zeros", () => {
    const { result } = run("<address><postcode>0004</postcode></address>");
    expect(result.postcode).toBe("0004");
  });

  it("passes the country through as given", () => {
    expect(run("<address><country>Mockland</country></address>").result.country).toBe("Mockland");
  });

  it("treats empty elements as null", () => {
    const { result } = run(
      "<address><street>  </street><suburb/><state></state><postcode> </postcode></address>",
    );
    expect(result.street).toBeNull();
    expect(result.suburb).toBeNull();
    expect(result.state).toBeNull();
    expect(result.postcode).toBeNull();
    expect(result.streetLine).toBeNull();
  });
});

describe("parseAddress display flags", () => {
  it("defaults display and suburbDisplay to true when the attributes are absent", () => {
    const { result, diagnostics } = run(
      "<address><suburb>Mockford</suburb><street>Sample Road</street></address>",
    );
    expect(result.display).toBe(true);
    expect(result.suburbDisplay).toBe(true);
    expect(diagnostics).toEqual([]);
  });

  it.each([["yes"], ["YES"], ["true"], ["1"]])("display=%j is true", (value) => {
    expect(run(`<address display="${value}"/>`).result.display).toBe(true);
  });

  it.each([["no"], ["NO"], ["false"], ["0"]])(
    "display=%j is false with address-hidden",
    (value) => {
      const { result, diagnostics } = run(
        `<address display="${value}"><street>Sample Road</street></address>`,
      );
      expect(result.display).toBe(false);
      expect(diagnostics.map((d) => d.code)).toEqual(["address-hidden"]);
      expect(diagnostics[0]?.path).toBe("residential/address");
    },
  );

  it("does not add address-hidden when the address is shown", () => {
    expect(run('<address display="yes"/>').diagnostics).toEqual([]);
  });

  it("reads suburbDisplay from suburb@display", () => {
    const hidden = run('<address><suburb display="no">Testville</suburb></address>').result;
    expect(hidden.suburbDisplay).toBe(false);
    expect(hidden.suburb).toBe("Testville");
    const shown = run('<address><suburb display="yes">Testville</suburb></address>').result;
    expect(shown.suburbDisplay).toBe(true);
  });
});

describe("parseAddress streetLine composition", () => {
  it("rule 2: a street number with a slash and an empty sub number is kept verbatim", () => {
    const { result, diagnostics } = streetLine(
      "<subNumber/><streetNumber>2/80</streetNumber><street>Example Street</street>",
    );
    expect(result.streetLine).toBe("2/80 Example Street");
    expect(result.subNumber).toBeNull();
    expect(result.streetNumber).toBe("2/80");
    expect(diagnostics.map((d) => d.code)).toEqual(["street-number-composite"]);
    expect(diagnostics[0]?.path).toBe("residential/address");
  });

  it("rule 2: a street number with a letter suffix is kept verbatim", () => {
    const { result, diagnostics } = streetLine(
      "<streetNumber>4A</streetNumber><street>Sample Road</street>",
    );
    expect(result.streetLine).toBe("4A Sample Road");
    expect(diagnostics.map((d) => d.code)).toEqual(["street-number-composite"]);
  });

  it("rule 2: a lower-case letter suffix also counts", () => {
    const { result, diagnostics } = streetLine(
      "<streetNumber>12b</streetNumber><street>Sample Road</street>",
    );
    expect(result.streetLine).toBe("12b Sample Road");
    expect(diagnostics.map((d) => d.code)).toEqual(["street-number-composite"]);
  });

  it("rule 3: sub 2 and number 80 give 2/80", () => {
    const { result, diagnostics } = streetLine(
      "<subNumber>2</subNumber><streetNumber>80</streetNumber><street>Example Street</street>",
    );
    expect(result.streetLine).toBe("2/80 Example Street");
    expect(diagnostics).toEqual([]);
  });

  it("rule 3: sub 2 and number 2/80 give 2/80, not 2/2/80", () => {
    const { result, diagnostics } = streetLine(
      "<subNumber>2</subNumber><streetNumber>2/80</streetNumber><street>Example Street</street>",
    );
    expect(result.streetLine).toBe("2/80 Example Street");
    expect(diagnostics).toEqual([]);
  });

  it("rule 3: sub with a different slashed number is prefixed", () => {
    const { result } = streetLine(
      "<subNumber>3</subNumber><streetNumber>2/80</streetNumber><street>Example Street</street>",
    );
    expect(result.streetLine).toBe("3/2/80 Example Street");
  });

  it("rule 3: a letter-suffixed number with a sub number is prefixed with no diagnostic", () => {
    const { result, diagnostics } = streetLine(
      "<subNumber>5</subNumber><streetNumber>4A</streetNumber><street>Sample Road</street>",
    );
    expect(result.streetLine).toBe("5/4A Sample Road");
    expect(diagnostics).toEqual([]);
  });

  it("rule 4: a number alone", () => {
    const { result, diagnostics } = streetLine(
      "<streetNumber>80</streetNumber><street>Example Street</street>",
    );
    expect(result.streetLine).toBe("80 Example Street");
    expect(diagnostics).toEqual([]);
  });

  it("rule 4: a sub number alone", () => {
    const { result } = streetLine("<subNumber>9</subNumber><street>Example Street</street>");
    expect(result.streetLine).toBe("9 Example Street");
  });

  it("rule 5: a lot number alone gives Lot 5", () => {
    const { result, diagnostics } = streetLine(
      "<lotNumber>5</lotNumber><street>Sample Road</street>",
    );
    expect(result.streetLine).toBe("Lot 5 Sample Road");
    expect(result.lotNumber).toBe("5");
    expect(diagnostics).toEqual([]);
  });

  it("rule 5: a lot already starting with Lot is used verbatim", () => {
    expect(
      streetLine("<lotNumber>Lot 5</lotNumber><street>Sample Road</street>").result.streetLine,
    ).toBe("Lot 5 Sample Road");
    expect(
      streetLine("<lotNumber>LOT 5</lotNumber><street>Sample Road</street>").result.streetLine,
    ).toBe("LOT 5 Sample Road");
  });

  it("rule 5: the lot is ignored when there is a street number", () => {
    const { result } = streetLine(
      "<lotNumber>5</lotNumber><streetNumber>80</streetNumber><street>Sample Road</street>",
    );
    expect(result.streetLine).toBe("80 Sample Road");
  });

  it("rule 4: a sub number and a lot number without a street number use the sub number only", () => {
    const { result, diagnostics } = streetLine(
      "<subNumber>9</subNumber><lotNumber>5</lotNumber><street>Example Street</street>",
    );
    expect(result.streetLine).toBe("9 Example Street");
    expect(result.subNumber).toBe("9");
    expect(result.lotNumber).toBe("5");
    expect(diagnostics).toEqual([]);
  });

  it("rule 6: a street alone", () => {
    expect(streetLine("<street>Example Street</street>").result.streetLine).toBe("Example Street");
  });

  it("rule 6: a number without a street", () => {
    expect(streetLine("<streetNumber>80</streetNumber>").result.streetLine).toBe("80");
  });

  it("rule 6: nothing at all gives null", () => {
    const { result, diagnostics } = streetLine("<suburb>Testville</suburb>");
    expect(result.streetLine).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("trims every part", () => {
    const { result } = streetLine(
      "<subNumber> 2 </subNumber><streetNumber> 80 </streetNumber><street> Example Street </street>",
    );
    expect(result.streetLine).toBe("2/80 Example Street");
    expect(result.subNumber).toBe("2");
    expect(result.streetNumber).toBe("80");
    expect(result.street).toBe("Example Street");
  });
});
