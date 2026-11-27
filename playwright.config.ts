// The journeys: the built site (dist/) driven in real Chromium, WebKit and Firefox, one project per engine, so a failing
// journey names its engine. They run against `wrangler pages dev`, which serves a folder the way Cloudflare Pages does,
// headers and 404s included, with no account. BASE_URL points them at another address instead (the live site).
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

const ENGINES = ['chromium', 'webkit', 'firefox'] as const
const LOCAL = 'http://127.0.0.1:8788'

// Annotated because the repo's tsconfig demands explicit types on everything exported.
const config: PlaywrightTestConfig = defineConfig({
  testDir: 'tests/journeys',
  testMatch: '*.journey.ts',
  // A journey that passes on a retry is a defect to find, not something to hide.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? LOCAL,
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  projects: ENGINES.map((engine) => ({ name: engine, use: { browserName: engine } })),
  ...(process.env.BASE_URL === undefined
    ? {
        webServer: {
          command: 'pnpm exec wrangler pages dev dist --ip 127.0.0.1 --port 8788',
          url: LOCAL,
          reuseExistingServer: !process.env.CI,
          env: { WRANGLER_SEND_METRICS: 'false' },
          timeout: 120_000,
        },
      }
    : {}),
})

export default config
