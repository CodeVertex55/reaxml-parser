import { XMLParser, XMLValidator } from "fast-xml-parser";

/** One element of a parsed document, with its children in document order. */
export type XmlNode = {
  /** Element name exactly as written, including any namespace prefix. */
  name: string;
  /** Attribute values as decoded strings, keyed by the names as written. */
  attrs: Record<string, string>;
  /** Direct child elements in document order. */
  children: XmlNode[];
  /** The node's own text and CDATA segments joined in order, entity-decoded and not trimmed. */
  text: string;
  /** Slash-separated element names from the root, with a 1-based `[n]` on repeated siblings. */
  path: string;
};

/**
 * Thrown by `parseXml` when the document is not well-formed. The message is generic and never
 * contains any text from the document, because messages are likely to be logged.
 */
export class XmlParseError extends Error {
  /** 1-based line of the problem, or 0 when the position is unknown. */
  readonly line: number;
  /** 1-based column of the problem, or 0 when the position is unknown. */
  readonly column: number;

  constructor(line: number, column: number) {
    super(line > 0 ? `Malformed XML at line ${line}, column ${column}` : "Malformed XML");
    this.name = "XmlParseError";
    this.line = line;
    this.column = column;
  }
}

// Entity processing is switched off in the parser and done once here instead. fast-xml-parser
// leaves numeric character references undecoded, and decoding in two places could turn an
// escaped "&amp;#65;" into "A". Turning it off also stops DOCTYPE entities from being expanded.
const PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  cdataPropName: "#cdata",
  processEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

