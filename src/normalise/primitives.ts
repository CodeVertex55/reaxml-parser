import type { Collector } from "../diagnostics.js";
import { text, type XmlNode } from "../xml.js";

/**
 * Optional minus, optional dollar sign, then digits with optional decimals. Commas are allowed
 * only as thousands grouping: one to three digits, then groups of exactly three.
 */
const NUMBER_PATTERN = /^(-?)\s*\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)$/;

/** True for "yes", "true" and "1" in any case. Everything else, including null, is false. */
export function yesNo(value: string | null): boolean {
  if (value === null) return false;
  const normalised = value.trim().toLowerCase();
  return normalised === "yes" || normalised === "true" || normalised === "1";
}

/**
 * Parses a plain number. A leading minus, a leading dollar sign, thousands commas, decimals
 * and surrounding spaces are accepted. Commas must be valid thousands grouping, so "1,250" is
 * accepted and "12,34" is not. Negative zero becomes 0. Anything else, including a leading
 * plus sign and empty input, gives null.
 */
export function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const match = NUMBER_PATTERN.exec(value.trim());
  if (match === null) return null;
  const parsed = Number(`${match[1] ?? ""}${(match[2] ?? "").replaceAll(",", "")}`);
  if (!Number.isFinite(parsed)) return null;
  return parsed === 0 ? 0 : parsed;
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
  if (parsed === null) return null;
  const whole = Math.trunc(parsed);
  return whole === 0 ? 0 : whole;
}
