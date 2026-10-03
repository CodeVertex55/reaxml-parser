import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  URL: "readonly",
};

const commonJsGlobals = {
  require: "readonly",
  module: "writable",
  exports: "writable",
  __dirname: "readonly",
  __filename: "readonly",
};

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["scripts/**"],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { ...nodeGlobals, ...commonJsGlobals } },
    // These files exist to prove that require() works on the built CommonJS bundle.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
