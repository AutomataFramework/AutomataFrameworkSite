import { expect, test } from 'vitest'
import { hashToken, hmac, newToken } from '../../src/waitlist/tokens.ts'

test('a token is 32 random bytes in base64url, and no two are alike', () => {
  const tokens = new Set(Array.from({ length: 200 }, newToken))
  expect(tokens.size).toBe(200)
  for (const token of tokens) {
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  }
})

test('the hash is SHA-256 in hex, and the same token always hashes the same', async () => {
  expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  const token = newToken()
  expect(await hashToken(token)).toBe(await hashToken(token))
})

test('an HMAC is SHA-256 under the secret, in base64url, and depends on both', async () => {
  // RFC 4231 test case 2.
  expect(Buffer.from(await hmac('Jefe', 'what do ya want for nothing?'), 'base64url').toString('hex')).toBe(
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  )
  expect(await hmac('a', 'm')).not.toBe(await hmac('b', 'm'))
  expect(await hmac('a', 'm')).not.toBe(await hmac('a', 'n'))
})
