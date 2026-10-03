# reaxml-parser

Parse REAXML real-estate feeds into typed, normalised listings, and get a structured warning for every oddity the feed contained.

## Who it is for

You are building an agency website or a portal in Australia or New Zealand, and your CRM or feed provider pushes you REAXML files. You want clean listing objects and you do not want to rediscover every quirk of real feeds yourself. This library turns the XML into typed data and tells you, with a code and a location, each time it had to correct something.

## Install

You need Node 20 or later.

```sh
npm i github:talha55/reaxml-parser
```

The package builds itself on install: installing from GitHub runs its `prepare` script, which compiles `dist`. An install with scripts disabled, such as `npm i --ignore-scripts` or pnpm (which blocks dependency build scripts by default), therefore produces no `dist` and nothing to import. With pnpm, add `reaxml-parser` to `onlyBuiltDependencies` in your pnpm settings, or approve it with `pnpm approve-builds`.

It ships both ESM and CommonJS entry points, and type declarations.

## Quick start

```ts
import { parseReaxml } from "reaxml-parser";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<propertyList date="2026-10-01-08:00:00">
  <residential modTime="2026-09-30-09:00:00" status="current">
    <agentID>XNWTEST</agentID>
    <uniqueID>TEST0001</uniqueID>
    <price display="yes">650000</price>
    <address display="yes">
      <streetNumber>12</streetNumber>
      <street>Example Street</street>
      <suburb display="yes">Testville</suburb>
      <state>wa</state>
      <postcode>0001</postcode>
    </address>
    <headline>Family home close to parks and schools</headline>
    <features><bedrooms>4</bedrooms><bathrooms>2</bathrooms></features>
    <objects>
      <img id="m" url="https://img.example.com/TEST0001/front.jpg" format="jpg"/>
      <img id="a"/>
    </objects>
  </residential>
</propertyList>`;

const { listings, warnings } = parseReaxml(xml, { timeZone: "Australia/Perth" });

for (const listing of listings) {
  const { id, status, address, price, images } = listing;
  console.log(id, status, address.streetLine, address.state, price?.amount, images.length);
}
for (const warning of warnings) {
  console.log(warning.severity, warning.code, warning.path);
}
```

This prints:

```text
XNWTEST:TEST0001 current 12 Example Street WA 650000 1
info empty-media-placeholder propertyList/residential/objects/img[2]
```

The state was upper-cased, and the empty image slot was skipped and reported. Nothing threw.

## What you get back

`parseReaxml(xml, options)` returns three things:

```ts
type ParseResult = {
  meta: { generatedAt: string | null; listingCount: number; hadCredentials: boolean };
  listings: Listing[];
  warnings: Diagnostic[];
};
```

Every listing has the base fields below, shown here abridged. The full definitions, with comments, are in [`src/types.ts`](src/types.ts).

```ts
type ListingBase = {
  kind: ListingKind; // "residential", "rental", "land", ...
  id: string; // `${agentId}:${uniqueId}`, the key to upsert on
  agentId: string;
  uniqueId: string;
  status: ListingStatus; // "current", "sold", ...
  modifiedAt: string | null;
  underOffer: boolean;
  authority: string | null;
  category: string | null;
  headline: string | null;
  description: string | null;
  address: Address; // includes a composed `streetLine` and a `display` flag
  location: { lat: number; lng: number } | null;
  price: Price | null; // amount, hidden, view, range, tax
  features: Features; // counts, plus `flags` such as "airConditioning"
  land: { area: Measure | null; frontage: Measure | null; depth: Measure | null };
  building: { area: Measure | null; energyRating: number | null };
  images: MediaItem[];
  floorplans: MediaItem[];
  documents: MediaItem[];
  videoUrl: string | null;
  externalLinks: string[];
  inspections: Inspection[]; // start, end, raw
  auctionAt: string | null;
  agents: Agent[];
  sold: { price: number | null; priceHidden: boolean; date: string | null } | null;
  extra: Record<string, string>; // vendor extension fields, verbatim
};