const ATTRIBUTES_KEY = ":@";
const TEXT_KEY = "#text";
const CDATA_KEY = "#cdata";

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const ENTITY_PATTERN = /&(?:#x([0-9a-fA-F]{1,8})|#([0-9]{1,8})|(amp|lt|gt|quot|apos));/g;

/** Whether a code point is a legal XML 1.0 character. */
function isXmlChar(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

/** Decodes the five XML entities and numeric references in a single pass. */
function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(
    ENTITY_PATTERN,
    (match, hex: string | undefined, dec: string | undefined, named: string | undefined) => {
      if (named !== undefined) return NAMED_ENTITIES[named] ?? match;
      const codePoint =
        hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec ?? "", 10);
      return isXmlChar(codePoint) ? String.fromCodePoint(codePoint) : match;
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The element name of a preserveOrder entry, or null for text, CDATA and other non-elements. */
function elementName(entry: Record<string, unknown>): string | null {
  for (const key of Object.keys(entry)) {
    if (key !== ATTRIBUTES_KEY && key !== TEXT_KEY && key !== CDATA_KEY) return key;
  }
  return null;
}

function convertAttributes(entry: Record<string, unknown>): Record<string, string> {
  const raw = entry[ATTRIBUTES_KEY];
  if (!isRecord(raw)) return {};
  const pairs: [string, string][] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") pairs.push([key, decodeEntities(value)]);
  }
  return Object.fromEntries(pairs);
}

/** Text carried by a `#cdata` entry, which is a list of `#text` entries. Never entity-decoded. */
function cdataText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  let out = "";
  for (const part of value) {
    if (isRecord(part) && typeof part[TEXT_KEY] === "string") out += part[TEXT_KEY];
  }
  return out;
}

function convertElement(
  entry: Record<string, unknown>,
  name: string,
  path: string,
  siblingIndex: number,
  siblingCount: number,
): XmlNode {
  const ownPath = siblingCount > 1 ? `${path}[${siblingIndex}]` : path;
  const items = entry[name];
  const elements: { name: string; entry: Record<string, unknown> }[] = [];
  let text = "";

  if (Array.isArray(items)) {
    for (const item of items) {
      if (!isRecord(item)) continue;
      const itemName = elementName(item);
      if (itemName !== null) {
        elements.push({ name: itemName, entry: item });
      } else if (typeof item[TEXT_KEY] === "string") {
        text += decodeEntities(item[TEXT_KEY]);
      } else if (CDATA_KEY in item) {
        text += cdataText(item[CDATA_KEY]);
      }
    }
  }

  const totals = new Map<string, number>();
  for (const element of elements) totals.set(element.name, (totals.get(element.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const children = elements.map((element) => {
    const index = (seen.get(element.name) ?? 0) + 1;
    seen.set(element.name, index);
    return convertElement(
      element.entry,
      element.name,
      `${ownPath}/${element.name}`,
      index,
      totals.get(element.name) ?? 1,
    );
  });

  return { name, attrs: convertAttributes(entry), children, text, path: ownPath };
}

/** Whether a character code is whitespace or a byte order mark. */
function isBlank(code: number): boolean {
  return code === 0x20 || code === 0x9 || code === 0xa || code === 0xd || code === 0xfeff;
}

/**
 * True when the document holds nothing but whitespace, XML declarations, processing
 * instructions, comments and a DOCTYPE. This is one forward scan using indexOf from the
 * current position, so its cost is linear in the input. An unterminated construct counts as
 * content, which lets the validator report it as malformed.
 */
function hasNoContent(xml: string): boolean {
  const length = xml.length;
  let pos = 0;
  for (;;) {
    while (pos < length && isBlank(xml.charCodeAt(pos))) pos++;
    if (pos >= length) return true;

    let close: number;
    if (xml.startsWith("<?", pos)) {
      close = xml.indexOf("?>", pos + 2);
      if (close === -1) return false;
      pos = close + 2;
    } else if (xml.startsWith("<!--", pos)) {
      close = xml.indexOf("-->", pos + 4);
      if (close === -1) return false;
      pos = close + 3;
    } else if (xml.startsWith("<!DOCTYPE", pos)) {
      // Walk to the first ">" or "[" without looking past it, then skip an internal subset.
      let i = pos + 9;
      while (i < length && xml[i] !== ">" && xml[i] !== "[") i++;
      if (i >= length) return false;
      if (xml[i] === "[") {
        const subsetEnd = xml.indexOf("]", i + 1);
        if (subsetEnd === -1) return false;
        i = subsetEnd + 1;
        const gt = xml.indexOf(">", i);
        if (gt === -1) return false;
        i = gt;
      }
      pos = i + 1;
    } else {
      return false;
    }
  }
}

/**
 * Parses a document into an ordered tree and returns the root element, or null when the
 * document has no element (empty, whitespace, declaration or comments only). Comments,
 * the XML declaration and processing instructions are dropped.
 *
 * @throws XmlParseError when the document is not well-formed.
 */
export function parseXml(xml: string): XmlNode | null {
  if (hasNoContent(xml)) return null;

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const { line, col } = validation.err;
    throw new XmlParseError(typeof line === "number" ? line : 0, typeof col === "number" ? col : 0);
  }

  let parsed: unknown;
  try {
    parsed = PARSER.parse(xml);
  } catch {
    // The parser can still refuse a valid document (reserved names, nesting limit). Its
    // message may quote the document, so it is not passed on.
    throw new XmlParseError(0, 0);
  }

  if (!Array.isArray(parsed)) return null;
  try {
    for (const entry of parsed) {
      if (!isRecord(entry)) continue;
      const name = elementName(entry);
      if (name !== null) return convertElement(entry, name, name, 1, 1);
    }
  } catch (error) {
    // Deep nesting can exhaust the stack during conversion.
    if (error instanceof RangeError) throw new XmlParseError(0, 0);
    throw error;
  }
  return null;
}

/** First direct child element with this exact (case-sensitive) name. */
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((candidate) => candidate.name === name);
}

/** All direct child elements with this exact (case-sensitive) name, in document order. */
export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node === undefined ? [] : node.children.filter((candidate) => candidate.name === name);
}

/** The node's own text, trimmed. An empty result becomes null. */
export function text(node: XmlNode | undefined): string | null {
  if (node === undefined) return null;
  const trimmed = node.text.trim();
  return trimmed === "" ? null : trimmed;
}

/** An attribute value, trimmed. A missing attribute or an empty result becomes null. */
export function attr(node: XmlNode | undefined, name: string): string | null {
  if (node === undefined || !Object.hasOwn(node.attrs, name)) return null;
  const trimmed = node.attrs[name]?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
