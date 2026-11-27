// Joining, confirming and leaving, against a real SQLite database with the migrations, on an injected clock.
import { expect, test } from 'vitest'
import type { Db } from '../../src/waitlist/db.ts'
import { EDITORS, LIMITS } from '../../src/waitlist/rules.ts'
import { canConfirm, cleanUp, confirm, type Joined, join as joinAs, leave } from '../../src/waitlist/store.ts'
import { hashToken } from '../../src/waitlist/tokens.ts'
import { sqliteDb } from '../fixtures/sqlite-db.ts'

const T0 = Date.UTC(2026, 10, 27, 12)
const MINUTE = 60_000
const HOUR = 60 * MINUTE

const form = (email: string, editor = 'world') => ({ email, editor, trap: '' })
const SECRET = 'test secret'
let nextIp = 0
// Each post comes from a new sender unless a test names one, so only the tests about senders meet that limit.
const join = (db: Db, now: number, f: ReturnType<typeof form>, ip = `10.0.0.${nextIp++}`) =>
  joinAs(db, now, f, { secret: SECRET, ip })
const sent = (result: Joined) => {
  if (result.kind !== 'send') throw new Error(`expected a send, got ${result.kind}`)
  return result
}

test('join, confirm, leave: the row is waiting, then joined with its pick, then gone', async () => {
  const db = sqliteDb()
  const first = sent(await join(db, T0, form(' Ada@Example.com ', 'feel')))
  expect(first.email).toBe('ada@example.com')
  const row = () => db.sqlite.prepare('SELECT * FROM signups').all()
  expect(row()).toMatchObject([
    { email: 'ada@example.com', editor: 'feel', status: 'waiting', joined_at: null },
  ])

  expect(await canConfirm(db, T0 + MINUTE, first.confirmToken)).toBe(true)
  expect(await confirm(db, T0 + MINUTE, first.confirmToken)).toBe(true)
  expect(row()).toMatchObject([{ status: 'joined', joined_at: T0 + MINUTE, confirm_hash: null }])

  await leave(db, first.leaveToken)
  expect(row()).toEqual([])
  await leave(db, first.leaveToken)
  expect(row()).toEqual([])
})

test('no pick is stored as empty, and so is an unknown one', async () => {
  const db = sqliteDb()
  await join(db, T0, form('a@example.com', ''))
  await join(db, T0, form('b@example.com', 'painting'))
  expect(db.sqlite.prepare('SELECT editor FROM signups').all()).toEqual([{ editor: '' }, { editor: '' }])
})

test('every editor can be stored', async () => {
  const db = sqliteDb()
  for (const editor of EDITORS) sent(await join(db, T0, form(`${editor}@example.com`, editor)))
})

test('a bad address is invalid, and the filled hidden field stores and sends nothing', async () => {
  const db = sqliteDb()
  expect(await join(db, T0, form('not an address'))).toEqual({ kind: 'invalid' })
  expect(
    await joinAs(
      db,
      T0,
      { email: 'ada@example.com', editor: 'world', trap: 'x' },
      { secret: SECRET, ip: '1.1.1.1' },
    ),
  ).toEqual({
    kind: 'quiet',
  })
  expect(db.sqlite.prepare('SELECT * FROM signups').all()).toEqual([])
  expect(db.sqlite.prepare('SELECT * FROM sends').all()).toEqual([])
})

test('a joined address gets the same answer as a new one, and its pick never changes', async () => {
  const db = sqliteDb()
  const first = sent(await join(db, T0, form('ada@example.com', 'sound')))
  await confirm(db, T0, first.confirmToken)
  expect(await join(db, T0 + HOUR, form('ada@example.com', 'story'))).toEqual({ kind: 'quiet' })
  expect(db.sqlite.prepare('SELECT editor, status FROM signups').all()).toEqual([
    { editor: 'sound', status: 'joined' },
  ])
})

test('one email per address per 10 minutes; after that a new link replaces the old one', async () => {
  const db = sqliteDb()
  const first = sent(await join(db, T0, form('ada@example.com')))
  expect(await join(db, T0 + 9 * MINUTE, form('ada@example.com'))).toEqual({ kind: 'quiet' })
  const second = sent(await join(db, T0 + 10 * MINUTE, form('ada@example.com', 'story')))
  expect(await canConfirm(db, T0 + 11 * MINUTE, first.confirmToken)).toBe(false)
  expect(await confirm(db, T0 + 11 * MINUTE, second.confirmToken)).toBe(true)
  expect(db.sqlite.prepare('SELECT editor FROM signups').all()).toEqual([{ editor: 'story' }])
})

