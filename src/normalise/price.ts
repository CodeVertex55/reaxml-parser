import type { Collector } from "../diagnostics.js";
import type { Listing, Price, Rent } from "../types.js";
import { attr, child, children, text, type XmlNode } from "../xml.js";
import { parseDate, type DateOptions } from "./dates.js";
import { numberField, parseNumber } from "./primitives.js";

export type MoneyOptions = { includeHiddenPrices: boolean };

const TAX: ReadonlyMap<string, Price["tax"]> = new Map<string, Price["tax"]>([
  ["inclusive", "inclusive"],
  ["exclusive", "exclusive"],
  ["exempt", "exempt"],
]);

const PERIODS: ReadonlyMap<string, Rent["period"]> = new Map<string, Rent["period"]>([
  ["week", "week"],
  ["weekly", "week"],
  ["month", "month"],
  ["monthly", "month"],
  ["year", "year"],
  ["yearly", "year"],
  ["annual", "year"],
  ["annually", "year"],
]);

/** The tax basis from a money element's `tax` attribute. Anything unrecognised is "unknown". */
export function taxOf(node: XmlNode): Price["tax"] {
  return TAX.get(attr(node, "tax")?.toLowerCase() ?? "") ?? "unknown";
}

/** The value of a node's `display` attribute, trimmed and lower-cased. Null when absent. */
function displayMode(node: XmlNode): string | null {
  return attr(node, "display")?.toLowerCase() ?? null;
}

/**
 * Reads the amount of a money element. When the element is marked `display="no"` and hidden
 * prices are not wanted, the text is not parsed: the amount is null and, when the element had
 * any text, a `hidden-price-withheld` diagnostic names the element only. Otherwise the amount
 * is parsed, and `hidden` still reports the display flag.
 */
export function readMoney(
  node: XmlNode,
  c: Collector,
  o: MoneyOptions,
): { amount: number | null; hidden: boolean } {
  const hidden = displayMode(node) === "no";
  if (hidden && !o.includeHiddenPrices) {
    // An element with no text has nothing to withhold, so no diagnostic is added.
    if (text(node) !== null) c.add("hidden-price-withheld", node.path, node.name);
    return { amount: null, hidden };
  }
  return { amount: numberField(node, c), hidden };
}

/**
 * Parses a range attribute such as "400000-450000" or "$400,000 - $450,000". A reversed range
 * such as "450000-400000" is returned swapped, so min is never greater than max.
 */
function parseRange(value: string | null): { min: number; max: number } | null {
  if (value === null) return null;
  const parts = value.split("-");
  if (parts.length !== 2) return null;
  const min = parseNumber(parts[0] ?? null);
  const max = parseNumber(parts[1] ?? null);
  if (min === null || max === null) return null;
  return min <= max ? { min, max } : { min: max, max: min };
}

function viewOf(listing: XmlNode): string | null {
  return text(child(listing, "priceView"));
}

/**
 * Reads the sale price from the `price` and `priceView` children of a listing element.
 * Returns null when neither exists.
 *
 * `display="no"` marks the price hidden: unless `includeHiddenPrices` is set the amount is null
 * and `hidden-price-withheld` is added. `display="range"` returns the `range` attribute as a
 * range even when hidden prices are not included, because a range is the public form.
 * `view` comes from `priceView` whatever the display mode. Diagnostics never carry amounts.
 */
export function parsePrice(listing: XmlNode, c: Collector, o: MoneyOptions): Price | null {
  const node = child(listing, "price");
  const view = viewOf(listing);
  if (node === undefined) {
    return view === null
      ? null
      : { amount: null, hidden: false, view, range: null, tax: "unknown" };
  }

  const { amount, hidden } = readMoney(node, c, o);
  const range = displayMode(node) === "range" ? parseRange(attr(node, "range")) : null;
  return { amount, hidden, view, range, tax: taxOf(node) };
}

function periodOf(node: XmlNode): Rent["period"] {
  return PERIODS.get(attr(node, "period")?.toLowerCase() ?? "") ?? "week";
}

/**
 * Reads rent from the `rent` children of a listing element. Several may exist for different
 * periods; the weekly one wins, otherwise the first. A missing or unknown period counts as
 * weekly. Hidden handling is the same as for `parsePrice`. Returns null when there is no
 * `rent` element.
 */
export function parseRent(listing: XmlNode, c: Collector, o: MoneyOptions): Rent | null {
  const nodes = children(listing, "rent");
  const chosen = nodes.find((node) => periodOf(node) === "week") ?? nodes[0];
  if (chosen === undefined) return null;

  const { amount, hidden } = readMoney(chosen, c, o);
  return { amount, period: periodOf(chosen), hidden, view: viewOf(listing) };
}

/**
 * Reads the `soldDetails` child of a listing element. The price comes from `soldPrice`, or
 * `price` when that is missing, and the date from `soldDate` or `date`. A price marked
 * `display="no"` sets `priceHidden` and is withheld unless `includeHiddenPrices` is set.
 * Returns null when there is no `soldDetails` element.
 */
export function parseSold(
  listing: XmlNode,
  c: Collector,
  o: MoneyOptions & DateOptions,
): Listing["sold"] {
  const details = child(listing, "soldDetails");
  if (details === undefined) return null;

  const priceNode = child(details, "soldPrice") ?? child(details, "price");
  const money = priceNode === undefined ? null : readMoney(priceNode, c, o);

  const dateNode = child(details, "soldDate") ?? child(details, "date");
  const date =
    dateNode === undefined
      ? null
      : parseDate(
          text(dateNode),
          dateNode.path,
          c,
          o.timeZone === undefined ? {} : { timeZone: o.timeZone },
        );

  return { price: money?.amount ?? null, priceHidden: money?.hidden ?? false, date };
}
