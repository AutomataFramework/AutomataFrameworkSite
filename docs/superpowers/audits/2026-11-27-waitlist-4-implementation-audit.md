# Waitlist: implementation audit (cycle 4)

- **Commit examined:** d75c7a56cedc14d6562279bbbf2a2df8d4d01ea7 (PR #130, branch `claude/project-thread-8tc2c4`).
- **Lane:** 3. Fresh session, `review` skill, against `docs/superpowers/specs/2026-11-27-waitlist-design.md` and the
  cycle-3 audit (`2026-11-27-waitlist-3-implementation-audit.md`).
- **Verdict: d75c7a5 FAIL: 1 red** (R15: the R13 fix lets one sender use up the whole day's cap for everyone).
- Audited 2026-11-27T03:21Z.

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the spec
and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or
incomplete integrations. Do your best work.

## What ran

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` (Node 24.22.3) | ok |
| `pnpm lint`, `pnpm knip`, `pnpm typecheck` | clean |
| `pnpm test:node` | 128 pass, 13 files |
| CI at d75c7a5 (`gh api …/commits/d75c7a5/check-runs`) | plan, quick gate, check, build, journeys, commit-authors: success |
| Journeys locally | not run here; CI's quick journeys are green at d75c7a5 |
| Rush probe (`/mnt/project-files/waitlist/rush-probe.sh`), production limits, 20 posts at once from one sender | **3 check-email, 17 busy; 3 emails written** (counted as `email-html` files) |
| Hammer probe, same server afterwards: 100 posts one at a time from one new sender, then 1 post from a third sender | 3 check-email, 97 busy; **the third sender got `/waitlist/busy/`** with 6 emails sent that day (R15) |
| Scratch Node test (not committed): 100 posts from one sender, then one from another, against `sqliteDb()` | fails at d75c7a5 (`busy`), passes at b684435 (`send`), and passes with the two upserts swapped (all 40 waitlist tests pass) |
| `grep -n 200` in the spec | only line 258, the cycle-2 findings table ("R12 200 a day is over 3,000 a month"), which is right |

## Cycle-3 reds

| Finding | At d75c7a5 | Result |
|---|---|---|
| R13 limits raced | `store.ts:71-86`: each counter is one `INSERT … ON CONFLICT DO UPDATE … WHERE count < ? RETURNING count`; no row back is busy. Probe: 3 of 20 accepted, 3 emails | **Pass** for the race. But the order of the two statements is new and breaks the sender limit's purpose (R15) |
| R14 spec says 200 a day | spec line 206 reads "the 96-a-day cap" | **Pass** |

## Regressions and other checks

- The merge `7fe1112` brings only #131 (`site.yml`, `tests/workflows/site.test.ts`), already on `main`; no other file
  changed. The branch is behind `main` by #132 (rules and skills text only); the merge queue integrates it.
- The new store tests run 20 `join`s under `Promise.all`; the comment says, rightly, that the fake does not reproduce the
  race. They pass and keep the limits' numbers.
- The `UPSERT … WHERE … RETURNING` form runs on the local D1 (workerd's SQLite), shown by the probe.

## PR body

- Opens with the two attribution lines and credits **Twacklepif**; ends with "Requested by **McThayDT**". OK.
- "This code: 3 check-email, 17 busy, 3 emails" matches the probe here. "128 pass" matches. The b684435 numbers (12 and
  8) differ from cycle 3's (20 of 20); a race's counts vary from run to run, so this is not a defect.
- The body's "the limits hold" is true for the race but not for R15; the fix round should say what changed.

## Findings

### R15 (red): one sender past its own limit uses up the day for everyone

- UNIT: `src/waitlist/store.ts` `join` (lines 71-86).
- REQUIREMENT: Abuse and cost, "At most 3 posts per sender … per UTC day, so one script cannot use up the day";
  criterion 7, "past 3 posts a day from one sender, 'busy' for that sender only".
- REASON: the site counter (`sends`) is raised first and the sender counter checked second, so every post a sender
  makes after its 3rd still raises the site's count before it is refused. Before d75c7a5 both were checked before
  either was raised, so this did not happen.
- EVIDENCE: hammer probe above: one sender's 100 serial posts (3 accepted) then a new sender's first post got
  `/waitlist/busy/`, with only 6 emails sent that day. Scratch test "one sender past its own limit does not use up the
  day for others" (`LIMITS.dailyPosts + 4` posts from 4.4.4.4, then one from 8.8.8.8 expects `send`): `busy` at d75c7a5,
  `send` at b684435.
- EXPECTED: posts a sender makes past its own limit do not count toward the site's cap; a new sender still gets in
  until 96 posts that passed their sender limit have been made that day.
- FIX: run the `senders` upsert first and return busy on no row, then the `sends` upsert. (A sender's count then rises
  on a post the site refuses, which the spec allows: every well-formed post counts.) Add that scratch test as a Node
  test. Checked here: with the two statements swapped, that test and all 40 waitlist tests pass. Files:
  `src/waitlist/store.ts`, `tests/waitlist/store.test.ts`; the PR body's R13 lines.

## Notes (not blocking)

- N24: the shared probe script counts emails with `ls mailer/.wrangler/tmp/email | wc -l`, which counts miniflare's one
  folder (it printed 0 or 1), and its final `wait` waits for the background `pages dev` and never returns. Count
  `find … -path '*email-html*' -type f` and wait only for the curls. The file is outside the PR.
- This was cycle 4, the last review round the brief allows; the fix for R15 needs a check run by a program or a
  second session before merge, as the rules say.
