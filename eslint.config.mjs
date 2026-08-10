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
    // Static assets, not source — public/pdf.worker.min.mjs in
    // particular is a ~1.2MB minified bundle copied in by the
    // postinstall script (see package.json), not code to lint.
    "public/**",
  ]),
]);

export default eslintConfig;
