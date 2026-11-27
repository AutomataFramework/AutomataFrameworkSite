# Plan audit: waitlist on the coming-soon page (cycle 1)

- Spec: `docs/superpowers/specs/2026-11-27-waitlist-design.md`, on `claude/project-thread-8tc2c4`, PR #130.
- Examined: commit 309a7ea (309a7eaa1ed4ced89762d78fd243fb8d04c39e71), against the repo at that commit
  (`site.yml`, `ci.yml`, `playwright.config.ts`, `public/_headers`, `wrangler.toml`, `history.md`, `this-repo`).
- Lane: 3. An implementation audit follows the build.
- Reviewer: a fresh session that did not write the spec. Written 2026-11-27 02:25 UTC (from `date`).
- Prompt: Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative
  to the spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete
  implementations or incomplete integrations. Do your best work.
- What ran: reading only. No code, build or Cloudflare call ran. Claims about Cloudflare's behaviour below are from
  Cloudflare's documented behaviour as this reviewer knows it, not from a live test; each says so, and R-findings that
  rest on one name the check that settles it.

## Verdict

**309a7ea FAIL: 7 red**

The shape is right: no-script form, double opt-in behind a button, hashed tokens, a separate mailer Worker, deploy
order, and the Owner's open decisions are named. But seven gaps would ship a defect or break `main`: the live job
would send real email, Functions responses lose the safety headers, two privacy and "nobody learns" claims are not
always true, old leave links break, one script can shut the list for a day, and the merge order lets `main` go red
before the Owner's Cloudflare steps are done.

## Red findings

### R1. The `live` job would run the waitlist journeys against the real site

- UNIT: Plan unit 6 (`tests/journeys/waitlist.journey.ts`) with `site.yml` `live`.
- VERDICT: red.
- REQUIREMENT: CLAUDE.md Risk, "any write of real data" is lane 3 and needs its own permission; the standing
  permission (`history.md`, 2026-11-21) excludes "production data" and "money".
- REASON: `live` runs "the other journeys against the live address" with only `--grep-invert "the live address"`, so
  every new waitlist journey would post sign-ups to production D1 and send real email on every merge.
- EVIDENCE: `site.yml`, last step: `pnpm test:journeys --project chromium --grep-invert "the live address"` with
  `BASE_URL: https://automataframework.com`. The spec's journeys (criteria 1 to 4) post the form and read the local
  stand-in's email, which does not exist on live.
- EXPECTED: against `BASE_URL`, waitlist journeys only read (the form is there, headers, no script); nothing posts.
- FIX: the spec says posting journeys skip when `BASE_URL` is set (or carry a tag `live` inverts), and unit 6's check
  includes "the `live` command lists no posting journey" (`playwright test --list` with `BASE_URL` set). Files:
  the spec only.

### R2. `_headers` does not reach responses made by Functions

- UNIT: "Headers", "Pieces" (confirm and leave pages filled by `HTMLRewriter`), criterion 10.
- VERDICT: red.
- REQUIREMENT: "The page keeps `script-src 'none'`"; criterion 10; `this-repo` (the safety header is on every page).
- REASON: Cloudflare Pages documents that `_headers` rules are not applied to responses from Pages Functions. The
  `/api/*` answers and the token-filled confirm and leave pages come from Functions, so they would carry no CSP,
  no `nosniff`, no `no-store` and no `no-referrer`, the last two being exactly the token pages' protection.
