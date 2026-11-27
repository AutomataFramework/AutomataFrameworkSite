// GET /waitlist/confirm/?t=…: the email's confirm link, which shows a button and confirms nothing by itself.
import type { Context } from '../../src/waitlist/env.ts'
import { getConfirm } from '../../src/waitlist/site.ts'

export const onRequestGet = (context: Context): Promise<Response> => getConfirm(context, Date.now())
