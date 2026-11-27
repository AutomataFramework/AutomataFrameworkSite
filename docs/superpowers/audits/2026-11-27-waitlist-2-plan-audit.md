# Plan audit: waitlist on the coming-soon page (cycle 2)

- Spec: `docs/superpowers/specs/2026-11-27-waitlist-design.md`, on `claude/project-thread-8tc2c4`, PR #130.
- Examined: commit 13a79af (13a79af3dfbfd3aa18c50bc5b1ab343792f49801), against the repo at that commit
  (`site.yml`, `playwright.config.ts`, `public/_headers`, `wrangler.toml`, `history.md` standing permissions,
  `tests/journeys/`, `tests/workflows/`, `.gitignore`).
- Cycle 1: `docs/superpowers/audits/2026-11-27-waitlist-1-plan-audit.md` (309a7ea FAIL: 7 red). This is the second and
  last plan review round allowed for this plan.
- Lane: 3. An implementation audit follows the build.
- Reviewer: a fresh session that wrote neither the spec nor the cycle 1 audit. Written 2026-11-27 02:30 UTC (from `date`).
- Prompt: Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative
  to the spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete
  implementations or incomplete integrations. Do your best work.
- What ran: reading only. No code, build or Cloudflare call ran. Taken as given, from the coordinator and the spec:
  Pages Functions cannot use `send_email`; Workers Paid is on; the spec's two "checked locally on 2026-11-27" claims.

## Verdict

**13a79af FAIL: 5 red**

All seven cycle 1 findings and all eleven notes have an answer in the spec, and five of the seven answers hold as
written. But the new limits brought four new gaps, and one money claim is false: the limit counters themselves tell
a new address from a joined one, an IPv6 sender gets around the per-sender limit, the local journeys would trip that
same limit, the merge order now waits on a step that can only happen after the merge, and 200 a day does not stay
inside 3,000 a month. Every fix below touches the spec only and is a sentence or two.

## Cycle 1 fixes, one by one

| Finding | Answer in the spec | Holds? |
|---|---|---|
| R1 live job posts | Deploy, "The live job sends nothing"; criterion 10 lists it | Yes. Posting journeys skip when `BASE_URL` is set, which `live` sets (`site.yml` line 85); the `--list` check makes it a program's call. |
| R2 `_headers` skips Functions | Headers: one exported set on every function answer, a Node test keeps it equal to `_headers`; criterion 10 checks the confirm, leave and `POST` answers | Yes, with note N12 on how "equal" treats `Referrer-Policy`. |
| R3 clean-up needs traffic | The mailer's daily Cron Trigger with the D1 binding; criterion 7 | Yes, with note N13 on the run time. |
| R4 the cap leaks | Step 2 and "Abuse and cost": past a limit, every well-formed post gets "busy"; criterion 5 | The capped state is fixed. The counting behind it leaks: see R8. |
| R5 resend breaks leave links | Step 4: leave token is an HMAC of the address; criterion 3 tests the first email's link after a resend | Yes. Note N14 on rotating the secret and on the one-click URL. |
| R6 one script uses the day | 3 emails per sender per UTC day, keyed by a daily HMAC of the IP; criteria 7 and 11 | Not for IPv6 (R9), and it breaks the local journeys (R10). The reason for not using a WAF rule (the free rule counts over 10 seconds) is right. |
| R7 merge before the Owner's steps | Plan: the implementation pull request merges only after Owner steps 2 to 6, as a draft until then | The gate is right, but step 5 cannot be done before the merge: see R11. |
| N1 to N11 | The table at the end of the spec | All answered. N4 holds with note N15. |

## Red findings

### R8. The limit counters tell a new address from a joined one

- UNIT: "Abuse and cost" (the per-sender and site counters), How it works step 2, criterion 5.
- VERDICT: red.
- REQUIREMENT: step 2, "so nobody can learn who signed up"; criterion 5, "the same answer, below the limits and past
  them".
- REASON: both counters count confirmation emails sent. A joined address (and a waiting one inside its 10 minutes)
  sends none, so it does not use up the sender's 3. The answer to the post is the same, but the next post's answer is
  not.
