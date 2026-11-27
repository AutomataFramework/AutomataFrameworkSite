import { expect, test } from 'vitest'
import { dayOf, EDITORS, normaliseEmail, parseEditor } from '../../src/waitlist/rules.ts'

test('an address is trimmed and lower-cased', () => {
  expect(normaliseEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  expect(normaliseEmail('a.b+list@sub.example.co.uk')).toBe('a.b+list@sub.example.co.uk')
})

test('what cannot be an address is refused', () => {
  for (const raw of ['', ' ', 'ada', 'ada@', '@example.com', 'ada@example', 'a da@example.com', 'ada@@example.com',
    'ada@example..com', 'ada@-example.com', 'ada@exa\nmple.com', `${'a'.repeat(65)}@example.com`,
    `a@${'b'.repeat(250)}.com`, 'ada@exa_mple.com'])
    expect(normaliseEmail(raw), JSON.stringify(raw)).toBeNull()
})

test('the six editors, and anything else is no pick', () => {
  expect(EDITORS).toEqual(['screens', 'world', 'characters', 'feel', 'sound', 'story'])
  for (const editor of EDITORS) expect(parseEditor(editor)).toBe(editor)
  for (const raw of ['', 'Screens', 'paint', 'world ', "'; DROP TABLE signups"]) expect(parseEditor(raw)).toBe('')
})

test('days are UTC', () => {
  expect(dayOf(Date.UTC(2026, 10, 27, 23, 59))).toBe('2026-11-27')
  expect(dayOf(Date.UTC(2026, 10, 28, 0, 0))).toBe('2026-11-28')
})
