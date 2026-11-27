// Joining, confirming and leaving the list. Every answer to a form post is one of a few outcomes, and a new, waiting
// or joined address all get the same one, so nobody can learn from the page who has signed up.
import type { Db } from './db.ts'
import {
  CONFIRM_FOR,
  DAILY_SENDS,
  dayOf,
  type Editor,
  normaliseEmail,
  parseEditor,
  RESEND_AFTER,
  WAITING_FOR,
} from './rules.ts'
import { hashToken, newToken } from './tokens.ts'

export interface JoinForm {
  email: string
  editor: string
  /** The hidden field people never see; anything in it means a bot filled the form. */
  trap: string
}

export type Joined =
  | { kind: 'invalid' }
  | { kind: 'busy' }
  /** Nothing to send, and the person is told to check their email all the same. */
  | { kind: 'quiet' }
  | { kind: 'send'; email: string; editor: Editor | ''; confirmToken: string; leaveToken: string }

export async function join(db: Db, now: number, form: JoinForm): Promise<Joined> {
  await db
    .prepare("DELETE FROM signups WHERE status = 'waiting' AND created_at < ?")
    .bind(now - WAITING_FOR)
    .run()
  if (form.trap !== '') return { kind: 'quiet' }
  const email = normaliseEmail(form.email)
  if (email === null) return { kind: 'invalid' }
  const editor = parseEditor(form.editor)

  const row = await db
    .prepare('SELECT status, last_sent_at FROM signups WHERE email = ?')
    .bind(email)
    .first<{ status: string; last_sent_at: number }>()
  // A joined address is never changed by a form post, so nobody can change someone else's pick.
  if (row?.status === 'joined') return { kind: 'quiet' }
  if (row !== null && now - row.last_sent_at < RESEND_AFTER) return { kind: 'quiet' }

  const day = dayOf(now)
  const sent = await db.prepare('SELECT count FROM sends WHERE day = ?').bind(day).first<{ count: number }>()
  if ((sent?.count ?? 0) >= DAILY_SENDS) return { kind: 'busy' }

  const confirmToken = newToken()
  const leaveToken = newToken()
  await db
    .prepare(
      `INSERT INTO signups (email, editor, status, confirm_hash, confirm_expires, leave_hash, created_at, last_sent_at)
       VALUES (?1, ?2, 'waiting', ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT (email) DO UPDATE SET editor = ?2, confirm_hash = ?3, confirm_expires = ?4, leave_hash = ?5,
         last_sent_at = ?6`,
    )
    .bind(email, editor, await hashToken(confirmToken), now + CONFIRM_FOR, await hashToken(leaveToken), now)
    .run()
  await db
    .prepare('INSERT INTO sends (day, count) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET count = count + 1')
    .bind(day)
    .run()
  return { kind: 'send', email, editor, confirmToken, leaveToken }
}

/** Whether a confirm link still works, without using it up: the page shows its button only when it does. */
export async function canConfirm(db: Db, now: number, token: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM signups WHERE confirm_hash = ? AND status = 'waiting' AND confirm_expires > ?")
    .bind(await hashToken(token), now)
    .first()
  return row !== null
}

/** Uses up a confirm link. False when it was used, is too old, or never existed. */
export async function confirm(db: Db, now: number, token: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE signups SET status = 'joined', joined_at = ?2, confirm_hash = NULL, confirm_expires = NULL
       WHERE confirm_hash = ?1 AND status = 'waiting' AND confirm_expires > ?2`,
    )
    .bind(await hashToken(token), now)
    .run()
  return result.meta.changes === 1
}

/** Deletes the row the leave link belongs to. Leaving twice is the same as leaving once. */
export async function leave(db: Db, token: string): Promise<void> {
  await db
    .prepare('DELETE FROM signups WHERE leave_hash = ?')
    .bind(await hashToken(token))
    .run()
}
