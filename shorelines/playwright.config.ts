import { defineConfig, devices } from "@playwright/test";

/**
 * The golden-path suite talks to a real `next dev` server backed by the
 * Firebase emulators — there is no mocking layer in this app (see CLAUDE.md:
 * guest identity is a real phone verification against real Firestore/Functions
 * rules), so "start the app for real" is the only way to exercise it.
 *
 * The emulators themselves are NOT started here. Run
 * `firebase emulators:start` (and `cd functions && npm run build` at least
 * once, since the Functions emulator serves compiled `lib/`, not `src/`)
 * before `npm run test:e2e`, or use `firebase emulators:exec` to wrap this
 * command the same way `test:emulators` wraps the Vitest suites.
 *
 * `env` here is what actually points the app at the emulators — it overrides
 * .env.local's NEXT_PUBLIC_* values for this spawned process only (Next's
 * dotenv loader never clobbers a var already present in the environment), so
 * this suite runs against demo-shorelines regardless of whatever project
 * .env.local happens to be pointed at for manual testing.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  // Chromium only: the bundled build silently mis-renders Odia dates (see
  // CLAUDE.md's "Known-benign emulator noise" section) and this suite never
  // touches that locale, but it's worth remembering if a spec is ever added
  // that does.
  //
  // Two projects, same spec files: the golden-path suite asserts on behavior,
  // not layout, so running it at a phone viewport too costs nothing and
  // catches a regression the desktop-only default has never once exercised
  // (see the mobile-first-to-desktop plan's risk #3).
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-shorelines",
      // Passed through rather than pinned: whoever moved the emulator off
      // 8080 (see tests/rules/env.ts) needs the spawned dev server to follow.
      ...(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT
        ? {
            NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT:
              process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
          }
        : {}),
    },
  },
});
