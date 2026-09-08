import { defineConfig } from "playwright/test";
import path from "node:path";

// Browser tests for the seller workspace. Run against a dev server you've already started:
//
//   npx next dev --webpack -p 3001        (in one terminal)
//   npx playwright test -c e2e/playwright.config.ts
//
// Tests sign in with the admin cookie (sha256 of ADMIN_PASSWORD). The password comes from the
// repo's .env.local — the same file the dev server reads — so nothing needs exporting by hand;
// a value already in the shell wins. Where tests need specific numbers they intercept the API
// with a fixture, so the rendering is proved without writing orders into the database.
try {
 process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
} catch {
 // No .env.local (CI) — ADMIN_PASSWORD must then be in the environment.
}

export default defineConfig({
 testDir: ".",
 testMatch: /.*\.e2e\.ts/,
 timeout: 60_000,
 // Assertions wait longer than Playwright's 5s default: the Home page now makes ten requests on
 // load (holds, attention, setup, a 1,400-piece inventory) and a webpack cold compile under two
 // workers can push a mocked response past 5s. Everything that timed out passed alone; this is
 // headroom for the machine, not for the app.
 expect: { timeout: 15_000 },
 retries: 0,
 reporter: [["list"]],
 use: {
  baseURL: process.env.E2E_BASE || "http://localhost:3001",
  headless: true,
  viewport: { width: 1280, height: 900 },
 },
});