- EVIDENCE: "At most 3 confirmation emails per sender ... per UTC day" and "`sends(day, count)` counts confirmation
  emails". The test: from one address, post two made-up addresses (2 used), then the target, then a third made-up
  one. "Busy" on the last post means the target cost an email, so it is new; "check your email" means it is joined
  (or waiting). With many IPs, anyone can run this for any list of addresses. Criterion 5 checks one post at a time,
  so it would pass with the leak in.
- EXPECTED: what an address's state is never changes any later answer.
- FIX: the per-sender and site counters count every well-formed, non-honeypot post, whatever the address's state,
  not emails sent (emails sent can only be fewer, so the cost limit still holds). Criterion 5 adds: "a post for a
  joined or waiting address uses up the limits exactly as a new one does." Files: the spec only.

### R9. An IPv6 sender gets around the per-sender limit

- UNIT: "Data" (`senders.key`), "Abuse and cost" (3 per sender), criterion 7.
- VERDICT: red.
- REQUIREMENT: R6's expected result, as the spec states it: "so one script cannot use up the day".
- REASON: the key is an HMAC of the whole IP address. One IPv6 connection usually holds a whole /64 (2^64 addresses),
  so a script on any ordinary IPv6 host or cheap server gets a new "sender" for every post and uses up the 200 alone.
- EVIDENCE: "`key` is an HMAC of the sender's IP address under `WAITLIST_SECRET` and the day". Nothing about IPv6.
- EXPECTED: one IPv6 network counts as one sender.
- FIX: the key is an HMAC of the IPv4 address, or of an IPv6 address's first 64 bits (its /64). Criterion 7 adds:
  "two IPv6 addresses in the same /64 count as one sender; one in another /64 does not". Say also what happens when
  `CF-Connecting-IP` is missing (one shared key, so it fails closed). Files: the spec only.

### R10. The local journeys would trip the per-sender limit

- UNIT: "Local stand-ins", criteria 1 to 4 (journeys), unit 6.
- VERDICT: red.
- REQUIREMENT: criterion 1 ("journey, every size and engine"), criteria 2 to 4, and the repo's journeys running in CI
  (`playwright.config.ts`: three engines against one `wrangler pages dev`).
- REASON: every local journey posts from 127.0.0.1, one sender. Criterion 1 alone, at three sizes in three engines,
  needs nine confirmation emails in one UTC day; the limit is 3. After the third post every journey lands on "busy" and
  fails. The resend in criterion 3 also needs 10 minutes of real time in a journey, which has no injected clock.
- EVIDENCE: "At most 3 confirmation emails per sender ... per UTC day"; the stand-ins share one local database and one
  mailer; nothing in the spec sets other limits for local runs. Locally, `reuseExistingServer` also keeps the database
  across runs, so the site's 200 can be hit on a busy day of local work.
- EXPECTED: the journeys exercise the real code path and stay green however many run, and production has no way
  around the limits.
- FIX: the limits (per address, per sender, per site) are read from bindings with the spec's numbers as defaults;
  only the local `webServer` command passes high values (like the test `WAITLIST_SECRET`), and a Node test reads the
  Pages and mailer `wrangler.toml` files and checks neither sets them. The limits are tested in units with the
  injected clock (criterion 7), and the "after a resend" part of criterion 3 is a unit test, or a journey run with the
  per-address wait set to 0. Each journey uses its own new address. Files: the spec only.

### R11. The merge waits on a step that can only happen after the merge

- UNIT: "Steps only the Owner can run" step 5; Plan, the paragraph under the table.
- VERDICT: red.
- REQUIREMENT: R7's fix as written: the implementation pull request "merges only after Owner steps 2 to 6 are done".
- REASON: step 5's second half, `wrangler secret put WAITLIST_SECRET --name automata-mailer`, is "after the mailer's
  first deploy". The mailer is first deployed by `deploy` on `main`, which runs only when that pull request merges. So
  the gate can never open as written, or the merge goes ahead with the mailer missing its secret.
