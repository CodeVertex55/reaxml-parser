import { readFileSync } from "node:fs";
import type { Diagnostic, DiagnosticCode, Severity } from "../src/types.js";

/** Reads `test/fixtures/<name>.xml` as text. */
export function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}.xml`, import.meta.url), "utf8");
}

/** The comparable parts of a diagnostic: everything except the message. */
export type DiagnosticShape = {
  code: DiagnosticCode;
  severity: Severity;
  listingId: string | null;
  path: string;
};

export function shape(diagnostic: Diagnostic): DiagnosticShape {
  const { code, severity, listingId, path } = diagnostic;
  return { code, severity, listingId, path };
}

export function shapes(diagnostics: readonly Diagnostic[]): DiagnosticShape[] {
  return diagnostics.map(shape);
}

/** Wraps listing markup in a propertyList root. */
export function feed(inner: string, rootAttributes = ""): string {
  const attributes = rootAttributes === "" ? "" : ` ${rootAttributes}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<propertyList${attributes}>${inner}</propertyList>`;
}

/** A minimal residential listing element with the given identity. */
export function residential(
  uniqueId: string,
  extra = "",
  attributes = 'status="current"',
  agentId = "XNWTEST",
): string {
  return (
    `<residential ${attributes}><agentID>${agentId}</agentID>` +
    `<uniqueID>${uniqueId}</uniqueID>${extra}</residential>`
  );
}
