import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

describe("public export surface", () => {
  it("exports exactly the runtime values of the public API", () => {
    expect(Object.keys(api).sort()).toEqual([
      "DIAGNOSTIC_CODES",
      "ReaxmlError",
      "VERSION",
      "parseReaxml",
    ]);
  });

  it("exports working values", () => {
    expect(typeof api.parseReaxml).toBe("function");
    expect(typeof api.VERSION).toBe("string");
    expect(api.DIAGNOSTIC_CODES["xml-malformed"].severity).toBe("error");
    expect(new api.ReaxmlError("empty-document", null, "x", "m")).toBeInstanceOf(Error);
  });

  it("does not export the collector or anything from the XML wrapper", () => {
    for (const name of [
      "Collector",
      "parseXml",
      "XmlParseError",
      "child",
      "children",
      "text",
      "attr",
    ]) {
      expect(api).not.toHaveProperty(name);
    }
  });
});
