// POST /api/waitlist/confirm: the "Yes, add me" button.
import type { Context } from '../../../src/waitlist/env.ts'
import { postConfirm } from '../../../src/waitlist/site.ts'

export const onRequestPost = (context: Context): Promise<Response> => postConfirm(context, Date.now())
