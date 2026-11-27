// The mailer Worker. `send` is called by RPC from the site's functions; `scheduled` is the daily clean-up.
import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Db } from '../../src/waitlist/db.ts'
import { type Email, SENDER } from '../../src/waitlist/message.ts'
import { cleanUp } from '../../src/waitlist/store.ts'

interface SendEmail {
  send(message: Email & { from: { email: string; name: string } }): Promise<{ messageId: string }>
}

interface Env {
  EMAIL: SendEmail
  DB: Db
}

export default class Mailer extends WorkerEntrypoint<Env> {
  async send(email: Email): Promise<void> {
    const message = { ...email, from: { email: SENDER, name: 'Team Automata' } }
    try {
      await this.env.EMAIL.send(message)
    } catch (error) {
      // Should the service refuse the unsubscribe headers, the email still goes: its body has the leave link.
      if ((error as { code?: string }).code !== 'E_HEADER_NOT_ALLOWED') throw error
      console.warn('Email Sending refused the List-Unsubscribe headers; sent without them')
      await this.env.EMAIL.send({ ...message, headers: {} })
    }
  }

  override async fetch(): Promise<Response> {
    return new Response(null, { status: 404 })
  }

  async scheduled(): Promise<void> {
    await cleanUp(this.env.DB, Date.now())
  }
}
