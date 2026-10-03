import type { Collector } from "../diagnostics.js";
import type { Address } from "../types.js";
import { attr, child, text, type XmlNode } from "../xml.js";
import { yesNo } from "./primitives.js";

/** A street number such as "4A": digits followed by a single letter. */
const LETTER_SUFFIX = /^\d+[A-Za-z]$/;

/** An attribute that defaults to true when absent and is read as yes or no otherwise. */
function flag(node: XmlNode | undefined, name: string): boolean {
  const value = attr(node, name);
  return value === null ? true : yesNo(value);
}

/**
 * Composes the display street line. Number part first (a sub number and street number joined
 * as "sub/number", a lone street number kept as written, or a lot number as "Lot n"), then the
 * street name. Returns null when there is nothing to compose.
 */
function composeStreetLine(
  sub: string | null,
  num: string | null,
  lot: string | null,
  street: string | null,
  onComposite: () => void,
): string | null {
  let numberPart: string | null;
  if (num !== null && sub === null && (num.includes("/") || LETTER_SUFFIX.test(num))) {
    onComposite();
    numberPart = num;
  } else if (sub !== null && num !== null) {
    numberPart = num.startsWith(`${sub}/`) ? num : `${sub}/${num}`;
  } else {
    numberPart = num ?? sub;
  }

  if (numberPart === null && lot !== null) {
    numberPart = /^lot/i.test(lot) ? lot : `Lot ${lot}`;
  }

  const parts = [numberPart, street].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" ");
}

/**
 * Reads the `address` child of a listing element. A missing `address` gives an all-null address
 * that is displayed. `display` and `suburb@display` default to true when absent; a hidden
 * address adds `address-hidden`. The state is upper-cased and the postcode stays a string so
 * leading zeros survive.
 *
 * A street number that already holds a unit separator or a letter suffix while `subNumber` is
 * empty is kept as written and adds `street-number-composite`.
 */
export function parseAddress(listing: XmlNode, c: Collector): Address {
  const node = child(listing, "address");
  if (node === undefined) {
    return {
      display: true,
      subNumber: null,
      lotNumber: null,
      streetNumber: null,
      street: null,
      streetLine: null,
      suburb: null,
      suburbDisplay: true,
      state: null,
      postcode: null,
      country: null,
    };
  }

  const display = flag(node, "display");
  if (!display) c.add("address-hidden", node.path);

  const subNumber = text(child(node, "subNumber"));
  const lotNumber = text(child(node, "lotNumber"));
  const streetNumber = text(child(node, "streetNumber"));
  const street = text(child(node, "street"));
  const suburbNode = child(node, "suburb");

  const streetLine = composeStreetLine(subNumber, streetNumber, lotNumber, street, () => {
    c.add("street-number-composite", node.path);
  });

  return {
    display,
    subNumber,
    lotNumber,
    streetNumber,
    street,
    streetLine,
    suburb: text(suburbNode),
    suburbDisplay: flag(suburbNode, "display"),
    state: text(child(node, "state"))?.toUpperCase() ?? null,
    postcode: text(child(node, "postcode")),
    country: text(child(node, "country")),
  };
}