- EVIDENCE: the spec puts all of it in `public/_headers` ("The waitlist pages and `/api/*` answers get
  `Cache-Control: no-store` and `Referrer-Policy: no-referrer`"). Criterion 10 checks only "the form posts under the
  safety header", which is the static home page. Settle it in the build with one journey against `wrangler pages dev`
  reading the confirm page's headers.
- EXPECTED: every Function response carries the same CSP and safety headers as `_headers`, plus `no-store` and
  `no-referrer`.
- FIX: the spec says the logic exports one header set every function applies (a test keeps it equal to `_headers`),
  and criterion 10 checks the headers on `/waitlist/confirm/?t=…`, `/waitlist/leave/?t=…` and a `POST /api/*` answer.
  Files: the spec only.

### R3. The "deleted within 7 days" promise depends on someone else signing up

- UNIT: "Abuse and cost" (cleanup "on each form post (Pages Functions have no timer)"), criterion 11.
- VERDICT: red.
- REQUIREMENT: `this-repo`, "Every claim on a page is true on `main` today"; criterion 11 says unconfirmed addresses
  go "within 7 days".
- REASON: with no new form post, an unconfirmed row stays for ever, so the privacy page would say something untrue on
  a quiet week, which a new list will have.
- EVIDENCE: the only cleanup trigger is a form post. The spec already adds a real Worker (the mailer), and a Worker
  can have a Cron Trigger with a D1 binding; Pages Functions cannot.
- EXPECTED: unconfirmed rows are gone 7 days after creation whatever the traffic.
- FIX: the mailer gets a daily `scheduled` handler with the D1 binding that runs the same tested cleanup (criterion 7
  then checks it with the injected clock, and unit 4's check covers the handler). Files: the spec only.

### R4. When the daily cap is hit, the answer tells joined addresses from new ones

- UNIT: "Abuse and cost" (200 a day, then `/waitlist/busy/`), criterion 5.
- VERDICT: red.
- REQUIREMENT: "Check your email": the same answer "whether the address is new, waiting or already on the list";
  criterion 5.
- REASON: the cap counts confirmation emails. A joined address sends none, so past the cap it would still get
  "check your email" while a new address gets "busy". The spec does not say which answer a joined address gets.
- EVIDENCE: steps 2 and "Abuse and cost" together; criterion 5 does not cover the capped state.
- EXPECTED: past the cap, every well-formed post gets `/waitlist/busy/`, whatever the address's state.
- FIX: state that rule in the spec and add "past the cap, new, waiting and joined get the same answer" to
  criterion 5. Files: the spec only.

### R5. A resent email breaks the leave link in every earlier email

- UNIT: "Data" (`leave_hash`, one per row), step 4 "Every email holds a link to leave", criterion 3.
- VERDICT: red.
- REQUIREMENT: step 4 (every email's leave link and `List-Unsubscribe` work); RFC 8058 one-click must work from the
  message that carries it.
- REASON: the raw token is never stored, so a second email (allowed after 10 minutes) must carry a new token and
  overwrite `leave_hash`; the first email's leave link and its mail app "unsubscribe" then fail. The spec does not say
  either way, and later news emails would hit the same wall.
- EVIDENCE: one `leave_hash` column; a resend is allowed by "At most one confirmation email per address per 10
  minutes"; criterion 3 tests only one email.
- EXPECTED: any leave link the site ever sent to an address removes it.
- FIX: pick one and write it in the spec: (a) the leave token is an HMAC of the email under a secret (nothing stored;
  adds one Pages secret, an Owner step with its `wrangler pages secret put` command), or (b) a `leave_tokens` table
  keeping every leave hash for the row. Recommend (a). Criterion 3 then tests the first email's leave link after a
  resend. Files: the spec only.

### R6. One script can shut the list for a whole day

- UNIT: "Abuse and cost".
- VERDICT: red.
- REQUIREMENT: the brief, "privacy and consent handled properly" and the list's one purpose, counting people; the
  spec's own aim of protecting the domain's sending reputation.
- REASON: the only limits are per address and per site. 200 posts with 200 made-up addresses (one loop, no script on
  our side needed) send 200 emails to strangers and send every real visitor to "busy" until midnight. Nothing limits
  one sender.
- EVIDENCE: the three limits listed; no per-sender limit, and the spec rules out storing an IP (rightly).
- EXPECTED: one sender cannot use more than a small share of the day's sends, and nothing about them is stored.
- FIX: add an Owner step for one Cloudflare rate-limiting rule on `POST /api/waitlist` per IP (the free plan includes
  one rule; it stores nothing in our database), with its API call if one exists, else the dashboard path; say on the
  privacy page that Cloudflare sees addresses to block floods. Files: the spec only.

### R7. The merge order lets `main` go red before the Owner's Cloudflare steps

- UNIT: Plan, units 2, 5 and 8; "Steps only the Owner can run".
- VERDICT: red.
- REQUIREMENT: CLAUDE.md, "'Done' means merged to `main` and green there"; `staged-path` dependencies.
- REASON: unit 8 waits on the Owner's steps 1 to 4, but the implementation pull request (3 to 7) waits on nothing
  from the Owner. Once it merges, `mailer/wrangler.toml` exists, the unit 2 skips turn off, and `deploy` runs
  migrations and `wrangler deploy` with a token that lacks "D1: Edit" and "Workers Scripts: Edit", on an account
  without Workers Paid and a database id that may not be in `wrangler.toml` yet. `main` goes red and the site stays on
  the old build.
- EVIDENCE: the plan table's "Waits on" column; Owner step 3 supplies the id that `wrangler.toml` (unit 5) needs.
  Open decision 1 offers "confirmation email waits", but no part of the spec says what ships in that case: a form that
  stores but cannot confirm, or no form.
- EXPECTED: the implementation pull request merges only after Owner steps 1 to 4 are done (or the spec says exactly
  what ships without email, and how the skips keep `deploy` green).
- FIX: make unit 5's merge wait on Owner steps 1 to 4 and decision 1; say that if decision 1 is "wait", the build
  stops after unit 3 and nothing ships. Files: the spec only.

## Notes (recorded, not blocking)

- N1. The mailer's "no public route" needs `workers_dev = false` and `preview_urls = false` in `mailer/wrangler.toml`
  (a Worker gets a `workers.dev` address by default) and an RPC entrypoint rather than a `fetch` that sends. Name both
  and test the config.
- N2. The hidden "leave this empty" field must be hidden from screen readers and keyboards too (`aria-hidden`,
  `tabindex="-1"`, `autocomplete="off"`), or a screen-reader user or an autofill can fill it and silently never get an
  email. Add it to criterion 8.
- N3. A radio group cannot be un-picked without script. Since the pick is optional, add a seventh card such as "Not
  sure yet" (stored as empty), or the drunk-grandma test fails for someone who tapped by mistake.
- N4. Unit 5's file list leaves out how the journeys get a local database and the mailer stand-in. Put
  `wrangler d1 migrations apply automata-waitlist --local` and the mailer's `wrangler dev` in `playwright.config.ts`'s
  `webServer` (it takes a list), so `ci.yml` (lane 3, not in the plan) stays unchanged; say where the stand-in writes
  the email and how a journey reads it and the D1 row.
- N5. Check early, before unit 4: that Cloudflare Email Sending's `send_email` binding accepts custom
  `List-Unsubscribe` and `List-Unsubscribe-Post` headers, and that `wrangler d1 migrations apply` reads the binding
  from the Pages `wrangler.toml`. If either fails, the spec changes.
- N6. Say what a re-post does to a `waiting` row: whether the pick changes and whether the old confirm link dies (it
  lands on "link expired", which is fine if stated).
- N7. Units 3 and 4 "run side by side" but share one branch and one writer (`staged-path`, one writer per branch).
  Either one session does them in turn, or say they use worktrees.
- N8. The migrations step's skip keys on `mailer/wrangler.toml`; keying it on `migrations/` reads more plainly.
- N9. `hello@automataframework.com` sends; say whether replies reach anyone (Email Routing), since the privacy page
  will give a contact.
- N10. The sends-per-day `day` is UTC; say so. The confirm and leave pages could carry `X-Robots-Tag: noindex`.
- N11. Lower-casing the whole address is fine in practice; say it is deliberate.
