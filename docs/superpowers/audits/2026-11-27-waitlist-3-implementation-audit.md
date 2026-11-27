# Waitlist: implementation audit (cycle 3)

- **Commit examined:** b68443509eeecc03faa9674eff7e232519dccae2 (PR #130, branch `claude/project-thread-8tc2c4`).
- **Lane:** 3. Fresh session, `review` skill, against `docs/superpowers/specs/2026-11-27-waitlist-design.md`.
- **Verdict: b684435 FAIL: 2 red** (R13 a race lets one sender pass both limits; R14 the spec still says 200 a day).
- Audited 2026-11-27T02:59Z.

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the spec
and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or
incomplete integrations. Do your best work.

## What ran

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ok (Node 22.23.5 here, not 24; engine warning only) |
| `pnpm lint && pnpm knip && pnpm typecheck` | clean |
| `pnpm test:node` | 125 pass, 13 files |
| `pnpm build` | ok |
| `playwright test --project chromium` (local stand-ins: D1, mailer, `pages dev`) | 36 pass, 1 skipped (the live one) |
| WebKit and Firefox journeys | not run here; CI at b684435 is green |
| Probe: 20 parallel form posts from one sender, production limits (3 per sender) | **20 of 20 accepted, 20 emails written** (R13) |
| Probe: the same, one at a time, after that | busy, as expected |
| Probe: the leave page with `t=x"><h1>injected</h1>…` | `HTMLRewriter` escapes the quote; nothing injected |
| Probe: the mailer's `scheduled` handler (`wrangler dev --test-scheduled`, `/__scheduled`) | deleted a seeded old `senders` row and a 7-day-old `waiting` row |
| Screenshots, iPhone SE and 1280 px, a choice picked | no sideways scroll (0 px); the form reads calm and roomy |
| `verify` from `main` (the PR edits `verify`) | not run: `main`'s `verify` starts no mailer, so the form cannot work under it; the journeys above start the stand-ins the new `verify` describes |

## Cycle-2 reds

| Finding | Spec answer | At b684435 | Result |
|---|---|---|---|
| R8 counters count sends | Every well-formed post counts, whatever the address's state | `store.ts:65-85` counts before the address is read; tests "a post for a joined or waiting address counts…" and "past a limit, new, waiting and joined…" | Pass, but see R13: the counting is not atomic |
| R9 IPv6 dodges the limit | Key on IPv4 or the IPv6 /64 | `rules.ts:39-51` `senderOf`; tests in `rules.test.ts:49` and "two IPv6 senders in one /64 share a limit" | Pass (note N23 on IPv4-mapped addresses) |
| R10 journeys trip the limit | Limits from optional bindings, set only by the journeys' server | `limitsFrom`; `playwright.config.ts` passes `WAITLIST_SENDER_POSTS=100000`, `WAITLIST_DAILY_POSTS=100000`; `wrangler.toml` sets no vars | Pass |
| R11 mailer secret after deploy | The mailer holds no secret | `mailer/wrangler.toml` has no vars; `mailer/src/index.ts` reads only `EMAIL` and `DB`; `config.test.ts:28` | Pass |
| R12 200 a day is over 3,000 a month | 96 a day | `LIMITS` is 96; `rules.test.ts:58` checks 96 × 31 ≤ 3,000 | Code passes; the spec still says 200 (R14), and the cap can be overrun (R13) |

The cycle-2 notes N12 to N20 are answered as the spec's table says (checked: `_headers` `! Referrer-Policy`, cron
`5 0 * * *`, `List-Unsubscribe` to `/api/waitlist/leave?t=…` with the token read from the address, `--persist-to` and
the email folder, hand-written runtime types, the busy page's "or from another network").

## Changed existing tests

- `tests/journeys/home.journey.ts`: "one heading" became "one level-1 heading", needed because the form adds an `h2`;
  the keyboard walk now visits every stop up to the last link and checks a solid ring on each (a choice's ring on its
  card), bounded at 8 stops. Both changes are explained and keep the property they guarded. OK.
- `tests/journeys/hosting.journey.ts`: `form-action 'none'` to `'self'`, as the spec's Headers section requires. OK.
- `.claude/skills/verify` and `this-repo`: named in the PR body, as the rules ask.

## Findings

### R13 (red): two posts at once both pass the limits

- UNIT: `src/waitlist/store.ts` `join` (lines 67-85).
- REQUIREMENT: criterion 7 ("past 3 posts a day from one sender, busy for that sender only; past 96 a day, busy for
  all"); Abuse and cost (the cap keeps sending inside the included 3,000 a month and protects the domain's reputation);
  cycle-1 R6 and cycle-2 R12.
- REASON: the limits are read with two `SELECT`s and raised later by two separate upserts, with `await`s between, so
  posts that arrive together all read the old count and all pass.
- EVIDENCE: against `wrangler pages dev` with the production limits (no limit bindings), 20 parallel `curl` posts from
  one address, each with a new email: all 20 redirected to `/waitlist/check-email/`, 20 emails were written under
  `mailer/.wrangler/tmp/email/`, and `senders` held `count: 20` for one key. Sent one at a time afterwards, each post got
  `/waitlist/busy/`. One script sending in parallel can so send far past 3 a day, and past 96 a day, from one address.
- EXPECTED: no more than the limit's number of posts per sender and per day are accepted, however many arrive at once.
- FIX: make the check and the count one statement each, for example
  `INSERT INTO sends (day, count) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`
  (no row back means busy), the same for `senders`, and drop the two `SELECT`s. Add a Node test that runs, say, 10
  `join`s for one sender with `Promise.all` against `sqliteDb()` and expects exactly `LIMITS.senderPosts` sends.
  Files: `src/waitlist/store.ts`, `tests/waitlist/store.test.ts`.

### R14 (red): the spec still says 200 a day

- UNIT: `docs/superpowers/specs/2026-11-27-waitlist-design.md`, Owner decisions, item 1 (line 206).
- REQUIREMENT: cycle-2 R12, answered "96 a day"; the brief must agree with itself, since it is what the Owner approves.
- REASON: "the 200-a-day cap keeps them inside it" survives from before R12; 200 a day is the figure R12 showed is over
  3,000 a month.
- EVIDENCE: `grep -n 200 docs/superpowers/specs/2026-11-27-waitlist-design.md` gives line 206.
- EXPECTED: the line says 96 a day, as Abuse and cost and the code do.
- FIX: change "200-a-day" to "96-a-day" on that line. File: the spec only.

## Notes (not blocking, recorded)

- N21 (timing): a post that sends an email waits for the mailer; one for a joined address, or one inside the 10
  minutes, does not. Response time can so tell a joined address from a new one, which criterion 5 aims to hide (it
  names only the answer, so this is a note). The limits bound how many addresses one sender can test. A later change
  could send after answering (`waitUntil`), at the cost of the "unsent" retry path.
- N22 (mail failure page): when the mailer throws, the person lands on `/waitlist/busy/`, which says "try again
  tomorrow, or from another network", while the code (`site.ts:38`) makes an immediate retry work. A failure for one
  address also answers differently from a joined address. A plain "We couldn't send the email. Please try again." page
  would be truer.
- N23 (IPv4-mapped IPv6): `senderOf('::ffff:203.0.113.7')` gives `0:0:0:0`, so every such sender would share one key.
  Cloudflare hands IPv4 visitors a dotted address, so this should not occur; a test or a guard would make sure.
- N24 (rejoin timer): a repeated post for a `waiting` row refreshes the confirm link (48 hours) but not `created_at`, so
  a link sent on day 6 is deleted on day 7 with a day of its 48 hours left, and lands on "link expired".
- N25 (address characters): the local part allows `<`, `>`, `,`, `;` and `"`. The escape and the fixed headers keep
  this safe today; a narrower set (RFC 5322 atext and dots) would leave less to the mail service's parser.
- N26 (PR body): "Not in this pull request: the deploy steps land first in their own pull request" is out of date: they
  merged in #131 (a4e6788). The branch does not contain `main` yet; it needs `main` merged in before its last CI run.
- N27 (placeholder id): `wrangler.toml` and `mailer/wrangler.toml` hold `00000000-…`; the draft status is the only
  thing stopping a merge with it. A Node check that fails on the zero id would make the "merge only after Owner step 3"
  rule a program's job.
- N28 (form, for the look review): the picked card shows a gold border and gold name; a tick would make the pick plainer
  for people who don't see the colour change well. "Editor" is the one word a non-coder may stop at; the lines under
  each name carry it. The intro "Pick the editor you'd use first" sits above the email field, before the choices it
  refers to.
- N29 (clean-up test): criterion 7 says the `scheduled` handler is tested with the injected clock; the Node test calls
  `cleanUp` directly, and the handler uses `Date.now()`. The probe above shows the handler runs and deletes the right
  rows, so this is recorded, not red.

## For the fix round

R13 and R14 only. Each fix is checked by a program (R13: the new parallel test, then the 20-post probe gives 3
check-email and 17 busy; R14: the grep finds no 200-a-day). The notes are follow-ups unless the Owner asks for them.
