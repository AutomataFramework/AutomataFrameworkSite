// POST /api/waitlist: the home page's form.
import type { Context } from '../../../src/waitlist/env.ts'
import { postJoin } from '../../../src/waitlist/site.ts'

export const onRequestPost = (context: Context): Promise<Response> => postJoin(context, Date.now())
