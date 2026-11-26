// The journeys: the built site (dist/) driven in real Chromium, WebKit and Firefox, one project per engine, so a failing journey
// names its engine and CI plays each engine's share of a piece on its own. They run against `wrangler pages dev`, which serves a folder the way Cloudflare Pages does,
// headers and 404s included, with no account. BASE_URL points them at another address instead (the live site).
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

const ENGINES = ['chromium', 'webkit', 'firefox'] as const
const LOCAL = 'http://127.0.0.1:8788'
const baseURL = process.env.BASE_URL ?? LOCAL

// A first visit to the real game is asked which language to play in before anything else (the game's own picker). The
// journeys are about the page around the game, so each one starts as a player who has already chosen English: the same
// setting the game's own journeys seed (`automata.<game id>.settings`). The picture step presses the picker's Go for the
// first-visit look, and `tests/features/pictures` holds that.
const ENGLISH = JSON.stringify({ format: 1, sections: { language: { format: 1, language: 'en' } } })

// Annotated because the repo's tsconfig demands explicit types on everything exported.
const config: PlaywrightTestConfig = defineConfig({
  testDir: 'tests/journeys',
  testMatch: '*.journey.ts',
  // A journey that passes on a retry is a defect to find, not something to hide.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  // A button that is not there should fail in seconds, not at the end of a 30 second test. Motion is off for every journey
  // but `motion.journey.ts`, which turns it on: a picture or a measurement taken while the page is still arriving would
  // differ from run to run, and an engine's animation timing is not what these journeys are about.
  use: {
    baseURL,
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    reducedMotion: 'reduce',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [{ name: 'automata.crate-game.settings', value: ENGLISH }],
        },
      ],
    },
    // A failed journey keeps Playwright's own record of it (a trace: every step, the page at each, the network and the
    // console), which CI uploads. Before this a journey that failed once on code that had just passed left nothing to read.
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
