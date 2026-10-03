const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { DIAGNOSTIC_CODES, VERSION, parseReaxml } = require("../dist/index.cjs");

function fail(message) {
  console.error(`smoke (cjs): ${message}`);
  process.exit(1);
}

if (typeof parseReaxml !== "function") fail("parseReaxml is not exported");
if (typeof VERSION !== "string" || VERSION === "") fail("VERSION is not exported");
if (Object.keys(DIAGNOSTIC_CODES).length === 0) fail("DIAGNOSTIC_CODES is empty");

const xml = readFileSync(join(__dirname, "..", "test", "fixtures", "residential.xml"), "utf8");
const result = parseReaxml(xml);
if (result.listings.length !== 1) {
  fail(`expected 1 listing, got ${result.listings.length}`);
}

console.log(`smoke (cjs): ok, version ${VERSION}`);
