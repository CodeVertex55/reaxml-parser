import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import {
  hasControlCharacter,
  isControlCharacter,
  isUnsafeCharacter,
  replaceUnsafe,
  truncateCodePoints,
} from "../src/unsafe-text.js";

const char = (codePoint: number): string => String.fromCodePoint(codePoint);

const CONTROLS = [0x00, 0x09, 0x0a, 0x0d, 0x1b, 0x1f, 0x7f, 0x80, 0x85, 0x9b, 0x9f, 0x2028, 0x2029];
const BIDI = [
  0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
];
const SAFE = [
  0x20, 0x41, 0x7e, 0xa0, 0xa1, 0x200d, 0x2010, 0x2027, 0x2030, 0x2065, 0x206a, 0x1f600,
];

describe("isControlCharacter", () => {
  it.each(CONTROLS)("is true for code point %d", (codePoint) => {
    expect(isControlCharacter(codePoint)).toBe(true);
  });

  it.each([...BIDI, ...SAFE])("is false for code point %d", (codePoint) => {
    expect(isControlCharacter(codePoint)).toBe(false);
  });
});

describe("isUnsafeCharacter", () => {
  it.each([...CONTROLS, ...BIDI])("is true for code point %d", (codePoint) => {
    expect(isUnsafeCharacter(codePoint)).toBe(true);
  });

  it.each(SAFE)("is false for code point %d", (codePoint) => {
    expect(isUnsafeCharacter(codePoint)).toBe(false);
  });
});

describe("hasControlCharacter", () => {
  it("finds a control character anywhere in the text", () => {
    for (const codePoint of CONTROLS) {
      expect(hasControlCharacter(`TEST${char(codePoint)}0001`)).toBe(true);
    }
  });

  it("ignores bidirectional controls and ordinary text", () => {
    expect(hasControlCharacter("TEST0001")).toBe(false);
    expect(hasControlCharacter("")).toBe(false);
    expect(hasControlCharacter(`TEST${char(0x202e)}0001`)).toBe(false);
  });
});

describe("replaceUnsafe", () => {
  it("replaces every control and bidirectional control and keeps everything else", () => {
    const unsafe = [...CONTROLS, ...BIDI].map(char).join("");
    expect(replaceUnsafe(`a${unsafe}b`, "?")).toBe(
      `a${"?".repeat(CONTROLS.length + BIDI.length)}b`,
    );
    const safe = SAFE.map(char).join("");
    expect(replaceUnsafe(safe, "?")).toBe(safe);
  });
});

describe("truncateCodePoints", () => {
  const face = char(0x1f600);

  it("keeps text at or under the limit", () => {
    expect(truncateCodePoints("abc", 3)).toBe("abc");
    expect(truncateCodePoints("", 3)).toBe("");
    expect(truncateCodePoints(face.repeat(3), 3)).toBe(face.repeat(3));
  });

  it("counts a surrogate pair as one and never splits it", () => {
    expect(truncateCodePoints(`a${face.repeat(5)}`, 3)).toBe(`a${face}${face}`);
    expect(truncateCodePoints("abcdef", 0)).toBe("");
  });
});

describe("module privacy", () => {
  it("is not exported from the package entry point", () => {
    for (const name of [
      "isControlCharacter",
      "isUnsafeCharacter",
      "hasControlCharacter",
      "replaceUnsafe",
      "truncateCodePoints",
    ]) {
      expect(api).not.toHaveProperty(name);
    }
  });
});
