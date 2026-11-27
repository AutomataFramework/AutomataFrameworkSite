// POST /api/waitlist/leave: the "Take me off the list" button, and a mail app's one-click unsubscribe.
import type { Context } from '../../../src/waitlist/env.ts'
import { postLeave } from '../../../src/waitlist/site.ts'

export const onRequestPost = (context: Context): Promise<Response> => postLeave(context)
