import { defineConfig } from "tsup";

// The two builds run at the same time, so neither cleans the output folder: a clean in one could
// delete the other's files. The `clean` script empties dist before every build instead.
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    // tsup injects baseUrl, which TypeScript 6 reports as deprecated, so ignoreDeprecations is set for the declaration build only.
    dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
    clean: false,
    sourcemap: true,
    target: "es2022",
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    clean: false,
    target: "node20",
  },
]);