type ResidentialListing = ListingBase & {
  kind: "residential" | "land" | "rural" | "holidayRental";
};
type RentalListing = ListingBase & {
  kind: "rental";
  rent: Rent | null;
  bond: number | null;
  availableAt: string | null;
};
type CommercialListing = ListingBase & {
  kind: "commercial" | "commercialLand";
  commercial: CommercialDetails;
};
type BusinessListing = ListingBase & { kind: "business"; business: BusinessDetails };

type Listing = ResidentialListing | RentalListing | CommercialListing | BusinessListing;

type Diagnostic = {
  code: DiagnosticCode;
  severity: "info" | "warning" | "error";
  message: string;
  listingId: string | null; // null for problems with the feed as a whole
  path: string; // for example "propertyList/residential[3]/objects/img[5]"
};
```

`Listing` is a union on `kind`, so checking `listing.kind === "rental"` narrows the type to `RentalListing` and gives you `rent`, `bond` and `availableAt`. `ListingBase` and the four variants are exported, so your own code can name them, for example `function saveRental(listing: RentalListing)`.

The package also exports `summarise(result)`, which counts listings by kind and status and diagnostics by severity and code. It also exports `DIAGNOSTIC_CODES`, `ReaxmlError` and `VERSION`.

### Dates

Dates come back as ISO strings. A date with a time looks like `2026-09-30T09:00:00`, and a date on its own looks like `2026-09-30`. Pass `timeZone` and every date with a time becomes UTC, for example `2026-09-30T01:00:00Z`. Dates on their own stay as they are. See [Limitations](#limitations) for what happens to local times that do not exist or happen twice.

## The trap table

Real feeds are full of small problems. This table lists each one the parser handles, what it does about it, and the diagnostic code you get. Every code the library can report has one row.

| What feeds do in practice                                                                                            | What the parser does                                                                                                                                                                                                                            | Code                       | Severity |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| The root element carries a `username` and `password`                                                                 | Never returns or logs the values. Sets `meta.hadCredentials` to true so you can find and fix the feed                                                                                                                                           | `credentials-in-feed`      | warning  |
| The file has no root element, a different root element, or a root with nothing inside it                             | Returns no listings                                                                                                                                                                                                                             | `empty-document`           | error    |
| An upload is cut short, or the file is not well-formed XML                                                           | Returns no listings. The message gives a line and column and never quotes the document                                                                                                                                                          | `xml-malformed`            | error    |
| A new or vendor-specific element sits beside the listings                                                            | Skips it                                                                                                                                                                                                                                        | `unknown-listing-element`  | warning  |
| A listing has a blank or missing `agentID` or `uniqueID`, or one that holds a control character such as a line break | Skips the listing, because it has no usable identity to upsert on                                                                                                                                                                               | `missing-identity`         | error    |
| The same `agentID` and `uniqueID` appear twice in one file                                                           | Keeps the last one, in the position of the last occurrence                                                                                                                                                                                      | `duplicate-listing`        | warning  |
| A `status` the format does not define, or a typo                                                                     | Treats the listing as `current` and warns. Letter case is ignored. Check the warning before you trust the status                                                                                                                                | `unknown-status`           | warning  |
| Zero dates such as `0000-00-00-00:00:00`, and dates that do not exist                                                | Returns null for that date                                                                                                                                                                                                                      | `invalid-date`             | warning  |
| Empty image slots such as `<img id="a"/>`, and empty floorplan or document slots                                     | Skips them                                                                                                                                                                                                                                      | `empty-media-placeholder`  | info     |
| Media that gives only a `file` name, with no address to fetch it from, or a url that is not http or https            | Skips it                                                                                                                                                                                                                                        | `media-without-url`        | warning  |
| Prices marked hidden, such as `display="no"`, `"false"` or `"0"`                                                     | Returns `amount: null` and `hidden: true`. Any `display` other than `yes`, `true` or `1` (or `range` on the sale price) hides the amount. The agent's `priceView` text is still returned in `view`. Set `includeHiddenPrices` to get the amount | `hidden-price-withheld`    | info     |
| Words in a numeric field, such as `POA` or `TBA`                                                                     | Returns null. The message names the element and never the value                                                                                                                                                                                 | `unparseable-number`       | warning  |
| An area, frontage or depth that has a unit but no value                                                              | Leaves it null, not zero                                                                                                                                                                                                                        | `empty-measure`            | info     |
| A measure with a unit the parser does not know                                                                       | Leaves the measure null                                                                                                                                                                                                                         | `unknown-unit`             | warning  |
| An address marked `display="no"`                                                                                     | Still returns the address fields and `location`, and sets `address.display` to false. Your code must honour that flag when it renders the page                                                                                                  | `address-hidden`           | info     |
| A street number that already holds the unit, such as `2/80` or `4A`, while the sub number is empty                   | Passes it through as written and uses it in `streetLine`, so the unit is never doubled                                                                                                                                                          | `street-number-composite`  | info     |
| Vendor fields in an `extraFields` element                                                                            | Copies them as written into `extra`. Reports once per listing. Takes `location` from latitude and longitude fields when they are valid                                                                                                          | `extension-fields-present` | info     |
| Extension coordinates that are not numbers, are out of range, or are both zero                                       | Leaves `location` null                                                                                                                                                                                                                          | `invalid-coordinates`      | warning  |
| Inspection times written in a form the parser does not know                                                          | Leaves the inspection out of `inspections`. The message holds the first 80 characters of the text                                                                                                                                               | `unparseable-inspection`   | warning  |

A few corrections raise no diagnostic because they are not faults:

- A bedroom count of `studio` becomes `0`.
- Numbers may carry a leading `$` and thousands grouping with commas, spaces or no-break spaces, such as `$650,000` or `1 250 000`. A number uses one separator throughout, and every group after the first has three digits.
- The state is upper-cased, and the postcode stays a string so a leading zero survives.
- Descriptions are entity-decoded, CDATA is supported, and line breaks are kept.
- When a rental lists several rents, the weekly one wins.
- A listing with a `priceView` and no `price` still gets a `price` object, with a null `amount`.

## Kinds and statuses

The element name under the root decides the kind.

| Element          | `kind`           | Extra fields on the listing   |
| ---------------- | ---------------- | ----------------------------- |
| `residential`    | `residential`    | none                          |
| `rental`         | `rental`         | `rent`, `bond`, `availableAt` |
| `land`           | `land`           | none                          |
| `rural`          | `rural`          | none                          |
| `commercial`     | `commercial`     | `commercial`                  |
| `commercialLand` | `commercialLand` | `commercial`                  |
| `business`       | `business`       | `business`                    |
| `holidayRental`  | `holidayRental`  | none                          |

Any other element under the root is skipped with `unknown-listing-element`.

The `status` attribute decides the status. A missing attribute means `current`. The parser only normalises the value and never acts on it: it does not hide, drop or delete a listing because of its status. The last column is a suggestion for your own code.

| Status      | What it usually means                               | Suggested handling                                                     |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `current`   | On the market                                       | Show it                                                                |
| `sold`      | Sold                                                | Show as sold for a while, or hide it                                   |
| `leased`    | Leased                                              | Show as leased for a while, or hide it                                 |
| `withdrawn` | Taken off the market by the agent                   | Hide it                                                                |
| `offmarket` | Still held by the agent but not publicly advertised | Hide it                                                                |
| `deleted`   | Removed by the agent                                | Hide it and keep the row. Do not hard-delete it on a feed status alone |

## Options

```ts
parseReaxml(xml, { timeZone: "Australia/Perth", includeHiddenPrices: false, tolerant: true });
```

| Option                | Default | What it does                                                                                                                                                                                                    |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeZone`            | not set | An IANA zone name. Dates with a time are read as local time in that zone and returned as UTC with a trailing `Z`. A name the runtime does not know throws a `RangeError`, whatever `tolerant` is set to         |
| `includeHiddenPrices` | `false` | When true, hidden amounts are returned with `hidden: true`. When false, their amount is null. An amount is hidden unless its `display` attribute is absent, `yes`, `true` or `1` (or `range` on the sale price) |
| `tolerant`            | `true`  | When true, nothing throws for problems in the document, and errors come back in `warnings`. When false, the first error-severity diagnostic throws a `ReaxmlError` with `code`, `listingId` and `path`          |

