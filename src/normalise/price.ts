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

/** `display` values that show an amount. Compared trimmed and lower-cased. */
const SHOWN: ReadonlySet<string> = new Set(["yes", "true", "1"]);

/** The value of a node's `display` attribute, trimmed and lower-cased. Null when absent or empty. */
function displayMode(node: XmlNode): string | null {
  return attr(node, "display")?.toLowerCase() ?? null;
}

/**
 * Whether a money element is hidden. This fails closed: the amount is shown only when
 * `display` is absent or empty, or is `yes`, `true` or `1` in any case, or is `range` where
 * the caller allows range mode (the sale price only). Any other value, such as `no`, `false`,
 * `0`, `hidden` or a value nobody has defined, hides the amount.
 */
function isHidden(node: XmlNode, rangeAllowed: boolean): boolean {
  const mode = displayMode(node);
  if (mode === null || SHOWN.has(mode)) return false;
  return !(rangeAllowed && mode === "range");
}

/**
 * Reads the amount of a money element. When the element is hidden (see `isHidden`) and hidden
 * prices are not wanted, the text is not parsed: the amount is null and, when the element had
 * any text, a `hidden-price-withheld` diagnostic names the element only. Otherwise the amount
 * is parsed, and `hidden` still reports whether the element was hidden. `rangeAllowed` is true
 * only for the sale price, where `display="range"` is a public form.
 */
export function readMoney(
  node: XmlNode,
  c: Collector,
  o: MoneyOptions,
  rangeAllowed = false,
): { amount: number | null; hidden: boolean } {
  const hidden = isHidden(node, rangeAllowed);
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
 * The price is shown only when `display` is absent, `yes`, `true`, `1` or `range`. Any other
 * value marks it hidden: unless `includeHiddenPrices` is set the amount is null and
 * `hidden-price-withheld` is added. `display="range"` returns the `range` attribute as a range
 * even when hidden prices are not included, because a range is the public form.
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

  const { amount, hidden } = readMoney(node, c, o, true);
  const range = displayMode(node) === "range" ? parseRange(attr(node, "range")) : null;
  return { amount, hidden, view, range, tax: taxOf(node) };
}

function periodOf(node: XmlNode): Rent["period"] {
  return PERIODS.get(attr(node, "period")?.toLowerCase() ?? "") ?? "week";
}

/**
 * Reads rent from the `rent` children of a listing element. Several may exist for different
 * periods; the weekly one wins, otherwise the first. A missing or unknown period counts as
 * weekly. Hidden handling is the same as for `parsePrice`, except that `display="range"` hides
 * the amount. Returns null when there is no `rent` element.
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
 * `price` when that is missing, and the date from `soldDate` or `date`. A price whose `display`
 * is anything other than absent, `yes`, `true` or `1` sets `priceHidden` and is withheld unless
 * `includeHiddenPrices` is set.
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
