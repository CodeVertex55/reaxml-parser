import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attr, child, children, parseXml, text, XmlParseError } from "../src/xml.js";
import type { XmlNode } from "../src/xml.js";

function root(xml: string): XmlNode {
  const node = parseXml(xml);
  if (node === null) throw new Error("expected a root element");
  return node;
}

describe("parseXml structure", () => {
  it("keeps document order across different element names", () => {
    const a = root("<a><x/><y/><x/></a>");
    expect(a.name).toBe("a");
    expect(a.children.map((c) => c.name)).toEqual(["x", "y", "x"]);
  });

  it("keeps the order of repeated siblings by their content", () => {
    const a = root("<a><x>1</x><y/><x>2</x><x>3</x></a>");
    expect(children(a, "x").map((c) => text(c))).toEqual(["1", "2", "3"]);
  });

  it("reads attributes as strings and keeps numeric-looking text as a string", () => {
    const a = root('<a n="42" z="007"><b>007</b></a>');
    expect(a.attrs).toEqual({ n: "42", z: "007" });
    expect(child(a, "b")?.text).toBe("007");
  });

  it("keeps element and attribute names in their original case and namespaced names as written", () => {
    const a = root('<Root xmlns:ns="urn:x" ns:Attr="v"><ns:Item camelCase="1"/><item/></Root>');
    expect(a.name).toBe("Root");
    expect(a.attrs).toEqual({ "xmlns:ns": "urn:x", "ns:Attr": "v" });
    expect(a.children.map((c) => c.name)).toEqual(["ns:Item", "item"]);
    expect(child(a, "ns:Item")?.attrs).toEqual({ camelCase: "1" });
    expect(child(a, "Item")).toBeUndefined();
    expect(child(a, "ITEM")).toBeUndefined();
  });

  it("ignores comments, the declaration and processing instructions", () => {
    const a = root(
      '<?xml version="1.0" encoding="UTF-8"?><!-- c --><a><!-- inner --><b/><?pi x?></a>',
    );
    expect(a.children.map((c) => c.name)).toEqual(["b"]);
  });

  it("returns an element with no children and empty text for a self-closing tag", () => {
    expect(root("<a/>")).toEqual({ name: "a", attrs: {}, children: [], text: "", path: "a" });
  });

  it("tolerates a leading byte order mark", () => {
    expect(root("﻿<a/>").name).toBe("a");
  });
});

describe("parseXml text", () => {
  it("decodes the five XML entities in text", () => {
    const a = root("<a>1 &amp; 2 &lt;b&gt; &quot;q&quot; &apos;s&apos;</a>");
    expect(a.text).toBe("1 & 2 <b> \"q\" 's'");
  });

  it("decodes decimal and hexadecimal numeric character references in text", () => {
    expect(root("<a>&#65;&#x42;&#x63;</a>").text).toBe("ABc");
  });

  it("decodes entities and numeric references in attribute values", () => {
    const a = root('<a x="1 &amp; 2 &#65; &#x42; &lt;&quot;&apos;&gt;"/>');
    expect(a.attrs["x"]).toBe("1 & 2 A B <\"'>");
  });

  it("decodes only once, so an escaped ampersand never becomes a second entity", () => {
    const a = root('<a x="&amp;#65; &amp;amp;">&amp;#66; &amp;lt;</a>');
    expect(a.attrs["x"]).toBe("&#65; &amp;");
    expect(a.text).toBe("&#66; &lt;");
  });

  it("leaves unknown entities and invalid numeric references as written", () => {
    expect(root("<a>&nbsp; &#99999999; &#0; &#xD800;</a>").text).toBe(
      "&nbsp; &#99999999; &#0; &#xD800;",
    );
  });

  it("does not expand entities declared in a DOCTYPE", () => {
    const a = root('<!DOCTYPE a [<!ENTITY e "boom">]><a>&e;</a>');
    expect(a.text).not.toContain("boom");
  });

  it("reads CDATA as literal text without decoding it", () => {
    const a = root("<a><![CDATA[<raw> &amp; & text]]></a>");
    expect(a.text).toBe("<raw> &amp; & text");
  });

  it("concatenates own text and CDATA segments in order, skipping descendants' text", () => {
    const a = root("<a>one <b>child text</b>two <![CDATA[three]]> four</a>");
    expect(a.text).toBe("one two three four");
    expect(child(a, "b")?.text).toBe("child text");
  });
});