## Command-line tool

The package installs a `reaxml-parser` command. It checks a feed and reports what it found.

```sh
npx reaxml-parser validate feed.xml
npx reaxml-parser validate feed.xml --json
npx reaxml-parser validate feed.xml --time-zone Australia/Perth --strict
npx reaxml-parser --version
npx reaxml-parser --help
```

| Option               | What it does                                    |
| -------------------- | ----------------------------------------------- |
| `--json`             | Prints `meta`, `summary` and `warnings` as JSON |
| `--time-zone <zone>` | Reads dates in this IANA zone                   |
| `--strict`           | Exits 1 on warnings as well as errors           |

Exit codes: 0 when there are no error diagnostics, 1 when there are errors (or warnings with `--strict`), and 2 for a usage error, an unreadable file or an unknown time zone.

The tool prints counts and diagnostics only. It prints no listing fields, so credentials, addresses and hidden amounts do not reach your logs. Diagnostics do contain listing ids and short, sanitised excerpts of invalid values, such as an unknown status or a date that could not be read. In the human output, control characters and bidirectional controls in paths, ids and messages are replaced with `?`.

Here is the output for a clean feed with twelve listings of every kind:

```text
Listings: 12

By kind:
  residential: 2
  rental: 2
  land: 2
  rural: 1
  commercial: 2
  commercialLand: 1
  business: 1
  holidayRental: 1

By status:
  current: 7
  sold: 2
  leased: 1
  withdrawn: 1
  offmarket: 1

Diagnostics: 0 errors, 0 warnings, 0 info

No diagnostics.
```

