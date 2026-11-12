import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated or provided files that are not ours to lint:
    "public/pdf.worker.min.mjs",
    "seed/**",
    ".data/**",
    ".data-e2e/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    // The provided domain tests must not be edited (CLAUDE.md) and use `any` in their helpers.
    files: [
      "tests/domain/parse.test.ts",
      "tests/domain/rules.test.ts",
      "tests/domain/orientation.test.ts",
    ],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
