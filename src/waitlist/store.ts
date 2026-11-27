// Joining, confirming and leaving the list. A new, waiting or joined address gets the same answer to a form post,
// below the limits and past them, so nobody can learn from the page who has signed up.
import type { Db } from './db.ts'
import {
  CONFIRM_FOR,
  dayOf,
  type Editor,
  LIMITS,
  type Limits,
  normaliseEmail,
  parseEditor,
  RESEND_AFTER,
  senderOf,
  WAITING_FOR,
} from './rules.ts'
import { hashToken, hmac, newToken } from './tokens.ts'

export interface JoinForm {
  email: string
  editor: string
  /** The hidden field people never see; anything in it means a bot filled the form. */
  trap: string
}

/** Who is posting: the secret behind the leave tokens and sender keys, and the sender's IP address (never stored). */
export interface Sender {
  secret: string
  ip: string
}

export type Joined =
  | { kind: 'invalid' }
  | { kind: 'busy' }
  /** Nothing to send, and the person is told to check their email all the same. */
  | { kind: 'quiet' }
  | { kind: 'send'; email: string; editor: Editor | ''; confirmToken: string; leaveToken: string }

/** The leave token for an address: the same in every email, so every leave link the site ever sent still works. */
export const leaveToken = (secret: string, email: string): Promise<string> => hmac(secret, `leave\n${email}`)

/** Deletes what is past its time: unconfirmed rows after 7 days, and the limits' counts after their day. */
export async function cleanUp(db: Db, now: number): Promise<void> {
  const today = dayOf(now)
  await db
    .prepare("DELETE FROM signups WHERE status = 'waiting' AND created_at < ?")
    .bind(now - WAITING_FOR)
    .run()
  await db.prepare('DELETE FROM sends WHERE day < ?').bind(today).run()
  await db.prepare('DELETE FROM senders WHERE day < ?').bind(today).run()
}

export async function join(
  db: Db,
  now: number,
  form: JoinForm,
  sender: Sender,
  limits: Limits = LIMITS,
): Promise<Joined> {
  await cleanUp(db, now)
  if (form.trap !== '') return { kind: 'quiet' }
  const email = normaliseEmail(form.email)
  if (email === null) return { kind: 'invalid' }
  const editor = parseEditor(form.editor)

  // The limits come before anything about the address, and every well-formed post counts towards them, so neither the
  // answer nor the counts can tell a new address from one already on the list.
  const day = dayOf(now)
  const key = await hmac(sender.secret, `sender\n${day}\n${senderOf(sender.ip)}`)
  const site = await db.prepare('SELECT count FROM sends WHERE day = ?').bind(day).first<{ count: number }>()
  const mine = await db
    .prepare('SELECT count FROM senders WHERE day = ? AND key = ?')
    .bind(day, key)
    .first<{ count: number }>()
  if ((site?.count ?? 0) >= limits.dailyPosts || (mine?.count ?? 0) >= limits.senderPosts)
    return { kind: 'busy' }
  await db
    .prepare('INSERT INTO sends (day, count) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET count = count + 1')
    .bind(day)
    .run()
  await db
    .prepare(
      'INSERT INTO senders (day, key, count) VALUES (?, ?, 1) ON CONFLICT (day, key) DO UPDATE SET count = count + 1',
    )
    .bind(day, key)
    .run()

  const row = await db
    .prepare('SELECT status, last_sent_at FROM signups WHERE email = ?')
    .bind(email)
    .first<{ status: string; last_sent_at: number }>()
  // A joined address is never changed by a form post, so nobody can change someone else's pick.
  if (row?.status === 'joined') return { kind: 'quiet' }
  if (row !== null && now - row.last_sent_at < RESEND_AFTER) return { kind: 'quiet' }

  const confirmToken = newToken()
  const leave = await leaveToken(sender.secret, email)
  await db
    .prepare(
      `INSERT INTO signups (email, editor, status, confirm_hash, confirm_expires, leave_hash, created_at, last_sent_at)
       VALUES (?1, ?2, 'waiting', ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT (email) DO UPDATE SET editor = ?2, confirm_hash = ?3, confirm_expires = ?4, last_sent_at = ?6`,
    )
    .bind(email, editor, await hashToken(confirmToken), now + CONFIRM_FOR, await hashToken(leave), now)
    .run()
  return { kind: 'send', email, editor, confirmToken, leaveToken: leave }
}

/** Whether a confirm link still works, without using it up: the page shows its button only when it does. */
export async function canConfirm(db: Db, now: number, token: string): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS ok FROM signups WHERE confirm_hash = ? AND status = 'waiting' AND confirm_expires > ?",
    )
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

/** After a confirmation email failed to send: the address may try again at once. */
export async function unsent(db: Db, email: string): Promise<void> {
  await db
    .prepare("UPDATE signups SET last_sent_at = 0 WHERE email = ? AND status = 'waiting'")
    .bind(email)
    .run()
}
