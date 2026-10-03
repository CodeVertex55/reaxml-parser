import type { Collector } from "../diagnostics.js";
import type { Measure } from "../types.js";
import { attr, text, type XmlNode } from "../xml.js";
import { parseNumber } from "./primitives.js";

type Unit = Measure["unit"];

const UNITS: ReadonlyMap<string, Unit> = new Map<string, Unit>([
  ["squaremeter", "squareMeter"],
  ["squaremetre", "squareMeter"],
  ["sqm", "squareMeter"],
  ["m2", "squareMeter"],
  ["m²", "squareMeter"],
  ["hectare", "hectare"],
  ["hectares", "hectare"],
  ["ha", "hectare"],
  ["acre", "acre"],
  ["acres", "acre"],
  ["square", "square"],
  ["squares", "square"],
  ["meter", "meter"],
  ["metre", "meter"],
  ["meters", "meter"],
  ["metres", "meter"],
  ["m", "meter"],
]);

/** Elements measured in meters when the unit attribute is missing. Others default to area. */
const LINEAR_ELEMENTS: ReadonlySet<string> = new Set(["frontage", "depth"]);

/**
 * Reads a measure element such as `area`, `frontage` or `depth`. A missing node gives null with
 * no diagnostic. Empty text gives `empty-measure`, non-numeric text gives `unparseable-number`
 * and an unrecognised unit gives `unknown-unit`; each returns null. A negative value is not a
 * meaningful measure and is treated like non-numeric text. A stated value of 0 is kept.
 * A missing unit defaults to meters for `frontage` and `depth` and to square meters otherwise.
 */
export function parseMeasure(node: XmlNode | undefined, c: Collector): Measure | null {
  if (node === undefined) return null;

  const raw = text(node);
  if (raw === null) {
    c.add("empty-measure", node.path, node.name);
    return null;
  }

  const value = parseNumber(raw);
  if (value === null || value < 0) {
    c.add("unparseable-number", node.path, node.name);
    return null;
  }

  const rawUnit = attr(node, "unit");
  if (rawUnit === null) {
    return { value, unit: LINEAR_ELEMENTS.has(node.name) ? "meter" : "squareMeter" };
  }

  const unit = UNITS.get(rawUnit.toLowerCase());
  if (unit === undefined) {
    c.add("unknown-unit", node.path, rawUnit);
    return null;
  }
  return { value, unit };
}
