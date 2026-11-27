import { expect, test } from 'vitest'
import { confirmation } from '../../src/waitlist/message.ts'

const email = confirmation('ada@example.com', 'https://automataframework.com', 'CONFIRM', 'LEAVE')

test('the email holds the confirm link and the leave link, in words and in HTML', () => {
  expect(email.to).toBe('ada@example.com')
  for (const body of [email.text, email.html]) {
    expect(body).toContain('https://automataframework.com/waitlist/confirm/?t=CONFIRM')
    expect(body).toContain('https://automataframework.com/waitlist/leave/?t=LEAVE')
    expect(body).toContain('probably you')
  }
})

test("a mail app's unsubscribe button leaves in one tap", () => {
  expect(email.headers).toEqual({
    'List-Unsubscribe': '<https://automataframework.com/api/waitlist/leave?t=LEAVE>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  })
})

test('the HTML body escapes what it is given', () => {
  expect(confirmation('a@b.co', 'https://x"><script>', 'T', 'L').html).not.toContain('"><script>')
})
