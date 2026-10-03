import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { VERSION, parseReaxml, summarise } from "./index.js";
import type { Summary } from "./index.js";
import type { Diagnostic, ParseResult } from "./types.js";

/** Everything the command-line tool does to the outside world, so tests can fake it. */
export type Io = {
  stdout(s: string): void;
  stderr(s: string): void;
  readFile(path: string): string;
};

const USAGE = [
  "Usage:",
  "  reaxml-parser validate <file> [--json] [--time-zone <zone>] [--strict]",
  "  reaxml-parser --version",
  "  reaxml-parser --help",
  "",
  "Options:",
  "  --json               Print meta, summary and diagnostics as JSON",
  "  --time-zone <zone>   IANA zone for dates without an offset, e.g. Australia/Perth",
  "  --strict             Exit 1 on warnings as well as errors",
  "  -v, --version        Print the version",
  "  -h, --help           Print this message",
  "",
  "Exit codes:",
  "  0  no error diagnostics (and no warnings with --strict)",
  "  1  error diagnostics found (or warnings with --strict)",
  "  2  usage error, unreadable file or invalid time zone",
  "",
].join("\n");

type Parsed =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "usage-error"; message: string }
  | {
      kind: "validate";
      file: string;
      json: boolean;
      strict: boolean;
      timeZone: string | undefined;
    };

/** Parses the arguments by hand. Help and version win as soon as they are seen. */
function parseArgs(argv: readonly string[]): Parsed {
  let command: string | undefined;
  let file: string | undefined;
  let json = false;
  let strict = false;
  let timeZone: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "--help" || arg === "-h") return { kind: "help" };
    if (arg === "--version" || arg === "-v") return { kind: "version" };
    if (arg === "--json") json = true;
    else if (arg === "--strict") strict = true;
    else if (arg === "--time-zone" || arg.startsWith("--time-zone=")) {
      let value: string | undefined;
      if (arg === "--time-zone") {
        value = argv[i + 1];
        i += 1;
      } else {
        value = arg.slice("--time-zone=".length);
      }
      if (value === undefined || value === "" || value.startsWith("--")) {
        return { kind: "usage-error", message: "Missing value for --time-zone" };
      }
      timeZone = value;
    } else if (arg.startsWith("-")) {
      return { kind: "usage-error", message: `Unknown option: ${arg}` };
    } else if (command === undefined) {
      command = arg;
    } else if (file === undefined) {
      file = arg;
    } else {
      return { kind: "usage-error", message: `Unexpected argument: ${arg}` };
    }
  }

  if (command === undefined) return { kind: "usage-error", message: "" };
  if (command !== "validate") {
    return { kind: "usage-error", message: `Unknown command: ${command}` };
  }
  if (file === undefined) return { kind: "usage-error", message: "Missing file argument" };
  return { kind: "validate", file, json, strict, timeZone };
}

/** A block of `label: count` lines, or a single `none` line when there is nothing to list. */
function countBlock(title: string, counts: Readonly<Record<string, number | undefined>>): string[] {
  const entries = Object.entries(counts);
  if (entries.length === 0) return [`${title}: none`];
  return [`${title}:`, ...entries.map(([key, count]) => `  ${key}: ${count}`)];
}

/** Replaces control characters with `?`, so text from the feed cannot drive the terminal. */
function plain(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? "?" : char;
  }
  return out;
}

function diagnosticLine(d: Diagnostic): string {
  return `  ${d.severity} ${d.code} ${plain(d.path)} ${plain(d.message)}`;
}

/** Feed-level diagnostics first, then one group per listing in first-seen order. */
function diagnosticGroups(diagnostics: readonly Diagnostic[]): string[] {
  const feedLevel: Diagnostic[] = [];
  const byListing = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    if (d.listingId === null) {
      feedLevel.push(d);
      continue;
    }
    const group = byListing.get(d.listingId);
    if (group === undefined) byListing.set(d.listingId, [d]);
    else group.push(d);
  }

  const lines: string[] = [];
  if (feedLevel.length > 0) {
    lines.push("Feed:", ...feedLevel.map(diagnosticLine), "");
  }
  for (const [id, group] of byListing) {
    lines.push(`Listing ${plain(id)}:`, ...group.map(diagnosticLine), "");
  }
  return lines;
}

/** Plain-text report: the summary block, then the diagnostics. Never includes listing data. */
function formatReport(summary: Summary, diagnostics: readonly Diagnostic[]): string {
  const { error, warning, info, byCode } = summary.diagnostics;
  const lines = [
    `Listings: ${summary.listings}`,
    "",
    ...countBlock("By kind", summary.byKind),
    "",
    ...countBlock("By status", summary.byStatus),
    "",
    `Diagnostics: ${error} errors, ${warning} warnings, ${info} info`,
    "",
  ];
  if (diagnostics.length === 0) {
    lines.push("No diagnostics.", "");
  } else {
    lines.push(...countBlock("By code", byCode), "", ...diagnosticGroups(diagnostics));
  }
  return lines.join("\n");
}

function exitCodeFor(summary: Summary, strict: boolean): number {
  const { error, warning } = summary.diagnostics;
  if (error > 0) return 1;
  if (strict && warning > 0) return 1;
  return 0;
}

/**
 * Runs the command-line tool and returns the exit code. All input and output goes through `io`.
 *
 * Only the summary and the diagnostics are ever printed. Listings, and so addresses, prices and
 * credentials, are never written out.
 */
export function run(argv: string[], io: Io): number {
  const parsed = parseArgs(argv);

  switch (parsed.kind) {
    case "help":
      io.stdout(USAGE);
      return 0;
    case "version":
      io.stdout(`${VERSION}\n`);
      return 0;
    case "usage-error":
      io.stderr(parsed.message === "" ? USAGE : `${parsed.message}\n\n${USAGE}`);
      return 2;
    case "validate":
      break;
  }

  if (parsed.timeZone !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: parsed.timeZone });
    } catch {
      io.stderr(`Invalid time zone: ${parsed.timeZone}\n`);
      return 2;
    }
  }

  let xml: string;
  try {
    xml = io.readFile(parsed.file);
  } catch {
    io.stderr(`Cannot read file: ${parsed.file}\n`);
    return 2;
  }

  let result: ParseResult;
  try {
    result = parseReaxml(xml, parsed.timeZone === undefined ? {} : { timeZone: parsed.timeZone });
  } catch {
    // The error text is withheld, because it could carry text from the feed.
    io.stderr("Unexpected error\n");
    return 2;
  }

  const summary = summarise(result);
  if (parsed.json) {
    const { meta, warnings } = result;
    io.stdout(`${JSON.stringify({ meta, summary, warnings }, null, 2)}\n`);
  } else {
    io.stdout(formatReport(summary, result.warnings));
  }
  return exitCodeFor(summary, parsed.strict);
}

/** True when this file is the program Node was started with, also through an npm bin link. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

/* v8 ignore start */
if (isEntryPoint()) {
  const io: Io = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    readFile: (path) => readFileSync(path, "utf8"),
  };
  // Setting exitCode instead of calling process.exit lets piped output flush first.
  process.exitCode = run(process.argv.slice(2), io);
}
/* v8 ignore stop */
