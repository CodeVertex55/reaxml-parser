import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run, type Io } from "../src/cli.js";
import { DIAGNOSTIC_CODES, parseReaxml } from "../src/index.js";
import { fixture } from "./helpers.js";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const thisFile = readFileSync(new URL("./readme.test.ts", import.meta.url), "utf8");

afterEach(() => {
  vi.restoreAllMocks();
});

/** The first fenced block of a language that follows a heading, without the fences. */
function blockAfter(heading: string, language: string): string {
  const start = readme.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new Error(`README has no section "${heading}"`);
  const fence = "```" + language + "\n";
  const open = readme.indexOf(fence, start);
  if (open === -1) throw new Error(`No ${language} block in "${heading}"`);
  const close = readme.indexOf("\n```", open + fence.length);
  return readme.slice(open + fence.length, close);
}

/** Lines with their indentation and blank lines removed, so layout differences do not count. */
function significantLines(code: string): string[] {
  return code
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** Runs the command-line tool on a fixture and returns what it printed. */
function cliOutput(name: string): string {
  let stdout = "";
  const io: Io = {
    stdout: (s) => {
      stdout += s;
    },
    stderr: () => undefined,
    readFile: () => fixture(name),
  };
  run(["validate", `${name}.xml`], io);
  return stdout;
}

// ---------------------------------------------------------------------------
// Quick start. The body of quickStart() is the README example without its import line.
// Keep the two in sync by hand: the test below fails when they differ.
// ---------------------------------------------------------------------------

function quickStart(): void {
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
}

describe("README quick start", () => {
  it("is the same code as the example in the README", () => {
    const documented = significantLines(blockAfter("Quick start", "ts")).filter(
      (line) => !line.startsWith("import "),
    );
    const start = thisFile.indexOf("function quickStart(): void {");
    const end = thisFile.indexOf('\ndescribe("README quick start"', start);
    const body = thisFile.slice(start, end).split("\n").slice(1);
    const closing = body.lastIndexOf("}");
    const tested = significantLines(body.slice(0, closing).join("\n"));
    expect(documented).toEqual(tested);
  });

  it("prints what the README says it prints", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    quickStart();
    const printed = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(printed).toBe(blockAfter("Quick start", "text"));
  });
});

describe("README command-line samples", () => {
  it("shows the real output for the mixed fixture", () => {
    expect(readme).toContain(`\`\`\`text\n${cliOutput("mixed").trimEnd()}\n\`\`\``);
  });

  it("shows the real output for a fixture with diagnostics", () => {
    expect(readme).toContain(`\`\`\`text\n${cliOutput("image-placeholders").trimEnd()}\n\`\`\``);
  });
});

describe("README trap table", () => {
  const codes = Object.keys(DIAGNOSTIC_CODES) as (keyof typeof DIAGNOSTIC_CODES)[];

  it("mentions every diagnostic code in backticks", () => {
    expect(codes).toHaveLength(19);
    for (const code of codes) {
      expect(readme, `README does not mention \`${code}\``).toContain(`\`${code}\``);
    }
  });

  it("has one table row per code, with the severity the library reports", () => {
    const rows = readme.split("\n").filter((line) => line.startsWith("|"));
    for (const code of codes) {
      const matching = rows.filter((row) => row.includes(`\`${code}\``));
      expect(matching, `expected one table row for ${code}`).toHaveLength(1);
      const cells = (matching[0] ?? "")
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell !== "");
      expect(cells.at(-1), `severity of ${code}`).toBe(DIAGNOSTIC_CODES[code].severity);
    }
  });
});

describe("README writing rules", () => {
  it("has no em dashes, en dashes or exclamation marks outside code", () => {
    const prose = readme.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    expect(prose).not.toMatch(/[\u2013\u2014!]/);
    expect(readme).not.toMatch(/[\u2013\u2014]/);
  });
});