- EVIDENCE: lines 211 to 214 and 231 to 233 of the spec.
- EXPECTED: every Owner step the merge waits on can be done before the merge.
- FIX: the mailer holds no secret. The Functions build the tokens and the leave link (the logic under `src/waitlist/`
  already owns "the email's words") and hand the finished message to the mailer over RPC; the clean-up needs no
  secret. Step 5 then sets only the Pages secret, and drops `tee /dev/stderr`, so the value is never shown. This also
  settles which side builds the message: unit 4's check becomes "the mailer sends what it is given, from the one
  sender". Files: the spec only.

### R12. 200 emails a day does not stay inside 3,000 a month

- UNIT: "Abuse and cost" (200 a day), "Boundaries" (Money), Owner decision 1.
- VERDICT: red.
- REQUIREMENT: CLAUDE.md, "Report honestly" and spend is the Owner's call; the Owner's decision 1 is recorded as
  "No new cost".
- REASON: 200 a day for 31 days is 6,200 emails, more than twice the included 3,000. At the spec's own price ($0.35
  per 1,000 past 3,000) the worst month costs about $1.12 more. Small, but the spec says three times that the cap
  keeps sending inside the included amount, and that is untrue.
- EVIDENCE: lines 82 to 83, 187 to 189 and 194 to 195.
- EXPECTED: the stated cost is true in the worst case.
- FIX: pick one and write it down: (a) lower the site cap to 96 a day (2,976 in 31 days), which keeps "no new cost"
  true with no question to the Owner; or (b) keep 200 and state the worst case, about $1.12 a month, as a spend the
  Owner approves. Recommend (a): a new list will not see 96 real sign-ups a day, and a flood is exactly what the cap is
  for. Files: the spec only.

## Notes (recorded, not blocking)

- N12. `_headers`'s `/*` rule sets `Referrer-Policy: strict-origin-when-cross-origin`; the function set uses
  `no-referrer`. Say that the Node test compares every header but `Referrer-Policy`, which the function set replaces.
  On the static waitlist pages, Cloudflare joins two matching rules' values with a comma
  (`strict-origin-when-cross-origin, no-referrer`); browsers take the last one, but the headers journey should read it.
- N13. Name the Cron Trigger's time (for example `5 0 * * *`, just after UTC midnight), so the sender key is kept "for
  one day" as the privacy page says, not up to two.
- N14. Rotating `WAITLIST_SECRET` would break every leave link ever sent; say it is never rotated without a migration
  of `leave_hash`. Name the URL the `List-Unsubscribe` header carries and that a `POST` there with
  `List-Unsubscribe=One-Click` deletes the row with no page.
- N15. Say where the mailer's `wrangler dev` keeps its local state (it defaults beside its own `wrangler.toml`), so
  the journeys read emails from the right folder; `.wrangler/` is already in `.gitignore`. List the `wrangler types`
  output file in unit 5 (and in `knip.json` if it needs ignoring).
- N16. The first `--remote` migration writes to a production database and the first mailer deploy starts real sends.
  The 2026-11-21 standing permission covers CI changes but excludes "production data", so say that the Owner's
  approval of the implementation pull request covers those two actions by name.
- N17. The implementation branch may wait as a draft on the Owner's dashboard steps longer than the 2 days CLAUDE.md
  allows a branch. Say what happens then (it stays open with the Owner's leave, or the Owner steps come first).
- N18. Unit 6 waits on unit 5, but its check is "they fail before 5 and pass after". Write the journeys first, as the
  check, or drop "fail before 5".
- N19. A per-IP limit puts a class or office behind one address on "busy" after 3 sign-ups. That is a fair price;
  the busy page could say "or try from another network".
- N20. Unchecked: whether deploying a Worker with a `send_email` binding needs a token permission besides "Workers
  Scripts: Edit". Check it with the mailer's first deploy; if it fails, step 4 gains it.

## What happens next

This was the last plan review round allowed. The five reds are spec-only and bounded, so they can be fixed without a
third round: the implementer fixes them, and the implementation audit checks each against this file (or the
coordinator asks the Owner, as a decision card, whether to run a third round).
