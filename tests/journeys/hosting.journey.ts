// What the host sends around the pages: the safety headers on every page, the licence notices as plain text, and the
// build's commit, which a deploy waits for. `wrangler pages dev` serves dist/ the way Cloudflare Pages does.
import { expect, test } from '@playwright/test'

const POLICY =
  "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

test('every page is sent with its safety headers', async ({ request }) => {
  for (const address of ['/', '/no-such-page', '/licences.txt']) {
    const headers = (await request.get(address)).headers()
    expect(headers['x-content-type-options'], address).toBe('nosniff')
    expect(headers['referrer-policy'], address).toBe('strict-origin-when-cross-origin')
    expect(headers['content-security-policy'], address).toBe(POLICY)
  }
})

// The fonts' licences ask that their notice travel with every copy.
test('the licence notices of both fonts are served as plain text', async ({ request }) => {
  const response = await request.get('/licences.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type'] ?? '').toContain('text/plain')
  const text = await response.text()
  for (const notice of [
    'Copyright 2020 The Fraunces Project Authors',
    'Copyright 2021 The Onest Project Authors',
    'SIL OPEN FONT LICENSE Version 1.1',
  ])
    expect(text, notice).toContain(notice)
})

test('the build says which commit it was made from', async ({ request }) => {
  const response = await request.get('/version.txt')
  expect(response.status()).toBe(200)
  expect((await response.text()).trim()).toMatch(/^([0-9a-f]{40}|local)$/)
})
