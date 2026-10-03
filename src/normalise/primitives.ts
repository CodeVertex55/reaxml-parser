import type { Collector } from "../diagnostics.js";
import { text, type XmlNode } from "../xml.js";

/**
 * Optional minus, then an optional dollar sign with optional spaces after it, then digits with
 * optional decimals. Digits may be grouped in thousands: one to three digits, then groups of
 * exactly three, all separated by the same character (a comma, a space or a no-break space).
 *
 * The pattern runs in linear time. No two unbounded runs can match the same characters: the
 * spaces after the dollar sign must be followed by a digit or a point, each grouping separator
 * must be followed by exactly three digits, and every alternative starts with a digit.
 */
const NUMBER_PATTERN =
  /^(-?)(?:\$\s*)?((?:\d{1,3}(?:,\d{3})+|\d{1,3}(?: \d{3})+|\d{1,3}(?:\u00a0\d{3})+|\d+)(?:\.\d*)?|\.\d+)$/;

/** The separators that NUMBER_PATTERN accepts between thousands groups. */
const GROUP_SEPARATORS = /[, \u00a0]/g;

/** True for "yes", "true" and "1" in any case. Everything else, including null, is false. */
export function yesNo(value: string | null): boolean {
  if (value === null) return false;
  const normalised = value.trim().toLowerCase();
  return normalised === "yes" || normalised === "true" || normalised === "1";
}

/**
 * Parses a plain number. A leading minus, a leading dollar sign (optionally followed by spaces),
 * thousands grouping, decimals and surrounding spaces are accepted. Grouping must be valid
 * thousands grouping with one separator throughout, which may be a comma, a space or a no-break
 * space: "1,250", "650 000" and "1 250 000.50" are accepted, while "12,34", "1,2,3", "1 23" and
 * "1,250 000" are not. Negative zero becomes 0. Anything else, including a leading plus sign,
 * a space between the minus and the number, and empty input, gives null.
 */
export function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const match = NUMBER_PATTERN.exec(value.trim());
  if (match === null) return null;
  const parsed = Number(`${match[1] ?? ""}${(match[2] ?? "").replace(GROUP_SEPARATORS, "")}`);
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
