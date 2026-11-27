import { expect, test } from 'vitest'
import { hashToken, newToken } from '../../src/waitlist/tokens.ts'

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