test('a confirm link works once, and not after 48 hours, and not for anyone else', async () => {
  const db = sqliteDb()
  const ada = sent(await join(db, T0, form('ada@example.com')))
  const bo = sent(await join(db, T0, form('bo@example.com')))
  expect(await confirm(db, T0 + 48 * HOUR, ada.confirmToken)).toBe(false)
  expect(await canConfirm(db, T0 + 48 * HOUR, ada.confirmToken)).toBe(false)
  expect(await confirm(db, T0, 'made-up')).toBe(false)
  expect(await confirm(db, T0, bo.confirmToken)).toBe(true)
  expect(await confirm(db, T0, bo.confirmToken)).toBe(false)
  expect(db.sqlite.prepare("SELECT email FROM signups WHERE status = 'joined'").all()).toEqual([
    { email: 'bo@example.com' },
  ])
})

test('only hashes of the tokens are stored', async () => {
  const db = sqliteDb()
  const ada = sent(await join(db, T0, form('ada@example.com')))
  const stored = JSON.stringify(db.sqlite.prepare('SELECT * FROM signups').all())
  expect(stored).not.toContain(ada.confirmToken)
  expect(stored).not.toContain(ada.leaveToken)
  expect(stored).toContain(await hashToken(ada.leaveToken))
  expect(stored).not.toContain(ada.leaveToken)
  expect(stored).toContain(await hashToken(ada.confirmToken))
})

test(`past ${LIMITS.dailyPosts} emails a day the answer is busy, and the next UTC day is fine again`, async () => {
  const db = sqliteDb()
  for (let i = 0; i < LIMITS.dailyPosts; i++) sent(await join(db, T0, form(`p${i}@example.com`)))
  expect(await join(db, T0, form('late@example.com'))).toEqual({ kind: 'busy' })
  expect(db.sqlite.prepare("SELECT 1 FROM signups WHERE email = 'late@example.com'").all()).toEqual([])
  sent(await join(db, T0 + 12 * HOUR, form('late@example.com')))
})

test('the clean-up, with no form post, removes waiting rows after 7 days and the counts after their day', async () => {
  const db = sqliteDb()
  sent(await join(db, T0, form('waits@example.com')))
  const stays = sent(await join(db, T0, form('stays@example.com')))
  await confirm(db, T0, stays.confirmToken)
  await cleanUp(db, T0 + 7 * 24 * HOUR)
  expect(db.sqlite.prepare('SELECT email FROM signups ORDER BY email').all()).toEqual([
    { email: 'stays@example.com' },
    { email: 'waits@example.com' },
  ])
  await cleanUp(db, T0 + 7 * 24 * HOUR + 1)
  expect(db.sqlite.prepare('SELECT email FROM signups').all()).toEqual([{ email: 'stays@example.com' }])
  expect(db.sqlite.prepare('SELECT * FROM sends').all()).toEqual([])
  expect(db.sqlite.prepare('SELECT * FROM senders').all()).toEqual([])
})

test('a form post runs the clean-up too', async () => {
  const db = sqliteDb()
  sent(await join(db, T0, form('waits@example.com')))
  await join(db, T0 + 7 * 24 * HOUR + 1, form('bad'))
  expect(db.sqlite.prepare('SELECT email FROM signups').all()).toEqual([])
})

test(`past ${LIMITS.senderPosts} emails a day from one sender, that sender is busy and others are not`, async () => {
  const db = sqliteDb()
  for (let i = 0; i < LIMITS.senderPosts; i++) sent(await join(db, T0, form(`s${i}@example.com`), '1.2.3.4'))
  expect(await join(db, T0, form('more@example.com'), '1.2.3.4')).toEqual({ kind: 'busy' })
  sent(await join(db, T0, form('more@example.com'), '5.6.7.8'))
  sent(await join(db, T0 + 24 * HOUR, form('next@example.com'), '1.2.3.4'))
})

test('past a limit, new, waiting and joined addresses all get the same answer', async () => {
  const db = sqliteDb()
  const joined = sent(await join(db, T0, form('joined@example.com')))
  await confirm(db, T0, joined.confirmToken)
  sent(await join(db, T0, form('waiting@example.com')))
  for (let i = 0; i < LIMITS.senderPosts; i++) sent(await join(db, T0, form(`f${i}@example.com`), '9.9.9.9'))
  for (const email of ['new@example.com', 'waiting@example.com', 'joined@example.com'])
    expect(await join(db, T0 + HOUR, form(email), '9.9.9.9'), email).toEqual({ kind: 'busy' })
})

