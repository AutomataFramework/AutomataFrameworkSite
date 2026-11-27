import { expect, test } from 'vitest'
import {
  dayOf,
  EDITORS,
  LIMITS,
  limitsFrom,
  normaliseEmail,
  parseEditor,
  senderOf,
} from '../../src/waitlist/rules.ts'

test('an address is trimmed and lower-cased', () => {
  expect(normaliseEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  expect(normaliseEmail('a.b+list@sub.example.co.uk')).toBe('a.b+list@sub.example.co.uk')
})

test('what cannot be an address is refused', () => {
  for (const raw of [
    '',
    ' ',
    'ada',
    'ada@',
    '@example.com',
    'ada@example',
    'a da@example.com',
    'ada@@example.com',
    'ada@example..com',
    'ada@-example.com',
    'ada@exa\nmple.com',
    `${'a'.repeat(65)}@example.com`,
    `a@${'b'.repeat(250)}.com`,
    'ada@exa_mple.com',
  ])
    expect(normaliseEmail(raw), JSON.stringify(raw)).toBeNull()
})

test('the six editors, and anything else is no pick', () => {
  expect(EDITORS).toEqual(['screens', 'world', 'characters', 'feel', 'sound', 'story'])
  for (const editor of EDITORS) expect(parseEditor(editor)).toBe(editor)
  for (const raw of ['', 'Screens', 'paint', 'world ', "'; DROP TABLE signups"])
    expect(parseEditor(raw)).toBe('')
})

test('days are UTC', () => {
  expect(dayOf(Date.UTC(2026, 10, 27, 23, 59))).toBe('2026-11-27')
  expect(dayOf(Date.UTC(2026, 10, 28, 0, 0))).toBe('2026-11-28')
})

test('a sender is an IPv4 address whole, or the first 64 bits of an IPv6 address', () => {
  expect(senderOf('203.0.113.7')).toBe('203.0.113.7')
  expect(senderOf('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2')
  expect(senderOf('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2')
  expect(senderOf('2001:db8::1')).toBe('2001:db8:0:0')
  expect(senderOf('::1')).toBe('0:0:0:0')
  expect(senderOf('2001:db8:1:3::1')).not.toBe(senderOf('2001:db8:1:2::1'))
})

test('the limits are 3 posts per sender and 96 per day, unless the environment sets other whole numbers', () => {
  expect(LIMITS).toEqual({ senderPosts: 3, dailyPosts: 96 })
  expect(96 * 31).toBeLessThanOrEqual(3000)
  expect(limitsFrom({})).toEqual(LIMITS)
  expect(limitsFrom({ WAITLIST_SENDER_POSTS: '500', WAITLIST_DAILY_POSTS: '9000' })).toEqual({
    senderPosts: 500,
    dailyPosts: 9000,
  })
  for (const raw of ['', '0', '-1', '2.5', 'lots'])
    expect(limitsFrom({ WAITLIST_SENDER_POSTS: raw, WAITLIST_DAILY_POSTS: raw }), raw).toEqual(LIMITS)
})
