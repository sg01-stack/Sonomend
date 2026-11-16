import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// npm run test:production owns a fresh Node server over the exact dist assets.
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: process.env.SONOMEND_TEST_URL || "http://127.0.0.1:4173",
  },
  webServer: undefined,
});
