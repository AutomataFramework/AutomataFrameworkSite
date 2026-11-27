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
/** The two limits on form posts per UTC day, whatever the address's state: per sender, and across the site. */
export interface Limits {
  senderPosts: number
  dailyPosts: number
}

/** 96 a day keeps a 31-day month at 2,976 emails, inside the 3,000 the plan includes, so the list never costs extra. */
export const LIMITS: Limits = { senderPosts: 3, dailyPosts: 96 }

/** The limits, with any number the environment sets in place of the default (only the journeys' local server does). */
export function limitsFrom(env: { WAITLIST_SENDER_POSTS?: string; WAITLIST_DAILY_POSTS?: string }): Limits {
  const read = (raw: string | undefined, fallback: number): number => {
    const value = Number(raw)
    return raw !== undefined && Number.isInteger(value) && value > 0 ? value : fallback
  }
  return {
    senderPosts: read(env.WAITLIST_SENDER_POSTS, LIMITS.senderPosts),
    dailyPosts: read(env.WAITLIST_DAILY_POSTS, LIMITS.dailyPosts),
  }
}

/**
 * The part of an IP address that names one sender: an IPv4 address whole, or an IPv6 address's first 64 bits, since
 * one home or phone is handed a whole /64.
 */
export function senderOf(ip: string): string {
  if (!ip.includes(':')) return ip
  const [head = '', tail = ''] = ip.toLowerCase().split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === '' ? [] : tail.split(':')
  const groups = ip.includes('::')
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left
  return groups
    .slice(0, 4)
    .map((group) => (Number.parseInt(group, 16) || 0).toString(16))
    .join(':')
}

/** The address as stored: trimmed and lower-cased, or null when it cannot be an address. */
export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (email.length > 254) return null
  // One @, something before it, and a domain with at least one dot; no spaces or control characters anywhere.
  const match = /^([^\s@\p{Cc}]{1,64})@([^\s@\p{Cc}]+)$/u.exec(email)
  const domain = match?.[2]
  if (domain === undefined) return null
  const labels = domain.split('.')
  if (
    labels.length < 2 ||
    labels.some((label) => !/^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u.test(label))
  )
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
