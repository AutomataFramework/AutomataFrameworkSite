// The site's side of the waitlist: what each form post and page does, for the thin files in functions/ to call.
import type { Context } from './env.ts'
import { guarded, seeOther } from './headers.ts'
import { confirmation } from './message.ts'
import { limitsFrom } from './rules.ts'
import { canConfirm, confirm, join, leave, unsent } from './store.ts'

const field = (form: FormData, name: string): string => {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

const formOf = async (request: Request): Promise<FormData> => {
  try {
    return await request.formData()
  } catch {
    return new FormData()
  }
}

export async function postJoin({ request, env }: Context, now: number): Promise<Response> {
  const form = await formOf(request)
  const result = await join(
    env.DB,
    now,
    { email: field(form, 'email'), editor: field(form, 'editor'), trap: field(form, 'website') },
    // Cloudflare sets this header itself at its edge, so a visitor cannot choose it.
    { secret: env.WAITLIST_SECRET, ip: request.headers.get('CF-Connecting-IP') ?? '' },
    limitsFrom(env),
  )
  if (result.kind === 'invalid') return seeOther('/waitlist/try-again/')
  if (result.kind === 'busy') return seeOther('/waitlist/busy/')
  if (result.kind === 'send') {
    const origin = new URL(request.url).origin
    try {
      await env.MAILER.send(confirmation(result.email, origin, result.confirmToken, result.leaveToken))
    } catch (error) {
      // Let the person try again at once, rather than wait out the 10 minutes for an email that never left.
      await unsent(env.DB, result.email)
      console.error('The confirmation email did not send', error)
      return seeOther('/waitlist/busy/')
    }
  }
  return seeOther('/waitlist/check-email/')
}

export async function postConfirm({ request, env }: Context, now: number): Promise<Response> {
  const ok = await confirm(env.DB, now, field(await formOf(request), 't'))
  return seeOther(ok ? '/waitlist/joined/' : '/waitlist/link-expired/')
}

/** The leave button's post, and a mail app's one-click unsubscribe (RFC 8058), which carries the token in the address. */
export async function postLeave({ request, env }: Context): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? field(await formOf(request), 't')
  if (token !== '') await leave(env.DB, token)
  return seeOther('/waitlist/left/')
}

/** A static page with the link's token put into its form, so the button can post it without a script. */
async function withToken({ request, env }: Context, page: string): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? ''
  const template = await env.ASSETS.fetch(new URL(page, request.url).toString())
  const filled = new HTMLRewriter()
    .on('input[name="t"]', { element: (input) => input.setAttribute('value', token) })
    .transform(template)
  return guarded(filled)
}

export async function getConfirm(context: Context, now: number): Promise<Response> {
  const token = new URL(context.request.url).searchParams.get('t') ?? ''
  if (!(await canConfirm(context.env.DB, now, token))) return seeOther('/waitlist/link-expired/')
  return withToken(context, '/waitlist/confirm/')
}

export const getLeave = (context: Context): Promise<Response> => withToken(context, '/waitlist/leave/')
