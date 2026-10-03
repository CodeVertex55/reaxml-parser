import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    // tsup injects baseUrl, which TypeScript 6 reports as deprecated, so ignoreDeprecations is set for the declaration build only.
    dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
    clean: true,
    sourcemap: true,
    target: "es2022",
  },
]);
