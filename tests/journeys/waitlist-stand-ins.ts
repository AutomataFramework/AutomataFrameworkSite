// What the waitlist's journeys read from the local stand-ins: the email the mailer would have sent, and the row in the
// local database.
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const EMAILS = new URL('../../mailer/.wrangler/tmp/email/', import.meta.url)
const DATABASES = new URL('../../.wrangler/journeys/v3/d1/miniflare-D1DatabaseObject/', import.meta.url)

const files = (dir: URL): URL[] => {
  try {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.txt'))
      .map((name) => new URL(name, dir))
  } catch {
    return []
  }
}

/** The text of every email sent to the address so far, oldest first by nothing in particular. */
export function emailsTo(address: string): string[] {
  return files(EMAILS)
    .map((file) => readFileSync(file, 'utf8'))
    .filter((text) => text.includes(` ${address} `))
}

/** The confirm and leave links in an email. */
export function linksIn(text: string): { confirm: string; leave: string } {
  const confirm = /\S+\/waitlist\/confirm\/\?t=[\w-]+/.exec(text)?.[0]
  const leave = /\S+\/waitlist\/leave\/\?t=[\w-]+/.exec(text)?.[0]
  if (confirm === undefined || leave === undefined) throw new Error(`no links in the email:\n${text}`)
  return { confirm, leave }
}

/** The address's row in the local database, or undefined when it has none. */
export function rowOf(address: string): { editor: string; status: string } | undefined {
  for (const name of readdirSync(DATABASES).filter(
    (file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite',
  )) {
    const db = new DatabaseSync(new URL(name, DATABASES), { readOnly: true })
    try {
      const row = db.prepare('SELECT editor, status FROM signups WHERE email = ?').get(address)
      if (row !== undefined) return { editor: String(row.editor), status: String(row.status) }
    } catch {
      // Not the waitlist's database.
    } finally {
      db.close()
    }
  }
  return undefined
}
