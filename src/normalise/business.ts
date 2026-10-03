import type { Collector } from "../diagnostics.js";
import type { BusinessDetails } from "../types.js";
import { attr, child, children, text, type XmlNode } from "../xml.js";
import { leasePeriod } from "./commercial.js";
import { readMoney, type MoneyOptions } from "./price.js";
import { yesNo } from "./primitives.js";

/** A name given as a `name` child's text, falling back to a `name` attribute. */
function nameOf(node: XmlNode): string | null {
  return text(child(node, "name")) ?? attr(node, "name");
}

function categoriesOf(listing: XmlNode): string[] {
  const names: (string | null)[] = [];
  for (const category of children(listing, "businessCategory")) {
    names.push(nameOf(category));
    for (const sub of children(category, "businessSubCategory")) names.push(nameOf(sub));
  }
  return [...new Set(names.filter((name): name is string => name !== null))];
}

function franchiseOf(listing: XmlNode): boolean | null {
  const node = child(listing, "franchise");
  return node === undefined ? null : yesNo(attr(node, "value") ?? text(node));
}

/**
 * Reads business-for-sale detail from the children of a `business` element. Anything missing
 * gives null, or an empty list for categories. Rent comes from `businessLease`, or the first
 * `rent` when there is none. A rent marked `display="no"` has its amount withheld unless
 * `o.includeHiddenPrices` is set (the default is to withhold). The result has no field to say
 * the rent was hidden. Diagnostics never carry amounts.
 */
export function parseBusiness(
  listing: XmlNode,
  c: Collector,
  o: MoneyOptions = { includeHiddenPrices: false },
): BusinessDetails {
  const rentNode = child(listing, "businessLease") ?? child(listing, "rent");
  return {
    categories: categoriesOf(listing),
    takings: text(child(listing, "takings")),
    franchise: franchiseOf(listing),
    terms: text(child(listing, "terms")),
    rent:
      rentNode === undefined
        ? null
        : {
            amount: readMoney(rentNode, c, o).amount,
            period: leasePeriod(rentNode),
          },
  };
}
