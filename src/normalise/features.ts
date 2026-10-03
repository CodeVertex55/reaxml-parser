import type { Collector } from "../diagnostics.js";
import type { Features } from "../types.js";
import { child, text, type XmlNode } from "../xml.js";
import { intField, yesNo } from "./primitives.js";

type CountKey = Exclude<keyof Features, "flags" | "other">;

/** Feature elements that carry a count. Each may list alternative element names in priority order. */
const COUNTS: readonly (readonly [CountKey, readonly string[]])[] = [
  ["bedrooms", ["bedrooms"]],
  ["bathrooms", ["bathrooms"]],
  ["ensuites", ["ensuite", "ensuites"]],
  ["garages", ["garages"]],
  ["carports", ["carports"]],
  ["openSpaces", ["openSpaces"]],
  ["toilets", ["toilets"]],
  ["livingAreas", ["livingAreas"]],
];

/** Element names that never become flags. */
const NOT_FLAGS: ReadonlySet<string> = new Set([
  ...COUNTS.flatMap(([, names]) => names),
  "otherFeatures",
]);

function count(
  features: XmlNode,
  key: CountKey,
  names: readonly string[],
  c: Collector,
): number | null {
  for (const name of names) {
    const node = child(features, name);
    if (key === "bedrooms" && text(node)?.toLowerCase() === "studio") return 0;
    const value = intField(node, c);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Reads the `features` child of a listing element. Counts are whole numbers; a bedroom count of
 * "studio" (any case) is 0. Text that is not a number gives null and `unparseable-number` naming
 * the element. Every other child whose text is yes, true or 1 becomes a flag named exactly as
 * the element is written, in document order and without repeats. `otherFeatures` text goes to
 * `other`. With no `features` element every count is null and there are no flags.
 */
export function parseFeatures(listing: XmlNode, c: Collector): Features {
  const features = child(listing, "features");
  const result: Features = {
    bedrooms: null,
    bathrooms: null,
    ensuites: null,
    garages: null,
    carports: null,
    openSpaces: null,
    toilets: null,
    livingAreas: null,
    flags: [],
    other: null,
  };
  if (features === undefined) return result;

  for (const [key, names] of COUNTS) result[key] = count(features, key, names, c);

  const flags = new Set<string>();
  for (const node of features.children) {
    if (!NOT_FLAGS.has(node.name) && yesNo(text(node))) flags.add(node.name);
  }
  result.flags = [...flags];
  result.other = text(child(features, "otherFeatures"));
  return result;
}
