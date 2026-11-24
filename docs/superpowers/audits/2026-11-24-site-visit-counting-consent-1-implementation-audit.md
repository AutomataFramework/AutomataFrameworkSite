# Site #96, visit-counting notice: implementation audit, cycle 1

**ec9fe42 FAIL: 2 red**

- Pull request: https://github.com/mcthaydt/AutomataFrameworkSite/pull/96 (draft), branch `claude/project-thread-aciq3f`, head `ec9fe42`, base `704accd`.
- Lane 2 (`public/_headers`). One fresh review, no code changed by the reviewer.
- Judged against: the owner's rule, 2026-11-24 17:33 UTC, "I do not want to be sued, do not collect anything until after it is accepted"; the coordinator's brief for this review (nothing from outside the site loads or is stored before Yes, beyond the answer itself; No and no answer collect nothing; the footer changes the answer; the notice never covers the game; the CSP); the acceptance criteria in the pull request body; the drunk-grandma rule.

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or incomplete integrations. Do your best work.

## What ran (all on ec9fe42, this container, Node 22.23.5 where the repo asks for 24.21.0)

- `pnpm install --frozen-lockfile`, `pnpm lint` (1 warning, in `tests/workflows/gate.test.ts`, not in this diff), `pnpm knip`, `pnpm typecheck`: clean.
- `pnpm test:node`: 35 files, 326 tests passed.
- `pnpm build`, then `playwright test --project chromium` on `count`, `hosting`, `arrive` and `home` journeys: 94 passed. WebKit and Firefox are not installed here; their runs are CI's (still queued when this audit was written).
- Live site, 17:5x UTC: `curl https://automataframework.com/` holds no `cloudflareinsights` or `cf-beacon` (0 matches), and no `Set-Cookie`. Cloudflare's own injection is off, so the PR body's "Do not merge yet" step 1 is met.
- A probe of my own (Playwright, Chromium, the built site under `wrangler pages dev`, Cloudflare's addresses stubbed), at 360x640 and 1440x900:
  - Before any answer, after 4 s with the game playing itself: no request to any origin but the site; no cookies; `localStorage`, `sessionStorage` and IndexedDB empty in the page and in the game's frame (`/play/?watch`).
  - After No: still no outside request; storage holds only `automata.site.counting = "no"` (seen from the page and the same-origin game frame), no cookies.
  - Keyboard: Tab reaches Yes then No right after "See how it is made".
  - Yes and No are 112x48 px each.

## Checked and fine

- Nothing outside the site is in the page as served; the counter is added only by `addCounter`, only on a kept or given yes (`src/features/count/count.ts:52-59`).
- Nothing is written before an answer; the only thing written is the answer (`answer.ts`), every read and write in try/catch; a refusing store means no answer, so no counter.
- No, and no answer, send nothing, now and after a reload (journey plus my probe).
- The footer switch shows from load, reads "Count my visits" / "Stop counting my visits", and works both ways (journey). Yes to No on a running page adds a page-level `connect-src 'self' data: blob:` meta rule, which also covers `sendBeacon`; images are already `img-src 'self'`.
- The notice is in the page's flow, between the Play buttons and the game's sheet; it overlaps nothing (boxes: 1440x900 notice ends at y=830, sheet starts at y=894; 360x640 notice ends at y=1023, sheet starts at y=1071). The share card hides it.
- CSP: only `script-src https://static.cloudflareinsights.com` and `connect-src https://cloudflareinsights.com` are added; `hosting.journey.ts` pins the whole header. Opening `script-src` is safe only while Cloudflare's injection stays off; main's `live` job runs every journey against the live site, so the first-visit journey there would fail if an injected counter ever came back. That guard is enough.

## Findings

### 1. red: the counter's token is a placeholder

- UNIT: `src/features/count/count.ts:9`
- REQUIREMENT: the brief (Yes counts the visit with Cloudflare Web Analytics); the PR body's own "Do not merge yet" step 2.
- REASON: `COUNTER_TOKEN = 'SITE_TOKEN_PENDING'`, so a Yes loads Cloudflare's script and sends reports under a token that belongs to no site: the visitor's yes is spent and nothing is counted.
- EVIDENCE: the line above; the live-state file's "Open" line.
- EXPECTED: the token of the Web Analytics site for automataframework.com, made with automatic setup off.
- FIX: replace the constant in `src/features/count/count.ts` only. A re-check of the new head is needed (it makes this audit stale).

### 2. red: Yes is dressed as the main action and No as the lesser one

- UNIT: `index.html:48-49` (`btn main small` for Yes, `btn second small` for No)
- REQUIREMENT: the owner's rule "I do not want to be sued, do not collect anything until after it is accepted". Consent that a design steers toward is the kind regulators reject (the European Data Protection Board's cookie-banner taskforce report, 2023, lists "deceptive button colours and contrast" as a practice it examines); the safe design gives both answers the same weight.
- REASON: Yes is a filled gold button (background rgb(226,181,64)); No is an outlined dark button (background rgb(31,58,51)). The page's eye goes to Yes.
- EVIDENCE: computed styles from my probe at both sizes; screenshot at 1440x900 shows a gold YES beside an outlined NO.
- EXPECTED: Yes and No look the same (same class, same size, same colours), in that order or with No first.
- FIX: give both buttons the same class in `index.html` (and `count.journey.ts` if it needs to check it, for example by comparing the two buttons' computed background). No other file.

## Notes (not blocking, not for this fix round unless the owner asks)

- N1. At 1440x900 the notice pushes the game's sheet to y=894, so on a first visit the game is no longer in the first screen; once answered (the notice gone) the sheet starts at y=665, so 235 px of it shows. Nothing covers the game, and the home journey's above-the-fold checks still pass; the owner's look at the screens should see this.
- N2. "Nothing is counted unless you press Yes." Cloudflare, as the host, still counts requests to the domain in its own traffic figures whatever the visitor answers. The sentence is true of the page's counter; if the owner wants it watertight, "We count nothing unless you press Yes" or naming the counter would be closer. Owner's words, owner's call.
- N3. Yes, then Stop, then Yes again on the same page (without a reload) leaves the cut-off rule in place: the switch says "Stop counting my visits" but nothing is counted until the next page. It errs toward collecting less, so it is safe.
- N4. The branch's live-state file still says Cloudflare's injection is on; the live site shows it is off (see What ran). The file must be deleted before the branch goes to review in any case (CLAUDE.md, live state).
- N5. There is no page that says what Cloudflare's counter records. Not asked for; listed only because the owner's concern is legal.
