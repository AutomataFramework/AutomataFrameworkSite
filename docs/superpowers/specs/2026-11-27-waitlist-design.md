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

1. **Join.** The home page gets a plain HTML form: an email field, six large choices for the first editor, and one
   button, "Add me to the list". It posts to `/api/waitlist`.
2. **Check your email.** The server always answers with a redirect to `/waitlist/check-email/`, whether the address is
   new, waiting or already on the list, so nobody can learn who signed up. A malformed address goes to
   `/waitlist/try-again/` instead, which says what to fix and links back.
3. **Confirm.** The email holds one link to `/waitlist/confirm/?t=<token>`. That page shows one button, "Yes, add me".
   A link alone never confirms, because mail scanners open links on their own. Pressing it posts the token and lands on
   `/waitlist/joined/`. A used or old link lands on `/waitlist/link-expired/`, which offers to start again.
4. **Leave.** Every email holds a link to `/waitlist/leave/?t=<token>`, with one button, "Take me off the list",
   which deletes the person's row and lands on `/waitlist/left/`. The email also carries `List-Unsubscribe` and
   `List-Unsubscribe-Post` headers, so a mail app's own "unsubscribe" button works in one tap (RFC 8058).
5. **Privacy.** `/privacy/` says, in plain words, what is kept, why, where, for how long, who keeps it, and how to
   leave. The form links to it.

### Pieces

| Piece | Where | Job |
|---|---|---|
| Pages Functions | `functions/` | The form posts and the confirm and leave pages. Holds the D1 binding. Deployed by the existing `wrangler pages deploy`. |
| Mailer Worker | `mailer/` (own `wrangler.toml`) | Sends one email. Holds the `send_email` binding, which Pages Functions do not support. Reached only through a service binding, with no public route. |
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
| `leave_hash` | SHA-256 of the leave token, kept as long as the row. |
| `created_at`, `joined_at`, `last_sent_at` | Times, from the injected clock. |

No IP address, browser or tracking data is stored. One more table, `sends(day, count)`, counts confirmation emails per
day for the daily cap.

### Abuse and cost

- A hidden "leave this empty" field: a filled one gets the normal answer and nothing is stored or sent.
- At most one confirmation email per address per 10 minutes.
- At most 200 confirmation emails a day across the site; past that, `/waitlist/busy/` asks people to try tomorrow.
  This keeps a flood from hurting the domain's sending reputation and keeps sending inside the plan's included 3,000
  a month.
