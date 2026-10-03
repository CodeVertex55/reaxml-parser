import { describe, expect, it } from "vitest";
import { Collector, DIAGNOSTIC_CODES } from "../src/diagnostics.js";
import { parseMedia } from "../src/normalise/media.js";
import { parseXml } from "../src/xml.js";

function run(inner: string, timeZone?: string) {
  const root = parseXml(`<residential>${inner}</residential>`);
  if (root === null) throw new Error("test xml has no root");
  const c = new Collector({ tolerant: true });
  const result = parseMedia(root, c, timeZone === undefined ? {} : { timeZone });
  return { result, diagnostics: c.all };
}

describe("parseMedia sources and kinds", () => {
  it("returns empty lists when there are no media elements", () => {
    const { result, diagnostics } = run("<headline>Sample</headline>");
    expect(result).toEqual({ images: [], floorplans: [], documents: [] });
    expect(diagnostics).toEqual([]);
  });

  it("sorts img, floorplan and document into their lists", () => {
    const { result, diagnostics } = run(`
      <objects>
        <img id="m" url="https://img.example.com/main.jpg" format="jpg" modTime="2026-03-04-10:15:00"/>
        <floorplan id="1" url="https://img.example.com/plan.png" format="png"/>
        <document id="1" url="https://img.example.com/brochure.pdf" format="pdf"/>
      </objects>`);
    expect(result).toEqual({
      images: [
        {
          id: "m",
          url: "https://img.example.com/main.jpg",
          format: "jpg",
          modifiedAt: "2026-03-04T10:15:00",
        },
      ],
      floorplans: [
        { id: "1", url: "https://img.example.com/plan.png", format: "png", modifiedAt: null },
      ],
      documents: [
        { id: "1", url: "https://img.example.com/brochure.pdf", format: "pdf", modifiedAt: null },
      ],
    });
    expect(diagnostics).toEqual([]);
  });

  it("reads objects first and then the legacy images element", () => {
    const { result } = run(`
      <images>
        <img id="b" url="https://img.example.com/legacy-b.jpg"/>
        <img id="a" url="https://img.example.com/legacy-a.jpg"/>
      </images>
      <objects>
        <img id="m" url="https://img.example.com/main.jpg"/>
        <img id="1" url="https://img.example.com/one.jpg"/>
      </objects>`);
    expect(result.images.map((i) => i.id)).toEqual(["m", "1", "b", "a"]);
  });

  it("preserves document order and does not sort by id", () => {
    const { result } = run(`
      <objects>
        <img id="b" url="https://img.example.com/b.jpg"/>
        <img id="m" url="https://img.example.com/m.jpg"/>
        <img id="a" url="https://img.example.com/a.jpg"/>
        <img id="10" url="https://img.example.com/10.jpg"/>
        <img id="2" url="https://img.example.com/2.jpg"/>
      </objects>`);
    expect(result.images.map((i) => i.id)).toEqual(["b", "m", "a", "10", "2"]);
  });

  it("keeps an image with id m in its document position", () => {
    const { result } = run(`
      <objects>
        <img id="1" url="https://img.example.com/1.jpg"/>
        <img id="m" url="https://img.example.com/m.jpg"/>
        <img id="2" url="https://img.example.com/2.jpg"/>
      </objects>`);
    expect(result.images.map((i) => i.id)).toEqual(["1", "m", "2"]);
  });

  it("ignores media element names it does not know", () => {
    const { result, diagnostics } = run(`
      <objects>
        <audio id="1" url="https://img.example.com/clip.mp3"/>
        <img id="1" url="https://img.example.com/1.jpg"/>
      </objects>`);
    expect(result.images).toHaveLength(1);
    expect(result.floorplans).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it("uses an empty string when the id attribute is absent", () => {
    const { result } = run('<objects><img url="https://img.example.com/1.jpg"/></objects>');
    expect(result.images[0]?.id).toBe("");
  });

  it("keeps the id verbatim", () => {
    const { result } = run(
      '<objects><img id=" a b " url="https://img.example.com/1.jpg"/></objects>',
    );
    expect(result.images[0]?.id).toBe(" a b ");
  });

  it("uses null for a missing or empty format", () => {
    const { result } = run(`
      <objects>
        <img id="1" url="https://img.example.com/1.jpg"/>
        <img id="2" url="https://img.example.com/2.jpg" format=""/>
      </objects>`);
    expect(result.images.map((i) => i.format)).toEqual([null, null]);
  });
});

describe("parseMedia placeholders and unusable urls", () => {
  it("skips 34 empty placeholders among 3 real images, with one info diagnostic each", () => {
    const placeholders = Array.from({ length: 34 }, () => '<img id="x"/>');
    const inner = [
      '<img id="m" url="https://img.example.com/m.jpg"/>',
      ...placeholders.slice(0, 17),
      '<img id="a" url="https://img.example.com/a.jpg"/>',
      ...placeholders.slice(17),
      '<img id="b" url="https://img.example.com/b.jpg"/>',
    ].join("");
    const { result, diagnostics } = run(`<objects>${inner}</objects>`);
    expect(result.images.map((i) => i.id)).toEqual(["m", "a", "b"]);
    expect(diagnostics).toHaveLength(34);
    for (const d of diagnostics) {
      expect(d.code).toBe("empty-media-placeholder");
      expect(d.severity).toBe("info");
    }
  });

  it("puts the placeholder path on the diagnostic", () => {
    const { diagnostics } = run('<objects><img id="x"/><img id="y"/></objects>');
    expect(diagnostics.map((d) => d.path)).toEqual([
      "residential/objects/img[1]",
      "residential/objects/img[2]",
    ]);
  });

  it("treats a blank url and no file as a placeholder", () => {
    const { result, diagnostics } = run('<objects><img id="1" url="   "/></objects>');
    expect(result.images).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(["empty-media-placeholder"]);
  });

  it("skips a file-only element with media-without-url", () => {
    const { result, diagnostics } = run(
      '<objects><img id="1" file="photos/front.jpg"/><floorplan id="1" file="plan.png"/></objects>',
    );
    expect(result.images).toEqual([]);
    expect(result.floorplans).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(["media-without-url", "media-without-url"]);
    expect(diagnostics[0]?.severity).toBe("warning");
  });

  it("treats an empty url with a file attribute as media-without-url", () => {
    const { diagnostics } = run('<objects><img id="1" url="" file="front.jpg"/></objects>');
    expect(diagnostics.map((d) => d.code)).toEqual(["media-without-url"]);
  });

  it.each([
    ["javascript:alert(1)"],
    ["JavaScript:alert(1)"],
    ["file:///etc/passwd"],
    ["data:image/png;base64,AAAA"],
    ["ftp://img.example.com/1.jpg"],
    ["//img.example.com/1.jpg"],
    ["img.example.com/1.jpg"],
    ["/photos/1.jpg"],
    ["http:"],
    ["https://"],
    ["vbscript:msgbox(1)"],
  ])("skips the url %j with media-without-url", (url) => {
    const { result, diagnostics } = run(`<objects><img id="1" url="${url}"/></objects>`);
    expect(result.images).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(["media-without-url"]);
    expect(diagnostics[0]?.path).toBe("residential/objects/img");
  });

  it.each([
    ["http://img.example.com/1.jpg"],
    ["https://img.example.com/1.jpg"],
    ["HTTPS://img.example.com/1.jpg"],
    ["https://img.example.com/a%20b.jpg?x=1&y=2"],
  ])("accepts the url %j", (url) => {
    const { result, diagnostics } = run(`<objects><img id="1" url="${url}"/></objects>`);
    expect(result.images[0]?.url).toBe(url);
    expect(diagnostics).toEqual([]);
  });

  it("trims the url", () => {
    const { result } = run(
      '<objects><img id="1" url="  https://img.example.com/1.jpg  "/></objects>',
    );
    expect(result.images[0]?.url).toBe("https://img.example.com/1.jpg");
  });

  it("applies the scheme rule to floorplans and documents", () => {
    const { result, diagnostics } = run(`
      <objects>
        <floorplan id="1" url="javascript:alert(1)"/>
        <document id="1" url="data:text/html,x"/>
      </objects>`);
    expect(result.floorplans).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual(["media-without-url", "media-without-url"]);
  });

  it("does not echo the url in the diagnostic message", () => {
    const { diagnostics } = run('<objects><img id="1" url="javascript:alert(1)"/></objects>');
    expect(diagnostics[0]?.message).not.toContain("alert");
  });

  it("gives a url that is not http or https a fixed detail, and a file-only element none", () => {
    const description = DIAGNOSTIC_CODES["media-without-url"].description;
    const { diagnostics } = run(
      '<objects><img id="1" url="file:///private/SECRET.jpg"/><img id="2" file="front.jpg"/></objects>',
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      `${description}: url is not http or https`,
      description,
    ]);
    expect(diagnostics[0]?.message).not.toContain("SECRET");
    expect(diagnostics[0]?.message).not.toContain("file:");
  });
});

describe("parseMedia modTime", () => {
  it("normalises modTime like other dates", () => {
    const { result } = run(
      '<objects><img id="1" url="https://img.example.com/1.jpg" modTime="2026-03-04-10:15:00"/></objects>',
    );
    expect(result.images[0]?.modifiedAt).toBe("2026-03-04T10:15:00");
  });

  it("converts modTime with a time zone", () => {
    const { result } = run(
      '<objects><img id="1" url="https://img.example.com/1.jpg" modTime="2026-01-14-12:30:00"/></objects>',
      "Australia/Perth",
    );
    expect(result.images[0]?.modifiedAt).toBe("2026-01-14T04:30:00Z");
  });

  it("keeps the item with a null modifiedAt and invalid-date for a bad modTime", () => {
    const { result, diagnostics } = run(
      '<objects><img id="1" url="https://img.example.com/1.jpg" modTime="yesterday"/></objects>',
    );
    expect(result.images).toEqual([
      { id: "1", url: "https://img.example.com/1.jpg", format: null, modifiedAt: null },
    ]);
    expect(diagnostics.map((d) => d.code)).toEqual(["invalid-date"]);
  });

  it("gives null with no diagnostic when modTime is absent", () => {
    const { result, diagnostics } = run(
      '<objects><img id="1" url="https://img.example.com/1.jpg"/></objects>',
    );
    expect(result.images[0]?.modifiedAt).toBeNull();
    expect(diagnostics).toEqual([]);
  });
});
