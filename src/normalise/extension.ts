import type { Collector } from "../diagnostics.js";
import { attr, children, text, type XmlNode } from "../xml.js";
import { parseNumber } from "./primitives.js";

/** Element names that carry a key in their `name` attribute instead of in their own name. */
const NAMED_FIELD = new Set(["extraField", "field"]);

const LAT_KEYS = ["geolat", "latitude", "lat"] as const;
const LNG_KEYS = ["geolong", "geolng", "longitude", "lng", "lon", "long"] as const;

type Location = { lat: number; lng: number };

/**
 * Collects the fields of an `extraFields` element. Children named by key hold the value as
 * text; `extraField` and `field` children that have a `name` attribute hold it in a `value`
 * attribute or as text. Keys are verbatim and values trimmed. A later duplicate replaces an
 * earlier one. `seen` lists every key including those with empty values.
 */
function collect(nodes: readonly XmlNode[], fields: Map<string, string>, seen: Set<string>): void {
  for (const container of nodes) {
    for (const node of container.children) {
      let key: string;
      let value: string | null;
      if (NAMED_FIELD.has(node.name) && Object.hasOwn(node.attrs, "name")) {
        key = node.attrs["name"] ?? "";
        value = attr(node, "value") ?? text(node);
      } else {
        key = node.name;
        value = text(node);
      }
      if (key.trim() === "") continue;
      seen.add(key.toLowerCase());
      if (value !== null) fields.set(key, value);
    }
  }
}

function lookup(
  byLowerKey: ReadonlyMap<string, string>,
  seen: ReadonlySet<string>,
  candidates: readonly string[],
): { present: boolean; value: string | null } {
  const present = candidates.some((key) => seen.has(key));
  const key = candidates.find((candidate) => byLowerKey.has(candidate));
  return { present, value: key === undefined ? null : (byLowerKey.get(key) ?? null) };
}

function readLocation(
  byLowerKey: ReadonlyMap<string, string>,
  seen: ReadonlySet<string>,
): { location: Location | null; anyKey: boolean } {
  const latField = lookup(byLowerKey, seen, LAT_KEYS);
  const lngField = lookup(byLowerKey, seen, LNG_KEYS);
  const anyKey = latField.present || lngField.present;

  const lat = parseNumber(latField.value);
  const lng = parseNumber(lngField.value);
  const valid =
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0);
  return { location: valid ? { lat, lng } : null, anyKey };
}

/**
 * Reads vendor extension fields from the `extraFields` children of a listing element.
 *
 * Returns every non-empty field in `extra`, with keys as written and values trimmed, and adds
 * `extension-fields-present` once when there is any. A location is derived from the latitude
 * and longitude keys (matched without regard to case). Both must be finite numbers in range and
 * not both zero; otherwise `location` is null and, if either key was present, the call adds
 * `invalid-coordinates`. Coordinate text is never echoed into a diagnostic.
 *
 * Fields are held in Maps and copied with `Object.fromEntries`, which defines own properties, so
 * a key such as `__proto__` or `constructor` stays plain data and cannot reach a prototype.
 */
export function parseExtension(
  listing: XmlNode,
  c: Collector,
): { extra: Record<string, string>; location: Location | null } {
  const containers = children(listing, "extraFields");
  const fields = new Map<string, string>();
  const seen = new Set<string>();
  collect(containers, fields, seen);

  const extra: Record<string, string> = Object.fromEntries(fields);
  const anchor = containers[0];
  if (anchor === undefined) return { extra, location: null };

  if (fields.size > 0) c.add("extension-fields-present", anchor.path);

  const byLowerKey = new Map<string, string>();
  for (const [key, value] of fields) byLowerKey.set(key.toLowerCase(), value);
  const { location, anyKey } = readLocation(byLowerKey, seen);
  if (location === null && anyKey) c.add("invalid-coordinates", anchor.path);
  return { extra, location };
}
