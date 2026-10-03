import { describe, expect, it } from "vitest";
import { run, type Io } from "../src/cli.js";
import { VERSION } from "../src/index.js";
import { fixture } from "./helpers.js";

type Captured = { code: number; stdout: string; stderr: string };

/** Runs the CLI with fake IO. Only the paths listed in `files` are readable. */
function cli(argv: string[], files: Record<string, string> = {}): Captured {
  let stdout = "";
  let stderr = "";
  const io: Io = {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
  };
  const code = run(argv, io);
  return { code, stdout, stderr };
}

function validate(name: string, extra: string[] = []): Captured {
  return cli(["validate", `${name}.xml`, ...extra], { [`${name}.xml`]: fixture(name) });
}

describe("run: version and help", () => {
  it("prints the version for --version and -v", () => {
    for (const flag of ["--version", "-v"]) {
      const out = cli([flag]);
      expect(out).toEqual({ code: 0, stdout: `${VERSION}\n`, stderr: "" });
    }
  });

  it("prints usage on stdout for --help and -h and exits 0", () => {
    for (const flag of ["--help", "-h"]) {
      const out = cli([flag]);
      expect(out.code).toBe(0);
      expect(out.stderr).toBe("");
      expect(out.stdout).toContain("Usage:");
      expect(out.stdout).toContain("validate <file>");
      expect(out.stdout).toContain("--time-zone");
      expect(out.stdout).toContain("--strict");
      expect(out.stdout).toContain("--json");
    }
  });

  it("treats help after the command as help", () => {
    const out = cli(["validate", "--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("Usage:");
  });
});

describe("run: usage errors", () => {
  it("prints usage on stderr and exits 2 with no arguments", () => {
    const out = cli([]);
    expect(out.code).toBe(2);
    expect(out.stdout).toBe("");
    expect(out.stderr).toContain("Usage:");
  });

  it("rejects an unknown command", () => {
    const out = cli(["frobnicate", "feed.xml"]);
    expect(out.code).toBe(2);
    expect(out.stdout).toBe("");
    expect(out.stderr).toContain("Unknown command: frobnicate");
    expect(out.stderr).toContain("Usage:");
  });

  it("rejects an unknown flag", () => {
    const out = validate("residential", ["--nope"]);
    expect(out.code).toBe(2);
    expect(out.stdout).toBe("");
    expect(out.stderr).toContain("Unknown option: --nope");
    expect(out.stderr).toContain("Usage:");
  });

  it("rejects a missing file argument", () => {
    const out = cli(["validate"]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("Missing file argument");
    expect(out.stderr).toContain("Usage:");
  });

  it("rejects a second file argument", () => {
    const out = cli(["validate", "a.xml", "b.xml"], { "a.xml": "<x/>", "b.xml": "<x/>" });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("Unexpected argument: b.xml");
  });

  it("rejects --time-zone without a value", () => {
    for (const argv of [
      ["validate", "feed.xml", "--time-zone"],
      ["validate", "feed.xml", "--time-zone="],
      ["validate", "feed.xml", "--time-zone", "--json"],
    ]) {
      const out = cli(argv, { "feed.xml": fixture("residential") });
      expect(out.code).toBe(2);
      expect(out.stderr).toContain("Missing value for --time-zone");
    }
  });

  it("rejects a value given to a flag that takes none", () => {
    const out = validate("residential", ["--json=yes"]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("Unknown option: --json=yes");
  });
});

describe("run: unreadable file", () => {
  it("prints a short message and exits 2 without a stack trace", () => {
    const out = cli(["validate", "missing.xml"]);
    expect(out.code).toBe(2);
    expect(out.stdout).toBe("");
    expect(out.stderr).toBe("Cannot read file: missing.xml\n");
  });
});

describe("run: exit codes", () => {
  it("exits 0 for a feed with no diagnostics", () => {
    expect(validate("mixed").code).toBe(0);
    expect(validate("residential").code).toBe(0);
  });

  it("exits 1 for an error-severity diagnostic", () => {
    expect(validate("missing-identity").code).toBe(1);
    expect(validate("malformed").code).toBe(1);
    expect(validate("empty").code).toBe(1);
  });

  it("exits 0 for warnings only without --strict and 1 with it", () => {
    expect(validate("unknown-status").code).toBe(0);
    expect(validate("unknown-status", ["--strict"]).code).toBe(1);
  });

  it("exits 0 for info diagnostics only, even with --strict", () => {
    expect(validate("composite-street-number").code).toBe(0);
    expect(validate("composite-street-number", ["--strict"]).code).toBe(0);
  });

  it("exits 1 for errors whether or not --strict is given", () => {
    expect(validate("missing-identity", ["--strict"]).code).toBe(1);
  });

  it("applies the same exit codes in --json mode", () => {
    expect(validate("mixed", ["--json"]).code).toBe(0);
    expect(validate("missing-identity", ["--json"]).code).toBe(1);
    expect(validate("unknown-status", ["--json"]).code).toBe(0);
    expect(validate("unknown-status", ["--json", "--strict"]).code).toBe(1);
  });
});

describe("run: human output", () => {
  it("prints a summary block for the mixed feed", () => {
    const out = validate("mixed");
    expect(out.stderr).toBe("");
    expect(out.stdout).toBe(
      [
        "Listings: 12",
        "",
        "By kind:",
        "  residential: 2",
        "  rental: 2",
        "  land: 2",
        "  rural: 1",
        "  commercial: 2",
        "  commercialLand: 1",
        "  business: 1",
        "  holidayRental: 1",
        "",
        "By status:",
        "  current: 7",
        "  sold: 2",
        "  leased: 1",
        "  withdrawn: 1",
        "  offmarket: 1",
        "",
        "Diagnostics: 0 errors, 0 warnings, 0 info",
        "",
        "No diagnostics.",
        "",
      ].join("\n"),
    );
  });

  it("lists diagnostics by code in alphabetical order", () => {
    const out = validate("image-placeholders").stdout;
    expect(out).toContain("Diagnostics: 0 errors, 1 warnings, 2 info");
    expect(out).toContain("By code:\n  empty-media-placeholder: 2\n  media-without-url: 1\n");
  });

  it("shows feed-level diagnostics first, then each listing", () => {
    const out = validate("zero-dates").stdout;
    const feedLevel = out.indexOf("Feed:");
    const listing = out.indexOf("Listing XNWTEST:TEST0001:");
    expect(feedLevel).toBeGreaterThan(-1);
    expect(listing).toBeGreaterThan(feedLevel);
    const lines = out.split("\n");
    expect(lines).toContain(
      "  warning invalid-date propertyList Date that cannot be parsed, so the value became null: 0000-00-00-00:00:00",
    );
    expect(lines).toContain(
      "  warning invalid-date propertyList/residential/auction Date that cannot be parsed, so the value became null: 0000-00-00",
    );
  });

  it("prints one line per diagnostic with severity, code, path and message", () => {
    const out = validate("missing-identity").stdout;
    expect(out.split("\n")).toContain(
      "  error missing-identity propertyList/residential[1] Listing without agentID or uniqueID, so it was skipped",
    );
  });

  it("is deterministic and contains no colour codes", () => {
    const first = validate("zero-dates").stdout;
    const second = validate("zero-dates").stdout;
    expect(second).toBe(first);
    expect(first).not.toContain("\u001b");
  });

  it("prints no listing content, only what diagnostics carry", () => {
    const out = validate("residential").stdout;
    expect(out).not.toContain("Example Street");
    expect(out).not.toContain("TEST0001");
  });

  it("uses no dashes as punctuation and no exclamation marks", () => {
    for (const name of ["mixed", "zero-dates", "missing-identity", "credentials"]) {
      const out = validate(name);
      expect(out.stdout + out.stderr).not.toMatch(/[–—!]/);
    }
    expect(cli(["--help"]).stdout).not.toMatch(/[–—!]/);
  });
});

describe("run: --json", () => {
  it("prints only meta, summary and warnings as indented JSON", () => {
    const out = validate("missing-identity", ["--json"]);
    expect(out.stderr).toBe("");
    const parsed: unknown = JSON.parse(out.stdout);
    expect(Object.keys(parsed as object)).toEqual(["meta", "summary", "warnings"]);
    expect(parsed).not.toHaveProperty("listings");
    expect(parsed).toMatchObject({
      meta: { listingCount: 1, hadCredentials: false },
      summary: { listings: 1, diagnostics: { error: 1, byCode: { "missing-identity": 1 } } },
      warnings: [{ code: "missing-identity", severity: "error", listingId: null }],
    });
    expect(out.stdout).toContain('\n  "meta": {\n    "generatedAt"');
  });

  it("writes nothing but the JSON document to stdout", () => {
    const out = validate("mixed", ["--json"]);
    expect(out.stdout.endsWith("}\n")).toBe(true);
    expect(() => JSON.parse(out.stdout)).not.toThrow();
  });
});

describe("run: --time-zone", () => {
  it("accepts a separate value and the = form", () => {
    for (const extra of [["--time-zone", "Australia/Perth"], ["--time-zone=Australia/Perth"]]) {
      const out = validate("mixed", ["--json", ...extra]);
      expect(out.code).toBe(0);
      const parsed = JSON.parse(out.stdout) as { meta: { generatedAt: string } };
      expect(parsed.meta.generatedAt).toMatch(/Z$/);
    }
  });

  it("exits 2 with a clear message for an invalid zone", () => {
    for (const extra of [["--time-zone", "Bad/Zone"], ["--time-zone=Bad/Zone"]]) {
      const out = validate("mixed", extra);
      expect(out.code).toBe(2);
      expect(out.stdout).toBe("");
      expect(out.stderr).toBe("Invalid time zone: Bad/Zone\n");
    }
  });
});

describe("run: nothing from the feed leaks", () => {
  it("never prints credentials, in either mode", () => {
    for (const extra of [[], ["--json"], ["--strict"], ["--json", "--strict"]]) {
      const out = validate("credentials", extra);
      expect(out.stdout + out.stderr).not.toContain("feeduser-SENTINEL");
      expect(out.stdout + out.stderr).not.toContain("feedpass-SENTINEL");
    }
  });

  it("reports the credentials warning without the values", () => {
    const out = validate("credentials");
    expect(out.stdout).toContain("credentials-in-feed");
    expect(out.code).toBe(0);
    expect(validate("credentials", ["--strict"]).code).toBe(1);
  });

  it("never prints hidden prices, in either mode", () => {
    for (const extra of [[], ["--json"]]) {
      const out = validate("hidden-price", extra);
      expect(out.stdout + out.stderr).not.toContain("987654");
    }
  });
});
