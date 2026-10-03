# Changelog

## 1.0.0 (unreleased)

First release.

- Parse REAXML documents into typed, normalised listings with `parseReaxml`.
- Support all eight listing kinds: residential, rental, land, rural, commercial, commercial land, business and holiday rental.
- Report 19 structured diagnostics, each with a code, a severity, a listing id and a path. The codes are exported as `DIAGNOSTIC_CODES`.
- Handle the common feed traps: empty image placeholders, file-only media, zero dates, hidden prices, unit-style street numbers, empty area values, vendor extension fields and credentials on the root element.
- Normalise dates in eight formats, with optional conversion to UTC for a given IANA time zone.
- Withhold hidden prices unless `includeHiddenPrices` is set. Never return root element credentials.
- Keep only http and https addresses for media, video and external links.
- Sanitise and bound diagnostic text taken from the document.
- Offer a tolerant mode (the default) that returns errors as diagnostics, and a strict mode that throws `ReaxmlError`.
- Count listings and diagnostics with `summarise`.
- Add the `reaxml-parser` command-line tool with `validate`, `--json`, `--time-zone`, `--strict`, `--version` and `--help`.
- Ship ESM and CommonJS builds with type declarations. The only runtime dependency is `fast-xml-parser`.
