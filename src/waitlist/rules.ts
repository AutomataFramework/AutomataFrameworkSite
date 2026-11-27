// What a sign-up may hold, and the limits that keep the list honest and the domain's sending reputation clean.

/** The editors a person can pick to want first, in the order the page shows them. */
export const EDITORS = ['screens', 'world', 'characters', 'feel', 'sound', 'story'] as const
export type Editor = (typeof EDITORS)[number]

const MINUTE = 60_000
const HOUR = 60 * MINUTE
export const CONFIRM_FOR = 48 * HOUR
/** A `waiting` row older than this is deleted: the person never confirmed. */
export const WAITING_FOR = 7 * 24 * HOUR
/** At most one confirmation email per address in this time. */
export const RESEND_AFTER = 10 * MINUTE
/** At most this many confirmation emails a day across the site (UTC days). */
export const DAILY_SENDS = 200

/** The address as stored: trimmed and lower-cased, or null when it cannot be an address. */
export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (email.length > 254) return null
  // One @, something before it, and a domain with at least one dot; no spaces or control characters anywhere.
  const match = /^([^\s@\p{Cc}]{1,64})@([^\s@\p{Cc}]+)$/u.exec(email)
  const domain = match?.[2]
  if (domain === undefined) return null
  const labels = domain.split('.')
  if (labels.length < 2 || labels.some((label) => !/^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u.test(label)))
    return null
  return email
}

/** A known editor, or '' for no pick (an unknown value counts as no pick). */
export function parseEditor(raw: string): Editor | '' {
  return (EDITORS as readonly string[]).includes(raw) ? (raw as Editor) : ''
}

/** The UTC day a time falls on, as the `sends` table keys it. */
export function dayOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}
