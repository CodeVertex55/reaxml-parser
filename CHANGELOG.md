# Changelog

## Unreleased

- The repository moved to github.com/CodeVertex55 after a GitHub account rename. The package metadata and the install command point at the new address. The old address still redirects.

## 1.0.0 (2026-10-04)

First release.

- Parse REAXML documents into typed, normalised listings with `parseReaxml`. A value for `xml` that is not a string throws a `TypeError` before anything else.
- Support all eight listing kinds: residential, rental, land, rural, commercial, commercial land, business and holiday rental.
- Export `ListingBase` and the named variants `ResidentialListing`, `RentalListing`, `CommercialListing` and `BusinessListing`. `Listing` is their union.
- Report 19 structured diagnostics, each with a code, a severity, a listing id and a path. The codes are exported as `DIAGNOSTIC_CODES`.
- Handle the common feed traps: empty image placeholders, file-only media, zero dates, hidden prices, unit-style street numbers, empty area values, vendor extension fields and credentials on the root element.
- Normalise dates in eight formats, with optional conversion to UTC for a given IANA time zone.
- Read numbers with a leading `$` and thousands grouping by comma, space or no-break space, such as `650,000` or `1 250 000.50`. Malformed or mixed grouping gives null.
- Run every pattern over feed text in linear time, so a hostile value cannot stall a parse.
- Withhold hidden amounts unless `includeHiddenPrices` is set. Visibility fails closed: an amount is shown only when `display` is absent, `yes`, `true` or `1`, or `range` on the sale price. This applies to the price, rent, sold price, commercial rent and business rent. Never return root element credentials.
- Skip a listing whose `agentID` or `uniqueID` contains a control character, with `missing-identity`, so no id or diagnostic can carry a line break.
- Keep only http and https addresses for media, video and external links. Media with any other kind of url is reported with a fixed detail that never quotes the url.
- Sanitise and bound diagnostic text taken from the document: control characters, including C1 controls and the line and paragraph separators, and bidirectional controls are replaced, and details are cut to 80 code points.
- Offer a tolerant mode (the default) that returns errors as diagnostics, and a strict mode that throws `ReaxmlError`.
- Count listings and diagnostics with `summarise`.
- Add the `reaxml-parser` command-line tool with `validate`, `--json`, `--time-zone`, `--strict`, `--version` and `--help`. Its human output replaces control and bidirectional characters with `?`.
- Ship ESM and CommonJS builds with type declarations. The only runtime dependency is `fast-xml-parser`.
