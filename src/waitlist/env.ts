// What Cloudflare hands the site's functions and the mailer, written out here because the repo takes no Workers types
// package: only the calls the waitlist makes.
import type { Db } from './db.ts'
import type { Email } from './message.ts'

/** The mailer Worker, reached by RPC through the site's service binding. */
export interface Mailer {
  send(email: Email): Promise<void>
}

export interface SiteEnv {
  DB: Db
  MAILER: Mailer
  WAITLIST_SECRET: string
  /** Set only by the journeys' local server, so they never meet the limits. */
  WAITLIST_SENDER_POSTS?: string
  WAITLIST_DAILY_POSTS?: string
  ASSETS: { fetch(input: Request | string): Promise<Response> }
}

export interface Context {
  request: Request
  env: SiteEnv
}

/** The part of a Pages Function's HTMLRewriter the confirm and leave pages use. */
declare global {
  class HTMLRewriter {
    on(
      selector: string,
      handlers: { element(element: { setAttribute(name: string, value: string): void }): void },
    ): this
    transform(response: Response): Response
  }
}