describe("text and attr helpers", () => {
  it("text trims, returns null for empty or whitespace-only, and ignores child element text", () => {
    const a = root("<a><b>  padded  </b><c>   </c><d/><e>x<f>y</f></e><g><![CDATA[ cd ]]></g></a>");
    expect(text(child(a, "b"))).toBe("padded");
    expect(text(child(a, "c"))).toBeNull();
    expect(text(child(a, "d"))).toBeNull();
    expect(text(child(a, "e"))).toBe("x");
    expect(text(child(a, "g"))).toBe("cd");
    expect(text(a)).toBeNull();
  });

  it("text decodes &amp; and reads CDATA", () => {
    const a = root("<a><b>Tom &amp; Jerry</b><c><![CDATA[1 < 2]]></c></a>");
    expect(text(child(a, "b"))).toBe("Tom & Jerry");
    expect(text(child(a, "c"))).toBe("1 < 2");
  });

  it("attr trims and returns null for missing or empty values", () => {
    const a = root('<a p="  v  " q="" r="   "/>');
    expect(attr(a, "p")).toBe("v");
    expect(attr(a, "q")).toBeNull();
    expect(attr(a, "r")).toBeNull();
    expect(attr(a, "missing")).toBeNull();
    expect(attr(a, "P")).toBeNull();
  });

  it("attr does not resolve inherited object keys", () => {
    const a = root("<a/>");
    expect(attr(a, "constructor")).toBeNull();
    expect(attr(a, "toString")).toBeNull();
  });

  it("child, children, text and attr accept undefined", () => {
    expect(text(undefined)).toBeNull();
    expect(attr(undefined, "x")).toBeNull();
    const a = root("<a/>");
    expect(child(a, "nope")).toBeUndefined();
    expect(children(a, "nope")).toEqual([]);
  });

  it("child and children return undefined and [] when given undefined", () => {
    expect(child(undefined, "x")).toBeUndefined();
    expect(children(undefined, "x")).toEqual([]);
  });

  it("child returns the first match and children returns all matches in order", () => {
    const a = root('<a><x i="1"/><y/><x i="2"/></a>');
    expect(attr(child(a, "x"), "i")).toBe("1");
    expect(children(a, "x").map((n) => attr(n, "i"))).toEqual(["1", "2"]);
  });

  it("child only looks at direct children", () => {
    const a = root("<a><b><c/></b></a>");
    expect(child(a, "c")).toBeUndefined();
    expect(children(a, "c")).toEqual([]);
  });
});

describe("path", () => {
  it("indexes repeated siblings only, from 1", () => {
    const a = root(
      "<propertyList><residential><objects><img/><img/><title/></objects></residential><residential/><rental/></propertyList>",
    );
    expect(a.path).toBe("propertyList");
    const residentials = children(a, "residential");
    expect(residentials.map((n) => n.path)).toEqual([
      "propertyList/residential[1]",
      "propertyList/residential[2]",
    ]);
    expect(child(a, "rental")?.path).toBe("propertyList/rental");
    const objects = child(residentials[0], "objects");
    expect(objects?.path).toBe("propertyList/residential[1]/objects");
    expect(children(objects, "img").map((n) => n.path)).toEqual([
      "propertyList/residential[1]/objects/img[1]",
      "propertyList/residential[1]/objects/img[2]",
    ]);
    expect(child(objects, "title")?.path).toBe("propertyList/residential[1]/objects/title");
  });

  it("counts only same-named siblings when names are interleaved", () => {
    const a = root("<a><x/><y/><x/><y/><x/></a>");
    expect(a.children.map((n) => n.path)).toEqual([
      "a/x[1]",
      "a/y[1]",
      "a/x[2]",
      "a/y[2]",
      "a/x[3]",
    ]);
  });
});

describe("empty and malformed documents", () => {
  it("returns null for an empty string, whitespace, a declaration only or comments only", () => {
    expect(parseXml("")).toBeNull();
    expect(parseXml("  \n ")).toBeNull();
    expect(parseXml('<?xml version="1.0" encoding="UTF-8"?>')).toBeNull();
    expect(parseXml('<?xml version="1.0"?>\n<!-- nothing here -->\n')).toBeNull();
  });

  it("throws XmlParseError on mismatched tags", () => {
    expect(() => parseXml("<a><b></a>")).toThrow(XmlParseError);
  });

  it("throws XmlParseError for unclosed, non-XML and prototype-keyword input", () => {
    expect(() => parseXml("<a>")).toThrow(XmlParseError);
    expect(() => parseXml("hello")).toThrow(XmlParseError);
    expect(() => parseXml('<a __proto__="x"/>')).toThrow(XmlParseError);
  });

  it("exposes numeric line and column and a generic message", () => {
    let caught: unknown;
    try {
      parseXml("<a>\n  <b>\n</a>");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(XmlParseError);
    expect(caught).toBeInstanceOf(Error);
    const error = caught as XmlParseError;
    expect(error.name).toBe("XmlParseError");
    expect(error.line).toBe(3);
    expect(typeof error.column).toBe("number");
    expect(error.column).toBeGreaterThan(0);
    expect(error.message).toBe(`Malformed XML at line ${error.line}, column ${error.column}`);
  });

  it("never puts document content in the error message", () => {
    const documents = [
      '<a x="SENTINEL-SECRET" y=><b/></a>',
      "<a SENTINEL-SECRET><b/></a>",
      '<a><SENTINEL-SECRET x="1"></a>',
      '<a x="SENTINEL-SECRET"><b></a>',
      '<a SENTINEL-SECRET="1" SENTINEL-SECRET="2"/>',
      '<a __proto__="SENTINEL-SECRET"/>',
    ];
    for (const xml of documents) {
      let caught: unknown;
      try {
        parseXml(xml);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(XmlParseError);
      expect((caught as XmlParseError).message).not.toContain("SENTINEL-SECRET");
      expect((caught as XmlParseError).message).toMatch(/^Malformed XML/);
    }
  });
});

describe("module hygiene", () => {
  it("does not import any Node-only module", () => {
    const source = readFileSync(new URL("../src/xml.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/require\(/);
    expect(source).not.toMatch(/from\s+["'](fs|path|os|util|stream|buffer|crypto)["']/);
  });
});