- A joined address is never changed by a new form post (nobody can change someone else's pick).
- Rows still `waiting` after 7 days are deleted, on each form post (Pages Functions have no timer).

### Headers

`public/_headers`: `form-action 'self'` replaces `form-action 'none'`; every other rule stays. The waitlist pages and
`/api/*` answers get `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, since their address carries a token.

### Deploy

`deploy` in `site.yml`, in order: apply D1 migrations (`wrangler d1 migrations apply automata-waitlist --remote`),
deploy the mailer (`wrangler deploy -c mailer/wrangler.toml`), then the existing `wrangler pages deploy`. CLAUDE.md
puts a CI workflow change in its own pull request, before the code that needs it, so that change lands first, with
each new step skipped while `mailer/wrangler.toml` does not exist yet. It is covered by the standing permission for CI
changes (`history.md`, 2026-11-21), once its audits pass.

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
- The email: from `Automata Framework <hello@automataframework.com>`, subject "Confirm your place on the Automata
  list", a short plain-text body and a matching simple HTML body, with the confirm link, the leave link and why they got
  it ("someone, probably you, typed this address on automataframework.com").

## Acceptance criteria

Each is checked by a program unless it says otherwise.

1. **Join, end to end** (journey, every size and engine): fill the form with the keyboard alone and with taps, pick an
   editor, press the button, land on "check your email"; the mailer's local stand-in has written one email to that
   address; opening its confirm link and pressing "Yes, add me" lands on "you're on the list"; the database row is
   `joined` with that editor.
2. **No pick** (journey): joining without picking an editor works and stores an empty editor.
3. **Leave** (journey): the leave link's button deletes the row; the one-click `List-Unsubscribe-Post` request deletes
   it too.
4. **Bad input** (journey and unit): an empty or malformed address lands on "try again", which says what to fix; an
   unknown editor value is stored as empty; the filled hidden field stores and sends nothing.
5. **Nobody learns who signed up** (unit): new, waiting and joined addresses get the same answer; a joined row's editor
   never changes from a form post.
6. **Links** (unit): a confirm token works once, not after 48 hours, not for another address; tokens are 32 random
   bytes from `crypto.getRandomValues`; only their hashes are stored.
7. **Limits** (unit, injected clock): one email per address per 10 minutes; past 200 a day, "busy"; `waiting` rows
   older than 7 days are gone after the next post.
8. **Keyboard and screen readers** (journey): every control has a label, the choices are one radio group with a
   legend, focus is always visible, errors are announced (`role="alert"` on the try-again page's message), every
   touch target is at least 44 by 44 pixels, and the words meet WCAG AA contrast (4.5 to 1).
9. **No script, no tracking** (journey): no page loads a script, and no request leaves the site's own address.
10. **Headers** (journey against `wrangler pages dev`): the form posts under the safety header; waitlist and `/api/*`
    answers carry `no-store` and `no-referrer`.
11. **Privacy page** (journey, plus the Owner's read): it names who keeps the data and how to reach them, what is kept,
    why, where (Cloudflare), how long (until you leave; unconfirmed addresses within 7 days), that nothing is sold or
    shared, and how to leave.
12. **The look** (screenshots at small phone, tablet and computer, a fresh reviewer under `visual-check`, then the
    Owner): the form reads as part of the page, calm and high-taste, nothing wider than the screen.
13. **Deploy** (CI and live): on `main`, migrations, the mailer and the site deploy in order; the live `live` journey
    passes; one real sign-up by the Owner with their own address receives the email, confirms and leaves (the Owner's
    walk, since a real send needs the real domain).
14. **Performance**: the home page with the form stays under 100 KB transferred on first load (measured), and a form
    post answers in under 1 second locally (measured).

## Boundaries the Owner approves

- **Dependencies:** none new. Types come from `wrangler types`, from the approved `wrangler` 4.140.0.
- **Services:** Cloudflare D1 (free plan covers this size), Cloudflare Email Service (beta) for sending.
- **Money:** sending to any address needs the Workers Paid plan, $5 a month, which includes 3,000 emails a month, then
  $0.35 per 1,000 (Cloudflare's Email Service pricing page). Not yet approved: a decision card asks.
- **Expected duration:** about 4 hours of session time for the build, plus the two audits and CI.

## Open decisions (the Owner's)

1. Workers Paid ($5 a month), or confirmation email waits.
2. Whose name and contact address the privacy page shows.

## Steps only the Owner can run

Cloudflare has no CLI or API for some of these; where it has one, it is given.

1. Turn on Workers Paid (dashboard: Workers & Pages, Plans). No CLI exists.
2. Onboard `automataframework.com` for sending (dashboard: Email Service, Email Sending, Onboard Domain). No CLI exists;
   it adds its own DNS records on `cf-bounce`.
3. Make the database and send back its id (it is not a secret):
   `pnpm dlx wrangler@4.140.0 login && pnpm dlx wrangler@4.140.0 d1 create automata-waitlist`
4. Give the CI token (`CLOUDFLARE_API_TOKEN`) "D1: Edit" and "Workers Scripts: Edit" on the account, besides
   "Cloudflare Pages: Edit" (dashboard: My Profile, API Tokens, edit). No CLI exists.

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
| 8 | Owner's walk | merge of 2 and 3 to 7, Owner steps 1 to 4 | none | a real sign-up | criterion 13 |

Units 3 and 4 run side by side; 5 to 7 share one implementation pull request with 3 and 4. The existing tests that
change (`home.journey.ts`, `site.test.ts`) are named in their pull requests.