And here is the output for a listing with empty and file-only image slots:

```text
Listings: 1

By kind:
  residential: 1

By status:
  current: 1

Diagnostics: 0 errors, 1 warnings, 2 info

By code:
  empty-media-placeholder: 2
  media-without-url: 1

Listing XNWTEST:TEST0001:
  info empty-media-placeholder propertyList/residential/objects/img[2] Media element with no url and no file was skipped
  warning media-without-url propertyList/residential/objects/img[3] Media with no usable http or https url was skipped
  info empty-media-placeholder propertyList/residential/objects/floorplan Media element with no url and no file was skipped
```

## Ingest recipe

This library parses. It does not watch folders, talk to FTP or write to a database. Here is the shape of an ingest job built around it.

Have your feed provider deliver files to a drop folder outside your web root. Feed files can carry credentials in the root element, so nothing that serves web pages should be able to read them. For each new file, parse it, look at the warnings, and upsert each listing on `listing.id`. Treat any status other than `current` as a withdrawal or a state change, not as a reason to delete the row: a sold listing should show as sold, and a withdrawn one should disappear from search while you keep its history. Feed providers commonly forbid hotlinking, so download each image once and serve it from your own storage. When you are done, move the file to an archive folder. Finally, alert someone when no file has arrived for longer than you expect, because a feed that goes quiet is easy to miss.

```text
on new file in DROP_FOLDER (outside the web root):
    xml = read the file
    result = parseReaxml(xml, { timeZone: "Australia/Perth" })

    if result has an error-severity warning with no listings:
        move the file to FAILED_FOLDER and alert; stop

    log result.warnings by code (never log the file contents)

    for each listing in result.listings:
        upsert row where id = listing.id
        if listing.status is not "current":
            mark the row withdrawn or sold; do not delete it
        for each image in listing.images:
            if the image is not stored yet:
                download image.url and save it to your own storage

    move the file to ARCHIVE_FOLDER

every hour:
    if no file has arrived for longer than expected:
        alert
```

