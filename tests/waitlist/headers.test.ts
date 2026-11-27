import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { guarded, PRIVATE, SAFETY } from '../../src/waitlist/headers.ts'

/** The headers `_headers` sets for one rule, by its path line. */
function rule(path: string): Record<string, string> {
  const text = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')
  const block = text.split(/\n(?=\S)/).find((part) => part.startsWith(`${path}\n`)) ?? ''
  return Object.fromEntries(
    block
      .split('\n')
      .slice(1)
      .filter((line) => /^\s+[\w-]+:/.test(line))
      .map((line) => {
        const at = line.indexOf(':')
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
      }),
  )
}

test("the functions' safety headers are the static files' own", () => {
  expect(SAFETY).toEqual(rule('/*'))
})

test("the waitlist's static pages get the same private headers as the functions' answers", () => {
  expect(rule('/waitlist/*')).toEqual(PRIVATE)
  // The `/*` rule's Referrer-Policy is taken off first, so the private one is the only one sent.
  expect(readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')).toContain(
    '  ! Referrer-Policy\n',
  )
})

test('a guarded answer carries every safety header, with no-referrer in place of the usual policy', () => {
  const headers = Object.fromEntries(
    guarded(new Response('hi', { headers: { 'Referrer-Policy': 'unsafe-url' } })).headers,
  )
  expect(headers).toMatchObject({
    'x-content-type-options': 'nosniff',
    'content-security-policy': SAFETY['Content-Security-Policy'],
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex',
  })
})
