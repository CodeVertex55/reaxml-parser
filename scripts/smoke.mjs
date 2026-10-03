import { readFileSync } from "node:fs";
import { DIAGNOSTIC_CODES, VERSION, parseReaxml } from "../dist/index.js";

function fail(message) {
  console.error(`smoke (esm): ${message}`);
  process.exit(1);
}

if (typeof parseReaxml !== "function") fail("parseReaxml is not exported");
if (typeof VERSION !== "string" || VERSION === "") fail("VERSION is not exported");
if (Object.keys(DIAGNOSTIC_CODES).length === 0) fail("DIAGNOSTIC_CODES is empty");

const xml = readFileSync(new URL("../test/fixtures/residential.xml", import.meta.url), "utf8");
const result = parseReaxml(xml);
if (result.listings.length !== 1) {
  fail(`expected 1 listing, got ${result.listings.length}`);
}

console.log(`smoke (esm): ok, version ${VERSION}`);
