// GET /waitlist/leave/?t=…: the email's leave link, which shows a button and removes nothing by itself.
import type { Context } from '../../src/waitlist/env.ts'
import { getLeave } from '../../src/waitlist/site.ts'

export const onRequestGet = (context: Context): Promise<Response> => getLeave(context)
