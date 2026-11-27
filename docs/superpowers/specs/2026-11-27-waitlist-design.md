# Waitlist on the coming-soon page

Lane 3 (it changes `wrangler.toml` and the `deploy` job, adds a database that holds real people's email addresses, and
sends email). Staged path: this spec, its plan audit, execution, an implementation audit, fixes, the Owner's review.

## The brief

The Owner (decision card, 2026-11-27, from the go-to-market review item 4): an email box on
https://automataframework.com plus one tap on "which editor do you want first?", with Screens (includes in-game UI),
World, Characters, Feel, Sound and Story. Sign-ups are kept on Cloudflare in a D1 database, and a Cloudflare email
confirms them. Accessible, with privacy and consent handled properly.

The Owner's brand direction (2026-11-27, shell thread): high taste, the thing "people with taste use to make games";
friendly to people who don't code; written for creatives who are not necessarily game developers.

What it is for: counting the people who want the editors, and which editor each wants first. Nothing else is built
until it has a user: no news emails, no admin screen, no analytics.

## How it works

A visitor never needs JavaScript. The page keeps `script-src 'none'`.

1. **Join.** The home page gets a plain HTML form: an email field, six large choices for the first editor plus a
   seventh, "Not sure yet" (a radio cannot be un-picked without script), and one button, "Add me to the list". It
   posts to `/api/waitlist`.
2. **Check your email.** The server answers with a redirect to `/waitlist/check-email/`, whether the address is new,
   waiting or already on the list, so nobody can learn who signed up. A malformed address goes to
   `/waitlist/try-again/` instead, which says what to fix and links back. Past a limit (see "Abuse and cost"), every
   well-formed post gets `/waitlist/busy/`, whatever the address's state, so the limit leaks nothing either.
   A new post for a `waiting` address (after the 10 minutes) updates its pick and sends a new confirm link; the old
   confirm link then lands on "link expired".
3. **Confirm.** The email holds one link to `/waitlist/confirm/?t=<token>`. That page shows one button, "Yes, add me".
   A link alone never confirms, because mail scanners open links on their own. Pressing it posts the token and lands on
   `/waitlist/joined/`. A used or old link lands on `/waitlist/link-expired/`, which offers to start again.
4. **Leave.** Every email holds a link to `/waitlist/leave/?t=<token>`, with one button, "Take me off the list",
   which deletes the person's row and lands on `/waitlist/left/`. The leave token is an HMAC-SHA-256 of the address
   under a secret (`WAITLIST_SECRET`), so it is the same in every email the site ever sends to that address, and any
   of those links still works after a resend. The email also carries `List-Unsubscribe` and
   `List-Unsubscribe-Post` headers, so a mail app's own "unsubscribe" button works in one tap (RFC 8058).
5. **Privacy.** `/privacy/` says, in plain words, what is kept, why, where, for how long, who keeps it, and how to
   leave. The form links to it.

### Pieces

| Piece | Where | Job |
|---|---|---|
| Pages Functions | `functions/` | The form posts and the confirm and leave pages. Holds the D1 binding. Deployed by the existing `wrangler pages deploy`. |
| Mailer Worker | `mailer/` (own `wrangler.toml`) | Sends one email, through an RPC method on a `WorkerEntrypoint`. Holds the `send_email` binding (restricted to the one sender address), which Pages Functions do not support. Reached only through a service binding: `workers_dev = false`, `preview_urls = false`, no routes, a test reads its config. Also runs the daily clean-up on a Cron Trigger, with the D1 binding. |
| D1 database | `automata-waitlist`, migrations in `migrations/` | The sign-ups. |
| Static pages | `index.html`, `privacy/`, `waitlist/*/` | Built by Vite as now. The confirm and leave pages are static templates; their function fills in the token with `HTMLRewriter`. |