## Security notes

- **Credentials.** The root element can carry a `username` and `password`. The parser never returns or logs the values, never puts them in a diagnostic, and warns with `credentials-in-feed` so you can ask the provider to remove them. Keep feed files out of any folder your web server can serve.
- **Hidden amounts.** Money visibility fails closed. An amount is shown only when its `display` attribute is absent, or is `yes`, `true` or `1` in any case, or is `range` on the sale price. Any other value, such as `no`, `false`, `0`, `hidden` or a value nobody has defined, withholds the amount of the price, rent, sold price, commercial rent and business rent unless you set `includeHiddenPrices`. The `priceView` text is the agent's own public wording, such as "Contact agent", so it is always returned.
- **Hidden addresses.** With `address display="no"` the parser still returns the address fields and `location`, which comes from extension coordinates and can be a precise point. `description`, `headline` and `extra` are the feed's text as written and may mention the street too. Check `address.display`, and do not render the street address or a precise map pin for a hidden address.
- **Identities.** An `agentID` or `uniqueID` that contains a control character (C0, DEL, C1, U+2028 or U+2029) is not a usable identity. The listing is skipped with `missing-identity`, so no listing id, diagnostic or error can carry a line break.
- **Links.** Video, external link and media addresses are kept only when they start with http or https. Anything else, such as a `javascript:` or `file:` address, is dropped.
- **Diagnostic text.** Anything copied from the document into a diagnostic has control characters (C0, DEL, C1, U+2028 and U+2029) and bidirectional controls replaced, and is cut to 80 characters, so a feed cannot fill a log, add lines to it or reorder what it shows. The command-line tool also replaces those characters in what it prints.
- **XML entities.** The parser decodes the five standard entities and numeric references. It does not expand entities declared in a DOCTYPE, and a DOCTYPE that declares an external entity makes the document malformed.
- **Input size.** Every pattern the parser runs over feed text takes linear time, but the whole document is held in memory. Cap the size of a feed before you parse it (see [Limitations](#limitations)).
- **Rendering.** All text fields are data from a third party. Encode values when you render them in HTML, as you would for any user input.

## Limitations

- There is no DTD or schema validation. The parser reads what it recognises and reports what it does not.
- It parses the whole document in memory. A test feed of 3,000 listings, about 5 MB, parses in under a second on a development machine, and the test allows up to 10 seconds. Feeds are usually far smaller. There is no streaming mode yet.
- Memory use is roughly eight times the feed size for typical feeds, and far higher for a document that is mostly one very large text node. An out-of-memory failure cannot be caught, so cap the input size before parsing. 50 MB is a reasonable ceiling for one feed file.
- The listing `id` joins the agent ID and the unique ID with a colon. If either one contains a colon, two different listings can end up with the same `id`. Use `agentId` and `uniqueId` together as your key if that could happen.
- The XML library prefixes element names that match members of JavaScript objects, such as `toString`, with `__`.
- The whole document is reported as `xml-malformed`, with no listings, when elements are nested more than 100 levels below the root element, when an element or an attribute is named `__proto__`, `constructor` or `prototype`, or when the DOCTYPE declares an external entity.
- In mixed content, an element's text is only its own text. Text inside its child elements is not included, so `<description>Before <b>bold</b> after</description>` gives `"Before  after"`.
- Vendor extension fields are read in three shapes: child elements named by key, `extraField` elements, and `field` elements, where the last two carry a `name` attribute and a value as text or in a `value` attribute. Other shapes are not read.
- With `timeZone` set, a local time that does not exist because the clocks went forward is shifted forward by the length of the gap. A local time that happens twice because the clocks went back resolves to the earlier instant. Without `timeZone`, times are returned as local times with no offset.

## Roadmap

- An npm release.
- Streaming parse for very large feeds.
- More vendor extension shapes.

## Licence

MIT. See [LICENSE](LICENSE).
