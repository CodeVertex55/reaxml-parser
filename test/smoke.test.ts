import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { VERSION } from "../src/index";

describe("smoke", () => {
  it("exports a VERSION that matches package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });
});
