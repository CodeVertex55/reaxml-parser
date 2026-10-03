import type { Collector } from "../diagnostics.js";
import { text, type XmlNode } from "../xml.js";

/** Optional minus, optional dollar sign, then digits with optional commas and decimals. */
const NUMBER_PATTERN = /^(-?)\s*\$?\s*(\d[\d,]*\.?\d*|\.\d+)$/;

/** True for "yes", "true" and "1" in any case. Everything else, including null, is false. */
export function yesNo(value: string | null): boolean {
  if (value === null) return false;
  const normalised = value.trim().toLowerCase();
  return normalised === "yes" || normalised === "true" || normalised === "1";
}

/**
 * Parses a plain number. A leading minus, a leading dollar sign, thousands commas, decimals
 * and surrounding spaces are accepted. Anything else, including empty input, gives null.
 */
export function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const match = NUMBER_PATTERN.exec(value.trim());
  if (match === null) return null;
  const parsed = Number(`${match[1] ?? ""}${(match[2] ?? "").replaceAll(",", "")}`);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Reads a node's text as a number. A missing or empty node gives null with no diagnostic.
 * Text that is not numeric gives null and an `unparseable-number` diagnostic that names the
 * element only, because the raw value could be a hidden price.
 */
export function numberField(node: XmlNode | undefined, c: Collector): number | null {
  const raw = text(node);
  if (node === undefined || raw === null) return null;
  const parsed = parseNumber(raw);
  if (parsed === null) c.add("unparseable-number", node.path, node.name);
  return parsed;
}

/** Like `numberField`, but keeps only the integer part of the value, so "2.0" becomes 2. */
export function intField(node: XmlNode | undefined, c: Collector): number | null {
  const parsed = numberField(node, c);
  return parsed === null ? null : Math.trunc(parsed);
}
