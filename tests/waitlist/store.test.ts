// Joining, confirming and leaving, against a real SQLite database with the migrations, on an injected clock.
import { expect, test } from 'vitest'
import { DAILY_SENDS, EDITORS } from '../../src/waitlist/rules.ts'
import { canConfirm, confirm, join, type Joined, leave } from '../../src/waitlist/store.ts'
import { hashToken } from '../../src/waitlist/tokens.ts'
import { sqliteDb } from '../fixtures/sqlite-db.ts'

const T0 = Date.UTC(2026, 10, 27, 12)
const MINUTE = 60_000
const HOUR = 60 * MINUTE

const form = (email: string, editor = 'world') => ({ email, editor, trap: '' })
const sent = (result: Joined) => {
  if (result.kind !== 'send') throw new Error(`expected a send, got ${result.kind}`)
  return result
}

test('join, confirm, leave: the row is waiting, then joined with its pick, then gone', async () => {
  const db = sqliteDb()
  const first = sent(await join(db, T0, form(' Ada@Example.com ', 'feel')))
  expect(first.email).toBe('ada@example.com')
  const row = () => db.sqlite.prepare('SELECT * FROM signups').all()
  expect(row()).toMatchObject([{ email: 'ada@example.com', editor: 'feel', status: 'waiting', joined_at: null }])

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
  expect(await join(db, T0, { email: 'ada@example.com', editor: 'world', trap: 'x' })).toEqual({ kind: 'quiet' })
  expect(db.sqlite.prepare('SELECT * FROM signups').all()).toEqual([])
  expect(db.sqlite.prepare('SELECT * FROM sends').all()).toEqual([])
})

test("a joined address gets the same answer as a new one, and its pick never changes", async () => {
  const db = sqliteDb()
  const first = sent(await join(db, T0, form('ada@example.com', 'sound')))
  await confirm(db, T0, first.confirmToken)
  expect(await join(db, T0 + HOUR, form('ada@example.com', 'story'))).toEqual({ kind: 'quiet' })
  expect(db.sqlite.prepare('SELECT editor, status FROM signups').all()).toEqual([{ editor: 'sound', status: 'joined' }])
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
  expect(stored).toContain(await hashToken(ada.confirmToken))
})

test(`past ${DAILY_SENDS} emails a day the answer is busy, and the next UTC day is fine again`, async () => {
  const db = sqliteDb()
  for (let i = 0; i < DAILY_SENDS; i++) sent(await join(db, T0, form(`p${i}@example.com`)))
  expect(await join(db, T0, form('late@example.com'))).toEqual({ kind: 'busy' })
  expect(db.sqlite.prepare("SELECT 1 FROM signups WHERE email = 'late@example.com'").all()).toEqual([])
  sent(await join(db, T0 + 12 * HOUR, form('late@example.com')))
})

test('a waiting row older than 7 days is gone after the next post; a joined one stays', async () => {
  const db = sqliteDb()
  sent(await join(db, T0, form('waits@example.com')))
  const stays = sent(await join(db, T0, form('stays@example.com')))
  await confirm(db, T0, stays.confirmToken)
  await join(db, T0 + 7 * 24 * HOUR + 1, form('bad'))
  expect(db.sqlite.prepare('SELECT email FROM signups').all()).toEqual([{ email: 'stays@example.com' }])
})
