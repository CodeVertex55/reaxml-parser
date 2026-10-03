import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function fail(message) {
  console.error(`smoke (cli): ${message}`);
  process.exit(1);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(args) {
  const out = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
  if (out.error) fail(`could not start the CLI: ${out.error.message}`);
  return out;
}

const validate = run(["validate", "test/fixtures/mixed.xml", "--json"]);
if (validate.status !== 0) {
  fail(`validate exited with ${validate.status}\n${validate.stderr}`);
}

let report;
try {
  report = JSON.parse(validate.stdout);
} catch {
  fail("validate --json did not print valid JSON");
}
for (const key of ["meta", "summary", "warnings"]) {
  if (!(key in report)) fail(`validate --json output has no "${key}" key`);
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = run(["--version"]);
if (version.status !== 0) fail(`--version exited with ${version.status}`);
if (version.stdout.trim() !== pkg.version) {
  fail(`--version printed "${version.stdout.trim()}", expected "${pkg.version}"`);
}

console.log(`smoke (cli): ok, version ${pkg.version}`);
