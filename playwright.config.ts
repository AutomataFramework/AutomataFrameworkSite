// The journeys: the built site (dist/) driven in real Chromium, WebKit and Firefox, one project per engine, so a failing
// journey names its engine. They run against `wrangler pages dev`, which serves a folder the way Cloudflare Pages does,
// headers, 404s and functions included, with no account. BASE_URL points them at another address instead (the live site).
import { resolve } from 'node:path'
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

const ENGINES = ['chromium', 'webkit', 'firefox'] as const
const LOCAL = 'http://127.0.0.1:8788'
/** Where the local servers keep the waitlist's database, cleared at every start. */
const STATE = '.wrangler/journeys'
/**
 * Where the two local servers find each other. Their own folder, cleared at every start: an entry a killed server left
 * in the shared one points the site at a mailer that is gone, and every email then fails.
 */
const REGISTRY = resolve('.wrangler/journeys-registry')

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
        // The waitlist's stand-ins: a fresh local database with the migrations, and the mailer, whose send_email
        // binding sends nothing and writes each email under mailer/.wrangler/tmp/email/. The site reaches the mailer
        // through its local service binding, and sets limits high enough that the journeys never meet them.
        webServer: [
          {
            command: `rm -rf ${STATE} ${REGISTRY} mailer/.wrangler/tmp/email && pnpm exec wrangler d1 migrations apply automata-waitlist --local --persist-to ${STATE} && cd mailer && pnpm exec wrangler dev --ip 127.0.0.1 --port 8791 --inspector-port 9231 --persist-to ../${STATE} > ../.wrangler/mailer.log 2>&1`,
            // Its words go to a file: left on Playwright's pipe, which nobody reads, they fill it and the mailer stalls.
            // The address is a page `wrangler dev` serves itself, since the mailer answers nothing on its own.
            url: 'http://127.0.0.1:8791/cdn-cgi/local/explorer/api/local/workers',
            reuseExistingServer: !process.env.CI,
            env: { WRANGLER_SEND_METRICS: 'false', WRANGLER_REGISTRY_PATH: REGISTRY },
            timeout: 120_000,
          },
          {
            command: `pnpm exec wrangler pages dev dist --ip 127.0.0.1 --port 8788 --persist-to ${STATE} --binding WAITLIST_SECRET=journeys --binding WAITLIST_SENDER_POSTS=100000 --binding WAITLIST_DAILY_POSTS=100000`,
            url: LOCAL,
            reuseExistingServer: !process.env.CI,
            env: { WRANGLER_SEND_METRICS: 'false', WRANGLER_REGISTRY_PATH: REGISTRY },
            timeout: 120_000,
          },
        ],
      }
    : {}),
})

export default config
