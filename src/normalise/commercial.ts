import type { Collector } from "../diagnostics.js";
import type { CommercialDetails } from "../types.js";
import { attr, child, children, text, type XmlNode } from "../xml.js";
import { parseDate, type DateOptions } from "./dates.js";
import { readMoney, taxOf, type MoneyOptions } from "./price.js";
import { intField, numberField, parseNumber, yesNo } from "./primitives.js";

type Period = "annual" | "month" | "week";

const PERIODS: ReadonlyMap<string, Period> = new Map<string, Period>([
  ["annual", "annual"],
  ["annually", "annual"],
  ["year", "annual"],
  ["yearly", "annual"],
  ["pa", "annual"],
  ["month", "month"],
  ["monthly", "month"],
  ["week", "week"],
  ["weekly", "week"],
]);

const LISTING_TYPES: ReadonlyMap<string, NonNullable<CommercialDetails["listingType"]>> = new Map<
  string,
  NonNullable<CommercialDetails["listingType"]>
>([
  ["sale", "sale"],
  ["lease", "lease"],
  ["both", "both"],
]);

const TENANCIES: ReadonlyMap<string, NonNullable<CommercialDetails["tenancy"]>> = new Map<
  string,
  NonNullable<CommercialDetails["tenancy"]>
>([
  ["unknown", "unknown"],
  ["vacant", "vacant"],
  ["tenanted", "tenanted"],
]);

/**
 * The period of a rent element, from its `period` attribute in any case. A missing or unknown
 * period counts as annual. Shared with the business normaliser.
 */
export function leasePeriod(node: XmlNode): Period {
  return PERIODS.get(attr(node, "period")?.toLowerCase() ?? "") ?? "annual";
}

/** A value attribute, falling back to the element text, lower-cased. */
function valueOf(node: XmlNode | undefined): string | null {
  return (attr(node, "value") ?? text(node))?.toLowerCase() ?? null;
}

function rentOf(listing: XmlNode, c: Collector, o: MoneyOptions): CommercialDetails["rent"] {
  const node = child(listing, "commercialRent");
  if (node === undefined) return null;
  const { amount, hidden } = readMoney(node, c, o);
  return {
    amount,
    period: leasePeriod(node),
    plusOutgoings: yesNo(attr(node, "plusOutgoings")),
    tax: taxOf(node),
    hidden,
  };
}

/**
 * Reads rent per square metre as a range. The element holds either a `range` child with `min`
 * and `max` children, or plain text that counts as both bounds. A reversed range is swapped.
 * Returns null when the element is absent or empty, including a `range` with no bounds.
 */
function rentPerSquareMeterOf(
  listing: XmlNode,
  c: Collector,
): CommercialDetails["rentPerSquareMeter"] {
  const node = child(listing, "rentPerSquareMeter") ?? child(listing, "rentPerSquareMetre");
  if (node === undefined) return null;

  const range = child(node, "range");
  if (range !== undefined) {
    const minNode = child(range, "min");
    const maxNode = child(range, "max");
    const min = numberField(minNode, c);
    const max = numberField(maxNode, c);
    if (min === null && max === null && text(minNode) === null && text(maxNode) === null) {
      return null;
    }
    return min !== null && max !== null && min > max ? { min: max, max: min } : { min, max };
  }

  const raw = text(node);
  if (raw === null) return null;
  const value = parseNumber(raw);
  if (value === null) c.add("unparseable-number", node.path, node.name);
  return { min: value, max: value };
}

function categoriesOf(listing: XmlNode): string[] {
  const names = children(listing, "commercialCategory").map(
    (node) => attr(node, "name") ?? text(node),
  );
  return [...new Set(names.filter((name): name is string => name !== null))];
}

/**
 * Reads commercial detail from the children of a `commercial` or `commercialLand` element.
 * Anything missing gives null, or an empty list for categories. A `commercialRent` whose
 * `display` is anything other than absent, `yes`, `true` or `1` has its amount withheld unless
 * `includeHiddenPrices` is set, with the same handling as the other money fields. Diagnostics
 * never carry amounts.
 */
export function parseCommercial(
  listing: XmlNode,
  c: Collector,
  o: MoneyOptions & DateOptions,
): CommercialDetails {
  const leaseEnd = child(listing, "currentLeaseEndDate");
  return {
    listingType:
      LISTING_TYPES.get(
        attr(child(listing, "commercialListingType"), "value")?.toLowerCase() ?? "",
      ) ?? null,
    categories: categoriesOf(listing),
    rent: rentOf(listing, c, o),
    rentPerSquareMeter: rentPerSquareMeterOf(listing, c),
    outgoings: numberField(child(listing, "outgoings"), c),
    returnPercent: numberField(child(listing, "return"), c),
    tenancy: TENANCIES.get(valueOf(child(listing, "tenancy")) ?? "") ?? null,
    zone: text(child(listing, "zone")),
    carSpaces: intField(child(listing, "carSpaces"), c),
    currentLeaseEndAt:
      leaseEnd === undefined
        ? null
        : parseDate(
            text(leaseEnd),
            leaseEnd.path,
            c,
            o.timeZone === undefined ? {} : { timeZone: o.timeZone },
          ),
  };
}