The logic (checking an address, the tokens, what to store, the email's words) is plain TypeScript with an injected
clock and database, tested in Node. The functions are thin.

### Data

One table, `signups`:

| Column | What |
|---|---|
| `email` | Trimmed and lower-cased; the key. |
| `editor` | One of `screens`, `world`, `characters`, `feel`, `sound`, `story`, or empty when the person skipped it. |
| `status` | `waiting` until confirmed, then `joined`. |
| `confirm_hash`, `confirm_expires` | SHA-256 of the confirm token (the token itself is never stored), valid 48 hours. |
| `leave_hash` | SHA-256 of the leave token (which is the HMAC of the address, so it never changes). |
| `created_at`, `joined_at`, `last_sent_at` | Times, from the injected clock. |

The address is lower-cased on purpose: in practice no mail provider treats case as different, and it stops duplicates.
No browser or tracking data is stored, and no IP address in readable form. Two more tables serve the limits:
`sends(day, count)` counts well-formed form posts per UTC day, and `senders(day, key, count)` counts them per sender per
UTC day, where `key` is an HMAC, under `WAITLIST_SECRET` and the day, of the sender's IPv4 address or of an IPv6
address's first 64 bits (its /64, since one home or phone holds a whole /64), so it cannot be turned back into an
address and does not link one day to the next. The daily clean-up deletes `senders` and `sends` rows
older than today.

### Abuse and cost

- A hidden "leave this empty" field: a filled one gets the normal answer and nothing is stored or sent. It is hidden
  from sight, screen readers and the keyboard alike (`aria-hidden="true"`, `tabindex="-1"`, `autocomplete="off"`), so
  no person or autofill fills it.
- At most one confirmation email per address per 10 minutes.
- The two limits below count every well-formed, non-hidden-field post, whatever state its address is in, so an
  existing address uses up the limit exactly as a new one does and the counts leak nothing.
- At most 3 posts per sender (the `senders` key above) per UTC day, so one script cannot use up the day. A class or
  office behind one address meets "busy" after 3; the busy page says "or try from another network".
- At most 96 posts per UTC day across the site: at most 2,976 emails in a 31-day month, inside the plan's included
  3,000, so the list never costs extra. It also keeps a flood from hurting the domain's sending reputation. Raising
  it is a one-line change, and a decision for the Owner.
- The limits (per address, per sender, per site) are read from optional bindings with these numbers as defaults; only
  the journeys' local server sets higher ones, so the journeys never meet them, and production sets none.
- Past either of the last two, every well-formed post from that sender (or, for the site cap, everyone) gets
  `/waitlist/busy/`, which asks people to try tomorrow, whatever state the address is in.
- A joined address is never changed by a new form post (nobody can change someone else's pick).
- Rows still `waiting` 7 days after they were made are deleted by the mailer's daily Cron Trigger (00:05 UTC, so a
  sender key lives one day, as the privacy page says), whatever the
  traffic (Pages Functions have no timer). The same tested clean-up function also runs on each form post.

### Headers

`public/_headers`: `form-action 'self'` replaces `form-action 'none'`; every other rule stays. Cloudflare does not
apply `_headers` to responses made by Pages Functions, so the logic exports one header set (the same safety header,
`nosniff` and CSP) that every function applies to every answer, plus `Cache-Control: no-store`,
`Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`, since those addresses carry a token. A Node test keeps
that set equal to the `/*` rule in `_headers`. The static waitlist pages get the same three extra headers in
`_headers`.

### Deploy

`deploy` in `site.yml`, in order: apply D1 migrations (`wrangler d1 migrations apply automata-waitlist --remote`,
which reads the binding from the Pages `wrangler.toml`, checked locally on 2026-11-27), deploy the mailer
(`wrangler deploy -c mailer/wrangler.toml`), then the existing `wrangler pages deploy`. CLAUDE.md puts a CI workflow
change in its own pull request, before the code that needs it, so that change lands first: the migrations step is
skipped while `migrations/` does not exist, and the mailer step while `mailer/wrangler.toml` does not. It is covered
by the standing permission for CI changes (`history.md`, 2026-11-21), once its audits pass.

**The live job sends nothing.** `live` runs the other journeys against https://automataframework.com. Every journey
that posts a form skips when `BASE_URL` is set; against the live address the waitlist journeys only read (the form is
there, its headers, no script). Unit 6's check: `playwright test --list` with `BASE_URL` set lists no posting
journey.

**Local stand-ins.** `playwright.config.ts`'s `webServer` becomes a list, so `ci.yml` stays unchanged: it applies the
migrations to a local database (`wrangler d1 migrations apply automata-waitlist --local`), starts the mailer with
`wrangler dev` (its `send_email` binding is simulated: nothing is sent, and each email's text and HTML are written to
files under the mailer's `.wrangler/tmp/email/`, checked on 2026-11-27), and starts `wrangler pages dev`, which reaches
the mailer through the local service binding, with a test `WAITLIST_SECRET` passed as a binding. A journey reads the
email from those files and the row from the local database with `wrangler d1 execute --local`.

### The page's words and look

Written for creatives who don't code. The palette, fonts and layout stay the Owner's (`this-repo`); the form is built
from them, calm and roomy, with the choices as large cards, not a list of radio dots. Draft words (the build may tune
them inside the same meaning):

- Heading over the form: "Be first in line."
- "Pick the editor you'd use first. We'll build that one sooner."
- The choices, each a name and a line: Screens, "menus, buttons and words on screen"; World, "places and levels";
  Characters, "who's in it and how they move"; Feel, "how it plays in your hands"; Sound, "music and sound effects";
  Story, "words, choices and cutscenes". The pick is optional: a person who just wants news can skip it.
- Under the button: "One email to check it's you, then only news about Automata. Leave any time." and a link, "How we
  keep your email".
- The email: from `Team Automata <hello@automataframework.com>` (replies reach the Owner's inbox through
  Cloudflare Email Routing), subject "Confirm your place on the Automata
  list", a short plain-text body and a matching simple HTML body, with the confirm link, the leave link and why they got
  it ("someone, probably you, typed this address on automataframework.com").

## Acceptance criteria

Each is checked by a program unless it says otherwise.

1. **Join, end to end** (journey, every size and engine, local only): fill the form with the keyboard alone and with taps, pick an
   editor, press the button, land on "check your email"; the mailer's local stand-in has written one email to that
   address; opening its confirm link and pressing "Yes, add me" lands on "you're on the list"; the database row is
   `joined` with that editor.
2. **No pick** (journey): joining without picking an editor, or with "Not sure yet", works and stores an empty
   editor.
3. **Leave** (journey and unit): the leave link's button deletes the row; the one-click `List-Unsubscribe-Post`
   request deletes it too; after a resend, the first email's leave link still deletes it.
4. **Bad input** (journey and unit): an empty or malformed address lands on "try again", which says what to fix; an
   unknown editor value is stored as empty; the filled hidden field stores and sends nothing.
5. **Nobody learns who signed up** (unit): new, waiting and joined addresses get the same answer, below the limits
   and past them; a joined row's editor never changes from a form post.
6. **Links** (unit): a confirm token works once, not after 48 hours, not for another address; tokens are 32 random
   bytes from `crypto.getRandomValues`; only their hashes are stored.
7. **Limits** (unit, injected clock): one email per address per 10 minutes; past 3 posts a day from one sender,
   "busy" for that sender only; past 96 a day, "busy" for all; posts for joined and waiting addresses count like new
   ones; two IPv6 addresses in one /64 share a sender key, and two in different /64s do not; the daily clean-up (the mailer's `scheduled` handler, tested
   with the injected clock) removes `waiting` rows older than 7 days and `senders` and `sends` rows older than today,
   with no form post; the stored sender key is not the IP address and differs from one day to the next.
8. **Keyboard and screen readers** (journey): every control has a label, the choices are one radio group with a
   legend, focus is always visible, the hidden field is out of reach of screen readers, the keyboard and autofill, errors are announced (`role="alert"` on the try-again page's message), every
   touch target is at least 44 by 44 pixels, and the words meet WCAG AA contrast (4.5 to 1).
9. **No script, no tracking** (journey): no page loads a script, and no request leaves the site's own address.
10. **Headers** (journey against `wrangler pages dev`, and a Node test): the form posts under the safety header; the
    answers to `/waitlist/confirm/?t=…`, `/waitlist/leave/?t=…` and a `POST /api/waitlist` carry the same CSP and
    `nosniff` as `_headers`, plus `no-store`, `no-referrer` and `noindex`; the function header set equals `_headers`.
    The live job lists no posting journey.
11. **Privacy page** (journey, plus the Owner's read): it names who keeps the data and how to reach them, what is kept,
    why, where (Cloudflare), how long (until you leave; unconfirmed addresses within 7 days; the scrambled sender key
    for one day, to stop floods), that nothing is sold or shared, and how to leave.
12. **The look** (screenshots at small phone, tablet and computer, a fresh reviewer under `visual-check`, then the
    Owner): the form reads as part of the page, calm and high-taste, nothing wider than the screen.
13. **Deploy** (CI and live): on `main`, migrations, the mailer and the site deploy in order; the live `live` journey
    passes; one real sign-up by the Owner with their own address receives the email, confirms and leaves (the Owner's
    walk, since a real send needs the real domain).
14. **Performance**: the home page with the form stays under 100 KB transferred on first load (measured), and a form
    post answers in under 1 second locally (measured).

## Boundaries the Owner approves

- **Dependencies:** none new. Types come from `wrangler types`, from the approved `wrangler` 4.140.0.
- **Services:** Cloudflare D1 (free plan covers this size), Cloudflare Email Service (beta) for sending, a Cron
  Trigger on the mailer (included), Cloudflare Email Routing for replies (free).
- **Unchecked until the first real send:** that Email Sending accepts the `List-Unsubscribe` headers. The local
  stand-in accepts them; if the real service refuses them (`E_HEADER_NOT_ALLOWED`), the mailer sends without them and
  the leave link in the body stays, and the Owner is told.
- **Money:** sending to any address needs the Workers Paid plan, which the Owner says is already on. It includes 3,000
  emails a month, then $0.35 per 1,000 (Cloudflare's Email Service pricing page); the daily cap keeps sending inside
  the included amount.
- **Expected duration:** about 4 hours of session time for the build, plus the two audits and CI.

## Owner decisions

1. Workers Paid: "It's already on" (decision card, 2026-11-27 02:27 UTC). No new cost; sends past the included 3,000
   a month are $0.35 per 1,000, and the 200-a-day cap keeps them inside it.
2. The privacy page names "Team Automata", with hello@automataframework.com as the contact, forwarded to the Owner's
   inbox by Email Routing (decision card, 2026-11-27 02:27 UTC, for the address; the Owner's message at 02:28 UTC,
   "use Team Automata", for the name). The email's sender name is "Team Automata" too.

## Steps only the Owner can run

Cloudflare has no CLI or API for some of these; where it has one, it is given.

1. (Done: Workers Paid is already on.)
2. Onboard `automataframework.com` for sending (dashboard: Email Service, Email Sending, Onboard Domain). No CLI exists;
   it adds its own DNS records on `cf-bounce`.
3. Make the database and send back its id (it is not a secret):
   `pnpm dlx wrangler@4.140.0 login && pnpm dlx wrangler@4.140.0 d1 create automata-waitlist`
4. Give the CI token (`CLOUDFLARE_API_TOKEN`) "D1: Edit" and "Workers Scripts: Edit" on the account, besides
   "Cloudflare Pages: Edit" (dashboard: My Profile, API Tokens, edit). No CLI exists.
5. Set the secret for the leave links and the sender key, on the site only (the mailer holds no secret: the functions
   build the tokens and the email, and the mailer only sends it and runs the clean-up):
   `openssl rand -base64 32 | pnpm dlx wrangler@4.140.0 pages secret put WAITLIST_SECRET --project-name automataframework`.
   It is never rotated: a new value breaks every leave link ever sent, unless a migration rewrites `leave_hash`.
6. For replies (decision 2): turn on Email Routing for `automataframework.com` and forward `hello@` to the inbox the
   Owner picks (dashboard: Email, Email Routing; it adds its own DNS records).

## Plan

| # | Unit | Waits on | Files | Output | Check |
|---|---|---|---|---|---|
| 1 | This spec | nothing | `docs/superpowers/specs/2026-11-27-waitlist-design.md` | the brief | plan audit |
| 2 | Deploy steps | 1 | `.github/workflows/site.yml`, `tests/workflows/site.test.ts` | its own pull request | the workflow test reads the three steps in order and the skip |
| 3 | Logic | 1 | `src/waitlist/*.ts`, `tests/waitlist/*.test.ts`, `migrations/0001_signups.sql` | tested logic | criteria 4 to 7 |
| 4 | Mailer | 1 | `mailer/` | the Worker | a Node test of the message it builds; the local stand-in writes the email |
| 5 | Functions and pages | 3, 4 | `functions/`, `index.html`, `privacy/`, `waitlist/`, `src/styles.css`, `public/_headers`, `wrangler.toml`, `vite.config.ts`, `playwright.config.ts`, `tsconfig.json`, `knip.json` | the feature | criteria 1, 2, 3, 8 to 11, 14 |
| 6 | Journeys | 5 | `tests/journeys/waitlist.journey.ts`, changes to `home.journey.ts` (it expects one heading today) | the journeys | they fail before 5 and pass after |
| 7 | Look | 5 | screenshots | the screens | criterion 12 |
| 8 | Owner's walk | merge of 2 and 3 to 7 | none | a real sign-up | criterion 13 |

One session does units 3 to 7 in turn, on one branch and one implementation pull request. That pull request merges
only after Owner steps 2 to 6 are done, since its merge turns on the deploy
steps; until then it waits as a draft, and `wrangler.toml` holds the real database id only once step 3 gives it. The existing tests that
change (`home.journey.ts`, `site.test.ts`) are named in their pull requests.

## Plan audit cycle 2: what changed

The second and last plan round (`docs/superpowers/audits/2026-11-27-waitlist-2-plan-audit.md`, FAIL: 5 red). Its reds
are folded in here and the implementation audit checks each.

| Finding | Answer |
|---|---|
| R8 counters count sends | The limits count well-formed posts, whatever the address's state; Abuse and cost; criteria 5 and 7 |
| R9 IPv6 dodges the limit | The key is of the IPv4 address or the IPv6 /64; Data; criterion 7 |
| R10 journeys trip the limit | Limits from optional bindings, set higher only by the journeys' local server |
| R11 mailer secret after deploy | The mailer holds no secret; Owner step 5 |
| R12 200 a day is over 3,000 a month | 96 a day |
| N12 | The Node test compares every header but `Referrer-Policy`, which the function set replaces with `no-referrer`; the static waitlist pages drop the `/*` value (`! Referrer-Policy`) before setting `no-referrer`, and the headers journey reads it |
| N13 | The Cron Trigger runs at 00:05 UTC |
| N14 | The secret is never rotated; `List-Unsubscribe` carries `/api/waitlist/leave?t=…`, where a `POST` with `List-Unsubscribe=One-Click` deletes the row with no page |
| N15 | The mailer keeps its local state in the journeys' own `--persist-to` folder, and its emails under `mailer/.wrangler/tmp/email/`; no `wrangler types` output: the few runtime types are written by hand in `src/waitlist/env.ts` and `mailer/src/workers.d.ts` |
| N16 | The Owner's approval of the implementation pull request covers, by name, the first `--remote` migration (a production database) and the first mailer deploy (real sends) |
| N17 | If the Owner's steps take longer than 2 days, the implementation branch stays open as a draft, with the reason in `progress.md`; the steps are sent to the Owner as soon as the build passes locally |
| N18 | The journeys are written first, as the check |
| N19 | The busy page says "or try from another network" |
| N20 | Checked at the mailer's first deploy; if it needs more, Owner step 4 gains it |

## Plan audit cycle 1: what changed

The audit (`docs/superpowers/audits/2026-11-27-waitlist-1-plan-audit.md`, 309a7ea FAIL: 7 red) and where each answer
is.

| Finding | Answer |
|---|---|
| R1 live job posts | "The live job sends nothing" under Deploy; criterion 10 |
| R2 `_headers` skips Functions | Headers: one exported header set every function applies, kept equal to `_headers` by a test; criterion 10 |
| R3 clean-up needs traffic | The mailer's daily Cron Trigger runs the clean-up; criterion 7 |
| R4 the cap leaks | Past a limit every well-formed post gets "busy"; How it works step 2; criterion 5 |
| R5 resend breaks leave links | The leave token is an HMAC of the address, the same in every email; criterion 3 |
| R6 one script uses the day | 3 emails per sender per day, keyed by a daily HMAC of the IP, never the IP; criteria 7 and 11. Chosen over a WAF rule, since the free plan's rule counts only over 10 seconds and could not stop a slow script |
| R7 merge before the Owner's steps | The implementation pull request merges only after Owner steps 2 to 6; Plan |
| N1 | Mailer: RPC entrypoint, `workers_dev = false`, `preview_urls = false`, a config test |
| N2 | The hidden field's attributes; criterion 8 |
| N3 | "Not sure yet" card |
| N4 | "Local stand-ins" under Deploy |
| N5 | Migrations read the Pages config (checked locally); the headers are unchecked until the first real send, with the fallback under Boundaries |
| N6 | How it works step 2 |
| N7 | One session does units 3 to 7 in turn |
| N8 | The migrations step's skip keys on `migrations/` |
| N9 | Replies reach the Owner through Email Routing; Owner step 6 |
| N10 | UTC stated; `X-Robots-Tag: noindex` on token pages |
| N11 | Lower-casing stated as deliberate, under Data |