test('the stored sender key is not the IP address, and differs from one day to the next', async () => {
  const db = sqliteDb()
  const key = () => String(db.sqlite.prepare('SELECT key FROM senders').get()?.key)
  await join(db, T0, form('a@example.com'), '203.0.113.7')
  const today = key()
  await join(db, T0 + 24 * HOUR, form('b@example.com'), '203.0.113.7')
  const tomorrow = key()
  expect(today).not.toBe(tomorrow)
  for (const stored of [today, tomorrow]) expect(stored).toMatch(/^[A-Za-z0-9_-]{43}$/)
})

test("after a resend, the first email's leave link still works", async () => {
  const db = sqliteDb()
  const first = sent(await join(db, T0, form('ada@example.com')))
  const second = sent(await join(db, T0 + HOUR, form('ada@example.com')))
  expect(second.leaveToken).toBe(first.leaveToken)
  await leave(db, first.leaveToken)
  expect(db.sqlite.prepare('SELECT * FROM signups').all()).toEqual([])
})

test('two IPv6 senders in one /64 share a limit', async () => {
  const db = sqliteDb()
  for (let i = 0; i < LIMITS.senderPosts; i++)
    sent(await join(db, T0, form(`v6-${i}@example.com`), `2001:db8:1:2::${i + 1}`))
  expect(await join(db, T0, form('v6-more@example.com'), '2001:db8:1:2:ffff::9')).toEqual({ kind: 'busy' })
  sent(await join(db, T0, form('v6-other@example.com'), '2001:db8:1:3::1'))
})

test('a post for a joined or waiting address counts towards the limits like a new one', async () => {
  const db = sqliteDb()
  const ada = sent(await join(db, T0, form('ada@example.com'), '7.7.7.7'))
  await confirm(db, T0, ada.confirmToken)
  expect(await join(db, T0, form('ada@example.com'), '7.7.7.7')).toEqual({ kind: 'quiet' })
  expect(await join(db, T0, form('ada@example.com'), '7.7.7.7')).toEqual({ kind: 'quiet' })
  expect(await join(db, T0, form('new@example.com'), '7.7.7.7')).toEqual({ kind: 'busy' })
})

test('a custom daily limit is kept', async () => {
  const db = sqliteDb()
  const limits = { senderPosts: 100, dailyPosts: 2 }
  sent(await joinAs(db, T0, form('a@example.com'), { secret: SECRET, ip: '1.1.1.1' }, limits))
  sent(await joinAs(db, T0, form('b@example.com'), { secret: SECRET, ip: '1.1.1.2' }, limits))
  expect(await joinAs(db, T0, form('c@example.com'), { secret: SECRET, ip: '1.1.1.3' }, limits)).toEqual({
    kind: 'busy',
  })
})

// The fake runs each statement at once, so these hold the limits under Promise.all; the race itself showed only on a
// real local server (20 posts at once: the old code sent 12, this code sends 3).
test('posts that arrive together from one sender cannot all slip under the limit', async () => {
  const db = sqliteDb()
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => join(db, T0, form(`rush${i}@example.com`), '4.4.4.4')),
  )
  expect(results.filter((result) => result.kind === 'send')).toHaveLength(LIMITS.senderPosts)
  expect(results.filter((result) => result.kind === 'busy')).toHaveLength(20 - LIMITS.senderPosts)
})

test('posts that arrive together from many senders cannot pass the daily limit', async () => {
  const db = sqliteDb()
  const limits = { senderPosts: 100, dailyPosts: 5 }
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      joinAs(db, T0, form(`crowd${i}@example.com`), { secret: SECRET, ip: `5.5.5.${i}` }, limits),
    ),
  )
  expect(results.filter((result) => result.kind === 'send')).toHaveLength(5)
})

test('one sender who keeps posting cannot use up the day for everyone else', async () => {
  const db = sqliteDb()
  for (let i = 0; i < LIMITS.dailyPosts + 4; i++) await join(db, T0, form(`again${i}@example.com`), '6.6.6.6')
  expect((await join(db, T0, form('someone.else@example.com'), '7.7.7.7')).kind).toBe('send')
})
