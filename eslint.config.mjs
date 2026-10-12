import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // This app fetches data on mount / filter-change via plain useEffect +
    // fetch (no data-fetching library in scope), the standard pattern this
    // rule flags as a false positive since the setState calls happen after
    // an await, not synchronously within the effect.
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Plain CommonJS scripts run directly by Node (Docker entrypoint /
    // `npm run db:seed`, one-off migrations), not bundled — require() is
    // intentional here.
    "prisma/seed.cjs",
    "prisma/backfill-payments.cjs",
  ]),
]);

export default eslintConfig;
