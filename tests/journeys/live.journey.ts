// Run only against the live address, once a deploy has uploaded: it waits for Cloudflare to serve exactly the build
// that was just uploaded, so the journeys that follow judge this build and not the one before it.
import { expect, test } from '@playwright/test'

const want = process.env.EXPECT_SITE ?? ''

test.skip(want === '', 'Only for the live address: EXPECT_SITE names the build to wait for.')

test('the live address serves this build', async ({ request }) => {
  await expect
    .poll(async () => (await (await request.get(`/version.txt?at=${Date.now()}`)).text()).trim(), {
      timeout: 180_000,
      intervals: [5_000],
    })
    .toBe(want)
})
